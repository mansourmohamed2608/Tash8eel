import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import { RedisService } from "../../infrastructure/redis/redis.service";

/**
 * Schedules follow-up messages for abandoned carts
 */
@Injectable()
export class FollowupScheduler {
  private readonly logger = new Logger(FollowupScheduler.name);
  private readonly lockKey = "followup-scheduler-lock";
  private readonly lockTtl = 60000; // 60 seconds

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly outboxService: OutboxService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Check for abandoned carts every 10 minutes
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduleFollowups(): Promise<void> {
    const lock = await this.redisService.acquireLock(
      this.lockKey,
      this.lockTtl,
    );
    if (!lock) {
      this.logger.debug("Could not acquire followup scheduler lock");
      return;
    }

    try {
      await this.processAbandonedCarts();
    } catch (error: any) {
      this.logger.error({
        msg: "Error in followup scheduler",
        error: error.message,
      });
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  private async processAbandonedCarts(): Promise<void> {
    // Find conversations that need follow-up:
    // - State is 'COLLECTING_ITEMS' or 'NEGOTIATING'
    // - Has items in cart
    // - Last activity > 30 minutes ago
    // - Follow-up count < 3
    // - No followup scheduled in last 30 minutes
    const query = `
      SELECT c.*, m.name as merchant_name, m.category
      FROM conversations c
      JOIN merchants m ON c.merchant_id = m.id
      WHERE c.state IN ('COLLECTING_ITEMS', 'COLLECTING_CUSTOMER_INFO', 'COLLECTING_ADDRESS', 'NEGOTIATING')
        AND c.cart IS NOT NULL
        AND jsonb_array_length(c.cart->'items') > 0
        AND c.last_message_at < NOW() - INTERVAL '30 minutes'
        AND c.followup_count < 3
        AND (c.next_followup_at IS NULL OR c.next_followup_at < NOW() - INTERVAL '30 minutes')
        AND m.is_active = true
      ORDER BY c.last_message_at ASC
      LIMIT 50
    `;

    const result = await this.pool.query(query);

    if (result.rows.length === 0) {
      this.logger.debug("No conversations need follow-up");
      return;
    }

    this.logger.log({
      msg: "Scheduling follow-ups for abandoned carts",
      count: result.rows.length,
    });

    for (const row of result.rows) {
      const nextFollowupCount = row.followup_count + 1;

      // Calculate follow-up delay based on count
      let delayMinutes: number;
      if (nextFollowupCount === 1) {
        delayMinutes = 0; // First followup - immediate
      } else if (nextFollowupCount === 2) {
        delayMinutes = 60; // 1 hour
      } else {
        delayMinutes = 180; // 3 hours for final
      }

      const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

      // Publish followup scheduled event
      await this.outboxService.publishEvent({
        eventType: EVENT_TYPES.FOLLOWUP_SCHEDULED,
        aggregateType: "conversation",
        aggregateId: row.id,
        merchantId: row.merchant_id,
        payload: {
          conversationId: row.id,
          merchantId: row.merchant_id,
          scheduledAt: scheduledAt.toISOString(),
          followupCount: nextFollowupCount,
        },
      });

      // Update conversation to prevent re-scheduling
      await this.pool.query(
        `UPDATE conversations 
         SET next_followup_at = NOW() + INTERVAL '30 minutes', followup_count = followup_count + 1, updated_at = NOW() 
         WHERE id = $1`,
        [row.id],
      );

      this.logger.debug({
        msg: "Follow-up scheduled",
        conversationId: row.id,
        followupCount: nextFollowupCount,
        scheduledAt: scheduledAt.toISOString(),
      });
    }
  }
}
