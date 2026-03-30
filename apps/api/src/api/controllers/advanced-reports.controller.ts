import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  BadRequestException,
  UsePipes,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiSecurity,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
} from "class-validator";
import { Pool } from "pg";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresAgent,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantId } from "../../shared/decorators/merchant-id.decorator";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe";
import {
  TaxReportSchema,
  CashFlowForecastQuerySchema,
  PeriodQuerySchema,
  ReceiveLotSchema,
  MergeSkusSchema,
  FifoCOGSSchema,
  SaveMemorySchema,
  AiDecisionQuerySchema,
} from "../schemas/advanced-reports.schemas";

// ============================================================================
// DTOs
// ============================================================================

class TaxReportDto {
  @IsString()
  periodStart!: string;

  @IsString()
  periodEnd!: string;

  @IsOptional()
  includeExempt?: boolean;
}

class CashFlowForecastDto {
  @IsNumber()
  @IsOptional()
  @Min(7)
  @Max(90)
  forecastDays?: number;
}

class PeriodQueryDto {
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(365)
  periodDays?: number;
}

class ReceiveLotDto {
  @IsString()
  itemId!: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsString()
  lotNumber!: string;

  @IsString()
  @IsOptional()
  batchId?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

class MergeSkusDto {
  @IsString()
  sourceItemId!: string;

  @IsString()
  targetItemId!: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

class SaveMemoryDto {
  @IsString()
  customerId!: string;

  @IsString()
  memoryType!: string;

  @IsString()
  key!: string;

  @IsString()
  value!: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsNumber()
  @IsOptional()
  confidence?: number;
}

class FifoCOGSDto {
  @IsString()
  itemId!: string;

  @IsNumber()
  @Min(1)
  quantitySold!: number;
}

// ============================================================================
// CONTROLLER — FINANCE REPORTS
// ============================================================================

@ApiTags("Finance Reports")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("KPI_DASHBOARD")
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller("v1/finance-reports")
export class FinanceReportsController {
  private readonly logger = new Logger(FinanceReportsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // Read order amount safely across schemas that may use either `total` or `total_amount`.
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
    return `COALESCE(
      NULLIF((to_jsonb(${alias})->>'delivery_fee'), '')::numeric,
      NULLIF((to_jsonb(${alias})->>'deliveryFee'), '')::numeric,
      0
    )`;
  }

  // Support both modern `expense_date` and legacy `date` fields.
  private expenseDateExpr(alias: string): string {
    return `COALESCE(
      NULLIF((to_jsonb(${alias})->>'expense_date'), '')::date,
      NULLIF((to_jsonb(${alias})->>'date'), '')::date,
      ${alias}.created_at::date
    )`;
  }

  @Post(":merchantId/tax-report")
  @ApiOperation({ summary: "Generate VAT 14% tax report for a period" })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generateTaxReport(
    @Param("merchantId") merchantId: string,
    @Body(new ZodValidationPipe(TaxReportSchema)) dto: TaxReportDto,
  ) {
    const VAT_RATE = 0.14;
    const parseNumber = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const round2 = (value: number): number => Math.round(value * 100) / 100;
    const formatPercent = (value: number): string => {
      const rounded = round2(value);
      return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)}%`;
    };
    const extractVatFromAmount = (
      amount: number,
      rate: number,
      includeVatInPrice: boolean,
    ): number => {
      if (rate <= 0 || amount <= 0) return 0;
      if (includeVatInPrice) {
        return round2((amount * rate) / (1 + rate));
      }
      return round2(amount * rate);
    };
    const NON_DEDUCTIBLE_EXPENSE_PATTERNS = [
      /salary/i,
      /salaries/i,
      /wage/i,
      /payroll/i,
      /rent/i,
      /lease/i,
      /مرتبات/u,
      /رواتب/u,
      /ايجار/u,
      /إيجار/u,
      /اجار/u,
    ];
    const isTaxDeductibleExpense = (row: any): boolean => {
      const text =
        `${row?.category ?? ""} ${row?.subcategory ?? ""} ${row?.description ?? ""}`.toLowerCase();
      return !NON_DEDUCTIBLE_EXPENSE_PATTERNS.some((pattern) =>
        pattern.test(text),
      );
    };

    const orderAmountExpr = this.orderAmountExpr("o");
    const orderDiscountExpr = this.orderDiscountExpr("o");
    const orderDeliveryFeeExpr = this.orderDeliveryFeeExpr("o");
    const expenseDateExpr = this.expenseDateExpr("e");
    const configResult = await this.pool.query(
      `SELECT * FROM merchant_tax_config WHERE merchant_id = $1 LIMIT 1`,
      [merchantId],
    );
    const taxConfig = configResult.rows[0];
    const configuredVatRatePct = taxConfig?.vat_rate
      ? parseNumber(taxConfig.vat_rate)
      : VAT_RATE * 100;
    const includeVatInPrice = taxConfig?.include_vat_in_price !== false;
    const taxEnabled = taxConfig ? taxConfig.tax_enabled !== false : true;
    // Default: delivery is taxable unless merchant explicitly disables it in config.
    const includeDeliveryInTax = taxConfig?.include_delivery_in_tax !== false;
    const effectiveVatRate = taxEnabled ? configuredVatRatePct / 100 : 0;
    const vatRatePct = round2(effectiveVatRate * 100);

    const ordersResult = await this.pool.query(
      `SELECT COUNT(*) as total_orders,
              COALESCE(SUM(${orderAmountExpr}), 0) as gross_revenue,
              COALESCE(SUM(CASE WHEN ${orderDiscountExpr} > 0 THEN ${orderDiscountExpr} ELSE 0 END), 0) as total_discounts,
              COALESCE(SUM(${orderDeliveryFeeExpr}), 0) as total_delivery_fees
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.status::text IN ('DELIVERED', 'COMPLETED')
         AND o.created_at >= $2::date
         AND o.created_at < ($3::date + INTERVAL '1 day')`,
      [merchantId, dto.periodStart, dto.periodEnd],
    );
    const orders = ordersResult.rows[0];
    const grossRevenue = round2(parseNumber(orders.gross_revenue));
    const totalDiscounts = round2(parseNumber(orders.total_discounts));
    const totalDeliveryFees = round2(parseNumber(orders.total_delivery_fees));
    // `orders.total` is already the final order amount; don't subtract discounts again.
    const taxableSalesBase = round2(
      Math.max(
        grossRevenue - (includeDeliveryInTax ? 0 : totalDeliveryFees),
        0,
      ),
    );
    const netRevenue = taxableSalesBase;
    const vatOnSales = extractVatFromAmount(
      taxableSalesBase,
      effectiveVatRate,
      includeVatInPrice,
    );

    const expensesResult = await this.pool.query(
      `SELECT e.amount, e.category, e.subcategory, e.description
       FROM expenses e
       WHERE e.merchant_id = $1
         AND ${expenseDateExpr} >= $2::date
         AND ${expenseDateExpr} <= $3::date`,
      [merchantId, dto.periodStart, dto.periodEnd],
    );
    const expenseRows = expensesResult.rows || [];
    const totalExpenses = round2(
      expenseRows.reduce(
        (sum: number, row: any) => sum + parseNumber(row.amount),
        0,
      ),
    );
    const deductibleExpenseRows = expenseRows.filter((row: any) =>
      isTaxDeductibleExpense(row),
    );
    const deductibleExpenses = round2(
      deductibleExpenseRows.reduce(
        (sum: number, row: any) => sum + parseNumber(row.amount),
        0,
      ),
    );
    const nonDeductibleExpenses = round2(totalExpenses - deductibleExpenses);
    const vatOnPurchases = extractVatFromAmount(
      deductibleExpenses,
      effectiveVatRate,
      includeVatInPrice,
    );

    const refundsResult = await this.pool.query(
      `SELECT COUNT(*) as total_refunds, COALESCE(SUM(amount), 0) as refund_total FROM refunds
       WHERE merchant_id = $1
         AND created_at >= $2::date
         AND created_at < ($3::date + INTERVAL '1 day')
         AND status = 'APPROVED'`,
      [merchantId, dto.periodStart, dto.periodEnd],
    );
    const refundTotal = round2(parseNumber(refundsResult.rows[0].refund_total));
    const vatOnRefunds = extractVatFromAmount(
      refundTotal,
      effectiveVatRate,
      includeVatInPrice,
    );
    const netVatPayable = round2(vatOnSales - vatOnPurchases - vatOnRefunds);

    // Persist with compatibility between old and new tax_reports schemas.
    const totalOrders = parseInt(orders.total_orders, 10) || 0;
    const reportMetadata = JSON.stringify({
      grossRevenue,
      totalDiscounts,
      totalDeliveryFees,
      taxableSalesBase,
      netRevenue,
      vatOnPurchases,
      vatOnRefunds,
      vatRatePct,
      totalExpenses,
      deductibleExpenses,
      nonDeductibleExpenses,
      deductibleExpenseCount: deductibleExpenseRows.length,
      totalExpenseCount: expenseRows.length,
      refundTotal,
      includeVatInPrice,
      includeDeliveryInTax,
      taxEnabled,
    });

    try {
      const updated = await this.pool.query(
        `UPDATE tax_reports
         SET total_sales = $4,
             total_vat_collected = $5,
             total_input_vat = $6,
             net_vat_payable = $7,
             order_count = $8,
             status = 'FINAL',
             metadata = COALESCE(metadata, '{}'::jsonb) || $9::jsonb,
             generated_at = NOW()
         WHERE merchant_id = $1 AND period_start = $2 AND period_end = $3`,
        [
          merchantId,
          dto.periodStart,
          dto.periodEnd,
          netRevenue,
          vatOnSales,
          vatOnPurchases + vatOnRefunds,
          netVatPayable,
          totalOrders,
          reportMetadata,
        ],
      );

      if ((updated.rowCount || 0) === 0) {
        await this.pool.query(
          `INSERT INTO tax_reports (
             merchant_id, period_start, period_end,
             total_sales, total_vat_collected, total_input_vat,
             net_vat_payable, order_count, status, metadata, generated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FINAL', $9::jsonb, NOW())`,
          [
            merchantId,
            dto.periodStart,
            dto.periodEnd,
            netRevenue,
            vatOnSales,
            vatOnPurchases + vatOnRefunds,
            netVatPayable,
            totalOrders,
            reportMetadata,
          ],
        );
      }
    } catch (error: any) {
      if (error?.code !== "42703") {
        throw error;
      }

      const updatedLegacy = await this.pool.query(
        `UPDATE tax_reports
         SET gross_revenue = $4,
             net_revenue = $5,
             vat_collected = $6,
             expenses_vat = $7,
             refunds_vat = $8,
             net_vat_payable = $9,
             vat_rate = $10,
             status = 'GENERATED'
         WHERE merchant_id = $1 AND period_start = $2 AND period_end = $3`,
        [
          merchantId,
          dto.periodStart,
          dto.periodEnd,
          grossRevenue,
          netRevenue,
          vatOnSales,
          vatOnPurchases,
          vatOnRefunds,
          netVatPayable,
          vatRatePct,
        ],
      );

      if ((updatedLegacy.rowCount || 0) === 0) {
        await this.pool.query(
          `INSERT INTO tax_reports (
             merchant_id, period_start, period_end,
             gross_revenue, net_revenue, vat_collected, expenses_vat, refunds_vat,
             net_vat_payable, vat_rate, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'GENERATED')`,
          [
            merchantId,
            dto.periodStart,
            dto.periodEnd,
            grossRevenue,
            netRevenue,
            vatOnSales,
            vatOnPurchases,
            vatOnRefunds,
            netVatPayable,
            vatRatePct,
          ],
        );
      }
    }

