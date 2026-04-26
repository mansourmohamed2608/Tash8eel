import { ActionType } from "../../shared/constants/enums";
import { createLlmResult, LlmResult } from "../llm/llm.service";
import { ValidatedLlmResponse } from "../llm/llm-schema";

function emptyEntities(): NonNullable<
  ValidatedLlmResponse["extracted_entities"]
> {
  return {
    products: null,
    customerName: null,
    phone: null,
    address: null,
    substitutionAllowed: null,
    deliveryPreference: null,
  };
}

function emptyNegotiation(): NonNullable<ValidatedLlmResponse["negotiation"]> {
  return {
    requestedDiscount: null,
    approved: false,
    offerText: null,
    finalPrices: null,
  };
}

/**
 * Builds an inbox-compatible LlmResult from v2 reply text (no cart mutations in wave 1).
 */
export function buildInboxLlmResultFromV2(input: {
  replyText: string;
  reasoning: string;
  isGreeting: boolean;
  tokensUsed: number;
  llmUsed: boolean;
}): LlmResult {
  const response: ValidatedLlmResponse = {
    actionType: input.isGreeting
      ? ActionType.GREET
      : ActionType.ASK_CLARIFYING_QUESTION,
    reply_ar: input.replyText,
    extracted_entities: emptyEntities(),
    missing_slots: null,
    negotiation: emptyNegotiation(),
    delivery_fee: null,
    confidence: 0.75,
    reasoning: input.reasoning,
  };

  return createLlmResult(response, input.tokensUsed, input.llmUsed);
}
