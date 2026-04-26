import {
  AiSalesState,
  AiV2PersistedState,
  CustomerEmotionV2,
  LoadedConversationStateV2,
  MessageUnderstandingV2,
  NextBestActionV2,
  ReplyPlanV2,
  SalesStageV2,
  SelectedItemV2,
} from "./ai-v2.types";

export class SalesStateReducerV2 {
  static buildBaseState(loaded: LoadedConversationStateV2): AiSalesState {
    const prior = loaded.priorAiV2 || {};
    const stage = (prior.salesStage ||
      prior.stage ||
      "greeting") as SalesStageV2;
    return {
      version: 2,
      engineVersion: 2,
      dialogTurnSeq: Number(prior.dialogTurnSeq || 0) || 0,
      salesStage: stage,
      stage,
      language: (prior.language as any) || "ar",
      customerEmotion: (prior.customerEmotion as any) || "neutral",
      customerGoal:
        typeof prior.customerGoal === "string" ? prior.customerGoal : null,
      knownFacts: objectOrEmpty(prior.knownFacts),
      selectedItems: Array.isArray(prior.selectedItems)
        ? (prior.selectedItems as AiSalesState["selectedItems"])
        : [],
      activeQuestion: prior.activeQuestion as AiSalesState["activeQuestion"],
      answeredQuestions: Array.isArray(prior.answeredQuestions)
        ? (prior.answeredQuestions as AiSalesState["answeredQuestions"])
        : [],
      orderDraft: prior.orderDraft as AiSalesState["orderDraft"],
      complaintState: prior.complaintState as AiSalesState["complaintState"],
      missingFields: Array.isArray(prior.missingFields)
        ? (prior.missingFields as string[])
        : [],
      lastCustomerIntent:
        typeof prior.lastCustomerIntent === "string"
          ? prior.lastCustomerIntent
          : undefined,
      lastAskedQuestionKind:
        typeof prior.lastAskedQuestionKind === "string"
          ? prior.lastAskedQuestionKind
          : undefined,
      lastRecommendationSummary:
        typeof prior.lastRecommendationSummary === "string"
          ? prior.lastRecommendationSummary
          : null,
      lastRecommendationHash:
        typeof prior.lastRecommendationHash === "string"
          ? prior.lastRecommendationHash
          : null,
      lastComplaintSummary:
        typeof prior.lastComplaintSummary === "string"
          ? prior.lastComplaintSummary
          : undefined,
      lastFeedbackSummary:
        typeof prior.lastFeedbackSummary === "string"
          ? prior.lastFeedbackSummary
          : undefined,
      lastQuoteSummary:
        typeof prior.lastQuoteSummary === "string"
          ? prior.lastQuoteSummary
          : undefined,
      nextBestAction: (prior.nextBestAction as NextBestActionV2) || {
        type: "greet",
        reason: "default",
      },
    };
  }

