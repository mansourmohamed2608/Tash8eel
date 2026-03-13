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

  // Check customers table
  const customers = await pool.query(`
    SELECT c.id, c.name, c.phone, c.merchant_id,
      COUNT(DISTINCT o.id) as order_count
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.status NOT IN ('CANCELLED', 'DRAFT')
    WHERE c.merchant_id = $1
    GROUP BY c.id, c.name, c.phone, c.merchant_id
    LIMIT 10
  `, [merchantId]);
  
  console.log('\n=== CUSTOMERS ===');
  console.log('Count:', customers.rows.length);
  customers.rows.forEach(r => console.log(`  ${r.name} | ${r.phone} | orders: ${r.order_count}`));

  // Check orders - do they have customer_id?
  const orders = await pool.query(`
    SELECT o.order_number, o.customer_id, o.customer_name, o.customer_phone, o.status
    FROM orders o
    WHERE o.merchant_id = $1
    LIMIT 10
  `, [merchantId]);
  
  console.log('\n=== ORDERS customer_id check ===');
  orders.rows.forEach(r => console.log(`  ${r.order_number} | customer_id: ${r.customer_id} | name: ${r.customer_name} | phone: ${r.customer_phone}`));

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
