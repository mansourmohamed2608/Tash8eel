-- Migration: 045_conversations_human_operator.sql
-- Add human_operator_id and human_takeover_at columns to conversations table for takeover functionality

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'human_operator_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN human_operator_id VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'human_takeover_at'
  ) THEN
    ALTER TABLE conversations ADD COLUMN human_takeover_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add index for querying by operator
CREATE INDEX IF NOT EXISTS idx_conversations_operator 
ON conversations(human_operator_id) WHERE human_operator_id IS NOT NULL;
