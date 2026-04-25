/**
 * Resolves short / ambiguous customer replies using previous conversation context.
 * Pure static utility — no NestJS dependencies, no merchant-specific logic.
 * Options come from dialogCtx (populated after each turn by OptionExtractor).
 */

export type ShortReplyType =
  | "selecting_all_options"
  | "ordinal_selection"
  | "affirmative"
  | "negative_reply"
  | "numeric_value"
  | "location_hint"
  | "date_hint"
  | "emoji_ack"
  | "needs_clarification"
  | "not_short";

export interface ShortReplyResolution {
  type: ShortReplyType;
  ordinalIndex?: number;
  resolvedOptions?: string[];
  resolvedValue?: unknown;
  /** Arabic context note injected into the LLM user prompt */
  contextNote: string;
}

export interface ShortReplyDialogCtx {
  pendingSlot?: string | null;
  pendingQuestionType?: string | null;
  lastOfferedOptions?: string[] | null;
  lastRecommendation?: string | null;
  lastProposal?: string | null;
}

// ── Pattern banks ──────────────────────────────────────────────────────────────

const ALL_SELECTION =
  /^(?:الاثنين|الاتنين|كلهم|كله|كلها|كل\s+الخيارات|كل\s+الخيار(?:ين)?|عايز\s+(?:الاتنين|الاثنين)|أريد\s+(?:الاتنين|الاثنين)|عاوز\s+(?:الاتنين|الاثنين)|كمل\s+في\s+الاتنين|عايز\s+أعرف\s+الاتنين|both|all(?:\s+options?)?|both\s+options?)$/iu;

// Explicit ordinal patterns — NOT demonstrative pronouns
const FIRST_OPTION =
  /^(?:الأول|الاول|الاختيار\s+الأول|الاختيار\s+الاول|الخيار\s+الأول|الخيار\s+الاول|first|option\s+1)$/iu;
const SECOND_OPTION =
  /^(?:التاني|الثاني|الاختيار\s+التاني|الاختيار\s+الثاني|الخيار\s+التاني|الخيار\s+الثاني|second|option\s+2)$/iu;
const THIRD_OPTION =
  /^(?:التالت|الثالث|الاختيار\s+التالت|الاختيار\s+الثالث|الخيار\s+التالت|الخيار\s+الثالث|third|option\s+3)$/iu;

// Demonstrative pronouns — resolve only when there is a single clear option or
// the last customer selection already exists. Otherwise → needs_clarification.
const DEMONSTRATIVE =
  /^(?:ده|دي|هذا|هذه|ذاك|تلك|ده\s+الخيار|دي\s+الخيارة)$/iu;

const AFFIRMATIVE =
  /^(?:تمام|ماشي|أيوه|أيه|اه|آه|أه|نعم|أكيد|طبعاً|طبعا|يس|yes|ok|okay|sure|موافق|طيب|حلو|مظبوط|صح|تمام\s+جداً|اوك|اوكيه|تمام\s+كمل)$/iu;

// "Continue / tell me" intent — customer asks to proceed from last offer/proposal
// without restarting. Treated as affirmative with explicit "continue" note.
const CONTINUE_INTENT =
  /^(?:قولي|قولّي|كمل|اكمل|يلا\s+كمل|يلا\s+كمل\s+معايا|عارفني|ماشي\s+قولي|ماشي\s+قولّي|تمام\s+قولي|تمام\s+قولّي|ايوه\s+قولي|ايوه\s+قولّي|أيوه\s+قولي|أيوه\s+قولّي|اه\s+قولي|اه\s+قولّي)$/iu;

const NEGATIVE =
  /^(?:لأ|لا|no|مش\s+كده|مش\s+مناسب|مش\s+عايز|مش\s+ده|غلط|مش\s+صح|مش\s+صحيح|مش\s+حلو|نفسي\s+حاجة\s+تانية)$/iu;
const EMOJI_ACK =
  /^[\u{1F44D}\u{2764}\u{1F64F}\u{1F60A}\u{1F44C}\u{2705}\u{1F4AF}\u{1F91D}]+$/u;
