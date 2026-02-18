-- Migration: Add more missing columns to orders table
-- delivery_preference and idempotency_key are used by the order repository

-- Add delivery_preference column to orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'delivery_preference'
    ) THEN
        ALTER TABLE orders ADD COLUMN delivery_preference VARCHAR(50);
        RAISE NOTICE 'Added orders.delivery_preference';
    END IF;
END $$;

-- Add idempotency_key column to orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'idempotency_key'
    ) THEN
        ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(255) UNIQUE;
        RAISE NOTICE 'Added orders.idempotency_key';
    END IF;
END $$;
