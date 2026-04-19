/**
 * Marketing Agent Handlers
 * Campaigns, promotions, customer segmentation.
 */
import { Pool } from "pg";
import { Logger } from "@nestjs/common";
import { AgentTask } from "@tash8eel/agent-sdk";
import {
  CreateCampaignInput,
  SendPromotionInput,
  SegmentCustomersInput,
} from "./marketing.tasks";

export class MarketingHandlers {
  private readonly logger = new Logger(MarketingHandlers.name);

  constructor(private readonly pool: Pool) {}

  /**
   * Generate promo code and identify target customers
   * SDK task: GENERATE_PROMO
   */
  async createCampaign(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as CreateCampaignInput;
    const merchantId = input.merchantId || task.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      // Generate a unique promo code
      const code = `PROMO${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const discountPercent = 10; // Default 10%
      const validDays = 7;
      const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

      // Find target customers based on audience type
      let customerQuery = `
        SELECT id, name, phone, 
               COALESCE((SELECT COUNT(*) FROM orders WHERE customer_phone = c.phone AND merchant_id = $1), 0) as order_count,
               COALESCE((SELECT SUM(total) FROM orders WHERE customer_phone = c.phone AND merchant_id = $1), 0) as total_spent
        FROM customers c WHERE c.merchant_id = $1
      `;

      if (input.type === "triggered") {
        // Target at-risk customers (no order in 30+ days)
        customerQuery += ` AND c.updated_at < NOW() - INTERVAL '30 days'`;
      }
      customerQuery += ` LIMIT 100`;

      const customersResult = await this.pool.query(customerQuery, [
        merchantId,
      ]);

      // Create campaign record
      const campaignId = `camp_${Date.now()}`;
      await this.pool.query(
        `INSERT INTO notifications (
           merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at
         )
         VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, $3, $4::jsonb, 'MEDIUM', '{"IN_APP"}', '/merchant/campaigns', NOW())`,
        [
          merchantId,
          `حملة ترويجية: ${input.name || code}`,
          `تم إنشاء حملة ${input.type} بكود خصم ${code} (${discountPercent}%)`,
          JSON.stringify({
            campaignId,
            code,
            discountPercent,
            expiresAt,
            targetCount: customersResult.rowCount,
          }),
        ],
      );

      this.logger.log(
        `Campaign created: ${campaignId} for merchant ${merchantId}, ${customersResult.rowCount} targets`,
      );

      return {
        action: "CAMPAIGN_CREATED",
        campaign: {
          id: campaignId,
          name: input.name || code,
          type: input.type,
          code,
          discountPercent,
          validDays,
          expiresAt: expiresAt.toISOString(),
          status: "CREATED",
        },
        targetAudience: {
          count: customersResult.rowCount,
          customers: customersResult.rows.slice(0, 20).map((c: any) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            orderCount: parseInt(c.order_count) || 0,
            totalSpent: parseFloat(c.total_spent) || 0,
          })),
        },
      };
    } catch (error) {
      this.logger.error(`createCampaign failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Segment customers by criteria
   * SDK task: CUSTOMER_SEGMENT
   */
  async segmentCustomers(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as SegmentCustomersInput;
    const merchantId = input.merchantId || task.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      const criteria = input.criteria || {};
      const minOrders = criteria.minOrders || 0;
      const lastActiveDays = criteria.lastActiveWithinDays || 365;
      const minSpent = criteria.totalSpent || 0;

      // Segment customers using SQL
      const result = await this.pool.query(
        `WITH customer_stats AS (
           SELECT c.id, c.name, c.phone, c.created_at,
                  COUNT(o.id) as order_count,
                  COALESCE(SUM(o.total), 0) as total_spent,
                  MAX(o.created_at) as last_order_date,
                  EXTRACT(DAY FROM NOW() - MAX(o.created_at)) as days_since_last_order
           FROM customers c
           LEFT JOIN orders o ON o.customer_phone = c.phone AND o.merchant_id = c.merchant_id
           WHERE c.merchant_id = $1
           GROUP BY c.id, c.name, c.phone, c.created_at
         )
         SELECT *,
           CASE
             WHEN order_count >= 5 AND total_spent >= 1000 AND days_since_last_order <= 30 THEN 'VIP'
             WHEN order_count >= 3 AND days_since_last_order <= 60 THEN 'LOYAL'
             WHEN order_count >= 2 AND days_since_last_order <= 90 THEN 'REGULAR'
             WHEN order_count <= 1 THEN 'NEW'
             WHEN days_since_last_order > 90 THEN 'AT_RISK'
             ELSE 'REGULAR'
           END as segment
         FROM customer_stats
         WHERE order_count >= $2
           AND COALESCE(EXTRACT(DAY FROM NOW() - last_order_date), 0) <= $3
           AND total_spent >= $4
         ORDER BY total_spent DESC
         LIMIT 200`,
        [merchantId, minOrders, lastActiveDays, minSpent],
      );

      // Compute segment counts
      const segments: Record<string, { count: number; totalSpent: number }> = {
        VIP: { count: 0, totalSpent: 0 },
        LOYAL: { count: 0, totalSpent: 0 },
        REGULAR: { count: 0, totalSpent: 0 },
        NEW: { count: 0, totalSpent: 0 },
        AT_RISK: { count: 0, totalSpent: 0 },
      };

      for (const row of result.rows) {
        const seg = row.segment || "REGULAR";
        if (segments[seg]) {
          segments[seg].count++;
          segments[seg].totalSpent += parseFloat(row.total_spent) || 0;
        }
      }

      this.logger.log(
        `Segmented ${result.rowCount} customers for merchant ${merchantId}`,
      );

      return {
        action: "SEGMENTATION_COMPLETE",
        totalCustomers: result.rowCount,
        segments,
        customers: result.rows.slice(0, 50).map((r: any) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          segment: r.segment,
          orderCount: parseInt(r.order_count) || 0,
          totalSpent: parseFloat(r.total_spent) || 0,
          daysSinceLastOrder: parseInt(r.days_since_last_order) || 0,
        })),
      };
    } catch (error) {
      this.logger.error(`segmentCustomers failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Send a promotional message (placeholder for WhatsApp integration)
   */
  async sendPromotion(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as SendPromotionInput;
    const merchantId = input.merchantId || task.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      // Record the promotion send attempt
      await this.pool.query(
        `INSERT INTO notifications (
           merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at
         )
         VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, $3, $4::jsonb, 'LOW', '{"IN_APP"}', '/merchant/campaigns', NOW())`,
        [
          merchantId,
          `ترويج مرسل`,
          `تم إرسال كود الخصم ${input.promotionCode} عبر ${input.channel}`,
          JSON.stringify({
            customerId: input.customerId,
            code: input.promotionCode,
            channel: input.channel,
          }),
        ],
      );

      return {
        action: "PROMOTION_QUEUED",
        customerId: input.customerId,
        code: input.promotionCode,
        channel: input.channel,
        status: "QUEUED",
        message: `تم جدولة إرسال العرض عبر ${input.channel}`,
      };
    } catch (error) {
      this.logger.error(`sendPromotion failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Analyze campaign performance
   */
  async analyzePerformance(task: AgentTask): Promise<Record<string, unknown>> {
    const merchantId = task.merchantId || (task.input as any)?.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      // Get recent order stats for performance analysis
      const stats = await this.pool.query(
        `SELECT 
           COUNT(*) as total_orders,
           COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
           COALESCE(SUM(total), 0) as total_revenue,
           COALESCE(AVG(total), 0) as avg_order_value,
           COUNT(DISTINCT customer_phone) as unique_customers
         FROM orders
         WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        [merchantId],
      );

      const row = stats.rows[0];
      return {
        action: "ANALYSIS_COMPLETE",
        period: "last_30_days",
        metrics: {
          totalOrders: parseInt(row.total_orders) || 0,
          delivered: parseInt(row.delivered) || 0,
          cancelled: parseInt(row.cancelled) || 0,
          totalRevenue: parseFloat(row.total_revenue) || 0,
          avgOrderValue: parseFloat(row.avg_order_value) || 0,
          uniqueCustomers: parseInt(row.unique_customers) || 0,
          conversionRate:
            row.total_orders > 0
              ? (
                  (parseInt(row.delivered) / parseInt(row.total_orders)) *
                  100
                ).toFixed(1)
              : "0",
        },
      };
    } catch (error) {
      this.logger.error(
        `analyzePerformance failed: ${(error as Error).message}`,
      );
      return { action: "FAILED", message: (error as Error).message };
    }
  }
}
