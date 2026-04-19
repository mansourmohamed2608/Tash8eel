-- ============================================================
-- Migration 121: Merchant KB Chunks + Embedding Job Queue
-- ============================================================
-- Reconciled from two independent implementation waves:
--   • fervent-merkle-62411e  — rich metadata schema (KB_RAG_SCHEMA §4-§12)
--   • magical-mclaren-29a8d9 — async embedding job queue + upsert pattern
--
-- Creates:
--   1. merchant_kb_chunks   — structured, embeddable KB fragments with
--      full metadata per KB_RAG_SCHEMA §11 (source_type, locale, tags, etc.)
--      PLUS source_id + metadata for JSONB projection upsert pattern.
--   2. kb_embedding_jobs    — async queue so EmbeddingWorker can backfill
--      pgvector embeddings without blocking the write path.
--
-- Backward compatibility:
--   • merchants.knowledge_base JSONB is NOT removed; it remains the
--     authoritative write surface for the merchant portal.
--   • merchant_kb_chunks is a derived/enriched projection of that data.
--   • MerchantContextService falls back to JSONB when no structured
--     chunks exist (hasStructuredKb flag).
-- ============================================================

-- ── 1. merchant_kb_chunks ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merchant_kb_chunks (
  id                     UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id            VARCHAR(50)   NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Source type drives routing and filtering (KB_RAG_SCHEMA §11).
  -- Values (lowercase): faq, policy, delivery_rule, payment_rule,
  --   escalation_rule, style_rule, support_rule, product_rule, playbook,
  --   business_info, offer, custom
  -- VARCHAR deliberately chosen over ENUM for extensibility.
  source_type            VARCHAR(30)   NOT NULL,

  -- Stable identifier within the merchant's KB (e.g. FAQ id from JSONB).
  -- Used for idempotent upsert from KbChunkService.syncFromMerchantKb().
  -- NULL for singleton types (business_info, CUSTOM global).
  source_id              VARCHAR(100),

  -- Optional scope narrowing
  business_type          VARCHAR(50),   -- null = applies to all merchant types
  module                 VARCHAR(50),   -- null = platform-wide
  category               VARCHAR(100),

  -- BCP-47 locale (ar-EG, ar, en, …)
  locale                 VARCHAR(10)   NOT NULL DEFAULT 'ar',

  -- public = customer-visible; internal = staff/AI only
  visibility             VARCHAR(20)   NOT NULL DEFAULT 'public',

  -- Affects AI confidence before autonomous action (high/medium/low)
  confidence_level       VARCHAR(20)   NOT NULL DEFAULT 'high',

  requires_manual_review BOOLEAN       NOT NULL DEFAULT false,
  tags                   TEXT[]        NOT NULL DEFAULT '{}',

  title                  TEXT          NOT NULL DEFAULT '',
  content                TEXT          NOT NULL,

  -- Arbitrary metadata JSONB for projection and raw KB object storage
  metadata               JSONB         NOT NULL DEFAULT '{}',

  -- pgvector embedding — populated asynchronously by EmbeddingWorker
  embedding              VECTOR(1536),

  is_active              BOOLEAN       NOT NULL DEFAULT true,
  last_updated           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  source_reference       TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Upsert key: one chunk per (merchant, source_type, source_id).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_kb_chunks_merchant_type_source
  ON merchant_kb_chunks (merchant_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- Singleton types — one row per (merchant, source_type) when source_id is null.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_kb_chunks_merchant_type_singleton
  ON merchant_kb_chunks (merchant_id, source_type)
  WHERE source_id IS NULL;

-- HNSW for fast cosine ANN queries (same params as catalog_items migration 087)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding_hnsw
  ON merchant_kb_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Fast lookup by merchant + source_type (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_merchant_source_type
  ON merchant_kb_chunks (merchant_id, source_type)
  WHERE is_active = true;

-- Fast lookup by merchant (for KbChunkService.syncFromMerchantKb)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_merchant
  ON merchant_kb_chunks (merchant_id)
  WHERE is_active = true;

-- GIN for tag-based filtering
CREATE INDEX IF NOT EXISTS idx_kb_chunks_tags
  ON merchant_kb_chunks USING gin (tags);

-- Pending embedding backfill: chunks with no embedding, ordered by creation
CREATE INDEX IF NOT EXISTS idx_kb_chunks_no_embedding
  ON merchant_kb_chunks (merchant_id, created_at ASC)
  WHERE embedding IS NULL AND is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_merchant_kb_chunks_updated_at'
  ) THEN
    CREATE TRIGGER update_merchant_kb_chunks_updated_at
      BEFORE UPDATE ON merchant_kb_chunks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── 2. kb_embedding_jobs ──────────────────────────────────────────────────
-- Async queue for KB chunk embeddings.  Mirrors catalog_embedding_jobs
-- (migration 087) — same PENDING→PROCESSING→DONE|FAILED state machine.

CREATE TABLE IF NOT EXISTS kb_embedding_jobs (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id       UUID          NOT NULL REFERENCES merchant_kb_chunks(id) ON DELETE CASCADE,
  merchant_id    VARCHAR(50)   NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  -- PENDING → PROCESSING → DONE | FAILED
  status         VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  attempts       INTEGER       NOT NULL DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);

-- Polling index: pick up pending jobs in FIFO order
CREATE INDEX IF NOT EXISTS idx_kb_embedding_jobs_pending
  ON kb_embedding_jobs (created_at ASC)
  WHERE status = 'PENDING';

-- Deduplication / re-queue lookup
CREATE INDEX IF NOT EXISTS idx_kb_embedding_jobs_chunk
  ON kb_embedding_jobs (chunk_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_kb_embedding_jobs_updated_at'
  ) THEN
    CREATE TRIGGER update_kb_embedding_jobs_updated_at
      BEFORE UPDATE ON kb_embedding_jobs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
