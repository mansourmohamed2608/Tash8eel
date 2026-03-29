import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from "zod";
import { createLogger } from "../../shared/logging/logger";
import { MERCHANT_REPOSITORY, IMerchantRepository } from "../../domain/ports";
import { AiMetricsService } from "../../shared/services/ai-metrics.service";
import { getTodayDate } from "../../shared/utils/helpers";

const logger = createLogger("OpsAiService");

// ============= Zod Schemas for AI Responses =============

export const LeadClassificationSchema = z.object({
  score: z.enum(["HOT", "WARM", "COLD"]),
  confidence: z.number().min(0).max(1),
  signals: z.object({
    intentStrength: z.number().min(0).max(10),
    priceEngagement: z.boolean(),
    cartValue: z.number(),
    messageCount: z.number(),
    isReturning: z.boolean(),
    urgencyWords: z.array(z.string()),
  }),
  reasonAr: z.string(),
  reasonEn: z.string(),
});

export const ObjectionClassificationSchema = z.object({
  objectionType: z.enum([
    "expensive",
    "trust",
    "product_quality",
    "delivery_cost",
    "thinking",
    "none",
  ]),
  confidence: z.number().min(0).max(1),
  suggestedResponseAr: z.string(),
  keywordsFound: z.array(z.string()),
});

export const NextBestActionSchema = z.object({
  actionType: z.enum([
    "followup",
    "ask_info",
    "offer_bundle",
    "offer_discount",
    "upsell",
    "takeover",
    "close_sale",
    "none",
  ]),
  priority: z.enum(["high", "medium", "low"]),
  descriptionAr: z.string(),
  descriptionEn: z.string(),
  delayHours: z.number().optional(),
  suggestedMessageAr: z.string().optional(),
});

export const OrderConfirmationSummarySchema = z.object({
  summaryAr: z.string(),
  summaryEn: z.string(),
  itemsList: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      price: z.number(),
    }),
  ),
  subtotal: z.number(),
  deliveryFee: z.number(),
  discount: z.number(),
  total: z.number(),
  address: z.string(),
  customerName: z.string().optional(),
  phone: z.string().optional(),
});

export type LeadClassification = z.infer<typeof LeadClassificationSchema>;
export type ObjectionClassification = z.infer<
  typeof ObjectionClassificationSchema
>;
export type NextBestAction = z.infer<typeof NextBestActionSchema>;
export type OrderConfirmationSummary = z.infer<
  typeof OrderConfirmationSummarySchema
>;

// ============= Request Types =============

export interface LeadScoringRequest {
  merchantId: string;
  conversationId: string;
  messageText: string;
  messageCount: number;
  cartValue: number;
  isReturningCustomer: boolean;
  previousOrderCount: number;
  priceAsked: boolean;
  intentKeywords: string[];
}

export interface ObjectionDetectionRequest {
  merchantId: string;
  conversationId: string;
  messageText: string;
  currentCart: any;
  deliveryFee?: number;
}

export interface NbaRequest {
  merchantId: string;
  conversationId: string;
  conversationState: string;
  leadScore: string;
  cartValue: number;
  missingSlots: string[];
  addressConfidence: number;
  lastIntent: string;
  messageCount: number;
  isHumanTakeover: boolean;
}

export interface OrderConfirmationRequest {
  merchantId: string;
  cart: {
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
    subtotal: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
  collectedInfo: {
    customerName?: string;
    phone?: string;
    address?: {
      city?: string;
      area?: string;
      street?: string;
      building?: string;
      landmark?: string;
    };
  };
}

// ============= Service =============

@Injectable()
export class OpsAiService {
  private client!: OpenAI;
  private model: string;

  constructor(
    private configService: ConfigService,
    @Inject(MERCHANT_REPOSITORY)
    private merchantRepository: IMerchantRepository,
    private readonly aiMetrics: AiMetricsService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
    this.model = this.configService.get<string>("OPENAI_MODEL", "gpt-4o-mini");
  }

  // ============= LEAD SCORING =============

