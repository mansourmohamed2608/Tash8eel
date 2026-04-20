-- 123_pos_and_agent_subscription_schema_compat.sql
-- Purpose:
-- 1) Ensure order_payments exists with UUID order_id compatible with orders(id)
-- 2) Bridge legacy/new merchant_agent_subscriptions columns to a stable shape

-- ---------------------------------------------------------------------------
-- Ensure order_payments exists with correct FK type (order_id UUID)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchants')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    CREATE TABLE IF NOT EXISTS order_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      method VARCHAR(50) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      reference TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'PAID',
      collected_by VARCHAR(255),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_payments') THEN
    -- Keep legacy non-UUID values for audit before type conversion.
    ALTER TABLE order_payments
      ADD COLUMN IF NOT EXISTS legacy_order_id TEXT;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'order_payments'
        AND column_name = 'order_id'
        AND udt_name <> 'uuid'
    ) THEN
      UPDATE order_payments
      SET legacy_order_id = COALESCE(legacy_order_id, order_id::text)
      WHERE order_id IS NOT NULL
        AND order_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

      ALTER TABLE order_payments
        DROP CONSTRAINT IF EXISTS order_payments_order_id_fkey;

      ALTER TABLE order_payments
        ALTER COLUMN order_id TYPE UUID
        USING CASE
          WHEN order_id IS NULL THEN NULL
          WHEN order_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN order_id::uuid
          ELSE NULL
        END;
    END IF;

    UPDATE order_payments
    SET metadata = '{}'::jsonb
    WHERE metadata IS NULL;

    ALTER TABLE order_payments
      ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
      ALTER COLUMN amount SET DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_payments')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    ALTER TABLE order_payments
      DROP CONSTRAINT IF EXISTS order_payments_order_id_fkey;

    ALTER TABLE order_payments
      ADD CONSTRAINT order_payments_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

    IF NOT EXISTS (SELECT 1 FROM order_payments WHERE order_id IS NULL) THEN
      ALTER TABLE order_payments
        ALTER COLUMN order_id SET NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_payments') THEN
    CREATE INDEX IF NOT EXISTS idx_order_payments_order
      ON order_payments(order_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_order_payments_merchant
      ON order_payments(merchant_id, created_at DESC);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- merchant_agent_subscriptions legacy/new schema compatibility bridge
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_agent_subscriptions') THEN
    -- Legacy columns may already exist; keep both legacy + new columns in sync.
    ALTER TABLE merchant_agent_subscriptions
      ADD COLUMN IF NOT EXISTS agent_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN,
      ADD COLUMN IF NOT EXISTS settings JSONB,
      ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(50),
      ADD COLUMN IF NOT EXISTS agent_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN,
      ADD COLUMN IF NOT EXISTS config JSONB,
      ADD COLUMN IF NOT EXISTS enabled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

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
      enabled_at = COALESCE(
        enabled_at,
        CASE WHEN COALESCE(is_enabled, enabled, false)
          THEN COALESCE(updated_at, created_at, NOW())
          ELSE NULL
        END
      ),
      disabled_at = COALESCE(
        disabled_at,
        CASE WHEN COALESCE(is_enabled, enabled, false)
          THEN NULL
          ELSE COALESCE(updated_at, created_at, NOW())
        END
      )
    WHERE agent_type IS NULL
       OR is_enabled IS NULL
       OR config IS NULL
       OR enabled_at IS NULL
       OR disabled_at IS NULL;

    UPDATE merchant_agent_subscriptions
    SET
      agent_name = COALESCE(
        agent_name,
        CASE
          WHEN agent_type = 'OPS_AGENT' THEN 'operations'
          WHEN agent_type = 'INVENTORY_AGENT' THEN 'inventory'
          WHEN agent_type = 'FINANCE_AGENT' THEN 'finance'
          WHEN agent_type = 'MARKETING_AGENT' THEN 'marketing'
          WHEN agent_type = 'CONTENT_AGENT' THEN 'content'
          WHEN agent_type = 'SUPPORT_AGENT' THEN 'support'
          ELSE lower(regexp_replace(COALESCE(agent_type, 'ops_agent'), '_agent$', '', 'i'))
        END
      ),
      enabled = COALESCE(enabled, is_enabled, false),
      settings = COALESCE(settings, config, '{}'::jsonb),
      plan_tier = COALESCE(plan_tier, 'basic')
    WHERE agent_name IS NULL
       OR enabled IS NULL
       OR settings IS NULL
       OR plan_tier IS NULL;

    UPDATE merchant_agent_subscriptions
    SET config = '{}'::jsonb
    WHERE config IS NULL;

    UPDATE merchant_agent_subscriptions
    SET settings = '{}'::jsonb
    WHERE settings IS NULL;

    UPDATE merchant_agent_subscriptions
    SET is_enabled = false
    WHERE is_enabled IS NULL;

    UPDATE merchant_agent_subscriptions
    SET enabled = false
    WHERE enabled IS NULL;

    ALTER TABLE merchant_agent_subscriptions
      ALTER COLUMN config SET DEFAULT '{}'::jsonb,
      ALTER COLUMN settings SET DEFAULT '{}'::jsonb,
      ALTER COLUMN is_enabled SET DEFAULT false,
      ALTER COLUMN enabled SET DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_agent_subscriptions') THEN
    -- Keep latest row per (merchant_id, agent_type) before adding unique key.
    WITH ranked AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY merchant_id, agent_type
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM merchant_agent_subscriptions
      WHERE agent_type IS NOT NULL
    )
    DELETE FROM merchant_agent_subscriptions mas
    USING ranked r
    WHERE mas.ctid = r.ctid
      AND r.rn > 1;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_agent_subscriptions') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS merchant_agent_subscriptions_merchant_id_agent_type_key
      ON merchant_agent_subscriptions(merchant_id, agent_type);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_merchant_agent_subscriptions_compat()
