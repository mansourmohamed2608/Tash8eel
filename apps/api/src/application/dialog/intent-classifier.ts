export type DialogIntent =
  | "greeting"
  | "browsing"
  | "specifying"
  | "answering_last_question"
  | "asking_question"
  | "changing_mind"
  | "venting"
  | "demanding_human"
  | "infeasible_request"
  | "off_topic"
  | "media_request"
  | "custom_request"
  // Short-reply intents — resolved from recent conversation context
  | "selecting_all_options"   // "الاثنين / both / all"
  | "ordinal_selection"       // "الأول / التاني / first / second"
  | "affirmative"             // "تمام / أيوه / yes / ok"
  | "negative_reply";         // "لأ / no / مش كده"

export interface IntentClassification {
  intent: DialogIntent;
  confidence: number;
  reasons: string[];
}

export class IntentClassifier {
  static classify(message: string): IntentClassification {
    const text = String(message || "").trim();
    const normalized = text.toLowerCase();
    const reasons: string[] = [];

    const hit = (intent: DialogIntent, confidence: number, reason: string) => ({
      intent,
      confidence,
      reasons: [reason],
    });

    if (!text) return hit("asking_question", 0.2, "empty_message");

    if (/^(السلام عليكم|سلام عليكم|وعليكم السلام|صباح الخير|مساء الخير|اهلا|أهلا|هاي|hi|hello)(?:\s|$|[!.؟،,])/i.test(normalized)) {
      return hit("greeting", 0.9, "greeting_phrase");
    }

    if (/شكوى|مشكلة|مشكل[هة]|متضايق|زعلان|غلط|حقوق/i.test(normalized)) {
      return hit("venting", 0.86, "complaint_terms");
    }

    if (/مسؤول|موظف|بشري|مدير|اكلم|أكلم|supervisor|manager|human/i.test(normalized)) {
      return hit("demanding_human", 0.86, "human_request_terms");
    }

    if (/(ساعتين|خلال\s*ساعة|النهارده|فوري|مش\s*واضح|مش\s*واضحة|مغبشة|200\s*[x×*]\s*300|photoreal|فوتوريال)/i.test(normalized)) {
      return hit("infeasible_request", 0.78, "conflicting_constraint_terms");
    }

    if (/صورة|صور|ابعت.*(?:صورة|صور)|شكل(?:ه|ها)?|photo|image|pic/i.test(normalized)) {
      return hit("media_request", 0.82, "media_request_terms");
    }

    if (/مش\s*عارف|محتار|اختار|أختار|على\s*ذوقك|ترشح|رشح|يناسب/i.test(normalized)) {
      return hit("browsing", 0.78, "guided_choice_terms");
    }

    if (/مخصص|خاص|حسب\s*الطلب|من\s*فكرة|فكرة|brief|custom|تفصيل/i.test(normalized)) {
      return hit("custom_request", 0.78, "custom_request_terms");
    }

    if (/بكام|سعر|كام|استرجاع|استبدال|ضمان|توصيل|الدفع|مدة|كام\s*يوم|خامات|مواد/i.test(normalized)) {
      return hit("asking_question", 0.76, "merchant_question_terms");
    }

    // ── Short-reply intents (checked before generic commerce/mind-change) ─────

    // "Both / all" — customer wants all recently offered options
    if (/^(?:الاثنين|الاتنين|كلهم|كله|كلها|كل\s+الخيار|عايز\s+(?:الاتنين|الاثنين)|عاوز\s+(?:الاتنين|الاثنين)|أريد\s+(?:الاتنين|الاثنين)|كمل\s+في\s+الاتنين|عايز\s+أعرف\s+الاتنين|both|all\s*options?|both\s*options?)$/iu.test(text)) {
      return hit("selecting_all_options", 0.92, "both_all_selection");
    }

    // Explicit ordinal selection — "الأول / التاني / first / second"
    if (/^(?:الأول|الاول|الاختيار\s+الأول|الخيار\s+الأول|first|option\s+1|التاني|الثاني|الاختيار\s+التاني|الخيار\s+التاني|second|option\s+2|التالت|الثالث|الاختيار\s+التالت|الخيار\s+الثالث|third|option\s+3)$/iu.test(text)) {
      return hit("ordinal_selection", 0.9, "ordinal_selection_terms");
    }

    // Affirmative short reply — "تمام / ماشي / أيوه / yes / ok"
    if (/^(?:تمام|ماشي|أيوه|أيه|اه|آه|أه|نعم|أكيد|طبعاً|طبعا|يس|yes|ok|okay|sure|موافق|طيب|حلو|مظبوط|صح|اوك|اوكيه|تمام\s+كمل|تمام\s+جداً)$/iu.test(text)) {
      return hit("affirmative", 0.88, "affirmative_short_reply");
    }

    // Negative short reply — "لأ / no / مش كده"
    if (/^(?:لأ|لا|no|مش\s+كده|مش\s+مناسب|مش\s+عايز|مش\s+ده|غلط|مش\s+صح|مش\s+صحيح|مش\s+حلو|نفسي\s+حاجة\s+تانية)$/iu.test(text)) {
      return hit("negative_reply", 0.85, "negative_short_reply");
    }

    // ── Original mind-change (broader pattern, lower priority) ──────────────
    if (/(^|\s)(?:لأ|لا)(?:\s|$)|مش\s*ده|غيرت\s*رأيي|خليها/i.test(normalized)) {
      return hit("changing_mind", 0.7, "change_mind_terms");
    }

    if (/مين\s+أفضل\s+لاعب|الطقس|نكتة|سياسة|رئيس|ميسي|رونالدو/i.test(normalized)) {
      return hit("off_topic", 0.82, "clearly_unrelated_terms");
    }

    if (/عايز|أريد|ابغى|محتاج|طلب|اوردر|منتج|sku/i.test(normalized)) {
      return hit("specifying", 0.65, "commerce_terms");
    }

    reasons.push("fallback_ambiguous");
    return { intent: "asking_question", confidence: 0.45, reasons };
  }
}
