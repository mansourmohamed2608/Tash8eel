-- Migration 100
-- Conversation overage billing records.

CREATE TABLE IF NOT EXISTS billing_overages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  billing_period DATE NOT NULL,
  metric_type VARCHAR(50) NOT NULL DEFAULT 'conversations',
  included_amount INTEGER NOT NULL,
  actual_amount INTEGER NOT NULL,
  overage_amount INTEGER NOT NULL,
  rate_per_unit DECIMAL(10,4) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  total_charge DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','invoiced','paid','waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(merchant_id, billing_period, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_overages_merchant_period
  ON billing_overages(merchant_id, billing_period);

CREATE INDEX IF NOT EXISTS idx_overages_status
  ON billing_overages(status)
  WHERE status = 'pending';

ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS overage_rate_aed DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS overage_rate_sar DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS monthly_conversations_included INTEGER;
