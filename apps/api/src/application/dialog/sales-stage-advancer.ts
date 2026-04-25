export type SalesStage =
  | "discovery"
  | "qualification"
  | "recommendation"
  | "comparison"
  | "objection_handling"
  | "quote"
  | "order_draft"
  | "confirmation"
  | "order_created"
  | "payment_or_delivery_next_step"
  | "followup";

export interface SalesStageInput {
  currentIntent: string;
  customerMessage?: string;
  filledSlots: Record<string, unknown>;
  lastOfferedOptions: string[];
  lastQuotedItems: string[];
  lastRecommendation?: string;
  lastProposal?: string;
  cartItemCount: number;
  requiresConfirmation?: boolean;
  lastActionType?: string;
}

const ORDER_COMPLETED_ACTIONS = new Set([
  "ORDER_CONFIRMED",
  "CONFIRM_ORDER",
  "CREATE_ORDER",
  "order_created",
]);

const PRICE_INTENT_RE =
  /سعر|بكام|كام|price|quote|أسعار|التكلفة|التكلفه|إجمالي|الإجمالي|هيكلف/i;

const OBJECTION_RE =
  /غالي|غاليه|كتير|مش\s*قادر|مش\s*مناسب|مش\s*في\s*ميزانيت|ميزانيه?\s*محدوده?|مش\s*عارف\s*أدفع/i;

const STAGE_INSTRUCTIONS_AR: Record<SalesStage, string> = {
  discovery:
    "أنت الآن في مرحلة الاستكشاف. اسأل العميل سؤالاً واحداً واضحاً يساعده يحدد نوع اهتمامه أو هدفه.",
  qualification:
    "أنت الآن في مرحلة التأهيل. اجمع التفاصيل الأساسية الناقصة بسؤال واحد فقط. لا تعيد السؤال عن معلومات أُجيب عنها بالفعل.",
  recommendation:
    "أنت الآن في مرحلة التوصية. قدّم 2–3 خيارات مناسبة باستخدام الأسعار المتاحة في الكتالوج، ثم اسأل سؤالاً واحداً يساعد العميل يختار.",
  comparison:
    "أنت الآن في مرحلة المقارنة. قارن الخيارات بوضوح، رشّح الأفضل، ثم اسأل سؤالاً واحداً فقط.",
  objection_handling:
    "أنت الآن في مرحلة معالجة الاعتراض. تعاطف مع العميل، اعرض بديلاً أوفر أو مبرراً للقيمة، ولا تعيد أسئلة البداية.",
  quote:
    "أنت الآن في مرحلة السعر. اعرض السعر أو الإجمالي بوضوح إذا البيانات متاحة، ثم اسأل سؤالاً واحداً للمتابعة.",
  order_draft:
    "أنت الآن في مرحلة إعداد الطلب. لخّص ما تم الاتفاق عليه واجمع أي تفاصيل ناقصة لتأكيد الطلب بسؤال واحد.",
  confirmation:
    "أنت الآن في مرحلة التأكيد. لخّص الطلب كاملاً بالأسعار والكمية والتوصيل، واطلب تأكيداً صريحاً.",
  order_created:
    "الطلب أُنشئ بالفعل. أكد للعميل تفاصيل الطلب ووضعه، وأجب على أي استفسار دون إعادة فتح مرحلة الاختيار.",
  payment_or_delivery_next_step:
    "أنت الآن في مرحلة الدفع أو التوصيل. أكد للعميل الخطوة التالية بوضوح.",
  followup:
    "أنت الآن في مرحلة المتابعة. تابع مع العميل بصدق واسأل عن تجربته أو اعرض خدمات إضافية.",
};

export class SalesStageAdvancer {
  static advance(input: SalesStageInput): SalesStage {
    const {
      currentIntent,
      customerMessage = "",
      filledSlots,
      lastOfferedOptions,
      lastQuotedItems,
      lastRecommendation,
      lastProposal,
      cartItemCount,
      requiresConfirmation,
      lastActionType,
    } = input;

    // Terminal / completed states — highest priority
    if (lastActionType && ORDER_COMPLETED_ACTIONS.has(lastActionType)) {
      return "order_created";
    }

    if (requiresConfirmation) {
      return "confirmation";
    }

    // Active cart → heading toward or at order draft
    if (cartItemCount > 0) {
      return "order_draft";
    }

    // Objection handling — explicit price objection or negative/changing-mind intent
    if (
      OBJECTION_RE.test(customerMessage) ||
      currentIntent === "negative_reply" ||
      (currentIntent === "changing_mind" &&
        (filledSlots.product_interest || lastProposal || lastRecommendation))
    ) {
      return "objection_handling";
    }

    // Quote stage — price asked with product/recommendation context
    if (
      lastQuotedItems.length > 0 ||
      (PRICE_INTENT_RE.test(customerMessage) &&
        (filledSlots.product_interest || lastProposal || lastRecommendation))
    ) {
      return "quote";
    }

    // Comparison — multiple options were recently offered
    if (lastOfferedOptions.length >= 2) {
      return "comparison";
    }

    // Recommendation — product interest or a prior proposal/recommendation exists
    if (filledSlots.product_interest || lastRecommendation || lastProposal) {
      return "recommendation";
    }

    // Qualification — at least one slot is known
    const knownCount = Object.values(filledSlots).filter(
      (v) => v !== undefined && v !== null && v !== "",
    ).length;

    if (knownCount >= 1) {
      return "qualification";
    }

    return "discovery";
  }

  static getStageInstructionAr(stage: SalesStage): string {
    return STAGE_INSTRUCTIONS_AR[stage];
  }
}
