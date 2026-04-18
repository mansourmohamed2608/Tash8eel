import { Injectable } from "@nestjs/common";

type SupportedModel = "gpt-4o" | "gpt-4o-mini";

@Injectable()
export class MessageRouterService {
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

  selectModel(
    planName: string,
    messageText: string,
    messageType: string,
  ): SupportedModel {
    const normalizedPlan = String(planName || "")
      .trim()
      .toLowerCase();
    if (normalizedPlan === "starter" || normalizedPlan === "basic") {
      return "gpt-4o-mini";
    }

    if (
      String(messageType || "")
        .trim()
        .toLowerCase() === "image" &&
      normalizedPlan !== "starter"
    ) {
      return "gpt-4o";
    }

    const score = this.scoreComplexity(messageText);
    return score >= 4 ? "gpt-4o" : "gpt-4o-mini";
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
}