const NUMERIC_ONLY = /^(\d{1,6})$/;
const DATE_HINT =
  /^(?:بكرا|بكره|الغد|النهارده|أول\s+بكرا|الأسبوع\s+الجاي|الشهر\s+الجاي|الأسبوع\s+القادم|next\s+(?:week|month)|tomorrow|today|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/iu;

function isLocationHint(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return (
    words.length <= 4 &&
    !/[?؟]/.test(text) &&
    !/(?:عايز|طلب|سعر|كام|هو|في|إيه|ايه|بتبيع|عندك|موجود)/.test(text)
  );
}

// ── Resolver ───────────────────────────────────────────────────────────────────

export class ShortReplyResolver {
  static resolve(
    message: string,
    dialogCtx: ShortReplyDialogCtx,
  ): ShortReplyResolution {
    const text = String(message || "").trim();

    if (!text) return { type: "not_short", contextNote: "" };

    // Emoji-only acknowledgement
    if (EMOJI_ACK.test(text)) {
      return {
        type: "emoji_ack",
        contextNote:
          "العميل أرسل إيموجي موافقة — تعامل معه كموافقة خفيفة على آخر اقتراح وانتقل للخطوة التالية المنطقية.",
      };
    }

    // "Both / all" selection
    if (ALL_SELECTION.test(text)) {
      const opts = (dialogCtx.lastOfferedOptions || []).filter(Boolean);
      return {
        type: "selecting_all_options",
        resolvedOptions: opts,
        contextNote:
          opts.length > 0
            ? `العميل يريد كل الخيارات المعروضة: ${opts.join(" + ")}. لا تعيد سؤال الاختيار. قارن بينهم أو اكمل معهم واسأل سؤالاً مفيداً واحداً.`
            : "العميل يريد كل الخيارات المتاحة. وضح الخيارات وأسعارها إن أمكن واسأل سؤالاً مفيداً واحداً.",
      };
    }

    // Explicit ordinal — first
    if (FIRST_OPTION.test(text)) {
      const opts = (dialogCtx.lastOfferedOptions || []).filter(Boolean);
      const selected = opts[0];
      return {
        type: "ordinal_selection",
        ordinalIndex: 0,
        resolvedValue: selected,
        contextNote: selected
          ? `العميل اختار الخيار الأول: "${selected}". خزّن هذا الاختيار وتابع من هناك.`
          : "العميل اختار الخيار الأول. تابع من هذا الخيار.",
      };
    }

    // Explicit ordinal — second
    if (SECOND_OPTION.test(text)) {
      const opts = (dialogCtx.lastOfferedOptions || []).filter(Boolean);
      const selected = opts[1];
      return {
        type: "ordinal_selection",
        ordinalIndex: 1,
        resolvedValue: selected,
        contextNote: selected
          ? `العميل اختار الخيار الثاني: "${selected}". خزّن هذا الاختيار وتابع من هناك.`
          : "العميل اختار الخيار الثاني. تابع من هذا الخيار.",
      };
    }

    // Explicit ordinal — third
    if (THIRD_OPTION.test(text)) {
      const opts = (dialogCtx.lastOfferedOptions || []).filter(Boolean);
      const selected = opts[2];
      return {
        type: "ordinal_selection",
        ordinalIndex: 2,
        resolvedValue: selected,
        contextNote: selected
          ? `العميل اختار الخيار الثالث: "${selected}". خزّن هذا الاختيار وتابع من هناك.`
          : "العميل اختار الخيار الثالث. تابع من هذا الخيار.",
      };
    }

    // Demonstrative pronouns (ده/دي/هذا/هذه) — only resolve if a single
    // unambiguous option exists; otherwise ask for clarification.
    if (DEMONSTRATIVE.test(text)) {
      const opts = (dialogCtx.lastOfferedOptions || []).filter(Boolean);
      if (opts.length === 1) {
        return {
          type: "ordinal_selection",
          ordinalIndex: 0,
          resolvedValue: opts[0],
          contextNote: `العميل يقصد: "${opts[0]}". خزّن هذا الاختيار وتابع.`,
        };
      }
      return {
        type: "needs_clarification",
        contextNote:
          'العميل قال "ده/دي" لكن غير واضح أي خيار يقصد. اسأل سؤالاً توضيحياً واحداً لتحديد الخيار المقصود.',
      };
    }

    // "Continue / tell me" intent — قولي / ايوه قولي / كمل etc.
    if (CONTINUE_INTENT.test(text)) {
      const proposal =
        dialogCtx.lastProposal || dialogCtx.lastRecommendation || "";
      return {
        type: "affirmative",
        contextNote: proposal
          ? `العميل قال "${text}" — هذا تأكيد مواصلة من آخر اقتراح: "${proposal}". تابع من هناك مباشرةً. لا تعيد السؤال الأخير ولا تبدأ من الصفر.`
          : `العميل قال "${text}" — هذا طلب مواصلة. تابع من آخر نقطة في المحادثة مباشرةً. لا تعيد السؤال الأخير.`,
      };
    }

    // Affirmative
    if (AFFIRMATIVE.test(text)) {
      const proposal =
        dialogCtx.lastProposal || dialogCtx.lastRecommendation || "";
      return {
        type: "affirmative",
        contextNote: proposal
          ? `العميل وافق على آخر اقتراح: "${proposal}". انتقل للخطوة التالية بدون تكرار التأهيل أو إعادة نفس الأسئلة.`
          : "العميل موافق. انتقل للخطوة التالية المنطقية بدون تكرار نفس الأسئلة.",
      };
    }

    // Negative
    if (NEGATIVE.test(text)) {
      return {
        type: "negative_reply",
        contextNote:
          "العميل رفض آخر اقتراح. اعرض بديلاً أو اسأل سؤالاً توضيحياً واحداً. لا تفقد سياق المحادثة الحالي.",
      };
    }

    // Numeric value
    const numMatch = NUMERIC_ONLY.exec(text);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      const slot = dialogCtx.pendingSlot || "";
      const slotHint = slot ? ` للحقل "${slot}"` : "";
      return {
        type: "numeric_value",
        resolvedValue: num,
        contextNote: `العميل أرسل رقماً: ${num}${slotHint}. إذا كان السؤال السابق عن الكمية أو عدد القطع أو مبلغ معين، اعتبر هذا هو الجواب وتابع بدون إعادة السؤال.`,
      };
    }

    // Date hint
    if (DATE_HINT.test(text)) {
      return {
        type: "date_hint",
        resolvedValue: text,
        contextNote: `العميل أرسل وقتاً أو تاريخاً: "${text}". اعتبره الموعد المطلوب وتابع.`,
      };
    }

    // Location hint — only when the pending slot is delivery-related
    if (
      (dialogCtx.pendingSlot === "delivery_area" ||
        dialogCtx.pendingQuestionType === "delivery_area") &&
      isLocationHint(text)
    ) {
      return {
        type: "location_hint",
        resolvedValue: text,
        contextNote: `العميل أرسل اسم منطقة: "${text}". اعتبرها منطقة التوصيل وتابع بدون إعادة سؤال المنطقة.`,
      };
    }

    return { type: "not_short", contextNote: "" };
  }
}
