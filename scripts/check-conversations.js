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

  // Check conversations states
  const convs = await pool.query(`
    SELECT state, COUNT(*) as count
    FROM conversations
    WHERE merchant_id = $1
    GROUP BY state
    ORDER BY count DESC
  `, [merchantId]);
  
  console.log('\n=== CONVERSATIONS BY STATE ===');
  convs.rows.forEach(r => console.log(`  ${r.state}: ${r.count}`));

  // Check total orders vs conversations
  const orders = await pool.query(`
    SELECT status, COUNT(*) as count FROM orders WHERE merchant_id = $1 GROUP BY status
  `, [merchantId]);
  console.log('\n=== ORDERS BY STATUS ===');
  orders.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); });
