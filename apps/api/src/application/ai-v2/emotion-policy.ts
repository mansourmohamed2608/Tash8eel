import {
  AiSalesState,
  EmotionPolicyOutputV2,
  MessageUnderstandingV2,
  SalesStageV2,
} from "./ai-v2.types";

export class EmotionPolicyV2 {
  static decide(input: {
    understanding: MessageUnderstandingV2;
    stage: SalesStageV2;
    /** Persisted v2 emotion from previous turn, if any */
    priorCustomerEmotion?: AiSalesState["customerEmotion"];
  }): EmotionPolicyOutputV2 {
    const u = input.understanding;
    let customerEmotion = input.priorCustomerEmotion || "neutral";

    if (u.coarseIntent === "complaint") {
      customerEmotion = "complaining";
    } else if (u.coarseIntent === "feedback_negative") {
      customerEmotion = "frustrated";
    } else if (u.coarseIntent === "feedback_positive") {
      customerEmotion = "happy";
    } else if (u.resolutionSignal === "vague") {
      customerEmotion = "hesitant";
    }

    const empathyFirst =
      customerEmotion === "complaining" ||
      customerEmotion === "frustrated" ||
      customerEmotion === "angry";

    const sellingSuppressed =
      empathyFirst ||
      u.coarseIntent === "complaint" ||
      u.coarseIntent === "feedback_negative";

    const toneNotes: string[] = [];
    if (empathyFirst) toneNotes.push("قصير ومتعاطف أولاً");
    if (u.language === "en") toneNotes.push("رد بالإنجليزي العامية المهنية");
    if (u.language === "mixed")
      toneNotes.push("يمكن خلط بسيط عربي/إنجليزي حسب العميل");

    return {
      customerEmotion,
      empathyFirst,
      sellingSuppressed,
      toneNotes,
    };
  }
}
