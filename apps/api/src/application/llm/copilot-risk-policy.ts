import { CopilotIntent, DESTRUCTIVE_INTENTS } from "./copilot-schema";

export type CopilotRiskTier = "low" | "medium" | "high" | "critical";

export interface CopilotRiskProfile {
  intent: CopilotIntent;
  tier: CopilotRiskTier;
  requiresExplicitApproval: boolean;
  requiresManagerReview: boolean;
  maxAutoExecuteConfidence: number;
  reason: string;
}

const CRITICAL_INTENTS = new Set<CopilotIntent>([
  "APPROVE_PAYMENT_PROOF",
  "CLOSE_MONTH",
  "IMPORT_SUPPLIER_CSV",
]);

const HIGH_INTENTS = new Set<CopilotIntent>([
  "ADD_EXPENSE",
  "UPDATE_STOCK",
  "CREATE_PAYMENT_LINK",
  "TAG_VIP",
  "REMOVE_VIP",
  "REORDER_LAST",
  "CREATE_ORDER",
]);

const MEDIUM_INTENTS = new Set<CopilotIntent>([
  "ASK_COD_STATUS",
  "ASK_SHRINKAGE",
  "ASK_HIGH_RISK",
  "ASK_NEEDS_FOLLOWUP",
  "ASK_RECOVERED_CARTS",
]);

const DEFAULT_REASON: Record<CopilotRiskTier, string> = {
  low: "Read-only or low-impact operation",
  medium: "Operational action with moderate merchant impact",
  high: "Financial, stock, or customer-impacting mutation",
  critical: "High-impact financial/administrative operation",
};

export function evaluateCopilotActionRisk(
  intent: CopilotIntent,
): CopilotRiskProfile {
  let tier: CopilotRiskTier = "low";

  if (CRITICAL_INTENTS.has(intent)) {
    tier = "critical";
  } else if (HIGH_INTENTS.has(intent)) {
    tier = "high";
  } else if (MEDIUM_INTENTS.has(intent)) {
    tier = "medium";
  }

  const requiresExplicitApproval = DESTRUCTIVE_INTENTS.includes(intent);
  const requiresManagerReview = tier === "critical";
  const maxAutoExecuteConfidence =
    tier === "critical"
      ? 0
      : tier === "high"
        ? 0.95
        : tier === "medium"
          ? 0.9
          : 0.85;

  return {
    intent,
    tier,
    requiresExplicitApproval,
    requiresManagerReview,
    maxAutoExecuteConfidence,
    reason: DEFAULT_REASON[tier],
  };
}
