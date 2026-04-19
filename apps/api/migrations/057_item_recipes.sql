-- Migration: 057_item_recipes.sql
-- Purpose: Recipe/BOM system linking menu items (catalog_items) to ingredients (inventory_items)
-- A restaurant burger = bun + patty + lettuce + cheese. This table maps that relationship.

CREATE TABLE IF NOT EXISTS item_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  -- ingredient can be an inventory_item OR another catalog_item (for combos)
  ingredient_inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  ingredient_catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL,
  ingredient_name VARCHAR(255) NOT NULL, -- denormalized for quick display
  quantity_required DECIMAL(10,3) NOT NULL DEFAULT 1, -- e.g. 0.150 kg of lettuce
  unit VARCHAR(50) NOT NULL DEFAULT 'piece', -- piece, gram, kg, ml, liter
  is_optional BOOLEAN NOT NULL DEFAULT false, -- extra cheese = optional
  waste_factor DECIMAL(5,3) DEFAULT 1.0, -- 1.1 means 10% typical waste
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A catalog item can only have each ingredient once
  UNIQUE(merchant_id, catalog_item_id, ingredient_inventory_item_id),
  -- At least one ingredient reference must be set
  CHECK (ingredient_inventory_item_id IS NOT NULL OR ingredient_catalog_item_id IS NOT NULL)
);

CREATE INDEX idx_item_recipes_merchant ON item_recipes(merchant_id);
CREATE INDEX idx_item_recipes_catalog_item ON item_recipes(catalog_item_id);
CREATE INDEX idx_item_recipes_ingredient ON item_recipes(ingredient_inventory_item_id);

-- Track recipe-based stock deductions per order
CREATE TABLE IF NOT EXISTS order_ingredient_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id VARCHAR(255) NOT NULL,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id),
  ingredient_inventory_item_id UUID REFERENCES inventory_items(id),
  ingredient_name VARCHAR(255) NOT NULL,
  quantity_deducted DECIMAL(10,3) NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'piece',
  status VARCHAR(20) NOT NULL DEFAULT 'deducted', -- deducted, restored
  restored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_ingredient_deductions_order ON order_ingredient_deductions(order_id);
CREATE INDEX idx_order_ingredient_deductions_merchant ON order_ingredient_deductions(merchant_id);

-- Add has_recipe flag to catalog_items for quick filtering
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS has_recipe BOOLEAN DEFAULT false;
