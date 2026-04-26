import { createHash } from "crypto";
import {
  MessageUnderstandingV2,
  PlannedToolActionV2,
  ReplyPlanV2,
  RuntimeContextV2,
  ToolActionNameV2,
} from "./ai-v2.types";

export class ReplyPlannerV2 {
  static plan(input: {
    runtimeContext: RuntimeContextV2;
    understanding: MessageUnderstandingV2;
  }): ReplyPlanV2 {
    const { runtimeContext: ctx, understanding } = input;
    const stage = ctx.aiV2State.salesStage;
    const has = (tag: string) => understanding.intentTags.includes(tag as any);
    const toolActions = buildToolActions(ctx, understanding);
    const allowedFactIds = collectAllowedFactIds(ctx);
    const recHash = recommendationHashFromRuntime(ctx);

    const nextBestAction =
      stage === "off_topic"
        ? "redirect_off_topic"
        : stage === "complaint"
          ? "handle_complaint"
          : has("order_status_question")
            ? "support_answer"
            : stage === "quote"
              ? "quote"
              : stage === "order_draft"
                ? "create_order_draft"
                : stage === "selection"
                  ? "update_order"
                  : has("recommendation_request")
                    ? "recommend"
                    : has("product_question")
                      ? "answer_question"
                      : has("greeting") && understanding.shouldGreet
                        ? "greet"
                        : "clarify";

    return {
      nextBestAction,
      answerFirst: true,
      allowedToAskDelivery: stage === "order_draft" || stage === "checkout",
      allowedToAskPayment: stage === "checkout",
      maxQuestions: 1,
      mustNotInvent: [
        "phone",
        "address",
        "payment_method",
        "offer_discount",
        "policy",
        "price",
        "order_status",
        "payment_verification",
        "order_completion",
        "refund_return_completion",
      ],
      allowedFactIds,
      selectedItemsSummary: summarizeSelectedItems(ctx),
      orderDraftSummary: summarizeOrderDraft(ctx),
      complaintSummary: summarizeComplaint(ctx),
      activeQuestionSummary: summarizeActiveQuestion(ctx),
      forbiddenRepeats: [
        "generic_how_can_i_help",
        ...(recHash ? [`recommendation_hash:${recHash}`] : []),
      ],
      doNotGreetAgain: ctx.aiV2State.dialogTurnSeq > 0,
      offTopicRedirectRequired:
        understanding.domain === "off_topic_general" ||
        understanding.intentTags.includes("off_topic_general"),
      toolActions,
      rendererInstructions: buildRendererInstructions(ctx, understanding),
    };
  }
}

function buildToolActions(
  ctx: RuntimeContextV2,
  understanding: MessageUnderstandingV2,
): PlannedToolActionV2[] {
  const actions: PlannedToolActionV2[] = [];
  const add = (actionName: ToolActionNameV2, reason: string) => {
    if (!actions.some((a) => a.actionName === actionName)) {
      actions.push({ actionName, reason, status: "needed" });
    }
  };
  const has = (tag: string) => understanding.intentTags.includes(tag as any);

  if (has("product_question") || has("recommendation_request")) {
    add("searchCatalog", "customer_asked_about_products");
  }
  if (has("price_question") || ctx.orderDraft) {
    add("calculateQuote", "price_or_draft_context");
  }
  if (has("payment_question")) {
    add("getMerchantPaymentSettings", "payment_question");
  }
  if (has("policy_question") || has("support_question")) {
    add("searchPublicKB", "support_or_policy_question");
    add("getBusinessRules", "support_or_policy_question");
  }
  if (has("order_status_question")) {
    add("getOrderStatus", "order_status_question");
  }
  if (ctx.aiV2State.salesStage === "order_draft") {
    add(
      ctx.orderDraft?.backendOrderId ? "updateDraftOrder" : "createDraftOrder",
      "order_draft_stage",
    );
  }
  if (ctx.aiV2State.salesStage === "complaint") {
    add("recordComplaintNote", "complaint_stage");
  }
  if (has("feedback_positive") || has("feedback_negative")) {
    add("recordCustomerFeedback", "feedback_intent");
  }
  if (
    has("payment_question") &&
    /proof|إيصال|ايصال|صورة/i.test(ctx.currentCustomerMessage)
  ) {
    add("verifyPaymentProof", "payment_proof_mentioned");
  }
  return actions;
}

function collectAllowedFactIds(ctx: RuntimeContextV2): string[] {
  return [
    ...ctx.merchantFacts.map((f) => f.id),
    ...ctx.ragFacts.catalogFacts.map((f) => f.id),
    ...ctx.ragFacts.kbFacts.map((f) => f.id),
    ...ctx.ragFacts.offerFacts.map((f) => f.id),
    ...ctx.ragFacts.businessRuleFacts.map((f) => f.id),
  ];
}

function summarizeSelectedItems(ctx: RuntimeContextV2): string | null {
  if (!ctx.selectedItems.length) return null;
  return ctx.selectedItems
    .slice(0, 5)
    .map((item) => `${item.label}${item.quantity ? ` x${item.quantity}` : ""}`)
    .join(", ");
}

function summarizeOrderDraft(ctx: RuntimeContextV2): string | null {
  if (!ctx.orderDraft) return null;
  return JSON.stringify({
    status: ctx.orderDraft.status,
    itemCount: ctx.orderDraft.items.length,
    missingFields: ctx.orderDraft.missingFields,
  });
}

function summarizeComplaint(ctx: RuntimeContextV2): string | null {
  if (!ctx.complaintState) return null;
  return JSON.stringify({
    status: ctx.complaintState.status,
    kind: ctx.complaintState.kind,
    providedFields: ctx.complaintState.providedFields,
  });
}

function summarizeActiveQuestion(ctx: RuntimeContextV2): string | null {
  if (!ctx.activeQuestion) return null;
  return JSON.stringify({
    kind: ctx.activeQuestion.kind,
    optionsCount: ctx.activeQuestion.options?.length || 0,
  });
}

function buildRendererInstructions(
  ctx: RuntimeContextV2,
  understanding: MessageUnderstandingV2,
): string[] {
  const instructions = [
    "Answer as a human store operator, not as a generic assistant.",
    "Use only allowed facts and successful tool results for business truth.",
    "Ask at most one useful question.",
    "Answer the customer's concrete question before asking anything.",
  ];
  if (ctx.aiV2State.dialogTurnSeq > 0) {
    instructions.push(
      "Do not greet again unless the customer only greeted and no context exists.",
    );
  }
  if (understanding.domain === "off_topic_general") {
    instructions.push(
      "Redirect to store/products/orders only; do not answer general knowledge.",
    );
  }
  return instructions;
}

export function recommendationHashFromRuntime(ctx: RuntimeContextV2): string {
  const top = ctx.ragFacts.catalogFacts
    .slice(0, 5)
    .map((fact) => fact.catalogItemId || fact.name)
    .join("|");
  if (!top) return "";
  return createHash("sha256").update(top).digest("hex").slice(0, 16);
}
