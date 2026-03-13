-- Migration 071
-- Plans & Billing V3 (Bundles + Add-ons + Usage Packs + BYO) + Usage Guard ledger
-- Also upgrades payment proof workflow with OCR-assisted risk scoring + duplicate image detection.

-- -----------------------------------------------------------------------------
-- 1) Canonical pricing and catalog tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  tier_rank INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_bundle BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  region_code VARCHAR(8) NOT NULL,
  currency VARCHAR(8) NOT NULL,
  cycle_months INTEGER NOT NULL DEFAULT 1,
  base_price_cents INTEGER NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_price_cents INTEGER NOT NULL,
  effective_monthly_cents INTEGER NOT NULL,
  vat_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, region_code, cycle_months)
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key VARCHAR(80) NOT NULL,
  feature_label VARCHAR(160),
  feature_tier VARCHAR(40),
  is_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, feature_key)
);

CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  messages_per_month INTEGER NOT NULL,
  whatsapp_numbers INTEGER NOT NULL,
  team_members INTEGER NOT NULL,
  ai_calls_per_day INTEGER NOT NULL,
  token_budget_daily INTEGER NOT NULL,
  paid_templates_per_month INTEGER NOT NULL,
  payment_proof_scans_per_month INTEGER NOT NULL,
  voice_minutes_per_month INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id)
);

CREATE TABLE IF NOT EXISTS add_ons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'FEATURE',
  description TEXT,
  is_subscription BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS add_on_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE CASCADE,
  region_code VARCHAR(8) NOT NULL,
  currency VARCHAR(8) NOT NULL,
  cycle_months INTEGER NOT NULL DEFAULT 1,
  base_price_cents INTEGER NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_price_cents INTEGER NOT NULL,
  effective_monthly_cents INTEGER NOT NULL,
  vat_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(addon_id, region_code, cycle_months)
);

CREATE TABLE IF NOT EXISTS usage_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  metric_key VARCHAR(60) NOT NULL,
  tier_code VARCHAR(20) NOT NULL,
  included_units INTEGER,
  included_ai_calls_per_day INTEGER,
  included_token_budget_daily INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_pack_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_pack_id UUID NOT NULL REFERENCES usage_packs(id) ON DELETE CASCADE,
  region_code VARCHAR(8) NOT NULL,
  currency VARCHAR(8) NOT NULL,
  price_cents INTEGER NOT NULL,
  vat_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usage_pack_id, region_code)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  region_code VARCHAR(8) NOT NULL DEFAULT 'EG',
  cycle_months INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(40) NOT NULL DEFAULT 'manual',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('PENDING', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE'))
);

CREATE TABLE IF NOT EXISTS subscription_add_ons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING'))
);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  metric_key VARCHAR(60) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit VARCHAR(20),
  period_type VARCHAR(20) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_type IN ('DAILY', 'MONTHLY'))
);

