-- Migration 103
-- Targeted verification fixes for enterprise Egypt conversation limit
-- and starter entitlement hardening using the live plan_entitlements schema.

UPDATE plan_limits
SET monthly_conversations_egypt = 15000
WHERE plan_id IN (
  SELECT id
  FROM plans
  WHERE UPPER(COALESCE(code, name)) = 'ENTERPRISE'
);

UPDATE plan_entitlements
SET is_included = false,
    updated_at = NOW()
WHERE plan_id IN (
  SELECT id
  FROM plans
  WHERE UPPER(COALESCE(code, name)) = 'STARTER'
)
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
SELECT
  p.id,
  seed.feature_key,
  seed.feature_label,
  seed.feature_tier,
  true
FROM plans p
JOIN (
  VALUES
    ('STARTER', 'CATALOG', 'Catalog', 'CORE'),
    ('STARTER', 'CONVERSATIONS', 'Conversations', 'CORE'),
    ('STARTER', 'ORDERS', 'Orders', 'CORE'),
    ('STARTER', 'INVENTORY', 'Inventory basic', 'BASIC'),
    ('STARTER', 'REPORTS', 'Basic reports', 'BASIC'),
    ('STARTER', 'PAYMENTS', 'Payment verification manual', 'BASIC'),
    ('STARTER', 'NOTIFICATIONS', 'Notifications', 'CORE'),
    ('STARTER', 'TEAM', 'Team management', 'BASIC')
) AS seed(plan_code, feature_key, feature_label, feature_tier)
  ON UPPER(COALESCE(p.code, p.name)) = seed.plan_code
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET
  feature_label = EXCLUDED.feature_label,
  feature_tier = EXCLUDED.feature_tier,
  is_included = true,
  updated_at = NOW();
