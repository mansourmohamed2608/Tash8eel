import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { CommerceFactsService } from "./commerce-facts.service";
import { normalizeDisplayProductName } from "../../shared/utils/product-display";

export interface RecoveredCartStats {
  totalAbandoned: number;
  totalRecovered: number;
  recoveryRate: number;
  recoveredValue: number;
  averageRecoveryTime: number;
  byDay: Array<{ date: string; abandoned: number; recovered: number }>;
}

export interface DeliveryFailureStats {
  totalDeliveries: number;
  totalFailures: number;
  failureRate: number;
  failuresByReason: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  failuresByDay: Array<{ date: string; failures: number }>;
  topFailureAreas: Array<{ area: string; failures: number }>;
}

export interface AgentPerformanceStats {
  totalInteractions: number;
  totalTasks: number;
  successfulTasks: number;
  successRate: number;
  averageConfidence: number;
  totalTakeovers: number;
  takeoverRate: number;
  tokenUsage: { total: number; byAgent: Record<string, number> };
  byAgent: Array<{
    agent: string;
    tasks: number;
    successRate: number;
    avgConfidence: number;
  }>;
}

export interface RevenueKpis {
  totalRevenue: number;
  realizedRevenue?: number;
  previousPeriodRevenue: number;
  revenueChange: number;
  averageOrderValue: number;
  averageOrderValueChange?: number;
  bookedSales?: number;
  deliveredRevenue?: number;
  pendingCollections?: number;
  refundsAmount?: number;
  discountsGiven?: number;
  deliveryFeesCollected?: number;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  revenueByDay: Array<{ date: string; revenue: number }>;
  paymentMethods: Array<{ method: string; amount: number; percentage: number }>;
  pendingPayments?: number;
  codAtRisk?: number;
}

export interface CustomerKpis {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  retentionRate: number;
  avgOrdersPerCustomer?: number;
  topCustomers: Array<{
    name: string;
    phone: string;
    totalOrders: number;
    totalSpent: number;
  }>;
  customersByRegion: Array<{ region: string; count: number }>;
}

@Injectable()
export class KpiService {
  private readonly logger = new Logger(KpiService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly commerceFactsService: CommerceFactsService,
  ) {}

  private orderAmountExpr(alias: string): string {
    return `COALESCE(
      NULLIF((to_jsonb(${alias})->>'total'), '')::numeric,
      NULLIF((to_jsonb(${alias})->>'total_amount'), '')::numeric,
      0
    )`;
  }

  private orderDiscountExpr(alias: string): string {
    return `COALESCE(NULLIF((to_jsonb(${alias})->>'discount'), '')::numeric, 0)`;
  }

  private orderDeliveryFeeExpr(alias: string): string {
    return `COALESCE(NULLIF((to_jsonb(${alias})->>'delivery_fee'), '')::numeric, 0)`;
  }

  private conversationHasCartItemsSql(alias = "c"): string {
    return `jsonb_typeof(${alias}.cart->'items') = 'array' AND jsonb_array_length(${alias}.cart->'items') > 0`;
  }

