-- Migration: 109_localize_demo_inventory_arabic
-- Description: Align demo-merchant inventory labels with Arabic canonical seed values

UPDATE inventory_items
SET
  name = CASE sku
    WHEN 'SKU001' THEN 'قميص أزرق'
    WHEN 'SKU002' THEN 'بنطلون جينز'
    WHEN 'SKU003' THEN 'فستان صيفي'
    WHEN 'SKU004' THEN 'حذاء رياضي'
    WHEN 'SKU005' THEN 'شنطة يد'
    ELSE name
  END,
  description = CASE sku
    WHEN 'SKU001' THEN 'قميص أزرق خامة مريحة'
    WHEN 'SKU002' THEN 'بنطلون جينز بقصة كلاسيكية'
    WHEN 'SKU003' THEN 'فستان صيفي خفيف'
    WHEN 'SKU004' THEN 'حذاء رياضي للاستخدام اليومي'
    WHEN 'SKU005' THEN 'شنطة يد عملية'
    ELSE description
  END,
  category = CASE sku
    WHEN 'SKU005' THEN 'إكسسوارات'
    ELSE 'ملابس'
  END,
  location = 'المخزن',
  updated_at = NOW()
WHERE merchant_id = 'demo-merchant'
  AND sku IN ('SKU001', 'SKU002', 'SKU003', 'SKU004', 'SKU005');

UPDATE inventory_variants
SET
  name = CASE sku
    WHEN 'SKU001-L' THEN 'قميص أزرق - كبير'
    WHEN 'SKU002-M' THEN 'بنطلون جينز - وسط'
    WHEN 'SKU003-S' THEN 'فستان صيفي - صغير'
    WHEN 'SKU004-42' THEN 'حذاء رياضي - مقاس 42'
    WHEN 'SKU005-BK' THEN 'شنطة يد - أسود'
    ELSE name
  END,
  attributes = CASE sku
    WHEN 'SKU001-L' THEN '{"size":"L","color":"أزرق"}'::jsonb
    WHEN 'SKU002-M' THEN '{"size":"M","color":"أزرق داكن"}'::jsonb
    WHEN 'SKU003-S' THEN '{"size":"S","color":"أبيض"}'::jsonb
    WHEN 'SKU004-42' THEN '{"size":"42","color":"أسود"}'::jsonb
    WHEN 'SKU005-BK' THEN '{"color":"أسود"}'::jsonb
    ELSE attributes
  END,
  updated_at = NOW()
WHERE merchant_id = 'demo-merchant'
  AND sku IN ('SKU001-L', 'SKU002-M', 'SKU003-S', 'SKU004-42', 'SKU005-BK');