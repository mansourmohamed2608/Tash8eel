-- Migration 094
-- Enforce the authoritative pricebook as defined in analysis/pricing/.
--
-- Background
-- ----------
-- Migration 093 introduced add-on prices that diverged from the independently
-- authored pricebook (analysis/pricing/features_pricebook_by_country.csv and
-- analysis/pricing/pricebook_by_country.csv).  Migration 089 also set AE cycle
-- discounts to 6/11/18 % whereas the pricebook specifies 5/10/15 % for AE plans.
--
-- This migration makes the DB match the pricebook, which is the authoritative
-- source of truth.  Changes are in two sections:
--
--   1) plan_prices — AE cycle discounts corrected: 6/11/18 % → 5/10/15 %
--   2) add_on_prices — 47 rows in EG and AE corrected to pricebook values
--
-- No OM or KW rows are changed; those were added in migration 088/093 without
-- a corresponding pricebook entry and are left as-is.
--
-- Note on discount schedules
-- --------------------------
-- AE plan cycle discounts (pricebook_by_country.csv) are 0/5/10/15 %.
-- AE add-on cycle discounts (features_pricebook_by_country.csv) are 0/6/11/18 %.
-- These are intentionally different: add-ons carry a slightly more aggressive
-- multi-cycle incentive because they are optional upsells that benefit from
-- stronger long-term commitment signals.
--
-- Note on base_price_cents
-- ------------------------
-- Following the convention established by migration 093, base_price_cents is
-- stored as ROUND(total_price_cents / cycle_months) — the effective monthly rate
-- after any cycle discount.  The pricebook's discount_pct column is informational
-- and is not mathematically consistent enough across cycles to back-compute a
-- clean undiscounted base (the totals were authored directly, not derived from a
-- single base price × discount formula).  This is consistent with how 093 inserts
-- rows and with how the application reads effective pricing.

-- =============================================================================
-- 1) Plan prices — UAE (AED): restore 5/10/15 % cycle discounts
--    (was incorrectly set to 6/11/18 % by migration 089)
-- =============================================================================
UPDATE plan_prices pp
SET
  discount_percent      = c.discount_percent,
  total_price_cents     = ROUND(pp.base_price_cents * c.cycle_months * (1 - c.discount_percent / 100.0))::integer,
  effective_monthly_cents = ROUND((pp.base_price_cents * c.cycle_months * (1 - c.discount_percent / 100.0)) / c.cycle_months)::integer,
  updated_at            = NOW()
FROM (VALUES
  (1,  0::numeric),
  (3,  5::numeric),
  (6,  10::numeric),
  (12, 15::numeric)
) AS c(cycle_months, discount_percent)
WHERE pp.region_code = 'AE'
  AND pp.cycle_months = c.cycle_months;

-- =============================================================================
-- 2) Add-on prices — correct 47 rows to match pricebook values
-- =============================================================================
-- Strategy: join add_ons on code, then do a targeted UPDATE per (addon_id,
-- region_code, cycle_months) using the pricebook total_price_cents.
-- base_price_cents and effective_monthly_cents are derived from the total.

