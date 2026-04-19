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

async function main() {
  const m = await pool.query(`SELECT id, name FROM merchants LIMIT 1`);
  const merchantId = m.rows[0].id;
  console.log('Merchant:', m.rows[0].name);

  // Check order_items - are they linked to real orders?
  const check = await pool.query(`
    SELECT 
      oi.order_id::text,
      COUNT(*) as item_count,
      EXISTS(SELECT 1 FROM orders o WHERE o.id = oi.order_id AND o.merchant_id = $1) as has_real_order
    FROM order_items oi
    GROUP BY oi.order_id
    LIMIT 10
  `, [merchantId]);
  
  console.log('\n=== ORDER_ITEMS order_id check ===');
  check.rows.forEach(r => console.log('  order_id:', r.order_id, 'items:', r.item_count, 'has_real_order:', r.has_real_order));

  // Check what orders actually have items in JSON
  const ordersWithItems = await pool.query(`
    SELECT o.id::text, o.order_number, o.status,
      jsonb_array_length(CASE WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb ELSE '[]'::jsonb END) as json_item_count
    FROM orders o
    WHERE o.merchant_id = $1
    ORDER BY o.created_at DESC
    LIMIT 10
  `, [merchantId]);
  
  console.log('\n=== ORDERS with JSON items ===');
  ordersWithItems.rows.forEach(r => console.log('  order:', r.order_number, 'status:', r.status, 'json_items:', r.json_item_count));

  // What does the analytics query actually return?
  const analytics = await pool.query(`
    WITH order_scope AS (
      SELECT o.id, o.items
      FROM orders o
      WHERE o.merchant_id = $1
        AND UPPER(COALESCE(o.status::text, '')) NOT IN ('CANCELLED', 'DRAFT')
    )
    SELECT COUNT(*) as order_count FROM order_scope
  `, [merchantId]);
  console.log('\n=== Orders in scope for analytics ===', analytics.rows[0].order_count);

  // Check if order_items has valid order_ids for this merchant
  const validOI = await pool.query(`
    SELECT COUNT(*) as count
    FROM order_items oi
    WHERE EXISTS(SELECT 1 FROM orders o WHERE o.id = oi.order_id AND o.merchant_id = $1)
  `, [merchantId]);
  console.log('\n=== Valid order_items (linked to merchant orders) ===', validOI.rows[0].count);

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
