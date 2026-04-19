-- Migration 098
-- Production plan limits, prices, and starter entitlement lock-down.

ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS monthly_conversations_egypt INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_conversations_gulf INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_conversations_included INTEGER,
  ADD COLUMN IF NOT EXISTS daily_ai_responses INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_ai_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_copilot_calls INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_voice_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_payment_proofs INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_broadcasts INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_map_searches INTEGER,
  ADD COLUMN IF NOT EXISTS overage_rate_aed DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS overage_rate_sar DECIMAL(10,4);

WITH target_limits AS (
  SELECT *
  FROM (
    VALUES
      ('STARTER',    1200, 1000, 1000,   30,   200,      0,   0,    0,   0,    0,      2,      1, 0.30::decimal(10,4), 0.25::decimal(10,4)),
      ('BASIC',      1500, 1200, 1200,   80,   500,     50,  30,   20,  15,   20,      3,      1, 0.28::decimal(10,4), 0.23::decimal(10,4)),
      ('GROWTH',     3500, 2000, 2000,  200,  2000,    200,  80,   80,  40,   60,      7,      2, 0.25::decimal(10,4), 0.21::decimal(10,4)),
      ('PRO',        8000, 4000, 4000,  600,  8000, 999999, 250,  300, 150,  200,     15,      5, 0.22::decimal(10,4), 0.19::decimal(10,4)),
      ('ENTERPRISE',20000, 8000, 8000, 2000, 30000, 999999, 800, 1000, 400,  600, 999999, 999999, 0.20::decimal(10,4), 0.17::decimal(10,4))
  ) AS v(
    plan_code,
    monthly_conversations_egypt,
    monthly_conversations_gulf,
    monthly_conversations_included,
    daily_ai_responses,
    monthly_ai_capacity,
    monthly_copilot_calls,
    monthly_voice_minutes,
    monthly_payment_proofs,
    monthly_broadcasts,
    monthly_map_searches,
    max_team_members,
    max_branches,
    overage_rate_aed,
    overage_rate_sar
  )
)
UPDATE plan_limits pl
SET
  monthly_conversations_egypt = tl.monthly_conversations_egypt,
  monthly_conversations_gulf = tl.monthly_conversations_gulf,
  monthly_conversations_included = tl.monthly_conversations_included,
  daily_ai_responses = tl.daily_ai_responses,
  monthly_ai_capacity = tl.monthly_ai_capacity,
  monthly_copilot_calls = tl.monthly_copilot_calls,
  monthly_voice_minutes = tl.monthly_voice_minutes,
  monthly_payment_proofs = tl.monthly_payment_proofs,
  monthly_broadcasts = tl.monthly_broadcasts,
  monthly_map_searches = tl.monthly_map_searches,
  overage_rate_aed = tl.overage_rate_aed,
  overage_rate_sar = tl.overage_rate_sar,
  team_members = tl.max_team_members,
  branches = tl.max_branches,
  ai_calls_per_day = tl.daily_ai_responses,
  voice_minutes_per_month = tl.monthly_voice_minutes,
  payment_proof_scans_per_month = tl.monthly_payment_proofs,
  maps_lookups_per_month = tl.monthly_map_searches,
  updated_at = NOW()
FROM plans p
JOIN target_limits tl ON tl.plan_code = p.code
WHERE pl.plan_id = p.id;