  /**
   * Deterministic lead scoring based on signals
   * AI is only used for classification confidence and reasoning
   */
  calculateLeadScore(request: LeadScoringRequest): {
    score: "HOT" | "WARM" | "COLD";
    signals: Record<string, any>;
  } {
    const signals = {
      intentStrength: 0,
      priceEngagement: request.priceAsked,
      cartValue: request.cartValue,
      messageCount: request.messageCount,
      isReturning: request.isReturningCustomer,
      urgencyWords: [] as string[],
    };

    // Intent keywords scoring (Arabic)
    const hotKeywords = [
      "عايز",
      "محتاج",
      "ابعتلي",
      "اطلب",
      "خلاص",
      "اشتري",
      "النهاردة",
      "دلوقتي",
      "فوري",
    ];
    const warmKeywords = ["ممكن", "كام", "سعر", "عندكم", "فيه", "متوفر", "ايه"];
    const coldKeywords = ["بس", "هفكر", "مش متأكد", "بعدين", "لا"];

    const textLower = request.messageText.toLowerCase();

    hotKeywords.forEach((kw) => {
      if (textLower.includes(kw)) {
        signals.intentStrength += 2;
        signals.urgencyWords.push(kw);
      }
    });

    warmKeywords.forEach((kw) => {
      if (textLower.includes(kw)) signals.intentStrength += 1;
    });

    coldKeywords.forEach((kw) => {
      if (textLower.includes(kw)) signals.intentStrength -= 1;
    });

    // Calculate score deterministically
    let score: "HOT" | "WARM" | "COLD";
    let totalScore = 0;

    // Points system
    totalScore += signals.intentStrength;
    if (request.cartValue > 0) totalScore += 3;
    if (request.cartValue > 500) totalScore += 2;
    if (request.isReturningCustomer) totalScore += 3;
    if (request.previousOrderCount > 2) totalScore += 2;
    if (request.priceAsked) totalScore += 1;
    if (request.messageCount > 5) totalScore += 1;
    if (request.messageCount > 10) totalScore += 1;

    if (totalScore >= 8) {
      score = "HOT";
    } else if (totalScore >= 4) {
      score = "WARM";
    } else {
      score = "COLD";
    }

    return { score, signals };
  }

  // ============= OBJECTION DETECTION =============

  /**
   * Detect objection type from customer message (deterministic keyword matching)
   */
  detectObjection(messageText: string): ObjectionClassification {
    const text = messageText.toLowerCase();

    const objectionPatterns: Record<string, string[]> = {
      expensive: ["غالي", "غاليه", "سعر عالي", "مكلف", "كتير", "فلوس كتير"],
      trust: ["مش واثق", "خايف", "أول مرة", "ازاي اضمن", "ضمان", "مضمون"],
      product_quality: ["مش عاجبني", "مش حلو", "في أحسن", "جودة", "وحش"],
      delivery_cost: ["توصيل غالي", "الشحن", "رسوم التوصيل", "سعر التوصيل"],
      thinking: ["هفكر", "محتاج وقت", "مش دلوقتي", "بعدين", "شوية"],
    };

    let detectedType:
      | "expensive"
      | "trust"
      | "product_quality"
      | "delivery_cost"
      | "thinking"
      | "none" = "none";
    let maxMatches = 0;
    const keywordsFound: string[] = [];

    for (const [type, keywords] of Object.entries(objectionPatterns)) {
      const matches = keywords.filter((kw) => text.includes(kw));
      if (matches.length > maxMatches) {
        maxMatches = matches.length;
        detectedType = type as any;
        keywordsFound.push(...matches);
      }
    }

    const confidence = maxMatches > 0 ? Math.min(0.5 + maxMatches * 0.2, 1) : 0;

    return {
      objectionType: detectedType,
      confidence,
      suggestedResponseAr: "", // Will be filled from templates
      keywordsFound,
    };
  }

  // ============= NEXT BEST ACTION =============

