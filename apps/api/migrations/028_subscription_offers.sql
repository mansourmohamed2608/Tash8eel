-- Subscription offers/promotions (admin-managed)

CREATE TABLE IF NOT EXISTS subscription_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  description_ar TEXT,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'PERCENT', -- PERCENT | AMOUNT
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'EGP',
  applies_to_plan VARCHAR(50), -- optional plan code
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_offers_active ON subscription_offers(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_subscription_offers_plan ON subscription_offers(applies_to_plan);

CREATE OR REPLACE FUNCTION update_subscription_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscription_offers_updated_at ON subscription_offers;
CREATE TRIGGER trg_subscription_offers_updated_at
  BEFORE UPDATE ON subscription_offers
  FOR EACH ROW EXECUTE PROCEDURE update_subscription_offers_updated_at();
