-- Migration: 059_demo_merchant_active.sql
-- Fix demo merchant: set plan=PRO, status ACTIVE, limits JSONB, and create subscription

-- 1. Update demo-merchant to PRO plan with full limits
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'plan'
  ) THEN
    EXECUTE $sql$UPDATE merchants SET plan = 'PRO' WHERE id = 'demo-merchant'$sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'is_active'
  ) THEN
    EXECUTE $sql$UPDATE merchants SET is_active = true WHERE id = 'demo-merchant'$sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'daily_token_budget'
  ) THEN
    EXECUTE $sql$UPDATE merchants SET daily_token_budget = 800000 WHERE id = 'demo-merchant'$sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'plan_limits'
  ) THEN
    EXECUTE $sql$
      UPDATE merchants
      SET plan_limits = '{
        "messagesPerMonth": 50000,
        "whatsappNumbers": 3,
        "teamMembers": 3,
        "tokenBudgetDaily": 800000,
        "aiCallsPerDay": 1500
      }'::jsonb
      WHERE id = 'demo-merchant'
    $sql$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'limits'
  ) THEN
    EXECUTE $sql$
      UPDATE merchants
      SET limits = '{
        "messagesPerMonth": 50000,
        "whatsappNumbers": 3,
        "teamMembers": 3,
        "tokenBudgetDaily": 800000,
        "aiCallsPerDay": 1500
      }'::jsonb
      WHERE id = 'demo-merchant'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'enabled_agents'
  ) THEN
    EXECUTE $sql$
      UPDATE merchants
      SET enabled_agents = ARRAY[
        'OPS_AGENT',
        'INVENTORY_AGENT',
        'FINANCE_AGENT'
      ]
      WHERE id = 'demo-merchant'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'enabled_features'
  ) THEN
    EXECUTE $sql$
      UPDATE merchants
      SET enabled_features = ARRAY[
        'CONVERSATIONS', 'ORDERS', 'CATALOG',
        'VOICE_NOTES', 'REPORTS', 'NOTIFICATIONS',
        'INVENTORY', 'API_ACCESS',
        'PAYMENTS', 'VISION_OCR', 'KPI_DASHBOARD',
        'WEBHOOKS', 'TEAM', 'AUDIT_LOGS'
      ]
      WHERE id = 'demo-merchant'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'updated_at'
  ) THEN
    EXECUTE $sql$UPDATE merchants SET updated_at = NOW() WHERE id = 'demo-merchant'$sql$;
  END IF;
END $$;

-- 2. Create an ACTIVE subscription for demo-merchant (if billing_plans exists)
DO $$
DECLARE
  v_cancel_status TEXT := 'CANCELED';
  v_subscription_columns TEXT := 'merchant_id, plan_id, status';
  v_subscription_values TEXT := quote_literal('demo-merchant') || ', bp.id, ''ACTIVE''';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN
    -- Ensure PRO plan exists without assuming optional columns.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'billing_plans' AND column_name = 'code'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'billing_plans' AND column_name = 'name'
    ) THEN
      EXECUTE $sql$
        INSERT INTO billing_plans (code, name)
        SELECT 'PRO', 'Pro'
        WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE code = 'PRO')
      $sql$;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_subscriptions') THEN
      -- Handle enum spelling differences: CANCELED vs CANCELLED.
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'subscription_status'
          AND e.enumlabel = 'CANCELLED'
      ) THEN
        v_cancel_status := 'CANCELLED';
      ELSIF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'subscription_status'
          AND e.enumlabel = 'CANCELED'
      ) THEN
        v_cancel_status := 'CANCELED';
      END IF;

      -- Cancel any existing PENDING/ACTIVE subscriptions for demo merchant.
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'merchant_subscriptions' AND column_name = 'updated_at'
      ) THEN
        EXECUTE format(
          'UPDATE merchant_subscriptions SET status = %L, updated_at = NOW() WHERE merchant_id = %L AND status IN (''PENDING'', ''ACTIVE'')',
          v_cancel_status,
          'demo-merchant'
        );
      ELSE
        EXECUTE format(
          'UPDATE merchant_subscriptions SET status = %L WHERE merchant_id = %L AND status IN (''PENDING'', ''ACTIVE'')',
          v_cancel_status,
          'demo-merchant'
        );
      END IF;

      -- Build insert columns dynamically to support schema variants.
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'merchant_subscriptions' AND column_name = 'provider'
      ) THEN
        v_subscription_columns := v_subscription_columns || ', provider';
        v_subscription_values := v_subscription_values || ', ''manual''';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'merchant_subscriptions' AND column_name = 'current_period_start'
      ) THEN
        v_subscription_columns := v_subscription_columns || ', current_period_start';
        v_subscription_values := v_subscription_values || ', NOW()';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'merchant_subscriptions' AND column_name = 'current_period_end'
      ) THEN
        v_subscription_columns := v_subscription_columns || ', current_period_end';
        v_subscription_values := v_subscription_values || ', NOW() + INTERVAL ''30 days''';
      END IF;

      EXECUTE format(
        'INSERT INTO merchant_subscriptions (%s) SELECT %s FROM billing_plans bp WHERE bp.code = %L LIMIT 1',
        v_subscription_columns,
        v_subscription_values,
        'PRO'
      );
    END IF;
  END IF;
END $$;

-- 3. Ensure agent subscriptions are active
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_agent_subscriptions'
  ) THEN
    RETURN;
  END IF;

  -- New schema shape.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'agent_type'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'is_enabled'
  ) THEN
    EXECUTE $sql$
      INSERT INTO merchant_agent_subscriptions (merchant_id, agent_type, is_enabled)
      VALUES
        ('demo-merchant', 'OPS_AGENT', true),
        ('demo-merchant', 'INVENTORY_AGENT', true),
        ('demo-merchant', 'FINANCE_AGENT', true)
      ON CONFLICT (merchant_id, agent_type)
      DO UPDATE SET is_enabled = true
    $sql$;

  -- Legacy schema shape.
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'agent_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'enabled'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'updated_at'
    ) THEN
      EXECUTE $sql$
        INSERT INTO merchant_agent_subscriptions (merchant_id, agent_name, enabled, settings, plan_tier)
        VALUES
          ('demo-merchant', 'operations', true, '{}'::jsonb, 'pro'),
          ('demo-merchant', 'inventory', true, '{}'::jsonb, 'pro'),
          ('demo-merchant', 'finance', true, '{}'::jsonb, 'pro')
        ON CONFLICT (merchant_id, agent_name)
        DO UPDATE SET enabled = true, settings = '{}'::jsonb, plan_tier = 'pro', updated_at = NOW()
      $sql$;
    ELSE
      EXECUTE $sql$
        INSERT INTO merchant_agent_subscriptions (merchant_id, agent_name, enabled, settings, plan_tier)
        VALUES
          ('demo-merchant', 'operations', true, '{}'::jsonb, 'pro'),
          ('demo-merchant', 'inventory', true, '{}'::jsonb, 'pro'),
          ('demo-merchant', 'finance', true, '{}'::jsonb, 'pro')
        ON CONFLICT (merchant_id, agent_name)
        DO UPDATE SET enabled = true, settings = '{}'::jsonb, plan_tier = 'pro'
      $sql$;
    END IF;
  END IF;
END $$;
