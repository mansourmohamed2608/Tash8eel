import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { Redis } from "ioredis";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.module";
import { CommerceFactsService } from "./commerce-facts.service";

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface DashboardMetrics {
  // Overview
  totalOrders: number;
  totalRevenue: number;
  realizedRevenue?: number;
  bookedSales?: number;
  deliveredRevenue?: number;
  pendingCollections?: number;
  refundsAmount?: number;
  netCashFlow?: number;
  realizedOrders?: number;
  paidCashAmount?: number;
  paidOnlineAmount?: number;
  pendingCod?: number;
  pendingOnline?: number;
  averageOrderValue: number;
  conversionRate: number;

  // Changes from previous period
  ordersChange: number;
  revenueChange: number;
  aovChange: number;
  conversionChange: number;

  // Customer metrics
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  customerRetentionRate: number;

  // Conversation metrics
  totalConversations: number;
  avgResponseTime: number;
  resolutionRate: number;
  escalationRate: number;

  // AI metrics
  aiHandledPercentage: number;
  avgMessagesPerConversation: number;
}

export interface SalesBreakdown {
  byProduct: Array<{
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  byCategory: Array<{ category: string; quantity: number; revenue: number }>;
  byHour: Array<{ hour: number; orders: number; revenue: number }>;
  byDayOfWeek: Array<{ day: string; orders: number; revenue: number }>;
}

export interface CustomerInsights {
  topCustomers: Array<{
    phone: string;
    name: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderDate: Date;
    loyaltyTier?: string;
  }>;
  customerSegments: Array<{
    segment: string;
    count: number;
    avgOrderValue: number;
    totalRevenue: number;
  }>;
  acquisitionChannels: Array<{
    channel: string;
    customers: number;
    revenue: number;
  }>;
}

export interface ConversationAnalytics {
  volumeByHour: Array<{ hour: number; count: number }>;
  topTopics: Array<{ topic: string; count: number; percentage: number }>;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  avgTimeToResolution: number;
  handoffReasons: Array<{ reason: string; count: number }>;
}

@Injectable()
export class AnalyticsService {
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly commerceFactsService: CommerceFactsService,
  ) {}

