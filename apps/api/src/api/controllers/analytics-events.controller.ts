import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";

@ApiTags("Analytics Events")
@Controller("v1/portal/analytics")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class AnalyticsEventsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Post("events")
  @ApiOperation({ summary: "Track analytics event" })
  async trackEvent(
    @Req() req: any,
    @Body()
    body: {
      eventName: string;
      properties?: Record<string, any>;
      sessionId?: string;
      source?: string;
      path?: string;
      staffId?: string;
    },
  ) {
    const merchantId = req?.merchantId;
    const userAgent = req?.headers?.["user-agent"];
    const ipAddress = req?.ip;

    await this.pool.query(
      `INSERT INTO analytics_events (
        merchant_id, staff_id, event_name, event_properties, session_id, source, path, user_agent, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        merchantId,
        body.staffId || null,
        body.eventName,
        JSON.stringify(body.properties || {}),
        body.sessionId || null,
        body.source || "portal",
        body.path || null,
        userAgent || null,
        ipAddress || null,
      ],
    );

    return { success: true };
  }

  @Get("events")
  @ApiOperation({ summary: "List recent analytics events (merchant)" })
  @ApiQuery({ name: "limit", required: false })
  async listEvents(@Req() req: any, @Query("limit") limit?: string) {
    const merchantId = req?.merchantId;
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 200) : 50;
    const result = await this.pool.query(
      `SELECT * FROM analytics_events WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [merchantId, parsedLimit],
    );
    return { events: result.rows };
  }
}

@ApiTags("Analytics Events (Admin)")
@Controller("admin/analytics/events")
@UseGuards(AdminApiKeyGuard)
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
export class AnalyticsEventsAdminController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get()
  @ApiOperation({ summary: "List analytics events (admin)" })
  @ApiQuery({ name: "merchantId", required: false })
  @ApiQuery({ name: "limit", required: false })
  async listAll(
    @Query("merchantId") merchantId?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 500) : 100;
    const params: any[] = [];
    const filters: string[] = [];
    if (merchantId) {
      params.push(merchantId);
      filters.push(`merchant_id = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await this.pool.query(
      `SELECT * FROM analytics_events ${where} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
      [...params, parsedLimit],
    );

    return { events: result.rows };
  }
}
