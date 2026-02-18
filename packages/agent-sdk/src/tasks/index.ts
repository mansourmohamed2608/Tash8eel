import { z } from "zod";

// ============================================================================
// Agent Types
// ============================================================================
export const AgentTypeSchema = z.enum([
  "OPS_AGENT",
  "INVENTORY_AGENT",
  "FINANCE_AGENT",
  "MARKETING_AGENT",
  "CONTENT_AGENT",
  "SUPPORT_AGENT",
]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

// ============================================================================
// Task Priority
// ============================================================================
export const TaskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// ============================================================================
// Task Status
// ============================================================================
export const TaskStatusSchema = z.enum([
  "PENDING",
  "ASSIGNED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// ============================================================================
// Agent Task Schema
// ============================================================================
export const AgentTaskSchema = z.object({
  id: z.string(),
  agentType: AgentTypeSchema,
  taskType: z.string(),
  merchantId: z.string().optional(),
  correlationId: z.string().optional(),
  priority: TaskPrioritySchema.default("MEDIUM"),
  status: TaskStatusSchema.default("PENDING"),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  assignedAt: z.date().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  timeoutAt: z.date().optional(),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

// ============================================================================
// Agent Result Schema
// ============================================================================
export const AgentResultSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  agentType: AgentTypeSchema,
  success: z.boolean(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  tokensUsed: z.number().default(0),
  executionTimeMs: z.number(),
  createdAt: z.date(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

// ============================================================================
// Task Types per Agent
// ============================================================================
export const OPS_AGENT_TASK_TYPES = {
  PROCESS_MESSAGE: "process_message",
  CREATE_ORDER: "create_order",
  BOOK_DELIVERY: "book_delivery",
  SEND_FOLLOWUP: "send_followup",
  HANDLE_ESCALATION: "handle_escalation",
  // UPSELL / ETA / COMPLAINTS / MEMORY / AUDIT
  UPSELL_SUGGESTIONS: "upsell_suggestions",
  RECORD_UPSELL_CONVERSION: "record_upsell_conversion",
  CALCULATE_DELIVERY_ETA: "calculate_delivery_eta",
  HANDLE_COMPLAINT: "handle_complaint",
  ADVANCE_COMPLAINT: "advance_complaint",
  SAVE_CUSTOMER_MEMORY: "save_customer_memory",
  GET_CUSTOMER_MEMORY: "get_customer_memory",
  LOG_AI_DECISION: "log_ai_decision",
  GET_AI_DECISION_LOG: "get_ai_decision_log",
  CUSTOMER_INSIGHTS: "customer_insights",
  SEGMENT_CUSTOMERS: "segment_customers",
  DAILY_REPORT: "daily_report",
  CUSTOMER_RISK_SCORE: "customer_risk_score",
  REORDER_ITEMS: "reorder_items",
} as const;

export const INVENTORY_AGENT_TASK_TYPES = {
  CHECK_STOCK: "check_stock",
  UPDATE_STOCK: "update_stock",
  LOW_STOCK_ALERT: "low_stock_alert",
  RESERVE_STOCK: "reserve_stock",
  CONFIRM_RESERVATION: "confirm_reservation",
  RELEASE_RESERVATION: "release_reservation",
  DEDUCT_STOCK: "deduct_stock",
  SYNC_INVENTORY: "sync_inventory",
  GENERATE_REPORT: "inventory_report",
  CLEANUP_EXPIRED_RESERVATIONS: "cleanup_expired_reservations",
  // PREMIUM FEATURES
  SUBSTITUTION_SUGGESTIONS: "substitution_suggestions",
  RESTOCK_RECOMMENDATIONS: "restock_recommendations",
  SUPPLIER_ORDER_DRAFT: "supplier_order_draft",
  // PERISHABLE / LOT / FIFO / SKU MERGE
  CHECK_EXPIRY_ALERTS: "check_expiry_alerts",
  EXPIRY_REPORT: "expiry_report",
  RECEIVE_LOT: "receive_lot",
  LOT_REPORT: "lot_report",
  FIFO_COGS: "fifo_cogs",
  INVENTORY_VALUATION_FIFO: "inventory_valuation_fifo",
  DETECT_DUPLICATE_SKUS: "detect_duplicate_skus",
  MERGE_SKUS: "merge_skus",
} as const;

export const FINANCE_AGENT_TASK_TYPES = {
  PROCESS_PAYMENT: "process_payment",
  GENERATE_INVOICE: "generate_invoice",
  CALCULATE_FEES: "calculate_fees",
  // Phase 2 Finance Agent MVP Tasks
  AUTO_CREATE_PAYMENT_LINK: "auto_create_payment_link",
  PAYMENT_PROOF_REVIEW: "payment_proof_review",
  WEEKLY_CFO_BRIEF: "weekly_cfo_brief",
  DAILY_REVENUE_SUMMARY: "daily_revenue_summary",
  // TAX / CASH FLOW / DISCOUNT / REVENUE / REFUNDS
  TAX_REPORT: "tax_report",
  CASH_FLOW_FORECAST: "cash_flow_forecast",
  DISCOUNT_IMPACT: "discount_impact",
  REVENUE_BY_CHANNEL: "revenue_by_channel",
  REFUND_ANALYSIS: "refund_analysis",
  RECONCILE_TRANSACTIONS: "reconcile_transactions",
  IMPORT_COD_STATEMENT: "import_cod_statement",
  RECORD_EXPENSE: "record_expense",
  EXPENSE_SUMMARY: "expense_summary",
  MONTHLY_CLOSE: "monthly_close",
} as const;

export const MARKETING_AGENT_TASK_TYPES = {
  GENERATE_PROMO: "generate_promo",
  CUSTOMER_SEGMENT: "customer_segment",
} as const;

export const CONTENT_AGENT_TASK_TYPES = {
  GENERATE_DESCRIPTION: "generate_description",
  TRANSLATE_CONTENT: "translate_content",
} as const;

export const SUPPORT_AGENT_TASK_TYPES = {
  ESCALATION_RESPONSE: "escalation_response",
  FAQ_RESPONSE: "faq_response",
} as const;

// ============================================================================
// Task Factory
// ============================================================================
export interface CreateTaskParams {
  agentType: AgentType;
  taskType: string;
  merchantId?: string;
  correlationId?: string;
  priority?: TaskPriority;
  input: Record<string, unknown>;
  timeoutMs?: number;
}

export function createTask(
  params: CreateTaskParams,
): Omit<AgentTask, "id" | "createdAt" | "updatedAt"> {
  const timeoutAt = params.timeoutMs
    ? new Date(Date.now() + params.timeoutMs)
    : new Date(Date.now() + 30000); // Default 30s timeout

  return {
    agentType: params.agentType,
    taskType: params.taskType,
    merchantId: params.merchantId,
    correlationId: params.correlationId,
    priority: params.priority || "MEDIUM",
    status: "PENDING",
    input: params.input,
    retryCount: 0,
    maxRetries: 3,
    timeoutAt,
  };
}

// ============================================================================
// Agent Interface
// ============================================================================
export interface IAgent {
  readonly agentType: AgentType;
  readonly supportedTaskTypes: string[];

  canHandle(taskType: string): boolean;
  execute(task: AgentTask): Promise<AgentResult>;
}

// ============================================================================
// Agent Registry
// ============================================================================
export class AgentRegistry {
  private agents: Map<AgentType, IAgent> = new Map();

  register(agent: IAgent): void {
    this.agents.set(agent.agentType, agent);
  }

  get(agentType: AgentType): IAgent | undefined {
    return this.agents.get(agentType);
  }

  getAll(): IAgent[] {
    return Array.from(this.agents.values());
  }

  findAgentForTask(taskType: string): IAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.canHandle(taskType)) {
        return agent;
      }
    }
    return undefined;
  }
}
