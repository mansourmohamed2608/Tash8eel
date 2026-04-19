-- 069_schema_compat_bridge.sql
-- Purpose: bridge legacy/new schemas so all pages/jobs read/write consistent data.

-- ---------------------------------------------------------------------------
-- Proactive alert config table (safe re-create in case migration 067 was skipped)
-- ---------------------------------------------------------------------------
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

INSERT INTO proactive_alert_configs (
  merchant_id, expiry_threshold_days, cash_flow_forecast_days, demand_spike_multiplier, is_active
)
SELECT 'demo-merchant', 7, 14, 2.00, true
WHERE EXISTS (SELECT 1 FROM merchants WHERE id = 'demo-merchant')
  AND NOT EXISTS (SELECT 1 FROM proactive_alert_configs WHERE merchant_id = 'demo-merchant');

-- ---------------------------------------------------------------------------
-- Orders compatibility: total_amount <-> total
-- ---------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION sync_orders_total_compat()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total := COALESCE(NEW.total, NEW.total_amount, 0);
  NEW.total_amount := COALESCE(NEW.total_amount, NEW.total, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    DROP TRIGGER IF EXISTS trg_sync_orders_total_compat ON orders;
    CREATE TRIGGER trg_sync_orders_total_compat
      BEFORE INSERT OR UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION sync_orders_total_compat();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Expenses compatibility: expense_date/date + status for legacy filters
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expenses') THEN
    ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS date DATE,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'APPROVED';

    UPDATE expenses
    SET expense_date = COALESCE(expense_date, date, CURRENT_DATE),
        date = COALESCE(date, expense_date, CURRENT_DATE),
        status = COALESCE(status, 'APPROVED')
    WHERE expense_date IS NULL OR date IS NULL OR status IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_expenses_date_compat()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expense_date := COALESCE(NEW.expense_date, NEW.date, CURRENT_DATE);
  NEW.date := COALESCE(NEW.date, NEW.expense_date, CURRENT_DATE);
  NEW.status := COALESCE(NEW.status, 'APPROVED');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expenses') THEN
    DROP TRIGGER IF EXISTS trg_sync_expenses_date_compat ON expenses;
    CREATE TRIGGER trg_sync_expenses_date_compat
      BEFORE INSERT OR UPDATE ON expenses
      FOR EACH ROW
      EXECUTE FUNCTION sync_expenses_date_compat();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Merchant plan/entitlement compatibility columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
    ALTER TABLE merchants
      ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'STARTER',
      ADD COLUMN IF NOT EXISTS limits JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS enabled_agents TEXT[] DEFAULT ARRAY[]::text[],
      ADD COLUMN IF NOT EXISTS enabled_features TEXT[] DEFAULT ARRAY[]::text[];

    UPDATE merchants
    SET plan = COALESCE(plan, 'STARTER'),
        limits = COALESCE(limits, '{}'::jsonb),
        enabled_agents = COALESCE(enabled_agents, ARRAY[]::text[]),
        enabled_features = COALESCE(enabled_features, ARRAY[]::text[])
    WHERE plan IS NULL
       OR limits IS NULL
       OR enabled_agents IS NULL
       OR enabled_features IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- order_status enum compatibility (legacy code compares with COMPLETED)
-- ---------------------------------------------------------------------------
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
