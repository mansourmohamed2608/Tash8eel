/**
 * Merchant Copilot AI Service
 *
 * Handles command parsing using GPT-4o-mini with structured outputs.
 * All AI calls centralized in apps/api - worker must not import OpenAI.
 */

import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MERCHANT_REPOSITORY, IMerchantRepository } from "../../domain/ports";
import { MerchantContextService } from "./merchant-context.service";
import { createLogger } from "../../shared/logging/logger";
import {
  CopilotCommand,
  CopilotCommandSchema,
  COPILOT_COMMAND_JSON_SCHEMA,
  CopilotIntent,
  INTENT_FEATURE_MAP,
  DESTRUCTIVE_INTENTS,
  PendingAction,
  CopilotHistoryEntry,
} from "./copilot-schema";

const logger = createLogger("CopilotAiService");

export interface CopilotParseResult {
  success: boolean;
  message: string;
  command?: CopilotCommand;
  pendingActionId?: string;
  requiresConfirmation?: boolean;
  featureBlocked?: boolean;
  blockedFeatures?: string[];
  error?: string;
}

export interface CopilotConfirmResult {
  success: boolean;
  message: string;
  action: "confirmed" | "cancelled" | "expired" | "not_found";
  result?: Record<string, unknown>;
  error?: string;
}

export type CopilotApprovalState =
  | "pending"
  | "confirmed"
  | "denied"
  | "cancelled"
  | "expired"
  | "executing"
  | "executed_success"
  | "executed_failed";

interface RecordApprovalStateParams {
  actionId: string;
  merchantId: string;
  state: CopilotApprovalState;
  intent?: CopilotIntent;
  source?: "portal" | "whatsapp";
  actorRole?: string;
  actorId?: string;
  details?: Record<string, unknown>;
  executionResult?: Record<string, unknown>;
}

@Injectable()
export class CopilotAiService {
  private client: OpenAI;
  private model: string;
  private isTestMode: boolean;
  private strictAiMode: boolean;
  /** Circuit breaker: when OpenAI returns 429, stop calling until this timestamp */
  private quotaBlockedUntil = 0;

  constructor(
    private configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MERCHANT_REPOSITORY)
    private merchantRepository: IMerchantRepository,
    private readonly contextService: MerchantContextService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY") || "";
    this.model = this.configService.get<string>("OPENAI_MODEL", "gpt-4o-mini");
    this.isTestMode =
      !apiKey ||
      apiKey.startsWith("sk-test-") ||
      apiKey.startsWith("sk-dummy-") ||
      apiKey.includes("dummy") ||
      (process.env.NODE_ENV === "test" && !apiKey.startsWith("sk-proj-"));
    this.strictAiMode =
      (
        this.configService.get<string>("AI_STRICT_MODE", "false") || "false"
      ).toLowerCase() === "true";

    if (this.isTestMode) {
      logger.warn(
        "⚠️ Copilot AI Service running in TEST MODE - commands are MOCKED. Set a real OPENAI_API_KEY for production.",
      );
      if (this.strictAiMode) {
        logger.warn(
          "⚠️ AI_STRICT_MODE is enabled - mock copilot commands are disabled.",
        );
      }
    } else {
      logger.info(
        "Copilot AI Service initialized with real OpenAI connection",
        { model: this.model },
      );
    }

