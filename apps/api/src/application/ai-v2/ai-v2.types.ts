/**
 * AI Reply Engine v2 shared contracts.
 *
 * v2 state is persisted only under conversation.context.aiV2 so rollback to v1
 * remains safe.
 */

import type { LlmResult } from "../llm/llm.service";
import type { OutboundMediaAttachment } from "../adapters/channel.adapter.interface";

export type SalesStageV2 =
  | "greeting"
  | "discovery"
  | "recommendation"
  | "selection"
  | "quote"
  | "order_draft"
  | "checkout"
  | "support"
  | "complaint"
  | "after_sales"
  | "off_topic";

export type CustomerLanguageV2 = "ar" | "en" | "mixed";

export type CustomerEmotionV2 =
  | "neutral"
  | "interested"
  | "hesitant"
  | "confused"
  | "frustrated"
  | "angry"
  | "happy"
  | "complaining";

export type UnderstandingDomainV2 =
  | "store_related"
  | "small_talk"
  | "off_topic_general";

export type IntentTagV2 =
  | "greeting"
  | "small_talk"
  | "product_question"
  | "recommendation_request"
  | "price_question"
  | "availability_question"
  | "offer_discount_question"
  | "buying_intent"
  | "selection_answer"
  | "quantity_answer"
  | "objection_price"
  | "complaint"
  | "angry_escalation"
  | "manager_request"
  | "feedback_positive"
  | "feedback_negative"
  | "order_status_question"
  | "payment_question"
  | "delivery_question"
  | "contact_question"
  | "location_question"
  | "policy_question"
  | "support_question"
  | "off_topic_general"
  | "vague_followup";

export type NextBestActionTypeV2 =
  | "greet"
  | "answer_question"
  | "recommend"
  | "compare"
  | "ask_preference"
  | "ask_quantity"
  | "ask_variant"
  | "quote"
  | "confirm_order_draft"
  | "ask_delivery"
  | "ask_payment"
  | "handle_objection"
  | "handle_complaint"
  | "acknowledge_feedback"
  | "support_answer"
  | "reassure"
  | "clarify"
  | "de_escalate"
  | "update_order"
  | "create_order_draft"
  | "redirect_off_topic";

export interface NextBestActionV2 {
  type: NextBestActionTypeV2;
  reason: string;
}

export interface SelectedItemV2 {
  catalogItemId?: string;
  label: string;
  quantity?: number;
  variant?: string;
  confidence: number;
  source: "customer" | "catalog" | "ai" | "active_question";
}

export interface ActiveQuestionV2 {
  kind:
    | "choice"
    | "quantity"
    | "budget"
    | "variant"
    | "date"
    | "delivery"
    | "payment"
    | "confirmation"
    | "support"
    | "complaint"
    | "other";
  text: string;
  options?: Array<{
    label: string;
    catalogItemId?: string;
    value?: unknown;
  }>;
  askedAt: string;
}

export interface AnsweredQuestionV2 {
  kind: string;
  value: unknown;
  confidence?: number;
  answeredAt: string;
}

export interface OrderDraftItemV2 {
  catalogItemId?: string;
  label: string;
  quantity?: number;
  variant?: string;
  source: "customer" | "catalog" | "ai" | "active_question";
}

export type OrderDraftStatusV2 =
  | "collecting"
  | "ready_to_confirm"
  | "confirmed"
  | "tool_unavailable";

export interface OrderDraftV2 {
  items: OrderDraftItemV2[];
  quantity?: number;
  deliveryAddress?: string;
  paymentMethod?: string;
  status: OrderDraftStatusV2;
  missingFields: string[];
  backendOrderId?: string;
  backendOrderNumber?: string;
}

export interface ComplaintStateV2 {
  status: "collecting_details" | "record_unavailable" | "recorded" | "resolved";
  kind?:
    | "quality"
    | "delay"
    | "wrong_item"
    | "return_refund"
    | "rude_service"
    | "other";
  requestedByCustomer: boolean;
  summary?: string;
  requiredFields: Array<"order_number" | "phone" | "photo" | "details">;
  providedFields: string[];
  lastAsked?: string;
}

export interface AiSalesState {
  version: 2;
  engineVersion: 2;
  dialogTurnSeq: number;
  salesStage: SalesStageV2;
  /** Compatibility alias while inbox/v1 bridge still expects a stage-like field. */
  stage: SalesStageV2;
  language: CustomerLanguageV2;
  customerEmotion: CustomerEmotionV2;
  customerGoal?: string | null;
  knownFacts: Record<string, unknown>;
  selectedItems: SelectedItemV2[];
  activeQuestion?: ActiveQuestionV2;
  answeredQuestions: AnsweredQuestionV2[];
  orderDraft?: OrderDraftV2;
  complaintState?: ComplaintStateV2;
  missingFields: string[];
  lastCustomerIntent?: string;
  lastAskedQuestionKind?: string;
  lastRecommendationSummary?: string | null;
  lastRecommendationHash?: string | null;
  lastComplaintSummary?: string;
  lastFeedbackSummary?: string;
  lastQuoteSummary?: string;
  nextBestAction: NextBestActionV2;
}

