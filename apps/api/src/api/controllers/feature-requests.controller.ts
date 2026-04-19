import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { Inject } from "@nestjs/common";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";

@ApiTags("Feature Requests")
@Controller("v1/portal/feature-requests")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class FeatureRequestsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get()
  @ApiOperation({ summary: "List feature requests for merchant" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "category", required: false })
  async listMerchantRequests(
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Req() req?: any,
  ) {
    // merchantId from guard
    const merchantId = (req as any)?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const filters: string[] = ["merchant_id = $1"];
    const values: any[] = [merchantId];
    let idx = 2;
    if (status) {
      filters.push(`status = $${idx++}`);
      values.push(status);
    }
    if (category) {
      filters.push(`category = $${idx++}`);
      values.push(category);
    }

    const result = await this.pool.query(
      `SELECT * FROM feature_requests
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC`,
      values,
    );

    return { requests: result.rows };
  }

  @Post()
  @ApiOperation({ summary: "Create feature request for merchant" })
  async createMerchantRequest(
    @Body()
    body: {
      title: string;
      description?: string;
      category?: string;
      priority?: string;
      staffId?: string;
      metadata?: any;
    },
    @Req() req?: any,
  ) {
    const merchantId = (req as any)?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    if (!body?.title) {
      throw new BadRequestException("Title is required");
    }

    const result = await this.pool.query(
      `INSERT INTO feature_requests (
        merchant_id, staff_id, title, description, category, priority, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        merchantId,
        body.staffId || null,
        body.title,
        body.description || null,
        body.category || "FEATURE",
        body.priority || "MEDIUM",
        body.metadata || {},
      ],
    );

    const created = result.rows[0];

    if ((body.category || "FEATURE") === "QUOTE") {
      const metadataQuote = body.metadata?.quote || body.metadata || {};
      let parsedQuote: any = metadataQuote;

      if (!parsedQuote?.agents && !parsedQuote?.features && body.description) {
        const marker = "تفاصيل JSON:";
        const markerIndex = body.description.indexOf(marker);
        let payloadText = "";
        if (markerIndex >= 0) {
          payloadText = body.description
            .slice(markerIndex + marker.length)
            .trim();
        } else {
          const start = body.description.lastIndexOf("{");
          const end = body.description.lastIndexOf("}");
          if (start >= 0 && end > start) {
            payloadText = body.description.slice(start, end + 1).trim();
          }
        }
        if (payloadText) {
          try {
            parsedQuote = JSON.parse(payloadText);
          } catch {
            parsedQuote = metadataQuote;
          }
        }
      }

      const agents = Array.isArray(parsedQuote?.agents)
        ? parsedQuote.agents
        : [];
      const features = Array.isArray(parsedQuote?.features)
        ? parsedQuote.features
        : [];
      const limits = parsedQuote?.limits || {};
      const currency = parsedQuote?.currency || "EGP";

      try {
        const quoteResult = await this.pool.query(
          `INSERT INTO quote_requests (
             merchant_id, feature_request_id, requested_agents, requested_features, limits, currency
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (feature_request_id) DO NOTHING
           RETURNING *`,
          [
            merchantId,
            created.id,
            agents,
            features,
            JSON.stringify(limits),
            currency,
          ],
        );

        if (quoteResult.rows.length > 0) {
          await this.pool.query(
            `INSERT INTO quote_request_events (quote_request_id, actor_type, actor_id, action, note, metadata)
             VALUES ($1, 'MERCHANT', $2, 'CREATED', $3, $4)`,
            [
              quoteResult.rows[0].id,
              merchantId,
              "تم إنشاء طلب عرض سعر",
              JSON.stringify({ agents, features, limits }),
            ],
          );
        }
      } catch {
        // best effort, do not fail main request
      }
    }

    return { request: created };
  }
}

@ApiTags("Feature Requests (Admin)")
@Controller("v1/admin/feature-requests")
@UseGuards(AdminApiKeyGuard)
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
export class FeatureRequestsAdminController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get()
  @ApiOperation({ summary: "List all feature requests (admin)" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "category", required: false })
  async listAllRequests(
    @Query("status") status?: string,
    @Query("category") category?: string,
  ) {
    const filters: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status) {
      filters.push(`status = $${idx++}`);
      values.push(status);
    }
    if (category) {
      filters.push(`category = $${idx++}`);
      values.push(category);
    }

    const whereClause =
      filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await this.pool.query(
      `SELECT fr.*, m.name as merchant_name, m.category as merchant_category
       FROM feature_requests fr
       LEFT JOIN merchants m ON fr.merchant_id = m.id
       ${whereClause}
       ORDER BY fr.created_at DESC`,
      values,
    );

    return { requests: result.rows };
  }

  @Put(":id/status")
  @ApiOperation({ summary: "Update feature request status/priority (admin)" })
  async updateRequestStatus(
    @Param("id") id: string,
    @Body() body: { status?: string; priority?: string },
  ) {
    if (!body?.status && !body?.priority) {
      throw new BadRequestException("status or priority is required");
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.status) {
      updates.push(`status = $${idx++}`);
      values.push(body.status);
    }
    if (body.priority) {
      updates.push(`priority = $${idx++}`);
      values.push(body.priority);
    }

    values.push(id);
    const result = await this.pool.query(
      `UPDATE feature_requests SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new BadRequestException("Feature request not found");
    }

    return { request: result.rows[0] };
  }
}
