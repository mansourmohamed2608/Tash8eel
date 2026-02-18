import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { MERCHANT_REPOSITORY, IMerchantRepository } from "../../domain/ports";
import { Merchant } from "../../domain/entities/merchant.entity";
import { MerchantContextService } from "./merchant-context.service";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("MerchantAssistantService");

export interface AssistantMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

@Injectable()
export class MerchantAssistantService {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private isTestMode: boolean;

  constructor(
    private configService: ConfigService,
    @Inject(MERCHANT_REPOSITORY)
    private merchantRepository: IMerchantRepository,
    private readonly contextService: MerchantContextService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY") || "";
    this.isTestMode =
      !apiKey ||
      apiKey.startsWith("sk-test-") ||
      apiKey.startsWith("sk-dummy-") ||
      apiKey.includes("dummy") ||
      (process.env.NODE_ENV === "test" && !apiKey.startsWith("sk-proj-"));

    this.client = new OpenAI({ apiKey });
    this.model = this.configService.get<string>("OPENAI_MODEL", "gpt-4o-mini");
    this.maxTokens = parseInt(
      this.configService.get<string>("OPENAI_MAX_TOKENS", "1024"),
      10,
    );
  }

  async chat(
    merchantId: string,
    message: string,
    history: AssistantMessage[] = [],
  ) {
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) {
      throw new Error("Merchant not found");
    }

    const systemPrompt = this.buildSystemPrompt(merchant);

    // Fetch real cross-system data for the AI context
    let liveDataBlock = "";
    try {
      liveDataBlock = await this.contextService.buildContextSummary(
        merchantId,
        {
          includeOrders: true,
          includeInventory: true,
          includeFinance: true,
          includeCustomers: true,
          includeConversations: true,
          includeDrivers: true,
        },
      );
    } catch (err) {
      logger.warn("Failed to fetch live context, continuing without it", err);
    }

    const fullPrompt = liveDataBlock
      ? `${systemPrompt}\n\n=== بيانات النظام الحية (حقيقية) ===\n${liveDataBlock}`
      : systemPrompt;

