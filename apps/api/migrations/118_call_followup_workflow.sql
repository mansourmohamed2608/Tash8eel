-- Deterministic call supervisor workflow state and immutable transition ledger

CREATE TABLE IF NOT EXISTS call_followup_workflows (
  call_id UUID PRIMARY KEY REFERENCES voice_calls(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  state VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  claimed_by VARCHAR(120),
  assigned_to VARCHAR(120),
  disposition VARCHAR(40),
  resolution_note TEXT,
  callback_due_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT call_followup_workflows_state_check CHECK (
    state IN ('OPEN', 'CLAIMED', 'ASSIGNED', 'RESOLVED')
  ),
  CONSTRAINT call_followup_workflows_disposition_check CHECK (
    disposition IS NULL OR disposition IN (
      'ORDER_CREATED',
      'CALLBACK_REQUESTED',
      'NO_ANSWER',
      'NOT_INTERESTED',
      'ESCALATED'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_call_followup_workflows_merchant_state
  ON call_followup_workflows(merchant_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_followup_workflows_callback_due
  ON call_followup_workflows(merchant_id, callback_due_at)
  WHERE callback_due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS call_followup_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  from_state VARCHAR(20) NOT NULL,
  to_state VARCHAR(20) NOT NULL,
  actor_id VARCHAR(120) NOT NULL,
  claimed_by VARCHAR(120),
  assigned_to VARCHAR(120),
  disposition VARCHAR(40),
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT call_followup_workflow_events_action_check CHECK (
    action IN ('CLAIM', 'ASSIGN', 'RESOLVE')
  ),
  CONSTRAINT call_followup_workflow_events_from_state_check CHECK (
    from_state IN ('OPEN', 'CLAIMED', 'ASSIGNED', 'RESOLVED')
  ),
  CONSTRAINT call_followup_workflow_events_to_state_check CHECK (
    to_state IN ('OPEN', 'CLAIMED', 'ASSIGNED', 'RESOLVED')
  ),
  CONSTRAINT call_followup_workflow_events_disposition_check CHECK (
    disposition IS NULL OR disposition IN (
      'ORDER_CREATED',
      'CALLBACK_REQUESTED',
      'NO_ANSWER',
      'NOT_INTERESTED',
      'ESCALATED'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_call_followup_workflow_events_merchant_created
  ON call_followup_workflow_events(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_followup_workflow_events_call_created
  ON call_followup_workflow_events(call_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_call_followup_workflows_updated_at'
  ) THEN
    CREATE TRIGGER update_call_followup_workflows_updated_at
    BEFORE UPDATE ON call_followup_workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
