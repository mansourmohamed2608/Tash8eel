-- Migration 067: Proactive alert configuration table
-- Used by ProactiveAlertsSchedulerService for per-merchant thresholds.

CREATE TABLE IF NOT EXISTS proactive_alert_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE UNIQUE,
  expiry_threshold_days INTEGER NOT NULL DEFAULT 7,
  cash_flow_forecast_days INTEGER NOT NULL DEFAULT 14,
  demand_spike_multiplier NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proactive_alert_configs_merchant
  ON proactive_alert_configs(merchant_id);

-- Seed a default row for demo merchant (idempotent)
INSERT INTO proactive_alert_configs (
  merchant_id,
  expiry_threshold_days,
  cash_flow_forecast_days,
  demand_spike_multiplier,
  is_active
)
SELECT 'demo-merchant', 7, 14, 2.00, true
WHERE EXISTS (SELECT 1 FROM merchants WHERE id = 'demo-merchant')
  AND NOT EXISTS (SELECT 1 FROM proactive_alert_configs WHERE merchant_id = 'demo-merchant');
