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
  ApiQuery,
  ApiSecurity,
  ApiParam,
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

// ============================================================================
// HELPERS
// ============================================================================

function parseIntParam(
  val: string | undefined,
  def: number,
  max = 365,
): number {
  const n = parseInt(val || String(def), 10);
  return Number.isNaN(n) ? def : Math.min(Math.max(n, 1), max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pn(v: unknown): number {
  return parseFloat(String(v || "0")) || 0;
}

function pi(v: unknown): number {
  return parseInt(String(v || "0"), 10) || 0;
}

function expenseDateExpr(alias: string): string {
  // Support both modern `expense_date` and legacy `date` fields across mixed deployments.
  const rawDateExpr = `COALESCE(
    NULLIF(to_jsonb(${alias})->>'expense_date', ''),
    NULLIF(to_jsonb(${alias})->>'date', ''),
    NULLIF(to_jsonb(${alias})->>'created_at', '')
  )`;
  return `COALESCE(
    CASE
      WHEN ${rawDateExpr} IS NULL THEN NULL
      WHEN LEFT(${rawDateExpr}, 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN to_date(LEFT(${rawDateExpr}, 10), 'YYYY-MM-DD')
      ELSE NULL
    END,
    CURRENT_DATE
  )`;
}

function branchIdTextExpr(alias: string): string {
  return `NULLIF(to_jsonb(${alias})->>'branch_id', '')`;
}

function jsonNumericExpr(alias: string, key: string): string {
  const raw = `NULLIF(to_jsonb(${alias})->>'${key}', '')`;
  return `COALESCE(
    CASE WHEN ${raw} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${raw})::numeric ELSE NULL END,
    0
  )`;
}

function normalizeBranchName(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const normalizedDigits = raw
    .replace(/[٠-٩]/g, (d) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)] ?? d)
    .replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)] ?? d);

  return normalizedDigits
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizedBranchNameSet(
  name: string | null | undefined,
  nameEn: string | null | undefined,
): Set<string> {
  const set = new Set<string>();
  const primary = normalizeBranchName(name);
  const english = normalizeBranchName(nameEn);
  if (primary) set.add(primary);
  if (english) set.add(english);
  return set;
}

function hasNormalizedNameOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

// ============================================================================
// CONTROLLER — BRANCH CRUD
// ============================================================================

