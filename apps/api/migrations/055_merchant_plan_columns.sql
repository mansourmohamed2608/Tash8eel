-- 055: Add missing plan/billing columns to merchants table
-- These columns are referenced in controllers but were never formally migrated

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'STARTER';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan_limits JSONB DEFAULT '{}';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS custom_price INTEGER;

-- Add delivery_drivers table for internal delivery management
CREATE TABLE IF NOT EXISTS delivery_drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  whatsapp_number VARCHAR(50),
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ON_DELIVERY')),
  vehicle_type VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_drivers_merchant ON delivery_drivers(merchant_id);

-- Add driver assignment to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES delivery_drivers(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_collected BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_collected_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_collected_amount NUMERIC(12,2);

-- POS integration settings table
CREATE TABLE IF NOT EXISTS pos_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('ODOO', 'FOODICS', 'ORACLE_MICROS', 'SHOPIFY', 'SQUARE', 'CUSTOM')),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ERROR')),
  config JSONB DEFAULT '{}',
  credentials JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  sync_interval_minutes INTEGER DEFAULT 15,
  field_mapping JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_pos_integrations_merchant ON pos_integrations(merchant_id);

-- Custom permissions for team members
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_staff') THEN
    ALTER TABLE merchant_staff ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff') THEN
    ALTER TABLE staff ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_members') THEN
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL;
  END IF;
END $$;