    return {
      period: { start: dto.periodStart, end: dto.periodEnd },
      vatRate: formatPercent(vatRatePct),
      vatRatePct,
      taxEnabled,
      includeVatInPrice,
      includeDeliveryInTax,
      totalOrders,
      grossRevenue,
      totalDiscounts,
      netRevenue,
      vatOnSales,
      totalDeliveryFees,
      taxableSalesBase,
      totalExpenses,
      deductibleExpenses,
      nonDeductibleExpenses,
      deductibleExpenseCount: deductibleExpenseRows.length,
      totalExpenseCount: expenseRows.length,
      vatOnPurchases,
      refundTotal,
      vatOnRefunds,
      netVatPayable,
      taxRegistrationNo:
        taxConfig?.vat_registration_number ||
        taxConfig?.tax_registration_no ||
        null,
    };
  }

  @Get(":merchantId/cash-flow-forecast")
  @ApiOperation({ summary: "Forecast cash flow for the next N days" })
  @ApiQuery({
    name: "forecastDays",
    required: false,
    description: "Fallback period days when startDate/endDate are not provided",
  })
  @ApiQuery({ name: "startDate", required: false, description: "YYYY-MM-DD" })
  @ApiQuery({ name: "endDate", required: false, description: "YYYY-MM-DD" })
  async forecastCashFlow(
    @Param("merchantId") merchantId: string,
    @Query("forecastDays") forecastDays?: string,
    @Query("startDate") startDateRaw?: string,
    @Query("endDate") endDateRaw?: string,
  ) {
    const parseDateOnly = (value?: string): Date | null => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const d = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const toDateOnly = (date: Date): string => date.toISOString().split("T")[0];
    const parseNumber = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const round2 = (value: number): number => Math.round(value * 100) / 100;

    const rawDays = parseInt(forecastDays || "30", 10);
    const daysFromQuery = Number.isFinite(rawDays)
      ? Math.min(Math.max(rawDays, 7), 90)
      : 30;

    const parsedStart = parseDateOnly(startDateRaw);
    const parsedEnd = parseDateOnly(endDateRaw);
    if ((startDateRaw && !parsedStart) || (endDateRaw && !parsedEnd)) {
      throw new BadRequestException(
        "startDate/endDate must be in YYYY-MM-DD format",
      );
    }
    if ((parsedStart && !parsedEnd) || (!parsedStart && parsedEnd)) {
      throw new BadRequestException(
        "startDate and endDate must be provided together",
      );
    }

    let startDate: Date;
    let endDate: Date;
    if (parsedStart && parsedEnd) {
      startDate = parsedStart;
      endDate = parsedEnd;
      if (endDate < startDate) {
        throw new BadRequestException("endDate must be on or after startDate");
      }
    } else {
      endDate = new Date();
      endDate.setHours(0, 0, 0, 0);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - (daysFromQuery - 1));
    }

    const periodDays = Math.max(
      1,
      Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
    );
    const orderAmountExpr = this.orderAmountExpr("o");
    const expenseDateExpr = this.expenseDateExpr("e");
    const cashFlow = await this.pool.query(
      `WITH days AS (
         SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
       ),
       revenue_by_day AS (
         SELECT DATE(o.created_at) AS day,
                COALESCE(SUM(${orderAmountExpr}), 0) AS revenue
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.status::text IN ('DELIVERED', 'COMPLETED')
           AND o.created_at >= $2::date
           AND o.created_at < ($3::date + interval '1 day')
         GROUP BY DATE(o.created_at)
       ),
       expenses_by_day AS (
         SELECT ${expenseDateExpr} AS day,
                COALESCE(SUM(e.amount), 0) AS expenses
         FROM expenses e
         WHERE e.merchant_id = $1
           AND ${expenseDateExpr} >= $2::date
           AND ${expenseDateExpr} <= $3::date
         GROUP BY ${expenseDateExpr}
       )
       SELECT d.day,
              COALESCE(r.revenue, 0)::numeric AS revenue,
              COALESCE(x.expenses, 0)::numeric AS expenses
       FROM days d
       LEFT JOIN revenue_by_day r ON r.day = d.day
       LEFT JOIN expenses_by_day x ON x.day = d.day
       ORDER BY d.day`,
      [merchantId, toDateOnly(startDate), toDateOnly(endDate)],
    );

    const forecast: Array<{
      date: string;
      projectedRevenue: number;
      projectedExpenses: number;
      netCashFlow: number;
    }> = cashFlow.rows.map((row: any) => {
      const projectedRevenue = round2(parseNumber(row.revenue));
      const projectedExpenses = round2(parseNumber(row.expenses));
      const netCashFlow = round2(projectedRevenue - projectedExpenses);
      return {
        date: toDateOnly(new Date(row.day)),
        projectedRevenue,
        projectedExpenses,
        netCashFlow,
      };
    });

    const projectedMonthlyRevenue = round2(
      forecast.reduce((sum, day) => sum + day.projectedRevenue, 0),
    );
    const projectedMonthlyExpenses = round2(
      forecast.reduce((sum, day) => sum + day.projectedExpenses, 0),
    );
    const projectedNetCashFlow = round2(
      projectedMonthlyRevenue - projectedMonthlyExpenses,
    );
    const daysWithActivity = forecast.filter(
      (day) => day.projectedRevenue !== 0 || day.projectedExpenses !== 0,
    ).length;
    const activityRatio = periodDays > 0 ? daysWithActivity / periodDays : 0;
    const confidenceLevel =
      activityRatio >= 0.66 ? "HIGH" : activityRatio >= 0.33 ? "MEDIUM" : "LOW";

    return {
      forecastDays: periodDays,
      period: {
        startDate: toDateOnly(startDate),
        endDate: toDateOnly(endDate),
      },
      forecast,
      summary: {
        projectedMonthlyRevenue,
        projectedMonthlyExpenses,
        projectedNetCashFlow,
        confidenceLevel,
        daysWithActivity,
      },
    };
  }

  @Get(":merchantId/discount-impact")
  @ApiOperation({ summary: "Analyze discount impact on revenue" })
  async analyzeDiscountImpact(
    @Param("merchantId") merchantId: string,
    @Query("periodDays") periodDaysStr?: string,
  ) {
    const rawDays = parseInt(periodDaysStr || "30");
    const days = Number.isNaN(rawDays)
      ? 30
      : Math.min(Math.max(rawDays, 1), 365);
    const orderAmountExpr = this.orderAmountExpr("o");
    const orderDiscountExpr = this.orderDiscountExpr("o");

    const comparison = await this.pool.query(
      `SELECT CASE WHEN ${orderDiscountExpr} > 0 THEN 'DISCOUNTED' ELSE 'FULL_PRICE' END as category,
              COUNT(*) as order_count,
              COALESCE(SUM(${orderAmountExpr}), 0) as revenue,
              COALESCE(AVG(${orderAmountExpr}), 0) as avg_order_value,
              COALESCE(SUM(${orderDiscountExpr}), 0) as total_discount
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.status::text IN ('DELIVERED', 'COMPLETED')
         AND o.created_at >= NOW() - (($2 || ' days')::interval)
       GROUP BY CASE WHEN ${orderDiscountExpr} > 0 THEN 'DISCOUNTED' ELSE 'FULL_PRICE' END`,
      [merchantId, days.toString()],
    );

    const byCode = await this.pool.query(
      `SELECT COALESCE(NULLIF(to_jsonb(o)->>'discount_code', ''), 'NO_CODE') as discount_code,
              COUNT(*) as order_count,
              SUM(${orderAmountExpr}) as revenue,
              SUM(${orderDiscountExpr}) as total_discount,
              COUNT(DISTINCT COALESCE(NULLIF(to_jsonb(o)->>'customer_phone', ''), NULLIF(to_jsonb(o)->>'phone', ''), 'UNKNOWN')) as unique_customers
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.status::text IN ('DELIVERED', 'COMPLETED')
         AND o.created_at >= NOW() - (($2 || ' days')::interval)
         AND ${orderDiscountExpr} > 0
       GROUP BY COALESCE(NULLIF(to_jsonb(o)->>'discount_code', ''), 'NO_CODE')
       ORDER BY total_discount DESC
       LIMIT 20`,
      [merchantId, days.toString()],
    );

    const discountedRow = comparison.rows.find(
      (r: any) => r.category === "DISCOUNTED",
    );
    const fullPriceRow = comparison.rows.find(
      (r: any) => r.category === "FULL_PRICE",
    );

    return {
      period: `${days} days`,
      overview: {
        discountedOrders: parseInt(discountedRow?.order_count || "0"),
        fullPriceOrders: parseInt(fullPriceRow?.order_count || "0"),
        totalDiscount:
          Math.round(parseFloat(discountedRow?.total_discount || "0") * 100) /
          100,
        totalRevenue:
          Math.round(
            (parseFloat(discountedRow?.revenue || "0") +
              parseFloat(fullPriceRow?.revenue || "0")) *
              100,
          ) / 100,
      },
      avgOrderValue: {
        discounted:
          Math.round(parseFloat(discountedRow?.avg_order_value || "0") * 100) /
          100,
        fullPrice:
          Math.round(parseFloat(fullPriceRow?.avg_order_value || "0") * 100) /
          100,
      },
      byCode: byCode.rows.map((r: any) => ({
        code: r.discount_code,
        orders: parseInt(r.order_count),
        uniqueCustomers: parseInt(r.unique_customers),
        discount: Math.round(parseFloat(r.total_discount) * 100) / 100,
        revenue: Math.round(parseFloat(r.revenue) * 100) / 100,
      })),
    };
  }

  @Get(":merchantId/revenue-by-channel")
  @ApiOperation({ summary: "Revenue breakdown by source channel" })
  async getRevenueByChannel(
    @Param("merchantId") merchantId: string,
    @Query("periodDays") periodDaysStr?: string,
  ) {
    const rawDays = parseInt(periodDaysStr || "30");
    const days = Number.isNaN(rawDays)
      ? 30
      : Math.min(Math.max(rawDays, 1), 365);
    const orderAmountExpr = this.orderAmountExpr("o");

    const result = await this.pool.query(
      `SELECT COALESCE(NULLIF(to_jsonb(o)->>'source_channel', ''), 'WHATSAPP') as channel,
              COUNT(*) as order_count,
              SUM(${orderAmountExpr}) as revenue,
              AVG(${orderAmountExpr}) as avg_order_value,
              COUNT(DISTINCT COALESCE(NULLIF(to_jsonb(o)->>'customer_phone', ''), NULLIF(to_jsonb(o)->>'phone', ''), 'UNKNOWN')) as unique_customers,
              SUM(
                CASE
                  WHEN COALESCE(NULLIF(to_jsonb(o)->>'payment_status', ''), '') = 'PAID'
                  THEN ${orderAmountExpr}
                  ELSE 0
                END
              ) as collected_revenue
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.created_at >= NOW() - (($2 || ' days')::interval)
         AND o.status::text NOT IN ('CANCELLED', 'DRAFT')
       GROUP BY COALESCE(NULLIF(to_jsonb(o)->>'source_channel', ''), 'WHATSAPP')
       ORDER BY revenue DESC`,
      [merchantId, days.toString()],
    );

    const totalRevenue = result.rows.reduce(
      (s: number, r: any) => s + parseFloat(r.revenue || "0"),
      0,
    );

    return {
      periodDays: days,
      channels: result.rows.map((r: any) => ({
        channel: r.channel,
        orders: parseInt(r.order_count),
        revenue: Math.round(parseFloat(r.revenue) * 100) / 100,
        revenuePct:
          totalRevenue > 0
            ? Math.round((parseFloat(r.revenue) / totalRevenue) * 10000) / 100
            : 0,
        avgOrderValue: Math.round(parseFloat(r.avg_order_value) * 100) / 100,
        uniqueCustomers: parseInt(r.unique_customers),
        collectedRevenue:
          Math.round(parseFloat(r.collected_revenue) * 100) / 100,
      })),
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    };
  }

  @Get(":merchantId/refund-analysis")
  @ApiOperation({ summary: "Full refund analysis with trends" })
  async getRefundAnalysis(
    @Param("merchantId") merchantId: string,
    @Query("periodDays") periodDaysStr?: string,
  ) {
    const rawDays = parseInt(periodDaysStr || "30");
    const days = Number.isNaN(rawDays)
      ? 30
      : Math.min(Math.max(rawDays, 1), 365);

    const summary = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_refunds,
         COUNT(*) FILTER (WHERE status = 'PENDING') as pending_refunds,
         COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0) as total_refunded,
         COALESCE(AVG(amount) FILTER (WHERE status = 'APPROVED'), 0) as avg_refund
       FROM refunds WHERE merchant_id = $1 AND created_at >= NOW() - (($2 || ' days')::interval)`,
      [merchantId, days.toString()],
    );

    const byReason = await this.pool.query(
      `SELECT COALESCE(reason, 'UNSPECIFIED') as reason, COUNT(*) as count, SUM(amount) as total_amount
       FROM refunds WHERE merchant_id = $1 AND created_at >= NOW() - (($2 || ' days')::interval) AND status = 'APPROVED'
       GROUP BY reason ORDER BY total_amount DESC`,
      [merchantId, days.toString()],
    );

    const ordersCount = await this.pool.query(
      `SELECT COUNT(*) as total_orders
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.created_at >= NOW() - (($2 || ' days')::interval)
         AND o.status::text IN ('DELIVERED', 'COMPLETED')`,
      [merchantId, days.toString()],
    );

    const totalOrders = parseInt(ordersCount.rows[0].total_orders);
    const totalRefunded = parseFloat(summary.rows[0].total_refunded);
    const approvedRefunds = parseInt(summary.rows[0].approved_refunds);

    return {
      period: `${days} days`,
      summary: {
        approvedRefunds,
        pendingRefunds: parseInt(summary.rows[0].pending_refunds),
        totalRefunded: Math.round(totalRefunded * 100) / 100,
        avgRefund:
          Math.round(parseFloat(summary.rows[0].avg_refund) * 100) / 100,
        refundRate:
          totalOrders > 0
            ? Math.round((approvedRefunds / totalOrders) * 10000) / 100
            : 0,
      },
      byReason: byReason.rows.map((r: any) => ({
        reason: r.reason,
        count: parseInt(r.count),
        totalAmount: Math.round(parseFloat(r.total_amount) * 100) / 100,
      })),
    };
  }

  @Get(":merchantId/tax-reports")
  @ApiOperation({ summary: "List generated tax reports" })
  async listTaxReports(@Param("merchantId") merchantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM tax_reports WHERE merchant_id = $1 ORDER BY period_end DESC LIMIT 24`,
      [merchantId],
    );
    return { reports: result.rows };
  }
}

