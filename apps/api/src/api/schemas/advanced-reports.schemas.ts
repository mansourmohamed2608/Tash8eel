import { z } from "zod";

// ============================================================================
// Shared Validators
// ============================================================================

const uuidOrId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid ID format");
const isoDateStr = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    "Invalid date format (ISO 8601)",
  );
const safePeriodDays = z.coerce.number().int().min(1).max(365).default(30);

// ============================================================================
// Finance Reports Schemas
// ============================================================================

export const TaxReportSchema = z
  .object({
    periodStart: isoDateStr,
    periodEnd: isoDateStr,
    includeExempt: z.boolean().optional(),
  })
  .refine((data) => new Date(data.periodEnd) >= new Date(data.periodStart), {
    message: "periodEnd must be on or after periodStart",
    path: ["periodEnd"],
  });

export const CashFlowForecastQuerySchema = z.object({
  forecastDays: z.coerce.number().int().min(7).max(90).default(30),
});

export const PeriodQuerySchema = z.object({
  periodDays: safePeriodDays,
});

// ============================================================================
// Advanced Inventory Schemas
// ============================================================================

export const ReceiveLotSchema = z.object({
  itemId: uuidOrId,
  variantId: uuidOrId.optional(),
  lotNumber: z.string().min(1).max(100).trim(),
  batchId: z.string().max(100).trim().optional(),
  quantity: z.number().int().min(1).max(1_000_000),
  costPrice: z.number().min(0).max(10_000_000),
  expiryDate: isoDateStr.optional(),
  supplierId: uuidOrId.optional(),
  notes: z.string().max(1000).trim().optional(),
});

export const MergeSkusSchema = z
  .object({
    sourceItemId: uuidOrId,
    targetItemId: uuidOrId,
    reason: z.string().max(500).trim().optional(),
  })
  .refine((data) => data.sourceItemId !== data.targetItemId, {
    message: "Source and target items must be different",
    path: ["targetItemId"],
  });

export const FifoCOGSSchema = z.object({
  itemId: uuidOrId,
  quantitySold: z.number().int().min(1).max(1_000_000),
});

// ============================================================================
// Customer Intelligence Schemas
// ============================================================================

const MEMORY_TYPES = [
  "PREFERENCE",
  "ALLERGY",
  "SIZE",
  "HABIT",
  "FEEDBACK",
  "NOTE",
  "CUSTOM",
] as const;

export const SaveMemorySchema = z.object({
  customerId: uuidOrId,
  memoryType: z.enum(MEMORY_TYPES).or(
    z
      .string()
      .min(1)
      .max(50)
      .regex(/^[A-Z_]+$/),
  ),
  key: z.string().min(1).max(200).trim(),
  value: z.string().min(1).max(5000).trim(),
  source: z.string().max(50).trim().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const AiDecisionQuerySchema = z.object({
  agentType: z
    .string()
    .max(50)
    .regex(/^[A-Z_]+$/)
    .optional(),
  decisionType: z
    .string()
    .max(50)
    .regex(/^[A-Z_]+$/)
    .optional(),
  entityType: z
    .string()
    .max(50)
    .regex(/^[A-Z_]+$/)
    .optional(),
  entityId: uuidOrId.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
