-- Migration 007: Fix agent_tasks schema for orchestrator compatibility
-- ============================================================================
-- This migration aligns the agent_tasks table schema with what the orchestrator
-- service expects, including enum value changes and new columns.
-- ============================================================================

-- Add missing columns to agent_tasks
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS output JSONB,
ADD COLUMN IF NOT EXISTS error TEXT,
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- Update the task_status enum to include ASSIGNED, RUNNING, SKIPPED
-- First, we need to add the new values to the enum
DO $$
BEGIN
  -- Add ASSIGNED if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ASSIGNED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')) THEN
    ALTER TYPE task_status ADD VALUE 'ASSIGNED' AFTER 'PENDING';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  -- Add RUNNING if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RUNNING' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')) THEN
    ALTER TYPE task_status ADD VALUE 'RUNNING' AFTER 'ASSIGNED';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  -- Add SKIPPED if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SKIPPED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')) THEN
    ALTER TYPE task_status ADD VALUE 'SKIPPED' AFTER 'FAILED';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create a new agent_type_v2 enum with uppercase values that match the orchestrator
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_type_v2') THEN
    CREATE TYPE agent_type_v2 AS ENUM ('OPS_AGENT', 'INVENTORY_AGENT', 'FINANCE_AGENT', 'MARKETING_AGENT', 'CONTENT_AGENT', 'SUPPORT_AGENT');
  END IF;
END $$;

-- Add a new column with the correct enum type
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS agent_type_new agent_type_v2;

-- Migrate data from old column to new column
UPDATE agent_tasks SET agent_type_new = 
  CASE agent_type::text
    WHEN 'ops' THEN 'OPS_AGENT'::agent_type_v2
    WHEN 'inventory' THEN 'INVENTORY_AGENT'::agent_type_v2
    WHEN 'finance' THEN 'FINANCE_AGENT'::agent_type_v2
    WHEN 'marketing' THEN 'MARKETING_AGENT'::agent_type_v2
    WHEN 'content' THEN 'CONTENT_AGENT'::agent_type_v2
    WHEN 'support' THEN 'SUPPORT_AGENT'::agent_type_v2
  END
WHERE agent_type_new IS NULL AND agent_type IS NOT NULL;

-- Drop the old column and rename the new one
ALTER TABLE agent_tasks DROP COLUMN IF EXISTS agent_type CASCADE;
ALTER TABLE agent_tasks RENAME COLUMN agent_type_new TO agent_type;

-- Also update agent_results table
ALTER TABLE agent_results
ADD COLUMN IF NOT EXISTS agent_type_new agent_type_v2;

UPDATE agent_results SET agent_type_new = 
  CASE agent_type::text
    WHEN 'ops' THEN 'OPS_AGENT'::agent_type_v2
    WHEN 'inventory' THEN 'INVENTORY_AGENT'::agent_type_v2
    WHEN 'finance' THEN 'FINANCE_AGENT'::agent_type_v2
    WHEN 'marketing' THEN 'MARKETING_AGENT'::agent_type_v2
    WHEN 'content' THEN 'CONTENT_AGENT'::agent_type_v2
    WHEN 'support' THEN 'SUPPORT_AGENT'::agent_type_v2
  END
WHERE agent_type_new IS NULL AND agent_type IS NOT NULL;

ALTER TABLE agent_results DROP COLUMN IF EXISTS agent_type CASCADE;
ALTER TABLE agent_results RENAME COLUMN agent_type_new TO agent_type;

-- Recreate indexes for agent_tasks
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_v3 ON agent_tasks(agent_type, status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_pending ON agent_tasks(status, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_agent_tasks_timeout ON agent_tasks(timeout_at) WHERE timeout_at IS NOT NULL;

-- Make agent_type NOT NULL after migration (with a default)
-- First set a default for any null values
UPDATE agent_tasks SET agent_type = 'OPS_AGENT'::agent_type_v2 WHERE agent_type IS NULL;

-- Now make it NOT NULL
ALTER TABLE agent_tasks ALTER COLUMN agent_type SET NOT NULL;

-- Drop the old enum type if no longer used
-- (Commented out for safety - can be done manually later)
-- DROP TYPE IF EXISTS agent_type;
