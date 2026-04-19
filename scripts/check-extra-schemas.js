const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const tables = [
    "merchant_agent_subscriptions",
    "merchant_subscriptions",
    "merchant_staff",
    "audit_logs",
    "knowledge_base",
    "inventory_items",
  ];
  for (const t of tables) {
    const cols = await pool.query(
      "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position",
      [t],
    );
    if (cols.rows.length > 0) {
      console.log("\n=== " + t + " (" + cols.rows.length + " cols) ===");
      cols.rows.forEach((c) =>
        console.log(
          `  ${c.column_name}: ${c.data_type} ${c.is_nullable === "NO" ? "NOT NULL" : ""} ${c.column_default ? "DEF=" + c.column_default : ""}`,
        ),
      );
    } else {
      console.log("\n=== " + t + " NOT FOUND ===");
    }
  }
  // Also check existing agent subscriptions
  const subs = await pool.query(
    "SELECT * FROM merchant_agent_subscriptions WHERE merchant_id = 'demo-merchant'",
  );
  console.log("\n=== AGENT SUBS DATA ===");
  subs.rows.forEach((r) => console.log(JSON.stringify(r)));

  // Check staff
  const staff = await pool.query(
    "SELECT * FROM merchant_staff WHERE merchant_id = 'demo-merchant'",
  );
  console.log("\n=== MERCHANT_STAFF DATA ===");
  staff.rows.forEach((r) => console.log(JSON.stringify(r)));

  await pool.end();
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
