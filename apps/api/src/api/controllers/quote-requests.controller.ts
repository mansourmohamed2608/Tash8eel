import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  Inject,
  Logger,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";
import {
  AgentType,
  FeatureType,
  PlanLimits,
  PLAN_ENTITLEMENTS,
  resolveEntitlementDependencies,
} from "../../shared/entitlements";
import { NotificationsService } from "../../application/services/notifications.service";

const ALLOWED_QUOTE_STATUSES = new Set([
  "NEW",
  "UNDER_REVIEW",
  "QUOTED",
  "ACCEPTED",
  "REJECTED",
  "ACTIVE",
  "DONE",
]);

@ApiTags("Quotes")
@Controller("v1/portal/quotes")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class QuoteRequestsController {
  private readonly logger = new Logger(QuoteRequestsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get()
  @ApiOperation({ summary: "List quote requests for merchant" })
  @ApiQuery({ name: "status", required: false })
  async listQuotes(@Req() req: any, @Query("status") status?: string) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const filters: string[] = ["qr.merchant_id = $1"];
    const values: any[] = [merchantId];
    let idx = 2;
    if (status) {
      // Map frontend lowercase statuses to DB enum values
      const statusMap: Record<string, string> = {
        pending: "NEW",
        new: "NEW",
        under_review: "UNDER_REVIEW",
        quoted: "QUOTED",
        accepted: "ACCEPTED",
        rejected: "REJECTED",
        active: "ACTIVE",
        done: "DONE",
        expired: "DONE",
      };
      const mappedStatus =
        statusMap[status.toLowerCase()] || status.toUpperCase();
      if (!ALLOWED_QUOTE_STATUSES.has(mappedStatus)) {
        throw new BadRequestException(
          `Invalid status: ${status}. Valid values: ${[...ALLOWED_QUOTE_STATUSES].join(", ")}`,
        );
      }
      filters.push(`qr.status = $${idx++}`);
      values.push(mappedStatus);
    }

    const result = await this.pool.query(
      `SELECT qr.*, fr.title, fr.description, fr.priority, fr.status as request_status, fr.created_at as request_created_at, fr.metadata as request_metadata
       FROM quote_requests qr
       LEFT JOIN feature_requests fr ON fr.id = qr.feature_request_id
       WHERE ${filters.join(" AND ")}
       ORDER BY qr.created_at DESC`,
      values,
    );

    return { quotes: result.rows };
  }

  @Get(":id/events")
  @ApiOperation({ summary: "Get quote request timeline events" })
  async getQuoteEvents(@Req() req: any, @Param("id") id: string) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const result = await this.pool.query(
      `SELECT qre.*
       FROM quote_request_events qre
       JOIN quote_requests qr ON qr.id = qre.quote_request_id
       WHERE qr.id = $1 AND qr.merchant_id = $2
       ORDER BY qre.created_at ASC`,
      [id, merchantId],
    );

    return { events: result.rows };
  }

  @Post(":id/events")
  @ApiOperation({ summary: "Add note to quote request" })
  async addQuoteEvent(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { note: string; action?: string },
  ) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }
    if (!body?.note?.trim()) {
      throw new BadRequestException("note is required");
    }

    const ownership = await this.pool.query(
      `SELECT id FROM quote_requests WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );
    if (ownership.rows.length === 0) {
      throw new BadRequestException("Quote request not found");
    }

    const result = await this.pool.query(
      `INSERT INTO quote_request_events (quote_request_id, actor_type, actor_id, action, note)
       VALUES ($1, 'MERCHANT', $2, $3, $4)
       RETURNING *`,
      [id, merchantId, body.action || "NOTE", body.note.trim()],
    );

    return { event: result.rows[0] };
  }

  @Post(":id/accept")
  @ApiOperation({ summary: "Accept quote request and activate entitlements" })
  async acceptQuote(@Req() req: any, @Param("id") id: string) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const quoteResult = await this.pool.query(
      `SELECT * FROM quote_requests WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    if (quoteResult.rows.length === 0) {
      throw new BadRequestException("Quote request not found");
    }

    const quote = quoteResult.rows[0];
    if (
      quote.status === "ACCEPTED" ||
      quote.status === "ACTIVE" ||
      quote.status === "DONE"
    ) {
      return { success: true, quote };
    }
    if (quote.status !== "QUOTED") {
      throw new BadRequestException("Quote is not ready for acceptance");
    }

    const updateResult = await this.pool.query(
      `UPDATE quote_requests SET status = 'ACCEPTED', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );

    const updatedQuote = updateResult.rows[0];

    await this.pool.query(
      `INSERT INTO quote_request_events (quote_request_id, actor_type, actor_id, action, note)
       VALUES ($1, 'MERCHANT', $2, 'ACCEPTED', $3)`,
      [id, merchantId, "تم قبول عرض السعر من التاجر"],
    );

    try {
      const basePlan = PLAN_ENTITLEMENTS.CUSTOM;
      const requestedAgents = (quote.requested_agents || []) as AgentType[];
      const requestedFeatures = (quote.requested_features ||
        []) as FeatureType[];
      const resolved = resolveEntitlementDependencies({
        enabledAgents: requestedAgents,
        enabledFeatures: requestedFeatures,
      });

      const limits: PlanLimits = {
        ...basePlan.limits,
        ...(quote.limits || {}),
      };

      const customPrice = quote.quoted_price_cents
        ? Math.round(quote.quoted_price_cents / 100)
        : null;

      const prevResult = await this.pool.query(
        `SELECT enabled_agents, enabled_features FROM merchants WHERE id = $1`,
        [merchantId],
      );
      const previousState = prevResult.rows[0] || {};

      await this.pool.query(
        `UPDATE merchants
         SET plan = 'CUSTOM',
             enabled_agents = $1,
             enabled_features = $2,
             plan_limits = $3,
             custom_price = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [
          resolved.enabledAgents,
          resolved.enabledFeatures,
          JSON.stringify(limits),
          customPrice,
          merchantId,
        ],
      );

      try {
        await this.pool.query(
          `INSERT INTO entitlement_changes
           (merchant_id, previous_agents, new_agents, previous_features, new_features, changed_by, change_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            merchantId,
            previousState.enabled_agents || [],
            resolved.enabledAgents,
            previousState.enabled_features || [],
            resolved.enabledFeatures,
            "merchant",
            "quote_accept",
          ],
        );
      } catch (e) {
        this.logger.warn({
          msg: "Entitlement audit log failed",
          error: (e as Error).message,
        });
      }

      await this.pool.query(
        `UPDATE quote_requests SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
        [id],
      );
    } catch (error) {
      this.logger.warn({
        msg: "Failed to apply entitlements on quote accept",
        error: (error as Error).message,
      });
    }

    const finalQuote = await this.pool.query(
      `SELECT * FROM quote_requests WHERE id = $1`,
      [id],
    );

    return { success: true, quote: finalQuote.rows[0] || updatedQuote };
  }
}