  static reduce(input: {
    loaded: LoadedConversationStateV2;
    understanding: MessageUnderstandingV2;
    nextBestAction: NextBestActionV2;
    stage: SalesStageV2;
    customerEmotion: CustomerEmotionV2;
  }): AiSalesState {
    const priorState = this.buildBaseState(input.loaded);
    const now = new Date().toISOString();
    const seq = priorState.dialogTurnSeq + 1;
    const answer = input.understanding.answerToActiveQuestion;

    let selectedItems = [...priorState.selectedItems];
    let activeQuestion = priorState.activeQuestion;
    let answeredQuestions = [...priorState.answeredQuestions];
    let orderDraft = priorState.orderDraft
      ? {
          ...priorState.orderDraft,
          items: [...(priorState.orderDraft.items || [])],
          missingFields: [...(priorState.orderDraft.missingFields || [])],
        }
      : undefined;
    let complaintState = priorState.complaintState
      ? {
          ...priorState.complaintState,
          requiredFields: [...(priorState.complaintState.requiredFields || [])],
          providedFields: [...(priorState.complaintState.providedFields || [])],
        }
      : undefined;

    if (answer) {
      answeredQuestions.push({
        kind: answer.kind,
        value: answer.value,
        confidence: answer.confidence,
        answeredAt: now,
      });
      if (activeQuestion?.kind === answer.kind || answer.confidence >= 0.8) {
        if (activeQuestion?.kind === "choice") {
          selectedItems = resolveSelectionFromActiveQuestion(
            activeQuestion,
            answer.value,
          );
        }
        if (
          activeQuestion?.kind === "quantity" &&
          typeof answer.value === "number"
        ) {
          selectedItems = selectedItems.map((item) => ({
            ...item,
            quantity: item.quantity ?? Number(answer.value),
          }));
        }
        activeQuestion = undefined;
      }
    }

    if (
      input.understanding.mentionedItems.length > 0 &&
      selectedItems.length === 0
    ) {
      selectedItems = input.understanding.mentionedItems
        .slice(0, 3)
        .map((label) => ({
          label,
          confidence: 0.45,
          source: "customer",
        }));
    }

    if (
      input.understanding.buyingSignal ||
      input.stage === "order_draft" ||
      input.stage === "selection"
    ) {
      orderDraft = orderDraft || {
        items: selectedItems.map((item) => ({
          catalogItemId: item.catalogItemId,
          label: item.label,
          quantity: item.quantity,
          variant: item.variant,
          source: item.source,
        })),
        status: "collecting",
        missingFields: [],
      };
      if (selectedItems.length > 0 && orderDraft.items.length === 0) {
        orderDraft.items = selectedItems.map((item) => ({
          catalogItemId: item.catalogItemId,
          label: item.label,
          quantity: item.quantity,
          variant: item.variant,
          source: item.source,
        }));
      }
    }

    if (
      orderDraft &&
      answer?.kind === "quantity" &&
      typeof answer.value === "number"
    ) {
      orderDraft.quantity = Number(answer.value);
      orderDraft.items = orderDraft.items.map((item) => ({
        ...item,
        quantity: item.quantity ?? Number(answer.value),
      }));
    }

    if (input.stage === "complaint") {
      complaintState = {
        status: complaintState?.status || "collecting_details",
        kind: complaintState?.kind || "other",
        requestedByCustomer: true,
        summary:
          complaintState?.summary ||
          input.understanding.customerGoal ||
          input.loaded.customerMessage.slice(0, 200),
        requiredFields: complaintState?.requiredFields?.length
          ? complaintState.requiredFields
          : ["order_number", "details"],
        providedFields: complaintState?.providedFields || [],
        lastAsked: complaintState?.lastAsked,
      };
    }

    if (orderDraft) {
      const missing: string[] = [];
      if (!orderDraft.items || orderDraft.items.length === 0)
        missing.push("item");
      const hasQuantity =
        typeof orderDraft.quantity === "number" ||
        orderDraft.items.some((item) => typeof item.quantity === "number");
      if (!hasQuantity) missing.push("quantity");
      orderDraft = {
        ...orderDraft,
        missingFields: missing,
        status: missing.length === 0 ? "ready_to_confirm" : orderDraft.status,
      };
    }

    const knownFacts = {
      ...priorState.knownFacts,
      lastDomain: input.understanding.domain,
      lastIntentTags: input.understanding.intentTags,
      lastCustomerMessage: input.loaded.customerMessage,
      lastAnswerToActiveQuestion: answer,
    };

    return {
      ...priorState,
      dialogTurnSeq: seq,
      salesStage: input.stage,
      stage: input.stage,
      language: input.understanding.language,
      customerEmotion: input.customerEmotion,
      customerGoal: input.understanding.customerGoal ?? priorState.customerGoal,
      knownFacts,
      selectedItems,
      activeQuestion,
      answeredQuestions,
      orderDraft,
      complaintState,
      missingFields: orderDraft?.missingFields || [],
      lastCustomerIntent: input.understanding.intentTags[0],
      nextBestAction: input.nextBestAction,
    };
  }

  static applyPlan(state: AiSalesState, plan: ReplyPlanV2): AiSalesState {
    const now = new Date().toISOString();
    let activeQuestion = state.activeQuestion;

    if (!activeQuestion && plan.nextBestAction === "ask_quantity") {
      activeQuestion = {
        kind: "quantity",
        text: "quantity",
        askedAt: now,
      };
    }

    if (!activeQuestion && plan.nextBestAction === "recommend") {
      const options = state.selectedItems.slice(0, 3).map((item) => ({
        label: item.label,
        catalogItemId: item.catalogItemId,
      }));
      if (options.length > 0) {
        activeQuestion = {
          kind: "choice",
          text: "choice",
          options,
          askedAt: now,
        };
      }
    }

    return {
      ...state,
      activeQuestion,
      lastAskedQuestionKind:
        activeQuestion?.kind || state.lastAskedQuestionKind,
    };
  }

  static toPersisted(state: AiSalesState): AiV2PersistedState {
    return { ...state };
  }
}

function resolveSelectionFromActiveQuestion(
  activeQuestion: NonNullable<AiSalesState["activeQuestion"]>,
  value: unknown,
): SelectedItemV2[] {
  const options = activeQuestion.options || [];
  const selectedValues = Array.isArray(value) ? value : [value];
  const selected: SelectedItemV2[] = [];
  for (const selectedValue of selectedValues) {
    const option =
      typeof selectedValue === "string"
        ? options.find(
            (candidate) =>
              candidate.catalogItemId === selectedValue ||
              candidate.label === selectedValue,
          )
        : undefined;
    selected.push({
      catalogItemId: option?.catalogItemId,
      label: option?.label || String(selectedValue),
      confidence: 0.8,
      source: "active_question",
    });
  }
  return selected;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
