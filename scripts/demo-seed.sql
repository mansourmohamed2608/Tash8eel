-- ============================================================
-- TASH8EEL DEMO SEED - Complete Demo Data for Investor/Customer Demos
-- Run AFTER all migrations. Safe to re-run (uses ON CONFLICT / IF NOT EXISTS).
-- ============================================================

-- ==== 1. CUSTOMERS ====
INSERT INTO customers (id, merchant_id, sender_id, phone, name, address, preferences, total_orders, last_interaction_at, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'demo-merchant', 'whatsapp:+201001234567', '+201001234567', 'أحمد محمد', '{"city": "القاهرة", "area": "مدينة نصر", "street": "شارع مكرم عبيد", "building": "12"}', '{"size": "L", "preferred_payment": "INSTAPAY"}', 5, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '30 days'),
  ('22222222-2222-2222-2222-222222222222', 'demo-merchant', 'whatsapp:+201002345678', '+201002345678', 'فاطمة علي', '{"city": "الجيزة", "area": "الدقي", "street": "شارع التحرير", "building": "4أ"}', '{"size": "M", "preferred_payment": "VODAFONE_CASH"}', 3, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '25 days'),
  ('33333333-3333-3333-3333-333333333333', 'demo-merchant', 'whatsapp:+201003456789', '+201003456789', 'محمود حسن', '{"city": "القاهرة", "area": "المعادي", "street": "شارع 9", "building": "7"}', '{"size": "XL", "preferred_payment": "COD"}', 2, NOW() - INTERVAL '1 day', NOW() - INTERVAL '20 days'),
  ('44444444-4444-4444-4444-444444444444', 'demo-merchant', 'whatsapp:+201004567890', '+201004567890', 'سارة أحمد', '{"city": "الإسكندرية", "area": "سموحة", "street": "شارع 14 مايو"}', '{"size": "S"}', 1, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '10 days'),
  ('55555555-5555-5555-5555-555555555555', 'demo-merchant', 'whatsapp:+201005678901', '+201005678901', 'خالد إبراهيم', '{"city": "القاهرة", "area": "مصر الجديدة", "street": "شارع بغداد", "building": "22"}', '{"size": "L", "preferred_payment": "BANK_TRANSFER"}', 2, NOW() - INTERVAL '4 days', NOW() - INTERVAL '15 days'),
  ('66666666-6666-6666-6666-666666666666', 'demo-merchant', 'whatsapp:+201006789012', '+201006789012', 'نورا حسين', '{"city": "القاهرة", "area": "التجمع الخامس", "street": "شارع التسعين"}', '{"size": "M"}', 1, NOW() - INTERVAL '1 day', NOW() - INTERVAL '5 days'),
  ('77777777-7777-7777-7777-777777777777', 'demo-merchant', 'whatsapp:+201007890123', '+201007890123', 'عمر يوسف', '{"city": "القاهرة", "area": "الزمالك", "street": "شارع 26 يوليو"}', '{"size": "L", "vip": true}', 4, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '28 days')
ON CONFLICT (id) DO NOTHING;

-- ==== 2. CONVERSATIONS ====
INSERT INTO conversations (id, merchant_id, sender_id, state, customer_name, customer_phone, last_message_at, created_at)
VALUES
  ('conv-001', 'demo-merchant', 'whatsapp:+201001234567', 'IDLE', 'أحمد محمد', '+201001234567', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '30 days'),
  ('conv-002', 'demo-merchant', 'whatsapp:+201002345678', 'IDLE', 'فاطمة علي', '+201002345678', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '25 days'),
  ('conv-003', 'demo-merchant', 'whatsapp:+201003456789', 'ACTIVE', 'محمود حسن', '+201003456789', NOW() - INTERVAL '1 day', NOW() - INTERVAL '20 days'),
  ('conv-004', 'demo-merchant', 'whatsapp:+201004567890', 'ACTIVE', 'سارة أحمد', '+201004567890', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '10 days'),
  ('conv-005', 'demo-merchant', 'whatsapp:+201005678901', 'IDLE', 'خالد إبراهيم', '+201005678901', NOW() - INTERVAL '4 days', NOW() - INTERVAL '15 days'),
  ('conv-006', 'demo-merchant', 'whatsapp:+201006789012', 'ACTIVE', 'نورا حسين', '+201006789012', NOW() - INTERVAL '1 day', NOW() - INTERVAL '5 days'),
  ('conv-007', 'demo-merchant', 'whatsapp:+201007890123', 'IDLE', 'عمر يوسف', '+201007890123', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '28 days')
