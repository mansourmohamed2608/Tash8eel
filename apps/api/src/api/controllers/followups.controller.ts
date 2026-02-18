import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
} from "@nestjs/swagger";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";

interface FollowupDto {
  id: string;
  merchantId: string;
  conversationId?: string;
  orderId?: string;
  customerId?: string;
  type: string;
  status: string;
  scheduledAt: Date;
  sentAt?: Date;
  cancelledAt?: Date;
  messageTemplate?: string;
  customMessage?: string;
  metadata: any;
  createdAt: Date;
}

interface CreateFollowupDto {
  conversationId?: string;
  orderId?: string;
  customerId?: string;
  type:
    | "order_confirmation"
    | "delivery_reminder"
    | "feedback_request"
    | "abandoned_cart"
    | "reorder_suggestion"
    | "custom";
  scheduledAt: string;
  messageTemplate?: string;
  customMessage?: string;
  metadata?: any;
}

@ApiTags("Followups")
@ApiSecurity("admin-api-key")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
@Controller("v1/merchants/:merchantId/followups")
export class FollowupsController {
  private readonly logger = new Logger(FollowupsController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List followups for merchant",
    description: "Get all scheduled followups, optionally filtered by status",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiQuery({
    name: "status",
    required: false,
    description: "Filter by status (PENDING, SENT, CANCELLED, FAILED)",
  })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async listFollowups(
    @Param("merchantId") merchantId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<{ followups: FollowupDto[]; total: number }> {
    await this.validateMerchant(merchantId);

    let query = `
      SELECT id, merchant_id, conversation_id, order_id, customer_id,
             type, status, scheduled_at, sent_at, cancelled_at,
             message_template, custom_message, metadata, created_at
      FROM followups
      WHERE merchant_id = $1
    `;
    const params: any[] = [merchantId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY scheduled_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit || 50, offset || 0);

    const { rows } = await this.pool.query(query, params);

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM followups WHERE merchant_id = $1 ${status ? "AND status = $2" : ""}`,
      status ? [merchantId, status] : [merchantId],
    );

    return {
      followups: rows.map(this.mapToDto),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get followup by ID" })
  async getFollowup(
    @Param("merchantId") merchantId: string,
    @Param("id") id: string,
  ): Promise<FollowupDto> {
    await this.validateMerchant(merchantId);

    const { rows } = await this.pool.query(
      `SELECT * FROM followups WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Followup ${id} not found`);
    }

    return this.mapToDto(rows[0]);
  }

  @Post()
  @ApiOperation({
    summary: "Create new followup",
    description: "Schedule a new followup message",
  })
  async createFollowup(
    @Param("merchantId") merchantId: string,
    @Body() dto: CreateFollowupDto,
  ): Promise<FollowupDto> {
    await this.validateMerchant(merchantId);

    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt < new Date()) {
      throw new BadRequestException("Scheduled time must be in the future");
    }

    const { rows } = await this.pool.query(
      `INSERT INTO followups (
        merchant_id, conversation_id, order_id, customer_id,
        type, status, scheduled_at, message_template, custom_message, metadata
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9)
      RETURNING *`,
      [
        merchantId,
        dto.conversationId || null,
        dto.orderId || null,
        dto.customerId || null,
        dto.type,
        scheduledAt,
        dto.messageTemplate || null,
        dto.customMessage || null,
        JSON.stringify(dto.metadata || {}),
      ],
    );

    this.logger.log({
      msg: "Followup created",
      merchantId,
      followupId: rows[0].id,
      type: dto.type,
      scheduledAt: scheduledAt.toISOString(),
    });

    return this.mapToDto(rows[0]);
  }

  @Post(":id/cancel")
  @ApiOperation({
    summary: "Cancel scheduled followup",
    description:
      "Cancel a pending followup. Only PENDING followups can be cancelled.",
  })
  async cancelFollowup(
    @Param("merchantId") merchantId: string,
    @Param("id") id: string,
  ): Promise<FollowupDto> {
    await this.validateMerchant(merchantId);

    const { rows: existing } = await this.pool.query(
      `SELECT * FROM followups WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    if (existing.length === 0) {
      throw new NotFoundException(`Followup ${id} not found`);
    }

    if (existing[0].status !== "PENDING") {
      throw new BadRequestException(
        `Cannot cancel followup with status ${existing[0].status}`,
      );
    }

    const { rows } = await this.pool.query(
      `UPDATE followups SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );

    this.logger.log({
      msg: "Followup cancelled",
      merchantId,
      followupId: id,
    });

    return this.mapToDto(rows[0]);
  }

  @Post(":id/send-now")
  @ApiOperation({
    summary: "Send followup immediately",
    description: "Trigger immediate sending of a pending followup",
  })
  async sendNow(
    @Param("merchantId") merchantId: string,
    @Param("id") id: string,
  ): Promise<FollowupDto> {
    await this.validateMerchant(merchantId);

    const { rows: existing } = await this.pool.query(
      `SELECT * FROM followups WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    if (existing.length === 0) {
      throw new NotFoundException(`Followup ${id} not found`);
    }

    if (existing[0].status !== "PENDING") {
      throw new BadRequestException(
        `Cannot send followup with status ${existing[0].status}`,
      );
    }

    // Update to scheduled_at = now so worker picks it up immediately
    const { rows } = await this.pool.query(
      `UPDATE followups SET scheduled_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );

    this.logger.log({
      msg: "Followup triggered for immediate send",
      merchantId,
      followupId: id,
    });

    return this.mapToDto(rows[0]);
  }

  private async validateMerchant(merchantId: string): Promise<void> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }
  }

  private mapToDto(row: any): FollowupDto {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      conversationId: row.conversation_id,
      orderId: row.order_id,
      customerId: row.customer_id,
      type: row.type,
      status: row.status,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      cancelledAt: row.cancelled_at,
      messageTemplate: row.message_template,
      customMessage: row.custom_message,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}
