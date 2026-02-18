import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Logger,
  UseGuards,
  Inject,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiQuery,
} from "@nestjs/swagger";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";
import { DlqService } from "../../application/dlq/dlq.service";
import { OutboxService } from "../../application/events/outbox.service";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import { MerchantCategory } from "../../shared/constants/enums";
import { v4 as uuidv4 } from "uuid";

@ApiTags("Admin")
@Controller("v1/admin")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
    private readonly dlqService: DlqService,
    private readonly outboxService: OutboxService,
  ) {}

  @Get("metrics")
  @ApiOperation({
    summary: "Get system metrics",
    description:
      "Returns aggregated metrics for all merchants including token usage, order counts, and event statistics",
  })
  @ApiResponse({ status: 200, description: "Metrics retrieved successfully" })
  async getMetrics(): Promise<any> {
    // Get overall statistics
    const [
      merchantStats,
      orderStats,
      conversationStats,
      messageStats,
      eventStats,
      dlqStats,
    ] = await Promise.all([
      this.getMerchantStats(),
      this.getOrderStats(),
      this.getConversationStats(),
      this.getMessageStats(),
      this.outboxService.getEventStats(),
      this.dlqService.getStats(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      merchants: merchantStats,
      orders: orderStats,
      conversations: conversationStats,
      messages: messageStats,
      events: eventStats,
      dlq: dlqStats,
    };
  }

  @Post("replay/:dlqEventId")
  @ApiOperation({
    summary: "Replay a DLQ event",
    description:
      "Re-queue a failed event from the Dead Letter Queue for processing",
  })
  @ApiParam({ name: "dlqEventId", description: "DLQ event ID to replay" })
  @ApiResponse({ status: 200, description: "Event replayed successfully" })
  @ApiResponse({ status: 404, description: "DLQ event not found" })
  async replayDlqEvent(@Param("dlqEventId") dlqEventId: string): Promise<any> {
    this.logger.log({
      msg: "Replaying DLQ event",
      dlqEventId,
    });

    const result = await this.dlqService.replayEvent(dlqEventId);

    return {
      success: result.success,
      newEventId: result.newEventId,
      error: result.error,
    };
  }

  @Get("dlq")
  @ApiOperation({ summary: "List DLQ events" })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  @ApiQuery({ name: "merchantId", required: false })
  async listDlqEvents(
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("merchantId") merchantId?: string,
  ): Promise<any> {
    const result = await this.dlqService.listEvents(
      limit || 50,
      offset || 0,
      merchantId,
    );
    return result;
  }

  @Post("seed")
  @ApiOperation({
    summary: "Seed demo data",
    description: "Create demo merchant and catalog data for testing",
  })
  @ApiResponse({ status: 200, description: "Demo data seeded" })
  async seedDemoData(): Promise<any> {
    this.logger.log({ msg: "Seeding demo data" });

    // Create demo merchant
    const merchantId = "demo-merchant";
    const existingMerchant = await this.merchantRepo.findById(merchantId);

    if (!existingMerchant) {
      await this.merchantRepo.create({
        id: merchantId,
        name: "متجر تجريبي",
        category: MerchantCategory.CLOTHES,
        dailyTokenBudget: 100000,
        config: {
          brandName: "متجر تجريبي",
          tone: "friendly",
          currency: "EGP",
          language: "ar-EG",
          enableNegotiation: true,
          followupEnabled: true,
        },
        branding: {},
        negotiationRules: {
          maxDiscountPercent: 10,
          minMarginPercent: 20,
          allowNegotiation: true,
          freeDeliveryThreshold: 500,
          activePromotion: {
            enabled: true,
            discountPercent: 10,
            description: "خصم 10% على كل المنتجات - عرض الأسبوع",
          },
        },
        deliveryRules: {
          defaultFee: 30,
          freeDeliveryThreshold: 500,
        },
      });
    }

    // Seed catalog items
    await this.seedCatalogItems(merchantId);

    return {
      success: true,
      merchantId,
      message: "Demo data seeded successfully",
    };
  }

  @Post("promotion/:merchantId")
  @ApiOperation({
    summary: "Toggle active promotion for a merchant",
    description: "Enable or disable the active promotion for a merchant",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({ status: 200, description: "Promotion toggled successfully" })
  async togglePromotion(
    @Param("merchantId") merchantId: string,
    @Body()
    body: { enabled: boolean; discountPercent?: number; description?: string },
  ): Promise<any> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const updatedRules = {
      ...merchant.negotiationRules,
      activePromotion: {
        enabled: body.enabled,
        discountPercent:
          body.discountPercent ||
          merchant.negotiationRules.activePromotion?.discountPercent ||
          10,
        description:
          body.description ||
          merchant.negotiationRules.activePromotion?.description ||
          "عرض خاص",
      },
    };

    await this.pool.query(
      `UPDATE merchants SET negotiation_rules = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedRules), merchantId],
    );

    return {
      success: true,
      activePromotion: updatedRules.activePromotion,
      message: body.enabled ? "العرض مفعّل" : "العرض متوقف",
    };
  }

  private async seedCatalogItems(merchantId: string): Promise<void> {
    const items = [
      {
        name_ar: "تيشيرت قطن أبيض",
        base_price: 150,
        category: "ملابس رجالي",
        sku: "tshirt-white",
        variants: [{ name: "size", values: ["S", "M", "L", "XL", "XXL"] }],
      },
      {
        name_ar: "تيشيرت قطن أسود",
        base_price: 150,
        category: "ملابس رجالي",
        sku: "tshirt-black",
        variants: [{ name: "size", values: ["S", "M", "L", "XL", "XXL"] }],
      },
      {
        name_ar: "بنطلون جينز",
        base_price: 350,
        category: "ملابس رجالي",
        sku: "jeans-blue",
        variants: [
          { name: "size", values: ["30", "32", "34", "36", "38"] },
          { name: "color", values: ["أزرق", "أسود", "رمادي"] },
        ],
      },
      {
        name_ar: "قميص كاجوال",
        base_price: 250,
        category: "ملابس رجالي",
        sku: "shirt-casual",
        variants: [
          { name: "size", values: ["S", "M", "L", "XL"] },
          { name: "color", values: ["أبيض", "أزرق فاتح", "بيج"] },
        ],
      },
      {
        name_ar: "شورت رياضي",
        base_price: 120,
        category: "ملابس رياضية",
        sku: "shorts-sport",
        variants: [
          { name: "size", values: ["S", "M", "L", "XL"] },
          { name: "color", values: ["أسود", "كحلي", "رمادي"] },
        ],
      },
      {
        name_ar: "فستان صيفي",
        base_price: 280,
        category: "ملابس حريمي",
        sku: "dress-summer",
        variants: [
          { name: "size", values: ["S", "M", "L"] },
          { name: "color", values: ["أحمر", "أزرق", "أخضر"] },
        ],
      },
      {
        name_ar: "بلوزة قطن",
        base_price: 180,
        category: "ملابس حريمي",
        sku: "blouse-cotton",
        variants: [
          { name: "size", values: ["S", "M", "L"] },
          { name: "color", values: ["أبيض", "وردي", "أسود"] },
        ],
      },
    ];

    for (const item of items) {
      await this.pool.query(
        `INSERT INTO catalog_items (id, merchant_id, name_ar, base_price, category, sku, variants, is_available, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
         ON CONFLICT (merchant_id, sku) DO UPDATE SET
           base_price = EXCLUDED.base_price,
           category = EXCLUDED.category,
           variants = EXCLUDED.variants,
           updated_at = NOW()`,
        [
          uuidv4(),
          merchantId,
          item.name_ar,
          item.base_price,
          item.category,
          item.sku,
          JSON.stringify(item.variants || []),
        ],
      );
    }
  }

  private async getMerchantStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active
      FROM merchants
    `);
    return {
      total: parseInt(result.rows[0].total, 10),
      active: parseInt(result.rows[0].active, 10),
    };
  }

  private async getOrderStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM orders
    `);
    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      pending: parseInt(row.pending, 10),
      confirmed: parseInt(row.confirmed, 10),
      shipped: parseInt(row.shipped, 10),
      delivered: parseInt(row.delivered, 10),
      cancelled: parseInt(row.cancelled, 10),
      totalRevenue: parseFloat(row.total_revenue),
      today: parseInt(row.today, 10),
    };
  }

  private async getConversationStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE state = 'GREETING') as greeting,
        COUNT(*) FILTER (WHERE state IN ('COLLECTING_ITEMS', 'COLLECTING_VARIANTS', 'COLLECTING_CUSTOMER_INFO', 'COLLECTING_ADDRESS')) as collecting,
        COUNT(*) FILTER (WHERE state = 'NEGOTIATING') as negotiating,
        COUNT(*) FILTER (WHERE state IN ('CONFIRMING_ORDER', 'ORDER_PLACED')) as confirmed,
        COUNT(*) FILTER (WHERE state = 'CLOSED') as closed,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM conversations
    `);
    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      greeting: parseInt(row.greeting, 10),
      collecting: parseInt(row.collecting, 10),
      negotiating: parseInt(row.negotiating, 10),
      confirmed: parseInt(row.confirmed, 10),
      closed: parseInt(row.closed, 10),
      today: parseInt(row.today, 10),
    };
  }

  private async getMessageStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sender = 'customer') as from_customers,
        COUNT(*) FILTER (WHERE sender = 'bot') as from_bot,
        COALESCE(SUM(token_usage), 0) as total_tokens,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM messages
    `);
    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      fromCustomers: parseInt(row.from_customers, 10),
      fromBot: parseInt(row.from_bot, 10),
      totalTokens: parseInt(row.total_tokens, 10),
      today: parseInt(row.today, 10),
    };
  }
}
