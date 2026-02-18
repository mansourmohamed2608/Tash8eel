-- Migration: 060_complete_feature_set.sql
-- Adds all columns and tables needed for production-complete agents

-- ============================================================================
-- 1. PERISHABLE / EXPIRY TRACKING (Inventory Agent)
-- ============================================================================
ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;
ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS is_perishable BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS expiry_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  item_id UUID NOT NULL,
  variant_id UUID,
  expiry_date DATE NOT NULL,
  alert_type VARCHAR(20) NOT NULL DEFAULT 'WARNING', -- WARNING | CRITICAL | EXPIRED
  days_until_expiry INTEGER NOT NULL,
  quantity_at_risk INTEGER DEFAULT 0,
  action_taken VARCHAR(50), -- DISCOUNTED | DONATED | DISPOSED | NONE
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expiry_alerts_merchant ON expiry_alerts(merchant_id, alert_type);
CREATE INDEX IF NOT EXISTS idx_expiry_alerts_date ON expiry_alerts(expiry_date);

-- ============================================================================
-- 2. BATCH & LOT TRACKING (Inventory Agent)
-- ============================================================================
ALTER TABLE IF EXISTS stock_movements ADD COLUMN IF NOT EXISTS lot_number VARCHAR(100);
ALTER TABLE IF EXISTS stock_movements ADD COLUMN IF NOT EXISTS batch_id VARCHAR(100);
ALTER TABLE IF EXISTS stock_movements ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE TABLE IF NOT EXISTS inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  item_id UUID NOT NULL,
  variant_id UUID,
  lot_number VARCHAR(100) NOT NULL,
  batch_id VARCHAR(100),
  quantity INTEGER NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2),
  received_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  supplier_id UUID,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE | DEPLETED | EXPIRED | RECALLED
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lots_merchant_item ON inventory_lots(merchant_id, item_id);
CREATE INDEX IF NOT EXISTS idx_lots_lot_number ON inventory_lots(merchant_id, lot_number);
CREATE INDEX IF NOT EXISTS idx_lots_expiry ON inventory_lots(expiry_date) WHERE status = 'ACTIVE';