WITH cycle_discounts AS (
  SELECT 1 AS cycle_months, 0::numeric AS discount_percent
  UNION ALL SELECT 3, 5::numeric
  UNION ALL SELECT 6, 10::numeric
  UNION ALL SELECT 12, 15::numeric
),
plan_seed AS (
  SELECT p.id AS plan_id, seed.plan_code, seed.region_code, seed.currency, seed.monthly_cents
  FROM plans p
  JOIN (
    VALUES
      ('STARTER', 'EG', 'EGP',   99900),
      ('BASIC',   'EG', 'EGP',  220000),
      ('GROWTH',  'EG', 'EGP',  480000),
      ('PRO',     'EG', 'EGP', 1000000),
      ('ENTERPRISE','EG','EGP',2150000),
      ('STARTER', 'AE', 'AED',   29900),
      ('BASIC',   'AE', 'AED',   49900),
      ('GROWTH',  'AE', 'AED',   89900),
      ('PRO',     'AE', 'AED',  169900),
      ('ENTERPRISE','AE','AED', 299900),
      ('STARTER', 'SA', 'SAR',   29900),
      ('BASIC',   'SA', 'SAR',   49900),
      ('GROWTH',  'SA', 'SAR',   89900),
      ('PRO',     'SA', 'SAR',  169900),
      ('ENTERPRISE','SA','SAR', 299900)
  ) AS seed(plan_code, region_code, currency, monthly_cents)
    ON p.code = seed.plan_code
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
  ps.plan_id,
  ps.region_code,
  ps.currency,
  cd.cycle_months,
  ps.monthly_cents,
  cd.discount_percent,
  ROUND((ps.monthly_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0))::integer,
  ROUND(((ps.monthly_cents * cd.cycle_months) * (1 - cd.discount_percent / 100.0)) / cd.cycle_months)::integer,
  true
FROM plan_seed ps
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN
    UPDATE billing_plans bp
    SET
      price_cents = seed.price_cents,
      updated_at = NOW(),
      limits = COALESCE(bp.limits, '{}'::jsonb)
        || jsonb_build_object(
          'monthlyConversationsEgypt', seed.monthly_conversations_egypt,
          'monthlyConversationsGulf', seed.monthly_conversations_gulf,
          'monthlyConversationsIncluded', seed.monthly_conversations_included,
          'dailyAiResponses', seed.daily_ai_responses,
          'monthlyAiCapacity', seed.monthly_ai_capacity,
          'monthlyCopilotCalls', seed.monthly_copilot_calls,
          'monthlyVoiceMinutes', seed.monthly_voice_minutes,
          'monthlyPaymentProofs', seed.monthly_payment_proofs,
          'monthlyBroadcasts', seed.monthly_broadcasts,
          'monthlyMapSearches', seed.monthly_map_searches,
          'teamMembers', seed.team_members,
          'branches', seed.branches
        )
    FROM (
      VALUES
        ('STARTER',  99900,  1200, 1000, 1000,  30,   200,      0,   0,    0,   0,    0,      2,      1),
        ('BASIC',   220000,  1500, 1200, 1200,  80,   500,     50,  30,   20,  15,   20,      3,      1),
        ('GROWTH',  480000,  3500, 2000, 2000, 200,  2000,    200,  80,   80,  40,   60,      7,      2),
        ('PRO',    1000000,  8000, 4000, 4000, 600,  8000, 999999, 250,  300, 150,  200,     15,      5),
        ('ENTERPRISE',2150000,15000,8000,8000,2000,30000,999999,800,1000,400,600,999999,999999)
    ) AS seed(
      code,
      price_cents,
      monthly_conversations_egypt,
      monthly_conversations_gulf,
      monthly_conversations_included,
      daily_ai_responses,
      monthly_ai_capacity,
      monthly_copilot_calls,
      monthly_voice_minutes,
      monthly_payment_proofs,
      monthly_broadcasts,
      monthly_map_searches,
      team_members,
      branches
    )
    WHERE bp.code = seed.code;
  END IF;
END $$;

DELETE FROM plan_entitlements
WHERE plan_id IN (SELECT id FROM plans WHERE code = 'STARTER')
  AND feature_key IN (
    'COPILOT_CHAT',
    'VOICE_NOTES',
    'VISION_OCR',
    'KPI_DASHBOARD',
    'AUDIT_LOGS',
    'API_ACCESS',
    'WEBHOOKS',
    'LOYALTY',
    'AUTOMATIONS',
    'FORECASTING',
    'CUSTOM_INTEGRATIONS',
    'SLA'
  );

INSERT INTO plan_entitlements (
  plan_id,
  feature_key,
  feature_label,
  feature_tier,
  is_included
)
SELECT p.id, seed.feature_key, seed.feature_label, seed.feature_tier, true
FROM plans p
JOIN (
  VALUES
    ('STARTER', 'CONVERSATIONS', 'Conversations', 'CORE'),
    ('STARTER', 'ORDERS', 'Orders', 'CORE'),
    ('STARTER', 'CATALOG', 'Catalog', 'CORE'),
    ('STARTER', 'INVENTORY', 'Inventory basic', 'BASIC'),
    ('STARTER', 'REPORTS', 'Basic reports', 'BASIC'),
    ('STARTER', 'PAYMENTS', 'Payment verification manual', 'BASIC'),
    ('STARTER', 'NOTIFICATIONS', 'Notifications', 'CORE'),
    ('STARTER', 'TEAM', 'Team management', 'BASIC')
) AS seed(plan_code, feature_key, feature_label, feature_tier)
  ON p.code = seed.plan_code
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
  feature_label = EXCLUDED.feature_label,
  feature_tier = EXCLUDED.feature_tier,
  is_included = true,
  updated_at = NOW();