  /**
   * Determine next best action based on conversation state (deterministic)
   */
  determineNextBestAction(request: NbaRequest): NextBestAction {
    const {
      conversationState,
      leadScore,
      cartValue,
      missingSlots,
      addressConfidence,
      messageCount,
      isHumanTakeover,
    } = request;

    // If human takeover, no AI action
    if (isHumanTakeover) {
      return {
        actionType: "none",
        priority: "low",
        descriptionAr: "المحادثة تحت إدارة بشرية",
        descriptionEn: "Conversation is under human management",
      };
    }

    // Priority: missing address info
    if (addressConfidence < 60 && missingSlots.includes("address")) {
      return {
        actionType: "ask_info",
        priority: "high",
        descriptionAr: "اسأل عن العنوان الكامل (الشارع/المبنى مفقود)",
        descriptionEn: "Ask for complete address (street/building missing)",
        suggestedMessageAr:
          "ممكن تبعتلي العنوان بالتفصيل؟ محتاج اسم الشارع ورقم المبنى",
      };
    }

    // High value cart but no order yet
    if (
      cartValue > 500 &&
      conversationState !== "ORDER_PLACED" &&
      leadScore === "HOT"
    ) {
      return {
        actionType: "close_sale",
        priority: "high",
        descriptionAr: "العميل جاهز للشراء - أكد الطلب",
        descriptionEn: "Customer ready to buy - confirm order",
        suggestedMessageAr: "تمام! أأكدلك الطلب دلوقتي؟",
      };
    }

    // Many messages but no cart
    if (messageCount > 8 && cartValue === 0) {
      return {
        actionType: "offer_bundle",
        priority: "medium",
        descriptionAr: "قدم عرض أو باقة لتحفيز الشراء",
        descriptionEn: "Offer a bundle or deal to encourage purchase",
        suggestedMessageAr: "تحب أقولك على العروض المتاحة؟",
      };
    }

    // Cart has items — trigger upsell/cross-sell
    if (
      cartValue > 0 &&
      cartValue < 500 &&
      conversationState !== "ORDER_PLACED"
    ) {
      return {
        actionType: "upsell",
        priority: "medium",
        descriptionAr: "اقترح منتجات إضافية لزيادة قيمة السلة",
        descriptionEn: "Suggest additional products to increase cart value",
        suggestedMessageAr: "عندنا منتجات تانية ممكن تعجبك — تحب أقولك؟",
      };
    }

    // Cold lead with cart - followup
    if (leadScore === "COLD" && cartValue > 0) {
      return {
        actionType: "followup",
        priority: "medium",
        descriptionAr: "جدول متابعة بعد ساعتين",
        descriptionEn: "Schedule followup in 2 hours",
        delayHours: 2,
        suggestedMessageAr: "لسه مهتم بالطلب؟ السلة لسه محفوظة",
      };
    }

    // Escalation for complex cases
    if (messageCount > 15 && conversationState !== "ORDER_PLACED") {
      return {
        actionType: "takeover",
        priority: "high",
        descriptionAr: "محادثة طويلة بدون تحويل - يُنصح بتدخل بشري",
        descriptionEn:
          "Long conversation without conversion - human takeover recommended",
      };
    }

    return {
      actionType: "none",
      priority: "low",
      descriptionAr: "لا يوجد إجراء مقترح حالياً",
      descriptionEn: "No action suggested currently",
    };
  }

  // ============= ORDER CONFIRMATION SUMMARY =============

