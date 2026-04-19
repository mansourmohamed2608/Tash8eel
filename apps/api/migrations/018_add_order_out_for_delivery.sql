-- Migration: 018_add_order_out_for_delivery.sql
-- Add OUT_FOR_DELIVERY to order_status enum

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'OUT_FOR_DELIVERY'
      AND enumtypid = 'order_status'::regtype
  ) THEN
    ALTER TYPE order_status ADD VALUE 'OUT_FOR_DELIVERY';
  END IF;
END $$;
