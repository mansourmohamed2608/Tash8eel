-- Migration 110: Sync canonical plans and cashier entitlement rules
-- Purpose:
--   1) Keep merchants.plan constrained to canonical values including CHAT_ONLY/BASIC
--   2) Align cashier feature defaults across billing catalogs and plan entitlements
--   3) Remove inherited starter/chat-only cashier enablement that came from legacy defaults

BEGIN;

-- 1) Normalize merchant plan codes and enforce canonical check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'plan'
  ) THEN
    UPDATE merchants
    SET plan = 'PRO'
    WHERE UPPER(COALESCE(plan, '')) IN ('PROFESSIONAL', 'PRO_PLAN');

    UPDATE merchants
    SET plan = 'ENTERPRISE'
    WHERE UPPER(COALESCE(plan, '')) = 'ENTERPRISES';

    UPDATE merchants
    SET plan = 'STARTER'
    WHERE UPPER(COALESCE(plan, '')) IN ('FREE');

    UPDATE merchants
    SET plan = 'GROWTH'
    WHERE UPPER(COALESCE(plan, '')) = 'GROW';

    UPDATE merchants
    SET plan = 'CHAT_ONLY'
    WHERE UPPER(COALESCE(plan, '')) IN ('CHATONLY', 'CHAT-ONLY');

    UPDATE merchants
    SET plan = 'STARTER'
    WHERE plan IS NULL OR BTRIM(plan) = '';

    UPDATE merchants
    SET plan = 'STARTER'
    WHERE UPPER(COALESCE(plan, 'STARTER')) NOT IN (
      'TRIAL',
      'STARTER',
      'CHAT_ONLY',
      'BASIC',
      'GROWTH',
      'PRO',
      'ENTERPRISE',
      'CUSTOM'
    );

    ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_plan_canonical;
    ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_plan_check;

    ALTER TABLE merchants
      ADD CONSTRAINT merchants_plan_canonical
      CHECK (
        plan IN (
          'TRIAL',
          'STARTER',
          'CHAT_ONLY',
          'BASIC',
          'GROWTH',
          'PRO',
          'ENTERPRISE',
          'CUSTOM'
        )
      );
  END IF;
END;
$$;

-- 2) Ensure canonical plan registry includes CHAT_ONLY
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'plans'
  ) THEN
    INSERT INTO plans (code, name, tier_rank, is_bundle, is_active, created_at, updated_at)
    VALUES ('CHAT_ONLY', 'Chat Only', 2, true, true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          tier_rank = EXCLUDED.tier_rank,
          is_active = true,
          updated_at = NOW();
  END IF;
END;
$$;

-- 3) Keep billing_plans features aligned with cashier policy
-- Compatible with both TEXT[] and JSONB schemas (legacy drift-safe).
DO $$
DECLARE
  features_data_type TEXT;
BEGIN
  SELECT c.data_type
  INTO features_data_type
  FROM information_schema.columns c
  WHERE c.table_name = 'billing_plans'
    AND c.column_name = 'features'
  LIMIT 1;

  IF features_data_type IS NULL THEN
    RETURN;
  END IF;

  IF features_data_type = 'ARRAY' THEN
    UPDATE billing_plans
    SET features = array_remove(COALESCE(features, ARRAY[]::text[]), 'CASHIER_POS'),
        updated_at = NOW()
    WHERE UPPER(code) IN ('TRIAL', 'STARTER', 'CHAT_ONLY', 'CUSTOM');

    UPDATE billing_plans
    SET features = CASE
      WHEN 'CASHIER_POS' = ANY(COALESCE(features, ARRAY[]::text[]))
        THEN COALESCE(features, ARRAY[]::text[])
      ELSE array_append(COALESCE(features, ARRAY[]::text[]), 'CASHIER_POS')
    END,
    updated_at = NOW()
    WHERE UPPER(code) IN ('BASIC', 'GROWTH', 'PRO', 'ENTERPRISE');
  ELSIF features_data_type = 'jsonb' THEN
    UPDATE billing_plans
    SET features = CASE
      WHEN features IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(features) = 'array' THEN (
        SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
        FROM jsonb_array_elements_text(features) AS value
        WHERE value <> 'CASHIER_POS'
      )
      WHEN jsonb_typeof(features) = 'object' THEN features - 'CASHIER_POS'
      ELSE features
    END,
    updated_at = NOW()
    WHERE UPPER(code) IN ('TRIAL', 'STARTER', 'CHAT_ONLY', 'CUSTOM');

    UPDATE billing_plans
    SET features = CASE
      WHEN features IS NULL THEN '["CASHIER_POS"]'::jsonb
      WHEN jsonb_typeof(features) = 'array' THEN
        CASE
          WHEN features ? 'CASHIER_POS' THEN features
          ELSE features || '["CASHIER_POS"]'::jsonb
        END
      WHEN jsonb_typeof(features) = 'object' THEN
        jsonb_set(features, '{CASHIER_POS}', 'true'::jsonb, true)
      ELSE features
    END,
    updated_at = NOW()
    WHERE UPPER(code) IN ('BASIC', 'GROWTH', 'PRO', 'ENTERPRISE');
  END IF;
