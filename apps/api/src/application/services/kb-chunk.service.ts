import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

/** Chunk types mirror the kb_source_type PG enum in migration 121. */
// source_type values mirror kb_chunk_type from migration 121 (stored as lowercase VARCHAR)
type KbChunkType = string;
interface KbChunkRow {
  id: string;
  merchant_id: string;
  source_type: string;
  source_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  has_embedding: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface KbChunkSummary {
  id: string;
  chunkType: string;
  sourceId: string | null;
  content: string;
  hasEmbedding: boolean;
  isActive: boolean;
  updatedAt: Date;
}

export interface KbSearchResult {
  id: string;
  chunkType: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

/**
 * KbChunkService
 * ──────────────
 * Responsible for:
 *   1. Projecting merchants.knowledge_base JSONB into merchant_kb_chunks rows
 *      (syncFromMerchantKb).  This is the "ingestion" path for Wave 3C.
 *   2. Queuing kb_embedding_jobs for any new/changed chunks so the
 *      EmbeddingWorker will pick them up asynchronously.
 *   3. ANN-based search over KB chunks (searchChunks) for use by
 *      MerchantContextService / RAG retrieval when embeddings exist.
 *
 * Design contract:
 *   * merchants.knowledge_base remains the authoritative write surface;
 *     merchant_kb_chunks is a derived projection — never write chunks
 *     directly without also reflecting the change back to the JSONB store.
 *   * syncFromMerchantKb is idempotent: safe to call repeatedly.
 *   * No vertical merchant logic — content comes from the merchant's own KB.
 */
@Injectable()
export class KbChunkService {
  private readonly logger = new Logger(KbChunkService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Project the merchant's knowledge_base JSONB into merchant_kb_chunks.
   * Creates new chunks and soft-updates changed ones, then enqueues
   * kb_embedding_jobs for anything that needs (re-)embedding.
   * Returns counts for observability.
   */
  async syncFromMerchantKb(merchantId: string): Promise<{
    upserted: number;
    deactivated: number;
    queued: number;
  }> {
    const row = await this.pool.query(
      `SELECT knowledge_base FROM merchants WHERE id = $1`,
      [merchantId],
    );

    const kb = row.rows[0]?.knowledge_base;
    if (!kb) {
      return { upserted: 0, deactivated: 0, queued: 0 };
    }

    const chunks = this.extractChunksFromKb(kb);

    let upserted = 0;
    let queued = 0;

    for (const chunk of chunks) {
      const chunkId = await this.upsertChunk(merchantId, chunk);
      if (chunkId) {
        await this.queueEmbeddingJob(chunkId, merchantId);
        upserted++;
        queued++;
      }
    }

    // Deactivate chunks whose source_id no longer appears in the KB
    const deactivated = await this.deactivateOrphanedChunks(merchantId, chunks);

    this.logger.log({
      msg: "KB chunks synced",
      merchantId,
      upserted,
      deactivated,
      queued,
    });

    return { upserted, deactivated, queued };
  }

  /**
   * ANN search over KB chunks.  Returns up to `limit` chunks ordered by
   * cosine similarity.  Falls back to ILIKE text search when no embeddings
   * have been generated yet (safe degradation for new merchants).
   */
  async searchChunks(
    merchantId: string,
    queryVec: number[],
    limit = 5,
  ): Promise<KbSearchResult[]> {
    const isZeroVec = queryVec.every((v) => v === 0);
    if (isZeroVec) return [];

    try {
      const vecLiteral = `[${queryVec.join(",")}]`;
      const result = await this.pool.query(
        `SELECT id, source_type, content, metadata,
                1 - (embedding <=> $1::vector) AS score
         FROM merchant_kb_chunks
         WHERE merchant_id = $2
           AND is_active = TRUE
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [vecLiteral, merchantId, limit],
      );

      return result.rows.map((r) => ({
        id: r.id as string,
        chunkType: r.source_type as KbChunkType,
        content: r.content as string,
        metadata: r.metadata as Record<string, unknown>,
        score: parseFloat(r.score),
      }));
    } catch (err) {
      this.logger.warn({
        msg: "KB ANN search failed, skipping",
        merchantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * List all active KB chunks for a merchant with embedding status.
   * Used by the portal /knowledge-base/chunks endpoint.
   */
  async listChunks(merchantId: string): Promise<KbChunkSummary[]> {
    const result = await this.pool.query(
      `SELECT id, source_type, source_id, content,
              embedding IS NOT NULL AS has_embedding,
              is_active, updated_at
       FROM merchant_kb_chunks
       WHERE merchant_id = $1
         AND is_active = TRUE
       ORDER BY source_type, source_id NULLS LAST`,
      [merchantId],
    );

    return result.rows.map((r: KbChunkRow) => ({
      id: r.id,
      chunkType: r.source_type,
      sourceId: r.source_id,
      content: r.content,
      hasEmbedding: r.has_embedding,
      isActive: r.is_active,
      updatedAt: new Date(r.updated_at),
    }));
  }

  // ── Ingestion helpers ──────────────────────────────────────────────────

  /**
   * Decompose a merchants.knowledge_base JSONB object into flat chunk records.
   */
  private extractChunksFromKb(kb: Record<string, unknown>): Array<{
    chunkType: string;
    sourceId: string | null;
    content: string;
    metadata: Record<string, unknown>;
  }> {
    const chunks: Array<{
      chunkType: string;
      sourceId: string | null;
      content: string;
      metadata: Record<string, unknown>;
    }> = [];

    // ── FAQs ──────────────────────────────────────────────────────────────
    const faqs = Array.isArray(kb.faqs) ? kb.faqs : [];
    for (const faq of faqs) {
      if (!faq?.isActive && faq?.isActive !== undefined) continue;
      if (!faq?.question || !faq?.answer) continue;

      const content = [
        faq.question,
        faq.answer,
        faq.category ? `(${faq.category})` : "",
      ]
        .filter(Boolean)
        .join("\n");

      chunks.push({
        chunkType: "FAQ",
        sourceId: String(faq.id || faq.question).slice(0, 100),
        content,
        metadata: {
          question: faq.question,
          answer: faq.answer,
          category: faq.category,
        },
      });
    }

    // ── Business info (singleton) ──────────────────────────────────────
    const bi = kb.businessInfo as Record<string, unknown> | undefined;
    if (bi) {
      const parts: string[] = [];
      if (bi.name) parts.push(`الاسم: ${bi.name}`);
      if (bi.category) parts.push(`الفئة: ${bi.category}`);
      if (bi.address) parts.push(`العنوان: ${bi.address}`);
      const wh = bi.workingHours as Record<string, unknown> | undefined;
      if (wh?.open || wh?.close) {
        parts.push(`أوقات العمل: ${wh.open ?? ""} - ${wh.close ?? ""}`);
      }

      if (parts.length > 0) {
        chunks.push({
          chunkType: "BUSINESS_INFO",
          sourceId: null,
          content: parts.join("\n"),
          metadata: { businessInfo: bi },
        });
      }
    }

    // ── Policies ──────────────────────────────────────────────────────
    const policies = (bi?.policies ?? {}) as Record<string, unknown>;

    if (policies.returnPolicy) {
      chunks.push({
        chunkType: "POLICY_RETURN",
        sourceId: null,
        content: `سياسة الإرجاع:\n${policies.returnPolicy}`,
        metadata: { returnPolicy: policies.returnPolicy },
      });
    }

    if (policies.deliveryInfo) {
      chunks.push({
        chunkType: "POLICY_DELIVERY",
        sourceId: null,
        content: `معلومات التوصيل:\n${policies.deliveryInfo}`,
        metadata: { deliveryInfo: policies.deliveryInfo },
      });
    }

    const paymentMethods = Array.isArray(policies.paymentMethods)
      ? policies.paymentMethods
      : [];
    if (paymentMethods.length > 0) {
      chunks.push({
        chunkType: "POLICY_PAYMENT",
        sourceId: null,
        content: `طرق الدفع: ${paymentMethods.join("، ")}`,
        metadata: { paymentMethods },
      });
    }

    // ── Offers ────────────────────────────────────────────────────────
    const offers = Array.isArray(kb.offers) ? kb.offers : [];
    for (const offer of offers) {
      if (!offer?.isActive) continue;
      const name = offer.nameAr || offer.name;
      if (!name) continue;

      let desc = name;
      if (offer.type === "PERCENTAGE" && offer.value) {
        desc += ` — خصم ${offer.value}%`;
      } else if (offer.type === "FIXED" && offer.value) {
        desc += ` — خصم ${offer.value} ريال`;
      } else if (offer.type === "FREE_SHIPPING") {
        desc += " — شحن مجاني";
      }

      chunks.push({
        chunkType: "OFFER",
        sourceId: String(offer.id || name).slice(0, 100),
        content: `عرض: ${desc}`,
        metadata: { offer },
      });
    }

    // ── Custom instructions ───────────────────────────────────────────
    const custom = kb.customInstructions;
    const customText = Array.isArray(custom)
      ? custom.join("\n")
      : typeof custom === "string"
        ? custom
        : null;

    if (customText?.trim()) {
      chunks.push({
        chunkType: "CUSTOM",
        sourceId: null,
        content: customText.trim(),
        metadata: {},
      });
    }

    return chunks;
  }

  /**
   * Upsert a single chunk.  Returns chunk id if a row was inserted or
   * content was updated (i.e., embedding needs refreshing), null if
   * the content is identical to what is already stored.
   */
  private async upsertChunk(
    merchantId: string,
    chunk: {
      chunkType: string;
      sourceId: string | null;
      content: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<string | null> {
    try {
      // For non-singleton types (source_id not null) use the source-keyed index.
      // For singletons (source_id null) use the type-keyed index.
      const result = await this.pool.query(
        `INSERT INTO merchant_kb_chunks
           (merchant_id, source_type, source_id, content, metadata, is_active)
         VALUES ($1, $2::kb_source_type, $3, $4, $5, TRUE)
         ON CONFLICT ON CONSTRAINT uidx_kb_chunks_merchant_type_source
           DO UPDATE SET
             content    = EXCLUDED.content,
             metadata   = EXCLUDED.metadata,
             is_active  = TRUE,
             -- Clear embedding so the worker re-embeds changed content
             embedding  = CASE
               WHEN merchant_kb_chunks.content IS DISTINCT FROM EXCLUDED.content
               THEN NULL
               ELSE merchant_kb_chunks.embedding
             END,
             updated_at = NOW()
           WHERE merchant_kb_chunks.content IS DISTINCT FROM EXCLUDED.content
              OR merchant_kb_chunks.is_active = FALSE
         RETURNING id`,
        [
          merchantId,
          chunk.chunkType,
          chunk.sourceId,
          chunk.content,
          JSON.stringify(chunk.metadata),
        ],
      );

      if (result.rows.length > 0) {
        return result.rows[0].id as string;
      }

      // ON CONFLICT … DO UPDATE WHERE … — when the WHERE clause is false
      // (content unchanged), no row is returned.  We still need the id for
      // chunks that might be missing their embedding (e.g. first run).
      // Fetch the existing id to check embedding status.
      const existing = await this.pool.query(
        `SELECT id FROM merchant_kb_chunks
         WHERE merchant_id = $1
           AND source_type  = $2::kb_source_type
           AND source_id   = $3
           AND embedding   IS NULL`,
        [merchantId, chunk.chunkType, chunk.sourceId],
      );

      return existing.rows.length > 0 ? (existing.rows[0].id as string) : null;
    } catch (err: unknown) {
      // Singleton conflict path (source_id IS NULL uses different index)
      if (
        err instanceof Error &&
        err.message.includes("uidx_kb_chunks_merchant_type_singleton")
      ) {
        return this.upsertSingletonChunk(merchantId, {
          ...chunk,
          sourceId: null,
        });
      }
      this.logger.warn({
        msg: "Failed to upsert KB chunk",
        merchantId,
        chunkType: chunk.chunkType,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Upsert path for chunks with source_id = NULL (singletons per type). */
  private async upsertSingletonChunk(
    merchantId: string,
    chunk: {
      chunkType: string;
      sourceId: null;
      content: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<string | null> {
    const result = await this.pool.query(
      `INSERT INTO merchant_kb_chunks
         (merchant_id, source_type, source_id, content, metadata, is_active)
       VALUES ($1, $2::kb_source_type, NULL, $3, $4, TRUE)
       ON CONFLICT ON CONSTRAINT uidx_kb_chunks_merchant_type_singleton
         DO UPDATE SET
           content   = EXCLUDED.content,
           metadata  = EXCLUDED.metadata,
           is_active = TRUE,
           embedding = CASE
             WHEN merchant_kb_chunks.content IS DISTINCT FROM EXCLUDED.content
             THEN NULL
             ELSE merchant_kb_chunks.embedding
           END,
           updated_at = NOW()
         WHERE merchant_kb_chunks.content IS DISTINCT FROM EXCLUDED.content
            OR merchant_kb_chunks.is_active = FALSE
       RETURNING id`,
      [
        merchantId,
        chunk.chunkType,
        chunk.content,
        JSON.stringify(chunk.metadata),
      ],
    );

    if (result.rows.length > 0) {
      return result.rows[0].id as string;
    }

    // Embedding still missing?
    const existing = await this.pool.query(
      `SELECT id FROM merchant_kb_chunks
       WHERE merchant_id = $1
         AND source_type  = $2::kb_source_type
         AND source_id   IS NULL
         AND embedding   IS NULL`,
      [merchantId, chunk.chunkType],
    );

    return existing.rows.length > 0 ? (existing.rows[0].id as string) : null;
  }

  /**
   * Soft-deactivate chunks whose source_id is no longer present in the KB.
   * Only applied to typed chunks that carry a source_id (FAQs, offers).
   */
  private async deactivateOrphanedChunks(
    merchantId: string,
    currentChunks: Array<{ chunkType: string; sourceId: string | null }>,
  ): Promise<number> {
    const activeSourceIds = currentChunks
      .filter((c) => c.sourceId !== null)
      .map((c) => c.sourceId as string);

    if (activeSourceIds.length === 0) return 0;

    try {
      const result = await this.pool.query(
        `UPDATE merchant_kb_chunks
         SET is_active = FALSE, updated_at = NOW()
         WHERE merchant_id = $1
           AND source_id IS NOT NULL
           AND source_id <> ALL($2::varchar[])
           AND is_active = TRUE`,
        [merchantId, activeSourceIds],
      );
      return result.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Fire-and-forget: insert a PENDING job into kb_embedding_jobs.
   * The embedding worker picks this up and calls OpenAI.
   */
  private async queueEmbeddingJob(
    chunkId: string,
    merchantId: string,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO kb_embedding_jobs (chunk_id, merchant_id, status)
         VALUES ($1, $2, 'PENDING')
         ON CONFLICT DO NOTHING`,
        [chunkId, merchantId],
      );
    } catch {
      // Table may not exist yet during initial migration window — swallow silently.
    }
  }
}