-- ============================================================================
-- 3. FIFO COST TRACKING (Inventory Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  item_id UUID NOT NULL,
  variant_id UUID,
  lot_id UUID REFERENCES inventory_lots(id),
  quantity_remaining INTEGER NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_layers_fifo ON inventory_cost_layers(merchant_id, item_id, received_at ASC)
  WHERE quantity_remaining > 0;

-- ============================================================================
-- 4. SKU MERGE TRACKING (Inventory Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sku_merge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  source_sku VARCHAR(100) NOT NULL,
  target_sku VARCHAR(100) NOT NULL,
  source_item_id UUID NOT NULL,
  target_item_id UUID NOT NULL,
  merged_quantity INTEGER DEFAULT 0,
  merged_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. TAX CONFIGURATION (Finance Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS merchant_tax_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) UNIQUE,
  vat_rate NUMERIC(5,2) DEFAULT 14.00, -- Egypt VAT = 14%
  vat_registration_number VARCHAR(50),
  tax_enabled BOOLEAN DEFAULT false,
  include_vat_in_price BOOLEAN DEFAULT true, -- Egypt prices typically include VAT
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_sales NUMERIC(14,2) DEFAULT 0,
  total_vat_collected NUMERIC(14,2) DEFAULT 0,
  total_input_vat NUMERIC(14,2) DEFAULT 0, -- VAT on purchases/expenses
  net_vat_payable NUMERIC(14,2) DEFAULT 0,
  total_exempt_sales NUMERIC(14,2) DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT | FINAL | SUBMITTED
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tax_reports_merchant ON tax_reports(merchant_id, period_start);

-- ============================================================================
-- 6. CASH FLOW FORECASTING (Finance Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  forecast_date DATE NOT NULL,
  projected_income NUMERIC(14,2) DEFAULT 0,
  projected_expenses NUMERIC(14,2) DEFAULT 0,
  projected_cod_collections NUMERIC(14,2) DEFAULT 0,
  projected_net NUMERIC(14,2) DEFAULT 0,
  actual_income NUMERIC(14,2),
  actual_expenses NUMERIC(14,2),
  confidence_pct INTEGER DEFAULT 70,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_cashflow_forecast ON cash_flow_forecasts(merchant_id, forecast_date);

-- ============================================================================
-- 7. REFUND TRACKING (Finance Agent)
-- ============================================================================
ALTER TABLE IF EXISTS refunds ADD COLUMN IF NOT EXISTS reason VARCHAR(100);
ALTER TABLE IF EXISTS refunds ADD COLUMN IF NOT EXISTS refund_method VARCHAR(50);
ALTER TABLE IF EXISTS refunds ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
ALTER TABLE IF EXISTS refunds ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE IF EXISTS refunds ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================================================
-- 8. ORDERS — SOURCE CHANNEL + DISCOUNT TRACKING (Finance Agent)
-- ============================================================================
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS source_channel VARCHAR(50) DEFAULT 'whatsapp';
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS discount_code VARCHAR(50);
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20); -- PERCENTAGE | FIXED | COUPON

-- ============================================================================
-- 9. CUSTOMER PREFERENCES / MEMORY (Cross-Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  customer_id UUID NOT NULL,
  memory_type VARCHAR(50) NOT NULL, -- PREFERENCE | SIZE | ALLERGY | PAYMENT | ADDRESS | NOTE
  memory_key VARCHAR(100) NOT NULL,
  memory_value TEXT NOT NULL,
  confidence NUMERIC(3,2) DEFAULT 1.00,
  source VARCHAR(50) DEFAULT 'conversation', -- conversation | manual | inferred
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_memory_unique ON customer_memory(merchant_id, customer_id, memory_type, memory_key);
CREATE INDEX IF NOT EXISTS idx_customer_memory_lookup ON customer_memory(merchant_id, customer_id);

-- ============================================================================
-- 10. UNIFIED AI DECISION AUDIT TRAIL (Cross-Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  agent_type VARCHAR(50) NOT NULL, -- OPS_AGENT | INVENTORY_AGENT | FINANCE_AGENT | COPILOT
  decision_type VARCHAR(100) NOT NULL, -- e.g. ORDER_CONFIRMED, PAYMENT_APPROVED, STOCK_REORDERED, ESCALATED
  input_summary TEXT,
  decision TEXT NOT NULL,
  reasoning TEXT,
  confidence NUMERIC(3,2),
  entity_type VARCHAR(50), -- ORDER | CONVERSATION | INVENTORY_ITEM | PAYMENT | CUSTOMER
  entity_id VARCHAR(100),
  was_overridden BOOLEAN DEFAULT false,
  overridden_by VARCHAR(100),
  override_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_merchant ON ai_decision_log(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_type ON ai_decision_log(merchant_id, decision_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_entity ON ai_decision_log(entity_type, entity_id);

-- ============================================================================
-- 11. COMPLAINT PLAYBOOKS (Ops Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS complaint_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) REFERENCES merchants(id), -- NULL = system default
  complaint_type VARCHAR(50) NOT NULL, -- WRONG_ITEM | DAMAGED | LATE_DELIVERY | MISSING_ITEM | QUALITY | OVERCHARGED
  step_number INTEGER NOT NULL,
  action_type VARCHAR(30) NOT NULL, -- ASK | VERIFY | OFFER | ESCALATE | RESOLVE
  message_template_ar TEXT NOT NULL,
  message_template_en TEXT,
  requires_photo BOOLEAN DEFAULT false,
  requires_confirmation BOOLEAN DEFAULT false,
  auto_compensation_pct NUMERIC(5,2), -- auto-offer % discount/refund
  next_step_on_yes INTEGER,
  next_step_on_no INTEGER,
  escalate_after_step BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_playbooks_type ON complaint_playbooks(merchant_id, complaint_type, step_number);

-- ============================================================================
-- 12. DELIVERY ETA CONFIGURATION (Ops Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS delivery_eta_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  area_name VARCHAR(100) NOT NULL,
  avg_delivery_hours NUMERIC(5,1) NOT NULL DEFAULT 24,
  sample_count INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, area_name)
);

-- ============================================================================
-- 13. UPSELL / CROSS-SELL RULES (Ops Agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS upsell_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  rule_type VARCHAR(20) NOT NULL DEFAULT 'CROSS_SELL', -- UPSELL | CROSS_SELL | BUNDLE
  source_item_id UUID, -- if buying this...
  source_category VARCHAR(100), -- ...or any item in this category
  target_item_id UUID NOT NULL, -- ...suggest this
  priority INTEGER DEFAULT 0,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  message_ar TEXT, -- custom suggestion message
  is_active BOOLEAN DEFAULT true,
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_upsell_source ON upsell_rules(merchant_id, source_item_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_upsell_category ON upsell_rules(merchant_id, source_category) WHERE is_active = true;

-- ============================================================================
-- SEED DEFAULT COMPLAINT PLAYBOOKS
-- ============================================================================
INSERT INTO complaint_playbooks (merchant_id, complaint_type, step_number, action_type, message_template_ar, requires_photo, auto_compensation_pct, next_step_on_yes, next_step_on_no, escalate_after_step) VALUES
-- WRONG_ITEM playbook
(NULL, 'WRONG_ITEM', 1, 'ASK', 'نأسف جداً! هل ممكن تبعتلنا صورة للمنتج اللي وصلك؟', true, NULL, 2, 2, false),
(NULL, 'WRONG_ITEM', 2, 'VERIFY', 'شكراً للصورة. تم التأكد — هل تفضل استبدال المنتج أو استرجاع المبلغ؟', false, NULL, 3, 4, false),
(NULL, 'WRONG_ITEM', 3, 'OFFER', 'تمام! هنبعتلك المنتج الصح + خصم {compensation}% على طلبك الجاي كاعتذار', false, 10, NULL, NULL, false),
(NULL, 'WRONG_ITEM', 4, 'RESOLVE', 'تم تسجيل طلب الاسترجاع. المبلغ هيرجعلك خلال 3-5 أيام عمل', false, 100, NULL, NULL, false),
-- DAMAGED playbook
(NULL, 'DAMAGED', 1, 'ASK', 'نأسف جداً للإزعاج! هل ممكن تبعتلنا صورة للمنتج التالف؟', true, NULL, 2, 2, false),
(NULL, 'DAMAGED', 2, 'OFFER', 'شكراً. هنبعتلك بديل فوراً + خصم {compensation}% على طلبك الجاي', false, 15, NULL, 3, false),
(NULL, 'DAMAGED', 3, 'ESCALATE', 'تم تحويل طلبك لفريق خدمة العملاء للمتابعة الشخصية', false, NULL, NULL, NULL, true),
-- LATE_DELIVERY playbook
(NULL, 'LATE_DELIVERY', 1, 'VERIFY', 'نعتذر عن التأخير! الطلب حالياً في الطريق — الوقت المتوقع: {eta}', false, NULL, NULL, 2, false),
(NULL, 'LATE_DELIVERY', 2, 'OFFER', 'كتعويض عن التأخير، هنقدملك خصم {compensation}% على طلبك الجاي', false, 10, NULL, 3, false),
(NULL, 'LATE_DELIVERY', 3, 'ESCALATE', 'تم تصعيد الموضوع لشركة الشحن. هنتابع معاك مباشرة', false, NULL, NULL, NULL, true),
-- MISSING_ITEM playbook
(NULL, 'MISSING_ITEM', 1, 'ASK', 'نأسف! أي منتج ناقص من الطلب؟', false, NULL, 2, 2, false),
(NULL, 'MISSING_ITEM', 2, 'OFFER', 'تمام! هنبعتلك المنتج الناقص بأسرع وقت + توصيل مجاني', false, 0, NULL, 3, false),
(NULL, 'MISSING_ITEM', 3, 'ESCALATE', 'تم تحويل الموضوع للمسؤول. هنتواصل معاك خلال ساعة', false, NULL, NULL, NULL, true),
-- QUALITY playbook
(NULL, 'QUALITY', 1, 'ASK', 'نأسف أن المنتج لم يعجبك! هل ممكن تبعتلنا صورة وتوضحلنا المشكلة؟', true, NULL, 2, 2, false),
(NULL, 'QUALITY', 2, 'OFFER', 'فاهمين — هل تفضل استبدال أو استرجاع المبلغ مع خصم {compensation}% على طلبك الجاي؟', false, 10, 3, 4, false),
(NULL, 'QUALITY', 3, 'RESOLVE', 'تم ترتيب الاستبدال. شركة الشحن هتتواصل معاك', false, NULL, NULL, NULL, false),
(NULL, 'QUALITY', 4, 'RESOLVE', 'تم تسجيل الاسترجاع. المبلغ هيرجعلك خلال 3-5 أيام عمل', false, 100, NULL, NULL, false),
-- OVERCHARGED playbook
(NULL, 'OVERCHARGED', 1, 'VERIFY', 'هنراجع الفاتورة فوراً. المبلغ المحسوب: {order_total} — هل شايف رقم مختلف؟', false, NULL, 2, NULL, false),
(NULL, 'OVERCHARGED', 2, 'RESOLVE', 'فعلاً في فرق. تم تعديل المبلغ وهيتم استرجاع الفرق خلال 3-5 أيام', false, 100, NULL, 3, false),
(NULL, 'OVERCHARGED', 3, 'ESCALATE', 'تم تحويل الموضوع للمحاسبة للمراجعة الدقيقة', false, NULL, NULL, NULL, true)
ON CONFLICT DO NOTHING;
