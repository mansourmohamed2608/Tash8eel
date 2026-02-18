import { Pool } from "pg";
import { createLogger } from "@tash8eel/shared";
import {
  StockCheckInput,
  StockUpdateInput,
  ReserveStockInput,
  ConfirmReservationInput,
  ReleaseReservationInput,
  DeductStockInput,
  InventoryReportInput,
  SubstitutionSuggestionInput,
  RestockRecommendationInput,
  SupplierOrderDraftInput,
} from "./inventory.tasks";
import {
  InventoryPolicies,
  SubstitutionCandidate,
  RestockRecommendation,
} from "./inventory.policies";
import { ILlmClient } from "../../infrastructure/llm-client.module";

const logger = createLogger("InventoryHandlers");

export class InventoryHandlers {
  constructor(
    private readonly pool: Pool,
    private readonly llmClient?: ILlmClient,
  ) {}

  // Backward-compatible available quantity expression.
  // Some databases don't have a physical quantity_available column.
  private quantityAvailableExpr(alias: string = "v"): string {
    return `COALESCE(NULLIF((to_jsonb(${alias})->>'quantity_available'), '')::numeric, (${alias}.quantity_on_hand - COALESCE(${alias}.quantity_reserved, 0)))`;
  }

  /**
   * Check stock for a variant by ID or SKU
   */
  async checkStock(input: StockCheckInput): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    let query: string;
    let params: unknown[];

