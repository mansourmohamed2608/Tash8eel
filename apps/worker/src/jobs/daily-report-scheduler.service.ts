import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";
import { createLogger } from "@tash8eel/shared";

const logger = createLogger("DailyReportScheduler");

@Injectable()
export class DailyReportSchedulerService {
  private readonly nestLogger = new Logger(DailyReportSchedulerService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // Run at 6 AM Egypt time (4 AM UTC)
  @Cron("0 4 * * *")
  async generateDailyReports(): Promise<void> {
    this.nestLogger.log("Starting daily report generation...");

    try {
      // Get all active merchants
      const merchants = await this.pool.query(
        `SELECT id, name FROM merchants WHERE is_active = true`,
      );

      const reportDate = new Date();
      reportDate.setDate(reportDate.getDate() - 1);
      const reportDateStr = reportDate.toISOString().split("T")[0];

      for (const merchant of merchants.rows) {
        try {
          await this.generateMerchantReport(merchant.id, reportDateStr);
        } catch (error) {
          logger.error(
            `Failed to generate report for merchant ${merchant.id}`,
            error as Error,
          );
        }
      }

      this.nestLogger.log("Daily report generation completed");
    } catch (error) {
      logger.error("Daily report scheduler error", error as Error);
    }
  }

  async generateMerchantReport(
    merchantId: string,
    reportDate: string,
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Check if report already exists
      const existing = await client.query(
        `SELECT id FROM merchant_reports WHERE merchant_id = $1 AND report_date = $2`,
        [merchantId, reportDate],
      );

      if (existing.rows.length > 0) {
        logger.info(
          `Report already exists for merchant ${merchantId} on ${reportDate}`,
        );
        await client.query("COMMIT");
        return;
      }

      // Get order statistics
      const orderStats = await client.query(
        `SELECT 
           COUNT(*) as total_orders,
           SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered_orders,
           SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_orders,
           SUM(CASE WHEN status = 'SHIPPED' AND actual_delivery IS NULL THEN 1 ELSE 0 END) as failed_orders,
           COALESCE(SUM(total), 0) as total_revenue,
           COALESCE(SUM(CASE WHEN status = 'DELIVERED' THEN total ELSE 0 END), 0) as delivered_revenue
         FROM orders
         WHERE merchant_id = $1 AND DATE(created_at) = $2`,
        [merchantId, reportDate],
      );

      // Get item count
      const itemCount = await client.query(
        `SELECT COALESCE(SUM((item->>'quantity')::int), 0) as total_items
         FROM orders, jsonb_array_elements(items) as item
         WHERE merchant_id = $1 AND DATE(created_at) = $2`,
        [merchantId, reportDate],
      );

      // Get customer statistics
      const customerStats = await client.query(
        `SELECT 
           COUNT(DISTINCT customer_id) FILTER (WHERE c.total_orders = 1) as new_customers,
           COUNT(DISTINCT customer_id) FILTER (WHERE c.total_orders > 1) as returning_customers
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.merchant_id = $1 AND DATE(o.created_at) = $2`,
        [merchantId, reportDate],
      );

      // Get message statistics
      const messageStats = await client.query(
        `SELECT COUNT(*) as messages_processed, COALESCE(SUM(tokens_used), 0) as tokens_used
         FROM messages
         WHERE merchant_id = $1 AND DATE(created_at) = $2`,
        [merchantId, reportDate],
      );

      // Get human takeover count
      const takeoverStats = await client.query(
        `SELECT COUNT(*) as human_takeovers
         FROM conversations
         WHERE merchant_id = $1 AND COALESCE(human_takeover, false) = true AND DATE(updated_at) = $2`,
        [merchantId, reportDate],
      );

      // Get pending followups
      const followupStats = await client.query(
        `SELECT COUNT(*) as pending_followups
         FROM followups
         WHERE merchant_id = $1 AND status = 'PENDING'`,
        [merchantId],
      );

      // Get top products
      const topProducts = await client.query(
        `SELECT 
           item->>'name' as name,
           SUM((item->>'quantity')::int) as quantity,
           SUM((item->>'totalPrice')::numeric) as revenue
         FROM orders, jsonb_array_elements(items) as item
         WHERE merchant_id = $1 AND DATE(created_at) = $2 AND status != 'CANCELLED'
         GROUP BY item->>'name'
         ORDER BY quantity DESC
         LIMIT 5`,
        [merchantId, reportDate],
      );

      const stats = orderStats.rows[0];
      const totalOrders = parseInt(stats.total_orders) || 0;
      const totalRevenue = parseFloat(stats.total_revenue) || 0;

      const summary = {
        totalOrders,
        deliveredOrders: parseInt(stats.delivered_orders) || 0,
        failedOrders: parseInt(stats.failed_orders) || 0,
        cancelledOrders: parseInt(stats.cancelled_orders) || 0,
        totalRevenue,
        totalItems: parseInt(itemCount.rows[0]?.total_items) || 0,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        newCustomers: parseInt(customerStats.rows[0]?.new_customers) || 0,
        returningCustomers:
          parseInt(customerStats.rows[0]?.returning_customers) || 0,
        messagesProcessed:
          parseInt(messageStats.rows[0]?.messages_processed) || 0,
        tokensUsed: parseInt(messageStats.rows[0]?.tokens_used) || 0,
        humanTakeovers: parseInt(takeoverStats.rows[0]?.human_takeovers) || 0,
        pendingFollowups:
          parseInt(followupStats.rows[0]?.pending_followups) || 0,
        topProducts: topProducts.rows.map(
          (p: { name: string; quantity: string; revenue: string }) => ({
            name: p.name,
            quantity: parseInt(p.quantity),
            revenue: parseFloat(p.revenue),
          }),
        ),
      };

      // Insert report
      await client.query(
        `INSERT INTO merchant_reports (merchant_id, report_date, summary)
         VALUES ($1, $2, $3)`,
        [merchantId, reportDate, JSON.stringify(summary)],
      );

      // Create notification
      await client.query(
        `INSERT INTO merchant_notifications (merchant_id, type, title, message, data)
         VALUES ($1, 'DAILY_REPORT', 'تقرير يومي جديد', $2, $3)`,
        [
          merchantId,
          `تقرير ${reportDate}: ${totalOrders} طلب، ${totalRevenue.toFixed(2)} ج.م`,
          JSON.stringify({ reportDate, summary }),
        ],
      );

      // Publish event
      await client.query(
        `INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, merchant_id, payload, status)
         VALUES ('report.daily_generated', 'report', $1, $2, $3, 'PENDING')`,
        [
          `${merchantId}-${reportDate}`,
          merchantId,
          JSON.stringify({ merchantId, reportDate, summary }),
        ],
      );

      await client.query("COMMIT");
      logger.info(`Daily report generated for merchant ${merchantId}`, {
        reportDate,
        totalOrders,
        totalRevenue,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
