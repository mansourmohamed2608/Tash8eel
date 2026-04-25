import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { EmbeddingService } from "./embedding.service";

/**
 * Source types matching KB_RAG_SCHEMA.md §11 required metadata.
 * Each chunk should carry exactly one source_type so routing can filter
 * by knowledge layer without loading unrelated content.
 */
export type KbSourceType =
  | "faq"
  | "policy"
  | "delivery_rule"
  | "payment_rule"
  | "escalation_rule"
  | "style_rule"
  | "support_rule"
  | "product_rule"
  | "playbook";

export type ConfidenceLevel = "high" | "medium" | "low";

/** A single KB chunk with full metadata as required by KB_RAG_SCHEMA §11. */
export interface KbChunk {
  id: string;
  merchantId: string;
  sourceType: KbSourceType;
  businessType?: string;
  module?: string;
  category?: string;
  locale: string;
  visibility: string;
  confidenceLevel: ConfidenceLevel;
  requiresManualReview: boolean;
  tags: string[];
  title: string;
  content: string;
  lastUpdated: Date;
  sourceReference?: string;
}

/** A single queryable business rule from KB_RAG_SCHEMA §6. */
export interface BusinessRule {
  id: string;
  merchantId: string;
  ruleType: string;
  ruleName: string;
  ruleDescription?: string;
  condition?: string;
  action?: string;
  confidenceRequired: string;
  humanReviewRequired: boolean;
  status: string;
}

export interface KbSearchOptions {
  /** Filter to specific source types (undefined = all). */
  sourceTypes?: KbSourceType[];
  /** BCP-47 locale filter (undefined = all locales). */
  locale?: string;
  /** Max chunks to return (default 5). */
  limit?: number;
  /**
   * If set, prefer chunks whose business_type matches OR is NULL (universal).
   * Untagged rows remain visible so merchants without tagged KB still get hits.
   */
  businessType?: string;
}

/**
 * KbRetrievalService
 * ──────────────────
 * Handles retrieval from the structured KB layer (merchant_kb_chunks) and
 * business rules layer (merchant_business_rules).
 *
 * Retrieval strategy (per chunk search):
 *  1. Semantic search via pgvector if embeddings exist
 *  2. ILIKE keyword fallback when embeddings are absent
 *
 * This service does NOT touch catalog_items (that is VectorSearchService's
 * domain) and does NOT query live operational data (Layer 3).
 *
 * Schema reference: TASH8EEL_KB_RAG_SCHEMA.md §4-§12
 */
