-- ============================================================
-- 081 - Supplier auto-notify + merchant automations center
-- ============================================================

-- Add auto-notify columns to existing suppliers table
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS whatsapp_phone    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS auto_notify_low_stock BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_threshold  VARCHAR(20) NOT NULL DEFAULT 'critical',
  -- 'critical' | 'warning' | 'all'
  ADD COLUMN IF NOT EXISTS last_auto_notified_at TIMESTAMPTZ;

-- Merchant automations configuration
-- Each row = one automation type for one merchant
CREATE TABLE IF NOT EXISTS merchant_automations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id     VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  automation_type VARCHAR(60) NOT NULL,
  -- SUPPLIER_LOW_STOCK      : daily alert to suppliers when their products are low
  -- REENGAGEMENT_AUTO       : weekly re-engagement campaign to inactive customers
  -- REVIEW_REQUEST          : 24h after delivery, ask customer for review
  -- NEW_CUSTOMER_WELCOME    : after first order, send welcome message
  -- ABANDONED_CART_REMINDER : already handled by followup scheduler, config here
  is_enabled      BOOLEAN NOT NULL DEFAULT false,
  config          JSONB    NOT NULL DEFAULT '{}',
  -- SUPPLIER_LOW_STOCK:  { "threshold": "critical|warning|all", "messageTemplate": "..." }
  -- REENGAGEMENT_AUTO:  { "inactiveDays": 30, "discountCode": "", "messageTemplate": "..." }
  -- REVIEW_REQUEST:     { "delayHours": 24, "messageTemplate": "..." }
  -- NEW_CUSTOMER_WELCOME: { "messageTemplate": "..." }
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, automation_type)
);

CREATE INDEX IF NOT EXISTS idx_merchant_automations_lookup
  ON merchant_automations (merchant_id, automation_type, is_enabled);

-- Track automation run history for display in portal
CREATE TABLE IF NOT EXISTS automation_run_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id     VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  automation_type VARCHAR(60) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success' | 'partial' | 'failed' | 'skipped'
  messages_sent   INTEGER NOT NULL DEFAULT 0,
  targets_found   INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_run_logs_merchant
  ON automation_run_logs (merchant_id, automation_type, run_at DESC);

-- Columns needed by automation scheduler
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_review_requested ON orders (review_requested_at) WHERE review_requested_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_welcome_sent  ON customers (welcome_sent_at) WHERE welcome_sent_at IS NULL;
