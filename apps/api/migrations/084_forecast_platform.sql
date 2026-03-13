-- =============================================================
-- 084 – Advanced Forecasting Platform
-- Shared persistence for all agent forecast types
-- =============================================================

-- ── forecast_runs: one row per (merchant, type, day) ─────────────────────────
CREATE TABLE IF NOT EXISTS forecast_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  forecast_type     TEXT NOT NULL,   -- demand|cashflow|churn|sla_breach|workforce|delivery_eta|campaign_uplift
  status            TEXT NOT NULL DEFAULT 'ok',   -- ok|error|stale
  items_computed    INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER,
  error_message     TEXT,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecast_runs_merchant
  ON forecast_runs (merchant_id, forecast_type, computed_at DESC);

-- ── forecast_predictions: per-item results with confidence bands ──────────────
CREATE TABLE IF NOT EXISTS forecast_predictions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  forecast_type     TEXT NOT NULL,
  entity_id         TEXT NOT NULL,    -- product_id | customer_id | conversation_id | etc.
  entity_name       TEXT,
  horizon_days      INTEGER NOT NULL DEFAULT 7,
  predicted_value   NUMERIC(14,4) NOT NULL,
  lower_bound       NUMERIC(14,4),    -- 95% CI lower
  upper_bound       NUMERIC(14,4),    -- 95% CI upper
  confidence_score  NUMERIC(5,4),     -- 0-1, model confidence
  trend_direction   TEXT,             -- up|down|stable
  reason_codes      JSONB DEFAULT '[]',  -- [{code, label, weight}]
  metadata          JSONB DEFAULT '{}',  -- extra typed fields per forecast type
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecast_predictions_merchant_type
  ON forecast_predictions (merchant_id, forecast_type, entity_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_predictions_type_entity
  ON forecast_predictions (forecast_type, entity_id);

-- ── model_metrics: backtesting results per (merchant, type, model_version) ───
CREATE TABLE IF NOT EXISTS forecast_model_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  forecast_type     TEXT NOT NULL,
  entity_id         TEXT,             -- NULL = aggregate over all items
  model_version     TEXT NOT NULL DEFAULT '1.0',
  mape              NUMERIC(8,4),     -- mean absolute percentage error
  wmape             NUMERIC(8,4),     -- weighted MAPE
  bias              NUMERIC(8,4),     -- systematic over/under prediction
  mae               NUMERIC(14,4),    -- mean absolute error (raw units)
  sample_size       INTEGER,          -- number of actuals used for backtest
  evaluation_window TEXT NOT NULL DEFAULT '30d',
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecast_metrics_merchant
  ON forecast_model_metrics (merchant_id, forecast_type, computed_at DESC);

-- ── demand_forecast_history: historical daily velocity per SKU ────────────────
-- Enriches the base demand_forecasts table with per-day detail
CREATE TABLE IF NOT EXISTS demand_forecast_history (
  merchant_id       VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL,
  sales_date          DATE NOT NULL,
  units_sold          INTEGER NOT NULL DEFAULT 0,
  units_returned      INTEGER NOT NULL DEFAULT 0,
  net_units           INTEGER GENERATED ALWAYS AS (units_sold - units_returned) STORED,
  stockout_day        BOOLEAN NOT NULL DEFAULT false,  -- if product was OOS that day
  promo_active        BOOLEAN NOT NULL DEFAULT false,
  price_on_day        NUMERIC(12,2),
  PRIMARY KEY (merchant_id, product_id, sales_date)
);
CREATE INDEX IF NOT EXISTS idx_dfh_merchant_product
  ON demand_forecast_history (merchant_id, product_id, sales_date DESC);

-- ── Replenishment recommendations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS replenishment_recommendations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL,
  product_name      TEXT,
  supplier_id       UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name     TEXT,
  recommended_qty   INTEGER NOT NULL,
  reorder_point     INTEGER NOT NULL,   -- order when stock hits this
  safety_stock      INTEGER NOT NULL,
  lead_time_days    INTEGER NOT NULL DEFAULT 3,
  est_stockout_date DATE,
  urgency           TEXT NOT NULL DEFAULT 'medium',  -- critical|high|medium|low
  status            TEXT NOT NULL DEFAULT 'pending', -- pending|approved|ordered|dismissed
  approved_by       TEXT,                            -- user who approved
  approved_at       TIMESTAMPTZ,
  po_reference      TEXT,
  notes             TEXT,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_replenishment_merchant
  ON replenishment_recommendations (merchant_id, urgency, status, computed_at DESC);

-- ── what_if_scenarios: saved simulator runs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS what_if_scenarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  scenario_type     TEXT NOT NULL,  -- demand|cashflow|campaign|pricing
  input_params      JSONB NOT NULL DEFAULT '{}',
  result_summary    JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_what_if_merchant
  ON what_if_scenarios (merchant_id, scenario_type, created_at DESC);

-- ── Add lead_time_days to inventory_products if not present ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inventory_products') THEN
    ALTER TABLE inventory_products
      ADD COLUMN IF NOT EXISTS lead_time_days    INTEGER NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS safety_stock_pct  NUMERIC(5,2) NOT NULL DEFAULT 20.0;
  END IF;
END $$;

-- ── Add columns to demand_forecasts for extended fields ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'demand_forecasts') THEN
    ALTER TABLE demand_forecasts
      ADD COLUMN IF NOT EXISTS forecast_14d       INTEGER,
      ADD COLUMN IF NOT EXISTS lower_bound_7d     INTEGER,
      ADD COLUMN IF NOT EXISTS upper_bound_7d     INTEGER,
      ADD COLUMN IF NOT EXISTS lower_bound_30d    INTEGER,
      ADD COLUMN IF NOT EXISTS upper_bound_30d    INTEGER,
      ADD COLUMN IF NOT EXISTS reorder_point      INTEGER,
      ADD COLUMN IF NOT EXISTS safety_stock       INTEGER,
      ADD COLUMN IF NOT EXISTS lead_time_days     INTEGER DEFAULT 3,
      ADD COLUMN IF NOT EXISTS est_stockout_date  DATE,
      ADD COLUMN IF NOT EXISTS mape_7d            NUMERIC(8,4),
      ADD COLUMN IF NOT EXISTS model_version      TEXT DEFAULT '1.0',
      ADD COLUMN IF NOT EXISTS reason_codes       JSONB DEFAULT '[]';
  END IF;
END $$;