@Injectable()
export class KbRetrievalService {
  private readonly logger = new Logger(KbRetrievalService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Retrieve the most relevant KB chunks for a query string.
   *
   * Uses semantic (pgvector cosine) search if embeddings exist.
   * Falls back to ILIKE keyword search when no embeddings are present
   * so new merchants with un-embedded chunks still get results.
   */
  async searchChunks(
    merchantId: string,
    query: string,
    options: KbSearchOptions = {},
  ): Promise<KbChunk[]> {
    const { sourceTypes, locale, limit = 5, businessType } = options;

    try {
      const queryVec = await this.embeddingService.embed(query);

      if (!queryVec.every((v) => v === 0)) {
        const semanticResults = await this.semanticSearchChunks(
          merchantId,
          queryVec,
          sourceTypes,
          locale,
          limit,
          businessType,
        );
        if (semanticResults.length > 0) {
          return semanticResults;
        }
      }
    } catch (error: any) {
      this.logger.warn(`KB semantic search failed: ${error.message}`);
    }

    return this.keywordSearchChunks(
      merchantId,
      query,
      sourceTypes,
      locale,
      limit,
      businessType,
    );
  }

  /**
   * Get all active KB chunks for a merchant filtered by source type.
   * Used for direct injection of full policy/rule sets into prompts.
   */
  async getChunksBySourceType(
    merchantId: string,
    sourceType: KbSourceType,
    locale?: string,
  ): Promise<KbChunk[]> {
    const params: unknown[] = [merchantId, sourceType];
    let sql = `
      SELECT id, merchant_id, source_type, business_type, module, category,
             locale, visibility, confidence_level, requires_manual_review, tags,
             title, content, last_updated, source_reference
      FROM merchant_kb_chunks
      WHERE merchant_id = $1
        AND source_type = $2
        AND is_active = true`;

    if (locale) {
      params.push(locale);
      sql += ` AND locale = $${params.length}`;
    }

    sql += " ORDER BY last_updated DESC";

    try {
      const result = await this.pool.query<Record<string, unknown>>(
        sql,
        params,
      );
      return result.rows.map((r) => this.rowToChunk(r));
    } catch (error: any) {
      this.logger.warn(`getChunksBySourceType failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get active business rules for a merchant by rule type.
   * Returns rules ordered by sort_order then created_at.
   */
  async getRulesByType(
    merchantId: string,
    ruleType: string,
  ): Promise<BusinessRule[]> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT id, merchant_id, rule_type, rule_name, rule_description,
                condition, action, confidence_required, human_review_required, status
         FROM merchant_business_rules
         WHERE merchant_id = $1
           AND rule_type = $2
           AND status = 'active'
         ORDER BY sort_order ASC, created_at ASC`,
        [merchantId, ruleType],
      );
      return result.rows.map((r) => this.rowToRule(r));
    } catch (error: any) {
      this.logger.warn(`getRulesByType failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get all active business rules for a merchant, grouped by rule_type.
   * Useful for injecting the full rule set into a system prompt.
   */
  async getAllRules(
    merchantId: string,
  ): Promise<Record<string, BusinessRule[]>> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT id, merchant_id, rule_type, rule_name, rule_description,
                condition, action, confidence_required, human_review_required, status
         FROM merchant_business_rules
         WHERE merchant_id = $1 AND status = 'active'
         ORDER BY rule_type, sort_order ASC`,
        [merchantId],
      );
      return result.rows
        .map((r) => this.rowToRule(r))
        .reduce<Record<string, BusinessRule[]>>((acc, rule) => {
          const group = acc[rule.ruleType] ?? [];
          group.push(rule);
          acc[rule.ruleType] = group;
          return acc;
        }, {});
    } catch (error: any) {
      this.logger.warn(`getAllRules failed: ${error.message}`);
      return {};
    }
  }

  /**
   * Returns true if any structured KB chunks exist for this merchant.
   * Used by context builders to decide between structured retrieval and
   * the legacy JSONB fallback path in merchant-context.service.ts.
   */
  async hasStructuredKb(merchantId: string): Promise<boolean> {
    try {
      const result = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM merchant_kb_chunks
         WHERE merchant_id = $1 AND is_active = true
         LIMIT 1`,
        [merchantId],
      );
      return parseInt(result.rows[0]?.count ?? "0", 10) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Format retrieved chunks as a prompt-ready text block.
   * Each chunk includes its source_type and confidence_level as metadata
   * headers so the AI can apply the correct trust level.
   */
  formatChunksForPrompt(chunks: KbChunk[]): string {
    if (chunks.length === 0) return "";
    return chunks
      .map(
        (c) =>
          `[${c.sourceType}${c.confidenceLevel !== "high" ? ` | confidence:${c.confidenceLevel}` : ""}${c.requiresManualReview ? " | manual-review-required" : ""}]\n${c.title}\n${c.content}`,
      )
      .join("\n\n---\n\n");
  }

  /**
   * Format business rules as a prompt-ready block grouped by type.
   */
  formatRulesForPrompt(rulesByType: Record<string, BusinessRule[]>): string {
    const sections = Object.entries(rulesByType)
      .filter(([, rules]) => rules.length > 0)
      .map(([type, rules]) => {
        const lines = rules.map((r) => {
          const parts = [`- ${r.ruleName}`];
          if (r.condition) parts.push(`  condition: ${r.condition}`);
          if (r.action) parts.push(`  action: ${r.action}`);
          if (r.humanReviewRequired) parts.push(`  requires-human-review: yes`);
          return parts.join("\n");
        });
        return `${type}:\n${lines.join("\n")}`;
      });
    return sections.join("\n\n");
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async semanticSearchChunks(
    merchantId: string,
    queryVec: number[],
    sourceTypes: KbSourceType[] | undefined,
    locale: string | undefined,
    limit: number,
    businessType?: string,
  ): Promise<KbChunk[]> {
    const pgVecLiteral = `[${queryVec.join(",")}]`;
    const params: unknown[] = [merchantId, pgVecLiteral];
    let sql = `
      SELECT id, merchant_id, source_type, business_type, module, category,
             locale, visibility, confidence_level, requires_manual_review, tags,
             title, content, last_updated, source_reference,
             (embedding <=> $2::vector) AS distance
      FROM merchant_kb_chunks
      WHERE merchant_id = $1
        AND is_active = true
        AND embedding IS NOT NULL`;

    if (sourceTypes && sourceTypes.length > 0) {
      params.push(sourceTypes);
      sql += ` AND source_type = ANY($${params.length})`;
    }
    if (locale) {
      params.push(locale);
      sql += ` AND locale = $${params.length}`;
    }
    if (businessType) {
      params.push(businessType);
      sql += ` AND (business_type = $${params.length} OR business_type IS NULL)`;
    }

    params.push(limit);
    sql += ` ORDER BY distance ASC LIMIT $${params.length}`;

    const result = await this.pool.query<Record<string, unknown>>(sql, params);
    return result.rows.map((r) => this.rowToChunk(r));
  }

  private async keywordSearchChunks(
    merchantId: string,
    query: string,
    sourceTypes: KbSourceType[] | undefined,
    locale: string | undefined,
    limit: number,
    businessType?: string,
  ): Promise<KbChunk[]> {
    const params: unknown[] = [merchantId, `%${query}%`];
    let sql = `
      SELECT id, merchant_id, source_type, business_type, module, category,
             locale, visibility, confidence_level, requires_manual_review, tags,
             title, content, last_updated, source_reference
      FROM merchant_kb_chunks
      WHERE merchant_id = $1
        AND is_active = true
        AND (title ILIKE $2 OR content ILIKE $2)`;

    if (sourceTypes && sourceTypes.length > 0) {
      params.push(sourceTypes);
      sql += ` AND source_type = ANY($${params.length})`;
    }
    if (locale) {
      params.push(locale);
      sql += ` AND locale = $${params.length}`;
    }
    if (businessType) {
      params.push(businessType);
      sql += ` AND (business_type = $${params.length} OR business_type IS NULL)`;
    }

    params.push(limit);
    sql += ` ORDER BY last_updated DESC LIMIT $${params.length}`;

    try {
      const result = await this.pool.query<Record<string, unknown>>(
        sql,
        params,
      );
      return result.rows.map((r) => this.rowToChunk(r));
    } catch (error: any) {
      this.logger.warn(`KB keyword search failed: ${error.message}`);
      return [];
    }
  }

  private rowToChunk(row: Record<string, unknown>): KbChunk {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      sourceType: row.source_type as KbSourceType,
      businessType: (row.business_type as string) ?? undefined,
      module: (row.module as string) ?? undefined,
      category: (row.category as string) ?? undefined,
      locale: row.locale as string,
      visibility: row.visibility as string,
      confidenceLevel: row.confidence_level as ConfidenceLevel,
      requiresManualReview: row.requires_manual_review as boolean,
      tags: (row.tags as string[]) ?? [],
      title: row.title as string,
      content: row.content as string,
      lastUpdated: new Date(row.last_updated as string),
      sourceReference: (row.source_reference as string) ?? undefined,
    };
  }

  private rowToRule(row: Record<string, unknown>): BusinessRule {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      ruleType: row.rule_type as string,
      ruleName: row.rule_name as string,
      ruleDescription: (row.rule_description as string) ?? undefined,
      condition: (row.condition as string) ?? undefined,
      action: (row.action as string) ?? undefined,
      confidenceRequired: row.confidence_required as string,
      humanReviewRequired: row.human_review_required as boolean,
      status: row.status as string,
    };
  }
}
