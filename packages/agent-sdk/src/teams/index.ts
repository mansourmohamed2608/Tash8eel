import { z } from "zod";
import {
  AgentTypeSchema,
  AgentType,
  TaskPrioritySchema,
  TaskPriority,
} from "../tasks";

// ============================================================================
// Team Task Schema — A complex task decomposed into parallel subtasks
// ============================================================================

export const TeamTaskStatusSchema = z.enum([
  "PLANNING", // Decomposing into subtasks
  "DISPATCHING", // Sending subtasks to agents
  "RUNNING", // Subtasks executing in parallel
  "AGGREGATING", // Collecting and merging results
  "COMPLETED", // All subtasks done, final result ready
  "PARTIAL", // Some subtasks completed, some failed
  "FAILED", // Team task failed
  "CANCELLED", // Cancelled by user or system
]);
export type TeamTaskStatus = z.infer<typeof TeamTaskStatusSchema>;

// ============================================================================
// Subtask — Individual work item assigned to a specific agent
// ============================================================================
export const SubtaskSchema = z.object({
  id: z.string(),
  agentType: AgentTypeSchema,
  taskType: z.string(),
  description: z.string(), // Human-readable description of what this subtask does
  descriptionAr: z.string().optional(), // Arabic description
  input: z.record(z.unknown()),
  dependsOn: z.array(z.string()).default([]), // IDs of subtasks that must complete first
  status: z
    .enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"])
    .default("PENDING"),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  executionTimeMs: z.number().optional(),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

// ============================================================================
// Team Task — The parent task that coordinates subtasks
// ============================================================================
export const TeamTaskSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  correlationId: z.string().optional(),
  title: z.string(), // "تقرير شامل عن أداء المتجر"
  titleAr: z.string().optional(),
  description: z.string(), // What the team task accomplishes
  priority: TaskPrioritySchema.default("MEDIUM"),
  status: TeamTaskStatusSchema.default("PLANNING"),
  subtasks: z.array(SubtaskSchema),
  aggregatedResult: z.record(z.unknown()).optional(),
  replyAr: z.string().optional(), // Final Arabic reply to merchant

  // Coordination settings
  strategy: z.enum(["PARALLEL", "SEQUENTIAL", "DAG"]).default("PARALLEL"),
  failurePolicy: z
    .enum(["FAIL_FAST", "CONTINUE_ON_ERROR", "RETRY_FAILED"])
    .default("CONTINUE_ON_ERROR"),
  maxParallelism: z.number().default(4),
  timeoutMs: z.number().default(120000), // 2 min total timeout

  // Tracking
  totalSubtasks: z.number(),
  completedSubtasks: z.number().default(0),
  failedSubtasks: z.number().default(0),
  progressPercent: z.number().default(0),

  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
});
export type TeamTask = z.infer<typeof TeamTaskSchema>;

// ============================================================================
// Team Task Templates — Predefined decomposition patterns
// ============================================================================

export interface TeamTaskTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  agents: AgentType[]; // Which agents are involved
  subtasksTemplate: Array<{
    agentType: AgentType;
    taskType: string;
    descriptionAr: string;
    descriptionEn: string;
    dependsOn?: string[]; // Depends on other template subtask IDs
  }>;
}

