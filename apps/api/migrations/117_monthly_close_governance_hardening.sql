-- Migration 117: Monthly close governance hardening
-- Scope:
-- 1) Deterministic monthly close packets (hash + metrics + blockers)
-- 2) Immutable monthly close governance ledger (packet/close/reopen/lock actions)

CREATE TABLE IF NOT EXISTS monthly_close_packets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  snapshot_hash VARCHAR(64) NOT NULL,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, year, month, snapshot_hash)
);

CREATE INDEX IF NOT EXISTS idx_monthly_close_packets_merchant_period
  ON monthly_close_packets (merchant_id, year DESC, month DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS monthly_close_governance_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  close_id UUID REFERENCES monthly_closes(id) ON DELETE SET NULL,
  packet_id UUID REFERENCES monthly_close_packets(id) ON DELETE SET NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  action_type VARCHAR(24) NOT NULL
    CHECK (action_type IN ('PACKET_GENERATED', 'CLOSE', 'REOPEN', 'LOCK')),
  snapshot_hash VARCHAR(64),
  confidence_score INTEGER NOT NULL DEFAULT 0,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approval_granted BOOLEAN NOT NULL DEFAULT false,
  approval_actor VARCHAR(100),
  approval_reason TEXT,
  acted_by VARCHAR(100),
  acted_role VARCHAR(30),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_close_ledger_merchant_period
  ON monthly_close_governance_ledger (merchant_id, year DESC, month DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_close_ledger_close
  ON monthly_close_governance_ledger (close_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_monthly_close_ledger_mutations()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'monthly_close_governance_ledger is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monthly_close_ledger_immutable
  ON monthly_close_governance_ledger;

CREATE TRIGGER trg_monthly_close_ledger_immutable
  BEFORE UPDATE OR DELETE ON monthly_close_governance_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_monthly_close_ledger_mutations();