CREATE TABLE IF NOT EXISTS usage_period_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  metric_key VARCHAR(60) NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  used_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  limit_quantity NUMERIC(12,3),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_type IN ('DAILY', 'MONTHLY')),
  UNIQUE(merchant_id, metric_key, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_plan_prices_plan_region_cycle
  ON plan_prices(plan_id, region_code, cycle_months);
CREATE INDEX IF NOT EXISTS idx_addon_prices_addon_region_cycle
  ON add_on_prices(addon_id, region_code, cycle_months);
CREATE INDEX IF NOT EXISTS idx_usage_pack_prices_pack_region
  ON usage_pack_prices(usage_pack_id, region_code);
CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant_status
  ON subscriptions(merchant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_addons_subscription_status
  ON subscription_add_ons(subscription_id, status);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_merchant_metric_created
  ON usage_ledger(merchant_id, metric_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_agg_merchant_metric_period
  ON usage_period_aggregates(merchant_id, metric_key, period_type, period_start DESC);

-- -----------------------------------------------------------------------------
-- 2) Payment proof hardening (OCR-assisted risk review, duplicates, manual review)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_proofs') THEN
    ALTER TABLE payment_proofs
      ADD COLUMN IF NOT EXISTS image_phash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS duplicate_of_proof_id UUID REFERENCES payment_proofs(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS duplicate_distance INTEGER,
      ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'LOW',
      ADD COLUMN IF NOT EXISTS risk_flags JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_by_staff_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS review_outcome VARCHAR(20),
      ADD COLUMN IF NOT EXISTS ocr_provider VARCHAR(50),
      ADD COLUMN IF NOT EXISTS ocr_guaranteed BOOLEAN DEFAULT false;

    CREATE INDEX IF NOT EXISTS idx_payment_proofs_image_phash
      ON payment_proofs(merchant_id, image_phash)
      WHERE image_phash IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_payment_proofs_risk
      ON payment_proofs(merchant_id, status, risk_score DESC, created_at DESC);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Seed canonical bundle plans + limits + entitlements + prices
-- -----------------------------------------------------------------------------

INSERT INTO plans (code, name, tier_rank, description, is_bundle, is_active, metadata)
VALUES
  ('STARTER', 'Starter', 1, 'Starter bundle', true, true, '{"allPlansIncludeCopilot": true}'::jsonb),
  ('GROWTH', 'Growth', 2, 'Growth bundle', true, true, '{"allPlansIncludeCopilot": true}'::jsonb),
  ('PRO', 'Pro', 3, 'Pro bundle', true, true, '{"allPlansIncludeCopilot": true}'::jsonb),
  ('ENTERPRISE', 'Enterprise', 4, 'Enterprise bundle', true, true, '{"allPlansIncludeCopilot": true}'::jsonb)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  tier_rank = EXCLUDED.tier_rank,
  description = EXCLUDED.description,
  is_bundle = EXCLUDED.is_bundle,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH required_features AS (
  SELECT p.id AS plan_id, p.code AS plan_code, f.feature_key, f.feature_label, f.feature_tier
  FROM plans p
  JOIN (
    VALUES
      ('STARTER','CONVERSATIONS','Conversations','CORE'),
      ('STARTER','ORDERS','Orders','CORE'),
      ('STARTER','CATALOG','Catalog','CORE'),
      ('STARTER','INVENTORY','Inventory basic','BASIC'),
      ('STARTER','REPORTS','Finance basic','BASIC'),
      ('STARTER','NOTIFICATIONS','Notifications','CORE'),
      ('STARTER','VOICE_NOTES','Voice notes support','METERED'),
      ('STARTER','PAYMENTS','Payment Proof Verification','BASIC'),
      ('STARTER','COPILOT_CHAT','Copilot chat','CORE'),

      ('GROWTH','CONVERSATIONS','Conversations','CORE'),
      ('GROWTH','ORDERS','Orders','CORE'),
      ('GROWTH','CATALOG','Catalog','CORE'),
      ('GROWTH','INVENTORY','Inventory basic','BASIC'),
      ('GROWTH','REPORTS','Finance basic','BASIC'),
      ('GROWTH','NOTIFICATIONS','Notifications','CORE'),
      ('GROWTH','VOICE_NOTES','Voice notes support','METERED'),
      ('GROWTH','PAYMENTS','Payment Proof Verification','BASIC'),
      ('GROWTH','COPILOT_CHAT','Copilot chat','CORE'),
      ('GROWTH','TEAM','Team management','BASIC'),
      ('GROWTH','API_ACCESS','API access','BASIC'),
      ('GROWTH','WEBHOOKS','POS Integrations','BASIC'),

      ('PRO','CONVERSATIONS','Conversations','CORE'),
      ('PRO','ORDERS','Orders','CORE'),
      ('PRO','CATALOG','Catalog','CORE'),
      ('PRO','INVENTORY','Inventory basic','BASIC'),
      ('PRO','REPORTS','Finance basic','BASIC'),
      ('PRO','NOTIFICATIONS','Notifications','CORE'),
      ('PRO','VOICE_NOTES','Voice notes support','METERED'),
      ('PRO','PAYMENTS','Payment Proof Verification','BASIC'),
      ('PRO','COPILOT_CHAT','Copilot chat','CORE'),
      ('PRO','TEAM','Team management','BASIC'),
      ('PRO','API_ACCESS','API access','BASIC'),
      ('PRO','WEBHOOKS','POS Integrations','ADVANCED'),
      ('PRO','KPI_DASHBOARD','KPI Dashboard','ADVANCED'),
      ('PRO','AUDIT_LOGS','Audit Logs','ADVANCED'),

      ('ENTERPRISE','CONVERSATIONS','Conversations','CORE'),
      ('ENTERPRISE','ORDERS','Orders','CORE'),
      ('ENTERPRISE','CATALOG','Catalog','CORE'),
      ('ENTERPRISE','INVENTORY','Inventory basic','BASIC'),
      ('ENTERPRISE','REPORTS','Finance basic','BASIC'),
      ('ENTERPRISE','NOTIFICATIONS','Notifications','CORE'),
      ('ENTERPRISE','VOICE_NOTES','Voice notes support','METERED'),
      ('ENTERPRISE','PAYMENTS','Payment Proof Verification','BASIC'),
      ('ENTERPRISE','COPILOT_CHAT','Copilot chat','CORE'),
      ('ENTERPRISE','TEAM','Team management','ADVANCED'),
      ('ENTERPRISE','API_ACCESS','API access','ADVANCED'),
      ('ENTERPRISE','WEBHOOKS','POS Integrations','ADVANCED'),
      ('ENTERPRISE','KPI_DASHBOARD','KPI Dashboard','ADVANCED'),
      ('ENTERPRISE','AUDIT_LOGS','Audit Logs','ADVANCED'),
      ('ENTERPRISE','CUSTOM_INTEGRATIONS','Custom integrations','ENTERPRISE'),
      ('ENTERPRISE','SLA','SLA','ENTERPRISE')
  ) AS f(plan_code, feature_key, feature_label, feature_tier)
    ON p.code = f.plan_code
)
INSERT INTO plan_entitlements (plan_id, feature_key, feature_label, feature_tier, is_included)
SELECT rf.plan_id, rf.feature_key, rf.feature_label, rf.feature_tier, true
FROM required_features rf
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
  feature_label = EXCLUDED.feature_label,
  feature_tier = EXCLUDED.feature_tier,
  is_included = true,
  updated_at = NOW();

WITH limit_rows AS (
  SELECT p.id AS plan_id, l.*
  FROM plans p
  JOIN (
    VALUES
      ('STARTER', 15000, 1, 1, 500, 200000, 15, 80, 20),
      ('GROWTH', 30000, 2, 2, 1000, 400000, 30, 200, 60),
      ('PRO', 100000, 3, 5, 2500, 1000000, 50, 500, 120),
      ('ENTERPRISE', 250000, 5, 10, 5000, 1750000, 100, 1200, 240)
  ) AS l(plan_code, messages_per_month, whatsapp_numbers, team_members, ai_calls_per_day, token_budget_daily, paid_templates_per_month, payment_proof_scans_per_month, voice_minutes_per_month)
    ON p.code = l.plan_code
)
INSERT INTO plan_limits (
  plan_id,
  messages_per_month,
  whatsapp_numbers,
  team_members,
  ai_calls_per_day,
  token_budget_daily,
  paid_templates_per_month,
  payment_proof_scans_per_month,
  voice_minutes_per_month,
  metadata
)
SELECT
  lr.plan_id,
  lr.messages_per_month,
  lr.whatsapp_numbers,
  lr.team_members,
  lr.ai_calls_per_day,
  lr.token_budget_daily,
  lr.paid_templates_per_month,
  lr.payment_proof_scans_per_month,
  lr.voice_minutes_per_month,
  '{}'::jsonb
FROM limit_rows lr
ON CONFLICT (plan_id) DO UPDATE
SET
  messages_per_month = EXCLUDED.messages_per_month,
  whatsapp_numbers = EXCLUDED.whatsapp_numbers,
  team_members = EXCLUDED.team_members,
  ai_calls_per_day = EXCLUDED.ai_calls_per_day,
  token_budget_daily = EXCLUDED.token_budget_daily,
  paid_templates_per_month = EXCLUDED.paid_templates_per_month,
  payment_proof_scans_per_month = EXCLUDED.payment_proof_scans_per_month,
  voice_minutes_per_month = EXCLUDED.voice_minutes_per_month,
  updated_at = NOW();

WITH cycle_discounts AS (
  SELECT 1 AS cycle_months, 0::numeric AS discount_percent
  UNION ALL SELECT 3, 5::numeric
  UNION ALL SELECT 6, 10::numeric
  UNION ALL SELECT 12, 15::numeric
),
regional_prices AS (
  SELECT p.id AS plan_id, rp.region_code, rp.currency, rp.base_price_cents
  FROM plans p
  JOIN (
    VALUES
      ('STARTER', 'EG', 'EGP',  99900),
      ('GROWTH',  'EG', 'EGP', 189900),
      ('PRO',     'EG', 'EGP', 329900),
      ('ENTERPRISE','EG','EGP',599900),

      ('STARTER', 'SA', 'SAR',  19900),
      ('GROWTH',  'SA', 'SAR',  34900),
      ('PRO',     'SA', 'SAR',  59900),
      ('ENTERPRISE','SA','SAR', 99900),

      ('STARTER', 'AE', 'AED',  17900),
      ('GROWTH',  'AE', 'AED',  32900),
      ('PRO',     'AE', 'AED',  54900),
      ('ENTERPRISE','AE','AED', 89900)
  ) AS rp(plan_code, region_code, currency, base_price_cents)
    ON p.code = rp.plan_code
)
INSERT INTO plan_prices (
  plan_id,
  region_code,
  currency,
  cycle_months,
  base_price_cents,
  discount_percent,
  total_price_cents,
  effective_monthly_cents,
  vat_included
)
SELECT
  rp.plan_id,
  rp.region_code,
  rp.currency,
  cd.cycle_months,
  rp.base_price_cents,
  cd.discount_percent,
  ROUND((rp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer AS total_price_cents,
  ROUND(((rp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer AS effective_monthly_cents,
  true
FROM regional_prices rp
CROSS JOIN cycle_discounts cd
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
SET
  currency = EXCLUDED.currency,
  base_price_cents = EXCLUDED.base_price_cents,
  discount_percent = EXCLUDED.discount_percent,
  total_price_cents = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 4) Seed add-ons + prices (cycle discounts apply)
-- -----------------------------------------------------------------------------

INSERT INTO add_ons (code, name, category, description, is_subscription, is_active)
VALUES
  ('PLATFORM_CORE', 'Platform Core', 'CORE', 'Core platform subscription (mandatory for BYO)', true, true),
  ('INVENTORY_BASIC', 'Inventory Basic', 'FEATURE', 'Stock on hand + low stock', true, true),
  ('FINANCE_BASIC', 'Finance Basic', 'FEATURE', 'Expenses + simple profit view', true, true),
  ('TEAM_UPTO3', 'Team (up to 3 users)', 'FEATURE', 'Team access for up to 3 users', true, true),
  ('POS_INTEGRATIONS_BASIC', 'POS Integrations (Basic)', 'INTEGRATION', 'Basic POS integrations', true, true),
  ('POS_INTEGRATIONS_ADVANCED', 'POS Integrations (Advanced)', 'INTEGRATION', 'Advanced POS integrations', true, true),
  ('KPI_DASHBOARD', 'KPI Dashboard', 'FEATURE', 'Key performance dashboard', true, true),
  ('AUDIT_LOGS', 'Audit Logs', 'FEATURE', 'Operational/security audit logs', true, true),
  ('MULTI_BRANCH_EXTRA', 'Multi-Branch (per extra branch)', 'FEATURE', 'Each unit adds one extra branch', true, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_subscription = EXCLUDED.is_subscription,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

WITH cycle_discounts AS (
  SELECT 1 AS cycle_months, 0::numeric AS discount_percent
  UNION ALL SELECT 3, 5::numeric
  UNION ALL SELECT 6, 10::numeric
  UNION ALL SELECT 12, 15::numeric
),
addon_base_prices AS (
  SELECT a.id AS addon_id, p.region_code, p.currency, p.base_price_cents
  FROM add_ons a
  JOIN (
    VALUES
      ('PLATFORM_CORE','EG','EGP',89900),('PLATFORM_CORE','SA','SAR',18900),('PLATFORM_CORE','AE','AED',16900),
      ('INVENTORY_BASIC','EG','EGP',19900),('INVENTORY_BASIC','SA','SAR', 4900),('INVENTORY_BASIC','AE','AED', 4500),
      ('FINANCE_BASIC','EG','EGP',19900),('FINANCE_BASIC','SA','SAR', 4900),('FINANCE_BASIC','AE','AED', 4500),
      ('TEAM_UPTO3','EG','EGP',24900),('TEAM_UPTO3','SA','SAR', 6900),('TEAM_UPTO3','AE','AED', 5900),
      ('POS_INTEGRATIONS_BASIC','EG','EGP',34900),('POS_INTEGRATIONS_BASIC','SA','SAR', 8900),('POS_INTEGRATIONS_BASIC','AE','AED', 7900),
      ('POS_INTEGRATIONS_ADVANCED','EG','EGP',64900),('POS_INTEGRATIONS_ADVANCED','SA','SAR',16900),('POS_INTEGRATIONS_ADVANCED','AE','AED',14900),
      ('KPI_DASHBOARD','EG','EGP',29900),('KPI_DASHBOARD','SA','SAR', 7900),('KPI_DASHBOARD','AE','AED', 6900),
      ('AUDIT_LOGS','EG','EGP',24900),('AUDIT_LOGS','SA','SAR', 6900),('AUDIT_LOGS','AE','AED', 5900),
      ('MULTI_BRANCH_EXTRA','EG','EGP',29900),('MULTI_BRANCH_EXTRA','SA','SAR', 7900),('MULTI_BRANCH_EXTRA','AE','AED', 6900)
  ) AS p(addon_code, region_code, currency, base_price_cents)
    ON a.code = p.addon_code
)
INSERT INTO add_on_prices (
  addon_id,
  region_code,
  currency,
  cycle_months,
  base_price_cents,
  discount_percent,
  total_price_cents,
  effective_monthly_cents,
  vat_included
)
SELECT
  abp.addon_id,
  abp.region_code,
  abp.currency,
  cd.cycle_months,
  abp.base_price_cents,
  cd.discount_percent,
  ROUND((abp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer AS total_price_cents,
  ROUND(((abp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer AS effective_monthly_cents,
  true
FROM addon_base_prices abp
CROSS JOIN cycle_discounts cd
ON CONFLICT (addon_id, region_code, cycle_months) DO UPDATE
SET
  currency = EXCLUDED.currency,
  base_price_cents = EXCLUDED.base_price_cents,
  discount_percent = EXCLUDED.discount_percent,
  total_price_cents = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 5) Seed usage packs + prices (no cycle discount)
-- -----------------------------------------------------------------------------

INSERT INTO usage_packs (
  code,
  name,
  metric_key,
  tier_code,
  included_units,
  included_ai_calls_per_day,
  included_token_budget_daily,
  metadata,
  is_active
)
VALUES
  ('AI_CAPACITY_S', 'AI Capacity S', 'AI_CAPACITY', 'S', NULL, 500, 200000, '{}'::jsonb, true),
  ('AI_CAPACITY_M', 'AI Capacity M', 'AI_CAPACITY', 'M', NULL, 1000, 400000, '{}'::jsonb, true),
  ('AI_CAPACITY_L', 'AI Capacity L', 'AI_CAPACITY', 'L', NULL, 2500, 1000000, '{}'::jsonb, true),
  ('AI_CAPACITY_XL', 'AI Capacity XL', 'AI_CAPACITY', 'XL', NULL, 5000, 1750000, '{}'::jsonb, true),

  ('PROOF_CHECKS_S', 'Proof Checks S (100)', 'PAYMENT_PROOF_SCANS', 'S', 100, NULL, NULL, '{}'::jsonb, true),
  ('PROOF_CHECKS_M', 'Proof Checks M (300)', 'PAYMENT_PROOF_SCANS', 'M', 300, NULL, NULL, '{}'::jsonb, true),
  ('PROOF_CHECKS_L', 'Proof Checks L (800)', 'PAYMENT_PROOF_SCANS', 'L', 800, NULL, NULL, '{}'::jsonb, true),
  ('PROOF_CHECKS_XL', 'Proof Checks XL (1500)', 'PAYMENT_PROOF_SCANS', 'XL', 1500, NULL, NULL, '{}'::jsonb, true),

  ('VOICE_MINUTES_S', 'Voice Minutes S (30)', 'VOICE_MINUTES', 'S', 30, NULL, NULL, '{}'::jsonb, true),
  ('VOICE_MINUTES_M', 'Voice Minutes M (90)', 'VOICE_MINUTES', 'M', 90, NULL, NULL, '{}'::jsonb, true),
  ('VOICE_MINUTES_L', 'Voice Minutes L (240)', 'VOICE_MINUTES', 'L', 240, NULL, NULL, '{}'::jsonb, true),
  ('VOICE_MINUTES_XL', 'Voice Minutes XL (600)', 'VOICE_MINUTES', 'XL', 600, NULL, NULL, '{}'::jsonb, true),

  ('PAID_TEMPLATES_S', 'Paid Templates S (100)', 'PAID_TEMPLATES', 'S', 100, NULL, NULL, '{}'::jsonb, true),
  ('PAID_TEMPLATES_M', 'Paid Templates M (300)', 'PAID_TEMPLATES', 'M', 300, NULL, NULL, '{}'::jsonb, true),
  ('PAID_TEMPLATES_L', 'Paid Templates L (1000)', 'PAID_TEMPLATES', 'L', 1000, NULL, NULL, '{}'::jsonb, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  metric_key = EXCLUDED.metric_key,
  tier_code = EXCLUDED.tier_code,
  included_units = EXCLUDED.included_units,
  included_ai_calls_per_day = EXCLUDED.included_ai_calls_per_day,
  included_token_budget_daily = EXCLUDED.included_token_budget_daily,
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

WITH usage_pack_prices_seed AS (
  SELECT up.id AS usage_pack_id, p.region_code, p.currency, p.price_cents
  FROM usage_packs up
  JOIN (
    VALUES
      ('AI_CAPACITY_S','EG','EGP', 19900),('AI_CAPACITY_S','SA','SAR', 5900),('AI_CAPACITY_S','AE','AED', 5500),
      ('AI_CAPACITY_M','EG','EGP', 39900),('AI_CAPACITY_M','SA','SAR',10900),('AI_CAPACITY_M','AE','AED', 9900),
      ('AI_CAPACITY_L','EG','EGP', 79900),('AI_CAPACITY_L','SA','SAR',21900),('AI_CAPACITY_L','AE','AED',19900),
      ('AI_CAPACITY_XL','EG','EGP',129900),('AI_CAPACITY_XL','SA','SAR',34900),('AI_CAPACITY_XL','AE','AED',31900),

      ('PROOF_CHECKS_S','EG','EGP',14900),('PROOF_CHECKS_S','SA','SAR',3900),('PROOF_CHECKS_S','AE','AED',3500),
      ('PROOF_CHECKS_M','EG','EGP',34900),('PROOF_CHECKS_M','SA','SAR',8900),('PROOF_CHECKS_M','AE','AED',7900),
      ('PROOF_CHECKS_L','EG','EGP',79900),('PROOF_CHECKS_L','SA','SAR',20900),('PROOF_CHECKS_L','AE','AED',18900),
      ('PROOF_CHECKS_XL','EG','EGP',129900),('PROOF_CHECKS_XL','SA','SAR',32900),('PROOF_CHECKS_XL','AE','AED',29900),

      ('VOICE_MINUTES_S','EG','EGP', 9900),('VOICE_MINUTES_S','SA','SAR',2500),('VOICE_MINUTES_S','AE','AED',2300),
      ('VOICE_MINUTES_M','EG','EGP',24900),('VOICE_MINUTES_M','SA','SAR',5900),('VOICE_MINUTES_M','AE','AED',5500),
      ('VOICE_MINUTES_L','EG','EGP',54900),('VOICE_MINUTES_L','SA','SAR',12900),('VOICE_MINUTES_L','AE','AED',11900),
      ('VOICE_MINUTES_XL','EG','EGP',119900),('VOICE_MINUTES_XL','SA','SAR',27900),('VOICE_MINUTES_XL','AE','AED',25900),

      ('PAID_TEMPLATES_S','EG','EGP', 49900),('PAID_TEMPLATES_S','SA','SAR',3900),('PAID_TEMPLATES_S','AE','AED',3900),
      ('PAID_TEMPLATES_M','EG','EGP',129900),('PAID_TEMPLATES_M','SA','SAR',9900),('PAID_TEMPLATES_M','AE','AED',9900),
      ('PAID_TEMPLATES_L','EG','EGP',399900),('PAID_TEMPLATES_L','SA','SAR',29900),('PAID_TEMPLATES_L','AE','AED',29900)
  ) AS p(usage_pack_code, region_code, currency, price_cents)
    ON up.code = p.usage_pack_code
)
INSERT INTO usage_pack_prices (
  usage_pack_id,
  region_code,
  currency,
  price_cents,
  vat_included
)
SELECT usage_pack_id, region_code, currency, price_cents, true
FROM usage_pack_prices_seed
ON CONFLICT (usage_pack_id, region_code) DO UPDATE
SET
  currency = EXCLUDED.currency,
  price_cents = EXCLUDED.price_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 6) Backward compatibility: keep legacy billing_plans and merchant limits aligned
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN
    INSERT INTO billing_plans (
      code, name, price_cents, currency, billing_period, description, features, agents, limits, is_active
    ) VALUES
      (
        'STARTER', 'Starter', 99900, 'EGP', 'monthly', 'Starter bundle',
        '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","VOICE_NOTES","PAYMENTS","COPILOT_CHAT"]'::jsonb,
        '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
        '{"messagesPerMonth":15000,"whatsappNumbers":1,"teamMembers":1,"aiCallsPerDay":500,"tokenBudgetDaily":200000,"paidTemplatesPerMonth":15,"paymentProofScansPerMonth":80,"voiceMinutesPerMonth":20}'::jsonb,
        true
      ),
      (
        'GROWTH', 'Growth', 189900, 'EGP', 'monthly', 'Growth bundle',
        '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","VOICE_NOTES","PAYMENTS","COPILOT_CHAT","TEAM","API_ACCESS","WEBHOOKS"]'::jsonb,
        '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
        '{"messagesPerMonth":30000,"whatsappNumbers":2,"teamMembers":2,"aiCallsPerDay":1000,"tokenBudgetDaily":400000,"paidTemplatesPerMonth":30,"paymentProofScansPerMonth":200,"voiceMinutesPerMonth":60}'::jsonb,
        true
      ),
      (
        'PRO', 'Pro', 329900, 'EGP', 'monthly', 'Pro bundle',
        '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","VOICE_NOTES","PAYMENTS","COPILOT_CHAT","TEAM","API_ACCESS","WEBHOOKS","KPI_DASHBOARD","AUDIT_LOGS"]'::jsonb,
        '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
        '{"messagesPerMonth":100000,"whatsappNumbers":3,"teamMembers":5,"aiCallsPerDay":2500,"tokenBudgetDaily":1000000,"paidTemplatesPerMonth":50,"paymentProofScansPerMonth":500,"voiceMinutesPerMonth":120}'::jsonb,
        true
      ),
      (
        'ENTERPRISE', 'Enterprise', 599900, 'EGP', 'monthly', 'Enterprise bundle',
        '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","VOICE_NOTES","PAYMENTS","COPILOT_CHAT","TEAM","API_ACCESS","WEBHOOKS","KPI_DASHBOARD","AUDIT_LOGS","CUSTOM_INTEGRATIONS","SLA"]'::jsonb,
        '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
        '{"messagesPerMonth":250000,"whatsappNumbers":5,"teamMembers":10,"aiCallsPerDay":5000,"tokenBudgetDaily":1750000,"paidTemplatesPerMonth":100,"paymentProofScansPerMonth":1200,"voiceMinutesPerMonth":240}'::jsonb,
        true
      )
    ON CONFLICT (code) DO UPDATE
    SET
      name = EXCLUDED.name,
      price_cents = EXCLUDED.price_cents,
      currency = EXCLUDED.currency,
      billing_period = EXCLUDED.billing_period,
      description = EXCLUDED.description,
      features = EXCLUDED.features,
      agents = EXCLUDED.agents,
      limits = EXCLUDED.limits,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'plan_limits'
    ) THEN
      UPDATE merchants
      SET plan_limits = CASE UPPER(COALESCE(plan, 'STARTER'))
        WHEN 'STARTER' THEN '{"messagesPerMonth":15000,"whatsappNumbers":1,"teamMembers":1,"aiCallsPerDay":500,"tokenBudgetDaily":200000,"paidTemplatesPerMonth":15,"paymentProofScansPerMonth":80,"voiceMinutesPerMonth":20}'::jsonb
        WHEN 'GROWTH' THEN '{"messagesPerMonth":30000,"whatsappNumbers":2,"teamMembers":2,"aiCallsPerDay":1000,"tokenBudgetDaily":400000,"paidTemplatesPerMonth":30,"paymentProofScansPerMonth":200,"voiceMinutesPerMonth":60}'::jsonb
        WHEN 'PRO' THEN '{"messagesPerMonth":100000,"whatsappNumbers":3,"teamMembers":5,"aiCallsPerDay":2500,"tokenBudgetDaily":1000000,"paidTemplatesPerMonth":50,"paymentProofScansPerMonth":500,"voiceMinutesPerMonth":120}'::jsonb
        WHEN 'ENTERPRISE' THEN '{"messagesPerMonth":250000,"whatsappNumbers":5,"teamMembers":10,"aiCallsPerDay":5000,"tokenBudgetDaily":1750000,"paidTemplatesPerMonth":100,"paymentProofScansPerMonth":1200,"voiceMinutesPerMonth":240}'::jsonb
        ELSE plan_limits
      END
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'limits'
    ) THEN
      UPDATE merchants
      SET limits = CASE UPPER(COALESCE(plan, 'STARTER'))
        WHEN 'STARTER' THEN '{"messagesPerMonth":15000,"whatsappNumbers":1,"teamMembers":1,"aiCallsPerDay":500,"tokenBudgetDaily":200000,"paidTemplatesPerMonth":15,"paymentProofScansPerMonth":80,"voiceMinutesPerMonth":20}'::jsonb
        WHEN 'GROWTH' THEN '{"messagesPerMonth":30000,"whatsappNumbers":2,"teamMembers":2,"aiCallsPerDay":1000,"tokenBudgetDaily":400000,"paidTemplatesPerMonth":30,"paymentProofScansPerMonth":200,"voiceMinutesPerMonth":60}'::jsonb
        WHEN 'PRO' THEN '{"messagesPerMonth":100000,"whatsappNumbers":3,"teamMembers":5,"aiCallsPerDay":2500,"tokenBudgetDaily":1000000,"paidTemplatesPerMonth":50,"paymentProofScansPerMonth":500,"voiceMinutesPerMonth":120}'::jsonb
        WHEN 'ENTERPRISE' THEN '{"messagesPerMonth":250000,"whatsappNumbers":5,"teamMembers":10,"aiCallsPerDay":5000,"tokenBudgetDaily":1750000,"paidTemplatesPerMonth":100,"paymentProofScansPerMonth":1200,"voiceMinutesPerMonth":240}'::jsonb
        ELSE limits
      END
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'daily_token_budget'
    ) THEN
      UPDATE merchants
      SET daily_token_budget = CASE UPPER(COALESCE(plan, 'STARTER'))
        WHEN 'STARTER' THEN 200000
        WHEN 'GROWTH' THEN 400000
        WHEN 'PRO' THEN 1000000
        WHEN 'ENTERPRISE' THEN 1750000
        ELSE daily_token_budget
      END
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'enabled_features'
    ) THEN
      UPDATE merchants
      SET enabled_features = CASE UPPER(COALESCE(plan, 'STARTER'))
        WHEN 'STARTER' THEN ARRAY['CONVERSATIONS','ORDERS','CATALOG','INVENTORY','REPORTS','NOTIFICATIONS','VOICE_NOTES','PAYMENTS','COPILOT_CHAT']
        WHEN 'GROWTH' THEN ARRAY['CONVERSATIONS','ORDERS','CATALOG','INVENTORY','REPORTS','NOTIFICATIONS','VOICE_NOTES','PAYMENTS','COPILOT_CHAT','TEAM','API_ACCESS','WEBHOOKS']
        WHEN 'PRO' THEN ARRAY['CONVERSATIONS','ORDERS','CATALOG','INVENTORY','REPORTS','NOTIFICATIONS','VOICE_NOTES','PAYMENTS','COPILOT_CHAT','TEAM','API_ACCESS','WEBHOOKS','KPI_DASHBOARD','AUDIT_LOGS']
        WHEN 'ENTERPRISE' THEN ARRAY['CONVERSATIONS','ORDERS','CATALOG','INVENTORY','REPORTS','NOTIFICATIONS','VOICE_NOTES','PAYMENTS','COPILOT_CHAT','TEAM','API_ACCESS','WEBHOOKS','KPI_DASHBOARD','AUDIT_LOGS','CUSTOM_INTEGRATIONS','SLA']
        ELSE enabled_features
      END
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'enabled_agents'
    ) THEN
      UPDATE merchants
      SET enabled_agents = ARRAY['OPS_AGENT','INVENTORY_AGENT','FINANCE_AGENT']
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'updated_at'
    ) THEN
      UPDATE merchants
      SET updated_at = NOW()
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;
  END IF;
END $$;
