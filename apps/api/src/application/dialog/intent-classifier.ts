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
  | "custom_request";

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
