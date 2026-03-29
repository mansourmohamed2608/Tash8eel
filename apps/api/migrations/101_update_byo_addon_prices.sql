-- Migration 101
-- BYO add-on and top-up repricing.

UPDATE usage_packs
SET is_active = false,
    updated_at = NOW()
WHERE code IN ('AI_CAPACITY_L', 'AI_CAPACITY_XL');

WITH usage_price_seed AS (
  SELECT * FROM (
    VALUES
      ('AI_CAPACITY_S',    'EG', 'EGP',  19900),
      ('AI_CAPACITY_S',    'AE', 'AED',   2000),
      ('AI_CAPACITY_S',    'SA', 'SAR',   2000),
      ('AI_CAPACITY_M',    'EG', 'EGP',  39900),
      ('AI_CAPACITY_M',    'AE', 'AED',   4000),
      ('AI_CAPACITY_M',    'SA', 'SAR',   4000),
      ('VOICE_MINUTES_S',  'EG', 'EGP',   9900),
      ('VOICE_MINUTES_S',  'AE', 'AED',   1000),
      ('VOICE_MINUTES_S',  'SA', 'SAR',   1000),
      ('VOICE_MINUTES_M',  'EG', 'EGP',  24900),
      ('VOICE_MINUTES_M',  'AE', 'AED',   2500),
      ('VOICE_MINUTES_M',  'SA', 'SAR',   2500),
      ('VOICE_MINUTES_L',  'EG', 'EGP',  54900),
      ('VOICE_MINUTES_L',  'AE', 'AED',   5500),
      ('VOICE_MINUTES_L',  'SA', 'SAR',   5500),
      ('VOICE_MINUTES_XL', 'EG', 'EGP', 119900),
      ('VOICE_MINUTES_XL', 'AE', 'AED',  12000),
      ('VOICE_MINUTES_XL', 'SA', 'SAR',  12000),
      ('PROOF_CHECKS_S',   'EG', 'EGP',  14900),
      ('PROOF_CHECKS_S',   'AE', 'AED',   1500),
      ('PROOF_CHECKS_S',   'SA', 'SAR',   1500),
      ('PROOF_CHECKS_M',   'EG', 'EGP',  34900),
      ('PROOF_CHECKS_M',   'AE', 'AED',   3500),
      ('PROOF_CHECKS_M',   'SA', 'SAR',   3500),
      ('PROOF_CHECKS_L',   'EG', 'EGP',  79900),
      ('PROOF_CHECKS_L',   'AE', 'AED',   8000),
      ('PROOF_CHECKS_L',   'SA', 'SAR',   8000),
      ('PROOF_CHECKS_XL',  'EG', 'EGP', 129900),
      ('PROOF_CHECKS_XL',  'AE', 'AED',  13000),
      ('PROOF_CHECKS_XL',  'SA', 'SAR',  13000),
      ('MAPS_S',           'EG', 'EGP',   9900),
      ('MAPS_S',           'AE', 'AED',   1000),
      ('MAPS_S',           'SA', 'SAR',   1000),
      ('MAPS_M',           'EG', 'EGP',  24900),
      ('MAPS_M',           'AE', 'AED',   2500),
      ('MAPS_M',           'SA', 'SAR',   2500),
      ('MAPS_L',           'EG', 'EGP',  54900),
      ('MAPS_L',           'AE', 'AED',   5500),
      ('MAPS_L',           'SA', 'SAR',   5500),
      ('PAID_TEMPLATES_S', 'EG', 'EGP',  49900),
      ('PAID_TEMPLATES_S', 'AE', 'AED',   5000),
      ('PAID_TEMPLATES_S', 'SA', 'SAR',   5000),
      ('PAID_TEMPLATES_M', 'EG', 'EGP', 179900),
      ('PAID_TEMPLATES_M', 'AE', 'AED',  18000),
      ('PAID_TEMPLATES_M', 'SA', 'SAR',  18000),
      ('PAID_TEMPLATES_L', 'EG', 'EGP', 399900),
      ('PAID_TEMPLATES_L', 'AE', 'AED',  40000),
      ('PAID_TEMPLATES_L', 'SA', 'SAR',  40000)
  ) AS v(code, region_code, currency, price_cents)
)
INSERT INTO usage_pack_prices (usage_pack_id, region_code, currency, price_cents, vat_included)
SELECT up.id, seed.region_code, seed.currency, seed.price_cents, true
FROM usage_packs up
JOIN usage_price_seed seed ON seed.code = up.code
ON CONFLICT (usage_pack_id, region_code) DO UPDATE
SET
  currency = EXCLUDED.currency,
  price_cents = EXCLUDED.price_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();

