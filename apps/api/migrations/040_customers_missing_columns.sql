-- Migration: Add all missing columns to customers table
-- This is an idempotent migration - safe to run multiple times

-- Add last_interaction_at column to customers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'last_interaction_at'
    ) THEN
        ALTER TABLE customers ADD COLUMN last_interaction_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added customers.last_interaction_at';
    END IF;
END $$;

-- Update existing rows to have last_interaction_at = updated_at
UPDATE customers 
SET last_interaction_at = COALESCE(updated_at, created_at, NOW()) 
WHERE last_interaction_at IS NULL;
