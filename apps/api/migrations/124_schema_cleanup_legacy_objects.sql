-- 124_schema_cleanup_legacy_objects.sql
-- Purpose:
-- 1) Remove truly legacy tables no longer used by runtime
-- 2) Remove legacy compatibility columns after bridge migration stabilized
-- 3) Keep customer_tags because runtime still writes to it

DROP TABLE IF EXISTS merchant_addons CASCADE;
DROP TABLE IF EXISTS notification_preferences_legacy CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_payments'
      AND column_name = 'legacy_order_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM order_payments WHERE legacy_order_id IS NOT NULL LIMIT 1) THEN
      RAISE WARNING 'order_payments.legacy_order_id has data; keeping column for safety';
    ELSE
      ALTER TABLE order_payments DROP COLUMN legacy_order_id;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'merchant_agent_subscriptions'
  ) THEN
    UPDATE merchant_agent_subscriptions
    SET
      agent_type = COALESCE(
        agent_type,
        CASE
          WHEN upper(COALESCE(agent_name, '')) IN ('OPS_AGENT', 'OPERATIONS', 'OPS') THEN 'OPS_AGENT'
          WHEN upper(COALESCE(agent_name, '')) IN ('INVENTORY_AGENT', 'INVENTORY') THEN 'INVENTORY_AGENT'
          WHEN upper(COALESCE(agent_name, '')) IN ('FINANCE_AGENT', 'FINANCE') THEN 'FINANCE_AGENT'
          WHEN upper(COALESCE(agent_name, '')) IN ('MARKETING_AGENT', 'MARKETING') THEN 'MARKETING_AGENT'
          WHEN upper(COALESCE(agent_name, '')) IN ('CONTENT_AGENT', 'CONTENT') THEN 'CONTENT_AGENT'
          WHEN upper(COALESCE(agent_name, '')) IN ('SUPPORT_AGENT', 'SUPPORT') THEN 'SUPPORT_AGENT'
          WHEN agent_name IS NULL OR btrim(agent_name) = '' THEN 'OPS_AGENT'
          ELSE upper(regexp_replace(agent_name, '[^A-Za-z0-9]+', '_', 'g')) || '_AGENT'
        END
      ),
      is_enabled = COALESCE(is_enabled, enabled, false),
      config = COALESCE(config, settings, '{}'::jsonb),
      enabled_at = COALESCE(enabled_at, CASE WHEN COALESCE(is_enabled, enabled, false) THEN COALESCE(updated_at, created_at, NOW()) ELSE NULL END),
      disabled_at = COALESCE(disabled_at, CASE WHEN COALESCE(is_enabled, enabled, false) THEN NULL ELSE COALESCE(updated_at, created_at, NOW()) END)
    WHERE agent_type IS NULL
       OR is_enabled IS NULL
       OR config IS NULL
       OR enabled_at IS NULL
       OR disabled_at IS NULL;

    ALTER TABLE merchant_agent_subscriptions
      ALTER COLUMN is_enabled SET DEFAULT false,
      ALTER COLUMN config SET DEFAULT '{}'::jsonb;

    DROP TRIGGER IF EXISTS trg_sync_merchant_agent_subscriptions_compat
      ON merchant_agent_subscriptions;

    DROP FUNCTION IF EXISTS sync_merchant_agent_subscriptions_compat();

    ALTER TABLE merchant_agent_subscriptions
      DROP COLUMN IF EXISTS agent_name,
      DROP COLUMN IF EXISTS enabled,
      DROP COLUMN IF EXISTS settings,
      DROP COLUMN IF EXISTS plan_tier;
  END IF;
END $$;
