import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { EmbeddingService } from "../llm/embedding.service";

/** Max jobs processed per queue per tick to stay within OpenAI rate limits. */
const CATALOG_BATCH = 10;
const KB_BATCH = 10;
/** Mark as FAILED after this many attempts. */
const MAX_ATTEMPTS = 3;

/**
 * EmbeddingWorker
 * ───────────────
 * Background worker that drains two job queues:
 *
 *  1. catalog_embedding_jobs  — generates embeddings for catalog_items
 *     (queue was created in migration 087; jobs enqueued by CatalogRepository)
 *
 *  2. kb_embedding_jobs       — generates embeddings for merchant_kb_chunks
 *     (queue created in migration 121; jobs enqueued by KbChunkService)
 *
 * Both queues share the same PENDING → PROCESSING → DONE | FAILED state
 * machine and the same OpenAI text-embedding-3-small model (1536 dims).
 *
 * Rate limiting / backoff:
 *  - Runs every 30 seconds.
 *  - Processes at most CATALOG_BATCH catalog jobs and KB_BATCH KB jobs per tick.
 *  - On transient error: increments attempts, resets to PENDING (will retry).
 *  - After MAX_ATTEMPTS failures: marks job FAILED (no more retries).
 *  - isProcessing guard prevents overlapping runs.
 */
@Injectable()
export class EmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingWorker.name);
  private isProcessing = false;
  private isShuttingDown = false;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly embedding: EmbeddingService,
  ) {}

  onModuleInit(): void {
    this.logger.log("Embedding worker initialized");
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    this.logger.log("Embedding worker shutting down");
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingEmbeddings(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) return;
    this.isProcessing = true;

    try {
      const catalogProcessed = await this.processCatalogJobs();
      const kbProcessed = await this.processKbJobs();

      if (catalogProcessed + kbProcessed > 0) {
        this.logger.log({
          msg: "Embedding worker tick completed",
          catalogProcessed,
          kbProcessed,
        });
      }
    } catch (err) {
      this.logger.error({
        msg: "Embedding worker tick error",
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  // ── Catalog embeddings ────────────────────────────────────────────────

  private async processCatalogJobs(): Promise<number> {
    const jobs = await this.claimCatalogJobs(CATALOG_BATCH);
    let processed = 0;

    for (const job of jobs) {
      if (this.isShuttingDown) break;

      try {
        // Fetch catalog item text fields
        const itemRow = await this.pool.query(
          `SELECT id, name_ar, name_en, description_ar, description_en,
                  category, tags, variants
           FROM catalog_items WHERE id = $1`,
          [job.catalog_item_id],
        );

        if (itemRow.rows.length === 0) {
          // Item deleted — mark done (no-op)
          await this.markCatalogJobDone(job.id);
          continue;
        }

        const item = itemRow.rows[0];
        const text = this.embedding.buildCatalogText({
          nameAr: item.name_ar,
          nameEn: item.name_en,
          descriptionAr: item.description_ar,
          descriptionEn: item.description_en,
          category: item.category,
          tags: item.tags,
          variants: item.variants,
        });

        const vec = await this.embedding.embed(text);

        // Store embedding — skip zero-vectors (test mode)
        if (!vec.every((v) => v === 0)) {
          const vecLiteral = `[${vec.join(",")}]`;
          await this.pool.query(
            `UPDATE catalog_items SET embedding = $1::vector WHERE id = $2`,
            [vecLiteral, item.id],
          );
        }

        await this.markCatalogJobDone(job.id);
        processed++;
      } catch (err) {
        await this.failCatalogJob(
          job.id,
          job.attempts,
          err instanceof Error ? err.message : String(err),
        );
        this.logger.warn({
          msg: "Catalog embedding job failed",
          jobId: job.id,
          catalogItemId: job.catalog_item_id,
          attempts: job.attempts + 1,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return processed;
  }

  private async claimCatalogJobs(
    limit: number,
  ): Promise<Array<{ id: string; catalog_item_id: string; attempts: number }>> {
    try {
      const result = await this.pool.query(
        `UPDATE catalog_embedding_jobs
         SET status = 'PROCESSING', updated_at = NOW(), attempts = attempts + 1
         WHERE id IN (
           SELECT id FROM catalog_embedding_jobs
           WHERE status = 'PENDING'
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, catalog_item_id, attempts`,
        [limit],
      );
      return result.rows;
    } catch {
      // Table may not exist in older environments
      return [];
    }
  }

  private async markCatalogJobDone(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE catalog_embedding_jobs
       SET status = 'DONE', processed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [jobId],
    );
  }

  private async failCatalogJob(
    jobId: string,
    previousAttempts: number,
    error: string,
  ): Promise<void> {
    const newAttempts = previousAttempts + 1;
    const finalStatus = newAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING";
    await this.pool.query(
      `UPDATE catalog_embedding_jobs
       SET status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3`,
      [finalStatus, error.slice(0, 500), jobId],
    );
  }

  // ── KB chunk embeddings ───────────────────────────────────────────────

  private async processKbJobs(): Promise<number> {
    const jobs = await this.claimKbJobs(KB_BATCH);
    let processed = 0;

    for (const job of jobs) {
      if (this.isShuttingDown) break;

      try {
        const chunkRow = await this.pool.query(
          `SELECT id, content FROM merchant_kb_chunks WHERE id = $1`,
          [job.chunk_id],
        );

        if (chunkRow.rows.length === 0) {
          await this.markKbJobDone(job.id);
          continue;
        }

        const chunk = chunkRow.rows[0];
        const vec = await this.embedding.embed(chunk.content as string);

        if (!vec.every((v) => v === 0)) {
          const vecLiteral = `[${vec.join(",")}]`;
          await this.pool.query(
            `UPDATE merchant_kb_chunks SET embedding = $1::vector WHERE id = $2`,
            [vecLiteral, chunk.id],
          );
        }

        await this.markKbJobDone(job.id);
        processed++;
      } catch (err) {
        await this.failKbJob(
          job.id,
          job.attempts,
          err instanceof Error ? err.message : String(err),
        );
        this.logger.warn({
          msg: "KB embedding job failed",
          jobId: job.id,
          chunkId: job.chunk_id,
          attempts: job.attempts + 1,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return processed;
  }

  private async claimKbJobs(
    limit: number,
  ): Promise<Array<{ id: string; chunk_id: string; attempts: number }>> {
    try {
      const result = await this.pool.query(
        `UPDATE kb_embedding_jobs
         SET status = 'PROCESSING', updated_at = NOW(), attempts = attempts + 1
         WHERE id IN (
           SELECT id FROM kb_embedding_jobs
           WHERE status = 'PENDING'
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, chunk_id, attempts`,
        [limit],
      );
      return result.rows;
    } catch {
      return [];
    }
  }

  private async markKbJobDone(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE kb_embedding_jobs
       SET status = 'DONE', processed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [jobId],
    );
  }

  private async failKbJob(
    jobId: string,
    previousAttempts: number,
    error: string,
  ): Promise<void> {
    const newAttempts = previousAttempts + 1;
    const finalStatus = newAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING";
    await this.pool.query(
      `UPDATE kb_embedding_jobs
       SET status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3`,
      [finalStatus, error.slice(0, 500), jobId],
    );
  }
}