    this.client = new OpenAI({ apiKey });
  }

  /**
   * Whether real AI is connected (not in test/mock mode and not quota-blocked)
   */
  isAiConnected(): boolean {
    if (this.isTestMode) return false;
    if (Date.now() < this.quotaBlockedUntil) return false;
    return true;
  }

  isStrictModeEnabled(): boolean {
    return this.strictAiMode;
  }

  /**
   * Parse merchant command text into structured intent + entities
   */
  async parseCommand(
    merchantId: string,
    text: string,
    source: "portal" | "whatsapp" = "portal",
    inputType: "text" | "voice" = "text",
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
  ): Promise<CopilotParseResult> {
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) {
      return {
        success: false,
        message: "Merchant not found",
        error: "Merchant not found",
      };
    }

    // Get enabled features from merchant_subscriptions table
    const enabledFeatures = await this.getMerchantFeatures(merchantId);

    // Parse command with AI
    let command: CopilotCommand;

    if (this.isTestMode && this.strictAiMode) {
      return {
        success: false,
        message:
          "الذكاء الاصطناعي غير مفعّل حالياً. فعّل OPENAI_API_KEY لتشغيل ميزات AI الحقيقية.",
        error: "AI_NOT_ENABLED",
      };
    }

    if (this.isTestMode) {
      command = this.getMockCommand(text);
    } else if (this.quotaBlockedUntil > Date.now()) {
      return {
        success: false,
        message:
          "تم استنفاد رصيد الذكاء الاصطناعي اليومي. يرجى الترقية أو المحاولة غداً.",
        error: "AI_QUOTA_EXHAUSTED",
      };
    } else {
      try {
        command = await this.callOpenAI(text, history, merchantId);
      } catch (error) {
        const err = error as any;
        logger.error("Copilot AI call failed", err);
        // Circuit breaker: block further calls for 5 minutes on 429
        if (err?.status === 429 || err?.message?.includes("429")) {
          this.quotaBlockedUntil = Date.now() + 5 * 60 * 1000;
          return {
            success: false,
            message:
              "تم استنفاد رصيد الذكاء الاصطناعي اليومي. يرجى الترقية أو المحاولة غداً.",
            error: "AI_QUOTA_EXHAUSTED",
          };
        }
        return {
          success: false,
          message: "الذكاء الاصطناعي غير متاح مؤقتاً. يرجى المحاولة بعد قليل.",
          error: "AI_TEMPORARILY_UNAVAILABLE",
        };
      }
    }

    // Check feature gating
    const requiredFeatures = INTENT_FEATURE_MAP[command.intent] || [];
    const missingFeatures = requiredFeatures.filter(
      (f) => !enabledFeatures.includes(f as any),
    );

    if (missingFeatures.length > 0) {
      const blockedMessage = `🔒 هذه الميزة تتطلب ترقية خطتك.\n\nالميزات المطلوبة: ${missingFeatures.join(", ")}`;
      return {
        success: true,
        message: blockedMessage,
        command: {
          ...command,
          reply_ar: blockedMessage,
        },
        featureBlocked: true,
        blockedFeatures: missingFeatures,
      };
    }

    // If destructive action, create pending action for confirmation
    let pendingActionId: string | undefined;
    let requiresConfirmation = false;

    if (
      DESTRUCTIVE_INTENTS.includes(command.intent) &&
      command.requires_confirmation
    ) {
      pendingActionId = await this.createPendingAction(
        merchantId,
        command,
        source,
      );
      requiresConfirmation = true;
    }

    // Log to history
    await this.logHistory(merchantId, source, inputType, text, command);

    // Build response message
    let message = command.reply_ar;
    if (requiresConfirmation && pendingActionId) {
      message = `⚠️ ${command.reply_ar}\n\nأرسل "نعم" للتأكيد أو "لا" للإلغاء.\n⏱️ صلاحية الأمر: 5 دقائق`;
    }

    return {
      success: true,
      message,
      command,
      pendingActionId,
      requiresConfirmation,
    };
  }

  /**
   * Confirm or cancel a pending action
   */
  async confirmAction(
    merchantId: string,
    actionId: string,
    confirm: boolean,
  ): Promise<CopilotConfirmResult> {
    const pending = await this.getPendingAction(actionId, merchantId);

    if (!pending) {
      return {
        success: false,
        message: "⚠️ لم يتم العثور على الأمر المعلق",
        action: "not_found",
      };
    }

    if (pending.status !== "pending") {
      await this.recordApprovalState({
        actionId,
        merchantId,
        state: pending.status as "confirmed" | "cancelled" | "expired",
        intent: pending.intent,
        source: pending.source,
      });
      const statusMessages: Record<string, string> = {
        confirmed: "✅ تم تنفيذ هذا الأمر بالفعل",
        cancelled: "❌ تم إلغاء هذا الأمر",
        expired: "⏱️ انتهت صلاحية هذا الأمر",
      };
      return {
        success: false,
        message: statusMessages[pending.status] || "حالة غير معروفة",
        action: pending.status as any,
      };
    }

    if (new Date() > pending.expiresAt) {
      await this.updatePendingActionStatus(actionId, "expired");
      await this.recordApprovalState({
        actionId,
        merchantId,
        state: "expired",
        intent: pending.intent,
        source: pending.source,
      });
      return {
        success: false,
        message: "⏱️ انتهت صلاحية الأمر. يرجى إعادة إرسال الطلب.",
        action: "expired",
      };
    }

    if (!confirm) {
      await this.updatePendingActionStatus(actionId, "cancelled");
      await this.recordApprovalState({
        actionId,
        merchantId,
        state: "cancelled",
        intent: pending.intent,
        source: pending.source,
      });
      return {
        success: true,
        message: "❌ تم إلغاء الأمر",
        action: "cancelled",
      };
    }

    // Mark as confirmed. Execution is owned by the caller (controller/dispatcher)
    // to avoid duplicate side effects across different confirmation paths.
    await this.updatePendingActionStatus(actionId, "confirmed");
    await this.recordApprovalState({
      actionId,
      merchantId,
      state: "confirmed",
      intent: pending.intent,
      source: pending.source,
    });

    return {
      success: true,
      message: "✅ تم تأكيد الأمر وجاهز للتنفيذ",
      action: "confirmed",
    };
  }

  /**
   * Get dispatcher service (lazy injection to avoid circular dependency)
   */
  private dispatcherService?: any;

  private async getDispatcher(): Promise<any> {
    if (!this.dispatcherService) {
      try {
        // Dynamic import to avoid circular dependency
        const { CopilotDispatcherService } =
          await import("./copilot-dispatcher.service");
        // This would require ModuleRef - for now, return null and let controller handle
        return null;
      } catch {
        return null;
      }
    }
    return this.dispatcherService;
  }

  /**
   * Set dispatcher reference (called from module initialization)
   */
  setDispatcher(dispatcher: any): void {
    this.dispatcherService = dispatcher;
  }

  /**
   * Get merchant enabled features from subscription
   */
  private async getMerchantFeatures(merchantId: string): Promise<string[]> {
    try {
      const result = await this.pool.query(
        `SELECT enabled_features FROM merchant_subscriptions WHERE merchant_id = $1`,
        [merchantId],
      );

      if (result.rows.length > 0 && result.rows[0].enabled_features) {
        return result.rows[0].enabled_features;
      }

      // Default features for all merchants
      return ["CONVERSATIONS", "ORDERS", "CATALOG"];
    } catch (error) {
      logger.warn("Could not fetch merchant features, using defaults", {
        merchantId,
      });
      return ["CONVERSATIONS", "ORDERS", "CATALOG"];
    }
  }

  /**
   * Get copilot history for merchant
   */
  async getHistory(
    merchantId: string,
    limit = 50,
    offset = 0,
  ): Promise<CopilotHistoryEntry[]> {
    const result = await this.pool.query(
      `SELECT id, merchant_id, source, input_type, input_text, intent, command, 
              action_taken, action_result, created_at
       FROM copilot_history
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset],
    );

    return result.rows.map((row) => ({
      id: row.id,
      merchantId: row.merchant_id,
      source: row.source,
      inputType: row.input_type,
      inputText: row.input_text,
      intent: row.intent,
      command: row.command,
      actionTaken: row.action_taken,
      actionResult: row.action_result,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get pending action by ID
   */
  async getPendingAction(
    actionId: string,
    merchantId: string,
  ): Promise<PendingAction | null> {
    const result = await this.pool.query(
      `SELECT id, merchant_id, intent, command, created_at, expires_at, status, source, execution_result
       FROM copilot_pending_actions
       WHERE id = $1 AND merchant_id = $2`,
      [actionId, merchantId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      merchantId: row.merchant_id,
      intent: row.intent,
      command: row.command,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: row.status,
      source: row.source,
      executionResult: row.execution_result,
    };
  }

  async recordApprovalState(params: RecordApprovalStateParams): Promise<void> {
    try {
      const seed = await this.resolveApprovalSeed(
        params.actionId,
        params.merchantId,
        params.intent,
        params.source,
      );

      if (!seed.intent || !seed.source) {
        return;
      }

      const details = params.details || {};
      const now = new Date();
      // `pending_at` is NOT NULL; seed it on first insert for any lifecycle state.
      const pendingAt = now;
      const confirmedAt = params.state === "confirmed" ? now : null;
      const deniedAt = params.state === "denied" ? now : null;
      const cancelledAt = params.state === "cancelled" ? now : null;
      const expiredAt = params.state === "expired" ? now : null;
      const executingAt = params.state === "executing" ? now : null;
      const executedAt =
        params.state === "executed_success" ||
        params.state === "executed_failed"
          ? now
          : null;

      await this.pool.query(
        `INSERT INTO copilot_action_approvals (
           action_id,
           merchant_id,
           intent,
           source,
           status,
           pending_at,
           confirmed_at,
           denied_at,
           cancelled_at,
           expired_at,
           executing_at,
           executed_at,
           actor_role,
           actor_id,
           details,
           execution_result
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15::jsonb,
           $16::jsonb
         )
         ON CONFLICT (action_id) DO UPDATE SET
           status = EXCLUDED.status,
           actor_role = COALESCE(EXCLUDED.actor_role, copilot_action_approvals.actor_role),
           actor_id = COALESCE(EXCLUDED.actor_id, copilot_action_approvals.actor_id),
           details = CASE
             WHEN EXCLUDED.details = '{}'::jsonb
               THEN copilot_action_approvals.details
             ELSE copilot_action_approvals.details || EXCLUDED.details
           END,
           execution_result = COALESCE(EXCLUDED.execution_result, copilot_action_approvals.execution_result),
           pending_at = CASE
             WHEN EXCLUDED.status = 'pending'
               THEN COALESCE(copilot_action_approvals.pending_at, NOW())
             ELSE copilot_action_approvals.pending_at
           END,
           confirmed_at = CASE
             WHEN EXCLUDED.status = 'confirmed'
               THEN COALESCE(copilot_action_approvals.confirmed_at, NOW())
             ELSE copilot_action_approvals.confirmed_at
           END,
           denied_at = CASE
             WHEN EXCLUDED.status = 'denied'
               THEN COALESCE(copilot_action_approvals.denied_at, NOW())
             ELSE copilot_action_approvals.denied_at
           END,
           cancelled_at = CASE
             WHEN EXCLUDED.status = 'cancelled'
               THEN COALESCE(copilot_action_approvals.cancelled_at, NOW())
             ELSE copilot_action_approvals.cancelled_at
           END,
           expired_at = CASE
             WHEN EXCLUDED.status = 'expired'
               THEN COALESCE(copilot_action_approvals.expired_at, NOW())
             ELSE copilot_action_approvals.expired_at
           END,
           executing_at = CASE
             WHEN EXCLUDED.status = 'executing'
               THEN COALESCE(copilot_action_approvals.executing_at, NOW())
             ELSE copilot_action_approvals.executing_at
           END,
           executed_at = CASE
             WHEN EXCLUDED.status IN ('executed_success', 'executed_failed')
               THEN COALESCE(copilot_action_approvals.executed_at, NOW())
             ELSE copilot_action_approvals.executed_at
           END,
           updated_at = NOW()`,
        [
          params.actionId,
          params.merchantId,
          seed.intent,
          seed.source,
          params.state,
          pendingAt,
          confirmedAt,
          deniedAt,
          cancelledAt,
          expiredAt,
          executingAt,
          executedAt,
          params.actorRole || null,
          params.actorId || null,
          JSON.stringify(details),
          params.executionResult
            ? JSON.stringify(params.executionResult)
            : null,
        ],
      );
    } catch (error) {
      logger.warn("Failed to persist copilot approval state", {
        actionId: params.actionId,
        state: params.state,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async resolveApprovalSeed(
    actionId: string,
    merchantId: string,
    intent?: CopilotIntent,
    source?: "portal" | "whatsapp",
  ): Promise<{
    intent: CopilotIntent | null;
    source: "portal" | "whatsapp" | null;
  }> {
    if (intent && source) {
      return { intent, source };
    }

    try {
      const result = await this.pool.query<{
        intent: CopilotIntent;
        source: "portal" | "whatsapp";
      }>(
        `SELECT intent, source
         FROM copilot_pending_actions
         WHERE id = $1 AND merchant_id = $2
         LIMIT 1`,
        [actionId, merchantId],
      );

      const row = result.rows[0];
      return {
        intent: intent || row?.intent || null,
        source: source || row?.source || null,
      };
    } catch {
      return {
        intent: intent || null,
        source: source || null,
      };
    }
  }

  // ============= Private Methods =============

  private async callOpenAI(
    text: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    merchantId?: string,
  ): Promise<CopilotCommand> {
    let systemPrompt = this.buildSystemPrompt();

    // Inject live merchant context so the AI knows current state
    if (merchantId) {
      try {
        const liveData = await this.contextService.buildContextSummary(
          merchantId,
          {
            includeOrders: true,
            includeInventory: true,
            includeFinance: true,
          },
        );
        if (liveData) {
          systemPrompt += `\n\n=== بيانات التاجر الحالية ===\n${liveData}`;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.warn("Failed to fetch merchant context for copilot", {
          error: error.message,
        });
      }
    }

    const response = await this.client.beta.chat.completions.parse({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema:
          COPILOT_COMMAND_JSON_SCHEMA as OpenAI.ResponseFormatJSONSchema["json_schema"],
      },
      max_tokens: 1024,
      temperature: 0.3,
    });

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error("No response from OpenAI");
    }

    // Validate with Zod
    const validated = CopilotCommandSchema.parse(parsed);
    return validated;
  }

  private buildSystemPrompt(): string {
    const today = new Date().toISOString().split("T")[0];

    return `أنت مساعد ذكي للتاجر. تقوم بتحليل أوامر التاجر وتحويلها إلى إجراءات.

التاريخ اليوم: ${today}

⚠️ قاعدة صارمة - اللغة:
- يجب أن تكون جميع الردود (reply_ar، summary_ar، وأي نص موجه للمستخدم) باللغة العربية المصرية العامية فقط
- ممنوع استخدام الإنجليزية أو الفصحى في الردود
- الأرقام يمكن أن تكون عربية أو هندية (١٢٣ أو 123)
- مثال صحيح: "تم إضافة المصروف بنجاح 🎉"
- مثال خاطئ: "Expense added successfully" أو "تمت إضافة المصروفات بنجاح"

الأوامر المدعومة:
1. المصاريف: "دفعت 1000 لحمة" -> ADD_EXPENSE
2. استعلام المصاريف: "مصاريف الشهر" -> ASK_EXPENSE_SUMMARY
3. المخزون: "زوّد التيشيرت 10" -> UPDATE_STOCK
4. المخزون الناقص: "ايه الناقص" -> ASK_LOW_STOCK
5. مراجعة إثبات الدفع: "راجع إثبات الدفع" -> APPROVE_PAYMENT_PROOF
6. VIP: "خلّي أحمد VIP" -> TAG_VIP
7. إعادة طلب: "كرر آخر طلب" -> REORDER_LAST
8. KPI: "الأداء الأسبوع ده" -> ASK_KPI
9. الإيرادات: "ايرادات اليوم" -> ASK_REVENUE
10. الانكماش: "كام الهدر" -> ASK_SHRINKAGE
11. قفل الشهر: "قفّل الشهر" -> CLOSE_MONTH

قواعد:
1. استخرج الأرقام والتواريخ بدقة
2. إذا كان الأمر غير واضح، اطلب توضيح (CLARIFY)
3. الأوامر التي تغير البيانات تحتاج تأكيد (requires_confirmation: true)
4. رد دائماً بالعربية المصرية العامية - ممنوع الإنجليزية
5. إذا كانت معلومات ناقصة، ضعها في missing_fields

أمثلة:
- "دفعت 500 جنيه للكهربا" -> ADD_EXPENSE, amount: 500, category: "كهرباء"
- "زوّد القميص الأزرق 20 قطعة" -> UPDATE_STOCK, productName: "قميص أزرق", quantityChange: 20
- "مصاريف الأسبوع ده" -> ASK_EXPENSE_SUMMARY, period: "this_week"
- "راجع إثبات الدفع للطلب 123" -> APPROVE_PAYMENT_PROOF`;
  }

  private getMockCommand(text: string): CopilotCommand {
    // Simple pattern matching for test mode
    const lowerText = text.toLowerCase();

    // Expense patterns
    if (
      lowerText.includes("دفعت") ||
      lowerText.includes("صرفت") ||
      lowerText.includes("مصروف")
    ) {
      const amountMatch = text.match(/(\d+)/);
      const amount = amountMatch ? parseInt(amountMatch[1]) : null;

      return {
        intent: "ADD_EXPENSE",
        confidence: 0.9,
        entities: {
          expense: {
            amount,
            category: this.extractCategory(text),
            description: text,
            date: new Date().toISOString().split("T")[0],
          },
          stockUpdate: null,
          paymentLink: null,
          vipTag: null,
          dateRange: null,
          order: null,
        },
        requires_confirmation: true,
        preview: {
          type: "expense",
          summary_ar: `إضافة مصروف ${amount} جنيه`,
          details: [
            { label_ar: "المبلغ", value_ar: `${amount ?? "غير محدد"} جنيه` },
            {
              label_ar: "الفئة",
              value_ar: this.extractCategory(text) || "غير محددة",
            },
          ],
        },
        missing_fields: amount ? [] : ["amount"],
        reply_ar: amount
          ? `هل تريد إضافة مصروف ${amount} جنيه (${this.extractCategory(text)})؟`
          : "كم المبلغ؟",
        reasoning: "Detected expense command",
      };
    }

    // Stock update patterns
    if (
      lowerText.includes("زوّد") ||
      lowerText.includes("زود") ||
      lowerText.includes("مخزون") ||
      lowerText.includes("stock")
    ) {
      const amountMatch = text.match(/(\d+)/);
      const quantity = amountMatch ? parseInt(amountMatch[1]) : null;

      return {
        intent: "UPDATE_STOCK",
        confidence: 0.85,
        entities: {
          expense: null,
          stockUpdate: {
            sku: null,
            productName: this.extractProductName(text),
            quantityChange: quantity,
            absoluteQuantity: null,
          },
          paymentLink: null,
          vipTag: null,
          dateRange: null,
          order: null,
        },
        requires_confirmation: true,
        preview: {
          type: "stock_update",
          summary_ar: `تحديث مخزون +${quantity}`,
          details: [
            {
              label_ar: "المنتج",
              value_ar: this.extractProductName(text) || "غير محدد",
            },
            {
              label_ar: "الكمية",
              value_ar: quantity !== null ? `${quantity}` : "غير محددة",
            },
          ],
        },
        missing_fields: quantity ? [] : ["quantity"],
        reply_ar: quantity
          ? `هل تريد زيادة المخزون بـ ${quantity} قطعة؟`
          : "كم القطع؟",
        reasoning: "Detected stock update command",
      };
    }

    // Payment links are removed from product scope.
    if (lowerText.includes("لينك") || lowerText.includes("link")) {
      return {
        intent: "CLARIFY",
        confidence: 0.8,
        entities: {
          expense: null,
          stockUpdate: null,
          paymentLink: null,
          vipTag: null,
          dateRange: null,
          order: null,
        },
        requires_confirmation: false,
        preview: null,
        missing_fields: [],
        reply_ar:
          "ميزة روابط الدفع اتشالت. تقدر تراجع إثباتات الدفع من صفحة Payment Proof Verification.",
        reasoning: "Payment link intent blocked by product rules",
      };
    }

    // Expense summary patterns
    if (lowerText.includes("مصاريف") || lowerText.includes("expenses")) {
      return {
        intent: "ASK_EXPENSE_SUMMARY",
        confidence: 0.92,
        entities: {
          expense: null,
          stockUpdate: null,
          paymentLink: null,
          vipTag: null,
          dateRange: {
            period: lowerText.includes("اسبوع") ? "this_week" : "this_month",
            startDate: null,
            endDate: null,
          },
          order: null,
        },
        requires_confirmation: false,
        preview: null,
        missing_fields: [],
        reply_ar: "جاري تحميل ملخص المصاريف...",
        reasoning: "Detected expense summary query",
      };
    }

    // VIP patterns
    if (lowerText.includes("vip") || lowerText.includes("في آي بي")) {
      return {
        intent: "TAG_VIP",
        confidence: 0.85,
        entities: {
          expense: null,
          stockUpdate: null,
          paymentLink: null,
          vipTag: {
            customerPhone: null,
            customerName: this.extractCustomerName(text),
            customerId: null,
          },
          dateRange: null,
          order: null,
        },
        requires_confirmation: true,
        preview: {
          type: "vip_tag",
          summary_ar: "إضافة علامة VIP للعميل",
          details: [
            {
              label_ar: "العميل",
              value_ar: this.extractCustomerName(text) || "غير محدد",
            },
          ],
        },
        missing_fields: ["customerPhone"],
        reply_ar: "من العميل اللي عايز تخليه VIP؟",
        reasoning: "Detected VIP tag command",
      };
    }

    // Default unknown
    return {
      intent: "UNKNOWN",
      confidence: 0.3,
      entities: {
        expense: null,
        stockUpdate: null,
        paymentLink: null,
        vipTag: null,
        dateRange: null,
        order: null,
      },
      requires_confirmation: false,
      preview: null,
      missing_fields: [],
      reply_ar:
        'مش فاهم الأمر ده. جرب تقول مثلاً: "دفعت 1000 لحمة" أو "زوّد المخزون 10"',
      reasoning: "Could not determine intent",
    };
  }

  private extractCategory(text: string): string {
    const categories: Record<string, string[]> = {
      لحوم: ["لحم", "لحمة", "فراخ", "دجاج"],
      خضار: ["خضار", "خضروات"],
      كهرباء: ["كهربا", "كهرباء", "نور"],
      إيجار: ["ايجار", "إيجار"],
      رواتب: ["راتب", "رواتب", "مرتب"],
      توصيل: ["توصيل", "شحن", "delivery"],
      إعلانات: ["اعلان", "إعلان", "marketing", "ads"],
      أخرى: [],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return category;
        }
      }
    }
    return "أخرى";
  }

  private extractProductName(text: string): string | null {
    // Simple extraction - in production, AI does this
    const words = text.split(/\s+/);
    const excludeWords = ["زوّد", "زود", "مخزون", "قطعة", "قطع", "stock"];
    const product = words.filter(
      (w) => !excludeWords.includes(w) && !/^\d+$/.test(w),
    );
    return product.length > 0 ? product.join(" ") : null;
  }

  private extractCustomerName(text: string): string | null {
    // Simple extraction
    const match = text.match(/(?:خلي|اعمل)\s+(\S+)\s+vip/i);
    return match ? match[1] : null;
  }

  private async createPendingAction(
    merchantId: string,
    command: CopilotCommand,
    source: "portal" | "whatsapp",
  ): Promise<string> {
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.pool.query(
      `INSERT INTO copilot_pending_actions 
       (id, merchant_id, intent, command, expires_at, status, source)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [
        id,
        merchantId,
        command.intent,
        JSON.stringify(command),
        expiresAt,
        source,
      ],
    );

    await this.recordApprovalState({
      actionId: id,
      merchantId,
      state: "pending",
      intent: command.intent,
      source,
    });

    return id;
  }

  private async updatePendingActionStatus(
    actionId: string,
    status: "confirmed" | "cancelled" | "expired",
  ): Promise<void> {
    await this.pool.query(
      `UPDATE copilot_pending_actions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, actionId],
    );
  }

  private async logHistory(
    merchantId: string,
    source: "portal" | "whatsapp",
    inputType: "text" | "voice",
    inputText: string,
    command: CopilotCommand,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO copilot_history 
         (merchant_id, source, input_type, input_text, intent, command, action_taken)
         VALUES ($1, $2, $3, $4, $5, $6, false)`,
        [
          merchantId,
          source,
          inputType,
          inputText,
          command.intent,
          JSON.stringify(command),
        ],
      );
    } catch (error) {
      logger.error("Failed to log copilot history", error as Error);
    }
  }
}
