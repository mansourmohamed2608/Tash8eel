import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import { AgentSubscriptionService } from "./agent-subscription.service";

export interface StockLevel {
  catalogItemId: string;
  variantSku?: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  lastUpdated: Date;
}

export interface StockMovement {
  id: string;
  merchantId: string;
  catalogItemId: string;
  variantSku?: string;
  movementType: "IN" | "OUT" | "ADJUSTMENT" | "RESERVATION" | "RELEASE";
  quantity: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: Date;
}

export interface StockAlert {
  id: string;
  merchantId: string;
  catalogItemId: string;
  variantSku?: string;
  alertType: "LOW_STOCK" | "OUT_OF_STOCK" | "REORDER_POINT";
  currentQuantity: number;
  threshold: number;
  acknowledged: boolean;
  createdAt: Date;
}

export interface ReserveStockResult {
  success: boolean;
  reservationId?: string;
  error?: string;
  availableQuantity?: number;
}

/**
 * InventoryService - Manages stock levels, reservations, and alerts
 *
 * This service is designed to work with the Orchestrator to:
 * 1. Check stock availability before confirming orders
 * 2. Reserve stock when items are added to cart
 * 3. Release reservations if order is cancelled
 * 4. Generate low-stock alerts
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly outboxService: OutboxService,
    private readonly agentSubscriptionService: AgentSubscriptionService,
  ) {}

  /**
   * Check if inventory agent is enabled for merchant
   */
  async isInventoryEnabled(merchantId: string): Promise<boolean> {
    return this.agentSubscriptionService.isAgentEnabled(
      merchantId,
      "INVENTORY_AGENT",
    );
  }

  /**
   * Get current stock level for a catalog item
   */
  async getStockLevel(
    merchantId: string,
    catalogItemId: string,
    variantSku?: string,
  ): Promise<StockLevel | null> {
    // First check if inventory is enabled
    const enabled = await this.isInventoryEnabled(merchantId);
    if (!enabled) {
      // Return unlimited stock for merchants without inventory agent
      return {
        catalogItemId,
        variantSku,
        quantity: 999999,
        reservedQuantity: 0,
        availableQuantity: 999999,
        lowStockThreshold: 0,
        isLowStock: false,
        lastUpdated: new Date(),
      };
    }

    const result = await this.pool.query<{
      catalog_item_id: string;
      variant_sku: string | null;
      quantity: number;
      reserved_quantity: number;
      low_stock_threshold: number;
      updated_at: Date;
    }>(
      `SELECT catalog_item_id, variant_sku, quantity, reserved_quantity, low_stock_threshold, updated_at
       FROM catalog_item_stock
       WHERE merchant_id = $1 AND catalog_item_id = $2 
         AND (variant_sku = $3 OR ($3 IS NULL AND variant_sku IS NULL))`,
      [merchantId, catalogItemId, variantSku || null],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const availableQuantity = row.quantity - row.reserved_quantity;

    return {
      catalogItemId: row.catalog_item_id,
      variantSku: row.variant_sku || undefined,
      quantity: row.quantity,
      reservedQuantity: row.reserved_quantity,
      availableQuantity,
      lowStockThreshold: row.low_stock_threshold,
      isLowStock: availableQuantity <= row.low_stock_threshold,
      lastUpdated: row.updated_at,
    };
  }

  /**
   * Check availability for multiple items (for cart validation)
   */
  async checkAvailability(
    merchantId: string,
    items: Array<{
      catalogItemId: string;
      variantSku?: string;
      quantity: number;
    }>,
  ): Promise<{
    allAvailable: boolean;
    itemResults: Array<{
      catalogItemId: string;
      variantSku?: string;
      requested: number;
      available: number;
      isAvailable: boolean;
    }>;
  }> {
    const enabled = await this.isInventoryEnabled(merchantId);
    if (!enabled) {
      // All items available for merchants without inventory
      return {
        allAvailable: true,
        itemResults: items.map((item) => ({
          catalogItemId: item.catalogItemId,
          variantSku: item.variantSku,
          requested: item.quantity,
          available: 999999,
          isAvailable: true,
        })),
      };
    }

    const results = await Promise.all(
      items.map(async (item) => {
        const stock = await this.getStockLevel(
          merchantId,
          item.catalogItemId,
          item.variantSku,
        );
        const available = stock?.availableQuantity ?? 0;
        return {
          catalogItemId: item.catalogItemId,
          variantSku: item.variantSku,
          requested: item.quantity,
          available,
          isAvailable: available >= item.quantity,
        };
      }),
    );

    return {
      allAvailable: results.every((r) => r.isAvailable),
      itemResults: results,
    };
  }

  /**
   * Reserve stock for an order (called when order is created/confirmed)
   */
  async reserveStock(
    merchantId: string,
    orderId: string,
    items: Array<{
      catalogItemId: string;
      variantSku?: string;
      quantity: number;
    }>,
  ): Promise<ReserveStockResult[]> {
    const enabled = await this.isInventoryEnabled(merchantId);
    if (!enabled) {
      // Skip reservation for merchants without inventory
      return items.map(() => ({ success: true }));
    }

    const results: ReserveStockResult[] = [];

    for (const item of items) {
      const result = await this.reserveSingleItem(
        merchantId,
        orderId,
        item.catalogItemId,
        item.variantSku,
        item.quantity,
      );
      results.push(result);
    }

    // Publish reservation event
    if (results.some((r) => r.success)) {
      await this.outboxService.publishEvent({
        eventType: EVENT_TYPES.STOCK_RESERVED,
        aggregateType: "Order",
        aggregateId: orderId,
        merchantId,
        payload: {
          orderId,
          merchantId,
          items: items.map((item, i) => ({
            ...item,
            reserved: results[i].success,
          })),
        },
      });
    }

    return results;
  }

  private async reserveSingleItem(
    merchantId: string,
    orderId: string,
    catalogItemId: string,
    variantSku: string | undefined,
    quantity: number,
  ): Promise<ReserveStockResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Lock the stock row
      const stockResult = await client.query<{
        quantity: number;
        reserved_quantity: number;
      }>(
        `SELECT quantity, reserved_quantity 
         FROM catalog_item_stock
         WHERE merchant_id = $1 AND catalog_item_id = $2 
           AND (variant_sku = $3 OR ($3 IS NULL AND variant_sku IS NULL))
         FOR UPDATE`,
        [merchantId, catalogItemId, variantSku || null],
      );

      if (stockResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { success: false, error: "Stock record not found" };
      }

      const available =
        stockResult.rows[0].quantity - stockResult.rows[0].reserved_quantity;

      if (available < quantity) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: "Insufficient stock",
          availableQuantity: available,
        };
      }

      // Reserve the stock
      await client.query(
        `UPDATE catalog_item_stock 
         SET reserved_quantity = reserved_quantity + $1, updated_at = NOW()
         WHERE merchant_id = $2 AND catalog_item_id = $3 
           AND (variant_sku = $4 OR ($4 IS NULL AND variant_sku IS NULL))`,
        [quantity, merchantId, catalogItemId, variantSku || null],
      );

      // Record movement
      const movementResult = await client.query<{ id: string }>(
        `INSERT INTO stock_movements (merchant_id, catalog_item_id, variant_sku, movement_type, quantity, reason, reference_type, reference_id)
         VALUES ($1, $2, $3, 'RESERVATION', $4, 'Order reservation', 'ORDER', $5)
         RETURNING id`,
        [merchantId, catalogItemId, variantSku || null, quantity, orderId],
      );

      await client.query("COMMIT");

      return { success: true, reservationId: movementResult.rows[0].id };
    } catch (error: any) {
      await client.query("ROLLBACK");
      this.logger.error({
        msg: "Failed to reserve stock",
        merchantId,
        catalogItemId,
        error: error.message,
      });
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  }

  /**
   * Release reserved stock (called when order is cancelled)
   */
  async releaseReservation(
    merchantId: string,
    orderId: string,
    items: Array<{
      catalogItemId: string;
      variantSku?: string;
      quantity: number;
    }>,
  ): Promise<void> {
    const enabled = await this.isInventoryEnabled(merchantId);
    if (!enabled) return;

    for (const item of items) {
      await this.pool.query(
        `UPDATE catalog_item_stock 
         SET reserved_quantity = GREATEST(0, reserved_quantity - $1), updated_at = NOW()
         WHERE merchant_id = $2 AND catalog_item_id = $3 
           AND (variant_sku = $4 OR ($4 IS NULL AND variant_sku IS NULL))`,
        [
          item.quantity,
          merchantId,
          item.catalogItemId,
          item.variantSku || null,
        ],
      );

      // Record release movement
      await this.pool.query(
        `INSERT INTO stock_movements (merchant_id, catalog_item_id, variant_sku, movement_type, quantity, reason, reference_type, reference_id)
         VALUES ($1, $2, $3, 'RELEASE', $4, 'Order cancelled', 'ORDER', $5)`,
        [
          merchantId,
          item.catalogItemId,
          item.variantSku || null,
          item.quantity,
          orderId,
        ],
      );
    }

    this.logger.log({
      msg: "Stock reservation released",
      merchantId,
      orderId,
      itemCount: items.length,
    });
  }

  /**
   * Confirm stock deduction (called when order is shipped/delivered)
   */
  async confirmStockDeduction(
    merchantId: string,
    orderId: string,
    items: Array<{
      catalogItemId: string;
      variantSku?: string;
      quantity: number;
    }>,
  ): Promise<void> {
    const enabled = await this.isInventoryEnabled(merchantId);
    if (!enabled) return;

    for (const item of items) {
      // Deduct from both quantity and reserved
      await this.pool.query(
        `UPDATE catalog_item_stock 
         SET quantity = quantity - $1, 
             reserved_quantity = GREATEST(0, reserved_quantity - $1), 
             updated_at = NOW()
         WHERE merchant_id = $2 AND catalog_item_id = $3 
           AND (variant_sku = $4 OR ($4 IS NULL AND variant_sku IS NULL))`,
        [
          item.quantity,
          merchantId,
          item.catalogItemId,
          item.variantSku || null,
        ],
      );

      // Record outbound movement
      await this.pool.query(
        `INSERT INTO stock_movements (merchant_id, catalog_item_id, variant_sku, movement_type, quantity, reason, reference_type, reference_id)
         VALUES ($1, $2, $3, 'OUT', $4, 'Order fulfilled', 'ORDER', $5)`,
        [
          merchantId,
          item.catalogItemId,
          item.variantSku || null,
          item.quantity,
          orderId,
        ],
      );

      // Check for low stock
      await this.checkAndCreateLowStockAlert(
        merchantId,
        item.catalogItemId,
        item.variantSku,
      );
    }

    this.logger.log({
      msg: "Stock deducted for fulfilled order",
      merchantId,
      orderId,
      itemCount: items.length,
    });
  }

  /**
   * Adjust stock manually (admin function)
   */
  async adjustStock(
    merchantId: string,
    catalogItemId: string,
    variantSku: string | undefined,
    adjustment: number,
    reason: string,
  ): Promise<StockLevel> {
    await this.pool.query(
      `INSERT INTO catalog_item_stock (merchant_id, catalog_item_id, variant_sku, quantity)
       VALUES ($1, $2, $3, GREATEST(0, $4))
       ON CONFLICT (merchant_id, catalog_item_id, COALESCE(variant_sku, ''))
       DO UPDATE SET quantity = GREATEST(0, catalog_item_stock.quantity + $4), updated_at = NOW()`,
      [merchantId, catalogItemId, variantSku || null, adjustment],
    );

    // Record movement
    await this.pool.query(
      `INSERT INTO stock_movements (merchant_id, catalog_item_id, variant_sku, movement_type, quantity, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        merchantId,
        catalogItemId,
        variantSku || null,
        adjustment >= 0 ? "IN" : "ADJUSTMENT",
        Math.abs(adjustment),
        reason,
      ],
    );

    // Publish event
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.STOCK_ADJUSTED,
      aggregateType: "CatalogItem",
      aggregateId: catalogItemId,
      merchantId,
      payload: {
        merchantId,
        catalogItemId,
        variantSku,
        adjustment,
        reason,
      },
    });

    // Check for low stock alert
    await this.checkAndCreateLowStockAlert(
      merchantId,
      catalogItemId,
      variantSku,
    );

    const updatedStock = await this.getStockLevel(
      merchantId,
      catalogItemId,
      variantSku,
    );
    return updatedStock!;
  }

  /**
   * Check and create low stock alert if needed
   */
  private async checkAndCreateLowStockAlert(
    merchantId: string,
    catalogItemId: string,
    variantSku?: string,
  ): Promise<void> {
    const stock = await this.getStockLevel(
      merchantId,
      catalogItemId,
      variantSku,
    );
    if (!stock) return;

    if (stock.isLowStock) {
      const alertType =
        stock.availableQuantity === 0 ? "OUT_OF_STOCK" : "LOW_STOCK";

      // Check if alert already exists
      const existing = await this.pool.query(
        `SELECT id FROM stock_alerts 
         WHERE merchant_id = $1 AND catalog_item_id = $2 
           AND (variant_sku = $3 OR ($3 IS NULL AND variant_sku IS NULL))
           AND alert_type = $4 AND acknowledged = false`,
        [merchantId, catalogItemId, variantSku || null, alertType],
      );

      if (existing.rows.length === 0) {
        // Create new alert
        await this.pool.query(
          `INSERT INTO stock_alerts (merchant_id, catalog_item_id, variant_sku, alert_type, current_quantity, threshold)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            merchantId,
            catalogItemId,
            variantSku || null,
            alertType,
            stock.availableQuantity,
            stock.lowStockThreshold,
          ],
        );

        // Publish event
        await this.outboxService.publishEvent({
          eventType: EVENT_TYPES.STOCK_LOW,
          aggregateType: "CatalogItem",
          aggregateId: catalogItemId,
          merchantId,
          payload: {
            merchantId,
            catalogItemId,
            variantSku,
            alertType,
            currentQuantity: stock.availableQuantity,
            threshold: stock.lowStockThreshold,
          },
        });

        this.logger.log({
          msg: "Low stock alert created",
          merchantId,
          catalogItemId,
          alertType,
          currentQuantity: stock.availableQuantity,
        });
      }
    }
  }

  /**
   * Get pending stock alerts for merchant
   */
  async getAlerts(
    merchantId: string,
    acknowledged = false,
  ): Promise<StockAlert[]> {
    const result = await this.pool.query<{
      id: string;
      merchant_id: string;
      catalog_item_id: string;
      variant_sku: string | null;
      alert_type: "LOW_STOCK" | "OUT_OF_STOCK" | "REORDER_POINT";
      current_quantity: number;
      threshold: number;
      acknowledged: boolean;
      created_at: Date;
    }>(
      `SELECT * FROM stock_alerts 
       WHERE merchant_id = $1 AND acknowledged = $2
       ORDER BY created_at DESC`,
      [merchantId, acknowledged],
    );

    return result.rows.map((row) => ({
      id: row.id,
      merchantId: row.merchant_id,
      catalogItemId: row.catalog_item_id,
      variantSku: row.variant_sku || undefined,
      alertType: row.alert_type,
      currentQuantity: row.current_quantity,
      threshold: row.threshold,
      acknowledged: row.acknowledged,
      createdAt: row.created_at,
    }));
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, merchantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE stock_alerts SET acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [alertId, merchantId],
    );
  }

  /**
   * Get stock movement history
   */
  async getMovementHistory(
    merchantId: string,
    catalogItemId?: string,
    limit = 50,
  ): Promise<StockMovement[]> {
    const params: (string | number)[] = [merchantId];
    let query = `SELECT * FROM stock_movements WHERE merchant_id = $1`;

    if (catalogItemId) {
      query += ` AND catalog_item_id = $2`;
      params.push(catalogItemId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query<{
      id: string;
      merchant_id: string;
      catalog_item_id: string;
      variant_sku: string | null;
      movement_type: "IN" | "OUT" | "ADJUSTMENT" | "RESERVATION" | "RELEASE";
      quantity: number;
      reason: string;
      reference_type: string | null;
      reference_id: string | null;
      created_at: Date;
    }>(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      merchantId: row.merchant_id,
      catalogItemId: row.catalog_item_id,
      variantSku: row.variant_sku || undefined,
      movementType: row.movement_type,
      quantity: row.quantity,
      reason: row.reason,
      referenceType: row.reference_type || undefined,
      referenceId: row.reference_id || undefined,
      createdAt: row.created_at,
    }));
  }
}
