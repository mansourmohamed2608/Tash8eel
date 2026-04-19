-- Migration: Add missing columns to conversations table
-- These columns exist in init.sql but may be missing due to schema drift

-- Add collected_info if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'conversations' 
                   AND column_name = 'collected_info') THEN
        ALTER TABLE conversations ADD COLUMN collected_info JSONB NOT NULL DEFAULT '{}';
    END IF;
END $$;

-- Add missing_slots if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'conversations' 
                   AND column_name = 'missing_slots') THEN
        ALTER TABLE conversations ADD COLUMN missing_slots TEXT[] NOT NULL DEFAULT '{}';
    END IF;
END $$;

-- Add delivery_fee if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'conversations' 
                   AND column_name = 'delivery_fee') THEN
        ALTER TABLE conversations ADD COLUMN delivery_fee DECIMAL(10,2);
    END IF;
END $$;

-- Add delivery_notes if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'conversations' 
                   AND column_name = 'delivery_notes') THEN
        ALTER TABLE conversations ADD COLUMN delivery_notes TEXT;
    END IF;
END $$;
