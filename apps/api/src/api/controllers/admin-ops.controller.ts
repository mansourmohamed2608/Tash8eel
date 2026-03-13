import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Logger,
  UseGuards,
  Inject,
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

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly dlqService: DlqService,
    private readonly outboxService: OutboxService,
  ) {}

  // ===== METRICS =====

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
  @ApiQuery({ name: "hours", required: false, description: "Look-back window in hours (default 24)" })
  @ApiResponse({ status: 200, description: "Job failure summary returned" })
  async getJobFailures(
    @Query("hours") hoursStr?: string,
  ): Promise<{
    windowHours: number;
    jobs: Array<{
      jobName: string;
      occurrences: number;
      lastFailedAt: Date;
      lastError: string;
    }>;
  }> {
    const hours = Math.min(Math.max(parseInt(hoursStr ?? "24", 10) || 24, 1), 168);
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