END;
$$;

-- 4) Sync cashier entitlement rows in plan_entitlements (if schema exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'plan_entitlements'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'plans'
  ) THEN
    UPDATE plan_entitlements pe
    SET
      is_included = CASE
        WHEN UPPER(p.code) IN ('BASIC', 'GROWTH', 'PRO', 'ENTERPRISE') THEN true
        ELSE false
      END,
      updated_at = NOW()
    FROM plans p
    WHERE pe.plan_id = p.id
      AND UPPER(pe.feature_key) = 'CASHIER_POS'
      AND UPPER(p.code) IN (
        'TRIAL',
        'STARTER',
        'CHAT_ONLY',
        'BASIC',
        'GROWTH',
        'PRO',
        'ENTERPRISE',
        'CUSTOM'
      );

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
      p.id,
      'CASHIER_POS',
      'Cashier POS',
      'PAID',
      true,
      NOW(),
      NOW()
    FROM plans p
    WHERE UPPER(p.code) IN ('BASIC', 'GROWTH', 'PRO', 'ENTERPRISE')
      AND NOT EXISTS (
        SELECT 1
        FROM plan_entitlements pe
        WHERE pe.plan_id = p.id
          AND UPPER(pe.feature_key) = 'CASHIER_POS'
      );
  END IF;
END;
$$;

-- 5) Remove legacy inherited cashier from STARTER/CHAT_ONLY unless explicitly enabled
DO $$
DECLARE
  has_plan_limits BOOLEAN;
  has_limits BOOLEAN;
  has_enabled_features BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'plan_limits'
  ) INTO has_plan_limits;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'limits'
  ) INTO has_limits;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'enabled_features'
  ) INTO has_enabled_features;

  IF has_enabled_features THEN
    IF has_plan_limits AND has_limits THEN
      UPDATE merchants m
      SET enabled_features = array_remove(COALESCE(m.enabled_features, ARRAY[]::text[]), 'CASHIER_POS')
      WHERE UPPER(COALESCE(m.plan, 'STARTER')) IN ('TRIAL', 'STARTER', 'CHAT_ONLY')
        AND COALESCE((m.plan_limits->>'cashierExplicitlyEnabled')::boolean, false) = false
        AND COALESCE((m.limits->>'cashierExplicitlyEnabled')::boolean, false) = false;
    ELSIF has_plan_limits THEN
      UPDATE merchants m
      SET enabled_features = array_remove(COALESCE(m.enabled_features, ARRAY[]::text[]), 'CASHIER_POS')
      WHERE UPPER(COALESCE(m.plan, 'STARTER')) IN ('TRIAL', 'STARTER', 'CHAT_ONLY')
        AND COALESCE((m.plan_limits->>'cashierExplicitlyEnabled')::boolean, false) = false;
    ELSIF has_limits THEN
      UPDATE merchants m
      SET enabled_features = array_remove(COALESCE(m.enabled_features, ARRAY[]::text[]), 'CASHIER_POS')
      WHERE UPPER(COALESCE(m.plan, 'STARTER')) IN ('TRIAL', 'STARTER', 'CHAT_ONLY')
        AND COALESCE((m.limits->>'cashierExplicitlyEnabled')::boolean, false) = false;
    END IF;
  END IF;
END;
$$;

COMMIT;
