/**
 * AI Reply Engine v2 — shared types.
 * Canonical sales state lives under conversation.context.aiV2.
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
  | "after_sales";

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

export type CoarseIntentV2 =
  | "greeting"
  | "small_talk"
  | "product_question"
  | "price_question"
  | "policy_question"
  | "complaint"
  | "feedback_positive"
  | "feedback_negative"
  | "order_intent"
  | "ambiguous"
  | "other";

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
  | "create_order_draft";

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
  source: "customer" | "catalog" | "ai";
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
  options?: string[];
  askedAt: string;
}

export interface AnsweredQuestionV2 {
  kind: string;
  value: unknown;
  answeredAt: string;
}

/** Runtime sales state (v2 reducer output). */
export interface AiSalesState {
  engineVersion: 2;
  dialogTurnSeq: number;
  stage: SalesStageV2;
  language: CustomerLanguageV2;
  customerEmotion: CustomerEmotionV2;
  customerGoal?: string;
  knownFacts: Record<string, unknown>;
  selectedItems: SelectedItemV2[];
  activeQuestion?: ActiveQuestionV2;
  answeredQuestions: AnsweredQuestionV2[];
  missingFields: string[];
  lastRecommendationHash?: string;
  lastComplaintSummary?: string;
  lastFeedbackSummary?: string;
  lastQuoteSummary?: string;
  nextBestAction: NextBestActionV2;
}

/** Persisted shape (JSON-serializable). */
export type AiV2PersistedState = Omit<AiSalesState, never>;

export interface CatalogFactV2 {
  catalogItemId: string;
  name: string;
  price?: number;
  availability?: string;
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

export interface MessageUnderstandingV2 {
  language: CustomerLanguageV2;
  coarseIntent: CoarseIntentV2;
  urgency: boolean;
  buyingIntentStrong: boolean;
  resolutionSignal:
    | "none"
    | "ordinal_first"
    | "ordinal_second"
    | "both"
    | "affirmative"
    | "negative"
    | "vague";
  confidence: number;
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

export interface ReplyPlanV2 {
  nextBestAction: NextBestActionV2;
  operator: HumanOperatorPolicyOutputV2;
  emotion: EmotionPolicyOutputV2;
  /** Fact ids the renderer may cite (subset of RagContext). */
  allowedFactIds: string[];
  plannerNotes: string;
}

export interface LoadedConversationStateV2 {
  merchantId: string;
  conversationId: string;
  customerMessage: string;
  channel: "whatsapp" | "messenger" | "instagram";
  conversationSummary?: string;
  priorAiV2: Partial<AiV2PersistedState> | null;
  cartItemCount: number;
  recentTurnsText: string[];
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
  validationFailures: string[];
  usedFactIds: string[];
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
