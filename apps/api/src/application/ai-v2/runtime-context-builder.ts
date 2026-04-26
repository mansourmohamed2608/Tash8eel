import type { Merchant } from "../../domain/entities/merchant.entity";
import type { RagContextV2 } from "./ai-v2.types";
import type {
  AiSalesState,
  MerchantFactV2,
  RuntimeCatalogFactV2,
  RuntimeBusinessRuleFactV2,
  RuntimeContextV2,
  RuntimeKbFactV2,
  RuntimeOfferFactV2,
  RuntimeMessageV2,
  RuntimeTaskRulesV2,
} from "./ai-v2.types";
import type { LoadedConversationStateV2 } from "./ai-v2.types";

const STRICT_TASK_RULES: RuntimeTaskRulesV2 = {
  answerAsHumanStoreOwner: true,
  answerCustomerQuestionFirst: true,
  doNotInventFacts: true,
  doNotAnswerOffTopicGeneralKnowledge: true,
  askOneUsefulQuestionMax: true,
  doNotGreetEveryTurn: true,
  doNotResetConversation: true,
  useMerchantFactsOnlyForPhoneAddressPaymentOffersPricesPolicies: true,
  requireToolSuccessBeforeCompletionClaims: true,
};

export class RuntimeContextBuilderV2 {
  static build(input: {
    merchant: Merchant;
    loaded: LoadedConversationStateV2;
    salesState: AiSalesState;
    rag: RagContextV2;
  }): RuntimeContextV2 {
    const last20Messages: RuntimeMessageV2[] = Array.isArray(
      input.loaded.last20Messages,
    )
      ? (input.loaded.last20Messages as RuntimeMessageV2[])
      : [];

    const merchantFacts: MerchantFactV2[] =
      buildMerchantFactsFromMerchantEntity(input.merchant);

    const ragFacts = {
      catalogFacts: (input.rag.catalogFacts || []).map(
        (c): RuntimeCatalogFactV2 => ({
          id: `cat:${c.catalogItemId}`,
          type: "catalog",
          catalogItemId: c.catalogItemId,
          name: c.name,
          price: c.price ?? null,
          availability: c.availability ?? null,
          description: null,
          category: null,
          confidence: c.confidence,
        }),
      ),
      kbFacts: (input.rag.kbFacts || []).map(
        (k): RuntimeKbFactV2 => ({
          id: `kb:${k.chunkId}`,
          type: "kb",
          text: k.text,
          visibility: "public",
          confidence: k.confidence,
        }),
      ),
      offerFacts: (input.rag.offerFacts || []).map(
        (o, idx): RuntimeOfferFactV2 => ({
          id: `offer:${o.offerId || idx + 1}`,
          title: o.title,
          details: o.details,
          validUntil: o.validUntil ?? null,
          source: o.source,
        }),
      ),
      businessRuleFacts: (input.rag.businessRuleFacts || []).map(
        (r): RuntimeBusinessRuleFactV2 => ({
          id: `br:${r.key}`,
          key: r.key,
          value: r.value,
          source: r.source,
        }),
      ),
    };

    return {
      currentCustomerMessage: String(input.loaded.customerMessage || ""),
      last20Messages,
      olderSummary: input.loaded.olderSummary ?? null,
      aiV2State: input.salesState,
      merchantFacts,
      ragFacts,
      activeQuestion: input.salesState.activeQuestion ?? null,
      selectedItems: input.salesState.selectedItems ?? [],
      orderDraft: input.salesState.orderDraft ?? null,
      complaintState: input.salesState.complaintState ?? null,
      answeredQuestions: input.salesState.answeredQuestions ?? [],
      knownFacts:
        (input.salesState.knownFacts as Record<string, unknown>) || ({} as any),
      lastRecommendationSummary:
        input.salesState.lastRecommendationSummary ?? null,
      lastRecommendationHash: input.salesState.lastRecommendationHash ?? null,
      taskRules: STRICT_TASK_RULES,
    };
  }
}

function buildMerchantFactsFromMerchantEntity(
  merchant: Merchant,
): MerchantFactV2[] {
  const facts: MerchantFactV2[] = [];
  if (merchant?.name) {
    facts.push({
      id: "mf:merchant_name",
      type: "merchant_name",
      value: String(merchant.name),
      source: "merchant_profile",
    });
  }
  if ((merchant as any)?.whatsappNumber) {
    facts.push({
      id: "mf:phone",
      type: "phone",
      value: String((merchant as any).whatsappNumber),
      source: "merchant_profile",
    });
  }
  if ((merchant as any)?.address) {
    facts.push({
      id: "mf:address",
      type: "address",
      value: String((merchant as any).address),
      source: "merchant_profile",
    });
  }
  if ((merchant as any)?.workingHours) {
    facts.push({
      id: "mf:working_hours",
      type: "working_hours",
      value: String((merchant as any).workingHours),
      source: "merchant_profile",
    });
  }

  const kb = (merchant as any)?.knowledgeBase || {};
  const businessInfo = kb?.businessInfo || {};
  const policies = businessInfo?.policies || {};

  const paymentMethods = Array.isArray(policies.paymentMethods)
    ? policies.paymentMethods.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  for (const method of paymentMethods) {
    facts.push({
      id: `mf:payment_method:${method.toLowerCase().replace(/\s+/g, "_")}`,
      type: "payment_method",
      value: method,
      source: "merchant_settings",
    });
  }

  if (
    typeof policies.returnPolicy === "string" &&
    policies.returnPolicy.trim()
  ) {
    facts.push({
      id: "mf:return_rule",
      type: "return_rule",
      value: policies.returnPolicy.trim(),
      source: "merchant_settings",
    });
  }
  if (
    typeof policies.deliveryInfo === "string" &&
    policies.deliveryInfo.trim()
  ) {
    facts.push({
      id: "mf:delivery_rule",
      type: "delivery_rule",
      value: policies.deliveryInfo.trim(),
      source: "merchant_settings",
    });
  }
  if (
    typeof policies.generalPolicy === "string" &&
    policies.generalPolicy.trim()
  ) {
    facts.push({
      id: "mf:policy:general",
      type: "policy",
      value: policies.generalPolicy.trim(),
      source: "merchant_settings",
    });
  }
  return facts;
}
