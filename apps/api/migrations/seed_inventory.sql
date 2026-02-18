-- Seed inventory data for demo-merchant
-- First ensure the demo-merchant exists (for test environments)
INSERT INTO merchants (id, name, category, daily_token_budget, is_active, config, branding, negotiation_rules, delivery_rules, created_at, updated_at)
VALUES ('demo-merchant', 'متجر العرض التجريبي', 'CLOTHES', 500000, true,
  '{"brandName": "متجر العرض التجريبي", "tone": "friendly", "currency": "EGP", "language": "ar-EG", "enableNegotiation": true}'::jsonb,
  '{}'::jsonb,
  '{"maxDiscountPercent": 10, "minMarginPercent": 20, "allowNegotiation": true, "freeDeliveryThreshold": 500}'::jsonb,
  '{"defaultFee": 50, "freeDeliveryThreshold": 500}'::jsonb,
  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Ensure default warehouse location exists
INSERT INTO warehouse_locations (merchant_id, name, name_ar, is_default)
VALUES ('demo-merchant', 'المخزن', 'المخزن', true)
ON CONFLICT (merchant_id, name) DO UPDATE
SET is_default = true, is_active = true, updated_at = NOW();

INSERT INTO inventory_items (id, merchant_id, sku, barcode, track_inventory, allow_backorder, low_stock_threshold, reorder_point, reorder_quantity, location, cost_price)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'demo-merchant', 'SKU001', '6281234567890', true, false, 10, 10, 20, 'المخزن', 100),
  ('22222222-2222-2222-2222-222222222222', 'demo-merchant', 'SKU002', '6281234567891', true, false, 10, 10, 20, 'المخزن', 150),
  ('33333333-3333-3333-3333-333333333333', 'demo-merchant', 'SKU003', '6281234567892', true, false, 5, 10, 15, 'المخزن', 250),
  ('44444444-4444-4444-4444-444444444444', 'demo-merchant', 'SKU004', '6281234567893', true, false, 8, 10, 20, 'المخزن', 200),
  ('55555555-5555-5555-5555-555555555555', 'demo-merchant', 'SKU005', '6281234567894', true, false, 5, 8, 15, 'المخزن', 300)
ON CONFLICT (merchant_id, sku) DO UPDATE SET 
  cost_price = EXCLUDED.cost_price;

-- Seed inventory variants with stock quantities (quantity_available is auto-generated)
INSERT INTO inventory_variants (id, merchant_id, inventory_item_id, sku, barcode, name, attributes, quantity_on_hand, quantity_reserved, low_stock_threshold, cost_price, price_modifier)
VALUES 
  ('aaaa1111-1111-1111-1111-111111111111', 'demo-merchant', '11111111-1111-1111-1111-111111111111', 'SKU001-L', '6281234567890-L', 'قميص أزرق - كبير', '{"size": "L", "color": "أزرق"}', 45, 0, 10, 100, 0),
  ('bbbb2222-2222-2222-2222-222222222222', 'demo-merchant', '22222222-2222-2222-2222-222222222222', 'SKU002-M', '6281234567891-M', 'بنطلون جينز - وسط', '{"size": "M", "color": "أزرق داكن"}', 8, 0, 10, 150, 0),
  ('cccc3333-3333-3333-3333-333333333333', 'demo-merchant', '33333333-3333-3333-3333-333333333333', 'SKU003-S', '6281234567892-S', 'فستان صيفي - صغير', '{"size": "S", "color": "أبيض"}', 0, 0, 5, 250, 0),
  ('dddd4444-4444-4444-4444-444444444444', 'demo-merchant', '44444444-4444-4444-4444-444444444444', 'SKU004-42', '6281234567893-42', 'حذاء رياضي - مقاس 42', '{"size": "42", "color": "أسود"}', 25, 0, 8, 200, 0),
  ('eeee5555-5555-5555-5555-555555555555', 'demo-merchant', '55555555-5555-5555-5555-555555555555', 'SKU005-BK', '6281234567894-BK', 'شنطة يد - أسود', '{"color": "أسود"}', 12, 0, 5, 300, 0)
ON CONFLICT (merchant_id, sku) DO UPDATE SET 
  quantity_on_hand = EXCLUDED.quantity_on_hand;

-- Sync stock by location for demo-merchant default location
INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
SELECT v.merchant_id, v.id, wl.id, v.quantity_on_hand
FROM inventory_variants v
JOIN warehouse_locations wl ON wl.merchant_id = v.merchant_id AND wl.is_default = true
WHERE v.merchant_id = 'demo-merchant'
ON CONFLICT (merchant_id, variant_id, location_id)
DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand, updated_at = NOW();