export type AiV2PersistedState = AiSalesState;

export interface CatalogFactV2 {
  catalogItemId: string;
  sku?: string;
  name: string;
  description?: string;
  price?: number;
  availability?: string;
  customerFacingName: string;
  customerFacingDescription?: string;
  customerFacingPrice?: number;
  customerFacingAvailability?: string;
  customerVisibleSku?: boolean;
  sourceLabel?: string;
  isFixture?: boolean;
  confidence: number;
  source: "catalog";
}

export interface KbFactV2 {
  chunkId: string;
  text: string;
  visibility: "public";
  confidence: number;
  source: "kb";
}

export interface OfferFactV2 {
  offerId?: string;
  title: string;
  details: string;
  validUntil?: string;
  source: "merchant_settings" | "catalog" | "kb";
}

export interface BusinessRuleFactV2 {
  key: string;
  value: string;
  source: "merchant_settings" | "kb";
}

export interface RagContextV2 {
  catalogFacts: CatalogFactV2[];
  kbFacts: KbFactV2[];
  offerFacts: OfferFactV2[];
  businessRuleFacts: BusinessRuleFactV2[];
  unavailableFacts: string[];
  confidence: number;
}

export interface AnswerToActiveQuestionV2 {
  kind: string;
  value: unknown;
  confidence: number;
}

export interface MessageUnderstandingV2 {
  domain: UnderstandingDomainV2;
  language: CustomerLanguageV2;
  intentTags: IntentTagV2[];
  customerGoal: string | null;
  customerEmotion: CustomerEmotionV2;
  mentionedItems: string[];
  mentionedPreferences: Record<string, unknown>;
  answerToActiveQuestion: AnswerToActiveQuestionV2 | null;
  buyingSignal: boolean;
  needsStoreAnswer: boolean;
  shouldGreet: boolean;
  reason: string;
  confidence: number;
  usedOpenAI: boolean;
  fallbackUsed: boolean;
  errorCode?: string;
}

export type OperatorModeV2 =
  | "friendly_greeting"
  | "helpful_answer"
  | "soft_recommendation"
  | "confident_recommendation"
  | "comparison"
  | "objection_handling"
  | "complaint_recovery"
  | "manager_apology"
  | "clarification"
  | "order_taking"
  | "checkout"
  | "after_sales_support"
  | "feedback_ack"
  | "reassurance"
  | "calm_de_escalate";

export interface EmotionPolicyOutputV2 {
  customerEmotion: CustomerEmotionV2;
  empathyFirst: boolean;
  sellingSuppressed: boolean;
  toneNotes: string[];
}

export interface HumanOperatorPolicyOutputV2 {
  mode: OperatorModeV2;
  toneDialect: string;
  warmth: number;
  emojiBudget: number;
}

export type ToolActionNameV2 =
  | "searchCatalog"
  | "getCatalogItem"
  | "calculateQuote"
  | "createDraftOrder"
  | "updateDraftOrder"
  | "getMerchantPaymentSettings"
  | "searchPublicKB"
  | "getBusinessRules"
  | "getOrderStatus"
  | "recordComplaintNote"
  | "recordCustomerFeedback"
  | "attachProductMedia"
  | "verifyPaymentProof";

export interface ToolActionResultV2 {
  actionName: ToolActionNameV2;
  available: boolean;
  attempted: boolean;
  success: boolean;
  resultFactIds: string[];
  safeMessage: string | null;
  errorCode: string | null;
}

export type PlannedToolActionStatusV2 =
  | "needed"
  | "not_available"
  | "already_done"
  | "done"
  | "failed";

export interface PlannedToolActionV2 {
  actionName: ToolActionNameV2;
  reason: string;
  status: PlannedToolActionStatusV2;
}

export interface ReplyPlanV2 {
  nextBestAction: NextBestActionTypeV2;
  answerFirst: boolean;
  allowedToAskDelivery: boolean;
  allowedToAskPayment: boolean;
  maxQuestions: 1;
  mustNotInvent: string[];
  allowedFactIds: string[];
  selectedItemsSummary: string | null;
  orderDraftSummary: string | null;
  complaintSummary: string | null;
  activeQuestionSummary: string | null;
  forbiddenRepeats: string[];
  doNotGreetAgain: boolean;
  offTopicRedirectRequired: boolean;
  toolActions: PlannedToolActionV2[];
  rendererInstructions: string[];
}

export interface LoadedConversationStateV2 {
  merchantId: string;
  conversationId: string;
  customerMessage: string;
  channel: "whatsapp" | "messenger" | "instagram";
  conversationSummary?: string;
  olderSummary?: string | null;
  priorAiV2: Partial<AiV2PersistedState> | null;
  cartItemCount: number;
  recentTurnsText: string[];
  last20Messages?: RuntimeMessageV2[];
}

