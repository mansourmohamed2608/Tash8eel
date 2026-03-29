import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
} from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  IsArray,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { Pool } from "pg";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresAgent,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  RealTimeEvent,
  WebSocketService,
} from "../../infrastructure/websocket/websocket.service";
import { MerchantId } from "../../shared/decorators/merchant-id.decorator";

// DTOs
export class CreateInventoryItemDto {
  @IsString()
  @IsOptional()
  merchantId?: string;

  @IsString()
  @IsOptional()
  catalogItemId?: string;

  @IsString()
  sku!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  trackInventory?: boolean;

  @IsBoolean()
  @IsOptional()
  allowBackorder?: boolean;

  @IsNumber()
  @IsOptional()
  lowStockThreshold?: number;

  @IsNumber()
  @IsOptional()
  reorderPoint?: number;

  @IsNumber()
  @IsOptional()
  reorderQuantity?: number;

  @IsString()
  @IsOptional()
  location?: string;

  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  supplierSku?: string;

  @IsString()
  @IsOptional()
  expiryDate?: string;

  @IsBoolean()
  @IsOptional()
  isPerishable?: boolean;
}

export class CreateVariantDto {
  @IsString()
  inventoryItemId!: string;

  @IsString()
  sku!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  name!: string;

  @IsObject()
  @IsOptional()
  attributes?: Record<string, string>;

  @IsNumber()
  @IsOptional()
  quantityOnHand?: number;

  @IsNumber()
  @IsOptional()
  lowStockThreshold?: number;

  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  priceModifier?: number;
}

export class UpdateStockDto {
  @IsNumber()
  quantity!: number;

  @IsString()
  movementType!: "purchase" | "adjustment" | "return" | "transfer";

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  referenceId?: string;
}

export class ReserveStockDto {
  @IsString()
  variantId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsOptional()
  orderId?: string;

  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsNumber()
  @IsOptional()
  expiresInMinutes?: number;
}

class BulkStockUpdateItem {
  @IsString()
  variantId!: string;

  @IsNumber()
  quantity!: number;

  @IsString()
  movementType!: "purchase" | "adjustment" | "return" | "transfer";

  @IsString()
  @IsOptional()
  reason?: string;
}

export class BulkStockUpdateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkStockUpdateItem)
  updates!: BulkStockUpdateItem[];
}

export class CreateWarehouseLocationDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  nameAr?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class StockTransferDto {
  @IsString()
  variantId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsString()
  fromLocation!: string;

  @IsString()
  toLocation!: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class BulkImportItemDto {
  @IsString()
  sku!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @IsOptional()
  lowStockThreshold?: number;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  location?: string;
}

export class BulkImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportItemDto)
  items!: BulkImportItemDto[];

  @IsBoolean()
  @IsOptional()
  updateExisting?: boolean;
}