@ApiTags("Quotes (Admin)")
@Controller("v1/admin/quotes")
@UseGuards(AdminApiKeyGuard)
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
export class QuoteRequestsAdminController {
  private readonly logger = new Logger(QuoteRequestsAdminController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List all quote requests (admin)" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "merchantId", required: false })
  async listQuotes(
    @Query("status") status?: string,
    @Query("merchantId") merchantId?: string,
  ) {
    const filters: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status) {
      filters.push(`qr.status = $${idx++}`);
      values.push(status);
    }
    if (merchantId) {
      filters.push(`qr.merchant_id = $${idx++}`);
      values.push(merchantId);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await this.pool.query(
      `SELECT qr.*, fr.title, fr.description, fr.priority, fr.status as request_status, fr.metadata as request_metadata,
              m.name as merchant_name, m.category as merchant_category
       FROM quote_requests qr
       LEFT JOIN feature_requests fr ON fr.id = qr.feature_request_id
       LEFT JOIN merchants m ON m.id = qr.merchant_id
       ${whereClause}
       ORDER BY qr.created_at DESC`,
      values,
    );

    return { quotes: result.rows };
  }

  @Get(":id/events")
  @ApiOperation({ summary: "Get quote request timeline events (admin)" })
  async getQuoteEvents(@Param("id") id: string) {
    const result = await this.pool.query(
      `SELECT * FROM quote_request_events WHERE quote_request_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    return { events: result.rows };
  }

  @Post(":id/events")
  @ApiOperation({ summary: "Add admin note to quote request" })
  async addAdminEvent(
    @Param("id") id: string,
    @Body() body: { note: string; action?: string },
  ) {
    if (!body?.note?.trim()) {
      throw new BadRequestException("note is required");
    }

    const exists = await this.pool.query(
      `SELECT id FROM quote_requests WHERE id = $1`,
      [id],
    );
    if (exists.rows.length === 0) {
      throw new BadRequestException("Quote request not found");
    }

    const result = await this.pool.query(
      `INSERT INTO quote_request_events (quote_request_id, actor_type, action, note)
       VALUES ($1, 'ADMIN', $2, $3)
       RETURNING *`,
      [id, body.action || "NOTE", body.note.trim()],
    );

    return { event: result.rows[0] };
  }

  @Put(":id")
  @ApiOperation({ summary: "Update quote request status/price/notes (admin)" })
  async updateQuote(
    @Param("id") id: string,
    @Body()
    body: {
      status?: string;
      quotedPriceCents?: number;
      currency?: string;
      notes?: string;
    },
  ) {
    if (
      !body?.status &&
      body?.quotedPriceCents === undefined &&
      !body?.currency &&
      !body?.notes
    ) {
      throw new BadRequestException("No updates provided");
    }

    const prev = await this.pool.query(
      `SELECT * FROM quote_requests WHERE id = $1`,
      [id],
    );
    if (prev.rows.length === 0) {
      throw new BadRequestException("Quote request not found");
    }

    if (body.status && !ALLOWED_QUOTE_STATUSES.has(body.status)) {
      throw new BadRequestException("Invalid status");
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.status) {
      updates.push(`status = $${idx++}`);
      values.push(body.status);
    }
    if (body.quotedPriceCents !== undefined) {
      updates.push(`quoted_price_cents = $${idx++}`);
      values.push(body.quotedPriceCents);
    }
    if (body.currency) {
      updates.push(`currency = $${idx++}`);
      values.push(body.currency);
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(body.notes);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE quote_requests SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values,
    );

    const updated = result.rows[0];
    const statusChanged = body.status && body.status !== prev.rows[0].status;
    const priceChanged =
      body.quotedPriceCents !== undefined &&
      body.quotedPriceCents !== prev.rows[0].quoted_price_cents;

    if (statusChanged) {
      await this.pool.query(
        `INSERT INTO quote_request_events (quote_request_id, actor_type, action, note, metadata)
         VALUES ($1, 'ADMIN', 'STATUS_UPDATE', $2, $3)`,
        [
          id,
          `تم تغيير الحالة من ${prev.rows[0].status} إلى ${body.status}`,
          JSON.stringify({ from: prev.rows[0].status, to: body.status }),
        ],
      );
    }

    if (priceChanged) {
      await this.pool.query(
        `INSERT INTO quote_request_events (quote_request_id, actor_type, action, note, metadata)
         VALUES ($1, 'ADMIN', 'PRICE_UPDATE', $2, $3)`,
        [
          id,
          `تم تحديث السعر إلى ${body.quotedPriceCents}`,
          JSON.stringify({
            price: body.quotedPriceCents,
            currency: body.currency || prev.rows[0].currency,
          }),
        ],
      );
    }

    if (statusChanged || priceChanged) {
      try {
        const currency = body.currency || updated.currency || "EGP";
        const priceText = updated.quoted_price_cents
          ? `${Math.round(updated.quoted_price_cents / 100)} ${currency}`
          : "لم يتم التسعير بعد";
        const statusText = updated.status;
        await this.notificationsService.create({
          merchantId: updated.merchant_id,
          type: "SYSTEM_ALERT",
          title: "Quote Updated",
          titleAr: "تم تحديث عرض السعر",
          message: `Quote status: ${statusText}, price: ${priceText}`,
          messageAr: `حالة العرض: ${statusText}، السعر: ${priceText}`,
          priority: "MEDIUM",
          channels: ["IN_APP", "EMAIL", "WHATSAPP"],
          actionUrl: "/merchant/feature-requests?tab=quotes",
          data: {
            quoteId: updated.id,
            status: statusText,
            price: updated.quoted_price_cents,
          },
        });
      } catch (e) {
        this.logger.warn({
          msg: "Quote notification failed",
          error: (e as Error).message,
        });
      }
    }

    return { quote: updated };
  }
}
