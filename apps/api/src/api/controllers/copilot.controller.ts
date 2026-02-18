/**
 * Merchant Copilot Controller
 *
 * REST API endpoints for merchant command interface.
 * Supports text, voice, and confirmation flows.
 *
 * SECURITY: This is Portal-only. WhatsApp is customer-facing only.
 * RBAC is enforced per-intent based on INTENT_ROLE_REQUIREMENTS.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiBody,
  ApiResponse,
} from "@nestjs/swagger";
import { Pool } from "pg";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { CopilotAiService } from "../../application/llm/copilot-ai.service";
import {
  AiCacheService,
  CACHE_TTL,
} from "../../infrastructure/cache/ai-cache.service";
import { CopilotDispatcherService } from "../../application/llm/copilot-dispatcher.service";
import { TranscriptionAdapterFactory } from "../../application/adapters/transcription.adapter";
import { AuditService } from "../../application/services/audit.service";
import {
  DESTRUCTIVE_INTENTS,
  hasPermissionForIntent,
  getRoleRequirementMessage,
  StaffRole,
} from "../../application/llm/copilot-schema";

interface CopilotMessageDto {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface CopilotVoiceDto {
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
}

interface CopilotConfirmDto {
  actionId: string;
  confirm: boolean;
}

@ApiTags("Merchant Copilot")
@Controller("v1/portal/copilot")
@UseGuards(MerchantApiKeyGuard, RolesGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class CopilotController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly copilotAiService: CopilotAiService,
    private readonly dispatcherService: CopilotDispatcherService,
    private readonly transcriptionFactory: TranscriptionAdapterFactory,
    private readonly auditService: AuditService,
    private readonly aiCache: AiCacheService,
  ) {}

  /**
   * POST /v1/portal/copilot/message
   * Process text command from merchant
   */
  @Post("message")
  @ApiOperation({ summary: "Send text command to copilot" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Command text in Arabic or English",
        },
        history: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["user", "assistant"] },
              content: { type: "string" },
            },
          },
        },
      },
      required: ["message"],
    },
  })
  @ApiResponse({ status: 200, description: "Command parsed and processed" })
  async processMessage(@Body() dto: CopilotMessageDto, @Req() req: any) {
    const merchantId = req?.merchantId;
    const userRole = (req?.staffRole || "VIEWER") as StaffRole;

    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    if (!dto?.message?.trim()) {
      throw new BadRequestException("Message is required");
    }

    // Check AI daily call limit
    const limitCheck = await this.checkAiCallLimit(merchantId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        intent: null,
        error: "AI_LIMIT_EXCEEDED",
        reply: `⚠️ تم استنفاد حد الأوامر الذكية اليومي (${limitCheck.used}/${limitCheck.limit}). يرجى الترقية لحد أعلى أو المحاولة غداً.`,
        limitExceeded: true,
        usage: { used: limitCheck.used, limit: limitCheck.limit },
      };
    }

    // Parse command with AI
    const result = await this.copilotAiService.parseCommand(
      merchantId,
      dto.message.trim(),
      "portal",
      "text",
      dto.history || [],
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        reply: result.message || "الذكاء الاصطناعي غير متاح مؤقتاً",
      };
    }

    const command = result.command!;

    // RBAC: Check if user has permission for this intent
    if (!hasPermissionForIntent(userRole, command.intent)) {
      const roleMessage = getRoleRequirementMessage(command.intent);

      // Audit failed permission attempt
      await this.auditService.log({
        merchantId,
        action: "COPILOT_RBAC_DENIED",
        resource: "copilot",
        resourceId: command.intent,
        metadata: {
          userRole,
          requiredAction: command.intent,
          source: "portal",
        },
      });

      return {
        success: false,
        intent: command.intent,
        error: "PERMISSION_DENIED",
        reply: `⛔ ${roleMessage}`,
        roleRequired: true,
      };
    }

    // Check if feature is blocked
    if (result.featureBlocked) {
      return {
        success: true,
        intent: command.intent,
        featureBlocked: true,
        blockedFeatures: result.blockedFeatures,
        reply: command.reply_ar,
        upgradeRequired: true,
      };
    }

    // If it's a query (non-destructive), execute immediately (with cache)
    if (!DESTRUCTIVE_INTENTS.includes(command.intent)) {
      // Check cache first — prevents different data on page refresh
      const cacheKey = this.aiCache.getCopilotCacheKey(
        merchantId,
        command.intent,
        dto.message,
      );
      if (cacheKey) {
        const cached = await this.aiCache.get<Record<string, any>>(cacheKey);
        if (cached) {
          return { ...cached, cached: true };
        }
      }

      const queryResult = await this.dispatcherService.executeQuery(
        merchantId,
        command,
      );

      // Return standardized copilot response format
      const response = {
        intent: command.intent,
        confidence: command.confidence,
        missing_fields: command.missing_fields || [],
        needs_confirmation: false,
        confirmation_text: null,
        action: {
          type: "QUERY_EXECUTED",
          params: command.entities,
        },
        user_message: queryResult.replyAr,
        data: queryResult.data,
      };

      // Cache the response
      if (cacheKey) {
        const ttl = this.aiCache.getCopilotTTL(command.intent);
        await this.aiCache.set(cacheKey, response, ttl);
      }

      return response;
    }

    // Destructive action - return preview for confirmation
    return {
      intent: command.intent,
      confidence: command.confidence,
      missing_fields: command.missing_fields || [],
      needs_confirmation: true,
      confirmation_text: command.preview?.summary_ar || command.reply_ar,
      action: {
        type: command.intent,
        params: command.entities,
        preview: command.preview,
      },
      user_message: command.reply_ar,
      pendingActionId: result.pendingActionId,
    };
  }

  /**
   * POST /v1/portal/copilot/voice
   * Process voice command from merchant
   */
  @Post("voice")
  @ApiOperation({
    summary: "Send voice command to copilot (transcribed first)",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        audioUrl: { type: "string", description: "URL of audio file" },
        audioBase64: { type: "string", description: "Base64 encoded audio" },
        mimeType: { type: "string", description: "Audio MIME type" },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Voice transcribed and command processed",
  })
  async processVoice(@Body() dto: CopilotVoiceDto, @Req() req: any) {
    const merchantId = req?.merchantId;
    const userRole = (req?.staffRole || "VIEWER") as StaffRole;

    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    if (!dto.audioUrl && !dto.audioBase64) {
      throw new BadRequestException("Audio URL or base64 data required");
    }

    // Get transcription adapter
    const adapter = await this.transcriptionFactory.getAdapter();

    // Transcribe audio
    let audioData: Buffer | string;
    if (dto.audioBase64) {
      audioData = Buffer.from(dto.audioBase64, "base64");
    } else {
      audioData = dto.audioUrl!;
    }

    const transcription = await adapter.transcribe(audioData, {
      language: "ar",
      prompt: "أمر تاجر: مصاريف، مخزون، طلبات، دفع",
    });

    if (!transcription.text) {
      return {
        success: false,
        intent: null,
        confidence: 0,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: null,
        user_message: "لم نتمكن من فهم الصوت. جرب مرة تانية.",
        transcription: null,
      };
    }

    // Log transcription
    await this.pool.query(
      `INSERT INTO copilot_history 
       (merchant_id, source, input_type, input_text, intent, command, action_taken)
       VALUES ($1, 'portal', 'voice', $2, 'TRANSCRIPTION', '{}', false)`,
      [merchantId, transcription.text],
    );

    // Process as text command
    const result = await this.copilotAiService.parseCommand(
      merchantId,
      transcription.text,
      "portal",
      "voice",
      [],
    );

    if (!result.success) {
      return {
        success: false,
        intent: null,
        confidence: 0,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: null,
        user_message: "حدث خطأ في معالجة الأمر",
        transcription: transcription.text,
      };
    }

    const command = result.command!;

    // RBAC: Check if user has permission for this intent
    if (!hasPermissionForIntent(userRole, command.intent)) {
      const roleMessage = getRoleRequirementMessage(command.intent);

      await this.auditService.log({
        merchantId,
        action: "COPILOT_RBAC_DENIED",
        resource: "copilot",
        resourceId: command.intent,
        metadata: { userRole, source: "portal_voice" },
      });

      return {
        success: false,
        intent: command.intent,
        confidence: command.confidence ?? 0,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: { type: command.intent, params: command.entities || {} },
        user_message: `⛔ ${roleMessage}`,
        transcription: transcription.text,
        roleRequired: true,
      };
    }

    // Same logic as text command
    if (!DESTRUCTIVE_INTENTS.includes(command.intent)) {
      const queryResult = await this.dispatcherService.executeQuery(
        merchantId,
        command,
      );

      return {
        success: true,
        intent: command.intent,
        confidence: command.confidence ?? 1,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: { type: command.intent, params: command.entities || {} },
        user_message: queryResult.replyAr,
        transcription: transcription.text,
        data: queryResult.data,
      };
    }

    return {
      success: true,
      intent: command.intent,
      confidence: command.confidence ?? 1,
      missing_fields: command.missing_fields || [],
      needs_confirmation: true,
      confirmation_text: command.reply_ar,
      action: { type: command.intent, params: command.entities || {} },
      user_message: command.reply_ar,
      transcription: transcription.text,
      preview: command.preview,
      pendingActionId: result.pendingActionId,
    };
  }

  /**
   * POST /v1/portal/copilot/confirm
   * Confirm or cancel a pending action
   */
  @Post("confirm")
  @ApiOperation({ summary: "Confirm or cancel a pending copilot action" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        actionId: { type: "string", description: "Pending action ID" },
        confirm: {
          type: "boolean",
          description: "true to execute, false to cancel",
        },
      },
      required: ["actionId", "confirm"],
    },
  })
  @ApiResponse({ status: 200, description: "Action confirmed or cancelled" })
  async confirmAction(@Body() dto: CopilotConfirmDto, @Req() req: any) {
    const merchantId = req?.merchantId;
    const userRole = (req?.staffRole || "VIEWER") as StaffRole;

    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    if (!dto.actionId) {
      throw new BadRequestException("Action ID is required");
    }

    // Get pending action first to check RBAC before confirming
    const pendingAction = await this.copilotAiService.getPendingAction(
      dto.actionId,
      merchantId,
    );
    if (!pendingAction) {
      throw new NotFoundException("Pending action not found");
    }

    // RBAC: Re-check permission before execution (defense in depth)
    if (
      dto.confirm &&
      !hasPermissionForIntent(userRole, pendingAction.intent)
    ) {
      const roleMessage = getRoleRequirementMessage(pendingAction.intent);

      await this.auditService.log({
        merchantId,
        action: "COPILOT_RBAC_DENIED_CONFIRM",
        resource: "copilot",
        resourceId: pendingAction.intent,
        metadata: {
          userRole,
          actionId: dto.actionId,
          source: "portal_confirm",
        },
      });

      return {
        success: false,
        intent: pendingAction.intent,
        confidence: 1,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: {
          type: pendingAction.intent,
          params: pendingAction.command.entities || {},
        },
        user_message: `⛔ ${roleMessage}`,
        roleRequired: true,
      };
    }

    // Confirm the action
    const confirmResult = await this.copilotAiService.confirmAction(
      merchantId,
      dto.actionId,
      dto.confirm,
    );

    if (!confirmResult.success) {
      const messages: Record<string, string> = {
        not_found: "الإجراء غير موجود",
        expired: "انتهت صلاحية الإجراء",
        cancelled: "تم إلغاء الإجراء",
      };

      return {
        success: false,
        intent: pendingAction.intent,
        confidence: 1,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: { type: confirmResult.action, params: {} },
        user_message: messages[confirmResult.action] || "حدث خطأ",
      };
    }

    if (!dto.confirm) {
      return {
        success: true,
        intent: pendingAction.intent,
        confidence: 1,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: { type: "cancelled", params: {} },
        user_message: "❌ تم إلغاء الإجراء",
      };
    }

    // Execute the confirmed action (pendingAction already fetched above for RBAC check)
    const executeResult = await this.dispatcherService.execute(
      merchantId,
      pendingAction,
    );

    // Audit log
    await this.auditService.log({
      merchantId,
      action: "API_CALL",
      resource: "MERCHANT",
      resourceId: merchantId,
      newValues: {
        intent: pendingAction.intent,
        actionId: dto.actionId,
        success: executeResult.success,
      },
      metadata: { source: "copilot_confirm" },
    });

    // Invalidate cached query results after mutation (data has changed)
    if (executeResult.success) {
      await this.aiCache.invalidateMerchant(merchantId);
    }

    return {
      success: executeResult.success,
      intent: pendingAction.intent,
      confidence: 1,
      missing_fields: [],
      needs_confirmation: false,
      confirmation_text: null,
      action: {
        type: executeResult.action,
        params: pendingAction.command.entities || {},
      },
      user_message: executeResult.replyAr,
      data: executeResult.data,
    };
  }

  /**
   * GET /v1/portal/copilot/history
   * Get copilot interaction history
   */
  @Get("history")
  @ApiOperation({ summary: "Get copilot command history" })
  @ApiResponse({ status: 200, description: "History entries" })
  async getHistory(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Req() req?: any,
  ) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const history = await this.copilotAiService.getHistory(
      merchantId,
      parseInt(limit || "50"),
      parseInt(offset || "0"),
    );

    return {
      success: true,
      history,
      count: history.length,
    };
  }

  /**
   * GET /v1/portal/copilot/pending/:actionId
   * Get pending action details
   */
  @Get("pending/:actionId")
  @ApiOperation({ summary: "Get pending action details" })
  @ApiResponse({ status: 200, description: "Pending action" })
  async getPendingAction(@Param("actionId") actionId: string, @Req() req: any) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const pendingAction = await this.copilotAiService.getPendingAction(
      actionId,
      merchantId,
    );
    if (!pendingAction) {
      throw new NotFoundException("Pending action not found");
    }

    return {
      success: true,
      pendingAction: {
        id: pendingAction.id,
        intent: pendingAction.intent,
        preview: pendingAction.command.preview,
        reply: pendingAction.command.reply_ar,
        status: pendingAction.status,
        expiresAt: pendingAction.expiresAt,
      },
    };
  }

  /**
   * GET /v1/portal/copilot/status
   * Get AI service status — tells frontend whether AI is real or mocked
   */
  @Get("status")
  @ApiOperation({ summary: "Get AI copilot service status" })
  @ApiResponse({ status: 200, description: "AI status info" })
  async getAiStatus(@Req() req: any) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const isConnected = this.copilotAiService.isAiConnected();
    const strictMode = this.copilotAiService.isStrictModeEnabled();
    const cacheStats = this.aiCache.getStats();
    const limitCheck = await this.checkAiCallLimit(merchantId);

    return {
      ai: {
        connected: isConnected,
        strictMode,
        provider: isConnected ? "openai" : "none",
        model: isConnected ? "gpt-4o-mini" : "none",
        message: isConnected
          ? "الذكاء الاصطناعي متصل ويعمل"
          : strictMode
            ? "وضع AI الصارم مفعّل: لا يوجد Mock. فعّل OPENAI_API_KEY لتشغيل الذكاء الاصطناعي."
            : "الذكاء الاصطناعي غير متاح — قم بتفعيل الخدمة أو ترقية باقتك",
      },
      usage: {
        aiCallsToday: limitCheck.used,
        aiCallsLimit: limitCheck.limit,
        remaining:
          limitCheck.limit === -1 ? -1 : limitCheck.limit - limitCheck.used,
      },
      cache: cacheStats,
      voice: {
        transcriptionAvailable: isConnected,
        provider: isConnected ? "whisper-1" : "mock",
      },
      vision: {
        ocrAvailable: isConnected,
        provider: isConnected ? "gpt-4o" : "mock",
      },
    };
  }

  // ============= Private Helpers =============

  /**
   * Check if merchant has exceeded their daily AI call limit.
   * Reads from the merchant's DB `limits` column (set by plan) + any active add-ons.
   */
  private async checkAiCallLimit(
    merchantId: string,
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    try {
      // Count today's copilot interactions
      const countResult = await this.pool.query(
        `SELECT COUNT(*) as call_count FROM copilot_history 
         WHERE merchant_id = $1 AND created_at >= CURRENT_DATE`,
        [merchantId],
      );
      const used = parseInt(countResult.rows[0]?.call_count || "0");

      // Get merchant's plan limits from DB (set during subscription)
      const merchantResult = await this.pool.query(
        `SELECT m.limits FROM merchants m WHERE m.id = $1`,
        [merchantId],
      );

      const limits = merchantResult.rows[0]?.limits;
      let planLimit = limits?.aiCallsPerDay ?? 20;

      // Check for active AI_CALLS add-on that increases the limit
      if (planLimit !== -1) {
        try {
          const addonResult = await this.pool.query(
            `SELECT tier_id FROM merchant_addons
             WHERE merchant_id = $1 AND addon_type = 'AI_CALLS' AND status = 'active' AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [merchantId],
          );
          if (addonResult.rows.length > 0) {
            // Add-on tier overrides the plan limit (add-on tier is always >= plan tier)
            const addonTierLimits: Record<string, number> = {
              BASIC: 300,
              STANDARD: 500,
              PROFESSIONAL: 1500,
              UNLIMITED: -1,
            };
            const addonLimit =
              addonTierLimits[addonResult.rows[0].tier_id] ?? planLimit;
            planLimit = Math.max(planLimit, addonLimit);
          }
        } catch {
          /* add-on table may not exist yet */
        }
      }

      return {
        allowed: planLimit === -1 || used < planLimit,
        used,
        limit: planLimit,
      };
    } catch (error) {
      // On error, allow the call (fail open for UX)
      return { allowed: true, used: 0, limit: -1 };
    }
  }
}
