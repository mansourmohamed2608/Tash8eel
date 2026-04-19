-- Migration 120: Control-plane operability audit and replay safety hardening
-- Adds atomic replay token consumption ledger and operator triage acknowledgement history

CREATE TABLE IF NOT EXISTS control_plane_replay_token_consumptions (
  id BIGSERIAL PRIMARY KEY,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  source_run_id UUID NOT NULL REFERENCES planner_run_ledger(id) ON DELETE CASCADE,
  replay_run_id UUID REFERENCES planner_run_ledger(id) ON DELETE SET NULL,
  preview_token_hash VARCHAR(64) NOT NULL,
  preview_context_hash VARCHAR(64) NOT NULL,
  operator_note VARCHAR(240) NOT NULL,
  consumed_by VARCHAR(64),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_control_plane_replay_token_consumptions_hash
    UNIQUE (merchant_id, preview_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_cp_replay_consumptions_source_run
  ON control_plane_replay_token_consumptions (merchant_id, source_run_id, consumed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cp_replay_consumptions_replay_run
  ON control_plane_replay_token_consumptions (merchant_id, replay_run_id);

CREATE TABLE IF NOT EXISTS control_plane_triage_acknowledgements (
  id BIGSERIAL PRIMARY KEY,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES planner_run_ledger(id) ON DELETE CASCADE,
  trigger_type VARCHAR(20) NOT NULL,
  trigger_key VARCHAR(120) NOT NULL,
  recommended_action VARCHAR(64) NOT NULL,
  ack_status VARCHAR(20) NOT NULL DEFAULT 'acknowledged' CHECK (
    ack_status IN ('acknowledged', 'deferred')
  ),
  ack_note VARCHAR(240) NOT NULL,
  acked_by VARCHAR(64),
  acked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_triage_ack_run
  ON control_plane_triage_acknowledgements (merchant_id, run_id, acked_at DESC);

CREATE INDEX IF NOT EXISTS idx_cp_triage_ack_trigger
  ON control_plane_triage_acknowledgements (merchant_id, trigger_type, trigger_key, acked_at DESC);

CREATE OR REPLACE FUNCTION update_control_plane_replay_consumptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cp_replay_consumptions_updated ON control_plane_replay_token_consumptions;
CREATE TRIGGER trg_cp_replay_consumptions_updated
BEFORE UPDATE ON control_plane_replay_token_consumptions
FOR EACH ROW
EXECUTE FUNCTION update_control_plane_replay_consumptions_updated_at();

COMMENT ON TABLE control_plane_replay_token_consumptions IS 'Single-use replay preview token consumption ledger with operator note evidence';
COMMENT ON TABLE control_plane_triage_acknowledgements IS 'Operator triage acknowledgement history for control-plane recommended actions';
