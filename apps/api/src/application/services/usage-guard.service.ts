import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { RedisService } from "../../infrastructure/redis/redis.service";

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
  totalMessagesPerDay: number;
  totalMessagesPerMonth: number;
  aiRepliesPerDay: number;
  aiRepliesPerMonth: number;
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

export interface MessagingQuotaStatus {
  totalMessagesDay: UsageCheckResult & {
    warningLevel: "normal" | "warning" | "critical";
  };
  totalMessagesMonth: UsageCheckResult & {
    warningLevel: "normal" | "warning" | "critical";
  };
  aiRepliesDay: UsageCheckResult & {
    warningLevel: "normal" | "warning" | "critical";
  };
  aiRepliesMonth: UsageCheckResult & {
    warningLevel: "normal" | "warning" | "critical";
  };
}

const DEFAULT_LIMITS: UsageLimitsSnapshot = {
  totalMessagesPerDay: 480,
  totalMessagesPerMonth: 14400,
  aiRepliesPerDay: 240,
  aiRepliesPerMonth: 7200,
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

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
  ) {}

  async getEffectiveLimits(merchantId: string): Promise<UsageLimitsSnapshot> {
    const fromMerchant = await this.getLimitsFromMerchantsTable(merchantId);
    if (fromMerchant) {
      return fromMerchant;
    }

    const fromSubscription =
      await this.getLimitsFromActiveSubscription(merchantId);
    if (fromSubscription) {
      return fromSubscription;
    }

    return { ...DEFAULT_LIMITS };
  }

  async getMessagingQuotaStatus(
    merchantId: string,
  ): Promise<MessagingQuotaStatus> {
    const limits = await this.getEffectiveLimits(merchantId);
    const { startDate: dayStart, endDate: dayEnd } =
      this.getPeriodWindow("DAILY");
    const { startDate: monthStart, endDate: monthEnd } =
      this.getPeriodWindow("MONTHLY");

    const [
      totalMessagesDayUsed,
      totalMessagesMonthUsed,
      aiRepliesDayUsed,
      aiRepliesMonthUsed,
    ] = await Promise.all([
      this.countMessages(merchantId, dayStart, dayEnd, false),
      this.countMessages(merchantId, monthStart, monthEnd, false),
      this.countMessages(merchantId, dayStart, dayEnd, true),
      this.countMessages(merchantId, monthStart, monthEnd, true),
    ]);

    return {
      totalMessagesDay: this.buildUsageCheckResult(
        "MESSAGES",
        "DAILY",
        dayStart,
        dayEnd,
        totalMessagesDayUsed,
        limits.totalMessagesPerDay,
      ),
      totalMessagesMonth: this.buildUsageCheckResult(
        "MESSAGES",
        "MONTHLY",
        monthStart,
        monthEnd,
        totalMessagesMonthUsed,
        limits.totalMessagesPerMonth,
      ),
      aiRepliesDay: this.buildUsageCheckResult(
        "AI_CALLS",
        "DAILY",
        dayStart,
        dayEnd,
        aiRepliesDayUsed,
        limits.aiRepliesPerDay,
      ),
      aiRepliesMonth: this.buildUsageCheckResult(
        "AI_CALLS",
        "MONTHLY",
        monthStart,
        monthEnd,
        aiRepliesMonthUsed,
        limits.aiRepliesPerMonth,
      ),
    };
  }

  async checkCustomerAiReplyQuota(merchantId: string): Promise<{
    allowed: boolean;
    blockingMetric:
      | "total_messages_per_day"
      | "total_messages_per_month"
      | "ai_replies_per_day"
      | "ai_replies_per_month"
      | null;
    status: MessagingQuotaStatus;
  }> {
    const status = await this.getMessagingQuotaStatus(merchantId);

    if (!status.totalMessagesDay.allowed) {
      return {
        allowed: false,
        blockingMetric: "total_messages_per_day",
        status,
      };
    }
    if (!status.totalMessagesMonth.allowed) {
      return {
        allowed: false,
        blockingMetric: "total_messages_per_month",
        status,
      };
    }
    if (!status.aiRepliesDay.allowed) {
      return {
        allowed: false,
        blockingMetric: "ai_replies_per_day",
        status,
      };
    }
    if (!status.aiRepliesMonth.allowed) {
      return {
        allowed: false,
        blockingMetric: "ai_replies_per_month",
        status,
      };
    }

    return {
      allowed: true,
      blockingMetric: null,
      status,
    };
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

    const limits = await this.getEffectiveLimits(merchantId);
    const periodType = PERIOD_BY_METRIC[metric];
    const { startDate, endDate } = this.getPeriodWindow(periodType);
    const periodStart = this.toDateOnly(startDate);
    const periodEnd = this.toDateOnly(endDate);
    const baseLimit = Number(limits[LIMIT_KEY_BY_METRIC[metric]] ?? -1);
    const credits = await this.getUsagePackCredits(
      merchantId,
      metric,
      periodType,
      periodStart,
    );
    const limit =
      baseLimit === -1 ? -1 : Math.max(0, Math.round(baseLimit + credits));
    const baselineUsed = await this.getUsedQuantity(
      merchantId,
      metric,
      periodType,
      startDate,
      endDate,
    );
    const skipEnforcement = options?.skipEnforcement === true;
    const periodStartDate = new Date(`${periodStart}T00:00:00.000Z`);
    const periodEndDate = new Date(`${periodEnd}T23:59:59.999Z`);
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
    const client = await this.pool.connect();
    let usedBefore = baselineUsed;

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO usage_period_aggregates (
           merchant_id, metric_key, period_type, period_start, period_end,
           used_quantity, limit_quantity, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (merchant_id, metric_key, period_type, period_start)
         DO UPDATE SET
           period_end = EXCLUDED.period_end,
           limit_quantity = EXCLUDED.limit_quantity,
           metadata = COALESCE(usage_period_aggregates.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          merchantId,
          metric,
          periodType,
          periodStartDate,
          periodEndDate,
          baselineUsed,
          limit === -1 ? null : limit,
          JSON.stringify({
            source: usageSource,
            metric,
          }),
        ],
      );

      const aggregateResult = await client.query<{
        used_quantity: string | number | null;
      }>(
        `SELECT used_quantity
         FROM usage_period_aggregates
         WHERE merchant_id = $1
           AND metric_key = $2
           AND period_type = $3
           AND period_start = $4::date
         FOR UPDATE`,
        [merchantId, metric, periodType, periodStart],
      );
      usedBefore =
        this.toFiniteNumber(aggregateResult.rows[0]?.used_quantity) ??
        baselineUsed;

      if (
        !skipEnforcement &&
        limit !== -1 &&
        usedBefore + safeQuantity > limit
      ) {
        await client.query("ROLLBACK");
        return {
          metric,
          periodType,
          periodStart,
          periodEnd,
          used: usedBefore,
          limit,
          remaining: Math.max(0, limit - usedBefore),
          allowed: false,
        };
      }

      await client.query(
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
          JSON.stringify(entryMetadata),
        ],
      );

      await client.query(
        `UPDATE usage_period_aggregates
         SET used_quantity = used_quantity + $1,
             period_end = $2,
             limit_quantity = $3,
             metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
             updated_at = NOW()
         WHERE merchant_id = $5
           AND metric_key = $6
           AND period_type = $7
           AND period_start = $8::date`,
        [
          safeQuantity,
          periodEndDate,
          limit === -1 ? null : limit,
          JSON.stringify({
            source: usageSource,
            metric,
          }),
          merchantId,
          metric,
          periodType,
          periodStart,
        ],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      this.logger.debug(
        `Atomic usage consume failed for ${metric}: ${(error as Error).message}`,
      );
      return {
        metric,
        periodType,
        periodStart,
        periodEnd,
        used: usedBefore,
        limit,
        remaining: limit === -1 ? -1 : Math.max(0, limit - usedBefore),
        allowed: false,
      };
    } finally {
      client.release();
    }

    // Keep legacy token usage table aligned for existing KPI/report endpoints.
    if (metric === "TOKENS") {
      await this.bumpLegacyTokenUsage(merchantId, periodStart, safeQuantity, 0);
    } else if (metric === "AI_CALLS") {
      await this.bumpLegacyTokenUsage(merchantId, periodStart, 0, safeQuantity);
    }

    const usedAfter = usedBefore + safeQuantity;
    const remainingAfter = limit === -1 ? -1 : Math.max(0, limit - usedAfter);

    return {
      metric,
      periodType,
      periodStart,
      periodEnd,
      used: usedAfter,
      remaining: remainingAfter,
      limit,
      allowed: limit === -1 || usedAfter <= limit,
    };
  }

  async checkAndTrackConversation(
    merchantId: string,
    customerPhone: string,
    messageId: string,
  ): Promise<{ isNewConversation: boolean; quotaExceeded: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,
        [merchantId, customerPhone],
      );

      const activeWindow = await client.query<{ id: string }>(
        `SELECT id
         FROM whatsapp_conversation_windows
         WHERE merchant_id = $1
           AND customer_phone = $2
           AND expires_at > NOW()
         ORDER BY opened_at DESC
         LIMIT 1
         FOR UPDATE`,
        [merchantId, customerPhone],
      );

      if (activeWindow.rows[0]?.id) {
        await client.query(
          `UPDATE whatsapp_conversation_windows
           SET message_count = message_count + 1
           WHERE id = $1`,
          [activeWindow.rows[0].id],
        );
        await client.query("COMMIT");
        return { isNewConversation: false, quotaExceeded: false };
      }

      const merchantPlan = await client.query<{
        currency: string | null;
        plan_name: string | null;
      }>(
        `SELECT
           COALESCE(NULLIF(m.currency, ''), 'EGP') AS currency,
           LOWER(COALESCE(NULLIF(p.name, ''), NULLIF(p.code, ''), 'starter')) AS plan_name
         FROM merchants m
         LEFT JOIN subscriptions s
           ON s.merchant_id = m.id
          AND s.status = 'ACTIVE'
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE m.id = $1
         ORDER BY s.created_at DESC NULLS LAST
         LIMIT 1`,
        [merchantId],
      );

      const currency = String(
        merchantPlan.rows[0]?.currency || "EGP",
      ).toUpperCase();
      const usageResult = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM whatsapp_conversation_windows
         WHERE merchant_id = $1
           AND opened_at >= date_trunc('month', NOW())`,
        [merchantId],
      );
      const monthlyCount = parseInt(usageResult.rows[0]?.total || "0", 10);

      const planLimitResult = await client.query<{
        monthly_conversations_egypt: number | null;
        monthly_conversations_gulf: number | null;
        monthly_conversations_included: number | null;
      }>(
        `SELECT
           pl.monthly_conversations_egypt,
           pl.monthly_conversations_gulf,
           pl.monthly_conversations_included
         FROM subscriptions s
         JOIN plan_limits pl ON pl.plan_id = s.plan_id
         WHERE s.merchant_id = $1
           AND s.status = 'ACTIVE'
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [merchantId],
      );

      const limits = planLimitResult.rows[0];
      const egyptLimit = this.toFiniteNumber(
        limits?.monthly_conversations_egypt,
      );
      const gulfLimit =
        this.toFiniteNumber(limits?.monthly_conversations_gulf) ??
        this.toFiniteNumber(limits?.monthly_conversations_included);
      const limit =
        currency === "AED" || currency === "SAR"
          ? (gulfLimit ?? -1)
          : (egyptLimit ?? -1);
      const quotaExceeded = limit !== -1 && monthlyCount >= limit;
      const isOverage =
        quotaExceeded && (currency === "AED" || currency === "SAR");

      if (quotaExceeded && !isOverage) {
        await client.query("COMMIT");
        return { isNewConversation: true, quotaExceeded: true };
      }

      await client.query(
        `INSERT INTO whatsapp_conversation_windows (
           merchant_id,
           customer_phone,
           opened_at,
           expires_at,
           message_count,
           ai_replies_count,
           instant_reply_count,
           model_4o_count,
           model_mini_count,
           is_overage
         ) VALUES (
           $1,
           $2,
           NOW(),
           NOW() + INTERVAL '24 hours',
           1,
           0,
           0,
           0,
           0,
           $3
         )`,
        [merchantId, customerPhone, isOverage],
      );

      await client.query("COMMIT");
      return { isNewConversation: true, quotaExceeded: false };
    } catch (error) {
      await client.query("ROLLBACK");
      this.logger.warn(
        `Failed to check conversation quota for ${merchantId}/${customerPhone}: ${(error as Error).message}`,
      );
      return { isNewConversation: false, quotaExceeded: false };
    } finally {
      client.release();
    }
  }

  async trackOverage(merchantId: string, count: number): Promise<void> {
    const safeCount = Math.max(1, Math.floor(Number(count || 1)));
    try {
      await this.pool.query(
        `WITH latest_window AS (
           SELECT id
           FROM whatsapp_conversation_windows
           WHERE merchant_id = $1
             AND opened_at >= date_trunc('month', NOW())
           ORDER BY opened_at DESC
           LIMIT 1
         )
         UPDATE whatsapp_conversation_windows
         SET is_overage = true
         WHERE id IN (SELECT id FROM latest_window)`,
        [merchantId],
      );
      if (safeCount > 1) {
        this.logger.debug(
          `Marked latest conversation window as overage ${safeCount} time(s) for ${merchantId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to mark overage for ${merchantId}: ${(error as Error).message}`,
      );
    }
  }

  async notifyMerchantQuotaExceeded(merchantId: string): Promise<void> {
    const redisKey = `quota-exceeded-notified:${merchantId}`;
    try {
      const existing = await this.redisService.get(redisKey);
      if (existing) {
        return;
      }
    } catch {
      // Redis failures should not block notification insertion.
    }

    try {
      await this.pool.query(
        `INSERT INTO notifications (
           merchant_id,
           type,
           title,
           title_ar,
           message,
           message_ar,
           priority,
           channels,
           data
         ) VALUES (
           $1,
           'quota_exceeded',
           'Conversation quota exceeded',
           'تم تجاوز حد المحادثات',
           'Automatic replies are temporarily paused due to plan usage limits.',
           'تم إيقاف الردود التلقائية مؤقتاً بسبب استهلاك حد المحادثات في باقتك.',
           'HIGH',
           ARRAY['IN_APP'],
           $2::jsonb
         )`,
        [merchantId, JSON.stringify({ kind: "quota_exceeded" })],
      );
      await this.redisService.set(redisKey, "1", 3600);
    } catch (error) {
      this.logger.warn(
        `Failed to create quota notification for ${merchantId}: ${(error as Error).message}`,
      );
    }
  }

  @Cron("15 2 * * *")
  async cleanupConversationWindows(): Promise<void> {
    try {
      await this.pool.query(
        `DELETE FROM whatsapp_conversation_windows
         WHERE expires_at < NOW() - INTERVAL '48 hours'`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed cleaning expired conversation windows: ${(error as Error).message}`,
      );
    }

    try {
      await this.pool.query(
        `DELETE FROM ai_routing_log
         WHERE created_at < NOW() - INTERVAL '90 days'`,
      );
    } catch {
      // Table may not exist until the analytics migration is applied.
    }
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
    const periodStartDate = new Date(
      this.toDateOnly(startDate) + "T00:00:00.000Z",
    );
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
        merchantJson.plan_limits ||
        merchantJson.limits ||
        merchantJson.planLimits;
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
           to_jsonb(pl) as limits_json
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

      return this.mergeLimits(this.parseLimitsObject(row.limits_json));
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
        : new Date(
            Date.UTC(
              periodStart.getUTCFullYear(),
              periodStart.getUTCMonth() + 1,
              1,
            ),
          );

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
          const seconds =
            this.toFiniteNumber(result.rows[0]?.seconds_used) || 0;
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
    if (
      (!tokensDelta || tokensDelta <= 0) &&
      (!callsDelta || callsDelta <= 0)
    ) {
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
        [
          merchantId,
          usageDate,
          Math.max(0, Math.round(tokensDelta)),
          Math.max(0, Math.round(callsDelta)),
        ],
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
      totalMessagesPerDay:
        this.toFiniteNumber(
          value.totalMessagesPerDay ??
            value.total_messages_per_day ??
            value.messages_per_day,
        ) ?? undefined,
      totalMessagesPerMonth:
        this.toFiniteNumber(
          value.totalMessagesPerMonth ??
            value.total_messages_per_month ??
            value.messagesPerMonth ??
            value.messages_per_month,
        ) ?? undefined,
      aiRepliesPerDay:
        this.toFiniteNumber(
          value.aiRepliesPerDay ??
            value.ai_replies_per_day ??
            value.aiCallsPerDay ??
            value.ai_calls_per_day,
        ) ?? undefined,
      aiRepliesPerMonth:
        this.toFiniteNumber(
          value.aiRepliesPerMonth ?? value.ai_replies_per_month,
        ) ?? undefined,
      messagesPerMonth:
        this.toFiniteNumber(
          value.messagesPerMonth ?? value.messages_per_month,
        ) ?? undefined,
      aiCallsPerDay:
        this.toFiniteNumber(value.aiCallsPerDay ?? value.ai_calls_per_day) ??
        undefined,
      tokenBudgetDaily:
        this.toFiniteNumber(
          value.tokenBudgetDaily ?? value.token_budget_daily,
        ) ?? undefined,
      paidTemplatesPerMonth:
        this.toFiniteNumber(
          value.paidTemplatesPerMonth ?? value.paid_templates_per_month,
        ) ?? undefined,
      paymentProofScansPerMonth:
        this.toFiniteNumber(
          value.paymentProofScansPerMonth ??
            value.payment_proof_scans_per_month,
        ) ?? undefined,
      voiceMinutesPerMonth:
        this.toFiniteNumber(
          value.voiceMinutesPerMonth ?? value.voice_minutes_per_month,
        ) ?? undefined,
      mapsLookupsPerMonth:
        this.toFiniteNumber(
          value.mapsLookupsPerMonth ?? value.maps_lookups_per_month,
        ) ?? undefined,
    };
  }

  private mergeLimits(
    partial: Partial<UsageLimitsSnapshot> | null,
  ): UsageLimitsSnapshot {
    return {
      totalMessagesPerDay:
        this.toFiniteNumber(partial?.totalMessagesPerDay) ??
        DEFAULT_LIMITS.totalMessagesPerDay,
      totalMessagesPerMonth:
        this.toFiniteNumber(partial?.totalMessagesPerMonth) ??
        this.toFiniteNumber(partial?.messagesPerMonth) ??
        DEFAULT_LIMITS.totalMessagesPerMonth,
      aiRepliesPerDay:
        this.toFiniteNumber(partial?.aiRepliesPerDay) ??
        this.toFiniteNumber(partial?.aiCallsPerDay) ??
        DEFAULT_LIMITS.aiRepliesPerDay,
      aiRepliesPerMonth:
        this.toFiniteNumber(partial?.aiRepliesPerMonth) ??
        DEFAULT_LIMITS.aiRepliesPerMonth,
      messagesPerMonth:
        this.toFiniteNumber(partial?.messagesPerMonth) ??
        this.toFiniteNumber(partial?.totalMessagesPerMonth) ??
        DEFAULT_LIMITS.messagesPerMonth,
      aiCallsPerDay:
        this.toFiniteNumber(partial?.aiCallsPerDay) ??
        this.toFiniteNumber(partial?.aiRepliesPerDay) ??
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

  private buildUsageCheckResult(
    metric: UsageMetricKey,
    periodType: UsagePeriodType,
    startDate: Date,
    endDate: Date,
    used: number,
    limit: number,
  ): UsageCheckResult & { warningLevel: "normal" | "warning" | "critical" } {
    const remaining = limit === -1 ? -1 : Math.max(0, limit - used);
    const allowed = limit === -1 || used < limit;

    return {
      metric,
      periodType,
      periodStart: this.toDateOnly(startDate),
      periodEnd: this.toDateOnly(endDate),
      used,
      limit,
      remaining,
      allowed,
      warningLevel: this.getWarningLevel(used, limit),
    };
  }

  private getWarningLevel(
    used: number,
    limit: number,
  ): "normal" | "warning" | "critical" {
    if (limit <= 0 || limit === -1) return "normal";
    const ratio = used / limit;
    if (ratio >= 0.85) return "critical";
    if (ratio >= 0.7) return "warning";
    return "normal";
  }

  private async countMessages(
    merchantId: string,
    startDate: Date,
    endDate: Date,
    aiRepliesOnly: boolean,
  ): Promise<number> {
    const nextBoundary =
      endDate.getUTCHours() === 23 && endDate.getUTCMinutes() === 59
        ? new Date(endDate.getTime() + 1)
        : endDate;

    try {
      const result = await this.pool.query<{ used: string | number }>(
        `SELECT COUNT(*)::numeric AS used
         FROM messages
         WHERE merchant_id = $1
           AND created_at >= $2
           AND created_at < $3
           ${aiRepliesOnly ? "AND direction = 'outbound' AND COALESCE(llm_used, false) = true" : ""}`,
        [merchantId, startDate, nextBoundary],
      );
      return this.toFiniteNumber(result.rows[0]?.used) || 0;
    } catch {
      return 0;
    }
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
