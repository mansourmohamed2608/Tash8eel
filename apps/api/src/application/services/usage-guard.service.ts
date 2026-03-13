import { Inject, Injectable, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

export type UsageMetricKey =
  | "MESSAGES"
  | "AI_CALLS"
  | "TOKENS"
  | "PAID_TEMPLATES"
  | "PAYMENT_PROOF_SCANS"
  | "VOICE_MINUTES"
  | "MAP_LOOKUPS";

export type UsagePeriodType = "DAILY" | "MONTHLY";

export interface UsageLimitsSnapshot {
  messagesPerMonth: number;
  aiCallsPerDay: number;
  tokenBudgetDaily: number;
  paidTemplatesPerMonth: number;
  paymentProofScansPerMonth: number;
  voiceMinutesPerMonth: number;
  mapsLookupsPerMonth: number;
}

export interface UsageCheckResult {
  metric: UsageMetricKey;
  periodType: UsagePeriodType;
  periodStart: string;
  periodEnd: string;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
}

const DEFAULT_LIMITS: UsageLimitsSnapshot = {
  messagesPerMonth: 15000,
  aiCallsPerDay: 500,
  tokenBudgetDaily: 200000,
  paidTemplatesPerMonth: 15,
  paymentProofScansPerMonth: 80,
  voiceMinutesPerMonth: 20,
  mapsLookupsPerMonth: 200,
};

const PERIOD_BY_METRIC: Record<UsageMetricKey, UsagePeriodType> = {
  MESSAGES: "MONTHLY",
  AI_CALLS: "DAILY",
  TOKENS: "DAILY",
  PAID_TEMPLATES: "MONTHLY",
  PAYMENT_PROOF_SCANS: "MONTHLY",
  VOICE_MINUTES: "MONTHLY",
  MAP_LOOKUPS: "MONTHLY",
};

const LIMIT_KEY_BY_METRIC: Record<UsageMetricKey, keyof UsageLimitsSnapshot> = {
  MESSAGES: "messagesPerMonth",
  AI_CALLS: "aiCallsPerDay",
  TOKENS: "tokenBudgetDaily",
  PAID_TEMPLATES: "paidTemplatesPerMonth",
  PAYMENT_PROOF_SCANS: "paymentProofScansPerMonth",
  VOICE_MINUTES: "voiceMinutesPerMonth",
  MAP_LOOKUPS: "mapsLookupsPerMonth",
};

@Injectable()
export class UsageGuardService {
  private readonly logger = new Logger(UsageGuardService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getEffectiveLimits(merchantId: string): Promise<UsageLimitsSnapshot> {
    const fromMerchant = await this.getLimitsFromMerchantsTable(merchantId);
    if (fromMerchant) {
      return fromMerchant;
    }

    const fromSubscription = await this.getLimitsFromActiveSubscription(
      merchantId,
    );
    if (fromSubscription) {
      return fromSubscription;
    }

    return { ...DEFAULT_LIMITS };
  }

  async checkLimit(
    merchantId: string,
    metric: UsageMetricKey,
  ): Promise<UsageCheckResult> {
    const limits = await this.getEffectiveLimits(merchantId);
    const periodType = PERIOD_BY_METRIC[metric];
    const { startDate, endDate } = this.getPeriodWindow(periodType);
    const periodStart = this.toDateOnly(startDate);
    const periodEnd = this.toDateOnly(endDate);

    const used = await this.getUsedQuantity(
      merchantId,
      metric,
      periodType,
      startDate,
      endDate,
    );
    const baseLimit = Number(limits[LIMIT_KEY_BY_METRIC[metric]] ?? -1);
    const credits = await this.getUsagePackCredits(
      merchantId,
      metric,
      periodType,
      periodStart,
    );
    const limit =
      baseLimit === -1 ? -1 : Math.max(0, Math.round(baseLimit + credits));
    const allowed = limit === -1 || used < limit;
    const remaining = limit === -1 ? -1 : Math.max(0, limit - used);

    return {
      metric,
      periodType,
      periodStart,
      periodEnd,
      used,
      limit,
      remaining,
      allowed,
    };
  }

  async consume(
    merchantId: string,
    metric: UsageMetricKey,
    quantity: number,
    options?: { metadata?: Record<string, unknown>; skipEnforcement?: boolean },
  ): Promise<UsageCheckResult> {
    const safeQuantity = Number(quantity || 0);
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
      return this.checkLimit(merchantId, metric);
    }

    const check = await this.checkLimit(merchantId, metric);
    const skipEnforcement = options?.skipEnforcement === true;
    if (
      !skipEnforcement &&
      check.limit !== -1 &&
      check.used + safeQuantity > check.limit
    ) {
      return {
        ...check,
        allowed: false,
        remaining: Math.max(0, check.limit - check.used),
      };
    }

    const periodStartDate = new Date(`${check.periodStart}T00:00:00.000Z`);
    const periodEndDate = new Date(`${check.periodEnd}T23:59:59.999Z`);
    const metadata = options?.metadata || {};
    const metadataSource = metadata["source"];
    const usageSource =
      typeof metadataSource === "string" && metadataSource.trim().length > 0
        ? metadataSource
        : "runtime";
    const entryMetadata = {
      ...metadata,
      entryType: "CONSUME" as const,
      metric,
      source: usageSource,
    };

    // Persist usage in canonical ledger tables (best effort for compatibility).
    try {
      await this.pool.query(
        `INSERT INTO usage_ledger (
           merchant_id, metric_key, quantity, unit, period_type, period_start, period_end, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          merchantId,
          metric,
          safeQuantity,
          this.resolveUnit(metric),
          check.periodType,
          periodStartDate,
          periodEndDate,
          JSON.stringify(entryMetadata),
        ],
      );
    } catch (error) {
      this.logger.debug(
        `usage_ledger insert skipped for ${metric}: ${(error as Error).message}`,
      );
    }

    try {
      await this.pool.query(
        `INSERT INTO usage_period_aggregates (
           merchant_id, metric_key, period_type, period_start, period_end,
           used_quantity, limit_quantity, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (merchant_id, metric_key, period_type, period_start)
         DO UPDATE SET
           used_quantity = usage_period_aggregates.used_quantity + EXCLUDED.used_quantity,
           period_end = EXCLUDED.period_end,
           limit_quantity = EXCLUDED.limit_quantity,
           metadata = COALESCE(usage_period_aggregates.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          merchantId,
          metric,
          check.periodType,
          periodStartDate,
          periodEndDate,
          safeQuantity,
          check.limit === -1 ? null : check.limit,
          JSON.stringify({
            source: usageSource,
            metric,
          }),
        ],
      );
    } catch (error) {
      this.logger.debug(
        `usage_period_aggregates upsert skipped for ${metric}: ${(error as Error).message}`,
      );
    }

    // Keep legacy token usage table aligned for existing KPI/report endpoints.
    if (metric === "TOKENS") {
      await this.bumpLegacyTokenUsage(merchantId, check.periodStart, safeQuantity, 0);
    } else if (metric === "AI_CALLS") {
      await this.bumpLegacyTokenUsage(merchantId, check.periodStart, 0, safeQuantity);
    }

    const usedAfter = check.used + safeQuantity;
    const remainingAfter =
      check.limit === -1 ? -1 : Math.max(0, check.limit - usedAfter);

    return {
      ...check,
      used: usedAfter,
      remaining: remainingAfter,
      allowed: check.limit === -1 || usedAfter <= check.limit,
    };
  }

  async recordUsagePackCredit(
    merchantId: string,
    metric: UsageMetricKey,
    quantity: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const safeQuantity = Number(quantity || 0);
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) return;

    const periodType = PERIOD_BY_METRIC[metric];
    const { startDate, endDate } = this.getPeriodWindow(periodType);
    const periodStartDate = new Date(this.toDateOnly(startDate) + "T00:00:00.000Z");
    const periodEndDate = new Date(this.toDateOnly(endDate) + "T23:59:59.999Z");

    try {
      await this.pool.query(
        `INSERT INTO usage_ledger (
           merchant_id, metric_key, quantity, unit, period_type, period_start, period_end, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          merchantId,
          metric,
          safeQuantity,
          this.resolveUnit(metric),
          periodType,
          periodStartDate,
          periodEndDate,
          JSON.stringify({
            ...(metadata || {}),
            entryType: "CREDIT",
            creditSource: "USAGE_PACK",
            metric,
          }),
        ],
      );
    } catch (error) {
      this.logger.warn(
        `Failed to record usage pack credit for ${metric}: ${(error as Error).message}`,
      );
    }
  }

  private async getLimitsFromMerchantsTable(
    merchantId: string,
  ): Promise<UsageLimitsSnapshot | null> {
    try {
      const result = await this.pool.query(
        `SELECT to_jsonb(m) as merchant_json
         FROM merchants m
         WHERE m.id = $1
         LIMIT 1`,
        [merchantId],
      );
      if (!result.rows[0]?.merchant_json) {
        return null;
      }

      const merchantJson = result.rows[0].merchant_json || {};
      const limitsRaw =
        merchantJson.plan_limits || merchantJson.limits || merchantJson.planLimits;
      const parsedLimits = this.parseLimitsObject(limitsRaw);
      return this.mergeLimits(parsedLimits);
    } catch (error) {
      this.logger.debug(
        `Failed reading limits from merchants: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async getLimitsFromActiveSubscription(
    merchantId: string,
  ): Promise<UsageLimitsSnapshot | null> {
    try {
      const result = await this.pool.query(
        `SELECT
           pl.messages_per_month,
           pl.ai_calls_per_day,
           pl.token_budget_daily,
           pl.paid_templates_per_month,
           pl.payment_proof_scans_per_month,
           pl.voice_minutes_per_month,
           pl.maps_lookups_per_month
         FROM subscriptions s
         JOIN plan_limits pl ON pl.plan_id = s.plan_id
         WHERE s.merchant_id = $1
           AND s.status = 'ACTIVE'
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [merchantId],
      );

      const row = result.rows[0];
      if (!row) return null;

      return this.mergeLimits({
        messagesPerMonth: this.toFiniteNumber(row.messages_per_month),
        aiCallsPerDay: this.toFiniteNumber(row.ai_calls_per_day),
        tokenBudgetDaily: this.toFiniteNumber(row.token_budget_daily),
        paidTemplatesPerMonth: this.toFiniteNumber(
          row.paid_templates_per_month,
        ),
        paymentProofScansPerMonth: this.toFiniteNumber(
          row.payment_proof_scans_per_month,
        ),
        voiceMinutesPerMonth: this.toFiniteNumber(row.voice_minutes_per_month),
        mapsLookupsPerMonth: this.toFiniteNumber(row.maps_lookups_per_month),
      });
    } catch (error) {
      this.logger.debug(
        `Failed reading limits from subscriptions: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async getUsedQuantity(
    merchantId: string,
    metric: UsageMetricKey,
    periodType: UsagePeriodType,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const periodStartDate = this.toDateOnly(periodStart);
    const nextBoundary =
      periodType === "DAILY"
        ? new Date(periodStart.getTime() + 24 * 60 * 60 * 1000)
        : new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));

    if (metric !== "MESSAGES") {
      try {
        const aggResult = await this.pool.query(
          `SELECT used_quantity
           FROM usage_period_aggregates
           WHERE merchant_id = $1
             AND metric_key = $2
             AND period_type = $3
             AND period_start = $4::date
           LIMIT 1`,
          [merchantId, metric, periodType, periodStartDate],
        );
        const fromAgg = this.toFiniteNumber(aggResult.rows[0]?.used_quantity);
        if (fromAgg !== null) {
          return fromAgg;
        }
      } catch {
        // Fallback to legacy/runtime sources below.
      }
    }

    try {
      switch (metric) {
        case "MESSAGES": {
          const result = await this.pool.query(
            `SELECT COUNT(*)::numeric as used
             FROM messages
             WHERE merchant_id = $1
               AND created_at >= $2
               AND created_at < $3`,
            [merchantId, periodStart, nextBoundary],
          );
          return this.toFiniteNumber(result.rows[0]?.used) || 0;
        }

        case "AI_CALLS": {
          const result = await this.pool.query(
            `SELECT COUNT(*)::numeric as used
             FROM copilot_history
             WHERE merchant_id = $1
               AND created_at >= $2
               AND created_at < $3`,
            [merchantId, periodStart, nextBoundary],
          );
          return this.toFiniteNumber(result.rows[0]?.used) || 0;
        }

        case "TOKENS": {
          const result = await this.pool.query(
            `SELECT COALESCE(SUM(tokens_used), 0)::numeric as used
             FROM merchant_token_usage
             WHERE merchant_id = $1
               AND usage_date = $2::date`,
            [merchantId, this.toDateOnly(periodStart)],
          );
          return this.toFiniteNumber(result.rows[0]?.used) || 0;
        }

        case "PAYMENT_PROOF_SCANS": {
          const result = await this.pool.query(
            `SELECT COUNT(*)::numeric as used
             FROM payment_proofs
             WHERE merchant_id = $1
               AND created_at >= $2
               AND created_at < $3`,
            [merchantId, periodStart, nextBoundary],
          );
          return this.toFiniteNumber(result.rows[0]?.used) || 0;
        }

        case "VOICE_MINUTES": {
          const result = await this.pool.query(
            `SELECT COALESCE(SUM(duration_seconds), 0)::numeric as seconds_used
             FROM voice_transcriptions
             WHERE merchant_id = $1
               AND created_at >= $2
               AND created_at < $3`,
            [merchantId, periodStart, nextBoundary],
          );
          const seconds = this.toFiniteNumber(result.rows[0]?.seconds_used) || 0;
          return seconds / 60;
        }

        case "PAID_TEMPLATES": {
          const result = await this.pool.query(
            `SELECT COUNT(*)::numeric as used
             FROM whatsapp_message_log
             WHERE to_number IS NOT NULL
               AND direction = 'outbound'
               AND merchant_id = $1
               AND created_at >= $2
               AND created_at < $3
               AND COALESCE(raw_webhook_payload::text, '') ILIKE '%"type":"template"%'`,
            [merchantId, periodStart, nextBoundary],
          );
          return this.toFiniteNumber(result.rows[0]?.used) || 0;
        }

        case "MAP_LOOKUPS": {
          const result = await this.pool.query(
            `SELECT COALESCE(SUM(quantity), 0)::numeric AS used
             FROM usage_ledger
             WHERE merchant_id = $1
               AND metric_key = 'MAP_LOOKUPS'
               AND period_type = $2
               AND period_start = $3::date
               AND COALESCE(metadata->>'entryType', '') = 'CONSUME'`,
            [merchantId, periodType, periodStartDate],
          );
          return this.toFiniteNumber(result.rows[0]?.used) || 0;
        }

        default:
          return 0;
      }
    } catch {
      return 0;
    }
  }

  private async getUsagePackCredits(
    merchantId: string,
    metric: UsageMetricKey,
    periodType: UsagePeriodType,
    periodStart: string,
  ): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COALESCE(SUM(quantity), 0)::numeric as credits
         FROM usage_ledger
         WHERE merchant_id = $1
           AND metric_key = $2
           AND period_type = $3
           AND period_start = $4::date
           AND COALESCE(metadata->>'entryType', '') = 'CREDIT'
           AND COALESCE(metadata->>'creditSource', '') = 'USAGE_PACK'`,
        [merchantId, metric, periodType, periodStart],
      );
      return this.toFiniteNumber(result.rows[0]?.credits) || 0;
    } catch {
      return 0;
    }
  }

  private async bumpLegacyTokenUsage(
    merchantId: string,
    usageDate: string,
    tokensDelta: number,
    callsDelta: number,
  ): Promise<void> {
    if ((!tokensDelta || tokensDelta <= 0) && (!callsDelta || callsDelta <= 0)) {
      return;
    }
    try {
      await this.pool.query(
        `INSERT INTO merchant_token_usage (merchant_id, usage_date, tokens_used, llm_calls)
         VALUES ($1, $2::date, $3, $4)
         ON CONFLICT (merchant_id, usage_date)
         DO UPDATE SET
           tokens_used = merchant_token_usage.tokens_used + EXCLUDED.tokens_used,
           llm_calls = merchant_token_usage.llm_calls + EXCLUDED.llm_calls,
           updated_at = NOW()`,
        [merchantId, usageDate, Math.max(0, Math.round(tokensDelta)), Math.max(0, Math.round(callsDelta))],
      );
    } catch (error) {
      this.logger.debug(
        `Failed syncing merchant_token_usage: ${(error as Error).message}`,
      );
    }
  }

  private resolveUnit(metric: UsageMetricKey): string {
    switch (metric) {
      case "VOICE_MINUTES":
        return "minute";
      case "TOKENS":
        return "token";
      default:
        return "count";
    }
  }

  private getPeriodWindow(periodType: UsagePeriodType): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    if (periodType === "DAILY") {
      const startDate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
      const endDate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
      return { startDate, endDate };
    }

    const startDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const endDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    return { startDate, endDate };
  }

  private parseLimitsObject(raw: any): Partial<UsageLimitsSnapshot> {
    if (!raw) return {};
    const value =
      typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return {};
            }
          })()
        : raw;

    return {
      messagesPerMonth: this.toFiniteNumber(
        value.messagesPerMonth ?? value.messages_per_month,
      ),
      aiCallsPerDay: this.toFiniteNumber(
        value.aiCallsPerDay ?? value.ai_calls_per_day,
      ),
      tokenBudgetDaily: this.toFiniteNumber(
        value.tokenBudgetDaily ?? value.token_budget_daily,
      ),
      paidTemplatesPerMonth: this.toFiniteNumber(
        value.paidTemplatesPerMonth ?? value.paid_templates_per_month,
      ),
      paymentProofScansPerMonth: this.toFiniteNumber(
        value.paymentProofScansPerMonth ??
          value.payment_proof_scans_per_month,
      ),
      voiceMinutesPerMonth: this.toFiniteNumber(
        value.voiceMinutesPerMonth ?? value.voice_minutes_per_month,
      ),
      mapsLookupsPerMonth: this.toFiniteNumber(
        value.mapsLookupsPerMonth ?? value.maps_lookups_per_month,
      ),
    };
  }

  private mergeLimits(
    partial: Partial<UsageLimitsSnapshot> | null,
  ): UsageLimitsSnapshot {
    return {
      messagesPerMonth:
        this.toFiniteNumber(partial?.messagesPerMonth) ??
        DEFAULT_LIMITS.messagesPerMonth,
      aiCallsPerDay:
        this.toFiniteNumber(partial?.aiCallsPerDay) ??
        DEFAULT_LIMITS.aiCallsPerDay,
      tokenBudgetDaily:
        this.toFiniteNumber(partial?.tokenBudgetDaily) ??
        DEFAULT_LIMITS.tokenBudgetDaily,
      paidTemplatesPerMonth:
        this.toFiniteNumber(partial?.paidTemplatesPerMonth) ??
        DEFAULT_LIMITS.paidTemplatesPerMonth,
      paymentProofScansPerMonth:
        this.toFiniteNumber(partial?.paymentProofScansPerMonth) ??
        DEFAULT_LIMITS.paymentProofScansPerMonth,
      voiceMinutesPerMonth:
        this.toFiniteNumber(partial?.voiceMinutesPerMonth) ??
        DEFAULT_LIMITS.voiceMinutesPerMonth,
      mapsLookupsPerMonth:
        this.toFiniteNumber(partial?.mapsLookupsPerMonth) ??
        DEFAULT_LIMITS.mapsLookupsPerMonth,
    };
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toFiniteNumber(value: any): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
  }
}
