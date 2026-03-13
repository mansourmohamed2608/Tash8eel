import {
  Controller,
  Get,
  Inject,
  Logger,
  Req,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import {
  getMerchantId,
  toNumber,
  parseWindow,
} from "./portal-compat.helpers";

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

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

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
    const orderAmountExpr = `COALESCE(
      NULLIF((to_jsonb(o)->>'total'), '')::numeric,
      NULLIF((to_jsonb(o)->>'total_amount'), '')::numeric,
      0
    )`;

    const [ordersResult, statusResult, conversationsResult, customersResult] =
      await Promise.all([
        this.pool.query<{
          total_orders: string;
          delivered_orders: string;
          total_revenue: string;
        }>(
          `SELECT
           COUNT(*)::text as total_orders,
           COUNT(*) FILTER (WHERE status::text IN ('DELIVERED', 'COMPLETED'))::text as delivered_orders,
           COALESCE(SUM(CASE WHEN status::text IN ('DELIVERED', 'COMPLETED') THEN ${orderAmountExpr} ELSE 0 END), 0)::text as total_revenue
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.created_at >= $2
           AND o.created_at <= $3`,
          [merchantId, window.startDate, window.endDate],
        ),
        this.pool.query<{ status: string; count: string; revenue: string }>(
          `SELECT
           status::text as status,
           COUNT(*)::text as count,
           COALESCE(SUM(${orderAmountExpr}), 0)::text as revenue
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

    const totalOrders = toNumber(ordersResult.rows[0]?.total_orders, 0);
    const deliveredOrders = toNumber(
      ordersResult.rows[0]?.delivered_orders,
      0,
    );
    const totalRevenue = toNumber(ordersResult.rows[0]?.total_revenue, 0);

    return {
      period: {
        startDate: window.startDate.toISOString(),
        endDate: window.endDate.toISOString(),
        days: window.days,
      },
      summary: {
        totalOrders,
        deliveredOrders,
        totalRevenue,
        avgOrderValue:
          totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
        conversionRate:
          toNumber(conversationsResult.rows[0]?.count, 0) > 0
            ? Number(
                (
                  (deliveredOrders /
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
