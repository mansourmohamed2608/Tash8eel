-- Seed orders for demo-merchant
INSERT INTO orders (merchant_id, conversation_id, customer_id, order_number, status, items, subtotal, delivery_fee, total, customer_name, customer_phone, created_at) VALUES 
('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-001', 'DELIVERED', '[{"name": "تيشيرت أبيض", "quantity": 2, "price": 150}]'::jsonb, 300, 30, 330, 'أحمد محمد', '+201001234567', NOW() - INTERVAL '6 days'),
('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-002', 'DELIVERED', '[{"name": "بنطلون جينز", "quantity": 1, "price": 450}]'::jsonb, 450, 30, 480, 'أحمد محمد', '+201001234567', NOW() - INTERVAL '5 days'),
('demo-merchant', 'conv-002', '22222222-2222-2222-2222-222222222222', 'ORD-003', 'SHIPPED', '[{"name": "فستان صيفي", "quantity": 1, "price": 350}]'::jsonb, 350, 30, 380, 'فاطمة علي', '+201002345678', NOW() - INTERVAL '2 days'),
('demo-merchant', 'conv-003', '33333333-3333-3333-3333-333333333333', 'ORD-004', 'BOOKED', '[{"name": "قميص كحلي", "quantity": 2, "price": 200}]'::jsonb, 400, 30, 430, 'محمود حسن', '+201003456789', NOW() - INTERVAL '1 day'),
('demo-merchant', 'conv-004', '44444444-4444-4444-4444-444444444444', 'ORD-005', 'CONFIRMED', '[{"name": "جاكيت شتوي", "quantity": 1, "price": 650}]'::jsonb, 650, 30, 680, 'سارة أحمد', '+201004567890', NOW() - INTERVAL '12 hours'),
('demo-merchant', 'conv-005', '55555555-5555-5555-5555-555555555555', 'ORD-006', 'DELIVERED', '[{"name": "حذاء رياضي", "quantity": 1, "price": 520}]'::jsonb, 520, 30, 550, 'خالد إبراهيم', '+201005678901', NOW() - INTERVAL '4 days')
ON CONFLICT DO NOTHING;

-- Add some catalog items
INSERT INTO catalog_items (merchant_id, name, name_ar, category, price, in_stock, is_active) VALUES
('demo-merchant', 'T-Shirt White', 'تيشيرت أبيض', 'ملابس', 150, true, true),
('demo-merchant', 'Jeans Blue', 'بنطلون جينز', 'ملابس', 450, true, true),
('demo-merchant', 'Summer Dress', 'فستان صيفي', 'ملابس', 350, true, true),
('demo-merchant', 'Navy Shirt', 'قميص كحلي', 'ملابس', 200, true, true),
('demo-merchant', 'Winter Jacket', 'جاكيت شتوي', 'ملابس', 650, true, true),
('demo-merchant', 'Sports Shoes', 'حذاء رياضي', 'أحذية', 520, true, true)
ON CONFLICT DO NOTHING;
