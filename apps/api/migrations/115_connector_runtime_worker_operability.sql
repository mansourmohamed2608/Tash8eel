-- Migration 115: Connector runtime worker operability ledger
-- Scope:
-- 1) Persist connector worker-cycle run summaries
-- 2) Persist per-merchant worker outcomes for operational visibility

CREATE TABLE IF NOT EXISTS connector_runtime_worker_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source VARCHAR(32) NOT NULL DEFAULT 'scheduler',
  worker_instance VARCHAR(120),
  run_status VARCHAR(20) NOT NULL
    CHECK (run_status IN ('COMPLETED', 'FAILED', 'SKIPPED')),
  cycle_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  cycle_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_runtime_worker_cycles_started_at
  ON connector_runtime_worker_cycles (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_runtime_worker_cycles_status_started
  ON connector_runtime_worker_cycles (run_status, started_at DESC);

CREATE TABLE IF NOT EXISTS connector_runtime_worker_cycle_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES connector_runtime_worker_cycles(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  lock_acquired BOOLEAN NOT NULL DEFAULT false,
  queue_total_picked INTEGER NOT NULL DEFAULT 0,
  queue_processed INTEGER NOT NULL DEFAULT 0,
  queue_retried INTEGER NOT NULL DEFAULT 0,
  queue_moved_to_dlq INTEGER NOT NULL DEFAULT 0,
  recovered_stuck_count INTEGER NOT NULL DEFAULT 0,
  reconciliation_attempted BOOLEAN NOT NULL DEFAULT false,
  reconciliation_succeeded BOOLEAN NOT NULL DEFAULT false,
  reconciliation_skipped_by_depth BOOLEAN NOT NULL DEFAULT false,
  reconciliation_run_id VARCHAR(64),
  reconciliation_error TEXT,
  outcome_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_runtime_worker_outcomes_merchant_created
  ON connector_runtime_worker_cycle_outcomes (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_runtime_worker_outcomes_cycle
  ON connector_runtime_worker_cycle_outcomes (cycle_id, merchant_id);
