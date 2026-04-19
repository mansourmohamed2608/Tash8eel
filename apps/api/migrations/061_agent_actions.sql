-- 061: Agent Actions Log
-- Tracks every autonomous decision/action taken by AI agents
-- The merchant can see what each agent did and why

CREATE TABLE IF NOT EXISTS agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  agent_type    VARCHAR(40) NOT NULL,  -- OPS_AGENT, INVENTORY_AGENT, FINANCE_AGENT, etc.
  action_type   VARCHAR(60) NOT NULL,  -- e.g. AUTO_FOLLOWUP, AUTO_RESERVE_STOCK, AUTO_ESCALATE
  severity      VARCHAR(10) NOT NULL DEFAULT 'INFO',  -- INFO, WARNING, ACTION, CRITICAL
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',    -- structured payload (order_id, item_id, amounts, etc.)
  auto_resolved BOOLEAN DEFAULT FALSE, -- did the agent handle it itself?
  merchant_ack  BOOLEAN DEFAULT FALSE, -- did the merchant acknowledge it?
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_actions_merchant ON agent_actions(merchant_id, created_at DESC);
CREATE INDEX idx_agent_actions_type     ON agent_actions(merchant_id, agent_type, created_at DESC);
CREATE INDEX idx_agent_actions_unack    ON agent_actions(merchant_id)
  WHERE merchant_ack = FALSE;
