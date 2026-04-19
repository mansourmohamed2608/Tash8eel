-- Migration 089
-- 1) Add BASIC plan to the `plans` table (tier_rank=2); shift GROWTH→3, PRO→4, ENTERPRISE→5
-- 2) Add plan_limits and plan_entitlements for BASIC
-- 3) Update EG plan_prices to correct new prices for STARTER/GROWTH/PRO/ENTERPRISE
-- 4) Update SA and AE plan_prices to correct new prices
-- 5) Add BASIC plan_prices for EG, SA, AE, OM  (KW has no BASIC tier)
--
-- Prices reference: analysis/pricing/pricebook_by_country.csv
-- EG (EGP cents):  STARTER=99900 BASIC=220000 GROWTH=480000 PRO=1000000 ENTERPRISE=2150000
-- SA (SAR cents):  STARTER=10500 BASIC=23000  GROWTH=51000  PRO=106000  ENTERPRISE=228000
-- AE (AED cents):  STARTER=11000 BASIC=24500  GROWTH=53000  PRO=110500  ENTERPRISE=238000
-- OM (OMR cents):  BASIC=2250  (rest already correct from migration 088)
-- KW: no BASIC tier

-- -----------------------------------------------------------------------------
-- Step 1: Shift tier_ranks up for GROWTH, PRO, ENTERPRISE to make room for BASIC at 2
-- -----------------------------------------------------------------------------
UPDATE plans
SET tier_rank = tier_rank + 1,
    updated_at = NOW()
WHERE code IN ('GROWTH', 'PRO', 'ENTERPRISE')
  AND is_bundle = true;

-- -----------------------------------------------------------------------------
-- Step 2: Insert BASIC plan
-- -----------------------------------------------------------------------------
INSERT INTO plans (code, name, tier_rank, description, is_bundle, is_active, metadata)
VALUES (
  'BASIC',
  'Basic',
  2,
  'Basic bundle',
  true,
  true,
  '{"allPlansIncludeCopilot": true}'::jsonb
)
ON CONFLICT (code) DO UPDATE
SET
  name       = EXCLUDED.name,
  tier_rank  = EXCLUDED.tier_rank,
  description = EXCLUDED.description,
  is_bundle  = EXCLUDED.is_bundle,
  is_active  = EXCLUDED.is_active,
  metadata   = EXCLUDED.metadata,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Step 3: Add plan_limits for BASIC
-- -----------------------------------------------------------------------------
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
  p.id,
  15000,   -- messages_per_month
  1,       -- whatsapp_numbers
  1,       -- team_members
  200,     -- ai_calls_per_day
  200000,  -- token_budget_daily
  15,      -- paid_templates_per_month
  50,      -- payment_proof_scans_per_month
  0,       -- voice_minutes_per_month
  '{}'::jsonb
FROM plans p
WHERE p.code = 'BASIC'
ON CONFLICT (plan_id) DO UPDATE
SET
  messages_per_month            = EXCLUDED.messages_per_month,
  whatsapp_numbers              = EXCLUDED.whatsapp_numbers,
  team_members                  = EXCLUDED.team_members,
  ai_calls_per_day              = EXCLUDED.ai_calls_per_day,
  token_budget_daily            = EXCLUDED.token_budget_daily,
  paid_templates_per_month      = EXCLUDED.paid_templates_per_month,
  payment_proof_scans_per_month = EXCLUDED.payment_proof_scans_per_month,
  voice_minutes_per_month       = EXCLUDED.voice_minutes_per_month,
  updated_at                    = NOW();

-- -----------------------------------------------------------------------------
-- Step 4: Add plan_entitlements for BASIC
-- -----------------------------------------------------------------------------
WITH basic_features AS (
  SELECT p.id AS plan_id, f.feature_key, f.feature_label, f.feature_tier
  FROM plans p
  CROSS JOIN (
    VALUES
      ('CONVERSATIONS',  'Conversations',          'CORE'),
      ('ORDERS',         'Orders',                 'CORE'),
      ('CATALOG',        'Catalog',                'CORE'),
      ('INVENTORY',      'Inventory basic',        'BASIC'),
      ('REPORTS',        'Finance basic',          'BASIC'),
      ('NOTIFICATIONS',  'Notifications',          'CORE'),
      ('PAYMENTS',       'Payment Proof Verification', 'BASIC'),
      ('WEBHOOKS',       'POS Integrations',       'BASIC'),
      ('API_ACCESS',     'API access',             'BASIC'),
      ('COPILOT_CHAT',   'Copilot chat',           'CORE')
  ) AS f(feature_key, feature_label, feature_tier)
  WHERE p.code = 'BASIC'
)
INSERT INTO plan_entitlements (plan_id, feature_key, feature_label, feature_tier, is_included)
SELECT plan_id, feature_key, feature_label, feature_tier, true
FROM basic_features
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
  feature_label = EXCLUDED.feature_label,
  feature_tier  = EXCLUDED.feature_tier,
  is_included   = true,
  updated_at    = NOW();

