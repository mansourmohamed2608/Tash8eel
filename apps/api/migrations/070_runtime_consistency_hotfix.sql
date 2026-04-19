-- 070_runtime_consistency_hotfix.sql
-- Purpose: keep runtime stable on partially migrated databases.

-- Ensure proactive alerts config table exists (safe no-op when already present)
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

-- Ensure shipments can store status description used by delivery poller
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments') THEN
    ALTER TABLE shipments
      ADD COLUMN IF NOT EXISTS status_description TEXT;
  END IF;
END $$;

-- Ensure orders have both amount columns for old/new code paths
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS total NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2);

    UPDATE orders
    SET total = COALESCE(total, total_amount, 0),
        total_amount = COALESCE(total_amount, total, 0)
    WHERE total IS NULL OR total_amount IS NULL;
  END IF;
END $$;

-- Ensure merchant notification contact columns exist (used by onboarding/help status)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
    ALTER TABLE merchants
      ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(30),
      ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255);
  END IF;
END $$;

-- Ensure notification type check accepts system/anomaly alert inserts.
-- Use NOT VALID to avoid migration failures on legacy rows that used custom historic types.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS valid_type;

    ALTER TABLE notifications
      ADD CONSTRAINT valid_type CHECK (
        type IN (
          'ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
          'LOW_STOCK', 'OUT_OF_STOCK',
          'NEW_CONVERSATION', 'ESCALATED_CONVERSATION',
          'PAYMENT_RECEIVED', 'PAYMENT_FAILED',
          'NEW_REVIEW', 'NEW_CUSTOMER',
          'DAILY_SUMMARY', 'WEEKLY_REPORT',
          'PROMOTION_ENDING', 'MILESTONE_REACHED',
          'SYSTEM_ALERT', 'SECURITY_ALERT', 'ANOMALY_ALERT'
        )
      ) NOT VALID;
  END IF;
END $$;

-- order_status enum compatibility for code paths that still compare with COMPLETED.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'order_status' AND e.enumlabel = 'COMPLETED'
    ) THEN
      ALTER TYPE order_status ADD VALUE 'COMPLETED';
    END IF;
  END IF;
END $$;