ON CONFLICT (id) DO NOTHING;

-- ==== 3. ORDERS (mix of COD + online, various statuses) ====
-- Delete existing demo orders to avoid conflicts
DELETE FROM orders WHERE merchant_id = 'demo-merchant' AND order_number LIKE 'ORD-%';

INSERT INTO orders (merchant_id, conversation_id, customer_id, order_number, status, items, subtotal, delivery_fee, total, customer_name, customer_phone, payment_method, created_at) VALUES
  -- COD DELIVERED (for reconciliation demo)
  ('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-001', 'DELIVERED', '[{"name": "تيشيرت أبيض قطن مصري", "quantity": 2, "price": 150, "sku": "TSH-W-L"}]'::jsonb, 300, 30, 330, 'أحمد محمد', '+201001234567', 'COD', NOW() - INTERVAL '6 days'),
  ('demo-merchant', 'conv-002', '22222222-2222-2222-2222-222222222222', 'ORD-002', 'DELIVERED', '[{"name": "فستان صيفي", "quantity": 1, "price": 350}]'::jsonb, 350, 30, 380, 'فاطمة علي', '+201002345678', 'COD', NOW() - INTERVAL '5 days'),
  ('demo-merchant', 'conv-005', '55555555-5555-5555-5555-555555555555', 'ORD-003', 'DELIVERED', '[{"name": "حذاء رياضي", "quantity": 1, "price": 520}]'::jsonb, 520, 30, 550, 'خالد إبراهيم', '+201005678901', 'COD', NOW() - INTERVAL '4 days'),
  ('demo-merchant', 'conv-007', '77777777-7777-7777-7777-777777777777', 'ORD-004', 'DELIVERED', '[{"name": "بولو قطن", "quantity": 2, "price": 180}]'::jsonb, 360, 30, 390, 'عمر يوسف', '+201007890123', 'COD', NOW() - INTERVAL '3 days'),

  -- ONLINE PAID (InstaPay/VodafoneCash)
  ('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-005', 'DELIVERED', '[{"name": "بنطلون جينز", "quantity": 1, "price": 450}]'::jsonb, 450, 30, 480, 'أحمد محمد', '+201001234567', 'INSTAPAY', NOW() - INTERVAL '5 days'),
  ('demo-merchant', 'conv-002', '22222222-2222-2222-2222-222222222222', 'ORD-006', 'DELIVERED', '[{"name": "شورت رياضي", "quantity": 3, "price": 120}]'::jsonb, 360, 30, 390, 'فاطمة علي', '+201002345678', 'VODAFONE_CASH', NOW() - INTERVAL '3 days'),
  ('demo-merchant', 'conv-007', '77777777-7777-7777-7777-777777777777', 'ORD-007', 'DELIVERED', '[{"name": "جاكيت شتوي", "quantity": 1, "price": 650}]'::jsonb, 650, 30, 680, 'عمر يوسف', '+201007890123', 'INSTAPAY', NOW() - INTERVAL '2 days'),

  -- IN-PROGRESS orders
  ('demo-merchant', 'conv-003', '33333333-3333-3333-3333-333333333333', 'ORD-008', 'SHIPPED', '[{"name": "عباية سوداء", "quantity": 1, "price": 750}]'::jsonb, 750, 30, 780, 'محمود حسن', '+201003456789', 'COD', NOW() - INTERVAL '1 day'),
  ('demo-merchant', 'conv-004', '44444444-4444-4444-4444-444444444444', 'ORD-009', 'CONFIRMED', '[{"name": "قميص كحلي", "quantity": 2, "price": 200}]'::jsonb, 400, 30, 430, 'سارة أحمد', '+201004567890', 'INSTAPAY', NOW() - INTERVAL '12 hours'),
  ('demo-merchant', 'conv-006', '66666666-6666-6666-6666-666666666666', 'ORD-010', 'BOOKED', '[{"name": "بلوزة حريمي", "quantity": 1, "price": 280}]'::jsonb, 280, 30, 310, 'نورا حسين', '+201006789012', 'COD', NOW() - INTERVAL '6 hours'),

  -- RECENT orders (today)
  ('demo-merchant', 'conv-001', '11111111-1111-1111-1111-111111111111', 'ORD-011', 'CONFIRMED', '[{"name": "سويتر شتوي", "quantity": 1, "price": 380}]'::jsonb, 380, 30, 410, 'أحمد محمد', '+201001234567', 'INSTAPAY', NOW() - INTERVAL '3 hours'),
  ('demo-merchant', 'conv-007', '77777777-7777-7777-7777-777777777777', 'ORD-012', 'DRAFT', '[{"name": "قبعة كاب", "quantity": 2, "price": 95}]'::jsonb, 190, 30, 220, 'عمر يوسف', '+201007890123', NULL, NOW() - INTERVAL '1 hour'),

  -- CANCELLED (for analytics)
  ('demo-merchant', 'conv-002', '22222222-2222-2222-2222-222222222222', 'ORD-013', 'CANCELLED', '[{"name": "تنورة", "quantity": 1, "price": 220}]'::jsonb, 220, 30, 250, 'فاطمة علي', '+201002345678', NULL, NOW() - INTERVAL '4 days');

