import { z } from "zod";

/**
 * Merchant Copilot Command Schema
 *
 * Defines all intents that merchants can issue via text/voice commands.
 * Uses OpenAI Structured Outputs with strict JSON schema + Zod validation.
 */

// ============= Intent Types =============
export const CopilotIntentEnum = z.enum([
  // === Finance Intents ===
  "ADD_EXPENSE", // "دفعت 1000 لحمة"
  "ASK_EXPENSE_SUMMARY", // "مصاريف الشهر ده"
  "CREATE_PAYMENT_LINK", // "اعمل لينك دفع للطلب 123"
  "APPROVE_PAYMENT_PROOF", // "موافق على الإيصال"
  "ASK_COD_STATUS", // "فلوس المناديب"
  "CLOSE_MONTH", // "قفّل الشهر"

  // === Inventory Intents ===
  "UPDATE_STOCK", // "زوّد مخزون التيشيرت 10"
  "ASK_LOW_STOCK", // "ايه اللي ناقص"
  "ASK_SHRINKAGE", // "تقرير العجز"
  "IMPORT_SUPPLIER_CSV", // "استورد بيانات المورد"
  "ASK_TOP_MOVERS", // "ايه اللي ماشي كويس"

  // === Ops Intents ===
  "TAG_VIP", // "خلّي أحمد VIP"
  "REMOVE_VIP", // "شيل VIP من أحمد"
  "REORDER_LAST", // "كرر آخر طلب للعميل"
  "ASK_HIGH_RISK", // "العملاء الخطرين"
  "ASK_NEEDS_FOLLOWUP", // "مين محتاج متابعة"
  "ASK_RECOVERED_CARTS", // "السلات المستردة"
  "CREATE_ORDER", // "اعمل طلب جديد"

  // === Analytics / KPI Intents ===
  "ASK_KPI", // "الأداء الأسبوع ده"
  "ASK_REVENUE", // "إيرادات اليوم"
  "ASK_ORDER_COUNT", // "كام طلب النهاردة"

  // === Unknown / Fallback ===
  "UNKNOWN", // Can't determine intent
  "CLARIFY", // Need more info
]);

export type CopilotIntent = z.infer<typeof CopilotIntentEnum>;

// ============= Entity Schemas =============
export const ExpenseEntitySchema = z.object({
  amount: z.number().nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  date: z.string().nullable(), // ISO date string
});

export const StockUpdateEntitySchema = z.object({
  sku: z.string().nullable(),
  productName: z.string().nullable(),
  quantityChange: z.number().nullable(), // +10 or -5
  absoluteQuantity: z.number().nullable(), // set to exactly 50
});

export const PaymentLinkEntitySchema = z.object({
  orderId: z.string().nullable(),
  orderNumber: z.string().nullable(),
  amount: z.number().nullable(),
  customerPhone: z.string().nullable(),
  customerName: z.string().nullable(),
  description: z.string().nullable(),
});

export const VipTagEntitySchema = z.object({
  customerPhone: z.string().nullable(),
  customerName: z.string().nullable(),
  customerId: z.string().nullable(),
});

export const DateRangeEntitySchema = z.object({
  period: z
    .enum([
      "today",
      "yesterday",
      "this_week",
      "last_week",
      "this_month",
      "last_month",
      "custom",
    ])
    .nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});

export const OrderEntitySchema = z.object({
  customerPhone: z.string().nullable(),
  customerName: z.string().nullable(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().default(1),
        notes: z.string().nullable(),
      }),
    )
    .nullable(),
});

// ============= Combined Entities Schema =============
export const CopilotEntitiesSchema = z.object({
  expense: ExpenseEntitySchema.nullable(),
  stockUpdate: StockUpdateEntitySchema.nullable(),
  paymentLink: PaymentLinkEntitySchema.nullable(),
  vipTag: VipTagEntitySchema.nullable(),
  dateRange: DateRangeEntitySchema.nullable(),
  order: OrderEntitySchema.nullable(),
});

