-- Migration 088
-- Add plan_prices and add_on_prices rows for Oman (OM/OMR) and Kuwait (KW/KWD)
-- Enables billing-catalog-service to serve the two new GCC markets.
--
-- Plan prices sourced from: analysis/pricing/pricebook_by_country.csv
-- Add-on prices scaled proportionally from SA prices using OM/KW plan-price ratios
--   OM ratio vs SA: 10.5 OMR / 105 SAR = 0.100x
--   KW ratio vs SA: 19.6 KWD / 105 SAR = 0.187x
-- NB: KW has no BASIC plan tier in the pricebook.

-- -----------------------------------------------------------------------------
-- 1) Plan prices — Oman (OMR)
-- Cycle discounts: 1→0%, 3→4%, 6→8%, 12→14%
-- -----------------------------------------------------------------------------
WITH om_base AS (
  SELECT p.id AS plan_id, rb.region_code, rb.currency, rb.base_price_cents
  FROM plans p
  JOIN (
    VALUES
      ('STARTER',    'OM', 'OMR',  1050),
      ('BASIC',      'OM', 'OMR',  2250),
      ('GROWTH',     'OM', 'OMR',  4950),
      ('PRO',        'OM', 'OMR', 10350),
      ('ENTERPRISE', 'OM', 'OMR', 22300)
  ) AS rb(plan_code, region_code, currency, base_price_cents)
    ON p.code = rb.plan_code
  WHERE p.is_bundle = true
),
om_cycles AS (
  SELECT 1  AS cycle_months, 0.00::numeric AS discount_percent UNION ALL
  SELECT 3,  4.00 UNION ALL
  SELECT 6,  8.00 UNION ALL
  SELECT 12, 14.00
)
INSERT INTO plan_prices (
  plan_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  b.plan_id,
  b.region_code,
  b.currency,
  c.cycle_months,
  b.base_price_cents,
  c.discount_percent,
  ROUND((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0))::integer,
  ROUND(((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0)) / c.cycle_months)::integer,
  false  -- OMR is VAT-exempt (Oman has 5% VAT but plans are shown ex-VAT)
FROM om_base b
CROSS JOIN om_cycles c
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
  SET currency                = EXCLUDED.currency,
      base_price_cents        = EXCLUDED.base_price_cents,
      discount_percent        = EXCLUDED.discount_percent,
      total_price_cents       = EXCLUDED.total_price_cents,
      effective_monthly_cents = EXCLUDED.effective_monthly_cents,
      updated_at              = NOW();

-- -----------------------------------------------------------------------------
-- 2) Plan prices — Kuwait (KWD)
-- No BASIC tier for KW. Cycle discounts: 1→0%, 3→5%, 6→9%, 12→15%
-- -----------------------------------------------------------------------------
WITH kw_base AS (
  SELECT p.id AS plan_id, rb.region_code, rb.currency, rb.base_price_cents
  FROM plans p
  JOIN (
    VALUES
      ('STARTER',    'KW', 'KWD',  1960),
      ('GROWTH',     'KW', 'KWD',  4280),
      ('PRO',        'KW', 'KWD',  8920),
      ('ENTERPRISE', 'KW', 'KWD', 19200)
  ) AS rb(plan_code, region_code, currency, base_price_cents)
    ON p.code = rb.plan_code
  WHERE p.is_bundle = true
),
kw_cycles AS (
  SELECT 1  AS cycle_months, 0.00::numeric AS discount_percent UNION ALL
  SELECT 3,  5.00 UNION ALL
  SELECT 6,  9.00 UNION ALL
  SELECT 12, 15.00
)
INSERT INTO plan_prices (
  plan_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  b.plan_id,
  b.region_code,
  b.currency,
  c.cycle_months,
  b.base_price_cents,
  c.discount_percent,
  ROUND((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0))::integer,
  ROUND(((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0)) / c.cycle_months)::integer,
  false
FROM kw_base b
CROSS JOIN kw_cycles c
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
  SET currency                = EXCLUDED.currency,
      base_price_cents        = EXCLUDED.base_price_cents,
      discount_percent        = EXCLUDED.discount_percent,
      total_price_cents       = EXCLUDED.total_price_cents,
      effective_monthly_cents = EXCLUDED.effective_monthly_cents,
      updated_at              = NOW();

-- -----------------------------------------------------------------------------
-- 3) Add-on prices — Oman (OMR)
-- Scaled from SA base prices at 0.100x ratio (matches OM/SA plan price ratio)
-- Cycle discounts: 1→0%, 3→4%, 6→8%, 12→14%
-- -----------------------------------------------------------------------------
WITH om_addon_base AS (
  SELECT a.id AS addon_id, ab.region_code, ab.currency, ab.base_price_cents
  FROM add_ons a
  JOIN (
    VALUES
      ('PLATFORM_CORE',              'OM', 'OMR',  1890),
      ('INVENTORY_BASIC',            'OM', 'OMR',   490),
      ('FINANCE_BASIC',              'OM', 'OMR',   490),
      ('TEAM_UPTO3',                 'OM', 'OMR',   690),
      ('POS_INTEGRATIONS_BASIC',     'OM', 'OMR',   890),
      ('POS_INTEGRATIONS_ADVANCED',  'OM', 'OMR',  1690),
      ('KPI_DASHBOARD',              'OM', 'OMR',   790),
      ('AUDIT_LOGS',                 'OM', 'OMR',   690),
      ('MULTI_BRANCH_EXTRA',         'OM', 'OMR',   790)
  ) AS ab(addon_code, region_code, currency, base_price_cents)
    ON a.code = ab.addon_code
),
om_addon_cycles AS (
  SELECT 1  AS cycle_months, 0.00::numeric AS discount_percent UNION ALL
  SELECT 3,  4.00 UNION ALL
  SELECT 6,  8.00 UNION ALL
  SELECT 12, 14.00
)
INSERT INTO add_on_prices (
  addon_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  b.addon_id,
  b.region_code,
  b.currency,
  c.cycle_months,
  b.base_price_cents,
  c.discount_percent,
  ROUND((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0))::integer,
  ROUND(((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0)) / c.cycle_months)::integer,
  false
FROM om_addon_base b
CROSS JOIN om_addon_cycles c
ON CONFLICT (addon_id, region_code, cycle_months) DO UPDATE
  SET currency                = EXCLUDED.currency,
      base_price_cents        = EXCLUDED.base_price_cents,
      discount_percent        = EXCLUDED.discount_percent,
      total_price_cents       = EXCLUDED.total_price_cents,
      effective_monthly_cents = EXCLUDED.effective_monthly_cents,
      updated_at              = NOW();

-- -----------------------------------------------------------------------------
-- 4) Add-on prices — Kuwait (KWD)
-- Scaled from SA base prices at 0.187x ratio (matches KW/SA plan price ratio)
-- Cycle discounts: 1→0%, 3→5%, 6→9%, 12→15%
-- -----------------------------------------------------------------------------
WITH kw_addon_base AS (
  SELECT a.id AS addon_id, ab.region_code, ab.currency, ab.base_price_cents
  FROM add_ons a
  JOIN (
    VALUES
      ('PLATFORM_CORE',              'KW', 'KWD',  3530),
      ('INVENTORY_BASIC',            'KW', 'KWD',   920),
      ('FINANCE_BASIC',              'KW', 'KWD',   920),
      ('TEAM_UPTO3',                 'KW', 'KWD',  1290),
      ('POS_INTEGRATIONS_BASIC',     'KW', 'KWD',  1660),
      ('POS_INTEGRATIONS_ADVANCED',  'KW', 'KWD',  3160),
      ('KPI_DASHBOARD',              'KW', 'KWD',  1480),
      ('AUDIT_LOGS',                 'KW', 'KWD',  1290),
      ('MULTI_BRANCH_EXTRA',         'KW', 'KWD',  1480)
  ) AS ab(addon_code, region_code, currency, base_price_cents)
    ON a.code = ab.addon_code
),
kw_addon_cycles AS (
  SELECT 1  AS cycle_months, 0.00::numeric AS discount_percent UNION ALL
  SELECT 3,  5.00 UNION ALL
  SELECT 6,  9.00 UNION ALL
  SELECT 12, 15.00
)
INSERT INTO add_on_prices (
  addon_id, region_code, currency, cycle_months,
  base_price_cents, discount_percent, total_price_cents, effective_monthly_cents, vat_included
)
SELECT
  b.addon_id,
  b.region_code,
  b.currency,
  c.cycle_months,
  b.base_price_cents,
  c.discount_percent,
  ROUND((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0))::integer,
  ROUND(((b.base_price_cents * c.cycle_months) * (1 - c.discount_percent / 100.0)) / c.cycle_months)::integer,
  false
FROM kw_addon_base b
CROSS JOIN kw_addon_cycles c
ON CONFLICT (addon_id, region_code, cycle_months) DO UPDATE
  SET currency                = EXCLUDED.currency,
      base_price_cents        = EXCLUDED.base_price_cents,
      discount_percent        = EXCLUDED.discount_percent,
      total_price_cents       = EXCLUDED.total_price_cents,
      effective_monthly_cents = EXCLUDED.effective_monthly_cents,
      updated_at              = NOW();
