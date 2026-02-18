#!/usr/bin/env node
/**
 * seed-demo.js: Seed demo data for Neon DB (portal)
 * Usage: node seed-demo.js
 */

const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/operations";

async function main() {
  console.log("🌱 Seeding demo data for portal...\n");
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await seedDemoMerchant(pool);
    await seedInventory(pool);
    await seedOrders(pool);
    console.log("\n✅ Seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function seedDemoMerchant(pool) {
  await pool.query(`
    INSERT INTO merchants (id, name, category, daily_token_budget, is_active, config, branding, negotiation_rules, delivery_rules, created_at, updated_at)
    VALUES ('demo-merchant', 'متجر العرض التجريبي', 'CLOTHES', 500000, true,
      '{"brandName": "متجر العرض التجريبي", "tone": "friendly", "currency": "EGP", "language": "ar-EG", "enableNegotiation": true}'::jsonb,
      '{}'::jsonb,
      '{"maxDiscountPercent": 10, "minMarginPercent": 20, "allowNegotiation": true, "freeDeliveryThreshold": 500}'::jsonb,
      '{"defaultFee": 50, "freeDeliveryThreshold": 500}'::jsonb,
      NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
  await pool.query(`
    INSERT INTO warehouse_locations (merchant_id, name, name_ar, is_default)
    VALUES ('demo-merchant', 'المخزن', 'المخزن', true)
    ON CONFLICT (merchant_id, name) DO UPDATE
    SET is_default = true, is_active = true, updated_at = NOW();
  `);
}

async function seedInventory(pool) {
  // Inventory items
  const items = [
    ["11111111-1111-1111-1111-111111111111", "SKU001", "6281234567890", 100],
    ["22222222-2222-2222-2222-222222222222", "SKU002", "6281234567891", 150],
    ["33333333-3333-3333-3333-333333333333", "SKU003", "6281234567892", 250],
    ["44444444-4444-4444-4444-444444444444", "SKU004", "6281234567893", 200],
    ["55555555-5555-5555-5555-555555555555", "SKU005", "6281234567894", 300],
  ];
  for (const [id, sku, barcode, cost] of items) {
    await pool.query(
      `
      INSERT INTO inventory_items (id, merchant_id, sku, barcode, track_inventory, allow_backorder, low_stock_threshold, reorder_point, reorder_quantity, location, cost_price)
      VALUES ($1, 'demo-merchant', $2, $3, true, false, 10, 10, 20, 'المخزن', $4)
      ON CONFLICT (merchant_id, sku) DO UPDATE SET cost_price = EXCLUDED.cost_price;
    `,
      [id, sku, barcode, cost],
    );
  }
  // Inventory variants
  const variants = [
    [
      "aaaa1111-1111-1111-1111-111111111111",
      "11111111-1111-1111-1111-111111111111",
      "SKU001-L",
      "6281234567890-L",
      "قميص أزرق - كبير",
      '{"size": "L", "color": "أزرق"}',
      45,
      10,
      100,
    ],
    [
      "bbbb2222-2222-2222-2222-222222222222",
      "22222222-2222-2222-2222-222222222222",
      "SKU002-M",
      "6281234567891-M",
      "بنطلون جينز - وسط",
      '{"size": "M", "color": "أزرق داكن"}',
      8,
      10,
      150,
    ],
    [
      "cccc3333-3333-3333-3333-333333333333",
      "33333333-3333-3333-3333-333333333333",
      "SKU003-S",
      "6281234567892-S",
      "فستان صيفي - صغير",
      '{"size": "S", "color": "أبيض"}',
      0,
      5,
      250,
    ],
    [
      "dddd4444-4444-4444-4444-444444444444",
      "44444444-4444-4444-4444-444444444444",
      "SKU004-42",
      "6281234567893-42",
      "حذاء رياضي - مقاس 42",
      '{"size": "42", "color": "أسود"}',
      25,
      8,
      200,
    ],
    [
      "eeee5555-5555-5555-5555-555555555555",
      "55555555-5555-5555-5555-555555555555",
      "SKU005-BK",
      "6281234567894-BK",
      "شنطة يد - أسود",
      '{"color": "أسود"}',
      12,
      5,
      300,
    ],
  ];
  for (const [
    id,
    itemId,
    sku,
    barcode,
    name,
    attrs,
    qty,
    low,
    cost,
  ] of variants) {
    await pool.query(
      `
      INSERT INTO inventory_variants (id, merchant_id, inventory_item_id, sku, barcode, name, attributes, quantity_on_hand, quantity_reserved, low_stock_threshold, cost_price, price_modifier)
      VALUES ($1, 'demo-merchant', $2, $3, $4, $5, $6::jsonb, $7, 0, $8, $9, 0)
      ON CONFLICT (merchant_id, sku) DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand;
    `,
      [id, itemId, sku, barcode, name, attrs, qty, low, cost],
    );
  }
  // Sync stock by location
  await pool.query(`
    INSERT INTO inventory_stock_by_location (merchant_id, variant_id, location_id, quantity_on_hand)
    SELECT v.merchant_id, v.id, wl.id, v.quantity_on_hand
    FROM inventory_variants v
    JOIN warehouse_locations wl ON wl.merchant_id = v.merchant_id AND wl.is_default = true
    WHERE v.merchant_id = 'demo-merchant'
    ON CONFLICT (merchant_id, variant_id, location_id)
    DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand, updated_at = NOW();
  `);
}

async function seedOrders(pool) {
  // Orders
  const orders = [
    [
      "ORD-001",
      "DELIVERED",
      '[{"name": "تيشيرت أبيض", "quantity": 2, "price": 150}]',
      300,
      30,
      330,
      "أحمد محمد",
      "+201001234567",
      "demo-merchant",
      "conv-001",
      "11111111-1111-1111-1111-111111111111",
      "6 days",
    ],
    [
      "ORD-002",
      "DELIVERED",
      '[{"name": "بنطلون جينز", "quantity": 1, "price": 450}]',
      450,
      30,
      480,
      "أحمد محمد",
      "+201001234567",
      "demo-merchant",
      "conv-001",
      "11111111-1111-1111-1111-111111111111",
      "5 days",
    ],
    [
      "ORD-003",
      "SHIPPED",
      '[{"name": "فستان صيفي", "quantity": 1, "price": 350}]',
      350,
      30,
      380,
      "فاطمة علي",
      "+201002345678",
      "demo-merchant",
      "conv-002",
      "22222222-2222-2222-2222-222222222222",
      "2 days",
    ],
    [
      "ORD-004",
      "BOOKED",
      '[{"name": "قميص كحلي", "quantity": 2, "price": 200}]',
      400,
      30,
      430,
      "محمود حسن",
      "+201003456789",
      "demo-merchant",
      "conv-003",
      "33333333-3333-3333-3333-333333333333",
      "1 day",
    ],
    [
      "ORD-005",
      "CONFIRMED",
      '[{"name": "جاكيت شتوي", "quantity": 1, "price": 650}]',
      650,
      30,
      680,
      "سارة أحمد",
      "+201004567890",
      "demo-merchant",
      "conv-004",
      "44444444-4444-4444-4444-444444444444",
      "12 hours",
    ],
    [
      "ORD-006",
      "DELIVERED",
      '[{"name": "حذاء رياضي", "quantity": 1, "price": 520}]',
      520,
      30,
      550,
      "خالد إبراهيم",
      "+201005678901",
      "demo-merchant",
      "conv-005",
      "55555555-5555-5555-5555-555555555555",
      "4 days",
    ],
    [
      "ORD-007",
      "DELIVERED",
      '[{"name": "شورت", "quantity": 3, "price": 120}]',
      360,
      30,
      390,
      "أحمد محمد",
      "+201001234567",
      "demo-merchant",
      "conv-001",
      "11111111-1111-1111-1111-111111111111",
      "3 days",
    ],
    [
      "ORD-008",
      "CANCELLED",
      '[{"name": "بلوزة", "quantity": 1, "price": 280}]',
      280,
      30,
      310,
      "فاطمة علي",
      "+201002345678",
      "demo-merchant",
      "conv-002",
      "22222222-2222-2222-2222-222222222222",
      "4 days",
    ],
    [
      "ORD-009",
      "DELIVERED",
      '[{"name": "سويتر", "quantity": 1, "price": 380}]',
      380,
      30,
      410,
      "أحمد محمد",
      "+201001234567",
      "demo-merchant",
      "conv-001",
      "11111111-1111-1111-1111-111111111111",
      "2 days",
    ],
    [
      "ORD-010",
      "SHIPPED",
      '[{"name": "عباية", "quantity": 1, "price": 750}]',
      750,
      30,
      780,
      "محمود حسن",
      "+201003456789",
      "demo-merchant",
      "conv-003",
      "33333333-3333-3333-3333-333333333333",
      "1 day",
    ],
    // Recent orders
    [
      "ORD-011",
      "CONFIRMED",
      '[{"name": "بولو", "quantity": 2, "price": 180}]',
      360,
      30,
      390,
      "أحمد محمد",
      "+201001234567",
      "demo-merchant",
      "conv-001",
      "11111111-1111-1111-1111-111111111111",
      "6 hours",
    ],
    [
      "ORD-012",
      "BOOKED",
      '[{"name": "تنورة", "quantity": 1, "price": 220}]',
      220,
      30,
      250,
      "فاطمة علي",
      "+201002345678",
      "demo-merchant",
      "conv-002",
      "22222222-2222-2222-2222-222222222222",
      "3 hours",
    ],
    [
      "ORD-013",
      "DRAFT",
      '[{"name": "قبعة", "quantity": 1, "price": 95}]',
      95,
      30,
      125,
      "خالد إبراهيم",
      "+201005678901",
      "demo-merchant",
      "conv-005",
      "55555555-5555-5555-5555-555555555555",
      "1 hour",
    ],
  ];
  for (const [
    orderNum,
    status,
    items,
    subtotal,
    fee,
    total,
    custName,
    custPhone,
    merchantId,
    convId,
    custId,
    interval,
  ] of orders) {
    await pool.query(
      `
      INSERT INTO orders (merchant_id, conversation_id, customer_id, order_number, status, items, subtotal, delivery_fee, total, customer_name, customer_phone, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, NOW() - INTERVAL '${interval}')
      ON CONFLICT (merchant_id, order_number) DO NOTHING;
    `,
      [
        merchantId,
        convId,
        custId,
        orderNum,
        status,
        items,
        subtotal,
        fee,
        total,
        custName,
        custPhone,
      ],
    );
  }
}

main();
