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
  Inject,
  ServiceUnavailableException,
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
import { CopilotActionRegistryService } from "../../application/llm/copilot-action-registry.service";
import { PlannerOrchestrationService } from "../../application/llm/planner-orchestration.service";
import { TranscriptionAdapterFactory } from "../../application/adapters/transcription.adapter";
import { AuditService } from "../../application/services/audit.service";
import { UsageGuardService } from "../../application/services/usage-guard.service";
import {
  EnhancedRateLimitGuard,
  RateLimit,
} from "../../shared/guards/rate-limit.guard";
import { CopilotPlanGuard } from "../../shared/guards/copilot-plan.guard";
import {
  DESTRUCTIVE_INTENTS,
  hasPermissionForIntent,
  getRoleRequirementMessage,
  StaffRole,
} from "../../application/llm/copilot-schema";
import { evaluateCopilotActionRisk } from "../../application/llm/copilot-risk-policy";

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
  private approvalStorageCheckCache: {
    ready: boolean;
    checkedAt: number;
  } | null = null;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly copilotAiService: CopilotAiService,
    private readonly dispatcherService: CopilotDispatcherService,
    private readonly actionRegistry: CopilotActionRegistryService,
    private readonly plannerOrchestration: PlannerOrchestrationService,
    private readonly transcriptionFactory: TranscriptionAdapterFactory,
    private readonly auditService: AuditService,
    private readonly aiCache: AiCacheService,
    private readonly usageGuard: UsageGuardService,
  ) {}

  /**
   * POST /v1/portal/copilot/message
   * Process text command from merchant
   */
  @Post("message")
  @UseGuards(EnhancedRateLimitGuard, CopilotPlanGuard)
  @RateLimit({ limit: 10, window: 60, keyType: "merchant" })
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

    const tokenCheck = await this.usageGuard.checkLimit(merchantId, "TOKENS");
    if (!tokenCheck.allowed) {
      return {
        success: false,
        intent: null,
        error: "TOKEN_BUDGET_EXCEEDED",
        reply: `⚠️ تم استنفاد سعة الذكاء الاصطناعي اليومية (${tokenCheck.used}/${tokenCheck.limit}). حاول غداً أو قم بالترقية.`,
        limitExceeded: true,
        usage: { used: tokenCheck.used, limit: tokenCheck.limit },
      };
    }

    // AI daily call quota (copilot is available to all plans, but always metered)
    const limitCheck = await this.usageGuard.consume(
      merchantId,
      "AI_CALLS",
      1,
      {
        metadata: { source: "COPILOT_TEXT" },
      },
    );
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

    const consumeTokenUsage = async (
      assistantReply: string,
      intent?: string,
    ) => {
      const estimatedTokens = this.estimateTokenUsage(
        dto.message.trim(),
        dto.history || [],
        assistantReply,
      );
      await this.usageGuard
        .consume(merchantId, "TOKENS", estimatedTokens, {
          metadata: {
            source: "COPILOT_TEXT",
            intent: intent || "UNKNOWN",
          },
        })
        .catch(() => {});
    };

    // Parse command with AI
    const result = await this.copilotAiService.parseCommand(
      merchantId,
      dto.message.trim(),
      "portal",
      "text",
      dto.history || [],
    );

    if (!result.success) {
      await consumeTokenUsage(
        result.message || "الذكاء الاصطناعي غير متاح مؤقتاً",
      );
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

      await consumeTokenUsage(`⛔ ${roleMessage}`, command.intent);

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
      await consumeTokenUsage(command.reply_ar, command.intent);
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
      const plannerDecision = await this.plannerOrchestration.evaluateCommand(
        merchantId,
        command,
        "portal",
      );
      if (!plannerDecision.allowed) {
        await consumeTokenUsage(
          "تم منع تنفيذ الاستعلام مؤقتاً بواسطة سياسة التخطيط التشغيلية.",
          command.intent,
        );
        return {
          success: false,
          intent: command.intent,
          confidence: command.confidence,
          missing_fields: command.missing_fields || [],
          needs_confirmation: false,
          confirmation_text: null,
          action: {
            type: "planner_blocked",
            params: command.entities || {},
          },
          user_message:
            "⚠️ تم منع تنفيذ هذا الطلب مؤقتاً بواسطة سياسة التخطيط التشغيلية.",
          planner_decision: plannerDecision,
        };
      }

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

      await consumeTokenUsage(queryResult.replyAr, command.intent);
      return response;
    }

    // Destructive action - return preview for confirmation
    await consumeTokenUsage(command.reply_ar, command.intent);
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
  @UseGuards(EnhancedRateLimitGuard, CopilotPlanGuard)
  @RateLimit({ limit: 10, window: 60, keyType: "merchant" })
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

    const tokenCheck = await this.usageGuard.checkLimit(merchantId, "TOKENS");
    if (!tokenCheck.allowed) {
      return {
        success: false,
        intent: null,
        confidence: 0,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: null,
        user_message: `⚠️ تم استنفاد سعة الذكاء الاصطناعي اليومية (${tokenCheck.used}/${tokenCheck.limit}). حاول غداً أو قم بالترقية.`,
        limitExceeded: true,
      };
    }

    const aiLimit = await this.usageGuard.consume(merchantId, "AI_CALLS", 1, {
      metadata: { source: "COPILOT_VOICE" },
    });
    if (!aiLimit.allowed) {
      return {
        success: false,
        intent: null,
        confidence: 0,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: null,
        user_message: `⚠️ تم استنفاد حد الأوامر الذكية اليومي (${aiLimit.used}/${aiLimit.limit}). يرجى الترقية أو المحاولة غداً.`,
        limitExceeded: true,
      };
    }

    const voiceLimit = await this.usageGuard.checkLimit(
      merchantId,
      "VOICE_MINUTES",
    );
    if (!voiceLimit.allowed) {
      return {
        success: false,
        intent: null,
        confidence: 0,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: null,
        user_message: `⚠️ تم استنفاد حد الدقائق الصوتية هذا الشهر (${voiceLimit.used.toFixed(1)}/${voiceLimit.limit}).`,
        limitExceeded: true,
      };
    }

    const consumeTokenUsage = async (
      assistantReply: string,
      intent?: string,
    ) => {
      const estimatedTokens = this.estimateTokenUsage(
        transcription?.text || "",
        [],
        assistantReply,
      );
      await this.usageGuard
        .consume(merchantId, "TOKENS", estimatedTokens, {
          metadata: {
            source: "COPILOT_VOICE",
            intent: intent || "UNKNOWN",
          },
        })
        .catch(() => {});
    };

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

    const voiceMinutes = Math.max(
      0.01,
      Number(transcription.duration || 0) / 60,
    );
    const voiceUsage = await this.usageGuard.consume(
      merchantId,
      "VOICE_MINUTES",
      voiceMinutes,
      {
        metadata: { source: "COPILOT_VOICE" },
      },
    );
    if (!voiceUsage.allowed) {
      return {
        success: false,
        intent: null,
        confidence: 0,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: null,
        user_message: `⚠️ تم استنفاد حد الدقائق الصوتية هذا الشهر (${voiceUsage.used.toFixed(1)}/${voiceUsage.limit}).`,
        limitExceeded: true,
      };
    }

    if (!transcription.text) {
      await consumeTokenUsage("لم نتمكن من فهم الصوت. جرب مرة تانية.");
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
      await consumeTokenUsage("حدث خطأ في معالجة الأمر");
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

      await consumeTokenUsage(`⛔ ${roleMessage}`, command.intent);

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
      const plannerDecision = await this.plannerOrchestration.evaluateCommand(
        merchantId,
        command,
        "portal",
      );
      if (!plannerDecision.allowed) {
        await consumeTokenUsage(
          "تم منع تنفيذ الاستعلام مؤقتاً بواسطة سياسة التخطيط التشغيلية.",
          command.intent,
        );

        return {
          success: false,
          intent: command.intent,
          confidence: command.confidence ?? 1,
          missing_fields: command.missing_fields || [],
          needs_confirmation: false,
          confirmation_text: null,
          action: {
            type: "planner_blocked",
            params: command.entities || {},
          },
          user_message:
            "⚠️ تم منع تنفيذ هذا الطلب مؤقتاً بواسطة سياسة التخطيط التشغيلية.",
          transcription: transcription.text,
          planner_decision: plannerDecision,
        };
      }

      const queryResult = await this.dispatcherService.executeQuery(
        merchantId,
        command,
      );

      await consumeTokenUsage(queryResult.replyAr, command.intent);

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

    await consumeTokenUsage(command.reply_ar, command.intent);

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
  @UseGuards(EnhancedRateLimitGuard, CopilotPlanGuard)
  @RateLimit({ limit: 10, window: 60, keyType: "merchant" })
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
    const riskProfile = evaluateCopilotActionRisk(pendingAction.intent);
    const actionDefinition = this.actionRegistry.getDefinition(
      pendingAction.intent,
    );

    if (!dto.confirm) {
      const cancelResult = await this.copilotAiService.confirmAction(
        merchantId,
        dto.actionId,
        false,
      );

      if (!cancelResult.success) {
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
          action: { type: cancelResult.action, params: {} },
          user_message: messages[cancelResult.action] || "حدث خطأ",
          risk_tier: riskProfile.tier,
          compensation_hints: actionDefinition.compensationHints,
        };
      }

      return {
        success: true,
        intent: pendingAction.intent,
        confidence: 1,
        missing_fields: [],
        needs_confirmation: false,
        confirmation_text: null,
        action: { type: "cancelled", params: {} },
        user_message: "❌ تم إلغاء الإجراء",
        risk_tier: riskProfile.tier,
        compensation_hints: actionDefinition.compensationHints,
      };
    }

    await this.ensureApprovalsStorageReady();

    // RBAC: Re-check permission before execution (defense in depth)
    if (!hasPermissionForIntent(userRole, pendingAction.intent)) {
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
          riskTier: riskProfile.tier,
          requiresManagerReview: riskProfile.requiresManagerReview,
        },
      });

      await this.copilotAiService.recordApprovalState({
        actionId: dto.actionId,
        merchantId,
        state: "denied",
        intent: pendingAction.intent,
        source: pendingAction.source,
        actorRole: userRole,
        actorId: String(req?.staffId || "").trim() || undefined,
        details: {
          reason: "RBAC_DENIED",
          requiredRole: getRoleRequirementMessage(pendingAction.intent),
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
        risk_tier: riskProfile.tier,
        compensation_hints: actionDefinition.compensationHints,
      };
    }

    const preconditionCheck = await this.actionRegistry.evaluatePreconditions(
      merchantId,
      pendingAction.command,
    );
    if (!preconditionCheck.ok) {
      await this.copilotAiService.recordApprovalState({
        actionId: dto.actionId,
        merchantId,
        state: "denied",
        intent: pendingAction.intent,
        source: pendingAction.source,
        actorRole: userRole,
        actorId: String(req?.staffId || "").trim() || undefined,
        details: {
          reason: "PRECONDITION_FAILED",
          failures: preconditionCheck.failures,
          advisories: preconditionCheck.advisories,
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
          type: "precondition_failed",
          params: pendingAction.command.entities || {},
        },
        user_message:
          "⚠️ تعذّر التنفيذ لأن بيانات الأمر غير مكتملة أو غير صالحة",
        precondition_failures: preconditionCheck.failures,
        precondition_advisories: preconditionCheck.advisories,
        risk_tier: riskProfile.tier,
        compensation_hints: actionDefinition.compensationHints,
        compensation: actionDefinition.compensation,
      };
    }

    const plannerDecision =
      await this.plannerOrchestration.evaluatePendingAction(
        merchantId,
        pendingAction,
      );

    if (!plannerDecision.allowed) {
      await this.copilotAiService.recordApprovalState({
        actionId: dto.actionId,
        merchantId,
        state: "denied",
        intent: pendingAction.intent,
        source: pendingAction.source,
        actorRole: userRole,
        actorId: String(req?.staffId || "").trim() || undefined,
        details: {
          reason: "PLANNER_ORCHESTRATION_BLOCK",
          failures: plannerDecision.reasons,
          advisories: plannerDecision.advisories,
          contextDigest: plannerDecision.contextDigest,
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
          type: "planner_blocked",
          params: pendingAction.command.entities || {},
        },
        user_message:
          "⚠️ تم منع التنفيذ مؤقتاً بواسطة سياسة التخطيط التشغيلية. راجع الأسباب ثم أعد المحاولة.",
        planner_decision: plannerDecision,
        risk_tier: riskProfile.tier,
        compensation_hints: actionDefinition.compensationHints,
        compensation: actionDefinition.compensation,
      };
    }

    // Confirm only after planner + precondition gates pass
    const confirmResult = await this.copilotAiService.confirmAction(
      merchantId,
      dto.actionId,
      true,
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
        risk_tier: riskProfile.tier,
        compensation_hints: actionDefinition.compensationHints,
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
        riskTier: riskProfile.tier,
        requiresManagerReview: riskProfile.requiresManagerReview,
        requiresExplicitApproval: riskProfile.requiresExplicitApproval,
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
      risk_tier: riskProfile.tier,
      action_contract: {
        intent: actionDefinition.intent,
        destructive: actionDefinition.destructive,
        preconditions: actionDefinition.preconditions,
        compensation_hints: actionDefinition.compensationHints,
        compensation: actionDefinition.compensation,
      },
      planner_decision: plannerDecision,
    };
  }

  /**
   * GET /v1/portal/copilot/approvals
   * Read approval/execution lifecycle records with pagination
   */
  @Get("approvals")
  @ApiOperation({ summary: "List copilot approval lifecycle records" })
  @ApiResponse({ status: 200, description: "Approval records" })
  async listApprovals(
    @Query("status") status?: string,
    @Query("intent") intent?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Req() req?: any,
  ) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    await this.ensureApprovalsStorageReady();

    const statuses = String(status || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const normalizedIntent = String(intent || "")
      .trim()
      .toUpperCase();
    const parsedLimit = Number.parseInt(String(limit || "30"), 10);
    const parsedOffset = Number.parseInt(String(offset || "0"), 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 100))
      : 30;
    const safeOffset = Number.isFinite(parsedOffset)
      ? Math.max(0, parsedOffset)
      : 0;

    const whereClauses: string[] = [`a.merchant_id = $1`];
    const values: any[] = [merchantId];

    if (statuses.length > 0) {
      values.push(statuses);
      whereClauses.push(`a.status = ANY($${values.length}::text[])`);
    }

    if (normalizedIntent) {
      values.push(normalizedIntent);
      whereClauses.push(`a.intent = $${values.length}`);
    }

    const whereSql = whereClauses.join(" AND ");

    values.push(safeLimit);
    values.push(safeOffset);
    const limitParam = values.length - 1;
    const offsetParam = values.length;

    const rows = await this.pool.query<any>(
      `SELECT
         a.action_id::text as action_id,
         a.intent,
         a.source,
         a.status,
         a.actor_role,
         a.actor_id,
         a.details,
         a.execution_result,
         a.pending_at,
         a.confirmed_at,
         a.denied_at,
         a.cancelled_at,
         a.expired_at,
         a.executing_at,
         a.executed_at,
         a.updated_at,
         p.command,
         p.expires_at
       FROM copilot_action_approvals a
       LEFT JOIN copilot_pending_actions p
         ON p.id = a.action_id
       WHERE ${whereSql}
       ORDER BY a.updated_at DESC
       LIMIT $${limitParam}
       OFFSET $${offsetParam}`,
      values,
    );

    const countValues = values.slice(0, values.length - 2);
    const count = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM copilot_action_approvals a
       WHERE ${whereSql}`,
      countValues,
    );

    return {
      success: true,
      approvals: rows.rows.map((row) => this.mapApprovalRow(row)),
      pagination: {
        total: Number(count.rows[0]?.count || 0),
        limit: safeLimit,
        offset: safeOffset,
      },
    };
  }

  /**
   * GET /v1/portal/copilot/approvals/:actionId
   * Read single approval/execution lifecycle record
   */
  @Get("approvals/:actionId")
  @ApiOperation({ summary: "Get a copilot approval lifecycle record" })
  @ApiResponse({ status: 200, description: "Approval record" })
  async getApprovalByActionId(
    @Param("actionId") actionId: string,
    @Req() req: any,
  ) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    await this.ensureApprovalsStorageReady();

    const row = await this.pool.query<any>(
      `SELECT
         a.action_id::text as action_id,
         a.intent,
         a.source,
         a.status,
         a.actor_role,
         a.actor_id,
         a.details,
         a.execution_result,
         a.pending_at,
         a.confirmed_at,
         a.denied_at,
         a.cancelled_at,
         a.expired_at,
         a.executing_at,
         a.executed_at,
         a.updated_at,
         p.command,
         p.expires_at
       FROM copilot_action_approvals a
       LEFT JOIN copilot_pending_actions p
         ON p.id = a.action_id
       WHERE a.merchant_id = $1
         AND a.action_id::text = $2
       LIMIT 1`,
      [merchantId, actionId],
    );

    if (!row.rows.length) {
      throw new NotFoundException("Approval record not found");
    }

    return {
      success: true,
      approval: this.mapApprovalRow(row.rows[0]),
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
        ocrAvailable: false,
        provider: "payment-proof-only",
      },
    };
  }

  // ============= Private Helpers =============

  private async ensureApprovalsStorageReady(): Promise<void> {
    const ready = await this.isApprovalsStorageReady();
    if (!ready) {
      throw new ServiceUnavailableException({
        success: false,
        error: "APPROVALS_SCHEMA_MISSING",
        message:
          "Approval storage is unavailable. Apply migration 113 before running approval-gated copilot actions.",
      });
    }
  }

  private async isApprovalsStorageReady(): Promise<boolean> {
    const now = Date.now();
    if (
      this.approvalStorageCheckCache &&
      now - this.approvalStorageCheckCache.checkedAt < 30_000
    ) {
      return this.approvalStorageCheckCache.ready;
    }

    let ready = false;
    try {
      const check = await this.pool.query<{ ready: boolean | string }>(
        `SELECT to_regclass('public.copilot_action_approvals') IS NOT NULL as ready`,
      );
      const raw = check.rows[0]?.ready;
      ready = raw === true || raw === "t" || raw === "true";
    } catch {
      ready = false;
    }

    this.approvalStorageCheckCache = {
      ready,
      checkedAt: now,
    };
    return ready;
  }

  private estimateTokenUsage(
    userText: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    assistantReply: string,
  ): number {
    const historyChars = (history || []).reduce(
      (sum, item) => sum + String(item?.content || "").length,
      0,
    );
    const totalChars =
      String(userText || "").length +
      historyChars +
      String(assistantReply || "").length;
    // Approximation: ~1 token per 3 chars in mixed Arabic/English payloads.
    return Math.max(120, Math.ceil(totalChars / 3));
  }

  /**
   * Check if merchant has exceeded their daily AI call limit.
   * Uses UsageGuard canonical limits (plan + credits).
   */
  private async checkAiCallLimit(
    merchantId: string,
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    try {
      const check = await this.usageGuard.checkLimit(merchantId, "AI_CALLS");
      return {
        allowed: check.allowed,
        used: check.used,
        limit: check.limit,
      };
    } catch (error) {
      // On error, allow the call (fail open for UX)
      return { allowed: true, used: 0, limit: -1 };
    }
  }

  private mapApprovalRow(row: any) {
    const command = row?.command || {};
    const previewSummary =
      command?.preview?.summary_ar || command?.reply_ar || null;

    return {
      actionId: String(row?.action_id || ""),
      intent: String(row?.intent || "UNKNOWN"),
      source: String(row?.source || "portal"),
      status: String(row?.status || "pending"),
      actorRole: row?.actor_role || null,
      actorId: row?.actor_id || null,
      previewSummary,
      commandPreview: command?.preview || null,
      expiresAt: row?.expires_at || null,
      details: row?.details || {},
      executionResult: row?.execution_result || null,
      timeline: {
        pendingAt: row?.pending_at || null,
        confirmedAt: row?.confirmed_at || null,
        deniedAt: row?.denied_at || null,
        cancelledAt: row?.cancelled_at || null,
        expiredAt: row?.expired_at || null,
        executingAt: row?.executing_at || null,
        executedAt: row?.executed_at || null,
        updatedAt: row?.updated_at || null,
      },
      riskTier: evaluateCopilotActionRisk(
        String(row?.intent || "UNKNOWN") as any,
      ).tier,
    };
  }
}