export type CopilotEntities = z.infer<typeof CopilotEntitiesSchema>;

// ============= Preview Schema =============
export const ActionPreviewSchema = z.object({
  type: z.string(),
  summary_ar: z.string(),
  details: z
    .array(
      z.object({
        label_ar: z.string(),
        value_ar: z.string(),
      }),
    )
    .nullable(),
});

// ============= Main Response Schema =============
export const CopilotCommandSchema = z.object({
  intent: CopilotIntentEnum,
  confidence: z.number().min(0).max(1),
  entities: CopilotEntitiesSchema,
  requires_confirmation: z.boolean(),
  preview: ActionPreviewSchema.nullable(),
  missing_fields: z.array(z.string()),
  reply_ar: z.string(),
  reasoning: z.string().nullable(),
});

export type CopilotCommand = z.infer<typeof CopilotCommandSchema>;

// ============= JSON Schema for OpenAI Structured Outputs =============
export const COPILOT_COMMAND_JSON_SCHEMA = {
  name: "merchant_copilot_command",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: [
          "ADD_EXPENSE",
          "ASK_EXPENSE_SUMMARY",
          "CREATE_PAYMENT_LINK",
          "APPROVE_PAYMENT_PROOF",
          "ASK_COD_STATUS",
          "CLOSE_MONTH",
          "UPDATE_STOCK",
          "ASK_LOW_STOCK",
          "ASK_SHRINKAGE",
          "IMPORT_SUPPLIER_CSV",
          "ASK_TOP_MOVERS",
          "TAG_VIP",
          "REMOVE_VIP",
          "REORDER_LAST",
          "ASK_HIGH_RISK",
          "ASK_NEEDS_FOLLOWUP",
          "ASK_RECOVERED_CARTS",
          "CREATE_ORDER",
          "ASK_KPI",
          "ASK_REVENUE",
          "ASK_ORDER_COUNT",
          "UNKNOWN",
          "CLARIFY",
        ],
        description: "The detected intent from merchant command",
      },
      confidence: {
        type: "number",
        description: "Confidence score 0-1",
      },
      entities: {
        type: "object",
        properties: {
          expense: {
            type: ["object", "null"],
            properties: {
              amount: { type: ["number", "null"] },
              category: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              date: { type: ["string", "null"] },
            },
            required: ["amount", "category", "description", "date"],
            additionalProperties: false,
          },
          stockUpdate: {
            type: ["object", "null"],
            properties: {
              sku: { type: ["string", "null"] },
              productName: { type: ["string", "null"] },
              quantityChange: { type: ["number", "null"] },
              absoluteQuantity: { type: ["number", "null"] },
            },
            required: [
              "sku",
              "productName",
              "quantityChange",
              "absoluteQuantity",
            ],
            additionalProperties: false,
          },
          paymentLink: {
            type: ["object", "null"],
            properties: {
              orderId: { type: ["string", "null"] },
              orderNumber: { type: ["string", "null"] },
              amount: { type: ["number", "null"] },
              customerPhone: { type: ["string", "null"] },
              customerName: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
            },
            required: [
              "orderId",
              "orderNumber",
              "amount",
              "customerPhone",
              "customerName",
              "description",
            ],
            additionalProperties: false,
          },
          vipTag: {
            type: ["object", "null"],
            properties: {
              customerPhone: { type: ["string", "null"] },
              customerName: { type: ["string", "null"] },
              customerId: { type: ["string", "null"] },
            },
            required: ["customerPhone", "customerName", "customerId"],
            additionalProperties: false,
          },
          dateRange: {
            type: ["object", "null"],
            properties: {
              period: {
                type: ["string", "null"],
                enum: [
                  "today",
                  "yesterday",
                  "this_week",
                  "last_week",
                  "this_month",
                  "last_month",
                  "custom",
                  null,
                ],
              },
              startDate: { type: ["string", "null"] },
              endDate: { type: ["string", "null"] },
            },
            required: ["period", "startDate", "endDate"],
            additionalProperties: false,
          },
          order: {
            type: ["object", "null"],
            properties: {
              customerPhone: { type: ["string", "null"] },
              customerName: { type: ["string", "null"] },
              items: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "number" },
                    notes: { type: ["string", "null"] },
                  },
                  required: ["name", "quantity", "notes"],
                  additionalProperties: false,
                },
              },
            },
            required: ["customerPhone", "customerName", "items"],
            additionalProperties: false,
          },
        },
        required: [
          "expense",
          "stockUpdate",
          "paymentLink",
          "vipTag",
          "dateRange",
          "order",
        ],
        additionalProperties: false,
      },
      requires_confirmation: {
        type: "boolean",
        description:
          "Whether this action needs merchant confirmation before execution",
      },
      preview: {
        type: ["object", "null"],
        properties: {
          type: { type: "string" },
          summary_ar: { type: "string" },
          details: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                label_ar: { type: "string" },
                value_ar: { type: "string" },
              },
              required: ["label_ar", "value_ar"],
              additionalProperties: false,
            },
          },
        },
        required: ["type", "summary_ar", "details"],
        additionalProperties: false,
      },
      missing_fields: {
        type: "array",
        items: { type: "string" },
        description: "Fields needed to complete the action",
      },
      reply_ar: {
        type: "string",
        description: "Response in Arabic to show to merchant",
      },
      reasoning: {
        type: ["string", "null"],
        description: "Internal reasoning for the intent detection",
      },
    },
    required: [
      "intent",
      "confidence",
      "entities",
      "requires_confirmation",
      "preview",
      "missing_fields",
      "reply_ar",
      "reasoning",
    ],
    additionalProperties: false,
  },
};

