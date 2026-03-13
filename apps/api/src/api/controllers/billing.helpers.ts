import { BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import {
  PLAN_ENTITLEMENTS,
  PlanType,
} from "../../shared/entitlements";
import { UsageMetricKey } from "../../application/services/usage-guard.service";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

export const planOrder: Record<string, number> = {
  TRIAL: 0,
  STARTER: 1,
  BASIC: 2,
  GROWTH: 3,
  PRO: 4,
  ENTERPRISE: 5,
  CUSTOM: 6,
};

// ──────────────────────────────────────────────────────────────────────────────
// Plan code normalisation
// ──────────────────────────────────────────────────────────────────────────────

export function normalizePlanCode(value: unknown): PlanType | null {
  const raw = String(value || "").toUpperCase();
  if (!raw) return null;
  if (raw === "PROFESSIONAL" || raw === "PRO_PLAN") return "PRO";
  if (raw === "ENTERPRISES") return "ENTERPRISE";
  if (raw === "FREE") return "STARTER";
  if (raw === "GROW") return "GROWTH";
  if (raw in PLAN_ENTITLEMENTS) return raw as PlanType;
  return null;
}

export function applyCanonicalPlanData<T extends Record<string, any>>(row: T): T {
  const normalizedCode = normalizePlanCode(row?.code || row?.plan_code);
  if (!normalizedCode) return row;

  const canonical = PLAN_ENTITLEMENTS[normalizedCode];
  if (!canonical) return row;

  const priceCents =
    canonical.price !== undefined
      ? Math.round(canonical.price * 100)
      : row.price_cents;
  return {
    ...row,
    code: row.code || normalizedCode,
    plan_code: row.plan_code || normalizedCode,
    price_cents: priceCents,
    currency: canonical.currency || row.currency || "EGP",
    features: canonical.enabledFeatures,
    agents: canonical.enabledAgents,
    limits: canonical.limits,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Merchant schema helpers
// ──────────────────────────────────────────────────────────────────────────────

export async function getMerchantColumns(
  client: { query: Function },
): Promise<Set<string>> {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'merchants'`,
  );
  return new Set(
    result.rows.map((row: { column_name: string }) => row.column_name),
  );
}

export async function updateMerchantProvisioning(
  client: { query: Function },
  params: {
    merchantId: string;
    planCode: string;
    enabledAgents: string[];
    enabledFeatures: string[];
    limits: Record<string, any>;
    dailyTokenBudget?: number;
    isActive?: boolean;
  },
): Promise<void> {
  const columns = await getMerchantColumns(client);
  const updates: string[] = [];
  const values: any[] = [params.merchantId];
  let idx = 2;

  if (columns.has("enabled_agents")) {
    updates.push(`enabled_agents = $${idx++}`);
    values.push(params.enabledAgents);
  }
  if (columns.has("enabled_features")) {
    updates.push(`enabled_features = $${idx++}`);
    values.push(params.enabledFeatures);
  }
  if (columns.has("plan")) {
    updates.push(`plan = $${idx++}`);
    values.push(params.planCode);
  }
  if (columns.has("daily_token_budget")) {
    updates.push(`daily_token_budget = $${idx++}`);
    values.push(params.dailyTokenBudget ?? 100000);
  }
  if (columns.has("limits")) {
    updates.push(`limits = $${idx++}::jsonb`);
    values.push(JSON.stringify(params.limits || {}));
  }
  if (columns.has("plan_limits")) {
    updates.push(`plan_limits = $${idx++}::jsonb`);
    values.push(JSON.stringify(params.limits || {}));
  }
  if (columns.has("is_active") && params.isActive !== undefined) {
    updates.push(`is_active = $${idx++}`);
    values.push(params.isActive);
  }
  if (columns.has("updated_at")) {
    updates.push(`updated_at = NOW()`);
  }

  if (updates.length === 0) return;

  await client.query(
    `UPDATE merchants
     SET ${updates.join(", ")}
     WHERE id = $1`,
    values,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Region / cycle validation
// ──────────────────────────────────────────────────────────────────────────────

export function normalizeRegion(value?: unknown): "EG" | "SA" | "AE" | "OM" | "KW" {
  const region = String(value || "EG")
    .trim()
    .toUpperCase();
  if (region === "EG" || region === "SA" || region === "AE" || region === "OM" || region === "KW") {
    return region;
  }
  throw new BadRequestException("regionCode must be one of: EG, SA, AE, OM, KW");
}

export function normalizeCycle(value?: unknown): 1 | 3 | 6 | 12 {
  const cycle = Number(value || 1);
  if (cycle === 1 || cycle === 3 || cycle === 6 || cycle === 12) {
    return cycle as 1 | 3 | 6 | 12;
  }
  throw new BadRequestException("cycleMonths must be one of: 1, 3, 6, 12");
}

// ──────────────────────────────────────────────────────────────────────────────
// Primitive coercions
// ──────────────────────────────────────────────────────────────────────────────

export function toNumberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const output: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      output[key] = n;
    }
  }
  return output;
}

export function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item));
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

export function toLimitsFromPlanRow(
  row: Record<string, any>,
): Record<string, number> {
  return {
    messagesPerMonth: Number(row.messages_per_month || 0),
    whatsappNumbers: Number(row.whatsapp_numbers || 0),
    teamMembers: Number(row.team_members || 0),
    aiCallsPerDay: Number(row.ai_calls_per_day || 0),
    tokenBudgetDaily: Number(row.token_budget_daily || 0),
    paidTemplatesPerMonth: Number(row.paid_templates_per_month || 0),
    paymentProofScansPerMonth: Number(row.payment_proof_scans_per_month || 0),
    voiceMinutesPerMonth: Number(row.voice_minutes_per_month || 0),
    mapsLookupsPerMonth: Number(row.maps_lookups_per_month || 0),
    posConnections: Number(row.pos_connections || 0),
    branches: Number(row.branches || 0),
    retentionDays: Number(row.retention_days || 0),
    alertRules: Number(row.alert_rules || 0),
    automations: Number(row.automations || 0),
    autoRunsPerDay: Number(row.auto_runs_per_day || 0),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Credit application (shared by topups)
// ──────────────────────────────────────────────────────────────────────────────

export interface UsagePackCredit {
  metric: UsageMetricKey;
  quantity: number;
}

export function resolveUsagePackCredits(
  pack: {
    metric_key: string;
    included_units?: number | string | null;
    included_ai_calls_per_day?: number | string | null;
    included_token_budget_daily?: number | string | null;
    limit_deltas?: Record<string, number> | null;
  },
  quantity: number,
): UsagePackCredit[] {
  const limitDeltas = toNumberRecord(pack.limit_deltas);
  const credits: UsagePackCredit[] = [];

  if (pack.metric_key === "AI_CAPACITY") {
    const aiCalls = Number(
      limitDeltas.aiCallsPerDay ?? pack.included_ai_calls_per_day ?? 0,
    );
    const tokens = Number(
      limitDeltas.tokenBudgetDaily ?? pack.included_token_budget_daily ?? 0,
    );
    if (aiCalls > 0) credits.push({ metric: "AI_CALLS", quantity: aiCalls * quantity });
    if (tokens > 0) credits.push({ metric: "TOKENS", quantity: tokens * quantity });
  } else {
    const units = Number(
      limitDeltas.paymentProofScansPerMonth ??
        limitDeltas.voiceMinutesPerMonth ??
        limitDeltas.paidTemplatesPerMonth ??
        limitDeltas.mapsLookupsPerMonth ??
        pack.included_units ??
        0,
    );
    const metricMap: Record<string, UsageMetricKey> = {
      PAYMENT_PROOF_SCANS: "PAYMENT_PROOF_SCANS",
      VOICE_MINUTES: "VOICE_MINUTES",
      PAID_TEMPLATES: "PAID_TEMPLATES",
      MAP_LOOKUPS: "MAP_LOOKUPS",
    };
    const metric = metricMap[String(pack.metric_key || "")];
    if (metric && units > 0) credits.push({ metric, quantity: units * quantity });
  }

  return credits;
}
