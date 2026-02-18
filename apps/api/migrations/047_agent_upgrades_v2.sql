-- Migration 047: High-Impact Agent-Level Upgrades
-- OPS: VIP tagging, one-click reorder, return-risk scoring
-- INVENTORY: Supplier CSV import, shrinkage tracking, top movers
-- FINANCE: COD statement import, collection reminders, expense categories, accountant pack
-- PAYMENT: Payment link payout details, proof request prompts

-- ============================================================================
-- OPS AGENT UPGRADES
-- ============================================================================

-- VIP customer tags (manual + rule-based auto)
CREATE TABLE IF NOT EXISTS customer_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id VARCHAR(100) NOT NULL,
  tag VARCHAR(50) NOT NULL, -- 'VIP', 'BLACKLIST', 'WHOLESALE', 'INFLUENCER', 'RETURNING'
  source VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'manual', 'auto_rule'
  rule_id UUID REFERENCES vip_rules(id) ON DELETE SET NULL,
  created_by VARCHAR(100),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, customer_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_customer_tags_lookup ON customer_tags(merchant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tag ON customer_tags(merchant_id, tag);

-- VIP auto-tagging rules
CREATE TABLE IF NOT EXISTS vip_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  tag_to_apply VARCHAR(50) NOT NULL DEFAULT 'VIP',
  conditions JSONB NOT NULL, -- {minOrders: 5, minSpent: 5000, minAvgOrderValue: 500, withinDays: 90}
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default VIP rules
INSERT INTO vip_rules (id, merchant_id, name, tag_to_apply, conditions, is_active, priority) VALUES
  (uuid_generate_v4(), 'demo-merchant', 'High Spender VIP', 'VIP', '{"minOrders": 3, "minSpent": 5000, "withinDays": 90}', true, 10),
  (uuid_generate_v4(), 'demo-merchant', 'Frequent Buyer', 'LOYAL', '{"minOrders": 5, "withinDays": 60}', true, 5),
  (uuid_generate_v4(), 'demo-merchant', 'Wholesale Customer', 'WHOLESALE', '{"minAvgOrderValue": 2000, "minOrders": 2}', true, 8)
ON CONFLICT DO NOTHING;

-- Customer order history for quick reorder
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_order_items JSONB DEFAULT '[]', -- [{sku, name, qty, price}]
  ADD COLUMN IF NOT EXISTS favorite_items JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS reorder_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_status VARCHAR(20) DEFAULT NULL, -- cached VIP status
  ADD COLUMN IF NOT EXISTS vip_since TIMESTAMPTZ DEFAULT NULL;

-- Return risk scoring
CREATE TABLE IF NOT EXISTS customer_risk_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id VARCHAR(100) NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0, -- 0-100, higher = more risky
  risk_factors JSONB DEFAULT '{}', -- {failedDeliveries: 2, refusals: 1, addressConfidence: 45, returns: 1}
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_risk_scores ON customer_risk_scores(merchant_id, risk_score DESC);

-- Delivery outcomes for risk calculation
CREATE TABLE IF NOT EXISTS delivery_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id VARCHAR(100) NOT NULL,
  outcome VARCHAR(30) NOT NULL, -- 'delivered', 'refused', 'failed_address', 'failed_no_answer', 'returned'
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_delivery_outcomes_customer ON delivery_outcomes(merchant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_outcomes_order ON delivery_outcomes(order_id);

-- ============================================================================
-- INVENTORY AGENT UPGRADES
-- ============================================================================

-- Supplier management
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(100),
  address TEXT,
  payment_terms VARCHAR(50), -- 'COD', 'NET30', 'PREPAID'
  lead_time_days INTEGER DEFAULT 7,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_merchant ON suppliers(merchant_id, is_active);

-- Supplier product mapping with cost tracking
CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES inventory_variants(id) ON DELETE SET NULL,
  supplier_sku VARCHAR(100),
  supplier_name VARCHAR(200),
  cost_price NUMERIC(10,2) NOT NULL,
  min_order_qty INTEGER DEFAULT 1,
  is_preferred BOOLEAN DEFAULT false,
  last_order_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_products_unique_lookup
  ON supplier_products (
    merchant_id,
    supplier_id,
    COALESCE(variant_id::text, inventory_item_id::text, supplier_sku)
  );

-- Supplier CSV import logs
CREATE TABLE IF NOT EXISTS supplier_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  import_type VARCHAR(30) NOT NULL, -- 'catalog', 'stock_update', 'price_update'
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_success INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  imported_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shrinkage tracking (expected vs actual)
CREATE TABLE IF NOT EXISTS shrinkage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES inventory_variants(id) ON DELETE SET NULL,
  sku VARCHAR(100),
  product_name VARCHAR(200),
  expected_qty INTEGER NOT NULL,
  actual_qty INTEGER NOT NULL,
  shrinkage_qty INTEGER GENERATED ALWAYS AS (expected_qty - actual_qty) STORED,
  shrinkage_value NUMERIC(10,2), -- cost * shrinkage_qty
  reason VARCHAR(50), -- 'damaged', 'expired', 'theft', 'counting_error', 'unknown'
  notes TEXT,
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shrinkage_merchant ON shrinkage_records(merchant_id, audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_shrinkage_variant ON shrinkage_records(variant_id);

-- Top movers report cache
CREATE TABLE IF NOT EXISTS inventory_top_movers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  period VARCHAR(20) NOT NULL, -- 'day', 'week', 'month'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  top_sellers JSONB DEFAULT '[]', -- [{sku, name, qty_sold, revenue}]
  slow_movers JSONB DEFAULT '[]', -- [{sku, name, days_no_sale, qty_on_hand}]
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, period, period_start)
);

-- ============================================================================
-- FINANCE AGENT UPGRADES
-- ============================================================================

-- Courier COD statement imports
CREATE TABLE IF NOT EXISTS cod_statement_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  courier_name VARCHAR(100) NOT NULL, -- 'aramex', 'bosta', 'mylerz', 'other'
  filename VARCHAR(255) NOT NULL,
  statement_date DATE NOT NULL,
  total_orders INTEGER DEFAULT 0,
  total_collected NUMERIC(12,2) DEFAULT 0,
  total_fees NUMERIC(10,2) DEFAULT 0,
  net_amount NUMERIC(12,2) DEFAULT 0,
  matched_orders INTEGER DEFAULT 0,
  unmatched_orders INTEGER DEFAULT 0,
  discrepancies JSONB DEFAULT '[]', -- [{orderNumber, expected, reported, diff}]
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'reconciled', 'disputed'
  reconciled_at TIMESTAMPTZ,
  imported_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_statements_merchant ON cod_statement_imports(merchant_id, statement_date DESC);

-- COD statement line items
CREATE TABLE IF NOT EXISTS cod_statement_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id UUID NOT NULL REFERENCES cod_statement_imports(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL,
  tracking_number VARCHAR(100),
  order_number VARCHAR(100),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_name VARCHAR(200),
  collected_amount NUMERIC(10,2),
  delivery_fee NUMERIC(10,2),
  cod_fee NUMERIC(10,2),
  net_amount NUMERIC(10,2),
  delivery_date DATE,
  status VARCHAR(30), -- 'delivered', 'returned', 'in_transit'
  match_status VARCHAR(20) DEFAULT 'pending', -- 'matched', 'unmatched', 'discrepancy'
  our_amount NUMERIC(10,2), -- What we expected
  discrepancy_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_lines_statement ON cod_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_cod_lines_order ON cod_statement_lines(order_id);

-- COD collection reminders
CREATE TABLE IF NOT EXISTS cod_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id VARCHAR(100),
  customer_phone VARCHAR(50),
  amount_due NUMERIC(10,2) NOT NULL,
  reminder_type VARCHAR(30) NOT NULL, -- 'first_reminder', 'second_reminder', 'final_notice'
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'cancelled', 'collected'
  message_template VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_reminders_pending ON cod_reminders(merchant_id, status, scheduled_at) WHERE status = 'pending';

-- Expense categories (extended from expenses table)
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_day INTEGER, -- Day of month for recurring
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Monthly close records
CREATE TABLE IF NOT EXISTS monthly_closes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL, -- 1-12
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Revenue
  total_revenue NUMERIC(12,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  cancelled_orders INTEGER DEFAULT 0,
  
  -- COGS & Gross Profit
  total_cogs NUMERIC(12,2) DEFAULT 0,
  gross_profit NUMERIC(12,2) DEFAULT 0,
  gross_margin_pct NUMERIC(5,2) DEFAULT 0,
  
  -- Expenses by category
  expenses_breakdown JSONB DEFAULT '{}', -- {rent: 5000, salaries: 20000, ads: 3000, ...}
  total_expenses NUMERIC(12,2) DEFAULT 0,
  
  -- Net
  net_profit NUMERIC(12,2) DEFAULT 0,
  net_margin_pct NUMERIC(5,2) DEFAULT 0,
  
  -- COD
  cod_expected NUMERIC(12,2) DEFAULT 0,
  cod_collected NUMERIC(12,2) DEFAULT 0,
  cod_outstanding NUMERIC(12,2) DEFAULT 0,
  
  -- Refunds
  total_refunds NUMERIC(10,2) DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'closed', 'locked'
  closed_at TIMESTAMPTZ,
  closed_by VARCHAR(100),
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_closes ON monthly_closes(merchant_id, year DESC, month DESC);

-- Accountant pack exports
CREATE TABLE IF NOT EXISTS accountant_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  export_type VARCHAR(30) NOT NULL, -- 'monthly', 'quarterly', 'annual', 'custom'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  includes JSONB DEFAULT '[]', -- ['orders', 'expenses', 'cod_reconciliation', 'inventory_movements']
  csv_url TEXT,
  pdf_url TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by VARCHAR(100),
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PAYMENT FLOW UPGRADES
-- ============================================================================

-- Merchant payout details for payment link page
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS payout_instapay_alias VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payout_vodafone_cash VARCHAR(20),
  ADD COLUMN IF NOT EXISTS payout_bank_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payout_bank_account VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payout_bank_iban VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payout_preferred_method VARCHAR(30) DEFAULT 'INSTAPAY'; -- 'INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER'

-- Payment proof request tracking
CREATE TABLE IF NOT EXISTS proof_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  payment_link_id UUID REFERENCES payment_links(id) ON DELETE SET NULL,
  customer_phone VARCHAR(50),
  amount NUMERIC(10,2),
  payment_method VARCHAR(30), -- 'INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER'
  message_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proof_received_at TIMESTAMPTZ,
  proof_id UUID REFERENCES payment_proofs(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'awaiting', -- 'awaiting', 'received', 'expired'
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_requests_awaiting ON proof_requests(merchant_id, status) WHERE status = 'awaiting';

-- OCR verification rules by payment method
CREATE TABLE IF NOT EXISTS ocr_verification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE CASCADE, -- NULL = global rule
  payment_method VARCHAR(30) NOT NULL, -- 'INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER'
  rule_name VARCHAR(100) NOT NULL,
  patterns JSONB NOT NULL, -- {amountPattern: "...", referencePattern: "...", receiverPattern: "..."}
  validation_fields TEXT[] DEFAULT '{}', -- ['amount', 'reference', 'receiver', 'date']
  confidence_threshold NUMERIC(3,2) DEFAULT 0.80,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ocr_verification_rules_unique_lookup
  ON ocr_verification_rules (
    COALESCE(merchant_id, 'global'),
    payment_method,
    rule_name
  );

-- Insert default OCR rules for Egypt payment methods
INSERT INTO ocr_verification_rules (merchant_id, payment_method, rule_name, patterns, validation_fields, is_active) VALUES
  (NULL, 'INSTAPAY', 'InstaPay Standard', 
   '{"amountPattern": "(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)\\s*(EGP|ج\\.م|جنيه)", "referencePattern": "(?:Ref|Reference|رقم العملية)[:\\s]*(\\w+)", "receiverPattern": "(?:To|إلى|المستلم)[:\\s]*([^\\n]+)"}',
   ARRAY['amount', 'reference', 'receiver'], true),
  (NULL, 'VODAFONE_CASH', 'Vodafone Cash Standard',
   '{"amountPattern": "(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)\\s*(EGP|ج\\.م|جنيه)", "referencePattern": "(?:Transaction|معاملة|رقم)[:\\s]*(\\d+)", "receiverPattern": "(?:To|إلى)[:\\s]*(01[0-9]{9})"}',
   ARRAY['amount', 'reference'], true),
  (NULL, 'BANK_TRANSFER', 'Bank Transfer Standard',
   '{"amountPattern": "(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)\\s*(EGP|ج\\.م|جنيه)", "referencePattern": "(?:Ref|Reference|مرجع)[:\\s]*(\\w+)", "ibanPattern": "(EG\\d{27})"}',
   ARRAY['amount', 'reference'], true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ENTITLEMENTS UPDATE
-- ============================================================================

-- Add new features to entitlement checks
-- VIP tagging, reorder, return-risk = Pro+ (growth and above)
-- Supplier import, shrinkage = Growth+
-- COD reconciliation, accountant pack = Pro+

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entitlement_features') THEN
    -- Update default tier features (run after migration)
    UPDATE entitlement_features SET is_active = true WHERE feature_key IN (
      'vip_tagging', 'one_click_reorder', 'return_risk_scoring',
      'supplier_import', 'shrinkage_reports', 'top_movers',
      'cod_reconciliation', 'expense_tracking', 'monthly_close', 'accountant_export'
    );

    -- Insert new feature definitions if not exists
    INSERT INTO entitlement_features (feature_key, name, description, tier_required, is_active) VALUES
      ('vip_tagging', 'VIP Customer Tagging', 'Manual and auto-rule VIP customer tagging', 'GROWTH', true),
      ('one_click_reorder', 'One-Click Reorder', 'Quick reorder for repeat customers', 'GROWTH', true),
      ('return_risk_scoring', 'Return Risk Scoring', 'AI-based delivery risk assessment', 'PRO', true),
      ('supplier_import', 'Supplier CSV Import', 'Bulk import from supplier catalogs', 'GROWTH', true),
      ('shrinkage_reports', 'Shrinkage Reports', 'Expected vs actual inventory tracking', 'GROWTH', true),
      ('top_movers', 'Top Movers Analytics', 'Best and slow selling items report', 'STARTER', true),
      ('cod_reconciliation', 'COD Statement Reconciliation', 'Courier COD statement import and matching', 'GROWTH', true),
      ('expense_tracking', 'Expense Categories', 'Detailed expense tracking and categorization', 'STARTER', true),
      ('monthly_close', 'Monthly Close Reports', 'Automated monthly financial close', 'GROWTH', true),
      ('accountant_export', 'Accountant Pack Export', 'CSV + PDF export for accountants', 'PRO', true)
    ON CONFLICT (feature_key) DO UPDATE SET
      tier_required = EXCLUDED.tier_required,
      is_active = EXCLUDED.is_active;
  END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate customer risk score
CREATE OR REPLACE FUNCTION calculate_customer_risk_score(p_merchant_id VARCHAR, p_customer_id VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  v_failed_deliveries INTEGER;
  v_refusals INTEGER;
  v_returns INTEGER;
  v_avg_address_confidence INTEGER;
  v_risk_score INTEGER;
BEGIN
  -- Count failed deliveries
  SELECT COUNT(*) INTO v_failed_deliveries
  FROM delivery_outcomes
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id 
    AND outcome IN ('failed_address', 'failed_no_answer');
    
  -- Count refusals
  SELECT COUNT(*) INTO v_refusals
  FROM delivery_outcomes
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id 
    AND outcome = 'refused';
    
  -- Count returns
  SELECT COUNT(*) INTO v_returns
  FROM delivery_outcomes
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id 
    AND outcome = 'returned';
    
  -- Get average address confidence from conversations
  SELECT COALESCE(AVG(address_confidence), 100)::INTEGER INTO v_avg_address_confidence
  FROM conversations
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id
    AND address_confidence IS NOT NULL;
  
  -- Calculate risk score (0-100)
  -- Base score from address confidence (inverted: low confidence = high risk)
  v_risk_score := GREATEST(0, 100 - v_avg_address_confidence);
  
  -- Add points for negative outcomes
  v_risk_score := v_risk_score + (v_failed_deliveries * 15);
  v_risk_score := v_risk_score + (v_refusals * 25);
  v_risk_score := v_risk_score + (v_returns * 10);
  
  -- Cap at 100
  v_risk_score := LEAST(100, v_risk_score);
  
  -- Upsert risk score
  INSERT INTO customer_risk_scores (merchant_id, customer_id, risk_score, risk_factors, last_calculated_at)
  VALUES (
    p_merchant_id, 
    p_customer_id, 
    v_risk_score,
    jsonb_build_object(
      'failedDeliveries', v_failed_deliveries,
      'refusals', v_refusals,
      'returns', v_returns,
      'avgAddressConfidence', v_avg_address_confidence
    ),
    NOW()
  )
  ON CONFLICT (merchant_id, customer_id) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    risk_factors = EXCLUDED.risk_factors,
    last_calculated_at = NOW(),
    updated_at = NOW();
    
  RETURN v_risk_score;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-apply VIP tags based on rules
CREATE OR REPLACE FUNCTION apply_vip_rules(p_merchant_id VARCHAR, p_customer_id VARCHAR)
RETURNS TEXT AS $$
DECLARE
  v_rule RECORD;
  v_customer_stats RECORD;
  v_applied_tag TEXT := NULL;
BEGIN
  -- Get customer stats
  SELECT 
    COUNT(*) as order_count,
    COALESCE(SUM(total), 0) as total_spent,
    COALESCE(AVG(total), 0) as avg_order_value,
    MIN(created_at) as first_order,
    MAX(created_at) as last_order
  INTO v_customer_stats
  FROM orders
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id
    AND status NOT IN ('CANCELLED', 'REJECTED');
  
  -- Check each active rule in priority order
  FOR v_rule IN 
    SELECT * FROM vip_rules 
    WHERE merchant_id = p_merchant_id AND is_active = true
    ORDER BY priority DESC
  LOOP
    -- Check conditions
    IF (v_rule.conditions->>'minOrders' IS NULL OR v_customer_stats.order_count >= (v_rule.conditions->>'minOrders')::INTEGER)
       AND (v_rule.conditions->>'minSpent' IS NULL OR v_customer_stats.total_spent >= (v_rule.conditions->>'minSpent')::NUMERIC)
       AND (v_rule.conditions->>'minAvgOrderValue' IS NULL OR v_customer_stats.avg_order_value >= (v_rule.conditions->>'minAvgOrderValue')::NUMERIC)
       AND (v_rule.conditions->>'withinDays' IS NULL OR v_customer_stats.last_order >= NOW() - ((v_rule.conditions->>'withinDays')::INTEGER || ' days')::INTERVAL)
    THEN
      -- Apply tag
      INSERT INTO customer_tags (merchant_id, customer_id, tag, source, rule_id)
      VALUES (p_merchant_id, p_customer_id, v_rule.tag_to_apply, 'auto_rule', v_rule.id)
      ON CONFLICT (merchant_id, customer_id, tag) DO NOTHING;
      
      v_applied_tag := v_rule.tag_to_apply;
      
      -- Update customer VIP status cache
      IF v_rule.tag_to_apply = 'VIP' THEN
        UPDATE customers 
        SET vip_status = 'VIP', vip_since = COALESCE(vip_since, NOW())
        WHERE merchant_id = p_merchant_id AND id = p_customer_id;
      END IF;
      
      EXIT; -- Apply highest priority rule only
    END IF;
  END LOOP;
  
  RETURN v_applied_tag;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE customer_tags IS 'Manual and auto-rule based customer tags (VIP, WHOLESALE, etc.)';
COMMENT ON TABLE vip_rules IS 'Rules for automatic VIP tagging based on order history';
COMMENT ON TABLE customer_risk_scores IS 'Return/delivery risk scores based on customer history';
COMMENT ON TABLE delivery_outcomes IS 'Tracks delivery success/failure for risk scoring';
COMMENT ON TABLE suppliers IS 'Supplier master data for inventory management';
COMMENT ON TABLE supplier_products IS 'Product-supplier mapping with cost prices';
COMMENT ON TABLE supplier_imports IS 'Log of supplier CSV imports';
COMMENT ON TABLE shrinkage_records IS 'Inventory shrinkage tracking (expected vs actual)';
COMMENT ON TABLE inventory_top_movers IS 'Cached top sellers and slow movers reports';
COMMENT ON TABLE cod_statement_imports IS 'Courier COD statement imports for reconciliation';
COMMENT ON TABLE cod_statement_lines IS 'Individual lines from COD statements';
COMMENT ON TABLE cod_reminders IS 'Scheduled COD collection reminders';
COMMENT ON TABLE monthly_closes IS 'Monthly financial close records';
COMMENT ON TABLE accountant_exports IS 'Exported accountant packs (CSV/PDF)';
COMMENT ON TABLE proof_requests IS 'Payment proof requests sent to customers';
COMMENT ON TABLE ocr_verification_rules IS 'OCR patterns for payment proof verification by method';
