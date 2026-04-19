-- Patch legacy billing schema to include missing subscription columns

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_subscriptions') THEN
    ALTER TABLE merchant_subscriptions
      ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
