-- Migration 074: Add BASIC plan tier and reprice all plans
-- New 5-tier pricing model (EGP):
--   STARTER   999   → entry, AI WhatsApp + orders only, no voice notes
--   BASIC   2,200   → was old STARTER; all 3 agents + inventory + payment links
--   GROWTH  4,800   → was 1,899; adds team + loyalty + automations
--   PRO    10,000   → was 3,299; adds voice notes + forecasting + multi-branch
--   ENTERPRISE 21,500 → was 5,999; adds voice calling + SLA + custom integrations
-- ============================================================================

-- Step 1: Expand the CHECK constraint to include BASIC
-- Drop old constraint and re-create with BASIC added.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchants_plan_canonical'
      AND conrelid = 'merchants'::regclass
  ) THEN
    ALTER TABLE merchants DROP CONSTRAINT merchants_plan_canonical;
  END IF;

  ALTER TABLE merchants
    ADD CONSTRAINT merchants_plan_canonical
    CHECK (plan IN ('TRIAL', 'STARTER', 'BASIC', 'GROWTH', 'PRO', 'ENTERPRISE', 'CUSTOM'));
END;
$$;

-- Step 2: Update billing_plan_limits for all plans with new quotas
-- (billing_plan_limits stores the hard limits per plan code)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plan_limits') THEN
    -- Remove old STARTER row (it will be replaced below)
    DELETE FROM billing_plan_limits WHERE UPPER(plan_code) = 'STARTER';

    INSERT INTO billing_plan_limits (
      plan_code,
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
      branches
    ) VALUES
      ('STARTER',    5000,   1, 1,  100,    50000,  5,  25,    0,  100, 0, 1),
      ('BASIC',     15000,   1, 1,  200,   200000, 15,  50,    0,  200, 0, 1),
      ('GROWTH',    30000,   2, 2,  500,   400000, 30, 150,    0,  700, 1, 1),
      ('PRO',      100000,   3, 5, 2500,  1000000, 50, 400,  120, 2000, 3, 2),
      ('ENTERPRISE',250000,  5,10, 5000,  1750000,100,1200,  240, 6000, 5, 5)
    ON CONFLICT (plan_code) DO UPDATE
      SET messages_per_month             = EXCLUDED.messages_per_month,
          whatsapp_numbers               = EXCLUDED.whatsapp_numbers,
          team_members                   = EXCLUDED.team_members,
          ai_calls_per_day               = EXCLUDED.ai_calls_per_day,
          token_budget_daily             = EXCLUDED.token_budget_daily,
          paid_templates_per_month       = EXCLUDED.paid_templates_per_month,
          payment_proof_scans_per_month  = EXCLUDED.payment_proof_scans_per_month,
          voice_minutes_per_month        = EXCLUDED.voice_minutes_per_month,
          maps_lookups_per_month         = EXCLUDED.maps_lookups_per_month,
          pos_connections                = EXCLUDED.pos_connections,
          branches                       = EXCLUDED.branches;
  END IF;
END $$;

