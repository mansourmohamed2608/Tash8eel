import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module";
import { ICatalogRepository } from "../../domain/ports/catalog.repository";
import {
  CatalogItem,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from "../../domain/entities/catalog.entity";
import { generateId } from "../../shared/utils/helpers";

@Injectable()
export class CatalogRepository implements ICatalogRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  async findById(id: string): Promise<CatalogItem | null> {
    const result = await this.pool.query(
      `SELECT * FROM catalog_items WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findBySku(
    merchantId: string,
    sku: string,
  ): Promise<CatalogItem | null> {
    const result = await this.pool.query(
      `SELECT * FROM catalog_items WHERE merchant_id = $1 AND sku = $2`,
      [merchantId, sku],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByMerchant(merchantId: string): Promise<CatalogItem[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM catalog_items WHERE merchant_id = $1 AND is_available = true ORDER BY name_ar`,
        [merchantId],
      );
      return result.rows.map((row: Record<string, unknown>) =>
        this.mapToEntity(row),
      );
    } catch (error: any) {
      if (error?.code === "42703") {
        const fallback = await this.pool.query(
          `SELECT * FROM catalog_items WHERE merchant_id = $1 ORDER BY name_ar`,
          [merchantId],
        );
        return fallback.rows.map((row: Record<string, unknown>) =>
          this.mapToEntity(row),
        );
      }
      throw error;
    }
  }

  async findByMerchantAndCategory(
    merchantId: string,
    category: string,
  ): Promise<CatalogItem[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM catalog_items WHERE merchant_id = $1 AND category = $2 AND is_available = true ORDER BY name_ar`,
        [merchantId, category],
      );
      return result.rows.map((row: Record<string, unknown>) =>
        this.mapToEntity(row),
      );
    } catch (error: any) {
      if (error?.code === "42703") {
        const fallback = await this.pool.query(
          `SELECT * FROM catalog_items WHERE merchant_id = $1 AND category = $2 ORDER BY name_ar`,
          [merchantId, category],
        );
        return fallback.rows.map((row: Record<string, unknown>) =>
          this.mapToEntity(row),
        );
      }
      throw error;
    }
  }

  async searchByName(
    merchantId: string,
    query: string,
  ): Promise<CatalogItem[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM catalog_items 
         WHERE merchant_id = $1 AND is_available = true 
         AND (name_ar ILIKE $2 OR name_en ILIKE $2 OR $3 = ANY(tags))
         ORDER BY similarity(name_ar, $3) DESC
         LIMIT 10`,
        [merchantId, `%${query}%`, query],
      );
      return result.rows.map((row: Record<string, unknown>) =>
        this.mapToEntity(row),
      );
    } catch (error: any) {
      if (error?.code === "42703") {
        const fallback = await this.pool.query(
          `SELECT * FROM catalog_items 
           WHERE merchant_id = $1
           AND (name_ar ILIKE $2 OR name_en ILIKE $2 OR $3 = ANY(tags))
           ORDER BY similarity(name_ar, $3) DESC
           LIMIT 10`,
          [merchantId, `%${query}%`, query],
        );
        return fallback.rows.map((row: Record<string, unknown>) =>
          this.mapToEntity(row),
        );
      }
      throw error;
    }
  }

  async create(input: CreateCatalogItemInput): Promise<CatalogItem> {
    const id = generateId();
    try {
      const result = await this.pool.query(
        `INSERT INTO catalog_items (id, merchant_id, sku, name_ar, name_en, description_ar, description_en, category, base_price, min_price, variants, options, tags, is_available)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          id,
          input.merchantId,
          input.sku || null,
          input.nameAr,
          input.nameEn || null,
          input.descriptionAr || null,
          input.descriptionEn || null,
          input.category || null,
          input.basePrice,
          input.minPrice || null,
          JSON.stringify(input.variants || []),
          JSON.stringify(input.options || []),
          input.tags || [],
          input.isAvailable !== false,
        ],
      );
      return this.mapToEntity(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "42703") {
        const fallback = await this.pool.query(
          `INSERT INTO catalog_items (id, merchant_id, sku, name_ar, name_en, description_ar, description_en, category, base_price, min_price, variants, options, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING *`,
          [
            id,
            input.merchantId,
            input.sku || null,
            input.nameAr,
            input.nameEn || null,
            input.descriptionAr || null,
            input.descriptionEn || null,
            input.category || null,
            input.basePrice,
            input.minPrice || null,
            JSON.stringify(input.variants || []),
            JSON.stringify(input.options || []),
            input.tags || [],
          ],
        );
        return this.mapToEntity(fallback.rows[0]);
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateCatalogItemInput,
  ): Promise<CatalogItem | null> {
    const buildUpdates = (includeAvailability: boolean) => {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (input.sku !== undefined) {
        updates.push(`sku = $${paramIndex++}`);
        values.push(input.sku);
      }
      if (input.nameAr !== undefined) {
        updates.push(`name_ar = $${paramIndex++}`);
        values.push(input.nameAr);
      }
      if (input.nameEn !== undefined) {
        updates.push(`name_en = $${paramIndex++}`);
        values.push(input.nameEn);
      }
      if (input.descriptionAr !== undefined) {
        updates.push(`description_ar = $${paramIndex++}`);
        values.push(input.descriptionAr);
      }
      if (input.descriptionEn !== undefined) {
        updates.push(`description_en = $${paramIndex++}`);
        values.push(input.descriptionEn);
      }
      if (input.category !== undefined) {
        updates.push(`category = $${paramIndex++}`);
        values.push(input.category);
      }
      if (input.basePrice !== undefined) {
        updates.push(`base_price = $${paramIndex++}`);
        values.push(input.basePrice);
      }
      if (input.minPrice !== undefined) {
        updates.push(`min_price = $${paramIndex++}`);
        values.push(input.minPrice);
      }
      if (input.variants !== undefined) {
        updates.push(`variants = $${paramIndex++}`);
        values.push(JSON.stringify(input.variants));
      }
      if (input.options !== undefined) {
        updates.push(`options = $${paramIndex++}`);
        values.push(JSON.stringify(input.options));
      }
      if (input.tags !== undefined) {
        updates.push(`tags = $${paramIndex++}`);
        values.push(input.tags);
      }
      if (includeAvailability && input.isAvailable !== undefined) {
        updates.push(`is_available = $${paramIndex++}`);
        values.push(input.isAvailable);
      }

      return { updates, values, paramIndex };
    };

    const runUpdate = async (includeAvailability: boolean) => {
      const { updates, values, paramIndex } = buildUpdates(includeAvailability);
      if (updates.length === 0) {
        return this.findById(id);
      }
      values.push(id);
      const result = await this.pool.query(
        `UPDATE catalog_items SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values,
      );
      return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    };

    try {
      return await runUpdate(true);
    } catch (error: any) {
      if (error?.code === "42703") {
        return await runUpdate(false);
      }
      throw error;
    }
  }

  async upsertBySku(input: CreateCatalogItemInput): Promise<CatalogItem> {
    if (!input.sku) {
      return this.create(input);
    }

    const existing = await this.findBySku(input.merchantId, input.sku);
    if (existing) {
      return (await this.update(existing.id, {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        descriptionAr: input.descriptionAr,
        category: input.category,
        basePrice: input.basePrice,
        minPrice: input.minPrice,
        variants: input.variants,
        options: input.options,
        tags: input.tags,
        isAvailable: input.isAvailable,
      }))!;
    }

    return this.create(input);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM catalog_items WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findByName(
    name: string,
    merchantId: string,
  ): Promise<CatalogItem | null> {
    const results = await this.searchByName(merchantId, name);
    return results[0] || null;
  }

  private mapToEntity(row: Record<string, unknown>): CatalogItem {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      sku: row.sku as string | undefined,
      nameAr: row.name_ar as string,
      nameEn: row.name_en as string | undefined,
      descriptionAr: row.description_ar as string | undefined,
      descriptionEn: row.description_en as string | undefined,
      category: row.category as string | undefined,
      basePrice: parseFloat(row.base_price as string),
      minPrice: row.min_price ? parseFloat(row.min_price as string) : undefined,
      variants: row.variants as CatalogItem["variants"],
      options: row.options as CatalogItem["options"],
      tags: row.tags as string[],
      isAvailable: row.is_available as boolean,
      hasRecipe: (row.has_recipe as boolean) || false,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
