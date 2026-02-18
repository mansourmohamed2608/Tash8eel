-- Migration: 029_schema_hotfix
-- Description: Add missing columns safely for merchants/catalog/billing/inventory

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
    ALTER TABLE merchants
      ADD COLUMN IF NOT EXISTS whatsapp_reports_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS report_periods_enabled TEXT[] NOT NULL DEFAULT ARRAY['daily'],
      ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS payment_reminders_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS low_stock_alerts_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS auto_response_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS followup_delay_minutes INTEGER DEFAULT 60;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'catalog_items') THEN
    ALTER TABLE catalog_items
      ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;
    CREATE INDEX IF NOT EXISTS idx_catalog_available ON catalog_items(merchant_id, is_available);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_subscriptions') THEN
    ALTER TABLE merchant_subscriptions
      ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_items') THEN
    ALTER TABLE inventory_items
      ADD COLUMN IF NOT EXISTS location VARCHAR(255);
  END IF;
END $$;
