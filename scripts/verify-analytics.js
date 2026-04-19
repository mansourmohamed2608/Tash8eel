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
  const m = await pool.query(`SELECT id FROM merchants LIMIT 1`);
  const merchantId = m.rows[0].id;

  const result = await pool.query(`
    WITH order_scope AS (
      SELECT o.id, o.items
      FROM orders o
      WHERE o.merchant_id = $1
        AND UPPER(COALESCE(o.status::text, '')) NOT IN ('CANCELLED', 'DRAFT')
    ),
    item_rows AS (
      SELECT
        COALESCE(oi.name, 'unknown') as name,
        oi.quantity::numeric as quantity,
        COALESCE(oi.total_price, oi.unit_price * oi.quantity, 0)::numeric as total_price,
        os.id as order_id
      FROM order_scope os
      JOIN order_items oi ON oi.order_id = os.id
    )
    SELECT
      LOWER(name) as name_key,
      MAX(name) as name,
      SUM(quantity)::text as total_quantity,
      SUM(total_price)::text as total_revenue,
      COUNT(DISTINCT order_id)::text as order_count
    FROM item_rows
    WHERE name IS NOT NULL AND LOWER(name) != 'unknown'
    GROUP BY LOWER(name)
    ORDER BY SUM(quantity) DESC
    LIMIT 10
  `, [merchantId]);

  console.log('\n=== POPULAR PRODUCTS (after fix) ===');
  result.rows.forEach((r, i) => {
    console.log(`${i+1}. ${r.name} - qty: ${r.total_quantity}, orders: ${r.order_count}, revenue: ${r.total_revenue}`);
  });

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
