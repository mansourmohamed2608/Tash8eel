const { Client } = require('pg');
require('dotenv').config({ path: '.env' });
async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position");
  console.log('COLUMNS:', JSON.stringify(cols.rows));
  const rows = await c.query("SELECT id, email, name, role FROM users WHERE merchant_id = 'babc5b22-5401-46dc-b090-2295f0e1b17d' LIMIT 5");
  console.log('ROWS:', JSON.stringify(rows.rows));
  await c.end();
}
run().catch(e => console.error(e.message));