-- ==== 4. EXPENSES (diverse categories) ====
DELETE FROM expenses WHERE merchant_id = 'demo-merchant';

INSERT INTO expenses (merchant_id, category, description, amount, currency, frequency, expense_date, created_by, created_at) VALUES
  ('demo-merchant', 'rent', 'إيجار المحل - مدينة نصر', 8000, 'EGP', 'monthly', CURRENT_DATE - INTERVAL '1 day', 'demo-staff', NOW() - INTERVAL '1 day'),
  ('demo-merchant', 'salaries', 'مرتبات الموظفين (3 أفراد)', 15000, 'EGP', 'monthly', CURRENT_DATE - INTERVAL '1 day', 'demo-staff', NOW() - INTERVAL '1 day'),
  ('demo-merchant', 'ads', 'إعلانات فيسبوك - حملة يناير', 3500, 'EGP', 'one_time', CURRENT_DATE - INTERVAL '5 days', 'demo-staff', NOW() - INTERVAL '5 days'),
  ('demo-merchant', 'delivery', 'رسوم شحن أرامكس - الأسبوع الأول', 1200, 'EGP', 'weekly', CURRENT_DATE - INTERVAL '3 days', 'demo-staff', NOW() - INTERVAL '3 days'),
  ('demo-merchant', 'utilities', 'فاتورة كهرباء المحل', 850, 'EGP', 'monthly', CURRENT_DATE - INTERVAL '2 days', 'demo-staff', NOW() - INTERVAL '2 days'),
  ('demo-merchant', 'other', 'أكياس تغليف + ستيكرز برندنج', 600, 'EGP', 'one_time', CURRENT_DATE - INTERVAL '4 days', 'demo-staff', NOW() - INTERVAL '4 days'),
  ('demo-merchant', 'ads', 'إعلانات انستجرام - ريلز', 2000, 'EGP', 'one_time', CURRENT_DATE - INTERVAL '2 days', 'demo-staff', NOW() - INTERVAL '2 days'),
  ('demo-merchant', 'delivery', 'بوسطة - شحن إسكندرية', 450, 'EGP', 'one_time', CURRENT_DATE - INTERVAL '1 day', 'demo-staff', NOW() - INTERVAL '1 day');

