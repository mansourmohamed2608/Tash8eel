import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { EmbeddingService } from "./embedding.service";
import { CatalogItem } from "../../domain/entities/catalog.entity";

export interface VectorMatch {
  id: string;
  merchantId: string;
  nameAr: string;
  nameEn?: string;
  descriptionAr?: string;
  category?: string;
  basePrice: number;
  tags: string[];
  isAvailable: boolean;
  variants: CatalogItem["variants"];
  /** Cosine distance from pgvector (lower = more similar) */
  distance: number;
  /** 1 - distance, for scoring in MMR */
  similarity: number;
  /** Raw embedding vector, used by MMR in Node.js */
  embedding: number[];
}

/**
 * VectorSearchService
 * ────────────────────
 * Handles all pgvector-based ANN search and in-process MMR re-ranking.
 *
 * Architecture:
 *  - semanticSearch()   → issues a single SQL query with cosine distance ordering
 *  - mmrRerank()        → greedy in-process MMR to diversify results
 *  - findSimilarItems() → substitution lookup (exclude source item)
 *  - textFallback()     → pg_trgm ILIKE when no embeddings are stored yet
 */
@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Fetch up to `k` catalog items ordered by cosine distance to `queryVec`.
   * Only returns items that have an embedding and are available.
   * Fetching 3× the final desired count gives MMR enough candidates to choose from.
   */
  async semanticSearch(
    merchantId: string,
    queryVec: number[],
    k = 30,
  ): Promise<VectorMatch[]> {
    const pgVecLiteral = `[${queryVec.join(",")}]`;
    try {
      const result = await this.pool.query<{
        id: string;
        merchant_id: string;
        name_ar: string;
        name_en: string | null;
        description_ar: string | null;
        category: string | null;
        base_price: string;
        tags: string[] | null;
        is_available: boolean;
        variants: unknown;
        embedding: string | null;
        distance: string;
      }>(
        `SELECT id, merchant_id, name_ar, name_en, description_ar,
                category, base_price, tags, is_available, variants,
                embedding::text,
                (embedding <=> $2::vector) AS distance
         FROM catalog_items
         WHERE merchant_id = $1
           AND is_available = true
           AND embedding IS NOT NULL
         ORDER BY distance ASC
         LIMIT $3`,
        [merchantId, pgVecLiteral, k],
      );

      return result.rows.map((row) => ({
        id: row.id,
        merchantId: row.merchant_id,
        nameAr: row.name_ar,
        nameEn: row.name_en ?? undefined,
        descriptionAr: row.description_ar ?? undefined,
        category: row.category ?? undefined,
        basePrice: parseFloat(row.base_price),
        tags: row.tags ?? [],
        isAvailable: row.is_available,
        variants: this.parseJson(row.variants, []) as CatalogItem["variants"],
        distance: parseFloat(row.distance),
        similarity: 1 - parseFloat(row.distance),
        embedding: this.parseVectorString(row.embedding ?? ""),
      }));
    } catch (error: any) {
      // pgvector extension not yet installed, or no embeddings
      this.logger.warn(`semanticSearch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * MMR (Maximal Marginal Relevance) re-ranking.
   *
   * At each step, pick the candidate that maximises:
   *   λ × sim(candidate, query) − (1−λ) × max sim(candidate, already-selected)
   *
   * λ = 0.65 by default: slightly prefers relevance over diversity.
   */
  mmrRerank(
    queryVec: number[],
    candidates: VectorMatch[],
    lambda = 0.65,
    topN = 10,
  ): VectorMatch[] {
    if (candidates.length === 0) return [];
    const n = Math.min(topN, candidates.length);

    const selected: VectorMatch[] = [];
    const remaining = [...candidates];

    while (selected.length < n && remaining.length > 0) {
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];

        // Relevance: similarity to the original query
        const relScore = this.embeddingService.cosineSimilarity(
          cand.embedding,
          queryVec,
        );

        // Redundancy: maximum similarity to any already-selected item
        let maxSim = 0;
        for (const sel of selected) {
          const s = this.embeddingService.cosineSimilarity(
            cand.embedding,
            sel.embedding,
          );
          if (s > maxSim) maxSim = s;
        }

        const mmrScore = lambda * relScore - (1 - lambda) * maxSim;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        selected.push(remaining[bestIdx]);
        remaining.splice(bestIdx, 1);
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Find items similar to `itemId` (used for substitution when an item is out of stock).
   * The source item is excluded from results.
   */
  async findSimilarItems(
    merchantId: string,
    itemId: string,
    k = 5,
  ): Promise<VectorMatch[]> {
    try {
      const srcResult = await this.pool.query<{ embedding: string | null }>(
        `SELECT embedding::text FROM catalog_items WHERE id = $1 AND merchant_id = $2`,
        [itemId, merchantId],
      );

      if (!srcResult.rows[0]?.embedding) return [];

      const srcVec = this.parseVectorString(srcResult.rows[0].embedding);
      const pgVecLiteral = `[${srcVec.join(",")}]`;

      const result = await this.pool.query<{
        id: string;
        merchant_id: string;
        name_ar: string;
        name_en: string | null;
        description_ar: string | null;
        category: string | null;
        base_price: string;
        tags: string[] | null;
        is_available: boolean;
        variants: unknown;
        embedding: string | null;
        distance: string;
      }>(
        `SELECT id, merchant_id, name_ar, name_en, description_ar,
                category, base_price, tags, is_available, variants,
                embedding::text,
                (embedding <=> $2::vector) AS distance
         FROM catalog_items
         WHERE merchant_id = $1
           AND id != $3
           AND is_available = true
           AND embedding IS NOT NULL
         ORDER BY distance ASC
         LIMIT $4`,
        [merchantId, pgVecLiteral, itemId, k],
      );

      return result.rows.map((row) => ({
        id: row.id,
        merchantId: row.merchant_id,
        nameAr: row.name_ar,
        nameEn: row.name_en ?? undefined,
        descriptionAr: row.description_ar ?? undefined,
        category: row.category ?? undefined,
        basePrice: parseFloat(row.base_price),
        tags: row.tags ?? [],
        isAvailable: row.is_available,
        variants: this.parseJson(row.variants, []) as CatalogItem["variants"],
        distance: parseFloat(row.distance),
        similarity: 1 - parseFloat(row.distance),
        embedding: this.parseVectorString(row.embedding ?? ""),
      }));
    } catch (error: any) {
      this.logger.warn(`findSimilarItems failed: ${error.message}`);
      return [];
    }
  }

  /**
   * pg_trgm fallback when no embeddings are stored yet.
   * Used as a graceful degradation path.
   */
  async textFallback(
    merchantId: string,
    query: string,
    limit = 10,
  ): Promise<CatalogItem[]> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT * FROM catalog_items
         WHERE merchant_id = $1
           AND is_available = true
           AND (name_ar ILIKE $2 OR name_en ILIKE $2 OR $3 = ANY(tags))
         ORDER BY similarity(name_ar, $3) DESC
         LIMIT $4`,
        [merchantId, `%${query}%`, query, limit],
      );
      return result.rows.map((row) => this.rowToCatalogItem(row));
    } catch {
      return [];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Parse the "[0.1,0.2,...]" string that pgvector::text returns. */
  private parseVectorString(raw: string): number[] {
    if (!raw) return [];
    const trimmed = raw.replace(/^\[|\]$/g, "");
    return trimmed.split(",").map(Number);
  }

  private parseJson(value: unknown, fallback: unknown): unknown {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }
    return value;
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
