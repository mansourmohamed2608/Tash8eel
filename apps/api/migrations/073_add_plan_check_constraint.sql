-- Migration 073: Enforce canonical plan codes on merchants table
-- Fixes data drift where non-canonical plan codes (PROFESSIONAL, BASIC, etc.)
-- were stored and silently remapped by normalizePlanCode() in the billing controller.
--
-- Source-of-truth rule: merchants.plan MUST be one of the canonical PlanType values
-- defined in shared/entitlements/index.ts.
--
-- Steps:
--   1. Normalize all existing non-canonical values to their canonical equivalents.
--   2. Add a CHECK constraint to prevent future drift.
-- ============================================================================

-- Step 1: Normalize legacy / non-canonical plan codes to canonical equivalents
-- These mappings mirror normalizePlanCode() in billing.controller.ts so that
-- once migrated, the runtime normalization becomes a no-op.
UPDATE merchants
SET plan = 'PRO'
WHERE plan IN ('PROFESSIONAL', 'PRO_PLAN')
  AND plan NOT IN ('TRIAL', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'CUSTOM');

UPDATE merchants
SET plan = 'ENTERPRISE'
WHERE plan = 'ENTERPRISES'
  AND plan NOT IN ('TRIAL', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'CUSTOM');

UPDATE merchants
SET plan = 'STARTER'
WHERE plan IN ('BASIC', 'FREE')
  AND plan NOT IN ('TRIAL', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'CUSTOM');

UPDATE merchants
SET plan = 'GROWTH'
WHERE plan = 'GROW'
  AND plan NOT IN ('TRIAL', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'CUSTOM');

-- Anything still unrecognised falls back to TRIAL
UPDATE merchants
SET plan = 'TRIAL'
WHERE plan NOT IN ('TRIAL', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'CUSTOM');

-- Step 2: Add CHECK constraint to enforce canonical values going forward
-- Use IF NOT EXISTS idiom via DO block (pg does not support ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchants_plan_canonical'
      AND conrelid = 'merchants'::regclass
  ) THEN
    ALTER TABLE merchants
      ADD CONSTRAINT merchants_plan_canonical
      CHECK (plan IN ('TRIAL', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'CUSTOM'));
  END IF;
END;
$$;
