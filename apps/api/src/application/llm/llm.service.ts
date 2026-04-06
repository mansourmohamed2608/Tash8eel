import { Injectable, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { createLogger } from "../../shared/logging/logger";
import { MERCHANT_REPOSITORY, IMerchantRepository } from "../../domain/ports";
import { AiMetricsService } from "../../shared/services/ai-metrics.service";
import { NotificationsService } from "../services/notifications.service";
import { Merchant } from "../../domain/entities/merchant.entity";
import { Conversation } from "../../domain/entities/conversation.entity";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { Message } from "../../domain/entities/message.entity";
import {
  ActionType,
  MerchantCategory,
  MessageDirection,
} from "../../shared/constants/enums";
import { ARABIC_TEMPLATES } from "../../shared/constants/templates";
import {
  withRetry,
  withTimeout,
  getTodayDate,
} from "../../shared/utils/helpers";
import {
  LLM_RESPONSE_JSON_SCHEMA,
  LlmResponseValidationSchema,
  ValidatedLlmResponse,
} from "./llm-schema";
import { MerchantContextService } from "./merchant-context.service";

const logger = createLogger("LlmService");

/**
 * Exported so it can be unit-tested without instantiating LlmService.
 * Returns true when a WhatsApp message is CLEARLY unrelated to ordering
 * (sports, jokes, weather, etc.) — zero OpenAI tokens spent for these.
 */
export function isObviouslyOffTopic(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 3) return false;

  const hardDenyPatterns = [
    // General knowledge
    /(ما|من)\s*(هي|هو|اسم)?\s*(عاصمة|رئيس|حكومة|دولة|تاريخ)/i,
    // Jokes / stories
    /احكيلي\s*(نكتة|حكاية|قصة)/i,
    /قولي\s*نكتة/i,
    /نكتة\s*مضحكة/i,
    // Weather forecast
    /الطقس\s*(إيه|ايه|امبارح|النهارده|بكره|دلوقتي)/i,
    // Politics
    /(رأيك|رايك)\s*في\s*(السياسة|الحكومة|الرئيس)/i,
    // Programming help (no "حل" — too broad, could be "help with my order")
    /اكتبلي\s*(كود|code|برنامج|سكريبت)/i,
    /عايز\s*(كود|code)\s*(بـ|في|على)/i,
    // Translation unrelated to ordering
    /ترجملي\s+(?!.{0,20}(منتج|طلب|عنوان))/i,
    // Sports
    /(كرة\s*القدم|كورة\s*(دلوقتي|امبارح|بكره|النهارده)|ليفربول|برشلونة|ريال\s*مدريد|منتخب\s*(مصر|سوريا|مغرب)|نتيجة\s*(مباراة|المباراة)|ميسي|رونالدو|نيمار)/i,
    // News headlines
    /(أهم|آخر)\s*(أخبار|الأخبار)/i,
    // Medical symptoms
    /عندي\s*(ألم|وجع|مرض|صداع|حمى|كحة|حساسية)\s/i,
    // Celebrities / pure entertainment with no product context
    /فيلم\s*(إيه|ايه|حلو|جديد|نشوفه|أشوفه|اشوفه)/i,
    /مسلسل\s*(إيه|ايه|جديد|حلو|ينتهي)/i,
    // Religion Q&A
    /ما\s*(حكم|رأي\s*الدين).{0,40}(في|على)/i,
    // Pure math expression (no text at all)
    /^[\d\s\+\-\*\/\^\(\)=]+$/,
  ];

  return hardDenyPatterns.some((re) => re.test(t));
}

export interface LlmContext {
  merchant: Merchant;
  conversation: Conversation;
  catalogItems: CatalogItem[];
  recentMessages: Message[];
  customerMessage: string;
}

export interface LlmResult {
  response: ValidatedLlmResponse;
  tokensUsed: number;
  llmUsed: boolean;
  // Convenience accessors for inbox.service
  action?: ActionType;
  reply?: string;
  cartItems?: Array<{
    name: string;
    quantity?: number;
    size?: string;
    color?: string;
  }>;
  customerName?: string;
  phone?: string;
  address?: string;
  discountPercent?: number;
  deliveryFee?: number;
  missingSlots?: string[];
  conversationState?: ConversationState;
}

export type CommerceStage =
  | "discovery"
  | "item_confirmation"
  | "delivery"
  | "payment"
  | "confirmed";

export type LastAskedFor =
  | "products"
  | "quantity"
  | "size"
  | "address"
  | "payment"
  | null;

export interface ConversationStateItem {
  name: string;
  quantity: number;
  variant?: string;
}

export interface ConversationState {
  stage: CommerceStage;
  confirmedItems: ConversationStateItem[];
  lastAskedFor: LastAskedFor;
  customerName: string | null;
  deliveryAddress: string | null;
  paymentMethod: string | null;
}

export interface LLMCallOptions {
  model?: "gpt-4o" | "gpt-4o-mini";
  maxTokens?: number;
}

type FallbackReason =
  | "budget_exhausted"
  | "openai_429"
  | "openai_timeout"
  | "openai_error";

// Alias for backward compatibility
export type LlmResponse = LlmResult;

// Helper to create LlmResult with convenience properties
export function createLlmResult(
  response: ValidatedLlmResponse,
  tokensUsed: number,
  llmUsed: boolean,
): LlmResult {
  // Filter products to only include those with names
  const products =
    response.extracted_entities?.products?.filter((p: any) => p.name) || [];
  const cartEligibleActions = new Set<ActionType>([
    ActionType.UPDATE_CART,
    ActionType.CREATE_ORDER,
    ActionType.CONFIRM_ORDER,
    ActionType.ORDER_CONFIRMED,
  ]);
  const cartItems =
    cartEligibleActions.has(response.actionType) &&
    shouldTreatExtractedProductsAsChosen(response)
      ? products.map((p: any) => ({
          name: p.name as string,
          quantity: p.quantity,
          size: p.size,
          color: p.color,
        }))
      : [];

  return {
    response,
    tokensUsed,
    llmUsed,
    action: response.actionType,
    reply: response.reply_ar,
    cartItems,
    customerName: response.extracted_entities?.customerName ?? undefined,
    phone: response.extracted_entities?.phone ?? undefined,
    address: response.extracted_entities?.address?.raw_text ?? undefined,
    discountPercent: response.negotiation?.requestedDiscount ?? undefined,
    deliveryFee: response.delivery_fee ?? undefined,
    missingSlots: response.missing_slots ?? undefined,
  };
}

function createEmptyExtractedEntities(): NonNullable<
  ValidatedLlmResponse["extracted_entities"]
> {
  return {
    products: null,
    customerName: null,
    phone: null,
    address: null,
    substitutionAllowed: null,
    deliveryPreference: null,
  };
}

function shouldTreatExtractedProductsAsChosen(
  response: ValidatedLlmResponse,
): boolean {
  const products = response.extracted_entities?.products || [];
  if (!products || products.length === 0) {
    return false;
  }

  const reply = String(response.reply_ar || "")
    .toLowerCase()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي");

  const unavailablePatterns = [
    /مش\s+متوفر/,
    /غير\s+متوفر/,
    /مش\s+موجود/,
    /مش\s+عندنا/,
    /مش\s+متاح/,
  ];
  const substitutePatterns = [
    /بديل/,
    /اقرب\s+بديل/,
    /اقترح/,
    /ممكن\s+اخدلك/,
    /ممكن\s+اقدم/,
    /تحب\s+بدل/,
  ];

  const isUnavailableReply = unavailablePatterns.some((pattern) =>
    pattern.test(reply),
  );
  const isSuggestionReply = substitutePatterns.some((pattern) =>
    pattern.test(reply),
  );

  return !(isUnavailableReply && isSuggestionReply);
}

function createExtractedEntities(
  overrides: Partial<NonNullable<ValidatedLlmResponse["extracted_entities"]>>,
): NonNullable<ValidatedLlmResponse["extracted_entities"]> {
  return {
    ...createEmptyExtractedEntities(),
    ...overrides,
  };
}

function createEmptyNegotiation(): NonNullable<
  ValidatedLlmResponse["negotiation"]
> {
  return {
    requestedDiscount: null,
    approved: false,
    offerText: null,
    finalPrices: null,
  };
}

@Injectable()
export class LlmService {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private timeoutMs: number;
  private isTestMode: boolean;
  private strictAiMode: boolean;
  /** Throttle: only send one OpenAI-429 notification per merchant per hour */
  private readonly quotaNotifiedAt = new Map<string, number>();
  /** Throttle: only send one budget-exhausted notification per merchant per hour */
  private readonly budgetNotifiedAt = new Map<string, number>();

  constructor(
    private configService: ConfigService,
    @Inject(MERCHANT_REPOSITORY)
    private merchantRepository: IMerchantRepository,
    private readonly aiMetrics: AiMetricsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly merchantContextService: MerchantContextService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY") || "";

    // Detect test mode: no key, dummy API keys, or test environment
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

    this.client = new OpenAI({ apiKey });
    this.model = this.configService.get<string>("OPENAI_MODEL", "gpt-4o-mini");
    this.maxTokens = parseInt(
      this.configService.get<string>("OPENAI_MAX_TOKENS", "2048"),
      10,
    );
    this.timeoutMs = parseInt(
      this.configService.get<string>("OPENAI_TIMEOUT_MS", "30000"),
      10,
    );

    if (this.isTestMode) {
      logger.warn(
        "⚠️ LLM Service running in TEST MODE - AI responses are MOCKED. Set a real OPENAI_API_KEY for production.",
      );
      if (this.strictAiMode) {
        logger.warn(
          "⚠️ AI_STRICT_MODE is enabled - mocked LLM responses are disabled.",
        );
      }
    } else {
      logger.info("LLM Service initialized with real OpenAI connection", {
        model: this.model,
      });
    }
  }

  async processMessage(
    context: LlmContext,
    options?: LLMCallOptions,
  ): Promise<LlmResult> {
    // Use mock responses in test mode
    if (this.isTestMode) {
      if (this.strictAiMode) {
        return this.createAiUnavailableResponse(context);
      }
      return this.createMockResponse(context);
    }

    const {
      merchant,
      conversation,
      catalogItems,
      recentMessages,
      customerMessage,
    } = context;

    // Check token budget
    const budgetCheck = await this.checkTokenBudget(merchant);
    if (!budgetCheck.hasRemaining) {
      logger.warn("Token budget exceeded; continuing with AI response", {
        merchantId: merchant.id,
        remaining: budgetCheck.remaining,
      });
      this.fireBudgetExhaustedNotification(merchant.id);
    }

    try {
      const previousState = this.extractConversationState(recentMessages);
      const currentState = this.extractConversationState(
        this.buildStateMessages(recentMessages, conversation, customerMessage),
      );
      const merchantContext =
        await this.merchantContextService.buildCustomerReplyContext({
          merchant,
          conversation,
          customerMessage,
          recentMessages,
        });
      const systemPrompt = this.buildSystemPrompt(
        merchant,
        merchantContext,
        currentState,
      );
      const conversationHistory = this.buildConversationHistory(
        recentMessages,
        customerMessage,
      );
      const userPrompt = this.buildUserPrompt(
        conversation,
        customerMessage,
        currentState,
      );

      console.log("=== AI CONTEXT DEBUG ===");
      console.log("System prompt length:", systemPrompt.length);
      console.log("Products in context:", merchantContext.productCount);
      console.log("KB entries in context:", merchantContext.kbCount);
      console.log(
        "Conversation history messages:",
        merchantContext.historyCount,
      );
      console.log("Customer message:", customerMessage);
      console.log("========================");

      const _aiCallStart = Date.now(); // BL-004 metric latency
      const response = await withTimeout(
        withRetry(
          () =>
            this.callOpenAI(
              systemPrompt,
              conversationHistory,
              userPrompt,
              options,
            ),
          { maxRetries: 2, initialDelayMs: 1000 },
        ),
        this.timeoutMs,
        "OpenAI request timed out",
      );

      // Extract parsed response from OpenAI structured output
      const parsedResponse =
        (response as any).choices?.[0]?.message?.parsed ||
        (response as any).parsed ||
        response;

      // Validate response with Zod
      const validated = this.validateResponse(parsedResponse);

      // Update token usage
      const tokensUsed = (response as any).usage?.total_tokens || 0;
      await this.recordTokenUsageSafely(
        merchant.id,
        getTodayDate(),
        tokensUsed,
      );
      void this.aiMetrics.record({
        serviceName: "LlmService",
        methodName: "processMessage",
        merchantId: merchant.id,
        outcome: "success",
        tokensUsed,
        latencyMs: Date.now() - _aiCallStart,
      });

      // Check confidence threshold
      if (validated.confidence < 0.5) {
        logger.warn("Low confidence response", {
          merchantId: merchant.id,
          confidence: validated.confidence,
        });
        // Still use the response but log for monitoring
      }

      return this.finalizeLlmResult(
        validated,
        tokensUsed,
        true,
        context,
        previousState,
        currentState,
      );
    } catch (error) {
      const err = error as Error;
      logger.error("LLM processing failed", err, {
        merchantId: merchant.id,
        errorMessage: err.message,
        errorName: err.name,
        timeoutMs: this.timeoutMs,
      });
      try {
        const simplified = await this.retryWithSimplerContext(context, options);
        if (simplified) {
          return simplified;
        }
      } catch (retryError) {
        logger.warn("Simpler-context retry failed", {
          merchantId: merchant.id,
          error: retryError,
        });
      }
      const is429 =
        (err as any)?.status === 429 || err.message?.includes("429");
      void this.aiMetrics.record({
        serviceName: "LlmService",
        methodName: "processMessage",
        merchantId: merchant.id,
        outcome: err.message?.includes("timed out")
          ? "timeout"
          : is429
            ? "error"
            : "error",
      });
      if (is429) {
        this.fireOpenAiQuotaNotification(merchant.id);
      }
      const reason: FallbackReason = is429
        ? "openai_429"
        : err.message?.includes("timed out")
          ? "openai_timeout"
          : "openai_error";
      return this.createFallbackResponse(context, reason);
    }
  }