export interface AiV2RenderOutput {
  customer_reply: string;
  state_patch: Record<string, never>;
  used_fact_ids: string[];
  risk_flags: string[];
  confidence: number;
}

export interface AiV2RunDebug {
  understanding: MessageUnderstandingV2;
  ragSummary: { catalogCount: number; kbCount: number };
  plan: ReplyPlanV2;
  toolResults: ToolActionResultV2[];
  validationFailures: string[];
  usedFactIds: string[];
  fallbackUsed: boolean;
}

export interface AiV2RunResult {
  replyText: string;
  llmResultAdapter: LlmResult;
  contextPatch: Record<string, unknown>;
  mediaAttachments: OutboundMediaAttachment[];
  debug: AiV2RunDebug;
  tokensUsed: number;
  llmUsed: boolean;
}

export type RuntimeMessageRoleV2 =
  | "customer"
  | "assistant"
  | "merchant"
  | "system";

export interface RuntimeMessageV2 {
  role: RuntimeMessageRoleV2;
  text: string;
  createdAt?: string;
}

export type MerchantFactTypeV2 =
  | "merchant_name"
  | "phone"
  | "address"
  | "working_hours"
  | "payment_method"
  | "policy"
  | "delivery_rule"
  | "return_rule"
  | "business_info";

export interface MerchantFactV2 {
  id: string;
  type: MerchantFactTypeV2;
  value: string;
  source: "merchant_profile" | "merchant_settings" | "kb";
}

export interface RuntimeCatalogFactV2 {
  id: string;
  type: "catalog";
  catalogItemId?: string;
  sku?: string | null;
  name: string;
  price?: number | string | null;
  availability?: string | null;
  description?: string | null;
  category?: string | null;
  customerFacingName: string;
  customerFacingDescription?: string | null;
  customerFacingPrice?: number | string | null;
  customerFacingAvailability?: string | null;
  customerVisibleSku?: boolean;
  sourceLabel?: string | null;
  isFixture?: boolean;
  confidence?: number;
}

export interface RuntimeCustomerSafeCatalogFactV2 {
  id: string;
  type: "catalog";
  name: string;
  description?: string | null;
  price?: number | string | null;
  availability?: string | null;
  sku?: string | null;
}

export interface RuntimeCustomerSafeFactsV2 {
  catalogFacts: RuntimeCustomerSafeCatalogFactV2[];
  merchantFacts: Array<{
    id: string;
    type: MerchantFactTypeV2;
    value: string;
  }>;
}

export interface RuntimeKbFactV2 {
  id: string;
  type: "kb";
  text: string;
  visibility: "public";
  confidence?: number;
}

export interface RuntimeOfferFactV2 {
  id: string;
  title: string;
  details: string;
  validUntil?: string | null;
  source: "merchant_settings" | "catalog" | "kb";
}

export interface RuntimeBusinessRuleFactV2 {
  id: string;
  key: string;
  value: string;
  source: "merchant_settings" | "kb";
}

export interface RuntimeRagFactsV2 {
  catalogFacts: RuntimeCatalogFactV2[];
  kbFacts: RuntimeKbFactV2[];
  offerFacts: RuntimeOfferFactV2[];
  businessRuleFacts: RuntimeBusinessRuleFactV2[];
}

export interface RuntimeTaskRulesV2 {
  answerAsHumanStoreOwner: true;
  answerCustomerQuestionFirst: true;
  doNotInventFacts: true;
  doNotAnswerOffTopicGeneralKnowledge: true;
  askOneUsefulQuestionMax: true;
  doNotGreetEveryTurn: true;
  doNotResetConversation: true;
  useMerchantFactsOnlyForPhoneAddressPaymentOffersPricesPolicies: true;
  requireToolSuccessBeforeCompletionClaims: true;
}

export interface RuntimeContextV2 {
  currentCustomerMessage: string;
  last20Messages: RuntimeMessageV2[];
  olderSummary?: string | null;
  aiV2State: AiSalesState;
  merchantFacts: MerchantFactV2[];
  ragFacts: RuntimeRagFactsV2;
  customerSafeFacts: RuntimeCustomerSafeFactsV2;
  activeQuestion?: ActiveQuestionV2 | null;
  selectedItems: SelectedItemV2[];
  orderDraft?: OrderDraftV2 | null;
  complaintState?: ComplaintStateV2 | null;
  answeredQuestions: AnsweredQuestionV2[];
  knownFacts: Record<string, unknown>;
  lastRecommendationSummary?: string | null;
  lastRecommendationHash?: string | null;
  taskRules: RuntimeTaskRulesV2;
}

export const EMPTY_RAG_CONTEXT_V2: RagContextV2 = {
  catalogFacts: [],
  kbFacts: [],
  offerFacts: [],
  businessRuleFacts: [],
  unavailableFacts: [],
  confidence: 0,
};
