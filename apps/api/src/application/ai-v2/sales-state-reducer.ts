import {
  AiSalesState,
  AiV2PersistedState,
  CustomerEmotionV2,
  LoadedConversationStateV2,
  MessageUnderstandingV2,
  NextBestActionV2,
  SalesStageV2,
} from "./ai-v2.types";

/**
 * Merges prior persisted v2 state with message understanding and loader facts.
 */
export class SalesStateReducerV2 {
  static reduce(input: {
    loaded: LoadedConversationStateV2;
    understanding: MessageUnderstandingV2;
    nextBestAction: NextBestActionV2;
    stage: SalesStageV2;
    customerEmotion: CustomerEmotionV2;
  }): AiSalesState {
    const prior = input.loaded.priorAiV2 || {};
    const seq =
      typeof prior.dialogTurnSeq === "number" &&
      Number.isFinite(prior.dialogTurnSeq)
        ? prior.dialogTurnSeq + 1
        : 1;

    return {
      engineVersion: 2,
      dialogTurnSeq: seq,
      stage: input.stage,
      language: input.understanding.language,
      customerEmotion: input.customerEmotion,
      customerGoal: prior.customerGoal as string | undefined,
      knownFacts: {
        ...(typeof prior.knownFacts === "object" && prior.knownFacts
          ? (prior.knownFacts as Record<string, unknown>)
          : {}),
        lastCoarseIntent: input.understanding.coarseIntent,
      },
      selectedItems: Array.isArray(prior.selectedItems)
        ? (prior.selectedItems as AiSalesState["selectedItems"])
        : [],
      activeQuestion: prior.activeQuestion as AiSalesState["activeQuestion"],
      answeredQuestions: Array.isArray(prior.answeredQuestions)
        ? (prior.answeredQuestions as AiSalesState["answeredQuestions"])
        : [],
      missingFields: Array.isArray(prior.missingFields)
        ? (prior.missingFields as string[])
        : [],
      lastRecommendationHash:
        typeof prior.lastRecommendationHash === "string"
          ? prior.lastRecommendationHash
          : undefined,
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
      nextBestAction: input.nextBestAction,
    };
  }

  static toPersisted(state: AiSalesState): AiV2PersistedState {
    return { ...state };
  }
}
