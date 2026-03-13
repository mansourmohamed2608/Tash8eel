const { Pool } = require('pg');
// Load env manually to handle multiline values
const fs = require('fs');
const envPath = require('path').join(__dirname, '../apps/api/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
// Join continuation lines (lines that don't have = sign after the key)
const lines = envContent.split('\n');
let DATABASE_URL = process.env.DATABASE_URL;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('DATABASE_URL=') && !lines[i].startsWith('#')) {
    let val = lines[i].replace('DATABASE_URL=', '').trim();
    // Check if next line is a continuation (no = sign, not a comment)
    while (i + 1 < lines.length && !lines[i+1].includes('=') && !lines[i+1].startsWith('#') && lines[i+1].trim()) {
      i++;
      val += lines[i].trim();
    }
    DATABASE_URL = val;
    break;
  }
}
const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  // Get merchant
  const m = await pool.query(`SELECT id, name FROM merchants LIMIT 1`);
  const merchantId = m.rows[0].id;
  console.log('Merchant:', m.rows[0].name, merchantId);

  // Get recent orders with items
  const orders = await pool.query(`
    SELECT o.order_number, o.status, o.items, o.created_at
    FROM orders o
    WHERE o.merchant_id = $1
    ORDER BY o.created_at DESC
    LIMIT 10
  `, [merchantId]);

  console.log('\n=== ORDERS ===');
  orders.rows.forEach(row => {
    console.log('Order:', row.order_number, 'Status:', row.status, 'Date:', row.created_at?.toISOString?.()?.slice(0,10));
    let items = row.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch(e) {} }
    if (Array.isArray(items)) {
      items.forEach(i => console.log('  Item:', i.name || i.productName || i.nameAr, 'qty:', i.quantity || i.qty, 'price:', i.price || i.unitPrice));
    } else if (items && items.items) {
      (items.items || []).forEach(i => console.log('  Item:', i.name || i.productName || i.nameAr, 'qty:', i.quantity || i.qty));
    } else {
      console.log('  items raw:', JSON.stringify(items)?.slice(0, 100));
    }
  });

  // Check order_items table
  const oi = await pool.query(`
    SELECT oi.order_id, oi.name, oi.quantity, oi.unit_price
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.merchant_id = $1
    LIMIT 20
  `, [merchantId]);
  console.log('\n=== ORDER_ITEMS TABLE ===');
  oi.rows.forEach(r => console.log('  order:', r.order_id?.slice(0,8), 'name:', r.name, 'qty:', r.quantity, 'price:', r.unit_price));

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