-- ==== 5. COD COLLECTIONS (for reconciliation demo) ====
-- These represent courier settlements — some match, some have discrepancies
INSERT INTO cod_collections (merchant_id, order_id, expected_amount, collected_amount, collection_date, collector_name, status, notes, created_at)
SELECT 
  'demo-merchant', id, total, 
  CASE 
    WHEN order_number = 'ORD-001' THEN total           -- Exact match
    WHEN order_number = 'ORD-002' THEN total - 30      -- Short by delivery fee
    WHEN order_number = 'ORD-003' THEN total            -- Exact match
    WHEN order_number = 'ORD-004' THEN NULL             -- Not yet collected
  END,
  CASE 
    WHEN order_number IN ('ORD-001', 'ORD-002', 'ORD-003') THEN CURRENT_DATE - INTERVAL '1 day'
    ELSE NULL
  END,
  CASE 
    WHEN order_number IN ('ORD-001', 'ORD-003') THEN 'أحمد - أرامكس'
    WHEN order_number = 'ORD-002' THEN 'محمد - بوسطة'
    ELSE NULL
  END,
  CASE 
    WHEN order_number = 'ORD-001' THEN 'collected'
    WHEN order_number = 'ORD-002' THEN 'partial'
    WHEN order_number = 'ORD-003' THEN 'collected'
    WHEN order_number = 'ORD-004' THEN 'pending'
  END,
  CASE 
    WHEN order_number = 'ORD-002' THEN 'الكوريير خصم رسوم التوصيل — محتاج تأكيد'
    ELSE NULL
  END,
  NOW()
FROM orders 
WHERE merchant_id = 'demo-merchant' 
  AND order_number IN ('ORD-001', 'ORD-002', 'ORD-003', 'ORD-004')
  AND payment_method = 'COD'
ON CONFLICT DO NOTHING;

-- ==== 6. PAYMENT LINKS (for payment link demo) ====
INSERT INTO payment_links (id, merchant_id, order_id, link_code, amount, currency, description, status, expires_at, customer_phone, customer_name, allowed_methods, created_at)
SELECT
  uuid_generate_v4(), 'demo-merchant', id, 
  CASE order_number
    WHEN 'ORD-009' THEN 'PAY-DEMO01'
    WHEN 'ORD-011' THEN 'PAY-DEMO02'
  END,
  total, 'EGP',
  CASE order_number
    WHEN 'ORD-009' THEN 'دفع طلب قميص كحلي × 2'
    WHEN 'ORD-011' THEN 'دفع طلب سويتر شتوي'
  END,
  'PENDING', NOW() + INTERVAL '72 hours',
  customer_phone, customer_name,
  ARRAY['INSTAPAY', 'BANK_TRANSFER', 'VODAFONE_CASH']::payment_method_type[],
  NOW()
FROM orders
WHERE merchant_id = 'demo-merchant' AND order_number IN ('ORD-009', 'ORD-011')
ON CONFLICT DO NOTHING;

