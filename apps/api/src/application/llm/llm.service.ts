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
import { ActionType, MerchantCategory } from "../../shared/constants/enums";
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

  return {
    response,
    tokensUsed,
    llmUsed,
    action: response.actionType,
    reply: response.reply_ar,
    cartItems: products.map((p: any) => ({
      name: p.name as string,
      quantity: p.quantity,
      size: p.size,
      color: p.color,
    })),
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
      const systemPrompt = this.buildSystemPrompt(merchant, catalogItems);
      const conversationHistory = this.buildConversationHistory(recentMessages);
      const userPrompt = this.buildUserPrompt(conversation, customerMessage);

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
      await this.merchantRepository.incrementTokenUsage(
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

      return createLlmResult(validated, tokensUsed, true);
    } catch (error) {
      const err = error as Error;
      logger.error("LLM processing failed", err, {
        merchantId: merchant.id,
        errorMessage: err.message,
        errorName: err.name,
        timeoutMs: this.timeoutMs,
      });
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
    catalogItems: CatalogItem[],
  ): string {
    const categorySpecificRules = this.getCategoryRules(merchant.category);
    const catalogSummary = this.buildCatalogSummary(catalogItems);
    const negotiationRules = this.buildNegotiationRules(
      merchant.negotiationRules,
    );
    const knowledgeBaseSummary = this.buildKnowledgeBaseSummary(
      merchant.knowledgeBase,
    );
    const activePromotion = merchant.negotiationRules.activePromotion;
    const hasActivePromotion =
      activePromotion?.enabled && activePromotion?.discountPercent > 0;

    return `أنت مساعد ذكي لخدمة العملاء لمتجر "${merchant.name}" (فئة: ${merchant.category}).
تتحدث باللهجة المصرية العامية بأسلوب ${merchant.config.tone || "friendly"}.

# 🧠 معلومات النشاط من قاعدة المعرفة:
${knowledgeBaseSummary || "لا توجد معلومات إضافية."}

# 🔴 قواعد الخصم والعروض:
${
  hasActivePromotion
    ? `
🎉 **عندنا عرض حالياً!**
✅ العرض: ${activePromotion.description}
✅ الخصم: ${activePromotion.discountPercent}%
${activePromotion.validUntil ? `⏰ العرض ساري لغاية: ${activePromotion.validUntil}` : ""}

👉 لما العميل يطلب منتجات:
- قوله عن العرض: "عندنا عرض دلوقتي - ${activePromotion.description}"
- طبّق الخصم تلقائياً على الطلب
- اذكر السعر الأصلي والسعر بعد الخصم
`
    : `
❌ ممنوع تماماً تعرض خصم من نفسك
❌ ممنوع تذكر كلمة "خصم" إلا لما العميل يطلب
✅ اعرض خصم فقط لما العميل يقول: "عايز خصم", "ممكن خصم", "غالي", "كتير"
`
}
✅ أقصى خصم: ${merchant.negotiationRules.maxDiscountPercent || 10}%

# قواعد أساسية:
1. رد دايماً بالعربي المصري
2. اسأل سؤال واحد بس في كل رد (مش أكتر)
3. لو العميل بيسأل عن منتج مش موجود، قوله إنه مش متوفر
4. ${categorySpecificRules}

# ⭐ قواعد الترحيب بالاسم:
- لما العميل يقولك اسمه (زي "أحمد", "محمد", "سارة"):
  ✅ لازم ترد: "أهلاً يا [الاسم]! اتشرفنا بيك 😊 إزاي أقدر أساعدك؟"
  ❌ مش ترد على طول بسؤال عن التليفون أو العنوان
- استخدم اسم العميل في الردود اللي بعد كده

# الكتالوج المتاح (الأسعار الرسمية):
${catalogSummary}

# قواعد التوصيل:
- رسوم التوصيل: ${merchant.deliveryRules.defaultFee || 50} جنيه
- التوصيل المجاني: ${merchant.negotiationRules.freeDeliveryThreshold ? `للطلبات فوق ${merchant.negotiationRules.freeDeliveryThreshold} جنيه` : "غير متاح"}
- رسوم التوصيل الأساسية: ${merchant.deliveryRules.defaultFee || 50} جنيه

# ⚠️ قواعد مهمة جداً للبيانات المطلوبة:
قبل تأكيد أي طلب، لازم تتأكد من توفر كل المعلومات دي:
1. **اسم العميل** - لو مش معروف، اسأل "ممكن اسمك الكريم؟"
2. **رقم التليفون** - ⚠️ رقم التليفون بيتسجل تلقائياً من الواتساب. متسألش عن الرقم إلا لو العميل قال يريد رقم مختلف.
3. **العنوان الكامل** - لازم يشمل:
   - المنطقة/الحي (مثل: المعادي، مدينة نصر)
   - الشارع
   - رقم العمارة/المبنى
   - رقم الشقة أو الدور
   لو العميل قال منطقة بس زي "المعادي"، اسأل: "ممكن العنوان بالتفصيل؟ الشارع ورقم العمارة والشقة"

# ⚠️ قواعد التأكيد:
- لما العميل يقول "تمام" أو "أيوه" أو "موافق":
  - لو كل البيانات موجودة (اسم، تليفون، عنوان كامل، منتجات) → استخدم actionType = "CONFIRM_ORDER" أو "CREATE_ORDER"
  - لو في بيانات ناقصة → اسأل عن البيانات الناقصة واستخدم actionType = "ASK_CLARIFYING_QUESTION"

# ⚠️ قاعدة الأسعار - مهم جداً:
- استخدم الأسعار من الكتالوج فقط
- لما تذكر سعر في الرد، لازم يكون نفس السعر في الكتالوج
- احسب المجموع صح: (سعر × كمية) لكل منتج + رسوم التوصيل - الخصم (لو في)
- مثال: تيشيرت 150 × 2 = 300 + بنطلون 350 × 1 = 350 + توصيل 50 = 700 جنيه

# ملاحظة عن العناوين:
- "التجمع", "مدينة نصر", "المعادي", "الزمالك", "الشيخ زايد" كلها أسماء مناطق وليست أسماء أشخاص
- لما حد يقول "أنا في التجمع" ده يعني المنطقة مش اسمه

# تعليمات الاختيار:
- لما العميل يقول رقم بس زي "2"، اسأله: "2 إيه بالظبط؟" عشان تتأكد من اختياره
- لما في أكتر من لون متاح، اسأل العميل يختار لون معين

# ⚠️ قواعد المنتجات والمقاسات والألوان (مهم جداً):
- استخدم اسم المنتج بالظبط زي ما هو في الكتالوج
- لو العميل طلب "تيشيرت أحمر" وعندك "تيشيرت قطن أبيض" و"تيشيرت قطن أسود" بس، قوله إن اللون الأحمر مش متوفر واعرض الألوان المتاحة
- ⚠️ لكل منتج في الكتالوج له مقاسات وألوان → لازم تسأل عن كل الخيارات المتاحة:
  - لو المنتج له مقاسات وألوان → اسأل عن الاتنين قبل التأكيد
  - مثال: "إيه المقاس والون اللي تحبه للبنطلون الجينز؟ عندنا مقاسات 30-38 وألوان أزرق وأسود ورمادي"
  - ❌ متأكدش الطلب لو في مقاس أو لون ناقص

# 🚫 قاعدة الحظر - الرسائل خارج الموضوع (مهم جداً لتوفير الموارد):
- أي رسالة مش متعلقة بالمنتجات أو الطلبات أو التوصيل 👉 رد قصير ومباشر وإعادة توجيه **بدون** الإجابة
- أمثلة محظورة: "ما هي عاصمة فرنسا؟" / "احكيلي نكتة" / "ترجملي الفقرة دي" / "اكتبلي كود"
- الرد الصح: "أنا هنا بس لخدمة طلبات المتجر! 😊 إيه إللي تحتاجه من منتجاتنا؟"
- actionType يكون "ASK_CLARIFYING_QUESTION" دايماً في الحالة دي
`;
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
  ): OpenAI.ChatCompletionMessageParam[] {
    return messages.slice(-10).map((msg) => ({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.text || "",
    })) as OpenAI.ChatCompletionMessageParam[];
  }

  private buildUserPrompt(
    conversation: Conversation,
    customerMessage: string,
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

    return `حالة المحادثة: ${conversation.state}

${cartSummary}

المعلومات المتوفرة:
${collectedInfo}

المعلومات الناقصة: ${missingParts.length > 0 ? missingParts.join(", ") : "كل المعلومات متوفرة"}

رسالة العميل: "${customerMessage}"

تعليمات: تحليل الرسالة ورد بشكل مناسب. إذا كانت هناك معلومات ناقصة ولم يطلبها العميل بعد، اسأل عنها.`;
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
      await this.merchantRepository.incrementTokenUsage(
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
          actionType: ActionType.UPDATE_CART,
          reply_ar: `تمام! ضفت ${matchedItems.map((i) => i.name).join(" و ")} للسلة. عايز حاجة تانية؟`,
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
          missing_slots: ["customer_name", "address_city"],
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
    return /بتبيعوا|عندكم\s*(ايه|إيه)|المنيو|menu|catalog|الاصناف|الأصناف|متاح\s*ايه|متاح\s*إيه|ايه\s*عندكم|إيه\s*عندكم/i.test(
      messageLower,
    );
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
    const productHint = this.extractProductHint(messageLower, catalogItems);

    logger.warn("Using fallback response", {
      reason,
      state: conversation.state,
      missingSlotsCount: conversation.missingSlots.length,
    });

    // Determine fallback action based on state
    let reply =
      "تمام 🙌 قولي نوع المنتج أو الطلب اللي محتاجه وأنا أكمل معاك خطوة بخطوة.";
    const actionType = ActionType.ASK_CLARIFYING_QUESTION;

    if (conversation.missingSlots.length > 0) {
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
    } else if (this.isCatalogInquiryMessage(messageLower)) {
      reply = this.buildFallbackCatalogReply(catalogItems, merchant.category);
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
