-- Migration 032 - Add failure_reason to shipments for KPI queries

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments') THEN
    ALTER TABLE shipments
      ADD COLUMN IF NOT EXISTS failure_reason TEXT;
  END IF;
END $$;
