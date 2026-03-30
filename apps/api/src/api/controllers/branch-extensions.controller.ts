import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Pool } from "pg";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantId } from "../../shared/decorators/merchant-id.decorator";

// ─────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────
function pn(v: unknown): number {
  return parseFloat(String(v ?? "0")) || 0;
}

function ownsCheck(row: { merchant_id: string }, merchantId: string) {
  if (row.merchant_id !== merchantId)
    throw new ForbiddenException("Access denied");
}

// ─────────────────────────────────────────────────────
// BRANCH STAFF ASSIGNMENT CONTROLLER
// ─────────────────────────────────────────────────────
@ApiTags("Branch Staff")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Controller("v1/branches/:branchId/staff")
export class BranchStaffController {
  private readonly logger = new Logger(BranchStaffController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** List all staff assigned to a branch */
  @Get()
  @ApiOperation({ summary: "List staff assigned to a branch" })
  @ApiParam({ name: "branchId", type: "string" })
  async listBranchStaff(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
  ) {
    await this.verifyBranch(merchantId, branchId);

    const { rows } = await this.pool.query(
      `SELECT bsa.id, bsa.staff_id, bsa.role, bsa.is_primary, bsa.created_at,
              ms.name, ms.email, ms.role AS staff_global_role, ms.status
       FROM branch_staff_assignments bsa
       JOIN merchant_staff ms ON ms.id = bsa.staff_id
       WHERE bsa.branch_id = $1 AND bsa.merchant_id = $2
       ORDER BY ms.name ASC`,
      [branchId, merchantId],
    );
    return { data: rows };
  }

  /** List merchant staff NOT yet assigned to this branch */
  @Get("/available")
  @ApiOperation({ summary: "List staff not yet assigned to this branch" })
  async availableStaff(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
  ) {
    const { rows } = await this.pool.query(
      `SELECT ms.id, ms.name, ms.email, ms.role, ms.status
       FROM merchant_staff ms
       WHERE ms.merchant_id = $1
         AND ms.status = 'ACTIVE'
         AND ms.id NOT IN (
           SELECT staff_id FROM branch_staff_assignments WHERE branch_id = $2
         )
       ORDER BY ms.name ASC`,
      [merchantId, branchId],
    );
    return { data: rows };
  }

  /** Assign staff to branch */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Assign a staff member to a branch" })
  async assignStaff(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Body() body: { staffId: string; role?: string; isPrimary?: boolean },
  ) {
    if (!body.staffId) throw new BadRequestException("staffId is required");
    await this.verifyBranch(merchantId, branchId);

    // Verify staff belongs to merchant
    const staffCheck = await this.pool.query(
      `SELECT id FROM merchant_staff WHERE id = $1 AND merchant_id = $2`,
      [body.staffId, merchantId],
    );
    if (!staffCheck.rows.length)
      throw new NotFoundException("Staff member not found");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      if (body.isPrimary) {
        // Remove primary flag from existing primary
        await client.query(
          `UPDATE branch_staff_assignments SET is_primary = false
           WHERE staff_id = $1 AND merchant_id = $2 AND is_primary = true`,
          [body.staffId, merchantId],
        );
      }

      const { rows } = await client.query(
        `INSERT INTO branch_staff_assignments (merchant_id, branch_id, staff_id, role, is_primary)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (branch_id, staff_id) DO UPDATE
           SET role = EXCLUDED.role, is_primary = EXCLUDED.is_primary
         RETURNING *`,
        [
          merchantId,
          branchId,
          body.staffId,
          body.role ?? "AGENT",
          body.isPrimary ?? false,
        ],
      );

      await client.query("COMMIT");
      return { data: rows[0] };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Remove staff from branch */
  @Delete(":assignmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a staff member from a branch" })
  async removeStaff(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Param("assignmentId") assignmentId: string,
  ) {
    const { rowCount } = await this.pool.query(
      `DELETE FROM branch_staff_assignments
       WHERE id = $1 AND branch_id = $2 AND merchant_id = $3`,
      [assignmentId, branchId, merchantId],
    );
    if (!rowCount) throw new NotFoundException("Assignment not found");
  }

  private async verifyBranch(merchantId: string, branchId: string) {
    const { rows } = await this.pool.query(
      `SELECT id FROM merchant_branches WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
    if (!rows.length) throw new NotFoundException("Branch not found");
  }
}

// ─────────────────────────────────────────────────────
// BRANCH GOALS CONTROLLER
// ─────────────────────────────────────────────────────
@ApiTags("Branch Goals")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Controller("v1/branches/:branchId/goals")
export class BranchGoalsController {
  private readonly logger = new Logger(BranchGoalsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** List goals for a branch (optionally with actuals progress) */
  @Get()
  @ApiOperation({ summary: "List goals for a branch with progress" })
  @ApiQuery({ name: "withProgress", required: false, type: Boolean })
  async listGoals(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("withProgress") withProgress?: string,
  ) {
    const { rows: goals } = await this.pool.query(
      `SELECT g.*, ms.name AS created_by_name
       FROM branch_goals g
       LEFT JOIN merchant_staff ms ON ms.id = g.created_by
       WHERE g.branch_id = $1 AND g.merchant_id = $2
       ORDER BY g.start_date DESC`,
      [branchId, merchantId],
    );

    if (withProgress !== "true") return { data: goals };

    // Enrich each goal with actual revenue/orders in the date range
    const enriched = await Promise.all(
      goals.map(async (goal) => {
        const { rows: actuals } = await this.pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN o.status NOT IN ('CANCELLED','RETURNED') THEN
               COALESCE(o.final_total, o.total_amount, 0) ELSE 0 END), 0) AS actual_revenue,
             COUNT(CASE WHEN o.status NOT IN ('CANCELLED','RETURNED') THEN 1 END) AS actual_orders
           FROM orders o
           WHERE o.merchant_id = $1
             AND o.branch_id = $2
             AND DATE(o.created_at) BETWEEN $3 AND $4`,
          [merchantId, branchId, goal.start_date, goal.end_date],
        );
        const act = actuals[0];
        return {
          ...goal,
          actual_revenue: pn(act.actual_revenue),
          actual_orders: parseInt(act.actual_orders || "0", 10),
          revenue_pct: goal.target_revenue
            ? Math.min(
                100,
                Math.round(
                  (pn(act.actual_revenue) / pn(goal.target_revenue)) * 100,
                ),
              )
            : null,
          orders_pct: goal.target_orders
            ? Math.min(
                100,
                Math.round(
                  (parseInt(act.actual_orders || "0", 10) /
                    goal.target_orders) *
                    100,
                ),
              )
            : null,
        };
      }),
    );

    return { data: enriched };
  }

  /** Create a goal */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a branch goal" })
  async createGoal(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Body()
    body: {
      periodType?: string;
      targetRevenue?: number;
      targetOrders?: number;
      startDate: string;
      endDate: string;
      notes?: string;
    },
  ) {
    if (!body.startDate || !body.endDate)
      throw new BadRequestException("startDate and endDate are required");
    if (new Date(body.startDate) > new Date(body.endDate))
      throw new BadRequestException("startDate must be before endDate");

    const { rows } = await this.pool.query(
      `INSERT INTO branch_goals
         (merchant_id, branch_id, period_type, target_revenue, target_orders, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        merchantId,
        branchId,
        body.periodType ?? "MONTHLY",
        body.targetRevenue ?? null,
        body.targetOrders ?? null,
        body.startDate,
        body.endDate,
        body.notes ?? null,
      ],
    );
    return { data: rows[0] };
  }

  /** Update a goal */
  @Patch(":goalId")
  @ApiOperation({ summary: "Update a branch goal" })
  async updateGoal(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Param("goalId") goalId: string,
    @Body()
    body: {
      targetRevenue?: number;
      targetOrders?: number;
      notes?: string;
    },
  ) {
    const { rows } = await this.pool.query(
      `UPDATE branch_goals
       SET target_revenue = COALESCE($3, target_revenue),
           target_orders  = COALESCE($4, target_orders),
           notes          = COALESCE($5, notes),
           updated_at     = NOW()
       WHERE id = $1 AND branch_id = $2 AND merchant_id = $6
       RETURNING *`,
      [
        goalId,
        branchId,
        body.targetRevenue ?? null,
        body.targetOrders ?? null,
        body.notes ?? null,
        merchantId,
      ],
    );
    if (!rows.length) throw new NotFoundException("Goal not found");
    return { data: rows[0] };
  }

  /** Delete a goal */
  @Delete(":goalId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a branch goal" })
  async deleteGoal(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Param("goalId") goalId: string,
  ) {
    const { rowCount } = await this.pool.query(
      `DELETE FROM branch_goals WHERE id = $1 AND branch_id = $2 AND merchant_id = $3`,
      [goalId, branchId, merchantId],
    );
    if (!rowCount) throw new NotFoundException("Goal not found");
  }
}

// ─────────────────────────────────────────────────────
// BRANCH SHIFTS CONTROLLER
// ─────────────────────────────────────────────────────
@ApiTags("Branch Shifts")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Controller("v1/branches/:branchId/shifts")
export class BranchShiftsController {
  private readonly logger = new Logger(BranchShiftsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** List shifts for a branch */
  @Get()
  @ApiOperation({ summary: "List shifts for a branch" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, type: String })
  async listShifts(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("status") status?: string,
  ) {
    const lim = Math.min(parseInt(limit || "20", 10), 100);
    const off = parseInt(offset || "0", 10);
    const statusClause = status ? `AND s.status = $4` : "";
    const params: unknown[] = status
      ? [branchId, merchantId, lim, status, off]
      : [branchId, merchantId, lim, off];
    const offsetIdx = status ? 5 : 4;

    const { rows } = await this.pool.query(
      `SELECT s.*,
              opener.name AS opened_by_name,
              closer.name  AS closed_by_name
       FROM branch_shifts s
       LEFT JOIN merchant_staff opener ON opener.id = s.opened_by
       LEFT JOIN merchant_staff closer  ON closer.id  = s.closed_by
       WHERE s.branch_id = $1 AND s.merchant_id = $2
         ${statusClause}
       ORDER BY s.opened_at DESC
       LIMIT $3 OFFSET $${offsetIdx}`,
      params,
    );

    const { rows: countRows } = await this.pool.query(
      `SELECT COUNT(*) FROM branch_shifts WHERE branch_id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );

    return { data: rows, total: parseInt(countRows[0].count, 10) };
  }

  /** Open a new shift */
  @Post("/open")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Open a new shift" })
  async openShift(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Body() body: { openingCash?: number; openedBy?: string; notes?: string },
  ) {
    // Check no open shift already exists for this branch
    const { rows: existing } = await this.pool.query(
      `SELECT id FROM branch_shifts WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1`,
      [branchId],
    );
    if (existing.length) {
      throw new ConflictException(
        "A shift is already open for this branch. Close it before opening a new one.",
      );
    }

    const { rows } = await this.pool.query(
      `INSERT INTO branch_shifts (merchant_id, branch_id, opened_by, opening_cash, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')
       RETURNING *`,
      [
        merchantId,
        branchId,
        body.openedBy ?? null,
        body.openingCash ?? 0,
        body.notes ?? null,
      ],
    );
    return { data: rows[0] };
  }

  /** Close a shift */
  @Patch(":shiftId/close")
  @ApiOperation({ summary: "Close a shift" })
  async closeShift(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Param("shiftId") shiftId: string,
    @Body()
    body: {
      closingCash?: number;
      closedBy?: string;
      closingNotes?: string;
    },
  ) {
    const { rows: existing } = await this.pool.query(
      `SELECT * FROM branch_shifts WHERE id = $1 AND branch_id = $2 AND merchant_id = $3`,
      [shiftId, branchId, merchantId],
    );
    if (!existing.length) throw new NotFoundException("Shift not found");
    if (existing[0].status !== "OPEN")
      throw new BadRequestException("Shift is not open");

    // Calculate totals from orders in this shift
    const { rows: orderStats } = await this.pool.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(COALESCE(final_total, total_amount, 0)), 0) AS total_revenue
       FROM orders
       WHERE shift_id = $1 AND status NOT IN ('CANCELLED')`,
      [shiftId],
    );

    // expected cash = opening cash + cash orders in shift
    const { rows: cashStats } = await this.pool.query(
      `SELECT COALESCE(SUM(COALESCE(final_total, total_amount, 0)), 0) AS cash_total
       FROM orders
       WHERE shift_id = $1 AND payment_method = 'CASH' AND status NOT IN ('CANCELLED')`,
      [shiftId],
    );

    const expectedCash =
      pn(existing[0].opening_cash) + pn(cashStats[0].cash_total);

    const { rows } = await this.pool.query(
      `UPDATE branch_shifts
       SET status        = 'CLOSED',
           closed_at     = NOW(),
           closed_by     = COALESCE($3, closed_by),
           closing_cash  = $4,
           expected_cash = $5,
           total_orders  = $6,
           total_revenue = $7,
           closing_notes = COALESCE($8, closing_notes),
           updated_at    = NOW()
       WHERE id = $1 AND branch_id = $2
       RETURNING *`,
      [
        shiftId,
        branchId,
        body.closedBy ?? null,
        body.closingCash ?? null,
        expectedCash,
        parseInt(orderStats[0].total_orders, 10),
        pn(orderStats[0].total_revenue),
        body.closingNotes ?? null,
      ],
    );
    return { data: rows[0] };
  }

  /** Get current open shift for a branch */
  @Get("/current")
  @ApiOperation({ summary: "Get the currently open shift for this branch" })
  async getCurrentShift(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
  ) {
    const { rows } = await this.pool.query(
      `SELECT s.*,
              opener.name AS opened_by_name,
              COALESCE(SUM(COALESCE(o.total_amount, 0)), 0) AS running_revenue,
              COUNT(o.id) AS running_orders
       FROM branch_shifts s
       LEFT JOIN merchant_staff opener ON opener.id = s.opened_by
       LEFT JOIN orders o ON o.shift_id = s.id AND o.status NOT IN ('CANCELLED')
       WHERE s.branch_id = $1 AND s.merchant_id = $2 AND s.status = 'OPEN'
       GROUP BY s.id, opener.name
       LIMIT 1`,
      [branchId, merchantId],
    );
    return { data: rows[0] ?? null };
  }
}

// ─────────────────────────────────────────────────────
// BRANCH P&L REPORT CONTROLLER
// ─────────────────────────────────────────────────────
@ApiTags("Branch P&L")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Controller("v1/branches/:branchId/pl-report")
export class BranchPLController {
  private readonly logger = new Logger(BranchPLController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Returns a full P&L for a branch for a given month YYYY-MM
   * Portal renders this as a printable page.
   */
  @Get()
  @ApiOperation({ summary: "Branch P&L report for a given month" })
  @ApiQuery({
    name: "month",
    required: false,
    description: "Format YYYY-MM, defaults to current month",
  })
  async getPLReport(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("month") month?: string,
  ) {
    // Resolve date range
    const target =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month
        : new Date().toISOString().slice(0, 7);
    const [year, mon] = target.split("-").map(Number);
    const startDate = `${target}-01`;
    const endOfMonth = new Date(year, mon, 0);
    const endDate = endOfMonth.toISOString().slice(0, 10);

    // Branch info
    const { rows: branchRows } = await this.pool.query(
      `SELECT * FROM merchant_branches WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
    if (!branchRows.length) throw new NotFoundException("Branch not found");
    const branch = branchRows[0];

    // Revenue
    const { rows: revRows } = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED','RETURNED')) AS total_orders,
         COALESCE(SUM(COALESCE(final_total, total_amount, 0)) FILTER (WHERE status NOT IN ('CANCELLED','RETURNED')), 0) AS gross_revenue,
         COALESCE(SUM(COALESCE(discount_amount, 0)) FILTER (WHERE status NOT IN ('CANCELLED','RETURNED')), 0) AS discounts,
         COALESCE(SUM(COALESCE(delivery_fee, 0)) FILTER (WHERE status NOT IN ('CANCELLED','RETURNED')), 0) AS delivery_fees,
         COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_orders,
         COALESCE(SUM(COALESCE(final_total, total_amount, 0)) FILTER (WHERE status = 'CANCELLED'), 0) AS cancelled_revenue
       FROM orders
       WHERE merchant_id = $1
         AND branch_id = $2
         AND DATE(created_at) BETWEEN $3 AND $4`,
      [merchantId, branchId, startDate, endDate],
    );

    // Expenses
    const { rows: expRows } = await this.pool.query(
      `SELECT
         COALESCE(SUM(amount), 0) AS total_expenses,
         json_agg(json_build_object(
           'category', COALESCE(category, 'أخرى'),
           'amount', amount,
           'description', description,
           'date', date::text
         ) ORDER BY date) AS expense_items
       FROM expenses
       WHERE merchant_id = $1
         AND branch_id = $2
         AND date BETWEEN $3 AND $4`,
      [merchantId, branchId, startDate, endDate],
    );

    // Expenses by category
    const { rows: expByCat } = await this.pool.query(
      `SELECT COALESCE(category, 'أخرى') AS category, SUM(amount) AS total
       FROM expenses
       WHERE merchant_id = $1 AND branch_id = $2 AND date BETWEEN $3 AND $4
       GROUP BY category ORDER BY total DESC`,
      [merchantId, branchId, startDate, endDate],
    );

    // Previous month for comparison
    const prevMonthDate = new Date(year, mon - 2, 1);
    const prevMonth = prevMonthDate.toISOString().slice(0, 7);
    const prevStart = `${prevMonth}-01`;
    const prevEnd = new Date(year, mon - 1, 0).toISOString().slice(0, 10);

    const { rows: prevRevRows } = await this.pool.query(
      `SELECT
         COALESCE(SUM(COALESCE(final_total, total_amount, 0)) FILTER (WHERE status NOT IN ('CANCELLED','RETURNED')), 0) AS gross_revenue
       FROM orders
       WHERE merchant_id = $1 AND branch_id = $2
         AND DATE(created_at) BETWEEN $3 AND $4`,
      [merchantId, branchId, prevStart, prevEnd],
    );
    const { rows: prevExpRows } = await this.pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_expenses
       FROM expenses WHERE merchant_id = $1 AND branch_id = $2 AND date BETWEEN $3 AND $4`,
      [merchantId, branchId, prevStart, prevEnd],
    );

    const grossRevenue = pn(revRows[0].gross_revenue);
    const discounts = pn(revRows[0].discounts);
    const deliveryFees = pn(revRows[0].delivery_fees);
    const netRevenue = grossRevenue - discounts;
    const totalExpenses = pn(expRows[0].total_expenses);
    const netProfit = netRevenue - totalExpenses;
    const margin =
      netRevenue > 0 ? Math.round((netProfit / netRevenue) * 10000) / 100 : 0;

    const prevGross = pn(prevRevRows[0].gross_revenue);
    const prevExp = pn(prevExpRows[0].total_expenses);
    const prevNet = prevGross - prevExp;

    return {
      meta: {
        branch,
        month: target,
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
      },
      revenue: {
        grossRevenue,
        discounts,
        deliveryFees,
        netRevenue,
        totalOrders: parseInt(revRows[0].total_orders || "0", 10),
        cancelledOrders: parseInt(revRows[0].cancelled_orders || "0", 10),
        cancelledRevenue: pn(revRows[0].cancelled_revenue),
        avgOrderValue:
          parseInt(revRows[0].total_orders || "1", 10) > 0
            ? Math.round(
                (grossRevenue / parseInt(revRows[0].total_orders, 10)) * 100,
              ) / 100
            : 0,
      },
      expenses: {
        totalExpenses,
        byCategory: expByCat,
        items: expRows[0].expense_items ?? [],
      },
      profitability: {
        netProfit,
        margin,
        prevNetProfit: prevNet,
        change:
          prevNet !== 0
            ? Math.round(((netProfit - prevNet) / Math.abs(prevNet)) * 10000) /
              100
            : null,
      },
    };
  }
}