  private async getCachedValue<T>(cacheKey: string): Promise<T | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch {
      return null;
    }
  }

  private async setCachedValue(
    cacheKey: string,
    value: unknown,
  ): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(value));
    } catch {
      // Cache failures should never break analytics endpoints.
    }
  }

  // ==================== DASHBOARD OVERVIEW ====================

  async getDashboardMetrics(
    merchantId: string,
    range: DateRange,
  ): Promise<DashboardMetrics> {
    const cacheKey = `analytics:dashboard:${merchantId}:${range.startDate.toISOString()}:${range.endDate.toISOString()}`;
    const cached = await this.getCachedValue<DashboardMetrics>(cacheKey);
    if (cached) return cached;

    // Calculate previous period for comparison
    const periodLength = range.endDate.getTime() - range.startDate.getTime();
    const prevStartDate = new Date(range.startDate.getTime() - periodLength);
    const prevEndDate = new Date(range.startDate.getTime());

    // Current period metrics
    const [currentFinance, previousFinance] = await Promise.all([
      this.commerceFactsService.buildFinanceSummary(
        merchantId,
        range.startDate,
        range.endDate,
      ),
      this.commerceFactsService.buildFinanceSummary(
        merchantId,
        prevStartDate,
        prevEndDate,
      ),
    ]);

    // Customer metrics
    const customerMetrics = await this.getCustomerMetrics(merchantId, range);

    // Conversation metrics
    const conversationMetrics = await this.getConversationMetrics(
      merchantId,
      range,
    );

    const metrics: DashboardMetrics = {
      // Orders
      totalOrders: currentFinance.bookedOrders,
      totalRevenue: currentFinance.realizedRevenue,
      realizedRevenue: currentFinance.realizedRevenue,
      bookedSales: currentFinance.bookedSales,
      deliveredRevenue: currentFinance.deliveredRevenue,
      pendingCollections: currentFinance.pendingCollections,
      refundsAmount: currentFinance.refundsAmount,
      netCashFlow: currentFinance.netCashFlow,
      realizedOrders: currentFinance.realizedOrders,
      paidCashAmount: currentFinance.paidCashAmount,
      paidOnlineAmount: currentFinance.paidOnlineAmount,
      pendingCod: currentFinance.pendingCod,
      pendingOnline: currentFinance.pendingOnline,
      averageOrderValue:
        currentFinance.realizedOrders && currentFinance.realizedOrders > 0
          ? currentFinance.realizedRevenue / currentFinance.realizedOrders
          : 0,
      conversionRate:
        conversationMetrics.total > 0
          ? (currentFinance.bookedOrders / conversationMetrics.total) * 100
          : 0,

      // Changes
      ordersChange: this.calculateChange(
        currentFinance.bookedOrders,
        previousFinance.bookedOrders,
      ),
      revenueChange: this.calculateChange(
        currentFinance.realizedRevenue,
        previousFinance.realizedRevenue,
      ),
      aovChange: this.calculateChange(
        currentFinance.realizedOrders && currentFinance.realizedOrders > 0
          ? currentFinance.realizedRevenue / currentFinance.realizedOrders
          : 0,
        previousFinance.realizedOrders && previousFinance.realizedOrders > 0
          ? previousFinance.realizedRevenue / previousFinance.realizedOrders
          : 0,
      ),
      conversionChange: 0, // Complex calculation

      // Customers
      totalCustomers: customerMetrics.total,
      newCustomers: customerMetrics.new,
      returningCustomers: customerMetrics.returning,
      customerRetentionRate: customerMetrics.retentionRate,

      // Conversations
      totalConversations: conversationMetrics.total,
      avgResponseTime: conversationMetrics.avgResponseTime,
      resolutionRate: conversationMetrics.resolutionRate,
      escalationRate: conversationMetrics.escalationRate,

      // AI
      aiHandledPercentage: conversationMetrics.aiHandledPercentage,
      avgMessagesPerConversation: conversationMetrics.avgMessages,
    };

    await this.setCachedValue(cacheKey, metrics);
    return metrics;
  }

  // ==================== SALES BREAKDOWN ====================

  async getSalesBreakdown(
    merchantId: string,
    range: DateRange,
  ): Promise<SalesBreakdown> {
    const cacheKey = `analytics:sales:${merchantId}:${range.startDate.toISOString()}:${range.endDate.toISOString()}`;
    const cached = await this.getCachedValue<SalesBreakdown>(cacheKey);
    if (cached) return cached;

    const [byProduct, byCategory, byHour, byDayOfWeek] = await Promise.all([
      this.getSalesByProduct(merchantId, range),
      this.getSalesByCategory(merchantId, range),
      this.getSalesByHour(merchantId, range),
      this.getSalesByDayOfWeek(merchantId, range),
    ]);

    const breakdown: SalesBreakdown = {
      byProduct,
      byCategory,
      byHour,
      byDayOfWeek,
    };

    await this.setCachedValue(cacheKey, breakdown);
    return breakdown;
  }

  // ==================== CUSTOMER INSIGHTS ====================

  async getCustomerInsights(
    merchantId: string,
    range: DateRange,
  ): Promise<CustomerInsights> {
    const cacheKey = `analytics:customers:${merchantId}:${range.startDate.toISOString()}:${range.endDate.toISOString()}`;
    const cached = await this.getCachedValue<CustomerInsights>(cacheKey);
    if (cached) return cached;

    const [topCustomers, segments, channels] = await Promise.all([
      this.getTopCustomers(merchantId, range),
      this.getCustomerSegments(merchantId),
      this.getAcquisitionChannels(merchantId, range),
    ]);

    const insights: CustomerInsights = {
      topCustomers,
      customerSegments: segments,
      acquisitionChannels: channels,
    };

    await this.setCachedValue(cacheKey, insights);
    return insights;
  }

  // ==================== CONVERSATION ANALYTICS ====================

  async getConversationAnalytics(
    merchantId: string,
    range: DateRange,
  ): Promise<ConversationAnalytics> {
    const cacheKey = `analytics:conversations:${merchantId}:${range.startDate.toISOString()}:${range.endDate.toISOString()}`;
    const cached = await this.getCachedValue<ConversationAnalytics>(cacheKey);
    if (cached) return cached;

    const [volumeByHour, topTopics, sentiment, avgResolution, handoffReasons] =
      await Promise.all([
        this.getConversationVolumeByHour(merchantId, range),
        this.getTopTopics(merchantId, range),
        this.getSentimentBreakdown(merchantId, range),
        this.getAvgTimeToResolution(merchantId, range),
        this.getHandoffReasons(merchantId, range),
      ]);

    const analytics: ConversationAnalytics = {
      volumeByHour,
      topTopics,
      sentimentBreakdown: sentiment,
      avgTimeToResolution: avgResolution,
      handoffReasons,
    };

    await this.setCachedValue(cacheKey, analytics);
    return analytics;
  }

  // ==================== REAL-TIME METRICS ====================

  async getRealTimeMetrics(merchantId: string): Promise<{
    activeConversations: number;
    pendingOrders: number;
    todayOrders: number;
    todayRevenue: number;
    onlineStaff: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [active, pending, todaySummary, onlineStaff] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*) FROM conversations 
         WHERE merchant_id = $1 AND status = 'active' AND updated_at > NOW() - INTERVAL '30 minutes'`,
        [merchantId],
      ),
      this.pool.query(
        `SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND status = 'PENDING'`,
        [merchantId],
      ),
      this.commerceFactsService.buildFinanceSummary(
        merchantId,
        today,
        new Date(),
      ),
      this.pool.query(
        `SELECT COUNT(*) FROM merchant_staff WHERE merchant_id = $1 AND status = 'ACTIVE'`,
        [merchantId],
      ),
    ]);

    return {
      activeConversations: parseInt(active.rows[0].count),
      pendingOrders: parseInt(pending.rows[0].count),
      todayOrders: todaySummary.bookedOrders,
      todayRevenue: todaySummary.realizedRevenue,
      onlineStaff: parseInt(onlineStaff.rows[0].count),
    };
  }

  // ==================== EXPORT REPORTS ====================

  async exportReport(
    merchantId: string,
    range: DateRange,
    format: "json" | "csv",
  ): Promise<{
    data: any;
    filename: string;
    contentType: string;
  }> {
    const [dashboard, sales, customers, conversations] = await Promise.all([
      this.getDashboardMetrics(merchantId, range),
      this.getSalesBreakdown(merchantId, range),
      this.getCustomerInsights(merchantId, range),
      this.getConversationAnalytics(merchantId, range),
    ]);

    const report = {
      generatedAt: new Date().toISOString(),
      period: {
        start: range.startDate.toISOString(),
        end: range.endDate.toISOString(),
      },
      dashboard,
      sales,
      customers,
      conversations,
    };

    const filename = `analytics_report_${merchantId}_${range.startDate.toISOString().split("T")[0]}_${range.endDate.toISOString().split("T")[0]}`;

    if (format === "csv") {
      // Convert to CSV format
      const csv = this.convertToCSV(report);
      return {
        data: csv,
        filename: `${filename}.csv`,
        contentType: "text/csv",
      };
    }

    return {
      data: report,
      filename: `${filename}.json`,
      contentType: "application/json",
    };
  }

  // ==================== PRIVATE HELPERS ====================

  private async getOrderMetrics(
    merchantId: string,
    range: DateRange,
  ): Promise<{ count: number; revenue: number }> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
       FROM orders 
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
       AND status::text NOT IN ('CANCELLED', 'REFUNDED')`,
      [merchantId, range.startDate, range.endDate],
    );
    return {
      count: parseInt(result.rows[0].count),
      revenue: parseFloat(result.rows[0].revenue),
    };
  }

  private async getCustomerMetrics(
    merchantId: string,
    range: DateRange,
  ): Promise<{
    total: number;
    new: number;
    returning: number;
    retentionRate: number;
  }> {
    const result = await this.pool.query(
      `WITH customer_orders AS (
        SELECT 
          customer_phone,
          MIN(created_at) as first_order,
          COUNT(*) as order_count
        FROM orders 
        WHERE merchant_id = $1 AND created_at <= $3
        GROUP BY customer_phone
      )
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE first_order >= $2) as new,
        COUNT(*) FILTER (WHERE order_count > 1) as returning
      FROM customer_orders
      WHERE first_order <= $3`,
      [merchantId, range.startDate, range.endDate],
    );

    const total = parseInt(result.rows[0].total);
    const returning = parseInt(result.rows[0].returning);

    return {
      total,
      new: parseInt(result.rows[0].new),
      returning,
      retentionRate: total > 0 ? (returning / total) * 100 : 0,
    };
  }

  private async getConversationMetrics(
    merchantId: string,
    range: DateRange,
  ): Promise<{
    total: number;
    avgResponseTime: number;
    resolutionRate: number;
    escalationRate: number;
    aiHandledPercentage: number;
    avgMessages: number;
  }> {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE escalated = true) as escalated,
        COUNT(*) FILTER (WHERE ai_handled = true) as ai_handled,
        AVG(message_count) as avg_messages
       FROM conversations
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [merchantId, range.startDate, range.endDate],
    );

    const total = parseInt(result.rows[0].total) || 1;
    return {
      total: parseInt(result.rows[0].total),
      avgResponseTime: 0, // Would need more detailed message tracking
      resolutionRate: (parseInt(result.rows[0].resolved) / total) * 100,
      escalationRate: (parseInt(result.rows[0].escalated) / total) * 100,
      aiHandledPercentage: (parseInt(result.rows[0].ai_handled) / total) * 100,
      avgMessages: parseFloat(result.rows[0].avg_messages) || 0,
    };
  }

  private async getSalesByProduct(
    merchantId: string,
    range: DateRange,
  ): Promise<
    Array<{
      productId: string;
      name: string;
      quantity: number;
      revenue: number;
    }>
  > {
    const result = await this.pool.query(
      `SELECT 
        oi.product_id,
        p.name,
        SUM(oi.quantity) as quantity,
        SUM(oi.price * oi.quantity) as revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN products p ON oi.product_id = p.id
       WHERE o.merchant_id = $1 AND o.created_at >= $2 AND o.created_at <= $3
       GROUP BY oi.product_id, p.name
       ORDER BY revenue DESC
       LIMIT 20`,
      [merchantId, range.startDate, range.endDate],
    );

    return result.rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      quantity: parseInt(r.quantity),
      revenue: parseFloat(r.revenue),
    }));
  }

  private async getSalesByCategory(
    merchantId: string,
    range: DateRange,
  ): Promise<Array<{ category: string; quantity: number; revenue: number }>> {
    const result = await this.pool.query(
      `SELECT 
        COALESCE(p.category, 'Uncategorized') as category,
        SUM(oi.quantity) as quantity,
        SUM(oi.price * oi.quantity) as revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN products p ON oi.product_id = p.id
       WHERE o.merchant_id = $1 AND o.created_at >= $2 AND o.created_at <= $3
       GROUP BY p.category
       ORDER BY revenue DESC`,
      [merchantId, range.startDate, range.endDate],
    );

    return result.rows.map((r) => ({
      category: r.category,
      quantity: parseInt(r.quantity),
      revenue: parseFloat(r.revenue),
    }));
  }

  private async getSalesByHour(
    merchantId: string,
    range: DateRange,
  ): Promise<Array<{ hour: number; orders: number; revenue: number }>> {
    const result = await this.pool.query(
      `SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue
       FROM orders
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [merchantId, range.startDate, range.endDate],
    );

    return result.rows.map((r) => ({
      hour: parseInt(r.hour),
      orders: parseInt(r.orders),
      revenue: parseFloat(r.revenue),
    }));
  }

  private async getSalesByDayOfWeek(
    merchantId: string,
    range: DateRange,
  ): Promise<Array<{ day: string; orders: number; revenue: number }>> {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const result = await this.pool.query(
      `SELECT 
        EXTRACT(DOW FROM created_at) as day_num,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue
       FROM orders
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY EXTRACT(DOW FROM created_at)
       ORDER BY day_num`,
      [merchantId, range.startDate, range.endDate],
    );

    return result.rows.map((r) => ({
      day: days[parseInt(r.day_num)],
      orders: parseInt(r.orders),
      revenue: parseFloat(r.revenue),
    }));
  }

  private async getTopCustomers(
    merchantId: string,
    range: DateRange,
  ): Promise<
    Array<{
      phone: string;
      name: string;
      totalOrders: number;
      totalSpent: number;
      lastOrderDate: Date;
      loyaltyTier?: string;
    }>
  > {
    const result = await this.pool.query(
      `SELECT 
        o.customer_phone as phone,
        MAX(o.customer_name) as name,
        COUNT(*) as total_orders,
        SUM(o.total) as total_spent,
        MAX(o.created_at) as last_order_date,
        lt.name as loyalty_tier
       FROM orders o
       LEFT JOIN customers c ON c.phone = o.customer_phone AND c.merchant_id = o.merchant_id
       LEFT JOIN customer_points cp ON cp.customer_id = c.id AND cp.merchant_id = o.merchant_id
       LEFT JOIN loyalty_tiers lt ON cp.tier_id = lt.id
       WHERE o.merchant_id = $1 AND o.created_at >= $2 AND o.created_at <= $3
       GROUP BY o.customer_phone, lt.name
       ORDER BY total_spent DESC
       LIMIT 20`,
      [merchantId, range.startDate, range.endDate],
    );

    return result.rows.map((r) => ({
      phone: r.phone,
      name: r.name || "Unknown",
      totalOrders: parseInt(r.total_orders),
      totalSpent: parseFloat(r.total_spent),
      lastOrderDate: r.last_order_date,
      loyaltyTier: r.loyalty_tier,
    }));
  }

  private async getCustomerSegments(merchantId: string): Promise<
    Array<{
      segment: string;
      count: number;
      avgOrderValue: number;
      totalRevenue: number;
    }>
  > {
    const result = await this.pool.query(
      `WITH customer_stats AS (
        SELECT 
          customer_phone,
          COUNT(*) as order_count,
          SUM(total) as total_spent,
          AVG(total) as avg_order
        FROM orders
        WHERE merchant_id = $1
        GROUP BY customer_phone
      )
      SELECT 
        CASE 
          WHEN order_count = 1 THEN 'One-time'
          WHEN order_count BETWEEN 2 AND 3 THEN 'Occasional'
          WHEN order_count BETWEEN 4 AND 10 THEN 'Regular'
          ELSE 'VIP'
        END as segment,
        COUNT(*) as count,
        AVG(avg_order) as avg_order_value,
        SUM(total_spent) as total_revenue
      FROM customer_stats
      GROUP BY 
        CASE 
          WHEN order_count = 1 THEN 'One-time'
          WHEN order_count BETWEEN 2 AND 3 THEN 'Occasional'
          WHEN order_count BETWEEN 4 AND 10 THEN 'Regular'
          ELSE 'VIP'
        END
      ORDER BY count DESC`,
      [merchantId],
    );

    return result.rows.map((r) => ({
      segment: r.segment,
      count: parseInt(r.count),
      avgOrderValue: parseFloat(r.avg_order_value),
      totalRevenue: parseFloat(r.total_revenue),
    }));
  }

  private async getAcquisitionChannels(
    merchantId: string,
    range: DateRange,
  ): Promise<
    Array<{
      channel: string;
      customers: number;
      revenue: number;
    }>
  > {
    // This would need a channel tracking field in orders/conversations
    return [
      { channel: "WhatsApp", customers: 0, revenue: 0 },
      { channel: "Direct", customers: 0, revenue: 0 },
      { channel: "Referral", customers: 0, revenue: 0 },
    ];
  }

  private async getConversationVolumeByHour(
    merchantId: string,
    range: DateRange,
  ): Promise<Array<{ hour: number; count: number }>> {
    const result = await this.pool.query(
      `SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
       FROM conversations
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [merchantId, range.startDate, range.endDate],
    );

    return result.rows.map((r) => ({
      hour: parseInt(r.hour),
      count: parseInt(r.count),
    }));
  }

  private async getTopTopics(
    merchantId: string,
    range: DateRange,
  ): Promise<Array<{ topic: string; count: number; percentage: number }>> {
    const result = await this.pool.query(
      `SELECT 
        COALESCE(intent, 'unknown') as topic,
        COUNT(*) as count
       FROM conversations
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY intent
       ORDER BY count DESC
       LIMIT 10`,
      [merchantId, range.startDate, range.endDate],
    );

    const total = result.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    return result.rows.map((r) => ({
      topic: r.topic,
      count: parseInt(r.count),
      percentage: total > 0 ? (parseInt(r.count) / total) * 100 : 0,
    }));
  }

  private async getSentimentBreakdown(
    merchantId: string,
    range: DateRange,
  ): Promise<{ positive: number; neutral: number; negative: number }> {
    // Would need sentiment tracking in conversations
    return { positive: 60, neutral: 30, negative: 10 };
  }

  private async getAvgTimeToResolution(
    merchantId: string,
    range: DateRange,
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_time
       FROM conversations
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
       AND status = 'resolved' AND resolved_at IS NOT NULL`,
      [merchantId, range.startDate, range.endDate],
    );

    return parseFloat(result.rows[0].avg_time) || 0;
  }

  private async getHandoffReasons(
    merchantId: string,
    range: DateRange,
  ): Promise<Array<{ reason: string; count: number }>> {
    const result = await this.pool.query(
      `SELECT 
        COALESCE(handoff_reason, 'unknown') as reason,
        COUNT(*) as count
       FROM conversations
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
       AND escalated = true
       GROUP BY handoff_reason
       ORDER BY count DESC`,
      [merchantId, range.startDate, range.endDate],
    );

    return result.rows.map((r) => ({
      reason: r.reason,
      count: parseInt(r.count),
    }));
  }

  // ==================== CART RECOVERY KPI ====================

  /**
   * Get cart recovery metrics for abandoned cart followups
   * Returns: abandoned carts, recovered carts, recovery rate, recovered revenue
   */
  async getCartRecoveryMetrics(
    merchantId: string,
    range: DateRange,
  ): Promise<{
    abandonedCarts: number;
    recoveredCarts: number;
    recoveryRate: number;
    recoveredRevenue: number;
    pendingFollowups: number;
    sentFollowups: number;
    conversionAfterFollowup: number;
  }> {
    const cacheKey = `analytics:cart-recovery:${merchantId}:${range.startDate.toISOString()}:${range.endDate.toISOString()}`;
    const cached = await this.getCachedValue<{
      abandonedCarts: number;
      recoveredCarts: number;
      recoveryRate: number;
      recoveredRevenue: number;
      pendingFollowups: number;
      sentFollowups: number;
      conversionAfterFollowup: number;
    }>(cacheKey);
    if (cached) return cached;

    // Count abandoned cart conversations (stuck in early funnel states for > 1 hour without order)
    const abandonedResult = await this.pool.query(
      `
      SELECT COUNT(DISTINCT c.id) as abandoned
      FROM conversations c
      LEFT JOIN orders o ON o.conversation_id = c.id AND o.status NOT IN ('DRAFT', 'CANCELLED')
      WHERE c.merchant_id = $1
        AND c.state IN (
          'COLLECTING_ITEMS',
          'COLLECTING_VARIANTS',
          'COLLECTING_CUSTOMER_INFO',
          'COLLECTING_ADDRESS',
          'NEGOTIATING',
          'CONFIRMING_ORDER'
        )
        AND c.created_at BETWEEN $2 AND $3
        AND c.updated_at < NOW() - INTERVAL '1 hour'
        AND o.id IS NULL
    `,
      [merchantId, range.startDate, range.endDate],
    );

    // Count followups sent for abandoned carts
    const followupResult = await this.pool.query(
      `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'SENT') as sent,
        COUNT(*) FILTER (WHERE status IN ('SENT', 'PENDING', 'FAILED', 'CANCELLED')) as total
      FROM followups
      WHERE merchant_id = $1
        AND type = 'abandoned_cart'
        AND created_at BETWEEN $2 AND $3
    `,
      [merchantId, range.startDate, range.endDate],
    );

    // Count orders placed after abandoned cart followup (recovered carts)
    const recoveredResult = await this.pool.query(
      `
      SELECT 
        COUNT(DISTINCT o.id) as recovered,
        COALESCE(SUM(o.total_price), 0) as revenue
      FROM orders o
      INNER JOIN followups f ON f.conversation_id = o.conversation_id
        AND f.type = 'abandoned_cart'
        AND f.status = 'SENT'
        AND f.sent_at < o.created_at
      WHERE o.merchant_id = $1
        AND o.status NOT IN ('DRAFT', 'CANCELLED')
        AND o.created_at BETWEEN $2 AND $3
    `,
      [merchantId, range.startDate, range.endDate],
    );

    const abandoned = parseInt(abandonedResult.rows[0]?.abandoned || "0");
    const recovered = parseInt(recoveredResult.rows[0]?.recovered || "0");
    const revenue = parseFloat(recoveredResult.rows[0]?.revenue || "0");
    const sent = parseInt(followupResult.rows[0]?.sent || "0");
    const pending = parseInt(followupResult.rows[0]?.pending || "0");

    const metrics = {
      abandonedCarts: abandoned,
      recoveredCarts: recovered,
      recoveryRate: abandoned > 0 ? (recovered / abandoned) * 100 : 0,
      recoveredRevenue: revenue,
      pendingFollowups: pending,
      sentFollowups: sent,
      conversionAfterFollowup: sent > 0 ? (recovered / sent) * 100 : 0,
    };

    await this.setCachedValue(cacheKey, metrics);
    return metrics;
  }

  private calculateChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  private convertToCSV(report: any): string {
    const lines: string[] = [];

    // Dashboard metrics
    lines.push("Dashboard Metrics");
    lines.push("Metric,Value");
    Object.entries(report.dashboard).forEach(([key, value]) => {
      lines.push(`${key},${value}`);
    });
    lines.push("");

    // Sales by product
    lines.push("Sales by Product");
    lines.push("Product ID,Name,Quantity,Revenue");
    report.sales.byProduct.forEach((p: any) => {
      lines.push(`${p.productId},${p.name},${p.quantity},${p.revenue}`);
    });
    lines.push("");

    // Top customers
    lines.push("Top Customers");
    lines.push("Phone,Name,Orders,Total Spent,Last Order");
    report.customers.topCustomers.forEach((c: any) => {
      lines.push(
        `${c.phone},${c.name},${c.totalOrders},${c.totalSpent},${c.lastOrderDate}`,
      );
    });

    return lines.join("\n");
  }
}
