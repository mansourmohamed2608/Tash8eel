-- Migration 046: Ops Agent Premium + Finance Agent Features
-- Lead Scoring, NBA, Address Confidence, Order Confirmation, Recovered Carts
-- COD Reconciliation, Expenses, COGS, Finance Analytics

-- ============================================================================
-- PHASE 1: OPS AGENT ENHANCEMENTS
-- ============================================================================

-- Add lead scoring and NBA fields to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS lead_score VARCHAR(10) DEFAULT NULL, -- 'HOT', 'WARM', 'COLD'
  ADD COLUMN IF NOT EXISTS lead_score_signals JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nba_text TEXT DEFAULT NULL, -- Next Best Action recommendation
  ADD COLUMN IF NOT EXISTS nba_type VARCHAR(50) DEFAULT NULL, -- followup, ask_info, offer_bundle, takeover
  ADD COLUMN IF NOT EXISTS address_confidence INTEGER DEFAULT NULL, -- 0-100 score
  ADD COLUMN IF NOT EXISTS address_missing_fields TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS objection_type VARCHAR(50) DEFAULT NULL, -- price, trust, product, delivery, thinking
  ADD COLUMN IF NOT EXISTS requires_confirmation BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovered_from_followup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_followup_id VARCHAR(100) DEFAULT NULL;

-- Index for lead score filtering
CREATE INDEX IF NOT EXISTS idx_conversations_lead_score ON conversations(merchant_id, lead_score) WHERE lead_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_address_confidence ON conversations(merchant_id, address_confidence) WHERE address_confidence IS NOT NULL AND address_confidence < 60;

-- Objection handling templates
CREATE TABLE IF NOT EXISTS objection_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  objection_type VARCHAR(50) NOT NULL, -- 'expensive', 'trust', 'product_quality', 'delivery_cost', 'thinking'
  keywords TEXT[] NOT NULL DEFAULT '{}', -- Arabic keywords to match
  response_template_ar TEXT NOT NULL,
  response_template_en TEXT,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  success_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, objection_type)
);

-- Insert default objection templates (global defaults)
WITH default_templates (objection_type, keywords, response_template_ar, response_template_en, is_active) AS (
  VALUES
    ('expensive', ARRAY['غالي', 'غاليه', 'سعر عالي', 'مكلف'],
     'أفهم تماماً! السعر يشمل {value_points}. ممكن نشوف عرض مناسب ليك؟',
     'I understand! The price includes {value_points}. Can we find a suitable offer for you?', true),
    ('trust', ARRAY['مش واثق', 'خايف', 'أول مرة', 'ازاي اضمن'],
     'طبيعي تحب تتأكد! عندنا {trust_signals} و{return_policy}. تحب تشوف تقييمات العملاء؟',
     'It''s natural to want to be sure! We have {trust_signals} and {return_policy}. Would you like to see customer reviews?', true),
    ('product_quality', ARRAY['مش عاجبني', 'مش حلو', 'في أحسن', 'جودة'],
     'تمام خالص! ممكن أقترح عليك {alternatives} في نفس الفئة. تحب تشوفهم؟',
     'Absolutely! Let me suggest {alternatives} in the same category. Would you like to see them?', true),
    ('delivery_cost', ARRAY['توصيل غالي', 'الشحن', 'رسوم التوصيل'],
     'فاهم! لو الطلب يوصل {free_delivery_threshold} التوصيل ببلاش. تحب تضيف حاجة تانية؟',
     'I understand! If your order reaches {free_delivery_threshold}, delivery is free. Want to add something else?', true),
    ('thinking', ARRAY['هفكر', 'محتاج وقت', 'مش دلوقتي', 'بعدين'],
     'تمام! خد وقتك. تحب أبعتلك تذكير كمان {followup_hours} ساعات؟',
     'Sure! Take your time. Would you like me to send a reminder in {followup_hours} hours?', true)
)
INSERT INTO objection_templates (
  merchant_id,
  objection_type,
  keywords,
  response_template_ar,
  response_template_en,
  is_active
)
SELECT
  'demo-merchant',
  t.objection_type,
  t.keywords,
  t.response_template_ar,
  t.response_template_en,
  t.is_active
FROM default_templates t
WHERE EXISTS (
  SELECT 1 FROM merchants m WHERE m.id = 'demo-merchant'
)
ON CONFLICT (merchant_id, objection_type) DO NOTHING;

-- Recovered carts tracking
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

-- ============================================================================
-- PHASE 3: FINANCE AGENT TABLES
-- ============================================================================

-- Cost of Goods Sold (COGS) per product
CREATE TABLE IF NOT EXISTS product_cogs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id VARCHAR(100) NOT NULL,
  sku VARCHAR(100),
  cost NUMERIC(10,2) NOT NULL, -- Purchase cost
  currency VARCHAR(3) DEFAULT 'EGP',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, product_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_product_cogs_merchant ON product_cogs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_product_cogs_product ON product_cogs(merchant_id, product_id);