// ─────────────────────────────────────────────────────
// BRANCH ALERTS CONTROLLER
// ─────────────────────────────────────────────────────
@ApiTags("Branch Alerts")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Controller("v1/branches")
export class BranchAlertsController {
  private readonly logger = new Logger(BranchAlertsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private async verifyBranch(merchantId: string, branchId: string) {
    const { rows } = await this.pool.query(
      `SELECT id, merchant_id FROM merchant_branches WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
    if (!rows.length) throw new NotFoundException("Branch not found");
    return rows[0];
  }

  /** Get (or auto-create) alert config for a branch */
  @Get(":branchId/alerts")
  @ApiOperation({ summary: "Get proactive alert config for a branch" })
  @ApiParam({ name: "branchId", type: "string" })
  async getBranchAlerts(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
  ) {
    await this.verifyBranch(merchantId, branchId);

    // Upsert a default config row if none exists for this branch
    await this.pool.query(
      `INSERT INTO proactive_alert_configs
         (id, merchant_id, branch_id, expiry_threshold_days, cash_flow_forecast_days,
          demand_spike_multiplier, is_active, no_orders_threshold_minutes, low_cash_threshold)
       VALUES (gen_random_uuid(), $1, $2, 7, 30, 1.5, true, 120, NULL)
       ON CONFLICT (merchant_id, COALESCE(branch_id::text, '00000000-0000-0000-0000-000000000000'))
       DO NOTHING`,
      [merchantId, branchId],
    );

    const { rows } = await this.pool.query(
      `SELECT id, merchant_id, branch_id, expiry_threshold_days, cash_flow_forecast_days,
              demand_spike_multiplier, is_active, no_orders_threshold_minutes,
              low_cash_threshold, alert_email, alert_whatsapp, created_at, updated_at
       FROM proactive_alert_configs
       WHERE merchant_id = $1 AND branch_id = $2`,
      [merchantId, branchId],
    );

    return rows[0] ?? null;
  }

  /** Update alert config for a branch */
  @Patch(":branchId/alerts")
  @ApiOperation({ summary: "Update proactive alert config for a branch" })
  @ApiParam({ name: "branchId", type: "string" })
  async updateBranchAlerts(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Body()
    body: {
      expiryThresholdDays?: number;
      cashFlowForecastDays?: number;
      demandSpikeMultiplier?: number;
      isActive?: boolean;
      noOrdersThresholdMinutes?: number;
      lowCashThreshold?: number | null;
      alertEmail?: string | null;
      alertWhatsapp?: string | null;
    },
  ) {
    await this.verifyBranch(merchantId, branchId);

    // Upsert then update
    await this.pool.query(
      `INSERT INTO proactive_alert_configs
         (id, merchant_id, branch_id, expiry_threshold_days, cash_flow_forecast_days,
          demand_spike_multiplier, is_active, no_orders_threshold_minutes, low_cash_threshold)
       VALUES (gen_random_uuid(), $1, $2, 7, 30, 1.5, true, 120, NULL)
       ON CONFLICT (merchant_id, COALESCE(branch_id::text, '00000000-0000-0000-0000-000000000000'))
       DO NOTHING`,
      [merchantId, branchId],
    );

    const sets: string[] = [];
    const vals: any[] = [merchantId, branchId];
    let i = 3;

    if (body.expiryThresholdDays !== undefined) {
      sets.push(`expiry_threshold_days = $${i++}`);
      vals.push(body.expiryThresholdDays);
    }
    if (body.cashFlowForecastDays !== undefined) {
      sets.push(`cash_flow_forecast_days = $${i++}`);
      vals.push(body.cashFlowForecastDays);
    }
    if (body.demandSpikeMultiplier !== undefined) {
      sets.push(`demand_spike_multiplier = $${i++}`);
      vals.push(body.demandSpikeMultiplier);
    }
    if (body.isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(body.isActive);
    }
    if (body.noOrdersThresholdMinutes !== undefined) {
      sets.push(`no_orders_threshold_minutes = $${i++}`);
      vals.push(body.noOrdersThresholdMinutes);
    }
    if ("lowCashThreshold" in body) {
      sets.push(`low_cash_threshold = $${i++}`);
      vals.push(body.lowCashThreshold ?? null);
    }
    if ("alertEmail" in body) {
      sets.push(`alert_email = $${i++}`);
      vals.push(body.alertEmail ?? null);
    }
    if ("alertWhatsapp" in body) {
      sets.push(`alert_whatsapp = $${i++}`);
      vals.push(body.alertWhatsapp ?? null);
    }

    if (!sets.length) throw new BadRequestException("No fields to update");

    sets.push(`updated_at = NOW()`);

    const { rows } = await this.pool.query(
      `UPDATE proactive_alert_configs
       SET ${sets.join(", ")}
       WHERE merchant_id = $1 AND branch_id = $2
       RETURNING *`,
      vals,
    );

    return rows[0];
  }

  /** Summary of all branches with their alert configs + live status */
  @Get("_alerts/summary")
  @ApiOperation({ summary: "All branches alert configs and live status" })
  async getAlertsSummary(@MerchantId() merchantId: string) {
    const { rows } = await this.pool.query(
      `SELECT
         mb.id            AS branch_id,
         mb.name          AS branch_name,
         pac.id           AS config_id,
         pac.is_active,
         pac.no_orders_threshold_minutes,
         pac.low_cash_threshold,
         pac.expiry_threshold_days,
         pac.alert_email,
         pac.alert_whatsapp,
         -- live: minutes since last order in this branch
         EXTRACT(EPOCH FROM (NOW() - MAX(o.created_at))) / 60 AS minutes_since_last_order,
         COUNT(o.id) FILTER (WHERE o.created_at >= NOW() - INTERVAL '24 hours') AS orders_last_24h
       FROM merchant_branches mb
       LEFT JOIN proactive_alert_configs pac
         ON pac.merchant_id = mb.merchant_id AND pac.branch_id = mb.id
       LEFT JOIN orders o
         ON o.branch_id = mb.id AND o.merchant_id = mb.merchant_id
       WHERE mb.merchant_id = $1
       GROUP BY mb.id, mb.name, pac.id, pac.is_active,
                pac.no_orders_threshold_minutes, pac.low_cash_threshold,
                pac.expiry_threshold_days, pac.alert_email, pac.alert_whatsapp
       ORDER BY mb.name ASC`,
      [merchantId],
    );

    return rows.map((r) => ({
      branchId: r.branch_id,
      branchName: r.branch_name,
      configId: r.config_id,
      isActive: r.is_active ?? false,
      noOrdersThresholdMinutes: r.no_orders_threshold_minutes ?? 120,
      lowCashThreshold: r.low_cash_threshold ? pn(r.low_cash_threshold) : null,
      expiryThresholdDays: r.expiry_threshold_days ?? 7,
      alertEmail: r.alert_email ?? null,
      alertWhatsapp: r.alert_whatsapp ?? null,
      minutesSinceLastOrder:
        r.minutes_since_last_order != null
          ? Math.round(pn(r.minutes_since_last_order))
          : null,
      ordersLast24h: parseInt(r.orders_last_24h || "0", 10),
      isAlertTriggered:
        r.is_active &&
        r.no_orders_threshold_minutes != null &&
        r.minutes_since_last_order != null &&
        Math.round(pn(r.minutes_since_last_order)) >
          parseInt(r.no_orders_threshold_minutes, 10),
    }));
  }
}

// ─────────────────────────────────────────────────────
// BRANCH INVENTORY CONTROLLER
// ─────────────────────────────────────────────────────
@ApiTags("Branch Inventory")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Controller("v1/branches/:branchId/inventory")
export class BranchInventoryController {
  private readonly logger = new Logger(BranchInventoryController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private async verifyBranch(merchantId: string, branchId: string) {
    const { rows } = await this.pool.query(
      `SELECT id FROM merchant_branches WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
    if (!rows.length) throw new NotFoundException("Branch not found");
    return rows[0];
  }

  @Get()
  @ApiOperation({ summary: "Get inventory stock levels for a branch" })
  @ApiParam({ name: "branchId", type: "string" })
  @ApiQuery({ name: "search", required: false, type: "string" })
  @ApiQuery({ name: "lowStock", required: false, type: "boolean" })
  async getBranchInventory(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("search") search?: string,
    @Query("lowStock") lowStock?: string,
  ) {
    await this.verifyBranch(merchantId, branchId);

    const params: any[] = [branchId, merchantId];
    let filterSql = "";

    if (search) {
      filterSql += ` AND (iv.name ILIKE $${params.length + 1} OR ivv.sku ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (lowStock === "true") {
      filterSql += ` AND sbl.quantity_available <= COALESCE(ivv.reorder_point, 5)`;
    }

    const { rows } = await this.pool.query(
      `SELECT
         iv.id            AS item_id,
         iv.name          AS item_name,
         iv.category,
         ivv.id           AS variant_id,
         ivv.sku,
         ivv.name         AS variant_name,
         ivv.reorder_point,
         wl.id            AS location_id,
         wl.name          AS location_name,
         sbl.quantity_on_hand,
         sbl.quantity_reserved,
         sbl.quantity_available,
         sbl.updated_at
       FROM inventory_stock_by_location sbl
       JOIN warehouse_locations wl   ON wl.id = sbl.location_id
       JOIN inventory_variants ivv   ON ivv.id = sbl.variant_id
       JOIN inventory_items iv       ON iv.id = ivv.inventory_item_id
       WHERE wl.branch_id = $1
         AND iv.merchant_id = $2
         ${filterSql}
       ORDER BY iv.name ASC, ivv.sku ASC`,
      params,
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalItems++;
        acc.totalOnHand += pn(r.quantity_on_hand);
        acc.totalAvailable += pn(r.quantity_available);
        if (pn(r.quantity_available) <= (r.reorder_point ?? 5))
          acc.lowStockItems++;
        return acc;
      },
      { totalItems: 0, totalOnHand: 0, totalAvailable: 0, lowStockItems: 0 },
    );

    return {
      branchId,
      summary: totals,
      items: rows.map((r) => ({
        itemId: r.item_id,
        itemName: r.item_name,
        category: r.category,
        variantId: r.variant_id,
        sku: r.sku,
        variantName: r.variant_name,
        locationId: r.location_id,
        locationName: r.location_name,
        quantityOnHand: pn(r.quantity_on_hand),
        quantityReserved: pn(r.quantity_reserved),
        quantityAvailable: pn(r.quantity_available),
        reorderPoint: r.reorder_point ?? 5,
        isLowStock: pn(r.quantity_available) <= (r.reorder_point ?? 5),
        updatedAt: r.updated_at,
      })),
    };
  }
}
