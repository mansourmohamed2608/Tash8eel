-- Patch customers table to ensure preferences column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;
