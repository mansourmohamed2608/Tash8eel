import {
  MessageUnderstandingV2,
  NextBestActionV2,
  SalesStageV2,
} from "./ai-v2.types";
import { LoadedConversationStateV2 } from "./ai-v2.types";

export class SalesPolicyV2 {
  static decide(input: {
    loaded: LoadedConversationStateV2;
    understanding: MessageUnderstandingV2;
  }): { stage: SalesStageV2; nextBestAction: NextBestActionV2 } {
    const { understanding: u, loaded } = input;
    const has = (tag: string) => u.intentTags.includes(tag as any);
    const priorStage = (loaded.priorAiV2?.salesStage ||
      loaded.priorAiV2?.stage) as SalesStageV2 | undefined;

    if (u.domain === "off_topic_general" || has("off_topic_general")) {
      return {
        stage: "off_topic",
        nextBestAction: {
          type: "redirect_off_topic",
          reason: "off_topic_general",
        },
      };
    }

    if (has("complaint") || has("angry_escalation") || has("manager_request")) {
      return {
        stage: "complaint",
        nextBestAction: {
          type: "handle_complaint",
          reason: has("manager_request") ? "manager_request" : "complaint",
        },
      };
    }

    if (has("feedback_positive") || has("feedback_negative")) {
      return {
        stage: "support",
        nextBestAction: {
          type: "acknowledge_feedback",
          reason: has("feedback_positive")
            ? "positive_feedback"
            : "negative_feedback",
        },
      };
    }

    if (has("greeting") && !u.needsStoreAnswer && !u.buyingSignal) {
      if (
        priorStage &&
        priorStage !== "greeting" &&
        priorStage !== "off_topic" &&
        priorStage !== "after_sales"
      ) {
        return {
          stage: priorStage,
          nextBestAction: {
            type: "clarify",
            reason: "greeting_with_existing_context",
          },
        };
      }
      return {
        stage: "greeting",
        nextBestAction: { type: "greet", reason: "greeting_only" },
      };
    }

    if (has("order_status_question")) {
      return {
        stage: "after_sales",
        nextBestAction: {
          type: "support_answer",
          reason: "order_status_requires_tool",
        },
      };
    }

    if (
      has("payment_question") ||
      has("delivery_question") ||
      has("contact_question") ||
      has("location_question") ||
      has("policy_question") ||
      has("support_question")
    ) {
      return {
        stage: "support",
        nextBestAction: {
          type: "support_answer",
          reason: "direct_store_question",
        },
      };
    }

    if (has("selection_answer")) {
      return {
        stage: "selection",
        nextBestAction: {
          type: "update_order",
          reason: "selection_answer",
        },
      };
    }

    if (u.buyingSignal || has("buying_intent")) {
      return {
        stage: "order_draft",
        nextBestAction: {
          type: "create_order_draft",
          reason: "buying_signal",
        },
      };
    }

    if (has("price_question")) {
      return {
        stage: "quote",
        nextBestAction: { type: "quote", reason: "price_question" },
      };
    }

    if (has("recommendation_request") || has("product_question")) {
      return {
        stage: "recommendation",
        nextBestAction: {
          type: has("recommendation_request") ? "recommend" : "answer_question",
          reason: has("recommendation_request")
            ? "recommendation_request"
            : "product_question",
        },
      };
    }

    if (has("objection_price")) {
      return {
        stage: priorStage || "discovery",
        nextBestAction: {
          type: "handle_objection",
          reason: "price_objection",
        },
      };
    }

    if (has("vague_followup") && priorStage && priorStage !== "off_topic") {
      return {
        stage: priorStage,
        nextBestAction: {
          type: "clarify",
          reason: "vague_followup_with_context",
        },
      };
    }
    if (has("vague_followup")) {
      return {
        stage: "selection",
        nextBestAction: {
          type: "clarify",
          reason: "vague_followup_without_context",
        },
      };
    }

    return {
      stage: priorStage && priorStage !== "greeting" ? priorStage : "discovery",
      nextBestAction: { type: "clarify", reason: "fallback_ambiguous" },
    };
  }
}
