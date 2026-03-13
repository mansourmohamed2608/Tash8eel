-- Migration 080: P1/P2 hardening tables
-- BL-007 idempotency, BL-008 webhook dedup, BL-004 AI metrics, BL-009 job failures

-- ── BL-007: Idempotency records for AI mutation flows ─────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_records (
  key          VARCHAR(512) PRIMARY KEY,
  merchant_id  UUID,
  response_body JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records (expires_at);

-- ── BL-008: Inbound webhook event deduplication ───────────────────────────────
CREATE TABLE IF NOT EXISTS inbound_webhook_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    VARCHAR(50) NOT NULL,        -- 'META' | 'TWILIO'
  message_id  VARCHAR(512) NOT NULL,
  merchant_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_webhook_dedup
  ON inbound_webhook_events (provider, message_id);

-- ── BL-004: AI call metrics ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_call_metrics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) NOT NULL,
  method_name  VARCHAR(100) NOT NULL,
  merchant_id  UUID,
  outcome      VARCHAR(50) NOT NULL,  -- 'success'|'error'|'budget_exceeded'|'timeout'
  tokens_used  INTEGER,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_merchant
  ON ai_call_metrics (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_service
  ON ai_call_metrics (service_name, created_at DESC);

-- ── BL-009: Scheduled job failure tracking ───────────────────────────────────
CREATE TABLE IF NOT EXISTS job_failure_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name      VARCHAR(100) NOT NULL,
  error_message TEXT,
  error_stack   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_failures_name
  ON job_failure_events (job_name, created_at DESC);
