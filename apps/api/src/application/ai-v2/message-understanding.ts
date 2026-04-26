import { Injectable } from "@nestjs/common";
import {
  CoarseIntentV2,
  CustomerLanguageV2,
  MessageUnderstandingV2,
} from "./ai-v2.types";

/**
 * Heuristic message understanding (no catalog, no RAG).
 * Aligned loosely with v1 IntentClassifier signals.
 */
@Injectable()
export class MessageUnderstandingV2Service {
  analyze(text: string): MessageUnderstandingV2 {
    const raw = String(text || "").trim();
    const normalized = raw.toLowerCase();

    const language = this.detectLanguage(raw);
    const coarseIntent = this.detectCoarseIntent(raw, normalized);
    const urgency =
      /عاجل|دلوقتي|فوري|urgent|asap|now\b/i.test(normalized) || /!!+/.test(raw);
    const buyingIntentStrong =
      /عايز\s+أطلب|عاوز\s+اطلب|احجز|هات\s+لي|اعمل\s+طلب|order\s+this|i\s+want\s+to\s+buy|checkout/i.test(
        normalized,
      );

    const resolutionSignal = this.detectResolutionSignal(raw, normalized);

    return {
      language,
      coarseIntent,
      urgency,
      buyingIntentStrong,
      resolutionSignal,
      confidence: 0.72,
    };
  }

  private detectLanguage(text: string): CustomerLanguageV2 {
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasLatin = /[a-zA-Z]{2,}/.test(text);
    if (hasArabic && hasLatin) return "mixed";
    if (hasLatin) return "en";
    return "ar";
  }

  private detectCoarseIntent(text: string, normalized: string): CoarseIntentV2 {
    if (
      /^(السلام عليكم|سلام عليكم|وعليكم السلام|صباح الخير|مساء الخير|اهلا|أهلا|هاي|hi|hello|hey|ازيك|عاملين\s+ايه)(?:\s|$|[!.؟،,])/i.test(
        normalized,
      ) &&
      normalized.length <= 48 &&
      !/سعر|بكام|عايز|أريد|ابغى|طلب|order|buy|available|عندكم\s+\w+/i.test(
        normalized,
      )
    ) {
      return "greeting";
    }

    if (
      /شكرا|شكراً|ممتاز|حلو\s+جدا|حلو\s+جداً|rated\s+5|thanks|thank\s+you/i.test(
        normalized,
      ) &&
      !/مش|لا\s|not\s|bad|سيء/i.test(normalized)
    ) {
      return "feedback_positive";
    }

    if (
      /مش\s+حلو|وحش|زعلان|disappointed|bad\s+service/i.test(normalized) ||
      (/مش\s+عاجبني|مش\s+عجبني/.test(normalized) && !/شكرا/.test(normalized))
    ) {
      return "feedback_negative";
    }

    if (
      /شكوى|مشكلة|متضايق|زعلان|غلط|حقوق|اتأخر|تأخير|wrong\s+item|damaged/i.test(
        normalized,
      ) ||
      /مش\s+زي\s+الصور|مش\s+زي\s+الصورة/.test(normalized)
    ) {
      return "complaint";
    }

    if (/بكام|سعر|كام|price|how\s+much/i.test(normalized)) {
      return "price_question";
    }

    if (
      /استرجاع|استبدال|ضمان|سياسة|refund|return|exchange|warranty/i.test(
        normalized,
      )
    ) {
      return "policy_question";
    }

    if (
      /عندكم|فيه|available|عندكو|بيعملوا|بيعمل|منتج|موديل|صنف|لون|مقاس/i.test(
        normalized,
      )
    ) {
      return "product_question";
    }

    if (
      /عايز|أريد|ابغى|محتاج|طلب|order|buy/i.test(normalized) &&
      text.length > 8
    ) {
      return "order_intent";
    }

    if (text.length < 4) return "ambiguous";

    return "other";
  }

  private detectResolutionSignal(
    text: string,
    normalized: string,
  ): MessageUnderstandingV2["resolutionSignal"] {
    if (
      /^(?:الاثنين|الاتنين|كلهم|كله|both|all\s*options?)$/iu.test(text.trim())
    ) {
      return "both";
    }
    if (/^(?:الأول|الاول|first|option\s+1)$/iu.test(text.trim())) {
      return "ordinal_first";
    }
    if (/^(?:التاني|الثاني|second|option\s+2)$/iu.test(text.trim())) {
      return "ordinal_second";
    }
    if (/^(?:تمام|ماشي|أيوه|اه|yes|ok|okay|sure)$/iu.test(text.trim())) {
      return "affirmative";
    }
    if (/^(?:لأ|لا|no)$/iu.test(text.trim())) {
      return "negative";
    }
    if (/مش\s*عارف|محتار|ممكن\s+اي\s+حاجة|idk|dunno/i.test(normalized)) {
      return "vague";
    }
    return "none";
  }
}