RETURNS TRIGGER AS $$
BEGIN
  NEW.agent_type := COALESCE(
    NEW.agent_type,
    CASE
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('OPS_AGENT', 'OPERATIONS', 'OPS') THEN 'OPS_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('INVENTORY_AGENT', 'INVENTORY') THEN 'INVENTORY_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('FINANCE_AGENT', 'FINANCE') THEN 'FINANCE_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('MARKETING_AGENT', 'MARKETING') THEN 'MARKETING_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('CONTENT_AGENT', 'CONTENT') THEN 'CONTENT_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('SUPPORT_AGENT', 'SUPPORT') THEN 'SUPPORT_AGENT'
      WHEN NEW.agent_name IS NULL OR btrim(NEW.agent_name) = '' THEN 'OPS_AGENT'
      ELSE upper(regexp_replace(NEW.agent_name, '[^A-Za-z0-9]+', '_', 'g')) || '_AGENT'
    END
  );

  NEW.agent_name := COALESCE(
    NEW.agent_name,
    CASE
      WHEN NEW.agent_type = 'OPS_AGENT' THEN 'operations'
      WHEN NEW.agent_type = 'INVENTORY_AGENT' THEN 'inventory'
      WHEN NEW.agent_type = 'FINANCE_AGENT' THEN 'finance'
      WHEN NEW.agent_type = 'MARKETING_AGENT' THEN 'marketing'
      WHEN NEW.agent_type = 'CONTENT_AGENT' THEN 'content'
      WHEN NEW.agent_type = 'SUPPORT_AGENT' THEN 'support'
      ELSE lower(regexp_replace(COALESCE(NEW.agent_type, 'ops_agent'), '_agent$', '', 'i'))
    END
  );

  NEW.is_enabled := COALESCE(NEW.is_enabled, NEW.enabled, false);
  NEW.enabled := COALESCE(NEW.enabled, NEW.is_enabled, false);

  NEW.config := COALESCE(NEW.config, NEW.settings, '{}'::jsonb);
  NEW.settings := COALESCE(NEW.settings, NEW.config, '{}'::jsonb);

  NEW.updated_at := COALESCE(NEW.updated_at, NOW());
  NEW.created_at := COALESCE(NEW.created_at, NEW.updated_at, NOW());

  IF NEW.is_enabled THEN
    NEW.enabled_at := COALESCE(NEW.enabled_at, NEW.updated_at, NOW());
    NEW.disabled_at := NULL;
  ELSE
    NEW.disabled_at := COALESCE(NEW.disabled_at, NEW.updated_at, NOW());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_agent_subscriptions') THEN
    DROP TRIGGER IF EXISTS trg_sync_merchant_agent_subscriptions_compat
      ON merchant_agent_subscriptions;

    CREATE TRIGGER trg_sync_merchant_agent_subscriptions_compat
      BEFORE INSERT OR UPDATE ON merchant_agent_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION sync_merchant_agent_subscriptions_compat();
  END IF;
END $$;
