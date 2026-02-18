/**
 * Support Agent Task Definitions (Stub)
 */

export interface CreateTicketInput {
  merchantId: string;
  customerId: string;
  conversationId: string;
  subject: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
}

export interface ResolveTicketInput {
  ticketId: string;
  resolution: string;
  resolvedBy: string;
}

export interface AnswerFaqInput {
  merchantId: string;
  question: string;
  conversationId?: string;
}

export interface EscalateToHumanInput {
  conversationId: string;
  merchantId: string;
  reason: string;
  urgency: "normal" | "high" | "critical";
}
