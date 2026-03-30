import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";

/**
 * Anomaly Detection Scheduler
 *
 * Runs every 4 hours to check for unusual business patterns per merchant:
 * - Cancellation spike (>50% of orders cancelled in last 24h)
 * - Revenue drop (today's revenue <30% of 7-day daily average)
 * - Zero orders (active merchant with no orders in 24h)
 * - Conversation backlog (>10 open conversations with no response)
 * - Unusual high-value order (order >3x the average order value)
 *
 * Fires IN_APP + PUSH notifications via the notifications table.
 */
@Injectable()
export class AnomalyDetectionSchedulerService {
  private readonly logger = new Logger(AnomalyDetectionSchedulerService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private orderAmountExpr(alias: string): string {
    return `COALESCE(
      NULLIF((to_jsonb(${alias})->>'total'), '')::numeric,
      NULLIF((to_jsonb(${alias})->>'total_amount'), '')::numeric,
      0
    )`;
  }

  // Run every 4 hours (0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC)
  @Cron("0 */4 * * *")
  async detectAnomalies(): Promise<void> {
    this.logger.log("Starting anomaly detection scan...");

    try {
      const merchants = await this.pool.query(
        `SELECT id, name FROM merchants WHERE is_active = true`,
      );

      let totalAlerts = 0;
      for (const merchant of merchants.rows) {
        try {
          const alerts = await this.detectMerchantAnomalies(
            merchant.id,
            merchant.name,
          );
          totalAlerts += alerts;
        } catch (error) {
          this.logger.error(
            `Anomaly detection failed for merchant ${merchant.id}: ${error}`,
          );
        }
      }

      this.logger.log(
        `Anomaly detection completed. ${totalAlerts} alerts created.`,
      );
    } catch (error) {
      this.logger.error(`Anomaly detection scheduler error: ${error}`);
      // BL-009: persist failure for alerting
      this.pool
        .query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          ["AnomalyDetectionScheduler", String(error), null],
        )
        .catch(() => {
          /* non-fatal */
        });
    }
  }

