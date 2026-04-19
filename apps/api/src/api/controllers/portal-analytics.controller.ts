import {
  Controller,
  Get,
  Inject,
  Logger,
  Req,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { CommerceFactsService } from "../../application/services/commerce-facts.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import { getMerchantId, toNumber, parseWindow } from "./portal-compat.helpers";

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalAnalyticsController {
  private readonly logger = new Logger(PortalAnalyticsController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly commerceFactsService: CommerceFactsService,
  ) {}

  @Get("analytics")
  @ApiOperation({
    summary: "Generic analytics summary endpoint (portal compatibility)",
  })
  async getGenericAnalytics(
    @Req() req: Request,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("days") days?: string,
  ) {
    const merchantId = getMerchantId(req);
    const window = parseWindow(days, startDate, endDate);
    const [summary, statusResult, conversationsResult, customersResult] =
      await Promise.all([
        this.commerceFactsService.buildFinanceSummary(
          merchantId,
          window.startDate,
          window.endDate,
        ),
        this.pool.query<{ status: string; count: string; revenue: string }>(
          `SELECT
           status::text as status,
           COUNT(*)::text as count,
           COALESCE(
             SUM(
               COALESCE(
                 NULLIF((to_jsonb(o)->>'total'), '')::numeric,
                 NULLIF((to_jsonb(o)->>'total_amount'), '')::numeric,
                 0
               )
             ),
             0
           )::text as revenue
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.created_at >= $2
           AND o.created_at <= $3
         GROUP BY status
         ORDER BY COUNT(*) DESC`,
          [merchantId, window.startDate, window.endDate],
        ),
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text as count
         FROM conversations
         WHERE merchant_id = $1
           AND created_at >= $2
           AND created_at <= $3`,
          [merchantId, window.startDate, window.endDate],
        ),
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text as count
         FROM customers
         WHERE merchant_id = $1
           AND created_at >= $2
           AND created_at <= $3`,
          [merchantId, window.startDate, window.endDate],
        ),
      ]);

    return {
      period: {
        startDate: window.startDate.toISOString(),
        endDate: window.endDate.toISOString(),
        days: window.days,
      },
      summary: {
        totalOrders: summary.totalOrders,
        deliveredOrders: summary.deliveredOrders,
        totalRevenue: summary.realizedRevenue,
        realizedRevenue: summary.realizedRevenue,
        bookedSales: summary.bookedSales,
        deliveredRevenue: summary.deliveredRevenue,
        pendingCollections: summary.pendingCollections,
        refundsAmount: summary.refundsAmount,
        netCashFlow: summary.netCashFlow,
        realizedOrders: summary.realizedOrders,
        paidCashAmount: summary.paidCashAmount,
        paidOnlineAmount: summary.paidOnlineAmount,
        pendingCod: summary.pendingCod,
        pendingOnline: summary.pendingOnline,
        avgOrderValue:
          summary.totalOrders > 0
            ? Number((summary.realizedRevenue / summary.totalOrders).toFixed(2))
            : 0,
        conversionRate:
          toNumber(conversationsResult.rows[0]?.count, 0) > 0
            ? Number(
                (
                  (summary.deliveredOrders /
                    toNumber(conversationsResult.rows[0]?.count, 0)) *
                  100
                ).toFixed(2),
              )
            : 0,
        conversations: toNumber(conversationsResult.rows[0]?.count, 0),
        newCustomers: toNumber(customersResult.rows[0]?.count, 0),
      },
      ordersByStatus: statusResult.rows.map((row) => ({
        status: row.status,
        count: toNumber(row.count, 0),
        revenue: toNumber(row.revenue, 0),
      })),
    };
  }
}
