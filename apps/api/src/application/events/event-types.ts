// Domain event types
export const EVENT_TYPES = {
  MESSAGE_RECEIVED: "MessageReceived",
  MESSAGE_QUEUED: "MessageQueued",
  MESSAGE_SENT: "MessageSent",
  MESSAGE_DELIVERED: "MessageDelivered",
  MESSAGE_READ: "MessageRead",
  MESSAGE_FAILED: "MessageFailed",
  CART_UPDATED: "CartUpdated",
  ORDER_CREATED: "OrderCreated",
  ORDER_CONFIRMED: "OrderConfirmed",
  SHIPMENT_BOOKED: "ShipmentBooked",
  FOLLOWUP_SCHEDULED: "FollowupScheduled",
  DELIVERY_STATUS_UPDATED: "DeliveryStatusUpdated",
  MERCHANT_ALERTED: "MerchantAlerted",
  CONVERSATION_CLOSED: "ConversationClosed",
  // Agent subscription events (Phase C)
  AGENT_SUBSCRIBED: "AgentSubscribed",
  AGENT_UNSUBSCRIBED: "AgentUnsubscribed",
  // Inventory events (Phase E)
  STOCK_ADJUSTED: "StockAdjusted",
  STOCK_LOW: "StockLow",
  STOCK_RESERVED: "StockReserved",
  // Finance events (Phase H)
  DAILY_PROFIT_CALCULATED: "DailyProfitCalculated",
  SPENDING_ALERT: "SpendingAlert",
  // Finance Agent MVP events
  PAYMENT_PROOF_SUBMITTED: "PaymentProofSubmitted",
  PAYMENT_VERIFIED: "PaymentVerified",
  CFO_BRIEF_SCHEDULED: "CFOBriefScheduled",
  // Daily report
  DAILY_REPORT_GENERATED: "DailyReportGenerated",
  // Escalation
  ESCALATION_REQUIRED: "EscalationRequired",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// Event payloads
export interface MessageReceivedPayload {
  messageId: string;
  conversationId: string;
  merchantId: string;
  senderId: string;
  text: string;
}

export interface CartUpdatedPayload {
  conversationId: string;
  merchantId: string;
  items: Array<{
    productId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
}

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  merchantId: string;
  conversationId: string;
  customerId?: string;
  total: number;
}

export interface OrderConfirmedPayload {
  orderId: string;
  orderNumber: string;
  merchantId: string;
}

export interface ShipmentBookedPayload {
  shipmentId: string;
  orderId: string;
  merchantId: string;
  trackingId: string;
  courier: string;
  estimatedDelivery?: string;
}

export interface FollowupScheduledPayload {
  conversationId: string;
  merchantId: string;
  scheduledAt: string;
  followupCount: number;
}

export interface DeliveryStatusUpdatedPayload {
  shipmentId: string;
  orderId: string;
  merchantId: string;
  trackingId: string;
  status: string;
  statusDescription: string;
}

export interface MerchantAlertedPayload {
  merchantId: string;
  alertType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationClosedPayload {
  conversationId: string;
  merchantId: string;
  reason: string;
}

// Message delivery events
export interface MessageQueuedPayload {
  messageId: string;
  conversationId: string;
  merchantId: string;
  recipientId: string;
  text: string;
  provider: string;
}

export interface MessageSentPayload {
  messageId: string;
  merchantId: string;
  providerMessageId: string;
  provider: string;
  sentAt: string;
}

export interface MessageDeliveredPayload {
  messageId: string;
  merchantId: string;
  providerMessageId: string;
  provider: string;
  deliveredAt: string;
}

export interface MessageReadPayload {
  messageId: string;
  merchantId: string;
  providerMessageId: string;
  provider: string;
  readAt: string;
}

export interface MessageFailedPayload {
  messageId: string;
  merchantId: string;
  error: string;
  retryCount: number;
  willRetry: boolean;
  failedAt: string;
}

// Inventory events
export interface StockAdjustedPayload {
  merchantId: string;
  catalogItemId: string;
  previousQuantity: number;
  newQuantity: number;
  movementType: string;
  referenceId?: string;
}

export interface StockLowPayload {
  merchantId: string;
  catalogItemId: string;
  itemName: string;
  currentQuantity: number;
  threshold: number;
}

export interface StockReservedPayload {
  merchantId: string;
  catalogItemId: string;
  orderId: string;
  quantity: number;
  remainingStock: number;
}

// Finance events
export interface DailyProfitCalculatedPayload {
  merchantId: string;
  date: string;
  revenue: number;
  costs: number;
  profit: number;
  margin: number;
}

export interface SpendingAlertPayload {
  merchantId: string;
  alertType: "HIGH_DISCOUNTS" | "HIGH_REFUNDS" | "COSTS_EXCEED_REVENUE";
  message: string;
  data: Record<string, unknown>;
}
