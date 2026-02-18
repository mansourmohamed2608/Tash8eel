-- Seed orders for demo-merchant
INSERT INTO orders (merchant_id, conversation_id, customer_id, order_number, status, items, subtotal, delivery_fee, total, customer_name, customer_phone, created_at) VALUES 
('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-001', 'DELIVERED', '[{"name": "تيشيرت أبيض", "quantity": 2, "price": 150}]'::jsonb, 300, 30, 330, 'أحمد محمد', '+201001234567', NOW() - INTERVAL '6 days'),
('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-002', 'DELIVERED', '[{"name": "بنطلون جينز", "quantity": 1, "price": 450}]'::jsonb, 450, 30, 480, 'أحمد محمد', '+201001234567', NOW() - INTERVAL '5 days'),
('demo-merchant', 'conv-002', '22222222-2222-2222-2222-222222222222', 'ORD-003', 'SHIPPED', '[{"name": "فستان صيفي", "quantity": 1, "price": 350}]'::jsonb, 350, 30, 380, 'فاطمة علي', '+201002345678', NOW() - INTERVAL '2 days'),
('demo-merchant', 'conv-003', '33333333-3333-3333-3333-333333333333', 'ORD-004', 'BOOKED', '[{"name": "قميص كحلي", "quantity": 2, "price": 200}]'::jsonb, 400, 30, 430, 'محمود حسن', '+201003456789', NOW() - INTERVAL '1 day'),
('demo-merchant', 'conv-004', '44444444-4444-4444-4444-444444444444', 'ORD-005', 'CONFIRMED', '[{"name": "جاكيت شتوي", "quantity": 1, "price": 650}]'::jsonb, 650, 30, 680, 'سارة أحمد', '+201004567890', NOW() - INTERVAL '12 hours'),
('demo-merchant', 'conv-005', '55555555-5555-5555-5555-555555555555', 'ORD-006', 'DELIVERED', '[{"name": "حذاء رياضي", "quantity": 1, "price": 520}]'::jsonb, 520, 30, 550, 'خالد إبراهيم', '+201005678901', NOW() - INTERVAL '4 days'),
('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-007', 'DELIVERED', '[{"name": "شورت", "quantity": 3, "price": 120}]'::jsonb, 360, 30, 390, 'أحمد محمد', '+201001234567', NOW() - INTERVAL '3 days'),
('demo-merchant', 'conv-002', '22222222-2222-2222-2222-222222222222', 'ORD-008', 'CANCELLED', '[{"name": "بلوزة", "quantity": 1, "price": 280}]'::jsonb, 280, 30, 310, 'فاطمة علي', '+201002345678', NOW() - INTERVAL '4 days'),
('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-009', 'DELIVERED', '[{"name": "سويتر", "quantity": 1, "price": 380}]'::jsonb, 380, 30, 410, 'أحمد محمد', '+201001234567', NOW() - INTERVAL '2 days'),
('demo-merchant', 'conv-003', '33333333-3333-3333-3333-333333333333', 'ORD-010', 'SHIPPED', '[{"name": "عباية", "quantity": 1, "price": 750}]'::jsonb, 750, 30, 780, 'محمود حسن', '+201003456789', NOW() - INTERVAL '1 day');

-- Add more recent orders in the last week
INSERT INTO orders (merchant_id, conversation_id, customer_id, order_number, status, items, subtotal, delivery_fee, total, customer_name, customer_phone, created_at) VALUES 
('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-011', 'CONFIRMED', '[{"name": "بولو", "quantity": 2, "price": 180}]'::jsonb, 360, 30, 390, 'أحمد محمد', '+201001234567', NOW() - INTERVAL '6 hours'),
('demo-merchant', 'conv-002', '22222222-2222-2222-2222-222222222222', 'ORD-012', 'BOOKED', '[{"name": "تنورة", "quantity": 1, "price": 220}]'::jsonb, 220, 30, 250, 'فاطمة علي', '+201002345678', NOW() - INTERVAL '3 hours'),
('demo-merchant', 'conv-005', '55555555-5555-5555-5555-555555555555', 'ORD-013', 'DRAFT', '[{"name": "قبعة", "quantity": 1, "price": 95}]'::jsonb, 95, 30, 125, 'خالد إبراهيم', '+201005678901', NOW() - INTERVAL '1 hour');
