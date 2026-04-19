-- ============================================================
-- 082 – Demand Forecasting, Supplier Discovery, Schedule Config
-- ============================================================

-- ── Demand forecast snapshots (computed daily per product) ──────────────────
CREATE TABLE IF NOT EXISTS demand_forecasts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id         UUID NOT NULL,
  product_name       TEXT NOT NULL,
  current_stock      INTEGER NOT NULL DEFAULT 0,
  avg_daily_orders   NUMERIC(10,2) NOT NULL DEFAULT 0,
  days_until_stockout NUMERIC(10,1),          -- NULL = no sales data
  trend_pct          NUMERIC(8,2),            -- +20 = 20% increase vs prev period
  forecast_7d        INTEGER,                 -- predicted units to sell in 7 days
  forecast_30d       INTEGER,
  reorder_suggestion INTEGER,                 -- how many units to order
  urgency            TEXT NOT NULL DEFAULT 'low', -- critical|high|medium|low|ok
  ai_summary_ar      TEXT,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_merchant
  ON demand_forecasts (merchant_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_forecasts_urgency
  ON demand_forecasts (merchant_id, urgency);

-- ── Supplier discovery results (AI + Google Maps suggestions) ───────────────
CREATE TABLE IF NOT EXISTS supplier_discovery_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  query             TEXT NOT NULL,
  results           JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_discovery_merchant
  ON supplier_discovery_results (merchant_id, created_at DESC);

-- ── Supplier ↔ Product linking (expose what already exists) ─────────────────
-- supplier_products already created in migration 047
-- Ensure the table has all needed columns
ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS unit_cost    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS notes        TEXT;

-- Update is_preferred default if column doesn't exist yet (already in 047)
ALTER TABLE supplier_products
  ALTER COLUMN is_preferred SET DEFAULT false;

-- Ensure updated_at exists (already in 047)
-- Skip duplicate unique constraint — idx_supplier_products_unique_lookup already covers this

-- ── Automation schedule: already stored in merchant_automations.config JSONB ─
-- Add check_interval_hours column to avoid full JSONB scan in scheduler
ALTER TABLE merchant_automations
  ADD COLUMN IF NOT EXISTS check_interval_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS last_checked_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchant_automations_due
  ON merchant_automations (is_enabled, last_checked_at)
  WHERE is_enabled = true;
