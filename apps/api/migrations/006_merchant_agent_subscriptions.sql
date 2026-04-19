-- Migration: 006_merchant_agent_subscriptions.sql
-- Add agent subscriptions per merchant for orchestrator filtering

-- Add enabled_agents column to merchants table
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS enabled_agents TEXT[] DEFAULT ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'SUPPORT_AGENT'];

-- Add missing values to task_status enum
DO $$
BEGIN
  -- Add ASSIGNED if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ASSIGNED' AND enumtypid = 'task_status'::regtype) THEN
    ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'ASSIGNED';
  END IF;
END $$;

DO $$
BEGIN
  -- Add RUNNING if it doesn't exist  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RUNNING' AND enumtypid = 'task_status'::regtype) THEN
    ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'RUNNING';
  END IF;
END $$;

DO $$
BEGIN
  -- Add SKIPPED if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SKIPPED' AND enumtypid = 'task_status'::regtype) THEN
    ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'SKIPPED';
  END IF;
END $$;

-- Note: CHECK constraints with string comparison won't work with enums
-- The enum type itself enforces valid values, so we don't need additional CHECK constraint

-- Add index for filtering by enabled agents
CREATE INDEX IF NOT EXISTS idx_merchants_enabled_agents ON merchants USING gin (enabled_agents);

-- Create agent_subscription_audit table for tracking changes
CREATE TABLE IF NOT EXISTS agent_subscription_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  action VARCHAR(20) NOT NULL, -- 'ENABLED' or 'DISABLED'
  agent_type VARCHAR(50) NOT NULL,
  changed_by VARCHAR(100),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_subscription_audit_merchant ON agent_subscription_audit(merchant_id);
CREATE INDEX IF NOT EXISTS idx_agent_subscription_audit_changed_at ON agent_subscription_audit(changed_at);

-- Update existing merchants to have default agent subscriptions
UPDATE merchants 
SET enabled_agents = ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'SUPPORT_AGENT']
WHERE enabled_agents IS NULL;

COMMENT ON COLUMN merchants.enabled_agents IS 'Array of agent types enabled for this merchant. Orchestrator will skip tasks for disabled agents.';
