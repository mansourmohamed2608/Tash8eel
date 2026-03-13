-- 072_plans_billing_strict_split_v4.sql
-- Enforces strict split:
-- 1) Bundles (fixed features + fixed limits)
-- 2) Bundle add-ons (usage packs + capacity add-ons)
-- 3) BYO (custom feature add-ons + custom usage packs)

-- ---------------------------------------------------------------------------
-- 1) Extend plan limits for maps/POS/branches and capacity limits
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plan_limits') THEN
    ALTER TABLE plan_limits
      ADD COLUMN IF NOT EXISTS maps_lookups_per_month INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS pos_connections INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS branches INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS retention_days INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS alert_rules INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS automations INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS auto_runs_per_day INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'add_ons') THEN
    ALTER TABLE add_ons
      ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'BYO',
      ADD COLUMN IF NOT EXISTS addon_type VARCHAR(20) NOT NULL DEFAULT 'FEATURE',
      ADD COLUMN IF NOT EXISTS feature_enables TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      ADD COLUMN IF NOT EXISTS limit_floor_updates JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS limit_increments JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_packs') THEN
    ALTER TABLE usage_packs
      ADD COLUMN IF NOT EXISTS limit_deltas JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Force exact bundle limits from product spec
-- ---------------------------------------------------------------------------
WITH limit_rows AS (
  SELECT p.id AS plan_id, l.*
  FROM plans p
  JOIN (
    VALUES
      ('STARTER', 15000, 1, 1, 500, 200000, 15, 80, 20, 200, 0, 1),
      ('GROWTH', 30000, 2, 2, 1000, 400000, 30, 200, 60, 600, 1, 1),
      ('PRO', 100000, 3, 5, 2500, 1000000, 50, 500, 120, 2000, 3, 2),
      ('ENTERPRISE', 250000, 5, 10, 5000, 1750000, 100, 1200, 240, 6000, 5, 5)
  ) AS l(
    plan_code,
    messages_per_month,
    whatsapp_numbers,
    team_members,
    ai_calls_per_day,
    token_budget_daily,
    paid_templates_per_month,
    payment_proof_scans_per_month,
    voice_minutes_per_month,
    maps_lookups_per_month,
    pos_connections,
    branches
  ) ON p.code = l.plan_code
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
  maps_lookups_per_month,
  pos_connections,
  branches,
  retention_days,
  alert_rules,
  automations,
  auto_runs_per_day,
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
  lr.maps_lookups_per_month,
  lr.pos_connections,
  lr.branches,
  CASE WHEN lr.plan_code IN ('PRO','ENTERPRISE') THEN 90 ELSE 30 END,
  0,
  0,
  0,
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
  maps_lookups_per_month = EXCLUDED.maps_lookups_per_month,
  pos_connections = EXCLUDED.pos_connections,
  branches = EXCLUDED.branches,
  retention_days = EXCLUDED.retention_days,
  alert_rules = EXCLUDED.alert_rules,
  automations = EXCLUDED.automations,
  auto_runs_per_day = EXCLUDED.auto_runs_per_day,
  metadata = COALESCE(plan_limits.metadata, '{}'::jsonb),
  updated_at = NOW();

-- Keep user-facing label as POS Integrations while preserving WEBHOOKS key.
UPDATE plan_entitlements
SET feature_label = 'POS Integrations', updated_at = NOW()
WHERE feature_key = 'WEBHOOKS';

-- ---------------------------------------------------------------------------
-- 3) Strict add-on catalog (DB source of truth)
-- ---------------------------------------------------------------------------
UPDATE add_ons
SET is_active = false, updated_at = NOW();

