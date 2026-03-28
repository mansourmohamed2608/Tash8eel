import { Injectable, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from "zod";
import { createLogger } from "../../shared/logging/logger";
import { MERCHANT_REPOSITORY, IMerchantRepository } from "../../domain/ports";
import { AiMetricsService } from "../../shared/services/ai-metrics.service";
import { NotificationsService } from "../services/notifications.service";
import { MerchantContextService } from "./merchant-context.service";
import { getTodayDate } from "../../shared/utils/helpers";
import { UsageGuardService } from "../services/usage-guard.service";

const logger = createLogger("InventoryAiService");

// ============= Zod Schemas for AI Responses =============

export const SubstitutionRankingSchema = z.object({
  rankings: z.array(
    z.object({
      variantId: z.string(),
      rank: z.number().min(1).max(10),
      reasonAr: z.string(),
      reasonEn: z.string(),
    }),
  ),
  customerMessageAr: z.string(),
  merchantMessageAr: z.string(),
});

export const RestockInsightSchema = z.object({
  explanationAr: z.string(),
  explanationEn: z.string(),
  suggestedActions: z.array(
    z.object({
      actionType: z.enum([
        "reorder_urgent",
        "reorder_normal",
        "push_promotion",
        "adjust_price",
        "bundle_product",
      ]),
      descriptionAr: z.string(),
      descriptionEn: z.string(),
      priority: z.number().min(1).max(5),
    }),
  ),
  supplierMessageDraftAr: z.string().optional(),
});

export const SupplierMessageSchema = z.object({
  messageAr: z.string(),
  subject: z.string().optional(),
});

export type SubstitutionRanking = z.infer<typeof SubstitutionRankingSchema>;
export type RestockInsight = z.infer<typeof RestockInsightSchema>;
export type SupplierMessage = z.infer<typeof SupplierMessageSchema>;

// ============= Request/Response Types =============

export interface SubstitutionRankingRequest {
  merchantId: string;
  originalProduct: {
    sku: string;
    name: string;
    price: number;
    category: string;
  };
  alternatives: Array<{
    variantId: string;
    sku: string;
    name: string;
    price: number;
    quantityAvailable: number;
  }>;
}

export interface RestockInsightRequest {
  merchantId: string;
  product: {
    sku: string;
    name: string;
    currentQuantity: number;
    recommendedQuantity: number;
    avgDailySales: number;
    daysUntilStockout: number;
    urgency: "critical" | "high" | "medium" | "low";
  };
}

export interface SupplierMessageRequest {
  merchantId: string;
  merchantName: string;
  products: Array<{
    sku: string;
    name: string;
    quantity: number;
    urgency: string;
  }>;
  supplierName?: string;
}

export interface SupplierDiscoveryRequest {
  merchantId: string;
  merchantName: string;
  query: string;
  merchantCity: string;
  branchName?: string;
  locationAddress?: string;
}

// ============= Service =============

@Injectable()
export class InventoryAiService {
  private client: OpenAI;
  private model: string;
  /** Circuit breaker: when OpenAI returns 429, stop calling until this timestamp */
  private quotaBlockedUntil = 0;
  /** Throttle: only send one OpenAI-429 notification per merchant per hour */
  private readonly quotaNotifiedAt = new Map<string, number>();
  /** Throttle: only send one budget-exhausted notification per merchant per hour */
  private readonly budgetNotifiedAt = new Map<string, number>();

  constructor(
    private configService: ConfigService,
    @Inject(MERCHANT_REPOSITORY)
    private merchantRepository: IMerchantRepository,
    private readonly contextService: MerchantContextService,
    private readonly aiMetrics: AiMetricsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly usageGuard: UsageGuardService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
    this.model = this.configService.get<string>("OPENAI_MODEL", "gpt-4o-mini");
  }

  /** Returns true if OpenAI quota is currently blocked (429 circuit breaker) */
  isQuotaBlocked(): boolean {
    return Date.now() < this.quotaBlockedUntil;
  }

  /** Fire one SYSTEM_ALERT when the platform's OpenAI API key returns 429 (external quota). Admin issue. */
  private fireOpenAiQuotaNotification(merchantId: string): void {
    const now = Date.now();
    const last = this.quotaNotifiedAt.get(merchantId) || 0;
    if (now - last < 60 * 60 * 1000) return; // already notified in the last hour
    this.quotaNotifiedAt.set(merchantId, now);
    void this.notificationsService
      .create({
        merchantId,
        type: "SYSTEM_ALERT",
        title: "⚠️ OpenAI API quota exhausted",
        titleAr: "⚠️ تنبيه: نفدت حصة OpenAI API",
        message:
          "The OpenAI API key returned a 429 error — the platform's external AI quota is exhausted. AI-powered inventory features are temporarily paused. Please check the OpenAI billing dashboard.",
        messageAr:
          "مفتاح OpenAI API أعاد خطأ 429 — نفدت حصة الذكاء الاصطناعي الخارجية. ميزات المخزون الذكية متوقفة مؤقتاً. تحقق من لوحة الفوترة على OpenAI.",
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

  /** Fire one SYSTEM_ALERT when THIS merchant's daily token budget is consumed. Merchant issue. */
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
          "Your daily AI token budget has been fully consumed. AI-powered inventory features will be unavailable until midnight when the quota resets automatically.",
        messageAr:
          "استنفدت حصتك اليومية من رصيد الذكاء الاصطناعي. ميزات المخزون الذكية غير متاحة حتى منتصف الليل حين تتجدد الحصة تلقائياً.",
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

  private async checkAndDeductBudget(
    merchantId: string,
    estimatedTokens: number,
  ): Promise<boolean> {
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) {
      logger.warn("Merchant not found for budget check", { merchantId });
      return false;
    }

    const usage = await this.merchantRepository.getTokenUsage(
      merchantId,
      getTodayDate(),
    );
    const used = usage?.tokensUsed || 0;
    const budget = merchant.dailyTokenBudget;
    const remaining = budget - used;

    if (remaining < estimatedTokens) {
      logger.warn("Token budget insufficient", {
        merchantId,
        remaining,
        needed: estimatedTokens,
      });
      return false;
    }

    return true;
  }

  private async recordUsage(
    merchantId: string,
    tokensUsed: number,
  ): Promise<void> {
    await this.merchantRepository.incrementTokenUsage(
      merchantId,
      getTodayDate(),
      tokensUsed,
    );
  }

  private buildKnowledgeBaseSummary(
    knowledgeBase?: Record<string, any>,
  ): string {
    if (!knowledgeBase) return "";

    const info = knowledgeBase.businessInfo || {};
    const lines: string[] = [];

    if (info.name) lines.push(`- اسم النشاط: ${info.name}`);
    if (info.category) lines.push(`- نوع النشاط: ${info.category}`);
    if (info.policies?.deliveryInfo)
      lines.push(`- معلومات التوصيل: ${info.policies.deliveryInfo}`);
    if (info.policies?.paymentMethods?.length) {
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
        .slice(0, 5)
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
          .slice(0, 3)
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
          .slice(0, 3)
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

  private async getKnowledgeBaseSummary(merchantId: string): Promise<string> {
    const merchant = await this.merchantRepository.findById(merchantId);
    return this.buildKnowledgeBaseSummary(merchant?.knowledgeBase);
  }

  async generateSubstitutionRanking(
    request: SubstitutionRankingRequest,
  ): Promise<
    | { success: true; data: SubstitutionRanking; tokensUsed: number }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: "AI_NOT_ENABLED" };
    }
    if (this.isQuotaBlocked()) {
      return { success: false, error: "AI_QUOTA_EXHAUSTED" };
    }

    const { merchantId, originalProduct, alternatives } = request;
    const estimatedTokens = 500;
    const knowledgeBaseSummary = await this.getKnowledgeBaseSummary(merchantId);

    if (!(await this.checkAndDeductBudget(merchantId, estimatedTokens))) {
      this.fireBudgetExhaustedNotification(merchantId);
      return { success: false, error: "Token budget exceeded" };
    }

    try {
      const prompt = `أنت خبير في التجارة الإلكترونية المصرية ومتخصص في إدارة تجربة العميل عند نفاد المنتجات.

العميل طلب "${originalProduct.name}" (${originalProduct.sku}) بسعر ${originalProduct.price} جنيه لكن المنتج غير متوفر حالياً.

=== معلومات النشاط ===
${knowledgeBaseSummary || "لا توجد معلومات إضافية."}

=== البدائل المتاحة ===
${alternatives.map((a, i) => `${i + 1}. ${a.name} (${a.sku}) - ${a.price} جنيه - متوفر: ${a.quantityAvailable} قطعة`).join("\n")}

=== معايير ترتيب البدائل (بالأولوية) ===
1. تشابه المنتج: أقرب بديل في الوظيفة والمواصفات للمنتج الأصلي
2. فرق السعر: المصريين حساسين للسعر - البديل الأقرب في السعر أفضل
   - فرق ±10% = ممتاز
   - فرق ±25% = مقبول مع تبرير
   - فرق >25% = يحتاج إقناع قوي
3. التوفر: المنتج الأكثر توفراً أفضل (أقل خطر نفاد)
4. القيمة مقابل السعر: لو البديل أغلى لكن يقدم ميزات إضافية، وضح ذلك

=== أنماط الاستبدال الشائعة في السوق المصري ===
- الملابس: نفس المقاس ولون قريب أهم من الماركة
- الإلكترونيات: نفس المواصفات التقنية أهم من الشكل
- منتجات العناية: نفس المكونات الفعالة أهم من الماركة
- الأطعمة: نفس النوع والحجم والطعم

=== المطلوب ===
1. ترتيب البدائل من الأفضل للأقل مع سبب واضح بالعربية والإنجليزية
2. رسالة للعميل بالعامية المصرية (ودية ومقنعة) تقترح أفضل 2-3 بدائل - خلي العميل يحس إنك بتساعده مش بتضغط عليه
3. رسالة للتاجر (مهنية) توضح البدائل المقترحة وسبب الترتيب`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "أنت مساعد تجارة إلكترونية. ترد بـ JSON فقط.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.7,
      });

      const tokensUsed = response.usage?.total_tokens || 0;
      await this.recordUsage(merchantId, tokensUsed);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "Empty response from AI" };
      }

      const parsed = JSON.parse(content);
      const validated = SubstitutionRankingSchema.parse(parsed);

      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "rankSubstitutions",
        merchantId,
        outcome: "success",
        tokensUsed,
      });
      logger.info("Substitution ranking generated", {
        merchantId,
        tokensUsed,
        alternativesCount: alternatives.length,
      });

      return { success: true, data: validated, tokensUsed };
    } catch (error) {
      const err = error as any;
      logger.error("Failed to generate substitution ranking", err, {
        merchantId,
      });
      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "rankSubstitutions",
        merchantId,
        outcome: "error",
      });
      if (err?.status === 429 || err?.message?.includes("429")) {
        this.quotaBlockedUntil = Date.now() + 5 * 60 * 1000;
        this.fireOpenAiQuotaNotification(merchantId);
        return { success: false, error: "AI_QUOTA_EXHAUSTED" };
      }
      return { success: false, error: "AI_TEMPORARILY_UNAVAILABLE" };
    }
  }

  async generateRestockInsight(
    request: RestockInsightRequest,
  ): Promise<
    | { success: true; data: RestockInsight; tokensUsed: number }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: "AI_NOT_ENABLED" };
    }
    if (this.isQuotaBlocked()) {
      return { success: false, error: "AI_QUOTA_EXHAUSTED" };
    }

    const { merchantId, product } = request;
    const estimatedTokens = 400;
    const knowledgeBaseSummary = await this.getKnowledgeBaseSummary(merchantId);

    // Fetch order + finance context so AI can factor in demand & margins
    let liveContext = "";
    try {
      liveContext = await this.contextService.buildContextSummary(merchantId, {
        includeOrders: true,
        includeFinance: true,
      });
    } catch (err) {
      logger.warn("Failed to fetch live context for restock", err);
    }

    if (!(await this.checkAndDeductBudget(merchantId, estimatedTokens))) {
      this.fireBudgetExhaustedNotification(merchantId);
      return { success: false, error: "Token budget exceeded" };
    }

    try {
      const prompt = `أنت خبير في إدارة المخزون للتجارة الإلكترونية المصرية مع خبرة في أنماط الطلب الموسمية.

=== معلومات النشاط ===
${knowledgeBaseSummary || "لا توجد معلومات إضافية."}

${liveContext ? `=== بيانات النظام الحية ===\n${liveContext}\n` : ""}
=== بيانات المنتج ===
المنتج: ${product.name} (${product.sku})
- الكمية الحالية: ${product.currentQuantity} قطعة
- الكمية المُوصى بها: ${product.recommendedQuantity} قطعة
- متوسط المبيعات اليومية: ${product.avgDailySales} قطعة
- الأيام المتبقية قبل نفاد المخزون: ${product.daysUntilStockout} يوم
- مستوى الإلحاح: ${product.urgency}

=== سياق السوق المصري (ضعه في الاعتبار) ===
- مواسم الذروة: رمضان (زيادة 40-60% في الأطعمة والملابس)، عيد الفطر/الأضحى، الجمعة البيضاء (نوفمبر)، عيد الأم (مارس)، بداية المدارس (سبتمبر)
- أوقات الركود: يناير-فبراير عادةً أقل مبيعاً
- المورّدين المصريين يحتاجون عادة 3-7 أيام عمل للتوريد المحلي
- الاستيراد قد يستغرق 2-4 أسابيع مع مراعاة الجمارك
- تأخيرات التوريد شائعة في مواسم الذروة - اطلب مبكراً

=== المطلوب ===
1. شرح واضح بالعربية والإنجليزية عن الموقف الحالي وخطورته
2. إجراءات مقترحة مرتبة بالأولوية (مع مراعاة التوقيت الموسمي)
   - إعادة طلب عادي أو عاجل
   - تعديل السعر لتبطيء المبيعات لو المخزون ناقص
   - عمل bundle مع منتجات بطيئة الحركة
   - عرض ترويجي لو المخزون زيادة
3. مسودة رسالة للمورد بالعربية (رسمية ومحترفة) تشمل: الكميات المطلوبة، الإلحاح، وطلب تأكيد موعد التسليم`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: "أنت مستشار مخزون. ترد بـ JSON فقط." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.7,
      });

      const tokensUsed = response.usage?.total_tokens || 0;
      await this.recordUsage(merchantId, tokensUsed);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "Empty response from AI" };
      }

      const parsed = JSON.parse(content);
      const validated = RestockInsightSchema.parse(parsed);

      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "generateRestockInsight",
        merchantId,
        outcome: "success",
        tokensUsed,
      });
      logger.info("Restock insight generated", {
        merchantId,
        tokensUsed,
        sku: product.sku,
      });

      return { success: true, data: validated, tokensUsed };
    } catch (error) {
      const err = error as any;
      logger.error("Failed to generate restock insight", err, { merchantId });
      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "generateRestockInsight",
        merchantId,
        outcome: "error",
      });
      // Circuit breaker: block further calls for 5 minutes on 429
      if (err?.status === 429 || err?.message?.includes("429")) {
        this.quotaBlockedUntil = Date.now() + 5 * 60 * 1000;
        this.fireOpenAiQuotaNotification(merchantId);
        return { success: false, error: "AI_QUOTA_EXHAUSTED" };
      }
      return { success: false, error: "AI_TEMPORARILY_UNAVAILABLE" };
    }
  }

  async generateSupplierMessage(
    request: SupplierMessageRequest,
  ): Promise<
    | { success: true; data: SupplierMessage; tokensUsed: number }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: "AI_NOT_ENABLED" };
    }
    if (this.isQuotaBlocked()) {
      return { success: false, error: "AI_QUOTA_EXHAUSTED" };
    }

    const { merchantId, merchantName, products, supplierName } = request;
    const estimatedTokens = 300;
    const knowledgeBaseSummary = await this.getKnowledgeBaseSummary(merchantId);

    if (!(await this.checkAndDeductBudget(merchantId, estimatedTokens))) {
      this.fireBudgetExhaustedNotification(merchantId);
      return { success: false, error: "Token budget exceeded" };
    }

    try {
      const criticalItems = products.filter((p) => p.urgency === "critical");
      const warningItems = products.filter((p) => p.urgency !== "critical");
      const urgencyNote =
        criticalItems.length > 0
          ? `⚠️ ${criticalItems.length} منتج نفد تماماً (كمية = 0) ويحتاج توريد عاجل.`
          : "";

      const productsList = products
        .map(
          (p) =>
            `- ${p.name} (${p.sku}): ${p.quantity} قطعة متوفرة ${p.urgency === "critical" ? "⚠️ نفد – عاجل جداً" : "🟠 منخفض"}`,
        )
        .join("\n");

      const prompt = `أنت مساعد ذكاء اصطناعي لإدارة المخزون في منشأة تجارية عربية.
مهمتك: كتابة رسالة واتساب تجارية رسمية وفعّالة باللغة العربية الفصحى المحكية.

المرسِل: ${merchantName}
المستقبِل (المورّد): ${supplierName || "المورد الكريم"}

${urgencyNote}

المنتجات المطلوبة:
${productsList}

معلومات إضافية عن النشاط التجاري:
${knowledgeBaseSummary || "لا توجد معلومات إضافية."}

متطلبات الرسالة:
1. ابدأ بتحية احترافية مخصصة للمورد
2. وضّح الغرض مباشرة (طلب إعادة تزويد عاجل / اعتيادي)
3. اذكر كل منتج مع الكمية الحالية ومقترح الكمية المطلوبة (ضاعف كمية الطلب الأدنى × 2 إذا لم يُحدد)
4. اطلب تأكيد: التوفر، السعر النهائي، موعد التسليم المتوقع
5. أضف طلباً لاقتراح بديل إن لم يكن المنتج متوفراً
6. اختم بشكر وتوقع رد سريع
7. الطول المناسب: 150-250 كلمة. لا تكتب أقل.
8. لا تتضمن أرقام مرجعية وهمية أو أسماء موظفين

رُد بـ JSON فقط بهذا الشكل:
{"messageAr": "...نص الرسالة الكامل..."}`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "أنت كاتب رسائل تجارية محترف متخصص في قطاع التجزئة والتوريد. ترد بـ JSON فقط دون أي نص خارجه.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.7,
      });

      const tokensUsed = response.usage?.total_tokens || 0;
      await this.recordUsage(merchantId, tokensUsed);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "Empty response from AI" };
      }

      const parsed = JSON.parse(content);
      const validated = SupplierMessageSchema.parse(parsed);

      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "generateSupplierMessage",
        merchantId,
        outcome: "success",
        tokensUsed,
      });
      logger.info("Supplier message generated", {
        merchantId,
        tokensUsed,
        productsCount: products.length,
      });

      return { success: true, data: validated, tokensUsed };
    } catch (error) {
      const err = error as any;
      logger.error("Failed to generate supplier message", err, { merchantId });
      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "generateSupplierMessage",
        merchantId,
        outcome: "error",
      });
      if (err?.status === 429 || err?.message?.includes("429")) {
        this.quotaBlockedUntil = Date.now() + 5 * 60 * 1000;
        this.fireOpenAiQuotaNotification(merchantId);
        return { success: false, error: "AI_QUOTA_EXHAUSTED" };
      }
      return { success: false, error: "AI_TEMPORARILY_UNAVAILABLE" };
    }
  }

  async discoverSuppliers(
    request: SupplierDiscoveryRequest,
  ): Promise<
    | { success: true; data: any[]; tokensUsed: number }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: "AI_NOT_ENABLED" };
    }
    if (this.isQuotaBlocked()) {
      return { success: false, error: "AI_QUOTA_EXHAUSTED" };
    }

    const {
      merchantId,
      merchantName,
      query,
      merchantCity,
      branchName,
      locationAddress,
    } = request;

    const tokenCheck = await this.usageGuard.checkLimit(merchantId, "TOKENS");
    if (!tokenCheck.allowed) {
      this.fireBudgetExhaustedNotification(merchantId);
      return { success: false, error: "Token budget exceeded" };
    }

    const aiCallCheck = await this.usageGuard.consume(
      merchantId,
      "AI_CALLS",
      1,
      {
        metadata: {
          source: "SUPPLIER_DISCOVERY",
        },
      },
    );
    if (!aiCallCheck.allowed) {
      return { success: false, error: "AI_QUOTA_EXHAUSTED" };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد تجاري متخصص في اكتشاف الموردين في المملكة العربية السعودية والمنطقة العربية. أجب دائماً بـ JSON.",
          },
          {
            role: "user",
            content: `بحث عن موردين لـ: "${query}"
تاجر: ${merchantName} في ${merchantCity}
الفرع المرجعي: ${branchName ?? "غير محدد"}
عنوان الاستلام أو الفرع الرسمي: ${locationAddress ?? "غير محدد"}

أعطني 5 اقتراحات لموردين محتملين (شركات حقيقية أو أنواع من الموردين) مع:
- name: الاسم
- type: النوع (مصنّع / موزّع / تاجر جملة)
- region: المنطقة الجغرافية
- qualityTier: (premium/standard/budget)
- searchTip: كيف يبحث عنهم (مثلاً اسم الشركة على Google)
- notes: ملاحظة مفيدة

أجب بـ: { "suppliers": [ ... ] }`,
          },
        ],
        max_tokens: 800,
      });

      const tokensUsed = response.usage?.total_tokens || 0;
      if (tokensUsed > 0) {
        await this.usageGuard.consume(merchantId, "TOKENS", tokensUsed, {
          metadata: {
            source: "SUPPLIER_DISCOVERY",
          },
        });
      }

      const content = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      const suppliers = Array.isArray(parsed.suppliers) ? parsed.suppliers : [];

      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "discoverSuppliers",
        merchantId,
        outcome: "success",
        tokensUsed,
      });

      return { success: true, data: suppliers, tokensUsed };
    } catch (error) {
      const err = error as any;
      logger.error("Failed to discover suppliers", err, { merchantId, query });
      void this.aiMetrics.record({
        serviceName: "InventoryAiService",
        methodName: "discoverSuppliers",
        merchantId,
        outcome: "error",
      });
      if (err?.status === 429 || err?.message?.includes("429")) {
        this.quotaBlockedUntil = Date.now() + 5 * 60 * 1000;
        this.fireOpenAiQuotaNotification(merchantId);
        return { success: false, error: "AI_QUOTA_EXHAUSTED" };
      }
      return { success: false, error: "AI_TEMPORARILY_UNAVAILABLE" };
    }
  }

  isConfigured(): boolean {
    return !!this.client && !this.isQuotaBlocked();
  }

  async getTokenUsage(
    merchantId: string,
  ): Promise<{ tokensUsed: number; budget: number; remaining: number }> {
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) {
      return { tokensUsed: 0, budget: 0, remaining: 0 };
    }

    const usage = await this.merchantRepository.getTokenUsage(
      merchantId,
      getTodayDate(),
    );
    const tokensUsed = usage?.tokensUsed || 0;
    const budget = merchant.dailyTokenBudget;

    return {
      tokensUsed,
      budget,
      remaining: Math.max(0, budget - tokensUsed),
    };
  }
}
