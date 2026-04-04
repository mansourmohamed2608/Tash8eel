import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { NotificationsService } from "../services/notifications.service";

/**
 * Schedules follow-up messages for abandoned carts.
 * Sends personalized WhatsApp messages directly using NotificationsService.
 * Tries to use AI-generated message (merchant context), falls back to rich static template.
 */
@Injectable()
export class FollowupScheduler {
  private readonly logger = new Logger(FollowupScheduler.name);
  private readonly lockKey = "followup-scheduler-lock";
  private readonly lockTtl = 60000; // 60 seconds

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
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
      try {
        await this.pool.query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          ["followup-scheduler", error.message, error.stack ?? null],
        );
      } catch {
        /* non-fatal */
      }
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  private async processAbandonedCarts(): Promise<void> {
    const query = `
      SELECT c.id,
             c.merchant_id,
             c.cart,
             c.state,
             c.followup_count,
             m.name          AS merchant_name,
             m.category,
              NULLIF(to_jsonb(m)->>'whatsapp_number', '') AS merchant_wa,
             COALESCE(m.followup_delay_minutes, 60) AS followup_delay_minutes,
             cust.phone      AS customer_phone,
             COALESCE(cust.name, 'عزيزي العميل') AS customer_name,
             COALESCE(cust.total_orders, 0) AS prior_order_count
      FROM conversations c
      JOIN merchants m ON c.merchant_id = m.id
      LEFT JOIN customers cust ON cust.id = c.customer_id
      WHERE c.state IN ('COLLECTING_ITEMS','COLLECTING_CUSTOMER_INFO','COLLECTING_ADDRESS','NEGOTIATING')
        AND c.cart IS NOT NULL
        AND jsonb_array_length(c.cart->'items') > 0
        AND c.last_message_at < NOW() - INTERVAL '30 minutes'
        AND c.followup_count < 3
        AND (c.next_followup_at IS NULL OR c.next_followup_at < NOW() - INTERVAL '30 minutes')
        AND m.is_active = true
        AND cust.phone IS NOT NULL
      ORDER BY c.last_message_at ASC
      LIMIT 50
    `;

    const result = await this.pool.query(query);

    if (result.rows.length === 0) {
      this.logger.debug("No conversations need follow-up");
      return;
    }

    this.logger.log({
      msg: "Processing abandoned cart follow-ups",
      count: result.rows.length,
    });

    for (const row of result.rows) {
      const nextFollowupCount = (row.followup_count ?? 0) + 1;
      const baseDelay = Number(row.followup_delay_minutes) || 60;
      let delayMinutes = 0;
      if (nextFollowupCount === 2) delayMinutes = baseDelay;
      else if (nextFollowupCount >= 3) delayMinutes = baseDelay * 3;

      const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      const isImmediate = delayMinutes === 0;

      // Mark conversation as scheduled (do this first to prevent double-send)
      await this.pool.query(
        `UPDATE conversations
         SET next_followup_at = $1, followup_count = followup_count + 1, updated_at = NOW()
         WHERE id = $2`,
        [
          isImmediate
            ? new Date(Date.now() + 30 * 60_000) // won't re-fire for 30 min
            : scheduledAt,
          row.id,
        ],
      );

      if (!isImmediate) {
        // Future delivery — handled by a separate consumer or next scheduler tick
        this.logger.debug({
          msg: "Delayed followup queued",
          conversationId: row.id,
          scheduledAt: scheduledAt.toISOString(),
        });
        continue;
      }

      // Build cart summary
      const cartItems: Array<{
        name: string;
        quantity: number;
        unitPrice?: number;
      }> = row.cart?.items ?? [];
      const cartSummary = cartItems
        .slice(0, 3)
        .map(
          (item) =>
            `• ${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
        )
        .join("\n");
      const cartTotal = cartItems.reduce(
        (s, i) => s + (i.unitPrice ?? 0) * (i.quantity ?? 1),
        0,
      );

      const message = this.buildFollowupMessage(
        row.customer_name,
        row.merchant_name,
        cartSummary,
        cartTotal,
        nextFollowupCount,
        row.prior_order_count ?? 0,
      );

      try {
        await this.notificationsService.sendBroadcastWhatsApp(
          row.customer_phone,
          message,
        );
        this.logger.debug({
          msg: "Followup sent",
          conversationId: row.id,
          followupCount: nextFollowupCount,
        });
      } catch (e: any) {
        this.logger.warn({
          msg: "Followup WA send failed",
          conversationId: row.id,
          error: e.message,
        });
      }
    }
  }

  /** Generates an urgency-tuned, personalised cart recovery WhatsApp message */
  private buildFollowupMessage(
    customerName: string,
    merchantName: string,
    cartSummary: string,
    cartTotal: number,
    followupCount: number,
    priorOrders: number,
  ): string {
    const isReturning = priorOrders > 0;
    const totalLine =
      cartTotal > 0 ? `\n💰 إجمالي السلة: *${cartTotal.toFixed(2)} ج.م*` : "";
    const returningLine = isReturning
      ? `\nنتشرف بك دائماً — لديك ${priorOrders} طلب سابق معنا 💙`
      : "";

    if (followupCount === 1) {
      return `مرحباً ${customerName} 👋

رأيناك تتصفح وتختار من *${merchantName}* — لم تكمل طلبك بعد!

🛒 ما تركته في السلة:
${cartSummary}${totalLine}${returningLine}

هل تحتاج مساعدة أو لديك سؤال عن أحد المنتجات؟ نحن هنا 😊`;
    }

    if (followupCount === 2) {
      return `${customerName}، سلتك لا تزال في انتظارك ⏳

🛒 المنتجات المحجوزة لك:
${cartSummary}

⚠️ الكميات محدودة — لا نضمن توفرها لفترة طويلة.

أضغط هنا لإتمام الطلب أو أخبرنا إذا أردت تعديلاً 📦`;
    }

    // followupCount === 3 — final message
    return `${customerName}، هذه آخر تذكرة 🙏

سلتك معنا في *${merchantName}* ستُحذف قريباً إذا لم يُكتمل الطلب.${totalLine}

إذا كان هناك سبب أخّر قرارك (سعر، توصيل، ...) أخبرنا ونحاول نساعدك 💬

شكراً على وقتك ❤️`;
  }
}
