import {
  HumanOperatorPolicyOutputV2,
  MessageUnderstandingV2,
  NextBestActionV2,
  OperatorModeV2,
} from "./ai-v2.types";
import { EmotionPolicyOutputV2 } from "./ai-v2.types";
import { Merchant } from "../../domain/entities/merchant.entity";

export class HumanOperatorPolicyV2 {
  static decide(input: {
    merchant: Merchant;
    understanding: MessageUnderstandingV2;
    emotion: EmotionPolicyOutputV2;
    nextBestAction: NextBestActionV2;
  }): HumanOperatorPolicyOutputV2 {
    const mode = pickMode(
      input.nextBestAction,
      input.emotion,
      input.understanding,
    );
    const config = (input.merchant.config || {}) as Record<string, unknown>;
    const cadence = (config.cadence || {}) as Record<string, unknown>;

    return {
      mode,
      toneDialect: String(cadence.dialect || "egyptian"),
      warmth: Number(cadence.warmth ?? 0.75),
      emojiBudget: Number(cadence.emoji_budget ?? 1),
    };
  }
}

function pickMode(
  nba: NextBestActionV2,
  emotion: EmotionPolicyOutputV2,
  u: MessageUnderstandingV2,
): OperatorModeV2 {
  if (
    emotion.customerEmotion === "complaining" ||
    nba.type === "handle_complaint"
  ) {
    return emotion.empathyFirst ? "complaint_recovery" : "manager_apology";
  }
  if (nba.type === "acknowledge_feedback") {
    return u.intentTags.includes("feedback_positive")
      ? "feedback_ack"
      : "calm_de_escalate";
  }
  if (nba.type === "greet") return "friendly_greeting";
  if (nba.type === "answer_question" || nba.type === "support_answer") {
    return "helpful_answer";
  }
  if (emotion.sellingSuppressed) return "reassurance";
  if (nba.type === "clarify") return "clarification";
  if (nba.type === "confirm_order_draft") return "order_taking";
  return "helpful_answer";
}
