import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

type SupportedModel = "gpt-4o" | "gpt-4o-mini";

@Injectable()
export class MessageRouterService {
  private readonly ackPhrases = new Set(
    [
      "أوكي",
      "اوكي",
      "ok",
      "okay",
      "تمام",
      "تمم",
      "تمو",
      "ماشي",
      "شكرا",
      "شكراً",
      "شكرا جزيلا",
      "شكراً جزيلاً",
      "ثانكس",
      "مشكور",
      "الله يسلمك",
      "تسلم",
      "عيشك",
      "يسلمو",
      "يسلموا",
      "حاضر",
      "أيوه",
      "ايوه",
      "نعم",
      "يا هلا",
      "هلا",
      "اوك",
      "توب",
    ].map((value) => this.normalizeText(value)),
  );

  private readonly greetingPhrases = new Set(
    [
      "هلا",
      "أهلا",
      "اهلا",
      "مرحبا",
      "مرحباً",
      "هاي",
      "hi",
      "hello",
      "السلام عليكم",
      "وعليكم السلام",
      "صباح الخير",
      "مساء الخير",
      "ازيك",
      "عامل ايه",
      "كيف حالك",
      "كيف الحال",
      "ايش أخبارك",
    ].map((value) => this.normalizeText(value)),
  );

  private readonly orderStatusKeywords = [
    "طلبي",
    "اوردري",
    "اوردر",
    "أوردر",
    "order",
    "وين طلبي",
    "فين طلبي",
    "متى يوصل",
    "امتى يجي",
    "الشحنة",
    "تتبع",
    "حالة الطلب",
    "رقم الطلب",
    "وين الأوردر",
    "طلبيتي",
  ];

  private readonly priceKeywords = [
    "كم سعر",
    "بكام",
    "بقد ايه",
    "سعر",
    "price",
    "كم ثمن",
    "بكم",
  ];

  private readonly complaintKeywords = [
    "مشكلة",
    "غلط",
    "خطأ",
    "باظ",
    "بارد",
    "وحش",
    "مش كويس",
    "مش تمام",
    "زعلان",
    "مش راضي",
    "رجوع",
    "استرداد",
    "فين حقي",
    "احتجاج",
    "مش صح",
    "problem",
    "complaint",
    "wrong",
  ];

  private readonly negotiationKeywords = [
    "خصم",
    "أرخص",
    "غالي",
    "نزل السعر",
    "ممكن تنزل",
    "أحسن سعر",
    "احسن سعر",
    "تخفيض",
    "اوفر",
    "discount",
    "offer",
    "less",
    "cheaper",
    "سعر أحسن",
    "reduce",
    "negotiate",
  ];

  private readonly complexModificationKeywords = [
    "غير",
    "بدل",
    "زي اللي",
    "نفس الطلب",
    "امبارح",
    "الأخير",
    "بس من غير",
    "أضف",
    "شيل",
    "بدون",
    "بدلاً",
    "عدل",
    "بدّل",
    "change",
    "modify",
    "instead",
    "without",
    "add",
    "remove",
  ];

  private readonly escalationKeywords = [
    "مدير",
    "مسؤول",
    "أكلم",
    "أكلمك",
    "اكلمك",
    "حقوقي",
    "شكوى",
    "موظف",
    "أعلى",
    "manager",
    "supervisor",
    "escalate",
  ];

  private readonly crossConversationKeywords = [
    "زي ما قلت",
    "كما اتفقنا",
    "قلتلك",
    "قبل كده",
    "المرة اللي فاتت",
    "as we agreed",
    "like before",
    "last time",
    "you said",
    "previously",
  ];

