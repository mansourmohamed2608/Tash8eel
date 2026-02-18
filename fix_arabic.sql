-- Fix Arabic product names in orders
UPDATE orders SET items = '[{"name": "تيشيرت أبيض", "quantity": 2, "price": 150}]'::jsonb WHERE order_number = 'ORD-001';
UPDATE orders SET items = '[{"name": "بنطلون جينز", "quantity": 1, "price": 450}]'::jsonb WHERE order_number = 'ORD-002';
UPDATE orders SET items = '[{"name": "فستان صيفي", "quantity": 1, "price": 350}]'::jsonb WHERE order_number = 'ORD-003';
UPDATE orders SET items = '[{"name": "قميص كحلي", "quantity": 2, "price": 200}]'::jsonb WHERE order_number = 'ORD-004';
UPDATE orders SET items = '[{"name": "جاكيت شتوي", "quantity": 1, "price": 650}]'::jsonb WHERE order_number = 'ORD-005';
UPDATE orders SET items = '[{"name": "حذاء رياضي", "quantity": 1, "price": 520}]'::jsonb WHERE order_number = 'ORD-006';
UPDATE orders SET items = '[{"name": "شورت", "quantity": 3, "price": 120}]'::jsonb WHERE order_number = 'ORD-007';
UPDATE orders SET items = '[{"name": "بلوزة", "quantity": 1, "price": 280}]'::jsonb WHERE order_number = 'ORD-008';
UPDATE orders SET items = '[{"name": "سويتر", "quantity": 1, "price": 380}]'::jsonb WHERE order_number = 'ORD-009';
UPDATE orders SET items = '[{"name": "عباية", "quantity": 1, "price": 750}]'::jsonb WHERE order_number = 'ORD-010';
UPDATE orders SET items = '[{"name": "بولو", "quantity": 2, "price": 180}]'::jsonb WHERE order_number = 'ORD-011';
UPDATE orders SET items = '[{"name": "تنورة", "quantity": 1, "price": 220}]'::jsonb WHERE order_number = 'ORD-012';
UPDATE orders SET items = '[{"name": "قبعة", "quantity": 1, "price": 95}]'::jsonb WHERE order_number = 'ORD-013';
