import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from "../../domain/ports/catalog.repository";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { RedisService } from "../../infrastructure/redis/redis.service";

export interface CandidateMatch {
  item: CatalogItem;
  score: number;
  matchReasons: string[];
}

export interface RetrievalResult {
  candidates: CandidateMatch[];
  totalSearched: number;
  searchTerms: string[];
  cached: boolean;
  processingTimeMs: number;
}

export interface SearchContext {
  merchantId: string;
  query: string;
  category?: string;
  priceRange?: { min?: number; max?: number };
  variants?: string[];
  limit?: number;
}

@Injectable()
export class CandidateRetrievalService {
  private readonly logger = new Logger(CandidateRetrievalService.name);
  private readonly CACHE_TTL_SECONDS: number;
  private readonly DEFAULT_LIMIT: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepo: ICatalogRepository,
    private readonly redisService: RedisService,
  ) {
    this.CACHE_TTL_SECONDS = this.configService.get<number>(
      "CANDIDATE_CACHE_TTL",
      300,
    ); // 5 minutes
    this.DEFAULT_LIMIT = this.configService.get<number>(
      "CANDIDATE_DEFAULT_LIMIT",
      10,
    );
  }

  /**
   * Retrieve candidate items from database before LLM
   * This reduces hallucination by grounding LLM on real items
   */
  async retrieveCandidates(context: SearchContext): Promise<RetrievalResult> {
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey(context);

    // Check cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Extract search terms
    const searchTerms = this.extractSearchTerms(context.query);

    // Get all items for merchant
    const allItems = await this.catalogRepo.findByMerchant(context.merchantId);

    // Filter active items only
    const activeItems = allItems.filter(
      (item) => item.isActive !== false && item.isAvailable !== false,
    );

    // Score and rank items
    const scoredItems = this.scoreItems(activeItems, searchTerms, context);

    // Sort by score and limit
    const limit = context.limit || this.DEFAULT_LIMIT;
    const topCandidates = scoredItems
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const result: RetrievalResult = {
      candidates: topCandidates,
      totalSearched: activeItems.length,
      searchTerms,
      cached: false,
      processingTimeMs: Date.now() - startTime,
    };

    // Cache the result
    await this.setToCache(cacheKey, result);

    this.logger.log({
      msg: "Candidate retrieval completed",
      merchantId: context.merchantId,
      query: context.query,
      searchTerms,
      candidatesFound: topCandidates.length,
      totalSearched: activeItems.length,
      processingTimeMs: result.processingTimeMs,
    });

    return result;
  }

  /**
   * Get best matching item for a specific product reference
   */
  async findBestMatch(
    merchantId: string,
    productReference: string,
    options?: {
      variant?: string;
      minScore?: number;
    },
  ): Promise<CandidateMatch | null> {
    const result = await this.retrieveCandidates({
      merchantId,
      query: productReference,
      limit: 5,
    });

    if (result.candidates.length === 0) {
      return null;
    }

    const minScore = options?.minScore || 30;
    const bestMatch = result.candidates[0];

    if (bestMatch.score < minScore) {
      return null;
    }

    // If variant specified, check if item has it
    if (options?.variant && bestMatch.item.variants) {
      const hasVariant = bestMatch.item.variants.some(
        (v) => v.name.toLowerCase() === options.variant!.toLowerCase(),
      );
      if (!hasVariant) {
        bestMatch.matchReasons.push("variant_not_found");
      }
    }

    return bestMatch;
  }

  /**
   * Batch retrieve for multiple product references
   */
  async batchRetrieve(
    merchantId: string,
    productReferences: string[],
  ): Promise<Map<string, CandidateMatch | null>> {
    const results = new Map<string, CandidateMatch | null>();

    // Process in parallel
    await Promise.all(
      productReferences.map(async (ref) => {
        const match = await this.findBestMatch(merchantId, ref);
        results.set(ref, match);
      }),
    );

    return results;
  }

  /**
   * Score items based on search terms and context
   */
  private scoreItems(
    items: CatalogItem[],
    searchTerms: string[],
    context: SearchContext,
  ): CandidateMatch[] {
    return items.map((item) => {
      let score = 0;
      const matchReasons: string[] = [];

      const name = (item.name || item.nameAr || "").toLowerCase();
      const nameEn = (item.nameEn || "").toLowerCase();
      const description = (
        item.description ||
        item.descriptionAr ||
        ""
      ).toLowerCase();
      const category = (item.category || "").toLowerCase();
      const sku = (item.sku || "").toLowerCase();

      for (const term of searchTerms) {
        const termLower = term.toLowerCase();

        // Exact name match (highest)
        if (name === termLower || nameEn === termLower) {
          score += 100;
          matchReasons.push("exact_name");
        }
        // SKU match
        else if (sku === termLower) {
          score += 90;
          matchReasons.push("sku_match");
        }
        // Name starts with term
        else if (name.startsWith(termLower) || nameEn.startsWith(termLower)) {
          score += 70;
          matchReasons.push("name_prefix");
        }
        // Name contains term
        else if (name.includes(termLower) || nameEn.includes(termLower)) {
          score += 50;
          matchReasons.push("name_contains");
        }
        // Description contains term
        else if (description.includes(termLower)) {
          score += 20;
          matchReasons.push("description_contains");
        }
        // Category match
        else if (category.includes(termLower)) {
          score += 30;
          matchReasons.push("category_match");
        }
      }

      // Apply category filter bonus
      if (context.category && category === context.category.toLowerCase()) {
        score += 20;
        matchReasons.push("category_filter");
      }

      // Apply price range filter
      if (context.priceRange) {
        const price = item.price || item.basePrice || 0;
        if (
          context.priceRange.min !== undefined &&
          price < context.priceRange.min
        ) {
          score -= 50;
        }
        if (
          context.priceRange.max !== undefined &&
          price > context.priceRange.max
        ) {
          score -= 50;
        }
      }

      // Variant match bonus
      if (context.variants && item.variants) {
        const itemVariants = item.variants.map((v) => v.name.toLowerCase());
        for (const requestedVariant of context.variants) {
          if (itemVariants.includes(requestedVariant.toLowerCase())) {
            score += 25;
            matchReasons.push("variant_match");
          }
        }
      }

      // Availability bonus
      if (item.stock && item.stock > 0) {
        score += 10;
        matchReasons.push("in_stock");
      }

      return {
        item,
        score,
        matchReasons: [...new Set(matchReasons)],
      };
    });
  }

  /**
   * Extract search terms from natural language query
   */
  private extractSearchTerms(query: string): string[] {
    // Normalize and split
    const normalized = query
      .toLowerCase()
      .replace(/[،,\.؟?!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = normalized.split(" ");

    // Arabic stop words to filter out
    const stopWords = new Set([
      "و",
      "في",
      "من",
      "على",
      "إلى",
      "عن",
      "مع",
      "أو",
      "هذا",
      "هذه",
      "ده",
      "دي",
      "دول",
      "اللي",
      "يعني",
      "كده",
      "بس",
      "عشان",
      "the",
      "a",
      "an",
      "and",
      "or",
      "is",
      "are",
      "in",
      "on",
      "at",
      "عايز",
      "عاوز",
      "محتاج",
      "ابغى",
      "اريد",
      "بدي",
    ]);

    const terms = words
      .filter((word) => word.length > 1)
      .filter((word) => !stopWords.has(word));

    // Also include common n-grams
    const bigrams: string[] = [];
    for (let i = 0; i < terms.length - 1; i++) {
      bigrams.push(`${terms[i]} ${terms[i + 1]}`);
    }

    return [...new Set([...terms, ...bigrams])];
  }

  /**
   * Build cache key for search context
   */
  private buildCacheKey(context: SearchContext): string {
    const parts = [
      "candidates",
      context.merchantId,
      this.hashQuery(context.query),
      context.category || "all",
    ];
    return parts.join(":");
  }

  /**
   * Simple hash for query string
   */
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get from Redis cache
   */
  private async getFromCache(
    key: string,
  ): Promise<Omit<RetrievalResult, "cached" | "processingTimeMs"> | null> {
    try {
      const cached = await this.redisService.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn({
        msg: "Cache get failed",
        key,
        error: (error as Error).message,
      });
    }
    return null;
  }

  /**
   * Set to Redis cache
   */
  private async setToCache(
    key: string,
    result: RetrievalResult,
  ): Promise<void> {
    try {
      const { cached, processingTimeMs, ...toCache } = result;
      await this.redisService.set(
        key,
        JSON.stringify(toCache),
        this.CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn({
        msg: "Cache set failed",
        key,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Clear cache for a merchant (after catalog update)
   */
  async clearMerchantCache(merchantId: string): Promise<void> {
    // Note: This requires Redis SCAN which isn't in our simplified RedisService
    // In production, use pattern delete or maintain a set of keys
    this.logger.log({
      msg: "Merchant cache clear requested",
      merchantId,
    });
  }
}
