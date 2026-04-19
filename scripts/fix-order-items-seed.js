const { Pool } = require('pg');
const fs = require('fs');
const envPath = require('path').join(__dirname, '../apps/api/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');
let DATABASE_URL = process.env.DATABASE_URL;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('DATABASE_URL=') && !lines[i].startsWith('#')) {
    let val = lines[i].replace('DATABASE_URL=', '').trim();
    while (i + 1 < lines.length && !lines[i+1].includes('=') && !lines[i+1].startsWith('#') && lines[i+1].trim()) {
      i++;
      val += lines[i].trim();
    }
    DATABASE_URL = val;
    break;
  }
}
const pool = new Pool({ connectionString: DATABASE_URL });

// Realistic order items for each demo order
// Each order should only have 1-3 items, not all 14 products
const ORDER_ITEMS = {
  'ORD-2024-001': [
    { name: 'تيشيرت قطن أبيض - L', quantity: 2, unit_price: 250 },
    { name: 'بنطلون جينز سليم - M', quantity: 1, unit_price: 450 },
  ],
  'ORD-2024-002': [
    { name: 'حذاء رياضي نايك - 43', quantity: 1, unit_price: 1200 },
  ],
  'ORD-2024-003': [
    { name: 'فستان صيفي فلورال - M', quantity: 1, unit_price: 550 },
    { name: 'بولو شيرت - L', quantity: 1, unit_price: 320 },
  ],
  'ORD-2024-004': [
    { name: 'ساعة يد كلاسيك', quantity: 1, unit_price: 950 },
  ],
  'ORD-2024-005': [
    { name: 'بنطلون جينز سليم - L', quantity: 1, unit_price: 450 },
    { name: 'تيشيرت قطن أبيض - M', quantity: 2, unit_price: 250 },
  ],
  'ORD-2024-006': [
    { name: 'جاكيت جلد - L', quantity: 1, unit_price: 1800 },
  ],
  'ORD-2024-007': [
    { name: 'حذاء رياضي نايك - 42', quantity: 1, unit_price: 1200 },
    { name: 'بولو شيرت - L', quantity: 1, unit_price: 320 },
  ],
  'ORD-2024-008': [
    { name: 'تيشيرت قطن أبيض - L', quantity: 3, unit_price: 250 },
  ],
  'ORD-2024-009': [
    { name: 'بنطلون جينز سليم - M', quantity: 2, unit_price: 450 },
    { name: 'فستان صيفي فلورال - M', quantity: 1, unit_price: 550 },
  ],
  'ORD-2024-010': [
    { name: 'ساعة يد كلاسيك', quantity: 1, unit_price: 950 },
    { name: 'حذاء رياضي نايك - 43', quantity: 1, unit_price: 1200 },
  ],
};

async function main() {
  const m = await pool.query(`SELECT id, name FROM merchants LIMIT 1`);
  const merchantId = m.rows[0].id;
  console.log('Merchant:', m.rows[0].name);

  // Get all orders
  const orders = await pool.query(`
    SELECT id, order_number FROM orders WHERE merchant_id = $1
  `, [merchantId]);

  let fixed = 0;
  for (const order of orders.rows) {
    const items = ORDER_ITEMS[order.order_number];
    if (!items) {
      console.log('No items defined for order:', order.order_number, '- skipping');
      continue;
    }

    // Delete existing order_items for this order
    await pool.query(`DELETE FROM order_items WHERE order_id = $1`, [order.id]);

    // Insert correct items
    for (const item of items) {
      const totalPrice = item.quantity * item.unit_price;
      await pool.query(`
        INSERT INTO order_items (order_id, name, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.id, item.name, item.quantity, item.unit_price, totalPrice]);
    }

    // Update order total
    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    await pool.query(`UPDATE orders SET total = $1, subtotal = $1 WHERE id = $2`, [total, order.id]);

    console.log(`Fixed order ${order.order_number}: ${items.length} items, total: ${total}`);
    fixed++;
  }

  console.log(`\nFixed ${fixed} orders`);
  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