// Pre-built team task templates for common complex operations
export const TEAM_TASK_TEMPLATES: TeamTaskTemplate[] = [
  {
    id: "COMPREHENSIVE_STORE_REPORT",
    nameAr: "تقرير شامل عن أداء المتجر",
    nameEn: "Comprehensive Store Report",
    descriptionAr: "تقرير يغطي الطلبات والمخزون والمالية والعملاء",
    descriptionEn:
      "Full report covering orders, inventory, finance, and customers",
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    subtasksTemplate: [
      {
        agentType: "OPS_AGENT",
        taskType: "daily_report",
        descriptionAr: "تقرير الطلبات والمحادثات والعملاء",
        descriptionEn: "Daily orders, conversations, and customers report",
      },
      {
        agentType: "INVENTORY_AGENT",
        taskType: "inventory_report",
        descriptionAr: "تقرير حالة المخزون والنواقص",
        descriptionEn: "Inventory status and shortages report",
      },
      {
        agentType: "FINANCE_AGENT",
        taskType: "daily_revenue_summary",
        descriptionAr: "ملخص الإيرادات والمصروفات",
        descriptionEn: "Revenue and expenses summary",
      },
    ],
  },
  {
    id: "NEW_PRODUCT_LAUNCH",
    nameAr: "إطلاق منتج جديد",
    nameEn: "New Product Launch",
    descriptionAr: "إعداد منتج جديد: المخزون والمحتوى والتسويق",
    descriptionEn: "Setup new product: inventory, content, and marketing",
    agents: ["INVENTORY_AGENT", "CONTENT_AGENT", "MARKETING_AGENT"],
    subtasksTemplate: [
      {
        agentType: "INVENTORY_AGENT",
        taskType: "update_stock",
        descriptionAr: "إعداد المخزون الأولي للمنتج",
        descriptionEn: "Setup initial product inventory",
      },
      {
        agentType: "CONTENT_AGENT",
        taskType: "generate_description",
        descriptionAr: "إنشاء وصف المنتج",
        descriptionEn: "Generate product description",
      },
      {
        agentType: "MARKETING_AGENT",
        taskType: "generate_promo",
        descriptionAr: "إنشاء حملة ترويجية",
        descriptionEn: "Create promotional campaign",
        dependsOn: ["generate_description"], // Content must be ready first
      },
    ],
  },
  {
    id: "END_OF_DAY_CLOSEOUT",
    nameAr: "إغلاق نهاية اليوم",
    nameEn: "End of Day Closeout",
    descriptionAr: "ملخص يومي شامل: مالي ومخزون ومتابعات",
    descriptionEn: "Full daily summary: financial, inventory, and followups",
    agents: ["FINANCE_AGENT", "INVENTORY_AGENT", "OPS_AGENT", "SUPPORT_AGENT"],
    subtasksTemplate: [
      {
        agentType: "FINANCE_AGENT",
        taskType: "weekly_cfo_brief",
        descriptionAr: "ملخص مالي لليوم",
        descriptionEn: "Daily financial brief",
      },
      {
        agentType: "INVENTORY_AGENT",
        taskType: "low_stock_alert",
        descriptionAr: "فحص المنتجات منخفضة المخزون",
        descriptionEn: "Check low stock items",
      },
      {
        agentType: "OPS_AGENT",
        taskType: "send_followup",
        descriptionAr: "إرسال متابعات العملاء المعلقة",
        descriptionEn: "Send pending customer followups",
      },
      {
        agentType: "SUPPORT_AGENT",
        taskType: "escalation_response",
        descriptionAr: "مراجعة التصعيدات المفتوحة",
        descriptionEn: "Review open escalations",
      },
    ],
  },
  {
    id: "CUSTOMER_360_ANALYSIS",
    nameAr: "تحليل عميل شامل",
    nameEn: "Customer 360 Analysis",
    descriptionAr: "تحليل كامل لعميل: طلبات ومدفوعات وسلوك شراء",
    descriptionEn:
      "Full customer analysis: orders, payments, and purchase behavior",
    agents: ["OPS_AGENT", "FINANCE_AGENT", "MARKETING_AGENT"],
    subtasksTemplate: [
      {
        agentType: "OPS_AGENT",
        taskType: "process_message",
        descriptionAr: "تحليل تاريخ المحادثات والطلبات",
        descriptionEn: "Analyze conversation and order history",
      },
      {
        agentType: "FINANCE_AGENT",
        taskType: "daily_revenue_summary",
        descriptionAr: "تحليل قيمة العميل المالية",
        descriptionEn: "Analyze customer financial value",
      },
      {
        agentType: "MARKETING_AGENT",
        taskType: "customer_segment",
        descriptionAr: "تصنيف العميل وتوصيات التسويق",
        descriptionEn: "Customer segmentation and marketing recommendations",
      },
    ],
  },
];

