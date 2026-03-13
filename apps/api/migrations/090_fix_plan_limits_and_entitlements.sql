-- Migration 090
-- Reconcile plan_limits and plan_entitlements with the canonical PLAN_ENTITLEMENTS
-- TypeScript definition (src/shared/entitlements/index.ts).
--
-- Fixes:
--   STARTER  msgs 15000→5000, ai 500→100, tokens 200K→50K,
--            templates 15→5, proofs 80→25, voice 20→0
--   GROWTH   ai 1000→500, proofs 200→150, voice 60→0
--   PRO      proofs 500→400
--   STARTER  VOICE_NOTES entitlement removed (not in STARTER feature set)
--   GROWTH   VOICE_NOTES entitlement removed (voice notes are PRO+ only)

-- -----------------------------------------------------------------------------
-- 1) Fix plan_limits
-- -----------------------------------------------------------------------------
UPDATE plan_limits pl
SET
  messages_per_month            = v.messages_per_month,
  ai_calls_per_day              = v.ai_calls_per_day,
  token_budget_daily            = v.token_budget_daily,
  paid_templates_per_month      = v.paid_templates_per_month,
  payment_proof_scans_per_month = v.payment_proof_scans_per_month,
  voice_minutes_per_month       = v.voice_minutes_per_month,
  updated_at                    = NOW()
FROM plans p
JOIN (VALUES
  ('STARTER',     5000,   100,    50000,  5,  25,  0),
  ('BASIC',      15000,   200,   200000, 15,  50,  0),
  ('GROWTH',     30000,   500,   400000, 30, 150,  0),
  ('PRO',       100000,  2500,  1000000, 50, 400, 120),
  ('ENTERPRISE',250000,  5000,  1750000,100,1200, 240)
) AS v(plan_code,
       messages_per_month, ai_calls_per_day, token_budget_daily,
       paid_templates_per_month, payment_proof_scans_per_month,
       voice_minutes_per_month)
  ON p.code = v.plan_code
WHERE pl.plan_id = p.id
  AND p.is_bundle = true;

-- -----------------------------------------------------------------------------
-- 2) Remove VOICE_NOTES entitlement from STARTER and GROWTH
--    (voice notes are PRO+ only per PLAN_ENTITLEMENTS)
-- -----------------------------------------------------------------------------
UPDATE plan_entitlements pe
SET is_included = false,
    updated_at  = NOW()
FROM plans p
WHERE pe.plan_id    = p.id
  AND pe.feature_key = 'VOICE_NOTES'
  AND p.code IN ('STARTER', 'GROWTH')
  AND p.is_bundle = true;
