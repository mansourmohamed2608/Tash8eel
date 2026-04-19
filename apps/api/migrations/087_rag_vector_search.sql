-- ============================================================
-- Migration 087: RAG Vector Search Infrastructure
-- ============================================================
-- Creates:
--   1. HNSW index on catalog_items.embedding for fast ANN search
--   2. catalog_embedding_jobs table for async background embedding queue
--   3. Index to efficiently poll pending jobs
--
-- The catalog_items.embedding VECTOR(1536) column already exists
-- (added in 001_init.sql).  Here we add the HNSW index and the
-- background job queue that drives the embedding pipeline.
-- ============================================================

-- 1. HNSW index for cosine ANN queries
--    m=16, ef_construction=64 is the recommended starting point for
--    1536-dim OpenAI embeddings. Tune ef_search at query time.
CREATE INDEX IF NOT EXISTS idx_catalog_embedding_hnsw
  ON catalog_items
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 2. Async embedding job queue
--    Inserted when a catalog item is created or updated so the background
--    worker can generate and store embeddings without blocking the API.
CREATE TABLE IF NOT EXISTS catalog_embedding_jobs (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_item_id   UUID         NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  merchant_id       VARCHAR(50)  NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  -- PENDING → PROCESSING → DONE | FAILED
  status            VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  attempts          INTEGER      NOT NULL DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ
);

-- 3. Index for the embedding worker: picks up pending jobs in FIFO order
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_pending
  ON catalog_embedding_jobs (created_at ASC)
  WHERE status = 'PENDING';

-- 4. Index to look up jobs by item (for deduplication / re-queue)
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_item
  ON catalog_embedding_jobs (catalog_item_id);

-- 5. Auto-update updated_at on row change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_catalog_embedding_jobs_updated_at'
  ) THEN
    CREATE TRIGGER update_catalog_embedding_jobs_updated_at
      BEFORE UPDATE ON catalog_embedding_jobs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