  private async getEnabledAgentsForMerchant(
    merchantId: string,
  ): Promise<string[] | null> {
    try {
      const columnResult = await this.pool.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'merchants'
           AND column_name = 'enabled_agents'
         LIMIT 1`,
      );
      if (columnResult.rows.length === 0) return null;

      const merchantResult = await this.pool.query(
        `SELECT enabled_agents FROM merchants WHERE id = $1 LIMIT 1`,
        [merchantId],
      );
      const raw = merchantResult.rows[0]?.enabled_agents;
      const parsed = Array.isArray(raw) ? raw : [];
      const enabledAgents = parsed
        .map((agent) =>
          String(agent || "")
            .trim()
            .toUpperCase(),
        )
        .filter((agent) => agent.length > 0);

      if (enabledAgents.length > 0) return enabledAgents;

      // Fallback 1: active subscription plan agent list
      try {
        const subscriptionResult = await this.pool.query(
          `SELECT bp.agents, bp.code as plan_code
           FROM merchant_subscriptions ms
           JOIN billing_plans bp ON bp.id = ms.plan_id
           WHERE ms.merchant_id = $1
           ORDER BY
             CASE ms.status
               WHEN 'ACTIVE' THEN 0
               WHEN 'PENDING' THEN 1
               ELSE 2
             END,
             ms.created_at DESC
           LIMIT 1`,
          [merchantId],
        );

        const planAgents = subscriptionResult.rows[0]?.agents;
        const normalizedPlanAgents = (
          Array.isArray(planAgents) ? planAgents : []
        )
          .map((agent: unknown) =>
            String(agent || "")
              .trim()
              .toUpperCase(),
          )
          .filter((agent: string) => agent.length > 0);

        if (normalizedPlanAgents.length > 0) return normalizedPlanAgents;
      } catch {
        // Non-fatal: continue with merchant plan fallback.
      }

      // Fallback 2: plan-based defaults to avoid showing unavailable agents in KPIs.
      const planResult = await this.pool.query(
        `SELECT COALESCE(plan, 'STARTER') as plan FROM merchants WHERE id = $1 LIMIT 1`,
        [merchantId],
      );
      const merchantPlan = String(
        planResult.rows[0]?.plan || "STARTER",
      ).toUpperCase();
      const defaults: Record<string, string[]> = {
        STARTER: ["OPS_AGENT"],
        PRO: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
        GROWTH: [
          "OPS_AGENT",
          "INVENTORY_AGENT",
          "FINANCE_AGENT",
          "MARKETING_AGENT",
          "SUPPORT_AGENT",
        ],
        ENTERPRISE: [
          "OPS_AGENT",
          "INVENTORY_AGENT",
          "FINANCE_AGENT",
          "MARKETING_AGENT",
          "SUPPORT_AGENT",
          "CONTENT_AGENT",
          "SALES_AGENT",
          "CREATIVE_AGENT",
        ],
      };
      return defaults[merchantPlan] || defaults.STARTER;
    } catch {
      return null;
    }
  }

  private getValidOrderStatusSql(alias = "o"): string {
    return `UPPER(COALESCE(${alias}.status::text, '')) NOT IN ('CANCELLED', 'DRAFT', 'FAILED', 'RETURNED')`;
  }

  private getRealizedOrderStatusSql(alias = "o"): string {
    return `UPPER(COALESCE(${alias}.status::text, '')) IN ('DELIVERED', 'COMPLETED')`;
  }

  private getPaidOrderAmountExpr(orderAlias = "o", paidAlias = "paid"): string {
    const amountExpr = this.orderAmountExpr(orderAlias);
    return `LEAST(
      ${amountExpr},
      GREATEST(
        COALESCE(
          ${paidAlias}.total_paid,
          CASE
            WHEN UPPER(
              COALESCE(
                NULLIF(to_jsonb(${orderAlias})->>'payment_status', ''),
                'PENDING'
              )
            ) = 'PAID'
            THEN ${amountExpr}
            ELSE 0
          END
        ),
        0
      )
    )`;
  }

  private normalizeProductName(name?: string | null): string {
    return normalizeDisplayProductName(name, "منتج");
  }

  private resolveKpiDays(days: number): number {
    const parsed = Number(days);
    const normalized = Number.isFinite(parsed)
      ? Math.max(1, Math.min(Math.trunc(parsed), 365))
      : 30;

    // "this year" option should be year-to-date days, not a fixed 365-day rolling window.
    if (normalized === 365) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const dayMs = 24 * 60 * 60 * 1000;
      const ytdDays =
        Math.floor((today.getTime() - yearStart.getTime()) / dayMs) + 1;
      return Math.max(1, Math.min(ytdDays, 365));
    }

    return normalized;
  }

  private getKpiPeriodWindow(days: number): {
    daysBack: number;
    startDate: Date;
    endDate: Date;
    previousStartDate: Date;
    previousEndDate: Date;
  } {
    const daysBack = this.resolveKpiDays(days);
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (daysBack - 1));

    const previousEndDate = new Date(startDate);
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - daysBack);

    return {
      daysBack,
      startDate,
      endDate,
      previousStartDate,
      previousEndDate,
    };
  }

  /**
   * Get cart recovery statistics
   */
  async getRecoveredCartStats(
    merchantId: string,
    days: number = 30,
  ): Promise<RecoveredCartStats> {
    const fallback: RecoveredCartStats = {
      totalAbandoned: 0,
      totalRecovered: 0,
      recoveryRate: 0,
      recoveredValue: 0,
      averageRecoveryTime: 0,
      byDay: [],
    };

    try {
      const { startDate, endDate } = this.getKpiPeriodWindow(days);
      const amountExpr = this.orderAmountExpr("o");

      // Get abandoned carts (conversations that had cart items but no finalized order)
      const abandonedResult = await this.pool.query(
        `
      SELECT 
        COUNT(*) FILTER (WHERE ${this.conversationHasCartItemsSql("c")} AND NOT EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.conversation_id = c.id
            AND ${this.getValidOrderStatusSql("o")}
        )) as abandoned,
        COUNT(*) FILTER (WHERE ${this.conversationHasCartItemsSql("c")} AND EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.conversation_id = c.id
            AND ${this.getValidOrderStatusSql("o")}
        )) as converted,
        COALESCE(SUM(
          CASE WHEN EXISTS (
            SELECT 1
            FROM orders o
            WHERE o.conversation_id = c.id
              AND ${this.getValidOrderStatusSql("o")}
          )
          THEN (
            SELECT COALESCE(SUM(${amountExpr}), 0)
            FROM orders o
            WHERE o.conversation_id = c.id
              AND ${this.getValidOrderStatusSql("o")}
          )
          ELSE 0 END
        ), 0) as recovered_revenue
      FROM conversations c
      WHERE c.merchant_id = $1 
        AND c.created_at >= $2
        AND c.created_at <= $3
        AND ${this.conversationHasCartItemsSql("c")}
    `,
        [merchantId, startDate, endDate],
      );

      // Get daily breakdown
      const dailyResult = await this.pool.query(
        `
      SELECT 
        DATE(c.created_at) as date,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.conversation_id = c.id
            AND ${this.getValidOrderStatusSql("o")}
        )) as abandoned,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.conversation_id = c.id
            AND ${this.getValidOrderStatusSql("o")}
        )) as recovered
      FROM conversations c
      WHERE c.merchant_id = $1 
        AND c.created_at >= $2
        AND c.created_at <= $3
        AND ${this.conversationHasCartItemsSql("c")}
      GROUP BY DATE(c.created_at)
      ORDER BY date DESC
      LIMIT 30
    `,
        [merchantId, startDate, endDate],
      );

      // Average recovery time (hours) from conversation start to order creation
      const avgTimeResult = await this.pool.query(
        `
      SELECT AVG(EXTRACT(EPOCH FROM (o.created_at - c.created_at)) / 3600) as avg_hours
      FROM conversations c
      JOIN orders o
        ON o.conversation_id = c.id
       AND ${this.getValidOrderStatusSql("o")}
      WHERE c.merchant_id = $1 
        AND c.created_at >= $2
        AND c.created_at <= $3
        AND ${this.conversationHasCartItemsSql("c")}
    `,
        [merchantId, startDate, endDate],
      );

      const abandoned = parseInt(abandonedResult.rows[0]?.abandoned || "0", 10);
      const recovered = parseInt(abandonedResult.rows[0]?.converted || "0", 10);
      const total = abandoned + recovered;
      const avgHours = parseFloat(avgTimeResult.rows[0]?.avg_hours || "0");

      return {
        totalAbandoned: abandoned,
        totalRecovered: recovered,
        recoveryRate: total > 0 ? (recovered / total) * 100 : 0,
        recoveredValue: parseFloat(
          abandonedResult.rows[0]?.recovered_revenue || "0",
        ),
        averageRecoveryTime: Math.round(avgHours * 10) / 10,
        byDay: dailyResult.rows.map((r) => ({
          date: r.date.toISOString().split("T")[0],
          abandoned: parseInt(r.abandoned, 10),
          recovered: parseInt(r.recovered, 10),
        })),
      };
    } catch (error: any) {
      if (this.isSchemaMissing(error)) {
        this.logger.warn(`KPIs: recovered carts unavailable (${error?.code}).`);
        return fallback;
      }
      throw error;
    }
  }

  /**
   * Get delivery failure statistics
   */
  async getDeliveryFailureStats(
    merchantId: string,
    days: number = 30,
  ): Promise<DeliveryFailureStats> {
    const fallback: DeliveryFailureStats = {
      totalDeliveries: 0,
      totalFailures: 0,
      failureRate: 0,
      failuresByReason: [],
      failuresByDay: [],
      topFailureAreas: [],
    };

    try {
      const { startDate, endDate } = this.getKpiPeriodWindow(days);

      const statusExpr = `UPPER(COALESCE(o.status::text, ''))`;
      const failedStatusExpr = `${statusExpr} IN ('CANCELLED', 'RETURNED', 'FAILED')`;
      const deliveryTrackedStatusExpr = `${statusExpr} IN ('BOOKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED', 'FAILED')`;
      const reasonExpr = `COALESCE(
      NULLIF(to_jsonb(o)->>'delivery_failure_reason', ''),
      NULLIF(to_jsonb(o)->>'deliveryFailureReason', ''),
      NULLIF(to_jsonb(o)->>'cancel_reason', ''),
      NULLIF(to_jsonb(o)->>'cancelReason', ''),
      NULLIF(to_jsonb(o)->>'cancellation_reason', ''),
      NULLIF(to_jsonb(o)->>'cancellationReason', ''),
      'غير محدد'
    )`;
      const areaExpr = `COALESCE(
      NULLIF((to_jsonb(o)->'delivery_address'->>'area'), ''),
      NULLIF((to_jsonb(o)->'delivery_address'->>'city'), ''),
      NULLIF(to_jsonb(o)->>'delivery_area', ''),
      NULLIF(to_jsonb(o)->>'area', ''),
      'غير محدد'
    )`;

      // Delivery KPI should align with orders/dashboard status logic (not shipments-only).
      const statsResult = await this.pool.query(
        `
      SELECT
        COUNT(*) FILTER (WHERE ${deliveryTrackedStatusExpr}) as total,
        COUNT(*) FILTER (WHERE ${failedStatusExpr}) as failed
      FROM orders o
      WHERE o.merchant_id = $1
        AND o.created_at >= $2
        AND o.created_at <= $3
        AND ${statusExpr} <> 'DRAFT'
    `,
        [merchantId, startDate, endDate],
      );

      const reasonsResult = await this.pool.query(
        `
      SELECT
        ${reasonExpr} as reason,
        COUNT(*) as count
      FROM orders o
      WHERE o.merchant_id = $1
        AND o.created_at >= $2
        AND o.created_at <= $3
        AND ${failedStatusExpr}
      GROUP BY ${reasonExpr}
      ORDER BY count DESC
      LIMIT 10
    `,
        [merchantId, startDate, endDate],
      );

      const dailyResult = await this.pool.query(
        `
      SELECT
        DATE(o.created_at) as date,
        COUNT(*) FILTER (WHERE ${deliveryTrackedStatusExpr}) as total,
        COUNT(*) FILTER (WHERE ${failedStatusExpr}) as failed
      FROM orders o
      WHERE o.merchant_id = $1
        AND o.created_at >= $2
        AND o.created_at <= $3
        AND ${statusExpr} <> 'DRAFT'
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC
      LIMIT 30
    `,
        [merchantId, startDate, endDate],
      );

      const topAreasResult = await this.pool.query(
        `
      SELECT
        ${areaExpr} as area,
        COUNT(*) as failures
      FROM orders o
      WHERE o.merchant_id = $1
        AND o.created_at >= $2
        AND o.created_at <= $3
        AND ${failedStatusExpr}
      GROUP BY ${areaExpr}
      ORDER BY failures DESC
      LIMIT 5
    `,
        [merchantId, startDate, endDate],
      );

      const total = parseInt(statsResult.rows[0]?.total || "0", 10);
      const failed = parseInt(statsResult.rows[0]?.failed || "0", 10);

      return {
        totalDeliveries: total,
        totalFailures: failed,
        failureRate: total > 0 ? (failed / total) * 100 : 0,
        failuresByReason: reasonsResult.rows.map((r) => ({
          reason: r.reason,
          count: parseInt(r.count, 10),
          percentage: failed > 0 ? (parseInt(r.count, 10) / failed) * 100 : 0,
        })),
        failuresByDay: dailyResult.rows.map((r) => ({
          date: r.date.toISOString().split("T")[0],
          failures: parseInt(r.failed, 10),
        })),
        topFailureAreas: topAreasResult.rows.map((r) => ({
          area: r.area,
          failures: parseInt(r.failures, 10),
        })),
      };
    } catch (error: any) {
      if (this.isSchemaMissing(error)) {
        this.logger.warn(
          `KPIs: delivery failures unavailable (${error?.code}).`,
        );
        return fallback;
      }
      throw error;
    }
  }

  /**
   * Get agent performance statistics
   */
  async getAgentPerformanceStats(
    merchantId: string,
    days: number = 30,
  ): Promise<AgentPerformanceStats> {
    const fallback: AgentPerformanceStats = {
      totalInteractions: 0,
      totalTasks: 0,
      successfulTasks: 0,
      successRate: 0,
      averageConfidence: 0,
      totalTakeovers: 0,
      takeoverRate: 0,
      tokenUsage: { total: 0, byAgent: {} },
      byAgent: [],
    };

    try {
      const { startDate, endDate } = this.getKpiPeriodWindow(days);

      const enabledAgents = await this.getEnabledAgentsForMerchant(merchantId);
      const hasAgentFilter =
        Array.isArray(enabledAgents) && enabledAgents.length > 0;
      const enabledAgentSet = new Set(
        (enabledAgents || []).map((a) => String(a).toUpperCase()),
      );

      // Get human takeover stats (conversations)
      const overallResult = await this.pool.query(
        `
        SELECT 
          COUNT(*) as total_interactions,
          COUNT(*) FILTER (WHERE human_takeover = true) as takeovers
        FROM conversations
        WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
      `,
        [merchantId, startDate, endDate],
      );

      // Get agent task stats
      const agentResult = await this.pool.query(
        `
        SELECT 
          agent_type,
          COUNT(*) as tasks,
          COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed
        FROM agent_tasks
        WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
        GROUP BY agent_type
      `,
        [merchantId, startDate, endDate],
      );

      // Get token usage (total)
      const tokenResult = await this.pool.query(
        `
        SELECT 
          COALESCE(SUM(tokens_used), 0) as tokens_used
        FROM merchant_token_usage
        WHERE merchant_id = $1 AND usage_date >= $2::date AND usage_date <= $3::date
      `,
        [merchantId, startDate, endDate],
      );

      // Token usage by agent (from task results)
      const tokenByAgentResult = await this.pool.query(
        `
        SELECT 
          t.agent_type as agent,
          COALESCE(SUM(r.tokens_used), 0) as tokens
        FROM agent_results r
        JOIN agent_tasks t ON t.id = r.task_id
        WHERE t.merchant_id = $1 AND r.created_at >= $2 AND r.created_at <= $3
        GROUP BY t.agent_type
      `,
        [merchantId, startDate, endDate],
      );

      // Confidence by agent from AI decision logs (0-1 or 0-100 stored values).
      let confidenceByAgentResult: {
        rows: Array<{ agent: string; avg_confidence: string; samples: string }>;
      } = {
        rows: [],
      };
      try {
        confidenceByAgentResult = await this.pool.query<{
          agent: string;
          avg_confidence: string;
          samples: string;
        }>(
          `SELECT
             agent_type as agent,
             COALESCE(
               AVG(
                 CASE
                   WHEN confidence IS NULL THEN NULL
                   WHEN confidence > 1 THEN confidence
                   ELSE confidence * 100
                 END
               ),
               0
             ) as avg_confidence,
             COUNT(*) FILTER (WHERE confidence IS NOT NULL) as samples
           FROM ai_decision_log
           WHERE merchant_id = $1
             AND created_at >= $2
             AND created_at <= $3
           GROUP BY agent_type`,
          [merchantId, startDate, endDate],
        );
      } catch (error: any) {
        if (!this.isSchemaMissing(error)) {
          throw error;
        }
      }

      const totalInteractions = parseInt(
        overallResult.rows[0]?.total_interactions || "0",
        10,
      );
      const takeovers = parseInt(overallResult.rows[0]?.takeovers || "0", 10);
      const filteredAgentRows = hasAgentFilter
        ? agentResult.rows.filter((row) =>
            enabledAgentSet.has(String(row.agent_type || "").toUpperCase()),
          )
        : agentResult.rows;
      const filteredTokenRows = hasAgentFilter
        ? tokenByAgentResult.rows.filter((row) =>
            enabledAgentSet.has(String(row.agent || "").toUpperCase()),
          )
        : tokenByAgentResult.rows;
      const filteredConfidenceRows = hasAgentFilter
        ? confidenceByAgentResult.rows.filter((row) =>
            enabledAgentSet.has(String(row.agent || "").toUpperCase()),
          )
        : confidenceByAgentResult.rows;

      const confidenceByAgent = filteredConfidenceRows.reduce(
        (acc, row) => {
          acc[String(row.agent || "").toUpperCase()] =
            parseFloat(row.avg_confidence) || 0;
          return acc;
        },
        {} as Record<string, number>,
      );
      const confidenceSamplesByAgent = filteredConfidenceRows.reduce(
        (acc, row) => {
          acc[String(row.agent || "").toUpperCase()] =
            parseInt(row.samples, 10) || 0;
          return acc;
        },
        {} as Record<string, number>,
      );
      const confidenceSamples = filteredConfidenceRows.reduce(
        (sum, row) => sum + (parseInt(row.samples, 10) || 0),
        0,
      );
      const weightedConfidence = filteredConfidenceRows.reduce((sum, row) => {
        const samples = parseInt(row.samples, 10) || 0;
        const avg = parseFloat(row.avg_confidence) || 0;
        return sum + avg * samples;
      }, 0);
      const derivedTaskRows = (
        filteredAgentRows.length > 0
          ? filteredAgentRows.map((row) => ({
              agent: String(row.agent_type || ""),
              tasks: parseInt(row.tasks, 10) || 0,
              completed: parseInt(row.completed, 10) || 0,
            }))
          : filteredConfidenceRows.map((row) => {
              const samples = parseInt(row.samples, 10) || 0;
              const avg = parseFloat(row.avg_confidence) || 0;
              return {
                agent: String(row.agent || ""),
                tasks: samples,
                completed: Math.round((avg * samples) / 100),
              };
            })
      ).filter((row) => row.agent && row.tasks > 0);
      const totalTasks = derivedTaskRows.reduce(
        (sum, row) => sum + row.tasks,
        0,
      );
      const completedTasks = derivedTaskRows.reduce(
        (sum, row) => sum + row.completed,
        0,
      );
      const tokensUsed = hasAgentFilter
        ? filteredTokenRows.reduce(
            (sum, row) => sum + (parseInt(row.tokens, 10) || 0),
            0,
          )
        : parseInt(tokenResult.rows[0]?.tokens_used || "0", 10);
      // Fall back to task success when confidence samples are unavailable.
      const averageConfidence =
        confidenceSamples > 0
          ? weightedConfidence / confidenceSamples
          : totalTasks > 0
            ? (completedTasks / totalTasks) * 100
            : 0;

      const tokenUsageByAgent = filteredTokenRows.reduce(
        (acc, row) => {
          acc[String(row.agent || "").toUpperCase()] =
            parseInt(row.tokens, 10) || 0;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        totalInteractions,
        totalTasks,
        successfulTasks: completedTasks,
        successRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        averageConfidence,
        totalTakeovers: takeovers,
        takeoverRate:
          totalInteractions > 0 ? (takeovers / totalInteractions) * 100 : 0,
        tokenUsage: {
          total: tokensUsed,
          byAgent: tokenUsageByAgent,
        },
        byAgent: derivedTaskRows.map((row) => {
          const tasks = row.tasks;
          const completed = row.completed;
          const agentKey = String(row.agent);
          const confidenceKey = agentKey.toUpperCase();
          const successRate = tasks > 0 ? (completed / tasks) * 100 : 0;
          const hasConfidenceSamples =
            (confidenceSamplesByAgent[confidenceKey] || 0) > 0;
          return {
            agent: agentKey,
            tasks,
            successRate,
            avgConfidence: hasConfidenceSamples
              ? (confidenceByAgent[confidenceKey] ?? 0)
              : successRate,
          };
        }),
      };
    } catch (error: any) {
      if (
        this.isSchemaMissing(error) ||
        this.isAgentTypeComparisonError(error)
      ) {
        this.logger.warn(
          `KPIs: agent performance unavailable (${error?.code}).`,
        );
        return fallback;
      }
      throw error;
    }
  }

  /**
   * Get revenue KPIs
   */
  async getRevenueKpis(
    merchantId: string,
    days: number = 30,
  ): Promise<RevenueKpis> {
    const fallback: RevenueKpis = {
      totalRevenue: 0,
      realizedRevenue: 0,
      previousPeriodRevenue: 0,
      revenueChange: 0,
      averageOrderValue: 0,
      averageOrderValueChange: 0,
      bookedSales: 0,
      deliveredRevenue: 0,
      pendingCollections: 0,
      refundsAmount: 0,
      discountsGiven: 0,
      deliveryFeesCollected: 0,
      topProducts: [],
      revenueByDay: [],
      paymentMethods: [],
      pendingPayments: 0,
      codAtRisk: 0,
    };

    try {
      const { startDate, endDate, previousStartDate, previousEndDate } =
        this.getKpiPeriodWindow(days);
      const amountExpr = this.orderAmountExpr("o");
      const discountExpr = this.orderDiscountExpr("o");
      const deliveryFeeExpr = this.orderDeliveryFeeExpr("o");
      const paidAmountExpr = this.getPaidOrderAmountExpr("o", "paid");

      // Current period revenue
      const currentResult = await this.pool.query(
        `
        WITH order_finance AS (
          SELECT
            ${amountExpr} AS order_total,
            ${discountExpr} AS discount_total,
            ${deliveryFeeExpr} AS delivery_fee_total,
            ${paidAmountExpr} AS realized_amount,
            GREATEST(${amountExpr} - ${paidAmountExpr}, 0) AS outstanding_amount,
            CASE WHEN ${this.getValidOrderStatusSql("o")} THEN 1 ELSE 0 END AS is_valid_order,
            CASE WHEN ${this.getRealizedOrderStatusSql("o")} THEN 1 ELSE 0 END AS is_delivered_order
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
            WHERE merchant_id = $1
            GROUP BY order_id
          ) paid ON paid.order_id = o.id
          WHERE o.merchant_id = $1
            AND o.created_at >= $2
            AND o.created_at <= $3
        )
        SELECT
          COALESCE(SUM(realized_amount), 0) as revenue,
          COUNT(*) FILTER (WHERE realized_amount > 0) as orders,
          COALESCE(AVG(NULLIF(realized_amount, 0)), 0) as avg_order,
          COALESCE(SUM(discount_total) FILTER (WHERE is_valid_order = 1), 0) as discounts,
          COALESCE(SUM(delivery_fee_total) FILTER (WHERE realized_amount > 0), 0) as delivery_fees,
          COALESCE(SUM(order_total) FILTER (WHERE is_valid_order = 1), 0) as booked_sales,
          COALESCE(SUM(order_total) FILTER (WHERE is_delivered_order = 1), 0) as delivered_revenue,
          COALESCE(SUM(outstanding_amount) FILTER (WHERE is_valid_order = 1), 0) as pending_collections
        FROM order_finance
      `,
        [merchantId, startDate, endDate],
      );

      // Previous period for comparison
      const prevResult = await this.pool.query(
        `
        WITH order_finance AS (
          SELECT
            ${paidAmountExpr} AS realized_amount
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
            WHERE merchant_id = $1
            GROUP BY order_id
          ) paid ON paid.order_id = o.id
          WHERE o.merchant_id = $1
            AND o.created_at >= $2
            AND o.created_at < $3
        )
        SELECT
          COALESCE(SUM(realized_amount), 0) as revenue,
          COALESCE(AVG(NULLIF(realized_amount, 0)), 0) as avg_order
        FROM order_finance
      `,
        [merchantId, previousStartDate, previousEndDate],
      );

      // Top products
      const topProductsResult = await this.pool.query(
        `
        SELECT
          COALESCE(
            NULLIF(ci.name_ar, ''),
            NULLIF(ci.name_en, ''),
            NULLIF(item->>'name', ''),
            NULLIF(item->>'productName', ''),
            'منتج'
          ) as name,
          SUM(
            COALESCE(NULLIF(item->>'price', '')::decimal, NULLIF(item->>'unitPrice', '')::decimal, 0)
            *
            COALESCE(NULLIF(item->>'quantity', '')::int, NULLIF(item->>'qty', '')::int, 1)
          ) as revenue,
          SUM(COALESCE(NULLIF(item->>'quantity', '')::int, NULLIF(item->>'qty', '')::int, 1)) as quantity
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items) as item
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
          WHERE merchant_id = $1
          GROUP BY order_id
        ) paid ON paid.order_id = o.id
        LEFT JOIN catalog_items ci
          ON ci.merchant_id = o.merchant_id
         AND ci.id::text = COALESCE(
           NULLIF(item->>'productId', ''),
           NULLIF(item->>'itemId', ''),
           NULLIF(item->>'catalogItemId', '')
         )
        WHERE o.merchant_id = $1 
          AND o.created_at >= $2
          AND o.created_at <= $3
          AND (
            ${paidAmountExpr} > 0
            OR ${this.getRealizedOrderStatusSql("o")}
          )
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 10
      `,
        [merchantId, startDate, endDate],
      );

      // Revenue by payment method
      const paymentMethodResult = await this.pool.query(
        `
        SELECT
          method,
          COALESCE(SUM(amount), 0) as amount,
          COUNT(*) as count
        FROM (
          SELECT
            COALESCE(NULLIF(op.method, ''), NULLIF(to_jsonb(o)->>'payment_method', ''), 'COD') as method,
            CASE
              WHEN op.id IS NOT NULL
                   AND UPPER(COALESCE(op.status, 'PAID')) = 'PAID'
              THEN op.amount
              WHEN op.id IS NULL
                   AND UPPER(COALESCE(NULLIF(to_jsonb(o)->>'payment_status', ''), 'PENDING')) = 'PAID'
              THEN ${amountExpr}
              ELSE 0
            END as amount
          FROM orders o
          LEFT JOIN order_payments op
            ON op.order_id = o.id
           AND op.merchant_id = o.merchant_id
          WHERE o.merchant_id = $1
            AND o.created_at >= $2
            AND o.created_at <= $3
        ) payments
        WHERE amount > 0
        GROUP BY method
      `,
        [merchantId, startDate, endDate],
      );

      // Pending and at-risk payments
      const pendingResult = await this.pool.query(
        `
        SELECT 
          COALESCE(
            SUM(
              CASE
                WHEN ${this.getRealizedOrderStatusSql("o")}
                     AND UPPER(COALESCE(NULLIF(to_jsonb(o)->>'payment_status', ''), 'PENDING')) IN ('PENDING', 'INITIATED', 'PROCESSING', 'UNPAID')
                THEN ${amountExpr}
                ELSE 0
              END
            ),
            0
          ) as pending,
          COALESCE(
            SUM(
              CASE
                WHEN UPPER(COALESCE(NULLIF(to_jsonb(o)->>'payment_method', ''), '')) IN ('COD', 'CASH')
                     AND UPPER(COALESCE(o.status::text, '')) IN ('SHIPPED', 'OUT_FOR_DELIVERY')
                THEN ${amountExpr}
                ELSE 0
              END
            ),
            0
          ) as cod_at_risk
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
          WHERE merchant_id = $1
          GROUP BY order_id
        ) paid ON paid.order_id = o.id
        WHERE o.merchant_id = $1
          AND o.created_at >= $2
          AND o.created_at <= $3
          AND UPPER(COALESCE(o.status::text, '')) <> 'DRAFT'
      `,
        [merchantId, startDate, endDate],
      );

      const [currentSnapshot, previousSnapshot] = await Promise.all([
        this.commerceFactsService.buildFinanceSummary(
          merchantId,
          startDate,
          endDate,
        ),
        this.commerceFactsService.buildFinanceSummary(
          merchantId,
          previousStartDate,
          previousEndDate,
        ),
      ]);

      const currentRevenue = currentSnapshot.realizedRevenue;
      const prevRevenue = previousSnapshot.realizedRevenue;
      const currentAvg =
        currentSnapshot.averageOrderValue ||
        parseFloat(currentResult.rows[0]?.avg_order || "0");
      const prevAvg =
        previousSnapshot.averageOrderValue ||
        parseFloat(prevResult.rows[0]?.avg_order || "0");

      const revenueByDayResult = await this.pool.query(
        `
        SELECT
          DATE(o.created_at) as date,
          COALESCE(SUM(${paidAmountExpr}), 0) as revenue
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
          WHERE merchant_id = $1
          GROUP BY order_id
        ) paid ON paid.order_id = o.id
        WHERE o.merchant_id = $1 
          AND o.created_at >= $2
          AND o.created_at <= $3
          AND ${paidAmountExpr} > 0
        GROUP BY DATE(o.created_at)
        ORDER BY date ASC
      `,
        [merchantId, startDate, endDate],
      );

      return {
        totalRevenue: currentRevenue,
        realizedRevenue: currentRevenue,
        previousPeriodRevenue: prevRevenue,
        revenueChange:
          prevRevenue > 0
            ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
            : 0,
        averageOrderValue: currentAvg,
        averageOrderValueChange:
          prevAvg > 0 ? ((currentAvg - prevAvg) / prevAvg) * 100 : 0,
        bookedSales: currentSnapshot.bookedSales,
        deliveredRevenue: currentSnapshot.deliveredRevenue,
        pendingCollections: currentSnapshot.pendingCollections,
        refundsAmount: currentSnapshot.refundsAmount,
        discountsGiven: parseFloat(currentResult.rows[0]?.discounts || "0"),
        deliveryFeesCollected: parseFloat(
          currentResult.rows[0]?.delivery_fees || "0",
        ),
        topProducts: topProductsResult.rows.map((r) => ({
          name: this.normalizeProductName(r.name),
          revenue: parseFloat(r.revenue),
          quantity: parseInt(r.quantity, 10),
        })),
        revenueByDay: revenueByDayResult.rows.map((r) => ({
          date: r.date.toISOString().split("T")[0],
          revenue: parseFloat(r.revenue),
        })),
        paymentMethods: paymentMethodResult.rows.map((r) => {
          const amount = parseFloat(r.amount);
          return {
            method: r.method,
            amount,
            percentage:
              currentRevenue > 0 ? (amount / currentRevenue) * 100 : 0,
          };
        }),
        pendingPayments: parseFloat(pendingResult.rows[0]?.pending || "0"),
        codAtRisk: parseFloat(pendingResult.rows[0]?.cod_at_risk || "0"),
      };
    } catch (error: any) {
      if (this.isSchemaMissing(error)) {
        this.logger.warn(`KPIs: revenue unavailable (${error?.code}).`);
        return fallback;
      }
      throw error;
    }
  }

  /**
   * Get customer KPIs
   */
  async getCustomerKpis(
    merchantId: string,
    days: number = 30,
  ): Promise<CustomerKpis> {
    const fallback: CustomerKpis = {
      totalCustomers: 0,
      newCustomers: 0,
      returningCustomers: 0,
      retentionRate: 0,
      avgOrdersPerCustomer: 0,
      topCustomers: [],
      customersByRegion: [],
    };

    try {
      const { startDate, endDate } = this.getKpiPeriodWindow(days);
      const amountExpr = this.orderAmountExpr("o");

      // Use order-backed customer identity to keep totals/new/returning mutually consistent.
      const statsResult = await this.pool.query(
        `
        WITH normalized_orders AS (
          SELECT
            o.created_at,
            COALESCE(
              NULLIF(o.customer_id::text, ''),
              NULLIF(regexp_replace(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), '')
            ) as customer_key
          FROM orders o
          WHERE o.merchant_id = $1
            AND ${this.getValidOrderStatusSql("o")}
        ),
        period_customers AS (
          SELECT DISTINCT customer_key
          FROM normalized_orders
          WHERE created_at >= $2
            AND created_at <= $3
            AND customer_key IS NOT NULL
        ),
        first_orders AS (
          SELECT customer_key, MIN(created_at) as first_order_at
          FROM normalized_orders
          WHERE customer_key IS NOT NULL
          GROUP BY customer_key
        )
        SELECT
          (SELECT COUNT(*) FROM period_customers)::int as total,
          (
            SELECT COUNT(*)
            FROM period_customers pc
            JOIN first_orders fo ON fo.customer_key = pc.customer_key
            WHERE fo.first_order_at >= $2
              AND fo.first_order_at <= $3
          )::int as new_customers,
          (
            SELECT COUNT(*)
            FROM period_customers pc
            JOIN first_orders fo ON fo.customer_key = pc.customer_key
            WHERE fo.first_order_at < $2
          )::int as returning
      `,
        [merchantId, startDate, endDate],
      );

      // Avg successful orders per active customer in the selected period.
      const avgResult = await this.pool.query(
        `
        WITH normalized_orders AS (
          SELECT
            o.created_at,
            COALESCE(
              NULLIF(o.customer_id::text, ''),
              NULLIF(regexp_replace(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), '')
            ) as customer_key
          FROM orders o
          WHERE o.merchant_id = $1
            AND ${this.getValidOrderStatusSql("o")}
        ),
        order_counts AS (
          SELECT
            customer_key,
            COUNT(*)::float as valid_orders
          FROM normalized_orders
          WHERE created_at >= $2
            AND created_at <= $3
            AND customer_key IS NOT NULL
          GROUP BY customer_key
        )
        SELECT COALESCE(AVG(valid_orders), 0) as avg_orders
        FROM order_counts`,
        [merchantId, startDate, endDate],
      );

      // Top customers by realized revenue in selected period.
      const topResult = await this.pool.query(
        `
        WITH period_orders AS (
          SELECT
            COALESCE(
              NULLIF(o.customer_id::text, ''),
              NULLIF(regexp_replace(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), '')
            ) as customer_key,
            MAX(NULLIF(o.customer_name, '')) as order_name,
            MAX(NULLIF(o.customer_phone, '')) as order_phone,
            COUNT(*) as orders,
            COALESCE(SUM(${amountExpr}), 0) as revenue
          FROM orders o
          WHERE o.merchant_id = $1
            AND o.created_at >= $2
            AND o.created_at <= $3
            AND ${this.getValidOrderStatusSql("o")}
          GROUP BY COALESCE(
            NULLIF(o.customer_id::text, ''),
            NULLIF(regexp_replace(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), '')
          )
        )
        SELECT
          COALESCE(c.name, p.order_name, 'Unknown') as name,
          COALESCE(c.phone, p.order_phone, '') as phone,
          p.orders,
          p.revenue
        FROM period_orders p
        LEFT JOIN customers c
          ON c.merchant_id = $1
         AND (
           c.id::text = p.customer_key
           OR regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = p.customer_key
         )
        WHERE p.customer_key IS NOT NULL
        ORDER BY p.revenue DESC, p.orders DESC
        LIMIT 10
      `,
        [merchantId, startDate, endDate],
      );

      // Customers by area (same active customer set in selected period).
      const areaResult = await this.pool.query(
        `
        WITH period_orders AS (
          SELECT
            COALESCE(
              NULLIF(o.customer_id::text, ''),
              NULLIF(regexp_replace(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), '')
            ) as customer_key,
            o.created_at,
            COALESCE(
              NULLIF((to_jsonb(o)->'delivery_address'->>'area'), ''),
              NULLIF((to_jsonb(o)->'delivery_address'->>'city'), ''),
              NULLIF(to_jsonb(o)->>'delivery_area', ''),
              NULLIF(to_jsonb(o)->>'area', ''),
              NULLIF(to_jsonb(o)->>'delivery_address', ''),
              'غير محدد'
            ) as area
          FROM orders o
          WHERE o.merchant_id = $1
            AND o.created_at >= $2
            AND o.created_at <= $3
            AND ${this.getValidOrderStatusSql("o")}
        ),
        ranked_customer_area AS (
          SELECT
            customer_key,
            area,
            ROW_NUMBER() OVER (
              PARTITION BY customer_key
              ORDER BY created_at DESC
            ) as rn
          FROM period_orders
          WHERE customer_key IS NOT NULL
        )
        SELECT area, COUNT(*) as count
        FROM ranked_customer_area
        WHERE rn = 1
        GROUP BY area
        ORDER BY count DESC
        LIMIT 10
      `,
        [merchantId, startDate, endDate],
      );

      const total = parseInt(statsResult.rows[0]?.total || "0", 10);
      const returning = parseInt(statsResult.rows[0]?.returning || "0", 10);

      const retentionRate = total > 0 ? (returning / total) * 100 : 0;

      return {
        totalCustomers: total,
        newCustomers: parseInt(statsResult.rows[0]?.new_customers || "0", 10),
        returningCustomers: returning,
        retentionRate,
        avgOrdersPerCustomer: parseFloat(avgResult.rows[0]?.avg_orders || "0"),
        topCustomers: topResult.rows.map((r) => ({
          name: r.name || "Unknown",
          phone: r.phone || "",
          totalOrders: parseInt(r.orders, 10),
          totalSpent: parseFloat(r.revenue),
        })),
        customersByRegion: areaResult.rows.map((r) => ({
          region: r.area || "غير محدد",
          count: parseInt(r.count, 10),
        })),
      };
    } catch (error: any) {
      if (this.isSchemaMissing(error)) {
        this.logger.warn(`KPIs: customers unavailable (${error?.code}).`);
        return fallback;
      }
      throw error;
    }
  }

  private isSchemaMissing(error: any): boolean {
    return error?.code === "42P01" || error?.code === "42703";
  }

  private isAgentTypeComparisonError(error: any): boolean {
    const message = String(error?.message || "").toLowerCase();
    return (
      error?.code === "42883" &&
      message.includes("agent_type") &&
      message.includes("= text")
    );
  }
}
