import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { NotificationsService } from "../services/notifications.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { FinanceAiService } from "../llm/finance-ai.service";

interface PeriodStats {
  merchantId: string;
  merchantName: string;
  periodType: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  totalConversations: number;
  newConversations: number;
  ordersCreated: number;
  ordersConfirmed: number;
  totalRevenue: number;
  averageOrderValue: number;
  tokenUsage: number;
  conversionRate: number;
  comparedToPrevious: {
    revenueChange: number;
    ordersChange: number;
    conversationsChange: number;
  };
  topProducts?: Array<{ name: string; quantity: number; revenue: number }>;
  deliveryStats?: {
    total: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
  };
}

/**
 * Generates weekly and monthly reports for merchants
 */
@Injectable()
export class WeeklyReportScheduler {
  private readonly logger = new Logger(WeeklyReportScheduler.name);
  private readonly weeklyLockKey = "weekly-report-scheduler-lock";
  private readonly monthlyLockKey = "monthly-report-scheduler-lock";
  private readonly lockTtl = 600000; // 10 minutes

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    private readonly financeAiService: FinanceAiService,
  ) {}

  /**
   * Run weekly report every Sunday at 9 AM Egypt time (7 AM UTC)
   */
  @Cron("0 7 * * 0", { timeZone: "UTC" })
  async generateWeeklyReports(): Promise<void> {
    const lock = await this.redisService.acquireLock(
      this.weeklyLockKey,
      this.lockTtl,
    );
    if (!lock) {
      this.logger.debug("Could not acquire weekly report lock");
      return;
    }

    try {
      // Last week: Sunday to Saturday
      const periodEnd = new Date();
      periodEnd.setHours(0, 0, 0, 0);

      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() - 7);

      this.logger.log({
        msg: "Generating weekly reports",
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });

      await this.generatePeriodicReports("weekly", periodStart, periodEnd);
    } catch (error: any) {
      this.logger.error({
        msg: "Error in weekly report scheduler",
        error: error.message,
      });
      try {
        await this.pool.query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          ["weekly-report-scheduler", error.message, error.stack ?? null],
        );
      } catch {
        /* non-fatal */
      }
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  /**
   * Run monthly report on 1st of each month at 9 AM Egypt time (7 AM UTC)
   */
  @Cron("0 7 1 * *", { timeZone: "UTC" })
  async generateMonthlyReports(): Promise<void> {
    const lock = await this.redisService.acquireLock(
      this.monthlyLockKey,
      this.lockTtl,
    );
    if (!lock) {
      this.logger.debug("Could not acquire monthly report lock");
      return;
    }

    try {
      // Last month: 1st to last day
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd.setHours(0, 0, 0, 0);

      const periodStart = new Date(periodEnd);
      periodStart.setMonth(periodStart.getMonth() - 1);

      this.logger.log({
        msg: "Generating monthly reports",
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });

      await this.generatePeriodicReports("monthly", periodStart, periodEnd);
    } catch (error: any) {
      this.logger.error({
        msg: "Error in monthly report scheduler",
        error: error.message,
      });
      try {
        await this.pool.query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          ["monthly-report-scheduler", error.message, error.stack ?? null],
        );
      } catch {
        /* non-fatal */
      }
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  private async generatePeriodicReports(
    periodType: "weekly" | "monthly",
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    // Get merchants with this report type enabled
    const merchantsResult = await this.pool.query(
      `SELECT id, name, whatsapp_reports_enabled, notification_phone
       FROM merchants 
       WHERE is_active = true 
         AND $1 = ANY(report_periods_enabled)`,
      [periodType],
    );

    for (const merchant of merchantsResult.rows) {
      try {
        const stats = await this.calculatePeriodStats(
          merchant.id,
          merchant.name,
          periodType,
          periodStart,
          periodEnd,
        );

        await this.storeReport(stats);

        // Send via WhatsApp if enabled
        if (merchant.whatsapp_reports_enabled && merchant.notification_phone) {
          // Generate AI brief (best-effort)
          let aiBrief: string | null = null;
          try {
            const briefResult = await this.financeAiService.generateCfoBrief({
              merchantId: merchant.id,
              comparison: {
                previousPeriod: {
                  totalRevenue:
                    stats.totalRevenue *
                    (1 - stats.comparedToPrevious.revenueChange / 100),
                  totalCogs: 0,
                  grossProfit: 0,
                  grossMargin: 0,
                  totalExpenses: 0,
                  netProfit: 0,
                  netMargin: 0,
                  codCollected: 0,
                  codPending: 0,
                  averageOrderValue: stats.averageOrderValue,
                  orderCount: Math.round(
                    stats.ordersCreated *
                      (1 - stats.comparedToPrevious.ordersChange / 100),
                  ),
                },
                currentPeriod: {
                  totalRevenue: stats.totalRevenue,
                  totalCogs: 0,
                  grossProfit: stats.totalRevenue * 0.4,
                  grossMargin: 40,
                  totalExpenses: 0,
                  netProfit: stats.totalRevenue * 0.25,
                  netMargin: 25,
                  codCollected: 0,
                  codPending: 0,
                  averageOrderValue: stats.averageOrderValue,
                  orderCount: stats.ordersCreated,
                },
                periodType,
              },
              topProducts: (stats.topProducts ?? []).map((p) => ({
                name: p.name,
                revenue: p.revenue,
                margin: 35,
              })),
              topExpenses: [],
            });
            if (briefResult.success && briefResult.data?.summaryAr) {
              aiBrief = `\n\n🤖 تحليل الذكاء الاصطناعي:\n${briefResult.data.summaryAr}`;
            }
          } catch {
            /* non-fatal */
          }
          await this.sendReportNotification(
            merchant.id,
            stats,
            merchant.notification_phone,
            aiBrief ?? "",
          );
        }

        this.logger.log({
          msg: `${periodType} report generated`,
          merchantId: merchant.id,
          revenue: stats.totalRevenue,
          orders: stats.ordersCreated,
        });
      } catch (error: any) {
        this.logger.error({
          msg: `Failed to generate ${periodType} report for merchant`,
          merchantId: merchant.id,
          error: error.message,
        });
      }
    }
  }

  private async calculatePeriodStats(
    merchantId: string,
    merchantName: string,
    periodType: "weekly" | "monthly",
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PeriodStats> {
    // Calculate previous period for comparison
    const periodLength = periodEnd.getTime() - periodStart.getTime();
    const prevPeriodEnd = periodStart;
    const prevPeriodStart = new Date(periodStart.getTime() - periodLength);

    // Current period stats
    const conversationsResult = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE state = 'ORDER_PLACED') as converted
       FROM conversations 
       WHERE merchant_id = $1 
         AND created_at >= $2 AND created_at < $3`,
      [merchantId, periodStart, periodEnd],
    );

    const ordersResult = await this.pool.query(
      `SELECT 
        COUNT(*) as created,
        COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'BOOKED', 'SHIPPED', 'DELIVERED')) as confirmed,
        COALESCE(SUM(total), 0) as revenue
       FROM orders 
       WHERE merchant_id = $1 
         AND created_at >= $2 AND created_at < $3`,
      [merchantId, periodStart, periodEnd],
    );

    const tokenResult = await this.pool.query(
      `SELECT COALESCE(SUM(tokens_used), 0) as total
       FROM merchant_token_usage 
       WHERE merchant_id = $1 
         AND usage_date >= $2 AND usage_date < $3`,
      [
        merchantId,
        periodStart.toISOString().split("T")[0],
        periodEnd.toISOString().split("T")[0],
      ],
    );

    // Previous period for comparison
    const prevOrdersResult = await this.pool.query(
      `SELECT 
        COUNT(*) as created,
        COALESCE(SUM(total), 0) as revenue
       FROM orders 
       WHERE merchant_id = $1 
         AND created_at >= $2 AND created_at < $3`,
      [merchantId, prevPeriodStart, prevPeriodEnd],
    );

    const prevConversationsResult = await this.pool.query(
      `SELECT COUNT(*) as total
       FROM conversations 
       WHERE merchant_id = $1 
         AND created_at >= $2 AND created_at < $3`,
      [merchantId, prevPeriodStart, prevPeriodEnd],
    );

    // Top products
    const topProductsResult = await this.pool.query(
      `SELECT 
        item->>'name' as name,
        SUM((item->>'quantity')::int) as quantity,
        SUM((item->>'unitPrice')::numeric * (item->>'quantity')::int) as revenue
       FROM orders, jsonb_array_elements(items) as item
       WHERE merchant_id = $1 
         AND created_at >= $2 AND created_at < $3
       GROUP BY item->>'name'
       ORDER BY revenue DESC
       LIMIT 5`,
      [merchantId, periodStart, periodEnd],
    );

    // Delivery stats
    const deliveryResult = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE delivery_status = 'DELIVERED') as delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'FAILED') as failed
       FROM messages 
       WHERE merchant_id = $1 
         AND direction = 'outbound'
         AND created_at >= $2 AND created_at < $3`,
      [merchantId, periodStart, periodEnd],
    );

    const currentConversations = parseInt(
      conversationsResult.rows[0].total,
      10,
    );
    const prevConversations = parseInt(
      prevConversationsResult.rows[0].total,
      10,
    );
    const currentOrders = parseInt(ordersResult.rows[0].created, 10);
    const prevOrders = parseInt(prevOrdersResult.rows[0].created, 10);
    const currentRevenue = parseFloat(ordersResult.rows[0].revenue);
    const prevRevenue = parseFloat(prevOrdersResult.rows[0].revenue);
    const deliveryTotal = parseInt(deliveryResult.rows[0].total, 10);

    return {
      merchantId,
      merchantName,
      periodType,
      periodStart: periodStart.toISOString().split("T")[0],
      periodEnd: periodEnd.toISOString().split("T")[0],
      totalConversations: currentConversations,
      newConversations: currentConversations, // All in period are "new"
      ordersCreated: currentOrders,
      ordersConfirmed: parseInt(ordersResult.rows[0].confirmed, 10),
      totalRevenue: currentRevenue,
      averageOrderValue: currentOrders > 0 ? currentRevenue / currentOrders : 0,
      tokenUsage: parseInt(tokenResult.rows[0].total, 10),
      conversionRate:
        currentConversations > 0
          ? (parseInt(conversationsResult.rows[0].converted, 10) /
              currentConversations) *
            100
          : 0,
      comparedToPrevious: {
        revenueChange:
          prevRevenue > 0
            ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
            : 0,
        ordersChange:
          prevOrders > 0
            ? ((currentOrders - prevOrders) / prevOrders) * 100
            : 0,
        conversationsChange:
          prevConversations > 0
            ? ((currentConversations - prevConversations) / prevConversations) *
              100
            : 0,
      },
      topProducts: topProductsResult.rows.map((row) => ({
        name: row.name,
        quantity: parseInt(row.quantity, 10),
        revenue: parseFloat(row.revenue),
      })),
      deliveryStats: {
        total: deliveryTotal,
        delivered: parseInt(deliveryResult.rows[0].delivered, 10),
        failed: parseInt(deliveryResult.rows[0].failed, 10),
        deliveryRate:
          deliveryTotal > 0
            ? (parseInt(deliveryResult.rows[0].delivered, 10) / deliveryTotal) *
              100
            : 100,
      },
    };
  }

  private async storeReport(stats: PeriodStats): Promise<void> {
    await this.pool.query(
      `INSERT INTO merchant_reports (merchant_id, report_date, period_type, period_start, period_end, summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (merchant_id, report_date, period_type) 
       DO UPDATE SET summary = $6`,
      [
        stats.merchantId,
        stats.periodEnd,
        stats.periodType,
        stats.periodStart,
        stats.periodEnd,
        JSON.stringify(stats),
      ],
    );
  }

  private async sendReportNotification(
    merchantId: string,
    stats: PeriodStats,
    phone: string,
    aiSuffix: string = "",
  ): Promise<void> {
    const periodLabel = stats.periodType === "weekly" ? "الأسبوعي" : "الشهري";
    const changeEmoji = (change: number) => (change >= 0 ? "📈" : "📉");

    const message = `📊 تقرير ${periodLabel}
━━━━━━━━━━━━━━━
📅 ${stats.periodStart} - ${stats.periodEnd}

💰 الإيرادات: ${stats.totalRevenue.toFixed(2)} ج.م
${changeEmoji(stats.comparedToPrevious.revenueChange)} ${stats.comparedToPrevious.revenueChange >= 0 ? "+" : ""}${stats.comparedToPrevious.revenueChange.toFixed(1)}% من الفترة السابقة

🛒 الطلبات: ${stats.ordersCreated}
${changeEmoji(stats.comparedToPrevious.ordersChange)} ${stats.comparedToPrevious.ordersChange >= 0 ? "+" : ""}${stats.comparedToPrevious.ordersChange.toFixed(1)}%

💬 المحادثات: ${stats.totalConversations}
✅ نسبة التحويل: ${stats.conversionRate.toFixed(1)}%

🚚 نسبة التوصيل: ${stats.deliveryStats?.deliveryRate.toFixed(1)}%

🏆 أفضل المنتجات:
${
  stats.topProducts
    ?.slice(0, 3)
    .map((p, i) => `${i + 1}. ${p.name}: ${p.quantity} قطعة`)
    .join("\n") || "لا توجد بيانات"
}
`;

    try {
      await this.notificationsService.sendBroadcastWhatsApp(
        phone,
        message + aiSuffix,
      );
      this.logger.log({
        msg: `${stats.periodType} report delivered via WhatsApp`,
        merchantId,
        phone: phone.slice(0, 6) + "****",
      });
    } catch (err: any) {
      this.logger.warn({
        msg: `Failed to deliver ${stats.periodType} report via WhatsApp`,
        merchantId,
        error: err.message,
      });
    }
  }

  /**
   * Get reports for a merchant with pagination
   */
  async getReports(
    merchantId: string,
    periodType?: "daily" | "weekly" | "monthly",
    limit: number = 30,
    offset: number = 0,
  ): Promise<{ reports: PeriodStats[]; total: number }> {
    const periodFilter = periodType ? `AND period_type = $4` : "";
    const params = periodType
      ? [merchantId, limit, offset, periodType]
      : [merchantId, limit, offset];

    const [reports, countResult] = await Promise.all([
      this.pool.query(
        `SELECT summary FROM merchant_reports 
         WHERE merchant_id = $1 ${periodFilter}
         ORDER BY report_date DESC
         LIMIT $2 OFFSET $3`,
        params,
      ),
      this.pool.query(
        `SELECT COUNT(*) FROM merchant_reports 
         WHERE merchant_id = $1 ${periodFilter}`,
        periodType ? [merchantId, periodType] : [merchantId],
      ),
    ]);

    return {
      reports: reports.rows.map((r) => r.summary),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /**
   * Manual trigger for testing
   */
  async generateReportForMerchant(
    merchantId: string,
    periodType: "weekly" | "monthly" = "weekly",
  ): Promise<PeriodStats> {
    const merchantResult = await this.pool.query(
      `SELECT id, name FROM merchants WHERE id = $1`,
      [merchantId],
    );

    if (merchantResult.rows.length === 0) {
      throw new Error(`Merchant ${merchantId} not found`);
    }

    const now = new Date();
    let periodStart: Date;
    const periodEnd = new Date(now);
    periodEnd.setHours(0, 0, 0, 0);

    if (periodType === "weekly") {
      periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart = new Date(periodEnd);
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    const stats = await this.calculatePeriodStats(
      merchantResult.rows[0].id,
      merchantResult.rows[0].name,
      periodType,
      periodStart,
      periodEnd,
    );

    await this.storeReport(stats);
    return stats;
  }
}
