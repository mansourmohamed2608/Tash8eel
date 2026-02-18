/**
 * OPS Agent Task Definitions
 *
 * This file defines the task input/output types for the Operations Agent.
 */

export interface ProcessMessageInput {
  conversationId: string;
  merchantId: string;
  text: string;
  customerId?: string;
}

export interface ProcessMessageOutput {
  processed: boolean;
  conversationId: string;
  merchantId: string;
}

export interface CreateOrderInput {
  orderId: string;
  merchantId: string;
  conversationId: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
}

export interface CreateOrderOutput {
  orderId: string;
  status: string;
}

export interface BookDeliveryInput {
  orderId: string;
  address: string;
  phoneNumber: string;
  preferredDate?: string;
}

export interface BookDeliveryOutput {
  orderId: string;
  booked: boolean;
  trackingNumber?: string;
}

export interface SendFollowupInput {
  followupId: string;
  conversationId: string;
  merchantId: string;
  messageTemplate?: string;
}

export interface SendFollowupOutput {
  followupId: string;
  sent: boolean;
}

export interface HandleEscalationInput {
  conversationId: string;
  merchantId: string;
  reason: string;
}

export interface HandleEscalationOutput {
  conversationId: string;
  escalated: boolean;
  reason: string;
}

// ============================================================================
// VIP TAGGING TASKS (Growth+ Feature)
// ============================================================================

export interface ManageCustomerTagInput {
  merchantId: string;
  customerId: string;
  tag: "VIP" | "WHOLESALE" | "BLACKLIST" | "INFLUENCER" | "RETURNING" | string;
  action: "add" | "remove";
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ManageCustomerTagOutput {
  action: "TAG_ADDED" | "TAG_REMOVED";
  tagId?: string;
  merchantId: string;
  customerId: string;
  tag: string;
}

export interface GetCustomerTagsInput {
  merchantId: string;
  customerId: string;
}

export interface GetCustomerTagsOutput {
  customerId: string;
  tags: Array<{
    tag: string;
    source: "manual" | "auto_rule";
    createdAt: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  }>;
  isVip: boolean;
}

export interface ApplyVipRulesInput {
  merchantId: string;
  customerId: string;
}

export interface ApplyVipRulesOutput {
  action: "TAG_APPLIED" | "NO_QUALIFYING_RULE";
  merchantId: string;
  customerId: string;
  appliedTag?: string;
}

// ============================================================================
// ONE-CLICK REORDER TASKS (Growth+ Feature)
// ============================================================================

export interface GetReorderItemsInput {
  merchantId: string;
  customerId: string;
}

export interface GetReorderItemsOutput {
  found: boolean;
  lastOrderId?: string;
  lastOrderNumber?: string;
  lastOrderDate?: string;
  lastOrderTotal?: number;
  items?: Array<{
    sku: string;
    name: string;
    qty: number;
    price: number;
    variantId?: string;
    available: boolean;
    currentStock: number;
    currentPrice: number;
  }>;
  allInStock?: boolean;
}

export interface CreateReorderInput {
  merchantId: string;
  customerId: string;
  conversationId?: string;
  items?: Array<{ variantId: string; quantity: number }>;
}

export interface CreateReorderOutput {
  action: "REORDER_CREATED" | "REORDER_FAILED";
  orderId?: string;
  orderNumber?: string;
  total?: number;
  itemCount?: number;
  reason?: string;
}

// ============================================================================
// RETURN RISK SCORING TASKS (Pro Feature)
// ============================================================================

export interface GetCustomerRiskScoreInput {
  merchantId: string;
  customerId: string;
}

export interface GetCustomerRiskScoreOutput {
  customerId: string;
  riskScore: number; // 0-100
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskFactors: {
    failedDeliveries?: number;
    refusals?: number;
    returns?: number;
    avgAddressConfidence?: number;
  };
  calculatedAt: string;
  cached: boolean;
}

export interface RecordDeliveryOutcomeInput {
  merchantId: string;
  orderId: string;
  customerId: string;
  outcome:
    | "delivered"
    | "refused"
    | "failed_address"
    | "failed_no_answer"
    | "returned";
  notes?: string;
}

export interface RecordDeliveryOutcomeOutput {
  action: "OUTCOME_RECORDED";
  orderId: string;
  outcome: string;
  riskUpdated: boolean;
}

export interface GetHighRiskCustomersInput {
  merchantId: string;
  minRiskScore?: number;
  limit?: number;
}

export interface GetHighRiskCustomersOutput {
  merchantId: string;
  customers: Array<{
    customerId: string;
    name?: string;
    phone?: string;
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    riskFactors: Record<string, number>;
    orderCount: number;
  }>;
  count: number;
}
