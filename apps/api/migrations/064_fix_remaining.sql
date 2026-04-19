-- Migration 064: Add missing merchant_command_channels table and permission_templates.merchant_id column

-- 1. merchant_command_channels (from 048_merchant_copilot.sql)
CREATE TABLE IF NOT EXISTS merchant_command_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    UNIQUE(merchant_id, phone_number)
);
CREATE INDEX IF NOT EXISTS idx_merchant_command_phone ON merchant_command_channels(phone_number) WHERE is_active = TRUE;

-- 2. Add merchant_id to permission_templates if missing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permission_templates') THEN
    ALTER TABLE permission_templates
      ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE CASCADE;
  END IF;
END $$;
