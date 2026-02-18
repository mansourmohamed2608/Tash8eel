-- Migration: 014_inventory_locations.sql
-- Description: Add warehouse locations and stock-by-location tracking

-- Warehouse locations
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_merchant ON warehouse_locations(merchant_id);

-- Stock by location
CREATE TABLE IF NOT EXISTS inventory_stock_by_location (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES inventory_variants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  quantity_on_hand INTEGER DEFAULT 0,
  quantity_reserved INTEGER DEFAULT 0,
  quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  bin_location VARCHAR(100),
  last_counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, variant_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_by_location_merchant ON inventory_stock_by_location(merchant_id);
CREATE INDEX IF NOT EXISTS idx_stock_by_location_variant ON inventory_stock_by_location(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_by_location_location ON inventory_stock_by_location(location_id);
