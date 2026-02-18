-- Migration 031 - audit_logs correlation_id column fix

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100);
  END IF;
END $$;
