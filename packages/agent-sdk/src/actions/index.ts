import { z } from "zod";

// ============================================================================
// Action Types (Allowlisted)
// ============================================================================
export const ActionTypeSchema = z.enum([
  "ASK_CLARIFYING_QUESTION",
  "UPDATE_CART",
  "CREATE_ORDER",
  "BOOK_DELIVERY",
  "SEND_TRACKING",
  "SCHEDULE_FOLLOWUP",
  "SEND_REPORT",
  "ESCALATE_TO_HUMAN",
  "NO_ACTION",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

// ============================================================================
// Action Payloads
// ============================================================================
export const AskClarifyingQuestionPayloadSchema = z.object({
  question: z.string(),
  questionAr: z.string(),
  missingSlots: z.array(z.string()),
  context: z.record(z.unknown()).optional(),
});
export type AskClarifyingQuestionPayload = z.infer<
  typeof AskClarifyingQuestionPayloadSchema
>;

export const UpdateCartPayloadSchema = z.object({
  operation: z.enum(["ADD", "REMOVE", "UPDATE", "CLEAR"]),
  items: z
    .array(
      z.object({
        catalogItemId: z.string().optional(),
        name: z.string(),
        quantity: z.number().optional(),
        variants: z.record(z.string()).optional(),
        options: z.array(z.string()).optional(),
        unitPrice: z.number().optional(),
      }),
    )
    .optional(),
});
export type UpdateCartPayload = z.infer<typeof UpdateCartPayloadSchema>;

export const CreateOrderPayloadSchema = z.object({
  customerName: z.string(),
  customerPhone: z.string(),
  deliveryAddress: z.object({
    city: z.string().optional(),
    area: z.string().optional(),
    street: z.string().optional(),
    building: z.string().optional(),
    floor: z.string().optional(),
    apartment: z.string().optional(),
    landmark: z.string().optional(),
    notes: z.string().optional(),
    raw_text: z.string(),
    map_url: z.string().optional(),
  }),
  deliveryNotes: z.string().optional(),
  discount: z.number().optional(),
  deliveryFee: z.number().optional(),
});
export type CreateOrderPayload = z.infer<typeof CreateOrderPayloadSchema>;

export const BookDeliveryPayloadSchema = z.object({
  orderId: z.string(),
  preferredTime: z.string().optional(),
  courier: z.string().optional(),
});
export type BookDeliveryPayload = z.infer<typeof BookDeliveryPayloadSchema>;

export const SendTrackingPayloadSchema = z.object({
  orderId: z.string(),
  trackingId: z.string(),
  trackingUrl: z.string().optional(),
});
export type SendTrackingPayload = z.infer<typeof SendTrackingPayloadSchema>;

export const ScheduleFollowupPayloadSchema = z.object({
  conversationId: z.string(),
  type: z.string(),
  scheduledAt: z.string(),
  message: z.string().optional(),
});
export type ScheduleFollowupPayload = z.infer<
  typeof ScheduleFollowupPayloadSchema
>;

export const SendReportPayloadSchema = z.object({
  reportType: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  merchantId: z.string(),
  dateRange: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
});
export type SendReportPayload = z.infer<typeof SendReportPayloadSchema>;

export const EscalateToHumanPayloadSchema = z.object({
  reason: z.string(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  context: z.record(z.unknown()).optional(),
});
export type EscalateToHumanPayload = z.infer<
  typeof EscalateToHumanPayloadSchema
>;

// ============================================================================
// Agent Action Schema
// ============================================================================
export const AgentActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ASK_CLARIFYING_QUESTION"),
    payload: AskClarifyingQuestionPayloadSchema,
  }),
  z.object({
    type: z.literal("UPDATE_CART"),
    payload: UpdateCartPayloadSchema,
  }),
  z.object({
    type: z.literal("CREATE_ORDER"),
    payload: CreateOrderPayloadSchema,
  }),
  z.object({
    type: z.literal("BOOK_DELIVERY"),
    payload: BookDeliveryPayloadSchema,
  }),
  z.object({
    type: z.literal("SEND_TRACKING"),
    payload: SendTrackingPayloadSchema,
  }),
  z.object({
    type: z.literal("SCHEDULE_FOLLOWUP"),
    payload: ScheduleFollowupPayloadSchema,
  }),
  z.object({
    type: z.literal("SEND_REPORT"),
    payload: SendReportPayloadSchema,
  }),
  z.object({
    type: z.literal("ESCALATE_TO_HUMAN"),
    payload: EscalateToHumanPayloadSchema,
  }),
  z.object({
    type: z.literal("NO_ACTION"),
    payload: z.object({}).optional(),
  }),
]);
export type AgentAction = z.infer<typeof AgentActionSchema>;

// ============================================================================
// Action Validation
// ============================================================================
export function isValidAction(action: string): action is ActionType {
  return ActionTypeSchema.safeParse(action).success;
}

export function validateAction(action: unknown): AgentAction {
  return AgentActionSchema.parse(action);
}

// ============================================================================
// Action Helpers
// ============================================================================
export function createAskQuestion(
  questionAr: string,
  missingSlots: string[],
): AgentAction {
  return {
    type: "ASK_CLARIFYING_QUESTION",
    payload: {
      question: questionAr,
      questionAr,
      missingSlots,
    },
  };
}

export function createUpdateCart(
  operation: "ADD" | "REMOVE" | "UPDATE" | "CLEAR",
  items?: UpdateCartPayload["items"],
): AgentAction {
  return {
    type: "UPDATE_CART",
    payload: { operation, items },
  };
}

export function createEscalateToHuman(
  reason: string,
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM",
): AgentAction {
  return {
    type: "ESCALATE_TO_HUMAN",
    payload: { reason, priority },
  };
}

export function createNoAction(): AgentAction {
  return {
    type: "NO_ACTION",
    payload: {},
  };
}
