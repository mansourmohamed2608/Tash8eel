-- Migration: 030_schema_patch.sql
-- Description: Patch legacy schemas to ensure required columns exist

-- Notifications table patches
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS title_ar VARCHAR(255),
      ADD COLUMN IF NOT EXISTS message_ar TEXT,
      ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'MEDIUM',
      ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['IN_APP'],
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS action_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Agent tasks patches
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_tasks') THEN
    ALTER TABLE agent_tasks
      ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5,
      ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS input JSONB;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
      ALTER TABLE agent_tasks
        ADD COLUMN IF NOT EXISTS status task_status DEFAULT 'PENDING';
    ELSE
      ALTER TABLE agent_tasks
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_tasks' AND column_name = 'agent_type'
    ) THEN
      ALTER TABLE agent_tasks ADD COLUMN agent_type VARCHAR(50);
    END IF;
  END IF;
END $$;
