-- Migration: 017_add_human_takeover_state.sql
-- Add HUMAN_TAKEOVER to conversation_state enum for takeover workflow

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'HUMAN_TAKEOVER'
      AND enumtypid = 'conversation_state'::regtype
  ) THEN
    ALTER TYPE conversation_state ADD VALUE 'HUMAN_TAKEOVER';
  END IF;
END $$;
