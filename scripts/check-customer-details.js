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

  // Check conversations columns
  const convCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'conversations' ORDER BY ordinal_position
  `);
  console.log('\n=== CONVERSATIONS columns ===');
  console.log(convCols.rows.map(r => r.column_name).join(', '));

  // Check conversations - do they have customer_id?
  const convs = await pool.query(`
    SELECT id, customer_id, sender_id, state
    FROM conversations
    WHERE merchant_id = $1
    LIMIT 10
  `, [merchantId]);
  
  console.log('\n=== CONVERSATIONS customer_id check ===');
  convs.rows.forEach(r => console.log(`  conv: ${r.id?.slice(0,20)} | customer_id: ${r.customer_id} | sender_id: ${r.sender_id} | state: ${r.state}`));

  // Check if conversations have sender_id that matches customers phone
  const custWithPhone = await pool.query(`
    SELECT c.id, c.phone, c.name,
      (SELECT COUNT(*) FROM conversations cv WHERE cv.merchant_id = $1 AND (cv.customer_id::text = c.id::text OR cv.sender_id = c.phone)) as conv_count
    FROM customers c
    WHERE c.merchant_id = $1
    LIMIT 5
  `, [merchantId]);
  
  console.log('\n=== CUSTOMERS with conversation count by phone ===');
  custWithPhone.rows.forEach(r => console.log(`  ${r.name} | ${r.phone} | convs: ${r.conv_count}`));

  // Check order_items for a specific customer
  const custId = custWithPhone.rows[0]?.id;
  if (custId) {
    const favs = await pool.query(`
      SELECT oi.name, SUM(oi.quantity) as total_qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.merchant_id = $1 AND o.customer_id = $2 AND o.status NOT IN ('CANCELLED', 'DRAFT')
      GROUP BY oi.name
      ORDER BY total_qty DESC
    `, [merchantId, custId]);
    console.log('\n=== FAVORITE PRODUCTS for customer', custWithPhone.rows[0].name, '===');
    favs.rows.forEach(r => console.log(`  ${r.name}: ${r.total_qty}`));
  }

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
