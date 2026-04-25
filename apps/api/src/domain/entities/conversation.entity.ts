import { ConversationState } from "../../shared/constants/enums";
import { Cart, CollectedInfo, Address } from "../../shared/schemas";

export interface ConversationContext {
  lastIntent?: string;
  lastActionType?: string;
  negotiationAttempts?: number;
  followupCount?: number;
  isReturningCustomer?: boolean;
  previousOrderCount?: number;
  dialog?: {
    lastIntent?: string;
    filledSlots?: Record<string, unknown>;
    askedSlots?: string[];
    answeredSlots?: string[];
    lastQuestion?: string;
    lastMediaItemIds?: string[];
    lastDecision?: string;
  };
  // SaaS conversation memory (merchant-agnostic)
  businessType?: string;
  businessTypeConfidence?: number;
  customSlots?: Record<string, unknown>;
  slotConfidence?: Record<string, number>;
  stillMissingImportant?: string[];
  suggestedNextStep?: string;
  memorySchema?: unknown;
}

// Lead score signals for AI/deterministic scoring
export interface LeadScoreSignals {
  intentStrength: number;
  priceEngagement: boolean;
  cartValue: number;
  messageCount: number;
  isReturning: boolean;
  urgencyWords: string[];
}

// Next Best Action recommendation
export interface NextBestAction {
  actionType:
    | "followup"
    | "ask_info"
    | "offer_bundle"
    | "offer_discount"
    | "takeover"
    | "close_sale"
    | "none";
  priority: "high" | "medium" | "low";
  descriptionAr: string;
  descriptionEn: string;
  delayHours?: number;
  suggestedMessageAr?: string;
}

export interface Conversation {
  id: string;
  merchantId: string;
  customerId?: string;
  channel?: "whatsapp" | "messenger" | "instagram";
  senderId: string;
  state: ConversationState;
  context: ConversationContext;
  cart: Cart;
  collectedInfo: CollectedInfo;
  missingSlots: string[];
  lastMessageAt?: Date;
  followupCount: number;
  nextFollowupAt?: Date;
  isHumanTakeover?: boolean;
  takenOverBy?: string | null;
  takenOverAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Additional properties
  currentCart?: Cart;
  lastActivityAt?: Date;
  closedAt?: Date;

  // Phase 1: Premium Ops fields
  leadScore?: "HOT" | "WARM" | "COLD" | null;
  leadScoreSignals?: LeadScoreSignals;
  nbaText?: string;
  nbaType?: NextBestAction["actionType"];
  addressConfidence?: number;
  objectionType?:
    | "expensive"
    | "trust"
    | "product_quality"
    | "delivery_cost"
    | "thinking"
    | null;
  requiresConfirmation?: boolean;
  recoveredFromFollowup?: boolean;

  // Long-conversation memory (written by MemoryCompressionService)
  conversationSummary?: string;
  compressedHistory?: unknown;
}

export interface CreateConversationInput {
  id?: string;
  merchantId: string;
  senderId: string;
  channel?: "whatsapp" | "messenger" | "instagram";
  customerId?: string;
}

export interface UpdateConversationInput {
  state?: ConversationState;
  context?: Partial<ConversationContext>;
  cart?: Partial<Cart>;
  collectedInfo?: Partial<CollectedInfo>;
  missingSlots?: string[];
  lastMessageAt?: Date;
  followupCount?: number;
  nextFollowupAt?: Date | null;
  customerId?: string;
  closedAt?: Date;
  isHumanTakeover?: boolean;
  takenOverBy?: string | null;
  takenOverAt?: Date | null;
  // Phase 1: Premium Ops fields
  leadScore?: "HOT" | "WARM" | "COLD" | null;
  leadScoreSignals?: LeadScoreSignals;
  nbaText?: string;
  nbaType?: NextBestAction["actionType"];
  addressConfidence?: number;
  objectionType?:
    | "expensive"
    | "trust"
    | "product_quality"
    | "delivery_cost"
    | "thinking"
    | null;
  requiresConfirmation?: boolean;
  recoveredFromFollowup?: boolean;
  // Long-conversation memory
  conversationSummary?: string;
  compressedHistory?: unknown;
}
