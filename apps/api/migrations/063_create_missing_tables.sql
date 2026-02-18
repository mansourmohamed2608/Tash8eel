-- Migration 063: Create 9 missing tables that exist in migration files but weren't applied
-- Tables from migrations 046, 047, 048 that are missing from Neon DB

-- 1. objection_templates (from 046)
CREATE TABLE IF NOT EXISTS objection_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  objection_type VARCHAR(50) NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  response_template_ar TEXT NOT NULL,
  response_template_en TEXT,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  success_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, objection_type)
);

-- 2. recovered_carts (from 046)
CREATE TABLE IF NOT EXISTS recovered_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  followup_sent_at TIMESTAMPTZ NOT NULL,
  order_created_at TIMESTAMPTZ,
  cart_value NUMERIC(10,2) NOT NULL,
  order_value NUMERIC(10,2),
  recovery_window_hours INTEGER DEFAULT 48,
  is_recovered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recovered_carts_merchant ON recovered_carts(merchant_id, is_recovered);
CREATE INDEX IF NOT EXISTS idx_recovered_carts_date ON recovered_carts(merchant_id, created_at);

-- 3. cod_collections (from 046)
CREATE TABLE IF NOT EXISTS cod_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  expected_amount NUMERIC(10,2) NOT NULL,
  collected_amount NUMERIC(10,2),
  collection_date DATE,
  collector_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cod_collections_merchant ON cod_collections(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_cod_collections_date ON cod_collections(merchant_id, collection_date);

-- 4. finance_snapshots (from 046)
CREATE TABLE IF NOT EXISTS finance_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  total_cogs NUMERIC(12,2) DEFAULT 0,
  gross_profit NUMERIC(12,2) DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  avg_order_value NUMERIC(10,2) DEFAULT 0,
  cod_expected NUMERIC(12,2) DEFAULT 0,
  cod_collected NUMERIC(12,2) DEFAULT 0,
  delivery_fees_collected NUMERIC(10,2) DEFAULT 0,
  refunds_total NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_finance_snapshots_merchant ON finance_snapshots(merchant_id, snapshot_date);

-- 5. margin_alerts (from 046)
CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  threshold_value NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, alert_type)
);

-- 6. finance_insights (from 046)
CREATE TABLE IF NOT EXISTS finance_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  body_ar TEXT NOT NULL,
  body_en TEXT,
  actions JSONB DEFAULT '[]',
  severity VARCHAR(20) DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_insights_merchant ON finance_insights(merchant_id, created_at DESC);

-- 7. substitution_suggestions (from 046)
CREATE TABLE IF NOT EXISTS substitution_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
  original_product_id VARCHAR(100) NOT NULL,
  original_sku VARCHAR(100),
  suggested_products JSONB NOT NULL,
  customer_message_ar TEXT,
  customer_accepted BOOLEAN,
  accepted_product_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_substitution_suggestions_merchant ON substitution_suggestions(merchant_id, created_at DESC);

-- 8. ocr_verification_rules (from 047)
CREATE TABLE IF NOT EXISTS ocr_verification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE CASCADE,
  payment_method VARCHAR(30) NOT NULL,
  rule_name VARCHAR(100) NOT NULL,
  patterns JSONB NOT NULL,
  validation_fields TEXT[] DEFAULT '{}',
  confidence_threshold NUMERIC(3,2) DEFAULT 0.80,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ocr_verification_rules_unique
  ON ocr_verification_rules (COALESCE(merchant_id, 'global'), payment_method, rule_name);

-- 9. copilot_pending_actions (from 048)
CREATE TABLE IF NOT EXISTS copilot_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  intent VARCHAR(50) NOT NULL,
  command JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  source VARCHAR(20) DEFAULT 'portal' CHECK (source IN ('portal', 'whatsapp')),
  execution_result JSONB
);
CREATE INDEX IF NOT EXISTS idx_copilot_pending_merchant ON copilot_pending_actions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_copilot_pending_status ON copilot_pending_actions(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_copilot_pending_expires ON copilot_pending_actions(expires_at) WHERE status = 'pending';
