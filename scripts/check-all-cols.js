const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  for (const t of [
    "messages",
    "orders",
    "notifications",
    "shipments",
    "payment_links",
    "customer_segments",
    "feature_requests",
    "inventory_items",
  ]) {
    const res = await pool.query(
      `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='${t}' AND table_schema='public' ORDER BY ordinal_position`,
    );
    console.log(`\n=== ${t} ===`);
    res.rows.forEach((c) =>
      console.log(
        `  ${c.column_name}: ${c.data_type} ${c.column_default ? "DEF=" + c.column_default : ""}`,
      ),
    );
  }
  await pool.end();
}
run();
