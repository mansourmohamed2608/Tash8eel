-- Migration 102
-- AI routing analytics for inbox routing and cost monitoring.

CREATE TABLE IF NOT EXISTS ai_routing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_name VARCHAR(50),
  message_type VARCHAR(30),
  complexity_score INTEGER,
  routing_decision VARCHAR(30) NOT NULL,
  model_used VARCHAR(30),
  estimated_cost_usd DECIMAL(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_merchant_day
  ON ai_routing_log(merchant_id, DATE_TRUNC('day', created_at));

CREATE INDEX IF NOT EXISTS idx_routing_decision_day
  ON ai_routing_log(routing_decision, DATE_TRUNC('day', created_at));