-- Step 3: Upsert billing_plans rows for BASIC and update prices for all plans
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN
    -- Update prices for existing plans (price_cents = EGP × 100)
    UPDATE billing_plans SET price_cents = 99900,   updated_at = NOW() WHERE UPPER(code) = 'STARTER';
    UPDATE billing_plans SET price_cents = 480000,  updated_at = NOW() WHERE UPPER(code) = 'GROWTH';
    UPDATE billing_plans SET price_cents = 1000000, updated_at = NOW() WHERE UPPER(code) = 'PRO';
    UPDATE billing_plans SET price_cents = 2150000, updated_at = NOW() WHERE UPPER(code) = 'ENTERPRISE';

    -- Insert BASIC plan if not present
    INSERT INTO billing_plans (code, name, price_cents, currency, billing_period, is_active, created_at, updated_at)
    VALUES ('BASIC', 'Basic', 220000, 'EGP', 'monthly', true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE
      SET price_cents = 220000,
          name        = 'Basic',
          is_active   = true,
          updated_at  = NOW();
  END IF;
END $$;

-- Step 4: Update subscription_plans table if it exists AND has a code column (legacy compatibility)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'code'
  ) THEN
    UPDATE subscription_plans SET price = 999    WHERE UPPER(code) = 'STARTER';
    UPDATE subscription_plans SET price = 4800   WHERE UPPER(code) = 'GROWTH';
    UPDATE subscription_plans SET price = 10000  WHERE UPPER(code) = 'PRO';
    UPDATE subscription_plans SET price = 21500  WHERE UPPER(code) = 'ENTERPRISE';

    INSERT INTO subscription_plans (code, name, price, currency, is_active, created_at, updated_at)
    VALUES ('BASIC', 'Basic', 2200, 'EGP', true, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE
      SET price      = 2200,
          name       = 'Basic',
          is_active  = true,
          updated_at = NOW();
  END IF;
END $$;

-- Step 5: Sync billing_plans limits JSONB column for BASIC (mirrors migration 072 pattern)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN
    UPDATE billing_plans
    SET limits = jsonb_strip_nulls(
      COALESCE(limits, '{}'::jsonb)
      || jsonb_build_object(
        'messagesPerMonth',           CASE UPPER(code)
          WHEN 'STARTER'    THEN 5000
          WHEN 'BASIC'      THEN 15000
          WHEN 'GROWTH'     THEN 30000
          WHEN 'PRO'        THEN 100000
          WHEN 'ENTERPRISE' THEN 250000
          ELSE NULL END,
        'aiCallsPerDay',              CASE UPPER(code)
          WHEN 'STARTER'    THEN 100
          WHEN 'BASIC'      THEN 200
          WHEN 'GROWTH'     THEN 500
          WHEN 'PRO'        THEN 2500
          WHEN 'ENTERPRISE' THEN 5000
          ELSE NULL END,
        'paymentProofScansPerMonth',  CASE UPPER(code)
          WHEN 'STARTER'    THEN 25
          WHEN 'BASIC'      THEN 50
          WHEN 'GROWTH'     THEN 150
          WHEN 'PRO'        THEN 400
          WHEN 'ENTERPRISE' THEN 1200
          ELSE NULL END,
        'voiceMinutesPerMonth',       CASE UPPER(code)
          WHEN 'STARTER'    THEN 0
          WHEN 'BASIC'      THEN 0
          WHEN 'GROWTH'     THEN 0
          WHEN 'PRO'        THEN 120
          WHEN 'ENTERPRISE' THEN 240
          ELSE NULL END,
        'mapsLookupsPerMonth',        CASE UPPER(code)
          WHEN 'STARTER'    THEN 100
          WHEN 'BASIC'      THEN 200
          WHEN 'GROWTH'     THEN 700
          WHEN 'PRO'        THEN 2000
          WHEN 'ENTERPRISE' THEN 6000
          ELSE NULL END,
        'posConnections',             CASE UPPER(code)
          WHEN 'STARTER'    THEN 0
          WHEN 'BASIC'      THEN 0
          WHEN 'GROWTH'     THEN 1
          WHEN 'PRO'        THEN 3
          WHEN 'ENTERPRISE' THEN 5
          ELSE NULL END,
        'branches',                   CASE UPPER(code)
          WHEN 'STARTER'    THEN 1
          WHEN 'BASIC'      THEN 1
          WHEN 'GROWTH'     THEN 1
          WHEN 'PRO'        THEN 2
          WHEN 'ENTERPRISE' THEN 5
          ELSE NULL END
      )
    ),
    updated_at = NOW()
    WHERE UPPER(code) IN ('STARTER','BASIC','GROWTH','PRO','ENTERPRISE');
  END IF;
END $$;