@ApiTags("Branches")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller("v1/branches")
export class BranchesController {
  private readonly logger = new Logger(BranchesController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // ------------------------------------------------------------------
  // LIST branches
  // ------------------------------------------------------------------
  @Get()
  @ApiOperation({ summary: "List all branches for the merchant" })
  @ApiResponse({ status: 200, description: "Array of branches" })
  async listBranches(@MerchantId() merchantId: string) {
    const result = await this.pool.query(
      `SELECT id, merchant_id, name, name_en, city, address, phone,
              manager_name, is_active, is_default, sort_order, created_at, updated_at
       FROM merchant_branches
       WHERE merchant_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [merchantId],
    );
    return { branches: result.rows };
  }

  // ------------------------------------------------------------------
  // GET single branch
  // ------------------------------------------------------------------
  @Get(":branchId")
  @ApiOperation({ summary: "Get a single branch by ID" })
  @ApiParam({ name: "branchId", description: "Branch UUID" })
  async getBranch(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
  ) {
    const result = await this.pool.query(
      `SELECT id, merchant_id, name, name_en, city, address, phone,
              manager_name, is_active, is_default, sort_order, created_at, updated_at
       FROM merchant_branches
       WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
    if (result.rowCount === 0) throw new NotFoundException("الفرع غير موجود");
    return result.rows[0];
  }

  // ------------------------------------------------------------------
  // CREATE branch
  // ------------------------------------------------------------------
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new branch" })
  async createBranch(
    @MerchantId() merchantId: string,
    @Body()
    dto: {
      name: string;
      name_en?: string;
      city?: string;
      address?: string;
      phone?: string;
      manager_name?: string;
      is_default?: boolean;
      sort_order?: number;
    },
  ) {
    if (!dto.name?.trim()) throw new BadRequestException("اسم الفرع مطلوب");

    const requestedNames = normalizedBranchNameSet(dto.name, dto.name_en);
    if (requestedNames.size === 0) {
      throw new BadRequestException("اسم الفرع غير صالح");
    }

    const duplicates = await this.pool.query<{
      id: string;
      name: string | null;
      name_en: string | null;
    }>(
      `SELECT id::text as id, name, name_en
       FROM merchant_branches
       WHERE merchant_id = $1`,
      [merchantId],
    );

    const hasDuplicate = duplicates.rows.some((row) =>
      hasNormalizedNameOverlap(
        requestedNames,
        normalizedBranchNameSet(row.name, row.name_en),
      ),
    );
    if (hasDuplicate) {
      throw new ConflictException("اسم الفرع مستخدم بالفعل");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // If new branch is marked default, unset any existing default
      if (dto.is_default) {
        await client.query(
          `UPDATE merchant_branches SET is_default = FALSE WHERE merchant_id = $1`,
          [merchantId],
        );
      }

      const result = await client.query(
        `INSERT INTO merchant_branches
           (merchant_id, name, name_en, city, address, phone, manager_name, is_default, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          merchantId,
          dto.name.trim(),
          dto.name_en?.trim() || null,
          dto.city?.trim() || null,
          dto.address?.trim() || null,
          dto.phone?.trim() || null,
          dto.manager_name?.trim() || null,
          dto.is_default ?? false,
          dto.sort_order ?? 0,
        ],
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // UPDATE branch
  // ------------------------------------------------------------------
  @Patch(":branchId")
  @ApiOperation({ summary: "Update a branch" })
  @ApiParam({ name: "branchId", description: "Branch UUID" })
  async updateBranch(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Body()
    dto: {
      name?: string;
      name_en?: string;
      city?: string;
      address?: string;
      phone?: string;
      manager_name?: string;
      is_active?: boolean;
      is_default?: boolean;
      sort_order?: number;
    },
  ) {
    const existing = await this.pool.query(
      `SELECT id, name, name_en
       FROM merchant_branches
       WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
    if (existing.rowCount === 0) throw new NotFoundException("الفرع غير موجود");

    const current = existing.rows[0] as {
      id: string;
      name: string | null;
      name_en: string | null;
    };
    const nextName =
      dto.name !== undefined ? dto.name?.trim() || "" : current.name;
    const nextNameEn =
      dto.name_en !== undefined ? dto.name_en?.trim() || "" : current.name_en;

    if (!nextName?.trim()) {
      throw new BadRequestException("اسم الفرع مطلوب");
    }

    const requestedNames = normalizedBranchNameSet(nextName, nextNameEn);
    if (requestedNames.size === 0) {
      throw new BadRequestException("اسم الفرع غير صالح");
    }

    const duplicates = await this.pool.query<{
      id: string;
      name: string | null;
      name_en: string | null;
    }>(
      `SELECT id::text as id, name, name_en
       FROM merchant_branches
       WHERE merchant_id = $1 AND id <> $2`,
      [merchantId, branchId],
    );

    const hasDuplicate = duplicates.rows.some((row) =>
      hasNormalizedNameOverlap(
        requestedNames,
        normalizedBranchNameSet(row.name, row.name_en),
      ),
    );
    if (hasDuplicate) {
      throw new ConflictException("اسم الفرع مستخدم بالفعل");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      if (dto.is_default) {
        await client.query(
          `UPDATE merchant_branches SET is_default = FALSE WHERE merchant_id = $1 AND id <> $2`,
          [merchantId, branchId],
        );
      }

      const result = await client.query(
        `UPDATE merchant_branches SET
           name         = COALESCE($3, name),
           name_en      = COALESCE($4, name_en),
           city         = COALESCE($5, city),
           address      = COALESCE($6, address),
           phone        = COALESCE($7, phone),
           manager_name = COALESCE($8, manager_name),
           is_active    = COALESCE($9, is_active),
           is_default   = COALESCE($10, is_default),
           sort_order   = COALESCE($11, sort_order),
           updated_at   = NOW()
         WHERE id = $1 AND merchant_id = $2
         RETURNING *`,
        [
          branchId,
          merchantId,
          dto.name?.trim() ?? null,
          dto.name_en?.trim() ?? null,
          dto.city?.trim() ?? null,
          dto.address?.trim() ?? null,
          dto.phone?.trim() ?? null,
          dto.manager_name?.trim() ?? null,
          dto.is_active ?? null,
          dto.is_default ?? null,
          dto.sort_order ?? null,
        ],
      );

      await client.query("COMMIT");
      return result.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // DELETE branch
  // ------------------------------------------------------------------
  @Delete(":branchId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a branch (cannot delete the default branch)",
  })
  @ApiParam({ name: "branchId", description: "Branch UUID" })
  async deleteBranch(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
  ) {
    const existing = await this.pool.query(
      `SELECT id, is_default FROM merchant_branches WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
    if (existing.rowCount === 0) throw new NotFoundException("الفرع غير موجود");
    if (existing.rows[0].is_default) {
      throw new ForbiddenException("لا يمكن حذف الفرع الافتراضي");
    }

    await this.pool.query(
      `DELETE FROM merchant_branches WHERE id = $1 AND merchant_id = $2`,
      [branchId, merchantId],
    );
  }
}

// ============================================================================
// CONTROLLER — BRANCH ANALYTICS
// ============================================================================

@ApiTags("Branches")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller("v1/branches")
export class BranchAnalyticsController {
  private readonly logger = new Logger(BranchAnalyticsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // Detect which column holds the order amount
  private orderAmountExpr(alias: string): string {
    const totalAmountTxt = `NULLIF(to_jsonb(${alias})->>'total_amount', '')`;
    const totalTxt = `NULLIF(to_jsonb(${alias})->>'total', '')`;
    return `COALESCE(
      NULLIF(CASE WHEN ${totalAmountTxt} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${totalAmountTxt})::numeric ELSE NULL END, 0),
      NULLIF(CASE WHEN ${totalTxt} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${totalTxt})::numeric ELSE NULL END, 0),
      0
    )`;
  }

  // -----------------------------------------------------------------------
  // GET /v1/branches/:branchId/analytics/summary
  // -----------------------------------------------------------------------
  @Get(":branchId/analytics/summary")
  @ApiOperation({
    summary: "Revenue, orders, expenses, net-profit summary for a branch",
  })
  @ApiParam({
    name: "branchId",
    description: "Branch UUID or 'all' for whole-merchant view",
  })
  @ApiQuery({ name: "days", required: false, type: Number })
  async getBranchSummary(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("days") daysStr?: string,
  ) {
    const days = parseIntParam(daysStr, 30);
    const amtExpr = this.orderAmountExpr("o");
    const expDateExpr = expenseDateExpr("e");
    const branchFilter = branchId === "all" ? "" : "AND o.branch_id = $2";
    const params: unknown[] =
      branchId === "all" ? [merchantId] : [merchantId, branchId];

    const ordersResult = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE o.status::text NOT IN ('CANCELLED','DRAFT')) AS total_orders,
         COALESCE(SUM(${amtExpr}) FILTER (WHERE o.status::text IN ('DELIVERED','COMPLETED')), 0) AS revenue,
         COALESCE(AVG(${amtExpr}) FILTER (WHERE o.status::text IN ('DELIVERED','COMPLETED')), 0) AS avg_order_value,
         COUNT(*) FILTER (WHERE o.status::text IN ('DELIVERED','COMPLETED')) AS completed_orders,
         COUNT(*) FILTER (WHERE o.status::text = 'CANCELLED') AS cancelled_orders,
         COALESCE(SUM(COALESCE(o.delivery_fee,0)) FILTER (WHERE o.status::text IN ('DELIVERED','COMPLETED')), 0) AS delivery_fees,
         COALESCE(SUM(COALESCE(o.discount,0)) FILTER (WHERE o.status::text IN ('DELIVERED','COMPLETED')), 0) AS discounts_given
       FROM orders o
       WHERE o.merchant_id = $1
         ${branchFilter}
         AND o.created_at >= NOW() - ($${params.length + 1}::int || ' days')::interval`,
      [...params, days],
    );

    // Previous period for trend
    const prevResult = await this.pool.query(
      `SELECT
         COALESCE(SUM(${amtExpr}), 0) AS revenue,
         COUNT(*) AS orders
       FROM orders o
       WHERE o.merchant_id = $1
         ${branchFilter}
         AND o.status::text IN ('DELIVERED','COMPLETED')
         AND o.created_at >= NOW() - ($${params.length + 1}::int * 2 || ' days')::interval
         AND o.created_at <  NOW() - ($${params.length + 1}::int || ' days')::interval`,
      [...params, days],
    );

    // Expenses for the period
    const expBranchFilter = branchId === "all" ? "" : "AND e.branch_id = $2";
    const expParams: unknown[] =
      branchId === "all" ? [merchantId] : [merchantId, branchId];
    const expResult = await this.pool.query(
      `SELECT COALESCE(SUM(e.amount), 0) AS total_expenses
       FROM expenses e
       WHERE e.merchant_id = $1
         ${expBranchFilter}
         AND ${expDateExpr} >= (CURRENT_DATE - ($${expParams.length + 1} || ' days')::interval)`,
      [...expParams, days],
    );

    const r = ordersResult.rows[0];
    const prev = prevResult.rows[0];
    const revenue = round2(pn(r.revenue));
    const prevRevenue = round2(pn(prev.revenue));
    const totalExpenses = round2(pn(expResult.rows[0].total_expenses));
    const netProfit = round2(revenue - totalExpenses);
    const revenueChange =
      prevRevenue > 0
        ? round2(((revenue - prevRevenue) / prevRevenue) * 100)
        : 0;

    return {
      branchId,
      periodDays: days,
      revenue,
      revenueChange,
      totalOrders: pi(r.total_orders),
      completedOrders: pi(r.completed_orders),
      cancelledOrders: pi(r.cancelled_orders),
      avgOrderValue: round2(pn(r.avg_order_value)),
      deliveryFeesCollected: round2(pn(r.delivery_fees)),
      discountsGiven: round2(pn(r.discounts_given)),
      totalExpenses,
      netProfit,
      margin: revenue > 0 ? round2((netProfit / revenue) * 100) : 0,
    };
  }

  // -----------------------------------------------------------------------
  // GET /v1/branches/:branchId/analytics/revenue-by-day
  // -----------------------------------------------------------------------
  @Get(":branchId/analytics/revenue-by-day")
  @ApiOperation({ summary: "Daily revenue trend for a branch" })
  @ApiParam({ name: "branchId" })
  @ApiQuery({ name: "days", required: false, type: Number })
  async getRevenueByDay(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("days") daysStr?: string,
  ) {
    const days = parseIntParam(daysStr, 30);
    const amtExpr = this.orderAmountExpr("o");
    const branchFilter = branchId === "all" ? "" : "AND o.branch_id = $2";
    const params: unknown[] =
      branchId === "all" ? [merchantId] : [merchantId, branchId];

    const result = await this.pool.query(
      `SELECT DATE(o.created_at) AS date,
              COALESCE(SUM(${amtExpr}), 0) AS revenue,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.merchant_id = $1
         ${branchFilter}
         AND o.status::text IN ('DELIVERED','COMPLETED')
         AND o.created_at >= NOW() - ($${params.length + 1} || ' days')::interval
       GROUP BY DATE(o.created_at)
       ORDER BY date ASC`,
      [...params, days],
    );

    return {
      branchId,
      periodDays: days,
      series: result.rows.map((row: any) => ({
        date: String(row.date).slice(0, 10),
        revenue: round2(pn(row.revenue)),
        orders: pi(row.orders),
      })),
    };
  }

  // -----------------------------------------------------------------------
  // GET /v1/branches/comparison
  // -----------------------------------------------------------------------
  @Get("_comparison")
  @ApiOperation({ summary: "Side-by-side KPI comparison for all branches" })
  @ApiQuery({ name: "days", required: false, type: Number })
  async compareBranches(
    @MerchantId() merchantId: string,
    @Query("days") daysStr?: string,
  ) {
    const days = parseIntParam(daysStr, 30);
    const amtExpr = this.orderAmountExpr("o");
    const expDateExpr = expenseDateExpr("e");
    const orderBranchExpr = branchIdTextExpr("o");
    const expenseBranchExpr = branchIdTextExpr("e");
    const expenseAmountExpr = jsonNumericExpr("e", "amount");

    // Get all branches
    let branchRows: any[] = [];
    try {
      const branchesResult = await this.pool.query(
        `SELECT id, name, name_en, is_active
         FROM merchant_branches
         WHERE merchant_id = $1
         ORDER BY sort_order, created_at`,
        [merchantId],
      );
      branchRows = branchesResult.rows;
    } catch (error: any) {
      if (error?.code === "42703") {
        const fallbackBranchesResult = await this.pool.query(
          `SELECT id, name, name_en, is_active
           FROM merchant_branches
           WHERE merchant_id = $1
           ORDER BY created_at`,
          [merchantId],
        );
        branchRows = fallbackBranchesResult.rows;
      } else {
        throw error;
      }
    }

    // Revenue + orders per branch
    let statsRows: any[] = [];
    try {
      const statsResult = await this.pool.query(
        `SELECT
           ${orderBranchExpr} AS branch_id,
           COALESCE(SUM(${amtExpr}), 0) AS revenue,
           COUNT(*) FILTER (WHERE o.status::text NOT IN ('CANCELLED','DRAFT')) AS total_orders,
           COUNT(*) FILTER (WHERE o.status::text IN ('DELIVERED','COMPLETED')) AS completed_orders,
           COALESCE(AVG(${amtExpr}) FILTER (WHERE o.status::text IN ('DELIVERED','COMPLETED')), 0) AS aov
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.status::text IN ('DELIVERED','COMPLETED')
           AND o.created_at >= NOW() - ($2 || ' days')::interval
         GROUP BY 1`,
        [merchantId, days],
      );
      statsRows = statsResult.rows;
    } catch (error: any) {
      if (
        error?.code === "42P01" ||
        error?.code === "42703" ||
        error?.code === "42883"
      ) {
        this.logger.warn(
          `Branch comparison: orders aggregation skipped (${error.code})`,
        );
      } else {
        throw error;
      }
    }

    // Expenses per branch
    let expRows: any[] = [];
    try {
      const expResult = await this.pool.query(
        `SELECT ${expenseBranchExpr} AS branch_id,
                COALESCE(SUM(${expenseAmountExpr}), 0) AS expenses
         FROM expenses e
         WHERE e.merchant_id = $1
           AND ${expDateExpr} >= CURRENT_DATE - ($2 || ' days')::interval
         GROUP BY 1`,
        [merchantId, days],
      );
      expRows = expResult.rows;
    } catch (error: any) {
      // Keep comparison endpoint available even on partial/legacy expense schemas.
      if (
        error?.code === "42P01" ||
        error?.code === "42703" ||
        error?.code === "42883"
      ) {
        this.logger.warn(
          `Branch comparison: expenses aggregation skipped (${error.code})`,
        );
      } else {
        throw error;
      }
    }

    const statsMap = new Map<string | null, any>();
    for (const row of statsRows) statsMap.set(row.branch_id, row);

    const expMap = new Map<string | null, number>();
    for (const row of expRows) expMap.set(row.branch_id, pn(row.expenses));

    const comparisons = branchRows.map((branch: any) => {
      const stats = statsMap.get(branch.id) ?? {};
      const expenses = expMap.get(branch.id) ?? 0;
      const revenue = round2(pn(stats.revenue));
      const netProfit = round2(revenue - expenses);
      return {
        branchId: branch.id,
        branchName: branch.name,
        branchNameEn: branch.name_en,
        isActive: branch.is_active,
        revenue,
        totalOrders: pi(stats.total_orders),
        completedOrders: pi(stats.completed_orders),
        avgOrderValue: round2(pn(stats.aov)),
        totalExpenses: round2(expenses),
        netProfit,
        margin: revenue > 0 ? round2((netProfit / revenue) * 100) : 0,
      };
    });

    // Also include unassigned (branch_id = NULL)
    const nullStats = statsMap.get(null) ?? {};
    const nullExpenses = expMap.get(null) ?? 0;
    const nullRevenue = round2(pn(nullStats.revenue));
    const nullNetProfit = round2(nullRevenue - nullExpenses);
    if (nullRevenue > 0 || nullExpenses > 0) {
      comparisons.push({
        branchId: null as any,
        branchName: "غير محدد",
        branchNameEn: "Unassigned",
        isActive: true,
        revenue: nullRevenue,
        totalOrders: pi(nullStats.total_orders),
        completedOrders: pi(nullStats.completed_orders),
        avgOrderValue: round2(pn(nullStats.aov)),
        totalExpenses: round2(nullExpenses),
        netProfit: nullNetProfit,
        margin:
          nullRevenue > 0 ? round2((nullNetProfit / nullRevenue) * 100) : 0,
      });
    }

    const totalRevenue = comparisons.reduce((s, b) => s + b.revenue, 0);
    return {
      periodDays: days,
      totalRevenue: round2(totalRevenue),
      branches: comparisons.map((b) => ({
        ...b,
        revenuePct:
          totalRevenue > 0 ? round2((b.revenue / totalRevenue) * 100) : 0,
      })),
    };
  }

  // -----------------------------------------------------------------------
  // GET /v1/branches/:branchId/analytics/top-products
  // -----------------------------------------------------------------------
  @Get(":branchId/analytics/top-products")
  @ApiOperation({ summary: "Top products sold in a branch" })
  @ApiParam({ name: "branchId" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getTopProducts(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("days") daysStr?: string,
    @Query("limit") limitStr?: string,
  ) {
    const days = parseIntParam(daysStr, 30);
    const limit = parseIntParam(limitStr, 10, 50);
    const branchFilter = branchId === "all" ? "" : "AND o.branch_id = $2";
    const params: unknown[] =
      branchId === "all" ? [merchantId] : [merchantId, branchId];

    const result = await this.pool.query(
      `SELECT
         COALESCE(NULLIF(item->>'name', ''), NULLIF(item->>'productName', ''), 'منتج') AS name,
         SUM(
           COALESCE(NULLIF(item->>'price', '')::decimal, NULLIF(item->>'unitPrice', '')::decimal, 0)
           * COALESCE(NULLIF(item->>'quantity', '')::int, NULLIF(item->>'qty', '')::int, 1)
         ) AS revenue,
         SUM(COALESCE(NULLIF(item->>'quantity', '')::int, NULLIF(item->>'qty', '')::int, 1)) AS qty
       FROM orders o, jsonb_array_elements(o.items) AS item
       WHERE o.merchant_id = $1
         ${branchFilter}
         AND o.status::text IN ('DELIVERED','COMPLETED')
         AND o.created_at >= NOW() - ($${params.length + 1} || ' days')::interval
       GROUP BY 1
       ORDER BY revenue DESC
       LIMIT $${params.length + 2}`,
      [...params, days, limit],
    );

    return {
      branchId,
      periodDays: days,
      products: result.rows.map((r: any) => ({
        name: r.name,
        revenue: round2(pn(r.revenue)),
        quantity: pi(r.qty),
      })),
    };
  }

  // -----------------------------------------------------------------------
  // GET /v1/branches/:branchId/analytics/expenses-breakdown
  // -----------------------------------------------------------------------
  @Get(":branchId/analytics/expenses-breakdown")
  @ApiOperation({ summary: "Expense breakdown by category for a branch" })
  @ApiParam({ name: "branchId" })
  @ApiQuery({ name: "days", required: false, type: Number })
  async getExpensesBreakdown(
    @MerchantId() merchantId: string,
    @Param("branchId") branchId: string,
    @Query("days") daysStr?: string,
  ) {
    const days = parseIntParam(daysStr, 30);
    const branchFilter = branchId === "all" ? "" : "AND e.branch_id = $2";
    const expDateExpr = expenseDateExpr("e");
    const params: unknown[] =
      branchId === "all" ? [merchantId] : [merchantId, branchId];

    const result = await this.pool.query(
      `SELECT category,
              COALESCE(SUM(amount), 0) AS total,
              COUNT(*) AS count
       FROM expenses e
       WHERE merchant_id = $1
         ${branchFilter}
         AND ${expDateExpr} >= CURRENT_DATE - ($${params.length + 1} || ' days')::interval
       GROUP BY category
       ORDER BY total DESC`,
      [...params, days],
    );

    const grandTotal = result.rows.reduce(
      (s: number, r: any) => s + pn(r.total),
      0,
    );

    return {
      branchId,
      periodDays: days,
      total: round2(grandTotal),
      categories: result.rows.map((r: any) => ({
        category: r.category,
        total: round2(pn(r.total)),
        count: pi(r.count),
        pct: grandTotal > 0 ? round2((pn(r.total) / grandTotal) * 100) : 0,
      })),
    };
  }
}
