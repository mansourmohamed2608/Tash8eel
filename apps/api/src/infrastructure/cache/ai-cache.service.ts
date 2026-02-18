/**
 * AI Response Cache Service
 *
 * Caches AI/LLM responses to:
 * 1. Reduce OpenAI API costs (identical queries = same answer)
 * 2. Prevent different data on page refresh
 * 3. Speed up repeated queries (e.g. "مصاريف اليوم" asked 5x)
 *
 * Cache strategies:
 * - Copilot queries (ASK_*): cached 5 min (data can change)
 * - Copilot mutations (ADD_*, UPDATE_*): NEVER cached
 * - LLM conversation NLP: cached 2 min per conversation context hash
 * - Vision OCR: cached 1 hour (image doesn't change)
 * - KPI/Reports: cached 10 min (aggregated data)
 *
 * When Redis is unavailable, falls back to in-memory LRU cache (max 500 entries).
 */

import { Injectable, OnModuleInit } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { createLogger } from "../../shared/logging/logger";
import * as crypto from "crypto";

const logger = createLogger("AiCacheService");

export interface CacheEntry<T = any> {
  data: T;
  cachedAt: number;
  ttlSeconds: number;
  hitCount: number;
}

// Cache TTL by category (seconds)
export const CACHE_TTL = {
  COPILOT_QUERY: 300, // 5 min for read-only queries (ASK_KPI, ASK_REVENUE, etc.)
  COPILOT_MUTATION: 0, // NEVER cache mutations (ADD_EXPENSE, UPDATE_STOCK etc.)
  LLM_CONVERSATION: 120, // 2 min for conversation NLP (context-dependent)
  VISION_OCR: 3600, // 1 hour for image analysis (image doesn't change)
  KPI_REPORT: 600, // 10 min for KPI dashboards and aggregated reports
  INVENTORY_INSIGHTS: 600, // 10 min for inventory AI insights
  FINANCE_REPORT: 600, // 10 min for finance summaries
  CUSTOMER_SEGMENTS: 600, // 10 min for customer segment analysis
  DEFAULT: 300, // 5 min default
} as const;

// Intents that should NEVER be cached (they modify data)
const MUTATION_INTENTS = new Set([
  "ADD_EXPENSE",
  "UPDATE_STOCK",
  "CREATE_PAYMENT_LINK",
  "TAG_VIP",
  "REORDER_LAST",
  "CLOSE_MONTH",
  "CLARIFY",
]);

// Max in-memory cache entries (LRU eviction when full)
const MAX_MEMORY_ENTRIES = 500;

@Injectable()
export class AiCacheService implements OnModuleInit {
  private memoryCache = new Map<string, CacheEntry>();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    logger.info("AI Cache Service initialized", {
      redisEnabled: this.redisService.enabled,
      fallback: this.redisService.enabled ? "none" : "in-memory LRU",
    });
  }

  /**
   * Generate a deterministic cache key from input parameters.
   * Uses SHA-256 hash to keep keys uniform length.
   */
  private generateKey(
    prefix: string,
    merchantId: string,
    ...parts: string[]
  ): string {
    const raw = [prefix, merchantId, ...parts].join(":");
    const hash = crypto
      .createHash("sha256")
      .update(raw)
      .digest("hex")
      .slice(0, 16);
    return `ai:${prefix}:${merchantId}:${hash}`;
  }

  /**
   * Get cached AI response
   */
  async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    if (this.redisService.enabled) {
      try {
        const cached = await this.redisService.get(key);
        if (cached) {
          this.cacheHits++;
          const entry = JSON.parse(cached) as CacheEntry<T>;
          logger.debug("AI cache HIT (Redis)", { key: key.slice(0, 40) });
          return entry.data;
        }
      } catch (error) {
        logger.warn("Redis cache get failed, trying memory", { error });
      }
    }

    // Fallback to memory cache
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      const age = (Date.now() - memEntry.cachedAt) / 1000;
      if (age < memEntry.ttlSeconds) {
        this.cacheHits++;
        memEntry.hitCount++;
        logger.debug("AI cache HIT (memory)", { key: key.slice(0, 40) });
        return memEntry.data;
      }
      // Expired — remove
      this.memoryCache.delete(key);
    }

    this.cacheMisses++;
    return null;
  }

  /**
   * Store AI response in cache
   */
  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return; // Don't cache mutations

    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      ttlSeconds,
      hitCount: 0,
    };

    // Try Redis
    if (this.redisService.enabled) {
      try {
        await this.redisService.set(key, JSON.stringify(entry), ttlSeconds);
        logger.debug("AI cache SET (Redis)", {
          key: key.slice(0, 40),
          ttl: ttlSeconds,
        });
      } catch (error) {
        logger.warn("Redis cache set failed, using memory only", { error });
      }
    }

    // Always also store in memory (faster reads, Redis backup)
    this.evictIfFull();
    this.memoryCache.set(key, entry);
  }

  /**
   * Invalidate cache entries for a merchant (e.g., after mutation)
   */
  async invalidateMerchant(merchantId: string, prefix?: string): Promise<void> {
    const pattern = prefix ? `ai:${prefix}:${merchantId}:` : `ai:`;
    let count = 0;

    // Clear memory cache
    for (const key of this.memoryCache.keys()) {
      if (
        key.includes(merchantId) &&
        (!prefix || key.startsWith(`ai:${prefix}:`))
      ) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    // Note: Redis pattern deletion would require SCAN which we avoid for now
    // Instead, entries expire naturally via TTL
    if (count > 0) {
      logger.debug("AI cache invalidated", { merchantId, prefix, count });
    }
  }

  /**
   * Get cache key for copilot queries.
   * Returns null for mutation intents (should not be cached).
   */
  getCopilotCacheKey(
    merchantId: string,
    intent: string,
    text: string,
  ): string | null {
    if (MUTATION_INTENTS.has(intent)) return null;
    return this.generateKey(
      "copilot",
      merchantId,
      intent,
      text.trim().toLowerCase(),
    );
  }

  /**
   * Get cache key for LLM conversation NLP
   */
  getConversationCacheKey(
    merchantId: string,
    conversationId: string,
    message: string,
  ): string {
    return this.generateKey(
      "conv",
      merchantId,
      conversationId,
      message.trim().toLowerCase(),
    );
  }

  /**
   * Get cache key for vision/OCR results
   */
  getVisionCacheKey(merchantId: string, imageHash: string): string {
    return this.generateKey("vision", merchantId, imageHash);
  }

  /**
   * Get cache key for KPI/report data
   */
  getReportCacheKey(
    merchantId: string,
    reportType: string,
    ...params: string[]
  ): string {
    return this.generateKey("report", merchantId, reportType, ...params);
  }

  /**
   * Get TTL for a copilot intent
   */
  getCopilotTTL(intent: string): number {
    if (MUTATION_INTENTS.has(intent)) return CACHE_TTL.COPILOT_MUTATION;
    if (intent.startsWith("ASK_KPI") || intent.startsWith("ASK_REVENUE"))
      return CACHE_TTL.KPI_REPORT;
    return CACHE_TTL.COPILOT_QUERY;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    memoryEntries: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? Math.round((this.cacheHits / total) * 100) : 0,
      memoryEntries: this.memoryCache.size,
    };
  }

  /**
   * LRU eviction when memory cache is full
   */
  private evictIfFull(): void {
    if (this.memoryCache.size < MAX_MEMORY_ENTRIES) return;

    // Find the least recently used (oldest cachedAt) entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.memoryCache) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
  }
}
