import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UseGuards,
  Req,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
  ApiBody,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import {
  IConversationRepository,
  CONVERSATION_REPOSITORY,
} from "../../domain/ports/conversation.repository";
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from "../../domain/ports/message.repository";
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from "../../domain/ports/order.repository";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { Conversation } from "../../domain/entities/conversation.entity";
import { Message } from "../../domain/entities/message.entity";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
  RequiresAgent,
} from "../../shared/guards/entitlement.guard";
import {
  RolesGuard,
  Roles,
  RequireRole,
  StaffRole,
} from "../../shared/guards/roles.guard";
import {
  AgentSubscriptionService,
  AgentType,
} from "../../application/services/agent-subscription.service";
import { AnalyticsService } from "../../application/services/analytics.service";
import {
  PaymentService,
  PaymentProof,
  PaymentLink,
} from "../../application/services/payment.service";
import {
  NotificationType,
  NotificationsService,
} from "../../application/services/notifications.service";
import { AuditService } from "../../application/services/audit.service";
import { StaffService } from "../../application/services/staff.service";
import { InventoryAiService } from "../../application/llm/inventory-ai.service";
import { ForecastEngineService } from "../../application/forecasting/forecast-engine.service";
import { MessageDeliveryService } from "../../application/services/message-delivery.service";
import {
  getCatalog,
  PLAN_ENTITLEMENTS,
  PlanType,
} from "../../shared/entitlements";
import { generateOrderNumber } from "../../shared/utils/helpers";

/**
 * Merchant Portal Controller
 *
 * Provides merchant-scoped endpoints for the merchant portal.
 * All endpoints are protected by MerchantApiKeyGuard and automatically
 * scope queries to the authenticated merchant.
 *
 * RBAC: RolesGuard checks @Roles() or @RequireRole() decorators.
 * Role hierarchy: OWNER > ADMIN > MANAGER > AGENT > VIEWER
 *
 * Header: X-API-Key (merchant API key)
 */
@ApiTags("Merchant Portal")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class MerchantPortalController {
  private readonly logger = new Logger(MerchantPortalController.name);
  private readonly LOCK_TTL_MS = 30000;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepo: IOrderRepository,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
    private readonly redisService: RedisService,
    private readonly agentSubscriptionService: AgentSubscriptionService,
    private readonly analyticsService: AnalyticsService,
    private readonly paymentService: PaymentService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly staffService: StaffService,
    private readonly inventoryAiService: InventoryAiService,
    private readonly forecastEngine: ForecastEngineService,
    private readonly messageDeliveryService: MessageDeliveryService,
  ) {}

  /**
   * Get merchant ID from request (injected by MerchantApiKeyGuard)
   */
  private getMerchantId(req: Request): string {
    return (req as any).merchantId;
  }

  private getSafeStaffId(req: Request): string | undefined {
    const raw = String((req as any).staffId || "").trim();
    if (!raw) return undefined;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(raw) ? raw : undefined;
  }

  private normalizeOrderItems(rawItems: unknown): any[] {
    if (Array.isArray(rawItems)) {
      return rawItems;
    }

    if (rawItems && typeof rawItems === "object") {
      const nestedItems = (rawItems as { items?: unknown }).items;
      if (Array.isArray(nestedItems)) {
        return nestedItems;
      }
    }

    if (typeof rawItems === "string" && rawItems.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) {
          return parsed;
        }
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { items?: unknown }).items)
        ) {
          return (parsed as { items: any[] }).items;
        }
      } catch {
        return [];
      }
    }

    return [];
  }

  private async loadOrderItemsFromTable(
    orderIds: string[],
  ): Promise<Map<string, any[]>> {
    const byOrderId = new Map<string, any[]>();
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return byOrderId;
    }

    const rows = await this.pool.query<{
      order_id: string;
      catalog_item_id: string | null;
      sku: string | null;
      name: string | null;
      quantity: string | number | null;
      unit_price: string | number | null;
      total_price: string | number | null;
    }>(
      `SELECT
         oi.order_id::text as order_id,
         NULLIF(to_jsonb(oi)->>'catalog_item_id', '') as catalog_item_id,
         COALESCE(
           NULLIF(to_jsonb(oi)->>'sku', ''),
           NULLIF(to_jsonb(oi)->>'variant_sku', '')
         ) as sku,
         COALESCE(
           NULLIF(to_jsonb(oi)->>'name', ''),
           NULLIF(to_jsonb(oi)->>'product_name', ''),
           NULLIF(to_jsonb(oi)->>'title', ''),
           NULLIF(to_jsonb(oi)->>'sku', ''),
           'منتج غير معروف'
         ) as name,
         COALESCE(
           NULLIF(to_jsonb(oi)->>'quantity', ''),
           NULLIF(to_jsonb(oi)->>'qty', ''),
           '0'
         ) as quantity,
         COALESCE(
           NULLIF(to_jsonb(oi)->>'unit_price', ''),
           NULLIF(to_jsonb(oi)->>'unitPrice', ''),
           NULLIF(to_jsonb(oi)->>'price', ''),
           '0'
         ) as unit_price,
         COALESCE(
           NULLIF(to_jsonb(oi)->>'total_price', ''),
           NULLIF(to_jsonb(oi)->>'total', ''),
           NULLIF(to_jsonb(oi)->>'line_total', ''),
           '0'
         ) as total_price
       FROM order_items oi
       WHERE oi.order_id::text = ANY($1::text[])
       ORDER BY oi.order_id::text ASC`,
      [orderIds],
    );

    for (const row of rows.rows) {
      const orderId = String(row.order_id);
      const quantity = Number(row.quantity || 0);
      const unitPrice = Number(row.unit_price || 0);
      const rawTotalPrice = Number(row.total_price || 0);
      const totalPrice =
        Number.isFinite(rawTotalPrice) && rawTotalPrice > 0
          ? rawTotalPrice
          : Number((quantity * unitPrice).toFixed(2));

      const entry = {
        catalogItemId: row.catalog_item_id || undefined,
        sku: row.sku || undefined,
        name: row.name || row.sku || "منتج غير معروف",
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        lineTotal: Number.isFinite(totalPrice) ? totalPrice : 0,
        total: Number.isFinite(totalPrice) ? totalPrice : 0,
      };

      const existing = byOrderId.get(orderId) || [];
      existing.push(entry);
      byOrderId.set(orderId, existing);
    }

    return byOrderId;
  }

  private normalizeManualDeliveryType(
    value: unknown,
  ): "delivery" | "pickup" | "dine_in" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();

    if (["delivery", "pickup", "dine_in"].includes(normalized)) {
      return normalized as "delivery" | "pickup" | "dine_in";
    }

    throw new BadRequestException(
      "deliveryType must be one of: delivery, pickup, dine_in",
    );
  }

  private normalizeManualPaymentMethod(
    value: unknown,
  ): "cash" | "card" | "transfer" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();

    if (["cash", "card", "transfer"].includes(normalized)) {
      return normalized as "cash" | "card" | "transfer";
    }

    throw new BadRequestException(
      "paymentMethod must be one of: cash, card, transfer",
    );
  }

  private toOrderPaymentMethod(
    paymentMethod: "cash" | "card" | "transfer",
  ): "COD" | "CARD" | "BANK_TRANSFER" {
    if (paymentMethod === "cash") return "COD";
    if (paymentMethod === "card") return "CARD";
    return "BANK_TRANSFER";
  }

  private async createUniquePortalOrderNumber(
    merchantId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateOrderNumber(merchantId);
      const exists = await this.orderRepo.findByOrderNumber(
        merchantId,
        candidate,
      );
      if (!exists) return candidate;
    }

    const fallback = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    return fallback;
  }

  private async createManualConversationFallback(
    merchantId: string,
    customerName: string,
    customerPhone: string,
  ): Promise<string> {
    const conversationId = `manual-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    await this.pool.query(
      `INSERT INTO conversations (
         id,
         merchant_id,
         sender_id,
         state,
         collected_info,
         last_message_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         'manual-portal',
         'ORDER_PLACED',
         $3,
         NOW(),
         NOW()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        conversationId,
        merchantId,
        JSON.stringify({
          customerName,
          phone: customerPhone,
          source: "manual_portal_order",
        }),
      ],
    );

    return conversationId;
  }

  private toFiniteNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private async getCatalogItemAvailabilityForOrder(
    merchantId: string,
    catalogItemId: string,
  ): Promise<{
    itemId: string;
    name: string;
    mode: "simple" | "recipe";
    availableQuantity: number;
    limitingIngredient: string | null;
  }> {
    const itemResult = await this.pool.query<{
      id: string;
      name: string;
      has_recipe: boolean;
      stock_quantity: string | null;
    }>(
      `SELECT
         id::text as id,
         COALESCE(name_ar, name_en, sku) as name,
         COALESCE(has_recipe, false) as has_recipe,
         COALESCE(stock_quantity, 0)::text as stock_quantity
       FROM catalog_items
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, catalogItemId],
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException(`Catalog item ${catalogItemId} not found`);
    }

    const item = itemResult.rows[0];
    if (!item.has_recipe) {
      const stockResult = await this.pool.query<{ available: string }>(
        `SELECT
           COALESCE(SUM(COALESCE(v.quantity_on_hand, 0) - COALESCE(v.quantity_reserved, 0)), 0)::text as available
         FROM inventory_items ii
         LEFT JOIN inventory_variants v ON v.inventory_item_id = ii.id
           AND v.merchant_id = ii.merchant_id
           AND COALESCE(v.is_active, true) = true
         WHERE ii.merchant_id = $1 AND ii.catalog_item_id::text = $2`,
        [merchantId, catalogItemId],
      );

      const variantsAvailable = this.toFiniteNumber(
        stockResult.rows[0]?.available,
        0,
      );
      const fallbackStock = this.toFiniteNumber(item.stock_quantity, 0);

      return {
        itemId: item.id,
        name: item.name,
        mode: "simple",
        availableQuantity: Math.max(variantsAvailable, fallbackStock),
        limitingIngredient: null,
      };
    }

    const ingredientsResult = await this.pool.query<{
      ingredient_name: string;
      ingredient_inventory_item_id: string | null;
      ingredient_catalog_item_id: string | null;
      quantity_required: string;
      waste_factor: string;
      is_optional: boolean;
    }>(
      `SELECT
         ingredient_name,
         ingredient_inventory_item_id::text as ingredient_inventory_item_id,
         ingredient_catalog_item_id::text as ingredient_catalog_item_id,
         quantity_required::text as quantity_required,
         COALESCE(waste_factor, 1)::text as waste_factor,
         COALESCE(is_optional, false) as is_optional
       FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [merchantId, catalogItemId],
    );

    let minCanMake = Number.POSITIVE_INFINITY;
    let limitingIngredient: string | null = null;

    for (const ingredient of ingredientsResult.rows) {
      const required =
        this.toFiniteNumber(ingredient.quantity_required, 0) *
        this.toFiniteNumber(ingredient.waste_factor, 1);
      if (required <= 0) continue;

      let stockOnHand = 0;
      if (ingredient.ingredient_inventory_item_id) {
        const invStock = await this.pool.query<{ available: string }>(
          `SELECT
             COALESCE(SUM(COALESCE(quantity_on_hand, 0) - COALESCE(quantity_reserved, 0)), 0)::text as available
           FROM inventory_variants
           WHERE merchant_id = $1
             AND inventory_item_id::text = $2
             AND COALESCE(is_active, true) = true`,
          [merchantId, ingredient.ingredient_inventory_item_id],
        );
        stockOnHand = this.toFiniteNumber(invStock.rows[0]?.available, 0);
      } else if (ingredient.ingredient_catalog_item_id) {
        const catalogStock = await this.pool.query<{ available: string }>(
          `SELECT COALESCE(stock_quantity, 0)::text as available
           FROM catalog_items
           WHERE merchant_id = $1 AND id::text = $2
           LIMIT 1`,
          [merchantId, ingredient.ingredient_catalog_item_id],
        );
        stockOnHand = this.toFiniteNumber(catalogStock.rows[0]?.available, 0);
      }

      const canMake = required > 0 ? Math.floor(stockOnHand / required) : 0;
      if (!ingredient.is_optional && canMake < minCanMake) {
        minCanMake = canMake;
        limitingIngredient = ingredient.ingredient_name;
      }
    }

    if (!Number.isFinite(minCanMake)) {
      minCanMake = 0;
    }

    return {
      itemId: item.id,
      name: item.name,
      mode: "recipe",
      availableQuantity: minCanMake,
      limitingIngredient,
    };
  }

  private async resolveOrderItemByNameOrSku(
    merchantId: string,
    rawNameOrSku: string,
  ): Promise<{
    catalogItemId?: string;
    inventoryItemId?: string;
    name: string;
    sku?: string;
    availableQuantity?: number;
  } | null> {
    const lookup = String(rawNameOrSku || "").trim();
    if (!lookup) return null;

    const catalogMatch = await this.pool.query<{
      id: string;
      name: string;
      sku: string | null;
    }>(
      `SELECT
         id::text as id,
         COALESCE(name_ar, name_en, sku) as name,
         NULLIF(sku, '') as sku
       FROM catalog_items
       WHERE merchant_id = $1
         AND (
           LOWER(COALESCE(name_ar, '')) = LOWER($2)
           OR LOWER(COALESCE(name_en, '')) = LOWER($2)
           OR LOWER(COALESCE(sku, '')) = LOWER($2)
         )
       ORDER BY COALESCE(is_available, true) DESC, updated_at DESC
       LIMIT 1`,
      [merchantId, lookup],
    );

    if (catalogMatch.rows.length > 0) {
      return {
        catalogItemId: catalogMatch.rows[0].id,
        name: catalogMatch.rows[0].name || lookup,
        sku: catalogMatch.rows[0].sku || undefined,
      };
    }

    const inventoryMatch = await this.pool.query<{
      inventory_item_id: string;
      catalog_item_id: string | null;
      item_name: string;
      sku: string | null;
      available: string;
    }>(
      `SELECT
         ii.id::text as inventory_item_id,
         ii.catalog_item_id::text as catalog_item_id,
         COALESCE(NULLIF((to_jsonb(ii)->>'name'), ''), ci.name_ar, ci.name_en, ii.sku, '') as item_name,
         COALESCE(NULLIF(ii.sku, ''), NULLIF(ci.sku, '')) as sku,
         COALESCE(SUM(COALESCE(iv.quantity_on_hand, 0) - COALESCE(iv.quantity_reserved, 0)), 0)::text as available
       FROM inventory_items ii
       LEFT JOIN catalog_items ci
         ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
       LEFT JOIN inventory_variants iv
         ON iv.inventory_item_id = ii.id
         AND iv.merchant_id = ii.merchant_id
         AND COALESCE(iv.is_active, true) = true
       WHERE ii.merchant_id = $1
         AND (
           LOWER(COALESCE(NULLIF((to_jsonb(ii)->>'name'), ''), '')) = LOWER($2)
           OR LOWER(COALESCE(ii.sku, '')) = LOWER($2)
           OR LOWER(COALESCE(ci.name_ar, '')) = LOWER($2)
           OR LOWER(COALESCE(ci.name_en, '')) = LOWER($2)
           OR LOWER(COALESCE(ci.sku, '')) = LOWER($2)
         )
       GROUP BY ii.id, ii.catalog_item_id, ci.name_ar, ci.name_en, ii.sku, ci.sku
       ORDER BY available::numeric DESC, ii.created_at ASC
       LIMIT 1`,
      [merchantId, lookup],
    );

    if (inventoryMatch.rows.length === 0) {
      return null;
    }

    const matched = inventoryMatch.rows[0];
    return {
      catalogItemId: matched.catalog_item_id || undefined,
      inventoryItemId: matched.inventory_item_id,
      name: matched.item_name || lookup,
      sku: matched.sku || undefined,
      availableQuantity: this.toFiniteNumber(matched.available, 0),
    };
  }

  private async validateManualOrderStock(
    merchantId: string,
    items: Array<{
      catalogItemId?: string;
      sku?: string;
      name: string;
      quantity: number;
      unitPrice: number;
      notes?: string;
      lineTotal: number;
    }>,
  ): Promise<void> {
    const unavailableItems: Array<{
      index: number;
      name: string;
      requestedQty: number;
      availableQty: number;
      reason: string;
      mode: "recipe" | "simple" | "inventory_only" | "unknown";
      limitingIngredient?: string;
    }> = [];

    const availabilityCache = new Map<
      string,
      {
        name: string;
        mode: "simple" | "recipe";
        availableQuantity: number;
        limitingIngredient: string | null;
      }
    >();

    for (let index = 0; index < items.length; index++) {
      const line = items[index];
      const requestedQty = this.toFiniteNumber(line.quantity, 0);
      if (requestedQty <= 0) continue;

      let resolvedName = String(line.name || "منتج").trim() || "منتج";
      let resolvedMode: "recipe" | "simple" | "inventory_only" | "unknown" =
        "unknown";
      let availableQty = 0;
      let limitingIngredient: string | null = null;

      let catalogItemId = String(line.catalogItemId || "").trim();

      if (!catalogItemId) {
        const resolved = await this.resolveOrderItemByNameOrSku(
          merchantId,
          line.name,
        );

        if (!resolved) {
          unavailableItems.push({
            index,
            name: resolvedName,
            requestedQty,
            availableQty: 0,
            reason: "ITEM_NOT_FOUND",
            mode: "unknown",
          });
          continue;
        }

        resolvedName = String(resolved.name || resolvedName);
        if (resolved.sku && !line.sku) {
          line.sku = resolved.sku;
        }

        if (resolved.catalogItemId) {
          catalogItemId = resolved.catalogItemId;
          line.catalogItemId = resolved.catalogItemId;
        } else {
          resolvedMode = "inventory_only";
          availableQty = Math.max(
            0,
            this.toFiniteNumber(resolved.availableQuantity, 0),
          );
        }
      }

      if (catalogItemId) {
        let availability = availabilityCache.get(catalogItemId);
        if (!availability) {
          const fetched = await this.getCatalogItemAvailabilityForOrder(
            merchantId,
            catalogItemId,
          );
          availability = {
            name: fetched.name,
            mode: fetched.mode,
            availableQuantity: fetched.availableQuantity,
            limitingIngredient: fetched.limitingIngredient,
          };
          availabilityCache.set(catalogItemId, availability);
        }

        resolvedName = availability.name || resolvedName;
        resolvedMode = availability.mode;
        availableQty = Math.max(
          0,
          this.toFiniteNumber(availability.availableQuantity, 0),
        );
        limitingIngredient = availability.limitingIngredient;
      }

      if (requestedQty - availableQty > 1e-9) {
        unavailableItems.push({
          index,
          name: resolvedName,
          requestedQty,
          availableQty,
          reason:
            resolvedMode === "recipe"
              ? "INSUFFICIENT_INGREDIENTS"
              : "INSUFFICIENT_STOCK",
          mode: resolvedMode,
          limitingIngredient: limitingIngredient || undefined,
        });
      }
    }

    if (unavailableItems.length > 0) {
      throw new BadRequestException({
        message: "One or more items are unavailable in inventory",
        code: "INSUFFICIENT_STOCK",
        unavailableItems,
      });
    }
  }

  /**
   * Deduct or restore stock for an order's items.
   * Two modes:
   *   A) Recipe-based: if catalog_item has_recipe=true, deduct/restore individual ingredients
   *      from inventory_items (restaurant model: burger = bun + patty + cheese)
   *   B) Simple: deduct/restore catalog_items.stock_quantity directly (retail model)
   * Tries order_items table first, falls back to orders.items JSON.
   */
  private async handleStockForOrder(
    orderId: string,
    merchantId: string,
    operation: "DEDUCT" | "RESTORE",
  ): Promise<number> {
    let affected = 0;

    // Collect items from order_items table or orders.items JSON
    let orderLineItems: Array<{
      catalog_item_id?: string;
      sku?: string;
      quantity: number;
    }> = [];

    const orderItems = await this.pool.query(
      `SELECT catalog_item_id, sku, quantity FROM order_items WHERE order_id = $1`,
      [orderId],
    );

    if (orderItems.rows.length > 0) {
      orderLineItems = orderItems.rows.map((r) => ({
        catalog_item_id: r.catalog_item_id,
        sku: r.sku,
        quantity: parseInt(r.quantity, 10) || 0,
      }));
    } else {
      const orderResult = await this.pool.query(
        `SELECT items FROM orders WHERE id = $1`,
        [orderId],
      );
      const items = orderResult.rows[0]?.items;
      if (Array.isArray(items)) {
        orderLineItems = items.map((it: any) => ({
          catalog_item_id:
            String(it.catalogItemId || it.catalog_item_id || "").trim() ||
            undefined,
          sku: it.sku,
          quantity: parseInt(it.quantity || it.qty, 10) || 0,
        }));
      }
    }

    for (const lineItem of orderLineItems) {
      if (lineItem.quantity <= 0) continue;

      // Resolve catalog_item_id if we only have SKU
      let catalogItemId = lineItem.catalog_item_id;
      if (!catalogItemId && lineItem.sku) {
        const lookup = await this.pool.query(
          `SELECT id FROM catalog_items WHERE merchant_id = $1 AND sku = $2 LIMIT 1`,
          [merchantId, lineItem.sku],
        );
        catalogItemId = lookup.rows[0]?.id;
      }

      // Check if this item has a recipe (restaurant model)
      let hasRecipe = false;
      if (catalogItemId) {
        const recipeCheck = await this.pool.query(
          `SELECT has_recipe FROM catalog_items WHERE id = $1 AND merchant_id = $2`,
          [catalogItemId, merchantId],
        );
        hasRecipe = recipeCheck.rows[0]?.has_recipe === true;
      }

      if (hasRecipe && catalogItemId) {
        // ─── MODE A: Recipe-based deduction (restaurants) ─────
        // Deduct each ingredient from inventory_items
        const recipe = await this.pool.query(
          `SELECT r.ingredient_inventory_item_id, r.ingredient_name, r.quantity_required, r.unit, r.waste_factor, r.is_optional
           FROM item_recipes r
           WHERE r.catalog_item_id = $1 AND r.merchant_id = $2 AND r.is_optional = false
           ORDER BY r.sort_order`,
          [catalogItemId, merchantId],
        );

        if (operation === "DEDUCT") {
          for (const ing of recipe.rows) {
            const totalQty =
              parseFloat(ing.quantity_required) *
              lineItem.quantity *
              (parseFloat(ing.waste_factor) || 1);

            if (ing.ingredient_inventory_item_id) {
              // Deduct from inventory_items (check inventory_variants first)
              const variantResult = await this.pool.query(
                `UPDATE inventory_variants SET quantity_on_hand = GREATEST(0, quantity_on_hand - $1), updated_at = NOW()
                 WHERE inventory_item_id = $2 AND merchant_id = $3 AND is_active = true
                 ORDER BY quantity_on_hand DESC LIMIT 1
                 RETURNING id`,
                [
                  Math.ceil(totalQty),
                  ing.ingredient_inventory_item_id,
                  merchantId,
                ],
              );

              // If no variants, try a simple stock_quantity on catalog_items linked to this inventory_item
              if ((variantResult.rowCount || 0) === 0) {
                await this.pool.query(
                  `UPDATE catalog_items SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - $1), updated_at = NOW()
                   WHERE id = (SELECT catalog_item_id FROM inventory_items WHERE id = $2 AND merchant_id = $3)`,
                  [
                    Math.ceil(totalQty),
                    ing.ingredient_inventory_item_id,
                    merchantId,
                  ],
                );
              }
            }

            // Record the deduction for traceability
            await this.pool.query(
              `INSERT INTO order_ingredient_deductions (order_id, merchant_id, catalog_item_id, ingredient_inventory_item_id, ingredient_name, quantity_deducted, unit, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'deducted')`,
              [
                orderId,
                merchantId,
                catalogItemId,
                ing.ingredient_inventory_item_id,
                ing.ingredient_name,
                totalQty,
                ing.unit,
              ],
            );
            affected++;
          }
        } else {
          // RESTORE: restore previously deducted ingredients
          const deductions = await this.pool.query(
            `SELECT ingredient_inventory_item_id, ingredient_name, quantity_deducted, unit
             FROM order_ingredient_deductions
             WHERE order_id = $1 AND merchant_id = $2 AND catalog_item_id = $3 AND status = 'deducted'`,
            [orderId, merchantId, catalogItemId],
          );

          for (const ded of deductions.rows) {
            if (ded.ingredient_inventory_item_id) {
              const variantResult = await this.pool.query(
                `UPDATE inventory_variants SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
                 WHERE inventory_item_id = $2 AND merchant_id = $3 AND is_active = true
                 ORDER BY quantity_on_hand ASC LIMIT 1
                 RETURNING id`,
                [
                  Math.ceil(parseFloat(ded.quantity_deducted)),
                  ded.ingredient_inventory_item_id,
                  merchantId,
                ],
              );

              if ((variantResult.rowCount || 0) === 0) {
                await this.pool.query(
                  `UPDATE catalog_items SET stock_quantity = COALESCE(stock_quantity, 0) + $1, updated_at = NOW()
                   WHERE id = (SELECT catalog_item_id FROM inventory_items WHERE id = $2 AND merchant_id = $3)`,
                  [
                    Math.ceil(parseFloat(ded.quantity_deducted)),
                    ded.ingredient_inventory_item_id,
                    merchantId,
                  ],
                );
              }
            }
            affected++;
          }

          // Mark deductions as restored
          await this.pool.query(
            `UPDATE order_ingredient_deductions SET status = 'restored', restored_at = NOW()
             WHERE order_id = $1 AND merchant_id = $2 AND catalog_item_id = $3 AND status = 'deducted'`,
            [orderId, merchantId, catalogItemId],
          );
        }
      } else {
        // ─── MODE B: Simple stock deduction (retail / no recipe) ─────
        if (catalogItemId) {
          const result = await this.pool.query(
            operation === "DEDUCT"
              ? `UPDATE catalog_items SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - $1), updated_at = NOW() WHERE id = $2 AND merchant_id = $3`
              : `UPDATE catalog_items SET stock_quantity = COALESCE(stock_quantity, 0) + $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3`,
            [lineItem.quantity, catalogItemId, merchantId],
          );
          if (result.rowCount > 0) affected++;
        } else if (lineItem.sku) {
          const result = await this.pool.query(
            operation === "DEDUCT"
              ? `UPDATE catalog_items SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - $1), updated_at = NOW() WHERE merchant_id = $2 AND sku = $3 AND stock_quantity IS NOT NULL`
              : `UPDATE catalog_items SET stock_quantity = COALESCE(stock_quantity, 0) + $1, updated_at = NOW() WHERE merchant_id = $2 AND sku = $3 AND stock_quantity IS NOT NULL`,
            [lineItem.quantity, merchantId, lineItem.sku],
          );
          if (result.rowCount > 0) affected++;
        }
      }
    }

    return affected;
  }

  // ============== DASHBOARD ==============

  @Get("dashboard/stats")
  @ApiOperation({
    summary: "Get dashboard statistics for authenticated merchant",
  })
  @ApiQuery({
    name: "days",
    description: "Number of days to include (1-365)",
    required: false,
    example: 30,
  })
  @ApiResponse({ status: 200, description: "Dashboard statistics" })
  async getDashboardStats(
    @Req() req: Request,
    @Query("days") daysRaw?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const requestedDays = Number.parseInt(String(daysRaw ?? "30"), 10);
    const periodDays = Number.isFinite(requestedDays)
      ? Math.min(Math.max(requestedDays, 1), 365)
      : 30;

    const periodEnd = new Date();
    periodEnd.setHours(23, 59, 59, 999);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - (periodDays - 1));
    periodStart.setHours(0, 0, 0, 0);

    const previousPeriodEnd = new Date(periodStart.getTime() - 1);
    const previousPeriodStart = new Date(previousPeriodEnd);
    previousPeriodStart.setDate(
      previousPeriodStart.getDate() - (periodDays - 1),
    );
    previousPeriodStart.setHours(0, 0, 0, 0);

    const isWithinRange = (
      value: Date | string | null | undefined,
      start: Date,
      end: Date,
    ): boolean => {
      if (!value) return false;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed >= start && parsed <= end;
    };

    const toOrderDate = (order: {
      created_at?: Date | string | null;
    }): Date | null => {
      const raw = order?.created_at;
      if (!raw) return null;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const normalizeStatus = (status: string | null | undefined) =>
      String(status || "")
        .trim()
        .toUpperCase();
    const isDraftStatus = (status: string) =>
      normalizeStatus(status) === "DRAFT";
    const isCancelledStatus = (status: string) =>
      ["CANCELLED", "RETURNED", "FAILED"].includes(normalizeStatus(status));
    const isCompletedStatus = (status: string) =>
      ["DELIVERED", "COMPLETED"].includes(normalizeStatus(status));
    const isInProgressStatus = (status: string) =>
      ["BOOKED", "SHIPPED", "OUT_FOR_DELIVERY"].includes(
        normalizeStatus(status),
      );
    const isPendingStatus = (status: string) =>
      !isDraftStatus(status) &&
      !isCancelledStatus(status) &&
      !isCompletedStatus(status) &&
      !isInProgressStatus(status);

    const percentChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const pad2 = (value: number) => String(value).padStart(2, "0");
    const dateKey = (value: Date): string =>
      `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

    const ordersResult = await this.pool.query<{
      id: string;
      order_data: Record<string, any>;
    }>(
      `SELECT
         o.id::text as id,
         to_jsonb(o) as order_data
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.created_at >= $2
         AND o.created_at <= $3
       ORDER BY o.created_at DESC`,
      [merchantId, previousPeriodStart, periodEnd],
    );

    const allOrders = ordersResult.rows.map((row) => {
      const o = row.order_data || {};
      const numericTotal = Number(o.total);
      return {
        id: row.id,
        orderNumber: String(o.order_number || o.orderNumber || row.id),
        customerName: String(o.customer_name || o.customerName || "عميل"),
        total: Number.isFinite(numericTotal) ? numericTotal : 0,
        status: String(o.status || ""),
        created_at: (o.created_at || o.createdAt || null) as
          | Date
          | string
          | null,
        paymentMethod: String(o.payment_method || o.paymentMethod || ""),
        paymentStatus: String(o.payment_status || o.paymentStatus || ""),
        deliveryFailureReason:
          o.delivery_failure_reason || o.deliveryFailureReason || null,
        cancelReason: o.cancel_reason || o.cancelReason || null,
        cancellationReason:
          o.cancellation_reason || o.cancellationReason || null,
      };
    });

    // Fetch conversations for activity stat
    const allConversations = await this.pool.query(
      `SELECT id, state, created_at, updated_at, last_message_at 
       FROM conversations 
       WHERE merchant_id = $1
         AND COALESCE(last_message_at, updated_at, created_at) >= $2
         AND COALESCE(last_message_at, updated_at, created_at) <= $3`,
      [merchantId, previousPeriodStart, periodEnd],
    );

    const currentOrders = allOrders.filter((o: any) =>
      isWithinRange(toOrderDate(o), periodStart, periodEnd),
    );
    const previousOrders = allOrders.filter((o: any) =>
      isWithinRange(toOrderDate(o), previousPeriodStart, previousPeriodEnd),
    );

    const countedCurrent = currentOrders.filter(
      (o: any) => !isDraftStatus(o.status),
    );
    const countedPrevious = previousOrders.filter(
      (o: any) => !isDraftStatus(o.status),
    );

    const totalOrders = countedCurrent.length;
    const previousTotalOrders = countedPrevious.length;
    const ordersChange = percentChange(totalOrders, previousTotalOrders);

    const currentRevenue = countedCurrent
      .filter((o: any) => isCompletedStatus(o.status))
      .reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
    const previousRevenue = countedPrevious
      .filter((o: any) => isCompletedStatus(o.status))
      .reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
    const revenueChange = percentChange(currentRevenue, previousRevenue);

    const activeConversations = allConversations.rows.filter((c: any) => {
      const state = String(c.state || "").toUpperCase();
      if (["CLOSED", "ORDER_PLACED"].includes(state)) return false;
      return isWithinRange(
        c.last_message_at || c.updated_at || c.created_at,
        periodStart,
        periodEnd,
      );
    }).length;
    const previousActiveConversations = allConversations.rows.filter(
      (c: any) => {
        const state = String(c.state || "").toUpperCase();
        if (["CLOSED", "ORDER_PLACED"].includes(state)) return false;
        return isWithinRange(
          c.last_message_at || c.updated_at || c.created_at,
          previousPeriodStart,
          previousPeriodEnd,
        );
      },
    ).length;
    const conversationsChange = percentChange(
      activeConversations,
      previousActiveConversations,
    );

    const pendingDeliveries = countedCurrent.filter((o: any) =>
      isInProgressStatus(o.status),
    ).length;
    const previousPendingDeliveries = countedPrevious.filter((o: any) =>
      isInProgressStatus(o.status),
    ).length;
    const deliveriesChange = percentChange(
      pendingDeliveries,
      previousPendingDeliveries,
    );

    // Build daily chart buckets for the selected period
    const byDay = new Map<string, any>();
    for (let i = 0; i < periodDays; i++) {
      const day = new Date(periodStart);
      day.setDate(periodStart.getDate() + i);
      const key = dateKey(day);
      byDay.set(key, {
        key,
        name: day.toLocaleDateString("ar-EG", {
          day: "2-digit",
          month: "2-digit",
        }),
        revenue: 0,
        completed: 0,
        pending: 0,
        cancelled: 0,
      });
    }

    countedCurrent.forEach((o: any) => {
      const createdAt = toOrderDate(o);
      if (!createdAt) return;
      const key = dateKey(createdAt);
      const bucket = byDay.get(key);
      if (!bucket) return;

      if (isCompletedStatus(o.status)) {
        bucket.revenue += Number(o.total || 0);
        bucket.completed += 1;
      } else if (isCancelledStatus(o.status)) {
        bucket.cancelled += 1;
      } else {
        bucket.pending += 1;
      }
    });

    const revenueByDay = Array.from(byDay.values()).map((b) => ({
      name: b.name,
      value: Math.round((Number(b.revenue) || 0) * 100) / 100,
    }));

    const ordersByDay = Array.from(byDay.values()).map((b) => ({
      name: b.name,
      completed: Number(b.completed) || 0,
      pending: Number(b.pending) || 0,
      cancelled: Number(b.cancelled) || 0,
    }));

    const distribution = {
      completed: countedCurrent.filter((o: any) => isCompletedStatus(o.status))
        .length,
      inDelivery: countedCurrent.filter((o: any) =>
        isInProgressStatus(o.status),
      ).length,
      pending: countedCurrent.filter((o: any) => isPendingStatus(o.status))
        .length,
      cancelled: countedCurrent.filter((o: any) => isCancelledStatus(o.status))
        .length,
    };
    const statusDistribution = [
      { name: "مكتمل", value: distribution.completed, color: "#22c55e" },
      { name: "قيد التوصيل", value: distribution.inDelivery, color: "#3b82f6" },
      { name: "معلق", value: distribution.pending, color: "#f59e0b" },
      { name: "ملغي", value: distribution.cancelled, color: "#ef4444" },
    ];

    const recentOrders = countedCurrent
      .sort((a: any, b: any) => {
        const aDate = toOrderDate(a)?.getTime() || 0;
        const bDate = toOrderDate(b)?.getTime() || 0;
        return bDate - aDate;
      })
      .slice(0, 5)
      .map((o: any) => ({
        id: o.orderNumber || o.id,
        customer: o.customerName || "عميل",
        total: Number(o.total || 0),
        status: o.status,
        createdAt: (toOrderDate(o) || periodEnd).toISOString(),
      }));

    // Premium block used by dashboard Pro cards
    let recoveredCarts = { count: 0, revenue: 0 };
    try {
      const recoveredResult = await this.pool.query<{
        count: string;
        revenue: string;
      }>(
        `SELECT COUNT(*)::text as count,
                COALESCE(SUM(COALESCE(order_value, cart_value)), 0)::text as revenue
         FROM recovered_carts
         WHERE merchant_id = $1
           AND is_recovered = true
           AND created_at >= $2
           AND created_at <= $3`,
        [merchantId, periodStart, periodEnd],
      );
      recoveredCarts = {
        count: Number(recoveredResult.rows[0]?.count || 0),
        revenue: Number(recoveredResult.rows[0]?.revenue || 0),
      };
    } catch {
      // optional table in some environments
    }

    const cancelledOrders = countedCurrent.filter((o: any) =>
      isCancelledStatus(o.status),
    );
    const failureReasonCounts = new Map<string, number>();
    cancelledOrders.forEach((order: any) => {
      const rawReason =
        order?.deliveryFailureReason ||
        order?.delivery_failure_reason ||
        order?.cancelReason ||
        order?.cancel_reason ||
        order?.cancellationReason ||
        order?.cancellation_reason ||
        "غير محدد";
      const reason = String(rawReason || "غير محدد");
      failureReasonCounts.set(
        reason,
        (failureReasonCounts.get(reason) || 0) + 1,
      );
    });
    const deliveryFailureReasons = Array.from(failureReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    let expensesTotal = 0;
    try {
      const expensesResult = await this.pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text as total
         FROM expenses e
         WHERE e.merchant_id = $1
           AND COALESCE(NULLIF(to_jsonb(e)->>'expense_date', '')::timestamp, e.created_at) >= $2
           AND COALESCE(NULLIF(to_jsonb(e)->>'expense_date', '')::timestamp, e.created_at) <= $3`,
        [merchantId, periodStart, periodEnd],
      );
      expensesTotal = Number(expensesResult.rows[0]?.total || 0);
    } catch {
      // optional table in some environments
    }

    const codPending = countedCurrent
      .filter(
        (o: any) =>
          String(o.paymentMethod || o.payment_method || "").toUpperCase() ===
          "COD",
      )
      .filter(
        (o: any) =>
          String(o.paymentStatus || o.payment_status || "").toUpperCase() !==
          "PAID",
      )
      .filter((o: any) => !isCancelledStatus(o.status))
      .reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

    const profitEstimate = currentRevenue - expensesTotal;
    const grossMargin =
      currentRevenue > 0 ? (profitEstimate / currentRevenue) * 100 : 0;

    return {
      period: {
        days: periodDays,
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
      },
      stats: {
        totalOrders,
        ordersChange: Math.round(ordersChange * 10) / 10,
        totalRevenue: Math.round(currentRevenue * 100) / 100,
        revenueChange: Math.round(revenueChange * 10) / 10,
        activeConversations,
        conversationsChange: Math.round(conversationsChange * 10) / 10,
        pendingDeliveries,
        deliveriesChange: Math.round(deliveriesChange * 10) / 10,
      },
      revenueByDay,
      ordersByDay,
      statusDistribution,
      recentOrders,
      premium: {
        recoveredCarts,
        deliveryFailures: {
          count: cancelledOrders.length,
          reasons: deliveryFailureReasons,
        },
        financeSummary: {
          profitEstimate: Math.round(profitEstimate * 100) / 100,
          codPending: Math.round(codPending * 100) / 100,
          spendingAlert: expensesTotal > currentRevenue && expensesTotal > 0,
          grossMargin: Math.round(grossMargin * 10) / 10,
        },
      },
    };
  }

  @Get("dashboard/cart-recovery")
  @RequiresFeature("KPI_DASHBOARD")
  @ApiOperation({
    summary: "Get cart recovery KPI metrics",
    description:
      "Returns abandoned cart followup metrics including recovery rate and recovered revenue",
  })
  @ApiQuery({
    name: "days",
    description: "Number of days to look back",
    required: false,
    example: 30,
  })
  @ApiResponse({ status: 200, description: "Cart recovery metrics retrieved" })
  async getCartRecoveryKpi(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const lookbackDays = days || 30;

    const endDate = new Date();
    const startDate = new Date(
      endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
    );

    const metrics = await this.analyticsService.getCartRecoveryMetrics(
      merchantId,
      {
        startDate,
        endDate,
      },
    );

    return {
      period: {
        days: lookbackDays,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      ...metrics,
    };
  }

  // ============== CONVERSATIONS ==============

  @Get("conversations")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "List conversations for authenticated merchant" })
  @ApiQuery({ name: "state", description: "Filter by state", required: false })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({
    name: "pageSize",
    description: "Items per page",
    required: false,
  })
  async listConversations(
    @Req() req: Request,
    @Query("state") state?: string,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
  ): Promise<{
    data: any[];
    totalCount: number;
    page: number;
    pageSize: number;
  }> {
    const merchantId = this.getMerchantId(req);
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const pageOffset = (pageNum - 1) * pageSizeNum;
    const filters = [`c.merchant_id = $1`];
    const values: any[] = [merchantId];

    if (state) {
      values.push(state);
      filters.push(`c.state = $${values.length}`);
    }

    const whereClause = filters.join(" AND ");
    const countResult = await this.pool.query(
      `SELECT COUNT(*) AS total
       FROM conversations c
       WHERE ${whereClause}`,
      values,
    );

    values.push(pageSizeNum, pageOffset);
    const result = await this.pool.query(
      `SELECT c.*,
          cu.name  AS cust_name,
          cu.phone AS cust_phone
       FROM conversations c
       LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.merchant_id = c.merchant_id
       WHERE ${whereClause}
       ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values,
    );

    return {
      data: result.rows.map((row: any) => {
        const conv = (this.conversationRepo as any).mapToEntity
          ? (this.conversationRepo as any).mapToEntity(row)
          : row;
        return this.mapConversationToDto(conv, [], {
          name: row.cust_name || undefined,
          phone: row.cust_phone || undefined,
        });
      }),
      totalCount: parseInt(countResult.rows[0]?.total || "0", 10),
      page: pageNum,
      pageSize: pageSizeNum,
    };
  }

  @Get("conversations/:id")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "Get conversation details" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiQuery({
    name: "includeMessages",
    description: "Include message history",
    required: false,
  })
  async getConversation(
    @Req() req: Request,
    @Param("id") id: string,
    @Query("includeMessages") includeMessages?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    let messages: Message[] = [];
    if (includeMessages === "true") {
      messages = await this.messageRepo.findByConversation(id);
    }

    return this.mapConversationToDto(conversation, messages);
  }

  @Post("conversations/:id/takeover")
  @RequiresFeature("CONVERSATIONS")
  @RequireRole("AGENT")
  @ApiOperation({ summary: "Take over conversation (human agent)" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  async takeoverConversation(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { userId: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    // Try to acquire lock
    const lockKey = `takeover:${id}`;
    const lock = await this.redisService.acquireLock(lockKey, this.LOCK_TTL_MS);

    if (!lock) {
      throw new ForbiddenException("Conversation is already being taken over");
    }

    try {
      // Update conversation with takeover info
      await this.conversationRepo.update(id, {
        state: "HUMAN_TAKEOVER",
        isHumanTakeover: true,
        takenOverBy: body.userId,
        takenOverAt: new Date(),
      } as any);

      // Store takeover info in Redis
      await this.redisService.set(
        `conversation:${id}:takeover`,
        JSON.stringify({
          userId: body.userId,
          takenAt: new Date().toISOString(),
        }),
        3600, // 1 hour TTL
      );

      return { success: true, message: "Conversation taken over successfully" };
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  @Post("conversations/:id/release")
  @RequiresFeature("CONVERSATIONS")
  @RequireRole("AGENT")
  @ApiOperation({ summary: "Release conversation back to AI" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  async releaseConversation(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    // Update conversation state
    await this.conversationRepo.update(id, {
      state:
        conversation.cart && Object.keys(conversation.cart as any).length > 0
          ? "COLLECTING_ITEMS"
          : "GREETING",
      isHumanTakeover: false,
      takenOverBy: null,
      takenOverAt: null,
    } as any);

    // Remove takeover info from Redis
    await this.redisService.del(`conversation:${id}:takeover`);

    return { success: true, message: "Conversation released" };
  }

  @Post("conversations/:id/send")
  @RequiresFeature("CONVERSATIONS")
  @RequireRole("AGENT")
  @ApiOperation({ summary: "Send message in human takeover mode" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message text to send" },
      },
      required: ["text"],
    },
  })
  async sendMessage(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { text: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const messageText = String(body?.text || "").trim();
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    // Verify takeover state
    if (conversation.state !== "HUMAN_TAKEOVER") {
      throw new ForbiddenException(
        "لا يمكن إرسال رسالة إلا في وضع التدخل البشري",
      );
    }

    if (!messageText) {
      throw new BadRequestException("نص الرسالة مطلوب");
    }

    if ((conversation.channel || "whatsapp") !== "whatsapp") {
      throw new BadRequestException(
        "الإرسال اليدوي من البوابة مدعوم حالياً لمحادثات واتساب فقط",
      );
    }

    // Create the message
    const message = await this.messageRepo.create({
      conversationId: id,
      merchantId,
      senderId: "portal-operator",
      direction: "OUTBOUND" as any,
      text: messageText,
      tokensUsed: 0,
    });

    await this.messageDeliveryService.queueMessage(
      message.id,
      merchantId,
      id,
      conversation.senderId,
      messageText,
      "meta",
    );

    // Update conversation last message time
    await this.conversationRepo.update(id, {
      lastMessageAt: new Date(),
    });

    this.logger.log({
      msg: "Manual message sent via portal",
      conversationId: id,
      merchantId,
      messageId: message.id,
      queuedForDelivery: true,
      recipientId: conversation.senderId,
    });

    return {
      success: true,
      messageId: message.id,
      message: "تم إرسال الرسالة بنجاح",
    };
  }

  // ============== ORDERS ==============

  @Post("orders")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("ORDERS")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Create manual order from portal",
    description:
      "Creates an order directly from the merchant portal without requiring a WhatsApp conversation.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "customerName",
        "customerPhone",
        "items",
        "deliveryType",
        "paymentMethod",
        "source",
      ],
      properties: {
        customerName: { type: "string" },
        customerPhone: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              catalogItemId: { type: "string" },
              sku: { type: "string" },
              name: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: "number" },
              notes: { type: "string" },
            },
          },
        },
        deliveryType: {
          type: "string",
          enum: ["delivery", "pickup", "dine_in"],
        },
        deliveryAddress: { type: "string" },
        paymentMethod: {
          type: "string",
          enum: ["cash", "card", "transfer"],
        },
        notes: { type: "string" },
        source: {
          type: "string",
          enum: ["manual", "manual_button", "cashier", "calls"],
        },
      },
    },
  })
  async createManualOrder(
    @Req() req: Request,
    @Body()
    body: {
      customerName: string;
      customerPhone: string;
      items: Array<{
        catalogItemId?: string;
        sku?: string;
        name?: string;
        quantity: number;
        unitPrice: number;
        notes?: string;
      }>;
      deliveryType: "delivery" | "pickup" | "dine_in";
      deliveryAddress?: string;
      paymentMethod: "cash" | "card" | "transfer";
      notes?: string;
      source: "manual" | "manual_button" | "cashier" | "calls";
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const customerName = String(body?.customerName || "").trim();
    const customerPhone = String(body?.customerPhone || "").trim();

    if (!customerName) {
      throw new BadRequestException("customerName is required");
    }
    if (!customerPhone) {
      throw new BadRequestException("customerPhone is required");
    }

    const source = String(body?.source || "")
      .trim()
      .toLowerCase();

    const allowedSources = ["manual", "manual_button", "cashier", "calls"];
    if (!allowedSources.includes(source)) {
      throw new BadRequestException(
        "source must be one of: manual, manual_button, cashier, calls",
      );
    }

    const sourceChannel = source === "manual" ? "manual_button" : source;

    const deliveryType = this.normalizeManualDeliveryType(body?.deliveryType);
    const paymentMethod = this.normalizeManualPaymentMethod(
      body?.paymentMethod,
    );
    const paymentMethodDb = this.toOrderPaymentMethod(paymentMethod);
    const deliveryAddressText = String(body?.deliveryAddress || "").trim();
    if (deliveryType === "delivery" && !deliveryAddressText) {
      throw new BadRequestException(
        "deliveryAddress is required when deliveryType is 'delivery'",
      );
    }

    const rawItems = Array.isArray(body?.items) ? body.items : [];
    if (rawItems.length === 0) {
      throw new BadRequestException("items must include at least one item");
    }

    const normalizedItems = rawItems.map((item, index) => {
      const catalogItemId = String(item?.catalogItemId || "").trim();
      const sku = String(item?.sku || "").trim();
      const name = String(item?.name || "").trim();
      const quantity = Number(item?.quantity);
      const unitPrice = Number(item?.unitPrice);

      if (!catalogItemId && !name) {
        throw new BadRequestException(
          `items[${index}] must include catalogItemId or name`,
        );
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(
          `items[${index}].quantity must be a positive number`,
        );
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          `items[${index}].unitPrice must be a non-negative number`,
        );
      }

      const lineTotal = Number((quantity * unitPrice).toFixed(2));
      return {
        catalogItemId: catalogItemId || undefined,
        sku: sku || undefined,
        name: name || "منتج",
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        notes:
          item?.notes && String(item.notes).trim().length > 0
            ? String(item.notes).trim()
            : undefined,
        lineTotal,
      };
    });

    await this.validateManualOrderStock(merchantId, normalizedItems);

    const subtotal = Number(
      normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );
    const deliveryFee = 0;
    const total = Number((subtotal + deliveryFee).toFixed(2));
    const orderNumber = await this.createUniquePortalOrderNumber(merchantId);
    const orderNotes = String(body?.notes || "").trim() || null;

    const deliveryAddressPayload =
      deliveryType === "delivery"
        ? {
            street: deliveryAddressText,
            raw_text: deliveryAddressText,
          }
        : null;

    const insertOrder = async (conversationId: string | null) =>
      this.pool.query<{
        id: string;
        order_number: string;
        status: string;
        total: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO orders (
           merchant_id,
           conversation_id,
           customer_id,
           order_number,
           status,
           items,
           subtotal,
           discount,
           delivery_fee,
           total,
           customer_name,
           customer_phone,
           delivery_address,
           delivery_notes,
           delivery_preference,
           payment_method,
           payment_status,
           source_channel,
           updated_at
         ) VALUES (
           $1,
           $2,
           NULL,
           $3,
           'DRAFT',
           $4,
           $5,
           0,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           'PENDING',
           $14,
           NOW()
         )
         RETURNING id::text as id, order_number, status::text as status, total::text as total, created_at, updated_at`,
        [
          merchantId,
          conversationId,
          orderNumber,
          JSON.stringify(normalizedItems),
          subtotal,
          deliveryFee,
          total,
          customerName,
          customerPhone,
          deliveryAddressPayload
            ? JSON.stringify(deliveryAddressPayload)
            : null,
          orderNotes,
          deliveryType.toUpperCase(),
          paymentMethodDb,
          sourceChannel,
        ],
      );

    let created;
    try {
      created = await insertOrder(null);
    } catch (error: any) {
      const code = String(error?.code || "");
      const message = String(error?.message || "").toLowerCase();
      if (code === "23502" && message.includes("conversation_id")) {
        const fallbackConversationId =
          await this.createManualConversationFallback(
            merchantId,
            customerName,
            customerPhone,
          );
        created = await insertOrder(fallbackConversationId);
      } else {
        throw error;
      }
    }

    const row = created.rows[0];

    return {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      total: Number(row.total || 0),
      customerName,
      customerPhone,
      items: normalizedItems,
      deliveryType,
      deliveryAddress: deliveryAddressText || null,
      paymentMethod,
      notes: orderNotes,
      source: sourceChannel,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  @Get("orders")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("ORDERS")
  @ApiOperation({ summary: "List orders for authenticated merchant" })
  @ApiQuery({
    name: "status",
    description: "Filter by status",
    required: false,
  })
  @ApiQuery({ name: "limit", description: "Max results", required: false })
  @ApiQuery({
    name: "offset",
    description: "Pagination offset",
    required: false,
  })
  @ApiQuery({
    name: "branchId",
    description: "Filter by branch id",
    required: false,
  })
  @ApiQuery({
    name: "source",
    description:
      "Filter by source channel (manual_button, cashier, calls, whatsapp, voice_ai)",
    required: false,
  })
  async listOrders(
    @Req() req: Request,
    @Query("status") status?: string,
    @Query("limit") limit?: string | number,
    @Query("offset") offset?: string | number,
    @Query("branchId") branchId?: string,
    @Query("source") source?: string,
  ): Promise<{ orders: any[]; total: number }> {
    const merchantId = this.getMerchantId(req);

    const filters: string[] = ["o.merchant_id = $1"];
    const values: Array<string | number> = [merchantId];

    if (status) {
      values.push(String(status).trim().toUpperCase());
      filters.push(`UPPER(o.status::text) = $${values.length}`);
    }

    if (branchId && String(branchId).trim().length > 0) {
      values.push(String(branchId).trim());
      filters.push(
        `COALESCE(NULLIF(to_jsonb(o)->>'branch_id', ''), '') = $${values.length}`,
      );
    }

    const normalizedSource = String(source || "")
      .trim()
      .toLowerCase();
    if (normalizedSource.length > 0 && normalizedSource !== "all") {
      if (normalizedSource === "manual_button") {
        values.push("manual_button", "manual");
        filters.push(
          `COALESCE(NULLIF(LOWER(to_jsonb(o)->>'source_channel'), ''), 'whatsapp') IN ($${values.length - 1}, $${values.length})`,
        );
      } else {
        values.push(normalizedSource);
        filters.push(
          `COALESCE(NULLIF(LOWER(to_jsonb(o)->>'source_channel'), ''), 'whatsapp') = $${values.length}`,
        );
      }
    }

    const whereClause = filters.join(" AND ");

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text as total FROM orders o WHERE ${whereClause}`,
      values,
    );

    const parsedOffset = Number(offset);
    const parsedLimit = Number(limit);
    const safeOffset =
      Number.isFinite(parsedOffset) && parsedOffset > 0
        ? Math.floor(parsedOffset)
        : 0;
    const hasLimit = Number.isFinite(parsedLimit) && parsedLimit > 0;
    const safeLimit = hasLimit ? Math.min(Math.floor(parsedLimit), 500) : null;

    const dataValues = [...values];
    let dataQuery = `
      SELECT
        o.id::text as id,
        o.merchant_id,
        o.conversation_id::text as conversation_id,
        o.order_number,
        o.status::text as status,
        o.items,
        o.subtotal,
        o.discount,
        o.delivery_fee,
        o.total,
        o.customer_name,
        o.customer_phone,
        o.delivery_address,
        o.delivery_notes,
        o.delivery_preference,
        o.created_at,
        o.updated_at,
        COALESCE(NULLIF(to_jsonb(o)->>'source_channel', ''), 'whatsapp') as source_channel
      FROM orders o
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
    `;

    if (hasLimit && safeLimit !== null) {
      dataValues.push(safeLimit, safeOffset);
      dataQuery += ` LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`;
    }

    const result = await this.pool.query<{
      id: string;
      merchant_id: string;
      conversation_id: string | null;
      order_number: string;
      status: string;
      items: unknown;
      subtotal: string | number | null;
      discount: string | number | null;
      delivery_fee: string | number | null;
      total: string | number | null;
      customer_name: string | null;
      customer_phone: string | null;
      delivery_address: unknown;
      delivery_notes: string | null;
      delivery_preference: string | null;
      created_at: Date;
      updated_at: Date;
      source_channel: string | null;
    }>(dataQuery, dataValues);

    const normalizedOrders = result.rows.map((order) => ({
      id: order.id,
      merchantId: order.merchant_id,
      conversationId: order.conversation_id || undefined,
      orderNumber: order.order_number,
      status: order.status,
      sourceChannel: String(order.source_channel || "whatsapp").toLowerCase(),
      items: this.normalizeOrderItems(order.items),
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      deliveryFee: Number(order.delivery_fee || 0),
      total: Number(order.total || 0),
      customerName: order.customer_name || undefined,
      customerPhone: order.customer_phone || undefined,
      deliveryAddress: order.delivery_address,
      deliveryNotes: order.delivery_notes || undefined,
      deliveryPreference: order.delivery_preference || undefined,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    }));

    const orderIds = normalizedOrders
      .map((order: any) => String(order.id))
      .filter(Boolean);
    try {
      const itemsByOrder = await this.loadOrderItemsFromTable(orderIds);
      const hydratedOrders = normalizedOrders.map((order: any) => {
        const fallbackItems = itemsByOrder.get(String(order.id)) || [];
        return {
          ...order,
          items: order.items.length > 0 ? order.items : fallbackItems,
        };
      });

      return {
        orders: hydratedOrders,
        total: Number(countResult.rows[0]?.total || 0),
      };
    } catch (error) {
      this.logger.warn(
        `Failed to hydrate order items from order_items table: ${String(error)}`,
      );
    }

    return {
      orders: normalizedOrders,
      total: Number(countResult.rows[0]?.total || 0),
    };
  }

  @Get("orders/:id")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("ORDERS")
  @ApiOperation({ summary: "Get order details" })
  @ApiParam({ name: "id", description: "Order ID" })
  async getOrder(@Req() req: Request, @Param("id") id: string): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const order = await this.orderRepo.findById(id);

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (order.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    const normalizedItems = this.normalizeOrderItems((order as any).items);
    if (normalizedItems.length > 0) {
      return { ...order, items: normalizedItems };
    }

    try {
      const itemsByOrder = await this.loadOrderItemsFromTable([
        String(order.id),
      ]);
      return {
        ...order,
        items: itemsByOrder.get(String(order.id)) || [],
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load order items for order ${id}: ${String(error)}`,
      );
      return { ...order, items: normalizedItems };
    }
  }

  @Patch("orders/:id/status")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("ORDERS")
  @ApiOperation({ summary: "Update order status" })
  @ApiParam({ name: "id", description: "Order ID" })
  async updateOrderStatus(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { status: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const order = await this.orderRepo.findById(id);

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    if (order.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    const validStatuses = [
      "DRAFT",
      "CONFIRMED",
      "BOOKED",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ];
    const newStatus = (body.status || "").toUpperCase();
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      );
    }

    const oldStatus = order.status;
    await this.pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3`,
      [newStatus, id, merchantId],
    );

    // ─── Auto stock lifecycle management ─────────────────────
    // Stock is FROZEN (deducted) when order enters active state for the first time
    // Stock is RELEASED (restored) when order is cancelled
    // No action needed for transitions between active states (DRAFT→CONFIRMED→SHIPPED etc.)
    try {
      const stockCheck = await this.pool.query(
        `SELECT COALESCE(stock_deducted, false) as stock_deducted FROM orders WHERE id = $1`,
        [id],
      );
      const stockAlreadyDeducted = stockCheck.rows[0]?.stock_deducted || false;

      // FREEZE: First time entering any active (non-CANCELLED) state
      if (newStatus !== "CANCELLED" && !stockAlreadyDeducted) {
        const deducted = await this.handleStockForOrder(
          id,
          merchantId,
          "DEDUCT",
        );
        await this.pool.query(
          `UPDATE orders SET stock_deducted = true WHERE id = $1`,
          [id],
        );
        this.logger.log(
          `[STOCK] Frozen stock for order ${id} (${deducted} items deducted)`,
        );
      }

      // RELEASE: Active order being cancelled
      if (newStatus === "CANCELLED" && stockAlreadyDeducted) {
        const restored = await this.handleStockForOrder(
          id,
          merchantId,
          "RESTORE",
        );
        await this.pool.query(
          `UPDATE orders SET stock_deducted = false WHERE id = $1`,
          [id],
        );
        this.logger.log(
          `[STOCK] Released stock for cancelled order ${id} (${restored} items restored)`,
        );
      }
    } catch (stockErr) {
      this.logger.error(
        `[STOCK] Stock operation failed for order ${id}: ${stockErr}`,
      );
      // Don't fail the status update if stock operation fails
    }

    return { success: true, orderId: id, status: newStatus };
  }

  @Post("orders/:id/reorder")
  @RequireRole("MANAGER")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("ORDERS")
  @ApiOperation({
    summary: "Create a reorder from existing order",
    description:
      "Creates a new order based on a previous order. Checks inventory availability for each item.",
  })
  @ApiParam({ name: "id", description: "Original Order ID to reorder" })
  async createReorder(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const originalOrder = await this.orderRepo.findById(id);

    if (!originalOrder) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (originalOrder.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    let sourceItems = this.normalizeOrderItems((originalOrder as any).items);
    if (sourceItems.length === 0) {
      try {
        const itemsByOrder = await this.loadOrderItemsFromTable([String(id)]);
        sourceItems = itemsByOrder.get(String(id)) || [];
      } catch (error) {
        this.logger.warn(
          `Failed to hydrate items for reorder ${id}: ${String(error)}`,
        );
      }
    }

    const reorderItems = sourceItems
      .map((item: any, index: number) => {
        const catalogItemId = String(
          item?.catalogItemId || item?.catalog_item_id || "",
        ).trim();
        const sku = String(item?.sku || item?.variantSku || "").trim();
        const name = String(
          item?.name || item?.productName || item?.title || sku || "منتج",
        ).trim();
        const quantity = Math.max(
          0,
          Math.trunc(
            this.toFiniteNumber(item?.quantity ?? item?.qty ?? item?.count, 0),
          ),
        );
        const lineTotalInput = this.toFiniteNumber(
          item?.lineTotal ??
            item?.line_total ??
            item?.total ??
            item?.totalPrice ??
            item?.total_price,
          NaN,
        );
        const unitPriceInput = this.toFiniteNumber(
          item?.unitPrice ?? item?.unit_price ?? item?.price,
          NaN,
        );

        let unitPrice =
          Number.isFinite(unitPriceInput) && unitPriceInput >= 0
            ? unitPriceInput
            : 0;
        if (
          unitPrice <= 0 &&
          Number.isFinite(lineTotalInput) &&
          lineTotalInput > 0 &&
          quantity > 0
        ) {
          unitPrice = Number((lineTotalInput / quantity).toFixed(2));
        }

        if (quantity <= 0) {
          return null;
        }

        return {
          index,
          catalogItemId: catalogItemId || undefined,
          sku: sku || undefined,
          name: name || "منتج",
          quantity,
          unitPrice: Number(unitPrice.toFixed(2)),
          lineTotal: Number((quantity * unitPrice).toFixed(2)),
        };
      })
      .filter(Boolean) as Array<{
      index: number;
      catalogItemId?: string;
      sku?: string;
      name: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;

    if (reorderItems.length === 0) {
      return {
        success: false,
        message: "لا يمكن إعادة الطلب - لا توجد عناصر صالحة في الطلب الأصلي",
        unavailableItems: [],
      };
    }

    try {
      await this.validateManualOrderStock(
        merchantId,
        reorderItems.map((item) => ({
          catalogItemId: item.catalogItemId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        const response = error.getResponse();
        const payload =
          response && typeof response === "object"
            ? (response as Record<string, any>)
            : {};
        const directUnavailable = Array.isArray(payload.unavailableItems)
          ? payload.unavailableItems
          : [];
        const nestedMessage = payload.message;
        const nestedUnavailable =
          nestedMessage &&
          typeof nestedMessage === "object" &&
          Array.isArray((nestedMessage as Record<string, any>).unavailableItems)
            ? ((nestedMessage as Record<string, any>).unavailableItems as any[])
            : [];

        return {
          success: false,
          message: "لا يمكن إعادة الطلب - بعض المنتجات غير متوفرة حالياً",
          unavailableItems:
            directUnavailable.length > 0
              ? directUnavailable
              : nestedUnavailable,
        };
      }
      throw error;
    }

    const total = Number(
      reorderItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );

    const newOrderNumber = await this.createUniquePortalOrderNumber(merchantId);

    const result = await this.pool.query(
      `INSERT INTO orders (
        merchant_id, customer_id, customer_name, customer_phone, 
        delivery_address, items, subtotal, total, status, order_number,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9, $10)
      RETURNING *`,
      [
        merchantId,
        originalOrder.customerId,
        originalOrder.customerName,
        originalOrder.customerPhone,
        originalOrder.deliveryAddress,
        JSON.stringify(
          reorderItems.map((i) => ({
            catalogItemId: i.catalogItemId,
            sku: i.sku,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        ),
        total,
        total,
        newOrderNumber,
        `إعادة طلب من #${originalOrder.orderNumber}`,
      ],
    );

    const newOrder = result.rows[0];

    // Audit log
    await this.auditService
      .log({
        merchantId,
        action: "CREATE",
        resource: "ORDER",
        resourceId: newOrder.id,
        newValues: {
          orderNumber: newOrderNumber,
          reorderFrom: originalOrder.orderNumber,
          itemCount: reorderItems.length,
        },
        metadata: { reorderFromId: id },
      })
      .catch(() => {});

    // Freeze stock for the created reorder immediately.
    try {
      const stockDeducted = await this.handleStockForOrder(
        newOrder.id,
        merchantId,
        "DEDUCT",
      );
      await this.pool.query(
        `UPDATE orders SET stock_deducted = true WHERE id = $1`,
        [newOrder.id],
      );
      this.logger.log(
        `[STOCK] Frozen stock for reorder ${newOrder.id} (${stockDeducted} items)`,
      );
    } catch (stockErr) {
      this.logger.error(
        `[STOCK] Failed to freeze stock for reorder ${newOrder.id}: ${stockErr}`,
      );
    }

    return {
      success: true,
      message: "تم إنشاء الطلب بنجاح",
      orderId: newOrder.id,
      orderNumber: newOrderNumber,
      availableItems: reorderItems.map((item) => ({
        sku: item.sku,
        name: item.name,
        requestedQty: item.quantity,
        availableQty: item.quantity,
        unitPrice: item.unitPrice,
        available: true,
      })),
      unavailableItems: [],
      total,
    };
  }

  // ============== ADVANCED ANALYTICS ==============

  @Get("analytics/conversion")
  @RequiresFeature("KPI_DASHBOARD")
  @ApiOperation({ summary: "Get conversion funnel analytics" })
  @ApiQuery({
    name: "days",
    description: "Number of days to analyze",
    required: false,
  })
  async getConversionAnalytics(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const parsedDays = Number(days);
    const daysBack = Number.isFinite(parsedDays)
      ? Math.min(Math.max(parsedDays, 1), 365)
      : 30;
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Get conversation funnel data — purely conversation-state based
    // "completed" = conversations that reached ORDER_PLACED state
    const funnel = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE UPPER(COALESCE(state::text, '')) <> '') as total_conversations,
         COUNT(*) FILTER (WHERE UPPER(COALESCE(state::text, '')) IN (
           'COLLECTING_ITEMS', 'COLLECTING_VARIANTS', 'COLLECTING_CUSTOMER_INFO',
           'COLLECTING_ADDRESS', 'NEGOTIATING', 'CONFIRMING_ORDER', 'ORDER_PLACED'
         )) as added_to_cart,
         COUNT(*) FILTER (WHERE UPPER(COALESCE(state::text, '')) IN (
           'COLLECTING_CUSTOMER_INFO', 'COLLECTING_ADDRESS', 'NEGOTIATING',
           'CONFIRMING_ORDER', 'ORDER_PLACED'
         )) as started_checkout,
         COUNT(*) FILTER (WHERE UPPER(COALESCE(state::text, '')) = 'ORDER_PLACED') as completed_order
       FROM conversations
       WHERE merchant_id = $1
         AND COALESCE(last_message_at, updated_at, created_at) >= $2`,
      [merchantId, startDate],
    );

    const f = funnel.rows[0];
    const totalConversations = parseInt(f.total_conversations) || 0;
    const completedOrder = parseInt(f.completed_order) || 0;
    const addedToCart = parseInt(f.added_to_cart) || 0;
    const startedCheckout = parseInt(f.started_checkout) || 0;
    const total = totalConversations || 1;

    return {
      period: { days: daysBack, startDate: startDate.toISOString() },
      funnel: {
        totalConversations,
        addedToCart,
        startedCheckout,
        completedOrder,
      },
      rates: {
        cartRate: Math.round((addedToCart / total) * 100),
        checkoutRate: Math.round((startedCheckout / total) * 100),
        conversionRate: Math.round((completedOrder / total) * 100),
        cartToCheckout:
          addedToCart > 0
            ? Math.round((startedCheckout / addedToCart) * 100)
            : 0,
        checkoutToOrder:
          startedCheckout > 0
            ? Math.round((completedOrder / startedCheckout) * 100)
            : 0,
      },
    };
  }

  @Get("analytics/response-times")
  @RequiresFeature("KPI_DASHBOARD")
  @ApiOperation({ summary: "Get response time analytics" })
  @ApiQuery({
    name: "days",
    description: "Number of days to analyze",
    required: false,
  })
  async getResponseTimeAnalytics(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const parsedDays = Number(days);
    const daysBack = Number.isFinite(parsedDays)
      ? Math.min(Math.max(parsedDays, 1), 365)
      : 7;
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Calculate average response times
    const responseTimes = await this.pool.query(
      `WITH normalized_messages AS (
         SELECT
           m.id,
           m.conversation_id,
           m.created_at,
           CASE
             WHEN UPPER(COALESCE(m.direction, '')) IN ('OUTBOUND', 'OUTGOING', 'AGENT', 'SYSTEM') THEN 'OUT'
             WHEN UPPER(COALESCE(m.direction, '')) IN ('INBOUND', 'INCOMING', 'CUSTOMER') THEN 'IN'
             WHEN LOWER(COALESCE(m.sender_id, '')) IN ('system', 'bot', 'assistant', 'agent') THEN 'OUT'
             ELSE 'IN'
           END as direction_norm
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.merchant_id = $1
           AND m.created_at >= $2
       ),
       message_pairs AS (
         SELECT
           m1.conversation_id,
           m1.created_at as customer_time,
           MIN(m2.created_at) as response_time
         FROM normalized_messages m1
         JOIN normalized_messages m2
           ON m1.conversation_id = m2.conversation_id
          AND m2.created_at > m1.created_at
          AND m2.direction_norm = 'OUT'
         WHERE m1.direction_norm = 'IN'
         GROUP BY m1.id, m1.conversation_id, m1.created_at
       )
       SELECT 
         COUNT(*) as sample_count,
         AVG(EXTRACT(EPOCH FROM (response_time - customer_time))) as avg_seconds,
         MIN(EXTRACT(EPOCH FROM (response_time - customer_time))) as min_seconds,
         MAX(EXTRACT(EPOCH FROM (response_time - customer_time))) as max_seconds,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (response_time - customer_time))) as median_seconds
       FROM message_pairs
       WHERE response_time IS NOT NULL`,
      [merchantId, startDate],
    );

    const r = responseTimes.rows[0];
    const sampleCount = parseInt(r.sample_count) || 0;

    return {
      period: { days: daysBack, startDate: startDate.toISOString() },
      hasData: sampleCount > 0,
      responseTimes: {
        sampleCount,
        averageSeconds: Math.round(parseFloat(r.avg_seconds) || 0),
        minSeconds: Math.round(parseFloat(r.min_seconds) || 0),
        maxSeconds: Math.round(parseFloat(r.max_seconds) || 0),
        medianSeconds: Math.round(parseFloat(r.median_seconds) || 0),
      },
      formatted: {
        average: this.formatDuration(parseFloat(r.avg_seconds) || 0),
        min: this.formatDuration(parseFloat(r.min_seconds) || 0),
        max: this.formatDuration(parseFloat(r.max_seconds) || 0),
        median: this.formatDuration(parseFloat(r.median_seconds) || 0),
      },
    };
  }

  @Get("analytics/popular-products")
  @RequiresFeature("KPI_DASHBOARD")
  @ApiOperation({ summary: "Get popular products analytics" })
  @ApiQuery({
    name: "days",
    description: "Number of days to analyze",
    required: false,
  })
  @ApiQuery({ name: "limit", description: "Max results", required: false })
  async getPopularProductsAnalytics(
    @Req() req: Request,
    @Query("days") days?: number,
    @Query("limit") limit?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const parsedDays = Number(days);
    const daysBack = Number.isFinite(parsedDays)
      ? Math.min(Math.max(parsedDays, 1), 365)
      : 30;
    const parsedLimit = Number(limit);
    const maxResults = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 50)
      : 10;
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Get most ordered products from order_items first; fallback to orders.items JSON only if needed
    let productRows: any[] = [];
    try {
      const products = await this.pool.query(
        `WITH order_scope AS (
           SELECT o.id, o.items
           FROM orders o
           WHERE o.merchant_id = $1
             AND o.created_at >= $2
             AND UPPER(COALESCE(o.status::text, '')) NOT IN ('CANCELLED', 'DRAFT')
         ),
         item_rows AS (
           SELECT
             COALESCE(oi.catalog_item_id::text, oi.sku, oi.name, 'unknown') as item_id,
             COALESCE(NULLIF(oi.name, ''), oi.sku, 'منتج غير مسمى') as name,
             oi.quantity::numeric as quantity,
             COALESCE(oi.total_price, oi.unit_price * oi.quantity, 0)::numeric as total_price,
             os.id as order_id
           FROM order_scope os
           JOIN order_items oi ON oi.order_id = os.id
         ),
         json_rows AS (
           SELECT
             COALESCE(
               NULLIF(item_data->>'catalogItemId', ''),
               NULLIF(item_data->>'itemId', ''),
               NULLIF(item_data->>'sku', ''),
               NULLIF(item_data->>'name', ''),
               'unknown'
             ) as item_id,
             COALESCE(
               NULLIF(item_data->>'nameAr', ''),
               NULLIF(item_data->>'name', ''),
               NULLIF(item_data->>'title', ''),
               'منتج غير مسمى'
             ) as name,
             COALESCE(
               CASE WHEN COALESCE(item_data->>'quantity', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'quantity')::numeric END,
               CASE WHEN COALESCE(item_data->>'qty', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'qty')::numeric END,
               1
             ) as quantity,
             COALESCE(
               CASE WHEN COALESCE(item_data->>'lineTotal', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'lineTotal')::numeric END,
               CASE WHEN COALESCE(item_data->>'total', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'total')::numeric END,
               (
                 COALESCE(
                   CASE WHEN COALESCE(item_data->>'price', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'price')::numeric END,
                   CASE WHEN COALESCE(item_data->>'unitPrice', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'unitPrice')::numeric END,
                   0
                 ) * COALESCE(
                   CASE WHEN COALESCE(item_data->>'quantity', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'quantity')::numeric END,
                   CASE WHEN COALESCE(item_data->>'qty', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'qty')::numeric END,
                   1
                 )
               ),
               0
             ) as total_price,
             os.id as order_id
           FROM order_scope os
           LEFT JOIN LATERAL jsonb_array_elements(
             CASE
             WHEN jsonb_typeof(os.items::jsonb) = 'array' THEN os.items::jsonb
             WHEN jsonb_typeof(os.items::jsonb) = 'object' AND jsonb_typeof((os.items::jsonb)->'items') = 'array' THEN (os.items::jsonb)->'items'
               ELSE '[]'::jsonb
             END
           ) item_data ON true
           WHERE item_data IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = os.id)
         ),
         unified AS (
           SELECT * FROM item_rows
           UNION ALL
           SELECT * FROM json_rows
         )
         SELECT
           MAX(item_id) as item_id,
           LOWER(name) as name_key,
           MAX(name) as name,
           SUM(quantity)::text as total_quantity,
           SUM(total_price)::text as total_revenue,
           COUNT(DISTINCT order_id)::text as order_count
         FROM unified
         WHERE name IS NOT NULL AND LOWER(name) != 'unknown' AND LOWER(name) != 'منتج غير مسمى'
         GROUP BY LOWER(name)
         ORDER BY SUM(quantity) DESC, SUM(total_price) DESC
         LIMIT $3`,
        [merchantId, startDate, maxResults],
      );
      productRows = products.rows;
    } catch (error) {
      this.logger.warn(
        `[ANALYTICS] popular-products primary query failed, using orders.items fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      const fallbackProducts = await this.pool.query(
        `WITH order_scope AS (
           SELECT o.id, o.items
           FROM orders o
           WHERE o.merchant_id = $1
             AND o.created_at >= $2
             AND UPPER(COALESCE(o.status::text, '')) NOT IN ('CANCELLED', 'DRAFT')
         ),
         json_rows AS (
           SELECT
             COALESCE(
               NULLIF(item_data->>'catalogItemId', ''),
               NULLIF(item_data->>'itemId', ''),
               NULLIF(item_data->>'sku', ''),
               NULLIF(item_data->>'name', ''),
               'unknown'
             ) as item_id,
             COALESCE(
               NULLIF(item_data->>'nameAr', ''),
               NULLIF(item_data->>'name', ''),
               NULLIF(item_data->>'title', ''),
               'منتج غير مسمى'
             ) as name,
             COALESCE(
               CASE WHEN COALESCE(item_data->>'quantity', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'quantity')::numeric END,
               CASE WHEN COALESCE(item_data->>'qty', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'qty')::numeric END,
               1
             ) as quantity,
             COALESCE(
               CASE WHEN COALESCE(item_data->>'lineTotal', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'lineTotal')::numeric END,
               CASE WHEN COALESCE(item_data->>'total', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'total')::numeric END,
               (
                 COALESCE(
                   CASE WHEN COALESCE(item_data->>'price', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'price')::numeric END,
                   CASE WHEN COALESCE(item_data->>'unitPrice', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'unitPrice')::numeric END,
                   0
                 ) * COALESCE(
                   CASE WHEN COALESCE(item_data->>'quantity', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'quantity')::numeric END,
                   CASE WHEN COALESCE(item_data->>'qty', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (item_data->>'qty')::numeric END,
                   1
                 )
               ),
               0
             ) as total_price,
             os.id as order_id
           FROM order_scope os
           LEFT JOIN LATERAL jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(os.items::jsonb) = 'array' THEN os.items::jsonb
               WHEN jsonb_typeof(os.items::jsonb) = 'object' AND jsonb_typeof((os.items::jsonb)->'items') = 'array' THEN (os.items::jsonb)->'items'
               ELSE '[]'::jsonb
             END
           ) item_data ON true
           WHERE item_data IS NOT NULL
         )
         SELECT
           MAX(item_id) as item_id,
           LOWER(name) as name_key,
           MAX(name) as name,
           SUM(quantity)::text as total_quantity,
           SUM(total_price)::text as total_revenue,
           COUNT(DISTINCT order_id)::text as order_count
         FROM json_rows
         WHERE name IS NOT NULL AND LOWER(name) != 'unknown' AND LOWER(name) != 'منتج غير مسمى'
         GROUP BY LOWER(name)
         ORDER BY SUM(quantity) DESC, SUM(total_price) DESC
         LIMIT $3`,
        [merchantId, startDate, maxResults],
      );
      productRows = fallbackProducts.rows;
    }

    return {
      period: { days: daysBack, startDate: startDate.toISOString() },
      products: productRows.map((p, idx) => ({
        rank: idx + 1,
        itemId: p.item_id,
        name: p.name_ar || p.name,
        totalQuantity: parseInt(p.total_quantity) || 0,
        totalRevenue: parseFloat(p.total_revenue) || 0,
        orderCount: parseInt(p.order_count) || 0,
      })),
    };
  }

  @Get("analytics/peak-hours")
  @RequiresFeature("KPI_DASHBOARD")
  @ApiOperation({ summary: "Get peak hours analytics" })
  @ApiQuery({
    name: "days",
    description: "Number of days to analyze",
    required: false,
  })
  async getPeakHoursAnalytics(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const parsedDays = Number(days);
    const daysBack = Number.isFinite(parsedDays)
      ? Math.min(Math.max(parsedDays, 1), 365)
      : 14;
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Get messages by hour
    const hourlyData = await this.pool.query(
      `WITH normalized_messages AS (
         SELECT
           m.created_at,
           CASE
             WHEN UPPER(COALESCE(m.direction, '')) IN ('OUTBOUND', 'OUTGOING', 'AGENT', 'SYSTEM') THEN 'OUT'
             WHEN UPPER(COALESCE(m.direction, '')) IN ('INBOUND', 'INCOMING', 'CUSTOMER') THEN 'IN'
             WHEN LOWER(COALESCE(m.sender_id, '')) IN ('system', 'bot', 'assistant', 'agent') THEN 'OUT'
             ELSE 'IN'
           END as direction_norm
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.merchant_id = $1
           AND m.created_at >= $2
       )
       SELECT
         EXTRACT(HOUR FROM created_at) as hour,
         COUNT(*) as message_count,
         COUNT(*) FILTER (WHERE direction_norm = 'IN') as inbound_count,
         COUNT(*) FILTER (WHERE direction_norm = 'OUT') as outbound_count
       FROM normalized_messages
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [merchantId, startDate],
    );

    // Get orders by hour
    const ordersByHour = await this.pool.query(
      `SELECT 
         EXTRACT(HOUR FROM created_at) as hour,
         COUNT(*) as order_count
       FROM orders
       WHERE merchant_id = $1
         AND created_at >= $2
         AND UPPER(COALESCE(status::text, '')) NOT IN ('CANCELLED', 'DRAFT')
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [merchantId, startDate],
    );

    // Build 24-hour array
    const hourlyStats = Array.from({ length: 24 }, (_, i) => {
      const msgData = hourlyData.rows.find((r) => parseInt(r.hour) === i);
      const orderData = ordersByHour.rows.find((r) => parseInt(r.hour) === i);
      return {
        hour: i,
        hourLabel: `${i.toString().padStart(2, "0")}:00`,
        messageCount: parseInt(msgData?.message_count) || 0,
        inboundCount: parseInt(msgData?.inbound_count) || 0,
        outboundCount: parseInt(msgData?.outbound_count) || 0,
        orderCount: parseInt(orderData?.order_count) || 0,
      };
    });

    // Find peak hours
    const peakMessageHour = hourlyStats.reduce((max, h) =>
      h.messageCount > max.messageCount ? h : max,
    );
    const peakOrderHour = hourlyStats.reduce((max, h) =>
      h.orderCount > max.orderCount ? h : max,
    );
    const hasData = hourlyStats.some(
      (h) => h.messageCount > 0 || h.orderCount > 0,
    );

    return {
      period: { days: daysBack, startDate: startDate.toISOString() },
      hasData,
      hourlyStats,
      peaks: {
        messages: {
          hour: peakMessageHour.hour,
          label: peakMessageHour.hourLabel,
          count: peakMessageHour.messageCount,
        },
        orders: {
          hour: peakOrderHour.hour,
          label: peakOrderHour.hourLabel,
          count: peakOrderHour.orderCount,
        },
      },
    };
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)} ثانية`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} دقيقة`;
    return `${Math.round(seconds / 3600)} ساعة`;
  }

  // ============== MERCHANT PROFILE ==============

  @Get("me")
  @ApiOperation({
    summary: "Get current merchant context",
    description:
      "Returns merchant profile, enabled agents, enabled features, plan, and role for portal UI context",
  })
  @ApiResponse({ status: 200, description: "Merchant context retrieved" })
  async getMe(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const merchantResult = await this.pool.query<{
      merchant_data: Record<string, any>;
    }>(
      `SELECT to_jsonb(m) as merchant_data FROM merchants m WHERE m.id = $1 LIMIT 1`,
      [merchantId],
    );

    if (merchantResult.rows.length === 0) {
      throw new NotFoundException("Merchant not found");
    }

    const merchantData = merchantResult.rows[0]?.merchant_data || {};

    const normalizeArray = (value: any): string[] | null => {
      if (Array.isArray(value)) {
        const normalized = value
          .map((item) => String(item).trim().toUpperCase())
          .filter(Boolean);
        return normalized.length > 0 ? normalized : null;
      }
      if (value && typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            const normalized = parsed
              .map((item) => String(item).trim().toUpperCase())
              .filter(Boolean);
            return normalized.length > 0 ? normalized : null;
          }
          return null;
        } catch {
          return null;
        }
      }
      return null;
    };

    const normalizePlan = (value: any): string | null => {
      if (!value) return null;
      const normalized = String(value).trim();
      return normalized ? normalized.toLowerCase() : null;
    };

    const boolFrom = (value: any, fallback = true): boolean => {
      if (value === null || value === undefined) return fallback;
      if (typeof value === "boolean") return value;
      const normalized = String(value).trim().toLowerCase();
      if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
      return fallback;
    };

    const parseJsonObject = (value: any): Record<string, any> => {
      if (!value) return {};
      if (typeof value === "object") return value;
      if (typeof value !== "string") return {};
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    };

    let subscription: {
      plan_code: string | null;
      features: any;
      agents: any;
      limits: any;
    } | null = null;

    try {
      const subscriptionWithPlan = await this.pool.query<{
        plan_code: string | null;
        features: any;
        agents: any;
        limits: any;
      }>(
        `SELECT
           COALESCE(NULLIF(to_jsonb(bp)->>'code', ''), NULLIF(to_jsonb(ms)->>'plan_code', '')) as plan_code,
           to_jsonb(bp)->'features' as features,
           to_jsonb(bp)->'agents' as agents,
           to_jsonb(bp)->'limits' as limits
         FROM merchant_subscriptions ms
         LEFT JOIN billing_plans bp
           ON (
             bp.id::text = COALESCE(NULLIF(to_jsonb(ms)->>'plan_id', ''), '')
             OR UPPER(bp.code) = UPPER(COALESCE(NULLIF(to_jsonb(ms)->>'plan_code', ''), ''))
           )
         WHERE COALESCE(to_jsonb(ms)->>'merchant_id', '') = $1
         ORDER BY
           CASE UPPER(COALESCE(to_jsonb(ms)->>'status', ''))
             WHEN 'ACTIVE' THEN 0
             WHEN 'PENDING' THEN 1
             ELSE 2
           END,
           COALESCE(
             NULLIF(to_jsonb(ms)->>'updated_at', '')::timestamptz,
             NULLIF(to_jsonb(ms)->>'created_at', '')::timestamptz,
             NOW()
           ) DESC
         LIMIT 1`,
        [merchantId],
      );
      subscription = subscriptionWithPlan.rows[0] || null;
    } catch (error) {
      this.logger.warn(
        `Unable to resolve billing plan for merchant ${merchantId}: ${(error as Error).message}`,
      );
      try {
        const subscriptionWithoutPlan = await this.pool.query<{
          plan_code: string | null;
        }>(
          `SELECT NULLIF(to_jsonb(ms)->>'plan_code', '') as plan_code
           FROM merchant_subscriptions ms
           WHERE COALESCE(to_jsonb(ms)->>'merchant_id', '') = $1
           ORDER BY
             CASE UPPER(COALESCE(to_jsonb(ms)->>'status', ''))
               WHEN 'ACTIVE' THEN 0
               WHEN 'PENDING' THEN 1
               ELSE 2
             END,
             COALESCE(
               NULLIF(to_jsonb(ms)->>'updated_at', '')::timestamptz,
               NULLIF(to_jsonb(ms)->>'created_at', '')::timestamptz,
               NOW()
             ) DESC
           LIMIT 1`,
          [merchantId],
        );
        const fallbackPlanCode =
          subscriptionWithoutPlan.rows[0]?.plan_code || null;
        if (fallbackPlanCode) {
          subscription = {
            plan_code: fallbackPlanCode,
            features: null,
            agents: null,
            limits: null,
          };
        }
      } catch {
        subscription = null;
      }
    }

    const planFeatures = normalizeArray(subscription?.features);
    const planAgents = normalizeArray(subscription?.agents);
    const merchantFeatures = normalizeArray(
      merchantData.enabled_features ?? merchantData.enabledFeatures,
    );
    const merchantAgents = normalizeArray(
      merchantData.enabled_agents ?? merchantData.enabledAgents,
    );

    let plan =
      normalizePlan(subscription?.plan_code) ||
      normalizePlan(merchantData.plan);
    const dailyTokenBudget = Number(merchantData.daily_token_budget || 0);
    if (!plan) {
      if (dailyTokenBudget >= 500000) plan = "enterprise";
      else if (dailyTokenBudget >= 100000) plan = "pro";
      else plan = "starter";
    }

    const planEntitlements =
      PLAN_ENTITLEMENTS[String(plan).toUpperCase() as PlanType];

    // Default entitlements if not set
    const enabledAgents = planAgents ||
      merchantAgents ||
      planEntitlements?.enabledAgents || ["OPS_AGENT"];
    const enabledFeatures = planFeatures ||
      merchantFeatures ||
      planEntitlements?.enabledFeatures || [
        "CONVERSATIONS",
        "ORDERS",
        "CATALOG",
      ];

    const config = parseJsonObject(merchantData.config);
    const createdAtValue = merchantData.created_at || merchantData.createdAt;
    const createdAt = createdAtValue ? new Date(createdAtValue) : new Date();

    return {
      id: String(merchantData.id || merchantId),
      name: String(merchantData.name || "المتجر"),
      category: String(merchantData.category || "GENERAL"),
      city: merchantData.city || null,
      currency: String(config.currency || merchantData.currency || "EGP"),
      language: String(config.language || merchantData.language || "ar-EG"),
      isActive: boolFrom(merchantData.is_active, true),
      enabledAgents,
      enabledFeatures,
      plan,
      role: "owner", // TODO: Get from staff/auth context when multi-user supported
      dailyTokenBudget,
      createdAt,
      // Computed features for sidebar display (backwards compatible)
      features: {
        inventory: enabledFeatures.includes("INVENTORY"),
        reports: enabledFeatures.includes("REPORTS"),
        conversations: enabledFeatures.includes("CONVERSATIONS"),
        analytics:
          enabledFeatures.includes("REPORTS") ||
          enabledFeatures.includes("KPI_DASHBOARD"),
        webhooks: enabledFeatures.includes("WEBHOOKS"),
        team: enabledFeatures.includes("TEAM"),
        audit: enabledFeatures.includes("AUDIT_LOGS"),
        payments: enabledFeatures.includes("PAYMENTS"),
        vision: false,
        kpis: enabledFeatures.includes("KPI_DASHBOARD"),
        loyalty: enabledFeatures.includes("LOYALTY"),
        voiceNotes: enabledFeatures.includes("VOICE_NOTES"),
        notifications: enabledFeatures.includes("NOTIFICATIONS"),
        apiAccess: enabledFeatures.includes("API_ACCESS"),
      },
    };
  }

  @Get("profile")
  @ApiOperation({ summary: "Get authenticated merchant profile" })
  async getProfile(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    // Remove sensitive fields
    const { apiKey, ...profile } = merchant as any;
    return profile;
  }

  @Get("usage")
  @ApiOperation({ summary: "Get token usage for authenticated merchant" })
  @ApiQuery({
    name: "date",
    description: "Usage date (YYYY-MM-DD)",
    required: false,
  })
  async getUsage(
    @Req() req: Request,
    @Query("date") date?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    const usageDate = date || new Date().toISOString().split("T")[0];
    const usage = await this.merchantRepo.getUsage(merchantId, usageDate);

    return {
      merchantId,
      date: usageDate,
      tokensUsed: usage?.tokensUsed || 0,
      llmCalls: usage?.llmCalls || 0,
      budget: merchant.dailyTokenBudget || 100000,
      remaining:
        (merchant.dailyTokenBudget || 100000) - (usage?.tokensUsed || 0),
    };
  }

  @Get("reports")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get reports for authenticated merchant" })
  @ApiQuery({
    name: "period",
    description: "Period type: daily, weekly, monthly",
    required: false,
  })
  @ApiQuery({ name: "limit", description: "Max results", required: false })
  async getReports(
    @Req() req: Request,
    @Query("period") period?: string,
    @Query("limit") limit?: number,
  ): Promise<{ reports: any[] }> {
    const merchantId = this.getMerchantId(req);

    const reports = await this.merchantRepo.getDailyReports(merchantId, {
      limit: limit || 30,
    });

    // Filter by period if specified
    const filtered = period
      ? reports.filter((r: any) => r.periodType === period || !r.periodType)
      : reports;

    return { reports: filtered };
  }

  @Get("notifications")
  @RequiresFeature("NOTIFICATIONS")
  @ApiOperation({ summary: "Get notifications for authenticated merchant" })
  @ApiQuery({
    name: "unreadOnly",
    description: "Only unread notifications",
    required: false,
  })
  @ApiQuery({
    name: "limit",
    description: "Max notifications",
    required: false,
  })
  @ApiQuery({
    name: "offset",
    description: "Pagination offset",
    required: false,
  })
  @ApiQuery({
    name: "types",
    description: "Comma-separated notification types",
    required: false,
  })
  async getNotifications(
    @Req() req: Request,
    @Query("unreadOnly") unreadOnly?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("types") types?: string,
  ): Promise<{ notifications: any[]; total: number; unreadCount: number }> {
    const merchantId = this.getMerchantId(req);
    const staffId = this.getSafeStaffId(req);
    const parsedLimit = Number.parseInt(String(limit || ""), 10);
    const parsedOffset = Number.parseInt(String(offset || ""), 10);
    const parsedTypes = String(types || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    return this.notificationsService.getForMerchant(merchantId, staffId, {
      unreadOnly: unreadOnly === "true",
      limit: Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 200)
        : 50,
      offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
      types:
        parsedTypes.length > 0
          ? (parsedTypes as NotificationType[])
          : undefined,
    });
  }

  @RequireRole("AGENT")
  @RequiresFeature("NOTIFICATIONS")
  @Put("notifications/:notificationId/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markNotificationRead(
    @Req() req: Request,
    @Param("notificationId") notificationId: string,
  ): Promise<{ success: boolean }> {
    const merchantId = this.getMerchantId(req);
    await this.notificationsService.markAsRead(
      merchantId,
      notificationId,
      this.getSafeStaffId(req),
    );
    return { success: true };
  }

  @RequireRole("AGENT")
  @RequiresFeature("NOTIFICATIONS")
  @Put("notifications/read-all")
  @ApiOperation({ summary: "Mark all notifications as read" })
  async markAllNotificationsRead(
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const merchantId = this.getMerchantId(req);
    await this.notificationsService.markAllAsRead(
      merchantId,
      this.getSafeStaffId(req),
    );
    return { success: true };
  }

  @RequireRole("AGENT")
  @RequiresFeature("NOTIFICATIONS")
  @Delete("notifications/:notificationId")
  @ApiOperation({ summary: "Delete a notification" })
  async deleteNotification(
    @Req() req: Request,
    @Param("notificationId") notificationId: string,
  ): Promise<{ success: boolean }> {
    const merchantId = this.getMerchantId(req);
    await this.notificationsService.delete(merchantId, notificationId);
    return { success: true };
  }

  @Get("followups")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get followups for authenticated merchant" })
  @ApiQuery({
    name: "status",
    description: "Legacy filter by followup type",
    required: false,
  })
  @ApiQuery({
    name: "type",
    description: "Filter by followup type",
    required: false,
  })
  async getFollowups(
    @Req() req: Request,
    @Query("type") type?: string,
    @Query("status") status?: string,
  ): Promise<{ followups: any[] }> {
    const merchantId = this.getMerchantId(req);
    const normalizedType = String(type || status || "")
      .trim()
      .toLowerCase();
    const followupTypeFilter = [
      "cod_collection",
      "feedback_request",
      "delivery_check",
      "abandoned_cart",
      "general",
    ].includes(normalizedType)
      ? normalizedType
      : normalizedType === "all"
        ? "all"
        : null;

    // Followups include:
    // 1) Real pending followups created by agents/workers (including upcoming scheduled followups)
    // 2) Derived order-based followup candidates (COD, feedback, delivery checks)
    const result = await this.pool.query(
      `WITH pending_followups AS (
         SELECT
           f.id::text as id,
           COALESCE(
             o.order_number,
             CONCAT('CONV-', LEFT(COALESCE(f.conversation_id::text, f.id::text), 8))
           ) as order_number,
           COALESCE(o.customer_name, c.name, cv.sender_id, 'عميل') as customer_name,
           COALESCE(o.customer_phone, c.phone, cv.sender_id, '') as customer_phone,
           COALESCE(o.total, 0) as total,
           COALESCE(o.status::text, 'PENDING') as status,
           COALESCE(o.payment_method, '') as payment_method,
           COALESCE(o.payment_status, 'PENDING') as payment_status,
           COALESCE(f.created_at, NOW()) as created_at,
           f.scheduled_at,
           COALESCE(f.updated_at, f.created_at, NOW()) as updated_at,
           CASE
             WHEN f.scheduled_at IS NULL OR f.scheduled_at <= NOW() THEN true
             ELSE false
           END as is_due,
           CASE
             WHEN UPPER(COALESCE(o.status::text, '')) = 'DELIVERED'
              AND UPPER(COALESCE(o.payment_method, '')) = 'COD'
              AND UPPER(COALESCE(o.payment_status, 'PENDING')) <> 'PAID'
               THEN 'cod_collection'
             WHEN COALESCE(f.type::text, '') = 'abandoned_cart'
               THEN 'abandoned_cart'
             WHEN COALESCE(f.type::text, '') = 'feedback_request'
               THEN 'feedback_request'
             WHEN COALESCE(f.type::text, '') = 'delivery_reminder'
               THEN 'delivery_check'
             ELSE 'general'
           END as followup_type
         FROM followups f
         LEFT JOIN orders o
           ON o.id = f.order_id
          AND o.merchant_id = f.merchant_id
         LEFT JOIN conversations cv
           ON cv.id = f.conversation_id
          AND cv.merchant_id = f.merchant_id
         LEFT JOIN customers c
           ON c.id = COALESCE(f.customer_id, cv.customer_id)
          AND c.merchant_id = f.merchant_id
         WHERE f.merchant_id = $1
           AND UPPER(COALESCE(f.status::text, '')) = 'PENDING'
       ),
       derived_order_followups AS (
         SELECT
           o.id::text as id,
           o.order_number,
           o.customer_name,
           o.customer_phone,
           o.total,
           o.status::text as status,
           o.payment_method,
           o.payment_status,
           o.created_at,
           NULL::timestamp as scheduled_at,
           o.updated_at,
           true as is_due,
           CASE
             WHEN UPPER(COALESCE(o.status::text, '')) = 'DELIVERED'
               AND UPPER(COALESCE(o.payment_method, '')) = 'COD'
               AND UPPER(COALESCE(o.payment_status, 'PENDING')) <> 'PAID'
               THEN 'cod_collection'
             WHEN UPPER(COALESCE(o.status::text, '')) = 'DELIVERED'
               AND o.updated_at < NOW() - INTERVAL '3 days'
               THEN 'feedback_request'
             WHEN UPPER(COALESCE(o.status::text, '')) = 'SHIPPED'
               AND o.updated_at < NOW() - INTERVAL '5 days'
               THEN 'delivery_check'
             ELSE 'general'
           END as followup_type
         FROM orders o
         WHERE o.merchant_id = $1
           AND UPPER(COALESCE(o.status::text, '')) IN ('DELIVERED', 'SHIPPED')
           AND o.updated_at < NOW() - INTERVAL '2 days'
           AND (o.metadata IS NULL OR o.metadata->>'followup_resolved' IS NULL OR o.metadata->>'followup_resolved' = 'false')
           AND NOT EXISTS (
             SELECT 1
             FROM followups f
             WHERE f.merchant_id = o.merchant_id
               AND f.order_id = o.id
               AND UPPER(COALESCE(f.status::text, '')) = 'PENDING'
           )
       ),
       derived_conversation_followups AS (
         SELECT
           cv.id::text as id,
           CONCAT('CONV-', LEFT(cv.id::text, 8)) as order_number,
           COALESCE(c.name, cv.sender_id, 'عميل') as customer_name,
           COALESCE(c.phone, cv.sender_id, '') as customer_phone,
           COALESCE(
             CASE
               WHEN COALESCE(cv.cart->>'total', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (cv.cart->>'total')::numeric
               ELSE 0
             END,
             0
           ) as total,
           'PENDING'::text as status,
           ''::text as payment_method,
           'PENDING'::text as payment_status,
           COALESCE(cv.created_at, NOW()) as created_at,
           cv.next_followup_at as scheduled_at,
           COALESCE(cv.last_message_at, cv.updated_at, cv.created_at, NOW()) as updated_at,
           CASE
             WHEN cv.next_followup_at IS NULL OR cv.next_followup_at <= NOW() THEN true
             ELSE false
           END as is_due,
           'abandoned_cart'::text as followup_type
         FROM conversations cv
         LEFT JOIN customers c
           ON c.id = cv.customer_id
          AND c.merchant_id = cv.merchant_id
         WHERE cv.merchant_id = $1
           AND UPPER(COALESCE(cv.state::text, '')) IN (
             'COLLECTING_ITEMS',
             'COLLECTING_VARIANTS',
             'COLLECTING_CUSTOMER_INFO',
             'COLLECTING_ADDRESS',
             'NEGOTIATING',
             'CONFIRMING_ORDER'
           )
           AND COALESCE(
             jsonb_array_length(
               CASE
                 WHEN jsonb_typeof(cv.cart->'items') = 'array' THEN cv.cart->'items'
                 ELSE '[]'::jsonb
               END
             ),
             0
           ) > 0
           AND COALESCE(cv.last_message_at, cv.updated_at, cv.created_at) < NOW() - INTERVAL '30 minutes'
           AND (cv.context IS NULL OR cv.context->>'followup_resolved' IS NULL OR cv.context->>'followup_resolved' = 'false')
           AND NOT EXISTS (
             SELECT 1
             FROM orders o
             WHERE o.merchant_id = cv.merchant_id
               AND o.conversation_id = cv.id
               AND UPPER(COALESCE(o.status::text, '')) NOT IN ('DRAFT', 'CANCELLED')
           )
           AND NOT EXISTS (
             SELECT 1
             FROM followups f
             WHERE f.merchant_id = cv.merchant_id
               AND f.conversation_id = cv.id
               AND UPPER(COALESCE(f.status::text, '')) = 'PENDING'
           )
       ),
       followup_candidates AS (
         SELECT * FROM pending_followups
         UNION ALL
         SELECT * FROM derived_order_followups
         UNION ALL
         SELECT * FROM derived_conversation_followups
       )
       SELECT *
       FROM followup_candidates
       WHERE ($2::text IS NULL OR $2 = 'all' OR followup_type = $2)
       ORDER BY is_due DESC, COALESCE(scheduled_at, updated_at) ASC`,
      [merchantId, followupTypeFilter],
    );

    return { followups: result.rows };
  }

  @Get("catalog")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("CATALOG")
  @ApiOperation({ summary: "Get catalog for authenticated merchant" })
  async getCatalog(@Req() req: Request): Promise<{ items: any[] }> {
    const merchantId = this.getMerchantId(req);

    // This would need catalog repository
    // TODO: Implement when catalog table is ready
    return { items: [] };
  }

  // ============== AGENT SUBSCRIPTIONS ==============

  @Get("entitlements/catalog")
  @ApiOperation({
    summary: "Get agent and feature catalog",
    description:
      "Returns the full catalog of agents, features, and plans with their status and metadata for UI rendering",
  })
  @ApiResponse({ status: 200, description: "Catalog retrieved successfully" })
  async getEntitlementsCatalog(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Get merchant's current plan and enabled agents/features
    const result = await this.pool.query(
      `SELECT plan, enabled_agents, enabled_features, plan_limits, custom_price 
       FROM merchants WHERE id = $1`,
      [merchantId],
    );

    const merchant = result.rows[0];
    const currentPlan = merchant?.plan || "STARTER";
    const enabledAgents = merchant?.enabled_agents || ["OPS_AGENT"];
    const enabledFeatures = merchant?.enabled_features || [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
    ];

    // Get the full catalog
    const catalog = getCatalog();

    // Enrich with merchant-specific status
    const enrichedAgents = catalog.agents.map((agent) => ({
      ...agent,
      isEnabled: enabledAgents.includes(agent.id),
      isIncludedInPlan:
        PLAN_ENTITLEMENTS[currentPlan as PlanType]?.enabledAgents?.includes(
          agent.id,
        ) || false,
    }));

    const enrichedFeatures = catalog.features.map((feature) => ({
      ...feature,
      isEnabled: enabledFeatures.includes(feature.id),
      isIncludedInPlan:
        PLAN_ENTITLEMENTS[currentPlan as PlanType]?.enabledFeatures?.includes(
          feature.id,
        ) || false,
    }));

    return {
      currentPlan,
      enabledAgents,
      enabledFeatures,
      agents: enrichedAgents,
      features: enrichedFeatures,
      plans: catalog.plans,
      agentDependencies: catalog.agentDependencies,
      featureDependencies: catalog.featureDependencies,
      featureAgentMap: catalog.featureAgentMap,
    };
  }

  @Get("agents")
  @ApiOperation({
    summary: "List agent subscriptions",
    description:
      "Returns all available agents and their subscription status for the merchant",
  })
  @ApiResponse({ status: 200, description: "Agent subscriptions retrieved" })
  async listAgentSubscriptions(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const subscriptions =
      await this.agentSubscriptionService.getMerchantSubscriptions(merchantId);

    return {
      agents: subscriptions.map((sub) => ({
        agentType: sub.agentType,
        name: this.getAgentName(sub.agentType),
        description: this.getAgentDescription(sub.agentType),
        isEnabled: sub.isEnabled,
        config: sub.config,
        enabledAt: sub.enabledAt,
        disabledAt: sub.disabledAt,
        isRequired: sub.agentType === "OPS_AGENT",
        isAvailable: [
          "OPS_AGENT",
          "INVENTORY_AGENT",
          "FINANCE_AGENT",
          "MARKETING_AGENT",
          "SUPPORT_AGENT",
          "CONTENT_AGENT",
        ].includes(sub.agentType),
      })),
    };
  }

  @Post("agents/:agentType/subscribe")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Subscribe to an agent",
    description: "Enable an agent for the merchant with optional configuration",
  })
  @ApiParam({
    name: "agentType",
    enum: ["OPERATIONS", "INVENTORY", "FINANCE", "MARKETING"],
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        config: { type: "object", description: "Agent-specific configuration" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Successfully subscribed to agent" })
  @ApiResponse({
    status: 400,
    description: "Invalid agent type or agent not available",
  })
  async subscribeToAgent(
    @Req() req: Request,
    @Param("agentType") agentType: string,
    @Body() body: { config?: Record<string, unknown> },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    if (!this.isValidAgentType(agentType)) {
      throw new BadRequestException(`Invalid agent type: ${agentType}`);
    }

    // Only OPERATIONS and INVENTORY are currently available
    if (!["OPERATIONS", "INVENTORY"].includes(agentType)) {
      throw new BadRequestException(
        `Agent ${agentType} is not yet available. Coming soon!`,
      );
    }

    const subscription = await this.agentSubscriptionService.subscribeToAgent(
      merchantId,
      agentType as AgentType,
      body.config,
    );

    return {
      success: true,
      subscription: {
        agentType: subscription.agentType,
        name: this.getAgentName(subscription.agentType),
        isEnabled: subscription.isEnabled,
        config: subscription.config,
        enabledAt: subscription.enabledAt,
      },
      message: `تم الاشتراك في ${this.getAgentName(subscription.agentType)} بنجاح`,
    };
  }

  @Post("agents/:agentType/unsubscribe")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Unsubscribe from an agent",
    description:
      "Disable an agent for the merchant (Operations agent cannot be disabled)",
  })
  @ApiParam({
    name: "agentType",
    enum: [
      "INVENTORY_AGENT",
      "FINANCE_AGENT",
      "MARKETING_AGENT",
      "SUPPORT_AGENT",
      "CONTENT_AGENT",
      "SALES_AGENT",
      "CREATIVE_AGENT",
    ],
  })
  @ApiResponse({
    status: 200,
    description: "Successfully unsubscribed from agent",
  })
  @ApiResponse({
    status: 400,
    description: "Cannot unsubscribe from required agent",
  })
  async unsubscribeFromAgent(
    @Req() req: Request,
    @Param("agentType") agentType: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    if (!this.isValidAgentType(agentType)) {
      throw new BadRequestException(`Invalid agent type: ${agentType}`);
    }

    if (agentType === "OPS_AGENT") {
      throw new BadRequestException(
        "Cannot unsubscribe from OPS agent - it is required",
      );
    }

    const subscription =
      await this.agentSubscriptionService.unsubscribeFromAgent(
        merchantId,
        agentType as AgentType,
      );

    if (!subscription) {
      throw new NotFoundException(`Agent subscription not found`);
    }

    return {
      success: true,
      subscription: {
        agentType: subscription.agentType,
        name: this.getAgentName(subscription.agentType),
        isEnabled: subscription.isEnabled,
        disabledAt: subscription.disabledAt,
      },
      message: `تم إلغاء الاشتراك في ${this.getAgentName(subscription.agentType)}`,
    };
  }

  @Post("agents/:agentType/config")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Update agent configuration",
    description: "Update the configuration for a subscribed agent",
  })
  @ApiParam({
    name: "agentType",
    enum: [
      "OPS_AGENT",
      "INVENTORY_AGENT",
      "FINANCE_AGENT",
      "MARKETING_AGENT",
      "SUPPORT_AGENT",
      "CONTENT_AGENT",
      "SALES_AGENT",
      "CREATIVE_AGENT",
    ],
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        config: {
          type: "object",
          description: "Agent-specific configuration to merge",
        },
      },
      required: ["config"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "Configuration updated successfully",
  })
  async updateAgentConfig(
    @Req() req: Request,
    @Param("agentType") agentType: string,
    @Body() body: { config: Record<string, unknown> },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    if (!this.isValidAgentType(agentType)) {
      throw new BadRequestException(`Invalid agent type: ${agentType}`);
    }

    if (!body.config || Object.keys(body.config).length === 0) {
      throw new BadRequestException("Config is required");
    }

    const subscription = await this.agentSubscriptionService.updateAgentConfig(
      merchantId,
      agentType as AgentType,
      body.config,
    );

    if (!subscription) {
      throw new NotFoundException(
        `Agent subscription not found. Subscribe first.`,
      );
    }

    return {
      success: true,
      subscription: {
        agentType: subscription.agentType,
        name: this.getAgentName(subscription.agentType),
        isEnabled: subscription.isEnabled,
        config: subscription.config,
      },
      message: "تم تحديث الإعدادات بنجاح",
    };
  }

  // ============== MERCHANT SETTINGS ==============

  @Get("settings")
  @ApiOperation({
    summary: "Get merchant settings",
    description:
      "Returns all merchant settings including business info, notifications, and preferences",
  })
  @ApiResponse({ status: 200, description: "Settings retrieved successfully" })
  async getMerchantSettings(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return {
      business: {
        name: merchant.name,
        category: merchant.category,
        city: merchant.city,
        currency: merchant.currency,
        language: merchant.language,
      },
      notifications: {
        whatsappReportsEnabled:
          (merchant as any).whatsappReportsEnabled || false,
        reportPeriodsEnabled: (merchant as any).reportPeriodsEnabled || [
          "daily",
        ],
        notificationPhone: (merchant as any).notificationPhone || null,
        notificationEmail: (merchant as any).notificationEmail || null,
        whatsappNumber: (merchant as any).whatsappNumber || null,
        paymentRemindersEnabled:
          (merchant as any).paymentRemindersEnabled ?? true,
        lowStockAlertsEnabled: (merchant as any).lowStockAlertsEnabled ?? true,
      },
      preferences: {
        timezone: (merchant as any).timezone || "Africa/Cairo",
        workingHours: (merchant as any).workingHours || {
          start: "09:00",
          end: "21:00",
        },
        autoResponseEnabled: (merchant as any).autoResponseEnabled ?? true,
        followupDelayMinutes: (merchant as any).followupDelayMinutes || 60,
      },
      payout: {
        instapayAlias: (merchant as any).payoutInstapayAlias || null,
        vodafoneCashNumber: (merchant as any).payoutVodafoneCash || null,
        bankName: (merchant as any).payoutBankName || null,
        bankAccountHolder: (merchant as any).payoutBankAccountHolder || null,
        bankAccount: (merchant as any).payoutBankAccount || null,
        bankIban: (merchant as any).payoutBankIban || null,
        preferredMethod: (merchant as any).payoutPreferredMethod || "INSTAPAY",
      },
    };
  }

  @Put("settings")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Update merchant settings",
    description:
      "Update merchant business info, notifications, and preferences",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        business: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string" },
            city: { type: "string" },
          },
        },
        notifications: {
          type: "object",
          properties: {
            whatsappReportsEnabled: { type: "boolean" },
            reportPeriodsEnabled: { type: "array", items: { type: "string" } },
            notificationPhone: { type: "string" },
            notificationEmail: { type: "string" },
            paymentRemindersEnabled: { type: "boolean" },
            lowStockAlertsEnabled: { type: "boolean" },
          },
        },
        preferences: {
          type: "object",
          properties: {
            timezone: { type: "string" },
            autoResponseEnabled: { type: "boolean" },
            followupDelayMinutes: { type: "number" },
          },
        },
        payout: {
          type: "object",
          properties: {
            instapayAlias: { type: "string", nullable: true },
            vodafoneCashNumber: { type: "string", nullable: true },
            bankName: { type: "string", nullable: true },
            bankAccountHolder: { type: "string", nullable: true },
            bankAccount: { type: "string", nullable: true },
            bankIban: { type: "string", nullable: true },
            preferredMethod: {
              type: "string",
              enum: ["INSTAPAY", "VODAFONE_CASH", "BANK_TRANSFER"],
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Settings updated successfully" })
  async updateMerchantSettings(
    @Req() req: Request,
    @Body()
    body: {
      business?: { name?: string; category?: string; city?: string };
      notifications?: {
        whatsappReportsEnabled?: boolean;
        reportPeriodsEnabled?: string[];
        notificationPhone?: string;
        notificationEmail?: string;
        whatsappNumber?: string;
        paymentRemindersEnabled?: boolean;
        lowStockAlertsEnabled?: boolean;
      };
      preferences?: {
        timezone?: string;
        autoResponseEnabled?: boolean;
        followupDelayMinutes?: number;
      };
      payout?: {
        instapayAlias?: string | null;
        vodafoneCashNumber?: string | null;
        bankName?: string | null;
        bankAccountHolder?: string | null;
        bankAccount?: string | null;
        bankIban?: string | null;
        preferredMethod?: "INSTAPAY" | "VODAFONE_CASH" | "BANK_TRANSFER";
      };
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const updateEntries: Array<{ column: string; value: any }> = [];

    if (body.business?.name)
      updateEntries.push({ column: "name", value: body.business.name });
    if (body.business?.category)
      updateEntries.push({ column: "category", value: body.business.category });
    if (body.business?.city)
      updateEntries.push({ column: "city", value: body.business.city });
    if (body.notifications?.paymentRemindersEnabled !== undefined) {
      updateEntries.push({
        column: "payment_reminders_enabled",
        value: body.notifications.paymentRemindersEnabled,
      });
    }
    if (body.notifications?.lowStockAlertsEnabled !== undefined) {
      updateEntries.push({
        column: "low_stock_alerts_enabled",
        value: body.notifications.lowStockAlertsEnabled,
      });
    }
    if (body.notifications?.whatsappReportsEnabled !== undefined) {
      updateEntries.push({
        column: "whatsapp_reports_enabled",
        value: body.notifications.whatsappReportsEnabled,
      });
    }
    if (body.notifications?.reportPeriodsEnabled !== undefined) {
      updateEntries.push({
        column: "report_periods_enabled",
        value: body.notifications.reportPeriodsEnabled,
      });
    }
    if (body.notifications?.notificationPhone !== undefined) {
      updateEntries.push({
        column: "notification_phone",
        value: body.notifications.notificationPhone?.replace(/\s/g, "") || null,
      });
    }
    if (body.notifications?.notificationEmail !== undefined) {
      updateEntries.push({
        column: "notification_email",
        value: body.notifications.notificationEmail?.trim() || null,
      });
    }
    if (body.notifications?.whatsappNumber !== undefined) {
      updateEntries.push({
        column: "whatsapp_number",
        value: body.notifications.whatsappNumber?.replace(/\s/g, "") || null,
      });
    }
    if (body.preferences?.timezone)
      updateEntries.push({
        column: "timezone",
        value: body.preferences.timezone,
      });
    if (body.preferences?.autoResponseEnabled !== undefined) {
      updateEntries.push({
        column: "auto_response_enabled",
        value: body.preferences.autoResponseEnabled,
      });
    }
    if (body.preferences?.followupDelayMinutes !== undefined) {
      updateEntries.push({
        column: "followup_delay_minutes",
        value: body.preferences.followupDelayMinutes,
      });
    }

    // Payout settings (Egypt payment methods)
    if (body.payout?.instapayAlias !== undefined) {
      updateEntries.push({
        column: "payout_instapay_alias",
        value: body.payout.instapayAlias || null,
      });
    }
    if (body.payout?.vodafoneCashNumber !== undefined) {
      updateEntries.push({
        column: "payout_vodafone_cash",
        value: body.payout.vodafoneCashNumber || null,
      });
    }
    if (body.payout?.bankName !== undefined) {
      updateEntries.push({
        column: "payout_bank_name",
        value: body.payout.bankName || null,
      });
    }
    if (body.payout?.bankAccountHolder !== undefined) {
      updateEntries.push({
        column: "payout_bank_account_holder",
        value: body.payout.bankAccountHolder || null,
      });
    }
    if (body.payout?.bankAccount !== undefined) {
      updateEntries.push({
        column: "payout_bank_account",
        value: body.payout.bankAccount || null,
      });
    }
    if (body.payout?.bankIban !== undefined) {
      updateEntries.push({
        column: "payout_bank_iban",
        value: body.payout.bankIban || null,
      });
    }
    if (body.payout?.preferredMethod !== undefined) {
      updateEntries.push({
        column: "payout_preferred_method",
        value: body.payout.preferredMethod,
      });
    }

    const runUpdate = async (
      entries: Array<{ column: string; value: any }>,
    ) => {
      if (entries.length === 0) return;
      const sets = entries.map((entry, idx) => `${entry.column} = $${idx + 1}`);
      const values = entries.map((entry) => entry.value);
      sets.push("updated_at = NOW()");
      values.push(merchantId);
      await this.pool.query(
        `UPDATE merchants SET ${sets.join(", ")} WHERE id = $${entries.length + 1}`,
        values,
      );
    };

    if (updateEntries.length > 0) {
      let remaining = [...updateEntries];
      while (remaining.length > 0) {
        try {
          await runUpdate(remaining);
          break;
        } catch (error: any) {
          if (error?.code !== "42703") {
            throw error;
          }
          const match = /column \"([^\"]+)\"/i.exec(error.message || "");
          const missingColumn = match?.[1];
          if (!missingColumn) throw error;
          remaining = remaining.filter(
            (entry) => entry.column !== missingColumn,
          );
          if (remaining.length === 0) break;
        }
      }
    }

    const sections: string[] = [];
    if (body.business) sections.push("business");
    if (body.notifications) sections.push("notifications");
    if (body.preferences) sections.push("preferences");
    if (body.payout) sections.push("payout");
    if (sections.length > 0) {
      await this.auditService.logFromRequest(
        req,
        "UPDATE",
        "SETTINGS",
        merchantId,
        {
          metadata: { sections },
        },
      );
    }

    return {
      success: true,
      message: "تم تحديث الإعدادات بنجاح",
    };
  }

  // ============== NOTIFICATIONS CONFIG ==============

  @Get("notifications/status")
  @RequiresFeature("NOTIFICATIONS")
  @ApiOperation({
    summary: "Get notification delivery configuration status",
    description:
      "Returns SMTP/Meta Cloud API configuration availability for the merchant portal UI",
  })
  async getNotificationConfigStatus(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const status = this.notificationsService.getDeliveryConfigStatus();
    const metaReady = status.whatsapp?.configured ?? false;

    // Check if merchant has their own WhatsApp number + email registered
    let merchantWhatsApp: string | null = null;
    let merchantPhone: string | null = null;
    let merchantEmail: string | null = null;
    try {
      // Self-heal: ensure notification_email column exists
      await this.pool
        .query(
          `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255)`,
        )
        .catch(() => {});
      const res = await this.pool.query(
        `SELECT whatsapp_number, notification_phone, notification_email FROM merchants WHERE id = $1`,
        [merchantId],
      );
      merchantWhatsApp = res.rows?.[0]?.whatsapp_number || null;
      merchantPhone = res.rows?.[0]?.notification_phone || null;
      merchantEmail = res.rows?.[0]?.notification_email || null;
    } catch {
      /* column may not exist yet */
    }

    return {
      whatsapp: {
        configured: metaReady && !!merchantWhatsApp,
        metaReady,
        numberRegistered: !!merchantWhatsApp,
        number: merchantWhatsApp || null,
      },
      preferences: {
        notificationPhone: merchantPhone,
        notificationEmail: merchantEmail,
      },
    };
  }

  @Post("notifications/broadcast")
  @RequireRole("ADMIN")
  @ApiOperation({ summary: "Send broadcast notification to customers" })
  async sendBroadcastNotification(
    @Req() req: Request,
    @Body()
    body: {
      title: string;
      message: string;
      type: "promotional" | "transactional" | "reminder" | "update";
      recipientFilter?: "all" | "vip" | "loyal" | "regular" | "at_risk" | "new";
      recipientIds?: string[];
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const { title, message, type, recipientFilter, recipientIds } = body;

    if (!title?.trim() || !message?.trim()) {
      throw new BadRequestException("العنوان والمحتوى مطلوبان");
    }

    // ── Load merchant info ──
    const mcResult = await this.pool.query(
      `SELECT name, config, whatsapp_number FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchantName = mcResult.rows?.[0]?.name || "التاجر";
    const merchantCfg = mcResult.rows?.[0]?.config || {};
    const senderName = merchantCfg.brandName || merchantName;
    const merchantWhatsApp: string | null =
      mcResult.rows?.[0]?.whatsapp_number || null;

    const status = this.notificationsService.getDeliveryConfigStatus();
    if (!status.whatsapp.configured) {
      throw new BadRequestException(
        "واتساب غير مهيأ — تواصل مع الدعم الفني لتفعيل خدمة الرسائل",
      );
    }
    if (!merchantWhatsApp) {
      throw new BadRequestException(
        "لم يتم تسجيل رقم واتساب لحسابك بعد — أضف رقمك في الإعدادات",
      );
    }

    // Get recipients — only those with phone numbers
    let recipientQuery = `SELECT id, name, phone FROM customers WHERE merchant_id = $1 AND phone IS NOT NULL AND phone != ''`;
    const params: any[] = [merchantId];

    if (recipientIds?.length) {
      recipientQuery += ` AND id = ANY($2)`;
      params.push(recipientIds);
    } else if (recipientFilter && recipientFilter !== "all") {
      recipientQuery = `
        WITH customer_stats AS (
          SELECT c.id, c.name, c.phone,
            COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(o.total), 0) as total_spent,
            EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) as days_since_last_order
          FROM customers c
          LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED')
          WHERE c.merchant_id = $1 AND c.phone IS NOT NULL AND c.phone != ''
          GROUP BY c.id, c.name, c.phone
        )
        SELECT id, name, phone FROM customer_stats WHERE
      `;
      const segmentMap: Record<string, string> = {
        vip: `total_orders >= 5 AND total_spent >= 1000 AND days_since_last_order < 30`,
        loyal: `total_orders >= 3 AND days_since_last_order < 60`,
        regular: `total_orders >= 1 AND days_since_last_order < 90`,
        new: `total_orders = 0 OR days_since_last_order IS NULL`,
        at_risk: `total_orders >= 1 AND days_since_last_order >= 90`,
      };
      recipientQuery += segmentMap[recipientFilter] || "1=1";
    }

    const recipientsResult = await this.pool.query(recipientQuery, params);
    const recipients = recipientsResult.rows;

    if (recipients.length === 0) {
      throw new BadRequestException("لا يوجد عملاء مطابقون للإرسال");
    }

    // Store the broadcast record
    const broadcastResult = await this.pool.query(
      `INSERT INTO notifications (merchant_id, type, title, title_ar, message, message_ar, priority, channels, data)
       VALUES ($1, $2, $3, $3, $4, $4, 'MEDIUM', '{WHATSAPP}', $5) RETURNING id`,
      [
        merchantId,
        "SYSTEM_ALERT",
        title,
        message,
        JSON.stringify({
          broadcast: true,
          type,
          recipientCount: recipients.length,
          filter: recipientFilter || "all",
        }),
      ],
    );

    // ── Send via WhatsApp ──
    let sentCount = 0;
    let failCount = 0;

    for (const recipient of recipients) {
      try {
        const waBody = `*${title}*\n\n${message}\n\n— ${senderName}`;
        await this.notificationsService.sendBroadcastWhatsApp(
          recipient.phone,
          waBody,
          merchantWhatsApp,
        );
        sentCount++;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        failCount++;
        this.logger.warn(`Failed to send to ${recipient.id}: ${error.message}`);
      }
    }

    // Audit
    await this.auditService.log({
      merchantId,
      action: "CREATE",
      resource: "SETTINGS",
      metadata: {
        broadcast: true,
        title,
        channel: "WHATSAPP",
        sentCount,
        failCount,
        recipientCount: recipients.length,
      },
      staffId: (req as any).staffId,
    });

    return {
      success: true,
      broadcastId: broadcastResult.rows[0].id,
      recipientCount: recipients.length,
      sentCount,
      failCount,
      message: `تم إرسال الرسالة إلى ${sentCount} مستلم`,
    };
  }

  @Post("notifications/test")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Send a test notification",
    description:
      "Sends a test email or WhatsApp message to verify configuration",
  })
  async sendTestNotification(
    @Req() req: Request,
    @Body() body: { channel: "EMAIL" | "WHATSAPP" | "PUSH"; target?: string },
  ): Promise<any> {
    const channel = body?.channel;
    const target = body?.target?.trim() ?? "";
    const merchantId = this.getMerchantId(req);

    if (!channel) {
      throw new BadRequestException("القناة مطلوبة");
    }
    if (channel !== "PUSH" && !target) {
      throw new BadRequestException("الوجهة مطلوبة");
    }

    const status = this.notificationsService.getDeliveryConfigStatus();
    if (channel === "EMAIL" && !status.smtp.configured) {
      throw new BadRequestException("SMTP غير مهيأ");
    }
    if (channel === "WHATSAPP" && !status.whatsapp.configured) {
      throw new BadRequestException("Meta WhatsApp Cloud API غير مهيأ");
    }
    if (
      channel === "PUSH" &&
      !status.push?.fcm?.configured &&
      !status.push?.apns?.configured
    ) {
      throw new BadRequestException("Push غير مهيأ");
    }

    if (channel === "EMAIL") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(target)) {
        throw new BadRequestException("البريد الإلكتروني غير صحيح");
      }
    }

    if (channel === "WHATSAPP") {
      const phoneRegex = /^\+?[1-9]\d{9,14}$/;
      if (!phoneRegex.test(target.replace(/\s/g, ""))) {
        throw new BadRequestException("رقم واتساب غير صحيح");
      }
    }

    const normalizedTarget =
      channel === "WHATSAPP" ? target?.replace(/\s/g, "") : target;
    await this.notificationsService.sendTest(
      channel,
      normalizedTarget,
      merchantId,
    );

    return { success: true, message: "تم إرسال رسالة اختبار" };
  }

  // ============== PUSH SUBSCRIPTIONS (FCM/APNS/WEB) ==============

  @Get("push-subscriptions")
  @ApiOperation({ summary: "List push subscriptions for merchant" })
  async listPushSubscriptions(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const result = await this.pool.query(
      `SELECT id, provider, platform, endpoint, device_token, is_active, created_at
       FROM push_subscriptions
       WHERE merchant_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [merchantId],
    );

    return { subscriptions: result.rows };
  }

  @RequireRole("AGENT")
  @Post("push-subscriptions")
  @ApiOperation({ summary: "Register a push subscription (FCM/APNS/Web Push)" })
  async registerPushSubscription(
    @Req() req: Request,
    @Body()
    body: {
      provider?: "FCM" | "APNS" | "WEB_PUSH";
      token?: string;
      platform?: string;
      userAgent?: string;
      subscription?: { endpoint: string; keys?: Record<string, string> };
      staffId?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const provider = (body.provider || "FCM").toUpperCase() as
      | "FCM"
      | "APNS"
      | "WEB_PUSH";

    let endpoint = body.token?.trim() || "";
    let keys = {};
    if (provider === "WEB_PUSH") {
      if (!body.subscription?.endpoint) {
        throw new BadRequestException(
          "Web push subscription endpoint is required",
        );
      }
      endpoint = body.subscription.endpoint;
      keys = body.subscription.keys || {};
    }

    if (!endpoint) {
      throw new BadRequestException("Push token/endpoint is required");
    }

    const result = await this.pool.query(
      `INSERT INTO push_subscriptions
        (merchant_id, staff_id, endpoint, keys, user_agent, is_active, provider, platform, device_token)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)
       ON CONFLICT (endpoint) DO UPDATE SET
         merchant_id = EXCLUDED.merchant_id,
         staff_id = EXCLUDED.staff_id,
         keys = EXCLUDED.keys,
         user_agent = EXCLUDED.user_agent,
         is_active = true,
         provider = EXCLUDED.provider,
         platform = EXCLUDED.platform,
         device_token = EXCLUDED.device_token
       RETURNING id, provider, platform, endpoint, device_token, created_at`,
      [
        merchantId,
        body.staffId || null,
        endpoint,
        JSON.stringify(keys),
        body.userAgent || null,
        provider,
        body.platform || null,
        provider === "WEB_PUSH" ? null : endpoint,
      ],
    );

    return { subscription: result.rows[0] };
  }

  @RequireRole("AGENT")
  @Delete("push-subscriptions/:id")
  @ApiOperation({ summary: "Remove a push subscription" })
  async removePushSubscription(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    await this.pool.query(
      `UPDATE push_subscriptions SET is_active = false WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    return { success: true };
  }

  // ============== WHATSAPP REPORT SETTINGS ==============

  @Get("settings/reports")
  @RequiresFeature("REPORTS")
  @ApiOperation({
    summary: "Get WhatsApp report settings",
    description:
      "Returns the current WhatsApp report delivery settings for the merchant",
  })
  @ApiResponse({ status: 200, description: "Settings retrieved successfully" })
  async getReportSettings(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return {
      whatsappReportsEnabled: (merchant as any).whatsappReportsEnabled || false,
      reportPeriodsEnabled: (merchant as any).reportPeriodsEnabled || ["daily"],
      notificationPhone: (merchant as any).notificationPhone || null,
      availablePeriods: [
        {
          id: "daily",
          name: "يومي",
          description: "تقرير كل يوم الساعة 8 صباحاً",
        },
        {
          id: "weekly",
          name: "أسبوعي",
          description: "تقرير كل أحد الساعة 9 صباحاً",
        },
        {
          id: "monthly",
          name: "شهري",
          description: "تقرير أول كل شهر الساعة 9 صباحاً",
        },
      ],
    };
  }

  @Post("settings/reports")
  @RequiresFeature("REPORTS")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Update WhatsApp report settings",
    description: "Configure WhatsApp report delivery preferences",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        whatsappReportsEnabled: {
          type: "boolean",
          description: "Enable/disable WhatsApp reports",
        },
        reportPeriodsEnabled: {
          type: "array",
          items: { type: "string", enum: ["daily", "weekly", "monthly"] },
          description: "Which report periods to receive",
        },
        notificationPhone: {
          type: "string",
          description: "Phone number for reports (with country code)",
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Settings updated successfully" })
  @ApiResponse({ status: 400, description: "Invalid settings" })
  async updateReportSettings(
    @Req() req: Request,
    @Body()
    body: {
      whatsappReportsEnabled?: boolean;
      reportPeriodsEnabled?: string[];
      notificationPhone?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    // Validate phone number if enabling reports
    if (body.whatsappReportsEnabled && body.notificationPhone) {
      const phoneRegex = /^\+?[1-9]\d{9,14}$/;
      if (!phoneRegex.test(body.notificationPhone.replace(/\s/g, ""))) {
        throw new BadRequestException(
          "رقم الهاتف غير صحيح. يجب أن يحتوي على كود الدولة",
        );
      }
    }

    // Validate report periods
    const validPeriods = ["daily", "weekly", "monthly"];
    if (body.reportPeriodsEnabled) {
      const invalidPeriods = body.reportPeriodsEnabled.filter(
        (p) => !validPeriods.includes(p),
      );
      if (invalidPeriods.length > 0) {
        throw new BadRequestException(
          `فترات غير صحيحة: ${invalidPeriods.join(", ")}`,
        );
      }
    }

    // Update database directly (these fields are on merchants table)
    const updates: string[] = [];
    const values: (string | boolean | string[])[] = [];
    let paramIndex = 1;

    if (body.whatsappReportsEnabled !== undefined) {
      updates.push(`whatsapp_reports_enabled = $${paramIndex++}`);
      values.push(body.whatsappReportsEnabled);
    }
    if (body.reportPeriodsEnabled !== undefined) {
      updates.push(`report_periods_enabled = $${paramIndex++}`);
      values.push(body.reportPeriodsEnabled);
    }
    if (body.notificationPhone !== undefined) {
      updates.push(`notification_phone = $${paramIndex++}`);
      values.push(body.notificationPhone?.replace(/\s/g, "") || "");
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(merchantId);

      await this.pool.query(
        `UPDATE merchants SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
        values,
      );
    }

    this.logger.log({
      msg: "WhatsApp report settings updated",
      merchantId,
      settings: body,
    });

    await this.auditService.logFromRequest(
      req,
      "UPDATE",
      "SETTINGS",
      merchantId,
      {
        metadata: { sections: ["reports", "notifications"] },
      },
    );

    return {
      success: true,
      message: body.whatsappReportsEnabled
        ? "تم تفعيل التقارير عبر واتساب"
        : "تم تحديث إعدادات التقارير",
      settings: {
        whatsappReportsEnabled:
          body.whatsappReportsEnabled ??
          (merchant as any).whatsappReportsEnabled,
        reportPeriodsEnabled:
          body.reportPeriodsEnabled ?? (merchant as any).reportPeriodsEnabled,
        notificationPhone:
          body.notificationPhone ?? (merchant as any).notificationPhone,
      },
    };
  }

  // ============== HELPERS ==============

  private isValidAgentType(type: string): type is AgentType {
    return [
      "OPS_AGENT",
      "INVENTORY_AGENT",
      "FINANCE_AGENT",
      "MARKETING_AGENT",
      "SUPPORT_AGENT",
      "CONTENT_AGENT",
      "SALES_AGENT",
      "CREATIVE_AGENT",
    ].includes(type);
  }

  private getAgentName(type: AgentType): string {
    const names: Record<AgentType, string> = {
      OPS_AGENT: "وكيل العمليات",
      INVENTORY_AGENT: "وكيل المخزون",
      FINANCE_AGENT: "وكيل المالية",
      MARKETING_AGENT: "وكيل التسويق",
      SUPPORT_AGENT: "وكيل الدعم",
      CONTENT_AGENT: "وكيل المحتوى",
      SALES_AGENT: "وكيل المبيعات",
      CREATIVE_AGENT: "وكيل الإبداع",
    };
    return names[type];
  }

  private getAgentDescription(type: AgentType): string {
    const descriptions: Record<AgentType, string> = {
      OPS_AGENT: "إدارة المحادثات والطلبات والتوصيل والمتابعات",
      INVENTORY_AGENT: "تتبع المخزون وتنبيهات النقص وحجز المنتجات",
      FINANCE_AGENT: "تقارير الأرباح اليومية وتنبيهات الإنفاق",
      MARKETING_AGENT: "العروض التلقائية وتقسيم العملاء",
      SUPPORT_AGENT: "الرد على استفسارات العملاء والتصعيد",
      CONTENT_AGENT: "إنشاء أوصاف المنتجات والترجمة",
      SALES_AGENT: "إدارة خط أنابيب المبيعات والعملاء المحتملين",
      CREATIVE_AGENT: "تصميم الصور والفيديو",
    };
    return descriptions[type];
  }

  private mapConversationToDto(
    conversation: Conversation,
    messages: Message[],
    customerOverride?: { name?: string; phone?: string },
  ): any {
    const info = conversation.collectedInfo as any;
    // Guard: old seed stored booleans in collected_info — only use string values
    const rawName = info?.customer_name;
    const rawPhone = info?.phone;
    const infoName =
      typeof rawName === "string" && rawName.length > 0 ? rawName : undefined;
    const infoPhone =
      typeof rawPhone === "string" && rawPhone.length > 0
        ? rawPhone
        : undefined;
    return {
      id: conversation.id,
      merchantId: conversation.merchantId,
      customerId: conversation.customerId,
      channel: (conversation as any).channel || "whatsapp",
      customerName: customerOverride?.name || infoName || undefined,
      customerPhone: customerOverride?.phone || infoPhone || undefined,
      senderId: conversation.senderId,
      state: conversation.state,
      cart: conversation.cart,
      collectedInfo: conversation.collectedInfo,
      missingSlots: conversation.missingSlots,
      followupCount: conversation.followupCount,
      isHumanTakeover: conversation.isHumanTakeover || false,
      takenOverBy: conversation.takenOverBy || undefined,
      takenOverAt: conversation.takenOverAt || undefined,
      conversationSummary: (conversation as any).conversationSummary,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt,
      messages:
        messages.length > 0
          ? messages.map((msg) => ({
              id: msg.id,
              direction: msg.direction,
              senderId: msg.senderId,
              text: msg.text || (msg as any).content,
              tokensUsed: msg.tokensUsed,
              status: (msg as any).status,
              createdAt: msg.createdAt,
            }))
          : undefined,
    };
  }

  // ============== CUSTOMER INSIGHTS ==============

  @Get("customers")
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get customers with segmentation" })
  @ApiQuery({
    name: "segment",
    description: "Filter by segment",
    required: false,
  })
  @ApiQuery({
    name: "search",
    description: "Search by phone or name",
    required: false,
  })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async getCustomers(
    @Req() req: Request,
    @Query("segment") segment?: string,
    @Query("search") search?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const pageLimit = Math.min(limit || 50, 500);
    const pageOffset = offset || 0;

    // Build query with RFM segmentation
    let query = `
      WITH customer_stats AS (
        SELECT 
          c.id as customer_id,
          c.phone,
          c.name,
          c.email,
          c.created_at as first_seen,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent,
          MAX(o.created_at) as last_order_date,
          EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) as days_since_last_order,
          AVG(o.total) as avg_order_value,
          lt.name as loyalty_tier_name,
          cp.current_points as loyalty_points
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED', 'DRAFT')
        LEFT JOIN customer_points cp ON cp.customer_id = c.id AND cp.merchant_id = c.merchant_id
        LEFT JOIN loyalty_tiers lt ON lt.id = cp.tier_id
        WHERE c.merchant_id = $1
        GROUP BY c.id, c.phone, c.name, c.email, c.created_at, lt.name, cp.current_points
      ),
      segmented AS (
        SELECT *,
          CASE 
            WHEN total_orders >= 5 AND total_spent >= 1000 AND days_since_last_order < 30 THEN 'VIP'
            WHEN total_orders >= 3 AND days_since_last_order < 60 THEN 'LOYAL'
            WHEN total_orders >= 1 AND days_since_last_order < 90 THEN 'REGULAR'
            WHEN total_orders = 0 OR days_since_last_order IS NULL THEN 'NEW'
            ELSE 'AT_RISK'
          END as segment
        FROM customer_stats
      )
      SELECT * FROM segmented
      WHERE 1=1
    `;

    const params: any[] = [merchantId];
    let paramIndex = 2;

    if (segment) {
      query += ` AND segment = $${paramIndex}`;
      params.push(segment);
      paramIndex++;
    }

    if (search) {
      query += ` AND (phone ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY total_spent DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageLimit, pageOffset);

    const result = await this.pool.query(query, params);

    // Get total count
    let countQuery = `
      WITH customer_stats AS (
        SELECT 
          c.id as customer_id,
          c.phone,
          c.name,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent,
          EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) as days_since_last_order
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED', 'DRAFT')
        WHERE c.merchant_id = $1
        GROUP BY c.id, c.phone, c.name
      ),
      segmented AS (
        SELECT *,
          CASE 
            WHEN total_orders >= 5 AND total_spent >= 1000 AND days_since_last_order < 30 THEN 'VIP'
            WHEN total_orders >= 3 AND days_since_last_order < 60 THEN 'LOYAL'
            WHEN total_orders >= 1 AND days_since_last_order < 90 THEN 'REGULAR'
            WHEN total_orders = 0 OR days_since_last_order IS NULL THEN 'NEW'
            ELSE 'AT_RISK'
          END as segment
        FROM customer_stats
      )
      SELECT COUNT(*) FROM segmented WHERE 1=1
    `;
    const countParams: any[] = [merchantId];
    let countParamIndex = 2;
    if (segment) {
      countQuery += ` AND segment = $${countParamIndex}`;
      countParams.push(segment);
      countParamIndex++;
    }
    if (search) {
      countQuery += ` AND (phone ILIKE $${countParamIndex} OR name ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }
    const countResult = await this.pool.query(countQuery, countParams);

    return {
      customers: result.rows.map((row) => {
        const parsedDaysSinceLastOrder =
          row.days_since_last_order === null ||
          row.days_since_last_order === undefined
            ? null
            : Number.parseInt(String(row.days_since_last_order), 10);
        return {
          id: row.customer_id,
          phone: row.phone,
          name: row.name,
          email: row.email || null,
          segment: row.segment,
          totalOrders: parseInt(row.total_orders) || 0,
          totalSpent: parseFloat(row.total_spent) || 0,
          avgOrderValue: parseFloat(row.avg_order_value) || 0,
          lastOrderDate: row.last_order_date,
          daysSinceLastOrder: Number.isNaN(parsedDaysSinceLastOrder)
            ? null
            : parsedDaysSinceLastOrder,
          firstSeen: row.first_seen,
          loyaltyTier: row.loyalty_tier_name || null,
          loyaltyPoints: row.loyalty_points ? parseInt(row.loyalty_points) : 0,
        };
      }),
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: pageLimit,
        offset: pageOffset,
      },
    };
  }

  @Get("customers/:id")
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get customer insights" })
  @ApiParam({ name: "id", description: "Customer ID" })
  async getCustomerInsights(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const customerResult = await this.pool.query(
      `SELECT id, name, phone, created_at
       FROM customers
       WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    if (customerResult.rows.length === 0) {
      throw new NotFoundException(`Customer ${id} not found`);
    }

    const customer = customerResult.rows[0];

    const ordersResult = await this.pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'DRAFT')) as total_orders,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as completed_orders,
         COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_orders,
         COALESCE(SUM(total) FILTER (WHERE status NOT IN ('CANCELLED', 'DRAFT')), 0) as total_spent,
         COALESCE(AVG(total) FILTER (WHERE status NOT IN ('CANCELLED', 'DRAFT')), 0) as avg_order_value,
         MIN(created_at) FILTER (WHERE status NOT IN ('CANCELLED', 'DRAFT')) as first_order_date,
         MAX(created_at) FILTER (WHERE status NOT IN ('CANCELLED', 'DRAFT')) as last_order_date
       FROM orders
       WHERE merchant_id = $1 AND customer_id = $2`,
      [merchantId, id],
    );

    const orders = ordersResult.rows[0] || {};
    const totalOrders = parseInt(orders.total_orders || "0", 10);
    const completedOrders = parseInt(orders.completed_orders || "0", 10);
    const cancelledOrders = parseInt(orders.cancelled_orders || "0", 10);
    const totalSpent = parseFloat(orders.total_spent || "0");
    const avgOrderValue = parseFloat(orders.avg_order_value || "0");
    const firstOrderDate = orders.first_order_date;
    const lastOrderDate = orders.last_order_date;

    const daysSinceLastOrder = lastOrderDate
      ? Math.floor(
          (Date.now() - new Date(lastOrderDate).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    const conversationStatsResult = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE state = 'ORDER_PLACED') as successful,
         COUNT(*) FILTER (WHERE human_takeover = true) as escalations
       FROM conversations
       WHERE merchant_id = $1 AND customer_id = $2`,
      [merchantId, id],
    );

    const avgMessagesResult = await this.pool.query(
      `SELECT COALESCE(AVG(msg_count), 0) as avg_messages
       FROM (
         SELECT c.id, COUNT(m.id) as msg_count
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.merchant_id = $1 AND c.customer_id = $2
         GROUP BY c.id
       ) t`,
      [merchantId, id],
    );

    const favoritesResult = await this.pool.query(
      `SELECT
         oi.name as product_name,
         SUM(oi.quantity)::int as total_quantity
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.merchant_id = $1 AND o.customer_id = $2 AND o.status NOT IN ('CANCELLED', 'DRAFT')
       GROUP BY oi.name
       ORDER BY total_quantity DESC
       LIMIT 5`,
      [merchantId, id],
    );

    const recentOrdersResult = await this.pool.query(
      `SELECT 
         id,
         status,
         total,
         created_at,
         COALESCE(order_number, CONCAT('ORD-', RIGHT(REPLACE(id::text, '-', ''), 8))) as order_ref
       FROM orders
       WHERE merchant_id = $1 AND customer_id = $2 AND status NOT IN ('DRAFT')
       ORDER BY created_at DESC
       LIMIT 5`,
      [merchantId, id],
    );

    const convoStats = conversationStatsResult.rows[0] || {};
    const totalConversations = parseInt(convoStats.total || "0", 10);
    const successfulConversations = parseInt(convoStats.successful || "0", 10);
    const escalations = parseInt(convoStats.escalations || "0", 10);
    const avgMessages = parseFloat(
      avgMessagesResult.rows[0]?.avg_messages || "0",
    );

    let segment = "NEW";
    if (
      totalOrders >= 5 &&
      totalSpent >= 1000 &&
      daysSinceLastOrder !== null &&
      daysSinceLastOrder < 30
    ) {
      segment = "VIP";
    } else if (
      totalOrders >= 3 &&
      daysSinceLastOrder !== null &&
      daysSinceLastOrder < 60
    ) {
      segment = "LOYAL";
    } else if (
      totalOrders >= 1 &&
      daysSinceLastOrder !== null &&
      daysSinceLastOrder < 90
    ) {
      segment = "REGULAR";
    } else if (totalOrders === 0 || daysSinceLastOrder === null) {
      segment = "NEW";
    } else {
      segment = "AT_RISK";
    }

    let churnRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (daysSinceLastOrder !== null) {
      if (daysSinceLastOrder > 90) churnRisk = "HIGH";
      else if (daysSinceLastOrder > 30) churnRisk = "MEDIUM";
    }

    let clv = 0;
    if (totalOrders > 0 && firstOrderDate) {
      const monthsActive = Math.max(
        1,
        Math.ceil(
          (Date.now() - new Date(firstOrderDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30),
        ),
      );
      const ordersPerMonth = totalOrders / monthsActive;
      const predictedAnnualOrders = ordersPerMonth * 12;
      clv = avgOrderValue * predictedAnnualOrders;
    }

    const conversionRate =
      totalConversations > 0
        ? Math.round((successfulConversations / totalConversations) * 100)
        : 0;

    return {
      customerId: customer.id,
      profile: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalSpent,
        avgOrderValue,
        firstOrderDate,
        lastOrderDate,
      },
      conversationStats: {
        total: totalConversations,
        successful: successfulConversations,
        avgMessages,
        escalations,
      },
      favoriteProducts: favoritesResult.rows,
      recentActivity: recentOrdersResult.rows.map((row: any) => ({
        type: "order",
        id: row.order_ref || row.id,
        status: row.status,
        value: parseFloat(row.total || 0),
        created_at: row.created_at,
      })),
      insights: {
        segment,
        clv,
        churnRisk,
        conversionRate,
      },
    };
  }

  @Get("customers/segments")
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get customer segment summary" })
  async getCustomerSegments(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const result = await this.pool.query(
      `
      WITH customer_stats AS (
        SELECT 
          c.id,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent,
          EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) as days_since_last_order
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED', 'DRAFT')
        WHERE c.merchant_id = $1
        GROUP BY c.id
      ),
      segmented AS (
        SELECT *,
          CASE 
            WHEN total_orders >= 5 AND total_spent >= 1000 AND days_since_last_order < 30 THEN 'VIP'
            WHEN total_orders >= 3 AND days_since_last_order < 60 THEN 'LOYAL'
            WHEN total_orders >= 1 AND days_since_last_order < 90 THEN 'REGULAR'
            WHEN total_orders = 0 OR days_since_last_order IS NULL THEN 'NEW'
            ELSE 'AT_RISK'
          END as segment
        FROM customer_stats
      )
      SELECT 
        segment,
        COUNT(*) as customer_count,
        COALESCE(SUM(total_spent), 0) as total_revenue,
        COALESCE(AVG(total_orders), 0) as avg_orders
      FROM segmented
      GROUP BY segment
    `,
      [merchantId],
    );

    const segments: Record<string, any> = {
      VIP: {
        count: 0,
        revenue: 0,
        avgOrders: 0,
        color: "#FFD700",
        icon: "crown",
      },
      LOYAL: {
        count: 0,
        revenue: 0,
        avgOrders: 0,
        color: "#4CAF50",
        icon: "heart",
      },
      REGULAR: {
        count: 0,
        revenue: 0,
        avgOrders: 0,
        color: "#2196F3",
        icon: "user",
      },
      NEW: {
        count: 0,
        revenue: 0,
        avgOrders: 0,
        color: "#9C27B0",
        icon: "sparkles",
      },
      AT_RISK: {
        count: 0,
        revenue: 0,
        avgOrders: 0,
        color: "#FF5722",
        icon: "alert",
      },
    };

    result.rows.forEach((row) => {
      if (segments[row.segment]) {
        segments[row.segment].count = parseInt(row.customer_count);
        segments[row.segment].revenue = parseFloat(row.total_revenue);
        segments[row.segment].avgOrders = parseFloat(row.avg_orders);
      }
    });

    const totalCustomers = Object.values(segments).reduce(
      (sum: number, s: any) => sum + s.count,
      0,
    );

    return {
      segments,
      totalCustomers,
      segmentDefinitions: {
        VIP: "عملاء مميزون: 5+ طلبات، 1000+ ريال، آخر طلب خلال 30 يوم",
        LOYAL: "عملاء مخلصون: 3+ طلبات، آخر طلب خلال 60 يوم",
        REGULAR: "عملاء منتظمون: طلب واحد+، آخر طلب خلال 90 يوم",
        NEW: "عملاء جدد: لم يطلبوا بعد",
        AT_RISK: "عملاء معرضون للخسارة: لم يطلبوا منذ أكثر من 90 يوم",
      },
    };
  }

  @Get("customers/:customerId/insights")
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get detailed customer insights" })
  async getCustomerInsightsDetailed(
    @Req() req: Request,
    @Param("customerId") customerId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Get customer basic info
    const customerResult = await this.pool.query(
      `SELECT * FROM customers WHERE id = $1 AND merchant_id = $2`,
      [customerId, merchantId],
    );

    if (customerResult.rows.length === 0) {
      throw new NotFoundException("Customer not found");
    }

    const customer = customerResult.rows[0];

    // Get order history
    const ordersResult = await this.pool.query(
      `SELECT id, status, total, created_at, items
       FROM orders 
       WHERE customer_id = $1 AND merchant_id = $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [customerId, merchantId],
    );

    // Get conversation stats
    const conversationStats = await this.pool.query(
      `SELECT 
         COUNT(*) as total_conversations,
         COUNT(*) FILTER (WHERE state = 'ORDER_PLACED') as converted_conversations,
         AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
       FROM conversations 
       WHERE customer_id = $1 AND merchant_id = $2`,
      [customerId, merchantId],
    );

    // Calculate favorite products from order history
    const favoriteProducts = await this.pool.query(
      `SELECT 
         item->>'productId' as product_id,
         item->>'productName' as product_name,
         SUM((item->>'quantity')::int) as total_quantity,
         COUNT(*) as order_count
       FROM orders, jsonb_array_elements(items) as item
       WHERE customer_id = $1 AND merchant_id = $2 AND status NOT IN ('CANCELLED', 'DRAFT')
       GROUP BY item->>'productId', item->>'productName'
       ORDER BY total_quantity DESC
       LIMIT 5`,
      [customerId, merchantId],
    );

    // Calculate metrics
    const orders = ordersResult.rows;
    const totalSpent = orders.reduce(
      (sum, o) => sum + parseFloat(o.total || 0),
      0,
    );
    const avgOrderValue = orders.length > 0 ? totalSpent / orders.length : 0;

    // RFM calculation
    const daysSinceLastOrder =
      orders.length > 0
        ? Math.floor(
            (Date.now() - new Date(orders[0].created_at).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

    // Calculate segment
    let segment = "NEW";
    if (
      orders.length >= 5 &&
      totalSpent >= 1000 &&
      daysSinceLastOrder !== null &&
      daysSinceLastOrder < 30
    ) {
      segment = "VIP";
    } else if (
      orders.length >= 3 &&
      daysSinceLastOrder !== null &&
      daysSinceLastOrder < 60
    ) {
      segment = "LOYAL";
    } else if (
      orders.length >= 1 &&
      daysSinceLastOrder !== null &&
      daysSinceLastOrder < 90
    ) {
      segment = "REGULAR";
    } else if (daysSinceLastOrder !== null && daysSinceLastOrder >= 90) {
      segment = "AT_RISK";
    }

    // Calculate CLV (simple model: avg order value * predicted annual orders)
    const monthsActive = Math.max(
      1,
      Math.floor(
        (Date.now() - new Date(customer.created_at).getTime()) /
          (1000 * 60 * 60 * 24 * 30),
      ),
    );
    const ordersPerMonth = orders.length / monthsActive;
    const predictedAnnualOrders = ordersPerMonth * 12;
    const clv = avgOrderValue * predictedAnnualOrders * 2; // 2-year projection

    // Calculate churn risk with numeric score
    let churnRisk = "LOW";
    let riskScore = 0;
    const riskFactors: string[] = [];

    if (daysSinceLastOrder !== null) {
      // Days since last order contributes to risk
      if (daysSinceLastOrder > 90) {
        riskScore += 40;
        riskFactors.push(`غير نشط منذ ${daysSinceLastOrder} يوم`);
        churnRisk = "HIGH";
      } else if (daysSinceLastOrder > 60) {
        riskScore += 25;
        riskFactors.push(`آخر طلب منذ ${daysSinceLastOrder} يوم`);
        churnRisk = "MEDIUM";
      } else if (daysSinceLastOrder > 30) {
        riskScore += 10;
      }
    }

    // Order frequency contributes to risk
    if (orders.length < 2) {
      riskScore += 20;
      riskFactors.push("عميل جديد - طلب واحد فقط");
    }

    // Cancelled orders increase risk
    const cancelledOrders = orders.filter(
      (o) => o.status === "CANCELLED",
    ).length;
    if (cancelledOrders > 0) {
      const cancelRate = cancelledOrders / orders.length;
      if (cancelRate > 0.3) {
        riskScore += 25;
        riskFactors.push(
          `نسبة إلغاء مرتفعة (${Math.round(cancelRate * 100)}%)`,
        );
      } else if (cancelRate > 0.1) {
        riskScore += 10;
        riskFactors.push("بعض الطلبات الملغية");
      }
    }

    // Low spending relative to average
    if (avgOrderValue < 100 && orders.length > 1) {
      riskScore += 10;
      riskFactors.push("متوسط قيمة الطلب منخفض");
    }

    // Cap score at 100
    riskScore = Math.min(riskScore, 100);

    // Override churn risk level based on score
    if (riskScore >= 50) churnRisk = "HIGH";
    else if (riskScore >= 25) churnRisk = "MEDIUM";
    else churnRisk = "LOW";

    const convStats = conversationStats.rows[0];
    const conversionRate =
      parseInt(convStats.total_conversations) > 0
        ? (parseInt(convStats.converted_conversations) /
            parseInt(convStats.total_conversations)) *
          100
        : 0;

    return {
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        createdAt: customer.created_at,
      },
      segment,
      metrics: {
        totalOrders: orders.length,
        totalSpent,
        avgOrderValue,
        daysSinceLastOrder,
        clv: Math.round(clv),
        churnRisk,
        riskScore, // Numeric 0-100 score
        riskFactors, // Array of Arabic reason strings
      },
      favoriteProducts: favoriteProducts.rows.map((p) => ({
        productId: p.product_id,
        productName: p.product_name,
        totalQuantity: parseInt(p.total_quantity),
        orderCount: parseInt(p.order_count),
      })),
      conversationStats: {
        total: parseInt(convStats.total_conversations),
        converted: parseInt(convStats.converted_conversations),
        conversionRate: Math.round(conversionRate * 10) / 10,
        avgDurationMinutes: Math.round(
          parseFloat(convStats.avg_duration_seconds || 0) / 60,
        ),
      },
      recentOrders: orders.slice(0, 10).map((o) => ({
        id: o.id,
        status: o.status,
        totalAmount: parseFloat(o.total),
        createdAt: o.created_at,
        itemCount: Array.isArray(o.items) ? o.items.length : 0,
      })),
    };
  }

  @Post("campaigns/winback")
  @RequiresFeature("LOYALTY")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Create and send win-back campaign to at-risk customers via WhatsApp",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        discountPercent: { type: "number", default: 15 },
        message: { type: "string" },
        validDays: { type: "number", default: 7 },
      },
    },
  })
  async createWinBackCampaign(
    @Req() req: Request,
    @Body()
    body: { discountPercent?: number; message?: string; validDays?: number },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const discountPercent = body.discountPercent || 15;
    const validDays = body.validDays || 7;

    // Check merchant WhatsApp number
    const mcResult = await this.pool.query(
      `SELECT name, config, whatsapp_number FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchantName = mcResult.rows?.[0]?.name || "التاجر";
    const merchantWhatsApp: string | null =
      mcResult.rows?.[0]?.whatsapp_number || null;
    const brandName = mcResult.rows?.[0]?.config?.brandName || merchantName;

    // Find at-risk customers (no order in 90+ days, had at least 1 order, has phone)
    const atRiskCustomers = await this.pool.query(
      `
      WITH customer_stats AS (
        SELECT 
          c.id,
          c.phone,
          c.name,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent,
          MAX(o.created_at) as last_order_date
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED')
        WHERE c.merchant_id = $1
        GROUP BY c.id, c.phone, c.name
        HAVING MAX(o.created_at) < NOW() - INTERVAL '90 days'
      )
      SELECT * FROM customer_stats 
      WHERE total_orders >= 1 AND phone IS NOT NULL AND phone != ''
      ORDER BY total_spent DESC
      LIMIT 200
    `,
      [merchantId],
    );

    if (atRiskCustomers.rows.length === 0) {
      return {
        sent: 0,
        totalTargeted: 0,
        message: "لا يوجد عملاء معرّضون للخسارة حالياً — جميع عملاءك نشطون!",
      };
    }

    // Generate unique discount code
    const campaignCode = `WINBACK${Date.now().toString(36).toUpperCase()}`;

    const campaignMessage =
      body.message ||
      `🎁 وحشتنا يا ${"{name}"}! من ${brandName}\nاستخدم كود ${campaignCode} واحصل على خصم ${discountPercent}% على طلبك القادم.\nالعرض صالح لمدة ${validDays} أيام فقط!`;

    // Send WhatsApp messages
    let sentCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const customer of atRiskCustomers.rows) {
      try {
        const personalMsg = campaignMessage.replace(
          "{name}",
          customer.name || "عميلنا العزيز",
        );
        await this.notificationsService.sendBroadcastWhatsApp(
          customer.phone,
          personalMsg,
          merchantWhatsApp || undefined,
        );
        sentCount++;
      } catch (err: any) {
        failCount++;
        if (errors.length < 3) errors.push(err.message);
      }
    }

    // Log campaign
    await this.auditService.logFromRequest(
      req,
      "CREATE",
      "CAMPAIGN",
      merchantId,
      {
        metadata: {
          type: "WIN_BACK",
          code: campaignCode,
          discountPercent,
          validDays,
          targeted: atRiskCustomers.rows.length,
          sent: sentCount,
          failed: failCount,
        },
      },
    );

    this.logger.log({
      msg: "Win-back campaign sent",
      merchantId,
      code: campaignCode,
      targeted: atRiskCustomers.rows.length,
      sent: sentCount,
      failed: failCount,
    });

    return {
      sent: sentCount,
      failCount,
      totalTargeted: atRiskCustomers.rows.length,
      campaignCode,
      message:
        sentCount > 0
          ? `تم إرسال حملة الاستعادة إلى ${sentCount} عميل عبر واتساب`
          : "فشل إرسال الرسائل — تأكد من إعداد واتساب في صفحة الإعدادات",
      ...(errors.length > 0 ? { errors } : {}),
    };
  }

  // ── Seasonal campaign ─────────────────────────────────────────────────────

  @Post("campaigns/seasonal")
  @RequiresFeature("LOYALTY")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Send a seasonal/promotional campaign to all customers via WhatsApp",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Campaign title / subject" },
        message: {
          type: "string",
          description: "Message body (use {name} for personalisation)",
        },
        recipientFilter: {
          type: "string",
          enum: ["all", "vip", "loyal", "regular", "at_risk", "new"],
          description: "Which customer segment to target",
        },
      },
      required: ["title", "message"],
    },
  })
  async createSeasonalCampaign(
    @Req() req: Request,
    @Body()
    body: { title: string; message: string; recipientFilter?: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const { title, message, recipientFilter = "all" } = body;

    if (!title?.trim() || !message?.trim()) {
      throw new BadRequestException("العنوان والرسالة مطلوبان");
    }

    const mcResult = await this.pool.query(
      `SELECT name, config, whatsapp_number FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchantWhatsApp: string | null =
      mcResult.rows?.[0]?.whatsapp_number || null;
    const brandName =
      mcResult.rows?.[0]?.config?.brandName ||
      mcResult.rows?.[0]?.name ||
      "المتجر";

    const status = this.notificationsService.getDeliveryConfigStatus();
    if (!status.whatsapp.configured || !merchantWhatsApp) {
      throw new BadRequestException(
        "واتساب غير مهيأ — أضف رقم واتساب في الإعدادات",
      );
    }

    // Build recipient query based on segment
    let recipientQuery = `
      WITH customer_stats AS (
        SELECT c.id, c.name, c.phone,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent,
          EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) as days_since_last_order
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED')
        WHERE c.merchant_id = $1 AND c.phone IS NOT NULL AND c.phone != ''
        GROUP BY c.id, c.name, c.phone
      )
      SELECT id, name, phone FROM customer_stats WHERE `;
    const segmentMap: Record<string, string> = {
      all: "1=1",
      vip: "total_orders >= 5 AND total_spent >= 1000 AND days_since_last_order < 30",
      loyal: "total_orders >= 3 AND days_since_last_order < 60",
      regular: "total_orders >= 1 AND days_since_last_order < 90",
      new: "total_orders = 0 OR days_since_last_order IS NULL",
      at_risk: "total_orders >= 1 AND days_since_last_order >= 90",
    };
    recipientQuery += segmentMap[recipientFilter] || "1=1";

    const recipientsResult = await this.pool.query(recipientQuery, [
      merchantId,
    ]);
    const recipients = recipientsResult.rows;

    if (recipients.length === 0) {
      return {
        sent: 0,
        totalTargeted: 0,
        message: "لا يوجد عملاء مطابقون للفئة المختارة",
      };
    }

    let sentCount = 0;
    let failCount = 0;
    for (const customer of recipients) {
      try {
        const personalMsg = (message + `\n\n— ${brandName}`).replace(
          "{name}",
          customer.name || "عميلنا العزيز",
        );
        await this.notificationsService.sendBroadcastWhatsApp(
          customer.phone,
          personalMsg,
          merchantWhatsApp,
        );
        sentCount++;
      } catch {
        failCount++;
      }
    }

    await this.auditService.logFromRequest(
      req,
      "CREATE",
      "CAMPAIGN",
      merchantId,
      {
        metadata: {
          type: "SEASONAL",
          title,
          recipientFilter,
          targeted: recipients.length,
          sent: sentCount,
          failed: failCount,
        },
      },
    );

    return {
      sent: sentCount,
      failCount,
      totalTargeted: recipients.length,
      message: `تم إرسال الحملة الموسمية إلى ${sentCount} عميل`,
    };
  }

  // ── Re-engagement campaign ────────────────────────────────────────────────

  @Post("campaigns/reengagement")
  @RequiresFeature("LOYALTY")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Send a re-engagement campaign to inactive customers via WhatsApp",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        inactiveDays: {
          type: "number",
          default: 60,
          description: "Target customers inactive for this many days",
        },
        message: {
          type: "string",
          description: "Message body (use {name} and {days} as placeholders)",
        },
        discountCode: {
          type: "string",
          description: "Optional promo code to include in message",
        },
      },
    },
  })
  async createReengagementCampaign(
    @Req() req: Request,
    @Body()
    body: { inactiveDays?: number; message?: string; discountCode?: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const inactiveDays = Math.max(7, Number(body.inactiveDays || 60));

    const mcResult = await this.pool.query(
      `SELECT name, config, whatsapp_number FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchantWhatsApp: string | null =
      mcResult.rows?.[0]?.whatsapp_number || null;
    const brandName =
      mcResult.rows?.[0]?.config?.brandName ||
      mcResult.rows?.[0]?.name ||
      "المتجر";

    const status = this.notificationsService.getDeliveryConfigStatus();
    if (!status.whatsapp.configured || !merchantWhatsApp) {
      throw new BadRequestException(
        "واتساب غير مهيأ — أضف رقم واتساب في الإعدادات",
      );
    }

    const inactiveCustomers = await this.pool.query(
      `
      WITH stats AS (
        SELECT c.id, c.name, c.phone,
          COUNT(DISTINCT o.id) as total_orders,
          EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) as days_since_last_order
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED')
        WHERE c.merchant_id = $1 AND c.phone IS NOT NULL AND c.phone != ''
        GROUP BY c.id, c.name, c.phone
        HAVING MAX(o.created_at) < NOW() - ($2 || ' days')::interval
      )
      SELECT id, name, phone, days_since_last_order FROM stats WHERE total_orders >= 1
      ORDER BY days_since_last_order DESC LIMIT 300
      `,
      [merchantId, inactiveDays],
    );

    if (inactiveCustomers.rows.length === 0) {
      return {
        sent: 0,
        totalTargeted: 0,
        message: `لا يوجد عملاء غير نشطين منذ أكثر من ${inactiveDays} يوم`,
      };
    }

    const defaultMessage = body.discountCode
      ? `مشتقناك يا {name} 💙\nمرت {days} يوم ما طلبتش منا!\n\nاستخدم كود ${body.discountCode} واحصل على خصم خاص لك.\n\n— ${brandName}`
      : `مشتقناك يا {name} 💙\nمرت {days} يوم ما طلبتش منا!\nبنستنى طلبك — ${brandName}`;

    const campaignMessage = body.message || defaultMessage;

    let sentCount = 0;
    let failCount = 0;
    for (const customer of inactiveCustomers.rows) {
      try {
        const personalMsg = campaignMessage
          .replace("{name}", customer.name || "عميلنا")
          .replace(
            "{days}",
            String(
              Math.round(
                Number(customer.days_since_last_order || inactiveDays),
              ),
            ),
          );
        await this.notificationsService.sendBroadcastWhatsApp(
          customer.phone,
          personalMsg,
          merchantWhatsApp,
        );
        sentCount++;
      } catch {
        failCount++;
      }
    }

    await this.auditService.logFromRequest(
      req,
      "CREATE",
      "CAMPAIGN",
      merchantId,
      {
        metadata: {
          type: "REENGAGEMENT",
          inactiveDays,
          discountCode: body.discountCode,
          targeted: inactiveCustomers.rows.length,
          sent: sentCount,
          failed: failCount,
        },
      },
    );

    return {
      sent: sentCount,
      failCount,
      totalTargeted: inactiveCustomers.rows.length,
      message: `تم إرسال حملة إعادة التفاعل إلى ${sentCount} عميل`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUPPLIER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  @Get("suppliers")
  @ApiOperation({ summary: "List all suppliers for this merchant" })
  async getSuppliers(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `SELECT id, name, contact_name, phone, whatsapp_phone, email, address,
              payment_terms, lead_time_days, notes, is_active,
              auto_notify_low_stock, notify_threshold, last_auto_notified_at,
              created_at, updated_at
       FROM suppliers
       WHERE merchant_id = $1
       ORDER BY name ASC`,
      [merchantId],
    );
    return { suppliers: result.rows };
  }

  @Post("suppliers")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Create a new supplier" })
  async createSupplier(
    @Req() req: Request,
    @Body()
    body: {
      name: string;
      contactName?: string;
      phone?: string;
      whatsappPhone?: string;
      email?: string;
      address?: string;
      paymentTerms?: string;
      leadTimeDays?: number;
      notes?: string;
      autoNotifyLowStock?: boolean;
      notifyThreshold?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    if (!body?.name?.trim()) throw new BadRequestException("name مطلوب");

    const result = await this.pool.query(
      `INSERT INTO suppliers
         (merchant_id, name, contact_name, phone, whatsapp_phone, email, address,
          payment_terms, lead_time_days, notes,
          auto_notify_low_stock, notify_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        merchantId,
        body.name.trim(),
        body.contactName || null,
        body.phone || null,
        body.whatsappPhone || body.phone || null,
        body.email || null,
        body.address || null,
        body.paymentTerms || null,
        body.leadTimeDays ?? 7,
        body.notes || null,
        body.autoNotifyLowStock ?? false,
        body.notifyThreshold || "critical",
      ],
    );
    return { supplier: result.rows[0] };
  }

  @Patch("suppliers/:supplierId")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Update a supplier" })
  async updateSupplier(
    @Req() req: Request,
    @Param("supplierId") supplierId: string,
    @Body() body: Record<string, any>,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const existing = await this.pool.query(
      `SELECT id FROM suppliers WHERE id = $1 AND merchant_id = $2`,
      [supplierId, merchantId],
    );
    if (!existing.rows.length)
      throw new NotFoundException("Supplier not found");

    const allowed: Record<string, string> = {
      name: "name",
      contactName: "contact_name",
      phone: "phone",
      whatsappPhone: "whatsapp_phone",
      email: "email",
      address: "address",
      paymentTerms: "payment_terms",
      leadTimeDays: "lead_time_days",
      notes: "notes",
      isActive: "is_active",
      autoNotifyLowStock: "auto_notify_low_stock",
      notifyThreshold: "notify_threshold",
    };

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [bodyKey, colName] of Object.entries(allowed)) {
      if (body[bodyKey] !== undefined) {
        sets.push(`${colName} = $${idx}`);
        values.push(body[bodyKey]);
        idx++;
      }
    }
    if (!sets.length) throw new BadRequestException("لا يوجد حقول للتحديث");

    sets.push(`updated_at = NOW()`);
    values.push(supplierId);
    values.push(merchantId);

    const result = await this.pool.query(
      `UPDATE suppliers SET ${sets.join(", ")}
       WHERE id = $${idx} AND merchant_id = $${idx + 1}
       RETURNING *`,
      values,
    );
    return { supplier: result.rows[0] };
  }

  @Delete("suppliers/:supplierId")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Delete a supplier" })
  async deleteSupplier(
    @Req() req: Request,
    @Param("supplierId") supplierId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `DELETE FROM suppliers WHERE id = $1 AND merchant_id = $2 RETURNING id`,
      [supplierId, merchantId],
    );
    if (!result.rows.length) throw new NotFoundException("Supplier not found");
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AUTOMATION CENTER
  // ═══════════════════════════════════════════════════════════════════════

  @Get("automations")
  @ApiOperation({ summary: "Get merchant automation settings" })
  async getAutomations(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Return current settings merged with defaults
    const result = await this.pool.query(
      `SELECT automation_type, is_enabled, config, last_run_at,
              check_interval_hours, last_checked_at
       FROM merchant_automations WHERE merchant_id = $1`,
      [merchantId],
    );

    // Default configurations shown even if not yet saved
    const DEFAULTS: Record<
      string,
      {
        label: string;
        labelEn: string;
        description: string;
        defaultConfig: Record<string, any>;
      }
    > = {
      SUPPLIER_LOW_STOCK: {
        label: "تنبيه المورّد عند انخفاض المخزون",
        labelEn: "Supplier Low-Stock Alert",
        description:
          "يُرسل رسالة واتساب تلقائية للموردين يومياً عندما تنخفض منتجاتهم عن الحد الأدنى",
        defaultConfig: { threshold: "critical", messageTemplate: "" },
      },
      REENGAGEMENT_AUTO: {
        label: "حملة إعادة التفاعل التلقائية",
        labelEn: "Auto Re-engagement Campaign",
        description:
          "يُرسل تلقائياً رسالة أسبوعية للعملاء الذين توقفوا عن الطلب",
        defaultConfig: {
          inactiveDays: 30,
          discountCode: "",
          messageTemplate: "",
        },
      },
      REVIEW_REQUEST: {
        label: "طلب تقييم بعد التوصيل",
        labelEn: "Post-Delivery Review Request",
        description: "يُرسل رسالة للعميل بعد التوصيل لطلب تقييمه",
        defaultConfig: { delayHours: 24, messageTemplate: "" },
      },
      NEW_CUSTOMER_WELCOME: {
        label: "رسالة ترحيب بالعملاء الجدد",
        labelEn: "New Customer Welcome",
        description: "يُرسل رسالة ترحيب تلقائية لأي عميل يطلب لأول مرة",
        defaultConfig: { messageTemplate: "" },
      },
      CHURN_PREVENTION: {
        label: "الوقاية من فقدان العملاء",
        labelEn: "Churn Prevention",
        description:
          "يرصد تلقائياً العملاء المعرضين للتوقف عن الطلب ويرسل لهم عروضاً استثنائية",
        defaultConfig: {
          silentDays: 60,
          discountCode: "",
          messageTemplate: "",
        },
      },
      QUOTE_FOLLOWUP: {
        label: "متابعة عروض الأسعار تلقائياً",
        labelEn: "Quote Follow-Up",
        description:
          "يُرسل تذكيراً تلقائياً للعملاء الذين لم يردوا على عروض الأسعار",
        defaultConfig: { ageHours: 48, messageTemplate: "" },
      },
      LOYALTY_MILESTONE: {
        label: "مكافأة إنجازات نقاط الولاء",
        labelEn: "Loyalty Milestone",
        description: "يُرسل رسالة تهنئة عند وصول العميل لعتبة نقاط ولاء جديدة",
        defaultConfig: { milestonePoints: 100, messageTemplate: "" },
      },
      EXPENSE_SPIKE_ALERT: {
        label: "تنبيه الارتفاع المفاجئ في المصاريف",
        labelEn: "Expense Spike Alert",
        description:
          "يُنبّه عند ارتفاع مصاريف التشغيل بشكل غير طبيعي مقارنةً بالمتوسط الشهري",
        defaultConfig: { spikeThreshold: 150 },
      },
      DELIVERY_SLA_BREACH: {
        label: "تنبيه تجاوز مواعيد التوصيل",
        labelEn: "Delivery SLA Breach",
        description: "يُراقب الطلبات ويُنبّه فور تجاوز وقت التوصيل المتفق عليه",
        defaultConfig: { slaHours: 48, notifyCustomer: true },
      },
      TOKEN_USAGE_WARNING: {
        label: "تحذير استهلاك حصة الذكاء الاصطناعي",
        labelEn: "AI Token Usage Warning",
        description:
          "يُنبّه عند اقتراب الاستهلاك الشهري لحصة الذكاء الاصطناعي من حدودها",
        defaultConfig: { warnPct: 80 },
      },
      AI_ANOMALY_DETECTION: {
        label: "كشف الشذوذ الذكي في البيانات",
        labelEn: "AI Anomaly Detection",
        description:
          "يكتشف ويُبلّغ عن أنماط غير طبيعية في المبيعات أو الطلبات أو المدفوعات",
        defaultConfig: {},
      },
      SEASONAL_STOCK_PREP: {
        label: "التحضير التلقائي للمخزون الموسمي",
        labelEn: "Seasonal Stock Prep",
        description:
          "يُحلّل الأنماط التاريخية ويُوصي بتجديد المخزون قبل المواسم والإجازات",
        defaultConfig: { warningDays: 14 },
      },
      SENTIMENT_MONITOR: {
        label: "رصد مشاعر العملاء",
        labelEn: "Sentiment Monitor",
        description:
          "يُحلّل رسائل العملاء ويُنبّه عند رصد سخط أو مشاعر سلبية متكررة",
        defaultConfig: { frustratedThresholdPct: 5 },
      },
      LEAD_SCORE: {
        label: "تقييم العملاء المحتملين تلقائياً",
        labelEn: "Lead Scoring",
        description:
          "يُرتّب الفرص والعملاء المحتملين حسب احتمالية التحويل بالذكاء الاصطناعي",
        defaultConfig: {},
      },
      AUTO_VIP_TAG: {
        label: "تصنيف العملاء المميزين تلقائياً",
        labelEn: "Auto VIP Tag",
        description:
          "يُضيف وسم VIP تلقائياً للعملاء الذين يستوفون معايير الإنفاق والولاء",
        defaultConfig: { minOrders: 5, minSpend: 1000 },
      },
      AT_RISK_TAG: {
        label: "تصنيف العملاء في خطر",
        labelEn: "At-Risk Tag",
        description:
          "يُضيف وسم 'في خطر' للعملاء ذوي انخفاض التفاعل المعرضين للمغادرة",
        defaultConfig: { silentDays: 21, minPriorOrders: 2 },
      },
      HIGH_RETURN_FLAG: {
        label: "تحديد العملاء كثيري الإرجاع",
        labelEn: "High Return Flag",
        description:
          "يُحدّد ويُعلّم العملاء ذوي معدل الإلغاء أو الإرجاع المرتفع لمراجعتهم",
        defaultConfig: { cancellationRatePct: 30, minOrders: 3 },
      },
    };

    const saved = new Map(result.rows.map((r) => [r.automation_type, r]));

    const automations = Object.entries(DEFAULTS).map(([type, meta]) => {
      const row = saved.get(type);
      return {
        type,
        label: meta.label,
        labelEn: meta.labelEn,
        description: meta.description,
        isEnabled: row?.is_enabled ?? false,
        config: { ...meta.defaultConfig, ...(row?.config || {}) },
        lastRunAt: row?.last_run_at ?? null,
        checkIntervalHours: row?.check_interval_hours ?? null,
        lastCheckedAt: row?.last_checked_at ?? null,
      };
    });

    // Recent run logs
    const logs = await this.pool.query(
      `SELECT automation_type, status, messages_sent, targets_found, run_at
       FROM automation_run_logs
       WHERE merchant_id = $1
       ORDER BY run_at DESC LIMIT 40`,
      [merchantId],
    );

    return { automations, recentLogs: logs.rows };
  }

  @Patch("automations/:type")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Update automation setting (enable/disable/configure)",
  })
  async updateAutomation(
    @Req() req: Request,
    @Param("type") type: string,
    @Body() body: { isEnabled?: boolean; config?: Record<string, any> },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const VALID_TYPES = [
      "SUPPLIER_LOW_STOCK",
      "REENGAGEMENT_AUTO",
      "REVIEW_REQUEST",
      "NEW_CUSTOMER_WELCOME",
      "CHURN_PREVENTION",
      "QUOTE_FOLLOWUP",
      "LOYALTY_MILESTONE",
      "EXPENSE_SPIKE_ALERT",
      "DELIVERY_SLA_BREACH",
      "TOKEN_USAGE_WARNING",
      "AI_ANOMALY_DETECTION",
      "SEASONAL_STOCK_PREP",
      "SENTIMENT_MONITOR",
      "LEAD_SCORE",
      "AUTO_VIP_TAG",
      "AT_RISK_TAG",
      "HIGH_RETURN_FLAG",
    ];
    if (!VALID_TYPES.includes(type))
      throw new BadRequestException("نوع الأتمتة غير صحيح");

    const hasIsEnabledUpdate = typeof body?.isEnabled === "boolean";
    const hasConfigUpdate =
      !!body?.config && Object.keys(body.config).length > 0;
    if (!hasIsEnabledUpdate && !hasConfigUpdate) {
      throw new BadRequestException(
        "يجب إرسال isEnabled أو config لتحديث الأتمتة",
      );
    }

    const result = await this.pool.query(
      `INSERT INTO merchant_automations (merchant_id, automation_type, is_enabled, config)
       VALUES ($1, $2, COALESCE($3, false), COALESCE($4::jsonb, '{}'))
       ON CONFLICT (merchant_id, automation_type)
       DO UPDATE SET
         is_enabled = CASE
                        WHEN $3 IS NULL THEN merchant_automations.is_enabled
                        ELSE $3
                      END,
         config     = CASE
                        WHEN $4::jsonb IS NOT NULL
                        THEN merchant_automations.config || $4::jsonb
                        ELSE merchant_automations.config
                      END,
         updated_at = NOW()
       RETURNING *`,
      [
        merchantId,
        type,
        body.isEnabled ?? null,
        body.config ? JSON.stringify(body.config) : null,
      ],
    );
    return { automation: result.rows[0] };
  }

  @Patch("automations/:type/schedule")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Set how often an automation runs (hours between checks)",
  })
  async setAutomationSchedule(
    @Req() req: Request,
    @Param("type") type: string,
    @Body() body: { checkIntervalHours: number },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const hours = Math.max(
      1,
      Math.min(720, Number(body?.checkIntervalHours ?? 24)),
    );
    const result = await this.pool.query(
      `INSERT INTO merchant_automations (merchant_id, automation_type, is_enabled, check_interval_hours)
       VALUES ($1, $2, false, $3)
       ON CONFLICT (merchant_id, automation_type)
       DO UPDATE SET check_interval_hours = $3, updated_at = NOW()
       RETURNING automation_type, is_enabled, check_interval_hours, last_checked_at`,
      [merchantId, type, hours],
    );
    return { automation: result.rows[0] };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEMAND FORECASTING & AI PREDICTIONS
  // ═══════════════════════════════════════════════════════════════════════

  @Get("analytics/forecast")
  @ApiOperation({
    summary: "AI demand forecast – stock predictions per product",
  })
  async getDemandForecast(
    @Req() req: Request,
    @Query("refresh") refresh?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Return cached forecasts unless refresh=true
    if (refresh !== "true") {
      const cached = await this.pool.query(
        `SELECT * FROM demand_forecasts
         WHERE merchant_id = $1
           AND computed_at > NOW() - INTERVAL '6 hours'
         ORDER BY urgency DESC, days_until_stockout ASC NULLS LAST
         LIMIT 100`,
        [merchantId],
      );
      if (cached.rows.length > 0) {
        return {
          forecasts: cached.rows,
          fresh: false,
          computedAt: cached.rows[0].computed_at,
        };
      }
    }

    // ── Compute forecasts from order history ─────────────────────────────
    const salesData = await this.pool.query<{
      product_id: string;
      product_name: string;
      current_stock: number;
      reorder_level: number | null;
      total_sold_30d: number;
      total_sold_7d: number;
      total_sold_prev7d: number;
    }>(
      `WITH order_sales AS (
         SELECT
           (item->>'variantId')::uuid AS variant_id,
           (item->>'quantity')::int   AS quantity,
           o.created_at
         FROM orders o,
              jsonb_array_elements(
                CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
              ) AS item
         WHERE o.merchant_id = $1
           AND o.created_at >= NOW() - INTERVAL '30 days'
                 AND o.status::text NOT IN ('CANCELLED','REFUNDED')
           AND (item->>'variantId') IS NOT NULL
       ),
       variant_sales AS (
         SELECT os.variant_id, os.quantity, os.created_at,
                iv.inventory_item_id
         FROM order_sales os
         JOIN inventory_variants iv ON iv.id = os.variant_id AND iv.merchant_id = $1
       ),
       item_stock AS (
         SELECT iv.inventory_item_id,
                COALESCE(SUM(iv.quantity_on_hand), 0) AS current_stock
         FROM inventory_variants iv
         WHERE iv.merchant_id = $1
         GROUP BY iv.inventory_item_id
       )
       SELECT
         ii.id                      AS product_id,
         COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku) AS product_name,
         COALESCE(ist.current_stock, 0) AS current_stock,
         ii.reorder_point           AS reorder_level,
         COALESCE(SUM(vs.quantity) FILTER (WHERE vs.created_at >= NOW() - INTERVAL '30 days'), 0) AS total_sold_30d,
         COALESCE(SUM(vs.quantity) FILTER (WHERE vs.created_at >= NOW() - INTERVAL '7 days'), 0)  AS total_sold_7d,
         COALESCE(SUM(vs.quantity) FILTER (WHERE vs.created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'), 0) AS total_sold_prev7d
       FROM inventory_items ii
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
       LEFT JOIN variant_sales vs ON vs.inventory_item_id = ii.id
       LEFT JOIN item_stock ist ON ist.inventory_item_id = ii.id
       WHERE ii.merchant_id = $1
       GROUP BY ii.id, ii.name, ci.name_ar, ci.name_en, ii.sku, ii.reorder_point, ist.current_stock
       ORDER BY total_sold_30d DESC
       LIMIT 80`,
      [merchantId],
    );

    const forecasts = salesData.rows.map((row) => {
      const avg30 = Number(row.total_sold_30d) / 30;
      const avg7 = Number(row.total_sold_7d) / 7;
      const avgPrev7 = Number(row.total_sold_prev7d) / 7;
      const trendPct =
        avgPrev7 > 0 ? Math.round(((avg7 - avgPrev7) / avgPrev7) * 100) : 0;
      const avgEffective = avg7 > 0 ? avg7 : avg30; // prefer recent
      const stock = Number(row.current_stock);
      const daysUntilStockout =
        avgEffective > 0 ? Math.round(stock / avgEffective) : null;
      const forecast7d = Math.round(avgEffective * 7);
      const forecast30d = Math.round(avgEffective * 30);
      const reorderQty = Math.max(0, forecast30d - stock);

      // Urgency
      let urgency: string;
      if (stock === 0) urgency = "critical";
      else if (daysUntilStockout !== null && daysUntilStockout <= 3)
        urgency = "critical";
      else if (daysUntilStockout !== null && daysUntilStockout <= 7)
        urgency = "high";
      else if (daysUntilStockout !== null && daysUntilStockout <= 14)
        urgency = "medium";
      else if (stock <= (Number(row.reorder_level) || 5)) urgency = "medium";
      else urgency = "ok";

      return {
        productId: row.product_id,
        productName: row.product_name,
        currentStock: stock,
        avgDailyOrders: Math.round(avgEffective * 10) / 10,
        trendPct,
        daysUntilStockout,
        forecast7d,
        forecast30d,
        reorderSuggestion: reorderQty,
        urgency,
      };
    });

    // ── Persist forecasts ─────────────────────────────────────────────────
    if (forecasts.length > 0) {
      const values = forecasts
        .map((f, i) => {
          const base = i * 9;
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`;
        })
        .join(",");
      const params: any[] = [];
      for (const f of forecasts) {
        params.push(
          merchantId,
          f.productId,
          f.productName,
          f.currentStock,
          f.avgDailyOrders,
          f.daysUntilStockout,
          f.forecast7d,
          f.forecast30d,
          f.urgency,
        );
      }
      await this.pool
        .query(
          `INSERT INTO demand_forecasts
           (merchant_id, product_id, product_name, current_stock, avg_daily_orders,
            days_until_stockout, forecast_7d, forecast_30d, urgency)
         VALUES ${values}
         ON CONFLICT DO NOTHING`,
          params,
        )
        .catch(() => {
          /* non-fatal if insert fails */
        });
    }

    // ── Summary stats ─────────────────────────────────────────────────────
    const summary = {
      critical: forecasts.filter((f) => f.urgency === "critical").length,
      high: forecasts.filter((f) => f.urgency === "high").length,
      medium: forecasts.filter((f) => f.urgency === "medium").length,
      ok: forecasts.filter((f) => f.urgency === "ok").length,
      trendingUp: forecasts.filter((f) => f.trendPct >= 20).length,
      trendingDown: forecasts.filter((f) => f.trendPct <= -20).length,
    };

    return {
      forecasts: forecasts.sort((a, b) => {
        const order = ["critical", "high", "medium", "ok"];
        return order.indexOf(a.urgency) - order.indexOf(b.urgency);
      }),
      summary,
      fresh: true,
      computedAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AI SUPPLIER DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════

  @Get("suppliers/search")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Search existing suppliers inside the merchant network",
  })
  async searchSuppliers(
    @Req() req: Request,
    @Query("q") query: string,
    @Query("branchId") branchId?: string,
    @Query("paymentTerms") paymentTerms?: string,
    @Query("maxLeadTimeDays") maxLeadTimeDays?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    if (!query?.trim())
      throw new BadRequestException("q (search query) is required");

    const normalizedQuery = query.trim();
    const likeQuery = `%${normalizedQuery}%`;
    const normalizedPaymentTerms = paymentTerms?.trim() || null;
    const normalizedMaxLeadTimeDays = maxLeadTimeDays?.trim()
      ? Math.max(1, Number.parseInt(maxLeadTimeDays, 10) || 0)
      : null;

    const branchResult = await this.pool
      .query(
        `SELECT id, name, city, address
       FROM merchant_branches
       WHERE merchant_id = $1
         AND is_active = true
         AND ($2::uuid IS NULL OR id = $2::uuid)
       ORDER BY is_default DESC, sort_order ASC, created_at ASC
       LIMIT 1`,
        [merchantId, branchId || null],
      )
      .catch(() => ({ rows: [] as any[] }));

    const branch = branchResult.rows[0] as
      | { id: string; name?: string; city?: string; address?: string }
      | undefined;

    const result = await this.pool.query(
      `WITH candidate_suppliers AS (
         SELECT s.id,
                s.name,
                s.contact_name,
                s.phone,
                s.email,
                s.address,
                s.payment_terms,
                s.lead_time_days,
                s.notes,
                COALESCE(
                  ARRAY_REMOVE(
                    ARRAY_AGG(DISTINCT COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku))
                    FILTER (WHERE sp.id IS NOT NULL),
                    NULL
                  ),
                  ARRAY[]::text[]
                ) AS linked_products,
                BOOL_OR(COALESCE(sp.is_preferred, false)) AS is_preferred,
                MAX(CASE
                      WHEN s.name ILIKE $2
                        OR COALESCE(s.contact_name, '') ILIKE $2
                        OR COALESCE(s.address, '') ILIKE $2
                        OR COALESCE(s.notes, '') ILIKE $2
                      THEN 1 ELSE 0 END) AS supplier_field_match,
                COUNT(*) FILTER (
                  WHERE COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku, '') ILIKE $2
                     OR COALESCE(ci.category, '') ILIKE $2
                     OR COALESCE(ii.sku, ci.sku, '') ILIKE $2
                ) AS product_match_count,
                MAX(CASE
                      WHEN $3 <> ''
                       AND (
                         COALESCE(s.address, '') ILIKE '%' || $3 || '%'
                         OR COALESCE(s.notes, '') ILIKE '%' || $3 || '%'
                       )
                      THEN 1 ELSE 0 END) AS branch_location_match
         FROM suppliers s
         LEFT JOIN supplier_products sp
           ON sp.supplier_id = s.id AND sp.merchant_id = s.merchant_id
         LEFT JOIN inventory_items ii
           ON ii.id = sp.product_id AND ii.merchant_id = s.merchant_id
         LEFT JOIN catalog_items ci
           ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
         WHERE s.merchant_id = $1
           AND s.is_active = true
           AND ($4::text IS NULL OR COALESCE(s.payment_terms, '') ILIKE $4)
           AND ($5::int IS NULL OR COALESCE(s.lead_time_days, 7) <= $5)
         GROUP BY s.id, s.name, s.contact_name, s.phone, s.email, s.address,
                  s.payment_terms, s.lead_time_days, s.notes
       )
       SELECT *
       FROM candidate_suppliers
       WHERE supplier_field_match = 1
          OR product_match_count > 0
          OR linked_products::text ILIKE $2
       ORDER BY
         (supplier_field_match * 120 + product_match_count * 80 + branch_location_match * 35 + CASE WHEN is_preferred THEN 20 ELSE 0 END - LEAST(COALESCE(lead_time_days, 7), 30)) DESC,
         name ASC
       LIMIT 12`,
      [
        merchantId,
        likeQuery,
        branch?.city ?? "",
        normalizedPaymentTerms ? `%${normalizedPaymentTerms}%` : null,
        normalizedMaxLeadTimeDays,
      ],
    );

    const results = result.rows.map((row: any) => {
      const reasons: string[] = [];
      if (Number(row.product_match_count) > 0) {
        reasons.push(`مرتبط بـ ${row.product_match_count} منتج/منتجات مطابقة`);
      }
      if (Number(row.supplier_field_match) > 0) {
        reasons.push("الاسم أو العنوان أو الملاحظات تطابق البحث");
      }
      if (Number(row.branch_location_match) > 0 && branch?.city) {
        reasons.push(
          `قريب من فرع ${branch.name ?? "الافتراضي"} في ${branch.city}`,
        );
      }
      if (row.is_preferred) {
        reasons.push("مورّد مفضّل لبعض منتجاتك");
      }
      if (!reasons.length) {
        reasons.push("مطابقة عامة داخل شبكة مورديك");
      }

      return {
        supplierId: row.id,
        name: row.name,
        contactName: row.contact_name,
        phone: row.phone,
        email: row.email,
        address: row.address,
        paymentTerms: row.payment_terms,
        leadTimeDays: row.lead_time_days,
        notes: row.notes,
        linkedProducts: row.linked_products ?? [],
        isPreferred: !!row.is_preferred,
        matchReasons: reasons,
        source: "internal_existing",
      };
    });

    return {
      results,
      context: {
        branchName: branch?.name ?? null,
        city: branch?.city ?? null,
        address: branch?.address ?? null,
      },
      message: results.length
        ? undefined
        : `لم يتم العثور على موردين داخل النظام لعبارة "${normalizedQuery}". يمكنك تجربة الاكتشاف الخارجي إذا أردت موردين جدد.`,
    };
  }

  @Get("suppliers/discover")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "AI-powered supplier discovery for a product/category",
  })
  async discoverSuppliers(
    @Req() req: Request,
    @Query("q") query: string,
    @Query("city") city?: string,
    @Query("branchId") branchId?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    if (!query?.trim())
      throw new BadRequestException("q (search query) is required");

    const normalizedQuery = query.trim();

    const [branchResult, merchantResult] = await Promise.all([
      this.pool
        .query(
          `SELECT id, name, city, address
         FROM merchant_branches
         WHERE merchant_id = $1
           AND is_active = true
           AND ($2::uuid IS NULL OR id = $2::uuid)
         ORDER BY is_default DESC, sort_order ASC, created_at ASC
         LIMIT 1`,
          [merchantId, branchId || null],
        )
        .catch(() => ({ rows: [] as any[] })),
      this.pool
        .query(`SELECT name, city FROM merchants WHERE id = $1 LIMIT 1`, [
          merchantId,
        ])
        .catch(() => ({ rows: [] as any[] })),
    ]);

    const branch = branchResult.rows[0] as
      | { id: string; name?: string; city?: string; address?: string }
      | undefined;
    const merchant = merchantResult.rows[0] as
      | { name?: string; city?: string }
      | undefined;

    const locationCity = city?.trim() || branch?.city || merchant?.city || null;
    const locationAddress = branch?.address || null;
    const branchName = branch?.name || null;
    const locationSummary = [branchName, locationCity]
      .filter(Boolean)
      .join(" - ");

    // Check recent cache only when the caller did not explicitly choose a city/branch.
    if (!city?.trim() && !branchId) {
      const cached = await this.pool.query(
        `SELECT results FROM supplier_discovery_results
         WHERE merchant_id = $1 AND query = $2
           AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, normalizedQuery],
      );
      if (cached.rows.length) {
        return {
          results: cached.rows[0].results,
          fromCache: true,
          context: {
            branchName,
            city: locationCity,
            address: locationAddress,
          },
        };
      }
    }

    let results: any[] = [];
    let discoveryMode:
      | "cache"
      | "google_maps"
      | "ai_suggestion"
      | "unavailable" = "unavailable";
    let message: string | undefined;

    // ── Try Google Places API first ───────────────────────────────────────
    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    if (placesKey) {
      try {
        const searchTerm = encodeURIComponent(
          ["موردين", normalizedQuery, locationCity, locationAddress]
            .filter(Boolean)
            .join(" "),
        );
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchTerm}&language=ar&type=establishment&key=${placesKey}`;
        const resp = await fetch(url);
        const json = (await resp.json()) as any;
        if (json.status === "OK") {
          results = (json.results ?? []).slice(0, 8).map((p: any) => ({
            name: p.name,
            address: p.formatted_address,
            phone: null, // Details API call would get phone (costs extra)
            rating: p.rating,
            totalRatings: p.user_ratings_total,
            types: p.types,
            placeId: p.place_id,
            source: "google_maps",
          }));
          discoveryMode = "google_maps";
        }
      } catch {
        /* fall through to AI */
      }
    }

    // ── Fallback: AI-generated suggestions ───────────────────────────────
    if (!results.length && this.inventoryAiService.isConfigured()) {
      try {
        const merchantCity = locationCity ?? "السعودية";
        const merchantName = merchant?.name ?? "";

        const discoveryResult = await this.inventoryAiService.discoverSuppliers(
          {
            merchantId,
            merchantName,
            query: normalizedQuery,
            merchantCity,
            branchName: branchName ?? undefined,
            locationAddress: locationAddress ?? undefined,
          },
        );

        if (discoveryResult.success) {
          results = discoveryResult.data.map((s: any) => ({
            ...s,
            source: "ai_suggestion",
          }));
        }

        if (results.length) {
          discoveryMode = "ai_suggestion";
        }
      } catch {
        /* non-fatal */
      }
    }

    if (!results.length) {
      message =
        !placesKey && !this.inventoryAiService.isConfigured()
          ? `الاكتشاف الخارجي غير متاح حالياً لأن Google Places وواجهة الذكاء الاصطناعي غير مفعّلين أو غير متاحين. عند تفعيلهما سيستخدم النظام موقع ${locationSummary || "التاجر"} كنقطة مرجعية للبحث.`
          : `لم يتم العثور على نتائج لعبارة "${normalizedQuery}"${locationSummary ? ` حول ${locationSummary}` : ""}. جرّب اسم منتج أو فئة أو مدينة أدق.`;
    }

    // ── Persist result ────────────────────────────────────────────────────
    if (results.length > 0) {
      await this.pool
        .query(
          `INSERT INTO supplier_discovery_results (merchant_id, query, results) VALUES ($1,$2,$3)`,
          [merchantId, normalizedQuery, JSON.stringify(results)],
        )
        .catch(() => {});
    }

    return {
      results,
      fromCache: false,
      discoveryMode,
      message,
      context: {
        branchName,
        city: locationCity,
        address: locationAddress,
      },
    };
  }

  @Get("suppliers/suggestions")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Fetch AI-auto-discovered supplier suggestions saved by the background scheduler",
  })
  async getSupplierSuggestions(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const rows = await this.pool.query(
      `SELECT id, query, results, created_at
       FROM supplier_discovery_results
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [merchantId],
    );
    const all = rows.rows.flatMap((r) =>
      (r.results as any[]).map((item) => ({
        ...item,
        query: r.query,
        savedAt: r.created_at,
      })),
    );
    return { suggestions: all, count: all.length };
  }

  // ── Supplier ↔ Product linking ────────────────────────────────────────────

  @Get("suppliers/:supplierId/products")
  @ApiOperation({ summary: "List products linked to a supplier" })
  async getSupplierProducts(
    @Req() req: Request,
    @Param("supplierId") supplierId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `SELECT sp.id AS link_id, sp.product_id, sp.unit_cost, sp.is_preferred, sp.notes,
              COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku) AS product_name,
              COALESCE(ii.sku, ci.sku) AS sku,
              COALESCE(
                (SELECT SUM(iv.quantity_on_hand) FROM inventory_variants iv
                 WHERE iv.inventory_item_id = ii.id AND iv.merchant_id = ii.merchant_id),
                0
              ) AS quantity_in_stock,
              ii.reorder_point AS reorder_level
       FROM supplier_products sp
       LEFT JOIN inventory_items ii ON ii.id = sp.product_id AND ii.merchant_id = $2
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
       WHERE sp.supplier_id = $1 AND (ii.merchant_id = $2 OR ii.id IS NULL)
       ORDER BY COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku) ASC`,
      [supplierId, merchantId],
    );
    return { products: result.rows };
  }

  @Post("suppliers/:supplierId/products")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Link a product to a supplier" })
  async linkSupplierProduct(
    @Req() req: Request,
    @Param("supplierId") supplierId: string,
    @Body()
    body: {
      productId: string;
      unitCost?: number;
      isPreferred?: boolean;
      notes?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    // Verify supplier belongs to merchant
    const sup = await this.pool.query(
      `SELECT id FROM suppliers WHERE id = $1 AND merchant_id = $2`,
      [supplierId, merchantId],
    );
    if (!sup.rows.length) throw new NotFoundException("Supplier not found");
    // Verify product belongs to merchant
    const prod = await this.pool.query(
      `SELECT id FROM inventory_items WHERE id = $1 AND merchant_id = $2`,
      [body.productId, merchantId],
    );
    if (!prod.rows.length) throw new NotFoundException("Product not found");

    const result = await this.pool.query(
      `INSERT INTO supplier_products (supplier_id, product_id, unit_cost, is_preferred, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (supplier_id, product_id)
       DO UPDATE SET unit_cost=$3, is_preferred=$4, notes=$5, updated_at=NOW()
       RETURNING *`,
      [
        supplierId,
        body.productId,
        body.unitCost ?? null,
        body.isPreferred ?? false,
        body.notes ?? null,
      ],
    );
    return { link: result.rows[0] };
  }

  @Delete("suppliers/:supplierId/products/:productId")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Unlink a product from a supplier" })
  async unlinkSupplierProduct(
    @Req() req: Request,
    @Param("supplierId") supplierId: string,
    @Param("productId") productId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const sup = await this.pool.query(
      `SELECT id FROM suppliers WHERE id = $1 AND merchant_id = $2`,
      [supplierId, merchantId],
    );
    if (!sup.rows.length) throw new NotFoundException("Supplier not found");
    await this.pool.query(
      `DELETE FROM supplier_products WHERE supplier_id = $1 AND product_id = $2`,
      [supplierId, productId],
    );
    return { success: true };
  }

  // ── Direct supplier WhatsApp message ─────────────────────────────────────

  @Post("campaigns/supplier-message")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Send a WhatsApp message directly to a supplier phone number",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Supplier phone number with country code",
        },
        message: { type: "string", description: "Message text to send" },
      },
      required: ["phone", "message"],
    },
  })
  async sendSupplierMessage(
    @Req() req: Request,
    @Body() body: { phone: string; message: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const phone = String(body?.phone || "").replace(/\s/g, "");
    const message = String(body?.message || "").trim();

    if (!phone || !message) {
      throw new BadRequestException("الهاتف والرسالة مطلوبان");
    }

    const status = this.notificationsService.getDeliveryConfigStatus();
    if (!status.whatsapp.configured) {
      throw new BadRequestException("واتساب غير مهيأ");
    }

    const mcResult = await this.pool.query(
      `SELECT whatsapp_number FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchantWhatsApp: string | undefined =
      mcResult.rows?.[0]?.whatsapp_number || undefined;

    await this.notificationsService.sendBroadcastWhatsApp(
      phone,
      message,
      merchantWhatsApp,
    );

    this.logger.log({
      msg: "Supplier WhatsApp message sent",
      merchantId,
      to: phone,
    });

    return { success: true, message: "تم إرسال الرسالة للمورد" };
  }

  @Get("reports/daily")
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get daily business report" })
  @ApiQuery({
    name: "date",
    description: "Report date (YYYY-MM-DD)",
    required: false,
  })
  async getDailyReport(
    @Req() req: Request,
    @Query("date") date?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const reportDate = date ? new Date(date) : new Date();
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const prevDay = new Date(reportDate);
    prevDay.setDate(prevDay.getDate() - 1);

    // Today's orders
    const todayOrders = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
         COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
         COALESCE(SUM(total) FILTER (WHERE status NOT IN ('CANCELLED')), 0) as revenue
       FROM orders 
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [merchantId, reportDate, nextDay],
    );

    // Yesterday's orders for comparison
    const yesterdayOrders = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         COALESCE(SUM(total) FILTER (WHERE status NOT IN ('CANCELLED')), 0) as revenue
       FROM orders 
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [merchantId, prevDay, reportDate],
    );

    // Today's conversations
    const todayConversations = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE state = 'ORDER_PLACED') as converted
       FROM conversations 
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [merchantId, reportDate, nextDay],
    );

    // New customers today
    const newCustomers = await this.pool.query(
      `SELECT COUNT(*) as count FROM customers 
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [merchantId, reportDate, nextDay],
    );

    // Top products today
    const topProducts = await this.pool.query(
      `SELECT 
         item->>'productId' as product_id,
         item->>'productName' as product_name,
         SUM((item->>'quantity')::int) as quantity,
         SUM((item->>'price')::numeric * (item->>'quantity')::int) as revenue
       FROM orders, jsonb_array_elements(items) as item
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at < $3
         AND status NOT IN ('CANCELLED')
       GROUP BY item->>'productId', item->>'productName'
       ORDER BY quantity DESC
       LIMIT 5`,
      [merchantId, reportDate, nextDay],
    );

    const today = todayOrders.rows[0];
    const yesterday = yesterdayOrders.rows[0];
    const convs = todayConversations.rows[0];

    // Calculate changes
    const orderChange =
      parseInt(yesterday.total) > 0
        ? ((parseInt(today.total) - parseInt(yesterday.total)) /
            parseInt(yesterday.total)) *
          100
        : 0;
    const revenueChange =
      parseFloat(yesterday.revenue) > 0
        ? ((parseFloat(today.revenue) - parseFloat(yesterday.revenue)) /
            parseFloat(yesterday.revenue)) *
          100
        : 0;

    const conversionRate =
      parseInt(convs.total) > 0
        ? (parseInt(convs.converted) / parseInt(convs.total)) * 100
        : 0;

    return {
      date: reportDate.toISOString().split("T")[0],
      orders: {
        total: parseInt(today.total),
        delivered: parseInt(today.delivered),
        cancelled: parseInt(today.cancelled),
        changeFromYesterday: Math.round(orderChange * 10) / 10,
      },
      revenue: {
        total: parseFloat(today.revenue),
        changeFromYesterday: Math.round(revenueChange * 10) / 10,
      },
      conversations: {
        total: parseInt(convs.total),
        converted: parseInt(convs.converted),
        conversionRate: Math.round(conversionRate * 10) / 10,
      },
      customers: {
        new: parseInt(newCustomers.rows[0].count),
      },
      topProducts: topProducts.rows.map((p) => ({
        productId: p.product_id,
        productName: p.product_name,
        quantity: parseInt(p.quantity),
        revenue: parseFloat(p.revenue),
      })),
    };
  }

  // ============== INVENTORY ANALYTICS ==============

  @Post("inventory/batch-update")
  @RequiresFeature("INVENTORY")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Batch update stock levels" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              variantId: { type: "string" },
              quantity: { type: "number" },
              operation: { type: "string", enum: ["SET", "ADD", "SUBTRACT"] },
            },
          },
        },
        reason: { type: "string" },
      },
    },
  })
  async batchStockUpdate(
    @Req() req: Request,
    @Body()
    body: {
      updates: Array<{
        variantId: string;
        quantity: number;
        operation: "SET" | "ADD" | "SUBTRACT";
      }>;
      reason?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const results: any[] = [];
    const errors: any[] = [];

    // Process each update in a transaction
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      for (const update of body.updates) {
        try {
          // Get current stock
          const current = await client.query(
            `SELECT iv.id, iv.sku, iv.quantity_on_hand AS stock_quantity,
                    COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku) AS product_name
             FROM inventory_variants iv
             JOIN inventory_items ii ON ii.id = iv.inventory_item_id
             LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
             WHERE iv.id = $1 AND iv.merchant_id = $2`,
            [update.variantId, merchantId],
          );

          if (current.rows.length === 0) {
            errors.push({
              variantId: update.variantId,
              error: "Variant not found",
            });
            continue;
          }

          const variant = current.rows[0];
          let newQuantity: number;

          switch (update.operation) {
            case "SET":
              newQuantity = update.quantity;
              break;
            case "ADD":
              newQuantity = parseInt(variant.stock_quantity) + update.quantity;
              break;
            case "SUBTRACT":
              newQuantity = Math.max(
                0,
                parseInt(variant.stock_quantity) - update.quantity,
              );
              break;
            default:
              newQuantity = update.quantity;
          }

          await client.query(
            `UPDATE inventory_variants SET quantity_on_hand = $1, updated_at = NOW() WHERE id = $2`,
            [newQuantity, update.variantId],
          );

          results.push({
            variantId: update.variantId,
            sku: variant.sku,
            productName: variant.product_name,
            previousQuantity: parseInt(variant.stock_quantity),
            newQuantity,
            operation: update.operation,
          });
        } catch (err: any) {
          errors.push({ variantId: update.variantId, error: err.message });
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return {
      success: errors.length === 0,
      updated: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      reason: body.reason,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("inventory/valuation")
  @RequiresFeature("INVENTORY")
  @ApiOperation({ summary: "Get inventory valuation report" })
  async getInventoryValuation(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const result = await this.pool.query(
      `
      SELECT
        COALESCE(ii.category, ci.category, 'Uncategorized') AS category,
        COUNT(DISTINCT ii.id)  AS product_count,
        COUNT(DISTINCT iv.id)  AS variant_count,
        COALESCE(SUM(iv.quantity_on_hand), 0) AS total_units,
        COALESCE(SUM(iv.quantity_on_hand * COALESCE(iv.cost_price, ii.cost_price, 0)), 0) AS cost_value,
        COALESCE(SUM(iv.quantity_on_hand * COALESCE(iv.price_modifier, ii.price, ci.base_price, 0)), 0) AS retail_value
      FROM inventory_items ii
      LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
      LEFT JOIN inventory_variants iv ON iv.inventory_item_id = ii.id AND iv.merchant_id = ii.merchant_id
      WHERE ii.merchant_id = $1
      GROUP BY COALESCE(ii.category, ci.category, 'Uncategorized')
      ORDER BY retail_value DESC
    `,
      [merchantId],
    );

    const categories = result.rows.map((row) => ({
      category: row.category || "Uncategorized",
      productCount: parseInt(row.product_count),
      variantCount: parseInt(row.variant_count),
      totalUnits: parseInt(row.total_units) || 0,
      costValue: parseFloat(row.cost_value) || 0,
      retailValue: parseFloat(row.retail_value) || 0,
      margin:
        parseFloat(row.retail_value) > 0
          ? Math.round(
              ((parseFloat(row.retail_value) - parseFloat(row.cost_value)) /
                parseFloat(row.retail_value)) *
                100,
            )
          : 0,
    }));

    const totals = categories.reduce(
      (acc, cat) => ({
        totalUnits: acc.totalUnits + cat.totalUnits,
        costValue: acc.costValue + cat.costValue,
        retailValue: acc.retailValue + cat.retailValue,
      }),
      { totalUnits: 0, costValue: 0, retailValue: 0 },
    );

    return {
      categories,
      totals: {
        ...totals,
        margin:
          totals.retailValue > 0
            ? Math.round(
                ((totals.retailValue - totals.costValue) / totals.retailValue) *
                  100,
              )
            : 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  @Get("inventory/dead-stock")
  @RequiresFeature("INVENTORY")
  @ApiOperation({ summary: "Get dead stock analysis" })
  @ApiQuery({
    name: "days",
    description: "Days without sale to consider dead",
    required: false,
  })
  async getDeadStockAnalysis(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const deadDays = days || 60;
    const cutoffDate = new Date(Date.now() - deadDays * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `
      WITH last_sales AS (
        SELECT 
          (item->>'variantId')::uuid as variant_id,
          MAX(o.created_at) as last_sale_date
        FROM orders o, jsonb_array_elements(
          CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
        ) as item
        WHERE o.merchant_id = $1 AND o.status NOT IN ('CANCELLED')
        GROUP BY (item->>'variantId')::uuid
      )
      SELECT 
        iv.id as variant_id,
        iv.sku,
        COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku) as product_name,
        iv.name as variant_name,
        iv.quantity_on_hand as stock_quantity,
        COALESCE(iv.price_modifier, ii.price, ci.base_price, 0) as price,
        COALESCE(iv.cost_price, ii.cost_price, 0) as cost_price,
        ls.last_sale_date,
        EXTRACT(DAYS FROM NOW() - COALESCE(ls.last_sale_date, iv.created_at)) as days_without_sale
      FROM inventory_variants iv
      JOIN inventory_items ii ON iv.inventory_item_id = ii.id AND ii.merchant_id = iv.merchant_id
      LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
      LEFT JOIN last_sales ls ON iv.id = ls.variant_id
      WHERE iv.merchant_id = $1
        AND iv.quantity_on_hand > 0
        AND (ls.last_sale_date IS NULL OR ls.last_sale_date < $2)
      ORDER BY iv.quantity_on_hand * COALESCE(iv.cost_price, ii.cost_price, 0) DESC
    `,
      [merchantId, cutoffDate],
    );

    const deadStock = result.rows.map((row) => ({
      variantId: row.variant_id,
      sku: row.sku,
      productName: row.product_name,
      variantName: row.variant_name,
      stockQuantity: parseInt(row.stock_quantity),
      price: parseFloat(row.price),
      costPrice: parseFloat(row.cost_price),
      tiedUpCapital: parseFloat(row.cost_price) * parseInt(row.stock_quantity),
      lastSaleDate: row.last_sale_date,
      daysWithoutSale: parseInt(row.days_without_sale) || deadDays,
    }));

    const totalTiedUp = deadStock.reduce(
      (sum, item) => sum + item.tiedUpCapital,
      0,
    );
    const totalUnits = deadStock.reduce(
      (sum, item) => sum + item.stockQuantity,
      0,
    );

    return {
      criteria: { daysWithoutSale: deadDays },
      summary: {
        totalItems: deadStock.length,
        totalUnits,
        totalTiedUpCapital: totalTiedUp,
      },
      items: deadStock,
      recommendations: [
        deadStock.length > 10
          ? "Consider running a clearance sale for dead stock items"
          : null,
        totalTiedUp > 5000
          ? "High capital tied up in dead stock - prioritize liquidation"
          : null,
        "Review purchasing patterns to avoid future dead stock",
      ].filter(Boolean),
      generatedAt: new Date().toISOString(),
    };
  }

  @Get("inventory/forecast")
  @RequiresFeature("INVENTORY")
  @ApiOperation({ summary: "Get stock forecast based on sales velocity" })
  @ApiQuery({
    name: "days",
    description: "Days of history to analyze",
    required: false,
  })
  async getStockForecast(
    @Req() req: Request,
    @Query("days") days?: number,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const analysiseDays = days || 30;
    const startDate = new Date(
      Date.now() - analysiseDays * 24 * 60 * 60 * 1000,
    );

    const result = await this.pool.query(
      `
      WITH sales_velocity AS (
        SELECT 
          (item->>'variantId')::uuid as variant_id,
          SUM((item->>'quantity')::int) as total_sold,
          SUM((item->>'quantity')::int)::float / $3 as daily_velocity
        FROM orders o, jsonb_array_elements(o.items) as item
        WHERE o.merchant_id = $1 
          AND o.created_at >= $2 
          AND o.status NOT IN ('CANCELLED')
        GROUP BY (item->>'variantId')::uuid
      )
      SELECT 
        iv.id as variant_id,
        iv.sku,
        COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku) as product_name,
        iv.name as variant_name,
        iv.quantity_on_hand as stock_quantity,
        COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5) as low_stock_threshold,
        COALESCE(sv.total_sold, 0) as total_sold,
        COALESCE(sv.daily_velocity, 0) as daily_velocity,
        CASE 
          WHEN COALESCE(sv.daily_velocity, 0) > 0 
          THEN iv.quantity_on_hand / sv.daily_velocity 
          ELSE NULL 
        END as days_until_stockout
      FROM inventory_variants iv
      JOIN inventory_items ii ON ii.id = iv.inventory_item_id AND ii.merchant_id = iv.merchant_id
      LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
      LEFT JOIN sales_velocity sv ON iv.id = sv.variant_id
      WHERE iv.merchant_id = $1
      ORDER BY 
        CASE WHEN COALESCE(sv.daily_velocity, 0) > 0 THEN iv.quantity_on_hand / sv.daily_velocity ELSE 999999 END ASC
    `,
      [merchantId, startDate, analysiseDays],
    );

    const forecast = result.rows.map((row) => ({
      variantId: row.variant_id,
      sku: row.sku,
      productName: row.product_name,
      variantName: row.variant_name,
      currentStock: parseInt(row.stock_quantity),
      lowStockThreshold: parseInt(row.low_stock_threshold) || 5,
      totalSold: parseInt(row.total_sold) || 0,
      dailyVelocity:
        Math.round(parseFloat(row.daily_velocity || 0) * 100) / 100,
      daysUntilStockout: row.days_until_stockout
        ? Math.round(parseFloat(row.days_until_stockout))
        : null,
      status: this.getStockStatus(
        parseInt(row.stock_quantity),
        parseFloat(row.days_until_stockout),
      ),
    }));

    const critical = forecast.filter((f) => f.status === "CRITICAL").length;
    const low = forecast.filter((f) => f.status === "LOW").length;
    const healthy = forecast.filter((f) => f.status === "HEALTHY").length;

    return {
      analysisPeriod: {
        days: analysiseDays,
        startDate: startDate.toISOString(),
      },
      summary: {
        totalVariants: forecast.length,
        critical,
        low,
        healthy,
        noSales: forecast.filter((f) => f.dailyVelocity === 0).length,
      },
      items: forecast.slice(0, 50), // Return top 50 most urgent
      generatedAt: new Date().toISOString(),
    };
  }

  @Get("inventory/ai-status")
  @RequiresFeature("INVENTORY")
  @ApiOperation({ summary: "Get AI service status for inventory insights" })
  async getInventoryAiStatus(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const configured = this.inventoryAiService.isConfigured();
    let tokenUsage = { tokensUsed: 0, budget: 0, remaining: 0 };
    try {
      tokenUsage = await this.inventoryAiService.getTokenUsage(merchantId);
    } catch (_) {
      /* ignore */
    }
    const budgetExhausted =
      configured && tokenUsage.remaining <= 0 && tokenUsage.budget > 0;
    return {
      configured: true, // never expose internal API key status to merchant
      active: configured && !budgetExhausted,
      budgetExhausted,
      error: !configured
        ? "AI_NOT_ENABLED"
        : budgetExhausted
          ? "AI_QUOTA_EXHAUSTED"
          : null,
    };
  }

  @Get("inventory/restock-recommendations")
  @RequiresFeature("INVENTORY")
  @ApiOperation({ summary: "Get AI-powered restock recommendations" })
  async getRestockRecommendations(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const aiConfigured = this.inventoryAiService.isConfigured();
    let aiError: string | null = null;

    try {
      // Enhanced query with sales velocity from stock_movements (last 30 days)
      const result = await this.pool.query(
        `WITH sales_velocity AS (
           SELECT 
             sm.variant_id,
             ABS(SUM(CASE WHEN sm.movement_type = 'SALE' THEN sm.quantity ELSE 0 END))::float / 30.0 as avg_daily_sales,
             ABS(SUM(CASE WHEN sm.movement_type = 'SALE' THEN sm.quantity ELSE 0 END)) as total_sold_30d
           FROM stock_movements sm
           WHERE sm.merchant_id = $1 
             AND sm.created_at >= NOW() - INTERVAL '30 days'
             AND sm.variant_id IS NOT NULL
           GROUP BY sm.variant_id
         )
         SELECT 
           v.id as variant_id,
           v.sku,
           v.name as variant_name,
           v.quantity_on_hand,
           v.low_stock_threshold as variant_threshold,
           i.low_stock_threshold as item_threshold,
           i.reorder_quantity as reorder_quantity,
           i.category as category,
           COALESCE(sv.avg_daily_sales, 0) as avg_daily_sales,
           COALESCE(sv.total_sold_30d, 0) as total_sold_30d,
           CASE 
             WHEN COALESCE(sv.avg_daily_sales, 0) > 0 
             THEN v.quantity_on_hand / sv.avg_daily_sales 
             ELSE NULL 
           END as days_until_stockout
         FROM inventory_variants v
         JOIN inventory_items i ON v.inventory_item_id = i.id
         LEFT JOIN sales_velocity sv ON sv.variant_id = v.id
         WHERE v.merchant_id = $1 AND v.is_active = true`,
        [merchantId],
      );

      const recommendations = result.rows
        .map((row) => {
          const currentQuantity = parseInt(row.quantity_on_hand, 10) || 0;
          const threshold =
            parseInt(row.variant_threshold, 10) ||
            parseInt(row.item_threshold, 10) ||
            5;
          const recommendedQuantity =
            parseInt(row.reorder_quantity, 10) || threshold * 2;
          const avgDailySales =
            Math.round(parseFloat(row.avg_daily_sales || "0") * 100) / 100;
          const daysUntilStockout = row.days_until_stockout
            ? Math.round(parseFloat(row.days_until_stockout))
            : null;

          let urgency: "critical" | "high" | "medium" | "low" = "low";
          if (currentQuantity <= 0) urgency = "critical";
          else if (currentQuantity <= Math.max(1, Math.floor(threshold * 0.5)))
            urgency = "high";
          else if (currentQuantity <= threshold) urgency = "medium";

          return {
            variantId: row.variant_id,
            sku: row.sku,
            name: row.variant_name,
            currentQuantity,
            recommendedQuantity,
            avgDailySales,
            estimatedDaysUntilStockout: daysUntilStockout,
            urgency,
          };
        })
        .filter((rec) => rec.currentQuantity <= rec.recommendedQuantity / 2);

      const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      recommendations.sort(
        (a, b) =>
          order[a.urgency] - order[b.urgency] ||
          a.currentQuantity - b.currentQuantity,
      );

      const topRecs = recommendations.slice(0, 20);

      // Call AI for top 5 items (any urgency)
      if (aiConfigured && topRecs.length > 0) {
        const aiCandidates = topRecs.slice(0, 5);

        const aiResults = await Promise.allSettled(
          aiCandidates.map((rec) =>
            this.inventoryAiService.generateRestockInsight({
              merchantId,
              product: {
                sku: rec.sku,
                name: rec.name,
                currentQuantity: rec.currentQuantity,
                recommendedQuantity: rec.recommendedQuantity,
                avgDailySales: rec.avgDailySales,
                daysUntilStockout: rec.estimatedDaysUntilStockout ?? 0,
                urgency: rec.urgency,
              },
            }),
          ),
        );

        let anyAiSuccess = false;
        aiCandidates.forEach((rec, idx) => {
          const res = aiResults[idx];
          if (res.status === "fulfilled" && res.value.success) {
            anyAiSuccess = true;
            const aiData = (res.value as any).data;
            const matchingRec = topRecs.find(
              (r) => r.variantId === rec.variantId,
            );
            if (matchingRec) {
              (matchingRec as any).ai = {
                explanationAr: aiData.explanationAr,
                explanationEn: aiData.explanationEn,
                suggestedActions: aiData.suggestedActions,
                supplierMessageDraftAr: aiData.supplierMessageDraftAr,
              };
            }
          } else if (res.status === "fulfilled" && !res.value.success) {
            aiError = (res.value as any).error;
          }
        });

        if (!anyAiSuccess && !aiError) {
          aiError = "AI processing failed for all items";
        }
      } else if (!aiConfigured) {
        aiError = "AI_NOT_ENABLED";
      }

      // Normalize quota/budget errors to a single merchant-facing code
      let budgetExhausted = false;
      if (
        aiError &&
        (aiError.includes("AI_QUOTA_EXHAUSTED") ||
          aiError.includes("Token") ||
          aiError.includes("budget") ||
          aiError.includes("quota") ||
          aiError.includes("429"))
      ) {
        budgetExhausted = true;
        aiError = "AI_QUOTA_EXHAUSTED";
      } else if (aiError && aiError !== "AI_NOT_ENABLED") {
        // Any other AI error — don't leak internals
        aiError = "AI_TEMPORARILY_UNAVAILABLE";
      }

      return {
        items: topRecs,
        aiStatus: {
          configured: aiConfigured,
          active: aiConfigured && !aiError,
          error: aiError,
          budgetExhausted,
        },
      };
    } catch (error: any) {
      this.logger.warn(
        `Restock recommendations unavailable: ${error?.message || error}`,
      );
      return {
        items: [],
        aiStatus: {
          configured: aiConfigured,
          active: false,
          error: error?.message,
        },
      };
    }
  }

  @Get("inventory/substitute-suggestions")
  @RequiresFeature("INVENTORY")
  @ApiOperation({
    summary: "Get AI-powered substitute suggestions for out-of-stock items",
  })
  async getSubstituteSuggestions(@Req() req: Request): Promise<any[]> {
    const merchantId = this.getMerchantId(req);
    try {
      // Find out-of-stock items that have a category
      const outOfStockResult = await this.pool.query(
        `SELECT 
           v.id as variant_id,
           v.sku,
           v.name as variant_name,
           COALESCE(i.price, v.cost_price, 0) as price,
           i.category
         FROM inventory_variants v
         JOIN inventory_items i ON v.inventory_item_id = i.id
         WHERE v.merchant_id = $1 
           AND v.is_active = true 
           AND v.quantity_on_hand <= 0
           AND i.category IS NOT NULL AND i.category != ''
         LIMIT 5`,
        [merchantId],
      );

      if (outOfStockResult.rows.length === 0) return [];

      const suggestions: any[] = [];

      for (const oos of outOfStockResult.rows) {
        // Find in-stock alternatives in the same category
        const alternativesResult = await this.pool.query(
          `SELECT 
             v.id as variant_id,
             v.sku,
             v.name as variant_name,
             COALESCE(i.price, v.cost_price, 0) as price,
             v.quantity_on_hand as quantity_available
           FROM inventory_variants v
           JOIN inventory_items i ON v.inventory_item_id = i.id
           WHERE v.merchant_id = $1 
             AND v.is_active = true 
             AND v.quantity_on_hand > 0
             AND i.category = $2
             AND v.id != $3
           ORDER BY v.quantity_on_hand DESC
           LIMIT 5`,
          [merchantId, oos.category, oos.variant_id],
        );

        if (alternativesResult.rows.length === 0) continue;

        // Call AI to rank alternatives
        const aiResult =
          await this.inventoryAiService.generateSubstitutionRanking({
            merchantId,
            originalProduct: {
              sku: oos.sku,
              name: oos.variant_name,
              price: parseFloat(oos.price) || 0,
              category: oos.category,
            },
            alternatives: alternativesResult.rows.map((alt) => ({
              variantId: alt.variant_id,
              sku: alt.sku,
              name: alt.variant_name,
              price: parseFloat(alt.price) || 0,
              quantityAvailable: parseInt(alt.quantity_available, 10) || 0,
            })),
          });

        if (aiResult.success) {
          const ranked = aiResult.data;
          const rankedAlternatives = alternativesResult.rows.map((alt) => {
            const ranking = ranked.rankings.find(
              (r) => r.variantId === alt.variant_id,
            );
            return {
              id: alt.variant_id,
              sku: alt.sku,
              name: alt.variant_name,
              price: parseFloat(alt.price) || 0,
              quantityAvailable: parseInt(alt.quantity_available, 10) || 0,
              rank: ranking?.rank ?? 99,
              aiReasonAr: ranking?.reasonAr,
              aiReasonEn: ranking?.reasonEn,
            };
          });
          rankedAlternatives.sort((a, b) => a.rank - b.rank);

          suggestions.push({
            outOfStockItem: {
              variantId: oos.variant_id,
              sku: oos.sku,
              name: oos.variant_name,
              category: oos.category,
            },
            alternatives: rankedAlternatives,
            customerMessageAr: ranked.customerMessageAr,
            merchantMessageAr: ranked.merchantMessageAr,
          });
        } else {
          // Fallback: return alternatives without AI ranking
          suggestions.push({
            outOfStockItem: {
              variantId: oos.variant_id,
              sku: oos.sku,
              name: oos.variant_name,
              category: oos.category,
            },
            alternatives: alternativesResult.rows.map((alt) => ({
              id: alt.variant_id,
              sku: alt.sku,
              name: alt.variant_name,
              price: parseFloat(alt.price) || 0,
              quantityAvailable: parseInt(alt.quantity_available, 10) || 0,
            })),
          });
        }
      }

      return suggestions;
    } catch (error: any) {
      this.logger.warn(
        `Substitute suggestions unavailable: ${error?.message || error}`,
      );
      return [];
    }
  }

  private getStockStatus(
    currentStock: number,
    daysUntilStockout: number | null,
  ): string {
    if (currentStock === 0) return "OUT_OF_STOCK";
    if (daysUntilStockout === null) return "NO_SALES";
    if (daysUntilStockout <= 7) return "CRITICAL";
    if (daysUntilStockout <= 14) return "LOW";
    return "HEALTHY";
  }

  // ============== EXPENSES MANAGEMENT ==============
  // Finance endpoints require MANAGER role or higher

  @Get("expenses")
  @RequiresFeature("REPORTS")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List expenses for merchant" })
  @ApiQuery({
    name: "month",
    required: false,
    description: "Month in YYYY-MM format",
  })
  @ApiQuery({
    name: "year",
    required: false,
    description: "Year in YYYY format",
  })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Expenses listed" })
  async listExpenses(
    @Req() req: Request,
    @Query("month") month?: string,
    @Query("year") year?: string,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    let query = `SELECT * FROM expenses WHERE merchant_id = $1`;
    const params: unknown[] = [merchantId];

    if (month) {
      query += ` AND TO_CHAR(expense_date, 'YYYY-MM') = $${params.length + 1}`;
      params.push(month);
    } else if (year) {
      query += ` AND TO_CHAR(expense_date, 'YYYY') = $${params.length + 1}`;
      params.push(year);
    }
    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ` ORDER BY expense_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offsetNum);

    try {
      const result = await this.pool.query(query, params);

      // Get total and summary
      let summaryQuery = `SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as total_amount,
                          category, COALESCE(SUM(amount), 0) as category_total
                          FROM expenses WHERE merchant_id = $1`;
      const summaryParams: unknown[] = [merchantId];

      if (month) {
        summaryQuery += ` AND TO_CHAR(expense_date, 'YYYY-MM') = $2`;
        summaryParams.push(month);
      } else if (year) {
        summaryQuery += ` AND TO_CHAR(expense_date, 'YYYY') = $2`;
        summaryParams.push(year);
      }
      summaryQuery += ` GROUP BY category`;

      const summaryResult = await this.pool.query(summaryQuery, summaryParams);

      // Calculate totals
      const dateFilter = month
        ? ` AND TO_CHAR(expense_date, 'YYYY-MM') = $2`
        : year
          ? ` AND TO_CHAR(expense_date, 'YYYY') = $2`
          : "";
      const dateParam = month || year;
      const totalQuery = `SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as total_amount
                          FROM expenses WHERE merchant_id = $1${dateFilter}`;
      const totalResult = await this.pool.query(
        totalQuery,
        dateParam ? [merchantId, dateParam] : [merchantId],
      );

      return {
        expenses: result.rows.map((row) => ({
          id: row.id,
          category: row.category,
          subcategory: row.subcategory,
          amount: parseFloat(row.amount),
          description: row.description,
          expenseDate: row.expense_date,
          isRecurring: row.is_recurring,
          recurringDay: row.recurring_day,
          receiptUrl: row.receipt_url,
          createdBy: row.created_by,
          createdAt: row.created_at,
        })),
        total: parseInt(totalResult.rows[0]?.total || "0"),
        totalAmount: parseFloat(totalResult.rows[0]?.total_amount || "0"),
        byCategory: summaryResult.rows.reduce(
          (acc, row) => {
            acc[row.category] = parseFloat(row.category_total);
            return acc;
          },
          {} as Record<string, number>,
        ),
      };
    } catch (error: any) {
      if (error?.code === "42P01") {
        return { expenses: [], total: 0, totalAmount: 0, byCategory: {} };
      }
      throw error;
    }
  }

  @Post("expenses")
  @RequiresFeature("REPORTS")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Create a new expense" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["category", "amount"],
      properties: {
        category: { type: "string", description: "Expense category" },
        subcategory: { type: "string" },
        amount: { type: "number" },
        description: { type: "string" },
        expenseDate: { type: "string", format: "date" },
        isRecurring: { type: "boolean" },
        recurringDay: { type: "number" },
        receiptUrl: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Expense created" })
  async createExpense(
    @Req() req: Request,
    @Body()
    body: {
      category: string;
      subcategory?: string;
      amount: number;
      description?: string;
      expenseDate?: string;
      isRecurring?: boolean;
      recurringDay?: number;
      receiptUrl?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const staffId = (req as any).staffId;

    if (!body.category || body.amount === undefined || body.amount === null) {
      throw new BadRequestException("category and amount are required");
    }
    if (
      typeof body.amount !== "number" ||
      body.amount <= 0 ||
      !isFinite(body.amount)
    ) {
      throw new BadRequestException("المبلغ يجب أن يكون أكبر من صفر");
    }

    try {
      const result = await this.pool.query(
        `INSERT INTO expenses 
         (merchant_id, category, subcategory, amount, description, expense_date, is_recurring, recurring_day, receipt_url, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          merchantId,
          body.category,
          body.subcategory || null,
          body.amount,
          body.description || null,
          body.expenseDate ? new Date(body.expenseDate) : new Date(),
          body.isRecurring || false,
          body.recurringDay || null,
          body.receiptUrl || null,
          staffId || "portal",
        ],
      );

      // Audit log
      await this.auditService.log({
        merchantId,
        staffId,
        action: "expense.created",
        resource: "expense",
        resourceId: result.rows[0].id,
        metadata: { category: body.category, amount: body.amount },
      });

      return {
        success: true,
        expense: result.rows[0],
      };
    } catch (error: any) {
      if (error.message?.includes("does not exist")) {
        // Auto-create table and retry once
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            amount DECIMAL(12,2) NOT NULL, category VARCHAR(100), subcategory VARCHAR(100),
            description TEXT, expense_date DATE DEFAULT CURRENT_DATE,
            is_recurring BOOLEAN DEFAULT FALSE, recurring_day INTEGER, receipt_url TEXT,
            created_by VARCHAR(50) DEFAULT 'manual',
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
          )`);
        const retry = await this.pool.query(
          `INSERT INTO expenses 
           (merchant_id, category, subcategory, amount, description, expense_date, is_recurring, recurring_day, receipt_url, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            merchantId,
            body.category,
            body.subcategory || null,
            body.amount,
            body.description || null,
            body.expenseDate ? new Date(body.expenseDate) : new Date(),
            body.isRecurring || false,
            body.recurringDay || null,
            body.receiptUrl || null,
            staffId || "portal",
          ],
        );
        return { success: true, expense: retry.rows[0] };
      }
      throw error;
    }
  }

  @Delete("expenses/:id")
  @RequiresFeature("REPORTS")
  @RequireRole("ADMIN")
  @ApiOperation({ summary: "Delete an expense" })
  @ApiParam({ name: "id", description: "Expense ID" })
  @ApiResponse({ status: 200, description: "Expense deleted" })
  async deleteExpense(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const staffId = (req as any).staffId;

    const result = await this.pool.query(
      `DELETE FROM expenses WHERE id = $1 AND merchant_id = $2 RETURNING *`,
      [id, merchantId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException("Expense not found");
    }

    // Audit log
    await this.auditService.log({
      merchantId,
      staffId,
      action: "expense.deleted",
      resource: "expense",
      resourceId: id,
      metadata: {
        category: result.rows[0].category,
        amount: result.rows[0].amount,
      },
    });

    return { success: true };
  }

  @Put("expenses/:id")
  @RequiresFeature("REPORTS")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Update an expense" })
  @ApiParam({ name: "id", description: "Expense ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        category: { type: "string" },
        subcategory: { type: "string" },
        amount: { type: "number" },
        description: { type: "string" },
        expenseDate: { type: "string", format: "date" },
        isRecurring: { type: "boolean" },
        recurringDay: { type: "number" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Expense updated" })
  async updateExpense(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    body: {
      category?: string;
      subcategory?: string;
      amount?: number;
      description?: string;
      expenseDate?: string;
      isRecurring?: boolean;
      recurringDay?: number;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const staffId = (req as any).staffId;

    if (
      body.amount !== undefined &&
      (typeof body.amount !== "number" ||
        body.amount <= 0 ||
        !isFinite(body.amount))
    ) {
      throw new BadRequestException("المبلغ يجب أن يكون أكبر من صفر");
    }

    // Build dynamic SET clause
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.category !== undefined) {
      fields.push(`category = $${idx++}`);
      values.push(body.category);
    }
    if (body.subcategory !== undefined) {
      fields.push(`subcategory = $${idx++}`);
      values.push(body.subcategory || null);
    }
    if (body.amount !== undefined) {
      fields.push(`amount = $${idx++}`);
      values.push(body.amount);
    }
    if (body.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(body.description || null);
    }
    if (body.expenseDate !== undefined) {
      fields.push(`expense_date = $${idx++}`);
      values.push(new Date(body.expenseDate));
    }
    if (body.isRecurring !== undefined) {
      fields.push(`is_recurring = $${idx++}`);
      values.push(body.isRecurring);
    }
    if (body.recurringDay !== undefined) {
      fields.push(`recurring_day = $${idx++}`);
      values.push(body.recurringDay || null);
    }

    if (fields.length === 0) {
      throw new BadRequestException("لم يتم تحديد أي تعديلات");
    }

    fields.push(`updated_at = NOW()`);
    values.push(id, merchantId);

    const result = await this.pool.query(
      `UPDATE expenses SET ${fields.join(", ")} WHERE id = $${idx++} AND merchant_id = $${idx} RETURNING *`,
      values,
    );

    if (result.rowCount === 0) {
      throw new NotFoundException("Expense not found");
    }

    await this.auditService.log({
      merchantId,
      staffId,
      action: "expense.updated",
      resource: "expense",
      resourceId: id,
      metadata: { fields: Object.keys(body) },
    });

    return { success: true, expense: result.rows[0] };
  }

  @Get("expenses/categories")
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get expense categories" })
  @ApiResponse({ status: 200, description: "Expense categories" })
  async getExpenseCategories(@Req() req: Request): Promise<any> {
    void req;
    // Standard expense categories for Egypt retail
    return {
      categories: [
        { id: "inventory", name: "المخزون", nameAr: "المخزون" },
        { id: "shipping", name: "الشحن", nameAr: "الشحن" },
        { id: "marketing", name: "التسويق", nameAr: "التسويق" },
        { id: "rent", name: "الإيجار", nameAr: "الإيجار" },
        { id: "utilities", name: "المرافق", nameAr: "المرافق" },
        { id: "salaries", name: "الرواتب", nameAr: "الرواتب" },
        { id: "equipment", name: "المعدات", nameAr: "المعدات" },
        { id: "fees", name: "الرسوم", nameAr: "الرسوم" },
        { id: "other", name: "أخرى", nameAr: "أخرى" },
      ],
    };
  }

  @Get("expenses/summary")
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get expense summary for a period" })
  @ApiQuery({ name: "startDate", required: false })
  @ApiQuery({ name: "endDate", required: false })
  @ApiResponse({ status: 200, description: "Expense summary" })
  async getExpenseSummary(
    @Req() req: Request,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();

    try {
      const result = await this.pool.query(
        `SELECT category, COALESCE(SUM(amount), 0) as total
         FROM expenses
         WHERE merchant_id = $1 AND expense_date >= $2 AND expense_date <= $3
         GROUP BY category`,
        [merchantId, start, end],
      );

      const totalResult = await this.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM expenses
         WHERE merchant_id = $1 AND expense_date >= $2 AND expense_date <= $3`,
        [merchantId, start, end],
      );

      return {
        period: { start: start.toISOString(), end: end.toISOString() },
        total: parseFloat(totalResult.rows[0]?.total || "0"),
        count: parseInt(totalResult.rows[0]?.count || "0"),
        byCategory: result.rows.reduce(
          (acc, row) => {
            const category = row.category ?? "uncategorized";
            acc[category] = parseFloat(row.total);
            return acc;
          },
          {} as Record<string, number>,
        ),
      };
    } catch (error: any) {
      if (error?.code === "42P01") {
        return {
          period: { start: start.toISOString(), end: end.toISOString() },
          total: 0,
          count: 0,
          byCategory: {},
        };
      }
      throw error;
    }
  }

  // ============== PAYMENT PROOFS ==============

  @Get("payments/proofs")
  @RequiresFeature("PAYMENTS")
  @ApiOperation({ summary: "List payment proofs for merchant" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["PENDING", "APPROVED", "REJECTED"],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Payment proofs listed" })
  async listPaymentProofs(
    @Req() req: Request,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;

    let query = `SELECT pp.*, pl.amount as link_amount, pl.link_code, pl.currency as link_currency, o.order_number
                 FROM payment_proofs pp
                 LEFT JOIN payment_links pl ON pp.payment_link_id = pl.id
                 LEFT JOIN orders o ON pp.order_id = o.id
                 WHERE pp.merchant_id = $1`;
    const params: unknown[] = [merchantId];

    if (status) {
      query += ` AND pp.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY pp.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offsetNum);

    let result;
    let countResult;
    let summaryRows: Array<{ status: string; count: string }> = [];
    try {
      result = await this.pool.query(query, params);
      // Get total count
      let countQuery = `SELECT COUNT(*) FROM payment_proofs WHERE merchant_id = $1`;
      const countParams: unknown[] = [merchantId];
      if (status) {
        countQuery += ` AND status = $2`;
        countParams.push(status);
      }
      countResult = await this.pool.query(countQuery, countParams);

      const summaryResult = await this.pool.query<{
        status: string;
        count: string;
      }>(
        `SELECT status, COUNT(*)::text as count
         FROM payment_proofs
         WHERE merchant_id = $1
         GROUP BY status`,
        [merchantId],
      );
      summaryRows = summaryResult.rows;
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        return {
          proofs: [],
          total: 0,
          limit: limitNum,
          offset: offsetNum,
          summary: { total: 0, pending: 0, approved: 0, rejected: 0 },
        };
      }
      throw error;
    }

    const pending =
      Number(summaryRows.find((row) => row.status === "PENDING")?.count || 0) ||
      0;
    const approved =
      Number(
        summaryRows.find((row) => row.status === "APPROVED")?.count || 0,
      ) || 0;
    const rejected =
      Number(
        summaryRows.find((row) => row.status === "REJECTED")?.count || 0,
      ) || 0;

    return {
      proofs: result.rows.map((row) => ({
        id: row.id,
        paymentLinkId: row.payment_link_id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        proofType: row.proof_type,
        imageUrl: row.image_url,
        referenceNumber: row.reference_number,
        extractedAmount: row.extracted_amount
          ? parseFloat(row.extracted_amount)
          : null,
        extractedReference: row.extracted_reference,
        extractedSender: row.extracted_sender,
        extractedDate: row.extracted_date,
        ocrConfidence: row.ocr_confidence
          ? parseFloat(row.ocr_confidence)
          : null,
        imagePhash: row.image_phash || null,
        duplicateOfProofId: row.duplicate_of_proof_id || null,
        duplicateDistance: row.duplicate_distance
          ? parseInt(row.duplicate_distance, 10)
          : null,
        riskScore: row.risk_score ? parseInt(row.risk_score, 10) : 0,
        riskLevel: row.risk_level || "LOW",
        riskFlags: Array.isArray(row.risk_flags)
          ? row.risk_flags
          : typeof row.risk_flags === "string"
            ? (() => {
                try {
                  const parsed = JSON.parse(row.risk_flags);
                  return Array.isArray(parsed) ? parsed : [];
                } catch {
                  return [];
                }
              })()
            : [],
        manualReviewRequired:
          row.manual_review_required === undefined ||
          row.manual_review_required === null
            ? true
            : Boolean(row.manual_review_required),
        reviewOutcome: row.review_outcome || null,
        reviewNotes: row.review_notes || null,
        status: row.status,
        verifiedAt: row.verified_at,
        verifiedBy: row.verified_by,
        rejectionReason: row.rejection_reason,
        autoVerified: row.auto_verified,
        linkAmount: row.link_amount ? parseFloat(row.link_amount) : null,
        linkCode: row.link_code,
        linkCurrency: row.link_currency,
        createdAt: row.created_at,
      })),
      total: parseInt(countResult.rows[0].count, 10),
      limit: limitNum,
      offset: offsetNum,
      summary: {
        total: pending + approved + rejected,
        pending,
        approved,
        rejected,
      },
    };
  }

  @Get("payments/proofs/pending")
  @RequiresFeature("PAYMENTS")
  @ApiOperation({ summary: "Get pending payment proofs inbox" })
  @ApiResponse({ status: 200, description: "Pending proofs retrieved" })
  async getPendingPaymentProofs(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const proofs = await this.paymentService.listPendingProofs(merchantId);

    // Enhance with order info
    const enhancedProofs = await Promise.all(
      proofs.map(async (proof) => {
        let order = null;
        let paymentLink = null;

        if (proof.orderId) {
          const orderResult = await this.pool.query(
            "SELECT order_number, total, customer_name, customer_phone FROM orders WHERE id = $1",
            [proof.orderId],
          );
          if (orderResult.rows[0]) {
            order = {
              orderNumber: orderResult.rows[0].order_number,
              totalAmount: parseFloat(orderResult.rows[0].total),
              customerName: orderResult.rows[0].customer_name,
              customerPhone: orderResult.rows[0].customer_phone,
            };
          }
        }

        if (proof.paymentLinkId) {
          paymentLink = await this.paymentService.getPaymentLinkById(
            proof.paymentLinkId,
            merchantId,
          );
        }

        return {
          ...proof,
          order,
          paymentLink: paymentLink
            ? {
                linkCode: paymentLink.linkCode,
                amount: paymentLink.amount,
                currency: paymentLink.currency,
                customerName: paymentLink.customerName,
              }
            : null,
          // Verification hints
          verificationHints: this.getVerificationHints(
            proof,
            order,
            paymentLink,
          ),
        };
      }),
    );

    return {
      proofs: enhancedProofs,
      total: enhancedProofs.length,
    };
  }

  @Post("payments/proofs/:proofId/verify")
  @RequiresFeature("PAYMENTS")
  @RequireRole("ADMIN")
  @ApiOperation({ summary: "Verify (approve/reject) a payment proof" })
  @ApiParam({ name: "proofId", description: "Payment proof ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        approved: { type: "boolean" },
        rejectionReason: { type: "string" },
        staffId: { type: "string" },
      },
      required: ["approved"],
    },
  })
  @ApiResponse({ status: 200, description: "Proof verified" })
  async verifyPaymentProof(
    @Req() req: Request,
    @Param("proofId") proofId: string,
    @Body()
    body: { approved: boolean; rejectionReason?: string; staffId?: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const staffId = body.staffId || "portal-user";

    const proof = await this.paymentService.verifyPaymentProof(
      proofId,
      merchantId,
      staffId,
      body.approved,
      body.rejectionReason,
    );

    this.logger.log({
      msg: "Payment proof verified via portal",
      proofId,
      merchantId,
      approved: body.approved,
      staffId,
    });

    return {
      success: true,
      proof,
    };
  }

  @Get("payments/proofs/:proofId")
  @RequiresFeature("PAYMENTS")
  @ApiOperation({ summary: "Get payment proof details" })
  @ApiParam({ name: "proofId", description: "Payment proof ID" })
  @ApiResponse({ status: 200, description: "Proof details retrieved" })
  async getPaymentProofDetails(
    @Req() req: Request,
    @Param("proofId") proofId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const proof = await this.paymentService.getPaymentProofById(
      proofId,
      merchantId,
    );

    if (!proof) {
      throw new NotFoundException("Payment proof not found");
    }

    return { proof };
  }

  // ============== COD STATEMENT IMPORT ==============

  @Post("cod/import-statement")
  @RequireRole("ADMIN")
  @RequiresFeature("PAYMENTS")
  @ApiOperation({
    summary: "Import courier COD statement",
    description:
      "Import CSV statement from delivery partners (e.g., Bosta, Aramex) to reconcile COD orders",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        courierName: {
          type: "string",
          description: "Courier/delivery partner name",
          example: "bosta",
        },
        fileName: {
          type: "string",
          description: "Original CSV filename",
          example: "bosta_statement_2026-02.csv",
        },
        statementDate: {
          type: "string",
          format: "date",
          description: "Statement date (YYYY-MM-DD)",
          example: "2026-02-05",
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              orderNumber: { type: "string" },
              trackingNumber: { type: "string" },
              customerName: { type: "string" },
              amount: { type: "number" },
              deliveryFee: { type: "number" },
              codFee: { type: "number" },
              date: { type: "string" },
              status: { type: "string" },
            },
          },
        },
      },
      required: ["courierName", "rows"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "Statement imported and reconciled",
  })
  @ApiResponse({ status: 400, description: "Invalid statement data" })
  async importCodStatement(
    @Req() req: Request,
    @Body()
    body: {
      courierName: string;
      fileName?: string;
      statementDate?: string;
      rows: Array<{
        orderNumber: string;
        trackingNumber?: string;
        customerName?: string;
        amount: number;
        deliveryFee?: number;
        codFee?: number;
        date?: string;
        status?: string;
      }>;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const { courierName, fileName, statementDate, rows } = body;

    if (!rows || rows.length === 0) {
      throw new BadRequestException("Statement must contain at least one row");
    }

    if (!courierName) {
      throw new BadRequestException("Courier name is required");
    }

    this.logger.log({
      msg: "Importing COD statement",
      merchantId,
      courierName,
      fileName,
      rowCount: rows.length,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Create import record
      const importResult = await client.query(
        `INSERT INTO cod_statement_imports 
         (merchant_id, courier_name, filename, statement_date, total_orders, status)
         VALUES ($1, $2, $3, $4, $5, 'processing')
         RETURNING id`,
        [
          merchantId,
          courierName,
          fileName || `import_${Date.now()}.csv`,
          statementDate || new Date().toISOString().split("T")[0],
          rows.length,
        ],
      );
      const statementId = importResult.rows[0].id;

      let totalCollected = 0;
      let totalFees = 0;
      let matchedOrders = 0;
      let unmatchedOrders = 0;
      const discrepancies: Array<{
        orderNumber: string;
        expected: number;
        reported: number;
        diff: number;
      }> = [];
      const processedRows: Array<{
        orderNumber: string;
        matched: boolean;
        matchedOrderId?: string;
        discrepancy?: number;
      }> = [];

      for (const row of rows) {
        const collectedAmount = row.amount || 0;
        const deliveryFee = row.deliveryFee || 0;
        const codFee = row.codFee || 0;

        totalCollected += collectedAmount;
        totalFees += deliveryFee + codFee;
        const netAmount = collectedAmount - deliveryFee - codFee;

        // Try to match with our order
        const orderMatch = await client.query(
          `SELECT id, total, order_number FROM orders 
           WHERE merchant_id = $1 AND (order_number = $2 OR tracking_number = $3)`,
          [merchantId, row.orderNumber, row.trackingNumber || row.orderNumber],
        );

        let orderId = null;
        let matchStatus = "unmatched";
        let ourAmount = null;
        let discrepancyAmount = null;

        if (orderMatch.rows.length > 0) {
          orderId = orderMatch.rows[0].id;
          ourAmount = parseFloat(orderMatch.rows[0].total);
          matchStatus = "matched";
          matchedOrders++;

          // Check for discrepancy (deterministic comparison)
          const tolerance = 1; // 1 EGP tolerance
          if (
            collectedAmount &&
            Math.abs(collectedAmount - ourAmount) > tolerance
          ) {
            matchStatus = "discrepancy";
            discrepancyAmount = collectedAmount - ourAmount;
            discrepancies.push({
              orderNumber: orderMatch.rows[0].order_number,
              expected: ourAmount,
              reported: collectedAmount,
              diff: discrepancyAmount,
            });
          }

          // Update order COD collection status
          if (
            (row.status === "delivered" || row.status === "collected") &&
            collectedAmount
          ) {
            await client.query(
              `UPDATE orders SET payment_status = 'PAID', cod_collected = true, cod_collected_at = $1 
               WHERE id = $2`,
              [row.date || new Date().toISOString(), orderId],
            );
          }
        } else {
          unmatchedOrders++;
        }

        // Insert line item
        await client.query(
          `INSERT INTO cod_statement_lines 
           (statement_id, merchant_id, tracking_number, order_number, order_id, customer_name,
            collected_amount, delivery_fee, cod_fee, net_amount, delivery_date, status, match_status,
            our_amount, discrepancy_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            statementId,
            merchantId,
            row.trackingNumber || row.orderNumber,
            row.orderNumber,
            orderId,
            row.customerName,
            collectedAmount,
            deliveryFee,
            codFee,
            netAmount,
            row.date,
            row.status || "collected",
            matchStatus,
            ourAmount,
            discrepancyAmount,
          ],
        );

        processedRows.push({
          orderNumber: row.orderNumber,
          matched: matchStatus !== "unmatched",
          matchedOrderId: orderId,
          discrepancy: discrepancyAmount || undefined,
        });
      }

      const netAmount = totalCollected - totalFees;

      // Update statement totals
      await client.query(
        `UPDATE cod_statement_imports SET
         total_collected = $1, total_fees = $2, net_amount = $3,
         matched_orders = $4, unmatched_orders = $5, discrepancies = $6,
         status = 'reconciled', reconciled_at = NOW()
         WHERE id = $7`,
        [
          totalCollected,
          totalFees,
          netAmount,
          matchedOrders,
          unmatchedOrders,
          JSON.stringify(discrepancies),
          statementId,
        ],
      );

      await client.query("COMMIT");

      // Log audit event
      await this.auditService.log({
        merchantId,
        action: "COD_STATEMENT_IMPORTED",
        resource: "cod_statement_imports",
        resourceId: statementId,
        metadata: {
          courierName,
          fileName,
          totalOrders: rows.length,
          matchedOrders,
          unmatchedOrders,
          totalCollected,
          netAmount,
          discrepancyCount: discrepancies.length,
        },
      });

      this.logger.log({
        msg: "COD statement imported successfully",
        merchantId,
        statementId,
        courierName,
        totalOrders: rows.length,
        matchedOrders,
        unmatchedOrders,
      });

      return {
        success: true,
        statementId,
        summary: {
          courierName,
          fileName,
          totalOrders: rows.length,
          matchedOrders,
          unmatchedOrders,
          totalCollected,
          totalFees,
          netAmount,
          discrepancyCount: discrepancies.length,
          discrepancies: discrepancies.slice(0, 10), // First 10 discrepancies
        },
        rows: processedRows,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      const err = error as Error;
      this.logger.error(
        `Failed to import COD statement: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `Failed to import statement: ${err.message}`,
      );
    } finally {
      client.release();
    }
  }

  @Get("cod/statements")
  @RequiresFeature("PAYMENTS")
  @ApiOperation({ summary: "List imported COD statements" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Statements listed" })
  async listCodStatements(
    @Req() req: Request,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const parsedLimit = Math.min(Number(limit) || 20, 100);
    const parsedOffset = Number(offset) || 0;

    const result = await this.pool.query(
      `SELECT id, courier_name, filename, statement_date, total_orders, 
              matched_orders, unmatched_orders, total_collected, total_fees, net_amount,
              status, reconciled_at, created_at
       FROM cod_statement_imports
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, parsedLimit, parsedOffset],
    );

    const countResult = await this.pool.query(
      "SELECT COUNT(*) FROM cod_statement_imports WHERE merchant_id = $1",
      [merchantId],
    );

    return {
      statements: result.rows.map((row) => ({
        id: row.id,
        courierName: row.courier_name,
        fileName: row.filename,
        statementDate: row.statement_date,
        totalOrders: row.total_orders,
        matchedOrders: row.matched_orders,
        unmatchedOrders: row.unmatched_orders,
        totalCollected: parseFloat(row.total_collected || 0),
        totalFees: parseFloat(row.total_fees || 0),
        netAmount: parseFloat(row.net_amount || 0),
        status: row.status,
        reconciledAt: row.reconciled_at,
        createdAt: row.created_at,
      })),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  @Get("cod/statements/:statementId")
  @RequiresFeature("PAYMENTS")
  @ApiOperation({ summary: "Get COD statement details with line items" })
  @ApiParam({ name: "statementId", description: "Statement ID" })
  @ApiResponse({ status: 200, description: "Statement details retrieved" })
  async getCodStatementDetails(
    @Req() req: Request,
    @Param("statementId") statementId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Get statement
    const statementResult = await this.pool.query(
      `SELECT * FROM cod_statement_imports WHERE id = $1 AND merchant_id = $2`,
      [statementId, merchantId],
    );

    if (statementResult.rows.length === 0) {
      throw new NotFoundException("Statement not found");
    }

    const statement = statementResult.rows[0];

    // Get line items
    const linesResult = await this.pool.query(
      `SELECT * FROM cod_statement_lines WHERE statement_id = $1 ORDER BY id`,
      [statementId],
    );

    return {
      statement: {
        id: statement.id,
        courierName: statement.courier_name,
        fileName: statement.filename,
        statementDate: statement.statement_date,
        totalOrders: statement.total_orders,
        matchedOrders: statement.matched_orders,
        unmatchedOrders: statement.unmatched_orders,
        totalCollected: parseFloat(statement.total_collected || 0),
        totalFees: parseFloat(statement.total_fees || 0),
        netAmount: parseFloat(statement.net_amount || 0),
        discrepancies: statement.discrepancies,
        status: statement.status,
        reconciledAt: statement.reconciled_at,
        createdAt: statement.created_at,
      },
      lines: linesResult.rows.map((line) => ({
        id: line.id,
        trackingNumber: line.tracking_number,
        orderNumber: line.order_number,
        orderId: line.order_id,
        customerName: line.customer_name,
        collectedAmount: parseFloat(line.collected_amount || 0),
        deliveryFee: parseFloat(line.delivery_fee || 0),
        codFee: parseFloat(line.cod_fee || 0),
        netAmount: parseFloat(line.net_amount || 0),
        deliveryDate: line.delivery_date,
        status: line.status,
        matchStatus: line.match_status,
        ourAmount: line.our_amount ? parseFloat(line.our_amount) : null,
        discrepancyAmount: line.discrepancy_amount
          ? parseFloat(line.discrepancy_amount)
          : null,
      })),
    };
  }

  // ============== PRODUCT OCR CONFIRMATIONS ==============

  @Get("products/ocr/confirmations")
  @RequiresFeature("VISION_OCR")
  @ApiOperation({ summary: "Get pending product OCR confirmations" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["PENDING", "CONFIRMED", "REJECTED", "EXPIRED"],
  })
  @ApiResponse({ status: 200, description: "Confirmations retrieved" })
  async getProductOcrConfirmations(
    @Req() req: Request,
    @Query("status") status?: string,
  ): Promise<any> {
    throw new BadRequestException(
      "General OCR confirmations are removed. OCR is limited to payment proof verification.",
    );
  }

  @Post("products/ocr/confirmations/:id/approve")
  @RequiresFeature("VISION_OCR")
  @ApiOperation({ summary: "Approve an OCR product confirmation" })
  @ApiParam({ name: "id", description: "Confirmation ID" })
  async approveOcrConfirmation(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    throw new BadRequestException(
      "General OCR confirmations are removed. OCR is limited to payment proof verification.",
    );
  }

  @Post("products/ocr/confirmations/:id/reject")
  @RequiresFeature("VISION_OCR")
  @ApiOperation({ summary: "Reject an OCR product confirmation" })
  @ApiParam({ name: "id", description: "Confirmation ID" })
  async rejectOcrConfirmation(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    throw new BadRequestException(
      "General OCR confirmations are removed. OCR is limited to payment proof verification.",
    );
  }

  // ============== FOLLOWUP COMPLETE ==============

  @Post("followups/:id/complete")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Mark a followup as completed" })
  @ApiParam({
    name: "id",
    description:
      "Follow-up ID (followup UUID, order ID, or conversation ID for abandoned carts)",
  })
  async completeFollowup(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // UUID validation helper — PostgreSQL rejects non-UUID strings with a hard error
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUuid = UUID_REGEX.test(id);

    // Try to update in followups table first (only if id looks like a UUID)
    if (isValidUuid) {
      const followupResult = await this.pool.query(
        `UPDATE followups SET status = 'SENT', sent_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND merchant_id = $2 AND status = 'PENDING'
         RETURNING id`,
        [id, merchantId],
      );
      if (followupResult.rowCount && followupResult.rowCount > 0) {
        return { success: true, source: "followups" };
      }
    }

    // If not found in followups table, the ID is an order ID from derived followups
    // Flag the order so it doesn't appear in followup queries again
    if (isValidUuid) {
      const orderResult = await this.pool.query(
        `UPDATE orders SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"followup_resolved": true}'::jsonb,
                updated_at = NOW()
         WHERE id = $1 AND merchant_id = $2
         RETURNING id`,
        [id, merchantId],
      );
      if (orderResult.rowCount && orderResult.rowCount > 0) {
        return { success: true, source: "orders" };
      }
    }

    // If not found in orders table, try conversation-derived abandoned cart followups
    // Also support non-UUID conversation IDs (e.g. demo IDs like "conv-demo-005")
    // by using a text cast comparison instead of UUID cast
    const conversationResult = await this.pool.query(
      `UPDATE conversations
       SET context = COALESCE(context, '{}'::jsonb) || '{"followup_resolved": true}'::jsonb,
           next_followup_at = NULL,
           updated_at = NOW()
       WHERE id::text = $1 AND merchant_id = $2
       RETURNING id`,
      [id, merchantId],
    );
    if (conversationResult.rowCount && conversationResult.rowCount > 0) {
      return { success: true, source: "conversations" };
    }

    throw new NotFoundException("Followup not found");
  }

  // ============== CONVERSATION CLOSE ==============

  @Post("conversations/:id/close")
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "Close a conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  async closeConversation(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const conversation = await this.conversationRepo.findById(id);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }
    await this.conversationRepo.update(id, {
      state: "CLOSED",
      isHumanTakeover: false,
    } as any);
    return { success: true, message: "Conversation closed" };
  }

  // Private helper for verification hints
  private getVerificationHints(
    proof: PaymentProof,
    order: {
      totalAmount: number;
      orderNumber?: any;
      customerName?: any;
      customerPhone?: any;
    } | null,
    paymentLink: PaymentLink | null,
  ): string[] {
    const hints: string[] = [];

    // Amount matching
    const expectedAmount = paymentLink?.amount || order?.totalAmount;
    if (expectedAmount && proof.extractedAmount) {
      const diff = Math.abs(expectedAmount - proof.extractedAmount);
      const tolerance = expectedAmount * 0.05; // 5% tolerance
      if (diff <= tolerance) {
        hints.push("✅ المبلغ مطابق");
      } else {
        hints.push(
          `⚠️ المبلغ المستخرج (${proof.extractedAmount}) يختلف عن المتوقع (${expectedAmount})`,
        );
      }
    }

    // OCR confidence
    if (proof.ocrConfidence) {
      if (proof.ocrConfidence >= 0.85) {
        hints.push(
          `✅ ثقة OCR عالية (${Math.round(proof.ocrConfidence * 100)}%)`,
        );
      } else if (proof.ocrConfidence >= 0.6) {
        hints.push(
          `⚠️ ثقة OCR متوسطة (${Math.round(proof.ocrConfidence * 100)}%)`,
        );
      } else {
        hints.push(
          `❌ ثقة OCR منخفضة (${Math.round(proof.ocrConfidence * 100)}%)`,
        );
      }
    }

    // Reference number
    if (proof.extractedReference) {
      hints.push(`📝 رقم المرجع: ${proof.extractedReference}`);
    }

    // Sender info
    if (proof.extractedSender) {
      hints.push(`👤 المرسل: ${proof.extractedSender}`);
    }

    return hints;
  }

  // ==================== Knowledge Base Endpoints ====================

  @Get("knowledge-base")
  @ApiOperation({
    summary: "Get merchant knowledge base",
    description:
      "Returns FAQs, business info, and other knowledge base data for AI to use",
  })
  @ApiResponse({ status: 200, description: "Knowledge base retrieved" })
  async getKnowledgeBase(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Try to get from database
    const result = await this.pool.query(
      `SELECT knowledge_base, name FROM merchants WHERE id = $1`,
      [merchantId],
    );

    if (result.rows.length === 0 || !result.rows[0].knowledge_base) {
      const merchantName = result.rows[0]?.name || "";
      // Return default empty structure
      return {
        faqs: [],
        businessInfo: {
          name: merchantName,
          category: "عام",
          workingHours: {},
          policies: {},
          deliveryPricing: {
            mode: "UNIFIED",
            unifiedPrice: null,
            byCity: [],
          },
        },
        offers: [],
      };
    }

    const kb = result.rows[0].knowledge_base || {};
    const normalizedKb = { ...kb } as any;
    normalizedKb.offers = Array.isArray(kb.offers) ? kb.offers : [];
    if (!normalizedKb.businessInfo) {
      normalizedKb.businessInfo = {};
    }
    if (!normalizedKb.businessInfo.deliveryPricing) {
      normalizedKb.businessInfo.deliveryPricing = {
        mode: "UNIFIED",
        unifiedPrice: null,
        byCity: [],
      };
    }
    return normalizedKb;
  }

  @Put("knowledge-base")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Update merchant knowledge base",
    description: "Update FAQs, business info for AI responses",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        faqs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              answer: { type: "string" },
              category: { type: "string" },
              isActive: { type: "boolean" },
            },
          },
        },
        businessInfo: { type: "object" },
        offers: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Knowledge base updated" })
  async updateKnowledgeBase(
    @Req() req: Request,
    @Body() body: { faqs?: any[]; businessInfo?: any; offers?: any[] },
  ): Promise<{ success: boolean }> {
    const merchantId = this.getMerchantId(req);

    // Get current knowledge base
    const current = await this.pool.query(
      `SELECT knowledge_base FROM merchants WHERE id = $1`,
      [merchantId],
    );

    const existingKb = current.rows[0]?.knowledge_base || {};

    // Merge with new data
    const updatedKb = {
      ...existingKb,
      ...(body.faqs !== undefined ? { faqs: body.faqs } : {}),
      ...(body.businessInfo !== undefined
        ? { businessInfo: body.businessInfo }
        : {}),
      ...(body.offers !== undefined ? { offers: body.offers } : {}),
      updatedAt: new Date().toISOString(),
    };

    // Update in database
    await this.pool.query(
      `UPDATE merchants SET knowledge_base = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedKb), merchantId],
    );

    this.logger.log({
      msg: "Knowledge base updated",
      merchantId,
      faqCount: body.faqs?.length,
      hasBusinessInfo: !!body.businessInfo,
    });

    return { success: true };
  }

  @Post("knowledge-base/sync-inventory")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Sync inventory items into catalog",
    description:
      "Creates or updates catalog items from inventory so KB stays aligned",
  })
  @ApiResponse({ status: 200, description: "Inventory synced to catalog" })
  async syncInventoryToCatalog(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const client = await this.pool.connect();

    const toNumber = (value: any): number | null => {
      if (value === null || value === undefined || value === "") return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    try {
      await client.query("BEGIN");
      const inventoryResult = await client.query(
        `SELECT * FROM inventory_items WHERE merchant_id = $1`,
        [merchantId],
      );

      let created = 0;
      let updated = 0;
      let linked = 0;

      const linkInventory = async (
        inventoryId: string,
        catalogId: string | null,
      ) => {
        try {
          await client.query(
            `UPDATE inventory_items
             SET catalog_item_id = $1, updated_at = NOW()
             WHERE id = $2 AND merchant_id = $3`,
            [catalogId, inventoryId, merchantId],
          );
          return true;
        } catch (error: any) {
          if (error?.code === "42703") {
            return false;
          }
          throw error;
        }
      };

      for (const row of inventoryResult.rows) {
        const inventoryId = row.id;
        const sku = row.sku || null;
        const name = row.name || row.item_name || row.sku || "منتج";
        const category = row.category || null;
        const price = toNumber(row.price ?? row.base_price ?? row.sell_price);
        const catalogItemId = row.catalog_item_id || row.catalogItemId;

        const updateCatalog = async (catalogId: string): Promise<boolean> => {
          const updates: string[] = [];
          const values: any[] = [];
          let idx = 1;

          if (sku) {
            updates.push(`sku = $${idx++}`);
            values.push(sku);
          }
          if (name) {
            updates.push(`name_ar = $${idx++}`);
            values.push(name);
          }
          if (category) {
            updates.push(`category = $${idx++}`);
            values.push(category);
          }
          if (price !== null) {
            updates.push(`base_price = $${idx++}`);
            values.push(price);
          }

          updates.push(`updated_at = NOW()`);
          values.push(catalogId, merchantId);
          const updateResult = await client.query(
            `UPDATE catalog_items
             SET ${updates.join(", ")}
             WHERE id = $${idx} AND merchant_id = $${idx + 1}
             RETURNING id`,
            values,
          );
          return updateResult.rowCount > 0;
        };

        if (catalogItemId) {
          const didUpdateExisting = await updateCatalog(catalogItemId);
          if (didUpdateExisting) {
            updated += 1;
            continue;
          }

          // Broken link (catalog item deleted): unlink and resolve using SKU/create path.
          await linkInventory(inventoryId, null);
        }

        let existingCatalogId: string | null = null;
        if (sku) {
          const existing = await client.query(
            `SELECT id FROM catalog_items WHERE merchant_id = $1 AND sku = $2 LIMIT 1`,
            [merchantId, sku],
          );
          if (existing.rows.length) {
            existingCatalogId = existing.rows[0].id;
          }
        }

        if (existingCatalogId) {
          const didLink = await linkInventory(inventoryId, existingCatalogId);
          if (didLink) linked += 1;
          const didUpdateExisting = await updateCatalog(existingCatalogId);
          if (didUpdateExisting) {
            updated += 1;
            continue;
          }
        }

        const insert = await client.query(
          `INSERT INTO catalog_items (merchant_id, sku, name_ar, base_price, category, is_available, variants, options)
           VALUES ($1, $2, $3, $4, $5, true, '[]', '[]')
           RETURNING id`,
          [merchantId, sku, name, price ?? 0, category],
        );

        const newCatalogId = insert.rows[0].id;
        const didLink = await linkInventory(inventoryId, newCatalogId);
        if (didLink) linked += 1;
        created += 1;
      }

      await client.query("COMMIT");
      return {
        success: true,
        total: inventoryResult.rows.length,
        created,
        updated,
        linked,
      };
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "42P01") {
        throw new BadRequestException(
          "جداول المخزون غير متاحة بعد. تأكد من تشغيل الهجرات.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // ============== SECURITY ==============

  @Get("security/sessions")
  @ApiOperation({ summary: "Get active sessions for current staff member" })
  @ApiResponse({ status: 200, description: "Sessions retrieved" })
  async getSessions(@Req() req: Request): Promise<any> {
    const staffId = (req as any).staffId;
    if (!staffId) {
      // If accessed via API key without staff context, return empty
      return { sessions: [] };
    }

    // Validate staffId is a valid UUID before querying
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(staffId)) {
      return { sessions: [] };
    }

    const sessions = await this.staffService.getSessions(staffId);

    // Mark current session
    const currentSessionId = (req as any).sessionId;

    return {
      sessions: sessions.map((session) => ({
        ...session,
        isCurrent: session.id === currentSessionId,
      })),
    };
  }

  @RequireRole("AGENT")
  @Delete("security/sessions/:sessionId")
  @ApiOperation({ summary: "Revoke a specific session" })
  @ApiParam({ name: "sessionId", description: "Session ID to revoke" })
  @ApiResponse({ status: 200, description: "Session revoked" })
  async revokeSession(
    @Req() req: Request,
    @Param("sessionId") sessionId: string,
  ): Promise<any> {
    const staffId = (req as any).staffId;
    if (!staffId) {
      throw new ForbiddenException("Staff authentication required");
    }

    await this.staffService.revokeSession(staffId, sessionId);

    await this.auditService.log({
      merchantId: this.getMerchantId(req),
      staffId,
      action: "SESSION_REVOKED",
      resource: "STAFF",
      resourceId: staffId,
      metadata: { sessionId },
    });

    return { success: true };
  }

  @RequireRole("AGENT")
  @Delete("security/sessions")
  @ApiOperation({ summary: "Revoke all sessions except current" })
  @ApiResponse({ status: 200, description: "All sessions revoked" })
  async revokeAllSessions(@Req() req: Request): Promise<any> {
    const staffId = (req as any).staffId;
    if (!staffId) {
      throw new ForbiddenException("Staff authentication required");
    }

    const currentSessionId = (req as any).sessionId;
    const sessions = await this.staffService.getSessions(staffId);

    let revoked = 0;
    for (const session of sessions) {
      if (session.id !== currentSessionId) {
        await this.staffService.revokeSession(staffId, session.id);
        revoked++;
      }
    }

    await this.auditService.log({
      merchantId: this.getMerchantId(req),
      staffId,
      action: "ALL_SESSIONS_REVOKED",
      resource: "STAFF",
      resourceId: staffId,
      metadata: { revoked, kept: currentSessionId },
    });

    return { success: true, revoked };
  }

  @RequireRole("OWNER")
  @Delete("sessions/all")
  @ApiOperation({ summary: "Revoke all sessions for this merchant" })
  @ApiResponse({ status: 200, description: "Merchant sessions revoked" })
  async revokeAllMerchantSessions(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const staffId = (req as any).staffId;
    const revoked =
      await this.staffService.revokeAllMerchantSessions(merchantId);

    await this.auditService.log({
      merchantId,
      staffId,
      action: "ALL_SESSIONS_REVOKED",
      resource: "MERCHANT",
      resourceId: merchantId,
      metadata: { scope: "merchant", revoked },
    });

    return { success: true, revoked };
  }

  @Get("security/audit")
  @RequiresFeature("AUDIT_LOGS")
  @ApiOperation({ summary: "Get security audit logs for current user" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Audit logs retrieved" })
  async getSecurityAudit(
    @Req() req: Request,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const staffId = (req as any).staffId;
    const parsedLimit = Math.min(Number(limit) || 50, 200);
    const parsedOffset = Number(offset) || 0;

    // Validate staffId is a valid UUID, otherwise set to null for query
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeStaffId = staffId && uuidRegex.test(staffId) ? staffId : null;

    // Get security-relevant audit entries
    try {
      const result = await this.pool.query(
        `SELECT id, action, resource, resource_id, ip_address, user_agent, created_at, metadata
         FROM audit_logs
         WHERE merchant_id = $1 
           AND ($2::uuid IS NULL OR staff_id = $2)
           AND action IN ('LOGIN', 'LOGOUT', 'PASSWORD_CHANGED', 'SESSION_REVOKED', 'ALL_SESSIONS_REVOKED', 'API_KEY_ROTATED', 'PERMISSIONS_CHANGED')
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [merchantId, safeStaffId, parsedLimit, parsedOffset],
      );

      return {
        logs: result.rows.map((row) => ({
          id: row.id,
          action: row.action,
          resource: row.resource,
          resourceId: row.resource_id,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at,
          metadata: row.metadata,
        })),
      };
    } catch (err: any) {
      // Handle case where audit_logs table or resource column doesn't exist (migration 008 not run)
      if (err?.message?.includes("does not exist")) {
        return { logs: [] };
      }
      throw err;
    }
  }

  // ============== COD SUMMARY ==============

  @Get("cod/summary")
  @RequiresFeature("PAYMENTS")
  @ApiOperation({ summary: "Get COD reconciliation summary" })
  @ApiQuery({
    name: "period",
    required: false,
    enum: ["today", "week", "month", "all"],
  })
  @ApiQuery({ name: "branchId", required: false, type: "string" })
  @ApiResponse({ status: 200, description: "COD summary retrieved" })
  async getCodSummary(
    @Req() req: Request,
    @Query("period") period?: string,
    @Query("branchId") branchId?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Calculate date range
    let dateFilter = "";
    const params: any[] = [merchantId];

    if (period === "today") {
      dateFilter = "AND o.created_at >= CURRENT_DATE";
    } else if (period === "week") {
      dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === "month") {
      dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'";
    }

    let branchFilter = "";
    if (branchId) {
      branchFilter = `AND o.branch_id = $${params.length + 1}`;
      params.push(branchId);
    }

    // Get COD orders summary
    const ordersResult = await this.pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE payment_method = 'COD') as total_cod_orders,
        COALESCE(SUM(total) FILTER (WHERE payment_method = 'COD'), 0) as total_cod_amount,
        COUNT(*) FILTER (WHERE payment_method = 'COD' AND status = 'DELIVERED') as delivered_orders,
        COALESCE(SUM(total) FILTER (WHERE payment_method = 'COD' AND status = 'DELIVERED'), 0) as delivered_amount,
        COUNT(*) FILTER (WHERE payment_method = 'COD' AND status IN ('DRAFT', 'CONFIRMED', 'BOOKED', 'SHIPPED', 'OUT_FOR_DELIVERY')) as pending_orders,
        COALESCE(SUM(total) FILTER (WHERE payment_method = 'COD' AND status IN ('DRAFT', 'CONFIRMED', 'BOOKED', 'SHIPPED', 'OUT_FOR_DELIVERY')), 0) as pending_amount,
        COUNT(*) FILTER (WHERE payment_method = 'COD' AND status = 'CANCELLED') as cancelled_orders,
        0 as returned_orders
       FROM orders o
       WHERE merchant_id = $1 ${dateFilter} ${branchFilter}`,
      params,
    );

    const orders = ordersResult.rows[0];

    // Get reconciliation stats from statements
    const statementsResult = await this.pool.query(
      `SELECT 
        COUNT(*) as total_statements,
        COUNT(*) FILTER (WHERE status = 'RECONCILED') as reconciled_statements,
        COALESCE(SUM(total_collected), 0) as total_collected,
        COALESCE(SUM(total_fees), 0) as total_fees,
        COALESCE(SUM(net_amount), 0) as net_received,
        COALESCE(SUM(matched_orders), 0) as matched_orders,
        COALESCE(SUM(unmatched_orders), 0) as unmatched_orders
       FROM cod_statement_imports
       WHERE merchant_id = $1`,
      [merchantId],
    );

    const statements = statementsResult.rows[0];

    // Get recent COD orders (courier/tracking are in shipments table, not orders)
    const recentOrdersResult = await this.pool.query(
      `SELECT o.id, o.order_number, o.customer_name, o.total, o.status, 
              s.courier, s.tracking_id as tracking_number, o.created_at
       FROM orders o
       LEFT JOIN shipments s ON s.order_id = o.id
       WHERE o.merchant_id = $1 AND o.payment_method = 'COD' ${params.length > 1 ? "AND o.branch_id = $2" : ""}
       ORDER BY o.created_at DESC
       LIMIT 20`,
      branchId ? [merchantId, branchId] : [merchantId],
    );

    return {
      summary: {
        totalCodOrders: parseInt(orders.total_cod_orders || 0),
        totalCodAmount: parseFloat(orders.total_cod_amount || 0),
        deliveredOrders: parseInt(orders.delivered_orders || 0),
        deliveredAmount: parseFloat(orders.delivered_amount || 0),
        pendingOrders: parseInt(orders.pending_orders || 0),
        pendingAmount: parseFloat(orders.pending_amount || 0),
        cancelledOrders: parseInt(orders.cancelled_orders || 0),
        returnedOrders: parseInt(orders.returned_orders || 0),
      },
      reconciliation: {
        totalStatements: parseInt(statements.total_statements || 0),
        reconciledStatements: parseInt(statements.reconciled_statements || 0),
        totalCollected: parseFloat(statements.total_collected || 0),
        totalFees: parseFloat(statements.total_fees || 0),
        netReceived: parseFloat(statements.net_received || 0),
        matchedOrders: parseInt(statements.matched_orders || 0),
        unmatchedOrders: parseInt(statements.unmatched_orders || 0),
      },
      recentOrders: recentOrdersResult.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        total: parseFloat(row.total),
        status: row.status,
        courier: row.courier,
        trackingNumber: row.tracking_number,
        createdAt: row.created_at,
      })),
    };
  }

  @Post("cod/reconcile/:orderId")
  @RequiresFeature("PAYMENTS")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Mark a COD order as reconciled" })
  @ApiParam({ name: "orderId", description: "Order ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        amountReceived: {
          type: "number",
          description: "Actual amount received",
        },
        notes: { type: "string", description: "Reconciliation notes" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Order reconciled" })
  async reconcileCodOrder(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Body() body: { amountReceived?: number; notes?: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Verify order exists and is COD
    const orderResult = await this.pool.query(
      `SELECT id, total, payment_method FROM orders WHERE id = $1 AND merchant_id = $2`,
      [orderId, merchantId],
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundException("Order not found");
    }

    const order = orderResult.rows[0];
    if (order.payment_method !== "COD") {
      throw new BadRequestException("Order is not COD");
    }

    // Update order with reconciliation info
    await this.pool.query(
      `UPDATE orders SET 
        cod_reconciled = true,
        cod_reconciled_at = NOW(),
        cod_amount_received = $1,
        cod_notes = $2
       WHERE id = $3`,
      [body.amountReceived ?? order.total, body.notes, orderId],
    );

    await this.auditService.log({
      merchantId,
      action: "COD_ORDER_RECONCILED",
      resource: "ORDER",
      resourceId: orderId,
      metadata: { amountReceived: body.amountReceived, notes: body.notes },
    });

    return { success: true };
  }

  @Post("cod/dispute/:orderId")
  @RequiresFeature("PAYMENTS")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Mark a COD order as disputed" })
  @ApiParam({ name: "orderId", description: "Order ID" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["reason"],
      properties: {
        reason: { type: "string", description: "Dispute reason" },
        expectedAmount: { type: "number", description: "Expected amount" },
        actualAmount: { type: "number", description: "Actual amount received" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Dispute created" })
  async disputeCodOrder(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Body()
    body: { reason: string; expectedAmount?: number; actualAmount?: number },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Verify order exists
    const orderResult = await this.pool.query(
      `SELECT id, total FROM orders WHERE id = $1 AND merchant_id = $2 AND payment_method = 'COD'`,
      [orderId, merchantId],
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundException("COD order not found");
    }

    // Update order with dispute info
    await this.pool.query(
      `UPDATE orders SET 
        cod_disputed = true,
        cod_dispute_reason = $1,
        cod_dispute_created_at = NOW()
       WHERE id = $2`,
      [body.reason, orderId],
    );

    await this.auditService.log({
      merchantId,
      action: "COD_ORDER_DISPUTED",
      resource: "ORDER",
      resourceId: orderId,
      metadata: body,
    });

    return { success: true };
  }

  // ============== CFO BRIEF REPORT ==============

  @Get("reports/cfo")
  @UseGuards(EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get CFO brief report with financial metrics" })
  @ApiQuery({
    name: "period",
    required: false,
    enum: ["today", "week", "month", "quarter"],
  })
  @ApiResponse({ status: 200, description: "CFO report retrieved" })
  async getCfoReport(
    @Req() req: Request,
    @Query("period") period?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Calculate date range
    let dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'";
    let previousDateFilter =
      "AND o.created_at >= CURRENT_DATE - INTERVAL '60 days' AND o.created_at < CURRENT_DATE - INTERVAL '30 days'";

    if (period === "today") {
      dateFilter = "AND o.created_at >= CURRENT_DATE";
      previousDateFilter =
        "AND o.created_at >= CURRENT_DATE - INTERVAL '1 day' AND o.created_at < CURRENT_DATE";
    } else if (period === "week") {
      dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'";
      previousDateFilter =
        "AND o.created_at >= CURRENT_DATE - INTERVAL '14 days' AND o.created_at < CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === "quarter") {
      dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '90 days'";
      previousDateFilter =
        "AND o.created_at >= CURRENT_DATE - INTERVAL '180 days' AND o.created_at < CURRENT_DATE - INTERVAL '90 days'";
    }

    // Current period revenue and orders
    const currentResult = await this.pool.query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(AVG(total), 0) as aov,
        COUNT(DISTINCT customer_phone) as unique_customers,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled
       FROM orders o
       WHERE merchant_id = $1 ${dateFilter}`,
      [merchantId],
    );

    // Previous period for comparison
    const previousResult = await this.pool.query(
      `SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as revenue
       FROM orders o
       WHERE merchant_id = $1 ${previousDateFilter}`,
      [merchantId],
    );

    const current = currentResult.rows[0];
    const previous = previousResult.rows[0];

    // Calculate growth
    const revenueGrowth =
      previous.revenue > 0
        ? (
            ((current.revenue - previous.revenue) / previous.revenue) *
            100
          ).toFixed(1)
        : 0;
    const orderGrowth =
      previous.order_count > 0
        ? (
            ((current.order_count - previous.order_count) /
              previous.order_count) *
            100
          ).toFixed(1)
        : 0;

    // Get expenses for the period
    const expensesResult = await this.pool.query(
      `SELECT 
        COALESCE(SUM(amount), 0) as total_expenses,
        COUNT(*) as expense_count
       FROM expenses
       WHERE merchant_id = $1 
         AND expense_date >= CURRENT_DATE - INTERVAL '${period === "today" ? "1" : period === "week" ? "7" : period === "quarter" ? "90" : "30"} days'`,
      [merchantId],
    );

    const expenses = expensesResult.rows[0];

    // Get expense breakdown by category
    const categoryResult = await this.pool.query(
      `SELECT category, COALESCE(SUM(amount), 0) as amount
       FROM expenses
       WHERE merchant_id = $1 
         AND expense_date >= CURRENT_DATE - INTERVAL '${period === "today" ? "1" : period === "week" ? "7" : period === "quarter" ? "90" : "30"} days'
       GROUP BY category
       ORDER BY amount DESC
       LIMIT 5`,
      [merchantId],
    );

    // Get top products
    const productsResult = await this.pool.query(
      `SELECT 
        COALESCE(oi.name, 'Unknown') as name,
        COUNT(*) as quantity,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.merchant_id = $1 ${dateFilter.replace("o.", "o.")}
       GROUP BY oi.name
       ORDER BY revenue DESC
       LIMIT 5`,
      [merchantId],
    );

    // Calculate profit (revenue - expenses)
    const profit =
      parseFloat(current.revenue) - parseFloat(expenses.total_expenses);
    const profitMargin =
      current.revenue > 0
        ? ((profit / parseFloat(current.revenue)) * 100).toFixed(1)
        : 0;

    // Alerts
    const alerts: Array<{ type: string; message: string; severity: string }> =
      [];

    if (parseFloat(revenueGrowth as string) < -10) {
      alerts.push({
        type: "revenue_drop",
        message: "انخفاض الإيرادات بأكثر من 10%",
        severity: "warning",
      });
    }
    if (current.cancelled > current.order_count * 0.1) {
      alerts.push({
        type: "high_cancellation",
        message: "معدل إلغاء مرتفع (أكثر من 10%)",
        severity: "warning",
      });
    }
    if (parseFloat(profitMargin as string) < 10) {
      alerts.push({
        type: "low_margin",
        message: "هامش الربح منخفض (أقل من 10%)",
        severity: "warning",
      });
    }

    return {
      period: period || "month",
      generatedAt: new Date().toISOString(),
      summary: {
        revenue: parseFloat(current.revenue),
        revenueGrowth: parseFloat(revenueGrowth as string),
        orderCount: parseInt(current.order_count),
        orderGrowth: parseFloat(orderGrowth as string),
        aov: parseFloat(current.aov),
        uniqueCustomers: parseInt(current.unique_customers),
      },
      orders: {
        total: parseInt(current.order_count),
        delivered: parseInt(current.delivered),
        cancelled: parseInt(current.cancelled),
        returned: 0,
        deliveryRate:
          current.order_count > 0
            ? ((current.delivered / current.order_count) * 100).toFixed(1)
            : 0,
      },
      cashFlow: {
        revenue: parseFloat(current.revenue),
        expenses: parseFloat(expenses.total_expenses),
        profit,
        profitMargin: parseFloat(profitMargin as string),
      },
      expenseBreakdown: categoryResult.rows.map((row) => ({
        category: row.category,
        amount: parseFloat(row.amount),
      })),
      topProducts: productsResult.rows.map((row) => ({
        name: row.name,
        quantity: parseInt(row.quantity),
        revenue: parseFloat(row.revenue),
      })),
      alerts,
    };
  }

  // ============== AI-GENERATED WEEKLY CFO BRIEF ==============

  @Get("reports/cfo/ai-brief")
  @UseGuards(EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({
    summary: "Get latest AI-generated weekly CFO brief from merchant_reports",
  })
  @ApiResponse({ status: 200, description: "AI CFO brief retrieved" })
  async getCfoAiBrief(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    try {
      const result = await this.pool.query(
        `SELECT summary, period_start, period_end, created_at
         FROM merchant_reports
         WHERE merchant_id = $1 AND period_type = 'WEEKLY_CFO_BRIEF'
         ORDER BY created_at DESC
         LIMIT 1`,
        [merchantId],
      );

      if (result.rows.length === 0) {
        return { available: false, brief: null };
      }

      const row = result.rows[0];
      return {
        available: true,
        brief: {
          data:
            typeof row.summary === "string"
              ? JSON.parse(row.summary)
              : row.summary,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          generatedAt: row.created_at,
        },
      };
    } catch (error) {
      this.logger.warn("Failed to fetch AI CFO brief", error);
      return { available: false, brief: null };
    }
  }

  // ============== ACCOUNTANT PACK EXPORT (Pro Feature) ==============

  @Get("accountant-pack")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @RequireRole("ADMIN")
  @ApiOperation({ summary: "Generate accountant export pack" })
  @ApiQuery({ name: "startDate", required: true })
  @ApiQuery({ name: "endDate", required: true })
  @ApiQuery({
    name: "includes",
    required: false,
    description:
      "Comma-separated: orders,expenses,cod_reconciliation,inventory_movements",
  })
  async getAccountantPack(
    @Req() req: Request,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("includes") includesRaw?: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    if (!startDate || !endDate)
      throw new BadRequestException("startDate and endDate are required");

    const validIncludes = [
      "orders",
      "expenses",
      "cod_reconciliation",
      "inventory_movements",
    ];
    const includes = includesRaw
      ? includesRaw.split(",").filter((i) => validIncludes.includes(i.trim()))
      : validIncludes;

    const pack: Record<string, any> = {
      merchantId,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      sections: {},
    };

    if (includes.includes("orders")) {
      const orders = await this.pool.query(
        `SELECT order_number, created_at, customer_name, total, payment_method, payment_status, status
         FROM orders WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at`,
        [merchantId, startDate, endDate],
      );
      pack.sections.orders = { count: orders.rows.length, data: orders.rows };
    }

    if (includes.includes("expenses")) {
      const expenses = await this.pool.query(
        `SELECT expense_date, category, subcategory, description, amount, receipt_url
         FROM expenses WHERE merchant_id = $1 AND expense_date >= $2 AND expense_date <= $3 ORDER BY expense_date`,
        [merchantId, startDate, endDate],
      );
      pack.sections.expenses = {
        count: expenses.rows.length,
        data: expenses.rows,
      };
    }

    if (includes.includes("cod_reconciliation")) {
      const cod = await this.pool.query(
        `SELECT courier_name, statement_date, total_orders, total_collected, total_fees, net_amount, matched_orders, unmatched_orders
         FROM cod_statement_imports WHERE merchant_id = $1 AND statement_date >= $2 AND statement_date <= $3 ORDER BY statement_date`,
        [merchantId, startDate, endDate],
      );
      pack.sections.codReconciliation = {
        count: cod.rows.length,
        data: cod.rows,
      };
    }

    if (includes.includes("inventory_movements")) {
      const movements = await this.pool.query(
        `SELECT sm.created_at, v.sku, v.name, sm.movement_type, sm.quantity, sm.quantity_before, sm.quantity_after, sm.reason
         FROM stock_movements sm JOIN inventory_variants v ON sm.variant_id = v.id
         WHERE sm.merchant_id = $1 AND sm.created_at >= $2 AND sm.created_at <= $3 ORDER BY sm.created_at`,
        [merchantId, startDate, endDate],
      );
      pack.sections.inventoryMovements = {
        count: movements.rows.length,
        data: movements.rows,
      };
    }

    // Record export
    await this.pool
      .query(
        `INSERT INTO accountant_exports (merchant_id, export_type, period_start, period_end, includes, generated_by)
       VALUES ($1, 'portal', $2, $3, $4, 'portal') ON CONFLICT DO NOTHING`,
        [merchantId, startDate, endDate, JSON.stringify(includes)],
      )
      .catch(() => {});

    return pack;
  }

  // ============== COD COLLECTION REMINDERS ==============

  @Get("cod/reminders")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("PAYMENTS")
  @ApiOperation({ summary: "Get pending COD collection reminders" })
  async getCodReminders(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const result = await this.pool
      .query(
        `SELECT cr.id, cr.order_id, cr.customer_phone, cr.amount_due, cr.reminder_type, cr.status,
              cr.scheduled_at, cr.sent_at, cr.created_at,
              o.order_number, o.customer_name, o.created_at as order_date
       FROM cod_reminders cr
       LEFT JOIN orders o ON cr.order_id = o.id
       WHERE cr.merchant_id = $1
       ORDER BY cr.scheduled_at DESC
       LIMIT 100`,
        [merchantId],
      )
      .catch(() => ({ rows: [] }));

    return { reminders: result.rows };
  }

  @Post("cod/reminders/schedule")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("PAYMENTS")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Schedule COD collection reminders for overdue orders",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { daysPastDue: { type: "number", default: 3 } },
    },
  })
  async scheduleCodReminders(
    @Req() req: Request,
    @Body() body: { daysPastDue?: number },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const daysPastDue = body.daysPastDue || 3;

    const pendingCod = await this.pool
      .query(
        `SELECT o.id, o.order_number, o.total, o.customer_id, o.customer_phone, o.created_at, o.customer_name
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.payment_method = 'COD'
         AND (o.payment_status IS NULL OR o.payment_status = 'PENDING')
         AND o.status = 'DELIVERED'
         AND o.created_at < NOW() - ($2 || ' days')::INTERVAL
         AND NOT EXISTS (
           SELECT 1 FROM cod_reminders cr
           WHERE cr.order_id = o.id AND cr.status IN ('pending', 'sent') AND cr.scheduled_at > NOW() - INTERVAL '24 hours'
         )`,
        [merchantId, daysPastDue],
      )
      .catch(() => ({ rows: [] }));

    let scheduled = 0;
    for (const order of pendingCod.rows) {
      const daysSince = Math.floor(
        (Date.now() - new Date(order.created_at).getTime()) / 86400000,
      );
      const reminderType =
        daysSince > 14
          ? "final_notice"
          : daysSince > 7
            ? "second_reminder"
            : "first_reminder";

      await this.pool
        .query(
          `INSERT INTO cod_reminders (merchant_id, order_id, customer_id, customer_phone, amount_due, reminder_type, scheduled_at, message_template, status)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour', $7, 'pending')
         ON CONFLICT DO NOTHING`,
          [
            merchantId,
            order.id,
            order.customer_id,
            order.customer_phone,
            order.total,
            reminderType,
            reminderType,
          ],
        )
        .catch(() => {});
      scheduled++;
    }

    return { scheduled, totalOverdue: pendingCod.rows.length };
  }

  // ============== FOLLOWUPS (Real Implementation) ==============

  @Get("customer-segments")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Get customer segment summary for this merchant" })
  async getCustomerSegmentSummary(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    const result = await this.pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE order_count = 1) as one_time,
        COUNT(*) FILTER (WHERE order_count BETWEEN 2 AND 4) as returning,
        COUNT(*) FILTER (WHERE order_count >= 5) as loyal,
        COUNT(*) FILTER (WHERE last_order_date < NOW() - INTERVAL '30 days') as at_risk,
        COUNT(*) as total
       FROM (
         SELECT customer_phone, COUNT(*) as order_count, MAX(created_at) as last_order_date
         FROM orders WHERE merchant_id = $1 AND status != 'CANCELLED' GROUP BY customer_phone
       ) sub`,
      [merchantId],
    );

    const row = result.rows[0] || {};
    return {
      segments: [
        {
          name: "عملاء مرة واحدة",
          nameEn: "One-time",
          count: parseInt(row.one_time || "0"),
          color: "#94a3b8",
        },
        {
          name: "عملاء عائدون",
          nameEn: "Returning",
          count: parseInt(row.returning || "0"),
          color: "#3b82f6",
        },
        {
          name: "عملاء أوفياء",
          nameEn: "Loyal",
          count: parseInt(row.loyal || "0"),
          color: "#10b981",
        },
        {
          name: "عملاء معرّضون للمغادرة",
          nameEn: "At Risk",
          count: parseInt(row.at_risk || "0"),
          color: "#ef4444",
        },
      ],
      total: parseInt(row.total || "0"),
    };
  }

  // ============== CUSTOM SEGMENTS (Rule-based segment builder) ==============

  @Get("custom-segments")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "List custom segments for this merchant" })
  async listCustomSegments(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `SELECT id, name, description, rules, match_type, customer_count, created_at
       FROM custom_segments WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId],
    );
    return { segments: result.rows };
  }

  @Post("custom-segments")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Create a custom segment with rules" })
  async createCustomSegment(
    @Req() req: Request,
    @Body() body: any,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const { name, description, rules, match_type } = body;
    if (!name || !rules || !Array.isArray(rules) || rules.length === 0) {
      throw new BadRequestException("name and rules[] are required");
    }

    // Count matching customers
    const count = await this.countSegmentCustomers(
      merchantId,
      rules,
      match_type || "all",
    );

    const result = await this.pool.query(
      `INSERT INTO custom_segments (merchant_id, name, description, rules, match_type, customer_count)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        merchantId,
        name,
        description || "",
        JSON.stringify(rules),
        match_type || "all",
        count,
      ],
    );
    return result.rows[0];
  }

  @Put("custom-segments/:id")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Update a custom segment" })
  async updateCustomSegment(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: any,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const { name, description, rules, match_type } = body;
    if (!name || !rules || !Array.isArray(rules) || rules.length === 0) {
      throw new BadRequestException("name and rules[] are required");
    }

    const count = await this.countSegmentCustomers(
      merchantId,
      rules,
      match_type || "all",
    );

    const result = await this.pool.query(
      `UPDATE custom_segments SET name=$1, description=$2, rules=$3, match_type=$4, customer_count=$5, updated_at=NOW()
       WHERE id=$6 AND merchant_id=$7 RETURNING *`,
      [
        name,
        description || "",
        JSON.stringify(rules),
        match_type || "all",
        count,
        id,
        merchantId,
      ],
    );
    if (result.rows.length === 0)
      throw new BadRequestException("Segment not found");
    return result.rows[0];
  }

  @Delete("custom-segments/:id")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Delete a custom segment" })
  async deleteCustomSegment(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    await this.pool.query(
      "DELETE FROM custom_segments WHERE id=$1 AND merchant_id=$2",
      [id, merchantId],
    );
    return { deleted: true };
  }

  @Get("custom-segments/:id/preview")
  @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
  @RequiresFeature("REPORTS")
  @ApiOperation({ summary: "Preview customers matching a custom segment" })
  async previewCustomSegment(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const seg = await this.pool.query(
      "SELECT rules, match_type FROM custom_segments WHERE id=$1 AND merchant_id=$2",
      [id, merchantId],
    );
    if (seg.rows.length === 0)
      throw new BadRequestException("Segment not found");

    const { rules, match_type } = seg.rows[0];
    const parsedRules = typeof rules === "string" ? JSON.parse(rules) : rules;
    const { where, params } = this.buildSegmentWhere(
      parsedRules,
      match_type,
      merchantId,
    );

    const result = await this.pool.query(
      `SELECT
         sub.customer_phone as phone,
         COALESCE(sub.customer_name, '') as name,
         sub.order_count,
         sub.total_spent,
         sub.last_order
       FROM (
         SELECT
           customer_phone,
           MAX(customer_name) as customer_name,
           COUNT(*)::int as order_count,
           COALESCE(SUM(total),0)::numeric as total_spent,
           MAX(created_at) as last_order,
           EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))/86400 as days_since_last_order,
           COALESCE(AVG(total),0)::numeric as avg_order_value
         FROM orders
         WHERE merchant_id = $1 AND status != 'CANCELLED'
         GROUP BY customer_phone
       ) sub
       WHERE ${where}
       ORDER BY sub.total_spent DESC
       LIMIT 50`,
      params,
    );

    // Also count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM (
         SELECT
           customer_phone,
           COUNT(*)::int as order_count,
           COALESCE(SUM(total),0)::numeric as total_spent,
           EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))/86400 as days_since_last_order,
           COALESCE(AVG(total),0)::numeric as avg_order_value
         FROM orders
         WHERE merchant_id = $1 AND status != 'CANCELLED'
         GROUP BY customer_phone
       ) sub
       WHERE ${where}`,
      params,
    );

    return {
      customers: result.rows,
      total: countResult.rows[0]?.total || 0,
    };
  }

  // ─── Helper: count customers matching segment rules ───────────
  private async countSegmentCustomers(
    merchantId: string,
    rules: any[],
    matchType: string,
  ): Promise<number> {
    try {
      const parsedRules = Array.isArray(rules) ? rules : JSON.parse(rules);
      const { where, params } = this.buildSegmentWhere(
        parsedRules,
        matchType,
        merchantId,
      );
      const result = await this.pool.query(
        `SELECT COUNT(*)::int as total FROM (
           SELECT
             customer_phone,
             COUNT(*)::int as order_count,
             COALESCE(SUM(total),0)::numeric as total_spent,
             EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))/86400 as days_since_last_order,
             COALESCE(AVG(total),0)::numeric as avg_order_value
           FROM orders
           WHERE merchant_id = $1 AND status != 'CANCELLED'
           GROUP BY customer_phone
         ) sub
         WHERE ${where}`,
        params,
      );
      return result.rows[0]?.total || 0;
    } catch {
      return 0;
    }
  }

  // ─── Delivery Drivers ──────────────────────────────────────────

  @Get("delivery-drivers")
  @ApiOperation({ summary: "List delivery drivers" })
  async getDeliveryDrivers(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `SELECT * FROM delivery_drivers WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId],
    );
    return result.rows;
  }

  @Post("delivery-drivers")
  @ApiOperation({ summary: "Create a delivery driver" })
  async createDeliveryDriver(
    @Req() req: Request,
    @Body()
    body: {
      name: string;
      phone: string;
      whatsappNumber?: string;
      vehicleType?: string;
      notes?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `INSERT INTO delivery_drivers (merchant_id, name, phone, whatsapp_number, vehicle_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        merchantId,
        body.name,
        body.phone,
        body.whatsappNumber || body.phone,
        body.vehicleType || "motorcycle",
        body.notes || null,
      ],
    );
    return result.rows[0];
  }

  @Put("delivery-drivers/:id")
  @ApiOperation({ summary: "Update a delivery driver" })
  async updateDeliveryDriver(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      whatsappNumber?: string;
      status?: string;
      vehicleType?: string;
      notes?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`);
      vals.push(body.name);
    }
    if (body.phone !== undefined) {
      sets.push(`phone = $${idx++}`);
      vals.push(body.phone);
    }
    if (body.whatsappNumber !== undefined) {
      sets.push(`whatsapp_number = $${idx++}`);
      vals.push(body.whatsappNumber);
    }
    if (body.status !== undefined) {
      sets.push(`status = $${idx++}`);
      vals.push(body.status);
    }
    if (body.vehicleType !== undefined) {
      sets.push(`vehicle_type = $${idx++}`);
      vals.push(body.vehicleType);
    }
    if (body.notes !== undefined) {
      sets.push(`notes = $${idx++}`);
      vals.push(body.notes);
    }
    if (sets.length === 0) return { message: "Nothing to update" };
    sets.push(`updated_at = NOW()`);
    vals.push(id, merchantId);
    const result = await this.pool.query(
      `UPDATE delivery_drivers SET ${sets.join(", ")} WHERE id = $${idx++} AND merchant_id = $${idx} RETURNING *`,
      vals,
    );
    if (result.rows.length === 0)
      throw new NotFoundException("Driver not found");
    return result.rows[0];
  }

  @Delete("delivery-drivers/:id")
  @ApiOperation({ summary: "Delete a delivery driver" })
  async deleteDeliveryDriver(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    await this.pool.query(
      `DELETE FROM delivery_drivers WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );
    return { message: "Driver deleted" };
  }

  @Post("orders/:orderId/assign-driver")
  @ApiOperation({
    summary: "Assign a delivery driver to an order and notify via WhatsApp",
  })
  async assignDriverToOrder(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Body() body: { driverId: string },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const assignableStatuses = new Set(["CONFIRMED"]);

    // Get driver info
    const driverResult = await this.pool.query(
      `SELECT * FROM delivery_drivers WHERE id = $1 AND merchant_id = $2`,
      [body.driverId, merchantId],
    );
    if (driverResult.rows.length === 0)
      throw new NotFoundException("Driver not found");
    const driver = driverResult.rows[0];
    if (String(driver.status || "").toUpperCase() !== "ACTIVE") {
      throw new BadRequestException("لا يمكن تعيين سائق غير نشط");
    }

    // Get order info
    const orderResult = await this.pool.query(
      `SELECT o.*, m.business_name FROM orders o
       JOIN merchants m ON m.id = o.merchant_id
       WHERE o.id = $1 AND o.merchant_id = $2`,
      [orderId, merchantId],
    );
    if (orderResult.rows.length === 0)
      throw new NotFoundException("Order not found");
    const order = orderResult.rows[0];
    const normalizedStatus = String(order.status || "").toUpperCase();
    if (!assignableStatuses.has(normalizedStatus)) {
      throw new BadRequestException("لا يمكن تعيين سائق لهذه الحالة");
    }

    // Update order with assigned driver
    await this.pool.query(
      `UPDATE orders SET assigned_driver_id = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3`,
      [body.driverId, orderId, merchantId],
    );

    // Send WhatsApp notification to driver
    const waNumber = driver.whatsapp_number || driver.phone;
    if (waNumber) {
      try {
        const isCOD = (order.payment_method || "").toUpperCase() === "COD";
        const message = [
          `🚚 طلب توصيل جديد من ${order.business_name || "المتجر"}`,
          ``,
          `📦 رقم الطلب: ${order.order_number || order.id?.slice(0, 8)}`,
          order.customer_name ? `👤 العميل: ${order.customer_name}` : "",
          order.customer_phone ? `📞 الهاتف: ${order.customer_phone}` : "",
          order.delivery_address ? `📍 العنوان: ${order.delivery_address}` : "",
          order.delivery_notes ? `📝 ملاحظات: ${order.delivery_notes}` : "",
          order.total ? `💰 المبلغ: ${order.total} ج.م` : "",
          isCOD ? `\n⚠️ *تحصيل عند الاستلام (COD)*` : "",
          isCOD ? `💵 المبلغ المطلوب تحصيله: ${order.total} ج.م` : "",
          ``,
          isCOD
            ? `يرجى استلام الطلب من المتجر وتحصيل المبلغ عند التسليم.`
            : `يرجى استلام الطلب من المتجر في أقرب وقت.`,
        ]
          .filter(Boolean)
          .join("\n");

        // Get merchant WhatsApp for sender
        const mcRes = await this.pool.query(
          `SELECT whatsapp_number FROM merchants WHERE id = $1`,
          [merchantId],
        );
        const merchantWa = mcRes.rows[0]?.whatsapp_number || undefined;
        await this.notificationsService.sendBroadcastWhatsApp(
          waNumber,
          message,
          merchantWa,
        );
      } catch (err) {
        this.logger.error(
          `[DRIVER-WA] Failed to notify driver ${driver.name}: ${err}`,
        );
        // Don't fail the assignment if WhatsApp fails
      }
    }

    await this.auditService.logFromRequest(req, "UPDATE", "ORDER", orderId);
    return {
      message: "Driver assigned and notified",
      driver: driver.name,
      orderId,
    };
  }

  // ─── COD Collection Reminders ───────────────────────────────────
  @Post("delivery/cod-reminders")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Send COD collection reminders to all delivery drivers",
    description:
      "Groups pending COD orders by assigned driver and sends WhatsApp reminders with collection amounts.",
  })
  async sendCodCollectionReminders(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);

    // Get all pending COD orders grouped by driver
    const pendingCOD = await this.pool.query(
      `SELECT 
         dd.id as driver_id,
         dd.name as driver_name,
         dd.phone as driver_phone,
         dd.whatsapp_number,
         COUNT(o.id) as order_count,
         SUM(o.total) as total_amount,
         json_agg(json_build_object(
           'orderNumber', o.order_number,
           'customerName', o.customer_name,
           'total', o.total,
           'deliveryAddress', o.delivery_address
         ) ORDER BY o.created_at) as orders
       FROM orders o
       JOIN delivery_drivers dd ON dd.id = o.assigned_driver_id
       WHERE o.merchant_id = $1
         AND (o.payment_method = 'COD' OR o.payment_method = 'cod')
         AND (o.cod_collected = false OR o.cod_collected IS NULL)
         AND o.status NOT IN ('CANCELLED', 'DELIVERED')
         AND o.assigned_driver_id IS NOT NULL
       GROUP BY dd.id, dd.name, dd.phone, dd.whatsapp_number`,
      [merchantId],
    );

    if (pendingCOD.rows.length === 0) {
      return {
        success: true,
        message: "لا توجد طلبات COD معلقة للتحصيل",
        reminders: 0,
      };
    }

    // Get merchant business name for the message
    const merchantResult = await this.pool.query(
      `SELECT business_name, whatsapp_number FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchant = merchantResult.rows[0] || {};
    const merchantWa = merchant.whatsapp_number || undefined;
    const shopName = merchant.business_name || "المتجر";

    const results: Array<{
      driver: string;
      sent: boolean;
      orderCount: number;
      totalAmount: number;
    }> = [];

    for (const driverRow of pendingCOD.rows) {
      const waNumber = driverRow.whatsapp_number || driverRow.driver_phone;
      if (!waNumber) {
        results.push({
          driver: driverRow.driver_name,
          sent: false,
          orderCount: 0,
          totalAmount: 0,
        });
        continue;
      }

      try {
        const orderLines = (driverRow.orders || [])
          .map(
            (o: any, i: number) =>
              `  ${i + 1}. #${o.orderNumber} - ${o.customerName || "عميل"} - ${o.total} ج.م`,
          )
          .join("\n");

        const message = [
          `💵 *تذكير تحصيل COD من ${shopName}*`,
          ``,
          `مرحباً ${driverRow.driver_name} 👋`,
          `لديك ${driverRow.order_count} طلب بحاجة لتحصيل:`,
          ``,
          orderLines,
          ``,
          `💰 *إجمالي المبلغ المطلوب: ${parseFloat(driverRow.total_amount).toLocaleString("ar-EG")} ج.م*`,
          ``,
          `⏰ يرجى تحصيل المبالغ وتسليمها في أقرب فرصة.`,
          `شكراً لك! 🙏`,
        ].join("\n");

        await this.notificationsService.sendBroadcastWhatsApp(
          waNumber,
          message,
          merchantWa,
        );
        results.push({
          driver: driverRow.driver_name,
          sent: true,
          orderCount: parseInt(driverRow.order_count),
          totalAmount: parseFloat(driverRow.total_amount),
        });
        this.logger.log(
          `[COD-REMINDER] Sent to ${driverRow.driver_name} (${driverRow.order_count} orders, ${driverRow.total_amount} EGP)`,
        );
      } catch (err) {
        this.logger.error(
          `[COD-REMINDER] Failed to send to ${driverRow.driver_name}: ${err}`,
        );
        results.push({
          driver: driverRow.driver_name,
          sent: false,
          orderCount: 0,
          totalAmount: 0,
        });
      }
    }

    const totalSent = results.filter((r) => r.sent).length;
    const totalAmount = results.reduce((sum, r) => sum + r.totalAmount, 0);

    return {
      success: true,
      message: `تم إرسال ${totalSent} تذكير تحصيل COD`,
      reminders: totalSent,
      totalDrivers: pendingCOD.rows.length,
      totalPendingAmount: totalAmount,
      details: results,
    };
  }

  // ─── POS Integrations CRUD ──────────────────────────────────────
  @Get("pos-integrations")
  @ApiOperation({ summary: "List all POS integrations for the merchant" })
  async listPosIntegrations(@Req() req: Request): Promise<any[]> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `SELECT id, merchant_id, provider, name, status, config, last_sync_at,
              sync_interval_minutes, field_mapping, created_at, updated_at
       FROM pos_integrations WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId],
    );
    return result.rows;
  }

  @Post("pos-integrations")
  @ApiOperation({ summary: "Create a POS integration" })
  async createPosIntegration(
    @Req() req: Request,
    @Body()
    body: {
      provider: string;
      name: string;
      credentials: Record<string, string>;
      config?: Record<string, any>;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const { provider, name, credentials, config } = body;
    let result: any;
    try {
      result = await this.pool.query(
        `INSERT INTO pos_integrations (merchant_id, provider, name, status, credentials, config, sync_interval_minutes, field_mapping)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $5, 15, '{}')
         RETURNING id, merchant_id, provider, name, status, config, last_sync_at, sync_interval_minutes, field_mapping, created_at`,
        [
          merchantId,
          provider,
          name,
          JSON.stringify(credentials),
          JSON.stringify(config || {}),
        ],
      );
    } catch (err: any) {
      if (
        err?.code === "23505" &&
        err?.constraint === "pos_integrations_merchant_id_provider_key"
      ) {
        throw new ConflictException(
          `يوجد بالفعل تكامل نشط لمزود "${provider}" لهذا الحساب. يرجى حذف الربط الحالي أولاً أو تعديله.`,
        );
      }
      throw err;
    }
    await this.auditService.logFromRequest(
      req,
      "CREATE",
      "POS_INTEGRATION",
      result.rows[0].id,
    );
    return result.rows[0];
  }

  @Put("pos-integrations/:id")
  @ApiOperation({ summary: "Update a POS integration" })
  async updatePosIntegration(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      credentials?: Record<string, string>;
      config?: Record<string, any>;
      status?: string;
      sync_interval_minutes?: number;
      field_mapping?: Record<string, string>;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const fields: string[] = [];
    const values: any[] = [id, merchantId];
    let idx = 3;

    if (body.name) {
      fields.push(`name = $${idx++}`);
      values.push(body.name);
    }
    if (body.credentials) {
      fields.push(`credentials = $${idx++}`);
      values.push(JSON.stringify(body.credentials));
    }
    if (body.config) {
      fields.push(`config = $${idx++}`);
      values.push(JSON.stringify(body.config));
    }
    if (body.status) {
      fields.push(`status = $${idx++}`);
      values.push(body.status);
    }
    if (body.sync_interval_minutes) {
      fields.push(`sync_interval_minutes = $${idx++}`);
      values.push(body.sync_interval_minutes);
    }
    if (body.field_mapping) {
      fields.push(`field_mapping = $${idx++}`);
      values.push(JSON.stringify(body.field_mapping));
    }

    if (fields.length === 0) return { message: "Nothing to update" };

    fields.push("updated_at = NOW()");
    const result = await this.pool.query(
      `UPDATE pos_integrations SET ${fields.join(", ")} WHERE id = $1 AND merchant_id = $2
       RETURNING id, merchant_id, provider, name, status, config, last_sync_at, sync_interval_minutes, field_mapping, created_at, updated_at`,
      values,
    );
    if (result.rows.length === 0)
      throw new NotFoundException("POS integration not found");
    await this.auditService.logFromRequest(
      req,
      "UPDATE",
      "POS_INTEGRATION",
      id,
    );
    return result.rows[0];
  }

  @Delete("pos-integrations/:id")
  @ApiOperation({ summary: "Delete a POS integration" })
  async deletePosIntegration(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `DELETE FROM pos_integrations WHERE id = $1 AND merchant_id = $2 RETURNING id`,
      [id, merchantId],
    );
    if (result.rows.length === 0)
      throw new NotFoundException("POS integration not found");
    await this.auditService.logFromRequest(
      req,
      "DELETE",
      "POS_INTEGRATION",
      id,
    );
    return { message: "Deleted" };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI: PRODUCT DESCRIPTION GENERATOR
  // ─────────────────────────────────────────────────────────────────────────

  @Post("inventory/:productId/ai-description")
  @RequireRole("MANAGER")
  async generateProductDescription(
    @Req() req: Request,
    @Param("productId") productId: string,
  ): Promise<{ description: string }> {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `SELECT COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku, '') AS name,
              COALESCE(ii.description, ci.description_ar, '') AS description,
              COALESCE(ii.category, ci.category, '') AS category,
              COALESCE(ii.sku, ci.sku, '') AS sku
       FROM inventory_items ii
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
       WHERE ii.id = $1 AND ii.merchant_id = $2`,
      [productId, merchantId],
    );
    if (!result.rows.length) throw new NotFoundException("Product not found");
    const product = result.rows[0];

    try {
      const aiResult = await this.inventoryAiService.generateRestockInsight({
        merchantId,
        product: {
          sku: product.sku || productId,
          name: product.name,
          currentQuantity: 0,
          recommendedQuantity: 5,
          avgDailySales: 1,
          daysUntilStockout: 0,
          urgency: "low",
        },
      });
      if (aiResult.success && aiResult.data?.explanationAr) {
        return { description: aiResult.data.explanationAr };
      }
    } catch (_) {
      // fall through to fallback
    }

    const fallbackDesc = `${product.name} — منتج عالي الجودة متوفر لدينا.${product.category ? ` الفئة: ${product.category}.` : ""} للاستفسار والطلب تواصل معنا عبر واتساب.`;
    return { description: fallbackDesc };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI: CAMPAIGN AUDIENCE SUGGESTION
  // ─────────────────────────────────────────────────────────────────────────

  @Post("campaigns/suggest-audience")
  @RequireRole("MANAGER")
  async suggestCampaignAudience(
    @Req() req: Request,
    @Body() body: { goal: string },
  ): Promise<{
    recommendedSegmentId: string | null;
    segmentName: string;
    reason: string;
    estimatedSize: number;
    segments: Array<{
      id: string;
      name: string;
      size: number;
      match_score: number;
    }>;
  }> {
    const merchantId = this.getMerchantId(req);
    const goal = (body.goal ?? "").toLowerCase();

    const segsResult = await this.pool.query(
      `SELECT cs.id, cs.name,
              COUNT(DISTINCT c.id)::int AS estimated_size
       FROM customer_segments cs
       LEFT JOIN customers c ON c.merchant_id = cs.merchant_id
       WHERE cs.merchant_id = $1
       GROUP BY cs.id, cs.name
       ORDER BY estimated_size DESC`,
      [merchantId],
    );

    const scored = segsResult.rows.map((seg) => {
      const segName = (seg.name ?? "").toLowerCase();
      let score = 0;
      if (
        goal.includes("استرجاع") ||
        goal.includes("عودة") ||
        goal.includes("خامل")
      ) {
        if (
          segName.includes("خامل") ||
          segName.includes("قديم") ||
          segName.includes("غير نشط")
        )
          score += 50;
        if (segName.includes("at_risk") || segName.includes("خطر")) score += 40;
      }
      if (
        goal.includes("vip") ||
        goal.includes("مميز") ||
        goal.includes("كبار")
      ) {
        if (
          segName.includes("vip") ||
          segName.includes("مميز") ||
          segName.includes("كبار")
        )
          score += 50;
      }
      if (goal.includes("جديد") || goal.includes("ترحيب")) {
        if (segName.includes("جديد") || segName.includes("new")) score += 50;
      }
      if (
        goal.includes("خصم") ||
        goal.includes("عرض") ||
        goal.includes("تخفيض")
      )
        score += 20;
      return {
        id: seg.id,
        name: seg.name,
        size: seg.estimated_size,
        match_score: score,
      };
    });
    scored.sort((a, b) => b.match_score - a.match_score);
    const best = scored[0];

    const reasons: Record<string, string> = {
      استرجاع: "العملاء الخاملون هم أفضل جمهور لحملات إعادة الاستهداف",
      vip: "العملاء المميزون يستجيبون بشكل أفضل للعروض الحصرية",
      جديد: "العملاء الجدد في مرحلة بناء الولاء — الترحيب يرفع معدل الاحتفاظ",
      خصم: "الشريحة العامة تعطي أكبر انتشار لحملات الخصومات",
    };
    const matchedKey = Object.keys(reasons).find((k) => goal.includes(k));
    const reason = matchedKey
      ? reasons[matchedKey]
      : best
        ? `شريحة "${best.name}" تضم ${best.size} عميل وهي الأنسب لهدفك`
        : "لم يتم العثور على شرائح. أنشئ شرائح عملاء أولاً من صفحة الشرائح";

    return {
      recommendedSegmentId: best?.id ?? null,
      segmentName: best?.name ?? "—",
      reason,
      estimatedSize: best?.size ?? 0,
      segments: scored.slice(0, 5),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS: SUBSCRIPTION USAGE
  // ─────────────────────────────────────────────────────────────────────────

  @Get("analytics/subscription-usage")
  @RequireRole("MANAGER")
  async getSubscriptionUsage(@Req() req: Request): Promise<{
    tokensUsed: number;
    tokenLimit: number;
    tokenPct: number;
    conversationsUsed: number;
    conversationLimit: number;
    conversationPct: number;
    planName: string;
    periodEnd: string | null;
  }> {
    const merchantId = this.getMerchantId(req);

    const result = await this.pool.query(
      `SELECT
         COALESCE(SUM(mtu.tokens_used), 0)::int AS tokens_used,
         COALESCE(sp.monthly_token_limit, 10000) AS token_limit,
         COALESCE(sp.monthly_conversation_limit, 500) AS conversation_limit,
         COALESCE(sp.name, 'Basic') AS plan_name,
         sub.current_period_end,
         (SELECT COUNT(DISTINCT id)::int FROM conversations
          WHERE merchant_id = $1 AND created_at >= date_trunc('month', NOW())) AS conversations_used
       FROM merchants m
       LEFT JOIN subscriptions sub ON sub.merchant_id = m.id AND sub.status = 'ACTIVE'
       LEFT JOIN subscription_plans sp ON sp.id = sub.plan_id
       LEFT JOIN merchant_token_usage mtu ON mtu.merchant_id = m.id
         AND mtu.usage_date >= date_trunc('month', NOW())
       WHERE m.id = $1
       GROUP BY sp.monthly_token_limit, sp.monthly_conversation_limit, sp.name,
                sub.current_period_end`,
      [merchantId],
    );

    const row = result.rows[0] ?? {
      tokens_used: 0,
      token_limit: 10000,
      conversation_limit: 500,
      plan_name: "Basic",
      current_period_end: null,
      conversations_used: 0,
    };

    return {
      tokensUsed: Number(row.tokens_used),
      tokenLimit: Number(row.token_limit),
      tokenPct:
        row.token_limit > 0
          ? Math.round((row.tokens_used / row.token_limit) * 100)
          : 0,
      conversationsUsed: Number(row.conversations_used),
      conversationLimit: Number(row.conversation_limit),
      conversationPct:
        row.conversation_limit > 0
          ? Math.round((row.conversations_used / row.conversation_limit) * 100)
          : 0,
      planName: row.plan_name,
      periodEnd: row.current_period_end ?? null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS: WHATSAPP DELIVERY TREND
  // ─────────────────────────────────────────────────────────────────────────

  @Get("analytics/whatsapp-delivery-trend")
  @RequireRole("MANAGER")
  async getWhatsappDeliveryTrend(
    @Req() req: Request,
    @Query("days") days = "14",
  ): Promise<{
    trend: Array<{
      date: string;
      sent: number;
      delivered: number;
      failed: number;
      rate: number;
    }>;
    overallRate: number;
  }> {
    const merchantId = this.getMerchantId(req);
    const daysInt = Math.min(Math.max(parseInt(days, 10) || 14, 1), 90);

    const result = await this.pool.query(
      `SELECT
         date_trunc('day', created_at)::date::text AS date,
         COUNT(*) FILTER (WHERE direction = 'outbound')::int AS sent,
         COUNT(*) FILTER (WHERE direction = 'outbound' AND delivery_status = 'DELIVERED')::int AS delivered,
         COUNT(*) FILTER (WHERE direction = 'outbound' AND delivery_status = 'FAILED')::int AS failed
       FROM messages
       WHERE merchant_id = $1
         AND direction = 'outbound'
         AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY 1
       ORDER BY 1 ASC`,
      [merchantId, daysInt],
    );

    const trend = result.rows.map((r) => ({
      date: r.date,
      sent: r.sent,
      delivered: r.delivered,
      failed: r.failed,
      rate: r.sent > 0 ? Math.round((r.delivered / r.sent) * 100) : 0,
    }));

    const totalSent = trend.reduce((s, r) => s + r.sent, 0);
    const totalDelivered = trend.reduce((s, r) => s + r.delivered, 0);
    return {
      trend,
      overallRate:
        totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
    };
  }

  // ─── Helper: build WHERE clause from segment rules ────────────
  private buildSegmentWhere(
    rules: any[],
    matchType: string,
    merchantId: string,
  ): { where: string; params: any[] } {
    const params: any[] = [merchantId];
    const VALID_FIELDS = [
      "order_count",
      "total_spent",
      "days_since_last_order",
      "avg_order_value",
    ];
    const OP_MAP: Record<string, string> = {
      gte: ">=",
      lte: "<=",
      gt: ">",
      lt: "<",
      eq: "=",
    };

    const conditions: string[] = [];
    for (const rule of rules) {
      const field = String(rule.field || "");
      const op = OP_MAP[String(rule.operator || "")] || ">=";
      const value = parseFloat(String(rule.value || "0"));
      if (!VALID_FIELDS.includes(field) || isNaN(value)) continue;

      params.push(value);
      conditions.push(`sub.${field} ${op} $${params.length}`);
    }

    if (conditions.length === 0) {
      return { where: "1=1", params };
    }

    const joiner = matchType === "any" ? " OR " : " AND ";
    return { where: conditions.join(joiner), params };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ADVANCED FORECAST PLATFORM ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════

  @Get("forecast/demand")
  @ApiOperation({
    summary: "Advanced demand forecast with Holt-Winters + confidence bands",
  })
  async getAdvancedDemandForecast(
    @Req() req: Request,
    @Query("productId") productId?: string,
    @Query("urgency") urgency?: string,
    @Query("page") page = "1",
    @Query("limit") limit = "50",
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const results = await this.forecastEngine.computeDemandForecast(
      merchantId,
      productId,
      90,
    );
    const filtered = urgency
      ? results.filter((r) => r.urgency === urgency)
      : results;
    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const total = filtered.length;
    const items = filtered.slice((p - 1) * l, p * l);
    const summary = {
      critical: results.filter((r) => r.urgency === "critical").length,
      high: results.filter((r) => r.urgency === "high").length,
      medium: results.filter((r) => r.urgency === "medium").length,
      ok: results.filter((r) => r.urgency === "ok").length,
    };
    return { items, total, page: p, limit: l, summary };
  }

  @Get("forecast/demand/:productId/history")
  @ApiOperation({
    summary: "Daily demand history + predictions for a single product",
  })
  async getDemandForecastHistory(
    @Req() req: Request,
    @Param("productId") productId: string,
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const results = await this.forecastEngine.computeDemandForecast(
      merchantId,
      productId,
      90,
    );
    if (!results.length)
      throw new NotFoundException("Product not found or no data");
    const item = results[0];
    return {
      productId: item.productId,
      productName: item.productName,
      historicalData: item.historicalData,
      forecast7d: item.forecast7d,
      forecast14d: item.forecast14d,
      forecast30d: item.forecast30d,
      lower7d: item.lower7d,
      upper7d: item.upper7d,
      lower30d: item.lower30d,
      upper30d: item.upper30d,
      mape7d: item.mape7d,
      confidence: item.confidence,
      trendPct: item.trendPct,
      reasonCodes: item.reasonCodes,
    };
  }

  @Get("forecast/cashflow")
  @ApiOperation({ summary: "30-day cash-flow projection + runway calculation" })
  async getCashFlowForecast(
    @Req() req: Request,
    @Query("days") days = "30",
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const d = Math.min(90, Math.max(7, parseInt(days, 10) || 30));
    return this.forecastEngine.computeCashFlowForecast(merchantId, d);
  }

  @Get("forecast/churn")
  @ApiOperation({ summary: "At-risk customers ranked by churn probability" })
  async getChurnForecast(
    @Req() req: Request,
    @Query("limit") limit = "50",
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const items = await this.forecastEngine.computeChurnForecast(merchantId, l);
    const summary = {
      critical: items.filter((i) => i.riskLevel === "critical").length,
      high: items.filter((i) => i.riskLevel === "high").length,
      medium: items.filter((i) => i.riskLevel === "medium").length,
      total: items.length,
    };
    return { items, summary };
  }

  @Get("forecast/workforce")
  @ApiOperation({
    summary: "Hourly/daily workforce load forecast (next 7 days)",
  })
  async getWorkforceForecast(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    return this.forecastEngine.computeWorkforceLoadForecast(merchantId);
  }

  @Get("forecast/delivery-risk")
  @ApiOperation({ summary: "Delivery delay probability for active orders" })
  async getDeliveryRiskForecast(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const items =
      await this.forecastEngine.computeDeliveryEtaForecast(merchantId);
    const high = items.filter((i) => i.delayProbability >= 0.5);
    return { items, highRiskCount: high.length };
  }

  @Get("forecast/model-metrics")
  @ApiOperation({ summary: "MAPE / accuracy metrics from last backtest" })
  async getForecastModelMetrics(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const metrics = await this.forecastEngine.backtestDemand(merchantId);
    const history = await this.pool.query(
      `SELECT forecast_type, mape, wmape, bias, mae, sample_size, computed_at
       FROM forecast_model_metrics
       WHERE merchant_id = $1
      ORDER BY computed_at DESC LIMIT 30`,
      [merchantId],
    );
    return { latest: metrics, history: history.rows };
  }

  @Get("forecast/replenishment")
  @ApiOperation({ summary: "Pending replenishment / PO recommendations" })
  async getReplenishmentList(
    @Req() req: Request,
    @Query("status") status = "pending",
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const VALID_STATUS = ["pending", "approved", "ordered", "dismissed"];
    const s = VALID_STATUS.includes(status) ? status : "pending";
    const rows = await this.pool.query(
      `SELECT rr.*, COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku, 'منتج') AS product_name
       FROM replenishment_recommendations rr
       LEFT JOIN inventory_items ii ON ii.id = rr.product_id
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
       WHERE rr.merchant_id = $1 AND rr.status = $2
       ORDER BY rr.urgency DESC, rr.computed_at DESC
       LIMIT 100`,
      [merchantId, s],
    );
    return { items: rows.rows, total: rows.rowCount };
  }

  @Post("forecast/what-if")
  @ApiOperation({
    summary: "What-if scenario simulator (demand, cashflow, campaign, pricing)",
  })
  async runWhatIfScenario(
    @Req() req: Request,
    @Body()
    body: {
      type: "demand" | "cashflow" | "campaign" | "pricing";
      params: Record<string, any>;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    if (!body?.type) throw new BadRequestException("type is required");
    const result = await this.forecastEngine.runWhatIf(merchantId, body);
    // Persist scenario for history
    await this.pool
      .query(
        `INSERT INTO what_if_scenarios (merchant_id, scenario_type, input_params, result_summary)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
        [
          merchantId,
          body.type,
          JSON.stringify(body.params),
          JSON.stringify(result),
        ],
      )
      .catch(() => {
        /* non-critical */
      });
    return result;
  }

  @Post("forecast/replenishment/:id/approve")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Approve a replenishment recommendation (creates PO marker)",
  })
  async approveReplenishment(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { poReference?: string } = {},
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const staffId = this.getSafeStaffId(req);
    const result = await this.pool.query(
      `UPDATE replenishment_recommendations
       SET status = 'approved', approved_by = $3, approved_at = NOW(), po_reference = $4
       WHERE id = $1 AND merchant_id = $2
       RETURNING *`,
      [id, merchantId, staffId ?? null, body.poReference ?? null],
    );
    if (!result.rowCount)
      throw new NotFoundException("Recommendation not found");
    return { ok: true, updated: result.rows[0] };
  }
}
