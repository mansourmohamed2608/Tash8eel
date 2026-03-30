import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";
import { createLogger } from "@tash8eel/shared";

const logger = createLogger("FollowupScheduler");

@Injectable()
export class FollowupSchedulerService {
  private readonly nestLogger = new Logger(FollowupSchedulerService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledFollowups(): Promise<void> {
    this.nestLogger.debug("Checking for scheduled followups...");

    try {
      const client = await this.pool.connect();

      try {
        await client.query("BEGIN");

        // Get followups that are due
        const result = await client.query(
          `SELECT f.id, f.conversation_id, f.merchant_id, f.type, 
                  COALESCE(f.custom_message, f.message_template) as message, 
                  c.sender_id
           FROM followups f
           JOIN conversations c ON c.id = f.conversation_id
           WHERE f.status = 'PENDING' 
           AND f.scheduled_at <= NOW()
           ORDER BY f.scheduled_at ASC
           LIMIT 50
           FOR UPDATE OF f SKIP LOCKED`,
        );

        if (result.rows.length === 0) {
          await client.query("COMMIT");
          return;
        }

        logger.info(`Processing ${result.rows.length} followups`);

        for (const followup of result.rows) {
          try {
            // Create outbox event to send followup
            await client.query(
              `INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, merchant_id, payload, status)
               VALUES ('followup.sent', 'followup', $1, $2, $3, 'PENDING')`,
              [
                followup.id,
                followup.merchant_id,
                JSON.stringify({
                  followupId: followup.id,
                  conversationId: followup.conversation_id,
                  merchantId: followup.merchant_id,
                  type: followup.type,
                  message: followup.message,
                  senderId: followup.sender_id,
                }),
              ],
            );

            // Update followup status
            await client.query(
              `UPDATE followups SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
              [followup.id],
            );

            // Update conversation followup count
            await client.query(
              `UPDATE conversations 
               SET followup_count = followup_count + 1, 
                   next_followup_at = NULL,
                   updated_at = NOW()
               WHERE id = $1`,
              [followup.conversation_id],
            );

            logger.info("Followup processed", { followupId: followup.id });
          } catch (error) {
            logger.error(
              `Failed to process followup ${followup.id}`,
              error as Error,
            );
          }
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const err = error as Error;
      logger.error("Followup scheduler error", {
        message: err.message,
        stack: err.stack,
      });
      // BL-009: persist failure for alerting
      this.pool
        .query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          [
            "FollowupScheduler.processScheduledFollowups",
            err.message,
            err.stack ?? null,
          ],
        )
        .catch(() => {
          /* non-fatal */
        });
    }
  }

  @Cron("0 */6 * * *") // Every 6 hours
  async expireOldFollowups(): Promise<void> {
    this.nestLogger.debug("Expiring old followups...");

    try {
      // Expire followups older than 7 days
      const result = await this.pool.query(
        `UPDATE followups 
         SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
         WHERE status = 'PENDING' 
         AND scheduled_at < NOW() - INTERVAL '7 days'`,
      );

      if (result.rowCount && result.rowCount > 0) {
        logger.info(`Expired ${result.rowCount} old followups`);
      }
    } catch (error) {
      logger.error("Followup expiration error", error as Error);
    }
  }
}
