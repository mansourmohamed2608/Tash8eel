-- Migration 066
-- Canonicalize billing plans and force demo-merchant into a valid PRO entitlement state.

DO $$
DECLARE
  v_cancel_status TEXT := 'CANCELED';
  v_subscription_columns TEXT := 'merchant_id, plan_id, status';
  v_subscription_values TEXT := quote_literal('demo-merchant') || ', bp.id, ''ACTIVE''';
  v_demo_merchant_exists BOOLEAN := false;
BEGIN
  -- 1) Canonical billing plans (source of truth used by portal pricing UI)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN
    INSERT INTO billing_plans (code, name, price_cents, currency, billing_period, description, features, agents, limits, is_active)
    VALUES
      (
        'STARTER',
        'Starter',
        44900,
        'EGP',
        'monthly',
        'للتجار الجدد - وكيل عمليات ذكي + ~33 محادثة يومياً',
        '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS"]'::jsonb,
        '["OPS_AGENT"]'::jsonb,
        '{"messagesPerMonth":10000,"whatsappNumbers":1,"teamMembers":1,"tokenBudgetDaily":150000,"aiCallsPerDay":300}'::jsonb,
        true
      ),
      (
        'GROWTH',
        'Growth',
        79900,
        'EGP',
        'monthly',
        'للتجار المتوسعين - +وكيل مخزون + ~50 محادثة يومياً',
        '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS","INVENTORY","API_ACCESS"]'::jsonb,
        '["OPS_AGENT","INVENTORY_AGENT"]'::jsonb,
        '{"messagesPerMonth":15000,"whatsappNumbers":2,"teamMembers":2,"tokenBudgetDaily":300000,"aiCallsPerDay":500}'::jsonb,
        true
      ),
      (
        'PRO',
        'Pro',
        149900,
        'EGP',
        'monthly',
        'للتجار المحترفين - +وكيل مالي + ~167 محادثة يومياً',
        '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS","INVENTORY","API_ACCESS","PAYMENTS","VISION_OCR","KPI_DASHBOARD","WEBHOOKS","TEAM","AUDIT_LOGS"]'::jsonb,
        '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
        '{"messagesPerMonth":50000,"whatsappNumbers":3,"teamMembers":3,"tokenBudgetDaily":800000,"aiCallsPerDay":1500}'::jsonb,
        true
      ),
      (
        'ENTERPRISE',
        'Enterprise',
        299900,
        'EGP',
        'monthly',
        'للمؤسسات الكبيرة - 3 وكلاء ذكية + بلا حدود',
        '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","PAYMENTS","VISION_OCR","VOICE_NOTES","REPORTS","WEBHOOKS","TEAM","NOTIFICATIONS","AUDIT_LOGS","KPI_DASHBOARD","API_ACCESS"]'::jsonb,
        '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
        '{"messagesPerMonth":-1,"whatsappNumbers":-1,"teamMembers":10,"tokenBudgetDaily":-1,"aiCallsPerDay":-1}'::jsonb,
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
        is_active = EXCLUDED.is_active;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants') THEN
    SELECT EXISTS (SELECT 1 FROM merchants WHERE id = 'demo-merchant') INTO v_demo_merchant_exists;
  END IF;

  -- 2) Ensure demo merchant row reflects PRO (entitlements + limits)
  IF v_demo_merchant_exists THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'plan'
    ) THEN
      UPDATE merchants SET plan = 'PRO' WHERE id = 'demo-merchant';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'is_active'
    ) THEN
      UPDATE merchants SET is_active = true WHERE id = 'demo-merchant';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'daily_token_budget'
    ) THEN
      UPDATE merchants SET daily_token_budget = 800000 WHERE id = 'demo-merchant';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'enabled_agents'
    ) THEN
      UPDATE merchants
      SET enabled_agents = ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'FINANCE_AGENT']
      WHERE id = 'demo-merchant';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'enabled_features'
    ) THEN
      UPDATE merchants
      SET enabled_features = ARRAY[
        'CONVERSATIONS', 'ORDERS', 'CATALOG',
        'VOICE_NOTES', 'REPORTS', 'NOTIFICATIONS',
        'INVENTORY', 'API_ACCESS',
        'PAYMENTS', 'VISION_OCR', 'KPI_DASHBOARD',
        'WEBHOOKS', 'TEAM', 'AUDIT_LOGS'
      ]
      WHERE id = 'demo-merchant';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'limits'
    ) THEN
      UPDATE merchants
      SET limits = '{"messagesPerMonth":50000,"whatsappNumbers":3,"teamMembers":3,"tokenBudgetDaily":800000,"aiCallsPerDay":1500}'::jsonb
      WHERE id = 'demo-merchant';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'plan_limits'
    ) THEN
      UPDATE merchants
      SET plan_limits = '{"messagesPerMonth":50000,"whatsappNumbers":3,"teamMembers":3,"tokenBudgetDaily":800000,"aiCallsPerDay":1500}'::jsonb
      WHERE id = 'demo-merchant';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchants' AND column_name = 'updated_at'
    ) THEN
      UPDATE merchants SET updated_at = NOW() WHERE id = 'demo-merchant';
    END IF;
  END IF;

  -- 3) Ensure demo merchant has an ACTIVE PRO subscription
    IF v_demo_merchant_exists
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_subscriptions')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN

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

  -- 4) Ensure agent subscription table reflects PRO agents
  IF v_demo_merchant_exists
     AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_agent_subscriptions'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'agent_type'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'is_enabled'
    ) THEN
      INSERT INTO merchant_agent_subscriptions (merchant_id, agent_type, is_enabled)
      VALUES
        ('demo-merchant', 'OPS_AGENT', true),
        ('demo-merchant', 'INVENTORY_AGENT', true),
        ('demo-merchant', 'FINANCE_AGENT', true)
      ON CONFLICT (merchant_id, agent_type)
      DO UPDATE SET is_enabled = true;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'agent_name'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'merchant_agent_subscriptions' AND column_name = 'enabled'
    ) THEN
      INSERT INTO merchant_agent_subscriptions (merchant_id, agent_name, enabled, settings, plan_tier)
      VALUES
        ('demo-merchant', 'operations', true, '{}'::jsonb, 'pro'),
        ('demo-merchant', 'inventory', true, '{}'::jsonb, 'pro'),
        ('demo-merchant', 'finance', true, '{}'::jsonb, 'pro')
      ON CONFLICT (merchant_id, agent_name)
      DO UPDATE SET enabled = true, settings = '{}'::jsonb, plan_tier = 'pro';
    END IF;
  END IF;
END $$;
