import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
  toBoolean,
  parseJsonObject,
  parseWindow,
  createStockMovementSafely,
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
export class PortalInventoryController {
  private readonly logger = new Logger(PortalInventoryController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get("inventory")
  @ApiOperation({
    summary: "List merchant inventory items (portal compatibility endpoint)",
  })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "lowStock", required: false })
  async getPortalInventory(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("lowStock") lowStockRaw?: string,
  ) {
    const merchantId = getMerchantId(req);
    const params: any[] = [merchantId];
    const conditions: string[] = ["ii.merchant_id = $1"];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(ii.sku ILIKE $${idx}
          OR COALESCE(NULLIF((to_jsonb(ii)->>'name'), ''), '') ILIKE $${idx}
          OR COALESCE(ci.name_ar, '') ILIKE $${idx}
          OR COALESCE(ci.name_en, '') ILIKE $${idx})`,
      );
    }

    const result = await this.pool.query(
      `WITH variant_totals AS (
         SELECT
           inventory_item_id,
           COALESCE(SUM(COALESCE(quantity_on_hand, 0)), 0) as quantity_on_hand,
           COALESCE(SUM(COALESCE(quantity_reserved, 0)), 0) as quantity_reserved,
           COALESCE(AVG(COALESCE(cost_price, 0)), 0) as avg_cost
         FROM inventory_variants
         WHERE merchant_id = $1 AND COALESCE(is_active, true) = true
         GROUP BY inventory_item_id
       )
       SELECT
         ii.id::text as id,
         ii.catalog_item_id::text as catalog_item_id,
         ii.sku,
         COALESCE(
           NULLIF((to_jsonb(ii)->>'name'), ''),
           NULLIF(ci.name_ar, ''),
           NULLIF(ci.name_en, ''),
           ii.sku
         ) as name,
         COALESCE(vt.quantity_on_hand, 0) as stock_quantity,
         COALESCE(vt.quantity_reserved, 0) as reserved_quantity,
         COALESCE(vt.quantity_on_hand - vt.quantity_reserved, 0) as available_quantity,
         COALESCE(NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric, vt.avg_cost, 0) as cost_price,
         COALESCE(NULLIF((to_jsonb(ci)->>'base_price'), '')::numeric, 0) as price,
         COALESCE(NULLIF((to_jsonb(ii)->>'low_stock_threshold'), '')::int, 5) as low_stock_threshold,
         (
           COALESCE(vt.quantity_on_hand - vt.quantity_reserved, 0)
           <= COALESCE(NULLIF((to_jsonb(ii)->>'low_stock_threshold'), '')::int, 5)
         ) as is_low_stock
       FROM inventory_items ii
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
       LEFT JOIN variant_totals vt ON vt.inventory_item_id = ii.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY name ASC`,
      params,
    );

    const lowStockOnly = toBoolean(lowStockRaw, false);
    const items = lowStockOnly
      ? result.rows.filter((row) => row.is_low_stock)
      : result.rows;

    return {
      total: items.length,
      items,
    };
  }

  @Patch("inventory/:id/stock")
  @ApiOperation({
    summary:
      "Set stock quantity for one inventory item/variant (portal compatibility endpoint)",
  })
  async patchPortalInventoryStock(
    @Req() req: Request,
    @Param("id") inventoryItemId: string,
    @Body() body: { quantity?: number; variantId?: string; reason?: string },
  ) {
    const merchantId = getMerchantId(req);
    const quantity = Math.max(0, Math.trunc(toNumber(body.quantity, 0)));
    const reason = body.reason || "تعديل يدوي من لوحة التحكم";

    const itemResult = await this.pool.query<{
      id: string;
      catalog_item_id: string | null;
      sku: string;
    }>(
      `SELECT id::text as id, catalog_item_id::text as catalog_item_id, sku
       FROM inventory_items
       WHERE merchant_id = $1
         AND (id::text = $2 OR sku = $2)
       LIMIT 1`,
      [merchantId, inventoryItemId],
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException("صنف المخزون غير موجود");
    }

    const item = itemResult.rows[0];
    const variantResult = await this.pool.query<{
      id: string;
      quantity_on_hand: string;
      sku: string;
    }>(
      `SELECT id::text as id, quantity_on_hand::text as quantity_on_hand, sku
       FROM inventory_variants
       WHERE merchant_id = $1
         AND inventory_item_id::text = $2
         AND ($3::text IS NULL OR id::text = $3::text)
         AND COALESCE(is_active, true) = true
       ORDER BY quantity_on_hand DESC, created_at ASC
       LIMIT 1`,
      [merchantId, item.id, body.variantId || null],
    );

    if (variantResult.rows.length > 0) {
      const variant = variantResult.rows[0];
      const before = toNumber(variant.quantity_on_hand, 0);
      const change = quantity - before;

      await this.pool.query(
        `UPDATE inventory_variants
         SET quantity_on_hand = $1, updated_at = NOW()
         WHERE merchant_id = $2 AND id::text = $3`,
        [quantity, merchantId, variant.id],
      );

      await createStockMovementSafely(
        {
          merchantId,
          catalogItemId: item.catalog_item_id,
          variantId: variant.id,
          movementType: "ADJUSTMENT",
          quantity: change,
          quantityBefore: before,
          quantityAfter: quantity,
          reason,
          referenceType: "portal",
          referenceId: item.id,
          metadata: {
            inventoryItemId: item.id,
            variantId: variant.id,
            variantSku: variant.sku,
          },
        },
        this.pool,
      );

      return {
        variantId: variant.id,
        quantityBefore: before,
        quantityAfter: quantity,
        change,
      };
    }

    if (!item.catalog_item_id) {
      throw new BadRequestException(
        "لا يمكن تعديل الكمية: لا يوجد Variant أو Catalog مرتبط",
      );
    }

    const catalogStock = await this.pool.query<{ stock_quantity: string }>(
      `SELECT COALESCE(stock_quantity, 0)::text as stock_quantity
       FROM catalog_items
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, item.catalog_item_id],
    );

    const before = toNumber(catalogStock.rows[0]?.stock_quantity, 0);
    const change = quantity - before;

    await this.pool.query(
      `UPDATE catalog_items
       SET stock_quantity = $1, updated_at = NOW()
       WHERE merchant_id = $2 AND id::text = $3`,
      [quantity, merchantId, item.catalog_item_id],
    );

    await createStockMovementSafely(
      {
        merchantId,
        catalogItemId: item.catalog_item_id,
        variantId: null,
        movementType: "ADJUSTMENT",
        quantity: change,
        quantityBefore: before,
        quantityAfter: quantity,
        reason,
        referenceType: "portal",
        referenceId: item.id,
        metadata: {
          inventoryItemId: item.id,
        },
      },
      this.pool,
    );

    return {
      variantId: null,
      quantityBefore: before,
      quantityAfter: quantity,
      change,
    };
  }

  @Get("inventory/order-consumption")
  @ApiOperation({ summary: "Order-based inventory consumption trace" })
  async getInventoryOrderConsumption(
    @Req() req: Request,
    @Query("days") days?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const merchantId = getMerchantId(req);
    const window = parseWindow(days, startDate, endDate);

    let orderItemRows: Array<{
      order_id: string;
      order_number: string;
      customer_name: string;
      status: string;
      created_at: Date;
      item_sku: string;
      product_name: string;
      consumed_qty: string;
    }> = [];

    try {
      const baseOrderItems = await this.pool.query<{
        order_id: string;
        order_number: string;
        customer_name: string;
        status: string;
        created_at: Date;
        item_sku: string;
        product_name: string;
        consumed_qty: string;
      }>(
        `SELECT
           o.id::text as order_id,
           COALESCE(o.order_number, o.id::text) as order_number,
           COALESCE(o.customer_name, c.name, c.phone, '—') as customer_name,
           o.status::text as status,
           o.created_at,
           COALESCE(NULLIF(oi.sku, ''), '-')::text as item_sku,
           COALESCE(NULLIF(oi.name, ''), NULLIF(oi.sku, ''), 'منتج')::text as product_name,
           SUM(COALESCE(oi.quantity, 0)::numeric)::text as consumed_qty
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.merchant_id = $1
           AND o.created_at >= $2
           AND o.created_at <= $3
           AND o.status::text NOT IN ('CANCELLED', 'DRAFT')
         GROUP BY
           o.id,
           o.order_number,
           o.customer_name,
           c.name,
           c.phone,
           o.status,
           o.created_at,
           COALESCE(NULLIF(oi.sku, ''), '-'),
           COALESCE(NULLIF(oi.name, ''), NULLIF(oi.sku, ''), 'منتج')
         ORDER BY o.created_at DESC, o.id::text, COALESCE(NULLIF(oi.sku, ''), '-')::text
         LIMIT 1500`,
        [merchantId, window.startDate, window.endDate],
      );
      orderItemRows = baseOrderItems.rows;
    } catch (error) {
      this.logger.warn(
        `Order consumption query fallback activated: ${(error as Error)?.message || error}`,
      );
      orderItemRows = [];
    }

    const costLookupBySku = new Map<
      string,
      { unitCost: number; productName: string }
    >();
    const skuList = Array.from(
      new Set(
        orderItemRows
          .map((row) => String(row.item_sku || "").trim())
          .filter((sku) => sku && sku !== "-"),
      ),
    );
    if (skuList.length > 0) {
      try {
        const costLookupRows = await this.pool.query<{
          item_sku: string;
          unit_cost: string;
          product_name: string;
        }>(
          `WITH variant_costs AS (
             SELECT
               iv.sku::text as item_sku,
               COALESCE(
                 NULLIF((to_jsonb(iv)->>'cost_price'), '')::numeric,
                 NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric,
                 0
               )::numeric as unit_cost,
               COALESCE(
                 NULLIF(iv.name, ''),
                 NULLIF(ci.name_ar, ''),
                 NULLIF(ci.name_en, ''),
                 NULLIF(ii.sku, ''),
                 iv.sku
               )::text as product_name
             FROM inventory_variants iv
             LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id AND ii.merchant_id = iv.merchant_id
             LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = iv.merchant_id
             WHERE iv.merchant_id = $1
               AND iv.sku = ANY($2::text[])
           ),
           item_costs AS (
             SELECT
               ii.sku::text as item_sku,
               COALESCE(NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric, 0)::numeric as unit_cost,
               COALESCE(
                 NULLIF((to_jsonb(ii)->>'name'), ''),
                 NULLIF(ci.name_ar, ''),
                 NULLIF(ci.name_en, ''),
                 ii.sku
               )::text as product_name
             FROM inventory_items ii
             LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
             WHERE ii.merchant_id = $1
               AND ii.sku = ANY($2::text[])
           ),
           combined AS (
             SELECT * FROM variant_costs
             UNION ALL
             SELECT * FROM item_costs
           )
           SELECT
             item_sku,
             MAX(unit_cost)::text as unit_cost,
             MAX(product_name)::text as product_name
           FROM combined
           GROUP BY item_sku`,
          [merchantId, skuList],
        );
        for (const row of costLookupRows.rows) {
          costLookupBySku.set(row.item_sku, {
            unitCost: toNumber(row.unit_cost, 0),
            productName: row.product_name || row.item_sku,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Order consumption cost lookup fallback activated: ${(error as Error)?.message || error}`,
        );
      }
    }

    let movementRows: Array<{
      reference_id: string | null;
      item_sku: string;
      quantity_before: string | null;
      quantity_after: string | null;
      created_at: Date;
    }> = [];
    try {
      const movementResult = await this.pool.query<{
        reference_id: string | null;
        item_sku: string;
        quantity_before: string | null;
        quantity_after: string | null;
        created_at: Date;
      }>(
        `SELECT
           sm.reference_id,
           COALESCE(
             NULLIF((to_jsonb(sm)->'metadata'->>'variantSku'), ''),
             NULLIF((to_jsonb(sm)->'metadata'->>'sku'), ''),
             NULLIF((to_jsonb(sm)->>'sku'), ''),
             '-'
           )::text as item_sku,
           NULLIF((to_jsonb(sm)->>'quantity_before'), '')::text as quantity_before,
           NULLIF((to_jsonb(sm)->>'quantity_after'), '')::text as quantity_after,
           sm.created_at
         FROM stock_movements sm
         WHERE sm.merchant_id = $1
           AND sm.created_at >= $2
           AND sm.created_at <= $3
           AND LOWER(COALESCE(sm.reference_type, '')) IN ('order', 'sale', 'orders')
           AND sm.reference_id IS NOT NULL
         ORDER BY sm.created_at DESC`,
        [merchantId, window.startDate, window.endDate],
      );
      movementRows = movementResult.rows;
    } catch (error) {
      this.logger.warn(
        `Stock movement lookup fallback activated: ${(error as Error)?.message || error}`,
      );
      movementRows = [];
    }

    const movementByOrderSku = new Map<
      string,
      { before: number; after: number }
    >();
    const movementByOrder = new Map<
      string,
      { before: number; after: number }
    >();
    for (const row of movementRows) {
      const ref = String(row.reference_id || "").trim();
      if (!ref) continue;
      const before = toNumber(row.quantity_before, 0);
      const after = toNumber(row.quantity_after, 0);
      const perSkuKey = `${ref}__${row.item_sku}`;
      if (!movementByOrderSku.has(perSkuKey)) {
        movementByOrderSku.set(perSkuKey, { before, after });
      }
      if (!movementByOrder.has(ref)) {
        movementByOrder.set(ref, { before, after });
      }
    }

    const orderMap = new Map<string, any>();
    let totalConsumedUnits = 0;
    let totalEstimatedCost = 0;

    for (const row of orderItemRows) {
      const orderKey = row.order_id || row.order_number;
      if (!orderMap.has(orderKey)) {
        orderMap.set(orderKey, {
          orderId: row.order_id,
          orderNumber: row.order_number || row.order_id,
          customerName: row.customer_name || "—",
          status: row.status || "—",
          totalConsumedUnits: 0,
          estimatedCost: 0,
          items: [],
          _createdAt: row.created_at,
        });
      }

      const costLookup = costLookupBySku.get(row.item_sku);
      const consumedQty = toNumber(row.consumed_qty, 0);
      const unitCost = toNumber(costLookup?.unitCost, 0);
      const estimatedCost = Number((consumedQty * unitCost).toFixed(2));

      const skuKeyById = `${row.order_id}__${row.item_sku}`;
      const skuKeyByNum = `${row.order_number}__${row.item_sku}`;
      const movement = movementByOrderSku.get(skuKeyById) ||
        movementByOrderSku.get(skuKeyByNum) ||
        movementByOrder.get(row.order_id) ||
        movementByOrder.get(row.order_number) || { before: 0, after: 0 };

      const order = orderMap.get(orderKey);
      order.items.push({
        sku: row.item_sku,
        productName: costLookup?.productName || row.product_name,
        consumedQty,
        quantityBefore: movement.before,
        quantityAfter: movement.after,
        unitCost,
        estimatedCost,
      });
      order.totalConsumedUnits += consumedQty;
      order.estimatedCost = Number(
        (order.estimatedCost + estimatedCost).toFixed(2),
      );
      totalConsumedUnits += consumedQty;
      totalEstimatedCost += estimatedCost;
    }

    const orders = Array.from(orderMap.values())
      .sort(
        (a, b) =>
          new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime(),
      )
      .map(({ _createdAt, ...rest }) => rest);

    return {
      summary: {
        orderCount: orders.length,
        totalConsumedUnits: Number(totalConsumedUnits.toFixed(3)),
        totalEstimatedCost: Number(totalEstimatedCost.toFixed(2)),
      },
      orders,
    };
  }

  @Get("inventory/movement-trace")
  @ApiOperation({ summary: "Trace stock movements with source breakdown" })
  async getInventoryMovementTrace(
    @Req() req: Request,
    @Query("days") days?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("source") source?: string,
  ) {
    const merchantId = getMerchantId(req);
    const window = parseWindow(days, startDate, endDate);

    const params: any[] = [merchantId, window.startDate, window.endDate];
    let sourceFilter = "";
    if (source && source !== "ALL") {
      params.push(String(source).toLowerCase());
      sourceFilter = `AND LOWER(COALESCE(sm.reference_type, sm.movement_type, 'manual')) = $${params.length}`;
    }

    const movementResult = await this.pool.query<{
      movement_id: string;
      created_at: Date;
      source: string;
      movement_type: string;
      reference_type: string | null;
      reference_id: string | null;
      quantity: string;
      quantity_before: string | null;
      quantity_after: string | null;
      reason: string | null;
      metadata: Record<string, any> | string | null;
      sku: string;
      product_name: string;
      unit_cost: string;
      order_number: string | null;
    }>(
      `SELECT
         sm.id::text as movement_id,
         sm.created_at,
         COALESCE(sm.reference_type, sm.movement_type, 'manual') as source,
         COALESCE(sm.movement_type, 'ADJUSTMENT') as movement_type,
         sm.reference_type,
         sm.reference_id,
         sm.quantity::text as quantity,
         NULLIF((to_jsonb(sm)->>'quantity_before'), '')::text as quantity_before,
         NULLIF((to_jsonb(sm)->>'quantity_after'), '')::text as quantity_after,
         COALESCE(NULLIF((to_jsonb(sm)->>'reason'), ''), sm.notes) as reason,
         COALESCE((to_jsonb(sm)->'metadata'), '{}'::jsonb) as metadata,
         COALESCE(iv.sku, ii.sku, ci.sku, '-') as sku,
         COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج') as product_name,
         COALESCE(
           NULLIF((to_jsonb(iv)->>'cost_price'), '')::numeric,
           NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric,
           0
         )::text as unit_cost,
         oref.order_number
       FROM stock_movements sm
       LEFT JOIN inventory_variants iv ON iv.id::text = (to_jsonb(sm)->>'variant_id')
       LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id
         OR ii.catalog_item_id::text = (to_jsonb(sm)->>'catalog_item_id')
       LEFT JOIN catalog_items ci ON ci.id::text = (to_jsonb(sm)->>'catalog_item_id')
       LEFT JOIN orders oref ON oref.merchant_id = sm.merchant_id
         AND (oref.id::text = sm.reference_id OR oref.order_number = sm.reference_id)
       WHERE sm.merchant_id = $1
         AND sm.created_at >= $2
         AND sm.created_at <= $3
         ${sourceFilter}
       ORDER BY sm.created_at DESC
       LIMIT 2000`,
      params,
    );

    const sourceLabels: Record<string, string> = {
      ORDER: "طلب",
      SALE: "بيع",
      RESTOCK: "توريد",
      ADJUSTMENT: "تعديل",
      RETURN: "مرتجع",
      TRANSFER: "نقل",
      MANUAL: "يدوي",
      PORTAL: "لوحة التحكم",
      IMPORT: "استيراد",
    };

    let totalInbound = 0;
    let totalOutbound = 0;
    let netOnHandImpact = 0;
    let totalEstimatedInboundCost = 0;
    let totalEstimatedOutboundCost = 0;
    const affectedSkus = new Set<string>();
    const sourceAgg = new Map<
      string,
      {
        source: string;
        count: number;
        inbound: number;
        outbound: number;
        net: number;
      }
    >();

    const movements = movementResult.rows.map((row) => {
      const qty = toNumber(row.quantity, 0);
      const unitCost = toNumber(row.unit_cost, 0);
      const estimatedCostImpact = Number((qty * unitCost).toFixed(2));
      const sourceCode = String(row.source || "manual").toUpperCase();
      const direction = qty > 0 ? "IN" : qty < 0 ? "OUT" : "NEUTRAL";
      const metadata = parseJsonObject(row.metadata);
      const fromLocationId =
        metadata.fromLocationId || metadata.from_location_id || null;
      const toLocationId =
        metadata.toLocationId || metadata.to_location_id || null;

      if (qty > 0) {
        totalInbound += qty;
        totalEstimatedInboundCost += qty * unitCost;
      } else if (qty < 0) {
        totalOutbound += Math.abs(qty);
        totalEstimatedOutboundCost += Math.abs(qty) * unitCost;
      }
      netOnHandImpact += qty;
      if (row.sku && row.sku !== "-") {
        affectedSkus.add(row.sku);
      }

      if (!sourceAgg.has(sourceCode)) {
        sourceAgg.set(sourceCode, {
          source: sourceCode,
          count: 0,
          inbound: 0,
          outbound: 0,
          net: 0,
        });
      }
      const sourceRow = sourceAgg.get(sourceCode)!;
      sourceRow.count += 1;
      if (qty > 0) sourceRow.inbound += qty;
      if (qty < 0) sourceRow.outbound += Math.abs(qty);
      sourceRow.net += qty;

      return {
        movementId: row.movement_id,
        createdAt: row.created_at,
        source: sourceCode,
        sourceLabel: sourceLabels[sourceCode] || sourceCode,
        movementType: row.movement_type,
        referenceType: row.reference_type || sourceCode,
        referenceId: row.reference_id || "-",
        sku: row.sku || "-",
        productName: row.product_name || "منتج",
        quantity: qty,
        quantityBefore: toNumber(row.quantity_before, 0),
        quantityAfter: toNumber(row.quantity_after, 0),
        unitCost,
        estimatedCostImpact,
        onHandImpact: qty,
        direction,
        reason: row.reason || "",
        orderNumber: row.order_number || null,
        fromLocationId: fromLocationId || null,
        toLocationId: toLocationId || null,
        fromLocationName: null as string | null,
        toLocationName: null as string | null,
      };
    });

    const locationIds = new Set<string>();
    for (const movement of movements) {
      if (movement.fromLocationId)
        locationIds.add(String(movement.fromLocationId));
      if (movement.toLocationId) locationIds.add(String(movement.toLocationId));
    }
    const locationNameMap = new Map<string, string>();
    if (locationIds.size > 0) {
      const locationResult = await this.pool.query<{
        id: string;
        location_name: string;
      }>(
        `SELECT id::text as id, COALESCE(NULLIF(name_ar, ''), name) as location_name
         FROM warehouse_locations
         WHERE merchant_id = $1 AND id = ANY($2::uuid[])`,
        [merchantId, Array.from(locationIds)],
      );
      for (const row of locationResult.rows) {
        locationNameMap.set(row.id, row.location_name);
      }
    }

    for (const movement of movements) {
      if (movement.fromLocationId) {
        movement.fromLocationName =
          locationNameMap.get(String(movement.fromLocationId)) || null;
      }
      if (movement.toLocationId) {
        movement.toLocationName =
          locationNameMap.get(String(movement.toLocationId)) || null;
      }
    }

    return {
      summary: {
        totalMovements: movements.length,
        affectedSkus: affectedSkus.size,
        totalInbound: Number(totalInbound.toFixed(3)),
        totalOutbound: Number(totalOutbound.toFixed(3)),
        netOnHandImpact: Number(netOnHandImpact.toFixed(3)),
        totalEstimatedInboundCost: Number(totalEstimatedInboundCost.toFixed(2)),
        totalEstimatedOutboundCost: Number(
          totalEstimatedOutboundCost.toFixed(2),
        ),
        estimatedNetCostImpact: Number(
          (totalEstimatedInboundCost - totalEstimatedOutboundCost).toFixed(2),
        ),
      },
      bySource: Array.from(sourceAgg.values())
        .map((row) => ({
          ...row,
          inbound: Number(row.inbound.toFixed(3)),
          outbound: Number(row.outbound.toFixed(3)),
          net: Number(row.net.toFixed(3)),
        }))
        .sort((a, b) => b.count - a.count),
      movements,
    };
  }

  @Get("inventory/location-balance")
  @ApiOperation({
    summary: "Location-level stock balance and transfer recommendations",
  })
  async getInventoryLocationBalance(
    @Req() req: Request,
    @Query("days") days?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const merchantId = getMerchantId(req);
    const window = parseWindow(days, startDate, endDate);

    const locationResult = await this.pool.query<{
      location_id: string;
      location_name: string;
      is_default: boolean;
      total_on_hand: string;
      total_reserved: string;
      total_available: string;
      variants_count: string;
      products_count: string;
      low_stock_variants: string;
      zero_stock_variants: string;
    }>(
      `SELECT
         wl.id::text as location_id,
         COALESCE(NULLIF(wl.name_ar, ''), wl.name) as location_name,
         COALESCE(wl.is_default, false) as is_default,
         COALESCE(SUM(COALESCE(sbl.quantity_on_hand, 0)), 0)::text as total_on_hand,
         COALESCE(SUM(COALESCE(sbl.quantity_reserved, 0)), 0)::text as total_reserved,
         COALESCE(SUM(COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0)), 0)::text as total_available,
         COUNT(DISTINCT sbl.variant_id)::text as variants_count,
         COUNT(DISTINCT iv.inventory_item_id)::text as products_count,
         COUNT(DISTINCT CASE
           WHEN (COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0))
             <= COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5)
           THEN sbl.variant_id END)::text as low_stock_variants,
         COUNT(DISTINCT CASE
           WHEN (COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0)) <= 0
           THEN sbl.variant_id END)::text as zero_stock_variants
       FROM warehouse_locations wl
       LEFT JOIN inventory_stock_by_location sbl
         ON sbl.location_id = wl.id
         AND sbl.merchant_id = wl.merchant_id
       LEFT JOIN inventory_variants iv
         ON iv.id = sbl.variant_id
         AND iv.merchant_id = wl.merchant_id
       LEFT JOIN inventory_items ii
         ON ii.id = iv.inventory_item_id
         AND ii.merchant_id = wl.merchant_id
       WHERE wl.merchant_id = $1
         AND COALESCE(wl.is_active, true) = true
       GROUP BY wl.id, wl.name, wl.name_ar, wl.is_default
       ORDER BY wl.is_default DESC, wl.name ASC`,
      [merchantId],
    );

    const transferStatsResult = await this.pool.query<{
      from_location_id: string | null;
      to_location_id: string | null;
      movement_type: string;
      qty: string;
    }>(
      `SELECT
         COALESCE((to_jsonb(sm)->'metadata'->>'fromLocationId'), (to_jsonb(sm)->'metadata'->>'from_location_id')) as from_location_id,
         COALESCE((to_jsonb(sm)->'metadata'->>'toLocationId'), (to_jsonb(sm)->'metadata'->>'to_location_id')) as to_location_id,
         COALESCE(sm.movement_type, '') as movement_type,
         ABS(COALESCE(sm.quantity, 0))::text as qty
       FROM stock_movements sm
       WHERE sm.merchant_id = $1
         AND sm.created_at >= $2
         AND sm.created_at <= $3`,
      [merchantId, window.startDate, window.endDate],
    );

    const transferInMap = new Map<string, number>();
    const transferOutMap = new Map<string, number>();
    const purchaseMap = new Map<string, number>();
    for (const row of transferStatsResult.rows) {
      const qty = toNumber(row.qty, 0);
      const movementType = String(row.movement_type || "").toUpperCase();
      if (row.from_location_id) {
        transferOutMap.set(
          row.from_location_id,
          (transferOutMap.get(row.from_location_id) || 0) + qty,
        );
      }
      if (row.to_location_id) {
        transferInMap.set(
          row.to_location_id,
          (transferInMap.get(row.to_location_id) || 0) + qty,
        );
      }
      if (
        row.to_location_id &&
        ["RESTOCK", "PURCHASE", "IN"].includes(movementType)
      ) {
        purchaseMap.set(
          row.to_location_id,
          (purchaseMap.get(row.to_location_id) || 0) + qty,
        );
      }
    }

    const locationRows = locationResult.rows.map((row) => {
      const locationId = row.location_id;
      const available = toNumber(row.total_available, 0);
      const lowCount = toNumber(row.low_stock_variants, 0);
      const zeroCount = toNumber(row.zero_stock_variants, 0);
      const recentDemandUnits = toNumber(transferOutMap.get(locationId), 0);
      const dailyDemand = window.days > 0 ? recentDemandUnits / window.days : 0;
      const coverageDays =
        dailyDemand > 0 ? Number((available / dailyDemand).toFixed(2)) : null;

      let actionRecommendation = "متوازن";
      let riskLevel = "LOW";
      if (zeroCount > 0) {
        actionRecommendation = "شراء عاجل";
        riskLevel = "HIGH";
      } else if (lowCount > 0) {
        actionRecommendation = "نقل داخلي أو شراء";
        riskLevel = "MEDIUM";
      }

      return {
        locationId,
        locationName: row.location_name,
        isDefault: toBoolean(row.is_default, false),
        totalOnHand: toNumber(row.total_on_hand, 0),
        totalReserved: toNumber(row.total_reserved, 0),
        totalAvailable: available,
        variantsCount: toNumber(row.variants_count, 0),
        productsCount: toNumber(row.products_count, 0),
        lowStockVariants: lowCount,
        zeroStockVariants: zeroCount,
        recentDemandUnits: Number(recentDemandUnits.toFixed(3)),
        recentDemandOrders: 0,
        dailyDemand: Number(dailyDemand.toFixed(3)),
        coverageDays,
        transferInQty: Number(
          toNumber(transferInMap.get(locationId), 0).toFixed(3),
        ),
        transferOutQty: Number(
          toNumber(transferOutMap.get(locationId), 0).toFixed(3),
        ),
        purchaseQty: Number(
          toNumber(purchaseMap.get(locationId), 0).toFixed(3),
        ),
        actionRecommendation,
        riskLevel,
      };
    });

    const variantByLocationResult = await this.pool.query<{
      variant_id: string;
      sku: string;
      product_name: string;
      location_id: string;
      location_name: string;
      available_qty: string;
      threshold: string;
      reorder_qty: string;
    }>(
      `SELECT
         sbl.variant_id::text as variant_id,
         COALESCE(iv.sku, '-') as sku,
         COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج') as product_name,
         sbl.location_id::text as location_id,
         COALESCE(NULLIF(wl.name_ar, ''), wl.name) as location_name,
         (COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0))::text as available_qty,
         COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5)::text as threshold,
         COALESCE(ii.reorder_quantity, COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5) * 2)::text as reorder_qty
       FROM inventory_stock_by_location sbl
       JOIN warehouse_locations wl ON wl.id = sbl.location_id
         AND wl.merchant_id = sbl.merchant_id
         AND COALESCE(wl.is_active, true) = true
       JOIN inventory_variants iv ON iv.id = sbl.variant_id AND iv.merchant_id = sbl.merchant_id
       LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id AND ii.merchant_id = sbl.merchant_id
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = sbl.merchant_id
       WHERE sbl.merchant_id = $1`,
      [merchantId],
    );

    const byVariant = new Map<string, typeof variantByLocationResult.rows>();
    for (const row of variantByLocationResult.rows) {
      if (!byVariant.has(row.variant_id)) {
        byVariant.set(row.variant_id, []);
      }
      byVariant.get(row.variant_id)!.push(row);
    }

    const transferRecommendations: Array<{
      variantId: string;
      sku: string;
      productName: string;
      fromLocationId: string;
      fromLocationName: string;
      toLocationId: string;
      toLocationName: string;
      quantity: number;
      reason: string;
    }> = [];
    const purchaseRecommendations: Array<{
      variantId: string;
      sku: string;
      productName: string;
      locationId: string;
      locationName: string;
      suggestedQty: number;
      reason: string;
    }> = [];

    for (const [variantId, rows] of byVariant.entries()) {
      const needs = rows
        .map((row) => ({
          ...row,
          available: toNumber(row.available_qty, 0),
          threshold: toNumber(row.threshold, 5),
          reorderQty: toNumber(row.reorder_qty, 10),
        }))
        .filter((row) => row.available < row.threshold);

      const donors = rows
        .map((row) => ({
          ...row,
          available: toNumber(row.available_qty, 0),
          threshold: toNumber(row.threshold, 5),
          reorderQty: toNumber(row.reorder_qty, 10),
        }))
        .filter((row) => row.available > row.threshold + 1)
        .sort((a, b) => b.available - a.available);

      for (const need of needs) {
        let deficit = Math.max(need.threshold - need.available, 0);
        for (const donor of donors) {
          if (deficit <= 0) break;
          if (donor.location_id === need.location_id) continue;
          const donorSurplus = Math.max(donor.available - donor.threshold, 0);
          if (donorSurplus <= 0) continue;

          const transferQty = Math.min(deficit, donorSurplus);
          if (transferQty <= 0) continue;

          transferRecommendations.push({
            variantId,
            sku: need.sku,
            productName: need.product_name,
            fromLocationId: donor.location_id,
            fromLocationName: donor.location_name,
            toLocationId: need.location_id,
            toLocationName: need.location_name,
            quantity: Number(transferQty.toFixed(3)),
            reason: `تغطية عجز ${need.location_name} من فائض ${donor.location_name}`,
          });

          donor.available -= transferQty;
          deficit -= transferQty;
        }

        if (deficit > 0) {
          purchaseRecommendations.push({
            variantId,
            sku: need.sku,
            productName: need.product_name,
            locationId: need.location_id,
            locationName: need.location_name,
            suggestedQty: Math.max(
              Math.ceil(deficit),
              Math.ceil(need.reorderQty),
            ),
            reason: `عجز بعد النقل الداخلي (${deficit.toFixed(2)})`,
          });
        }
      }
    }

    const locationsNeedTransfer = new Set(
      transferRecommendations.map((rec) => rec.toLocationId),
    ).size;
    const locationsNeedPurchase = new Set(
      purchaseRecommendations.map((rec) => rec.locationId),
    ).size;

    return {
      summary: {
        totalLocations: locationRows.length,
        locationsNeedTransfer,
        locationsNeedPurchase,
        transferRecommendations: transferRecommendations.length,
        purchaseRecommendations: purchaseRecommendations.length,
      },
      locations: locationRows,
      transferRecommendations: transferRecommendations.slice(0, 100),
      purchaseRecommendations: purchaseRecommendations.slice(0, 100),
    };
  }

  @Get("inventory/monthly-cost-trend")
  @ApiOperation({ summary: "Monthly weighted purchase cost trend per SKU" })
  async getInventoryMonthlyCostTrend(
    @Req() req: Request,
    @Query("months") monthsRaw?: string,
    @Query("sku") skuRaw?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const merchantId = getMerchantId(req);
    const requestedMonths = Number.parseInt(String(monthsRaw || ""), 10);
    const months = Number.isFinite(requestedMonths)
      ? Math.min(Math.max(requestedMonths, 1), 24)
      : 6;

    let start: Date;
    let end: Date;
    if (
      startDate &&
      endDate &&
      !Number.isNaN(new Date(startDate).getTime()) &&
      !Number.isNaN(new Date(endDate).getTime())
    ) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
      start = new Date(end);
      start.setMonth(start.getMonth() - (months - 1));
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    const skuFilter = skuRaw && skuRaw.trim() ? `%${skuRaw.trim()}%` : null;

    let lotsRows: Array<{
      item_sku: string;
      product_name: string;
      month_key: string;
      purchased_units: string;
      total_cost: string;
    }> = [];

    try {
      const lotsResult = await this.pool.query<{
        item_sku: string;
        product_name: string;
        month_key: string;
        purchased_units: string;
        total_cost: string;
      }>(
        `WITH lots_normalized AS (
           SELECT
             COALESCE(iv.sku, ii.sku, '-')::text as item_sku,
             COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج')::text as item_name,
             date_trunc('month', COALESCE(l.received_date::timestamp, l.created_at)) as month_bucket,
             GREATEST(COALESCE(l.quantity, 0), 0)::numeric as purchased_qty,
             (
               GREATEST(COALESCE(l.quantity, 0), 0)
               * COALESCE(l.cost_price, iv.cost_price, ii.cost_price, 0)
             )::numeric as purchased_cost
           FROM inventory_lots l
           LEFT JOIN inventory_variants iv ON iv.id = l.variant_id AND iv.merchant_id = l.merchant_id
           LEFT JOIN inventory_items ii ON ii.id = COALESCE(l.item_id, iv.inventory_item_id) AND ii.merchant_id = l.merchant_id
           LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = l.merchant_id
           WHERE l.merchant_id = $1
             AND COALESCE(l.received_date::timestamp, l.created_at) >= $2
             AND COALESCE(l.received_date::timestamp, l.created_at) <= $3
         ),
         filtered_lots AS (
           SELECT *
           FROM lots_normalized
           WHERE ($4::text IS NULL OR item_sku ILIKE $4)
         )
         SELECT
           item_sku,
           item_name as product_name,
           to_char(month_bucket, 'YYYY-MM') as month_key,
           SUM(purchased_qty)::text as purchased_units,
           SUM(purchased_cost)::text as total_cost
         FROM filtered_lots
         GROUP BY item_sku, item_name, month_bucket
         HAVING SUM(purchased_qty) > 0
         ORDER BY item_sku, month_bucket`,
        [merchantId, start, end, skuFilter],
      );
      lotsRows = lotsResult.rows;
    } catch (error) {
      this.logger.warn(
        `Monthly cost trend lots query fallback activated: ${(error as Error)?.message || error}`,
      );
      lotsRows = [];
    }

    const dataSource = lotsRows.length > 0 ? "LOTS" : "MOVEMENTS";
    let movementRows: Array<{
      item_sku: string;
      product_name: string;
      month_key: string;
      purchased_units: string;
      total_cost: string;
    }> = [];

    if (dataSource === "MOVEMENTS") {
      try {
        const movementResult = await this.pool.query<{
          item_sku: string;
          product_name: string;
          month_key: string;
          purchased_units: string;
          total_cost: string;
        }>(
          `WITH movement_purchases_raw AS (
             SELECT
               COALESCE(iv.sku, ii.sku, ci.sku, '-')::text as item_sku,
               COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج')::text as item_name,
               date_trunc('month', sm.created_at) as month_bucket,
               CASE WHEN sm.quantity > 0 THEN sm.quantity::numeric ELSE 0 END as purchased_qty,
               CASE WHEN sm.quantity > 0
                 THEN sm.quantity::numeric * COALESCE(iv.cost_price, ii.cost_price, 0)::numeric
                 ELSE 0
               END as purchased_cost
             FROM stock_movements sm
             LEFT JOIN inventory_variants iv ON iv.id::text = (to_jsonb(sm)->>'variant_id')
             LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id
               OR ii.catalog_item_id::text = (to_jsonb(sm)->>'catalog_item_id')
             LEFT JOIN catalog_items ci ON ci.id::text = (to_jsonb(sm)->>'catalog_item_id')
             WHERE sm.merchant_id = $1
               AND sm.created_at >= $2
               AND sm.created_at <= $3
               AND sm.quantity > 0
               AND UPPER(COALESCE(sm.movement_type, '')) IN ('RESTOCK', 'PURCHASE', 'IN', 'ADJUSTMENT')
           ),
           movement_purchases AS (
             SELECT *
             FROM movement_purchases_raw
             WHERE ($4::text IS NULL OR item_sku ILIKE $4)
           )
           SELECT
             item_sku,
             item_name as product_name,
             to_char(month_bucket, 'YYYY-MM') as month_key,
             SUM(purchased_qty)::text as purchased_units,
             SUM(purchased_cost)::text as total_cost
           FROM movement_purchases
           GROUP BY item_sku, item_name, month_bucket
           HAVING SUM(purchased_qty) > 0
           ORDER BY item_sku, month_bucket`,
          [merchantId, start, end, skuFilter],
        );
        movementRows = movementResult.rows;
      } catch (error) {
        this.logger.warn(
          `Monthly cost trend movement query fallback activated: ${(error as Error)?.message || error}`,
        );
        try {
          const fallbackResult = await this.pool.query<{
            item_sku: string;
            product_name: string;
            month_key: string;
            purchased_units: string;
            total_cost: string;
          }>(
            `WITH movement_purchases_raw AS (
               SELECT
                 COALESCE(
                   NULLIF((to_jsonb(sm)->'metadata'->>'sku'), ''),
                   NULLIF((to_jsonb(sm)->>'sku'), ''),
                   '-'
                 )::text as item_sku,
                 COALESCE(
                   NULLIF((to_jsonb(sm)->'metadata'->>'productName'), ''),
                   NULLIF((to_jsonb(sm)->'metadata'->>'product_name'), ''),
                   NULLIF((to_jsonb(sm)->>'product_name'), ''),
                   'منتج'
                 )::text as item_name,
                 date_trunc('month', sm.created_at) as month_bucket,
                 CASE WHEN sm.quantity > 0 THEN sm.quantity::numeric ELSE 0 END as purchased_qty,
                 CASE WHEN sm.quantity > 0
                   THEN sm.quantity::numeric * COALESCE(
                     NULLIF((to_jsonb(sm)->'metadata'->>'unitCost'), '')::numeric,
                     NULLIF((to_jsonb(sm)->'metadata'->>'unit_cost'), '')::numeric,
                     NULLIF((to_jsonb(sm)->>'unit_cost'), '')::numeric,
                     0
                   )
                   ELSE 0
                 END as purchased_cost
               FROM stock_movements sm
               WHERE sm.merchant_id = $1
                 AND sm.created_at >= $2
                 AND sm.created_at <= $3
                 AND sm.quantity > 0
                 AND UPPER(COALESCE(sm.movement_type, '')) IN ('RESTOCK', 'PURCHASE', 'IN', 'ADJUSTMENT')
             ),
             movement_purchases AS (
               SELECT *
               FROM movement_purchases_raw
               WHERE ($4::text IS NULL OR item_sku ILIKE $4)
             )
             SELECT
               item_sku,
               item_name as product_name,
               to_char(month_bucket, 'YYYY-MM') as month_key,
               SUM(purchased_qty)::text as purchased_units,
               SUM(purchased_cost)::text as total_cost
             FROM movement_purchases
             GROUP BY item_sku, item_name, month_bucket
             HAVING SUM(purchased_qty) > 0
             ORDER BY item_sku, month_bucket`,
            [merchantId, start, end, skuFilter],
          );
          movementRows = fallbackResult.rows;
        } catch (fallbackError) {
          this.logger.warn(
            `Monthly cost trend movement fallback failed: ${(fallbackError as Error)?.message || fallbackError}`,
          );
          movementRows = [];
        }
      }
    }

    const rows = dataSource === "LOTS" ? lotsRows : movementRows;
    const itemMap = new Map<
      string,
      {
        sku: string;
        productName: string;
        totalPurchasedUnits: number;
        totalPurchasedCost: number;
        months: Array<{
          month: string;
          purchasedUnits: number;
          totalCost: number;
          avgUnitCost: number;
        }>;
      }
    >();

    let totalPurchasedUnits = 0;
    let totalPurchasedCost = 0;

    for (const row of rows) {
      const key = `${row.item_sku}__${row.product_name}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          sku: row.item_sku,
          productName: row.product_name,
          totalPurchasedUnits: 0,
          totalPurchasedCost: 0,
          months: [],
        });
      }

      const units = toNumber(row.purchased_units, 0);
      const cost = toNumber(row.total_cost, 0);
      const avg = units > 0 ? cost / units : 0;
      const item = itemMap.get(key)!;
      item.months.push({
        month: row.month_key,
        purchasedUnits: Number(units.toFixed(3)),
        totalCost: Number(cost.toFixed(2)),
        avgUnitCost: Number(avg.toFixed(4)),
      });
      item.totalPurchasedUnits += units;
      item.totalPurchasedCost += cost;
      totalPurchasedUnits += units;
      totalPurchasedCost += cost;
    }

    const items = Array.from(itemMap.values())
      .map((item) => ({
        ...item,
        totalPurchasedUnits: Number(item.totalPurchasedUnits.toFixed(3)),
        totalPurchasedCost: Number(item.totalPurchasedCost.toFixed(2)),
        overallAvgUnitCost:
          item.totalPurchasedUnits > 0
            ? Number(
                (item.totalPurchasedCost / item.totalPurchasedUnits).toFixed(4),
              )
            : 0,
        months: item.months.sort((a, b) => a.month.localeCompare(b.month)),
      }))
      .sort((a, b) => b.totalPurchasedCost - a.totalPurchasedCost);

    return {
      source: dataSource,
      summary: {
        totalSkus: items.length,
        totalPurchasedUnits: Number(totalPurchasedUnits.toFixed(3)),
        totalPurchasedCost: Number(totalPurchasedCost.toFixed(2)),
      },
      items,
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    };
  }
}
