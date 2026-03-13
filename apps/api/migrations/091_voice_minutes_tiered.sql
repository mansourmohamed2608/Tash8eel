-- Migration 091
-- Give every bundle plan a tiered voice-minutes allowance and re-enable VOICE_NOTES
-- for STARTER, BASIC, and GROWTH.
--
-- STARTER: 20 min, BASIC: 30 min, GROWTH: 60 min, PRO: 120 min, ENTERPRISE: 240 min

-- 1) Update voice_minutes_per_month in plan_limits
UPDATE plan_limits pl
SET voice_minutes_per_month = v.voice_minutes,
    updated_at              = NOW()
FROM plans p
JOIN (VALUES
  ('STARTER',     20),
  ('BASIC',       30),
  ('GROWTH',      60),
  ('PRO',        120),
  ('ENTERPRISE', 240)
) AS v(plan_code, voice_minutes) ON p.code = v.plan_code
WHERE pl.plan_id = p.id
  AND p.is_bundle = true;

-- 2) Re-enable VOICE_NOTES entitlement for STARTER and GROWTH
--    (BASIC was never set is_included=false so the ON CONFLICT covers it too)
INSERT INTO plan_entitlements (plan_id, feature_key, feature_label, feature_tier, is_included)
SELECT p.id, 'VOICE_NOTES', 'Voice notes support', 'METERED', true
FROM plans p
WHERE p.code IN ('STARTER', 'BASIC', 'GROWTH')
  AND p.is_bundle = true
ON CONFLICT (plan_id, feature_key) DO UPDATE
SET is_included  = true,
    feature_label = 'Voice notes support',
    feature_tier  = 'METERED',
    updated_at    = NOW();