// ============= Intent to Feature Mapping =============
// Maps each intent to the feature(s) required to use it
export const INTENT_FEATURE_MAP: Record<CopilotIntent, string[]> = {
  // Finance
  ADD_EXPENSE: ["REPORTS"],
  ASK_EXPENSE_SUMMARY: ["REPORTS"],
  CREATE_PAYMENT_LINK: ["PAYMENTS"],
  APPROVE_PAYMENT_PROOF: ["PAYMENTS"],
  ASK_COD_STATUS: ["REPORTS"],
  CLOSE_MONTH: ["REPORTS"],

  // Inventory
  UPDATE_STOCK: ["INVENTORY"],
  ASK_LOW_STOCK: ["INVENTORY"],
  ASK_SHRINKAGE: ["INVENTORY"],
  IMPORT_SUPPLIER_CSV: ["INVENTORY"],
  ASK_TOP_MOVERS: ["INVENTORY"],

  // Ops
  TAG_VIP: ["ORDERS"],
  REMOVE_VIP: ["ORDERS"],
  REORDER_LAST: ["ORDERS"],
  ASK_HIGH_RISK: ["ORDERS"],
  ASK_NEEDS_FOLLOWUP: ["ORDERS"],
  ASK_RECOVERED_CARTS: ["ORDERS"],
  CREATE_ORDER: ["ORDERS"],

  // Analytics
  ASK_KPI: ["KPI_DASHBOARD"],
  ASK_REVENUE: ["REPORTS"],
  ASK_ORDER_COUNT: ["ORDERS"],

  // Fallback - always allowed
  UNKNOWN: [],
  CLARIFY: [],
};

// ============= Destructive Intents (require confirmation) =============
export const DESTRUCTIVE_INTENTS: CopilotIntent[] = [
  "ADD_EXPENSE",
  "UPDATE_STOCK",
  "CREATE_PAYMENT_LINK",
  "APPROVE_PAYMENT_PROOF",
  "TAG_VIP",
  "REMOVE_VIP",
  "REORDER_LAST",
  "CREATE_ORDER",
  "CLOSE_MONTH",
  "IMPORT_SUPPLIER_CSV",
];