WITH cycle_discounts AS (
  SELECT 1 AS cycle_months, 0::numeric AS discount_percent
  UNION ALL SELECT 3, 5::numeric
  UNION ALL SELECT 6, 10::numeric
  UNION ALL SELECT 12, 15::numeric
),
addon_seed AS (
  SELECT * FROM (
    VALUES
      ('PLATFORM_CORE',             'EG', 'EGP', 89900),
      ('PLATFORM_CORE',             'AE', 'AED',  9000),
      ('PLATFORM_CORE',             'SA', 'SAR',  9000),
      ('INVENTORY_BASIC',           'EG', 'EGP', 19900),
      ('INVENTORY_BASIC',           'AE', 'AED',  2000),
      ('INVENTORY_BASIC',           'SA', 'SAR',  2000),
      ('FINANCE_BASIC',             'EG', 'EGP', 19900),
      ('FINANCE_BASIC',             'AE', 'AED',  2000),
      ('FINANCE_BASIC',             'SA', 'SAR',  2000),
      ('AUDIT_LOGS',                'EG', 'EGP', 24900),
      ('AUDIT_LOGS',                'AE', 'AED',  2500),
      ('AUDIT_LOGS',                'SA', 'SAR',  2500),
      ('KPI_DASHBOARD',             'EG', 'EGP', 29900),
      ('KPI_DASHBOARD',             'AE', 'AED',  3000),
      ('KPI_DASHBOARD',             'SA', 'SAR',  3000),
      ('TEAM_UP_TO_3',              'EG', 'EGP', 24900),
      ('TEAM_UP_TO_3',              'AE', 'AED',  2500),
      ('TEAM_UP_TO_3',              'SA', 'SAR',  2500),
      ('TEAM_UPTO3',                'EG', 'EGP', 24900),
      ('TEAM_UPTO3',                'AE', 'AED',  2500),
      ('TEAM_UPTO3',                'SA', 'SAR',  2500),
      ('POS_BASIC',                 'EG', 'EGP', 14900),
      ('POS_BASIC',                 'AE', 'AED',  1500),
      ('POS_BASIC',                 'SA', 'SAR',  1500),
      ('POS_INTEGRATIONS_BASIC',    'EG', 'EGP', 14900),
      ('POS_INTEGRATIONS_BASIC',    'AE', 'AED',  1500),
      ('POS_INTEGRATIONS_BASIC',    'SA', 'SAR',  1500),
      ('POS_ADV',                   'EG', 'EGP', 24900),
      ('POS_ADV',                   'AE', 'AED',  2500),
      ('POS_ADV',                   'SA', 'SAR',  2500),
      ('POS_INTEGRATIONS_ADVANCED', 'EG', 'EGP', 24900),
      ('POS_INTEGRATIONS_ADVANCED', 'AE', 'AED',  2500),
      ('POS_INTEGRATIONS_ADVANCED', 'SA', 'SAR',  2500),
      ('MULTI_BRANCH_PER_1',        'EG', 'EGP', 29900),
      ('MULTI_BRANCH_PER_1',        'AE', 'AED',  3000),
      ('MULTI_BRANCH_PER_1',        'SA', 'SAR',  3000),
      ('MULTI_BRANCH_EXTRA',        'EG', 'EGP', 29900),
      ('MULTI_BRANCH_EXTRA',        'AE', 'AED',  3000),
      ('MULTI_BRANCH_EXTRA',        'SA', 'SAR',  3000),
      ('MULTI_BRANCH',              'EG', 'EGP', 29900),
      ('MULTI_BRANCH',              'AE', 'AED',  3000),
      ('MULTI_BRANCH',              'SA', 'SAR',  3000),
      ('WHATSAPP_BROADCASTS',       'EG', 'EGP', 49900),
      ('WHATSAPP_BROADCASTS',       'AE', 'AED',  5000),
      ('WHATSAPP_BROADCASTS',       'SA', 'SAR',  5000)
  ) AS v(code, region_code, currency, monthly_cents)
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
  a.id,
  seed.region_code,
  seed.currency,
  cd.cycle_months,
  seed.monthly_cents,
  cd.discount_percent,
  ROUND((seed.monthly_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer,
  ROUND(((seed.monthly_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer,
  true
FROM add_ons a
JOIN addon_seed seed ON seed.code = a.code
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
