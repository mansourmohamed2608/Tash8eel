import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { EmbeddingService } from "../llm/embedding.service";
import { VectorSearchService } from "../llm/vector-search.service";
import { CatalogItem } from "../../domain/entities/catalog.entity";

/**
 * RagRetrievalService
 * ────────────────────
 * Orchestrates the full retrieval-augmented generation pipeline for catalog items.
 *
 * Pipeline (retrieveForQuery):
 *  1. Embed the customer query with text-embedding-3-small
 *  2. ANN search in pgvector → 3× candidates
 *  3. Favour in-stock items (out-of-stock items pushed to back of candidate list)
 *  4. MMR re-rank → diverse top-N items
 *  5. Graceful degradation → pg_trgm text search if no embeddings exist yet
 *  6. Safety fallback → findByMerchant equivalent if everything fails
 *
 * Additional helpers:
 *  - getSubstitutes()  → in-stock similar items for an out-of-stock item
 *  - getTopItems()     → best-seller / most active items for WhatsApp menu
 */
@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly embedding: EmbeddingService,
    private readonly vectorSearch: VectorSearchService,
  ) {}

  /**
   * Retrieve the most relevant catalog items for a customer query.
   * @param merchantId  - merchant whose catalog to search
   * @param query       - raw customer message (Arabic or English)
   * @param limit       - max items to return (default 10)
   */
  async retrieveForQuery(
    merchantId: string,
    query: string,
    limit = 10,
  ): Promise<CatalogItem[]> {
    try {
      const queryVec = await this.embedding.embed(query);

      // Zero vector = test mode; skip straight to text fallback
      if (queryVec.every((v) => v === 0)) {
        return this.vectorSearch.textFallback(merchantId, query, limit);
      }

      // Fetch 3× candidates so MMR has enough to work with
      const candidates = await this.vectorSearch.semanticSearch(
        merchantId,
        queryVec,
        limit * 3,
      );

      if (candidates.length === 0) {
        // No embeddings stored yet — degrade to text search
        return this.vectorSearch.textFallback(merchantId, query, limit);
      }

      // Put in-stock items first so MMR sees them as top candidates
      const inStock = candidates.filter((c) => c.isAvailable);
      const outOfStock = candidates.filter((c) => !c.isAvailable);
      const ordered = [...inStock, ...outOfStock];

      // MMR balances relevance (λ=0.65) vs. diversity
      const ranked = this.vectorSearch.mmrRerank(
        queryVec,
        ordered,
        0.65,
        limit,
      );

      return ranked.map((m) => ({
        id: m.id,
        merchantId: m.merchantId,
        nameAr: m.nameAr,
        nameEn: m.nameEn,
        descriptionAr: m.descriptionAr,
        category: m.category,
        basePrice: m.basePrice,
        variants: m.variants,
        options: [],
        tags: m.tags,
        isAvailable: m.isAvailable,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    } catch (error: any) {
      this.logger.error(
        `retrieveForQuery failed, trying text fallback first: ${error.message}`,
        error.stack,
      );
      // First fallback: try text search to keep query relevance even when
      // embeddings are unavailable (quota/network/provider errors).
      try {
        const textMatches = await this.vectorSearch.textFallback(
          merchantId,
          query,
          limit,
        );
        if (textMatches.length > 0) {
          return textMatches;
        }
      } catch (textError: any) {
        this.logger.warn(
          `textFallback failed after semantic error: ${textError.message}`,
        );
      }

      // Last-resort fallback: behave like the old findByMerchant
      return this.fallbackFindAll(merchantId, limit * 2);
    }
  }

  /**
   * Find in-stock substitutes for an item that is out of stock.
   * Called after the LLM identifies an out-of-stock item in the customer's request.
   *
   * @param merchantId       - merchant context
   * @param outOfStockItemId - catalog_items.id of the requested but unavailable item
   * @param limit            - how many substitutes to surface (default 3)
   */
  async getSubstitutes(
    merchantId: string,
    outOfStockItemId: string,
    limit = 3,
  ): Promise<CatalogItem[]> {
    try {
      const similar = await this.vectorSearch.findSimilarItems(
        merchantId,
        outOfStockItemId,
        limit * 2,
      );

      return similar
        .filter((m) => m.isAvailable)
        .slice(0, limit)
        .map((m) => ({
          id: m.id,
          merchantId: m.merchantId,
          nameAr: m.nameAr,
          nameEn: m.nameEn,
          descriptionAr: m.descriptionAr,
          category: m.category,
          basePrice: m.basePrice,
          variants: m.variants,
          options: [],
          tags: m.tags,
          isAvailable: m.isAvailable,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
    } catch (error: any) {
      this.logger.warn(`getSubstitutes failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Return the top-N best-selling / most active items for a WhatsApp menu display.
   *
   * Uses stock_movements SALE events to rank items by real sales frequency.
   * Falls back to newest items if the stock_movements table is not populated.
   */
  async getTopItems(merchantId: string, limit = 10): Promise<CatalogItem[]> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT c.*,
                COUNT(sm.id) AS sale_count
         FROM catalog_items c
         LEFT JOIN stock_movements sm
           ON sm.catalog_item_id = c.id
           AND sm.merchant_id = c.merchant_id
           AND sm.movement_type = 'SALE'
         WHERE c.merchant_id = $1
           AND c.is_available = true
         GROUP BY c.id
         ORDER BY sale_count DESC, c.created_at DESC
         LIMIT $2`,
        [merchantId, limit],
      );
      return result.rows.map((r) => this.rowToCatalogItem(r));
    } catch {
      // Fallback: newest available items
      return this.fallbackFindAll(merchantId, limit);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async fallbackFindAll(
    merchantId: string,
    limit: number,
  ): Promise<CatalogItem[]> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT * FROM catalog_items
         WHERE merchant_id = $1 AND is_available = true
         ORDER BY name_ar
         LIMIT $2`,
        [merchantId, limit],
      );
      return result.rows.map((r) => this.rowToCatalogItem(r));
    } catch {
      return [];
    }
  }

  private rowToCatalogItem(row: Record<string, unknown>): CatalogItem {
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
      variants: (row.variants as CatalogItem["variants"]) ?? [],
      options: (row.options as CatalogItem["options"]) ?? [],
      tags: (row.tags as string[]) ?? [],
      isAvailable: row.is_available as boolean,
      hasRecipe: (row.has_recipe as boolean) || false,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
