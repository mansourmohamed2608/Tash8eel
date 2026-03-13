import pkg from './node_modules/pg/lib/index.js';
const { Client } = pkg;
const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_UlYV0QCeKkB4@ep-twilight-boat-afzfn9ls-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require' });
await c.connect();
const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position");
console.log('COLUMNS:', cols.rows.map(r => r.column_name + ':' + r.data_type).join(', '));
const rows = await c.query(\"SELECT id, email, name, role FROM users WHERE merchant_id = 'babc5b22-5401-46dc-b090-2295f0e1b17d' LIMIT 5\");
console.log('USERS:', JSON.stringify(rows.rows));
await c.end();
