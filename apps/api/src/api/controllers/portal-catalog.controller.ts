import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import { getMerchantId, toNumber, toBoolean } from "./portal-compat.helpers";

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalCatalogController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get("catalog/:itemId/recipe")
  @ApiOperation({ summary: "Get recipe (BOM) for catalog item" })
  async getCatalogItemRecipe(
    @Req() req: Request,
    @Param("itemId") itemId: string,
  ) {
    const merchantId = getMerchantId(req);

    const recipeResult = await this.pool.query<{
      id: string;
      ingredient_inventory_item_id: string | null;
      ingredient_name: string;
      quantity_required: string;
      unit: string;
      is_optional: boolean;
      waste_factor: string;
      notes: string | null;
      ingredient_sku: string;
      ingredient_cost: string;
    }>(
      `SELECT
         r.id::text as id,
         r.ingredient_inventory_item_id::text as ingredient_inventory_item_id,
         r.ingredient_name,
         r.quantity_required::text as quantity_required,
         r.unit,
         COALESCE(r.is_optional, false) as is_optional,
         COALESCE(r.waste_factor, 1)::text as waste_factor,
         r.notes,
         COALESCE(ii.sku, ic.sku, '') as ingredient_sku,
         COALESCE(vcost.cost_price, ii.cost_price, 0)::text as ingredient_cost
       FROM item_recipes r
       LEFT JOIN inventory_items ii
         ON ii.id = r.ingredient_inventory_item_id
         AND ii.merchant_id = r.merchant_id
       LEFT JOIN catalog_items ic
         ON ic.id = r.ingredient_catalog_item_id
         AND ic.merchant_id = r.merchant_id
       LEFT JOIN LATERAL (
         SELECT v.cost_price
         FROM inventory_variants v
         WHERE v.merchant_id = r.merchant_id
           AND v.inventory_item_id = r.ingredient_inventory_item_id
           AND COALESCE(v.is_active, true) = true
         ORDER BY v.quantity_on_hand DESC, v.created_at ASC
         LIMIT 1
       ) vcost ON true
       WHERE r.merchant_id = $1
         AND r.catalog_item_id::text = $2
       ORDER BY r.sort_order ASC, r.created_at ASC`,
      [merchantId, itemId],
    );

    const ingredients = recipeResult.rows.map((row) => {
      const quantityRequired = toNumber(row.quantity_required, 0);
      const wasteFactor = toNumber(row.waste_factor, 1);
      const ingredientCost = toNumber(row.ingredient_cost, 0);
      return {
        id: row.id,
        ingredient_inventory_item_id: row.ingredient_inventory_item_id,
        ingredient_name: row.ingredient_name,
        quantity_required: quantityRequired,
        unit: row.unit || "piece",
        is_optional: Boolean(row.is_optional),
        waste_factor: wasteFactor,
        notes: row.notes || "",
        ingredient_sku: row.ingredient_sku || "",
        ingredient_cost: ingredientCost,
      };
    });

    const totalCostPerUnit = ingredients.reduce((sum, ingredient) => {
      const effectiveQty =
        ingredient.quantity_required * (ingredient.waste_factor || 1);
      return sum + effectiveQty * (ingredient.ingredient_cost || 0);
    }, 0);

    return {
      catalogItemId: itemId,
      ingredients,
      totalCostPerUnit: Number(totalCostPerUnit.toFixed(2)),
      ingredientCount: ingredients.length,
    };
  }

  @Post("catalog/:itemId/recipe")
  @ApiOperation({ summary: "Add ingredient to catalog item recipe" })
  async addCatalogItemRecipeIngredient(
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Body()
    body: {
      ingredientInventoryItemId?: string;
      ingredientCatalogItemId?: string;
      ingredientName?: string;
      quantityRequired?: number;
      unit?: string;
      isOptional?: boolean;
      wasteFactor?: number;
      notes?: string;
      sortOrder?: number;
    },
  ) {
    const merchantId = getMerchantId(req);
    const catalogItem = await this.pool.query<{ id: string }>(
      `SELECT id FROM catalog_items WHERE merchant_id = $1 AND id::text = $2 LIMIT 1`,
      [merchantId, itemId],
    );
    if (catalogItem.rows.length === 0) {
      throw new NotFoundException("الصنف غير موجود");
    }

    let ingredientInventoryItemId: string | null = null;
    let ingredientCatalogItemId: string | null = null;
    let resolvedIngredientName = (body.ingredientName || "").trim();

    if (body.ingredientInventoryItemId) {
      const ingredientItem = await this.pool.query<{
        id: string;
        name: string;
      }>(
        `SELECT
           ii.id::text as id,
           COALESCE(
             NULLIF((to_jsonb(ii)->>'name'), ''),
             ci.name_ar,
             ci.name_en,
             ii.sku
           ) as name
         FROM inventory_items ii
         LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
         WHERE ii.merchant_id = $1 AND ii.id::text = $2
         LIMIT 1`,
        [merchantId, body.ingredientInventoryItemId],
      );
      if (ingredientItem.rows.length === 0) {
        throw new BadRequestException("مكوّن المخزون غير موجود");
      }
      ingredientInventoryItemId = ingredientItem.rows[0].id;
      if (!resolvedIngredientName) {
        resolvedIngredientName = ingredientItem.rows[0].name || "";
      }
    }

    if (body.ingredientCatalogItemId) {
      const ingredientCatalog = await this.pool.query<{
        id: string;
        name: string;
      }>(
        `SELECT id::text as id, COALESCE(name_ar, name_en, sku) as name
         FROM catalog_items
         WHERE merchant_id = $1 AND id::text = $2
         LIMIT 1`,
        [merchantId, body.ingredientCatalogItemId],
      );
      if (ingredientCatalog.rows.length === 0) {
        throw new BadRequestException("صنف الكتالوج للمكوّن غير موجود");
      }
      ingredientCatalogItemId = ingredientCatalog.rows[0].id;
      if (!resolvedIngredientName) {
        resolvedIngredientName = ingredientCatalog.rows[0].name || "";
      }
    }

    if (!ingredientInventoryItemId && !ingredientCatalogItemId) {
      throw new BadRequestException("يجب تحديد مكوّن مخزون أو مكوّن كتالوج");
    }
    if (!resolvedIngredientName) {
      throw new BadRequestException("اسم المكوّن مطلوب");
    }

    const quantityRequired = Math.max(
      0.0001,
      toNumber(body.quantityRequired, 1),
    );
    const wasteFactor = Math.min(
      Math.max(toNumber(body.wasteFactor, 1), 0),
      10,
    );
    const sortOrderRaw = toNumber(body.sortOrder, NaN);

    const insertResult = await this.pool.query(
      `INSERT INTO item_recipes (
         merchant_id, catalog_item_id, ingredient_inventory_item_id, ingredient_catalog_item_id,
         ingredient_name, quantity_required, unit, is_optional, waste_factor, notes, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id::text as id`,
      [
        merchantId,
        catalogItem.rows[0].id,
        ingredientInventoryItemId,
        ingredientCatalogItemId,
        resolvedIngredientName,
        quantityRequired,
        body.unit || "piece",
        toBoolean(body.isOptional, false),
        wasteFactor,
        body.notes || null,
        Number.isFinite(sortOrderRaw) ? sortOrderRaw : 0,
      ],
    );

    await this.pool.query(
      `UPDATE catalog_items
       SET has_recipe = true, updated_at = NOW()
       WHERE merchant_id = $1 AND id::text = $2`,
      [merchantId, itemId],
    );

    return {
      success: true,
      ingredientId: insertResult.rows[0]?.id,
    };
  }

  @Patch("catalog/:itemId/recipe/:ingredientId")
  @ApiOperation({ summary: "Update recipe ingredient row" })
  async updateCatalogItemRecipeIngredient(
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Param("ingredientId") ingredientId: string,
    @Body()
    body: Partial<{
      ingredientName: string;
      quantityRequired: number;
      unit: string;
      isOptional: boolean;
      wasteFactor: number;
      notes: string;
      sortOrder: number;
    }>,
  ) {
    const merchantId = getMerchantId(req);
    const exists = await this.pool.query(
      `SELECT id
       FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
         AND id::text = $3
       LIMIT 1`,
      [merchantId, itemId, ingredientId],
    );
    if (exists.rows.length === 0) {
      throw new NotFoundException("المكوّن غير موجود");
    }

    const updates: string[] = [];
    const values: any[] = [merchantId, itemId, ingredientId];
    let idx = 4;

    if (body.ingredientName !== undefined) {
      updates.push(`ingredient_name = $${idx++}`);
      values.push(String(body.ingredientName).trim());
    }
    if (body.quantityRequired !== undefined) {
      updates.push(`quantity_required = $${idx++}`);
      values.push(Math.max(0.0001, toNumber(body.quantityRequired, 1)));
    }
    if (body.unit !== undefined) {
      updates.push(`unit = $${idx++}`);
      values.push(body.unit || "piece");
    }
    if (body.isOptional !== undefined) {
      updates.push(`is_optional = $${idx++}`);
      values.push(toBoolean(body.isOptional, false));
    }
    if (body.wasteFactor !== undefined) {
      updates.push(`waste_factor = $${idx++}`);
      values.push(Math.min(Math.max(toNumber(body.wasteFactor, 1), 0), 10));
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(body.notes || null);
    }
    if (body.sortOrder !== undefined) {
      updates.push(`sort_order = $${idx++}`);
      values.push(Math.trunc(toNumber(body.sortOrder, 0)));
    }

    if (updates.length === 0) {
      return { success: true, updated: false };
    }

    updates.push(`updated_at = NOW()`);
    await this.pool.query(
      `UPDATE item_recipes
       SET ${updates.join(", ")}
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
         AND id::text = $3`,
      values,
    );

    return { success: true, updated: true };
  }

  @Delete("catalog/:itemId/recipe/:ingredientId")
  @ApiOperation({ summary: "Delete ingredient from recipe" })
  async deleteCatalogItemRecipeIngredient(
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Param("ingredientId") ingredientId: string,
  ) {
    const merchantId = getMerchantId(req);
    const deleteResult = await this.pool.query(
      `DELETE FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
         AND id::text = $3
       RETURNING id`,
      [merchantId, itemId, ingredientId],
    );

    if (deleteResult.rows.length === 0) {
      throw new NotFoundException("المكوّن غير موجود");
    }

    const remaining = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2`,
      [merchantId, itemId],
    );

    if (toNumber(remaining.rows[0]?.count, 0) === 0) {
      await this.pool.query(
        `UPDATE catalog_items
         SET has_recipe = false, updated_at = NOW()
         WHERE merchant_id = $1 AND id::text = $2`,
        [merchantId, itemId],
      );
    }

    return { success: true };
  }

  @Get("catalog/:itemId/availability")
  @ApiOperation({
    summary: "Check available quantity for catalog item based on recipe/BOM",
  })
  async getCatalogItemAvailability(
    @Req() req: Request,
    @Param("itemId") itemId: string,
  ) {
    const merchantId = getMerchantId(req);
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
      [merchantId, itemId],
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException("الصنف غير موجود");
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
        [merchantId, itemId],
      );
      const variantsAvailable = toNumber(stockResult.rows[0]?.available, 0);
      const fallbackStock = toNumber(item.stock_quantity, 0);
      return {
        itemId,
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
      unit: string;
      waste_factor: string;
      is_optional: boolean;
    }>(
      `SELECT
         ingredient_name,
         ingredient_inventory_item_id::text as ingredient_inventory_item_id,
         ingredient_catalog_item_id::text as ingredient_catalog_item_id,
         quantity_required::text as quantity_required,
         unit,
         COALESCE(waste_factor, 1)::text as waste_factor,
         COALESCE(is_optional, false) as is_optional
       FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [merchantId, itemId],
    );

    const ingredients: Array<{
      name: string;
      required: number;
      unit: string;
      stockOnHand: number;
      canMake: number;
      optional: boolean;
    }> = [];
    let minCanMake = Number.POSITIVE_INFINITY;
    let limitingIngredient: string | null = null;

    for (const ingredient of ingredientsResult.rows) {
      const required =
        toNumber(ingredient.quantity_required, 0) *
        toNumber(ingredient.waste_factor, 1);
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
        stockOnHand = toNumber(invStock.rows[0]?.available, 0);
      } else if (ingredient.ingredient_catalog_item_id) {
        const catalogStock = await this.pool.query<{ available: string }>(
          `SELECT COALESCE(stock_quantity, 0)::text as available
           FROM catalog_items
           WHERE merchant_id = $1 AND id::text = $2
           LIMIT 1`,
          [merchantId, ingredient.ingredient_catalog_item_id],
        );
        stockOnHand = toNumber(catalogStock.rows[0]?.available, 0);
      }

      const canMake = required > 0 ? Math.floor(stockOnHand / required) : 0;
      ingredients.push({
        name: ingredient.ingredient_name,
        required: Number(required.toFixed(3)),
        unit: ingredient.unit || "piece",
        stockOnHand: Number(stockOnHand.toFixed(3)),
        canMake,
        optional: Boolean(ingredient.is_optional),
      });

      if (!ingredient.is_optional && canMake < minCanMake) {
        minCanMake = canMake;
        limitingIngredient = ingredient.ingredient_name;
      }
    }

    if (!Number.isFinite(minCanMake)) {
      minCanMake = 0;
    }

    return {
      itemId,
      name: item.name,
      mode: "recipe",
      availableQuantity: minCanMake,
      limitingIngredient,
      ingredients: ingredients.map(({ optional, ...rest }) => rest),
    };
  }
}