  private async detectMerchantAnomalies(
    merchantId: string,
    merchantName: string,
  ): Promise<number> {
    let alertCount = 0;

    // ─── 1. Cancellation Spike ──────────────────────────────
    try {
      const cancellations = await this.pool.query(
        `SELECT 
           COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
           COUNT(*) as total
         FROM orders
         WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
        [merchantId],
      );
      const { cancelled, total } = cancellations.rows[0];
      const cancelledCount = parseInt(cancelled);
      const totalCount = parseInt(total);

      if (totalCount >= 3 && cancelledCount / totalCount > 0.5) {
        await this.createAlert(
          merchantId,
          "CANCELLATION_SPIKE",
          "⚠️ ارتفاع غير طبيعي في الإلغاءات",
          `تم إلغاء ${cancelledCount} من أصل ${totalCount} طلبات في آخر 24 ساعة (${Math.round((cancelledCount / totalCount) * 100)}%). يُرجى مراجعة الأسباب.`,
          {
            cancelled: cancelledCount,
            total: totalCount,
            rate: Math.round((cancelledCount / totalCount) * 100),
          },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Cancellation check failed for ${merchantId}: ${e}`,
      );
    }

    // ─── 2. Revenue Drop ────────────────────────────────────
    try {
      const orderAmountExpr = this.orderAmountExpr("o");
      const revenue = await this.pool.query(
        `SELECT
           COALESCE(SUM(${orderAmountExpr}) FILTER (WHERE o.created_at >= CURRENT_DATE), 0) as today_revenue,
           COALESCE(SUM(${orderAmountExpr}) FILTER (WHERE o.created_at >= NOW() - INTERVAL '7 days'), 0) / 7.0 as avg_daily_revenue
         FROM orders o
         WHERE merchant_id = $1 AND status NOT IN ('CANCELLED', 'DRAFT')
           AND created_at >= NOW() - INTERVAL '7 days'`,
        [merchantId],
      );
      const todayRev = parseFloat(revenue.rows[0].today_revenue);
      const avgDailyRev = parseFloat(revenue.rows[0].avg_daily_revenue);

      // Only alert after 2 PM local time (12 PM UTC) so there's enough data
      const hourUTC = new Date().getUTCHours();
      if (avgDailyRev > 100 && hourUTC >= 12 && todayRev < avgDailyRev * 0.3) {
        await this.createAlert(
          merchantId,
          "REVENUE_DROP",
          "📉 انخفاض حاد في إيرادات اليوم",
          `إيرادات اليوم ${todayRev.toFixed(0)} ج.م مقارنة بمتوسط ${avgDailyRev.toFixed(0)} ج.م يومياً (أقل من 30%).`,
          { todayRevenue: todayRev, avgDaily: avgDailyRev },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Revenue check failed for ${merchantId}: ${e}`,
      );
    }

    // ─── 3. Zero Orders (dry spell) ─────────────────────────
    try {
      const orderCheck = await this.pool.query(
        `SELECT 
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as recent_orders,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as week_orders
         FROM orders
         WHERE merchant_id = $1`,
        [merchantId],
      );
      const recentOrders = parseInt(orderCheck.rows[0].recent_orders);
      const weekOrders = parseInt(orderCheck.rows[0].week_orders);

      // Alert only if normally active (>3 orders/week) but none in 24h
      if (weekOrders >= 3 && recentOrders === 0) {
        await this.createAlert(
          merchantId,
          "ZERO_ORDERS",
          "🔕 لا توجد طلبات منذ 24 ساعة",
          `نشاطك عادة يستقبل طلبات يومياً لكن لم يصل أي طلب في آخر 24 ساعة. تأكد من أن كل شيء يعمل بشكل طبيعي.`,
          { recentOrders, weekOrders },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Zero orders check failed for ${merchantId}: ${e}`,
      );
    }

    // ─── 4. Conversation Backlog ────────────────────────────
    try {
      const backlog = await this.pool.query(
        `SELECT COUNT(*) as stale_conversations
         FROM conversations
         WHERE merchant_id = $1 
           AND state NOT IN ('CLOSED', 'ORDER_PLACED')
           AND last_message_at < NOW() - INTERVAL '2 hours'
           AND updated_at < NOW() - INTERVAL '2 hours'`,
        [merchantId],
      );
      const staleCount = parseInt(backlog.rows[0].stale_conversations);

      if (staleCount >= 10) {
        await this.createAlert(
          merchantId,
          "CONVERSATION_BACKLOG",
          "💬 محادثات متراكمة بدون رد",
          `لديك ${staleCount} محادثة مفتوحة بدون رد منذ أكثر من ساعتين. العملاء ينتظرون!`,
          { staleConversations: staleCount },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Backlog check failed for ${merchantId}: ${e}`,
      );
    }

    // ─── 5. Unusually Large Order ───────────────────────────
    try {
      const orderAmountExpr = this.orderAmountExpr("o");
      const largeOrders = await this.pool.query(
        `WITH avg_stats AS (
           SELECT COALESCE(AVG(${orderAmountExpr}), 0) as avg_total
           FROM orders o
           WHERE merchant_id = $1 AND status != 'CANCELLED'
             AND created_at >= NOW() - INTERVAL '30 days'
         )
         SELECT o.id, o.order_number, ${orderAmountExpr} as total, o.customer_name, a.avg_total
         FROM orders o, avg_stats a
         WHERE o.merchant_id = $1
           AND o.created_at >= NOW() - INTERVAL '4 hours'
           AND ${orderAmountExpr} > a.avg_total * 3
           AND a.avg_total > 50
           AND o.status != 'CANCELLED'
         ORDER BY ${orderAmountExpr} DESC
         LIMIT 3`,
        [merchantId],
      );

      for (const order of largeOrders.rows) {
        await this.createAlert(
          merchantId,
          "LARGE_ORDER",
          `🎉 طلب كبير غير معتاد #${order.order_number || order.id?.slice(0, 8)}`,
          `طلب بقيمة ${parseFloat(order.total).toFixed(0)} ج.م من ${order.customer_name || "عميل"} — أكثر من 3 أضعاف المتوسط (${parseFloat(order.avg_total).toFixed(0)} ج.م). تأكد من التحقق والتجهيز.`,
          {
            orderId: order.id,
            orderTotal: parseFloat(order.total),
            avgTotal: parseFloat(order.avg_total),
          },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Large order check failed for ${merchantId}: ${e}`,
      );
    }

    // ─── 6. Cross-Agent: Low Stock + High Demand Correlation ──
    try {
      const lowStockDemand = await this.pool.query(
        `WITH low_stock_items AS (
           SELECT
             ii.catalog_item_id as item_id,
             COALESCE(NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), ii.sku, iv.sku, 'منتج') as name,
             COALESCE(ii.sku, iv.sku, ci.sku, '') as sku,
             iv.quantity_on_hand,
             COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, ii.reorder_point, 5) as reorder_point
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id
           WHERE iv.merchant_id = $1
             AND iv.is_active = true
             AND iv.quantity_on_hand <= COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, ii.reorder_point, 5)
             AND iv.quantity_on_hand >= 0
         ),
         high_demand AS (
           SELECT
             COALESCE(NULLIF(item->>'sku', ''), NULLIF(item->>'productSku', ''), NULLIF(item->>'product_sku', '')) as sku,
             COUNT(*) as orders_7d
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item
           WHERE o.merchant_id = $1
             AND o.created_at >= NOW() - INTERVAL '7 days'
             AND o.status NOT IN ('CANCELLED', 'DRAFT')
           GROUP BY COALESCE(NULLIF(item->>'sku', ''), NULLIF(item->>'productSku', ''), NULLIF(item->>'product_sku', ''))
           HAVING COALESCE(NULLIF(item->>'sku', ''), NULLIF(item->>'productSku', ''), NULLIF(item->>'product_sku', '')) IS NOT NULL
              AND COUNT(*) >= 3
         )
         SELECT ls.name, ls.sku, ls.quantity_on_hand, hd.orders_7d
         FROM low_stock_items ls
         JOIN high_demand hd ON LOWER(hd.sku) = LOWER(ls.sku)
         ORDER BY hd.orders_7d DESC
         LIMIT 5`,
        [merchantId],
      );

      if (lowStockDemand.rows.length > 0) {
        const items = lowStockDemand.rows;
        await this.createAlert(
          merchantId,
          "LOW_STOCK_HIGH_DEMAND",
          `📦 ${items.length} منتج عالي الطلب قارب على النفاد`,
          items
            .map(
              (i) =>
                `${i.name} (${i.quantity_on_hand} متبقي، ${i.orders_7d} طلب/أسبوع)`,
            )
            .join("\n"),
          {
            items: items.map((i) => ({
              name: i.name,
              sku: i.sku,
              stock: parseInt(i.quantity_on_hand),
              demand: parseInt(i.orders_7d),
            })),
          },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Low stock/demand check failed for ${merchantId}: ${e}`,
      );
    }