INSERT INTO add_ons (
  code,
  name,
  category,
  description,
  is_subscription,
  is_active,
  scope,
  addon_type,
  feature_enables,
  limit_floor_updates,
  limit_increments,
  metadata
)
VALUES
  ('PLATFORM_CORE', 'Platform Core', 'CORE', 'Core platform for BYO', true, true, 'BYO', 'CORE', ARRAY['CONVERSATIONS','ORDERS','CATALOG','NOTIFICATIONS','VOICE_NOTES','PAYMENTS','COPILOT_CHAT'], '{}'::jsonb, '{}'::jsonb, '{"mandatoryForByo":true}'::jsonb),
  ('INVENTORY_BASIC', 'Inventory Basic', 'FEATURE', 'Stock on hand + low stock', true, true, 'BYO', 'FEATURE', ARRAY['INVENTORY'], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('FINANCE_BASIC', 'Finance Basic', 'FEATURE', 'Expenses + simple profit via basic reports', true, true, 'BYO', 'FEATURE', ARRAY['REPORTS'], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('TEAM_UP_TO_3', 'Team (up to 3 users)', 'CAPACITY', 'Enable TEAM and floor team members to 3', true, true, 'BOTH', 'CAPACITY', ARRAY['TEAM'], '{"teamMembers":3}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('POS_BASIC', 'POS Integrations (Basic)', 'CAPACITY', 'Enable POS integrations basic level', true, true, 'BOTH', 'CAPACITY', ARRAY['WEBHOOKS'], '{"posConnections":1}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('POS_ADV', 'POS Integrations (Advanced)', 'CAPACITY', 'Enable POS integrations advanced level', true, true, 'BOTH', 'CAPACITY', ARRAY['WEBHOOKS'], '{"posConnections":3}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('KPI_DASHBOARD', 'KPI Dashboard', 'FEATURE', 'Performance dashboard', true, true, 'BYO', 'FEATURE', ARRAY['KPI_DASHBOARD'], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('AUDIT_LOGS', 'Audit Logs', 'FEATURE', 'Audit logs and retention', true, true, 'BYO', 'FEATURE', ARRAY['AUDIT_LOGS'], '{"retentionDays":90}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('MULTI_BRANCH_PER_1', 'Multi-Branch (per extra branch)', 'CAPACITY', 'Adds one branch and one WhatsApp number', true, true, 'BOTH', 'CAPACITY', ARRAY[]::text[], '{}'::jsonb, '{"branches":1,"whatsappNumbers":1}'::jsonb, '{}'::jsonb),
  ('PROACTIVE_ALERTS', 'Proactive Alerts', 'CAPACITY', 'Enables proactive alerts capacity', true, true, 'BUNDLE', 'CAPACITY', ARRAY[]::text[], '{"alertRules":30}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('AUTONOMOUS_AGENT', 'Autonomous Agent', 'CAPACITY', 'Autonomous actions and schedules', true, true, 'BUNDLE', 'CAPACITY', ARRAY[]::text[], '{"automations":10,"autoRunsPerDay":2}'::jsonb, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_subscription = EXCLUDED.is_subscription,
  is_active = EXCLUDED.is_active,
  scope = EXCLUDED.scope,
  addon_type = EXCLUDED.addon_type,
  feature_enables = EXCLUDED.feature_enables,
  limit_floor_updates = EXCLUDED.limit_floor_updates,
  limit_increments = EXCLUDED.limit_increments,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

DELETE FROM add_on_prices;

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
      ('INVENTORY_BASIC','EG','EGP',19900),('INVENTORY_BASIC','SA','SAR',4900),('INVENTORY_BASIC','AE','AED',4500),
      ('FINANCE_BASIC','EG','EGP',19900),('FINANCE_BASIC','SA','SAR',4900),('FINANCE_BASIC','AE','AED',4500),
      ('TEAM_UP_TO_3','EG','EGP',24900),('TEAM_UP_TO_3','SA','SAR',6900),('TEAM_UP_TO_3','AE','AED',5900),
      ('POS_BASIC','EG','EGP',34900),('POS_BASIC','SA','SAR',8900),('POS_BASIC','AE','AED',7900),
      ('POS_ADV','EG','EGP',64900),('POS_ADV','SA','SAR',16900),('POS_ADV','AE','AED',14900),
      ('KPI_DASHBOARD','EG','EGP',29900),('KPI_DASHBOARD','SA','SAR',7900),('KPI_DASHBOARD','AE','AED',6900),
      ('AUDIT_LOGS','EG','EGP',24900),('AUDIT_LOGS','SA','SAR',6900),('AUDIT_LOGS','AE','AED',5900),
      ('MULTI_BRANCH_PER_1','EG','EGP',29900),('MULTI_BRANCH_PER_1','SA','SAR',7900),('MULTI_BRANCH_PER_1','AE','AED',6900),
      ('PROACTIVE_ALERTS','EG','EGP',19900),('PROACTIVE_ALERTS','SA','SAR',4900),('PROACTIVE_ALERTS','AE','AED',4500),
      ('AUTONOMOUS_AGENT','EG','EGP',39900),('AUTONOMOUS_AGENT','SA','SAR',10900),('AUTONOMOUS_AGENT','AE','AED',9900)
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
  ROUND((abp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer,
  ROUND(((abp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer,
  true
FROM addon_base_prices abp
CROSS JOIN cycle_discounts cd;

-- ---------------------------------------------------------------------------
-- 4) Strict usage packs for bundle top-ups and BYO
-- ---------------------------------------------------------------------------
UPDATE usage_packs
SET is_active = false, updated_at = NOW();

INSERT INTO usage_packs (
  code,
  name,
  metric_key,
  tier_code,
  included_units,
  included_ai_calls_per_day,
  included_token_budget_daily,
  limit_deltas,
  metadata,
  is_active
)
VALUES
  ('AI_BOOST_S', 'AI Boost S', 'AI_CAPACITY', 'S', NULL, 300, 200000, '{"aiCallsPerDay":300,"tokenBudgetDaily":200000}'::jsonb, '{}'::jsonb, true),
  ('AI_BOOST_M', 'AI Boost M', 'AI_CAPACITY', 'M', NULL, 800, 500000, '{"aiCallsPerDay":800,"tokenBudgetDaily":500000}'::jsonb, '{}'::jsonb, true),
  ('AI_BOOST_L', 'AI Boost L', 'AI_CAPACITY', 'L', NULL, 2000, 1200000, '{"aiCallsPerDay":2000,"tokenBudgetDaily":1200000}'::jsonb, '{}'::jsonb, true),
  ('AI_BOOST_XL', 'AI Boost XL', 'AI_CAPACITY', 'XL', NULL, 5000, 3000000, '{"aiCallsPerDay":5000,"tokenBudgetDaily":3000000}'::jsonb, '{}'::jsonb, true),

  ('PROOF_S', 'Proof Checks S (100)', 'PAYMENT_PROOF_SCANS', 'S', 100, NULL, NULL, '{"paymentProofScansPerMonth":100}'::jsonb, '{}'::jsonb, true),
  ('PROOF_M', 'Proof Checks M (300)', 'PAYMENT_PROOF_SCANS', 'M', 300, NULL, NULL, '{"paymentProofScansPerMonth":300}'::jsonb, '{}'::jsonb, true),
  ('PROOF_L', 'Proof Checks L (800)', 'PAYMENT_PROOF_SCANS', 'L', 800, NULL, NULL, '{"paymentProofScansPerMonth":800}'::jsonb, '{}'::jsonb, true),
  ('PROOF_XL', 'Proof Checks XL (1500)', 'PAYMENT_PROOF_SCANS', 'XL', 1500, NULL, NULL, '{"paymentProofScansPerMonth":1500}'::jsonb, '{}'::jsonb, true),

  ('VOICE_S', 'Voice Minutes S (30)', 'VOICE_MINUTES', 'S', 30, NULL, NULL, '{"voiceMinutesPerMonth":30}'::jsonb, '{}'::jsonb, true),
  ('VOICE_M', 'Voice Minutes M (90)', 'VOICE_MINUTES', 'M', 90, NULL, NULL, '{"voiceMinutesPerMonth":90}'::jsonb, '{}'::jsonb, true),
  ('VOICE_L', 'Voice Minutes L (240)', 'VOICE_MINUTES', 'L', 240, NULL, NULL, '{"voiceMinutesPerMonth":240}'::jsonb, '{}'::jsonb, true),
  ('VOICE_XL', 'Voice Minutes XL (600)', 'VOICE_MINUTES', 'XL', 600, NULL, NULL, '{"voiceMinutesPerMonth":600}'::jsonb, '{}'::jsonb, true),

  ('TEMPLATE_S', 'Paid Templates S (100)', 'PAID_TEMPLATES', 'S', 100, NULL, NULL, '{"paidTemplatesPerMonth":100}'::jsonb, '{}'::jsonb, true),
  ('TEMPLATE_M', 'Paid Templates M (300)', 'PAID_TEMPLATES', 'M', 300, NULL, NULL, '{"paidTemplatesPerMonth":300}'::jsonb, '{}'::jsonb, true),
  ('TEMPLATE_L', 'Paid Templates L (1000)', 'PAID_TEMPLATES', 'L', 1000, NULL, NULL, '{"paidTemplatesPerMonth":1000}'::jsonb, '{}'::jsonb, true),

  ('MAPS_S', 'Maps Lookups S (500)', 'MAP_LOOKUPS', 'S', 500, NULL, NULL, '{"mapsLookupsPerMonth":500}'::jsonb, '{}'::jsonb, true),
  ('MAPS_M', 'Maps Lookups M (2000)', 'MAP_LOOKUPS', 'M', 2000, NULL, NULL, '{"mapsLookupsPerMonth":2000}'::jsonb, '{}'::jsonb, true),
  ('MAPS_L', 'Maps Lookups L (6000)', 'MAP_LOOKUPS', 'L', 6000, NULL, NULL, '{"mapsLookupsPerMonth":6000}'::jsonb, '{}'::jsonb, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  metric_key = EXCLUDED.metric_key,
  tier_code = EXCLUDED.tier_code,
  included_units = EXCLUDED.included_units,
  included_ai_calls_per_day = EXCLUDED.included_ai_calls_per_day,
  included_token_budget_daily = EXCLUDED.included_token_budget_daily,
  limit_deltas = EXCLUDED.limit_deltas,
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

DELETE FROM usage_pack_prices;

WITH usage_pack_prices_seed AS (
  SELECT up.id AS usage_pack_id, p.region_code, p.currency, p.price_cents
  FROM usage_packs up
  JOIN (
    VALUES
      ('AI_BOOST_S','EG','EGP',19900),('AI_BOOST_S','SA','SAR',5900),('AI_BOOST_S','AE','AED',5500),
      ('AI_BOOST_M','EG','EGP',39900),('AI_BOOST_M','SA','SAR',10900),('AI_BOOST_M','AE','AED',9900),
      ('AI_BOOST_L','EG','EGP',79900),('AI_BOOST_L','SA','SAR',21900),('AI_BOOST_L','AE','AED',19900),
      ('AI_BOOST_XL','EG','EGP',129900),('AI_BOOST_XL','SA','SAR',34900),('AI_BOOST_XL','AE','AED',31900),

      ('PROOF_S','EG','EGP',14900),('PROOF_S','SA','SAR',3900),('PROOF_S','AE','AED',3500),
      ('PROOF_M','EG','EGP',34900),('PROOF_M','SA','SAR',8900),('PROOF_M','AE','AED',7900),
      ('PROOF_L','EG','EGP',79900),('PROOF_L','SA','SAR',20900),('PROOF_L','AE','AED',18900),
      ('PROOF_XL','EG','EGP',129900),('PROOF_XL','SA','SAR',32900),('PROOF_XL','AE','AED',29900),

      ('VOICE_S','EG','EGP',9900),('VOICE_S','SA','SAR',2500),('VOICE_S','AE','AED',2300),
      ('VOICE_M','EG','EGP',24900),('VOICE_M','SA','SAR',5900),('VOICE_M','AE','AED',5500),
      ('VOICE_L','EG','EGP',54900),('VOICE_L','SA','SAR',12900),('VOICE_L','AE','AED',11900),
      ('VOICE_XL','EG','EGP',119900),('VOICE_XL','SA','SAR',27900),('VOICE_XL','AE','AED',25900),

      ('TEMPLATE_S','EG','EGP',49900),('TEMPLATE_S','SA','SAR',3900),('TEMPLATE_S','AE','AED',3900),
      ('TEMPLATE_M','EG','EGP',129900),('TEMPLATE_M','SA','SAR',9900),('TEMPLATE_M','AE','AED',9900),
      ('TEMPLATE_L','EG','EGP',399900),('TEMPLATE_L','SA','SAR',29900),('TEMPLATE_L','AE','AED',29900),

      ('MAPS_S','EG','EGP',9900),('MAPS_S','SA','SAR',2500),('MAPS_S','AE','AED',2300),
      ('MAPS_M','EG','EGP',24900),('MAPS_M','SA','SAR',5900),('MAPS_M','AE','AED',5500),
      ('MAPS_L','EG','EGP',54900),('MAPS_L','SA','SAR',12900),('MAPS_L','AE','AED',11900)
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
FROM usage_pack_prices_seed;

-- ---------------------------------------------------------------------------
-- 5) Sync legacy compatibility tables/merchant snapshots
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN
    UPDATE billing_plans
    SET limits = jsonb_strip_nulls(
      COALESCE(limits, '{}'::jsonb)
      || jsonb_build_object(
        'mapsLookupsPerMonth', CASE UPPER(code)
          WHEN 'STARTER' THEN 200
          WHEN 'GROWTH' THEN 600
          WHEN 'PRO' THEN 2000
          WHEN 'ENTERPRISE' THEN 6000
          ELSE NULL
        END,
        'posConnections', CASE UPPER(code)
          WHEN 'STARTER' THEN 0
          WHEN 'GROWTH' THEN 1
          WHEN 'PRO' THEN 3
          WHEN 'ENTERPRISE' THEN 5
          ELSE NULL
        END,
        'branches', CASE UPPER(code)
          WHEN 'STARTER' THEN 1
          WHEN 'GROWTH' THEN 1
          WHEN 'PRO' THEN 2
          WHEN 'ENTERPRISE' THEN 5
          ELSE NULL
        END
      )
    ),
    updated_at = NOW()
    WHERE UPPER(code) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
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
      SET plan_limits = jsonb_strip_nulls(
        COALESCE(plan_limits, '{}'::jsonb)
        || jsonb_build_object(
          'mapsLookupsPerMonth', CASE UPPER(COALESCE(plan, 'STARTER'))
            WHEN 'STARTER' THEN 200
            WHEN 'GROWTH' THEN 600
            WHEN 'PRO' THEN 2000
            WHEN 'ENTERPRISE' THEN 6000
            ELSE NULL
          END,
          'posConnections', CASE UPPER(COALESCE(plan, 'STARTER'))
            WHEN 'STARTER' THEN 0
            WHEN 'GROWTH' THEN 1
            WHEN 'PRO' THEN 3
            WHEN 'ENTERPRISE' THEN 5
            ELSE NULL
          END,
          'branches', CASE UPPER(COALESCE(plan, 'STARTER'))
            WHEN 'STARTER' THEN 1
            WHEN 'GROWTH' THEN 1
            WHEN 'PRO' THEN 2
            WHEN 'ENTERPRISE' THEN 5
            ELSE NULL
          END
        )
      )
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'limits'
    ) THEN
      UPDATE merchants
      SET limits = jsonb_strip_nulls(
        COALESCE(limits, '{}'::jsonb)
        || jsonb_build_object(
          'mapsLookupsPerMonth', CASE UPPER(COALESCE(plan, 'STARTER'))
            WHEN 'STARTER' THEN 200
            WHEN 'GROWTH' THEN 600
            WHEN 'PRO' THEN 2000
            WHEN 'ENTERPRISE' THEN 6000
            ELSE NULL
          END,
          'posConnections', CASE UPPER(COALESCE(plan, 'STARTER'))
            WHEN 'STARTER' THEN 0
            WHEN 'GROWTH' THEN 1
            WHEN 'PRO' THEN 3
            WHEN 'ENTERPRISE' THEN 5
            ELSE NULL
          END,
          'branches', CASE UPPER(COALESCE(plan, 'STARTER'))
            WHEN 'STARTER' THEN 1
            WHEN 'GROWTH' THEN 1
            WHEN 'PRO' THEN 2
            WHEN 'ENTERPRISE' THEN 5
            ELSE NULL
          END
        )
      )
      WHERE UPPER(COALESCE(plan, '')) IN ('STARTER','GROWTH','PRO','ENTERPRISE');
    END IF;
  END IF;
END $$;