  private readonly simpleOrderPrefixes = [
    "عايز",
    "أطلب",
    "اطلب",
    "اجيب",
    "طلب",
    "أريد",
    "ممكن",
    "order",
    "want",
    "get me",
  ];

  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async getInstantReply(
    messageText: string,
    messageType: string,
    merchantId: string,
    customerPhone: string,
  ): Promise<string | null> {
    const rawText = (messageText || "").trim();
    const normalized = this.normalizeText(rawText);
    const effectiveType = (messageType || "text").toLowerCase();

    if (!rawText && effectiveType !== "location") {
      return null;
    }

    if (this.shouldIgnoreWithoutReply(rawText, normalized)) {
      return this.pickRandom([
        "تمام 🙌 لو حابب تطلب حاجة، ابعت اسم المنتج وأنا معاك.",
        "شكرًا 😊 جاهز أساعدك في أي طلب وقت ما تحب.",
        "حاضر ✨ ابعتلي المنتج أو الكمية اللي محتاجها.",
      ]);
    }

    if (rawText.length < 20 && this.greetingPhrases.has(normalized)) {
      return null;
    }

    // Escalation/complaint intent is intentionally not short-circuited here.
    // The dialog layer/LLM must answer as the person handling the customer now,
    // not emit a fake handoff or static routing template.
    if (
      this.containsAny(normalized, this.escalationKeywords) ||
      this.containsAny(normalized, this.complaintKeywords)
    ) {
      return null;
    }

    if (this.containsAny(normalized, this.orderStatusKeywords)) {
      const orderStatusReply = await this.getLatestOrderStatusReply(
        merchantId,
        customerPhone,
      );
      if (orderStatusReply) {
        return orderStatusReply;
      }
    }

    return null;
  }

  selectModel(
    planName: string,
    messageText: string,
    messageType: string,
  ): SupportedModel {
    return "gpt-4o-mini";
  }

  scoreComplexity(messageText: string): number {
    const rawText = (messageText || "").trim();
    const normalized = this.normalizeText(rawText);
    let score = 0;

    if (this.containsAny(normalized, this.complaintKeywords)) score += 3;
    if (this.containsAny(normalized, this.negotiationKeywords)) score += 3;
    if (this.containsAny(normalized, this.complexModificationKeywords))
      score += 2;
    if (this.containsAny(normalized, this.escalationKeywords)) score += 2;
    if (this.containsAny(normalized, this.crossConversationKeywords))
      score += 2;
    if (rawText.length > 150) score += 1;
    if ((rawText.match(/\?/g) || []).length >= 2) score += 1;

    const hasComplaint = this.containsAny(normalized, this.complaintKeywords);
    const hasNegotiation = this.containsAny(
      normalized,
      this.negotiationKeywords,
    );
    const isSimpleOrder =
      rawText.length < 80 &&
      this.simpleOrderPrefixes.some((prefix) =>
        normalized.startsWith(this.normalizeText(prefix)),
      ) &&
      !hasComplaint &&
      !hasNegotiation;

    if (isSimpleOrder) {
      score -= 2;
    }

    return score;
  }

  getMediaRedirectReply(messageType: string): string {
    const normalizedType = String(messageType || "")
      .trim()
      .toLowerCase();

    if (normalizedType === "audio" || normalizedType === "voice") {
      return this.pickRandom([
        "وصلتنا رسالتك الصوتية! لأتمكن من مساعدتك بشكل أفضل، يرجى كتابة طلبك هنا 😊",
        "شكراً! الرسائل الصوتية مش متاحة حالياً، ممكن تكتب طلبك وأساعدك فوراً؟",
        "سمعناك! لو تكتب طلبك هنا هيكون أسرع وأدق 📝",
      ]);
    }

    if (normalizedType === "image" || normalizedType === "document") {
      return this.pickRandom([
        "وصلتنا صورتك! ممكن تكتب اللي تحتاجه وأساعدك فوراً؟",
        "شكراً! للطلب السريع، كتابة طلبك هنا أسهل وأسرع 😊",
        "وصل الملف! يرجى كتابة طلبك بالنص لأقدر أساعدك 📝",
      ]);
    }

    if (normalizedType === "location") {
      return this.pickRandom([
        "وصل موقعك! كيف أقدر أساعدك؟ 😊",
        "شكراً على الموقع! اكتب طلبك وأنا هنا 🙏",
      ]);
    }

    if (normalizedType === "sticker" || normalizedType === "reaction") {
      return "";
    }

    return "وصلتنا رسالتك! ممكن تكتب طلبك هنا وأساعدك فوراً؟ 😊";
  }

