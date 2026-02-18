-- Migration 033 - Ensure KPI delivery columns exist

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_address JSONB;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments') THEN
    ALTER TABLE shipments
      ADD COLUMN IF NOT EXISTS failure_reason TEXT,
      ADD COLUMN IF NOT EXISTS actual_delivery TIMESTAMPTZ;
  END IF;
END $$;
