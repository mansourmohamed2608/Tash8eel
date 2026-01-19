import { ConversationState } from '../../shared/constants/enums';
import { Cart, CollectedInfo, Address } from '../../shared/schemas';

export interface ConversationContext {
  lastIntent?: string;
  lastActionType?: string;
  negotiationAttempts?: number;
  followupCount?: number;
  isReturningCustomer?: boolean;
  previousOrderCount?: number;
}

export interface Conversation {
  id: string;
  merchantId: string;
  customerId?: string;
  senderId: string;
  state: ConversationState;
  context: ConversationContext;
  cart: Cart;
  collectedInfo: CollectedInfo;
  missingSlots: string[];
  lastMessageAt?: Date;
  followupCount: number;
  nextFollowupAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Additional properties
  currentCart?: Cart;
  lastActivityAt?: Date;
  closedAt?: Date;
}

export interface CreateConversationInput {
  id?: string;
  merchantId: string;
  senderId: string;
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
}