  private shouldIgnoreWithoutReply(
    rawText: string,
    normalizedText: string,
  ): boolean {
    if (this.ackPhrases.has(normalizedText)) {
      // Short text acknowledgements can carry intent in checkout flows.
      // Let the normal router/AI path process them instead of suppressing.
      return false;
    }

    const compact = rawText.replace(/\s+/g, "");
    return compact.length > 0 && this.isPureEmoji(compact);
  }

  private async getWelcomeMessage(merchantId: string): Promise<string | null> {
    const result = await this.db.query<{ welcome_message: string | null }>(
      `SELECT config->>'welcomeMessage' AS welcome_message
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId],
    );

    const welcomeMessage = result.rows[0]?.welcome_message?.trim();
    return welcomeMessage ? welcomeMessage : null;
  }

  private async getLatestOrderStatusReply(
    merchantId: string,
    customerPhone: string,
  ): Promise<string | null> {
    const result = await this.db.query<{
      order_number: string;
      status: string;
      estimated_delivery: string | null;
    }>(
      `SELECT o.order_number, o.status, o.estimated_delivery
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.merchant_id = $1
         AND c.phone = $2
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [merchantId, customerPhone],
    );

    const row = result.rows[0];
    if (!row) return null;

    const statusMap: Record<string, string> = {
      pending: "قيد المراجعة",
      confirmed: "تم تأكيده",
      preparing: "جاري التحضير",
      out_for_delivery: "في الطريق إليك",
      delivered: "تم التوصيل",
      cancelled: "ملغي",
    };

    const arabicStatus =
      statusMap[String(row.status || "").toLowerCase()] || "قيد المتابعة";
    let reply = `طلبك رقم ${row.order_number} - الحالة الآن: ${arabicStatus} ✅`;
    if (row.estimated_delivery) {
      reply += ` - موعد التوصيل: ${new Date(row.estimated_delivery).toLocaleString("ar-EG")}`;
    }
    return reply;
  }

  private async getCatalogPriceReply(
    merchantId: string,
    messageText: string,
  ): Promise<string | null> {
    const productQuery = this.extractProductQuery(messageText);
    if (!productQuery) return null;

    const result = await this.db.query<{
      name: string | null;
      name_ar: string | null;
      price: string | number | null;
      base_price: string | number | null;
      is_available: boolean | null;
      is_active: boolean | null;
    }>(
      `SELECT
         COALESCE(NULLIF(name_ar, ''), NULLIF(name_en, ''), NULLIF(name, '')) AS name,
         name_ar,
         COALESCE(price, base_price) AS price,
         base_price,
         is_available,
         is_active
       FROM catalog_items
       WHERE merchant_id = $1
         AND LOWER(COALESCE(name_ar, name_en, name, '')) LIKE '%' || LOWER($2) || '%'
         AND COALESCE(is_active, true) = true
       LIMIT 3`,
      [merchantId, productQuery],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const formatRow = (row: {
      name: string | null;
      price: string | number | null;
      base_price: string | number | null;
      is_available: boolean | null;
    }) => {
      const displayName = row.name || productQuery;
      const price = Number(row.price ?? row.base_price ?? 0);
      const availability = row.is_available === false ? "غير متوفر" : "متوفر";
      return `${displayName}: ${price} جنيه - ${availability}`;
    };

    if (result.rows.length === 1) {
      return formatRow(result.rows[0]);
    }

    return result.rows.map(formatRow).join("\n");
  }

  private extractProductQuery(messageText: string): string {
    const normalized = this.normalizeText(messageText);
    let candidate = normalized;
    for (const keyword of this.priceKeywords) {
      candidate = candidate.replace(
        new RegExp(this.escapeRegExp(this.normalizeText(keyword)), "gi"),
        " ",
      );
    }

    candidate = candidate
      .replace(/[؟?!.,،]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!candidate) return "";
    return candidate;
  }

  private normalizeText(value: string): string {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[ـ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  private containsAny(text: string, values: string[]): boolean {
    return values.some((value) => text.includes(this.normalizeText(value)));
  }

  private pickRandom(values: string[]): string {
    if (values.length === 0) return "";
    return values[Math.floor(Math.random() * values.length)] || values[0];
  }

  private isPureEmoji(value: string): boolean {
    const stripped = value.replace(
      /[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu,
      "",
    );
    return stripped.length === 0;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
