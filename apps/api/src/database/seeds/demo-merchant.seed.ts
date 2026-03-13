#!/usr/bin/env ts-node
/**
 * Demo Merchant Seed Script — Tash8eel AI
 * Merchant: بيت الجمال للمنتجات المنزلية (Home Goods, Egypt)
 *
 * Usage (from apps/api):
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/demo-merchant.seed.ts
 *
 * Cleanup:
 *   DELETE FROM merchants WHERE id = '<returned_id>';
 *
 * Rules enforced:
 *  1. No hardcoded calculated values — totals derived from items
 *  2. Single transaction — full rollback on any failure
 *  3. Completely isolated merchant account
 *  4. customer.total_spent / total_orders recalculated from orders (Step 7)
 *  5. catalog_items.stock_quantity recalculated from inventory_variants (Step 7)
 *  6. finance_snapshots generated from paid orders only (Step 7)
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// Load .env — try apps/api/.env relative to repo root, then local .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../../../../../apps/api/.env') });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Product {
  sku: string;
  name_ar: string;
  price: number;
  stock: number;
  threshold: number;
  supplierId: string;
  category: string;
}

interface OrderItem {
  sku: string;
  qty: number;
  price: number;
}

interface OrderDef {
  key: string;
  customerKey: string;
  status: string;
  paymentStatus: string;
  date: Date;
  items: OrderItem[];
}

interface CustomerDef {
  key: string;
  name: string;
  phone: string;
  address: string;
  tags: string[];
}

interface MsgDef {
  direction: string;
  content: string;
  isAi: boolean;
}

interface ConvDef {
  id: string;
  customerKey: string;
  state: string;
  messages: MsgDef[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

function firstOfMonth(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seed function
// ─────────────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Check apps/api/.env');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('✅ Connected to database\n');

  try {
    await client.query('BEGIN');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1 — Create Demo Merchant
    // ═══════════════════════════════════════════════════════════════════════
    const merchantId = 'bayt-aljamaal';

    // Idempotent cleanup so re-runs start clean
    await client.query(`DELETE FROM merchants WHERE id = $1`, [merchantId]);

    await client.query(
      `INSERT INTO merchants (
         id, name, category, plan, is_active,
         currency, language, country, city, timezone,
         enabled_features, enabled_agents,
         config, branding, negotiation_rules, delivery_rules, settings
       ) VALUES (
         $1, $2, 'GENERIC', 'PRO', true,
         'EGP', 'ar', 'Egypt', 'القاهرة', 'Africa/Cairo',
         ARRAY['CONVERSATIONS','ORDERS','CATALOG','VOICE_NOTES','REPORTS','NOTIFICATIONS','INVENTORY','API_ACCESS','PAYMENTS','VISION_OCR','KPI_DASHBOARD','WEBHOOKS','TEAM','AUDIT_LOGS'],
         ARRAY['OPS_AGENT','INVENTORY_AGENT','FINANCE_AGENT'],
         $3, '{}', '{}', $4, $5
       )`,
      [
        merchantId,
        'بيت الجمال للمنتجات المنزلية',
        JSON.stringify({
          brandName: 'بيت الجمال للمنتجات المنزلية',
          tone: 'friendly',
          currency: 'EGP',
          language: 'ar-EG',
          locale: 'ar-EG',
          enableNegotiation: false,
        }),
        JSON.stringify({ defaultFee: 50, freeDeliveryThreshold: 1000 }),
        JSON.stringify({ demo: true, demoVersion: '1.0' }),
      ],
    );
    console.log(`✅ STEP 1 — Merchant created`);
    console.log(`   ID: ${merchantId}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2 — Create Warehouse Location
    // ═══════════════════════════════════════════════════════════════════════
    const warehouseId = uuidv4();

    await client.query(
      `INSERT INTO warehouse_locations (id, merchant_id, name, name_ar, city, is_default, is_active)
       VALUES ($1, $2, 'المخزن الرئيسي', 'المخزن الرئيسي', 'القاهرة', true, true)`,
      [warehouseId, merchantId],
    );
    console.log(`✅ STEP 2 — Warehouse created: ${warehouseId}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3 — Create 2 Suppliers
    // ═══════════════════════════════════════════════════════════════════════
    const supplier1Id = uuidv4();
    const supplier2Id = uuidv4();

    await client.query(
      `INSERT INTO suppliers (id, merchant_id, name, lead_time_days, is_active)
       VALUES ($1, $2, 'شركة النيل للمستلزمات المنزلية', 3, true)`,
      [supplier1Id, merchantId],
    );
    await client.query(
      `INSERT INTO suppliers (id, merchant_id, name, lead_time_days, is_active)
       VALUES ($1, $2, 'مصنع الدلتا للمنسوجات', 5, true)`,
      [supplier2Id, merchantId],
    );
    console.log(`✅ STEP 3 — Suppliers created\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4 — Create 10 Products
    // Each product: catalog_item → inventory_item → inventory_variant
    //               → inventory_stock_by_location → supplier_product
    // stock_quantity on catalog_items is set to 0 here and recalculated in Step 7
    // ═══════════════════════════════════════════════════════════════════════
    const products: Product[] = [
      { sku: 'SHT-001', name_ar: 'طقم شراشف قطن مزدوج',        price: 450, stock: 18, threshold: 5, supplierId: supplier1Id, category: 'bedding'  },
      { sku: 'TBL-001', name_ar: 'مفرش سفرة مطرز 6 أشخاص',    price: 280, stock: 12, threshold: 4, supplierId: supplier1Id, category: 'dining'   },
      { sku: 'TWL-001', name_ar: 'طقم مناشف حمام 4 قطع',       price: 320, stock:  3, threshold: 5, supplierId: supplier2Id, category: 'bath'     }, // ⚠️ LOW STOCK
      { sku: 'BLK-001', name_ar: 'بطانية شتوي مزدوج',          price: 550, stock: 25, threshold: 6, supplierId: supplier2Id, category: 'bedding'  },
      { sku: 'PIL-001', name_ar: 'وسادة طبية للنوم',            price: 180, stock:  0, threshold: 5, supplierId: supplier1Id, category: 'bedding'  }, // ⚠️ STOCKOUT
      { sku: 'CRT-001', name_ar: 'طقم ستائر غرفة نوم',         price: 680, stock:  8, threshold: 3, supplierId: supplier1Id, category: 'curtains' },
      { sku: 'RUG-001', name_ar: 'سجادة غرفة معيشة 2×3',       price: 850, stock:  6, threshold: 2, supplierId: supplier2Id, category: 'rugs'     },
      { sku: 'DSH-001', name_ar: 'طقم أطباق بورسلين 24 قطعة',  price: 420, stock: 14, threshold: 4, supplierId: supplier1Id, category: 'dining'   },
      { sku: 'BTH-001', name_ar: 'مجموعة إكسسوارات حمام',      price: 230, stock: 20, threshold: 5, supplierId: supplier2Id, category: 'bath'     },
      { sku: 'CVR-001', name_ar: 'غطاء لحاف مطبوع',            price: 390, stock:  9, threshold: 4, supplierId: supplier1Id, category: 'bedding'  },
    ];

    const catalogIds: Record<string, string> = {};
    const inventoryItemIds: Record<string, string> = {};
    const variantIds: Record<string, string> = {};

    for (const p of products) {
      // 4a — catalog_items (stock_quantity = 0; recalculated from variants in Step 7)
      const catalogId = uuidv4();
      catalogIds[p.sku] = catalogId;
      await client.query(
        `INSERT INTO catalog_items (
           id, merchant_id, sku, name_ar, name,
           base_price, price, currency, category,
           stock_quantity, low_stock_threshold,
           track_inventory, allow_backorder, is_active, is_available
         ) VALUES ($1, $2, $3, $4, $4, $5, $5, 'EGP', $6, 0, $7, true, false, true, true)`,
        [catalogId, merchantId, p.sku, p.name_ar, p.price, p.category, p.threshold],
      );

      // 4b — inventory_items
      const invItemId = uuidv4();
      inventoryItemIds[p.sku] = invItemId;
      await client.query(
        `INSERT INTO inventory_items (
           id, merchant_id, catalog_item_id, sku, name,
           track_inventory, allow_backorder,
           low_stock_threshold, reorder_point, reorder_quantity,
           supplier_id, price
         ) VALUES ($1, $2, $3, $4, $5, true, false, $6, $6, $7, $8, $9)`,
        [
          invItemId, merchantId, catalogId, p.sku, p.name_ar,
          p.threshold, p.threshold * 3, p.supplierId, p.price,
        ],
      );

      // 4c — inventory_variants (quantity_on_hand = actual stock)
      const variantId = uuidv4();
      variantIds[p.sku] = variantId;
      await client.query(
        `INSERT INTO inventory_variants (
           id, inventory_item_id, merchant_id, sku, name,
           quantity_on_hand, quantity_reserved, low_stock_threshold, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, true)`,
        [variantId, invItemId, merchantId, p.sku + '-DEFAULT', p.name_ar, p.stock, p.threshold],
      );

      // 4d — inventory_stock_by_location
      await client.query(
        `INSERT INTO inventory_stock_by_location (
           merchant_id, variant_id, location_id, quantity_on_hand, quantity_reserved
         ) VALUES ($1, $2, $3, $4, 0)`,
        [merchantId, variantId, warehouseId, p.stock],
      );

      // 4e — supplier_products (cost_price = 60% of retail)
      await client.query(
        `INSERT INTO supplier_products (
           merchant_id, supplier_id, inventory_item_id, variant_id,
           supplier_sku, cost_price, min_order_qty, is_preferred
         ) VALUES ($1, $2, $3, $4, $5, $6, 1, true)`,
        [merchantId, p.supplierId, invItemId, variantId, p.sku, Math.round(p.price * 0.6)],
      );
    }
    console.log(`✅ STEP 4 — 10 products seeded across 5 tables each\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5 — Create 8 Customers
    // total_orders and total_spent are intentionally left at 0
    // They will be recalculated from real order data in Step 7
    // ═══════════════════════════════════════════════════════════════════════
    const customerDefs: CustomerDef[] = [
      { key: 'محمد',  name: 'محمد أحمد السيد',     phone: '01001234567', address: 'القاهرة',    tags: ['VIP']    },
      { key: 'سارة',  name: 'سارة خالد محمود',    phone: '01112345678', address: 'القاهرة',    tags: []         },
      { key: 'أحمد',  name: 'أحمد محمود عبدالله', phone: '01223456789', address: 'الإسكندرية', tags: []         },
      { key: 'نورا',  name: 'نورا علي حسن',       phone: '01334567890', address: 'القاهرة',    tags: []         },
      { key: 'كريم',  name: 'كريم حسن إبراهيم',  phone: '01445678901', address: 'الجيزة',     tags: ['loyal']  },
      { key: 'منى',   name: 'منى عبدالرحمن',     phone: '01556789012', address: 'القاهرة',    tags: []         },
      { key: 'يوسف',  name: 'يوسف طارق',         phone: '01667890123', address: 'القاهرة',    tags: []         },
      { key: 'هبة',   name: 'هبة محمد',          phone: '01778901234', address: 'الإسكندرية', tags: []         },
    ];

    const customerIds: Record<string, string> = {};
    for (const c of customerDefs) {
      const custId = uuidv4();
      customerIds[c.key] = custId;
      await client.query(
        `INSERT INTO customers (
           id, merchant_id, name, phone, address,
           tags, total_orders, total_spent, preferred_language,
           metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'ar', $7)`,
        [
          custId, merchantId, c.name, c.phone, c.address,
          c.tags,
          JSON.stringify({ city: c.address }),
        ],
      );
    }
    console.log(`✅ STEP 5 — 8 customers created (totals left at 0 for Step 7)\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6 — Create 15 Orders
    // CRITICAL: subtotal = SUM(order_items.total_price)
    //           total    = subtotal - discount  (discount = 0 for all orders)
    // Both orders.items JSONB and order_items rows are populated
    // ═══════════════════════════════════════════════════════════════════════
    const now = new Date();

    const orderDefs: OrderDef[] = [
      // ORD-001 — محمد — DELIVERED — paid — 7 days ago
      {
        key: 'ORD-001', customerKey: 'محمد',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(7),
        items: [
          { sku: 'SHT-001', qty: 1, price: 450 },
          { sku: 'TBL-001', qty: 1, price: 280 },
        ],
      },
      // ORD-002 — محمد — DELIVERED — paid — 14 days ago
      {
        key: 'ORD-002', customerKey: 'محمد',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(14),
        items: [
          { sku: 'BLK-001', qty: 2, price: 550 },
          { sku: 'PIL-001', qty: 1, price: 180 },
        ],
      },
      // ORD-003 — محمد — OUT_FOR_DELIVERY — paid — today
      {
        key: 'ORD-003', customerKey: 'محمد',
        status: 'OUT_FOR_DELIVERY', paymentStatus: 'paid', date: now,
        items: [
          { sku: 'TWL-001', qty: 1, price: 320 },
          { sku: 'CVR-001', qty: 1, price: 390 },
        ],
      },
      // ORD-004 — محمد — DRAFT (pending) — unpaid — today
      {
        key: 'ORD-004', customerKey: 'محمد',
        status: 'DRAFT', paymentStatus: 'unpaid', date: now,
        items: [
          { sku: 'RUG-001', qty: 1, price: 850 },
        ],
      },
      // ORD-005 — سارة — DELIVERED — paid — 10 days ago
      {
        key: 'ORD-005', customerKey: 'سارة',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(10),
        items: [
          { sku: 'DSH-001', qty: 1, price: 420 },
          { sku: 'BTH-001', qty: 1, price: 230 },
        ],
      },
      // ORD-006 — سارة — CONFIRMED — unpaid — 2 days ago ⚠️ TRIGGERS COLLECTION
      {
        key: 'ORD-006', customerKey: 'سارة',
        status: 'CONFIRMED', paymentStatus: 'unpaid', date: daysAgo(2),
        items: [
          { sku: 'CRT-001', qty: 1, price: 680 },
        ],
      },
      // ORD-007 — أحمد — DELIVERED — paid — 26 days ago ⚠️ TRIGGERS WIN-BACK
      {
        key: 'ORD-007', customerKey: 'أحمد',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(26),
        items: [
          { sku: 'SHT-001', qty: 1, price: 450 },
        ],
      },
      // ORD-008 — نورا — SHIPPED — paid — yesterday
      {
        key: 'ORD-008', customerKey: 'نورا',
        status: 'SHIPPED', paymentStatus: 'paid', date: daysAgo(1),
        items: [
          { sku: 'TBL-001', qty: 1, price: 280 },
          { sku: 'CVR-001', qty: 1, price: 390 },
        ],
      },
      // ORD-009 — كريم — DELIVERED — paid — 5 days ago
      {
        key: 'ORD-009', customerKey: 'كريم',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(5),
        items: [
          { sku: 'BLK-001', qty: 1, price: 550 },
          { sku: 'PIL-001', qty: 2, price: 180 },
        ],
      },
      // ORD-010 — كريم — DELIVERED — paid — 20 days ago
      {
        key: 'ORD-010', customerKey: 'كريم',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(20),
        items: [
          { sku: 'TWL-001', qty: 2, price: 320 },
        ],
      },
      // ORD-011 — كريم — CONFIRMED — paid — today
      {
        key: 'ORD-011', customerKey: 'كريم',
        status: 'CONFIRMED', paymentStatus: 'paid', date: now,
        items: [
          { sku: 'DSH-001', qty: 1, price: 420 },
        ],
      },
      // ORD-012 — منى — DELIVERED — paid — 8 days ago
      {
        key: 'ORD-012', customerKey: 'منى',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(8),
        items: [
          { sku: 'RUG-001', qty: 1, price: 850 },
        ],
      },
      // ORD-013 — يوسف — DRAFT (pending) — unpaid — today
      {
        key: 'ORD-013', customerKey: 'يوسف',
        status: 'DRAFT', paymentStatus: 'unpaid', date: now,
        items: [
          { sku: 'CRT-001', qty: 1, price: 680 },
          { sku: 'BTH-001', qty: 1, price: 230 },
        ],
      },
      // ORD-014 — هبة — DELIVERED — paid — 12 days ago
      {
        key: 'ORD-014', customerKey: 'هبة',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(12),
        items: [
          { sku: 'SHT-001', qty: 1, price: 450 },
          { sku: 'TWL-001', qty: 1, price: 320 },
        ],
      },
      // ORD-015 — هبة — DELIVERED — paid — 3 days ago
      {
        key: 'ORD-015', customerKey: 'هبة',
        status: 'DELIVERED', paymentStatus: 'paid', date: daysAgo(3),
        items: [
          { sku: 'CVR-001', qty: 2, price: 390 },
        ],
      },
    ];

    const orderIds: Record<string, string> = {};

    for (const ord of orderDefs) {
      const orderId = uuidv4();
      orderIds[ord.key] = orderId;

      const customerId = customerIds[ord.customerKey];
      const customerName = customerDefs.find((c) => c.key === ord.customerKey)!.name;
      const customerPhone = customerDefs.find((c) => c.key === ord.customerKey)!.phone;

      // Derive totals from items — never hardcode
      const subtotal = ord.items.reduce((sum, i) => sum + i.qty * i.price, 0);
      const discount = 0;
      const total = subtotal - discount;

      // Build denormalized JSONB for orders.items column
      const itemsJson = ord.items.map((i) => ({
        sku: i.sku,
        name: products.find((p) => p.sku === i.sku)!.name_ar,
        quantity: i.qty,
        unit_price: i.price,
        total_price: i.qty * i.price,
      }));

      await client.query(
        `INSERT INTO orders (
           id, merchant_id, customer_id, order_number, status,
           subtotal, discount, delivery_fee, total,
           payment_status, currency, customer_name, customer_phone,
           items, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5::order_status,
           $6, $7, 0, $8,
           $9, 'EGP', $10, $11,
           $12, $13, $13
         )`,
        [
          orderId, merchantId, customerId, ord.key, ord.status,
          subtotal, discount, total,
          ord.paymentStatus, customerName, customerPhone,
          JSON.stringify(itemsJson), ord.date,
        ],
      );

      // Insert normalised order_items rows
      for (const item of ord.items) {
        await client.query(
          `INSERT INTO order_items (
             id, order_id, catalog_item_id, variant_id,
             name, sku, quantity, unit_price, total_price
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uuidv4(), orderId,
            catalogIds[item.sku], variantIds[item.sku],
            products.find((p) => p.sku === item.sku)!.name_ar,
            item.sku, item.qty, item.price, item.qty * item.price,
          ],
        );
      }
    }

    // Update last_order_at on all customers in one pass
    await client.query(
      `UPDATE customers c
          SET last_order_at = (
            SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id
          )
        WHERE c.merchant_id = $1`,
      [merchantId],
    );

    console.log(`✅ STEP 6 — 15 orders + order_items created, last_order_at updated\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7 — Recalculate All Derived Fields
    // ═══════════════════════════════════════════════════════════════════════

    // 7a — Recalculate customer.total_orders and total_spent from actual orders
    await client.query(
      `UPDATE customers c
          SET
            total_orders = (
              SELECT COUNT(*) FROM orders o
              WHERE o.customer_id = c.id AND o.status != 'CANCELLED'
            ),
            total_spent = (
              SELECT COALESCE(SUM(o.total), 0) FROM orders o
              WHERE o.customer_id = c.id AND o.payment_status = 'paid'
            )
        WHERE c.merchant_id = $1`,
      [merchantId],
    );

    // 7b — Recalculate catalog_items.stock_quantity from inventory_variants
    await client.query(
      `UPDATE catalog_items ci
          SET stock_quantity = (
            SELECT COALESCE(SUM(iv.quantity_on_hand), 0)
            FROM inventory_variants iv
            JOIN inventory_items ii ON iv.inventory_item_id = ii.id
            WHERE ii.catalog_item_id = ci.id
          )
        WHERE ci.merchant_id = $1`,
      [merchantId],
    );

    // 7c — Generate finance_snapshots from paid orders only
    await client.query(
      `INSERT INTO finance_snapshots (
         merchant_id, snapshot_date,
         total_revenue, gross_profit, net_profit,
         orders_count, avg_order_value
       )
       SELECT
         merchant_id,
         DATE(created_at)            AS snapshot_date,
         SUM(total)                  AS total_revenue,
         SUM(total) * 0.35           AS gross_profit,
         SUM(total) * 0.20           AS net_profit,
         COUNT(*)                    AS orders_count,
         AVG(total)                  AS avg_order_value
       FROM orders
       WHERE merchant_id = $1
         AND payment_status = 'paid'
       GROUP BY merchant_id, DATE(created_at)`,
      [merchantId],
    );

    console.log(`✅ STEP 7 — Customer totals, stock quantities, finance snapshots recalculated\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8 — Stock Alerts
    // ═══════════════════════════════════════════════════════════════════════
    await client.query(
      `INSERT INTO stock_alerts (merchant_id, catalog_item_id, alert_type, current_quantity, threshold)
       VALUES ($1, $2, 'low_stock', 3, 5)`,
      [merchantId, catalogIds['TWL-001']],
    );
    await client.query(
      `INSERT INTO stock_alerts (merchant_id, catalog_item_id, alert_type, current_quantity, threshold)
       VALUES ($1, $2, 'out_of_stock', 0, 5)`,
      [merchantId, catalogIds['PIL-001']],
    );
    console.log(`✅ STEP 8 — Stock alerts created (low_stock: TWL-001, out_of_stock: PIL-001)\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9 — WhatsApp Conversations + Messages
    // conversation_state enum values used:
    //   ORDER_PLACED   ← "active"  (محمد — order confirmed, delivery pending)
    //   CONFIRMING_ORDER ← "waiting_payment" (سارة — awaiting payment)
    //   GREETING       ← "new"    (يوسف — new inquiry)
    // ═══════════════════════════════════════════════════════════════════════
    const convDefs: ConvDef[] = [
      {
        id: `conv-demo-1-${merchantId.slice(0, 8)}`,
        customerKey: 'محمد',
        state: 'ORDER_PLACED',
        messages: [
          { direction: 'inbound',  content: 'عايز أطلب طقم شراشف', isAi: false },
          { direction: 'outbound', content: 'أهلاً محمد! طقم الشراشف القطن المزدوج متاح بسعر 450 جنيه. تأكد الطلب؟', isAi: true },
          { direction: 'inbound',  content: 'آه كويس', isAi: false },
          { direction: 'outbound', content: 'تم تأكيد طلبك! رقم الطلب #ORD-003. سيتم التواصل معك قريباً للتوصيل.', isAi: true },
        ],
      },
      {
        id: `conv-demo-2-${merchantId.slice(0, 8)}`,
        customerKey: 'سارة',
        state: 'CONFIRMING_ORDER',
        messages: [
          { direction: 'inbound',  content: 'امتى هيجي الطلب؟', isAi: false },
          { direction: 'outbound', content: 'طلبك رقم #ORD-006 قيد التأكيد. في انتظار إتمام الدفع.', isAi: true },
        ],
      },
      {
        id: `conv-demo-3-${merchantId.slice(0, 8)}`,
        customerKey: 'يوسف',
        state: 'GREETING',
        messages: [
          { direction: 'inbound',  content: 'كام سعر الستاير؟', isAi: false },
          { direction: 'outbound', content: 'أهلاً يوسف! ستائر غرفة النوم بسعر 680 جنيه للطقم الكامل. تحب تطلب؟', isAi: true },
        ],
      },
    ];

    for (const conv of convDefs) {
      await client.query(
        `INSERT INTO conversations (
           id, merchant_id, customer_id, channel, state,
           is_ai_enabled, status, last_message_at,
           collected_info, missing_slots
         ) VALUES ($1, $2, $3, 'whatsapp', $4::conversation_state,
                   true, 'active', NOW(), '{}', '{}')`,
        [conv.id, merchantId, customerIds[conv.customerKey], conv.state],
      );

      for (const msg of conv.messages) {
        await client.query(
          `INSERT INTO messages (
             id, conversation_id, merchant_id,
             direction, content, text, message_type,
             is_from_ai, delivery_status, status
           ) VALUES ($1, $2, $3, $4, $5, $5, 'text', $6, 'DELIVERED', 'DELIVERED')`,
          [uuidv4(), conv.id, merchantId, msg.direction, msg.content, msg.isAi],
        );
      }
    }
    console.log(`✅ STEP 9 — 3 conversations + 8 messages created\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10 — Expenses
    // ═══════════════════════════════════════════════════════════════════════
    const expenseDefs = [
      { amount: 3500, category: 'rent',      description: 'إيجار المخزن',   date: firstOfMonth(), recurring: true  },
      { amount: 8000, category: 'salaries',  description: 'رواتب الموظفين', date: firstOfMonth(), recurring: true  },
      { amount: 1200, category: 'logistics', description: 'شحن وتوصيل',    date: daysAgo(5),     recurring: false },
    ];

    for (const exp of expenseDefs) {
      await client.query(
        `INSERT INTO expenses (id, merchant_id, amount, category, description, expense_date, is_recurring, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'APPROVED')`,
        [uuidv4(), merchantId, exp.amount, exp.category, exp.description, exp.date, exp.recurring],
      );
    }
    console.log(`✅ STEP 10 — 3 expenses created\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // COMMIT
    // ═══════════════════════════════════════════════════════════════════════
    await client.query('COMMIT');

    console.log('━'.repeat(60));
    console.log('✅ TRANSACTION COMMITTED SUCCESSFULLY');
    console.log('━'.repeat(60));
    console.log(`\n🏪 DEMO MERCHANT ID : ${merchantId}`);
    console.log(`   Cleanup          : DELETE FROM merchants WHERE id = '${merchantId}';\n`);
    console.log('━'.repeat(60));

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11 — Verification Queries (run AFTER commit)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔍 STEP 11 — Running verification queries...\n');

    // ── V1: Order totals must match order_items sums (expect 0 rows) ──────
    const v1 = await client.query<{
      order_number: string; order_total: number; items_sum: number; difference: number;
    }>(
      `SELECT
         o.order_number,
         o.total         AS order_total,
         SUM(oi.total_price) AS items_sum,
         o.total - SUM(oi.total_price) AS difference
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.merchant_id = $1
       GROUP BY o.id, o.order_number, o.total
       HAVING o.total != SUM(oi.total_price)`,
      [merchantId],
    );
    console.log(`V1 — Order total mismatches (MUST be 0 rows): ${v1.rowCount} rows`);
    if (v1.rowCount! > 0) { console.log('  ⚠️  MISMATCHES FOUND:'); console.table(v1.rows); }
    else { console.log('  ✅ PASS — all order totals match order_items sums'); }

    // ── V2: Customer totals ───────────────────────────────────────────────
    const v2 = await client.query<{ name: string; total_orders: number; total_spent: number }>(
      `SELECT name, total_orders, total_spent
       FROM customers
       WHERE merchant_id = $1
       ORDER BY total_spent DESC`,
      [merchantId],
    );
    console.log(`\nV2 — Customer totals (محمد expect: 4 orders, 2720 spent):`);
    console.table(v2.rows);

    // ── V3: Stock consistency across tables (expect 0 rows) ──────────────
    const v3 = await client.query<{
      name_ar: string; catalog_stock: number; variant_stock: number; difference: number;
    }>(
      `SELECT
         ci.name_ar,
         ci.stock_quantity                       AS catalog_stock,
         COALESCE(SUM(iv.quantity_on_hand), 0)   AS variant_stock,
         ci.stock_quantity - COALESCE(SUM(iv.quantity_on_hand), 0) AS difference
       FROM catalog_items ci
       LEFT JOIN inventory_items ii  ON ii.catalog_item_id    = ci.id
       LEFT JOIN inventory_variants iv ON iv.inventory_item_id = ii.id
       WHERE ci.merchant_id = $1
       GROUP BY ci.id, ci.name_ar, ci.stock_quantity
       HAVING ci.stock_quantity != COALESCE(SUM(iv.quantity_on_hand), 0)`,
      [merchantId],
    );
    console.log(`\nV3 — Stock mismatches (MUST be 0 rows): ${v3.rowCount} rows`);
    if (v3.rowCount! > 0) { console.log('  ⚠️  MISMATCHES FOUND:'); console.table(v3.rows); }
    else { console.log('  ✅ PASS — catalog_items.stock_quantity matches inventory_variants'); }

    // ── V4: Finance snapshots ─────────────────────────────────────────────
    const v4 = await client.query<{
      snapshot_date: string; total_revenue: number; gross_profit: number;
      net_profit: number; orders_count: number;
    }>(
      `SELECT snapshot_date, total_revenue, gross_profit, net_profit, orders_count
       FROM finance_snapshots
       WHERE merchant_id = $1
       ORDER BY snapshot_date DESC`,
      [merchantId],
    );
    console.log(`\nV4 — Finance snapshots (${v4.rowCount} date(s) with paid orders):`);
    console.table(v4.rows);

    // ── V5: Stock alerts (expect 2 rows) ──────────────────────────────────
    const v5 = await client.query<{
      name_ar: string; alert_type: string; current_quantity: number; threshold: number;
    }>(
      `SELECT ci.name_ar, sa.alert_type, sa.current_quantity, sa.threshold
       FROM stock_alerts sa
       JOIN catalog_items ci ON ci.id = sa.catalog_item_id
       WHERE sa.merchant_id = $1`,
      [merchantId],
    );
    console.log(`\nV5 — Stock alerts (expect 2 rows): ${v5.rowCount} rows`);
    console.table(v5.rows);
    if (v5.rowCount === 2) console.log('  ✅ PASS');
    else console.log(`  ⚠️  Expected 2 rows, got ${v5.rowCount}`);

    // ── V6: Total paid revenue (expect 8860 EGP) ─────────────────────────
    const v6 = await client.query<{ total_paid_revenue: string }>(
      `SELECT SUM(total) AS total_paid_revenue
       FROM orders
       WHERE merchant_id = $1 AND payment_status = 'paid'`,
      [merchantId],
    );
    const revenue = parseFloat(v6.rows[0].total_paid_revenue);
    console.log(`\nV6 — Total paid revenue: ${revenue} EGP (expect 8860 EGP)`);
    if (revenue === 8860) console.log('  ✅ PASS');
    else console.log(`  ⚠️  Expected 8860, got ${revenue}`);

    console.log('\n' + '━'.repeat(60));
    console.log('🎯 SEED COMPLETE — Demo account ready');
    console.log('━'.repeat(60));
    console.log(`\n   Merchant ID : ${merchantId}`);
    console.log(`   Cleanup     : DELETE FROM merchants WHERE id = '${merchantId}';\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed FAILED — transaction rolled back completely');
    console.error((err as Error).message);
    throw err;
  } finally {
    await client.end();
  }
}

// Run
seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
