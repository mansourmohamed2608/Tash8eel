-- Migration: 012_merchant_entitlements.sql
-- Add feature entitlements to merchants table for fine-grained access control

-- Add enabled_features column to merchants table
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS enabled_features TEXT[] DEFAULT ARRAY[
  'CONVERSATIONS', 'ORDERS', 'CATALOG'
];

-- Update enabled_agents to use consistent naming (if not already done)
-- This is idempotent - won't fail if column doesn't exist or already has data
DO $$
BEGIN
  -- Ensure enabled_agents has a default
  ALTER TABLE merchants ALTER COLUMN enabled_agents SET DEFAULT ARRAY['OPS_AGENT'];
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Create index for filtering by enabled features
CREATE INDEX IF NOT EXISTS idx_merchants_enabled_features ON merchants USING gin (enabled_features);

-- Create entitlement_changes audit table
CREATE TABLE IF NOT EXISTS entitlement_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
  change_type VARCHAR(20) NOT NULL, -- 'AGENT_ENABLED', 'AGENT_DISABLED', 'FEATURE_ENABLED', 'FEATURE_DISABLED'
  entity_type VARCHAR(20) NOT NULL, -- 'AGENT' or 'FEATURE'
  entity_name VARCHAR(50) NOT NULL, -- The agent or feature name
  previous_value BOOLEAN,
  new_value BOOLEAN,
  changed_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_changes_merchant ON entitlement_changes(merchant_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_changes_created ON entitlement_changes(created_at);

-- Update existing merchants to have default feature entitlements
UPDATE merchants 
SET enabled_features = ARRAY['CONVERSATIONS', 'ORDERS', 'CATALOG']
WHERE enabled_features IS NULL;

-- Merchants with INVENTORY_AGENT should have INVENTORY feature
UPDATE merchants 
SET enabled_features = array_append(enabled_features, 'INVENTORY')
WHERE 'INVENTORY_AGENT' = ANY(enabled_agents) 
  AND NOT 'INVENTORY' = ANY(COALESCE(enabled_features, ARRAY[]::TEXT[]));

-- Add catalog to enabled_features if missing
UPDATE merchants
SET enabled_features = array_append(enabled_features, 'CATALOG')
WHERE NOT 'CATALOG' = ANY(COALESCE(enabled_features, ARRAY[]::TEXT[]));

-- Add comments for documentation
COMMENT ON COLUMN merchants.enabled_features IS 'Array of feature types enabled for this merchant. Controllers check this for feature-gating.';
COMMENT ON TABLE entitlement_changes IS 'Audit log for agent and feature entitlement changes per merchant.';

-- Function to log entitlement changes
CREATE OR REPLACE FUNCTION log_entitlement_change()
RETURNS TRIGGER AS $$
DECLARE
  old_agents TEXT[];
  new_agents TEXT[];
  old_features TEXT[];
  new_features TEXT[];
  agent TEXT;
  feature TEXT;
BEGIN
  old_agents := COALESCE(OLD.enabled_agents, ARRAY[]::TEXT[]);
  new_agents := COALESCE(NEW.enabled_agents, ARRAY[]::TEXT[]);
  old_features := COALESCE(OLD.enabled_features, ARRAY[]::TEXT[]);
  new_features := COALESCE(NEW.enabled_features, ARRAY[]::TEXT[]);
  
  -- Check for new agents enabled
  FOREACH agent IN ARRAY new_agents LOOP
    IF NOT agent = ANY(old_agents) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'AGENT_ENABLED', 'AGENT', agent, false, true);
    END IF;
  END LOOP;
  
  -- Check for agents disabled
  FOREACH agent IN ARRAY old_agents LOOP
    IF NOT agent = ANY(new_agents) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'AGENT_DISABLED', 'AGENT', agent, true, false);
    END IF;
  END LOOP;
  
  -- Check for new features enabled
  FOREACH feature IN ARRAY new_features LOOP
    IF NOT feature = ANY(old_features) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'FEATURE_ENABLED', 'FEATURE', feature, false, true);
    END IF;
  END LOOP;
  
  -- Check for features disabled
  FOREACH feature IN ARRAY old_features LOOP
    IF NOT feature = ANY(new_features) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'FEATURE_DISABLED', 'FEATURE', feature, true, false);
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for entitlement change logging
DROP TRIGGER IF EXISTS tr_log_entitlement_changes ON merchants;
CREATE TRIGGER tr_log_entitlement_changes
  AFTER UPDATE OF enabled_agents, enabled_features ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION log_entitlement_change();
