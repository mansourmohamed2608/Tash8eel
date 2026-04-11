-- Migration 111
-- Seed complete CHAT_ONLY bundle catalog records (limits, entitlements, and prices)
-- so the merchant plan page shows valid data and checkout can resolve pricing.

BEGIN;

INSERT INTO plans (
  code,
  name,
  tier_rank,
  description,
  is_bundle,
  is_active,
  metadata,
  created_at,
  updated_at
)
VALUES (
  'CHAT_ONLY',
  'Chat Only',
  2,
  'Chat-first bundle for conversational commerce.',
  true,
  true,
  '{"allPlansIncludeCopilot": true}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  tier_rank = EXCLUDED.tier_rank,
  description = EXCLUDED.description,
  is_bundle = EXCLUDED.is_bundle,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH chat_plan AS (
  SELECT id AS plan_id
  FROM plans
  WHERE code = 'CHAT_ONLY'
  LIMIT 1
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
  overage_rate_aed,
  overage_rate_sar,
  metadata
)
SELECT
  chat_plan.plan_id,
  28800,
  1,
  1,
  480,
  100000,
  10,
  0,
  0,
  0,
  0,
  0,
  30,
  0,
  0,
  0,
  28800,
  28800,
  28800,
  480,
  14400,
  14400,
  0,
  0,
  0,
  0,
  0.30,
  0.25,
  '{}'::jsonb
FROM chat_plan
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
  monthly_conversations_egypt = EXCLUDED.monthly_conversations_egypt,
  monthly_conversations_gulf = EXCLUDED.monthly_conversations_gulf,
  monthly_conversations_included = EXCLUDED.monthly_conversations_included,
  daily_ai_responses = EXCLUDED.daily_ai_responses,
  monthly_ai_capacity = EXCLUDED.monthly_ai_capacity,
  monthly_copilot_calls = EXCLUDED.monthly_copilot_calls,
  monthly_voice_minutes = EXCLUDED.monthly_voice_minutes,
  monthly_payment_proofs = EXCLUDED.monthly_payment_proofs,
  monthly_broadcasts = EXCLUDED.monthly_broadcasts,
  monthly_map_searches = EXCLUDED.monthly_map_searches,
  overage_rate_aed = EXCLUDED.overage_rate_aed,
  overage_rate_sar = EXCLUDED.overage_rate_sar,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH chat_plan AS (
  SELECT id AS plan_id
  FROM plans
  WHERE code = 'CHAT_ONLY'
  LIMIT 1
),
cycle_discounts AS (
  SELECT 1 AS cycle_months, 0::numeric AS discount_percent
  UNION ALL SELECT 3, 5::numeric
  UNION ALL SELECT 6, 10::numeric
  UNION ALL SELECT 12, 15::numeric
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
  chat_plan.plan_id,
  'EG',
  'EGP',
  cycle_discounts.cycle_months,
  100000,
  cycle_discounts.discount_percent,
  ROUND((100000 * cycle_discounts.cycle_months) * (1 - cycle_discounts.discount_percent / 100.0))::integer,
  ROUND(((100000 * cycle_discounts.cycle_months) * (1 - cycle_discounts.discount_percent / 100.0)) / cycle_discounts.cycle_months)::integer,
  true
FROM chat_plan
CROSS JOIN cycle_discounts
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
SET
  currency = EXCLUDED.currency,
  base_price_cents = EXCLUDED.base_price_cents,
  discount_percent = EXCLUDED.discount_percent,
  total_price_cents = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();

UPDATE plan_entitlements pe
SET
  is_included = false,
  updated_at = NOW()
FROM plans p
WHERE pe.plan_id = p.id
  AND p.code = 'CHAT_ONLY'
  AND UPPER(pe.feature_key) <> 'CONVERSATIONS';

WITH chat_plan AS (
  SELECT id AS plan_id
  FROM plans
  WHERE code = 'CHAT_ONLY'
  LIMIT 1
)
INSERT INTO plan_entitlements (
  plan_id,
  feature_key,
  feature_label,
  feature_tier,
  is_included,
  created_at,
  updated_at
)
SELECT
  chat_plan.plan_id,
  'CONVERSATIONS',
  'Conversations',
  'CORE',
  true,
  NOW(),
  NOW()
FROM chat_plan
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
  feature_label = EXCLUDED.feature_label,
  feature_tier = EXCLUDED.feature_tier,
  is_included = true,
  updated_at = NOW();

COMMIT;