// ============================================================================
// Intent → Team Task Mapping
// ============================================================================

/** Complex intents that should be decomposed into team tasks */
export const TEAM_INTENTS: Record<string, string> = {
  COMPREHENSIVE_REPORT: "COMPREHENSIVE_STORE_REPORT",
  FULL_STORE_REPORT: "COMPREHENSIVE_STORE_REPORT",
  LAUNCH_PRODUCT: "NEW_PRODUCT_LAUNCH",
  END_OF_DAY: "END_OF_DAY_CLOSEOUT",
  CLOSE_DAY: "END_OF_DAY_CLOSEOUT",
  CUSTOMER_ANALYSIS: "CUSTOMER_360_ANALYSIS",
  CUSTOMER_360: "CUSTOMER_360_ANALYSIS",
};

// ============================================================================
// Team Task Factory
// ============================================================================

export interface CreateTeamTaskParams {
  merchantId: string;
  title: string;
  titleAr?: string;
  description: string;
  templateId?: string;
  subtasks: Array<{
    agentType: AgentType;
    taskType: string;
    description: string;
    descriptionAr?: string;
    input: Record<string, unknown>;
    dependsOn?: string[];
  }>;
  priority?: TaskPriority;
  strategy?: "PARALLEL" | "SEQUENTIAL" | "DAG";
  failurePolicy?: "FAIL_FAST" | "CONTINUE_ON_ERROR" | "RETRY_FAILED";
  timeoutMs?: number;
  correlationId?: string;
}

let subtaskCounter = 0;

export function createTeamTask(
  params: CreateTeamTaskParams,
): Omit<TeamTask, "id" | "createdAt" | "updatedAt"> {
  const subtasks: Subtask[] = params.subtasks.map((st) => ({
    id: `st_${Date.now()}_${++subtaskCounter}`,
    agentType: st.agentType,
    taskType: st.taskType,
    description: st.description,
    descriptionAr: st.descriptionAr,
    input: st.input,
    dependsOn: st.dependsOn || [],
    status: "PENDING" as const,
  }));

  // Determine strategy from dependencies
  const hasDependencies = subtasks.some((st) => st.dependsOn.length > 0);
  const strategy = params.strategy || (hasDependencies ? "DAG" : "PARALLEL");

  return {
    merchantId: params.merchantId,
    correlationId: params.correlationId,
    title: params.title,
    titleAr: params.titleAr,
    description: params.description,
    priority: params.priority || "MEDIUM",
    status: "PLANNING",
    subtasks,
    strategy,
    failurePolicy: params.failurePolicy || "CONTINUE_ON_ERROR",
    maxParallelism: 4,
    timeoutMs: params.timeoutMs || 120000,
    totalSubtasks: subtasks.length,
    completedSubtasks: 0,
    failedSubtasks: 0,
    progressPercent: 0,
  };
}

export function createTeamTaskFromTemplate(
  templateId: string,
  merchantId: string,
  input: Record<string, unknown>,
  options?: { priority?: TaskPriority; correlationId?: string },
): Omit<TeamTask, "id" | "createdAt" | "updatedAt"> | null {
  const template = TEAM_TASK_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;

  return createTeamTask({
    merchantId,
    title: template.nameEn,
    titleAr: template.nameAr,
    description: template.descriptionEn,
    subtasks: template.subtasksTemplate.map((st) => ({
      agentType: st.agentType,
      taskType: st.taskType,
      description: st.descriptionEn,
      descriptionAr: st.descriptionAr,
      input: {
        ...input,
        merchantId: (input as any)?.merchantId || merchantId,
        ...(st.taskType === "inventory_report" && !(input as any)?.reportType
          ? { reportType: "summary" }
          : {}),
      },
      dependsOn: st.dependsOn,
    })),
    strategy: template.subtasksTemplate.some((st) => st.dependsOn?.length)
      ? "DAG"
      : "PARALLEL",
    priority: options?.priority,
    correlationId: options?.correlationId,
  });
}
