import { z } from "zod";
import { EventStatusSchema, EventStatus } from "../entities";

// ============================================================================
// Event Types
// ============================================================================
export const EVENT_TYPES = {
  // Message Events
  MESSAGE_RECEIVED: "message.received",
  MESSAGE_SENT: "message.sent",
  MESSAGE_DELIVERED: "message.delivered",
  MESSAGE_FAILED: "message.failed",

  // Conversation Events
  CONVERSATION_CREATED: "conversation.created",
  CONVERSATION_UPDATED: "conversation.updated",
  CONVERSATION_TAKEOVER: "conversation.takeover",
  CONVERSATION_RELEASED: "conversation.released",
  CONVERSATION_CLOSED: "conversation.closed",

  // Order Events
  ORDER_CREATED: "order.created",
  ORDER_CONFIRMED: "order.confirmed",
  ORDER_CANCELLED: "order.cancelled",
  ORDER_UPDATED: "order.updated",

  // Shipment Events
  SHIPMENT_BOOKED: "shipment.booked",
  SHIPMENT_STATUS_UPDATED: "shipment.status_updated",
  SHIPMENT_DELIVERED: "shipment.delivered",
  SHIPMENT_FAILED: "shipment.failed",

  // Followup Events
  FOLLOWUP_SCHEDULED: "followup.scheduled",
  FOLLOWUP_SENT: "followup.sent",
  FOLLOWUP_CANCELLED: "followup.cancelled",

  // Report Events
  DAILY_REPORT_GENERATED: "report.daily_generated",

  // Alert Events
  TOKEN_BUDGET_WARNING: "alert.token_budget_warning",
  TOKEN_BUDGET_EXCEEDED: "alert.token_budget_exceeded",
  ESCALATION_REQUIRED: "alert.escalation_required",

  // Agent Events
  AGENT_TASK_CREATED: "agent.task_created",
  AGENT_TASK_COMPLETED: "agent.task_completed",
  AGENT_TASK_FAILED: "agent.task_failed",

  // Inventory AI Events
  INVENTORY_SUBSTITUTION_SUGGESTED: "inventory.substitution_suggested",
  INVENTORY_RESTOCK_INSIGHT_GENERATED: "inventory.restock_insight_generated",

  // Finance Agent MVP Events
  PAYMENT_PROOF_SUBMITTED: "payment.proof_submitted",
  PAYMENT_VERIFIED: "payment.verified",
  CFO_BRIEF_SCHEDULED: "finance.cfo_brief_scheduled",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// Re-export EventStatus from entities (avoid duplication)
export { EventStatusSchema, EventStatus };

// ============================================================================
// Base Event Schema
// ============================================================================
export const BaseEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  merchantId: z.string().optional(),
  correlationId: z.string().optional(),
  payload: z.record(z.unknown()),
  status: EventStatusSchema.default("PENDING"),
  processedAt: z.date().optional(),
  error: z.string().optional(),
  retryCount: z.number().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BaseEvent = z.infer<typeof BaseEventSchema>;

// ============================================================================
// Outbox Event Schema
// ============================================================================
export const OutboxEventSchema = BaseEventSchema.extend({
  maxRetries: z.number().default(5),
  nextRetryAt: z.date().optional(),
});
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;

// ============================================================================
// DLQ Event Schema
// ============================================================================
export const DlqEventSchema = z.object({
  id: z.string(),
  originalEventId: z.string().optional(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  error: z.string(),
  stack: z.string().optional(),
  correlationId: z.string().optional(),
  merchantId: z.string().optional(),
  status: z.enum(["PENDING", "RETRYING", "RESOLVED", "EXHAUSTED"]),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(5),
  nextRetryAt: z.date().optional(),
  resolvedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DlqEvent = z.infer<typeof DlqEventSchema>;

// ============================================================================
// Event Payloads
// ============================================================================
export const MessageReceivedPayloadSchema = z.object({
  conversationId: z.string(),
  merchantId: z.string(),
  senderId: z.string(),
  text: z.string(),
  attachments: z
    .array(
      z.object({
        type: z.string(),
        url: z.string().optional(),
        mimeType: z.string().optional(),
      }),
    )
    .optional(),
});
export type MessageReceivedPayload = z.infer<
  typeof MessageReceivedPayloadSchema
>;

export const OrderCreatedPayloadSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  merchantId: z.string(),
  conversationId: z.string(),
  customerId: z.string().optional(),
  total: z.number(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      price: z.number(),
    }),
  ),
});
export type OrderCreatedPayload = z.infer<typeof OrderCreatedPayloadSchema>;

export const ShipmentBookedPayloadSchema = z.object({
  orderId: z.string(),
  shipmentId: z.string(),
  trackingId: z.string(),
  courier: z.string(),
  merchantId: z.string(),
});
export type ShipmentBookedPayload = z.infer<typeof ShipmentBookedPayloadSchema>;

export const FollowupScheduledPayloadSchema = z.object({
  followupId: z.string(),
  conversationId: z.string(),
  merchantId: z.string(),
  scheduledAt: z.string(),
  type: z.string(),
});
export type FollowupScheduledPayload = z.infer<
  typeof FollowupScheduledPayloadSchema
>;

export const DailyReportPayloadSchema = z.object({
  reportId: z.string(),
  merchantId: z.string(),
  reportDate: z.string(),
  summary: z.record(z.unknown()),
});
export type DailyReportPayload = z.infer<typeof DailyReportPayloadSchema>;

export const EscalationPayloadSchema = z.object({
  conversationId: z.string(),
  merchantId: z.string(),
  reason: z.string(),
  priority: z.string(),
});
export type EscalationPayload = z.infer<typeof EscalationPayloadSchema>;

// ============================================================================
// Event Factory
// ============================================================================
export interface CreateEventParams {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  merchantId?: string;
  correlationId?: string;
  payload: Record<string, unknown>;
}

export function createEvent(
  params: CreateEventParams,
): Omit<OutboxEvent, "id" | "createdAt" | "updatedAt"> {
  return {
    ...params,
    status: "PENDING",
    retryCount: 0,
    maxRetries: 5,
  };
}
