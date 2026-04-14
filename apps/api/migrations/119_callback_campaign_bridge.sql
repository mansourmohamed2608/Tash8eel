-- Callback-to-campaign execution bridge with explicit approval and execution ledger

CREATE TABLE IF NOT EXISTS callback_campaign_bridges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(120) NOT NULL,
  approved_by VARCHAR(120),
  executed_by VARCHAR(120),
  approval_note TEXT,
  message_template TEXT NOT NULL,
  discount_code VARCHAR(80),
  inactive_days INTEGER NOT NULL DEFAULT 30,
  callback_due_before TIMESTAMPTZ,
  target_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT callback_campaign_bridges_status_check CHECK (
    status IN ('DRAFT', 'APPROVED', 'EXECUTING', 'EXECUTED', 'CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_callback_campaign_bridges_merchant_status_created
  ON callback_campaign_bridges(merchant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS callback_campaign_bridge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id UUID NOT NULL REFERENCES callback_campaign_bridges(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
  workflow_event_id UUID REFERENCES call_followup_workflow_events(id) ON DELETE SET NULL,
  customer_phone VARCHAR(30) NOT NULL,
  customer_name VARCHAR(255),
  callback_due_at TIMESTAMPTZ,
  sent BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  send_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT callback_campaign_bridge_items_unique_call_per_bridge UNIQUE (bridge_id, call_id)
);

CREATE INDEX IF NOT EXISTS idx_callback_campaign_bridge_items_bridge
  ON callback_campaign_bridge_items(bridge_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_callback_campaign_bridge_items_workflow_event
  ON callback_campaign_bridge_items(workflow_event_id)
  WHERE workflow_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_callback_campaign_bridge_items_merchant_call
  ON callback_campaign_bridge_items(merchant_id, call_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_callback_campaign_bridges_updated_at'
  ) THEN
    CREATE TRIGGER update_callback_campaign_bridges_updated_at
    BEFORE UPDATE ON callback_campaign_bridges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
