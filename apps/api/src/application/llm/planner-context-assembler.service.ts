import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  PlannerContextContract,
  PlannerForecastSnapshot,
  PlannerOperationalSnapshot,
  PlannerPosSnapshot,
} from "./planner-context.contract";
import { CopilotActionRegistryService } from "./copilot-action-registry.service";

@Injectable()
export class PlannerContextAssemblerService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly actionRegistry: CopilotActionRegistryService,
  ) {}

  async assemble(merchantId: string): Promise<PlannerContextContract> {
    const [operational, pos, forecast, pendingApprovals] = await Promise.all([
      this.loadOperationalSnapshot(merchantId),
      this.loadPosSnapshot(merchantId),
      this.loadForecastSnapshot(merchantId),
      this.loadPendingApprovalCount(merchantId),
    ]);

    return {
      merchantId,
      generatedAt: new Date().toISOString(),
      operational: {
        ...operational,
        pendingApprovals,
      },
      pos,
      forecast,
      actionRegistry: this.actionRegistry.listDefinitions(),
    };
  }

  private async loadOperationalSnapshot(
    merchantId: string,
  ): Promise<PlannerOperationalSnapshot> {
    const fallback: PlannerOperationalSnapshot = {
      todayOrders: 0,
      todayRevenue: 0,
      openConversations: 0,
      pendingApprovals: 0,
    };

    try {
      const [ordersResult, conversationsResult] = await Promise.all([
        this.pool.query<{
          today_orders: string;
          today_revenue: string;
        }>(
          `SELECT
             COUNT(*) FILTER (
               WHERE created_at >= date_trunc('day', NOW())
             )::text as today_orders,
             COALESCE(
               SUM(total) FILTER (
                 WHERE created_at >= date_trunc('day', NOW())
               ),
               0
             )::text as today_revenue
           FROM orders
           WHERE merchant_id = $1`,
          [merchantId],
        ),
        this.pool.query<{ open_conversations: string }>(
          `SELECT COUNT(*)::text as open_conversations
           FROM conversations
           WHERE merchant_id = $1
             AND UPPER(COALESCE(state, 'OPEN')) <> 'CLOSED'`,
          [merchantId],
        ),
      ]);

      return {
        todayOrders: Number(ordersResult.rows[0]?.today_orders || 0),
        todayRevenue: Number(ordersResult.rows[0]?.today_revenue || 0),
        openConversations: Number(
          conversationsResult.rows[0]?.open_conversations || 0,
        ),
        pendingApprovals: 0,
      };
    } catch {
      return fallback;
    }
  }

  private async loadPosSnapshot(
    merchantId: string,
  ): Promise<PlannerPosSnapshot> {
    const fallback: PlannerPosSnapshot = {
      openRegisters: 0,
      activeDrafts: 0,
      todayCashierOrders: 0,
      todayCashierRevenue: 0,
      openRegistersByBranch: [],
      activeDraftsByBranch: [],
    };

    try {
      const [registers, drafts, cashierOrders] = await Promise.all([
        this.pool.query<{
          register_id: string;
          branch_id: string;
          opened_at: Date;
        }>(
          `SELECT
             id::text as register_id,
             branch_id::text as branch_id,
             opened_at
           FROM pos_register_sessions
           WHERE merchant_id = $1
             AND status = 'OPEN'
           ORDER BY opened_at DESC
           LIMIT 20`,
          [merchantId],
        ),
        this.pool.query<{
          branch_id: string | null;
          drafts_count: string;
        }>(
          `SELECT
             NULLIF(branch_id::text, '') as branch_id,
             COUNT(*)::text as drafts_count
           FROM pos_drafts
           WHERE merchant_id = $1
             AND status IN ('ACTIVE', 'SUSPENDED')
           GROUP BY branch_id`,
          [merchantId],
        ),
        this.pool.query<{
          today_cashier_orders: string;
          today_cashier_revenue: string;
        }>(
          `SELECT
             COUNT(*)::text as today_cashier_orders,
             COALESCE(SUM(total), 0)::text as today_cashier_revenue
           FROM orders
           WHERE merchant_id = $1
             AND created_at >= date_trunc('day', NOW())
             AND LOWER(COALESCE(source_channel, '')) = 'cashier'`,
          [merchantId],
        ),
      ]);

      const openRegistersByBranch = registers.rows.map((row) => ({
        registerId: row.register_id,
        branchId: row.branch_id,
        openedAt: row.opened_at?.toISOString?.() || new Date().toISOString(),
      }));
      const activeDraftsByBranch = drafts.rows.map((row) => ({
        branchId: row.branch_id || "unassigned",
        draftsCount: Number(row.drafts_count || 0),
      }));

      return {
        openRegisters: openRegistersByBranch.length,
        activeDrafts: activeDraftsByBranch.reduce(
          (sum, row) => sum + row.draftsCount,
          0,
        ),
        todayCashierOrders: Number(
          cashierOrders.rows[0]?.today_cashier_orders || 0,
        ),
        todayCashierRevenue: Number(
          cashierOrders.rows[0]?.today_cashier_revenue || 0,
        ),
        openRegistersByBranch,
        activeDraftsByBranch,
      };
    } catch {
      return fallback;
    }
  }

  private async loadForecastSnapshot(
    merchantId: string,
  ): Promise<PlannerForecastSnapshot> {
    const fallback: PlannerForecastSnapshot = {
      enabled: false,
      latestRuns: [],
      riskSignals: {
        lowConfidencePredictions: 0,
        staleRuns: 0,
        highUrgencyReplenishments: 0,
      },
    };

    try {
      const [latestRuns, lowConfidence, staleRuns, highUrgency] =
        await Promise.all([
          this.pool.query<{
            forecast_type: string;
            status: string;
            items_computed: string;
            computed_at: Date;
            duration_ms: number | null;
            error_message: string | null;
          }>(
            `SELECT
               forecast_type,
               status,
               items_computed::text as items_computed,
               computed_at,
               duration_ms,
               error_message
             FROM forecast_runs
             WHERE merchant_id = $1
             ORDER BY computed_at DESC
             LIMIT 12`,
            [merchantId],
          ),
          this.pool.query<{ count: string }>(
            `SELECT COUNT(*)::text as count
             FROM forecast_predictions
             WHERE merchant_id = $1
               AND computed_at >= NOW() - INTERVAL '7 days'
               AND COALESCE(confidence_score, 0) < 0.60`,
            [merchantId],
          ),
          this.pool.query<{ count: string }>(
            `SELECT COUNT(*)::text as count
             FROM forecast_runs
             WHERE merchant_id = $1
               AND status = 'stale'
               AND computed_at >= NOW() - INTERVAL '7 days'`,
            [merchantId],
          ),
          this.pool.query<{ count: string }>(
            `SELECT COUNT(*)::text as count
             FROM replenishment_recommendations
             WHERE merchant_id = $1
               AND status = 'pending'
               AND urgency IN ('critical', 'high')`,
            [merchantId],
          ),
        ]);

      return {
        enabled: true,
        latestRuns: latestRuns.rows.map((row) => ({
          forecastType: row.forecast_type,
          status: row.status,
          itemsComputed: Number(row.items_computed || 0),
          computedAt:
            row.computed_at?.toISOString?.() || new Date().toISOString(),
          durationMs: row.duration_ms,
          errorMessage: row.error_message,
        })),
        riskSignals: {
          lowConfidencePredictions: Number(lowConfidence.rows[0]?.count || 0),
          staleRuns: Number(staleRuns.rows[0]?.count || 0),
          highUrgencyReplenishments: Number(highUrgency.rows[0]?.count || 0),
        },
      };
    } catch {
      return fallback;
    }
  }

  private async loadPendingApprovalCount(merchantId: string): Promise<number> {
    try {
      const result = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM copilot_action_approvals
         WHERE merchant_id = $1
           AND status IN ('pending', 'confirmed', 'executing')`,
        [merchantId],
      );
      return Number(result.rows[0]?.count || 0);
    } catch {
      return 0;
    }
  }
}
