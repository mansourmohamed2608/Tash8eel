-- Migration: 108_seed_demo_inventory_if_empty
-- Description: Ensure demo-merchant has baseline inventory data when production skips seed_*.sql files

WITH should_seed AS (
  SELECT 1
  FROM merchants m
  WHERE m.id = 'demo-merchant'
    AND NOT EXISTS (
      SELECT 1 FROM inventory_items i WHERE i.merchant_id = 'demo-merchant'
    )
)
INSERT INTO inventory_items (
  id,
  merchant_id,
  sku,
  barcode,
  name,
  description,
  price,
  category,
  track_inventory,
  allow_backorder,
  low_stock_threshold,
  reorder_point,
  reorder_quantity,
  location,
  cost_price
)
SELECT
  v.id,
  'demo-merchant',
  v.sku,
  v.barcode,
  v.name,
  v.description,
  v.price,
  v.category,
  true,
  false,
  v.low_stock_threshold,
  v.reorder_point,
  v.reorder_quantity,
  'Main Warehouse',
  v.cost_price
FROM should_seed,
LATERAL (
  VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, 'SKU001', '6281234567890', 'Blue Shirt', 'Blue shirt, standard fit', 199.00::numeric, 'Apparel', 10, 10, 20, 100.00::numeric),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'SKU002', '6281234567891', 'Denim Jeans', 'Classic denim jeans', 299.00::numeric, 'Apparel', 10, 10, 20, 150.00::numeric),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'SKU003', '6281234567892', 'Summer Dress', 'Light summer dress', 399.00::numeric, 'Apparel', 5, 10, 15, 250.00::numeric),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'SKU004', '6281234567893', 'Sport Shoes', 'Everyday sport shoes', 499.00::numeric, 'Footwear', 8, 10, 20, 200.00::numeric),
    ('55555555-5555-5555-5555-555555555555'::uuid, 'SKU005', '6281234567894', 'Hand Bag', 'Synthetic leather hand bag', 549.00::numeric, 'Accessories', 5, 8, 15, 300.00::numeric)
) AS v(id, sku, barcode, name, description, price, category, low_stock_threshold, reorder_point, reorder_quantity, cost_price)
ON CONFLICT (merchant_id, sku)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  cost_price = EXCLUDED.cost_price,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  reorder_point = EXCLUDED.reorder_point,
  reorder_quantity = EXCLUDED.reorder_quantity,
  updated_at = NOW();

WITH should_seed AS (
  SELECT 1
  FROM merchants m
  WHERE m.id = 'demo-merchant'
    AND NOT EXISTS (
      SELECT 1 FROM inventory_variants v WHERE v.merchant_id = 'demo-merchant'
    )
),
variant_rows AS (
  SELECT *
  FROM (
    VALUES
      ('aaaa1111-1111-1111-1111-111111111111'::uuid, 'SKU001', 'SKU001-L', '6281234567890-L', 'Blue Shirt - L', '{"size":"L","color":"Blue"}'::jsonb, 45, 0, 10, 100.00::numeric),
      ('bbbb2222-2222-2222-2222-222222222222'::uuid, 'SKU002', 'SKU002-M', '6281234567891-M', 'Denim Jeans - M', '{"size":"M","color":"Dark Blue"}'::jsonb, 8, 0, 10, 150.00::numeric),
      ('cccc3333-3333-3333-3333-333333333333'::uuid, 'SKU003', 'SKU003-S', '6281234567892-S', 'Summer Dress - S', '{"size":"S","color":"White"}'::jsonb, 0, 0, 5, 250.00::numeric),
      ('dddd4444-4444-4444-4444-444444444444'::uuid, 'SKU004', 'SKU004-42', '6281234567893-42', 'Sport Shoes - 42', '{"size":"42","color":"Black"}'::jsonb, 25, 0, 8, 200.00::numeric),
      ('eeee5555-5555-5555-5555-555555555555'::uuid, 'SKU005', 'SKU005-BK', '6281234567894-BK', 'Hand Bag - Black', '{"color":"Black"}'::jsonb, 12, 0, 5, 300.00::numeric)
  ) AS x(id, item_sku, sku, barcode, name, attributes, quantity_on_hand, quantity_reserved, low_stock_threshold, cost_price)
)
INSERT INTO inventory_variants (
  id,
  inventory_item_id,
  merchant_id,
  sku,
  barcode,
  name,
  attributes,
  quantity_on_hand,
  quantity_reserved,
  low_stock_threshold,
  cost_price,
  price_modifier,
  is_active
)
SELECT
  v.id,
  ii.id,
  'demo-merchant',
  v.sku,
  v.barcode,
  v.name,
  v.attributes,
  v.quantity_on_hand,
  v.quantity_reserved,
  v.low_stock_threshold,
  v.cost_price,
  0,
  true
FROM should_seed
JOIN variant_rows v ON true
JOIN inventory_items ii ON ii.merchant_id = 'demo-merchant' AND ii.sku = v.item_sku
ON CONFLICT (merchant_id, sku)
DO UPDATE SET
  name = EXCLUDED.name,
  attributes = EXCLUDED.attributes,
  quantity_on_hand = EXCLUDED.quantity_on_hand,
  quantity_reserved = EXCLUDED.quantity_reserved,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  cost_price = EXCLUDED.cost_price,
  is_active = true,
  updated_at = NOW();