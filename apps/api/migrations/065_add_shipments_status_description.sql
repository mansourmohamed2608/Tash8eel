-- Migration 065 - Add status_description to shipments

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments') THEN
    ALTER TABLE shipments
      ADD COLUMN IF NOT EXISTS status_description TEXT;
  END IF;
END $$;
