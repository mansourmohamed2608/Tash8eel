-- Migration 113: Copilot planner foundations
-- Adds explicit approval lifecycle persistence for pending actions

CREATE TABLE IF NOT EXISTS copilot_action_approvals (
  action_id UUID PRIMARY KEY REFERENCES copilot_pending_actions(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  intent VARCHAR(50) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'portal',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'confirmed',
      'denied',
      'cancelled',
      'expired',
      'executing',
      'executed_success',
      'executed_failed'
    )
  ),
  pending_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  denied_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  executing_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  actor_role VARCHAR(20),
  actor_id VARCHAR(64),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_approvals_merchant_status
  ON copilot_action_approvals (merchant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_approvals_intent
  ON copilot_action_approvals (merchant_id, intent, updated_at DESC);

CREATE OR REPLACE FUNCTION update_copilot_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_copilot_approvals_updated ON copilot_action_approvals;
CREATE TRIGGER trg_copilot_approvals_updated
BEFORE UPDATE ON copilot_action_approvals
FOR EACH ROW
EXECUTE FUNCTION update_copilot_approvals_updated_at();

COMMENT ON TABLE copilot_action_approvals IS 'Timestamped approval and execution lifecycle for copilot pending actions';
