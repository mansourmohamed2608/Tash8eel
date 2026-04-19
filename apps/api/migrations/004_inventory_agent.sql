-- Migration: 004_inventory_agent
-- Description: Add Inventory Agent MVP tables for variant-level stock management

-- Inventory Items (extends catalog_items with inventory-specific data)
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100),
  track_inventory BOOLEAN DEFAULT true,
  allow_backorder BOOLEAN DEFAULT false,
  low_stock_threshold INTEGER DEFAULT 5,
  reorder_point INTEGER DEFAULT 10,
  reorder_quantity INTEGER DEFAULT 20,
  location VARCHAR(255),
  weight_grams INTEGER,
  dimensions JSONB DEFAULT '{}',
  cost_price DECIMAL(12,2),
  supplier_id VARCHAR(255),
  supplier_sku VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(merchant_id, sku)
);

-- Inventory Variants (for products with size/color/etc variations)
CREATE TABLE IF NOT EXISTS inventory_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  attributes JSONB DEFAULT '{}',  -- e.g., {"size": "L", "color": "Red"}
  quantity_on_hand INTEGER DEFAULT 0,
  quantity_reserved INTEGER DEFAULT 0,
  quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  low_stock_threshold INTEGER,
  cost_price DECIMAL(12,2),
  price_modifier DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(merchant_id, sku)
);

-- Stock Reservations (temporary holds during order processing)
CREATE TABLE IF NOT EXISTS stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES inventory_variants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'active',  -- active, confirmed, released, expired
  expires_at TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP,
  released_at TIMESTAMP,
  release_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhance stock_movements table if it exists from 003
-- Add variant tracking columns
ALTER TABLE stock_movements
ADD COLUMN IF NOT EXISTS variant_id UUID,
ADD COLUMN IF NOT EXISTS quantity_before INTEGER,
ADD COLUMN IF NOT EXISTS quantity_after INTEGER,
ADD COLUMN IF NOT EXISTS reason TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Inventory Alerts (low stock, out of stock notifications)
CREATE TABLE IF NOT EXISTS inventory_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES inventory_variants(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,  -- low_stock, out_of_stock, overstock, expiring
  status VARCHAR(50) DEFAULT 'active',  -- active, acknowledged, resolved, dismissed
  severity VARCHAR(20) DEFAULT 'warning',  -- info, warning, critical
  message TEXT NOT NULL,
  quantity_at_alert INTEGER,
  threshold INTEGER,
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR(255),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_merchant ON inventory_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_catalog ON inventory_items(catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_variants_merchant ON inventory_variants(merchant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_item ON inventory_variants(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_sku ON inventory_variants(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_variants_quantity ON inventory_variants(quantity_available);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_merchant ON stock_reservations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_variant ON stock_reservations(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order ON stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires ON stock_reservations(expires_at);

-- Only create variant index if column was added successfully
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'variant_id') THEN
    CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_v2 ON stock_movements(variant_id) WHERE variant_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_movements_type_v2 ON stock_movements(movement_type);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_merchant ON inventory_alerts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_variant ON inventory_alerts(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_status ON inventory_alerts(status);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_type ON inventory_alerts(alert_type);

-- Add inventory-related columns to merchants for agent subscription
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS inventory_agent_enabled BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS inventory_config JSONB DEFAULT '{}';