// ============= RBAC Role Requirements =============
// Maps each intent to the minimum required role level
// Role hierarchy: OWNER (100) > ADMIN (80) > MANAGER (60) > AGENT (40) > CASHIER (30) > VIEWER (20)
export type StaffRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "AGENT"
  | "CASHIER"
  | "VIEWER";

export const INTENT_ROLE_REQUIREMENTS: Record<CopilotIntent, StaffRole> = {
  // Finance - require MANAGER or higher, ADMIN for destructive
  ADD_EXPENSE: "MANAGER",
  ASK_EXPENSE_SUMMARY: "MANAGER",
  CREATE_PAYMENT_LINK: "AGENT",
  APPROVE_PAYMENT_PROOF: "ADMIN", // CRITICAL: Only ADMIN can approve payments
  ASK_COD_STATUS: "MANAGER",
  CLOSE_MONTH: "ADMIN", // CRITICAL: Monthly close is admin-only

  // Inventory - MANAGER for writes, AGENT for reads
  UPDATE_STOCK: "MANAGER",
  ASK_LOW_STOCK: "AGENT",
  ASK_SHRINKAGE: "MANAGER", // Shrinkage reports are sensitive
  IMPORT_SUPPLIER_CSV: "ADMIN", // Bulk imports require admin
  ASK_TOP_MOVERS: "AGENT",

  // Ops - AGENT for most, MANAGER for customer tags
  TAG_VIP: "MANAGER",
  REMOVE_VIP: "MANAGER",
  REORDER_LAST: "AGENT",
  ASK_HIGH_RISK: "AGENT",
  ASK_NEEDS_FOLLOWUP: "AGENT",
  ASK_RECOVERED_CARTS: "AGENT",
  CREATE_ORDER: "AGENT",

  // Analytics - all staff can view
  ASK_KPI: "VIEWER",
  ASK_REVENUE: "VIEWER",
  ASK_ORDER_COUNT: "VIEWER",

  // Fallback - allow any role to ask
  UNKNOWN: "VIEWER",
  CLARIFY: "VIEWER",
};

export const ROLE_HIERARCHY: Record<StaffRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  AGENT: 40,
  CASHIER: 30,
  VIEWER: 20,
};

/**
 * Check if a user role is sufficient for an intent
 */
export function hasPermissionForIntent(
  userRole: StaffRole,
  intent: CopilotIntent,
): boolean {
  const requiredRole = INTENT_ROLE_REQUIREMENTS[intent];
  if (!requiredRole) return true; // Unknown intents are allowed

  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;

  return userLevel >= requiredLevel;
}

/**
 * Get role requirement message in Arabic
 */
export function getRoleRequirementMessage(intent: CopilotIntent): string {
  const roleNames: Record<StaffRole, string> = {
    OWNER: "مالك",
    ADMIN: "مدير",
    MANAGER: "مسؤول",
    AGENT: "موظف",
    CASHIER: "كاشير",
    VIEWER: "مشاهد",
  };
  const required = INTENT_ROLE_REQUIREMENTS[intent];
  return `هذا الإجراء يتطلب صلاحية ${roleNames[required]} أو أعلى`;
}

// ============= Confirmation Tracking =============
export interface PendingAction {
  id: string;
  merchantId: string;
  intent: CopilotIntent;
  command: CopilotCommand;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  source: "portal" | "whatsapp";
  executionResult?: Record<string, unknown>;
}

// ============= Copilot History Entry =============
export interface CopilotHistoryEntry {
  id: string;
  merchantId: string;
  source: "portal" | "whatsapp";
  inputType: "text" | "voice";
  inputText: string;
  intent: CopilotIntent;
  command: CopilotCommand;
  actionTaken: boolean;
  actionResult?: Record<string, unknown>;
  createdAt: Date;
}
