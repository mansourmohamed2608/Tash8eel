import {
  CoarseIntentV2,
  MessageUnderstandingV2,
  NextBestActionV2,
  SalesStageV2,
} from "./ai-v2.types";
import { LoadedConversationStateV2 } from "./ai-v2.types";

/**
 * Chooses nextBestAction and target stage from understanding + cart.
 * Does not read RAG text — only structured signals.
 */
export class SalesPolicyV2 {
  static decide(input: {
    loaded: LoadedConversationStateV2;
    understanding: MessageUnderstandingV2;
  }): { stage: SalesStageV2; nextBestAction: NextBestActionV2 } {
    const { understanding: u, loaded } = input;

    if (u.coarseIntent === "complaint") {
      return {
        stage: "complaint",
        nextBestAction: {
          type: "handle_complaint",
          reason: "complaint_terms",
        },
      };
    }

    if (u.coarseIntent === "feedback_negative") {
      return {
        stage: "support",
        nextBestAction: {
          type: "acknowledge_feedback",
          reason: "negative_feedback",
        },
      };
    }

    if (u.coarseIntent === "feedback_positive") {
      return {
        stage: "support",
        nextBestAction: {
          type: "acknowledge_feedback",
          reason: "positive_feedback",
        },
      };
    }

    if (u.coarseIntent === "greeting") {
      return {
        stage: "greeting",
        nextBestAction: { type: "greet", reason: "greeting_phrase" },
      };
    }

    if (
      u.coarseIntent === "product_question" ||
      u.coarseIntent === "price_question" ||
      u.coarseIntent === "policy_question"
    ) {
      return {
        stage: "support",
        nextBestAction: {
          type: "answer_question",
          reason: u.coarseIntent,
        },
      };
    }

    if (loaded.cartItemCount > 0 && u.buyingIntentStrong) {
      return {
        stage: "order_draft",
        nextBestAction: {
          type: "confirm_order_draft",
          reason: "cart_nonempty_and_buying_intent",
        },
      };
    }

    if (u.coarseIntent === "order_intent") {
      return {
        stage: "discovery",
        nextBestAction: {
          type: "clarify",
          reason: "order_intent_need_detail",
        },
      };
    }

    if (u.resolutionSignal !== "none") {
      return {
        stage: "selection",
        nextBestAction: {
          type: "clarify",
          reason: `resolution:${u.resolutionSignal}`,
        },
      };
    }

    return {
      stage: "discovery",
      nextBestAction: { type: "clarify", reason: "fallback_ambiguous" },
    };
  }

  /** Maps coarse intent to v2 stage when no cart conflict */
  static stageForIntent(intent: CoarseIntentV2): SalesStageV2 {
    if (intent === "greeting" || intent === "small_talk") return "greeting";
    if (intent === "complaint") return "complaint";
    if (
      intent === "product_question" ||
      intent === "price_question" ||
      intent === "policy_question"
    ) {
      return "support";
    }
    return "discovery";
  }
}
