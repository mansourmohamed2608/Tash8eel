const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // Get catalog items
  const catalog = await pool.query(
    "SELECT id, name, name_ar, price, base_price, category, sku, is_active FROM catalog_items WHERE merchant_id = 'demo-merchant' ORDER BY created_at",
  );
  console.log("=== CATALOG ITEMS ===");
  catalog.rows.forEach((r) => console.log(JSON.stringify(r)));

  // Get existing customer
  const cust = await pool.query(
    "SELECT * FROM customers WHERE merchant_id = 'demo-merchant'",
  );
  console.log("\n=== EXISTING CUSTOMERS ===");
  cust.rows.forEach((r) => console.log(JSON.stringify(r)));

  // Get existing entitlements
  const ent = await pool.query(
    "SELECT feature_key, is_enabled, limit_value, used_value FROM merchant_entitlements WHERE merchant_id = 'demo-merchant' ORDER BY feature_key",
  );
  console.log("\n=== ENTITLEMENTS ===");
  ent.rows.forEach((r) => console.log(JSON.stringify(r)));

  // Check for enum types
  const enums = await pool.query(
    "SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid ORDER BY t.typname, e.enumsortorder",
  );
  console.log("\n=== ENUM VALUES ===");
  let currentType = "";
  enums.rows.forEach((r) => {
    if (r.typname !== currentType) {
      currentType = r.typname;
      console.log("\n" + currentType + ":");
    }
    console.log("  " + r.enumlabel);
  });

  // Check all tables list
  const allTables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  console.log("\n=== ALL TABLES ===");
  allTables.rows.forEach((r) => console.log(r.table_name));

  await pool.end();
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
