// Domain event types
export const EVENT_TYPES = {
  MESSAGE_RECEIVED: 'MessageReceived',
  CART_UPDATED: 'CartUpdated',
  ORDER_CREATED: 'OrderCreated',
  ORDER_CONFIRMED: 'OrderConfirmed',
  SHIPMENT_BOOKED: 'ShipmentBooked',
  FOLLOWUP_SCHEDULED: 'FollowupScheduled',
  DELIVERY_STATUS_UPDATED: 'DeliveryStatusUpdated',
  MERCHANT_ALERTED: 'MerchantAlerted',
  CONVERSATION_CLOSED: 'ConversationClosed',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

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
