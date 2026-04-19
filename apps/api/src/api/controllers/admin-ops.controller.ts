import {
  Controller,
  Body,
  Get,
  Post,
  Param,
  Query,
  Logger,
  UseGuards,
  Inject,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiQuery,
} from "@nestjs/swagger";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";
import { DlqService } from "../../application/dlq/dlq.service";
import { OutboxService } from "../../application/events/outbox.service";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { CommerceFactsService } from "../../application/services/commerce-facts.service";

type AdminServiceState = "healthy" | "degraded" | "critical";

interface AdminServiceHealth {
  name: string;
  status: AdminServiceState;
  uptime: string;
  latency: string;
}

@ApiTags("Admin")
@Controller("v1/admin")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
export class AdminOpsController {
  private readonly logger = new Logger(AdminOpsController.name);
  private readonly startedAt = Date.now();

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly dlqService: DlqService,
    private readonly outboxService: OutboxService,
    private readonly redisService: RedisService,
    private readonly commerceFactsService: CommerceFactsService,
  ) {}

  // ===== METRICS =====

  @Get("dashboard/stats")
  @ApiOperation({
    summary: "Get admin dashboard stats",
    description:
      "Returns dashboard summary metrics, chart data, and recent DLQ activity for the admin portal",
  })
  @ApiResponse({
    status: 200,
    description: "Admin dashboard stats retrieved successfully",
  })
  async getDashboardStats(): Promise<any> {
    const [
      merchantStats,
      orderStats,
      conversationStats,
      dlqStats,
      billingStats,
      aiRoutingStats,
      dailyOrders,
      merchantDistribution,
      recentDlq,
      systemHealth,
    ] = await Promise.all([
      this.getMerchantStats(),
      this.getOrderStats(),
      this.getConversationStats(),
      this.dlqService.getStats(),
      this.getBillingStats(),
      this.getAiRoutingStats(),
      this.getDailyOrders(),
      this.getMerchantDistribution(),
      this.getRecentDlq(),
      this.getSystemHealthSummary(),
    ]);

    return {
      totalMerchants: merchantStats.total,
      activeMerchants: merchantStats.active,
      totalOrders: orderStats.total,
      ordersToday: orderStats.today,
      totalConversations: conversationStats.total,
      activeConversations: conversationStats.active,
      dlqPending: dlqStats.totalPending,
      activeSubscriptions: billingStats.activeSubscriptions,
      totalRevenue: orderStats.totalRevenue,
      systemHealth: systemHealth.status,
      routingStats: aiRoutingStats,
      ai_calls_4o_today: aiRoutingStats.aiCalls4oToday,
      ai_calls_mini_today: aiRoutingStats.aiCallsMiniToday,
      instant_replies_today: aiRoutingStats.instantRepliesToday,
      media_redirects_today: aiRoutingStats.mediaRedirectsToday,
      quota_blocked_today: aiRoutingStats.quotaBlockedToday,
      estimated_ai_cost_today_usd: aiRoutingStats.estimatedAiCostTodayUsd,
      dailyOrders,
      merchantDistribution,
      recentDlq,
    };
  }

  @Get("system/health")
  @ApiOperation({
    summary: "Get admin system health",
    description:
      "Returns API, database, Redis, and worker health information for the admin dashboard",
  })
  @ApiResponse({
    status: 200,
    description: "Admin system health retrieved successfully",
  })
  async getSystemHealth(): Promise<{
    status: AdminServiceState;
    services: AdminServiceHealth[];
    lastBackupAt: string | null;
    checkedAt: string;
  }> {
    const summary = await this.getSystemHealthSummary();
    return {
      ...summary,
      checkedAt: new Date().toISOString(),
    };
  }

  @Get("metrics")
  @ApiOperation({
    summary: "Get system metrics",
    description:
      "Returns aggregated metrics for all merchants including token usage, order counts, and event statistics",
  })
  @ApiResponse({ status: 200, description: "Metrics retrieved successfully" })
  async getMetrics(): Promise<any> {
    const [
      merchantStats,
      orderStats,
      conversationStats,
      messageStats,
      eventStats,
      dlqStats,
    ] = await Promise.all([
      this.getMerchantStats(),
      this.getOrderStats(),
      this.getConversationStats(),
      this.getMessageStats(),
      this.outboxService.getEventStats(),
      this.dlqService.getStats(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      merchants: merchantStats,
      orders: orderStats,
      conversations: conversationStats,
      messages: messageStats,
      events: eventStats,
      dlq: dlqStats,
    };
  }

  @Post("agent/toggle")
  @ApiOperation({
    summary: "Toggle autonomous agent kill switch",
    description:
      "Enables or disables autonomous agent actions by writing the Redis kill switch flag",
  })
  @ApiResponse({ status: 200, description: "Autonomous agent flag updated" })
  async toggleAutonomousAgent(
    @Body() body: { enabled: boolean },
  ): Promise<{ enabled: boolean }> {
    if (typeof body?.enabled !== "boolean") {
      throw new BadRequestException("enabled must be a boolean");
    }

    if (!this.redisService.enabled) {
      throw new ServiceUnavailableException(
        "Redis is unavailable; autonomous agent kill switch cannot be updated",
      );
    }

    const stored = await this.redisService.set(
      "autonomous_agent_enabled",
      body.enabled ? "true" : "false",
    );

    if (!stored) {
      throw new ServiceUnavailableException(
        "Failed to persist autonomous agent kill switch",
      );
    }

    return { enabled: body.enabled };
  }

  // ===== DLQ =====

  @Post("replay/:dlqEventId")
  @ApiOperation({
    summary: "Replay a DLQ event",
    description:
      "Re-queue a failed event from the Dead Letter Queue for processing",
  })
  @ApiParam({ name: "dlqEventId", description: "DLQ event ID to replay" })
  @ApiResponse({ status: 200, description: "Event replayed successfully" })
  @ApiResponse({ status: 404, description: "DLQ event not found" })
  async replayDlqEvent(@Param("dlqEventId") dlqEventId: string): Promise<any> {
    this.logger.log({
      msg: "Replaying DLQ event",
      dlqEventId,
    });

    const result = await this.dlqService.replayEvent(dlqEventId);

    return {
      success: result.success,
      newEventId: result.newEventId,
      error: result.error,
    };
  }

  @Get("dlq")
  @ApiOperation({ summary: "List DLQ events" })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  @ApiQuery({ name: "merchantId", required: false })
  async listDlqEvents(
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("merchantId") merchantId?: string,
  ): Promise<any> {
    const result = await this.dlqService.listEvents(
      limit || 50,
      offset || 0,
      merchantId,
    );
    return result;
  }

  // ===== REPORTS =====

  @Get("reports")
  @ApiOperation({
    summary: "Get cross-merchant reports",
    description:
      "Returns aggregated reports across all merchants with optional filtering by period type and date range",
  })
  @ApiQuery({
    name: "periodType",
    required: false,
    enum: ["daily", "weekly", "monthly"],
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date (YYYY-MM-DD)",
  })
  @ApiQuery({ name: "merchantId", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  @ApiResponse({ status: 200, description: "Reports retrieved successfully" })
  async getCrossMerchantReports(
    @Query("periodType") periodType?: "daily" | "weekly" | "monthly",
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("merchantId") merchantId?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<any> {
    const filters: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (periodType) {
      filters.push(`period_type = $${paramIndex++}`);
      params.push(periodType);
    }
    if (startDate) {
      filters.push(`report_date >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      filters.push(`report_date <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (merchantId) {
      filters.push(`mr.merchant_id = $${paramIndex++}`);
      params.push(merchantId);
    }

    const whereClause =
      filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const reportsResult = await this.pool.query(
      `SELECT mr.*, m.name as merchant_name
       FROM merchant_reports mr
       JOIN merchants m ON mr.merchant_id = m.id
       ${whereClause}
       ORDER BY mr.report_date DESC, mr.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit || 50, offset || 0],
    );

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM merchant_reports mr ${whereClause}`,
      params,
    );

    const aggregatesResult = await this.pool.query(
      `SELECT 
         COUNT(DISTINCT mr.merchant_id) as merchants_with_reports,
         SUM(
           COALESCE(
             NULLIF(summary->>'realizedRevenue', '')::numeric,
             NULLIF(summary->>'totalRevenue', '')::numeric,
             0
           )
         ) as total_revenue,
         SUM((summary->>'ordersCreated')::int) as total_orders,
         SUM((summary->>'totalConversations')::int) as total_conversations,
         AVG((summary->>'conversionRate')::numeric) as avg_conversion_rate
       FROM merchant_reports mr
       ${whereClause}`,
      params,
    );

    const aggregates = aggregatesResult.rows[0];

    return {
      reports: reportsResult.rows.map((row) => ({
        id: row.id,
        merchantId: row.merchant_id,
        merchantName: row.merchant_name,
        reportDate: row.report_date,
        periodType: row.period_type,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        summary: row.summary,
        createdAt: row.created_at,
      })),
      total: parseInt(countResult.rows[0].count, 10),
      aggregates: {
        merchantsWithReports:
          parseInt(aggregates.merchants_with_reports, 10) || 0,
        totalRevenue: parseFloat(aggregates.total_revenue) || 0,
        totalOrders: parseInt(aggregates.total_orders, 10) || 0,
        totalConversations: parseInt(aggregates.total_conversations, 10) || 0,
        avgConversionRate: parseFloat(aggregates.avg_conversion_rate) || 0,
      },
      pagination: {
        limit: limit || 50,
        offset: offset || 0,
      },
    };
  }

  @Get("reports/summary")
  @ApiOperation({
    summary: "Get platform-wide summary report",
    description:
      "Returns aggregated statistics across all merchants for a given time period",
  })
  @ApiQuery({
    name: "days",
    required: false,
    description: "Number of days to look back (default: 7)",
  })
  @ApiResponse({ status: 200, description: "Summary retrieved successfully" })
  async getPlatformSummary(@Query("days") days?: number): Promise<any> {
    const lookbackDays = days || 7;
    const paidOrderAmountExpr = this.getPaidOrderAmountExpr("o", "paid");

    const result = await this.pool.query(
      `SELECT 
         m.id as merchant_id,
         m.name as merchant_name,
         COUNT(DISTINCT o.id) as orders_count,
         COALESCE(SUM(${paidOrderAmountExpr}), 0) as revenue,
         COUNT(DISTINCT c.id) as conversations_count,
         COUNT(DISTINCT c.id) FILTER (WHERE c.state = 'ORDER_PLACED') as converted_conversations
       FROM merchants m
       LEFT JOIN orders o
         ON o.merchant_id = m.id
        AND o.created_at >= NOW() - $1::interval
       LEFT JOIN (
         SELECT
           order_id,
           COALESCE(
             SUM(amount) FILTER (
               WHERE UPPER(COALESCE(status, 'PAID')) = 'PAID'
             ),
             0
           ) AS total_paid
         FROM order_payments
         GROUP BY order_id
       ) paid ON paid.order_id = o.id
       LEFT JOIN conversations c ON c.merchant_id = m.id AND c.created_at >= NOW() - $1::interval
       WHERE m.is_active = true
       GROUP BY m.id, m.name
       ORDER BY revenue DESC`,
      [`${lookbackDays} days`],
    );

    const totals = result.rows.reduce(
      (acc, row) => ({
        orders: acc.orders + parseInt(row.orders_count, 10),
        revenue: acc.revenue + parseFloat(row.revenue),
        conversations:
          acc.conversations + parseInt(row.conversations_count, 10),
        converted: acc.converted + parseInt(row.converted_conversations, 10),
      }),
      { orders: 0, revenue: 0, conversations: 0, converted: 0 },
    );

    return {
      period: {
        days: lookbackDays,
        from: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        to: new Date().toISOString().split("T")[0],
      },
      totals: {
        ...totals,
        conversionRate:
          totals.conversations > 0
            ? ((totals.converted / totals.conversations) * 100).toFixed(2)
            : 0,
      },
      byMerchant: result.rows.map((row) => ({
        merchantId: row.merchant_id,
        merchantName: row.merchant_name,
        orders: parseInt(row.orders_count, 10),
        revenue: parseFloat(row.revenue),
        conversations: parseInt(row.conversations_count, 10),
        converted: parseInt(row.converted_conversations, 10),
        conversionRate:
          parseInt(row.conversations_count, 10) > 0
            ? (
                (parseInt(row.converted_conversations, 10) /
                  parseInt(row.conversations_count, 10)) *
                100
              ).toFixed(2)
            : 0,
      })),
    };
  }

  @Get("analytics")
  @ApiOperation({
    summary: "Get admin analytics",
    description:
      "Returns platform-wide realized revenue, merchant rankings, channel breakdowns, routing metrics, and hourly activity for the admin analytics page",
  })
  @ApiQuery({
    name: "period",
    required: false,
    enum: ["week", "month", "quarter", "year"],
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date (YYYY-MM-DD)",
  })
  async getAdminAnalytics(
    @Query("period") period?: "week" | "month" | "quarter" | "year",
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ): Promise<any> {
    const dayMap: Record<string, number> = {
      week: 7,
      month: 30,
      quarter: 90,
      year: 365,
    };
    const periodDays = dayMap[period || "month"] ?? 30;

    const currentEnd = endDate
      ? new Date(`${endDate}T23:59:59.999Z`)
      : new Date();
    const currentStart = startDate
      ? new Date(`${startDate}T00:00:00.000Z`)
      : (() => {
          const d = new Date(currentEnd);
          d.setUTCDate(d.getUTCDate() - (periodDays - 1));
          d.setUTCHours(0, 0, 0, 0);
          return d;
        })();
    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - (periodDays - 1));
    previousStart.setUTCHours(0, 0, 0, 0);

    const paidOrderAmountExpr = this.getPaidOrderAmountExpr("o", "paid");
    const validOrderStatusExpr = `UPPER(COALESCE(o.status::text, '')) NOT IN ('CANCELLED', 'DRAFT', 'FAILED', 'RETURNED')`;
    const bucketExpr =
      periodDays <= 31
        ? `DATE_TRUNC('day', o.created_at)`
        : periodDays <= 120
          ? `DATE_TRUNC('week', o.created_at)`
          : `DATE_TRUNC('month', o.created_at)`;

    const [
      currentFinance,
      previousFinance,
      conversationsSummary,
      merchantActivitySummary,
      revenueTrend,
      ordersByCategory,
      topMerchants,
      routingSummary,
      hourlyActivity,
    ] = await Promise.all([
      this.commerceFactsService.buildPlatformFinanceSummary(
        currentStart,
        currentEnd,
      ),
      this.commerceFactsService.buildPlatformFinanceSummary(
        previousStart,
        previousEnd,
      ),
      this.pool.query<{ current_count: string; previous_count: string }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE created_at >= $1 AND created_at <= $2
           )::text AS current_count,
           COUNT(*) FILTER (
             WHERE created_at >= $3 AND created_at <= $4
           )::text AS previous_count
         FROM conversations`,
        [currentStart, currentEnd, previousStart, previousEnd],
      ),
      this.pool.query<{ current_count: string; previous_count: string }>(
        `WITH merchant_activity AS (
           SELECT merchant_id, created_at FROM orders
           WHERE ${validOrderStatusExpr.replaceAll("o.", "")}
           UNION ALL
           SELECT merchant_id, created_at FROM conversations
         )
         SELECT
           COUNT(DISTINCT merchant_id) FILTER (
             WHERE created_at >= $1 AND created_at <= $2
           )::text AS current_count,
           COUNT(DISTINCT merchant_id) FILTER (
             WHERE created_at >= $3 AND created_at <= $4
           )::text AS previous_count
         FROM merchant_activity`,
        [currentStart, currentEnd, previousStart, previousEnd],
      ),
      this.pool.query<{ bucket: string; revenue: string }>(
        `SELECT
           ${bucketExpr} AS bucket,
           COALESCE(SUM(${paidOrderAmountExpr}), 0)::text AS revenue
         FROM orders o
         LEFT JOIN (
           SELECT
             order_id,
             COALESCE(
               SUM(amount) FILTER (
                 WHERE UPPER(COALESCE(status, 'PAID')) = 'PAID'
               ),
               0
             ) AS total_paid
           FROM order_payments
           GROUP BY order_id
         ) paid ON paid.order_id = o.id
         WHERE ${validOrderStatusExpr}
           AND o.created_at >= $1
           AND o.created_at <= $2
         GROUP BY bucket
         ORDER BY bucket ASC`,
        [currentStart, currentEnd],
      ),
      this.pool.query<{ category: string; order_count: string }>(
        `SELECT
           COALESCE(NULLIF(TRIM(m.category), ''), 'UNCATEGORIZED') AS category,
           COUNT(*)::text AS order_count
         FROM orders o
         JOIN merchants m ON m.id = o.merchant_id
         WHERE ${validOrderStatusExpr}
           AND o.created_at >= $1
           AND o.created_at <= $2
         GROUP BY COALESCE(NULLIF(TRIM(m.category), ''), 'UNCATEGORIZED')
         ORDER BY COUNT(*) DESC, category ASC
         LIMIT 8`,
        [currentStart, currentEnd],
      ),
      this.pool.query<{
        merchant_id: string;
        merchant_name: string;
        orders_count: string;
        revenue: string;
        conversations_count: string;
      }>(
        `WITH merchant_orders AS (
           SELECT
             o.merchant_id,
             COUNT(*)::text AS orders_count,
             COALESCE(SUM(${paidOrderAmountExpr}), 0)::text AS revenue
           FROM orders o
           LEFT JOIN (
             SELECT
               order_id,
               COALESCE(
                 SUM(amount) FILTER (
                   WHERE UPPER(COALESCE(status, 'PAID')) = 'PAID'
                 ),
                 0
               ) AS total_paid
             FROM order_payments
             GROUP BY order_id
           ) paid ON paid.order_id = o.id
           WHERE ${validOrderStatusExpr}
             AND o.created_at >= $1
             AND o.created_at <= $2
           GROUP BY o.merchant_id
         ),
         merchant_conversations AS (
           SELECT
             merchant_id,
             COUNT(*)::text AS conversations_count
           FROM conversations
           WHERE created_at >= $1
             AND created_at <= $2
           GROUP BY merchant_id
         )
         SELECT
           m.id AS merchant_id,
           m.name AS merchant_name,
           COALESCE(mo.orders_count, '0') AS orders_count,
           COALESCE(mo.revenue, '0') AS revenue,
           COALESCE(mc.conversations_count, '0') AS conversations_count
         FROM merchants m
         JOIN merchant_orders mo ON mo.merchant_id = m.id
         LEFT JOIN merchant_conversations mc ON mc.merchant_id = m.id
         ORDER BY COALESCE(mo.revenue, '0')::numeric DESC, COALESCE(mo.orders_count, '0')::int DESC
         LIMIT 10`,
        [currentStart, currentEnd],
      ),
      this.pool.query<{
        current_4o: string;
        previous_4o: string;
        current_mini: string;
        previous_mini: string;
        current_instant: string;
        previous_instant: string;
        current_cost: string;
        previous_cost: string;
      }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE model_used = 'gpt-4o'
               AND created_at >= $1 AND created_at <= $2
           )::text AS current_4o,
           COUNT(*) FILTER (
             WHERE model_used = 'gpt-4o'
               AND created_at >= $3 AND created_at <= $4
           )::text AS previous_4o,
           COUNT(*) FILTER (
             WHERE model_used = 'gpt-4o-mini'
               AND created_at >= $1 AND created_at <= $2
           )::text AS current_mini,
           COUNT(*) FILTER (
             WHERE model_used = 'gpt-4o-mini'
               AND created_at >= $3 AND created_at <= $4
           )::text AS previous_mini,
           COUNT(*) FILTER (
             WHERE routing_decision IN ('instant_order_status', 'instant_price', 'instant_greeting')
               AND created_at >= $1 AND created_at <= $2
           )::text AS current_instant,
           COUNT(*) FILTER (
             WHERE routing_decision IN ('instant_order_status', 'instant_price', 'instant_greeting')
               AND created_at >= $3 AND created_at <= $4
           )::text AS previous_instant,
           COALESCE(SUM(estimated_cost_usd) FILTER (
             WHERE created_at >= $1 AND created_at <= $2
           ), 0)::text AS current_cost,
           COALESCE(SUM(estimated_cost_usd) FILTER (
             WHERE created_at >= $3 AND created_at <= $4
           ), 0)::text AS previous_cost
         FROM ai_routing_log`,
        [currentStart, currentEnd, previousStart, previousEnd],
      ),
      this.pool.query<{ hour: string; conversations: string; orders: string }>(
        `WITH hours AS (
           SELECT generate_series(0, 23) AS hour
         ),
         conversation_hours AS (
           SELECT
             EXTRACT(HOUR FROM created_at)::int AS hour,
             COUNT(*)::int AS conversations
           FROM conversations
           WHERE created_at >= $1
             AND created_at <= $2
           GROUP BY EXTRACT(HOUR FROM created_at)
         ),
         order_hours AS (
           SELECT
             EXTRACT(HOUR FROM created_at)::int AS hour,
             COUNT(*)::int AS orders
           FROM orders
           WHERE ${validOrderStatusExpr.replaceAll("o.", "")}
             AND created_at >= $1
             AND created_at <= $2
           GROUP BY EXTRACT(HOUR FROM created_at)
         )
         SELECT
           h.hour::text AS hour,
           COALESCE(ch.conversations, 0)::text AS conversations,
           COALESCE(oh.orders, 0)::text AS orders
         FROM hours h
         LEFT JOIN conversation_hours ch ON ch.hour = h.hour
         LEFT JOIN order_hours oh ON oh.hour = h.hour
         ORDER BY h.hour ASC`,
        [currentStart, currentEnd],
      ),
    ]);

    const toNumber = (value: string | number | null | undefined) =>
      Number.isFinite(Number(value)) ? Number(value) : 0;
    const percentageChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    const currentRevenue = currentFinance.realizedRevenue;
    const previousRevenue = previousFinance.realizedRevenue;
    const currentOrders = currentFinance.bookedOrders;
    const previousOrders = previousFinance.bookedOrders;
    const currentConversations = toNumber(
      conversationsSummary.rows[0]?.current_count,
    );
    const previousConversations = toNumber(
      conversationsSummary.rows[0]?.previous_count,
    );
    const currentActiveMerchants = toNumber(
      merchantActivitySummary.rows[0]?.current_count,
    );
    const previousActiveMerchants = toNumber(
      merchantActivitySummary.rows[0]?.previous_count,
    );

    return {
      totalRevenue: currentRevenue,
      realizedRevenue: currentRevenue,
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
      revenueChange: percentageChange(currentRevenue, previousRevenue),
      totalOrders: currentOrders,
      ordersChange: percentageChange(currentOrders, previousOrders),
      activeMerchants: currentActiveMerchants,
      merchantsChange: percentageChange(
        currentActiveMerchants,
        previousActiveMerchants,
      ),
      totalConversations: currentConversations,
      conversationsChange: percentageChange(
        currentConversations,
        previousConversations,
      ),
      revenueByMonth: revenueTrend.rows.map((row) => ({
        name: new Date(row.bucket).toLocaleDateString("ar-EG", {
          month: periodDays > 120 ? "short" : undefined,
          day: periodDays <= 120 ? "numeric" : undefined,
        }),
        value: toNumber(row.revenue),
      })),
      ordersByCategory: ordersByCategory.rows.map((row, index) => ({
        name: row.category,
        value: toNumber(row.order_count),
        color: [
          "#3b82f6",
          "#10b981",
          "#f59e0b",
          "#ef4444",
          "#8b5cf6",
          "#14b8a6",
          "#f97316",
          "#6366f1",
        ][index % 8],
      })),
      conversionRates: hourlyActivity.rows.slice(8, 15).map((row) => {
        const conversations = toNumber(row.conversations);
        const orders = toNumber(row.orders);
        return {
          name: `${row.hour}:00`,
          rate:
            conversations > 0
              ? Number(((orders / conversations) * 100).toFixed(1))
              : 0,
        };
      }),
      topMerchants: topMerchants.rows.map((row) => {
        const merchantConversations = toNumber(row.conversations_count);
        const merchantOrders = toNumber(row.orders_count);
        return {
          id: row.merchant_id,
          name: row.merchant_name,
          orders: merchantOrders,
          revenue: toNumber(row.revenue),
          conversion:
            merchantConversations > 0
              ? Number(
                  ((merchantOrders / merchantConversations) * 100).toFixed(1),
                )
              : 0,
        };
      }),
      agentPerformance: [
        {
          name: "ردود فورية",
          value: toNumber(
            routingSummary.rows[0]?.current_instant,
          ).toLocaleString("ar-EG"),
          change: percentageChange(
            toNumber(routingSummary.rows[0]?.current_instant),
            toNumber(routingSummary.rows[0]?.previous_instant),
          ),
        },
        {
          name: "استخدام GPT-4o",
          value: toNumber(routingSummary.rows[0]?.current_4o).toLocaleString(
            "ar-EG",
          ),
          change: percentageChange(
            toNumber(routingSummary.rows[0]?.current_4o),
            toNumber(routingSummary.rows[0]?.previous_4o),
          ),
        },
        {
          name: "استخدام GPT-4o mini",
          value: toNumber(routingSummary.rows[0]?.current_mini).toLocaleString(
            "ar-EG",
          ),
          change: percentageChange(
            toNumber(routingSummary.rows[0]?.current_mini),
            toNumber(routingSummary.rows[0]?.previous_mini),
          ),
        },
        {
          name: "تكلفة الذكاء",
          value: `$${toNumber(routingSummary.rows[0]?.current_cost).toFixed(2)}`,
          change: percentageChange(
            toNumber(routingSummary.rows[0]?.current_cost),
            toNumber(routingSummary.rows[0]?.previous_cost),
          ),
        },
      ],
      hourlyActivity: hourlyActivity.rows.map((row) => ({
        name: `${String(row.hour).padStart(2, "0")}:00`,
        conversations: toNumber(row.conversations),
        orders: toNumber(row.orders),
      })),
    };
  }

  // ===== PRIVATE HELPERS =====

  private getOrderAmountExpr(orderAlias = "o"): string {
    return `COALESCE(
      NULLIF((to_jsonb(${orderAlias})->>'total'), '')::numeric,
      NULLIF((to_jsonb(${orderAlias})->>'total_amount'), '')::numeric,
      0
    )`;
  }

  private getPaidOrderAmountExpr(orderAlias = "o", paidAlias = "paid"): string {
    const orderAmountExpr = this.getOrderAmountExpr(orderAlias);
    return `LEAST(
      ${orderAmountExpr},
      GREATEST(
        COALESCE(
          ${paidAlias}.total_paid,
          CASE
            WHEN UPPER(COALESCE(NULLIF(to_jsonb(${orderAlias})->>'payment_status', ''), 'PENDING')) = 'PAID'
            THEN ${orderAmountExpr}
            ELSE 0
          END
        ),
        0
      )
    )`;
  }

  private async getMerchantStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active
      FROM merchants
    `);
    return {
      total: parseInt(result.rows[0].total, 10),
      active: parseInt(result.rows[0].active, 10),
    };
  }

  private async getBillingStats(): Promise<{
    activeSubscriptions: number;
  }> {
    const result = await this.pool.query(`
      SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_subscriptions
      FROM merchant_subscriptions
    `);
    return {
      activeSubscriptions: parseInt(
        result.rows[0]?.active_subscriptions ?? "0",
        10,
      ),
    };
  }

  private async getAiRoutingStats(): Promise<{
    total4oCalls: number;
    totalMiniCalls: number;
    totalInstantReplies: number;
    totalBlocked: number;
    estimated4oCostToday: number;
    estimatedMiniCostToday: number;
    totalEstimatedCostToday: number;
    savingsVsPure4o: number;
    aiCalls4oToday: number;
    aiCallsMiniToday: number;
    instantRepliesToday: number;
    mediaRedirectsToday: number;
    quotaBlockedToday: number;
    estimatedAiCostTodayUsd: number;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE model_used = 'gpt-4o'
              AND created_at >= date_trunc('day', NOW())
          ) AS ai_calls_4o_today,
          COUNT(*) FILTER (
            WHERE model_used = 'gpt-4o-mini'
              AND created_at >= date_trunc('day', NOW())
          ) AS ai_calls_mini_today,
          COUNT(*) FILTER (
            WHERE routing_decision IN ('instant_order_status', 'instant_price', 'instant_greeting')
              AND created_at >= date_trunc('day', NOW())
          ) AS instant_replies_today,
          COUNT(*) FILTER (
            WHERE routing_decision = 'media_redirect'
              AND created_at >= date_trunc('day', NOW())
          ) AS media_redirects_today,
          COUNT(*) FILTER (
            WHERE routing_decision = 'quota_blocked'
              AND created_at >= date_trunc('day', NOW())
          ) AS quota_blocked_today,
          COALESCE(SUM(estimated_cost_usd) FILTER (
            WHERE created_at >= date_trunc('day', NOW())
          ), 0) AS estimated_ai_cost_today_usd
        FROM ai_routing_log
      `);

      const row = result.rows[0] || {};
      const total4oCalls = parseInt(row.ai_calls_4o_today ?? "0", 10);
      const totalMiniCalls = parseInt(row.ai_calls_mini_today ?? "0", 10);
      const totalInstantReplies = parseInt(
        row.instant_replies_today ?? "0",
        10,
      );
      const totalBlocked = parseInt(row.quota_blocked_today ?? "0", 10);
      const estimated4oCostToday = Number((total4oCalls * 0.005).toFixed(6));
      const estimatedMiniCostToday = Number(
        (totalMiniCalls * 0.000195).toFixed(6),
      );
      const totalEstimatedCostToday = Number(
        (estimated4oCostToday + estimatedMiniCostToday).toFixed(6),
      );
      const savingsVsPure4o = Number(
        (
          (total4oCalls + totalMiniCalls) * 0.005 -
          totalEstimatedCostToday
        ).toFixed(6),
      );
      return {
        total4oCalls,
        totalMiniCalls,
        totalInstantReplies,
        totalBlocked,
        estimated4oCostToday,
        estimatedMiniCostToday,
        totalEstimatedCostToday,
        savingsVsPure4o,
        aiCalls4oToday: total4oCalls,
        aiCallsMiniToday: totalMiniCalls,
        instantRepliesToday: totalInstantReplies,
        mediaRedirectsToday: parseInt(row.media_redirects_today ?? "0", 10),
        quotaBlockedToday: totalBlocked,
        estimatedAiCostTodayUsd: totalEstimatedCostToday,
      };
    } catch (error) {
      this.logger.warn("Failed to load AI routing stats", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        total4oCalls: 0,
        totalMiniCalls: 0,
        totalInstantReplies: 0,
        totalBlocked: 0,
        estimated4oCostToday: 0,
        estimatedMiniCostToday: 0,
        totalEstimatedCostToday: 0,
        savingsVsPure4o: 0,
        aiCalls4oToday: 0,
        aiCallsMiniToday: 0,
        instantRepliesToday: 0,
        mediaRedirectsToday: 0,
        quotaBlockedToday: 0,
        estimatedAiCostTodayUsd: 0,
      };
    }
  }

  private async getOrderStats(): Promise<any> {
    const paidOrderAmountExpr = this.getPaidOrderAmountExpr("o", "paid");
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(o.status::text, '')) = 'pending') as pending,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(o.status::text, '')) = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(o.status::text, '')) = 'shipped') as shipped,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(o.status::text, '')) = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(o.status::text, '')) = 'cancelled') as cancelled,
        COALESCE(SUM(${paidOrderAmountExpr}), 0) as total_revenue,
        COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '24 hours') as today
      FROM orders o
      LEFT JOIN (
        SELECT
          order_id,
          COALESCE(
            SUM(amount) FILTER (
              WHERE UPPER(COALESCE(status, 'PAID')) = 'PAID'
            ),
            0
          ) AS total_paid
        FROM order_payments
        GROUP BY order_id
      ) paid ON paid.order_id = o.id
    `);
    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      pending: parseInt(row.pending, 10),
      confirmed: parseInt(row.confirmed, 10),
      shipped: parseInt(row.shipped, 10),
      delivered: parseInt(row.delivered, 10),
      cancelled: parseInt(row.cancelled, 10),
      totalRevenue: parseFloat(row.total_revenue),
      today: parseInt(row.today, 10),
    };
  }

  private async getConversationStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE state = 'GREETING') as greeting,
        COUNT(*) FILTER (WHERE state IN ('COLLECTING_ITEMS', 'COLLECTING_VARIANTS', 'COLLECTING_CUSTOMER_INFO', 'COLLECTING_ADDRESS')) as collecting,
        COUNT(*) FILTER (WHERE state = 'NEGOTIATING') as negotiating,
        COUNT(*) FILTER (WHERE state IN ('CONFIRMING_ORDER', 'ORDER_PLACED')) as confirmed,
        COUNT(*) FILTER (WHERE state = 'CLOSED') as closed,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM conversations
    `);
    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      greeting: parseInt(row.greeting, 10),
      collecting: parseInt(row.collecting, 10),
      negotiating: parseInt(row.negotiating, 10),
      confirmed: parseInt(row.confirmed, 10),
      closed: parseInt(row.closed, 10),
      active: parseInt(row.total, 10) - parseInt(row.closed, 10),
      today: parseInt(row.today, 10),
    };
  }

  private async getMessageStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sender = 'customer') as from_customers,
        COUNT(*) FILTER (WHERE sender = 'bot') as from_bot,
        COALESCE(SUM(token_usage), 0) as total_tokens,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM messages
    `);
    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      fromCustomers: parseInt(row.from_customers, 10),
      fromBot: parseInt(row.from_bot, 10),
      totalTokens: parseInt(row.total_tokens, 10),
      today: parseInt(row.today, 10),
    };
  }

  private async getDailyOrders(): Promise<
    Array<{ name: string; orders: number }>
  > {
    const result = await this.pool.query(`
      SELECT
        TO_CHAR(day_bucket, 'Dy') as day_name,
        COUNT(o.id) as orders
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS day_bucket
      LEFT JOIN orders o
        ON DATE(o.created_at) = DATE(day_bucket)
      GROUP BY day_bucket
      ORDER BY day_bucket ASC
    `);

    return result.rows.map((row) => ({
      name: String(row.day_name || "").trim(),
      orders: parseInt(row.orders, 10),
    }));
  }

  private async getMerchantDistribution(): Promise<
    Array<{ name: string; value: number; color: string }>
  > {
    const colors = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#14b8a6",
      "#f97316",
      "#6366f1",
    ];

    const result = await this.pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(category), ''), 'UNCATEGORIZED') as category,
        COUNT(*) as total
      FROM merchants
      GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'UNCATEGORIZED')
      ORDER BY total DESC, category ASC
    `);

    return result.rows.map((row, index) => ({
      name: row.category,
      value: parseInt(row.total, 10),
      color: colors[index % colors.length],
    }));
  }

  private async getRecentDlq(): Promise<
    Array<{ id: string; type: string; merchant: string; time: string }>
  > {
    const result = await this.pool.query(`
      SELECT
        d.id,
        d.event_type,
        d.created_at,
        COALESCE(m.name, d.merchant_id, 'Unknown merchant') as merchant_name
      FROM dlq_events d
      LEFT JOIN merchants m ON m.id = d.merchant_id
      WHERE d.replayed_at IS NULL
      ORDER BY d.created_at DESC
      LIMIT 5
    `);

    return result.rows.map((row) => ({
      id: row.id,
      type: row.event_type,
      merchant: row.merchant_name,
      time: row.created_at,
    }));
  }

  private async getSystemHealthSummary(): Promise<{
    status: AdminServiceState;
    services: AdminServiceHealth[];
    lastBackupAt: string | null;
  }> {
    const [database, redis, worker, lastBackupAt] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkWorkerHealth(),
      this.getLastBackupAt(),
    ]);

    const services: AdminServiceHealth[] = [
      {
        name: "API",
        status: "healthy",
        uptime: this.formatDuration(
          Math.floor((Date.now() - this.startedAt) / 1000),
        ),
        latency: `${Math.max(1, Math.round(process.uptime() * 1000))}ms`,
      },
      database,
      redis,
      worker,
    ];

    const status = services.some((service) => service.status === "critical")
      ? "critical"
      : services.some((service) => service.status === "degraded")
        ? "degraded"
        : "healthy";

    return { status, services, lastBackupAt };
  }

  private async getLastBackupAt(): Promise<string | null> {
    try {
      const result = await this.pool.query<{ last_backup_at: Date | null }>(`
        SELECT CASE
          WHEN to_regclass('system_health_log') IS NULL THEN NULL
          ELSE (
            SELECT MAX(created_at)
            FROM system_health_log
            WHERE event_type = 'backup_completed'
          )
        END AS last_backup_at
      `);

      const value = result.rows[0]?.last_backup_at;
      return value ? new Date(value).toISOString() : null;
    } catch (error) {
      this.logger.warn("Failed to read backup timestamp for system health", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async checkDatabaseHealth(): Promise<AdminServiceHealth> {
    const start = Date.now();
    try {
      await this.pool.query("SELECT 1");
      return {
        name: "Database",
        status: "healthy",
        uptime: "connected",
        latency: `${Date.now() - start}ms`,
      };
    } catch (error) {
      return {
        name: "Database",
        status: "critical",
        uptime: "unavailable",
        latency: `${Date.now() - start}ms`,
      };
    }
  }

  private async checkRedisHealth(): Promise<AdminServiceHealth> {
    const start = Date.now();

    if (!this.redisService.enabled) {
      return {
        name: "Redis",
        status: "degraded",
        uptime: "disabled",
        latency: "n/a",
      };
    }

    try {
      await this.redisService.set("admin:health:ping", "pong", 10);
      const value = await this.redisService.get("admin:health:ping");
      if (value !== "pong") {
        throw new Error("Redis ping mismatch");
      }

      return {
        name: "Redis",
        status: "healthy",
        uptime: "connected",
        latency: `${Date.now() - start}ms`,
      };
    } catch (error) {
      return {
        name: "Redis",
        status: "critical",
        uptime: "unavailable",
        latency: `${Date.now() - start}ms`,
      };
    }
  }

  private async checkWorkerHealth(): Promise<AdminServiceHealth> {
    try {
      const result = await this.pool.query<{
        pending_events: string;
        last_activity: Date | null;
      }>(`
        SELECT
          COALESCE((
            SELECT COUNT(*)
            FROM outbox_events
            WHERE status = 'PENDING'
          ), 0) as pending_events,
          (
            SELECT MAX(activity_at)
            FROM (
              SELECT MAX(updated_at) as activity_at FROM outbox_events
              UNION ALL
              SELECT MAX(updated_at) as activity_at FROM agent_tasks
              UNION ALL
              SELECT MAX(created_at) as activity_at FROM job_failure_events
            ) activity
          ) as last_activity
      `);

      const row = result.rows[0];
      const pendingEvents = parseInt(row?.pending_events ?? "0", 10);
      const lastActivity = row?.last_activity
        ? new Date(row.last_activity)
        : null;

      if (!lastActivity) {
        return {
          name: "Worker",
          status: pendingEvents > 0 ? "degraded" : "healthy",
          uptime: "unknown",
          latency: pendingEvents > 0 ? `${pendingEvents} queued` : "idle",
        };
      }

      const ageMs = Date.now() - lastActivity.getTime();
      const ageMinutes = Math.max(0, Math.round(ageMs / 60000));
      const status: AdminServiceState =
        pendingEvents === 0 || ageMinutes <= 10
          ? "healthy"
          : ageMinutes <= 30
            ? "degraded"
            : "critical";

      return {
        name: "Worker",
        status,
        uptime: `last activity ${ageMinutes}m ago`,
        latency: pendingEvents > 0 ? `${pendingEvents} queued` : "idle",
      };
    } catch (error) {
      return {
        name: "Worker",
        status: "degraded",
        uptime: "undetectable",
        latency: "unknown",
      };
    }
  }

  private formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * BL-009: Query recent scheduled-job failures so operators (or external alerting
   * pipelines) can surface repeated failures without tailing logs.
   *
   * Returns the last N failures per job, latest first.
   * Query: GET /admin/ops/job-failures?hours=24
   */
  @Get("job-failures")
  @ApiOperation({
    summary: "List recent scheduled-job failures (BL-009)",
    description:
      "Returns failures from the job_failure_events table grouped by job name, " +
      "including occurrence count and latest error within the requested window.",
  })
  @ApiQuery({
    name: "hours",
    required: false,
    description: "Look-back window in hours (default 24)",
  })
  @ApiResponse({ status: 200, description: "Job failure summary returned" })
  async getJobFailures(@Query("hours") hoursStr?: string): Promise<{
    windowHours: number;
    jobs: Array<{
      jobName: string;
      occurrences: number;
      lastFailedAt: Date;
      lastError: string;
    }>;
  }> {
    const hours = Math.min(
      Math.max(parseInt(hoursStr ?? "24", 10) || 24, 1),
      168,
    );
    const result = await this.pool.query<{
      job_name: string;
      occurrences: string;
      last_failed_at: Date;
      last_error: string;
    }>(
      `SELECT
         job_name,
         COUNT(*)          AS occurrences,
         MAX(created_at)   AS last_failed_at,
         (ARRAY_AGG(error_message ORDER BY created_at DESC))[1] AS last_error
       FROM job_failure_events
       WHERE created_at >= NOW() - ($1 * INTERVAL '1 hour')
       GROUP BY job_name
       ORDER BY last_failed_at DESC`,
      [hours],
    );
    return {
      windowHours: hours,
      jobs: result.rows.map((r) => ({
        jobName: r.job_name,
        occurrences: parseInt(r.occurrences, 10),
        lastFailedAt: r.last_failed_at,
        lastError: r.last_error ?? "",
      })),
    };
  }
}