  private async callOpenAI(
    systemPrompt: string,
    conversationHistory: OpenAI.ChatCompletionMessageParam[],
    userPrompt: string,
    options?: LLMCallOptions,
  ) {
    return this.client.beta.chat.completions.parse({
      model: options?.model || this.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema:
          LLM_RESPONSE_JSON_SCHEMA as OpenAI.ResponseFormatJSONSchema["json_schema"],
      },
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: 0.7,
    });
  }

  private validateResponse(parsed: unknown): ValidatedLlmResponse {
    const result = LlmResponseValidationSchema.safeParse(parsed);

    if (!result.success) {
      logger.warn("LLM response validation failed", {
        errors: result.error.errors,
      });
      throw new Error("Invalid LLM response structure");
    }

    return result.data;
  }

  private buildSystemPrompt(
    merchant: Merchant,
    merchantContext: {
      businessInfo: string;
      productCatalog: string;
      knowledgeBase: string;
      conversationHistory: string;
      orderContext: string;
    },
    conversationState: ConversationState,
  ): string {
    const businessInfoBlock = [
      merchantContext.businessInfo,
      "",
      "Order context:",
      merchantContext.orderContext,
    ].join("\n");

    return `أنت مساعد ذكي لمتجر ${merchant.name}. اسمك ${merchant.name} مساعد.

معلومات المتجر:
${businessInfoBlock}

منتجاتنا المتاحة:
${merchantContext.productCatalog}

معلومات إضافية وسياسات:
${merchantContext.knowledgeBase}

تاريخ المحادثة:
${merchantContext.conversationHistory}

حالة المحادثة الحالية:
المرحلة: ${conversationState.stage}
المنتجات المؤكدة: ${conversationState.confirmedItems.length > 0 ? conversationState.confirmedItems.map((item) => `${item.name} × ${item.quantity}${item.variant ? ` (${item.variant})` : ""}`).join("، ") : "لا يوجد"}
آخر سؤال من المساعد: ${conversationState.lastAskedFor || "لا يوجد"}
اسم العميل: ${conversationState.customerName || "غير معروف"}
عنوان التوصيل: ${conversationState.deliveryAddress || "غير موجود"}
طريقة الدفع: ${conversationState.paymentMethod || "غير محددة"}

---

قواعد الرد:

1. الهوية والأسلوب:
   - تكلم بالعامية المصرية الطبيعية
   - كن ودود ومباشر وسريع
   - لا تستخدم جمل طويلة غير ضرورية
   - لا تستخدم أي رسالة اعتذار عن ضغط أو زحمة العمل أبداً
   - لا تكرر نفس الرد مرتين متتاليتين أبداً

2. لو العميل سأل "بتبيعوا إيه" أو "عندك إيه":
   - اعرض المنتجات الموجودة فوراً من القائمة أعلاه
   - رتبها بشكل واضح بالأسعار
   - اعتبر الرسالة انتقالاً فورياً لمرحلة discovery حتى لو كان قبلها مراحل تانية
   - مثال الرد:
     "عندنا:
     👕 تيشيرتات من 150 لـ 250 جنيه
     👖 بناطيل جينز من 300 لـ 450 جنيه
     🧢 كابات من 80 جنيه
     إيه اللي يناسبك؟"

2.1 لو العميل قال "عندي إيه في السلة" أو "إيه اللي في سلتي":
   - ده سؤال عن السلة الحالية، مش عن الكتالوج
   - اعرض المنتجات المؤكدة الموجودة في السلة بالكميات والأسعار
   - لو السلة فاضية قل: "سلتك فاضية، بتدور على إيه؟"

3. لو العميل طلب منتج معين:
   - ابحث في القائمة أعلاه فوراً
   - لو لقيته: قوله السعر والمتاح فوراً
   - لو مش موجود بالاسم ده: اقترح أقرب بديل من القائمة
   - لو بتقترح بديل لأن المطلوب غير متوفر: لا تعتبر البديل مختاراً ولا تضيفه للسلة إلا بعد موافقة صريحة من العميل
   - لا تقوله "ممكن تكتبلي الطلب" إلا بعد ما يختار المنتج

4. مسار الطلب الصحيح:
   خطوة 1: العميل يختار المنتج
   خطوة 2: تأكد الكمية
   خطوة 3: اسأل عن المقاس/اللون لو موجود
   خطوة 4: اسأل عن عنوان التوصيل
   خطوة 5: اسأل عن طريقة الدفع
   خطوة 6: لخص الطلب وأكده

5. لو العميل سأل سؤال مش في نطاق عملك:
   - أجب ببساطة "أنا هنا بس لمساعدتك في ${merchant.name}"

6. لا تبدأ ردك بـ "أكيد" أو "تمام" في كل رد
7. لا تضع إيموجي كتير - واحدة أو اتنين بحد أقصى
8. ردودك قصيرة ومباشرة - مش محاضرة

قواعد إضافية صارمة:

1. لا تطلب عنوان التوصيل إلا في مرحلة التوصيل
   (بعد تأكيد المنتج والكمية والمقاس)

2. لا تضيف أي منتج للطلب إلا لو العميل صرح
   بشكل واضح إنه عايزه

3. لو العميل سأل سؤال، اجاوب السؤال الأول

4. لا تطلب نفس المعلومة أكتر من مرة في نفس المحادثة

5. لو قلت للعميل إن حاجة مش موجودة، اقترح بديل فوراً
   لا تسألش عن عنوان التوصيل بعدها مباشرة

6. رتيب الأسئلة دايماً:
   أولاً: المنتج → ثانياً: الكمية → ثالثاً: المقاس/اللون
   → رابعاً: عنوان التوصيل → خامساً: طريقة الدفع
   → سادساً: تأكيد الطلب

7. لو العميل قال 'لأ' أو 'مش عايز ده' أو 'خليها':
   ارجع لمرحلة الاستكشاف، اسأل إيه اللي يناسبه

8. لو العميل قال 'مختارانش' أو 'بفكر':
   اقوله خد وقتك وعرض عليه منتجات تانية

9. لو المرحلة discovery:
   جاوب الأسئلة واعرض المنتجات فقط
   لا تطلب عنوان أو دفع
   لا تضيف أي منتج للسلة

10. لو المرحلة item_confirmation:
    أكّد المنتج والسعر أولاً
    ثم اسأل عن الكمية
    ثم اسأل عن المقاس/اللون لو موجود
    لا تطلب عنوان أو دفع

11. لو المرحلة delivery:
    اطلب العنوان مرة واحدة فقط
    ولو كنت سألته عن العنوان في آخر رسالة، انتظر الرد ولا تكرر السؤال

12. لو المرحلة payment:
    اسأل عن طريقة الدفع مرة واحدة فقط
    وبعدها انتقل لتأكيد الطلب

13. لو العميل سأل عن:
    المقاس أو السعر أو اللون أو التوصيل أو الخصم أو الضمان
    جاوب السؤال مباشرة قبل أي خطوة بيع تالية`;
  }

  /**
   * Returns true for messages that are CLEARLY unrelated to ordering.
   *
   * Strategy: hard denylist only — specific patterns with near-zero risk of
   * false positives. We intentionally do NOT try to block "unknown" messages
   * because the cost of blocking a real customer is higher than the cost of
   * one extra OpenAI call.
   */
  private isObviouslyOffTopic(text: string): boolean {
    return isObviouslyOffTopic(text);
  }

  private getCategoryRules(category: string): string {
    const rules: Record<string, string> = {
      CLOTHES: "لازم تسأل عن المقاس واللون للهدوم",
      FOOD: "اسأل عن الإضافات والتعديلات على الأكل",
      SUPERMARKET: "اسأل لو العميل موافق على البدائل لو منتج مش متوفر",
      GENERIC: "اتبع الإجراءات العامة",
    };
    return rules[category] || rules.GENERIC;
  }

  private buildCatalogSummary(items: CatalogItem[]): string {
    if (items.length === 0) return "لا توجد منتجات متاحة حالياً";

    // NOTE: cap raised from 20 → 80 to prevent the LLM silently missing items.
    // The RAG retrieval layer will narrow this further once embeddings are live.
    return items
      .slice(0, 80)
      .map((item) => {
        const safeVariants = Array.isArray((item as any).variants)
          ? ((item as any).variants as Array<{
              name?: string;
              values?: string[];
            }>)
          : [];

        const variants =
          safeVariants.length > 0
            ? ` (${safeVariants
                .map((v) => {
                  const label =
                    v?.name === "size"
                      ? "مقاسات"
                      : v?.name === "color"
                        ? "ألوان"
                        : v?.name || "خيارات";
                  const values = Array.isArray(v?.values)
                    ? v.values.filter((x) => typeof x === "string")
                    : [];
                  return `${label}: ${values.length > 0 ? values.join(", ") : "غير محدد"}`;
                })
                .join(" | ")})`
            : "";
        return `- ${item.nameAr}: ${item.basePrice} جنيه${variants}`;
      })
      .join("\n");
  }

  private buildKnowledgeBaseSummary(
    knowledgeBase?: Record<string, any>,
  ): string {
    if (!knowledgeBase) return "";

    const info = knowledgeBase.businessInfo || {};
    const lines: string[] = [];

    if (info.name) lines.push(`- اسم النشاط: ${info.name}`);
    if (info.category) lines.push(`- نوع النشاط: ${info.category}`);
    if (info.phone) lines.push(`- الهاتف: ${info.phone}`);
    if (info.whatsapp) lines.push(`- واتساب: ${info.whatsapp}`);
    if (info.website) lines.push(`- الموقع: ${info.website}`);
    if (info.address) lines.push(`- العنوان: ${info.address}`);
    if (info.policies?.returnPolicy)
      lines.push(`- سياسة الاسترجاع: ${info.policies.returnPolicy}`);
    if (info.policies?.deliveryInfo)
      lines.push(`- معلومات التوصيل: ${info.policies.deliveryInfo}`);
    if (
      Array.isArray(info.policies?.paymentMethods) &&
      info.policies.paymentMethods.length > 0
    ) {
      lines.push(`- طرق الدفع: ${info.policies.paymentMethods.join(", ")}`);
    }
    const deliveryPricing = info.deliveryPricing || {};
    if (
      deliveryPricing.mode === "UNIFIED" &&
      deliveryPricing.unifiedPrice !== undefined &&
      deliveryPricing.unifiedPrice !== null
    ) {
      lines.push(`- سعر التوصيل الموحد: ${deliveryPricing.unifiedPrice}`);
    }
    if (
      deliveryPricing.mode === "BY_CITY" &&
      Array.isArray(deliveryPricing.byCity) &&
      deliveryPricing.byCity.length > 0
    ) {
      const byCity = deliveryPricing.byCity
        .filter((entry: any) => entry?.area || entry?.city)
        .slice(0, 6)
        .map((entry: any) => `${entry.area || entry.city}: ${entry.price}`);
      if (byCity.length > 0) {
        lines.push(`- أسعار التوصيل حسب المنطقة: ${byCity.join("، ")}`);
      }
    }
    if (deliveryPricing.notes)
      lines.push(`- ملاحظات التوصيل: ${deliveryPricing.notes}`);

    const faqs = Array.isArray(knowledgeBase.faqs)
      ? knowledgeBase.faqs
          .filter((f: any) => f && f.isActive !== false)
          .slice(0, 5)
      : [];

    if (faqs.length > 0) {
      lines.push("الأسئلة الشائعة:");
      faqs.forEach((faq: any) => {
        lines.push(`س: ${faq.question}`);
        lines.push(`ج: ${faq.answer}`);
      });
    }

    const offers = Array.isArray(knowledgeBase.offers)
      ? knowledgeBase.offers
          .filter((o: any) => o && o.isActive !== false)
          .slice(0, 5)
      : [];

    if (offers.length > 0) {
      lines.push("العروض الحالية:");
      offers.forEach((offer: any) => {
        const label = offer.nameAr || offer.name || "عرض";
        const value =
          offer.type === "PERCENTAGE"
            ? `${offer.value}%`
            : offer.type === "FREE_SHIPPING"
              ? "شحن مجاني"
              : offer.value !== undefined
                ? `${offer.value}`
                : "";
        const code = offer.code
          ? ` (كود: ${offer.code})`
          : offer.autoApply
            ? " (يُطبّق تلقائياً)"
            : "";
        lines.push(`- ${label}${value ? `: ${value}` : ""}${code}`);
      });
    }

    return lines.join("\n");
  }

  private buildNegotiationRules(rules: Merchant["negotiationRules"]): string {
    if (!rules.allowNegotiation) {
      return "التفاوض غير متاح - الأسعار ثابتة";
    }
    return `التفاوض متاح بحد أقصى ${rules.maxDiscountPercent || 10}%`;
  }

  private buildConversationHistory(
    messages: Message[],
    customerMessage?: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const sorted = [...messages].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const recent = [...sorted];
    const lastMessage = recent[recent.length - 1];
    if (
      customerMessage &&
      lastMessage &&
      String(lastMessage.direction).toLowerCase() === "inbound" &&
      String(lastMessage.text || "").trim() === String(customerMessage).trim()
    ) {
      recent.pop();
    }
    return recent.slice(-10).map((msg) => ({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.text || "",
    })) as OpenAI.ChatCompletionMessageParam[];
  }

  private buildUserPrompt(
    conversation: Conversation,
    customerMessage: string,
    conversationState: ConversationState,
  ): string {
    const cartItems = conversation.cart.items || [];
    const cartSummary =
      cartItems.length > 0
        ? `السلة الحالية:\n${cartItems.map((i: any) => `- ${i.name} × ${i.quantity} = ${i.total} جنيه`).join("\n")}\nالمجموع الفرعي: ${conversation.cart.subtotal || conversation.cart.total} جنيه${conversation.cart.discount ? `\nالخصم: ${conversation.cart.discount} جنيه` : ""}${conversation.cart.deliveryFee ? `\nالتوصيل: ${conversation.cart.deliveryFee} جنيه` : ""}\nالإجمالي: ${conversation.cart.total} جنيه`
        : "السلة فارغة";

    // Build collected info summary
    const info = conversation.collectedInfo;
    const collectedParts: string[] = [];
    if (info.customerName) collectedParts.push(`الاسم: ${info.customerName}`);
    if (info.phone) collectedParts.push(`التليفون: ${info.phone}`);
    if (info.address) {
      const addr =
        typeof info.address === "object"
          ? info.address.raw_text || JSON.stringify(info.address)
          : info.address;
      collectedParts.push(`العنوان: ${addr}`);
    }
    const collectedInfo =
      collectedParts.length > 0 ? collectedParts.join("\n") : "لا يوجد";

    // Check what's missing
    const missingParts: string[] = [];
    if (!info.customerName) missingParts.push("اسم العميل");
    if (!info.phone) missingParts.push("رقم التليفون");
    if (
      !info.address ||
      (typeof info.address === "object" && !info.address.raw_text)
    )
      missingParts.push("العنوان الكامل");
    if (cartItems.length === 0) missingParts.push("المنتجات");

    return `حالة المحادثة الحالية في النظام: ${conversation.state}

حالة المحادثة الحالية:
المرحلة: ${conversationState.stage}
المنتجات المؤكدة: ${conversationState.confirmedItems.length > 0 ? conversationState.confirmedItems.map((item) => `${item.name} × ${item.quantity}${item.variant ? ` (${item.variant})` : ""}`).join("، ") : "لا يوجد"}
آخر سؤال: ${conversationState.lastAskedFor || "لا يوجد"}
اسم العميل: ${conversationState.customerName || "غير معروف"}
عنوان التوصيل: ${conversationState.deliveryAddress || "غير موجود"}
طريقة الدفع: ${conversationState.paymentMethod || "غير محددة"}

${cartSummary}

المعلومات المتوفرة:
${collectedInfo}

المعلومات الناقصة: ${missingParts.length > 0 ? missingParts.join(", ") : "كل المعلومات متوفرة"}

رسالة العميل الحالية:
${customerMessage}

اعتمد على سياق المتجر والكتالوج وتاريخ المحادثة أعلاه. لو العميل ذكر المنتج بالفعل متسألوش عنه مرة تانية، وانتقل للخطوة التالية المناسبة في مسار الطلب. لو العميل قال "عندك إيه" أو "بتبيعوا إيه" فده browsing discovery وورّيه الكتالوج فوراً. لو العميل قال "عندي إيه في السلة" أو "إيه اللي في سلتي" فاعرض السلة الحالية فقط. لو المرحلة discovery أو item_confirmation فلا تطلب عنوان التوصيل أو طريقة الدفع.`;
  }

  private buildStateMessages(
    messages: Message[],
    conversation: Conversation,
    customerMessage: string,
  ): Message[] {
    const sorted = [...messages].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const lastMessage = sorted[sorted.length - 1];
    if (
      lastMessage &&
      String(lastMessage.direction).toLowerCase() === "inbound" &&
      String(lastMessage.text || "").trim() === String(customerMessage).trim()
    ) {
      return sorted;
    }

    return [
      ...sorted,
      {
        id: `current-${conversation.id}`,
        conversationId: conversation.id,
        merchantId: conversation.merchantId,
        channel: conversation.channel,
        direction: MessageDirection.INBOUND,
        senderId: conversation.senderId,
        text: customerMessage,
        attachments: [],
        metadata: {},
        llmUsed: false,
        tokensUsed: 0,
        createdAt: new Date(),
      },
    ];
  }

  extractConversationState(messages: Message[]): ConversationState {
    type WorkingItem = {
      name: string;
      quantity: number | null;
      variant: string | null;
      variantRequested: boolean;
      explicitlyChosen: boolean;
    };

    const recent = [...messages]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-10);

    let lastAskedFor: LastAskedFor = null;
    let customerName: string | null = null;
    let deliveryAddress: string | null = null;
    let paymentMethod: string | null = null;
    let pendingItem: WorkingItem | null = null;
    let lastSuggestedProduct: string | null = null;
    let summaryShown = false;
    let latestInboundText: string | null = null;

    const confirmedItems: ConversationStateItem[] = [];

    const pushConfirmedItem = (item: WorkingItem | null) => {
      if (!item || !this.isPendingItemReady(item)) {
        return;
      }

      const candidate: ConversationStateItem = {
        name: item.name.trim(),
        quantity: item.quantity || 1,
        ...(item.variant ? { variant: item.variant.trim() } : {}),
      };
      const key = this.buildConfirmedItemKey(candidate);
      const existingIndex = confirmedItems.findIndex(
        (entry) => this.buildConfirmedItemKey(entry) === key,
      );

      if (existingIndex >= 0) {
        confirmedItems[existingIndex] = candidate;
      } else {
        confirmedItems.push(candidate);
      }
    };

    for (const message of recent) {
      const text = String(message.text || "").trim();
      if (!text) {
        continue;
      }

      const normalized = this.normalizeArabicText(text);
      const isInbound =
        String(message.direction).toLowerCase() === MessageDirection.INBOUND;

      if (!isInbound) {
        lastAskedFor = this.detectAssistantRequestType(text);
        if (lastAskedFor === "size" && pendingItem) {
          pendingItem.variantRequested = true;
        }

        const suggestedProduct =
          this.extractSuggestedProductFromAssistant(text);
        if (suggestedProduct) {
          lastSuggestedProduct = suggestedProduct;
        }

        if (
          /ملخص\s+الطلب|كده\s+الطلب\s+جاهز|تحب\s+اكد\s+الطلب|تاكيد\s+الطلب|تأكيد\s+الطلب/.test(
            normalized,
          )
        ) {
          summaryShown = true;
        }
        continue;
      }

      const detectedName = this.extractCustomerNameFromText(text);
      latestInboundText = text;
      if (detectedName) {
        customerName = detectedName;
      }

      const detectedAddress = this.extractDeliveryAddressFromText(text);
      if (detectedAddress) {
        deliveryAddress = detectedAddress;
      }

      const detectedPaymentMethod = this.extractPaymentMethodFromText(text);
      if (detectedPaymentMethod) {
        paymentMethod = detectedPaymentMethod;
      }

      if (this.isCancellationOrBackToBrowsing(text)) {
        pendingItem = null;
        lastSuggestedProduct = null;
        confirmedItems.length = 0;
        continue;
      }

      if (this.isThinkingMessage(text)) {
        continue;
      }

      const explicitProduct = this.extractExplicitPurchaseProduct(text);
      const quantity = this.extractQuantityFromText(text);
      const variant = this.extractVariantFromText(text);

      if (explicitProduct) {
        pushConfirmedItem(pendingItem);
        pendingItem = {
          name: explicitProduct,
          quantity,
          variant,
          variantRequested: Boolean(variant),
          explicitlyChosen: true,
        };
      } else if (
        this.isPositiveConfirmationOnly(text) &&
        lastSuggestedProduct
      ) {
        pushConfirmedItem(pendingItem);
        pendingItem = {
          name: lastSuggestedProduct,
          quantity,
          variant,
          variantRequested: Boolean(variant),
          explicitlyChosen: true,
        };
      } else if (pendingItem) {
        if (quantity !== null) {
          pendingItem.quantity = quantity;
        }

        if (variant) {
          pendingItem.variant = variant;
          pendingItem.variantRequested = true;
        }
      }

      pushConfirmedItem(pendingItem);
      if (pendingItem && this.isPendingItemReady(pendingItem)) {
        pendingItem = null;
      }
    }

    let stage: CommerceStage = "discovery";

    if (pendingItem) {
      stage = "item_confirmation";
    } else if (confirmedItems.length === 0) {
      stage = "discovery";
    } else if (!deliveryAddress) {
      stage = "delivery";
    } else if (!paymentMethod) {
      stage = "payment";
    } else if (summaryShown || confirmedItems.length > 0) {
      stage = "confirmed";
    }

    if (
      latestInboundText &&
      this.isDiscoveryTriggerMessage(latestInboundText)
    ) {
      stage = "discovery";
    }

    return {
      stage,
      confirmedItems,
      lastAskedFor,
      customerName,
      deliveryAddress,
      paymentMethod,
    };
  }

  private finalizeLlmResult(
    response: ValidatedLlmResponse,
    tokensUsed: number,
    llmUsed: boolean,
    context: LlmContext,
    previousState: ConversationState,
    currentState: ConversationState,
  ): LlmResult {
    const sanitized = this.enforceConversationRules(
      response,
      context,
      previousState,
      currentState,
    );
    const canonicalConfirmedItems = currentState.confirmedItems.map((item) => ({
      ...item,
      name:
        this.getCanonicalCatalogLabel(
          context.catalogItems,
          item.name,
          item.name,
        ) || item.name,
    }));
    const result = createLlmResult(sanitized, tokensUsed, llmUsed);
    result.conversationState = {
      ...currentState,
      confirmedItems: canonicalConfirmedItems,
    };
    result.cartItems = this.getNewlyConfirmedCartItems(
      previousState,
      {
        ...currentState,
        confirmedItems: canonicalConfirmedItems,
      },
      context.conversation.cart.items || [],
    );
    return result;
  }

  private enforceConversationRules(
    response: ValidatedLlmResponse,
    context: LlmContext,
    previousState: ConversationState,
    currentState: ConversationState,
  ): ValidatedLlmResponse {
    const next: ValidatedLlmResponse = {
      ...response,
      extracted_entities: response.extracted_entities
        ? {
            ...response.extracted_entities,
            products: response.extracted_entities.products
              ? [...response.extracted_entities.products]
              : null,
            address: response.extracted_entities.address
              ? { ...response.extracted_entities.address }
              : null,
          }
        : null,
      missing_slots: response.missing_slots
        ? [...response.missing_slots]
        : null,
      negotiation: response.negotiation ? { ...response.negotiation } : null,
    };

    const questionType = this.classifyCustomerQuestion(context.customerMessage);
    const asksAddress =
      this.replyRequestsAddress(next.reply_ar) ||
      (next.missing_slots || []).some((slot) => slot.startsWith("address"));
    const asksPayment = this.replyRequestsPayment(next.reply_ar);

    const clearAddressAndPayment = () => {
      if (next.extracted_entities?.address) {
        next.extracted_entities.address = null;
      }
      if (next.extracted_entities?.products) {
        next.extracted_entities.products = null;
      }
      next.missing_slots = (next.missing_slots || []).filter(
        (slot) => !slot.startsWith("address") && slot !== "payment",
      );
    };

    if (this.isCartContentsInquiryMessage(context.customerMessage)) {
      clearAddressAndPayment();
      next.actionType = ActionType.ASK_CLARIFYING_QUESTION;
      next.reply_ar = this.buildCartContentsReply(context, currentState);
      next.reasoning = "answered_cart_contents";
      return next;
    }

    if (this.isDiscoveryTriggerMessage(context.customerMessage)) {
      clearAddressAndPayment();
      next.actionType = ActionType.ASK_CLARIFYING_QUESTION;
      next.reply_ar = this.buildFallbackCatalogReply(
        context.catalogItems,
        context.merchant.category,
      );
      next.reasoning = "forced_discovery_catalog";
      return next;
    }

    if (
      currentState.lastAskedFor === "address" &&
      !this.looksLikeDeliveryAddressText(context.customerMessage) &&
      asksAddress
    ) {
      clearAddressAndPayment();
      next.actionType = ActionType.ASK_CLARIFYING_QUESTION;
      next.reply_ar = "خد وقتك، لما تجهز العنوان قولي 😊";
      next.reasoning = "wait_for_address_once";
      return next;
    }

    const addressOrPaymentTooEarly =
      (currentState.stage === "discovery" ||
        currentState.stage === "item_confirmation") &&
      (asksAddress || asksPayment);

    if (questionType && (asksAddress || asksPayment)) {
      const directAnswer = this.buildDirectQuestionAnswer(
        questionType,
        context,
        currentState,
        next,
      );
      if (directAnswer) {
        clearAddressAndPayment();
        next.actionType = ActionType.ASK_CLARIFYING_QUESTION;
        next.reply_ar = directAnswer;
        next.reasoning = `answered_question_first:${questionType}`;
        return next;
      }
    }

    if (addressOrPaymentTooEarly) {
      const stageReply = this.buildStageProgressReply(
        context,
        previousState,
        currentState,
        next,
      );
      if (stageReply) {
        clearAddressAndPayment();
        next.actionType = ActionType.ASK_CLARIFYING_QUESTION;
        next.reply_ar = stageReply;
        next.reasoning = `stage_guard:${currentState.stage}`;
        return next;
      }
    }

    if (
      currentState.stage !== "delivery" &&
      this.looksLikeDeliveryAddressText(context.customerMessage) === false &&
      next.extracted_entities?.address?.raw_text
    ) {
      next.extracted_entities.address = null;
    }

    return next;
  }

  private getNewlyConfirmedCartItems(
    previousState: ConversationState,
    currentState: ConversationState,
    existingCartItems: Array<{
      name?: string;
      quantity?: number;
      size?: string;
    }>,
  ): Array<{ name: string; quantity?: number; size?: string; color?: string }> {
    const previousKeys = new Set(
      previousState.confirmedItems.map((item) =>
        this.buildConfirmedItemKey(item),
      ),
    );
    const existingKeys = new Set(
      existingCartItems.map((item) =>
        this.buildConfirmedItemKey({
          name: String(item.name || ""),
          quantity: Number(item.quantity || 1),
          variant: item.size,
        }),
      ),
    );

    return currentState.confirmedItems
      .filter((item) => {
        const key = this.buildConfirmedItemKey(item);
        return !previousKeys.has(key) && !existingKeys.has(key);
      })
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        size: item.variant,
      }));
  }

  private buildConfirmedItemKey(item: {
    name: string;
    quantity: number;
    variant?: string;
  }): string {
    return [
      this.normalizeArabicText(item.name),
      String(item.quantity),
      this.normalizeArabicText(item.variant || ""),
    ].join("::");
  }

  private isPendingItemReady(item: {
    quantity: number | null;
    variant: string | null;
    variantRequested: boolean;
    explicitlyChosen: boolean;
  }): boolean {
    if (!item.explicitlyChosen || item.quantity === null) {
      return false;
    }
    if (item.variantRequested && !item.variant) {
      return false;
    }
    return true;
  }

  private detectAssistantRequestType(text: string): LastAskedFor {
    const normalized = this.normalizeArabicText(text);

    if (
      /عنوان|العنوان|محافظه|محافظة|منطقه|منطقة|شارع|عماره|عمارة|حي|لوكيشن/.test(
        normalized,
      )
    ) {
      return "address";
    }
    if (
      /طريقه الدفع|طريقة الدفع|الدفع|كاش|فيزا|اونلاين|تحويل|انستا/.test(
        normalized,
      )
    ) {
      return "payment";
    }
    if (/مقاس|مقاسات|لون|الوان|ألوان/.test(normalized)) {
      return "size";
    }
    if (/كميه|كمية|كام قطعه|كام قطعة|تحب كام|عدد/.test(normalized)) {
      return "quantity";
    }
    if (
      /ايه المنتج|اسم المنتج|نوع المنتج|بتدور على ايه|عايز ايه/.test(normalized)
    ) {
      return "products";
    }

    return null;
  }

  private normalizeArabicText(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/[ىي]/g, "ي")
      .replace(/[ً-ْ]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractCustomerNameFromText(text: string): string | null {
    const match = text.match(
      /(?:اسمي|انا\s+اسمي|معاك|انا)\s+([^\d\s][^\n]{1,40})/i,
    );
    return match?.[1]?.trim() || null;
  }

  private extractPaymentMethodFromText(text: string): string | null {
    const normalized = this.normalizeArabicText(text);
    if (/انستا|instapay/.test(normalized)) return "instapay";
    if (/فيزا|كارت|بطاقه|بطاقة|ماستر/.test(normalized)) return "card";
    if (/كاش|نقدا|نقدي|عند الاستلام/.test(normalized)) return "cash";
    if (/تحويل|فودافون كاش/.test(normalized)) return "transfer";
    return null;
  }

  private extractDeliveryAddressFromText(text: string): string | null {
    return this.looksLikeDeliveryAddressText(text) ? text.trim() : null;
  }

  private looksLikeDeliveryAddressText(text: string): boolean {
    const normalized = this.normalizeArabicText(text);
    if (normalized.length < 10) {
      return false;
    }

    return /شارع|منطقه|منطقة|مدينه|مدينة|حي|عماره|عمارة|شقه|شقة|الدور|برج|فيلا|بجوار|امام|أمام|خلف|لوكيشن|maps|goo gl/.test(
      normalized,
    );
  }

  private isCancellationOrBackToBrowsing(text: string): boolean {
    const normalized = this.normalizeArabicText(text);
    return (
      /^لا$|^لأ$|^خلاص$/.test(normalized) ||
      /مش عايز|مش عاوزه|خليها|سيبها|مش ده|مش هذا|لا خلاص/.test(normalized)
    );
  }

  private isThinkingMessage(text: string): boolean {
    const normalized = this.normalizeArabicText(text);
    return /بفكر|محتار|مختار|لسه هشوف|مش متاكد|مش متأكد|مش عارف|هفكر/.test(
      normalized,
    );
  }

  private isPositiveConfirmationOnly(text: string): boolean {
    const normalized = this.normalizeArabicText(text);
    return /^(ايوه|ايوة|اه|أه|تمام|ماشي|موافق|اوكي|ok|yes|تمام ده|تمام دي|اه تمام)$/.test(
      normalized,
    );
  }

  private extractExplicitPurchaseProduct(text: string): string | null {
    const normalized = this.normalizeArabicText(text);
    const match = normalized.match(
      /(?:عايز|عاوز|عاوزه|اخد|اخذ|اخد|اطلب|طلب|هطلب|هاخد|محتاج|حابب)\s+(.+)/,
    );
    if (!match?.[1]) {
      return null;
    }

    const candidate = match[1]
      .replace(
        /^(?:قطعه|قطعة|قطعتين|حبه|حبة|واحد|واحده|واحدة|اتنين|اثنين|ثلاثه|ثلاثة|\d+)\s+/,
        "",
      )
      .replace(/\s+(?:بس|لو|عشان|من فضلك|ممكن).*$/, "")
      .trim();

    return candidate.length >= 2 ? candidate : null;
  }

  private extractQuantityFromText(text: string): number | null {
    const normalized = this.normalizeArabicText(text).replace(
      /[٠-٩]/g,
      (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
    );
    const digitMatch = normalized.match(/\b(\d+)\b/);
    if (digitMatch) {
      return Number(digitMatch[1]);
    }

    const wordMap: Record<string, number> = {
      واحد: 1,
      واحده: 1,
      واحدة: 1,
      اتنين: 2,
      اثنين: 2,
      تلاته: 3,
      ثلاثة: 3,
      اربعه: 4,
      اربعة: 4,
      خمسه: 5,
      خمسة: 5,
    };

    for (const [word, value] of Object.entries(wordMap)) {
      if (new RegExp(`\\b${word}\\b`).test(normalized)) {
        return value;
      }
    }

    return null;
  }

  private extractVariantFromText(text: string): string | null {
    const sizeMatch =
      text.match(/مقاس\s*([A-Za-z0-9\-]+)/i) ||
      text.match(/\b(XXL|XL|L|M|S|XS)\b/i);
    if (sizeMatch?.[1]) {
      return `مقاس ${sizeMatch[1].toUpperCase()}`;
    }

    const colorMatch = this.normalizeArabicText(text).match(
      /\b(اسود|ابيض|احمر|ازرق|ازرق غامق|كحلي|بيج|رمادي|اخضر|اصفر|وردي|بني)\b/,
    );
    if (colorMatch?.[1]) {
      return `لون ${colorMatch[1]}`;
    }

    return null;
  }

  private extractSuggestedProductFromAssistant(text: string): string | null {
    const normalized = this.normalizeArabicText(text);
    const patterns = [
      /بديل(?:\s+زي)?\s+(.+?)(?:\s+بسعر|\s+\d+\s*ج|[.!؟?]|$)/,
      /عندنا\s+مثلا\s+(.+?)(?:\s+بسعر|\s+\d+\s*ج|[.!؟?]|$)/,
      /ممكن\s+(?:اخد|اقدم)\s+لك\s+بديل\s+زي\s+(.+?)(?:\s+بسعر|\s+\d+\s*ج|[.!؟?]|$)/,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  private classifyCustomerQuestion(
    text: string,
  ):
    | "cart_contents"
    | "sizes"
    | "price"
    | "color"
    | "delivery_areas"
    | "delivery_fee"
    | "delivery_time"
    | "discount"
    | "pickup"
    | "warranty"
    | null {
    const normalized = this.normalizeArabicText(text);

    if (this.isCartContentsInquiryMessage(normalized)) {
      return "cart_contents";
    }
    if (/مقاس كام|المقاسات|عندك مقاس|في مقاس/.test(normalized)) {
      return "sizes";
    }
    if (/بكام|السعر|سعره|سعرها|كام ده|كام دي/.test(normalized)) {
      return "price";
    }
    if (/في اللون|اللون|الوان|ألوان|لون ايه|لون اي/.test(normalized)) {
      return "color";
    }
    if (
      /بتوصلوا فين|مناطق التوصيل|فين التوصيل|بتوصلوا لايه|بتوصلوا لاي/.test(
        normalized,
      )
    ) {
      return "delivery_areas";
    }
    if (/التوصيل بكام|سعر التوصيل|رسوم التوصيل/.test(normalized)) {
      return "delivery_fee";
    }
    if (
      /بياخد قد ايه|بياخد قد ايه|مدة التوصيل|امتي يوصل|امتى يوصل/.test(
        normalized,
      )
    ) {
      return "delivery_time";
    }
    if (/في خصم|في عرض|في تخفيض/.test(normalized)) {
      return "discount";
    }
    if (/ممكن استلم|استلام من الفرع|pickup|استلام ذاتي/.test(normalized)) {
      return "pickup";
    }
    if (/الضمان ايه|في ضمان|ضمان/.test(normalized)) {
      return "warranty";
    }

    return null;
  }

  private buildDirectQuestionAnswer(
    questionType:
      | "cart_contents"
      | "sizes"
      | "price"
      | "color"
      | "delivery_areas"
      | "delivery_fee"
      | "delivery_time"
      | "discount"
      | "pickup"
      | "warranty",
    context: LlmContext,
    currentState: ConversationState,
    response: ValidatedLlmResponse,
  ): string | null {
    const item = this.resolveActiveCatalogItem(context, currentState, response);

    switch (questionType) {
      case "cart_contents":
        return this.buildCartContentsReply(context, currentState);
      case "sizes": {
        const sizes = this.getVariantValues(item, "size");
        if (!item || sizes.length === 0) {
          return null;
        }
        return `${item.nameAr} متوفر بالمقاسات: ${sizes.join("، ")}. لو مناسبك قولي الكمية المطلوبة.`;
      }
      case "price":
        if (!item) return null;
        return `${item.nameAr} سعره ${item.basePrice} جنيه. لو مناسبك قولي الكمية المطلوبة.`;
      case "color": {
        if (!item) return null;
        const colors = this.getVariantValues(item, "color");
        if (colors.length === 0) {
          return `${item.nameAr} مش موضح له ألوان مختلفة حالياً. لو تحب أقولك المتاح عندنا من نفس النوع.`;
        }
        const requestedColor = this.extractRequestedColor(
          context.customerMessage,
        );
        if (requestedColor) {
          const exists = colors.some(
            (color) =>
              this.normalizeArabicText(color) ===
              this.normalizeArabicText(requestedColor),
          );
          return exists
            ? `أيوه، ${item.nameAr} متوفر باللون ${requestedColor}. لو مناسبك قولي الكمية المطلوبة.`
            : `${item.nameAr} الألوان المتاحة فيه: ${colors.join("، ")}.`;
        }
        return `${item.nameAr} الألوان المتاحة فيه: ${colors.join("، ")}.`;
      }
      case "delivery_areas": {
        const zones = context.merchant.deliveryRules?.deliveryZones || [];
        if (zones.length === 0) {
          return context.merchant.city
            ? `التوصيل متاح حالياً داخل ${context.merchant.city}.`
            : "التوصيل متاح، ولو قلتلي المنطقة أقولك التفاصيل بدقة.";
        }
        return `التوصيل متاح للمناطق دي: ${zones.map((zone) => zone.zone).join("، ")}.`;
      }
      case "delivery_fee": {
        const zones = context.merchant.deliveryRules?.deliveryZones || [];
        if (zones.length > 0) {
          const summary = zones
            .slice(0, 4)
            .map((zone) => `${zone.zone}: ${zone.fee} جنيه`)
            .join("، ");
          return `رسوم التوصيل حسب المنطقة: ${summary}.`;
        }
        const fee =
          context.merchant.defaultDeliveryFee ??
          context.merchant.deliveryRules?.defaultFee;
        return fee
          ? `رسوم التوصيل ${fee} جنيه.`
          : "رسوم التوصيل بتتحدد حسب المنطقة. ابعتلي المكان وأقولك التكلفة.";
      }
      case "delivery_time": {
        const zones = context.merchant.deliveryRules?.deliveryZones || [];
        const estimated = zones
          .map((zone) => zone.estimatedDays)
          .filter((days) => Number.isFinite(days));
        if (estimated.length > 0) {
          const minDays = Math.min(...estimated);
          const maxDays = Math.max(...estimated);
          return minDays === maxDays
            ? `مدة التوصيل المتوقعة حوالي ${minDays} يوم.`
            : `مدة التوصيل المتوقعة من ${minDays} إلى ${maxDays} أيام حسب المنطقة.`;
        }
        return "مدة التوصيل بتتحدد حسب المنطقة، لكن غالباً بنأكدها معاك بعد العنوان.";
      }
      case "discount": {
        const promotion = context.merchant.negotiationRules?.activePromotion;
        if (promotion?.enabled && promotion.discountPercent) {
          return `عندنا عرض شغال دلوقتي: ${promotion.description || `خصم ${promotion.discountPercent}%`}.`;
        }
        if (context.merchant.negotiationRules?.allowNegotiation) {
          return "مفيش خصم ثابت معلن حالياً، لكن ممكن أشوف لك أفضل عرض متاح على الطلب لما تحدد المنتج.";
        }
        return "حالياً مفيش خصم متاح على المنتجات دي.";
      }
      case "pickup":
        return this.buildKnowledgeBasePolicyReply(
          context.merchant,
          ["استلام", "pickup", "فرع"],
          "الاستلام من الفرع مش موضح عندي حالياً. لو تحب أكملك بخيارات التوصيل.",
        );
      case "warranty":
        return this.buildKnowledgeBasePolicyReply(
          context.merchant,
          ["ضمان", "استرجاع", "استبدال"],
          "سياسة الضمان أو الاستبدال مش موضحة عندي حالياً. لو تحب أراجعها لك مع المتجر.",
        );
      default:
        return null;
    }
  }

  private buildStageProgressReply(
    context: LlmContext,
    previousState: ConversationState,
    currentState: ConversationState,
    response: ValidatedLlmResponse,
  ): string | null {
    const item = this.resolveActiveCatalogItem(context, currentState, response);
    const hint =
      item?.nameAr ||
      this.getCanonicalCatalogLabel(
        context.catalogItems,
        currentState.confirmedItems[currentState.confirmedItems.length - 1]
          ?.name ||
          this.extractProductHint(
            this.normalizeArabicText(context.customerMessage),
            context.catalogItems,
          ) ||
          this.extractProductHintFromHistory(
            context.recentMessages,
            context.catalogItems,
          ),
        null,
      );

    if (currentState.stage === "discovery") {
      if (
        this.isCatalogInquiryMessage(
          this.normalizeArabicText(context.customerMessage),
        )
      ) {
        return this.buildFallbackCatalogReply(
          context.catalogItems,
          context.merchant.category,
        );
      }

      if (item) {
        return `${item.nameAr} متوفر بسعر ${item.basePrice} جنيه. تحب كام قطعة؟`;
      }

      return "قولّي اسم المنتج اللي يناسبك وأنا أساعدك خطوة بخطوة.";
    }

    if (currentState.stage === "item_confirmation") {
      if (!hint) {
        return "حددلي المنتج اللي عايزه الأول وأنا أكمل معاك بالكمية والتفاصيل.";
      }

      if (currentState.lastAskedFor === "size" || this.itemHasVariants(item)) {
        const variantPrompt = this.buildVariantPrompt(item, hint);
        if (variantPrompt) {
          return variantPrompt;
        }
      }

      return `${hint} تمام. محتاج كام قطعة؟`;
    }

    if (currentState.stage === "delivery") {
      if (currentState.lastAskedFor === "address") {
        return "خد وقتك، لما تجهز العنوان قولي 😊";
      }
      return "تمام. ابعتلي عنوان التوصيل بالتفصيل مرة واحدة وأنا أكمل معاك.";
    }

    if (currentState.stage === "payment") {
      if (currentState.lastAskedFor === "payment") {
        return "خد وقتك، ولما تحدد طريقة الدفع قولي وأنا أكمل الطلب.";
      }
      return "تمام. تحب تدفع كاش عند الاستلام ولا أونلاين؟";
    }

    return null;
  }

  private resolveActiveCatalogItem(
    context: LlmContext,
    currentState: ConversationState,
    response?: ValidatedLlmResponse,
  ): CatalogItem | null {
    const candidates = [
      response?.extracted_entities?.products?.[0]?.name,
      currentState.confirmedItems[currentState.confirmedItems.length - 1]?.name,
      context.conversation.cart.items?.[0]?.name,
      this.extractProductHint(
        this.normalizeArabicText(context.customerMessage),
        context.catalogItems,
      ),
      this.extractProductHintFromHistory(
        context.recentMessages,
        context.catalogItems,
      ),
    ].filter((value): value is string => Boolean(value));

    if (candidates.length === 0) {
      return null;
    }

    let bestMatch: CatalogItem | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const match = this.findCatalogItemByReference(
        context.catalogItems,
        candidate,
      );
      if (!match) continue;
      const score = this.normalizeArabicText(
        [
          match.nameAr,
          match.nameEn,
          match.sku,
          match.descriptionAr,
          match.category,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(this.normalizeArabicText(candidate))
        ? 100
        : 10;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = match;
      }
    }

    return bestMatch;
  }

  private getCanonicalCatalogLabel(
    catalogItems: CatalogItem[],
    reference: string | null | undefined,
    fallback: string | null,
  ): string | null {
    if (!reference) {
      return fallback;
    }

    const match = this.findCatalogItemByReference(catalogItems, reference);
    return match?.nameAr || fallback;
  }

  private findCatalogItemByReference(
    catalogItems: CatalogItem[],
    reference: string | null | undefined,
  ): CatalogItem | null {
    if (!reference) {
      return null;
    }

    const normalizedReference = this.normalizeArabicText(reference);
    if (!normalizedReference) {
      return null;
    }

    const referenceTokens = normalizedReference.split(" ").filter(Boolean);
    let bestMatch: CatalogItem | null = null;
    let bestScore = 0;

    for (const item of catalogItems) {
      const haystack = this.normalizeArabicText(
        [
          item.nameAr,
          item.nameEn,
          item.sku,
          item.descriptionAr,
          item.category,
          ...(Array.isArray(item.tags) ? item.tags : []),
        ]
          .filter(Boolean)
          .join(" "),
      );

      let score = 0;
      if (haystack.includes(normalizedReference)) {
        score += 100;
      }

      for (const token of referenceTokens) {
        if (token.length < 2) continue;
        if (haystack.includes(token)) {
          score += token.length >= 4 ? 10 : 4;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    return bestMatch;
  }

  private getVariantValues(
    item: CatalogItem | null,
    variantName: string,
  ): string[] {
    if (!item || !Array.isArray(item.variants)) {
      return [];
    }

    const normalizedVariantName = this.normalizeArabicText(variantName);
    return item.variants
      .filter((variant) => {
        const normalizedName = this.normalizeArabicText(variant.name);
        return normalizedVariantName === "size"
          ? /size|مقاس/.test(normalizedName)
          : /color|لون/.test(normalizedName);
      })
      .flatMap((variant) =>
        Array.isArray(variant.values)
          ? variant.values.filter((value) => typeof value === "string")
          : [],
      );
  }

  private itemHasVariants(item: CatalogItem | null): boolean {
    return Boolean(
      item && Array.isArray(item.variants) && item.variants.length > 0,
    );
  }

  private buildVariantPrompt(
    item: CatalogItem | null,
    fallbackName: string,
  ): string | null {
    if (!item) {
      return `تمام. لو فيه مقاس أو لون معين للـ ${fallbackName} قولي عليه.`;
    }

    const sizes = this.getVariantValues(item, "size");
    const colors = this.getVariantValues(item, "color");
    const parts: string[] = [];
    if (sizes.length > 0) {
      parts.push(`المقاسات المتاحة: ${sizes.join("، ")}`);
    }
    if (colors.length > 0) {
      parts.push(`الألوان المتاحة: ${colors.join("، ")}`);
    }

    if (parts.length === 0) {
      return null;
    }

    return `${item.nameAr} تمام. ${parts.join(" | ")}. اختر المناسب لك.`;
  }

  private extractRequestedColor(text: string): string | null {
    return (
      this.normalizeArabicText(text).match(
        /\b(اسود|ابيض|احمر|ازرق|ازرق غامق|كحلي|بيج|رمادي|اخضر|اصفر|وردي|بني)\b/,
      )?.[1] || null
    );
  }

  private buildKnowledgeBasePolicyReply(
    merchant: Merchant,
    keywords: string[],
    fallback: string,
  ): string {
    const knowledgeBase = merchant.knowledgeBase;
    if (!knowledgeBase) {
      return fallback;
    }

    const text = JSON.stringify(knowledgeBase);
    const hasKeyword = keywords.some((keyword) =>
      this.normalizeArabicText(text).includes(
        this.normalizeArabicText(keyword),
      ),
    );

    if (!hasKeyword) {
      return fallback;
    }

    const faqs = Array.isArray(knowledgeBase?.faqs) ? knowledgeBase.faqs : [];
    const faqMatch = faqs.find((faq: any) => {
      const combined = `${faq?.question || ""} ${faq?.answer || ""}`;
      return keywords.some((keyword) =>
        this.normalizeArabicText(combined).includes(
          this.normalizeArabicText(keyword),
        ),
      );
    });

    if (faqMatch?.answer) {
      return String(faqMatch.answer);
    }

    const policies = knowledgeBase?.businessInfo?.policies || {};
    for (const value of Object.values(policies)) {
      if (typeof value === "string") {
        return value;
      }
    }

    return fallback;
  }

  private replyRequestsAddress(reply: string): boolean {
    const normalized = this.normalizeArabicText(reply);
    return /عنوان|العنوان|محافظه|محافظة|منطقه|منطقة|شارع|لوكيشن/.test(
      normalized,
    );
  }

  private replyRequestsPayment(reply: string): boolean {
    const normalized = this.normalizeArabicText(reply);
    return /طريقه الدفع|طريقة الدفع|الدفع|كاش|فيزا|اونلاين|أونلاين|تحويل/.test(
      normalized,
    );
  }

  private async retryWithSimplerContext(
    context: LlmContext,
    options?: LLMCallOptions,
  ): Promise<LlmResult | null> {
    const {
      merchant,
      conversation,
      catalogItems,
      recentMessages,
      customerMessage,
    } = context;
    const lightweightCatalog = catalogItems.slice(0, 15);
    const previousState = this.extractConversationState(recentMessages);
    const currentState = this.extractConversationState(
      this.buildStateMessages(recentMessages, conversation, customerMessage),
    );
    const systemPrompt = this.buildSimpleRetryPrompt(
      merchant,
      lightweightCatalog,
      currentState,
    );
    const conversationHistory = this.buildConversationHistory(
      recentMessages,
      customerMessage,
    );
    const userPrompt = this.buildUserPrompt(
      conversation,
      customerMessage,
      currentState,
    );

    const response = await withTimeout(
      this.callOpenAI(systemPrompt, conversationHistory, userPrompt, options),
      this.timeoutMs,
      "OpenAI retry request timed out",
    );
    const parsedResponse =
      (response as any).choices?.[0]?.message?.parsed ||
      (response as any).parsed ||
      response;
    const validated = this.validateResponse(parsedResponse);
    const tokensUsed = (response as any).usage?.total_tokens || 0;
    await this.recordTokenUsageSafely(merchant.id, getTodayDate(), tokensUsed);

    return this.finalizeLlmResult(
      validated,
      tokensUsed,
      true,
      context,
      previousState,
      currentState,
    );
  }

  private async recordTokenUsageSafely(
    merchantId: string,
    usageDate: string,
    tokensUsed: number,
  ): Promise<void> {
    if (!tokensUsed || tokensUsed <= 0) {
      return;
    }

    try {
      await this.merchantRepository.incrementTokenUsage(
        merchantId,
        usageDate,
        tokensUsed,
      );
    } catch (error) {
      logger.warn("Token usage accounting failed", {
        merchantId,
        usageDate,
        tokensUsed,
        error,
      });
    }
  }

  private buildSimpleRetryPrompt(
    merchant: Merchant,
    catalogItems: CatalogItem[],
    conversationState: ConversationState,
  ): string {
    const compactCatalog = catalogItems.length
      ? catalogItems
          .map((item) => {
            const name = item.nameAr || item.name || "منتج";
            const price = item.basePrice || item.price || 0;
            const availability =
              item.isAvailable === false ? "غير متوفر" : "متوفر";
            return `- ${name}: ${price} جنيه (${availability})`;
          })
          .join("\n")
      : "- لا توجد منتجات متاحة حالياً";

    return `أنت مساعد ذكي لمتجر ${merchant.name}. رد بالعامية المصرية فقط.

الكتالوج المختصر:
${compactCatalog}

قواعد مهمة:
- لا تستخدم أي رسالة اعتذار عن ضغط أو زحمة العمل
- لو العميل ذكر المنتج بالفعل، لا تسأل عن اسم المنتج مرة أخرى
- لو المنتج موجود، اذكر السعر والتوفر فوراً
- لو العميل اختار المنتج بالفعل، انتقل للكمية ثم المقاس/اللون ثم العنوان ثم الدفع
- المرحلة الحالية: ${conversationState.stage}
- آخر سؤال من المساعد: ${conversationState.lastAskedFor || "لا يوجد"}
- المنتجات المؤكدة: ${conversationState.confirmedItems.length > 0 ? conversationState.confirmedItems.map((item) => `${item.name} × ${item.quantity}`).join("، ") : "لا يوجد"}
- لا تطلب عنوان التوصيل إلا بعد تأكيد المنتج والكمية والمقاس
- لو العميل سأل سؤال مباشر، جاوبه قبل أي طلب معلومات إضافية
- لو السؤال خارج نطاق المتجر، قل: "أنا هنا بس لمساعدتك في ${merchant.name}"`;
  }

  private async checkTokenBudget(
    merchant: Merchant,
  ): Promise<{ hasRemaining: boolean; remaining: number }> {
    const usage = await this.merchantRepository.getTokenUsage(
      merchant.id,
      getTodayDate(),
    );
    const used = usage?.tokensUsed || 0;
    const budget = merchant.dailyTokenBudget;
    const remaining = budget - used;

    return {
      hasRemaining: remaining > 0,
      remaining: Math.max(0, remaining),
    };
  }

  async getRemainingBudget(merchantId: string): Promise<number> {
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) return 0;

    const check = await this.checkTokenBudget(merchant);
    return check.remaining;
  }

  // ─── Agent Autonomous Reasoning ─────────────────────────────
  /**
   * Called by the worker's autonomous agent brain.
   * Takes structured context about a detected situation,
   * sends it to GPT-4o-mini with a strong system prompt,
   * and gets back a structured decision (action + explanation).
   */
  async agentReason(request: {
    merchantId: string;
    merchantName: string;
    agentType: string;
    checkType: string;
    contextData: Record<string, any>;
    locale?: string;
  }): Promise<{
    success: boolean;
    decision?: {
      shouldAct: boolean;
      action: string;
      titleAr: string;
      descriptionAr: string;
      severity: "INFO" | "WARNING" | "ACTION" | "CRITICAL";
      personalizedMessage?: string;
      reasoning: string;
    };
    tokensUsed: number;
    error?: string;
  }> {
    // Test mode → return deterministic mock
    if (this.isTestMode) {
      if (this.strictAiMode) {
        return {
          success: false,
          tokensUsed: 0,
          error: "AI_NOT_ENABLED",
        };
      }
      return {
        success: true,
        decision: {
          shouldAct: true,
          action: request.checkType,
          titleAr: `[تجريبي] ${request.checkType}`,
          descriptionAr: `Mock agent reasoning for ${request.checkType}`,
          severity: "INFO",
          reasoning: "Test mode — deterministic response",
        },
        tokensUsed: 0,
      };
    }

    // Token budget check
    const merchant = await this.merchantRepository.findById(request.merchantId);
    if (!merchant) {
      return { success: false, tokensUsed: 0, error: "Merchant not found" };
    }
    const budgetCheck = await this.checkTokenBudget(merchant);
    if (!budgetCheck.hasRemaining) {
      return { success: false, tokensUsed: 0, error: "Token budget exceeded" };
    }

    try {
      const systemPrompt = this.buildAgentReasoningPrompt(request.agentType);
      const userPrompt = `
متجر: "${request.merchantName}" (معرّف: ${request.merchantId})
نوع الفحص: ${request.checkType}
البيانات:
${JSON.stringify(request.contextData, null, 2)}

بناءً على البيانات أعلاه، هل يجب اتخاذ إجراء؟ وما هو؟
`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.3,
      });

      const tokensUsed = response.usage?.total_tokens || 0;
      await this.recordTokenUsageSafely(
        merchant.id,
        getTodayDate(),
        tokensUsed,
      );
      void this.aiMetrics.record({
        serviceName: "LlmService",
        methodName: "agentReason",
        merchantId: request.merchantId,
        outcome: "success",
        tokensUsed,
      });

      const content = response.choices?.[0]?.message?.content || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        logger.warn("Agent reasoning JSON parse failed", { content });
        return { success: false, tokensUsed, error: "Invalid JSON from LLM" };
      }

      return {
        success: true,
        decision: {
          shouldAct: parsed.should_act ?? true,
          action: parsed.action || request.checkType,
          titleAr: parsed.title_ar || `إجراء: ${request.checkType}`,
          descriptionAr: parsed.description_ar || "",
          severity: ["INFO", "WARNING", "ACTION", "CRITICAL"].includes(
            parsed.severity,
          )
            ? parsed.severity
            : "INFO",
          personalizedMessage: parsed.personalized_message || undefined,
          reasoning: parsed.reasoning || "",
        },
        tokensUsed,
      };
    } catch (error) {
      const err = error as Error;
      logger.error("Agent reasoning failed", err, {
        merchantId: request.merchantId,
        checkType: request.checkType,
      });
      void this.aiMetrics.record({
        serviceName: "LlmService",
        methodName: "agentReason",
        merchantId: request.merchantId,
        outcome: "error",
      });
      return { success: false, tokensUsed: 0, error: err.message };
    }
  }

  private buildAgentReasoningPrompt(agentType: string): string {
    const basePrompt = `أنت وكيل ذكاء اصطناعي مستقل يعمل لصالح متجر مصري على واتساب.
مهمتك: تحليل البيانات المقدمة واتخاذ قرار ذكي.

أنت تعمل بالعربية المصرية (لغة سهلة، مباشرة، ودودة).

═══════════════════════════════════════
📊 ملخص شامل لبيزنس التاجر (businessSnapshot)
═══════════════════════════════════════
هتلاقي في contextData.businessSnapshot بيانات كاملة عن التاجر:

merchant: اسم التاجر، فئته (ملابس/أكل/إلخ)، الباقة بتاعته (TRIAL/STARTER/PRO/ENTERPRISE)، وبدأ إمتى
businessStats: أرقام حقيقية:
  - إجمالي الطلبات (كل الأوقات + آخر 30 يوم + النهاردة)
  - الإيرادات (آخر 30 يوم + النهاردة) بالجنيه المصري
  - متوسط قيمة الطلب
  - عدد العملاء (إجمالي + نشطين آخر 7 أيام)
  - عدد المنتجات النشطة + اللي مخزونها قليل
  - عدد السائقين النشطين + المحادثات المفتوحة + الطلبات المتأخرة
topProducts: أعلى 5 منتجات مبيعاً (آخر 30 يوم) — الاسم + الكمية + الإيرادات
recentAgentActions: آخر 10 إجراءات اتخذها الوكلاء في آخر 24 ساعة

✨ استخدم البيانات دي عشان:
- تفهم حجم البيزنس (صغير/متوسط/كبير) وتعطي نصائح مناسبة للحجم
- تقارن الأرقام ببعض (لو الطلبات قليلة بس الإيرادات عالية = منتجات غالية)
- تكتشف فرص (لو عنده عملاء كتير بس طلبات قليلة = محتاج follow up)
- تكتب رسائل شخصية فعلاً (اذكر أرقام حقيقية مش كلام عام)
- لو فيه مشكلة: ضعها في سياق البيزنس الكامل
- لو فيه إنجاز: احتفل بالأرقام الحقيقية 🎉

═══════════════════════════════════════

يجب أن يكون ردك JSON بهذا الشكل:
{
  "should_act": true/false,
  "action": "نوع_الإجراء",
  "title_ar": "عنوان قصير بالعربي (سطر واحد)",
  "description_ar": "شرح مفصل للتاجر — ليه اتخذت القرار ده وإيه اللي حصل",
  "severity": "INFO|WARNING|ACTION|CRITICAL",
  "personalized_message": "رسالة شخصية ممكن تتبعت للعميل (اختياري)",
  "reasoning": "التحليل الداخلي — ليه قررت كده (بالإنجليزي للمطورين)"
}

قواعد عامة:
- لا تتخذ إجراء إلا لو البيانات فيها مشكلة حقيقية
- severity=CRITICAL فقط لو فيه خسارة مالية أو عميل هيمشي
- severity=ACTION لو اتخذت إجراء فعلي (حجزت مخزون، جدولت رسالة)
- severity=WARNING لو فيه تنبيه بس مش محتاج إجراء فوري
- severity=INFO لأخبار إيجابية أو معلومات مفيدة
- الرسالة الشخصية لازم تكون طبيعية وبالمصري — زي ما حد بيكلم صاحبه
- اذكر أرقام حقيقية من الـ businessSnapshot في ردك (الإيرادات، الطلبات، العملاء)
- خصص نصيحتك حسب حجم وفئة التاجر — مش نصيحة جينيريك
`;

    const agentSpecific: Record<string, string> = {
      OPS_AGENT: `
أنت وكيل العمليات. تخصصك:
- متابعة المحادثات: لو عميل مبعتش رد من فترة، اكتب رسالة متابعة شخصية (مش جينيريك). ابص على آخر رسائله واسأل عن اللي كان بيسأل عنه.
- توزيع الأوردرات: لو فيه أوردر جديد محتاج سائق، اختار الأقل شغل وقرّب من العنوان لو ممكن.
- الأوردرات المتأخرة: لو أوردر واقف أكثر من 24 ساعة، ده مشكلة — التاجر لازم يعرف.
- تحليل المشاعر: لو عميل بيشتكي أو زعلان، الأولوية لازم تتحول HIGH فوراً.

استخدم الـ businessSnapshot عشان:
- لو التاجر عنده محادثات مفتوحة كتير (openConversations) بس سائقين قليلين — نبّهه
- لو عنده عملاء نشطين (activeCustomers7d) كتير — المتابعة أهم
- لو متوسط قيمة الطلب عالي — كل عميل مهم جداً ومحتاج اهتمام خاص

لما تكتب رسالة متابعة شخصية:
- اقرأ آخر رسالة العميل كويس
- لو كان بيسأل عن منتج: "أهلاً! لسه مهتم بـ[المنتج]؟ عندنا عرض حلو عليه 😊"
- لو كان بيأكد أوردر: "أهلاً! أوردرك جاهز — محتاج حاجة تانية؟"
- لو مفيش سياق: "أهلاً! إزيك؟ محتاج مساعدة في حاجة؟ احنا هنا 😊"
`,
      INVENTORY_AGENT: `
أنت وكيل المخزون. تخصصك:
- حجز المخزون: لما يكون فيه أوردرات pending، لازم تحجز الكمية عشان ما تتباعش لحد تاني.
- المنتجات الراكدة (Dead Stock): لو منتج مبيعش من 30 يوم وأكتر ولسه في المخزون — ده فلوس واقفة. اقترح حلول (خصم، عرض، تصفية).
- إعادة الطلب: لو المخزون قرب يخلص، احسب الكمية المطلوبة بناءً على معدل البيع اليومي ومدة التوصيل المعتادة.
- تحسين الأسعار: لو sell-through rate نزل بشكل ملحوظ (>50% انخفاض) — يمكن السعر محتاج تعديل.

استخدم الـ businessSnapshot عشان:
- لو التاجر عنده إيرادات عالية بس منتجات قليلة — كل منتج مهم جداً ومحتاج مراقبة دقيقة
- لو عنده منتجات كتير بس مبيعات قليلة — الموضوع محتاج إعادة تقييم للكاتالوج كله
- لو الـ topProducts ليها مخزون قليل — ده CRITICAL مش WARNING
- قارن Dead Stock بالـ revenue ← لو المخزون الراكد يساوي أكتر من 20% من إيرادات الشهر = خطير

لما تقترح إعادة طلب:
- احسب: (معدل البيع اليومي × أيام التوصيل المتوقعة) + مخزون أمان 20%
- لو المنتج بيبيع >10/يوم والمخزون <3 أيام: CRITICAL
- لو المخزون <7 أيام: WARNING
- لو المنتج من الـ topProducts: زوّد كمية الأمان لـ 30%
`,
      FINANCE_AGENT: `
أنت وكيل المالية. تخصصك:
- الدفع عند الاستلام (COD): لو أوردر اتسلّم من أكتر من 48 ساعة والفلوس لسه ما اتجمعتش — ده فلوس ضايعة. CRITICAL.
- معدل الاسترجاع: لو أكتر من 15% من الأوردرات اترجعت في آخر 7 أيام — فيه مشكلة في المنتج أو التوصيل. حلل السبب الأرجح.
- المصاريف الغريبة: لو مصروف واحد أكبر من 3 أضعاف المتوسط لنفس الفئة — نبّه التاجر.
- الأرقام القياسية: لو إيرادات اليوم أعلى من أي يوم سابق — احتفل مع التاجر! 🎉

استخدم الـ businessSnapshot عشان:
- لو الإيرادات زادت بس الطلبات ثابتة = التاجر بيبيع منتجات أغلى (إيجابي — هنّيه)
- لو الطلبات زادت بس الإيرادات ثابتة أو نزلت = العملاء بيطلبوا حاجات أرخص (نبّهه)
- لو عنده COD كتير وسائقين قليلين = مشكلة هيكلية محتاج يعرف عنها
- لما تحتفل بإنجاز: اذكر أرقام حقيقية (عدد العملاء، المنتج الأكتر مبيعاً، الإيرادات)
- قارن الأداء الحالي بالمتوسطات

لما تحلل مالياً:
- اذكر الأرقام بالجنيه المصري
- قارن بالفترة السابقة لو ممكن
- اقترح حل عملي (مش بس تنبيه)
- لو فيه COD متأخر أكتر من 72 ساعة: غيّر severity لـ CRITICAL وقول للتاجر يتصل بالسائق فوراً
`,
    };

    return basePrompt + (agentSpecific[agentType] || "");
  }

  /**
   * Create intelligent mock responses for testing.
   * Analyzes the customer message and returns appropriate test responses
   */
  private createMockResponse(context: LlmContext): LlmResult {
    const { conversation, customerMessage, catalogItems } = context;
    const messageLower = customerMessage.toLowerCase();

    // Detect greeting patterns
    if (
      messageLower.includes("سلام") ||
      messageLower.includes("مرحبا") ||
      messageLower.includes("صباح")
    ) {
      // Extract name if present after "أنا"
      const nameMatch = customerMessage.match(/أنا\s+(\S+)/);
      return createLlmResult(
        {
          actionType: ActionType.GREET,
          reply_ar: nameMatch
            ? `أهلاً ${nameMatch[1]}! كيف أقدر أساعدك اليوم؟`
            : "أهلاً وسهلاً! كيف أقدر أساعدك؟",
          confidence: 0.95,
          extracted_entities: nameMatch
            ? createExtractedEntities({ customerName: nameMatch[1] })
            : createEmptyExtractedEntities(),
          missing_slots: ["product"],
          negotiation: null,
          reasoning: null,
          delivery_fee: null,
        },
        0,
        false,
      );
    }

    // Detect product ordering patterns
    if (
      messageLower.includes("عايز") ||
      messageLower.includes("طلب") ||
      messageLower.includes("اشتري")
    ) {
      // Try to match catalog items using scored fuzzy matching
      const words = customerMessage.split(/\s+/);

      // Score each catalog item based on how many words match
      const scoredItems: Array<{ item: CatalogItem; score: number }> = [];

      for (const item of catalogItems) {
        const itemWords = item.nameAr.split(/\s+/);
        let score = 0;

        // Count matching words
        for (const word of words) {
          if (word.length < 2) continue; // Skip very short words
          for (const itemWord of itemWords) {
            if (itemWord.includes(word) || word.includes(itemWord)) {
              score += 1;
            }
          }
        }

        if (score > 0) {
          scoredItems.push({ item, score });
        }
      }

      // Sort by score and take the best match(es)
      scoredItems.sort((a, b) => b.score - a.score);

      // Only take items with the highest score (most specific match)
      const bestScore = scoredItems[0]?.score || 0;
      const bestMatches = scoredItems.filter((s) => s.score === bestScore);

      const matchedItems: Array<{
        name: string;
        quantity: number;
        size?: string;
        color?: string;
      }> = [];

      // Take only the first best match to avoid duplicates
      if (bestMatches.length > 0) {
        const bestItem = bestMatches[0].item;
        const sizeMatch =
          customerMessage.match(/مقاس\s*(\S+)/i) ||
          customerMessage.match(/(S|M|L|XL|XXL)/i);
        matchedItems.push({
          name: bestItem.nameAr,
          quantity: 1,
          size: sizeMatch ? sizeMatch[1] : undefined,
        });
      }

      // Fallback: if no catalog matches, create a generic item from the message
      if (matchedItems.length === 0) {
        const productMatch = customerMessage.match(
          /عايز\s+(.+?)(?:\s+مقاس|\s+لون|$)/,
        );
        matchedItems.push({
          name: productMatch ? productMatch[1].trim() : "منتج",
          quantity: 1,
        });
      }

      return createLlmResult(
        {
          actionType: ActionType.ASK_CLARIFYING_QUESTION,
          reply_ar: `المتوفر عندنا ${matchedItems.map((i) => i.name).join(" و ")}. تحب كام قطعة؟`,
          confidence: 0.9,
          extracted_entities: createExtractedEntities({
            products: matchedItems.map((item) => ({
              name: item.name,
              quantity: item.quantity ?? null,
              size: item.size ?? null,
              color: item.color ?? null,
              options: null,
              notes: null,
            })),
          }),
          missing_slots: ["quantity"],
          negotiation: null,
          reasoning: null,
          delivery_fee: null,
        },
        0,
        false,
      );
    }

    // Detect address patterns
    if (
      messageLower.includes("شارع") ||
      messageLower.includes("منطقة") ||
      messageLower.includes("مدينة") ||
      messageLower.includes("المعادي") ||
      messageLower.includes("مدينة نصر") ||
      messageLower.includes("القاهرة")
    ) {
      return createLlmResult(
        {
          actionType: ActionType.COLLECT_SLOTS,
          reply_ar: "تمام، تم تسجيل العنوان. ممكن اعرف رقم تليفونك للتواصل؟",
          confidence: 0.85,
          extracted_entities: createExtractedEntities({
            address: {
              city: "القاهرة",
              area: null,
              street: null,
              building: null,
              floor: null,
              apartment: null,
              landmark: null,
              raw_text: customerMessage,
            },
          }),
          missing_slots: ["phone"],
          negotiation: null,
          reasoning: null,
          delivery_fee: null,
        },
        0,
        false,
      );
    }

    // Detect confirmation patterns
    if (
      messageLower.includes("تمام") ||
      messageLower.includes("موافق") ||
      messageLower.includes("أكد") ||
      messageLower.includes("نعم") ||
      messageLower.includes("اه")
    ) {
      return createLlmResult(
        {
          actionType: ActionType.CONFIRM_ORDER,
          reply_ar:
            "تمام! تم تأكيد طلبك. هنتواصل معاك قريب للتوصيل. شكراً لطلبك! 🎉",
          confidence: 0.95,
          extracted_entities: null,
          missing_slots: null,
          negotiation: null,
          reasoning: null,
          delivery_fee: null,
        },
        0,
        false,
      );
    }

    // Detect price negotiation
    if (
      messageLower.includes("غالي") ||
      messageLower.includes("خصم") ||
      messageLower.includes("ارخص")
    ) {
      return createLlmResult(
        {
          actionType: ActionType.HANDLE_NEGOTIATION,
          reply_ar: "فاهم! ممكن نعملك خصم 10% على الطلب ده. إيه رأيك؟",
          confidence: 0.8,
          extracted_entities: null,
          missing_slots: null,
          negotiation: {
            requestedDiscount: 10,
            approved: false,
            offerText: null,
            finalPrices: null,
          },
          reasoning: null,
          delivery_fee: null,
        },
        0,
        false,
      );
    }

    // Detect angry/escalation patterns
    if (
      messageLower.includes("زعلان") ||
      messageLower.includes("مشكلة") ||
      messageLower.includes("سيء") ||
      messageLower.includes("مدير") ||
      messageLower.includes("شكوى")
    ) {
      return createLlmResult(
        {
          actionType: ActionType.ESCALATE,
          reply_ar:
            "نأسف جداً لأي إزعاج! حيتم تحويلك لأحد ممثلي خدمة العملاء فوراً للمساعدة.",
          confidence: 0.9,
          extracted_entities: null,
          missing_slots: null,
          negotiation: null,
          reasoning: null,
          delivery_fee: null,
        },
        0,
        false,
      );
    }

    // Default: ask for clarification
    return createLlmResult(
      {
        actionType: ActionType.ASK_CLARIFYING_QUESTION,
        reply_ar: "تمام! كيف أقدر أساعدك النهاردة؟",
        confidence: 0.7,
        extracted_entities: null,
        missing_slots:
          conversation.missingSlots.length > 0
            ? conversation.missingSlots
            : ["product"],
        negotiation: null,
        reasoning: null,
        delivery_fee: null,
      },
      0,
      false,
    );
  }

  /**
   * Fired when the platform's OpenAI API key returns 429 (external quota exhausted).
   * This is an admin/platform issue — the API key needs to be checked/upgraded.
   * Throttled to once per hour per merchant.
   */
  private fireOpenAiQuotaNotification(merchantId: string): void {
    const now = Date.now();
    const last = this.quotaNotifiedAt.get(merchantId) || 0;
    if (now - last < 60 * 60 * 1000) return;
    this.quotaNotifiedAt.set(merchantId, now);
    void this.notificationsService
      .create({
        merchantId,
        type: "SYSTEM_ALERT",
        title: "⚠️ OpenAI API quota exhausted",
        titleAr: "⚠️ تنبيه: نفدت حصة OpenAI API",
        message:
          "The OpenAI API key returned a 429 error — the platform's external AI quota is exhausted. Incoming WhatsApp messages will receive fallback replies. Please check the OpenAI billing dashboard and upgrade the plan.",
        messageAr:
          "مفتاح OpenAI API أعاد خطأ 429 — نفدت حصة الذكاء الاصطناعي الخارجية للمنصة. رسائل الواتساب ستتلقى ردوداً بديلة. تحقق من لوحة الفوترة على OpenAI وقم بترقية الخطة.",
        priority: "URGENT",
        channels: ["IN_APP"],
        data: { alertKind: "OPENAI_QUOTA_EXHAUSTED" },
        actionUrl: "https://platform.openai.com/account/billing",
        expiresInHours: 24,
      })
      .catch((err) =>
        logger.warn("Failed to create OpenAI quota notification", {
          err,
          merchantId,
        }),
      );
  }

  /**
   * Fired when THIS merchant's daily token budget on the platform is fully consumed.
   * This is a per-merchant issue — they need to wait for midnight reset or upgrade.
   * Throttled to once per hour per merchant.
   */
  private fireBudgetExhaustedNotification(merchantId: string): void {
    const now = Date.now();
    const last = this.budgetNotifiedAt.get(merchantId) || 0;
    if (now - last < 60 * 60 * 1000) return;
    this.budgetNotifiedAt.set(merchantId, now);
    void this.notificationsService
      .create({
        merchantId,
        type: "SYSTEM_ALERT",
        title: "Daily AI quota exhausted",
        titleAr: "نفدت حصة الذكاء الاصطناعي اليومية",
        message:
          "Your daily AI token budget has been fully consumed. Incoming WhatsApp messages will receive fallback replies until midnight when the quota resets automatically.",
        messageAr:
          "استنفدت حصتك اليومية من رصيد الذكاء الاصطناعي. رسائل الواتساب ستتلقى ردوداً احتياطية حتى منتصف الليل حين تتجدد الحصة تلقائياً.",
        priority: "HIGH",
        channels: ["IN_APP"],
        data: { alertKind: "MERCHANT_BUDGET_EXHAUSTED" },
        actionUrl: "/merchant/settings",
        expiresInHours: 24,
      })
      .catch((err) =>
        logger.warn("Failed to create budget notification", {
          err,
          merchantId,
        }),
      );
  }

  private isCatalogInquiryMessage(messageLower: string): boolean {
    return this.isDiscoveryTriggerMessage(messageLower);
  }

  private isDiscoveryTriggerMessage(text: string): boolean {
    const normalized = this.normalizeArabicText(text);
    if (!normalized || this.isCartContentsInquiryMessage(normalized)) {
      return false;
    }

    return [
      "عندك ايه",
      "بتبيعوا ايه",
      "ايه عندكم",
      "عندكم ايه",
      "المنتجات ايه",
      "اعرض المنتجات",
      "كتالوج",
      "catalog",
      "menu",
    ].some((phrase) => normalized.includes(phrase));
  }

  private isCartContentsInquiryMessage(text: string): boolean {
    const normalized = this.normalizeArabicText(text);
    if (!normalized) {
      return false;
    }

    return [
      "عندك ايه في السله",
      "عندي ايه في السله",
      "ايه في سلتي",
      "ايه اللي في سلتي",
      "عندي ايه",
    ].some((phrase) => normalized.includes(phrase));
  }

  private isOrderIntentMessage(messageLower: string): boolean {
    return /عايز|عاوز|اطلب|أطلب|طلب|اشتري|شراء|عايزة|عاوزه/i.test(messageLower);
  }

  private extractProductHint(
    messageLower: string,
    catalogItems: CatalogItem[],
  ): string | null {
    const normalizedMessage = String(messageLower || "")
      .replace(/[؟?!.,،]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalizedMessage) {
      return null;
    }

    // If the customer explicitly says they are unsure, avoid fake precision.
    if (/معرفش|ماعرفش|مش\s*عارف|محتار|مش\s*متأكد/i.test(normalizedMessage)) {
      return null;
    }

    const catalogNames = catalogItems
      .map((item) => String(item.nameAr || item.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    const matchedCatalogName = catalogNames.find((name) =>
      normalizedMessage.includes(String(name).toLowerCase()),
    );
    if (matchedCatalogName) {
      return matchedCatalogName;
    }

    const stopWords = new Set([
      "عايز",
      "عاوز",
      "عايزة",
      "عاوزه",
      "اطلب",
      "أطلب",
      "طلب",
      "اشتري",
      "شراء",
      "ممكن",
      "لو",
      "سمحت",
      "انا",
      "أنا",
      "ايه",
      "إيه",
      "بتبيعوا",
      "عندكم",
      "المنيو",
      "menu",
      "catalog",
      "منتج",
      "منتجات",
      "حاجة",
      "شي",
      "شيء",
      "يعني",
      "ولا",
      "او",
      "أو",
      "انت",
      "إنت",
    ]);

    const genericIntentTokens = new Set([
      "اعمل",
      "أعمل",
      "order",
      "اوردر",
      "اوردر",
      "help",
      "مساعدة",
    ]);

    const tokens = normalizedMessage
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !stopWords.has(token));

    if (tokens.length === 0) {
      return null;
    }

    if (tokens.every((token) => genericIntentTokens.has(token))) {
      return null;
    }

    const hint = tokens.join(" ").trim();
    return hint.length >= 2 ? hint : null;
  }

  private buildFallbackOrderProgressReply(productHint: string): string {
    return `تمام 👌 فهمت إنك عايز ${productHint}.\nممكن تقولي الكمية المطلوبة؟`;
  }

  private extractProductHintFromHistory(
    recentMessages: Message[],
    catalogItems: CatalogItem[],
  ): string | null {
    const inboundMessages = [...recentMessages]
      .reverse()
      .filter(
        (message) =>
          String(message.direction || "").toLowerCase() === "inbound",
      );

    for (const message of inboundMessages) {
      const hint = this.extractProductHint(
        String(message.text || "").toLowerCase(),
        catalogItems,
      );
      if (hint) {
        return hint;
      }
    }

    return null;
  }

  private buildFallbackCatalogReply(
    catalogItems: CatalogItem[],
    merchantCategory?: MerchantCategory,
  ): string {
    const names = Array.from(
      new Set(
        catalogItems
          .map((item) => String(item.nameAr || item.name || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 6);

    if (names.length === 0) {
      if (merchantCategory === MerchantCategory.CLOTHES) {
        return "أكيد 🙌 إحنا متجر ملابس. اكتب نوع القطعة اللي محتاجها (مثلاً بنطلون/تيشيرت) وأنا أرشح لك بسرعة.";
      }
      if (merchantCategory === MerchantCategory.FOOD) {
        return "أكيد 🙌 إحنا مطعم/أكل. اكتب اسم الصنف اللي محتاجه وأنا أساعدك فوراً.";
      }
      if (merchantCategory === MerchantCategory.SUPERMARKET) {
        return "أكيد 🙌 إحنا سوبرماركت. اكتب نوع المنتج اللي محتاجه وأنا أساعدك تختار.";
      }
      return "أكيد 🙌 عندنا منتجات متنوعة. اكتب اسم المنتج اللي بتدور عليه وأنا أساعدك فوراً.";
    }

    return `أكيد 🙌 عندنا: ${names.join("، ")}.\nتحب أساعدك تختار أنسب حاجة؟`;
  }

  private buildCartContentsReply(
    context: LlmContext,
    currentState: ConversationState,
  ): string {
    if (currentState.confirmedItems.length === 0) {
      return "سلتك فاضية، بتدور على إيه؟";
    }

    const lines = currentState.confirmedItems.map((item) => {
      const catalogItem = this.findCatalogItemByReference(
        context.catalogItems,
        item.name,
      );
      const name =
        catalogItem?.nameAr ||
        this.getCanonicalCatalogLabel(
          context.catalogItems,
          item.name,
          item.name,
        ) ||
        item.name;
      const unitPrice = Number(catalogItem?.basePrice || 0);
      const variantLabel = item.variant ? ` (${item.variant})` : "";
      const total = unitPrice > 0 ? unitPrice * item.quantity : null;

      return total !== null
        ? `- ${name}${variantLabel} × ${item.quantity} = ${total} جنيه`
        : `- ${name}${variantLabel} × ${item.quantity}`;
    });

    const total = currentState.confirmedItems.reduce((sum, item) => {
      const catalogItem = this.findCatalogItemByReference(
        context.catalogItems,
        item.name,
      );
      return sum + Number(catalogItem?.basePrice || 0) * item.quantity;
    }, 0);

    return total > 0
      ? `في السلة حالياً:\n${lines.join("\n")}\nالإجمالي الحالي: ${total} جنيه.`
      : `في السلة حالياً:\n${lines.join("\n")}`;
  }

  private createFallbackResponse(
    context: LlmContext,
    reason: FallbackReason = "openai_error",
  ): LlmResult {
    const {
      merchant,
      conversation,
      customerMessage,
      catalogItems,
      recentMessages,
    } = context;
    const messageLower = String(customerMessage || "").toLowerCase();
    const previousState = this.extractConversationState(recentMessages);
    const currentState = this.extractConversationState(
      this.buildStateMessages(recentMessages, conversation, customerMessage),
    );
    const productHint = this.getCanonicalCatalogLabel(
      catalogItems,
      this.extractProductHint(messageLower, catalogItems) ||
        this.extractProductHintFromHistory(recentMessages, catalogItems) ||
        conversation.cart.items?.[0]?.name ||
        null,
      this.extractProductHint(messageLower, catalogItems) ||
        this.extractProductHintFromHistory(recentMessages, catalogItems) ||
        conversation.cart.items?.[0]?.name ||
        null,
    );
    const directQuestion = this.classifyCustomerQuestion(customerMessage);

    logger.warn("Using fallback response", {
      reason,
      state: conversation.state,
      missingSlotsCount: conversation.missingSlots.length,
    });

    // Determine fallback action based on state
    let reply =
      "تمام 🙌 قولي نوع المنتج أو الطلب اللي محتاجه وأنا أكمل معاك خطوة بخطوة.";
    const actionType = ActionType.ASK_CLARIFYING_QUESTION;

    if (directQuestion) {
      reply =
        this.buildDirectQuestionAnswer(directQuestion, context, currentState, {
          actionType,
          reply_ar: "",
          confidence: 0.5,
          extracted_entities: null,
          missing_slots: null,
          negotiation: null,
          reasoning: `fallback_reason:${reason}`,
          delivery_fee: null,
        }) || reply;
    } else if (this.isCartContentsInquiryMessage(customerMessage)) {
      reply = this.buildCartContentsReply(context, currentState);
    } else if (this.isCatalogInquiryMessage(messageLower)) {
      reply = this.buildFallbackCatalogReply(catalogItems, merchant.category);
    } else if (currentState.stage === "item_confirmation") {
      reply =
        this.buildStageProgressReply(context, previousState, currentState, {
          actionType,
          reply_ar: "",
          confidence: 0.5,
          extracted_entities: null,
          missing_slots: null,
          negotiation: null,
          reasoning: `fallback_reason:${reason}`,
          delivery_fee: null,
        }) || reply;
    } else if (currentState.stage === "delivery") {
      reply =
        currentState.lastAskedFor === "address"
          ? "خد وقتك، لما تجهز العنوان قولي 😊"
          : "تمام. ابعتلي عنوان التوصيل بالتفصيل مرة واحدة وأنا أكمل معاك.";
    } else if (currentState.stage === "payment") {
      reply =
        currentState.lastAskedFor === "payment"
          ? "خد وقتك، ولما تحدد طريقة الدفع قولي وأنا أكمل الطلب."
          : "تمام. تحب تدفع كاش عند الاستلام ولا أونلاين؟";
    } else if (conversation.missingSlots.length > 0) {
      const slot = conversation.missingSlots[0];
      const questions: Record<string, string> = {
        product: ARABIC_TEMPLATES.ASK_PRODUCT,
        quantity: ARABIC_TEMPLATES.ASK_QUANTITY,
        customer_name: ARABIC_TEMPLATES.ASK_NAME,
        phone: ARABIC_TEMPLATES.ASK_PHONE,
        address_city: ARABIC_TEMPLATES.ASK_ADDRESS_CITY,
        address_area: ARABIC_TEMPLATES.ASK_ADDRESS_AREA,
      };
      if (slot === "product" && productHint) {
        reply = this.buildFallbackOrderProgressReply(productHint);
      } else {
        reply = questions[slot] || ARABIC_TEMPLATES.FALLBACK;
      }
    } else if (productHint) {
      reply = this.buildFallbackOrderProgressReply(productHint);
    } else if (this.isOrderIntentMessage(messageLower)) {
      reply = productHint
        ? this.buildFallbackOrderProgressReply(productHint)
        : ARABIC_TEMPLATES.ASK_PRODUCT;
    } else if (/السلام\s*عليكم|اهلا|أهلا|مرحبا|هاي|hello/i.test(messageLower)) {
      reply = "أهلاً! كيف أقدر أساعدك اليوم؟ 😊";
    }

    const lastOutbound = [...recentMessages]
      .reverse()
      .find(
        (msg) =>
          String((msg as any).direction || "").toLowerCase() === "outbound",
      );
    if (
      lastOutbound &&
      String(lastOutbound.text || "").trim() === String(reply).trim()
    ) {
      if (this.isCatalogInquiryMessage(messageLower)) {
        reply = this.buildFallbackCatalogReply(catalogItems, merchant.category);
      } else if (productHint) {
        reply = `تمام 👌 سجلت ${productHint}. آخر خطوة: ابعت الكمية المطلوبة (مثلاً 1 أو 2).`;
      } else {
        reply =
          "تمام 🙌 ابعت اسم المنتج أو النوع اللي محتاجه وأنا أكمل معاك خطوة بخطوة.";
      }
    }

    return {
      response: {
        actionType,
        reply_ar: reply,
        confidence: 0.5,
        extracted_entities: null,
        missing_slots: conversation.missingSlots,
        negotiation: null,
        reasoning: `fallback_reason:${reason}`,
        delivery_fee: null,
      },
      tokensUsed: 0,
      llmUsed: false,
      conversationState: currentState,
    };
  }

  private createAiUnavailableResponse(context: LlmContext): LlmResult {
    const { conversation } = context;

    return {
      response: {
        actionType: ActionType.ASK_CLARIFYING_QUESTION,
        reply_ar:
          "ميزة الذكاء الاصطناعي غير مفعّلة حالياً. فعّل مفتاح OPENAI_API_KEY لتشغيل ردود AI الحقيقية.",
        confidence: 0.0,
        extracted_entities: null,
        missing_slots: conversation.missingSlots,
        negotiation: null,
        reasoning: null,
        delivery_fee: null,
      },
      tokensUsed: 0,
      llmUsed: false,
    };
  }
}