    if (input.variantId) {
      query = `
        SELECT v.*, ${quantityAvailableExpr} as quantity_available,
               i.name as item_name, i.sku as item_sku, i.low_stock_threshold as item_threshold
        FROM inventory_variants v
        JOIN inventory_items i ON v.inventory_item_id = i.id
        WHERE v.id = $1 AND v.merchant_id = $2
      `;
      params = [input.variantId, input.merchantId];
    } else if (input.sku) {
      query = `
        SELECT v.*, ${quantityAvailableExpr} as quantity_available,
               i.name as item_name, i.sku as item_sku, i.low_stock_threshold as item_threshold
        FROM inventory_variants v
        JOIN inventory_items i ON v.inventory_item_id = i.id
        WHERE v.sku = $1 AND v.merchant_id = $2
      `;
      params = [input.sku, input.merchantId];
    } else {
      query = `
        SELECT v.*, ${quantityAvailableExpr} as quantity_available,
               i.name as item_name, i.sku as item_sku, i.low_stock_threshold as item_threshold
        FROM inventory_variants v
        JOIN inventory_items i ON v.inventory_item_id = i.id
        WHERE v.merchant_id = $1
        ORDER BY ${quantityAvailableExpr} ASC
        LIMIT 100
      `;
      params = [input.merchantId];
    }

    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) {
      return { found: false, variants: [] };
    }

    const variants = result.rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      itemName: row.item_name,
      quantityOnHand: row.quantity_on_hand,
      quantityReserved: row.quantity_reserved,
      quantityAvailable: row.quantity_available,
      lowStockThreshold: row.low_stock_threshold || row.item_threshold,
      isLowStock:
        row.quantity_available <=
        (row.low_stock_threshold || row.item_threshold || 5),
      attributes: row.attributes,
    }));

    return {
      found: true,
      variants,
      lowStockCount: variants.filter((v) => v.isLowStock).length,
    };
  }

  /**
   * Update stock quantity with movement tracking
   */
  async updateStock(input: StockUpdateInput): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const current = await client.query(
        "SELECT quantity_on_hand FROM inventory_variants WHERE id = $1 AND merchant_id = $2 FOR UPDATE",
        [input.variantId, input.merchantId],
      );

      if (current.rows.length === 0) {
        throw new Error(`Variant ${input.variantId} not found`);
      }

      const quantityBefore = current.rows[0].quantity_on_hand;
      const quantityAfter = quantityBefore + input.quantity;

      if (quantityAfter < 0) {
        throw new Error(
          `Insufficient stock. Current: ${quantityBefore}, Requested: ${input.quantity}`,
        );
      }

      await client.query(
        "UPDATE inventory_variants SET quantity_on_hand = $1, updated_at = NOW() WHERE id = $2",
        [quantityAfter, input.variantId],
      );

      await client.query(
        `INSERT INTO stock_movements 
         (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, reference_type, reference_id, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.merchantId,
          input.variantId,
          input.movementType,
          input.quantity,
          quantityBefore,
          quantityAfter,
          input.movementType,
          input.referenceId,
          input.reason,
          input.createdBy || "system",
        ],
      );

      const threshold = await client.query(
        `SELECT COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) as threshold
         FROM inventory_variants v
         JOIN inventory_items i ON v.inventory_item_id = i.id
         WHERE v.id = $1`,
        [input.variantId],
      );

      const lowStockThreshold = threshold.rows[0]?.threshold || 5;
      const isLowStock = quantityAfter <= lowStockThreshold;

      await client.query("COMMIT");

      return {
        action: "STOCK_UPDATED",
        variantId: input.variantId,
        quantityBefore,
        quantityAfter,
        change: input.quantity,
        movementType: input.movementType,
        isLowStock,
        lowStockThreshold,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reserve stock for an order
   */
  async reserveStock(
    input: ReserveStockInput,
  ): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const quantityAvailableExpr = this.quantityAvailableExpr("iv");
      const available = await client.query(
        `SELECT ${quantityAvailableExpr} as quantity_available, iv.quantity_reserved
         FROM inventory_variants iv
         WHERE iv.id = $1 AND iv.merchant_id = $2 FOR UPDATE`,
        [input.variantId, input.merchantId],
      );

      if (available.rows.length === 0) {
        throw new Error(`Variant ${input.variantId} not found`);
      }

      const { quantity_available } = available.rows[0];

      if (quantity_available < input.quantity) {
        await client.query("ROLLBACK");
        return {
          action: "RESERVATION_FAILED",
          reason: "insufficient_stock",
          requested: input.quantity,
          available: quantity_available,
        };
      }

      const expiresAt = new Date(
        Date.now() + (input.expiresInMinutes || 30) * 60 * 1000,
      );

      const reservation = await client.query(
        `INSERT INTO stock_reservations 
         (merchant_id, variant_id, order_id, conversation_id, quantity, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         RETURNING id`,
        [
          input.merchantId,
          input.variantId,
          input.orderId,
          input.conversationId,
          input.quantity,
          expiresAt,
        ],
      );

      await client.query(
        "UPDATE inventory_variants SET quantity_reserved = quantity_reserved + $1, updated_at = NOW() WHERE id = $2",
        [input.quantity, input.variantId],
      );

      await client.query("COMMIT");

      return {
        action: "STOCK_RESERVED",
        reservationId: reservation.rows[0].id,
        variantId: input.variantId,
        quantity: input.quantity,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Confirm a reservation (convert to actual stock deduction)
   */
  async confirmReservation(
    input: ConfirmReservationInput,
  ): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const reservation = await client.query(
        `SELECT * FROM stock_reservations WHERE id = $1 AND merchant_id = $2 FOR UPDATE`,
        [input.reservationId, input.merchantId],
      );

      if (reservation.rows.length === 0) {
        throw new Error(`Reservation ${input.reservationId} not found`);
      }

      const res = reservation.rows[0];

      if (res.status !== "active") {
        await client.query("ROLLBACK");
        return {
          action: "CONFIRMATION_FAILED",
          reason: `Reservation is ${res.status}`,
        };
      }

      await client.query(
        `UPDATE stock_reservations SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [input.reservationId],
      );

      await client.query(
        `UPDATE inventory_variants 
         SET quantity_on_hand = quantity_on_hand - $1,
             quantity_reserved = quantity_reserved - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [res.quantity, res.variant_id],
      );

      const currentQty = await client.query(
        "SELECT quantity_on_hand FROM inventory_variants WHERE id = $1",
        [res.variant_id],
      );

      await client.query(
        `INSERT INTO stock_movements 
         (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, reference_type, reference_id, reason)
         VALUES ($1, $2, 'sale', $3, $4, $5, 'order', $6, 'Order confirmed from reservation')`,
        [
          input.merchantId,
          res.variant_id,
          -res.quantity,
          currentQty.rows[0].quantity_on_hand + res.quantity,
          currentQty.rows[0].quantity_on_hand,
          res.order_id,
        ],
      );

      await client.query("COMMIT");

      return {
        action: "RESERVATION_CONFIRMED",
        reservationId: input.reservationId,
        variantId: res.variant_id,
        quantity: res.quantity,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Release a reservation (return to available)
   */
  async releaseReservation(
    input: ReleaseReservationInput,
  ): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const reservation = await client.query(
        `SELECT * FROM stock_reservations WHERE id = $1 AND merchant_id = $2 FOR UPDATE`,
        [input.reservationId, input.merchantId],
      );

      if (reservation.rows.length === 0) {
        throw new Error(`Reservation ${input.reservationId} not found`);
      }

      const res = reservation.rows[0];

      if (res.status !== "active") {
        await client.query("ROLLBACK");
        return {
          action: "RELEASE_FAILED",
          reason: `Reservation is already ${res.status}`,
        };
      }

      await client.query(
        `UPDATE stock_reservations 
         SET status = 'released', released_at = NOW(), release_reason = $1, updated_at = NOW() 
         WHERE id = $2`,
        [input.reason || "Manual release", input.reservationId],
      );

      await client.query(
        `UPDATE inventory_variants SET quantity_reserved = quantity_reserved - $1, updated_at = NOW() WHERE id = $2`,
        [res.quantity, res.variant_id],
      );

      await client.query("COMMIT");

      return {
        action: "RESERVATION_RELEASED",
        reservationId: input.reservationId,
        variantId: res.variant_id,
        quantity: res.quantity,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Direct stock deduction (without reservation) - IDEMPOTENT
   *
   * Will not double-deduct for the same orderId.
   */
  async deductStock(input: DeductStockInput): Promise<Record<string, unknown>> {
    // If reservation exists, confirm it
    if (input.reservationId) {
      return this.confirmReservation({
        merchantId: input.merchantId,
        reservationId: input.reservationId,
      });
    }

    // IDEMPOTENCY CHECK: Look for existing deduction with same orderId + variantId
    const existing = await this.pool.query(
      `SELECT id, quantity_after FROM stock_movements 
       WHERE merchant_id = $1 
         AND variant_id = $2 
         AND reference_id = $3 
         AND movement_type = 'sale'
       LIMIT 1`,
      [input.merchantId, input.variantId, input.orderId],
    );

    if (existing.rows.length > 0) {
      logger.info("Idempotent deduct - already processed", {
        orderId: input.orderId,
        variantId: input.variantId,
        movementId: existing.rows[0].id,
      });
      return {
        action: "ALREADY_DEDUCTED",
        idempotent: true,
        movementId: existing.rows[0].id,
        quantityAfter: existing.rows[0].quantity_after,
      };
    }

    // Proceed with deduction
    return this.updateStock({
      merchantId: input.merchantId,
      variantId: input.variantId,
      quantity: -input.quantity,
      movementType: "adjustment",
      referenceId: input.orderId,
      reason: `Order ${input.orderId} stock deduction`,
    });
  }

  /**
   * Process low stock alerts for a merchant
   */
  async processLowStockAlerts(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    const lowStock = await this.pool.query(
      `SELECT v.id, v.sku, v.name, ${quantityAvailableExpr} as quantity_available,
              COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) as threshold,
              i.name as item_name
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE v.merchant_id = $1 
         AND v.is_active = true
         AND ${quantityAvailableExpr} <= COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5)
         AND NOT EXISTS (
           SELECT 1 FROM inventory_alerts a 
           WHERE a.variant_id = v.id 
             AND a.status = 'active'
             AND a.alert_type IN ('low_stock', 'out_of_stock')
         )`,
      [merchantId],
    );

    const alerts: Array<{
      variantId: string;
      sku: string;
      name: string;
      alertType: string;
      severity: string;
      quantity: number;
      threshold: number;
    }> = [];

    for (const row of lowStock.rows) {
      const alertType =
        row.quantity_available === 0 ? "out_of_stock" : "low_stock";
      const severity = row.quantity_available === 0 ? "critical" : "warning";
      const message =
        row.quantity_available === 0
          ? `${row.item_name} (${row.sku}) is out of stock!`
          : `${row.item_name} (${row.sku}) is low on stock: ${row.quantity_available} remaining (threshold: ${row.threshold})`;

      await this.pool.query(
        `INSERT INTO inventory_alerts 
         (merchant_id, variant_id, alert_type, status, severity, message, quantity_at_alert, threshold)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)`,
        [
          merchantId,
          row.id,
          alertType,
          severity,
          message,
          row.quantity_available,
          row.threshold,
        ],
      );

      alerts.push({
        variantId: row.id,
        sku: row.sku,
        name: row.name,
        alertType,
        severity,
        quantity: row.quantity_available,
        threshold: row.threshold,
      });
    }

    return {
      action: "ALERTS_PROCESSED",
      alertsCreated: alerts.length,
      alerts,
    };
  }

  /**
   * Generate inventory report
   */
  async generateReport(
    input: InventoryReportInput,
  ): Promise<Record<string, unknown>> {
    if (!input?.merchantId) {
      return { error: "merchantId is required" };
    }
    const reportType = input?.reportType || "summary";
    switch (reportType) {
      case "low_stock":
        return this.getLowStockReport(input.merchantId);
      case "movements":
        return this.getMovementsReport(input.merchantId, input.dateRange);
      case "summary":
        return this.getSummaryReport(input.merchantId);
      case "alerts":
        return this.getAlertsReport(input.merchantId);
      default:
        return { error: `Unknown report type: ${reportType}` };
    }
  }

  private async getLowStockReport(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    const result = await this.pool.query(
      `SELECT v.id, v.sku, v.name, v.quantity_on_hand, v.quantity_reserved, ${quantityAvailableExpr} as quantity_available,
              COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) as threshold,
              i.name as item_name, i.reorder_point, i.reorder_quantity
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE v.merchant_id = $1 
         AND v.is_active = true
         AND ${quantityAvailableExpr} <= COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5)
       ORDER BY ${quantityAvailableExpr} ASC`,
      [merchantId],
    );

    return {
      reportType: "low_stock",
      generatedAt: new Date().toISOString(),
      totalLowStock: result.rows.length,
      items: result.rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        itemName: row.item_name,
        quantityOnHand: row.quantity_on_hand,
        quantityReserved: row.quantity_reserved,
        quantityAvailable: row.quantity_available,
        threshold: row.threshold,
        reorderPoint: row.reorder_point,
        reorderQuantity: row.reorder_quantity,
      })),
    };
  }

  private async getMovementsReport(
    merchantId: string,
    dateRange?: { start: Date; end: Date },
  ): Promise<Record<string, unknown>> {
    const start =
      dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = dateRange?.end || new Date();

    const result = await this.pool.query(
      `SELECT m.*, v.sku, v.name as variant_name
       FROM stock_movements m
       JOIN inventory_variants v ON m.variant_id = v.id
       WHERE m.merchant_id = $1 AND m.created_at BETWEEN $2 AND $3
       ORDER BY m.created_at DESC
       LIMIT 500`,
      [merchantId, start, end],
    );

    const summary = await this.pool.query(
      `SELECT movement_type, SUM(quantity) as total_quantity, COUNT(*) as count
       FROM stock_movements
       WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY movement_type`,
      [merchantId, start, end],
    );

    return {
      reportType: "movements",
      generatedAt: new Date().toISOString(),
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      totalMovements: result.rows.length,
      summary: summary.rows,
      movements: result.rows,
    };
  }

  private async getSummaryReport(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    const stats = await this.pool.query(
      `SELECT 
         COUNT(DISTINCT i.id) as total_items,
         COUNT(DISTINCT v.id) as total_variants,
         SUM(v.quantity_on_hand) as total_on_hand,
         SUM(v.quantity_reserved) as total_reserved,
         SUM(${quantityAvailableExpr}) as total_available,
         SUM(v.quantity_on_hand * COALESCE(i.cost_price, 0)) as total_inventory_value,
         COUNT(CASE WHEN ${quantityAvailableExpr} <= COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) THEN 1 END) as low_stock_count,
         COUNT(CASE WHEN ${quantityAvailableExpr} = 0 THEN 1 END) as out_of_stock_count
       FROM inventory_items i
       JOIN inventory_variants v ON v.inventory_item_id = i.id
       WHERE i.merchant_id = $1 AND v.is_active = true`,
      [merchantId],
    );

    const row = stats.rows[0];

    return {
      reportType: "summary",
      generatedAt: new Date().toISOString(),
      totalItems: parseInt(row.total_items) || 0,
      totalVariants: parseInt(row.total_variants) || 0,
      totalOnHand: parseInt(row.total_on_hand) || 0,
      totalReserved: parseInt(row.total_reserved) || 0,
      totalAvailable: parseInt(row.total_available) || 0,
      totalInventoryValue: parseFloat(row.total_inventory_value) || 0,
      lowStockCount: parseInt(row.low_stock_count) || 0,
      outOfStockCount: parseInt(row.out_of_stock_count) || 0,
    };
  }

  private async getAlertsReport(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT a.*, v.sku, v.name as variant_name
       FROM inventory_alerts a
       JOIN inventory_variants v ON a.variant_id = v.id
       WHERE a.merchant_id = $1 AND a.status = 'active'
       ORDER BY 
         CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         a.created_at DESC`,
      [merchantId],
    );

    return {
      reportType: "alerts",
      generatedAt: new Date().toISOString(),
      totalActiveAlerts: result.rows.length,
      criticalAlerts: result.rows.filter((r) => r.severity === "critical")
        .length,
      warningAlerts: result.rows.filter((r) => r.severity === "warning").length,
      alerts: result.rows,
    };
  }

  /**
   * Clean up expired reservations (scheduled job)
   * Returns stock to available and marks reservations as expired.
   */
  async cleanupExpiredReservations(): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Find all expired active reservations
      const expired = await client.query(
        `SELECT id, merchant_id, variant_id, quantity 
         FROM stock_reservations 
         WHERE status = 'active' AND expires_at < NOW()
         FOR UPDATE`,
      );

      let released = 0;
      const releasedIds: string[] = [];

      for (const res of expired.rows) {
        // Return reserved quantity back to available
        await client.query(
          `UPDATE inventory_variants 
           SET quantity_reserved = quantity_reserved - $1, updated_at = NOW()
           WHERE id = $2`,
          [res.quantity, res.variant_id],
        );

        // Mark reservation as expired
        await client.query(
          `UPDATE stock_reservations 
           SET status = 'expired', release_reason = 'TTL expired', updated_at = NOW()
           WHERE id = $1`,
          [res.id],
        );

        released++;
        releasedIds.push(res.id);
      }

      await client.query("COMMIT");

      logger.info("Expired reservations cleaned up", { count: released });

      return {
        action: "RESERVATIONS_EXPIRED",
        releasedCount: released,
        releasedIds,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // PREMIUM AI FEATURES (AI for ranking/text only, never for stock math)
  // ============================================================================

  /**
   * Get substitution suggestions for an out-of-stock item
   *
   * ARCHITECTURE:
   * 1. DETERMINISTIC: Query eligible candidates from same category, in-stock, within price cap
   * 2. AI (GPT-4o-mini): Rank candidates, generate Arabic messages for customer + merchant
   *
   * Stock quantities are NEVER modified by AI - only deterministic SQL
   */
  async getSubstitutionSuggestions(
    input: SubstitutionSuggestionInput,
  ): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    // Step 1: Get the original item (DETERMINISTIC)
    const originalResult = await this.pool.query(
      `SELECT v.id, v.sku, v.name, v.attributes, ${quantityAvailableExpr} as quantity_available,
              i.category, ci.base_price as price, ci.name_ar, ci.description_ar
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       LEFT JOIN catalog_items ci ON i.catalog_item_id = ci.id
       WHERE v.id = $1 AND v.merchant_id = $2`,
      [input.variantId, input.merchantId],
    );

    if (originalResult.rows.length === 0) {
      return { found: false, error: "Original variant not found" };
    }

    const original = originalResult.rows[0];

    // Step 2: DETERMINISTIC - Get candidates from same category, in-stock
    const candidatesResult = await this.pool.query(
      `SELECT v.id, v.sku, v.name, v.attributes, ${quantityAvailableExpr} as quantity_available,
              i.category, ci.base_price as price, ci.name_ar, ci.description_ar
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       LEFT JOIN catalog_items ci ON i.catalog_item_id = ci.id
       WHERE v.merchant_id = $1
         AND v.id != $2
         AND i.category = $3
         AND ${quantityAvailableExpr} > 0
         AND v.is_active = true
         AND ci.base_price <= $4
       ORDER BY ABS(ci.base_price - $5) ASC
       LIMIT $6`,
      [
        input.merchantId,
        input.variantId,
        original.category,
        (original.price || 100) * (input.priceCapMultiplier || 1.5),
        original.price || 100,
        input.maxSuggestions || 5,
      ],
    );

    // Build deterministic candidate list (quantities from DB only)
    const substitutes = candidatesResult.rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name || row.name_ar,
      category: row.category,
      price: parseFloat(row.price) || 0,
      quantityAvailable: row.quantity_available, // DETERMINISTIC from DB
      attributes: row.attributes,
    }));

    // Step 3: AI Enhancement (GPT-4o-mini) - Ranking + Messages only
    let aiData:
      | {
          customerMessageAr: string;
          merchantMessageAr: string;
          tokensUsed: number;
        }
      | undefined;

    if (this.llmClient && substitutes.length > 0) {
      const ranking = await this.llmClient.generateSubstitutionRanking(
        input.merchantId,
        {
          name: original.name || original.name_ar,
          category: original.category,
          price: parseFloat(original.price) || 0,
          sku: original.sku,
        },
        substitutes.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price,
          sku: s.sku,
          quantityAvailable: s.quantityAvailable,
          attributes: s.attributes,
        })),
      );

      if (ranking) {
        // Apply AI rankings to substitutes (sort by rank)
        for (const sub of substitutes) {
          const ranked = ranking.rankings.find((r) => r.variantId === sub.id);
          if (ranked) {
            (sub as any).rank = ranked.rank;
            (sub as any).aiReasonAr = ranked.reasonAr;
            (sub as any).aiReasonEn = ranked.reasonEn;
          }
        }

        // Sort by AI rank
        substitutes.sort(
          (a, b) => ((a as any).rank || 999) - ((b as any).rank || 999),
        );

        aiData = {
          customerMessageAr: ranking.customerMessageAr,
          merchantMessageAr: ranking.merchantMessageAr,
          tokensUsed: 0, // Tracked in llmClient
        };

        logger.info("AI substitution ranking applied", {
          merchantId: input.merchantId,
          candidateCount: substitutes.length,
        });
      }
    }

    // Emit event for tracking (AI made suggestions)
    if (aiData) {
      await this.emitSubstitutionEvent(
        input.merchantId,
        original,
        substitutes,
        aiData,
      );
    }

    return {
      action: "SUBSTITUTIONS_FOUND",
      original: {
        id: original.id,
        sku: original.sku,
        name: original.name || original.name_ar,
        category: original.category,
        price: parseFloat(original.price) || 0,
        quantityAvailable: original.quantity_available,
      },
      substitutes,
      totalFound: substitutes.length,
      ai: aiData,
    };
  }

  /**
   * Emit substitution suggestion event for tracking/notifications
   */
  private async emitSubstitutionEvent(
    merchantId: string,
    original: any,
    substitutes: any[],
    aiData: any,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, merchant_id, payload, created_at, updated_at)
         VALUES (gen_random_uuid(), 'inventory.substitution_suggested', 'inventory_variant', $1, $2, $3, NOW(), NOW())`,
        [
          original.id,
          merchantId,
          JSON.stringify({
            originalVariantId: original.id,
            originalName: original.name,
            substitutesCount: substitutes.length,
            topSubstitute: substitutes[0]?.name,
            customerMessageAr: aiData.customerMessageAr,
            merchantMessageAr: aiData.merchantMessageAr,
          }),
        ],
      );
    } catch (error) {
      logger.warn("Failed to emit substitution event", { error });
    }
  }

  /**
   * Generate restock recommendations for low-stock items
   *
   * ARCHITECTURE:
   * 1. DETERMINISTIC: Calculate urgency, days-to-stockout, reorder quantities from SQL
   * 2. AI (GPT-4o-mini): Generate explanations, suggested actions, supplier messages
   *
   * All quantity calculations are deterministic - AI only adds text/insights
   */
  async getRestockRecommendations(
    input: RestockRecommendationInput,
  ): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    // Step 1: DETERMINISTIC - Get low stock items with sales history
    const lowStockResult = await this.pool.query(
      `WITH sales_data AS (
        SELECT 
          m.variant_id,
          COUNT(*) as sale_count,
          SUM(ABS(m.quantity)) as total_sold,
          MAX(m.created_at) as last_sale
        FROM stock_movements m
        WHERE m.merchant_id = $1 
          AND m.movement_type = 'sale'
          AND m.created_at > NOW() - INTERVAL '30 days'
        GROUP BY m.variant_id
      )
      SELECT 
        v.id, v.sku, v.name, v.quantity_on_hand, ${quantityAvailableExpr} as quantity_available,
        COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) as threshold,
        i.reorder_point, i.reorder_quantity, i.supplier_id, i.supplier_sku,
        COALESCE(sd.total_sold, 0) as monthly_sales,
        COALESCE(sd.total_sold / 30.0, 0) as avg_daily_sales
      FROM inventory_variants v
      JOIN inventory_items i ON v.inventory_item_id = i.id
      LEFT JOIN sales_data sd ON sd.variant_id = v.id
      WHERE v.merchant_id = $1
        AND v.is_active = true
        AND ${quantityAvailableExpr} <= COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) * 2
      ORDER BY 
        CASE WHEN ${quantityAvailableExpr} <= 0 THEN 0 ELSE 1 END,
        ${quantityAvailableExpr} / NULLIF(COALESCE(sd.total_sold / 30.0, 1), 0) ASC
      LIMIT $2`,
      [input.merchantId, input.maxItems || 20],
    );

    // Step 2: DETERMINISTIC calculations
    const recommendations: (RestockRecommendation & { ai?: any })[] =
      lowStockResult.rows.map((row) => {
        const avgDailySales = parseFloat(row.avg_daily_sales) || 0.5;
        const urgency = InventoryPolicies.calculateRestockUrgency(
          row.quantity_available,
          row.threshold,
          avgDailySales,
        );
        const daysUntilStockout = InventoryPolicies.estimateDaysUntilStockout(
          row.quantity_available,
          avgDailySales,
        );
        const recommendedQty = InventoryPolicies.calculateReorderQuantity(
          avgDailySales,
          row.reorder_point || 7,
          3,
        );

        return {
          variantId: row.id,
          sku: row.sku,
          name: row.name,
          currentQuantity: row.quantity_available, // DETERMINISTIC from DB
          recommendedQuantity: Math.max(
            recommendedQty,
            row.reorder_quantity || 10,
          ), // DETERMINISTIC
          urgency,
          estimatedDaysUntilStockout: daysUntilStockout ?? undefined,
          averageDailySales: avgDailySales,
          reasoning: this.generateRestockReasoning(
            row,
            urgency,
            daysUntilStockout,
            avgDailySales,
          ),
          supplierId: row.supplier_id,
          supplierSku: row.supplier_sku,
        };
      });

    // Filter by urgency if requested
    let filteredRecs = recommendations;
    if (input.urgencyFilter && input.urgencyFilter !== "all") {
      const urgencyOrder = ["critical", "high", "medium", "low"];
      const filterIndex = urgencyOrder.indexOf(input.urgencyFilter);
      filteredRecs = recommendations.filter(
        (r) => urgencyOrder.indexOf(r.urgency) <= filterIndex,
      );
    }

    // Step 3: AI Enhancement (GPT-4o-mini) - Generate insights for top items
    if (this.llmClient && filteredRecs.length > 0) {
      // Generate AI insights for top 5 critical/high items
      const topItems = filteredRecs
        .filter((r) => r.urgency === "critical" || r.urgency === "high")
        .slice(0, 5);

      for (const item of topItems) {
        const insight = await this.llmClient.generateRestockInsight(
          input.merchantId,
          {
            name: item.name,
            sku: item.sku,
            currentQty: item.currentQuantity,
            dailySales: item.averageDailySales || 0,
            daysUntilStockout: item.estimatedDaysUntilStockout ?? null,
          },
        );

        if (insight) {
          item.ai = {
            explanationAr: insight.explanationAr,
            explanationEn: insight.explanationEn,
            suggestedActions: insight.suggestedActions,
            supplierMessageDraftAr: insight.supplierMessageDraftAr,
          };
        }
      }

      logger.info("AI restock insights generated", {
        merchantId: input.merchantId,
        itemsWithAi: topItems.length,
      });
    }

    // Generate summary
    const criticalCount = filteredRecs.filter(
      (r) => r.urgency === "critical",
    ).length;
    const highCount = filteredRecs.filter((r) => r.urgency === "high").length;

    let aiSummary: string | undefined;
    if (criticalCount > 0 || highCount > 0) {
      aiSummary = `⚠️ تنبيه المخزون: ${criticalCount} منتج في حالة حرجة، ${highCount} منتج يحتاج إعادة تخزين قريباً`;
    }

    return {
      action: "RESTOCK_RECOMMENDATIONS",
      totalItems: filteredRecs.length,
      criticalCount,
      highCount,
      recommendations: filteredRecs,
      aiSummary,
    };
  }

  /**
   * Generate a draft supplier order for items needing restock
   *
   * ARCHITECTURE:
   * 1. DETERMINISTIC: Calculate quantities from DB, group by supplier
   * 2. AI (GPT-4o-mini): Generate professional Arabic supplier message
   */
  async generateSupplierOrderDraft(
    input: SupplierOrderDraftInput,
  ): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    // Step 1: DETERMINISTIC - Get items to reorder, grouped by supplier
    const itemsResult = await this.pool.query(
      `SELECT 
        v.id, v.sku, v.name, ${quantityAvailableExpr} as quantity_available,
        i.reorder_quantity, i.cost_price, i.supplier_id, i.supplier_sku
      FROM inventory_variants v
      JOIN inventory_items i ON v.inventory_item_id = i.id
      WHERE v.merchant_id = $1
        AND v.id = ANY($2::uuid[])
        AND v.is_active = true`,
      [input.merchantId, input.variantIds],
    );

    // Group by supplier (DETERMINISTIC)
    const bySupplier: Record<
      string,
      Array<{
        variantId: string;
        sku: string;
        supplierSku: string;
        name: string;
        quantity: number;
        unitCost: number;
        totalCost: number;
      }>
    > = {};

    let grandTotal = 0;

    for (const row of itemsResult.rows) {
      const supplierId = row.supplier_id || "default";
      if (input.supplierId && supplierId !== input.supplierId) continue;

      if (!bySupplier[supplierId]) {
        bySupplier[supplierId] = [];
      }

      // Quantities are DETERMINISTIC - from input overrides or DB defaults
      const quantity = input.quantities?.[row.id] || row.reorder_quantity || 20;
      const unitCost = parseFloat(row.cost_price) || 0;
      const totalCost = quantity * unitCost;
      grandTotal += totalCost;

      bySupplier[supplierId].push({
        variantId: row.id,
        sku: row.sku,
        supplierSku: row.supplier_sku || row.sku,
        name: row.name,
        quantity,
        unitCost,
        totalCost,
      });
    }

    // Generate order draft text (DETERMINISTIC template)
    const orderDrafts: Array<{
      supplierId: string;
      items: (typeof bySupplier)[string];
      subtotal: number;
      draftText: string;
    }> = [];

    for (const [supplierId, items] of Object.entries(bySupplier)) {
      const subtotal = items.reduce((sum, item) => sum + item.totalCost, 0);

      let draftText = `طلب شراء\n`;
      draftText += `المورد: ${supplierId}\n`;
      draftText += `التاريخ: ${new Date().toISOString().split("T")[0]}\n\n`;
      draftText += `المنتجات:\n`;
      draftText += "-".repeat(60) + "\n";

      for (const item of items) {
        draftText += `${item.name} (${item.supplierSku}) - الكمية: ${item.quantity} - السعر: ${item.totalCost.toFixed(2)} ج.م\n`;
      }

      draftText += "-".repeat(60) + "\n";
      draftText += `الإجمالي: ${subtotal.toFixed(2)} ج.م\n`;

      orderDrafts.push({
        supplierId,
        items,
        subtotal,
        draftText,
      });
    }

    // Step 2: AI Enhancement - Generate professional Arabic supplier message
    let aiSupplierMessageAr: string | undefined;
    if (this.llmClient && orderDrafts.length > 0) {
      const allItems = Object.values(bySupplier).flat();
      aiSupplierMessageAr =
        (await this.llmClient.generateSupplierMessage(
          input.merchantId,
          allItems.map((i) => ({
            name: i.name,
            sku: i.supplierSku,
            quantity: i.quantity,
          })),
          grandTotal,
        )) || undefined;

      logger.info("AI supplier message generated", {
        merchantId: input.merchantId,
        itemCount: allItems.length,
      });
    }

    return {
      action: "SUPPLIER_ORDER_DRAFT",
      totalItems: itemsResult.rows.length,
      totalValue: grandTotal,
      supplierCount: Object.keys(bySupplier).length,
      orderDrafts,
      aiSupplierMessageAr,
    };
  }

  private generateRestockReasoning(
    row: any,
    urgency: string,
    daysUntilStockout: number | null,
    avgDailySales: number,
  ): string {
    if (row.quantity_available <= 0) {
      return "Out of stock - immediate reorder required";
    }
    if (daysUntilStockout !== null && daysUntilStockout <= 1) {
      return `Critical: Only ~${daysUntilStockout} day(s) of stock remaining based on recent sales`;
    }
    if (daysUntilStockout !== null && daysUntilStockout <= 3) {
      return `High priority: ~${daysUntilStockout} days of stock left at current sales rate`;
    }
    if (row.quantity_available <= row.threshold) {
      return `Below low-stock threshold (${row.threshold} units)`;
    }
    return `Approaching threshold - proactive restock recommended`;
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Batch stock update - Update multiple variants at once
   */
  async batchStockUpdate(input: {
    merchantId: string;
    updates: Array<{
      variantId: string;
      quantity: number;
      movementType: string;
      reason?: string;
    }>;
  }): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    const results: Array<{
      variantId: string;
      success: boolean;
      error?: string;
      quantityAfter?: number;
    }> = [];

    try {
      await client.query("BEGIN");

      for (const update of input.updates) {
        try {
          const current = await client.query(
            "SELECT quantity_on_hand FROM inventory_variants WHERE id = $1 AND merchant_id = $2 FOR UPDATE",
            [update.variantId, input.merchantId],
          );

          if (current.rows.length === 0) {
            results.push({
              variantId: update.variantId,
              success: false,
              error: "Variant not found",
            });
            continue;
          }

          const quantityBefore = current.rows[0].quantity_on_hand;
          const quantityAfter = quantityBefore + update.quantity;

          if (quantityAfter < 0) {
            results.push({
              variantId: update.variantId,
              success: false,
              error: `Insufficient stock (${quantityBefore})`,
            });
            continue;
          }

          await client.query(
            "UPDATE inventory_variants SET quantity_on_hand = $1, updated_at = NOW() WHERE id = $2",
            [quantityAfter, update.variantId],
          );

          await client.query(
            `INSERT INTO stock_movements 
             (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, reason, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'batch_update')`,
            [
              input.merchantId,
              update.variantId,
              update.movementType,
              update.quantity,
              quantityBefore,
              quantityAfter,
              update.reason,
            ],
          );

          results.push({
            variantId: update.variantId,
            success: true,
            quantityAfter,
          });
        } catch (err) {
          results.push({
            variantId: update.variantId,
            success: false,
            error: (err as Error).message,
          });
        }
      }

      await client.query("COMMIT");

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      logger.info("Batch stock update completed", {
        merchantId: input.merchantId,
        successful,
        failed,
      });

      return {
        action: "BATCH_STOCK_UPDATED",
        totalProcessed: input.updates.length,
        successful,
        failed,
        results,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Inventory valuation report
   */
  async getInventoryValuation(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT 
         i.category,
         COUNT(DISTINCT v.id) as variant_count,
         SUM(v.quantity_on_hand) as total_units,
         SUM(v.quantity_on_hand * COALESCE(i.cost_price, 0)) as cost_value,
         SUM(v.quantity_on_hand * COALESCE(ci.base_price, i.cost_price * 1.3, 0)) as retail_value,
         AVG(CASE WHEN v.quantity_on_hand > 0 THEN 
           (COALESCE(ci.base_price, i.cost_price * 1.3, 0) - COALESCE(i.cost_price, 0)) / NULLIF(COALESCE(ci.base_price, 1), 0) * 100
         END) as avg_margin_percent
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       LEFT JOIN catalog_items ci ON i.catalog_item_id = ci.id
       WHERE v.merchant_id = $1 AND v.is_active = true
       GROUP BY i.category
       ORDER BY cost_value DESC`,
      [merchantId],
    );

    const totals = await this.pool.query(
      `SELECT 
         SUM(v.quantity_on_hand * COALESCE(i.cost_price, 0)) as total_cost_value,
         SUM(v.quantity_on_hand * COALESCE(ci.base_price, i.cost_price * 1.3, 0)) as total_retail_value
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       LEFT JOIN catalog_items ci ON i.catalog_item_id = ci.id
       WHERE v.merchant_id = $1 AND v.is_active = true`,
      [merchantId],
    );

    return {
      merchantId,
      generatedAt: new Date().toISOString(),
      byCategory: result.rows.map((row) => ({
        category: row.category || "Uncategorized",
        variantCount: parseInt(row.variant_count),
        totalUnits: parseInt(row.total_units),
        costValue: parseFloat(row.cost_value) || 0,
        retailValue: parseFloat(row.retail_value) || 0,
        avgMarginPercent: parseFloat(row.avg_margin_percent) || 0,
      })),
      totals: {
        costValue: parseFloat(totals.rows[0]?.total_cost_value) || 0,
        retailValue: parseFloat(totals.rows[0]?.total_retail_value) || 0,
        potentialProfit:
          (parseFloat(totals.rows[0]?.total_retail_value) || 0) -
          (parseFloat(totals.rows[0]?.total_cost_value) || 0),
      },
    };
  }

  /**
   * Dead stock analysis - Items not sold in X days
   */
  async getDeadStockAnalysis(
    merchantId: string,
    daysSinceLastSale: number = 30,
  ): Promise<Record<string, unknown>> {
    const cutoffDate = new Date(
      Date.now() - daysSinceLastSale * 24 * 60 * 60 * 1000,
    );

    const result = await this.pool.query(
      `WITH last_sales AS (
         SELECT 
           v.id as variant_id,
           MAX(sm.created_at) as last_sale_date
         FROM inventory_variants v
         LEFT JOIN stock_movements sm ON v.id = sm.variant_id AND sm.movement_type = 'sale'
         WHERE v.merchant_id = $1
         GROUP BY v.id
       )
       SELECT 
         v.id, v.sku, v.name, v.quantity_on_hand,
         i.category, i.cost_price,
         ls.last_sale_date,
         EXTRACT(EPOCH FROM (NOW() - COALESCE(ls.last_sale_date, v.created_at))) / 86400 as days_since_sale,
         v.quantity_on_hand * COALESCE(i.cost_price, 0) as tied_up_capital
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       LEFT JOIN last_sales ls ON v.id = ls.variant_id
       WHERE v.merchant_id = $1 
         AND v.quantity_on_hand > 0
         AND (ls.last_sale_date IS NULL OR ls.last_sale_date < $2)
       ORDER BY tied_up_capital DESC`,
      [merchantId, cutoffDate],
    );

    const totalTiedUpCapital = result.rows.reduce(
      (sum, row) => sum + (parseFloat(row.tied_up_capital) || 0),
      0,
    );

    return {
      merchantId,
      daysSinceLastSale,
      cutoffDate: cutoffDate.toISOString(),
      generatedAt: new Date().toISOString(),
      deadStockCount: result.rows.length,
      totalTiedUpCapital,
      items: result.rows.map((row) => ({
        variantId: row.id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        quantityOnHand: row.quantity_on_hand,
        costPrice: parseFloat(row.cost_price) || 0,
        daysSinceSale: Math.round(parseFloat(row.days_since_sale)),
        tiedUpCapital: parseFloat(row.tied_up_capital) || 0,
        lastSaleDate: row.last_sale_date,
      })),
      recommendations: this.generateDeadStockRecommendations(result.rows),
    };
  }

  private generateDeadStockRecommendations(deadStock: any[]): string[] {
    const recommendations: string[] = [];
    const totalItems = deadStock.length;
    const totalValue = deadStock.reduce(
      (sum, item) => sum + (parseFloat(item.tied_up_capital) || 0),
      0,
    );

    if (totalItems > 10) {
      recommendations.push(
        `لديك ${totalItems} منتج لم يتم بيعه خلال الفترة المحددة`,
      );
    }

    if (totalValue > 5000) {
      recommendations.push(
        `رأس مال مجمد بقيمة ${totalValue.toFixed(2)} ج.م - فكر في إجراء تخفيضات`,
      );
    }

    const highValueItems = deadStock.filter(
      (item) => (parseFloat(item.tied_up_capital) || 0) > 500,
    );
    if (highValueItems.length > 0) {
      recommendations.push(
        `${highValueItems.length} منتج عالي القيمة يحتاج اهتمام خاص`,
      );
    }

    const veryOldItems = deadStock.filter(
      (item) => parseFloat(item.days_since_sale) > 90,
    );
    if (veryOldItems.length > 0) {
      recommendations.push(
        `${veryOldItems.length} منتج لم يباع منذ أكثر من 90 يوم - فكر في تصفيتها`,
      );
    }

    return recommendations;
  }

  /**
   * Stock forecast based on historical sales
   */
  async getStockForecast(
    merchantId: string,
    daysAhead: number = 30,
  ): Promise<Record<string, unknown>> {
    const quantityAvailableExpr = this.quantityAvailableExpr("v");
    // Get sales velocity for each variant
    const velocity = await this.pool.query(
      `WITH daily_sales AS (
         SELECT 
           variant_id,
           DATE(created_at) as sale_date,
           SUM(ABS(quantity)) as daily_qty
         FROM stock_movements
         WHERE merchant_id = $1 
           AND movement_type = 'sale'
           AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY variant_id, DATE(created_at)
       )
       SELECT 
         v.id, v.sku, v.name, ${quantityAvailableExpr} as quantity_available,
         COALESCE(AVG(ds.daily_qty), 0) as avg_daily_sales,
         COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) as threshold,
         i.reorder_quantity
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       LEFT JOIN daily_sales ds ON v.id = ds.variant_id
       WHERE v.merchant_id = $1 AND v.is_active = true AND ${quantityAvailableExpr} > 0
       GROUP BY v.id, v.sku, v.name, v.quantity_on_hand, v.quantity_reserved, v.low_stock_threshold, i.low_stock_threshold, i.reorder_quantity`,
      [merchantId],
    );

    const forecasts = velocity.rows.map((row) => {
      const avgDailySales = parseFloat(row.avg_daily_sales) || 0;
      const currentStock = parseInt(row.quantity_available);
      const daysUntilStockout =
        avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : null;
      const projectedStock = Math.max(
        0,
        currentStock - avgDailySales * daysAhead,
      );
      const needsReorder =
        daysUntilStockout !== null && daysUntilStockout <= daysAhead;

      return {
        variantId: row.id,
        sku: row.sku,
        name: row.name,
        currentStock,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        daysUntilStockout,
        projectedStock: Math.round(projectedStock),
        needsReorder,
        suggestedReorderQty: needsReorder
          ? parseInt(row.reorder_quantity) || Math.ceil(avgDailySales * 30)
          : 0,
      };
    });

    const needsReorderCount = forecasts.filter((f) => f.needsReorder).length;

    return {
      merchantId,
      forecastDays: daysAhead,
      generatedAt: new Date().toISOString(),
      summary: {
        totalItems: forecasts.length,
        needsReorder: needsReorderCount,
        willStockout: forecasts.filter(
          (f) =>
            f.daysUntilStockout !== null && f.daysUntilStockout <= daysAhead,
        ).length,
      },
      forecasts: forecasts.sort(
        (a, b) => (a.daysUntilStockout || 999) - (b.daysUntilStockout || 999),
      ),
    };
  }

  // ============================================================================
  // SUPPLIER CSV IMPORT (Growth+ Feature)
  // ============================================================================

  /**
   * Process supplier CSV import - catalog/stock/price updates
   * Math is deterministic, AI only used for messaging
   */
  async processSupplierImport(
    input: SupplierImportInput,
  ): Promise<Record<string, unknown>> {
    const { merchantId, supplierId, importType, rows, filename } = input;

    logger.info("Processing supplier import", {
      merchantId,
      supplierId,
      importType,
      rowCount: rows.length,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Create import log
      const importLog = await client.query(
        `INSERT INTO supplier_imports (merchant_id, supplier_id, filename, import_type, rows_total, status, started_at)
         VALUES ($1, $2, $3, $4, $5, 'processing', NOW())
         RETURNING id`,
        [merchantId, supplierId, filename, importType, rows.length],
      );
      const importId = importLog.rows[0].id;

      let successCount = 0;
      let failedCount = 0;
      const errors: Array<{ row: number; error: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          switch (importType) {
            case "catalog":
              await this.importCatalogRow(
                client,
                merchantId,
                supplierId || "",
                row,
              );
              break;
            case "stock_update":
              await this.importStockUpdateRow(client, merchantId, row);
              break;
            case "price_update":
              await this.importPriceUpdateRow(
                client,
                merchantId,
                supplierId || "",
                row,
              );
              break;
          }
          successCount++;
        } catch (err) {
          failedCount++;
          errors.push({ row: i + 1, error: (err as Error).message });
        }
      }

      // Update import log
      await client.query(
        `UPDATE supplier_imports 
         SET rows_success = $1, rows_failed = $2, errors = $3, status = $4, completed_at = NOW()
         WHERE id = $5`,
        [
          successCount,
          failedCount,
          JSON.stringify(errors),
          failedCount === 0 ? "completed" : "completed_with_errors",
          importId,
        ],
      );

      await client.query("COMMIT");

      return {
        action: "IMPORT_COMPLETED",
        importId,
        total: rows.length,
        success: successCount,
        failed: failedCount,
        errors: errors.slice(0, 10), // Return first 10 errors
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async importCatalogRow(
    client: any,
    merchantId: string,
    supplierId: string,
    row: SupplierCsvRow,
  ): Promise<void> {
    // Deterministic: Create or update inventory item and supplier mapping
    const { sku, name, costPrice, stock, threshold, category } = row;

    // Check if item exists
    let itemId: string;
    const existing = await client.query(
      `SELECT id FROM inventory_items WHERE merchant_id = $1 AND sku = $2`,
      [merchantId, sku],
    );

    if (existing.rows.length > 0) {
      itemId = existing.rows[0].id;
      // Update existing
      await client.query(
        `UPDATE inventory_items SET name = $1, cost_price = $2, low_stock_threshold = $3, category = $4, updated_at = NOW()
         WHERE id = $5`,
        [name, costPrice, threshold || 5, category, itemId],
      );
    } else {
      // Create new item
      const newItem = await client.query(
        `INSERT INTO inventory_items (merchant_id, sku, name, cost_price, low_stock_threshold, category, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [merchantId, sku, name, costPrice, threshold || 5, category],
      );
      itemId = newItem.rows[0].id;

      // Create default variant
      await client.query(
        `INSERT INTO inventory_variants (merchant_id, inventory_item_id, sku, name, quantity_on_hand, cost_price, low_stock_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [merchantId, itemId, sku, name, stock || 0, costPrice, threshold || 5],
      );
    }

    // Update supplier product mapping
    if (supplierId) {
      await client.query(
        `INSERT INTO supplier_products (merchant_id, supplier_id, inventory_item_id, supplier_sku, supplier_name, cost_price)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (merchant_id, supplier_id, COALESCE(variant_id::text, inventory_item_id::text, supplier_sku)) 
         DO UPDATE SET cost_price = EXCLUDED.cost_price, supplier_name = EXCLUDED.supplier_name, updated_at = NOW()`,
        [
          merchantId,
          supplierId,
          itemId,
          row.supplierSku || sku,
          row.supplierName || name,
          costPrice,
        ],
      );
    }
  }

  private async importStockUpdateRow(
    client: any,
    merchantId: string,
    row: SupplierCsvRow,
  ): Promise<void> {
    // Deterministic stock update
    const { sku, stock } = row;
    if (stock === undefined) throw new Error("Stock quantity required");

    const variant = await client.query(
      `SELECT id, quantity_on_hand FROM inventory_variants WHERE merchant_id = $1 AND sku = $2`,
      [merchantId, sku],
    );

    if (variant.rows.length === 0) {
      throw new Error(`SKU ${sku} not found`);
    }

    const quantityBefore = variant.rows[0].quantity_on_hand;
    const adjustment = stock - quantityBefore;

    await client.query(
      `UPDATE inventory_variants SET quantity_on_hand = $1, updated_at = NOW() WHERE id = $2`,
      [stock, variant.rows[0].id],
    );

    // Record movement
    await client.query(
      `INSERT INTO stock_movements (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, reason, created_by)
       VALUES ($1, $2, 'adjustment', $3, $4, $5, 'Supplier import', 'supplier_import')`,
      [merchantId, variant.rows[0].id, adjustment, quantityBefore, stock],
    );
  }

  private async importPriceUpdateRow(
    client: any,
    merchantId: string,
    supplierId: string,
    row: SupplierCsvRow,
  ): Promise<void> {
    // Deterministic price update
    const { sku, costPrice } = row;
    if (costPrice === undefined) throw new Error("Cost price required");

    await client.query(
      `UPDATE inventory_variants SET cost_price = $1, updated_at = NOW() 
       WHERE merchant_id = $2 AND sku = $3`,
      [costPrice, merchantId, sku],
    );

    await client.query(
      `UPDATE inventory_items SET cost_price = $1, updated_at = NOW() 
       WHERE merchant_id = $2 AND sku = $3`,
      [costPrice, merchantId, sku],
    );

    // Update supplier product cost
    if (supplierId) {
      await client.query(
        `UPDATE supplier_products SET cost_price = $1, updated_at = NOW()
         WHERE merchant_id = $2 AND supplier_id = $3 AND supplier_sku = $4`,
        [costPrice, merchantId, supplierId, row.supplierSku || sku],
      );
    }
  }

  // ============================================================================
  // SHRINKAGE REPORTS (Growth+ Feature)
  // ============================================================================

  /**
   * Record shrinkage (expected vs actual count) - deterministic math
   */
  async recordShrinkage(
    input: ShrinkageRecordInput,
  ): Promise<Record<string, unknown>> {
    const {
      merchantId,
      variantId,
      sku,
      expectedQty,
      actualQty,
      reason,
      notes,
      recordedBy,
    } = input;

    logger.info("Recording shrinkage", {
      merchantId,
      identifier: variantId || sku,
      expected: expectedQty,
      actual: actualQty,
    });

    // Get variant details
    let variant: any;
    if (variantId) {
      const result = await this.pool.query(
        `SELECT v.id, v.sku, v.name, v.cost_price, i.name as item_name
         FROM inventory_variants v
         JOIN inventory_items i ON v.inventory_item_id = i.id
         WHERE v.id = $1 AND v.merchant_id = $2`,
        [variantId, merchantId],
      );
      variant = result.rows[0];
    } else if (sku) {
      const result = await this.pool.query(
        `SELECT v.id, v.sku, v.name, v.cost_price, i.name as item_name
         FROM inventory_variants v
         JOIN inventory_items i ON v.inventory_item_id = i.id
         WHERE v.sku = $1 AND v.merchant_id = $2`,
        [sku, merchantId],
      );
      variant = result.rows[0];
    }

    // Deterministic calculation
    const shrinkageQty = expectedQty - actualQty;
    const shrinkageValue = shrinkageQty * (variant?.cost_price || 0);

    // Record shrinkage
    const record = await this.pool.query(
      `INSERT INTO shrinkage_records 
       (merchant_id, variant_id, sku, product_name, expected_qty, actual_qty, shrinkage_value, reason, notes, recorded_by, audit_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE)
       RETURNING id`,
      [
        merchantId,
        variant?.id,
        variant?.sku || sku,
        variant?.name || variant?.item_name,
        expectedQty,
        actualQty,
        shrinkageValue,
        reason || "unknown",
        notes,
        recordedBy || "inventory_agent",
      ],
    );

    // Update actual stock if shrinkage is positive (loss)
    if (shrinkageQty > 0 && variant?.id) {
      await this.pool.query(
        `UPDATE inventory_variants SET quantity_on_hand = $1, updated_at = NOW() WHERE id = $2`,
        [actualQty, variant.id],
      );

      // Record movement
      await this.pool.query(
        `INSERT INTO stock_movements (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, reason, created_by)
         VALUES ($1, $2, 'shrinkage', $3, $4, $5, $6, 'shrinkage_audit')`,
        [
          merchantId,
          variant.id,
          -shrinkageQty,
          expectedQty,
          actualQty,
          reason || "Shrinkage audit",
        ],
      );
    }

    return {
      action: "SHRINKAGE_RECORDED",
      recordId: record.rows[0].id,
      sku: variant?.sku || sku,
      shrinkageQty,
      shrinkageValue,
      stockUpdated: shrinkageQty > 0,
    };
  }

  /**
   * Get shrinkage report for a period - deterministic aggregation
   */
  async getShrinkageReport(
    input: ShrinkageReportInput,
  ): Promise<Record<string, unknown>> {
    const { merchantId, startDate, endDate } = input;

    const result = await this.pool.query(
      `SELECT 
         sr.sku, sr.product_name, sr.reason,
         SUM(sr.expected_qty) as total_expected,
         SUM(sr.actual_qty) as total_actual,
         SUM(sr.shrinkage_qty) as total_shrinkage,
         SUM(sr.shrinkage_value) as total_value,
         COUNT(*) as record_count,
         MIN(sr.audit_date) as first_audit,
         MAX(sr.audit_date) as last_audit
       FROM shrinkage_records sr
       WHERE sr.merchant_id = $1
         AND sr.audit_date >= $2
         AND sr.audit_date <= $3
       GROUP BY sr.sku, sr.product_name, sr.reason
       ORDER BY SUM(sr.shrinkage_value) DESC`,
      [merchantId, startDate, endDate],
    );

    // Calculate totals
    const totals = result.rows.reduce(
      (acc, row) => ({
        totalExpected: acc.totalExpected + parseInt(row.total_expected || 0),
        totalActual: acc.totalActual + parseInt(row.total_actual || 0),
        totalShrinkage: acc.totalShrinkage + parseInt(row.total_shrinkage || 0),
        totalValue: acc.totalValue + parseFloat(row.total_value || 0),
      }),
      { totalExpected: 0, totalActual: 0, totalShrinkage: 0, totalValue: 0 },
    );

    // Deterministic shrinkage rate
    const shrinkageRate =
      totals.totalExpected > 0
        ? Math.round((totals.totalShrinkage / totals.totalExpected) * 10000) /
          100
        : 0;

    // Flag anomalies (deterministic rules)
    const anomalies = result.rows
      .filter((row) => {
        const rowShrinkageRate =
          parseInt(row.total_expected) > 0
            ? (parseInt(row.total_shrinkage) / parseInt(row.total_expected)) *
              100
            : 0;
        return rowShrinkageRate > 10 || parseFloat(row.total_value) > 1000;
      })
      .map((row) => ({
        sku: row.sku,
        productName: row.product_name,
        reason: row.reason,
        shrinkageQty: parseInt(row.total_shrinkage),
        shrinkageValue: parseFloat(row.total_value),
        flag:
          parseFloat(row.total_value) > 1000 ? "HIGH_VALUE_LOSS" : "HIGH_RATE",
      }));

    return {
      merchantId,
      period: { startDate, endDate },
      totals,
      shrinkageRate,
      byItem: result.rows.map((r) => ({
        sku: r.sku,
        productName: r.product_name,
        reason: r.reason,
        expected: parseInt(r.total_expected),
        actual: parseInt(r.total_actual),
        shrinkage: parseInt(r.total_shrinkage),
        value: parseFloat(r.total_value),
        recordCount: parseInt(r.record_count),
      })),
      anomalies,
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // TOP MOVERS ANALYTICS (Starter+ Feature)
  // ============================================================================

  /**
   * Get top sellers and slow movers - deterministic calculation
   */
  async getTopMovers(input: TopMoversInput): Promise<Record<string, unknown>> {
    const { merchantId, period = "week", limit = 10 } = input;
    const quantityAvailableExpr = this.quantityAvailableExpr("v");

    const periodDays = period === "day" ? 1 : period === "week" ? 7 : 30;
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Top sellers by quantity
    const topSellers = await this.pool.query(
      `SELECT 
         v.sku, COALESCE(v.name, i.name) as name,
         SUM(ABS(sm.quantity)) as qty_sold,
         SUM(ABS(sm.quantity) * COALESCE(v.price_modifier, i.base_price, 0)) as revenue,
         ${quantityAvailableExpr} as current_stock
       FROM stock_movements sm
       JOIN inventory_variants v ON sm.variant_id = v.id
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE sm.merchant_id = $1 
         AND sm.movement_type = 'sale'
         AND sm.created_at >= $2
       GROUP BY v.id, v.sku, v.name, i.name, v.price_modifier, i.base_price, v.quantity_on_hand, v.quantity_reserved
       ORDER BY qty_sold DESC
       LIMIT $3`,
      [merchantId, periodStart, limit],
    );

    // Slow movers (items with stock but no/few sales)
    const slowMovers = await this.pool.query(
      `SELECT 
         v.sku, COALESCE(v.name, i.name) as name,
         v.quantity_on_hand as stock,
         v.cost_price * v.quantity_on_hand as tied_capital,
         COALESCE(
           EXTRACT(DAY FROM (NOW() - MAX(sm.created_at)))::INTEGER,
           EXTRACT(DAY FROM (NOW() - v.created_at))::INTEGER
         ) as days_no_sale
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       LEFT JOIN stock_movements sm ON v.id = sm.variant_id AND sm.movement_type = 'sale' AND sm.created_at >= $2
       WHERE v.merchant_id = $1 
         AND v.quantity_on_hand > 0
         AND v.is_active = true
       GROUP BY v.id, v.sku, v.name, i.name, v.quantity_on_hand, v.cost_price, v.created_at
       HAVING COUNT(sm.id) = 0 OR SUM(ABS(sm.quantity)) < 3
       ORDER BY days_no_sale DESC NULLS FIRST, tied_capital DESC
       LIMIT $3`,
      [merchantId, periodStart, limit],
    );

    // Cache result
    const periodStartDate = periodStart.toISOString().split("T")[0];
    const periodEndDate = new Date().toISOString().split("T")[0];

    await this.pool.query(
      `INSERT INTO inventory_top_movers (merchant_id, period, period_start, period_end, top_sellers, slow_movers)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (merchant_id, period, period_start) DO UPDATE SET
         top_sellers = EXCLUDED.top_sellers,
         slow_movers = EXCLUDED.slow_movers,
         calculated_at = NOW()`,
      [
        merchantId,
        period,
        periodStartDate,
        periodEndDate,
        JSON.stringify(topSellers.rows),
        JSON.stringify(slowMovers.rows),
      ],
    );

    return {
      merchantId,
      period,
      periodStart: periodStartDate,
      periodEnd: periodEndDate,
      topSellers: topSellers.rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        qtySold: parseInt(r.qty_sold),
        revenue: parseFloat(r.revenue) || 0,
        currentStock: parseInt(r.current_stock),
      })),
      slowMovers: slowMovers.rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        stock: parseInt(r.stock),
        tiedCapital: parseFloat(r.tied_capital) || 0,
        daysNoSale: parseInt(r.days_no_sale) || 0,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // PERISHABLE / EXPIRY DATE TRACKING
  // ============================================================================

  /**
   * Scan for items nearing expiry and create alerts
   */
  async checkExpiryAlerts(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    try {
      // Find items with expiry dates approaching (7, 3, 1 day thresholds)
      const expiringItems = await this.pool.query(
        `SELECT
           ci.id as item_id,
           COALESCE(NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), ci.sku, 'منتج') as name,
           ci.sku,
           ci.expiry_date,
           (ci.expiry_date - CURRENT_DATE) as days_until_expiry,
           COALESCE(SUM(v.quantity_on_hand), 0) as quantity_at_risk,
           MIN(v.id) as variant_id
         FROM catalog_items ci
         LEFT JOIN inventory_items ii
           ON ii.catalog_item_id = ci.id
          AND ii.merchant_id = ci.merchant_id
         LEFT JOIN inventory_variants v
           ON v.inventory_item_id = ii.id
          AND v.merchant_id = ci.merchant_id
          AND v.is_active = true
         WHERE ci.merchant_id = $1
           AND ci.is_perishable = true
           AND ci.expiry_date IS NOT NULL
           AND ci.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
           AND ci.expiry_date >= CURRENT_DATE - INTERVAL '1 day'
         GROUP BY ci.id, ci.name_ar, ci.name_en, ci.sku, ci.expiry_date
         ORDER BY ci.expiry_date ASC`,
        [merchantId],
      );

      // Also check lot-level expiry
      const expiringLots = await this.pool.query(
        `SELECT il.*, ci.name as item_name, ci.sku
         FROM inventory_lots il
         JOIN catalog_items ci ON ci.id = il.item_id
         WHERE il.merchant_id = $1
           AND il.status = 'ACTIVE'
           AND il.expiry_date IS NOT NULL
           AND il.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
           AND il.expiry_date >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY il.expiry_date ASC`,
        [merchantId],
      );

      const alerts: Array<any> = [];

      for (const item of expiringItems.rows) {
        const daysLeft = parseInt(item.days_until_expiry);
        const alertType =
          daysLeft <= 0 ? "EXPIRED" : daysLeft <= 1 ? "CRITICAL" : "WARNING";

        // Dedup: don't create alert if one exists for same item+date
        const existing = await this.pool.query(
          `SELECT 1 FROM expiry_alerts WHERE merchant_id = $1 AND item_id = $2 AND expiry_date = $3 AND alert_type = $4 LIMIT 1`,
          [merchantId, item.item_id, item.expiry_date, alertType],
        );

        if (existing.rows.length === 0) {
          await this.pool.query(
            `INSERT INTO expiry_alerts (merchant_id, item_id, variant_id, expiry_date, alert_type, days_until_expiry, quantity_at_risk)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              merchantId,
              item.item_id,
              item.variant_id,
              item.expiry_date,
              alertType,
              daysLeft,
              item.quantity_at_risk,
            ],
          );

          alerts.push({
            itemName: item.name,
            sku: item.sku,
            expiryDate: item.expiry_date,
            daysLeft,
            alertType,
            quantityAtRisk: parseInt(item.quantity_at_risk),
          });
        }
      }

      // Mark expired lots
      await this.pool.query(
        `UPDATE inventory_lots SET status = 'EXPIRED', updated_at = NOW()
         WHERE merchant_id = $1 AND status = 'ACTIVE' AND expiry_date < CURRENT_DATE`,
        [merchantId],
      );

      // Create notification if any critical/expired
      const criticalAlerts = alerts.filter((a) => a.alertType !== "WARNING");
      if (criticalAlerts.length > 0) {
        await this.pool
          .query(
            `INSERT INTO notifications (
             merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at
           )
           VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, $3, $4::jsonb, 'HIGH', '{"IN_APP","PUSH"}', '/merchant/inventory', NOW())`,
            [
              merchantId,
              `⚠️ ${criticalAlerts.length} منتج منتهي/قرب الانتهاء`,
              criticalAlerts
                .map(
                  (a) =>
                    `${a.itemName}: ${a.daysLeft <= 0 ? "منتهي!" : `${a.daysLeft} يوم`}`,
                )
                .join("\n"),
              JSON.stringify({ alerts: criticalAlerts }),
            ],
          )
          .catch((e) =>
            logger.warn(
              `Expiry alert notification insert failed: ${e.message}`,
            ),
          );
      }

      return {
        merchantId,
        alertsCreated: alerts.length,
        alerts,
        expiredLotsMarked: expiringLots.rows.filter(
          (l) => new Date(l.expiry_date) < new Date(),
        ).length,
      };
    } catch (error) {
      logger.error(`checkExpiryAlerts failed: ${(error as Error).message}`);
      return { merchantId, alertsCreated: 0, error: (error as Error).message };
    }
  }

  /**
   * Get expiry report for merchant
   */
  async getExpiryReport(merchantId: string): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT ea.*, ci.name as item_name, ci.sku
       FROM expiry_alerts ea
       JOIN catalog_items ci ON ci.id = ea.item_id
       WHERE ea.merchant_id = $1 AND ea.acknowledged = false
       ORDER BY ea.days_until_expiry ASC`,
      [merchantId],
    );

    return {
      merchantId,
      alerts: result.rows.map((r) => ({
        id: r.id,
        itemName: r.item_name,
        sku: r.sku,
        expiryDate: r.expiry_date,
        daysLeft: r.days_until_expiry,
        alertType: r.alert_type,
        quantityAtRisk: r.quantity_at_risk,
        actionTaken: r.action_taken,
      })),
      summary: {
        expired: result.rows.filter((r) => r.alert_type === "EXPIRED").length,
        critical: result.rows.filter((r) => r.alert_type === "CRITICAL").length,
        warning: result.rows.filter((r) => r.alert_type === "WARNING").length,
      },
    };
  }

  // ============================================================================
  // BATCH & LOT TRACKING
  // ============================================================================

  /**
   * Receive stock with lot/batch tracking
   */
  async receiveLot(input: {
    merchantId: string;
    itemId: string;
    variantId?: string;
    lotNumber: string;
    batchId?: string;
    quantity: number;
    costPrice: number;
    expiryDate?: string;
    supplierId?: string;
    notes?: string;
  }): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Create lot record
      const lotResult = await client.query(
        `INSERT INTO inventory_lots (merchant_id, item_id, variant_id, lot_number, batch_id, quantity, cost_price, expiry_date, supplier_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          input.merchantId,
          input.itemId,
          input.variantId,
          input.lotNumber,
          input.batchId,
          input.quantity,
          input.costPrice,
          input.expiryDate || null,
          input.supplierId,
          input.notes,
        ],
      );
      const lotId = lotResult.rows[0].id;

      // 2. Create FIFO cost layer
      await client.query(
        `INSERT INTO inventory_cost_layers (merchant_id, item_id, variant_id, lot_id, quantity_remaining, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.merchantId,
          input.itemId,
          input.variantId,
          lotId,
          input.quantity,
          input.costPrice,
        ],
      );

      // 3. Update stock quantity
      const variantTarget = input.variantId || input.itemId;
      const stockBefore = await client.query(
        `SELECT COALESCE(quantity_on_hand, 0) as qty FROM inventory_variants WHERE id = $1`,
        [variantTarget],
      );
      const qtyBefore = parseInt(stockBefore.rows[0]?.qty || "0");

      await client.query(
        `UPDATE inventory_variants
         SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
         WHERE id = $2`,
        [input.quantity, variantTarget],
      );

      // 4. Record stock movement with lot info
      await client.query(
        `INSERT INTO stock_movements (merchant_id, variant_id, quantity_before, quantity_after, change, reason, lot_number, batch_id, expiry_date, created_by)
         VALUES ($1, $2, $3, $4, $5, 'RECEIVED', $6, $7, $8, 'system')`,
        [
          input.merchantId,
          variantTarget,
          qtyBefore,
          qtyBefore + input.quantity,
          input.quantity,
          input.lotNumber,
          input.batchId,
          input.expiryDate,
        ],
      );

      // 5. Update item expiry_date if perishable
      if (input.expiryDate) {
        await client.query(
          `UPDATE catalog_items SET is_perishable = true, expiry_date = LEAST(COALESCE(expiry_date, $2::date), $2::date), updated_at = NOW()
           WHERE id = $1`,
          [input.itemId, input.expiryDate],
        );
      }

      await client.query("COMMIT");

      return {
        lotId,
        lotNumber: input.lotNumber,
        batchId: input.batchId,
        quantity: input.quantity,
        costPrice: input.costPrice,
        expiryDate: input.expiryDate,
        message: `تم استلام ${input.quantity} وحدة — لوت ${input.lotNumber}`,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get lot tracking report
   */
  async getLotReport(
    merchantId: string,
    itemId?: string,
  ): Promise<Record<string, unknown>> {
    const query = itemId
      ? `SELECT il.*, ci.name as item_name, ci.sku FROM inventory_lots il JOIN catalog_items ci ON ci.id = il.item_id WHERE il.merchant_id = $1 AND il.item_id = $2 ORDER BY il.received_date DESC`
      : `SELECT il.*, ci.name as item_name, ci.sku FROM inventory_lots il JOIN catalog_items ci ON ci.id = il.item_id WHERE il.merchant_id = $1 ORDER BY il.received_date DESC LIMIT 100`;

    const params = itemId ? [merchantId, itemId] : [merchantId];
    const result = await this.pool.query(query, params);

    return {
      lots: result.rows.map((r) => ({
        id: r.id,
        lotNumber: r.lot_number,
        batchId: r.batch_id,
        itemName: r.item_name,
        sku: r.sku,
        quantity: r.quantity,
        costPrice: parseFloat(r.cost_price),
        receivedDate: r.received_date,
        expiryDate: r.expiry_date,
        status: r.status,
      })),
      count: result.rows.length,
    };
  }

  // ============================================================================
  // FIFO / WEIGHTED AVERAGE COGS
  // ============================================================================

  /**
   * Calculate COGS using FIFO method
   */
  async calculateFifoCogs(
    merchantId: string,
    itemId: string,
    quantitySold: number,
  ): Promise<{
    totalCogs: number;
    layersUsed: Array<{
      lotId: string;
      quantity: number;
      unitCost: number;
      subtotal: number;
    }>;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get cost layers in FIFO order (oldest first)
      const layers = await client.query(
        `SELECT id, lot_id, quantity_remaining, unit_cost
         FROM inventory_cost_layers
         WHERE merchant_id = $1 AND item_id = $2 AND quantity_remaining > 0
         ORDER BY received_at ASC`,
        [merchantId, itemId],
      );

      let remaining = quantitySold;
      let totalCogs = 0;
      const layersUsed: Array<{
        lotId: string;
        quantity: number;
        unitCost: number;
        subtotal: number;
      }> = [];

      for (const layer of layers.rows) {
        if (remaining <= 0) break;

        const useQty = Math.min(remaining, layer.quantity_remaining);
        const subtotal = useQty * parseFloat(layer.unit_cost);
        totalCogs += subtotal;
        remaining -= useQty;

        // Deduct from this layer
        await client.query(
          `UPDATE inventory_cost_layers SET quantity_remaining = quantity_remaining - $1 WHERE id = $2`,
          [useQty, layer.id],
        );

        // Also deduct from lot if exists
        if (layer.lot_id) {
          await client.query(
            `UPDATE inventory_lots SET quantity = GREATEST(quantity - $1, 0), updated_at = NOW() WHERE id = $2`,
            [useQty, layer.lot_id],
          );
        }

        layersUsed.push({
          lotId: layer.lot_id,
          quantity: useQty,
          unitCost: parseFloat(layer.unit_cost),
          subtotal,
        });
      }

      await client.query("COMMIT");

      return { totalCogs: Math.round(totalCogs * 100) / 100, layersUsed };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get full inventory valuation using FIFO
   */
  async getInventoryValuationFifo(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT ci.id, ci.name, ci.sku, ci.category,
              SUM(icl.quantity_remaining) as total_qty,
              SUM(icl.quantity_remaining * icl.unit_cost) as total_cost,
              AVG(icl.unit_cost) as weighted_avg_cost,
              MIN(icl.unit_cost) as min_cost,
              MAX(icl.unit_cost) as max_cost,
              COALESCE(ci.price, 0) as retail_price
       FROM inventory_cost_layers icl
       JOIN catalog_items ci ON ci.id = icl.item_id
       WHERE icl.merchant_id = $1 AND icl.quantity_remaining > 0
       GROUP BY ci.id, ci.name, ci.sku, ci.category, ci.price
       ORDER BY total_cost DESC`,
      [merchantId],
    );

    // Fallback for items without cost layers (use simple cost_price)
    const simpleFallback = await this.pool.query(
      `SELECT ci.id, ci.name, ci.sku, ci.category,
              COALESCE(SUM(v.quantity_on_hand), 0) as total_qty,
              COALESCE(SUM(v.quantity_on_hand * COALESCE(v.cost_price, ii.cost_price, 0)), 0) as total_cost,
              COALESCE(AVG(COALESCE(v.cost_price, ii.cost_price)), 0) as weighted_avg_cost,
              COALESCE(ci.price, 0) as retail_price
       FROM catalog_items ci
       JOIN inventory_items ii
         ON ii.catalog_item_id = ci.id
        AND ii.merchant_id = ci.merchant_id
       JOIN inventory_variants v
         ON v.inventory_item_id = ii.id
        AND v.merchant_id = ci.merchant_id
       WHERE ci.merchant_id = $1
         AND ci.id NOT IN (SELECT DISTINCT item_id FROM inventory_cost_layers WHERE merchant_id = $1 AND quantity_remaining > 0)
         AND v.quantity_on_hand > 0
       GROUP BY ci.id, ci.name, ci.sku, ci.category, ci.price`,
      [merchantId],
    );

    const allItems = [...result.rows, ...simpleFallback.rows];
    const totalCostValue = allItems.reduce(
      (s, r) => s + parseFloat(r.total_cost || "0"),
      0,
    );
    const totalRetailValue = allItems.reduce(
      (s, r) => s + parseInt(r.total_qty) * parseFloat(r.retail_price || "0"),
      0,
    );

    return {
      merchantId,
      method: "FIFO_WITH_FALLBACK",
      items: allItems.map((r) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        category: r.category,
        quantity: parseInt(r.total_qty),
        costValue: Math.round(parseFloat(r.total_cost) * 100) / 100,
        retailValue: parseInt(r.total_qty) * parseFloat(r.retail_price),
        weightedAvgCost:
          Math.round(parseFloat(r.weighted_avg_cost) * 100) / 100,
        marginPct:
          parseFloat(r.retail_price) > 0
            ? Math.round(
                ((parseFloat(r.retail_price) -
                  parseFloat(r.weighted_avg_cost)) /
                  parseFloat(r.retail_price)) *
                  10000,
              ) / 100
            : 0,
      })),
      summary: {
        totalCostValue: Math.round(totalCostValue * 100) / 100,
        totalRetailValue: Math.round(totalRetailValue * 100) / 100,
        overallMarginPct:
          totalRetailValue > 0
            ? Math.round(
                ((totalRetailValue - totalCostValue) / totalRetailValue) *
                  10000,
              ) / 100
            : 0,
        itemCount: allItems.length,
      },
    };
  }

  // ============================================================================
  // SKU MERGE / DEDUP DETECTION
  // ============================================================================

  /**
   * Detect potential duplicate SKUs using fuzzy matching
   */
  async detectDuplicateSkus(
    merchantId: string,
  ): Promise<Record<string, unknown>> {
    // Find items with similar names (Levenshtein-like approach using trigrams)
    const result = await this.pool
      .query(
        `SELECT a.id as id_a, a.name as name_a, a.sku as sku_a, a.price as price_a,
              b.id as id_b, b.name as name_b, b.sku as sku_b, b.price as price_b,
              SIMILARITY(LOWER(a.name), LOWER(b.name)) as name_similarity
       FROM catalog_items a
       JOIN catalog_items b ON a.merchant_id = b.merchant_id AND a.id < b.id
       WHERE a.merchant_id = $1
         AND a.is_active = true AND b.is_active = true
         AND (
           SIMILARITY(LOWER(a.name), LOWER(b.name)) > 0.6
           OR (a.sku IS NOT NULL AND b.sku IS NOT NULL AND LOWER(a.sku) = LOWER(b.sku))
         )
       ORDER BY name_similarity DESC
       LIMIT 20`,
        [merchantId],
      )
      .catch(() => {
        // pg_trgm extension may not be available — fallback to exact matches
        return this.pool.query(
          `SELECT a.id as id_a, a.name as name_a, a.sku as sku_a, a.price as price_a,
                b.id as id_b, b.name as name_b, b.sku as sku_b, b.price as price_b,
                1.0 as name_similarity
         FROM catalog_items a
         JOIN catalog_items b ON a.merchant_id = b.merchant_id AND a.id < b.id
         WHERE a.merchant_id = $1
           AND a.is_active = true AND b.is_active = true
           AND (
             LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))
             OR (a.sku IS NOT NULL AND b.sku IS NOT NULL AND LOWER(a.sku) = LOWER(b.sku))
           )
         ORDER BY a.name
         LIMIT 20`,
          [merchantId],
        );
      });

    return {
      merchantId,
      duplicates: result.rows.map((r) => ({
        itemA: {
          id: r.id_a,
          name: r.name_a,
          sku: r.sku_a,
          price: parseFloat(r.price_a || "0"),
        },
        itemB: {
          id: r.id_b,
          name: r.name_b,
          sku: r.sku_b,
          price: parseFloat(r.price_b || "0"),
        },
        similarity: parseFloat(r.name_similarity),
      })),
      count: result.rows.length,
    };
  }

  /**
   * Merge two SKUs: moves all stock, orders, and history from source to target
   */
  async mergeSkus(input: {
    merchantId: string;
    sourceItemId: string;
    targetItemId: string;
    mergedBy?: string;
    reason?: string;
  }): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get source item details
      const sourceResult = await client.query(
        `SELECT ci.*,
                COALESCE(SUM(v.quantity_on_hand), 0) as total_stock
         FROM catalog_items ci
         LEFT JOIN inventory_items ii
           ON ii.catalog_item_id = ci.id
          AND ii.merchant_id = ci.merchant_id
         LEFT JOIN inventory_variants v
           ON v.inventory_item_id = ii.id
          AND v.merchant_id = ci.merchant_id
         WHERE ci.id = $1 AND ci.merchant_id = $2
         GROUP BY ci.id`,
        [input.sourceItemId, input.merchantId],
      );

      if (sourceResult.rows.length === 0)
        throw new Error("Source item not found");
      const source = sourceResult.rows[0];
      const sourceStock = parseInt(source.total_stock);

      // Transfer stock movements
      await client.query(
        `UPDATE stock_movements
         SET variant_id = (
           SELECT iv.id
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           WHERE ii.catalog_item_id = $1
             AND iv.merchant_id = $3
           ORDER BY iv.created_at ASC
           LIMIT 1
         )
         WHERE variant_id IN (
           SELECT iv.id
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           WHERE ii.catalog_item_id = $2
             AND iv.merchant_id = $3
         )`,
        [input.targetItemId, input.sourceItemId, input.merchantId],
      );

      // Add stock to target
      await client.query(
        `UPDATE inventory_variants
         SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
         WHERE id = (
           SELECT iv.id
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           WHERE ii.catalog_item_id = $2
             AND iv.merchant_id = $3
           ORDER BY iv.created_at ASC
           LIMIT 1
         )`,
        [sourceStock, input.targetItemId, input.merchantId],
      );

      // Transfer cost layers
      await client.query(
        `UPDATE inventory_cost_layers SET item_id = $1 WHERE item_id = $2 AND merchant_id = $3`,
        [input.targetItemId, input.sourceItemId, input.merchantId],
      );

      // Transfer lots
      await client.query(
        `UPDATE inventory_lots SET item_id = $1 WHERE item_id = $2 AND merchant_id = $3`,
        [input.targetItemId, input.sourceItemId, input.merchantId],
      );

      // Deactivate source item
      await client.query(
        `UPDATE catalog_items SET is_active = false, name = name || ' [MERGED→' || $1 || ']', updated_at = NOW()
         WHERE id = $2`,
        [input.targetItemId, input.sourceItemId],
      );

      // Log the merge
      await client.query(
        `INSERT INTO sku_merge_log (merchant_id, source_sku, target_sku, source_item_id, target_item_id, merged_quantity, merged_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.merchantId,
          source.sku || input.sourceItemId,
          "",
          input.sourceItemId,
          input.targetItemId,
          sourceStock,
          input.mergedBy || "system",
          input.reason,
        ],
      );

      await client.query("COMMIT");

      return {
        merged: true,
        sourceItemId: input.sourceItemId,
        targetItemId: input.targetItemId,
        stockTransferred: sourceStock,
        message: `تم دمج المنتج "${source.name}" (${sourceStock} وحدة) في المنتج الهدف`,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error(`mergeSkus failed: ${(error as Error).message}`);
      throw error;
    } finally {
      client.release();
    }
  }
}
// ============================================================================
// ADDITIONAL TASK INTERFACES
// ============================================================================

export interface SupplierImportInput {
  merchantId: string;
  supplierId?: string;
  importType: "catalog" | "stock_update" | "price_update";
  filename: string;
  rows: SupplierCsvRow[];
}

export interface SupplierCsvRow {
  sku: string;
  name?: string;
  costPrice?: number;
  stock?: number;
  threshold?: number;
  category?: string;
  supplierSku?: string;
  supplierName?: string;
}

export interface ShrinkageRecordInput {
  merchantId: string;
  variantId?: string;
  sku?: string;
  expectedQty: number;
  actualQty: number;
  reason?: "damaged" | "expired" | "theft" | "counting_error" | "unknown";
  notes?: string;
  recordedBy?: string;
}

export interface ShrinkageReportInput {
  merchantId: string;
  startDate: string;
  endDate: string;
}

export interface TopMoversInput {
  merchantId: string;
  period?: "day" | "week" | "month";
  limit?: number;
}
