const path = require("path");
const { Client } = require("pg");
require("dotenv").config({
  path: path.resolve(__dirname, "..", "apps", "api", ".env"),
});

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Check merchant_command_channels
  const t1 = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='merchant_command_channels')`,
  );
  console.log("merchant_command_channels exists:", t1.rows[0].exists);

  // Check permission_templates columns
  const t2 = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='permission_templates' ORDER BY ordinal_position`,
  );
  console.log(
    "permission_templates columns:",
    t2.rows.map((r) => r.column_name).join(", "),
  );

  // Check merchant_staff count
  const t3 = await client.query(
    `SELECT count(*) FROM merchant_staff WHERE merchant_id = 'demo-merchant'`,
  );
  console.log("merchant_staff count for demo-merchant:", t3.rows[0].count);

  await client.end();
}
main();