-- ==== 7. PAYOUT SETTINGS (merchant's payment receiving details) ====
INSERT INTO merchant_payout_settings (merchant_id, instapay_alias, vodafone_cash_number, bank_name, bank_account_holder, bank_account, bank_iban, preferred_method, created_at, updated_at)
VALUES ('demo-merchant', 'tash8eel-store', '01001234567', 'البنك الأهلي المصري', 'تشغيل للتجارة الإلكترونية', '1234567890123', 'EG380019000500000002012345678', 'INSTAPAY', NOW(), NOW())
ON CONFLICT (merchant_id) DO NOTHING;

-- ==== 8. MESSAGES (sample conversation for demo) ====
INSERT INTO messages (id, conversation_id, role, content, created_at)
VALUES
  ('msg-d01', 'conv-001', 'user', 'السلام عليكم، عايز أطلب تيشيرت أبيض مقاس L', NOW() - INTERVAL '6 days 2 hours'),
  ('msg-d02', 'conv-001', 'assistant', 'أهلاً بيك يا أحمد! 😊 التيشيرت الأبيض القطن المصري متوفر مقاس L بـ 150 جنيه. عايز كام واحد؟', NOW() - INTERVAL '6 days 2 hours' + INTERVAL '30 seconds'),
  ('msg-d03', 'conv-001', 'user', 'اتنين لو سمحت', NOW() - INTERVAL '6 days 2 hours' + INTERVAL '2 minutes'),
  ('msg-d04', 'conv-001', 'assistant', 'تمام! 2 تيشيرت أبيض مقاس L = 300 جنيه + 30 توصيل = 330 جنيه. عايز تدفع إزاي؟ (كاش عند الاستلام / إنستاباي / فودافون كاش)', NOW() - INTERVAL '6 days 2 hours' + INTERVAL '2 minutes 30 seconds'),
  ('msg-d05', 'conv-001', 'user', 'كاش عند الاستلام', NOW() - INTERVAL '6 days 2 hours' + INTERVAL '3 minutes'),
  ('msg-d06', 'conv-001', 'assistant', 'تم تأكيد الطلب ORD-001 ✅\n\n📦 2× تيشيرت أبيض L\n💰 330 جنيه (كاش عند الاستلام)\n📍 مدينة نصر - شارع مكرم عبيد\n\nهيوصلك خلال 2-3 أيام عمل. شكراً يا أحمد! 🙏', NOW() - INTERVAL '6 days 2 hours' + INTERVAL '3 minutes 30 seconds'),

  -- Recent conversation (reorder)
  ('msg-d07', 'conv-001', 'user', 'عايز أطلب تاني نفس الطلب اللي فات', NOW() - INTERVAL '3 hours'),
  ('msg-d08', 'conv-001', 'assistant', 'أهلاً يا أحمد! 👋 آخر طلب ليك كان 2 تيشيرت أبيض L بـ 330 جنيه. عايز نكرره؟', NOW() - INTERVAL '3 hours' + INTERVAL '20 seconds'),

  -- New customer conversation  
  ('msg-d09', 'conv-006', 'user', 'لو سمحت عندكم بلوزات حريمي؟', NOW() - INTERVAL '6 hours'),
  ('msg-d10', 'conv-006', 'assistant', 'أهلاً بيكي! 🌸 عندنا تشكيلة بلوزات حريمي. إيه المقاس والألوان اللي بتفضليها؟', NOW() - INTERVAL '6 hours' + INTERVAL '25 seconds')
ON CONFLICT (id) DO NOTHING;

-- ==== 9. NOTIFICATIONS (for notification center demo) ====
INSERT INTO notifications (merchant_id, type, title, body, metadata, read, created_at)
VALUES
  ('demo-merchant', 'ORDER', '🛒 طلب جديد #ORD-011', 'أحمد محمد طلب سويتر شتوي - 410 جنيه', '{"orderId": "ORD-011"}'::jsonb, false, NOW() - INTERVAL '3 hours'),
  ('demo-merchant', 'PAYMENT', '💳 إثبات دفع جديد', 'فاطمة علي أرسلت إثبات دفع فودافون كاش', '{}'::jsonb, false, NOW() - INTERVAL '4 hours'),
  ('demo-merchant', 'INVENTORY', '⚠️ مخزون منخفض', 'تيشيرت أبيض L - باقي 3 قطع فقط', '{"sku": "TSH-W-L"}'::jsonb, false, NOW() - INTERVAL '5 hours'),
  ('demo-merchant', 'ORDER', '✅ طلب تم التوصيل #ORD-004', 'عمر يوسف استلم طلبه بنجاح', '{"orderId": "ORD-004"}'::jsonb, true, NOW() - INTERVAL '3 days'),
  ('demo-merchant', 'FINANCE', '📊 ملخص مالي أسبوعي', 'إيراد الأسبوع: 4,420 جنيه | 7 طلبات مكتملة', '{}'::jsonb, true, NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ==== 10. UPDATE MERCHANT ENTITLEMENTS FOR DEMO ====
-- Ensure demo-merchant is on Pro plan with all agents enabled
UPDATE merchants 
SET 
  plan = 'PRO',
  enabled_agents = ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'FINANCE_AGENT'],
  enabled_features = ARRAY['CONVERSATIONS', 'ORDERS', 'CATALOG', 'INVENTORY', 'PAYMENTS', 'VISION_OCR', 'VOICE_NOTES', 'REPORTS', 'WEBHOOKS', 'TEAM', 'NOTIFICATIONS', 'AUDIT_LOGS', 'KPI_DASHBOARD']
WHERE id = 'demo-merchant';

-- ==== DONE ====
-- To verify: SELECT count(*) FROM customers WHERE merchant_id = 'demo-merchant';
-- Expected: 7 customers, 13 orders, 8 expenses, 4 COD collections, 2 payment links, 10 messages, 5 notifications