WITH corrections AS (
  SELECT
    a.id         AS addon_id,
    s.region_code,
    s.cycle_months,
    s.total_price_cents,
    s.discount_percent,
    ROUND(s.total_price_cents::numeric / s.cycle_months)::integer AS base_price_cents,
    ROUND(s.total_price_cents::numeric / s.cycle_months)::integer AS effective_monthly_cents
  FROM add_ons a
  JOIN (VALUES
    -- ── Egypt (EGP) ──────────────────────────────────────────────────────────
    -- ANOMALY_MONITOR: 3 / 6 / 12 month totals corrected
    ('ANOMALY_MONITOR',  'EG', 3,  195000, 2),
    ('ANOMALY_MONITOR',  'EG', 6,  378000, 4),
    ('ANOMALY_MONITOR',  'EG', 12, 731500, 7),
    -- API_WEBHOOKS: all 4 cycles corrected (was badly underpriced in mig 093)
    ('API_WEBHOOKS',     'EG', 1,   49000, 0),
    ('API_WEBHOOKS',     'EG', 3,  145000, 2),
    ('API_WEBHOOKS',     'EG', 6,  284000, 4),
    ('API_WEBHOOKS',     'EG', 12, 550000, 7),
    -- MULTI_BRANCH: per-branch pricing — no cycle discount, 299 EGP/branch/mo
    ('MULTI_BRANCH',     'EG', 1,   29900, 0),
    ('MULTI_BRANCH',     'EG', 3,   89700, 0),
    ('MULTI_BRANCH',     'EG', 6,  179400, 0),
    ('MULTI_BRANCH',     'EG', 12, 358800, 0),
    -- TEAM_SEAT_EXPANSION: per-seat pricing — no cycle discount, 199 EGP/seat/mo
    ('TEAM_SEAT_EXPANSION', 'EG', 1,   19900, 0),
    ('TEAM_SEAT_EXPANSION', 'EG', 3,   59700, 0),
    ('TEAM_SEAT_EXPANSION', 'EG', 6,  119400, 0),
    ('TEAM_SEAT_EXPANSION', 'EG', 12, 238800, 0),

    -- ── UAE (AED) ────────────────────────────────────────────────────────────
    -- ANOMALY_MONITOR
    ('ANOMALY_MONITOR',     'AE', 3,  20000, 6),
    -- API_WEBHOOKS
    ('API_WEBHOOKS',        'AE', 1,  4500,  0),
    ('API_WEBHOOKS',        'AE', 3,  12500, 6),
    ('API_WEBHOOKS',        'AE', 6,  23500, 11),
    ('API_WEBHOOKS',        'AE', 12, 43000, 18),
    -- AUTONOMOUS_AGENT
    ('AUTONOMOUS_AGENT',    'AE', 1,  18000, 0),
    ('AUTONOMOUS_AGENT',    'AE', 6,  98500, 11),
    ('AUTONOMOUS_AGENT',    'AE', 12, 181000, 18),
    -- COPILOT_VOICE_NOTES
    ('COPILOT_VOICE_NOTES', 'AE', 12, 76500, 18),
    -- COPILOT_WORKFLOWS
    ('COPILOT_WORKFLOWS',   'AE', 6,  56500, 11),
    ('COPILOT_WORKFLOWS',   'AE', 12, 103500, 18),
    -- DAILY_REPORTS
    ('DAILY_REPORTS',       'AE', 3,  12500, 6),
    ('DAILY_REPORTS',       'AE', 6,  23500, 11),
    ('DAILY_REPORTS',       'AE', 12, 43500, 18),
    -- FINANCE_AUTOMATION
    ('FINANCE_AUTOMATION',  'AE', 1,  9000,  0),
    ('FINANCE_AUTOMATION',  'AE', 3,  25000, 6),
    ('FINANCE_AUTOMATION',  'AE', 6,  47000, 11),
    ('FINANCE_AUTOMATION',  'AE', 12, 86500, 18),
    -- FOLLOWUP_AUTOMATIONS
    ('FOLLOWUP_AUTOMATIONS','AE', 1,  5500,  0),
    ('FOLLOWUP_AUTOMATIONS','AE', 6,  30000, 11),
    ('FOLLOWUP_AUTOMATIONS','AE', 12, 55500, 18),
    -- INVENTORY_INSIGHTS
    ('INVENTORY_INSIGHTS',  'AE', 3,  27000, 6),
    ('INVENTORY_INSIGHTS',  'AE', 6,  51500, 11),
    ('INVENTORY_INSIGHTS',  'AE', 12, 94500, 18),
    -- MULTI_BRANCH
    ('MULTI_BRANCH',        'AE', 6,  66500, 11),
    ('MULTI_BRANCH',        'AE', 12, 123000, 18),
    -- PAYMENT_LINKS
    ('PAYMENT_LINKS',       'AE', 6,  26000, 11),
    ('PAYMENT_LINKS',       'AE', 12, 48000, 18),
    -- TEAM_SEAT_EXPANSION
    ('TEAM_SEAT_EXPANSION', 'AE', 1,  3200,  0),
    ('TEAM_SEAT_EXPANSION', 'AE', 3,  9000,  6),
    ('TEAM_SEAT_EXPANSION', 'AE', 6,  17000, 11),
    ('TEAM_SEAT_EXPANSION', 'AE', 12, 31500, 18)
  ) AS s(code, region_code, cycle_months, total_price_cents, discount_percent)
    ON a.code = s.code
)
UPDATE add_on_prices aop
SET
  base_price_cents        = c.base_price_cents,
  discount_percent        = c.discount_percent,
  total_price_cents       = c.total_price_cents,
  effective_monthly_cents = c.effective_monthly_cents,
  updated_at              = NOW()
FROM corrections c
WHERE aop.addon_id    = c.addon_id
  AND aop.region_code = c.region_code
  AND aop.cycle_months = c.cycle_months;
