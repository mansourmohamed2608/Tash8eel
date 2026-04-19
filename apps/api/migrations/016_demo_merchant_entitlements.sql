-- Migration: 016_demo_merchant_entitlements.sql
-- Ensure demo-merchant has full agent + feature access for testing/demo purposes

UPDATE merchants
SET enabled_agents = ARRAY[
  'OPS_AGENT',
  'INVENTORY_AGENT',
  'FINANCE_AGENT',
  'MARKETING_AGENT',
  'SUPPORT_AGENT',
  'CONTENT_AGENT'
],
enabled_features = ARRAY[
  'CONVERSATIONS',
  'ORDERS',
  'CATALOG',
  'INVENTORY',
  'PAYMENTS',
  'VISION_OCR',
  'VOICE_NOTES',
  'REPORTS',
  'WEBHOOKS',
  'TEAM',
  'LOYALTY',
  'NOTIFICATIONS',
  'AUDIT_LOGS',
  'KPI_DASHBOARD',
  'API_ACCESS'
],
updated_at = NOW()
WHERE id = 'demo-merchant';

-- Optional: seed legacy agent subscription table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'merchant_agent_subscriptions'
      AND column_name = 'agent_name'
  ) AND EXISTS (
    SELECT 1
    FROM merchants
    WHERE id = 'demo-merchant'
  ) THEN
    INSERT INTO merchant_agent_subscriptions (merchant_id, agent_name, enabled, settings, plan_tier)
    VALUES
      ('demo-merchant', 'operations', true, '{}'::jsonb, 'enterprise'),
      ('demo-merchant', 'inventory', true, '{}'::jsonb, 'enterprise'),
      ('demo-merchant', 'finance', true, '{}'::jsonb, 'enterprise'),
      ('demo-merchant', 'marketing', true, '{}'::jsonb, 'enterprise'),
      ('demo-merchant', 'content', true, '{}'::jsonb, 'enterprise'),
      ('demo-merchant', 'support', true, '{}'::jsonb, 'enterprise')
    ON CONFLICT (merchant_id, agent_name)
    DO UPDATE SET enabled = true, plan_tier = 'enterprise', updated_at = NOW();
  END IF;
END $$;