-- Expenses tracking
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL, -- 'rent', 'salaries', 'ads', 'delivery', 'utilities', 'other'
  description TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EGP',
  frequency VARCHAR(20) DEFAULT 'one_time', -- 'one_time', 'daily', 'weekly', 'monthly'
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(merchant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(merchant_id, category);

-- COD collections tracking
CREATE TABLE IF NOT EXISTS cod_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  expected_amount NUMERIC(10,2) NOT NULL,
  collected_amount NUMERIC(10,2),
  collection_date DATE,
  collector_name VARCHAR(100), -- Driver name or collector
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'collected', 'partial', 'failed'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_collections_merchant ON cod_collections(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_cod_collections_date ON cod_collections(merchant_id, collection_date);

-- Finance snapshots (daily aggregates for reporting)
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

-- Margin alerts configuration
CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- 'low_margin_sku', 'low_margin_category', 'spending_exceeds_revenue', 'cod_gap'
  threshold_value NUMERIC(10,2), -- Percentage or amount depending on type
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, alert_type)
);

-- AI-generated finance insights
CREATE TABLE IF NOT EXISTS finance_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL, -- 'anomaly', 'cfo_brief', 'recommendation'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  body_ar TEXT NOT NULL,
  body_en TEXT,
  actions JSONB DEFAULT '[]', -- Array of recommended actions
  severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'critical'
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_insights_merchant ON finance_insights(merchant_id, created_at DESC);

-- ============================================================================
-- INVENTORY ENHANCEMENTS (Phase 2)
-- ============================================================================

-- Dead stock tracking
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS last_sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS days_without_sale INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_dead_stock BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_promo JSONB DEFAULT NULL;

-- Substitution suggestions log
CREATE TABLE IF NOT EXISTS substitution_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
  original_product_id VARCHAR(100) NOT NULL,
  original_sku VARCHAR(100),
  suggested_products JSONB NOT NULL, -- Array of {productId, sku, name, rank, reason}
  customer_message_ar TEXT,
  customer_accepted BOOLEAN,
  accepted_product_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_substitution_suggestions_merchant ON substitution_suggestions(merchant_id, created_at DESC);

-- Inventory movement analytics (for charts)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id VARCHAR(100) NOT NULL,
  sku VARCHAR(100),
  movement_type VARCHAR(30) NOT NULL, -- 'sale', 'adjustment', 'return', 'shrinkage', 'restock'
  quantity INTEGER NOT NULL,
  previous_quantity INTEGER,
  new_quantity INTEGER,
  reason TEXT,
  reference_id VARCHAR(100), -- Order ID or adjustment ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant ON inventory_movements(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(merchant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(merchant_id, movement_type);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update dead stock status
CREATE OR REPLACE FUNCTION update_dead_stock_status() 
RETURNS void AS $$
BEGIN
  UPDATE inventory_items
  SET 
    days_without_sale = COALESCE(
      EXTRACT(DAY FROM (NOW() - last_sold_at))::INTEGER,
      EXTRACT(DAY FROM (NOW() - created_at))::INTEGER
    ),
    is_dead_stock = CASE 
      WHEN last_sold_at IS NULL AND created_at < NOW() - INTERVAL '30 days' THEN true
      WHEN last_sold_at < NOW() - INTERVAL '30 days' THEN true
      ELSE false
    END,
    updated_at = NOW()
  WHERE quantity_available > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate recovered cart
CREATE OR REPLACE FUNCTION check_recovered_cart()
RETURNS TRIGGER AS $$
BEGIN
  -- When an order is created, check if it came from a followup conversation
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE recovered_carts
    SET 
      is_recovered = true,
      order_id = NEW.id,
      order_created_at = NEW.created_at,
      order_value = NEW.total
    WHERE conversation_id = NEW.conversation_id
      AND is_recovered = false
      AND followup_sent_at > NOW() - INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for recovered carts
DROP TRIGGER IF EXISTS trg_check_recovered_cart ON orders;
CREATE TRIGGER trg_check_recovered_cart
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION check_recovered_cart();

-- Grant permissions (if using roles)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO operations_api;

COMMENT ON TABLE objection_templates IS 'Templates for handling common customer objections with success tracking';
COMMENT ON TABLE recovered_carts IS 'Tracks carts recovered through followup messages for KPI reporting';
COMMENT ON TABLE product_cogs IS 'Cost of Goods Sold for profit margin calculations';
COMMENT ON TABLE expenses IS 'Business expenses for net profit calculations';
COMMENT ON TABLE cod_collections IS 'Cash on Delivery collection tracking';
COMMENT ON TABLE finance_snapshots IS 'Daily financial aggregates for reporting';
COMMENT ON TABLE finance_insights IS 'AI-generated financial insights and recommendations';
COMMENT ON TABLE substitution_suggestions IS 'Log of AI-generated product substitution suggestions';
COMMENT ON TABLE inventory_movements IS 'Detailed inventory movement history for analytics';