-- -----------------------------------------------------------------------------
-- Step 5: Update existing EG plan_prices to new correct values (all 4 cycle rows)
-- Cycle discounts used in migration 071: 1→0%, 3→5%, 6→10%, 12→15%
-- New EG base prices (cents):
--   STARTER    = 99900 (unchanged, just re-confirm)
--   GROWTH     = 480000
--   PRO        = 1000000
--   ENTERPRISE = 2150000
-- -----------------------------------------------------------------------------
WITH cycle_discounts AS (
  SELECT 1  AS cycle_months, 0.00::numeric  AS discount_percent UNION ALL
  SELECT 3,  5.00 UNION ALL
  SELECT 6,  10.00 UNION ALL
  SELECT 12, 15.00
),
eg_prices AS (
  SELECT p.id AS plan_id, v.base_price_cents
  FROM plans p
  JOIN (VALUES
    ('STARTER',     99900),
    ('GROWTH',     480000),
    ('PRO',       1000000),
    ('ENTERPRISE', 2150000)
  ) AS v(plan_code, base_price_cents) ON p.code = v.plan_code
  WHERE p.is_bundle = true
)
INSERT INTO plan_prices (
  plan_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  ep.plan_id,
  'EG',
  'EGP',
  cd.cycle_months,
  ep.base_price_cents,
  cd.discount_percent,
  ROUND((ep.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer,
  ROUND(((ep.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer,
  true
FROM eg_prices ep
CROSS JOIN cycle_discounts cd
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
SET
  currency                = EXCLUDED.currency,
  base_price_cents        = EXCLUDED.base_price_cents,
  discount_percent        = EXCLUDED.discount_percent,
  total_price_cents       = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  updated_at              = NOW();

-- -----------------------------------------------------------------------------
-- Step 6: Update SA plan_prices to new correct values
-- Cycle discounts: 1→0%, 3→5%, 6→10%, 12→15%
-- New SA base prices (SAR cents):
--   STARTER    = 10500
--   GROWTH     = 51000
--   PRO        = 106000
--   ENTERPRISE = 228000
-- -----------------------------------------------------------------------------
WITH cycle_discounts AS (
  SELECT 1  AS cycle_months, 0.00::numeric AS discount_percent UNION ALL
  SELECT 3,  5.00 UNION ALL
  SELECT 6,  10.00 UNION ALL
  SELECT 12, 15.00
),
sa_prices AS (
  SELECT p.id AS plan_id, v.base_price_cents
  FROM plans p
  JOIN (VALUES
    ('STARTER',   10500),
    ('GROWTH',    51000),
    ('PRO',      106000),
    ('ENTERPRISE',228000)
  ) AS v(plan_code, base_price_cents) ON p.code = v.plan_code
  WHERE p.is_bundle = true
)
INSERT INTO plan_prices (
  plan_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  sp.plan_id,
  'SA',
  'SAR',
  cd.cycle_months,
  sp.base_price_cents,
  cd.discount_percent,
  ROUND((sp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer,
  ROUND(((sp.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer,
  false
FROM sa_prices sp
CROSS JOIN cycle_discounts cd
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
SET
  currency                = EXCLUDED.currency,
  base_price_cents        = EXCLUDED.base_price_cents,
  discount_percent        = EXCLUDED.discount_percent,
  total_price_cents       = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  updated_at              = NOW();

-- -----------------------------------------------------------------------------
-- Step 7: Update AE plan_prices to new correct values
-- Cycle discounts: 1→0%, 3→6%, 6→11%, 12→18%  (AE-specific from 088/CYCLE_DISCOUNTS)
-- New AE base prices (AED cents):
--   STARTER    = 11000
--   GROWTH     = 53000
--   PRO        = 110500
--   ENTERPRISE = 238000
-- -----------------------------------------------------------------------------
WITH cycle_discounts AS (
  SELECT 1  AS cycle_months, 0.00::numeric AS discount_percent UNION ALL
  SELECT 3,  6.00 UNION ALL
  SELECT 6,  11.00 UNION ALL
  SELECT 12, 18.00
),
ae_prices AS (
  SELECT p.id AS plan_id, v.base_price_cents
  FROM plans p
  JOIN (VALUES
    ('STARTER',   11000),
    ('GROWTH',    53000),
    ('PRO',      110500),
    ('ENTERPRISE',238000)
  ) AS v(plan_code, base_price_cents) ON p.code = v.plan_code
  WHERE p.is_bundle = true
)
INSERT INTO plan_prices (
  plan_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  ap.plan_id,
  'AE',
  'AED',
  cd.cycle_months,
  ap.base_price_cents,
  cd.discount_percent,
  ROUND((ap.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer,
  ROUND(((ap.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer,
  false
FROM ae_prices ap
CROSS JOIN cycle_discounts cd
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
SET
  currency                = EXCLUDED.currency,
  base_price_cents        = EXCLUDED.base_price_cents,
  discount_percent        = EXCLUDED.discount_percent,
  total_price_cents       = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  updated_at              = NOW();

-- -----------------------------------------------------------------------------
-- Step 8: Insert BASIC plan_prices for EG, SA, AE, OM
-- EG: base=220000 EGP cents, discounts 0/5/10/15%
-- SA: base=23000  SAR cents, discounts 0/5/10/15%
-- AE: base=24500  AED cents, discounts 0/6/11/18%
-- OM: base=2250   OMR cents, discounts 0/4/8/14%  (mirror of 088 OM cycle discounts)
-- KW: no BASIC tier
-- -----------------------------------------------------------------------------
WITH basic_regional AS (
  SELECT p.id AS plan_id,
         v.region_code,
         v.currency,
         v.base_price_cents,
         v.vat_included
  FROM plans p
  JOIN (VALUES
    ('EG', 'EGP', 220000, true),
    ('SA', 'SAR',  23000, false),
    ('AE', 'AED',  24500, false),
    ('OM', 'OMR',   2250, false)
  ) AS v(region_code, currency, base_price_cents, vat_included)
  ON true
  WHERE p.code = 'BASIC' AND p.is_bundle = true
),
cycle_discounts_by_region AS (
  SELECT 'EG' AS region_code, 1  AS cycle_months, 0.00::numeric  AS discount_percent UNION ALL
  SELECT 'EG',  3,  5.00 UNION ALL SELECT 'EG',  6, 10.00 UNION ALL SELECT 'EG', 12, 15.00 UNION ALL
  SELECT 'SA',  1,  0.00 UNION ALL SELECT 'SA',  3,  5.00 UNION ALL SELECT 'SA',  6, 10.00 UNION ALL SELECT 'SA', 12, 15.00 UNION ALL
  SELECT 'AE',  1,  0.00 UNION ALL SELECT 'AE',  3,  6.00 UNION ALL SELECT 'AE',  6, 11.00 UNION ALL SELECT 'AE', 12, 18.00 UNION ALL
  SELECT 'OM',  1,  0.00 UNION ALL SELECT 'OM',  3,  4.00 UNION ALL SELECT 'OM',  6,  8.00 UNION ALL SELECT 'OM', 12, 14.00
)
INSERT INTO plan_prices (
  plan_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  br.plan_id,
  br.region_code,
  br.currency,
  cd.cycle_months,
  br.base_price_cents,
  cd.discount_percent,
  ROUND((br.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer,
  ROUND(((br.base_price_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer,
  br.vat_included
FROM basic_regional br
JOIN cycle_discounts_by_region cd ON cd.region_code = br.region_code
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
SET
  currency                = EXCLUDED.currency,
  base_price_cents        = EXCLUDED.base_price_cents,
  discount_percent        = EXCLUDED.discount_percent,
  total_price_cents       = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  vat_included            = EXCLUDED.vat_included,
  updated_at              = NOW();
