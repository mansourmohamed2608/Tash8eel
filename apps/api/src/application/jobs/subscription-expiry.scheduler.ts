import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import { RedisService } from "../../infrastructure/redis/redis.service";
/**
 * Runs daily to expire overdue paid subscriptions and send renewal warnings.
 *
 * Expiry policy (ZERO tolerance):
 *   - Once current_period_end passes, the subscription is marked EXPIRED and
 *     the merchant's is_active is set to FALSE immediately — no grace period.
 *   - The WhatsApp AI stops responding entirely. No free quota. No trial fallback.
 *   - Re-activation happens only when the merchant pays (renewal flow calls
 *     updateMerchantProvisioning({ isActive: true }) which flips it back on).
 *
 * Renewal warnings sent before expiry:
 *   - 7 days in advance
 *   - 1 day in advance
 */
@Injectable()
export class SubscriptionExpiryScheduler {
  private readonly logger = new Logger(SubscriptionExpiryScheduler.name);
  private readonly lockKey = "subscription-expiry-scheduler-lock";
  private readonly lockTtl = 300_000; // 5 minutes

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly outboxService: OutboxService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Daily at 2:00 AM UTC (4 AM Egypt time)
   */
  @Cron("0 2 * * *", { timeZone: "UTC" })
  async runDailyExpiryCheck(): Promise<void> {
    const lock = await this.redisService.acquireLock(this.lockKey, this.lockTtl);
    if (!lock) {
      this.logger.debug("Could not acquire subscription expiry lock — skipping");
      return;
    }

    try {
      this.logger.log({ msg: "Running subscription expiry check" });

      const [expired, warned] = await Promise.all([
        this.expireOverdueSubscriptions(),
        this.sendRenewalWarnings(),
      ]);

      this.logger.log({
        msg: "Subscription expiry check complete",
        expired,
        warningsSent: warned,
      });
    } catch (err) {
      this.logger.error(
        { msg: "Subscription expiry check failed", error: (err as Error).message },
        (err as Error).stack,
      );
      try {
        await this.pool.query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          [
            "subscription-expiry-scheduler",
            (err as Error).message,
            (err as Error).stack ?? "",
          ],
        );
      } catch {
        // best effort
      }
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  /**
   * Find ACTIVE paid subscriptions whose current_period_end has passed.
   * Sets subscription status = 'EXPIRED' and merchant is_active = false.
   * Bot goes completely dark. No free quota. No grace period.
   * Re-activation happens only when the merchant pays.
   */
  private async expireOverdueSubscriptions(): Promise<number> {
    // Fetch ACTIVE non-TRIAL subscriptions past their period end
    const result = await this.pool.query<{
      id: string;
      merchant_id: string;
      plan_code: string;
      current_period_end: string;
      notification_phone: string | null;
      merchant_name: string;
    }>(
      `SELECT
         ms.id,
         ms.merchant_id,
         bp.code AS plan_code,
         ms.current_period_end,
         m.notification_phone,
         m.name AS merchant_name
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       JOIN merchants m ON m.id = ms.merchant_id
       WHERE ms.status = 'ACTIVE'
         AND bp.code <> 'TRIAL'
         AND ms.current_period_end IS NOT NULL
         AND ms.current_period_end < NOW()
         AND m.is_active = true`,
      [],
    );

    if (result.rows.length === 0) return 0;

    for (const row of result.rows) {
      try {
        const client = await (this.pool as any).connect();
        try {
          await client.query("BEGIN");

          // 1. Mark subscription EXPIRED
          await client.query(
            `UPDATE merchant_subscriptions
             SET status = 'EXPIRED', updated_at = NOW()
             WHERE id = $1`,
            [row.id],
          );

          // 2. Deactivate merchant — bot stops responding completely
          await client.query(
            `UPDATE merchants
             SET is_active = false, updated_at = NOW()
             WHERE id = $1`,
            [row.merchant_id],
          );

          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        this.logger.warn({
          msg: "Subscription expired — merchant deactivated (is_active=false)",
          merchantId: row.merchant_id,
          subscriptionId: row.id,
          planCode: row.plan_code,
          periodEnd: row.current_period_end,
        });

        // 3. Notify merchant via WhatsApp if they have a notification phone
        if (row.notification_phone) {
          const message =
            `🔴 *انتهى اشتراكك — تم إيقاف الخدمة*\n\n` +
            `مرحباً صاحب ${row.merchant_name}،\n` +
            `انتهت مدة اشتراكك في خطة *${row.plan_code}* بتاريخ ${this.formatDate(row.current_period_end)}.\n\n` +
            `⛔ تم إيقاف المساعد الذكي بشكل كامل حتى تجديد الاشتراك.\n\n` +
            `لإعادة تفعيل الخدمة، اشترك في خطة جديدة من بوابة التاجر.`;

          await this.outboxService.publishEvent({
            eventType: EVENT_TYPES.MERCHANT_ALERTED,
            aggregateType: "Merchant",
            aggregateId: row.merchant_id,
            merchantId: row.merchant_id,
            payload: {
              merchantId: row.merchant_id,
              alertType: "subscription_expired",
              message,
              metadata: {
                subscriptionId: row.id,
                planCode: row.plan_code,
                periodEnd: row.current_period_end,
                sendViaWhatsApp: true,
                recipientPhone: row.notification_phone,
              },
            },
          });
        }
      } catch (err) {
        this.logger.error(
          {
            msg: "Failed to expire subscription",
            subscriptionId: row.id,
            merchantId: row.merchant_id,
            error: (err as Error).message,
          },
          (err as Error).stack,
        );
        // continue processing remaining subscriptions
      }
    }

    return result.rows.length;
  }

  /**
   * Send WhatsApp renewal warnings for subscriptions expiring in 7 or 1 day.
   * Uses notification_phone. Skips if merchant has no notification phone.
   * Returns warning messages sent.
   */
  private async sendRenewalWarnings(): Promise<number> {
    const result = await this.pool.query<{
      merchant_id: string;
      plan_code: string;
      current_period_end: string;
      notification_phone: string | null;
      merchant_name: string;
      days_left: number;
    }>(
      `SELECT
         ms.merchant_id,
         bp.code AS plan_code,
         ms.current_period_end,
         m.notification_phone,
         m.name AS merchant_name,
         EXTRACT(DAY FROM (ms.current_period_end::timestamptz - NOW()))::int AS days_left
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       JOIN merchants m ON m.id = ms.merchant_id
       WHERE ms.status = 'ACTIVE'
         AND bp.code <> 'TRIAL'
         AND ms.current_period_end IS NOT NULL
         AND ms.current_period_end BETWEEN NOW() AND NOW() + INTERVAL '8 days'
         AND m.is_active = true
         AND m.notification_phone IS NOT NULL`,
      [],
    );

    if (result.rows.length === 0) return 0;

    let sent = 0;
    for (const row of result.rows) {
      // Only warn at exactly 7 days and 1 day remaining (rounded)
      if (row.days_left !== 7 && row.days_left !== 1) continue;

      const urgency = row.days_left === 1 ? "غداً" : "خلال 7 أيام";
      const emoji = row.days_left === 1 ? "🚨" : "📅";

      const message =
        `${emoji} *تذكير: اشتراكك ينتهي ${urgency}*\n\n` +
        `مرحباً صاحب ${row.merchant_name}،\n` +
        `اشتراكك في خطة *${row.plan_code}* سينتهي بتاريخ ${this.formatDate(row.current_period_end)}.\n\n` +
        `⚠️ عند انتهاء الاشتراك سيتوقف المساعد الذكي بشكل كامل وفوري.\n` +
        `لضمان استمرارية الخدمة، جدّد اشتراكك قبل انتهاء المدة.`;

      try {
        await this.outboxService.publishEvent({
          eventType: EVENT_TYPES.MERCHANT_ALERTED,
          aggregateType: "Merchant",
          aggregateId: row.merchant_id,
          merchantId: row.merchant_id,
          payload: {
            merchantId: row.merchant_id,
            alertType: "subscription_renewal_warning",
            message,
            metadata: {
              planCode: row.plan_code,
              periodEnd: row.current_period_end,
              daysLeft: row.days_left,
              sendViaWhatsApp: true,
              recipientPhone: row.notification_phone,
            },
          },
        });
        sent++;
      } catch (err) {
        this.logger.warn({
          msg: "Failed to send renewal warning",
          merchantId: row.merchant_id,
          error: (err as Error).message,
        });
      }
    }

    return sent;
  }

  private formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