@ApiTags("Inventory")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("INVENTORY")
@RequiresAgent("INVENTORY_AGENT")
@Controller("v1/inventory")
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly webSocketService: WebSocketService,
  ) {}

  private async ensureDefaultWarehouseLocation(merchantId: string) {
    try {
      const defaultName = "المخزن";

      // Prefer existing "المخزن" location (even if inactive), then ensure it's active + default
      const existingDefault = await this.pool.query(
        `SELECT id, name, name_ar, is_default, is_active
         FROM warehouse_locations
         WHERE merchant_id = $1 AND (name = $2 OR name_ar = $2)
         ORDER BY is_active DESC, is_default DESC, created_at ASC
         LIMIT 1`,
        [merchantId, defaultName],
      );

      if (existingDefault.rows.length > 0) {
        const row = existingDefault.rows[0];
        if (!row.is_active) {
          await this.pool.query(
            `UPDATE warehouse_locations SET is_active = true WHERE id = $1`,
            [row.id],
          );
        }
        if (!row.is_default) {
          await this.pool.query(
            `UPDATE warehouse_locations SET is_default = false WHERE merchant_id = $1`,
            [merchantId],
          );
          await this.pool.query(
            `UPDATE warehouse_locations SET is_default = true WHERE id = $1`,
            [row.id],
          );
        }
        return row;
      }

      // If no locations at all, create default
      const existingAny = await this.pool.query(
        `SELECT id FROM warehouse_locations WHERE merchant_id = $1 LIMIT 1`,
        [merchantId],
      );

      if (existingAny.rows.length === 0) {
        const inserted = await this.pool.query(
          `INSERT INTO warehouse_locations (merchant_id, name, name_ar, is_default)
           VALUES ($1, $2, $2, true)
           RETURNING id, name, name_ar, is_default, is_active`,
          [merchantId, defaultName],
        );
        return inserted.rows[0];
      }

      // Create "المخزن" and make it default if locations exist but no default named "المخزن"
      const inserted = await this.pool.query(
        `INSERT INTO warehouse_locations (merchant_id, name, name_ar, is_default)
         VALUES ($1, $2, $2, true)
         ON CONFLICT (merchant_id, name) DO UPDATE SET
           is_default = true,
           is_active = true,
           updated_at = NOW()
         RETURNING id, name, name_ar, is_default, is_active`,
        [merchantId, defaultName],
      );
      await this.pool.query(
        `UPDATE warehouse_locations SET is_default = false WHERE merchant_id = $1 AND id <> $2`,
        [merchantId, inserted.rows[0].id],
      );
      return inserted.rows[0];
    } catch (error) {
      this.logger.warn(
        `Default warehouse location ensure failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async ensureDefaultStockByLocation(
    merchantId: string,
    locationId: string,
  ) {
    await this.pool.query(
      `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
       SELECT v.merchant_id, v.id, $2, v.quantity_on_hand
       FROM inventory_variants v
       JOIN inventory_items i ON i.id = v.inventory_item_id AND i.merchant_id = v.merchant_id
       WHERE v.merchant_id = $1
       ON CONFLICT (merchant_id, variant_id, location_id) DO NOTHING`,
      [merchantId, locationId],
    );
  }

  private async ensureStockEntriesForLocation(
    merchantId: string,
    locationId: string,
  ) {
    await this.pool.query(
      `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
       SELECT v.merchant_id, v.id, $2, 0
       FROM inventory_variants v
       JOIN inventory_items i ON i.id = v.inventory_item_id AND i.merchant_id = v.merchant_id
       WHERE v.merchant_id = $1
       ON CONFLICT (merchant_id, variant_id, location_id) DO NOTHING`,
      [merchantId, locationId],
    );
  }

  private async ensureStockEntriesForVariant(
    merchantId: string,
    variantId: string,
    quantityOnHand: number,
  ) {
    await this.pool.query(
      `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
       SELECT $1, $2, wl.id, CASE WHEN wl.is_default THEN $3 ELSE 0 END
       FROM warehouse_locations wl
       WHERE wl.merchant_id = $1 AND wl.is_active = true
       ON CONFLICT (merchant_id, variant_id, location_id) DO NOTHING`,
      [merchantId, variantId, quantityOnHand],
    );
  }

  private normalizeExpiryDate(expiryDate?: string | null): string | null {
    if (typeof expiryDate !== "string") return null;
    const trimmed = expiryDate.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async syncCatalogPerishableFields(
    merchantId: string,
    inventoryItemId: string,
    expiryDate?: string | null,
    isPerishable?: boolean,
  ): Promise<void> {
    if (expiryDate === undefined && isPerishable === undefined) return;

    const itemResult = await this.pool.query(
      `SELECT catalog_item_id, sku
       FROM inventory_items
       WHERE id = $1 AND merchant_id = $2
       LIMIT 1`,
      [inventoryItemId, merchantId],
    );
    let catalogItemId = itemResult.rows[0]?.catalog_item_id;

    // Backfill missing link by SKU to keep expiry tracking usable from inventory page.
    if (!catalogItemId) {
      const sku = itemResult.rows[0]?.sku;
      if (sku) {
        const catalogMatch = await this.pool.query(
          `SELECT id FROM catalog_items WHERE merchant_id = $1 AND LOWER(sku) = LOWER($2) LIMIT 1`,
          [merchantId, sku],
        );
        if (catalogMatch.rows.length > 0) {
          catalogItemId = catalogMatch.rows[0].id;
          await this.pool.query(
            `UPDATE inventory_items SET catalog_item_id = $1, updated_at = NOW()
             WHERE id = $2 AND merchant_id = $3`,
            [catalogItemId, inventoryItemId, merchantId],
          );
        }
      }
    }
    if (!catalogItemId) return;

    const normalizedExpiry = this.normalizeExpiryDate(expiryDate);
    const normalizedPerishable =
      typeof isPerishable === "boolean"
        ? isPerishable
        : normalizedExpiry
          ? true
          : null;

    try {
      await this.pool.query(
        `UPDATE catalog_items
         SET expiry_date = $3::date,
             is_perishable = COALESCE($4::boolean, CASE WHEN $3::date IS NOT NULL THEN true ELSE is_perishable END),
             updated_at = NOW()
         WHERE id = $1 AND merchant_id = $2`,
        [catalogItemId, merchantId, normalizedExpiry, normalizedPerishable],
      );
    } catch (error: any) {
      if (error?.code === "42703") {
        this.logger.warn(`Skipping catalog expiry sync: ${error.message}`);
        return;
      }
      throw error;
    }
  }

  private async syncVariantTotals(
    client: { query: (sql: string, params?: any[]) => Promise<any> },
    merchantId: string,
    variantId: string,
  ) {
    const sumResult = await client.query(
      `SELECT COALESCE(SUM(quantity_on_hand), 0) as total_on_hand
       FROM inventory_stock_by_location
       WHERE merchant_id = $1 AND variant_id = $2`,
      [merchantId, variantId],
    );
    const totalOnHand = Number(sumResult.rows[0]?.total_on_hand || 0);
    await client.query(
      `UPDATE inventory_variants
       SET quantity_on_hand = $1, updated_at = NOW()
       WHERE id = $2 AND merchant_id = $3`,
      [totalOnHand, variantId, merchantId],
    );
  }

  private async syncAllVariantTotals(merchantId: string) {
    const tableResult = await this.pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_stock_by_location'`,
    );
    if (tableResult.rows.length === 0) return;

    const hasRows = await this.pool.query(
      `SELECT 1 FROM inventory_stock_by_location WHERE merchant_id = $1 LIMIT 1`,
      [merchantId],
    );
    if (hasRows.rows.length === 0) return;

    await this.pool.query(
      `UPDATE inventory_variants v
       SET quantity_on_hand = s.total, updated_at = NOW()
       FROM (
         SELECT variant_id, COALESCE(SUM(quantity_on_hand), 0) as total
         FROM inventory_stock_by_location
         WHERE merchant_id = $1
         GROUP BY variant_id
       ) s
       WHERE v.id = s.variant_id AND v.merchant_id = $1`,
      [merchantId],
    );
  }

  private async cleanupOrphanInventoryData(merchantId: string) {
    try {
      await this.pool.query(
        `DELETE FROM inventory_stock_by_location sbl
         WHERE sbl.merchant_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM inventory_variants v
             WHERE v.id = sbl.variant_id AND v.merchant_id = sbl.merchant_id
           )`,
        [merchantId],
      );
    } catch (error: any) {
      if (error?.code !== "42P01") {
        throw error;
      }
    }

    try {
      await this.pool.query(
        `DELETE FROM inventory_variants v
         WHERE v.merchant_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM inventory_items i
             WHERE i.id = v.inventory_item_id AND i.merchant_id = v.merchant_id
           )`,
        [merchantId],
      );
    } catch (error: any) {
      if (error?.code !== "42P01") {
        throw error;
      }
    }
  }

  private async adjustLocationReserved(
    client: { query: (sql: string, params?: any[]) => Promise<any> },
    merchantId: string,
    variantId: string,
    delta: number,
    adjustOnHand: boolean,
  ) {
    try {
      const locationResult = await client.query(
        `SELECT id FROM warehouse_locations
         WHERE merchant_id = $1 AND is_active = true
         ORDER BY is_default DESC, created_at ASC
         LIMIT 1`,
        [merchantId],
      );
      const locationId = locationResult.rows[0]?.id;
      if (!locationId || delta === 0) return;

      if (delta < 0) {
        await client.query(
          `UPDATE inventory_stock_by_location
           SET quantity_reserved = GREATEST(quantity_reserved + $1, 0),
               quantity_on_hand = CASE WHEN $5 THEN GREATEST(quantity_on_hand + $1, 0) ELSE quantity_on_hand END,
               updated_at = NOW()
           WHERE merchant_id = $2 AND variant_id = $3 AND location_id = $4`,
          [delta, merchantId, variantId, locationId, adjustOnHand],
        );
        return;
      }

      await client.query(
        `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand, quantity_reserved)
         VALUES ($1, $2, $3, 0, $4)
         ON CONFLICT (merchant_id, variant_id, location_id)
         DO UPDATE SET
           quantity_reserved = inventory_stock_by_location.quantity_reserved + $4,
           updated_at = NOW()`,
        [merchantId, variantId, locationId, delta],
      );
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        return;
      }
      throw error;
    }
  }

  // =====================
  // INVENTORY ITEMS
  // =====================

  @Get(":merchantId/items")
  @ApiOperation({ summary: "List all inventory items for a merchant" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  async listItems(
    @Param("merchantId") merchantId: string,
    @Query("page") page = 1,
    @Query("limit") limit = 50,
    @Query("search") search?: string,
  ) {
    await this.cleanupOrphanInventoryData(merchantId);
    await this.syncAllVariantTotals(merchantId);
    const offset = (page - 1) * limit;

    let whereClause = "WHERE i.merchant_id = $1";
    const params: any[] = [merchantId];

    if (search) {
      whereClause += ` AND (
        i.name ILIKE $2 OR i.sku ILIKE $2 OR i.description ILIKE $2 OR i.category ILIKE $2 OR i.barcode ILIKE $2 OR
        EXISTS (
          SELECT 1 FROM inventory_variants sv
          WHERE sv.inventory_item_id = i.id
            AND sv.merchant_id = i.merchant_id
            AND (
              sv.name ILIKE $2 OR
              sv.sku ILIKE $2 OR
              sv.barcode ILIKE $2 OR
              sv.attributes::text ILIKE $2
            )
        )
      )`;
      params.push(`%${search}%`);
    }

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM inventory_items i ${whereClause}`,
      params,
    );

    params.push(limit, offset);
    const result = await this.pool.query(
      `SELECT i.*,
              COALESCE(NULLIF(i.name, ''), NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), i.sku) as display_name,
              MAX(COALESCE(
                NULLIF((to_jsonb(i)->>'price'), '')::numeric,
                NULLIF((to_jsonb(ci)->>'price'), '')::numeric,
                NULLIF((to_jsonb(ci)->>'base_price'), '')::numeric,
                0
              )) as effective_price,
              MAX(COALESCE(
                NULLIF((to_jsonb(i)->>'cost_price'), '')::numeric,
                NULLIF((to_jsonb(ci)->>'cost_price'), '')::numeric,
                0
              )) as effective_cost_price,
              MAX(NULLIF(to_jsonb(ci)->>'expiry_date', '')) as expiry_date,
              BOOL_OR(COALESCE(NULLIF(to_jsonb(ci)->>'is_perishable', '')::boolean, false)) as is_perishable,
              COUNT(v.id) as variant_count,
              COALESCE(SUM(v.quantity_on_hand), 0) as total_on_hand,
              COALESCE(SUM(v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)), 0) as total_available
       FROM inventory_items i
       LEFT JOIN catalog_items ci ON ci.id = i.catalog_item_id AND ci.merchant_id = i.merchant_id
       LEFT JOIN inventory_variants v ON v.inventory_item_id = i.id
       ${whereClause}
       GROUP BY i.id, ci.name_ar, ci.name_en
       ORDER BY COALESCE(NULLIF(i.name, ''), NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), i.sku)
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      items: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      },
    };
  }

  @Get(":merchantId/items/:itemId")
  @ApiOperation({ summary: "Get inventory item with variants" })
  async getItem(
    @Param("merchantId") merchantId: string,
    @Param("itemId") itemId: string,
  ) {
    const item = await this.pool.query(
      "SELECT * FROM inventory_items WHERE id = $1 AND merchant_id = $2",
      [itemId, merchantId],
    );

    if (item.rows.length === 0) {
      return { error: "Item not found", statusCode: 404 };
    }

    const variants = await this.pool.query(
      `SELECT * FROM inventory_variants WHERE inventory_item_id = $1 ORDER BY name`,
      [itemId],
    );

    return {
      ...item.rows[0],
      variants: variants.rows,
    };
  }

  @Post(":merchantId/items")
  @ApiOperation({ summary: "Create inventory item" })
  @HttpCode(HttpStatus.CREATED)
  async createItem(
    @Param("merchantId") merchantId: string,
    @Body() dto: CreateInventoryItemDto,
  ) {
    const defaultLocation =
      await this.ensureDefaultWarehouseLocation(merchantId);
    const fallbackLocation =
      defaultLocation?.name_ar || defaultLocation?.name || null;

    try {
      const result = await this.pool.query(
        `INSERT INTO inventory_items 
         (merchant_id, catalog_item_id, sku, barcode, name, track_inventory, allow_backorder, 
          low_stock_threshold, reorder_point, reorder_quantity, location, cost_price, price, category, supplier_sku)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          merchantId,
          dto.catalogItemId,
          dto.sku,
          dto.barcode,
          dto.name || dto.sku,
          dto.trackInventory ?? true,
          dto.allowBackorder ?? false,
          dto.lowStockThreshold ?? 5,
          dto.reorderPoint ?? 10,
          dto.reorderQuantity ?? 20,
          dto.location || fallbackLocation,
          dto.costPrice,
          dto.price,
          dto.category,
          dto.supplierSku,
        ],
      );

      const item = result.rows[0];
      await this.syncCatalogPerishableFields(
        merchantId,
        item.id,
        dto.expiryDate,
        dto.isPerishable,
      );
      return item;
    } catch (error) {
      const err = error as any;
      if (err?.code === "42703") {
        const fallback = await this.pool.query(
          `INSERT INTO inventory_items 
           (merchant_id, catalog_item_id, sku, barcode, name, track_inventory, allow_backorder, 
            low_stock_threshold, reorder_point, reorder_quantity, cost_price, price, category, supplier_sku)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [
            merchantId,
            dto.catalogItemId,
            dto.sku,
            dto.barcode,
            dto.name || dto.sku,
            dto.trackInventory ?? true,
            dto.allowBackorder ?? false,
            dto.lowStockThreshold ?? 5,
            dto.reorderPoint ?? 10,
            dto.reorderQuantity ?? 20,
            dto.costPrice,
            dto.price,
            dto.category,
            dto.supplierSku,
          ],
        );
        const item = fallback.rows[0];
        await this.syncCatalogPerishableFields(
          merchantId,
          item.id,
          dto.expiryDate,
          dto.isPerishable,
        );
        return item;
      }
      if (
        err?.code === "23505" &&
        err?.constraint?.includes("inventory_items_merchant_id_sku_key")
      ) {
        throw new ConflictException("رمز المنتج (SKU) موجود مسبقاً");
      }
      throw error;
    }
  }

  @Put(":merchantId/items/:itemId")
  @ApiOperation({ summary: "Update inventory item" })
  async updateItem(
    @Param("merchantId") merchantId: string,
    @Param("itemId") itemId: string,
    @Body() dto: Partial<CreateInventoryItemDto>,
  ) {
    const buildUpdate = (excludeLocation: boolean) => {
      const sets: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      const excludedColumns = new Set(["expiry_date", "is_perishable"]);

      Object.entries(dto).forEach(([key, value]) => {
        if (value === undefined || key === "merchantId") return;
        const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (excludeLocation && snakeKey === "location") return;
        if (excludedColumns.has(snakeKey)) return;
        sets.push(`${snakeKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      });

      if (sets.length === 0) return null;
      sets.push("updated_at = NOW()");
      values.push(itemId, merchantId);
      return { sets, values, paramIndex };
    };

    const runUpdate = async (excludeLocation: boolean) => {
      const payload = buildUpdate(excludeLocation);
      if (!payload) {
        const current = await this.pool.query(
          `SELECT * FROM inventory_items WHERE id = $1 AND merchant_id = $2 LIMIT 1`,
          [itemId, merchantId],
        );
        return current.rows[0] || null;
      }
      const { sets, values, paramIndex } = payload;
      const result = await this.pool.query(
        `UPDATE inventory_items SET ${sets.join(", ")} 
         WHERE id = $${paramIndex} AND merchant_id = $${paramIndex + 1}
         RETURNING *`,
        values,
      );
      return result.rows[0];
    };

    try {
      const updated = await runUpdate(false);
      await this.syncCatalogPerishableFields(
        merchantId,
        itemId,
        dto.expiryDate,
        dto.isPerishable,
      );
      return updated;
    } catch (error) {
      const err = error as any;
      if (err?.code === "42703") {
        const updated = await runUpdate(true);
        await this.syncCatalogPerishableFields(
          merchantId,
          itemId,
          dto.expiryDate,
          dto.isPerishable,
        );
        return updated;
      }
      if (
        err?.code === "23505" &&
        err?.constraint?.includes("inventory_items_merchant_id_sku_key")
      ) {
        throw new ConflictException("رمز المنتج (SKU) موجود مسبقاً");
      }
      throw error;
    }
  }

  @Delete(":merchantId/items/:itemId")
  @ApiOperation({ summary: "Delete inventory item and its variants" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(
    @Param("merchantId") merchantId: string,
    @Param("itemId") itemId: string,
  ) {
    const variants = await this.pool.query(
      `SELECT id FROM inventory_variants WHERE inventory_item_id = $1 AND merchant_id = $2`,
      [itemId, merchantId],
    );
    const variantIds = variants.rows.map((row: any) => row.id).filter(Boolean);
    if (variantIds.length > 0) {
      await this.pool.query(
        `DELETE FROM inventory_stock_by_location WHERE merchant_id = $1 AND variant_id = ANY($2)`,
        [merchantId, variantIds],
      );
    }

    // First delete all variants
    await this.pool.query(
      `DELETE FROM inventory_variants WHERE inventory_item_id = $1 AND merchant_id = $2`,
      [itemId, merchantId],
    );

    // Then delete the item
    await this.pool.query(
      `DELETE FROM inventory_items WHERE id = $1 AND merchant_id = $2`,
      [itemId, merchantId],
    );

    return { success: true };
  }

  // =====================
  // VARIANTS
  // =====================

  @Get(":merchantId/variants")
  @ApiOperation({ summary: "List all variants with stock info" })
  @ApiQuery({ name: "lowStockOnly", required: false, type: Boolean })
  async listVariants(
    @Param("merchantId") merchantId: string,
    @Query("lowStockOnly") lowStockOnly?: boolean,
  ) {
    let query = `
      SELECT v.*, i.name as item_name, i.sku as item_sku,
             COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) as effective_threshold,
             (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) as quantity_available
      FROM inventory_variants v
      JOIN inventory_items i ON v.inventory_item_id = i.id
      WHERE v.merchant_id = $1
    `;

    if (lowStockOnly) {
      query += ` AND (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) > 0
                 AND (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) <= COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5)`;
    }

    query +=
      " ORDER BY (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) ASC";

    const result = await this.pool.query(query, [merchantId]);
    return result.rows;
  }

  @Post(":merchantId/variants")
  @ApiOperation({ summary: "Create variant for inventory item" })
  @HttpCode(HttpStatus.CREATED)
  async createVariant(
    @Param("merchantId") merchantId: string,
    @Body() dto: CreateVariantDto,
  ) {
    try {
      const result = await this.pool.query(
        `INSERT INTO inventory_variants 
         (merchant_id, inventory_item_id, sku, barcode, name, attributes, 
          quantity_on_hand, low_stock_threshold, cost_price, price_modifier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          merchantId,
          dto.inventoryItemId,
          dto.sku,
          dto.barcode,
          dto.name,
          JSON.stringify(dto.attributes || {}),
          dto.quantityOnHand || 0,
          dto.lowStockThreshold,
          dto.costPrice,
          dto.priceModifier || 0,
        ],
      );

      const defaultLocation =
        await this.ensureDefaultWarehouseLocation(merchantId);
      if (defaultLocation?.id) {
        await this.ensureStockEntriesForVariant(
          merchantId,
          result.rows[0].id,
          dto.quantityOnHand || 0,
        );
      }

      return result.rows[0];
    } catch (error) {
      const err = error as any;
      if (err?.code === "23505") {
        throw new ConflictException("رمز المتغير (SKU) موجود مسبقاً");
      }
      throw error;
    }
  }

  @Put(":merchantId/variants/:variantId")
  @ApiOperation({ summary: "Update variant" })
  async updateVariant(
    @Param("merchantId") merchantId: string,
    @Param("variantId") variantId: string,
    @Body() dto: Partial<CreateVariantDto>,
  ) {
    const sets: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Map DTO fields to database columns
    const fieldMap: Record<string, string> = {
      sku: "sku",
      barcode: "barcode",
      name: "name",
      attributes: "attributes",
      lowStockThreshold: "low_stock_threshold",
      costPrice: "cost_price",
      priceModifier: "price_modifier",
    };

    Object.entries(dto).forEach(([key, value]) => {
      if (value !== undefined && key !== "inventoryItemId") {
        const dbColumn =
          fieldMap[key] || key.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (key === "attributes") {
          sets.push(`${dbColumn} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          sets.push(`${dbColumn} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    });

    if (sets.length === 0) {
      return { error: "No fields to update" };
    }

    sets.push("updated_at = NOW()");
    values.push(variantId, merchantId);

    try {
      const result = await this.pool.query(
        `UPDATE inventory_variants SET ${sets.join(", ")} 
         WHERE id = $${paramIndex} AND merchant_id = $${paramIndex + 1}
         RETURNING *`,
        values,
      );

      return result.rows[0];
    } catch (error) {
      const err = error as any;
      if (err?.code === "23505") {
        throw new ConflictException("رمز المتغير (SKU) موجود مسبقاً");
      }
      throw error;
    }
  }

  @Delete(":merchantId/variants/:variantId")
  @ApiOperation({ summary: "Delete variant" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVariant(
    @Param("merchantId") merchantId: string,
    @Param("variantId") variantId: string,
  ) {
    // Check if this is the last variant for the item
    const variant = await this.pool.query(
      "SELECT inventory_item_id FROM inventory_variants WHERE id = $1 AND merchant_id = $2",
      [variantId, merchantId],
    );

    if (variant.rows.length === 0) {
      return { error: "Variant not found" };
    }

    const itemId = variant.rows[0].inventory_item_id;
    const variantCount = await this.pool.query(
      "SELECT COUNT(*) FROM inventory_variants WHERE inventory_item_id = $1",
      [itemId],
    );

    if (parseInt(variantCount.rows[0].count) <= 1) {
      throw new Error(
        "Cannot delete the last variant. Delete the item instead.",
      );
    }

    // Delete stock movements for this variant
    await this.pool.query(
      "DELETE FROM stock_movements WHERE variant_id = $1 AND merchant_id = $2",
      [variantId, merchantId],
    );

    await this.pool.query(
      "DELETE FROM inventory_stock_by_location WHERE variant_id = $1 AND merchant_id = $2",
      [variantId, merchantId],
    );

    // Delete the variant
    await this.pool.query(
      "DELETE FROM inventory_variants WHERE id = $1 AND merchant_id = $2",
      [variantId, merchantId],
    );

    return { success: true };
  }

  // =====================
  // STOCK OPERATIONS
  // =====================

  @Post(":merchantId/variants/:variantId/stock")
  @ApiOperation({ summary: "Update stock quantity" })
  async updateStock(
    @Param("merchantId") merchantId: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateStockDto,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const current = await client.query(
        "SELECT quantity_on_hand FROM inventory_variants WHERE id = $1 AND merchant_id = $2 FOR UPDATE",
        [variantId, merchantId],
      );

      if (current.rows.length === 0) {
        throw new Error("Variant not found");
      }

      const quantityBefore = current.rows[0].quantity_on_hand;
      const quantityAfter = quantityBefore + dto.quantity;

      if (quantityAfter < 0) {
        throw new Error(`Insufficient stock. Current: ${quantityBefore}`);
      }

      await client.query(
        "UPDATE inventory_variants SET quantity_on_hand = $1, updated_at = NOW() WHERE id = $2",
        [quantityAfter, variantId],
      );

      const defaultLocation =
        await this.ensureDefaultWarehouseLocation(merchantId);
      if (defaultLocation?.id) {
        const existingLocation = await client.query(
          `SELECT quantity_on_hand FROM inventory_stock_by_location
           WHERE merchant_id = $1 AND variant_id = $2 AND location_id = $3
           FOR UPDATE`,
          [merchantId, variantId, defaultLocation.id],
        );

        if (existingLocation.rows.length === 0) {
          await client.query(
            `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
             VALUES ($1, $2, $3, $4)`,
            [merchantId, variantId, defaultLocation.id, quantityAfter],
          );
        } else {
          await client.query(
            `UPDATE inventory_stock_by_location
             SET quantity_on_hand = quantity_on_hand + $4, updated_at = NOW()
             WHERE merchant_id = $1 AND variant_id = $2 AND location_id = $3`,
            [merchantId, variantId, defaultLocation.id, dto.quantity],
          );
        }
      }

      // Ensure zeroed entries for other active locations
      await this.ensureStockEntriesForVariant(
        merchantId,
        variantId,
        quantityAfter,
      );

      await client.query(
        `INSERT INTO stock_movements 
         (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, reference_id, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'api')`,
        [
          merchantId,
          variantId,
          dto.movementType,
          dto.quantity,
          quantityBefore,
          quantityAfter,
          dto.referenceId,
          dto.reason,
        ],
      );

      await client.query("COMMIT");

      this.webSocketService.emit(merchantId, RealTimeEvent.STOCK_UPDATED, {
        variantId,
        quantityBefore,
        quantityAfter,
        change: dto.quantity,
        movementType: dto.movementType,
        reason: dto.reason || null,
        referenceId: dto.referenceId || null,
        updatedAt: new Date().toISOString(),
      });

      return {
        variantId,
        quantityBefore,
        quantityAfter,
        change: dto.quantity,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Post(":merchantId/stock/bulk")
  @ApiOperation({ summary: "Bulk update stock quantities" })
  async bulkUpdateStock(
    @Param("merchantId") merchantId: string,
    @Body() dto: BulkStockUpdateDto,
  ) {
    const results: any[] = [];
    const errors: any[] = [];

    for (const update of dto.updates) {
      try {
        const result = await this.updateStock(merchantId, update.variantId, {
          quantity: update.quantity,
          movementType: update.movementType,
          reason: update.reason,
        });
        results.push(result);
      } catch (error) {
        errors.push({
          variantId: update.variantId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { successful: results, failed: errors };
  }

  // =====================
  // STOCK TRANSFER
  // =====================

  @Post(":merchantId/stock/transfer")
  @ApiOperation({ summary: "Transfer stock between locations" })
  async transferStock(
    @Param("merchantId") merchantId: string,
    @Body() dto: StockTransferDto,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get current stock and verify sufficient quantity
      const current = await client.query(
        "SELECT quantity_on_hand, name FROM inventory_variants WHERE id = $1 AND merchant_id = $2 FOR UPDATE",
        [dto.variantId, merchantId],
      );

      if (current.rows.length === 0) {
        throw new Error("Variant not found");
      }

      const quantityBefore = current.rows[0].quantity_on_hand;
      const variantName = current.rows[0].name;

      if (quantityBefore < dto.quantity) {
        throw new Error(`Insufficient stock. Available: ${quantityBefore}`);
      }

      // Update stock by location (if warehouse locations exist)
      const fromLocation = await client.query(
        `SELECT id FROM warehouse_locations 
         WHERE merchant_id = $1 AND is_active = true AND (name = $2 OR name_ar = $2)
         LIMIT 1`,
        [merchantId, dto.fromLocation],
      );
      const toLocation = await client.query(
        `SELECT id FROM warehouse_locations 
         WHERE merchant_id = $1 AND is_active = true AND (name = $2 OR name_ar = $2)
         LIMIT 1`,
        [merchantId, dto.toLocation],
      );

      if (fromLocation.rows.length === 0 || toLocation.rows.length === 0) {
        throw new BadRequestException("الموقع المصدر أو الوجهة غير موجود");
      }

      const sourceStock = await client.query(
        `SELECT quantity_on_hand FROM inventory_stock_by_location
         WHERE merchant_id = $1 AND variant_id = $2 AND location_id = $3 FOR UPDATE`,
        [merchantId, dto.variantId, fromLocation.rows[0].id],
      );

      if (
        sourceStock.rows.length === 0 ||
        sourceStock.rows[0].quantity_on_hand < dto.quantity
      ) {
        throw new BadRequestException("المخزون غير كافٍ في الموقع المصدر");
      }

      // Decrease from source
      await client.query(
        `UPDATE inventory_stock_by_location 
         SET quantity_on_hand = quantity_on_hand - $4, updated_at = NOW()
         WHERE merchant_id = $1 AND variant_id = $2 AND location_id = $3`,
        [merchantId, dto.variantId, fromLocation.rows[0].id, dto.quantity],
      );

      // Increase at destination (upsert)
      await client.query(
        `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (merchant_id, variant_id, location_id)
         DO UPDATE SET quantity_on_hand = inventory_stock_by_location.quantity_on_hand + $4, updated_at = NOW()`,
        [merchantId, dto.variantId, toLocation.rows[0].id, dto.quantity],
      );

      await this.syncVariantTotals(client, merchantId, dto.variantId);

      // Record the transfer movement
      await client.query(
        `INSERT INTO stock_movements 
         (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, 
          reference_id, reason, created_by, metadata)
         VALUES ($1, $2, 'transfer', $3, $4, $4, $5, $6, 'portal', $7)`,
        [
          merchantId,
          dto.variantId,
          dto.quantity,
          quantityBefore,
          `transfer-${Date.now()}`,
          dto.reason || `نقل من ${dto.fromLocation} إلى ${dto.toLocation}`,
          JSON.stringify({
            fromLocation: dto.fromLocation,
            toLocation: dto.toLocation,
            transferredQuantity: dto.quantity,
          }),
        ],
      );

      await client.query("COMMIT");

      this.webSocketService.emit(merchantId, RealTimeEvent.STOCK_UPDATED, {
        variantId: dto.variantId,
        quantityBefore,
        quantityAfter: quantityBefore,
        change: 0,
        movementType: "transfer",
        reason:
          dto.reason || `نقل من ${dto.fromLocation} إلى ${dto.toLocation}`,
        transfer: {
          fromLocation: dto.fromLocation,
          toLocation: dto.toLocation,
          quantity: dto.quantity,
        },
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        transfer: {
          variantId: dto.variantId,
          variantName,
          quantity: dto.quantity,
          fromLocation: dto.fromLocation,
          toLocation: dto.toLocation,
          reason: dto.reason,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================
  // BULK IMPORT
  // =====================

  @Post(":merchantId/stock/import")
  @ApiOperation({ summary: "Bulk import inventory items" })
  async bulkImport(
    @Param("merchantId") merchantId: string,
    @Body() dto: BulkImportDto,
  ) {
    const results = {
      created: [] as any[],
      updated: [] as any[],
      errors: [] as any[],
    };

    for (const item of dto.items) {
      try {
        // Check if item exists by SKU
        const existing = await this.pool.query(
          `SELECT i.id, v.id as variant_id 
           FROM inventory_items i
           LEFT JOIN inventory_variants v ON v.inventory_item_id = i.id
           WHERE i.merchant_id = $1 AND (i.sku = $2 OR v.sku = $2)
           LIMIT 1`,
          [merchantId, item.sku],
        );

        if (existing.rows.length > 0 && dto.updateExisting) {
          // Update existing item
          const variantId = existing.rows[0].variant_id || existing.rows[0].id;

          if (existing.rows[0].variant_id) {
            // Update variant
            const updateFields: string[] = [];
            const updateValues: any[] = [];
            let paramIdx = 1;

            if (item.name) {
              updateFields.push(`name = $${paramIdx++}`);
              updateValues.push(item.name);
            }
            if (item.quantity !== undefined) {
              updateFields.push(`quantity_on_hand = $${paramIdx++}`);
              updateValues.push(item.quantity);
            }
            if (item.costPrice !== undefined) {
              updateFields.push(`cost_price = $${paramIdx++}`);
              updateValues.push(item.costPrice);
            }
            if (item.lowStockThreshold !== undefined) {
              updateFields.push(`low_stock_threshold = $${paramIdx++}`);
              updateValues.push(item.lowStockThreshold);
            }
            if (item.barcode) {
              updateFields.push(`barcode = $${paramIdx++}`);
              updateValues.push(item.barcode);
            }

            if (updateFields.length > 0) {
              updateFields.push("updated_at = NOW()");
              updateValues.push(variantId, merchantId);

              await this.pool.query(
                `UPDATE inventory_variants SET ${updateFields.join(", ")} 
                 WHERE id = $${paramIdx} AND merchant_id = $${paramIdx + 1}`,
                updateValues,
              );
            }
          }

          if (item.quantity !== undefined) {
            const defaultLocation =
              await this.ensureDefaultWarehouseLocation(merchantId);
            if (defaultLocation?.id) {
              await this.ensureStockEntriesForVariant(
                merchantId,
                variantId,
                item.quantity,
              );
              await this.pool.query(
                `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (merchant_id, variant_id, location_id)
                 DO UPDATE SET quantity_on_hand = $4, updated_at = NOW()`,
                [merchantId, variantId, defaultLocation.id, item.quantity],
              );
            }
          }

          results.updated.push({ sku: item.sku, id: variantId });
        } else if (existing.rows.length === 0) {
          // Create new item and variant
          const defaultLocation =
            await this.ensureDefaultWarehouseLocation(merchantId);
          const fallbackLocation =
            item.location ||
            defaultLocation?.name_ar ||
            defaultLocation?.name ||
            null;
          const newItem = await this.pool.query(
            `INSERT INTO inventory_items 
             (merchant_id, sku, name, low_stock_threshold, location, cost_price)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              merchantId,
              item.sku,
              item.name || item.sku,
              item.lowStockThreshold || 5,
              fallbackLocation,
              item.costPrice,
            ],
          );

          // Create default variant
          const newVariant = await this.pool.query(
            `INSERT INTO inventory_variants 
             (merchant_id, inventory_item_id, sku, barcode, name, quantity_on_hand, low_stock_threshold, cost_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              merchantId,
              newItem.rows[0].id,
              item.sku,
              item.barcode,
              item.name || item.sku,
              item.quantity || 0,
              item.lowStockThreshold || 5,
              item.costPrice,
            ],
          );

          if (defaultLocation?.id) {
            await this.ensureStockEntriesForVariant(
              merchantId,
              newVariant.rows[0].id,
              item.quantity || 0,
            );
            await this.pool.query(
              `INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (merchant_id, variant_id, location_id)
               DO UPDATE SET quantity_on_hand = $4, updated_at = NOW()`,
              [
                merchantId,
                newVariant.rows[0].id,
                defaultLocation.id,
                item.quantity || 0,
              ],
            );
          }

          results.created.push({
            sku: item.sku,
            id: newVariant.rows[0].id,
            itemId: newItem.rows[0].id,
          });
        } else {
          results.errors.push({
            sku: item.sku,
            error: "Item exists and updateExisting is false",
          });
        }
      } catch (error) {
        results.errors.push({
          sku: item.sku,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      success: true,
      summary: {
        total: dto.items.length,
        created: results.created.length,
        updated: results.updated.length,
        errors: results.errors.length,
      },
      results,
    };
  }

  // =====================
  // BARCODE LOOKUP
  // =====================

  @Get(":merchantId/barcode/:barcode")
  @ApiOperation({ summary: "Find item by barcode" })
  async findByBarcode(
    @Param("merchantId") merchantId: string,
    @Param("barcode") barcode: string,
  ) {
    // First try variants
    const variant = await this.pool.query(
      `SELECT v.*, i.name as item_name, i.sku as item_sku
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE v.merchant_id = $1 AND (v.barcode = $2 OR v.sku = $2)
       LIMIT 1`,
      [merchantId, barcode],
    );

    if (variant.rows.length > 0) {
      return { found: true, type: "variant", data: variant.rows[0] };
    }

    // Then try items
    const item = await this.pool.query(
      `SELECT i.*, 
              (SELECT COUNT(*) FROM inventory_variants WHERE inventory_item_id = i.id) as variant_count
       FROM inventory_items i
       WHERE i.merchant_id = $1 AND (i.barcode = $2 OR i.sku = $2)
       LIMIT 1`,
      [merchantId, barcode],
    );

    if (item.rows.length > 0) {
      return { found: true, type: "item", data: item.rows[0] };
    }

    return { found: false, barcode };
  }

  // =====================
  // LOCATIONS
  // =====================

  @Get(":merchantId/locations")
  @ApiOperation({ summary: "Get all unique locations" })
  async getLocations(@Param("merchantId") merchantId: string) {
    const result = await this.pool.query(
      `SELECT 
         COALESCE(wl.name_ar, wl.name) as location,
         COUNT(DISTINCT sbl.variant_id) as item_count,
         COALESCE(SUM(sbl.quantity_on_hand), 0) as total_quantity
       FROM warehouse_locations wl
       LEFT JOIN inventory_stock_by_location sbl 
         ON sbl.location_id = wl.id AND sbl.merchant_id = $1
       WHERE wl.merchant_id = $1 AND wl.is_active = true
       GROUP BY wl.id, wl.name, wl.name_ar
       ORDER BY wl.is_default DESC, wl.name`,
      [merchantId],
    );

    return result.rows;
  }

  // =====================
  // RESERVATIONS
  // =====================

  @Post(":merchantId/reservations")
  @ApiOperation({ summary: "Reserve stock for order" })
  async createReservation(
    @Param("merchantId") merchantId: string,
    @Body() dto: ReserveStockDto,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const available = await client.query(
        `SELECT (quantity_on_hand - COALESCE(quantity_reserved, 0)) as quantity_available FROM inventory_variants WHERE id = $1 AND merchant_id = $2 FOR UPDATE`,
        [dto.variantId, merchantId],
      );

      if (available.rows.length === 0) {
        throw new Error("Variant not found");
      }

      if (available.rows[0].quantity_available < dto.quantity) {
        return {
          success: false,
          reason: "insufficient_stock",
          available: available.rows[0].quantity_available,
        };
      }

      const expiresAt = new Date(
        Date.now() + (dto.expiresInMinutes || 30) * 60 * 1000,
      );

      const reservation = await client.query(
        `INSERT INTO stock_reservations 
         (merchant_id, variant_id, order_id, conversation_id, quantity, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          merchantId,
          dto.variantId,
          dto.orderId,
          dto.conversationId,
          dto.quantity,
          expiresAt,
        ],
      );

      await client.query(
        "UPDATE inventory_variants SET quantity_reserved = quantity_reserved + $1 WHERE id = $2",
        [dto.quantity, dto.variantId],
      );
      await this.adjustLocationReserved(
        client,
        merchantId,
        dto.variantId,
        dto.quantity,
        false,
      );

      await client.query("COMMIT");

      return {
        success: true,
        reservation: reservation.rows[0],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Post(":merchantId/reservations/:reservationId/confirm")
  @ApiOperation({ summary: "Confirm reservation (deduct from stock)" })
  async confirmReservation(
    @Param("merchantId") merchantId: string,
    @Param("reservationId") reservationId: string,
  ) {
    // Implementation similar to agent
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const res = await client.query(
        "SELECT * FROM stock_reservations WHERE id = $1 AND merchant_id = $2 FOR UPDATE",
        [reservationId, merchantId],
      );

      if (res.rows.length === 0 || res.rows[0].status !== "active") {
        throw new Error("Invalid reservation");
      }

      const reservation = res.rows[0];

      await client.query(
        `UPDATE stock_reservations SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
        [reservationId],
      );

      await client.query(
        `UPDATE inventory_variants 
         SET quantity_on_hand = quantity_on_hand - $1,
             quantity_reserved = quantity_reserved - $1
         WHERE id = $2`,
        [reservation.quantity, reservation.variant_id],
      );
      await this.adjustLocationReserved(
        client,
        merchantId,
        reservation.variant_id,
        -reservation.quantity,
        true,
      );

      await client.query("COMMIT");

      return { success: true, reservationId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Post(":merchantId/reservations/:reservationId/release")
  @ApiOperation({ summary: "Release reservation back to available stock" })
  async releaseReservation(
    @Param("merchantId") merchantId: string,
    @Param("reservationId") reservationId: string,
    @Body() body: { reason?: string },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const res = await client.query(
        "SELECT * FROM stock_reservations WHERE id = $1 AND merchant_id = $2 FOR UPDATE",
        [reservationId, merchantId],
      );

      if (res.rows.length === 0 || res.rows[0].status !== "active") {
        throw new Error("Invalid reservation");
      }

      const reservation = res.rows[0];

      await client.query(
        `UPDATE stock_reservations SET status = 'released', released_at = NOW(), release_reason = $1 WHERE id = $2`,
        [body.reason || "API release", reservationId],
      );

      await client.query(
        "UPDATE inventory_variants SET quantity_reserved = quantity_reserved - $1 WHERE id = $2",
        [reservation.quantity, reservation.variant_id],
      );
      await this.adjustLocationReserved(
        client,
        merchantId,
        reservation.variant_id,
        -reservation.quantity,
        false,
      );

      await client.query("COMMIT");

      return { success: true, reservationId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================
  // REPORTS
  // =====================

  @Get(":merchantId/reports/summary")
  @ApiOperation({ summary: "Get inventory summary report" })
  async getSummary(@Param("merchantId") merchantId: string) {
    await this.cleanupOrphanInventoryData(merchantId);
    await this.syncAllVariantTotals(merchantId);
    const result = await this.pool.query(
      `SELECT 
         COUNT(DISTINCT i.id) as total_items,
         COUNT(DISTINCT v.id) as total_variants,
         COALESCE(SUM(GREATEST(COALESCE(v.quantity_on_hand, 0), 0)), 0) as total_on_hand,
         COALESCE(SUM(GREATEST(COALESCE(v.quantity_reserved, 0), 0)), 0) as total_reserved,
         COALESCE(SUM(GREATEST(COALESCE(v.quantity_on_hand, 0) - GREATEST(COALESCE(v.quantity_reserved, 0), 0), 0)), 0) as total_available,
         COALESCE(
           SUM(
             GREATEST(COALESCE(v.quantity_on_hand, 0), 0)
             * GREATEST(COALESCE(v.cost_price, i.cost_price, 0), 0)
           ),
           0
         ) as inventory_value,
         COUNT(
           CASE
             WHEN GREATEST(COALESCE(v.quantity_on_hand, 0) - GREATEST(COALESCE(v.quantity_reserved, 0), 0), 0) > 0
              AND GREATEST(COALESCE(v.quantity_on_hand, 0) - GREATEST(COALESCE(v.quantity_reserved, 0), 0), 0)
               <= COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5)
             THEN 1
           END
         ) as low_stock_count,
         COUNT(
           CASE
             WHEN GREATEST(COALESCE(v.quantity_on_hand, 0) - GREATEST(COALESCE(v.quantity_reserved, 0), 0), 0) = 0
             THEN 1
           END
         ) as out_of_stock_count
       FROM inventory_items i
       LEFT JOIN inventory_variants v ON v.inventory_item_id = i.id AND v.is_active = true
       WHERE i.merchant_id = $1`,
      [merchantId],
    );

    return result.rows[0];
  }

  @Get(":merchantId/reports/low-stock")
  @ApiOperation({ summary: "Get low stock items" })
  async getLowStock(@Param("merchantId") merchantId: string) {
    const result = await this.pool.query(
      `SELECT v.*, i.name as item_name, i.reorder_point, i.reorder_quantity,
              COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5) as threshold,
              (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) as quantity_available
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE v.merchant_id = $1 
         AND v.is_active = true
         AND (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) > 0
         AND (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) <= COALESCE(v.low_stock_threshold, i.low_stock_threshold, 5)
       ORDER BY (v.quantity_on_hand - COALESCE(v.quantity_reserved, 0)) ASC`,
      [merchantId],
    );

    return result.rows;
  }

  @Get(":merchantId/reports/movements")
  @ApiOperation({ summary: "Get stock movements history" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiQuery({ name: "variantId", required: false, type: String })
  async getMovements(
    @Param("merchantId") merchantId: string,
    @Query("days") days = 7,
    @Query("variantId") variantId?: string,
  ) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let query = `
      SELECT m.*, v.sku, v.name as variant_name
      FROM stock_movements m
      JOIN inventory_variants v ON m.variant_id = v.id
      WHERE m.merchant_id = $1 AND m.created_at >= $2
    `;
    const params: any[] = [merchantId, since];

    if (variantId) {
      query += " AND m.variant_id = $3";
      params.push(variantId);
    }

    query += " ORDER BY m.created_at DESC LIMIT 500";

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // =====================
  // ALERTS
  // =====================

  @Get(":merchantId/alerts")
  @ApiOperation({ summary: "Get active inventory alerts" })
  async getAlerts(@Param("merchantId") merchantId: string) {
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

    return result.rows;
  }

  @Put(":merchantId/alerts/:alertId/acknowledge")
  @ApiOperation({ summary: "Acknowledge an alert" })
  async acknowledgeAlert(
    @Param("merchantId") merchantId: string,
    @Param("alertId") alertId: string,
  ) {
    await this.pool.query(
      `UPDATE inventory_alerts 
       SET status = 'acknowledged', acknowledged_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [alertId, merchantId],
    );

    return { success: true };
  }

  @Put(":merchantId/alerts/:alertId/dismiss")
  @ApiOperation({ summary: "Dismiss an alert" })
  async dismissAlert(
    @Param("merchantId") merchantId: string,
    @Param("alertId") alertId: string,
  ) {
    await this.pool.query(
      `UPDATE inventory_alerts 
       SET status = 'dismissed'
       WHERE id = $1 AND merchant_id = $2`,
      [alertId, merchantId],
    );

    return { success: true };
  }

  // =====================
  // WAREHOUSE LOCATIONS
  // =====================

  @Get(":merchantId/warehouse-locations")
  @ApiOperation({ summary: "Get all warehouse locations for merchant" })
  async getWarehouseLocations(@Param("merchantId") merchantId: string) {
    const defaultLocation =
      await this.ensureDefaultWarehouseLocation(merchantId);
    if (defaultLocation?.id) {
      await this.ensureDefaultStockByLocation(merchantId, defaultLocation.id);
    }
    const result = await this.pool.query(
      `SELECT id, name, name_ar, address, city, is_default, is_active, created_at
       FROM warehouse_locations
       WHERE merchant_id = $1 AND is_active = true
       ORDER BY is_default DESC, name ASC`,
      [merchantId],
    );

    return { locations: result.rows };
  }

  @Post(":merchantId/warehouse-locations")
  @ApiOperation({ summary: "Create a new warehouse location" })
  @HttpCode(HttpStatus.CREATED)
  async createWarehouseLocation(
    @Param("merchantId") merchantId: string,
    @Body() dto: CreateWarehouseLocationDto,
  ) {
    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await this.pool.query(
        "UPDATE warehouse_locations SET is_default = false WHERE merchant_id = $1",
        [merchantId],
      );
    }

    const result = await this.pool.query(
      `INSERT INTO warehouse_locations (merchant_id, name, name_ar, address, city, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        merchantId,
        dto.name,
        dto.nameAr,
        dto.address,
        dto.city,
        dto.isDefault || false,
      ],
    );

    // Ensure all variants are present in this new location with zero stock
    await this.ensureStockEntriesForLocation(merchantId, result.rows[0].id);

    return result.rows[0];
  }

  @Delete(":merchantId/warehouse-locations/:locationId")
  @ApiOperation({ summary: "Delete a warehouse location (soft delete)" })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWarehouseLocation(
    @Param("merchantId") merchantId: string,
    @Param("locationId") locationId: string,
  ) {
    const location = await this.pool.query(
      `SELECT is_default FROM warehouse_locations WHERE id = $1 AND merchant_id = $2`,
      [locationId, merchantId],
    );
    if (location.rows[0]?.is_default) {
      const fallback = await this.pool.query(
        `SELECT id FROM warehouse_locations
         WHERE merchant_id = $1 AND id <> $2 AND is_active = true
         ORDER BY created_at ASC
         LIMIT 1`,
        [merchantId, locationId],
      );
      if (fallback.rows.length === 0) {
        throw new BadRequestException("لا يمكن حذف الموقع الافتراضي الوحيد");
      }
      await this.pool.query(
        `UPDATE warehouse_locations SET is_default = false WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.pool.query(
        `UPDATE warehouse_locations SET is_default = true WHERE id = $1`,
        [fallback.rows[0].id],
      );
    }
    await this.pool.query(
      `UPDATE warehouse_locations SET is_active = false WHERE id = $1 AND merchant_id = $2`,
      [locationId, merchantId],
    );

    return { success: true };
  }

  // =====================
  // STOCK BY LOCATION
  // =====================

  @Get(":merchantId/stock-by-location")
  @ApiOperation({ summary: "Get stock quantities grouped by location" })
  async getStockByLocation(
    @Param("merchantId") merchantId: string,
    @Query("locationId") locationId?: string,
  ) {
    await this.cleanupOrphanInventoryData(merchantId);
    const defaultLocation =
      await this.ensureDefaultWarehouseLocation(merchantId);
    if (defaultLocation?.id) {
      await this.ensureDefaultStockByLocation(merchantId, defaultLocation.id);
    }
    await this.pool.query(
      `UPDATE inventory_variants v
       SET quantity_on_hand = s.total, updated_at = NOW()
       FROM (
         SELECT variant_id, COALESCE(SUM(quantity_on_hand), 0) as total
         FROM inventory_stock_by_location
         WHERE merchant_id = $1
         GROUP BY variant_id
       ) s
       WHERE v.id = s.variant_id AND v.merchant_id = $1`,
      [merchantId],
    );
    let query = `
      SELECT 
        sbl.id,
        sbl.variant_id,
        sbl.location_id,
        sbl.quantity_on_hand,
        sbl.quantity_reserved,
        sbl.quantity_available,
        sbl.bin_location,
        iv.sku,
        iv.name as variant_name,
        iv.inventory_item_id,
        COALESCE(NULLIF(ii.name, ''), NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), iv.name, ii.sku) as item_name,
        COALESCE(ii.sku, ci.sku, iv.sku) as item_sku,
        wl.name as location_name,
        wl.name_ar as location_name_ar
      FROM inventory_stock_by_location sbl
      JOIN inventory_variants iv ON sbl.variant_id = iv.id
      JOIN inventory_items ii ON iv.inventory_item_id = ii.id
      LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
      JOIN warehouse_locations wl ON sbl.location_id = wl.id
      WHERE sbl.merchant_id = $1
    `;
    const params: any[] = [merchantId];

    if (locationId) {
      query += " AND sbl.location_id = $2";
      params.push(locationId);
    }

    query += " ORDER BY wl.name, iv.name";

    const result = await this.pool.query(query, params);

    // Also get summary per location
    const summaryResult = await this.pool.query(
      `
      SELECT 
        wl.id as location_id,
        wl.name as location_name,
        wl.name_ar as location_name_ar,
        COALESCE(SUM(CASE WHEN ii.id IS NOT NULL THEN COALESCE(sbl.quantity_on_hand, 0) ELSE 0 END), 0) as total_on_hand,
        COALESCE(SUM(CASE WHEN ii.id IS NOT NULL THEN COALESCE(sbl.quantity_reserved, 0) ELSE 0 END), 0) as total_reserved,
        COALESCE(SUM(CASE WHEN ii.id IS NOT NULL THEN (COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0)) ELSE 0 END), 0) as total_available,
        COUNT(DISTINCT CASE WHEN ii.id IS NOT NULL THEN sbl.variant_id END) as variant_count,
        COUNT(DISTINCT CASE WHEN ii.id IS NOT NULL THEN ii.id END) as product_count
      FROM warehouse_locations wl
      LEFT JOIN inventory_stock_by_location sbl ON wl.id = sbl.location_id AND sbl.merchant_id = $1
      LEFT JOIN inventory_variants iv ON sbl.variant_id = iv.id
      LEFT JOIN inventory_items ii ON iv.inventory_item_id = ii.id
      WHERE wl.merchant_id = $1 AND wl.is_active = true
      GROUP BY wl.id, wl.name, wl.name_ar
      ORDER BY wl.is_default DESC, wl.name
    `,
      [merchantId],
    );

    return {
      stockByLocation: result.rows,
      locationSummary: summaryResult.rows,
    };
  }

  @Post(":merchantId/stock-by-location")
  @ApiOperation({ summary: "Set stock for a variant at a specific location" })
  async setStockByLocation(
    @Param("merchantId") merchantId: string,
    @Body()
    dto: {
      variantId: string;
      locationId: string;
      quantity: number;
      binLocation?: string;
    },
  ) {
    const result = await this.pool.query(
      `
      INSERT INTO inventory_stock_by_location 
        (merchant_id, variant_id, location_id, quantity_on_hand, bin_location)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (merchant_id, variant_id, location_id)
      DO UPDATE SET 
        quantity_on_hand = $4,
        bin_location = COALESCE($5, inventory_stock_by_location.bin_location),
        updated_at = NOW()
      RETURNING *
    `,
      [
        merchantId,
        dto.variantId,
        dto.locationId,
        dto.quantity,
        dto.binLocation,
      ],
    );

    await this.syncVariantTotals(this.pool, merchantId, dto.variantId);

    return { stock: result.rows[0] };
  }

  @Post(":merchantId/stock-by-location/transfer")
  @ApiOperation({ summary: "Transfer stock between locations" })
  async transferStockBetweenLocations(
    @Param("merchantId") merchantId: string,
    @Body()
    dto: {
      variantId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
      reason?: string;
    },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Check source stock
      const source = await client.query(
        `SELECT quantity_on_hand FROM inventory_stock_by_location 
         WHERE merchant_id = $1 AND variant_id = $2 AND location_id = $3 FOR UPDATE`,
        [merchantId, dto.variantId, dto.fromLocationId],
      );

      if (
        source.rows.length === 0 ||
        source.rows[0].quantity_on_hand < dto.quantity
      ) {
        throw new Error("Insufficient stock at source location");
      }

      // Decrease from source
      await client.query(
        `UPDATE inventory_stock_by_location 
         SET quantity_on_hand = quantity_on_hand - $4, updated_at = NOW()
         WHERE merchant_id = $1 AND variant_id = $2 AND location_id = $3`,
        [merchantId, dto.variantId, dto.fromLocationId, dto.quantity],
      );

      // Increase at destination (upsert)
      await client.query(
        `
        INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (merchant_id, variant_id, location_id)
        DO UPDATE SET quantity_on_hand = inventory_stock_by_location.quantity_on_hand + $4, updated_at = NOW()
      `,
        [merchantId, dto.variantId, dto.toLocationId, dto.quantity],
      );

      await this.syncVariantTotals(client, merchantId, dto.variantId);

      // Record movement
      await client.query(
        `
        INSERT INTO stock_movements 
        (merchant_id, variant_id, movement_type, quantity, reason, metadata)
        VALUES ($1, $2, 'transfer', $3, $4, $5)
      `,
        [
          merchantId,
          dto.variantId,
          dto.quantity,
          dto.reason || "Location transfer",
          JSON.stringify({
            fromLocationId: dto.fromLocationId,
            toLocationId: dto.toLocationId,
          }),
        ],
      );

      await client.query("COMMIT");

      return { success: true, quantity: dto.quantity };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async syncCatalogFromInventoryItem(
    merchantId: string,
    item: any,
  ): Promise<void> {
    if (!item) return;
    const sku = item.sku ?? null;
    const name = item.name || item.item_name || item.sku || "منتج";
    const category = item.category || null;
    const rawPrice = item.price ?? item.base_price ?? item.sell_price;
    const price =
      rawPrice !== null && rawPrice !== undefined ? Number(rawPrice) : null;
    const catalogItemId = item.catalog_item_id || item.catalogItemId;

    try {
      const updateCatalog = async (id: string) => {
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
        if (price !== null && Number.isFinite(price)) {
          updates.push(`base_price = $${idx++}`);
          values.push(price);
        }

        updates.push(`updated_at = NOW()`);
        values.push(id, merchantId);
        await this.pool.query(
          `UPDATE catalog_items SET ${updates.join(", ")} WHERE id = $${idx} AND merchant_id = $${idx + 1}`,
          values,
        );
      };

      if (catalogItemId) {
        await updateCatalog(catalogItemId);
        return;
      }

      let existingId: string | null = null;
      if (sku) {
        const existing = await this.pool.query(
          `SELECT id FROM catalog_items WHERE merchant_id = $1 AND sku = $2 LIMIT 1`,
          [merchantId, sku],
        );
        if (existing.rows.length) {
          existingId = existing.rows[0].id;
        }
      }

      if (existingId) {
        await this.pool.query(
          `UPDATE inventory_items SET catalog_item_id = $1, updated_at = NOW() WHERE id = $2`,
          [existingId, item.id],
        );
        await updateCatalog(existingId);
        return;
      }

      const insert = await this.pool.query(
        `INSERT INTO catalog_items (merchant_id, sku, name_ar, base_price, category, is_available, variants, options)
         VALUES ($1, $2, $3, $4, $5, true, '[]', '[]')
         RETURNING id`,
        [merchantId, sku, name, price ?? 0, category],
      );

      const newCatalogId = insert.rows[0].id;
      await this.pool.query(
        `UPDATE inventory_items SET catalog_item_id = $1, updated_at = NOW() WHERE id = $2`,
        [newCatalogId, item.id],
      );
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        return;
      }
      throw error;
    }
  }
}
