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
         SUM((summary->>'totalRevenue')::numeric) as total_revenue,
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

    const result = await this.pool.query(
      `SELECT 
         m.id as merchant_id,
         m.name as merchant_name,
         COUNT(DISTINCT o.id) as orders_count,
         COALESCE(SUM(o.total), 0) as revenue,
         COUNT(DISTINCT c.id) as conversations_count,
         COUNT(DISTINCT c.id) FILTER (WHERE c.state = 'ORDER_PLACED') as converted_conversations
       FROM merchants m
       LEFT JOIN orders o ON o.merchant_id = m.id AND o.created_at >= NOW() - $1::interval
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

  // ===== PRIVATE HELPERS =====

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

  private async getOrderStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM orders
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
  }> {
    const [database, redis, worker] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkWorkerHealth(),
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

    return { status, services };
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
