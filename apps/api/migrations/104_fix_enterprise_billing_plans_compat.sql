-- Migration 104
-- Keep legacy billing_plans compatibility payload in sync with the
-- enterprise Egypt conversation limit used by plan_limits.

UPDATE billing_plans
SET
  limits = COALESCE(limits, '{}'::jsonb)
    || jsonb_build_object('monthlyConversationsEgypt', 15000),
  updated_at = NOW()
WHERE LOWER(COALESCE(code, name)) = 'enterprise';
