ALTER TABLE merchants
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

WITH upsert_plan AS (
  INSERT INTO plans (
    code,
    name,
    tier_rank,
    description,
    is_bundle,
    is_active,
    metadata
  )
  VALUES (
    'TRIAL',
    'Trial',
    0,
    'Trial plan for merchant self-service signup',
    true,
    true,
    '{"trialDays":14,"selfServiceSignup":true}'::jsonb
  )
  ON CONFLICT (code) DO UPDATE
  SET
    name = EXCLUDED.name,
    tier_rank = EXCLUDED.tier_rank,
    description = EXCLUDED.description,
    is_bundle = EXCLUDED.is_bundle,
    is_active = EXCLUDED.is_active,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id
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
  id,
  50,
  1,
  1,
  20,
  5000,
  5,
  10,
  5,
  '{"source":"self-service-signup"}'::jsonb
FROM upsert_plan
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
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH trial_plan AS (
  SELECT id
  FROM plans
  WHERE code = 'TRIAL'
  LIMIT 1
),
required_features AS (
  SELECT
    trial_plan.id AS plan_id,
    feature_key,
    feature_label,
    feature_tier
  FROM trial_plan
  CROSS JOIN (
    VALUES
      ('CONVERSATIONS','Conversations','CORE'),
      ('ORDERS','Orders','CORE'),
      ('CATALOG','Catalog','CORE'),
      ('INVENTORY','Inventory basic','BASIC'),
      ('REPORTS','Finance basic','BASIC'),
      ('NOTIFICATIONS','Notifications','CORE'),
      ('VOICE_NOTES','Voice notes support','METERED'),
      ('PAYMENTS','Payment Proof Verification','BASIC'),
      ('COPILOT_CHAT','Copilot chat','CORE')
  ) AS features(feature_key, feature_label, feature_tier)
)
INSERT INTO plan_entitlements (
  plan_id,
  feature_key,
  feature_label,
  feature_tier,
  is_included
)
SELECT
  plan_id,
  feature_key,
  feature_label,
  feature_tier,
  true
FROM required_features
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
  feature_label = EXCLUDED.feature_label,
  feature_tier = EXCLUDED.feature_tier,
  is_included = EXCLUDED.is_included,
  updated_at = NOW();

WITH trial_plan AS (
  SELECT id
  FROM plans
  WHERE code = 'TRIAL'
  LIMIT 1
),
regions AS (
  SELECT region_code, currency
  FROM (
    VALUES
      ('EG', 'EGP'),
      ('SA', 'SAR'),
      ('AE', 'AED'),
      ('OM', 'OMR'),
      ('KW', 'KWD')
  ) AS regional_prices(region_code, currency)
),
cycles AS (
  SELECT cycle_months
  FROM (
    VALUES (1), (3), (6), (12)
  ) AS cycle_values(cycle_months)
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
  trial_plan.id,
  regions.region_code,
  regions.currency,
  cycles.cycle_months,
  0,
  0,
  0,
  0,
  true
FROM trial_plan
CROSS JOIN regions
CROSS JOIN cycles
ON CONFLICT (plan_id, region_code, cycle_months) DO UPDATE
SET
  currency = EXCLUDED.currency,
  base_price_cents = EXCLUDED.base_price_cents,
  discount_percent = EXCLUDED.discount_percent,
  total_price_cents = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();

INSERT INTO billing_plans (
  code,
  name,
  price_cents,
  currency,
  billing_period,
  description,
  features,
  agents,
  limits,
  is_active
)
VALUES (
  'TRIAL',
  'Trial',
  0,
  'EGP',
  'monthly',
  'Trial plan for merchant self-service signup',
  '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","VOICE_NOTES","PAYMENTS","COPILOT_CHAT"]'::jsonb,
  '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
  '{"messagesPerMonth":50,"whatsappNumbers":1,"teamMembers":1,"aiCallsPerDay":20,"tokenBudgetDaily":5000,"paidTemplatesPerMonth":5,"paymentProofScansPerMonth":10,"voiceMinutesPerMonth":5,"mapsLookupsPerMonth":50,"posConnections":0,"branches":1}'::jsonb,
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