// ============================================================================
// CONTROLLER — ADVANCED INVENTORY
// ============================================================================

@ApiTags("Advanced Inventory")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("INVENTORY")
@RequiresAgent("INVENTORY_AGENT")
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller("v1/inventory-advanced")
export class AdvancedInventoryController {
  private readonly logger = new Logger(AdvancedInventoryController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get(":merchantId/expiry-alerts")
  @ApiOperation({ summary: "Get perishable expiry alerts" })
  async getExpiryAlerts(@Param("merchantId") merchantId: string) {
    const variantOnHandExpr = `COALESCE(
      NULLIF((to_jsonb(iv)->>'quantity_on_hand'), '')::numeric,
      NULLIF((to_jsonb(iv)->>'quantity_available'), '')::numeric,
      NULLIF((to_jsonb(iv)->>'stock_quantity'), '')::numeric,
      0
    )`;
    const stockByLocationExpr = `COALESCE((
      SELECT SUM(COALESCE(sbl.quantity_on_hand, 0))
      FROM inventory_stock_by_location sbl
      WHERE sbl.variant_id = iv.id
        AND sbl.merchant_id = iv.merchant_id
    ), 0)`;
    const effectiveVariantQtyExpr = `GREATEST(${variantOnHandExpr}, ${stockByLocationExpr})`;
    const catalogStockExpr = `COALESCE(NULLIF(to_jsonb(ci)->>'stock_quantity', '')::numeric, 0)`;

    const result = await this.pool.query(
      `SELECT ea.*,
              COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS item_name,
              COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS sku
       FROM expiry_alerts ea
       JOIN catalog_items ci ON ci.id = ea.item_id
       WHERE ea.merchant_id = $1 AND ea.acknowledged = false
       ORDER BY ea.days_until_expiry ASC`,
      [merchantId],
    );

    let alertRows = result.rows;
    let source: "persisted" | "calculated" = "persisted";

    // If worker alert jobs did not run yet, derive alerts directly from lots/item expiry dates.
    if (alertRows.length === 0) {
      const derived = await this.pool.query(
        `WITH lot_alerts AS (
           SELECT
             CONCAT('lot:', il.id::text) AS id,
             il.item_id,
             COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS item_name,
             COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), NULLIF(il.lot_number, ''), '-') AS sku,
             il.expiry_date,
             (il.expiry_date::date - CURRENT_DATE) AS days_until_expiry,
             CASE
               WHEN il.expiry_date < CURRENT_DATE THEN 'EXPIRED'
               WHEN il.expiry_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'CRITICAL'
               WHEN il.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'WARNING'
               ELSE NULL
             END AS alert_type,
             GREATEST(COALESCE(il.quantity, 0), 0) AS quantity_at_risk
           FROM inventory_lots il
           JOIN catalog_items ci ON ci.id = il.item_id
           WHERE il.merchant_id = $1
             AND il.status = 'ACTIVE'
             AND il.expiry_date IS NOT NULL
             AND COALESCE(il.quantity, 0) > 0
             AND il.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
         ),
         variant_item_stock AS (
           SELECT ii.catalog_item_id AS item_id, SUM(${effectiveVariantQtyExpr}) AS qty
           FROM inventory_items ii
           JOIN inventory_variants iv ON iv.inventory_item_id = ii.id AND iv.merchant_id = ii.merchant_id
           WHERE ii.merchant_id = $1
             AND ${effectiveVariantQtyExpr} > 0
           GROUP BY ii.catalog_item_id
         ),
         item_stock AS (
           SELECT
             ci.id AS item_id,
             GREATEST(COALESCE(vis.qty, 0), ${catalogStockExpr}) AS qty
           FROM catalog_items ci
           LEFT JOIN variant_item_stock vis ON vis.item_id = ci.id
           WHERE ci.merchant_id = $1
         ),
         item_alerts AS (
           SELECT
             CONCAT('item:', ci.id::text) AS id,
             ci.id AS item_id,
             COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS item_name,
             COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS sku,
             ci.expiry_date,
             (ci.expiry_date::date - CURRENT_DATE) AS days_until_expiry,
             CASE
               WHEN ci.expiry_date < CURRENT_DATE THEN 'EXPIRED'
               WHEN ci.expiry_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'CRITICAL'
               WHEN ci.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'WARNING'
               ELSE NULL
             END AS alert_type,
             COALESCE(s.qty, 0) AS quantity_at_risk
           FROM catalog_items ci
           JOIN item_stock s ON s.item_id = ci.id
           WHERE ci.merchant_id = $1
             AND ci.expiry_date IS NOT NULL
             AND ci.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
             AND COALESCE(s.qty, 0) > 0
             AND NOT EXISTS (
               SELECT 1
               FROM lot_alerts la
               WHERE la.item_id = ci.id
             )
         )
         SELECT *
         FROM (
           SELECT * FROM lot_alerts
           UNION ALL
           SELECT * FROM item_alerts
         ) alerts
         WHERE alert_type IS NOT NULL
         ORDER BY days_until_expiry ASC, item_name ASC`,
        [merchantId],
      );
      alertRows = derived.rows;
      source = "calculated";
    }

    const missingExpiryCountResult = await this.pool.query(
      `WITH variant_item_stock AS (
         SELECT ii.catalog_item_id AS item_id, SUM(${effectiveVariantQtyExpr}) AS qty
         FROM inventory_items ii
         JOIN inventory_variants iv ON iv.inventory_item_id = ii.id AND iv.merchant_id = ii.merchant_id
         WHERE ii.merchant_id = $1
           AND ${effectiveVariantQtyExpr} > 0
         GROUP BY ii.catalog_item_id
       ),
       stocked_items AS (
         SELECT
           ci.id,
           ci.expiry_date,
           GREATEST(COALESCE(vis.qty, 0), ${catalogStockExpr}) AS qty
         FROM catalog_items ci
         LEFT JOIN variant_item_stock vis ON vis.item_id = ci.id
         WHERE ci.merchant_id = $1
       ),
       items_with_lot_expiry AS (
         SELECT DISTINCT item_id
         FROM inventory_lots
         WHERE merchant_id = $1
           AND expiry_date IS NOT NULL
           AND COALESCE(quantity, 0) > 0
       )
       SELECT COUNT(*)::int AS count
       FROM stocked_items si
       WHERE si.qty > 0
         AND si.expiry_date IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM items_with_lot_expiry lot
           WHERE lot.item_id = si.id
         )`,
      [merchantId],
    );

    const missingExpiryDates = await this.pool.query(
      `WITH variant_item_stock AS (
         SELECT ii.catalog_item_id AS item_id, SUM(${effectiveVariantQtyExpr}) AS qty
         FROM inventory_items ii
         JOIN inventory_variants iv ON iv.inventory_item_id = ii.id AND iv.merchant_id = ii.merchant_id
         WHERE ii.merchant_id = $1
           AND ${effectiveVariantQtyExpr} > 0
         GROUP BY ii.catalog_item_id
       ),
       stocked_items AS (
         SELECT
           ci.id,
           COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS sku,
           COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS item_name,
           ci.expiry_date,
           GREATEST(COALESCE(vis.qty, 0), ${catalogStockExpr}) AS qty
         FROM catalog_items ci
         LEFT JOIN variant_item_stock vis ON vis.item_id = ci.id
         WHERE ci.merchant_id = $1
       ),
       items_with_lot_expiry AS (
         SELECT DISTINCT item_id
         FROM inventory_lots
         WHERE merchant_id = $1
           AND expiry_date IS NOT NULL
           AND COALESCE(quantity, 0) > 0
       )
       SELECT si.id, si.item_name, si.sku
       FROM stocked_items si
       WHERE si.qty > 0
         AND si.expiry_date IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM items_with_lot_expiry lot
           WHERE lot.item_id = si.id
         )
       ORDER BY si.item_name ASC
       LIMIT 5`,
      [merchantId],
    );

    const alerts = alertRows.map((r) => ({
      id: r.id,
      itemName: r.item_name,
      sku: r.sku,
      expiryDate: r.expiry_date,
      daysLeft: Number.parseInt(String(r.days_until_expiry ?? "0"), 10) || 0,
      alertType: r.alert_type,
      quantityAtRisk:
        Number.parseInt(String(r.quantity_at_risk ?? "0"), 10) || 0,
    }));

    return {
      alerts,
      summary: {
        expired: alerts.filter((r) => r.alertType === "EXPIRED").length,
        critical: alerts.filter((r) => r.alertType === "CRITICAL").length,
        warning: alerts.filter((r) => r.alertType === "WARNING").length,
        missingExpiryDates:
          Number.parseInt(
            String(missingExpiryCountResult.rows[0]?.count || "0"),
            10,
          ) || 0,
      },
      missingExpiryItems: missingExpiryDates.rows.map((r) => ({
        id: r.id,
        itemName: r.item_name,
        sku: r.sku,
      })),
      source,
    };
  }

  @Post(":merchantId/expiry-alerts/:alertId/acknowledge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Acknowledge an expiry alert" })
  async acknowledgeExpiryAlert(
    @Param("merchantId") merchantId: string,
    @Param("alertId") alertId: string,
  ) {
    await this.pool.query(
      `UPDATE expiry_alerts SET acknowledged = true, action_taken = 'ACKNOWLEDGED', updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [alertId, merchantId],
    );
    return { acknowledged: true };
  }

  @Post(":merchantId/lots")
  @ApiOperation({ summary: "Receive stock with lot/batch tracking" })
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async receiveLot(
    @Param("merchantId") merchantId: string,
    @Body(new ZodValidationPipe(ReceiveLotSchema)) dto: ReceiveLotDto,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const lotResult = await client.query(
        `INSERT INTO inventory_lots (merchant_id, item_id, variant_id, lot_number, batch_id, quantity, cost_price, expiry_date, supplier_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          merchantId,
          dto.itemId,
          dto.variantId,
          dto.lotNumber,
          dto.batchId,
          dto.quantity,
          dto.costPrice,
          dto.expiryDate || null,
          dto.supplierId,
          dto.notes,
        ],
      );
      const lotId = lotResult.rows[0].id;

      await client.query(
        `INSERT INTO inventory_cost_layers (merchant_id, item_id, variant_id, lot_id, quantity_remaining, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          merchantId,
          dto.itemId,
          dto.variantId,
          lotId,
          dto.quantity,
          dto.costPrice,
        ],
      );

      await client.query(
        `WITH target_variant AS (
           SELECT iv.id
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           WHERE iv.merchant_id = $2
             AND (
               ($3::uuid IS NOT NULL AND iv.id = $3::uuid)
               OR ($3::uuid IS NULL AND ($4::uuid = ii.id OR $4::uuid = ii.catalog_item_id))
             )
           ORDER BY iv.created_at ASC
           LIMIT 1
         )
         UPDATE inventory_variants iv
         SET quantity_on_hand = iv.quantity_on_hand + $1, updated_at = NOW()
         FROM target_variant tv
         WHERE iv.id = tv.id`,
        [dto.quantity, merchantId, dto.variantId || null, dto.itemId],
      );

      if (dto.expiryDate) {
        await client.query(
          `UPDATE catalog_items SET is_perishable = true, expiry_date = LEAST(COALESCE(expiry_date, $2::date), $2::date), updated_at = NOW() WHERE id = $1`,
          [dto.itemId, dto.expiryDate],
        );
      }

      await client.query("COMMIT");
      return {
        lotId,
        lotNumber: dto.lotNumber,
        quantity: dto.quantity,
        costPrice: dto.costPrice,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Get(":merchantId/lots")
  @ApiOperation({ summary: "Get lot tracking report" })
  async getLotReport(
    @Param("merchantId") merchantId: string,
    @Query("itemId") itemId?: string,
  ) {
    const params = itemId ? [merchantId, itemId] : [merchantId];
    const query = itemId
      ? `SELECT il.*,
                COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS item_name,
                COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS sku
         FROM inventory_lots il
         JOIN catalog_items ci ON ci.id = il.item_id
         WHERE il.merchant_id = $1 AND il.item_id = $2
         ORDER BY il.received_date DESC`
      : `SELECT il.*,
                COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS item_name,
                COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS sku
         FROM inventory_lots il
         JOIN catalog_items ci ON ci.id = il.item_id
         WHERE il.merchant_id = $1
         ORDER BY il.received_date DESC
         LIMIT 100`;

    const result = await this.pool.query(query, params);
    return {
      lots: result.rows.map((r) => ({
        id: r.id,
        lotNumber: r.lot_number,
        batchId: r.batch_id,
        itemName: r.item_name,
        sku: r.sku,
        quantity: r.quantity,
        costPrice: parseFloat(r.cost_price),
        receivedDate: r.received_date,
        expiryDate: r.expiry_date,
        status: r.status,
      })),
      count: result.rows.length,
    };
  }

  @Get(":merchantId/valuation-fifo")
  @ApiOperation({ summary: "Full FIFO inventory valuation" })
  async getInventoryValuationFifo(@Param("merchantId") merchantId: string) {
    const variantOnHandExpr = `COALESCE(
      NULLIF((to_jsonb(iv)->>'quantity_on_hand'), '')::numeric,
      NULLIF((to_jsonb(iv)->>'quantity_available'), '')::numeric,
      NULLIF((to_jsonb(iv)->>'stock_quantity'), '')::numeric,
      0
    )`;
    const stockByLocationExpr = `COALESCE((
      SELECT SUM(COALESCE(sbl.quantity_on_hand, 0))
      FROM inventory_stock_by_location sbl
      WHERE sbl.variant_id = iv.id
        AND sbl.merchant_id = iv.merchant_id
    ), 0)`;
    const variantEffectiveQtyExpr = `GREATEST(${variantOnHandExpr}, ${stockByLocationExpr})`;
    const variantCostExpr = `COALESCE(
      NULLIF((to_jsonb(iv)->>'cost_price'), '')::numeric,
      NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric,
      0
    )`;
    const priceModifierExpr = `COALESCE(NULLIF((to_jsonb(iv)->>'price_modifier'), '')::numeric, 0)`;
    const catalogRetailExpr = `COALESCE(
      NULLIF(to_jsonb(ci)->>'price', '')::numeric,
      NULLIF(to_jsonb(ci)->>'base_price', '')::numeric,
      0
    )`;
    const catalogStockExpr = `COALESCE(NULLIF(to_jsonb(ci)->>'stock_quantity', '')::numeric, 0)`;
    const catalogCostExpr = `COALESCE(NULLIF(to_jsonb(ci)->>'cost_price', '')::numeric, 0)`;

    let result = await this.pool.query(
      `WITH item_dim AS (
         SELECT
           ci.id,
           COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS name,
           COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS sku,
           COALESCE(NULLIF(to_jsonb(ci)->>'category', ''), 'غير مصنف') AS category,
           COALESCE(
             NULLIF(to_jsonb(ci)->>'price', '')::numeric,
             NULLIF(to_jsonb(ci)->>'base_price', '')::numeric,
             0
           ) AS retail_price
         FROM catalog_items ci
         WHERE ci.merchant_id = $1
       )
       SELECT idm.id, idm.name, idm.sku, idm.category,
              SUM(icl.quantity_remaining) as total_qty,
              SUM(icl.quantity_remaining * icl.unit_cost) as total_cost,
              AVG(icl.unit_cost) as weighted_avg_cost,
              idm.retail_price,
              SUM(icl.quantity_remaining * idm.retail_price) as total_retail
       FROM inventory_cost_layers icl
       JOIN item_dim idm ON idm.id = icl.item_id
       WHERE icl.merchant_id = $1 AND icl.quantity_remaining > 0
       GROUP BY idm.id, idm.name, idm.sku, idm.category, idm.retail_price
       ORDER BY total_cost DESC`,
      [merchantId],
    );

    let method: "FIFO" | "ESTIMATED_AVERAGE" = "FIFO";
    if (result.rows.length === 0) {
      result = await this.pool.query(
        `WITH variant_base AS (
           SELECT
             COALESCE(ci.id, ii.id) AS id,
             ii.id AS inventory_item_id,
             COUNT(*) OVER (PARTITION BY ii.id) AS item_variant_count,
             COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), NULLIF(to_jsonb(ii)->>'name', ''), NULLIF(to_jsonb(ii)->>'sku', ''), 'صنف') AS item_name,
             COALESCE(NULLIF(to_jsonb(iv)->>'name', ''), NULLIF(to_jsonb(ii)->>'name', ''), NULLIF(to_jsonb(ii)->>'sku', ''), NULLIF(to_jsonb(iv)->>'sku', ''), 'صنف') AS variant_name,
             COALESCE(NULLIF(to_jsonb(ii)->>'sku', ''), NULLIF(to_jsonb(ci)->>'sku', ''), NULLIF(to_jsonb(iv)->>'sku', ''), '-') AS item_sku,
             COALESCE(NULLIF(to_jsonb(iv)->>'sku', ''), NULLIF(to_jsonb(ii)->>'sku', ''), NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS variant_sku,
             COALESCE(NULLIF(to_jsonb(ci)->>'category', ''), NULLIF(to_jsonb(ii)->>'category', ''), 'غير مصنف') AS category,
             ${variantEffectiveQtyExpr} AS quantity,
             ${variantCostExpr} AS unit_cost,
             COALESCE(${catalogRetailExpr} + ${priceModifierExpr}, 0) AS unit_retail
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id
           WHERE iv.merchant_id = $1
             AND ${variantEffectiveQtyExpr} > 0
         )
         SELECT
           id,
           CASE WHEN item_variant_count > 1 THEN variant_name ELSE item_name END AS name,
           CASE WHEN item_variant_count > 1 THEN variant_sku ELSE item_sku END AS sku,
           category,
           SUM(quantity) AS total_qty,
           SUM(quantity * unit_cost) AS total_cost,
           CASE
             WHEN SUM(quantity) > 0
             THEN SUM(quantity * unit_cost) / SUM(quantity)
             ELSE 0
           END AS weighted_avg_cost,
           CASE
             WHEN SUM(quantity) > 0
             THEN SUM(quantity * unit_retail) / SUM(quantity)
             ELSE 0
           END AS retail_price,
           SUM(quantity * unit_retail) AS total_retail
         FROM variant_base
         GROUP BY id,
                  CASE WHEN item_variant_count > 1 THEN variant_name ELSE item_name END,
                  CASE WHEN item_variant_count > 1 THEN variant_sku ELSE item_sku END,
                  category
         ORDER BY total_cost DESC`,
        [merchantId],
      );
      method = "ESTIMATED_AVERAGE";
    }

    if (result.rows.length === 0) {
      result = await this.pool.query(
        `SELECT
           ci.id,
           COALESCE(NULLIF(to_jsonb(ci)->>'name_ar', ''), NULLIF(to_jsonb(ci)->>'name_en', ''), NULLIF(to_jsonb(ci)->>'name', ''), 'صنف') AS name,
           COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), '-') AS sku,
           COALESCE(NULLIF(to_jsonb(ci)->>'category', ''), 'غير مصنف') AS category,
           ${catalogStockExpr} AS total_qty,
           (${catalogStockExpr} * ${catalogCostExpr}) AS total_cost,
           ${catalogCostExpr} AS weighted_avg_cost,
           ${catalogRetailExpr} AS retail_price,
           (${catalogStockExpr} * ${catalogRetailExpr}) AS total_retail
         FROM catalog_items ci
         WHERE ci.merchant_id = $1
           AND ${catalogStockExpr} > 0
         ORDER BY total_cost DESC`,
        [merchantId],
      );
      method = "ESTIMATED_AVERAGE";
    }

    const totalCostValue = result.rows.reduce(
      (s, r) => s + parseFloat(r.total_cost || "0"),
      0,
    );
    const totalRetailValue = result.rows.reduce((sum, row) => {
      const totalRetail = Number.parseFloat(String(row.total_retail));
      if (Number.isFinite(totalRetail)) {
        return sum + totalRetail;
      }

      const qty = Number.parseFloat(String(row.total_qty || "0"));
      const retailPrice = Number.parseFloat(String(row.retail_price || "0"));
      return (
        sum +
        (Number.isFinite(qty) ? qty : 0) *
          (Number.isFinite(retailPrice) ? retailPrice : 0)
      );
    }, 0);

    return {
      method,
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        category: r.category,
        quantity: parseInt(String(r.total_qty || "0"), 10) || 0,
        costValue: Math.round(parseFloat(r.total_cost) * 100) / 100,
        weightedAvgCost:
          Math.round(parseFloat(r.weighted_avg_cost) * 100) / 100,
        retailPrice: parseFloat(r.retail_price),
      })),
      summary: {
        totalCostValue: Math.round(totalCostValue * 100) / 100,
        totalRetailValue: Math.round(totalRetailValue * 100) / 100,
        overallMarginPct:
          totalRetailValue > 0
            ? Math.round(
                ((totalRetailValue - totalCostValue) / totalRetailValue) *
                  10000,
              ) / 100
            : 0,
        itemCount: result.rows.length,
      },
    };
  }

  @Post(":merchantId/fifo-cogs")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Calculate FIFO COGS for a sale" })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async calculateFifoCogs(
    @Param("merchantId") merchantId: string,
    @Body(new ZodValidationPipe(FifoCOGSSchema)) dto: FifoCOGSDto,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const layers = await client.query(
        `SELECT id, lot_id, quantity_remaining, unit_cost FROM inventory_cost_layers
         WHERE merchant_id = $1 AND item_id = $2 AND quantity_remaining > 0 ORDER BY received_at ASC`,
        [merchantId, dto.itemId],
      );

      let remaining = dto.quantitySold;
      let totalCogs = 0;
      const layersUsed: Array<{
        lotId: string;
        quantity: number;
        unitCost: number;
        subtotal: number;
      }> = [];

      for (const layer of layers.rows) {
        if (remaining <= 0) break;
        const useQty = Math.min(remaining, layer.quantity_remaining);
        const subtotal = useQty * parseFloat(layer.unit_cost);
        totalCogs += subtotal;
        remaining -= useQty;

        await client.query(
          `UPDATE inventory_cost_layers SET quantity_remaining = quantity_remaining - $1 WHERE id = $2`,
          [useQty, layer.id],
        );
        layersUsed.push({
          lotId: layer.lot_id,
          quantity: useQty,
          unitCost: parseFloat(layer.unit_cost),
          subtotal,
        });
      }

      await client.query("COMMIT");
      return { totalCogs: Math.round(totalCogs * 100) / 100, layersUsed };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Get(":merchantId/duplicate-skus")
  @ApiOperation({ summary: "Detect potential duplicate SKUs" })
  async detectDuplicateSkus(@Param("merchantId") merchantId: string) {
    const result = await this.pool.query(
      `SELECT
              a.id as id_a,
              COALESCE(NULLIF(to_jsonb(a)->>'name_ar', ''), NULLIF(to_jsonb(a)->>'name_en', ''), NULLIF(to_jsonb(a)->>'name', ''), 'صنف') as name_a,
              COALESCE(NULLIF(to_jsonb(a)->>'sku', ''), '-') as sku_a,
              COALESCE(NULLIF(to_jsonb(a)->>'price', '')::numeric, NULLIF(to_jsonb(a)->>'base_price', '')::numeric, 0) as price_a,
              b.id as id_b,
              COALESCE(NULLIF(to_jsonb(b)->>'name_ar', ''), NULLIF(to_jsonb(b)->>'name_en', ''), NULLIF(to_jsonb(b)->>'name', ''), 'صنف') as name_b,
              COALESCE(NULLIF(to_jsonb(b)->>'sku', ''), '-') as sku_b,
              COALESCE(NULLIF(to_jsonb(b)->>'price', '')::numeric, NULLIF(to_jsonb(b)->>'base_price', '')::numeric, 0) as price_b,
              1.0 as name_similarity
       FROM catalog_items a JOIN catalog_items b ON a.merchant_id = b.merchant_id AND a.id < b.id
       WHERE a.merchant_id = $1
         AND COALESCE(NULLIF(to_jsonb(a)->>'is_active', '')::boolean, true) = true
         AND COALESCE(NULLIF(to_jsonb(b)->>'is_active', '')::boolean, true) = true
         AND (
              LOWER(TRIM(COALESCE(NULLIF(to_jsonb(a)->>'name_ar', ''), NULLIF(to_jsonb(a)->>'name_en', ''), NULLIF(to_jsonb(a)->>'name', '')))
              ) =
              LOWER(TRIM(COALESCE(NULLIF(to_jsonb(b)->>'name_ar', ''), NULLIF(to_jsonb(b)->>'name_en', ''), NULLIF(to_jsonb(b)->>'name', '')))
              )
              OR (
                COALESCE(NULLIF(to_jsonb(a)->>'sku', ''), NULL) IS NOT NULL
                AND COALESCE(NULLIF(to_jsonb(b)->>'sku', ''), NULL) IS NOT NULL
                AND LOWER(COALESCE(NULLIF(to_jsonb(a)->>'sku', ''), '')) = LOWER(COALESCE(NULLIF(to_jsonb(b)->>'sku', ''), ''))
              )
         )
       ORDER BY name_a
       LIMIT 20`,
      [merchantId],
    );
    return {
      duplicates: result.rows.map((r) => ({
        itemA: {
          id: r.id_a,
          name: r.name_a,
          sku: r.sku_a,
          price: parseFloat(r.price_a || "0"),
        },
        itemB: {
          id: r.id_b,
          name: r.name_b,
          sku: r.sku_b,
          price: parseFloat(r.price_b || "0"),
        },
        similarity: parseFloat(r.name_similarity),
      })),
      count: result.rows.length,
    };
  }

  @Post(":merchantId/merge-skus")
  @ApiOperation({ summary: "Merge two duplicate SKUs" })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async mergeSkus(
    @Param("merchantId") merchantId: string,
    @Body(new ZodValidationPipe(MergeSkusSchema)) dto: MergeSkusDto,
  ) {
    if (dto.sourceItemId === dto.targetItemId) {
      throw new BadRequestException(
        "Source and target items must be different",
      );
    }

    const variantOnHandExpr = `COALESCE(
      NULLIF((to_jsonb(iv)->>'quantity_on_hand'), '')::numeric,
      NULLIF((to_jsonb(iv)->>'quantity_available'), '')::numeric,
      NULLIF((to_jsonb(iv)->>'stock_quantity'), '')::numeric,
      0
    )`;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const sourceResult = await client.query(
        `SELECT ci.id,
                COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), ci.id::text) as source_sku,
                COALESCE(SUM(${variantOnHandExpr}), 0) as total_stock
         FROM catalog_items ci
         LEFT JOIN inventory_items ii
           ON ii.catalog_item_id = ci.id AND ii.merchant_id = ci.merchant_id
         LEFT JOIN inventory_variants iv
           ON iv.inventory_item_id = ii.id AND iv.merchant_id = ci.merchant_id
         WHERE ci.id = $1 AND ci.merchant_id = $2 GROUP BY ci.id`,
        [dto.sourceItemId, merchantId],
      );
      if (sourceResult.rows.length === 0)
        throw new BadRequestException("Source item not found");
      const source = sourceResult.rows[0];
      const sourceVariantStock =
        Number.parseFloat(String(source.total_stock || "0")) || 0;
      const sourceCatalogStockResult = await client.query(
        `SELECT COALESCE(NULLIF(to_jsonb(ci)->>'stock_quantity', '')::numeric, 0) AS catalog_stock
         FROM catalog_items ci
         WHERE ci.id = $1 AND ci.merchant_id = $2
         LIMIT 1`,
        [dto.sourceItemId, merchantId],
      );
      const sourceCatalogStock =
        Number.parseFloat(
          String(sourceCatalogStockResult.rows[0]?.catalog_stock || "0"),
        ) || 0;
      const sourceStock = Math.round(
        Math.max(sourceVariantStock, sourceCatalogStock),
      );
      const sourceSku = String(source.source_sku || dto.sourceItemId);
      const targetResult = await client.query(
        `SELECT COALESCE(NULLIF(to_jsonb(ci)->>'sku', ''), ci.id::text) as sku
         FROM catalog_items ci
         WHERE ci.id = $1 AND ci.merchant_id = $2
         LIMIT 1`,
        [dto.targetItemId, merchantId],
      );
      if (targetResult.rows.length === 0)
        throw new BadRequestException("Target item not found");
      const targetSku = String(targetResult.rows[0].sku || dto.targetItemId);

      // Transfer cost layers, lots, and inventory ownership to the target SKU.
      await client.query(
        `UPDATE inventory_cost_layers SET item_id = $1 WHERE item_id = $2 AND merchant_id = $3`,
        [dto.targetItemId, dto.sourceItemId, merchantId],
      );
      await client.query(
        `UPDATE inventory_lots SET item_id = $1 WHERE item_id = $2 AND merchant_id = $3`,
        [dto.targetItemId, dto.sourceItemId, merchantId],
      );
      await client.query(
        `UPDATE inventory_items
         SET catalog_item_id = $1, updated_at = NOW()
         WHERE merchant_id = $2 AND catalog_item_id = $3`,
        [dto.targetItemId, merchantId, dto.sourceItemId],
      );
      if (sourceCatalogStock > 0) {
        try {
          await client.query(
            `UPDATE catalog_items
             SET stock_quantity = COALESCE(stock_quantity, 0) + $1, updated_at = NOW()
             WHERE id = $2 AND merchant_id = $3`,
            [sourceCatalogStock, dto.targetItemId, merchantId],
          );
          await client.query(
            `UPDATE catalog_items
             SET stock_quantity = 0, updated_at = NOW()
             WHERE id = $1 AND merchant_id = $2`,
            [dto.sourceItemId, merchantId],
          );
        } catch (error: any) {
          if (error?.code !== "42703") {
            throw error;
          }
        }
      }
      await client.query(
        `UPDATE catalog_items SET is_active = false, name = name || ' [MERGED]', updated_at = NOW() WHERE id = $1`,
        [dto.sourceItemId],
      );

      await client.query(
        `INSERT INTO sku_merge_log (merchant_id, source_sku, target_sku, source_item_id, target_item_id, merged_quantity, merged_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, 'portal', $7)`,
        [
          merchantId,
          sourceSku,
          targetSku,
          dto.sourceItemId,
          dto.targetItemId,
          sourceStock,
          dto.reason || null,
        ],
      );

      await client.query("COMMIT");
      return {
        merged: true,
        sourceItemId: dto.sourceItemId,
        targetItemId: dto.targetItemId,
        stockTransferred: sourceStock,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

// ============================================================================
// CONTROLLER — CUSTOMER MEMORY & AI AUDIT
// ============================================================================

@ApiTags("Customer Intelligence")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@Throttle({ default: { limit: 40, ttl: 60000 } })
@Controller("v1/intelligence")
export class CustomerIntelligenceController {
  private readonly logger = new Logger(CustomerIntelligenceController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get(":merchantId/customer-memory/:customerId")
  @ApiOperation({ summary: "Get stored memories for a customer" })
  async getCustomerMemory(
    @Param("merchantId") merchantId: string,
    @Param("customerId") customerId: string,
    @Query("type") memoryType?: string,
  ) {
    const params: any[] = [merchantId, customerId];
    let typeFilter = "";
    if (memoryType && /^[A-Z_]{1,50}$/.test(memoryType)) {
      typeFilter = " AND memory_type = $3";
      params.push(memoryType);
    }

    const result = await this.pool.query(
      `SELECT id, memory_type, key, value, source, confidence, access_count, created_at
       FROM customer_memory WHERE merchant_id = $1 AND customer_id = $2${typeFilter}
       ORDER BY confidence DESC, access_count DESC`,
      params,
    );
    return {
      customerId,
      memories: result.rows,
      totalMemories: result.rows.length,
    };
  }

  @Post(":merchantId/customer-memory")
  @ApiOperation({ summary: "Save a customer memory fact" })
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async saveCustomerMemory(
    @Param("merchantId") merchantId: string,
    @Body(new ZodValidationPipe(SaveMemorySchema)) dto: SaveMemoryDto,
  ) {
    await this.pool.query(
      `INSERT INTO customer_memory (merchant_id, customer_id, memory_type, key, value, source, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (merchant_id, customer_id, memory_type, key) DO UPDATE SET
         value = EXCLUDED.value, access_count = customer_memory.access_count + 1,
         last_accessed_at = NOW(), updated_at = NOW()`,
      [
        merchantId,
        dto.customerId,
        dto.memoryType,
        dto.key,
        dto.value,
        dto.source || "PORTAL",
        dto.confidence || 0.8,
      ],
    );
    return { saved: true, customerId: dto.customerId, key: dto.key };
  }

  @Get(":merchantId/ai-decisions")
  @ApiOperation({ summary: "Query AI decision audit trail" })
  async getAiDecisionLog(
    @Param("merchantId") merchantId: string,
    @Query("agentType") agentType?: string,
    @Query("decisionType") decisionType?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("limit") limitStr?: string,
  ) {
    // Sanitize enum-like query params
    const safeEnum = (v?: string) =>
      v && /^[A-Z_]{1,50}$/.test(v) ? v : undefined;
    const safeId = (v?: string) =>
      v && /^[a-zA-Z0-9_-]{1,128}$/.test(v) ? v : undefined;
    const cleanAgentType = safeEnum(agentType);
    const cleanDecisionType = safeEnum(decisionType);
    const cleanEntityType = safeEnum(entityType);
    const cleanEntityId = safeId(entityId);

    const conditions = ["merchant_id = $1"];
    const params: any[] = [merchantId];
    let idx = 2;

    if (cleanAgentType) {
      conditions.push(`agent_type = $${idx++}`);
      params.push(cleanAgentType);
    }
    if (cleanDecisionType) {
      conditions.push(`decision_type = $${idx++}`);
      params.push(cleanDecisionType);
    }
    if (cleanEntityType) {
      conditions.push(`entity_type = $${idx++}`);
      params.push(cleanEntityType);
    }
    if (cleanEntityId) {
      conditions.push(`entity_id = $${idx++}`);
      params.push(cleanEntityId);
    }

    const rawLimit = parseInt(limitStr || "50");
    const limit = Number.isNaN(rawLimit)
      ? 50
      : Math.min(Math.max(rawLimit, 1), 200);
    params.push(limit);

    const result = await this.pool.query(
      `SELECT id, agent_type, decision_type, input_summary, decision, reasoning, entity_type, entity_id, confidence, metadata, created_at
       FROM ai_decision_log WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${idx}`,
      params,
    );

    const stats = await this.pool.query(
      `SELECT agent_type, decision_type, COUNT(*) as count
       FROM ai_decision_log WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY agent_type, decision_type ORDER BY count DESC LIMIT 20`,
      [merchantId],
    );

    return {
      decisions: result.rows,
      count: result.rows.length,
      weeklyStats: stats.rows,
    };
  }
}