    if (this.isTestMode) {
      return {
        reply: `تم استلام سؤالك. (وضع تجريبي) سؤالك كان: ${message}`,
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: fullPrompt },
          ...history,
          { role: "user", content: message },
        ],
        temperature: 0.4,
        max_tokens: this.maxTokens,
      });

      const reply =
        response.choices[0]?.message?.content?.trim() ||
        "لم أتمكن من توليد إجابة الآن.";
      return { reply };
    } catch (error: any) {
      logger.error("Assistant chat failed", error);
      return {
        reply:
          "تعذر الاتصال بالمساعد الذكي حالياً. يمكنك شراء/ترقية حزمة الذكاء الاصطناعي ثم إعادة المحاولة.",
      };
    }
  }

  private buildSystemPrompt(merchant: Merchant): string {
    const kbSummary = this.buildKnowledgeBaseSummary(merchant.knowledgeBase);
    const city = merchant.city || "غير محدد";
    const currency = merchant.currency || "EGP";
    const category = merchant.category || "عام";
    const name = merchant.name || "النشاط";

    return `أنت مساعد أعمال ذكي متخصص في التجارة الإلكترونية المصرية، تساعد التاجر في اتخاذ قرارات أفضل لنشاطه.

=== بيانات النشاط ===
اسم النشاط: "${name}"
الفئة: ${category}
المدينة: ${city}
العملة: ${currency}

=== معلومات من قاعدة المعرفة ===
${kbSummary || "لا توجد معلومات إضافية حالياً."}

=== البيانات المتاحة للتاجر في النظام ===
- الطلبات: عدد الطلبات، حالات الطلبات (جديد/قيد التجهيز/تم التسليم/مرتجع)، متوسط قيمة الطلب
- المخزون: المنتجات المتاحة، تنبيهات نفاد المخزون، بدائل المنتجات
- المالية: الإيرادات، المصاريف، هوامش الربح، تحصيل المبالغ (COD)
- العملاء: بيانات العملاء، عناوين التوصيل، سجل الطلبات

=== فهم السوق المصري ===
- العملة الأساسية هي الجنيه المصري (EGP)
- أغلب المعاملات تتم بالدفع عند الاستلام (COD) أو عبر InstaPay/فودافون كاش
- مواسم الذروة: رمضان، عيد الفطر، عيد الأضحى، الجمعة البيضاء (نوفمبر)، بداية المدارس (سبتمبر)
- التوصيل يشمل القاهرة الكبرى والمحافظات مع اختلاف التكاليف
- العملاء المصريون يفضلون التواصل عبر واتساب ويتوقعون ردود سريعة

=== أمثلة لأسئلة مفيدة يمكنك مساعدة التاجر فيها ===
- "إيه أكتر المنتجات مبيعاً الأسبوع ده؟"
- "إزاي أزود متوسط قيمة الطلب؟"
- "إيه المنتجات اللي قربت تخلص من المخزون؟"
- "إيه أفضل وقت أعمل فيه عرض؟"
- "إزاي أقلل نسبة المرتجعات؟"
- "هوامش الربح بتاعتي كويسة ولا محتاج أعدل الأسعار؟"

=== قواعد الرد ===
1) رد دائماً بالعربية الواضحة (يُفضل العامية المصرية عند الشرح).
2) لو المعلومة غير موجودة، قل ذلك بوضوح واقترح كيف يقدر التاجر يوفرها.
3) لا تخترع أرقام أو تفاصيل غير موجودة في قاعدة المعرفة أو بيانات التاجر.
4) إن كان السؤال عن المنتج/الخدمة، لخّصه بناءً على ما هو موجود فقط.
5) قدم نصائح عملية وقابلة للتنفيذ مع أرقام محددة كلما أمكن.
6) لو التاجر سأل عن شيء خارج نطاق التجارة، وجّهه بلطف للموضوع.
7) لا تستخدم ايموجي نهائيا في الردود. استخدم علامات الترقيم والتنسيق النصي فقط.
8) لو التاجر بيسأل عن مشكلة، اقترح حل عملي وليس فقط تشخيص.
`;
  }

  private buildKnowledgeBaseSummary(
    knowledgeBase?: Record<string, any>,
  ): string {
    if (!knowledgeBase) return "";

    const info = knowledgeBase.businessInfo || {};
    const parts: string[] = [];

    if (info.description) parts.push(`الوصف: ${info.description}`);
    if (info.phone) parts.push(`الهاتف: ${info.phone}`);
    if (info.whatsapp) parts.push(`واتساب: ${info.whatsapp}`);
    if (info.website) parts.push(`الموقع: ${info.website}`);
    if (info.address) parts.push(`العنوان: ${info.address}`);

    const policies = info.policies || {};
    if (policies.returnPolicy)
      parts.push(`سياسة الاسترجاع: ${policies.returnPolicy}`);
    if (policies.deliveryInfo)
      parts.push(`معلومات التوصيل: ${policies.deliveryInfo}`);
    if (
      Array.isArray(policies.paymentMethods) &&
      policies.paymentMethods.length > 0
    ) {
      parts.push(`طرق الدفع: ${policies.paymentMethods.join("، ")}`);
    }

    const deliveryPricing = info.deliveryPricing || {};
    if (
      deliveryPricing.mode === "UNIFIED" &&
      deliveryPricing.unifiedPrice !== undefined &&
      deliveryPricing.unifiedPrice !== null
    ) {
      parts.push(`سعر التوصيل الموحد: ${deliveryPricing.unifiedPrice}`);
    }
    if (
      deliveryPricing.mode === "BY_CITY" &&
      Array.isArray(deliveryPricing.byCity) &&
      deliveryPricing.byCity.length > 0
    ) {
      const cityLines = deliveryPricing.byCity
        .filter((entry: any) => entry?.area || entry?.city)
        .slice(0, 6)
        .map((entry: any) => `${entry.area || entry.city}: ${entry.price}`);
      if (cityLines.length > 0) {
        parts.push(`أسعار التوصيل حسب المنطقة: ${cityLines.join("، ")}`);
      }
    }
    if (deliveryPricing.notes)
      parts.push(`ملاحظات التوصيل: ${deliveryPricing.notes}`);

    const faqs = Array.isArray(knowledgeBase.faqs)
      ? knowledgeBase.faqs
          .filter((f: any) => f && f.isActive !== false)
          .slice(0, 5)
      : [];

    if (faqs.length > 0) {
      parts.push("أسئلة شائعة:");
      faqs.forEach((faq: any) => {
        parts.push(`- ${faq.question}: ${faq.answer}`);
      });
    }

    const offers = Array.isArray(knowledgeBase.offers)
      ? knowledgeBase.offers
          .filter((o: any) => o && o.isActive !== false)
          .slice(0, 5)
      : [];

    if (offers.length > 0) {
      parts.push("العروض الحالية:");
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
        parts.push(`- ${label}${value ? `: ${value}` : ""}${code}`);
      });
    }

    return parts.join("\n");
  }
}