    // ─── 7. Cross-Agent: Perishable Expiry Warning ──────────
    try {
      const expiringItems = await this.pool.query(
        `SELECT COALESCE(NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), ii.sku, iv.sku, 'منتج') as name,
                COALESCE(ii.sku, iv.sku, ci.sku, '') as sku,
                ci.expiry_date,
                (ci.expiry_date - CURRENT_DATE) as days_left,
                COALESCE(SUM(iv.quantity_on_hand), 0) as qty
         FROM catalog_items ci
         LEFT JOIN inventory_items ii
           ON ii.catalog_item_id = ci.id AND ii.merchant_id = ci.merchant_id
         LEFT JOIN inventory_variants iv
           ON iv.inventory_item_id = ii.id AND iv.merchant_id = ci.merchant_id AND iv.is_active = true
         WHERE ci.merchant_id = $1
           AND ci.is_perishable = true
           AND ci.expiry_date IS NOT NULL
           AND ci.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
         GROUP BY ci.id, ci.expiry_date, ci.name_ar, ci.name_en, ii.sku, iv.sku
         HAVING COALESCE(SUM(iv.quantity_on_hand), 0) > 0
         ORDER BY ci.expiry_date ASC
         LIMIT 10`,
        [merchantId],
      );

      if (expiringItems.rows.length > 0) {
        const items = expiringItems.rows;
        const totalQtyAtRisk = items.reduce(
          (s: number, i: any) => s + parseInt(i.qty),
          0,
        );
        await this.createAlert(
          merchantId,
          "PERISHABLE_EXPIRY",
          `⏰ ${items.length} منتج سينتهي صلاحيته خلال 3 أيام`,
          items
            .map((i) => `${i.name}: ${i.days_left} يوم (${i.qty} وحدة)`)
            .join("\n"),
          {
            items: items.map((i) => ({
              name: i.name,
              sku: i.sku,
              daysLeft: parseInt(i.days_left),
              qty: parseInt(i.qty),
            })),
            totalQtyAtRisk,
          },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Perishable check failed for ${merchantId}: ${e}`,
      );
    }

    // ─── 8. Cross-Agent: Cash Flow Alert (finance) ──────────
    try {
      const orderAmountExpr = this.orderAmountExpr("o");
      // Today's expenses significantly exceeding revenue
      let cashFlow;
      try {
        cashFlow = await this.pool.query(
          `SELECT
             COALESCE((SELECT SUM(${orderAmountExpr}) FROM orders o WHERE o.merchant_id = $1 AND o.status = 'DELIVERED' AND DATE(o.created_at) = CURRENT_DATE), 0) as today_revenue,
             COALESCE((SELECT SUM(amount) FROM expenses WHERE merchant_id = $1 AND expense_date = CURRENT_DATE), 0) as today_expenses`,
          [merchantId],
        );
      } catch (error: any) {
        if (error?.code !== "42703") {
          throw error;
        }
        cashFlow = await this.pool.query(
          `SELECT
             COALESCE((SELECT SUM(${orderAmountExpr}) FROM orders o WHERE o.merchant_id = $1 AND o.status = 'DELIVERED' AND DATE(o.created_at) = CURRENT_DATE), 0) as today_revenue,
             COALESCE((SELECT SUM(amount) FROM expenses WHERE merchant_id = $1 AND date = CURRENT_DATE AND COALESCE(status, 'APPROVED') != 'REJECTED'), 0) as today_expenses`,
          [merchantId],
        );
      }
      const todayRev = parseFloat(cashFlow.rows[0].today_revenue);
      const todayExp = parseFloat(cashFlow.rows[0].today_expenses);

      if (todayExp > 0 && todayExp > todayRev * 2 && todayExp > 500) {
        await this.createAlert(
          merchantId,
          "NEGATIVE_CASH_FLOW",
          "💸 مصروفات اليوم أكثر من ضعف الإيرادات",
          `مصروفات اليوم ${todayExp.toFixed(0)} ج.م مقابل إيرادات ${todayRev.toFixed(0)} ج.م. يرجى مراجعة المصروفات.`,
          { todayRevenue: todayRev, todayExpenses: todayExp },
        );
        alertCount++;
      }
    } catch (e) {
      this.logger.warn(
        `[ANOMALY] Cash flow check failed for ${merchantId}: ${e}`,
      );
    }

    return alertCount;
  }

  /**
   * Create anomaly alert notification. Deduplicates by checking for
   * existing unread alert of same type in last 12 hours.
   */
  private async createAlert(
    merchantId: string,
    anomalyType: string,
    titleAr: string,
    messageAr: string,
    data: Record<string, any>,
  ): Promise<void> {
    // Deduplicate: don't send same anomaly type within 12 hours
    const existing = await this.pool.query(
      `SELECT id FROM notifications
       WHERE merchant_id = $1 
         AND data->>'alertKind' = 'ANOMALY_ALERT'
         AND data->>'anomalyType' = $2
         AND created_at > NOW() - INTERVAL '12 hours'
       LIMIT 1`,
      [merchantId, anomalyType],
    );

    if (existing.rows.length > 0) {
      return; // Already alerted recently
    }

    const payload = JSON.stringify({
      alertKind: "ANOMALY_ALERT",
      anomalyType,
      ...data,
    });
    const insertWithType = async (type: string) =>
      this.pool.query(
        `INSERT INTO notifications (merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'HIGH', '{"IN_APP","PUSH"}', '/merchant/dashboard', NOW() + INTERVAL '48 hours', NOW())`,
        [
          merchantId,
          type,
          `Anomaly: ${anomalyType}`,
          titleAr,
          messageAr,
          messageAr,
          payload,
        ],
      );

    try {
      await insertWithType("SYSTEM_ALERT");
    } catch (error: any) {
      const isTypeConstraintError =
        error?.code === "23514" ||
        (typeof error?.message === "string" &&
          error.message.includes("valid_type"));
      if (!isTypeConstraintError) {
        throw error;
      }

      const fallbackTypes = ["SECURITY_ALERT", "DAILY_SUMMARY", "ORDER_PLACED"];
      let inserted = false;

      for (const fallbackType of fallbackTypes) {
        try {
          await insertWithType(fallbackType);
          inserted = true;
          break;
        } catch (retryError: any) {
          const retryTypeConstraintError =
            retryError?.code === "23514" ||
            (typeof retryError?.message === "string" &&
              retryError.message.includes("valid_type"));
          if (!retryTypeConstraintError) {
            throw retryError;
          }
        }
      }

      if (!inserted) {
        throw error;
      }
    }

    this.logger.log(
      `[ANOMALY] Created ${anomalyType} alert for merchant ${merchantId}`,
    );
  }
}