  /**
   * Generate order confirmation summary (deterministic formatting)
   */
  generateOrderConfirmationSummary(
    request: OrderConfirmationRequest,
  ): OrderConfirmationSummary {
    const { cart, collectedInfo } = request;

    const itemsList = cart.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.lineTotal,
    }));

    const addressParts = [
      collectedInfo.address?.street,
      collectedInfo.address?.building,
      collectedInfo.address?.area,
      collectedInfo.address?.city,
      collectedInfo.address?.landmark
        ? `(بجوار ${collectedInfo.address.landmark})`
        : "",
    ].filter(Boolean);

    const addressText = addressParts.join("، ") || "لم يتم تحديد العنوان";

    // Build Arabic summary
    const itemsTextAr = itemsList
      .map((i) => `• ${i.name} × ${i.quantity} = ${i.price} ج.م`)
      .join("\n");

    const summaryAr = `📦 ملخص الطلب:

${itemsTextAr}

💰 المجموع: ${cart.subtotal} ج.م
${cart.discount > 0 ? `🏷️ خصم: -${cart.discount} ج.م\n` : ""}🚚 التوصيل: ${cart.deliveryFee} ج.م
━━━━━━━━━━
✅ الإجمالي: ${cart.total} ج.م

📍 العنوان: ${addressText}
${collectedInfo.customerName ? `👤 الاسم: ${collectedInfo.customerName}` : ""}
${collectedInfo.phone ? `📱 الموبايل: ${collectedInfo.phone}` : ""}

هل تؤكد الطلب؟ رد بـ "نعم" أو "أكد"`;

    const summaryEn = `Order Summary:
Items: ${itemsList.length}
Subtotal: ${cart.subtotal} EGP
Delivery: ${cart.deliveryFee} EGP
Total: ${cart.total} EGP
Address: ${addressText}`;

    return {
      summaryAr,
      summaryEn,
      itemsList,
      subtotal: cart.subtotal,
      deliveryFee: cart.deliveryFee,
      discount: cart.discount,
      total: cart.total,
      address: addressText,
      customerName: collectedInfo.customerName,
      phone: collectedInfo.phone,
    };
  }

  // ============= AI-ENHANCED METHODS (Optional) =============

  /**
   * Use AI to generate Arabic objection response (optional enhancement)
   * Falls back to template if AI unavailable
   */
  async generateObjectionResponse(
    merchantId: string,
    objectionType: string,
    context: { productName?: string; cartValue?: number; deliveryFee?: number },
  ): Promise<
    | { success: true; response: string; tokensUsed: number }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: "AI client not configured" };
    }

    const budgetOk = await this.checkAndDeductBudget(merchantId, 500);
    if (!budgetOk) {
      return { success: false, error: "Token budget exceeded" };
    }

    try {
      const prompt = `أنت خبير مبيعات مصري محترف بخبرة طويلة في التجارة الإلكترونية المصرية. العميل عنده اعتراض ومحتاج رد ذكي يخليه يكمل الطلب.

=== نوع الاعتراض ===
${objectionType}

=== سياق المحادثة ===
${context.productName ? `المنتج: ${context.productName}` : ""}
${context.cartValue ? `قيمة السلة: ${context.cartValue} ج.م` : ""}
${context.deliveryFee ? `رسوم التوصيل: ${context.deliveryFee} ج.م` : ""}

=== استراتيجيات الرد حسب نوع الاعتراض ===
- expensive (غالي): أكد القيمة مقابل السعر، قارن بالسوق، اذكر الجودة أو الضمان. المصريين بيقدروا الـ value for money.
- trust (مش واثق): اذكر عدد العملاء السابقين، سياسة الاسترجاع، الدفع عند الاستلام كضمان.
- product_quality (جودة): أكد من مصدر المنتج، اذكر خامات أو مواصفات، اعرض صور إضافية.
- delivery_cost (توصيل غالي): اقترح إضافة منتج للحصول على شحن مجاني، أو وضح إن التوصيل لحد الباب.
- thinking (هفكر): اخلق إحساس بالـ urgency - الكمية محدودة أو العرض قرب يخلص. بدون ضغط زيادة.

=== أسلوب الرد ===
- عامية مصرية طبيعية (مش فصحى)
- ودّي ومقنع بدون ضغط مبالغ فيه
- جملتين لـ 3 جمل كحد أقصى
- لا تخترع أسعار أو خصومات أو سياسات غير موجودة
- استخدم {price} أو {delivery_fee} كمتغيرات لو محتاج تذكر أرقام
- خلّي الرد يحسس العميل إنك فاهمه مش بتبيعله وخلاص`;

      const _t0 = Date.now();
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد مبيعات مصري. ترد بالعامية المصرية بشكل طبيعي ومقنع.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || "";
      const tokensUsed = completion.usage?.total_tokens || 0;

      await this.recordUsage(merchantId, tokensUsed);
      void this.aiMetrics.record({
        serviceName: "OpsAiService",
        methodName: "generateObjectionResponse",
        merchantId,
        outcome: "success",
        tokensUsed,
        latencyMs: Date.now() - _t0,
      });

      return { success: true, response, tokensUsed };
    } catch (err) {
      logger.error("AI objection response failed", err as Error, {
        merchantId,
      });
      void this.aiMetrics.record({
        serviceName: "OpsAiService",
        methodName: "generateObjectionResponse",
        merchantId,
        outcome: "error",
      });
      return { success: false, error: "AI generation failed" };
    }
  }

  // ============= PRIVATE METHODS =============

  private async checkAndDeductBudget(
    merchantId: string,
    estimatedTokens: number,
  ): Promise<boolean> {
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) return false;

    const usage = await this.merchantRepository.getTokenUsage(
      merchantId,
      getTodayDate(),
    );
    const used = usage?.tokensUsed || 0;
    const budget = merchant.dailyTokenBudget;
    const remaining = budget - used;

    return remaining >= estimatedTokens;
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
}
