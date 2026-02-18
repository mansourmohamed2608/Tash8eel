const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  console.log("=== ALL TABLES ===");
  tables.rows.forEach((r) => console.log(r.table_name));

  const keyTables = [
    "merchants",
    "orders",
    "conversations",
    "messages",
    "customers",
    "catalog_items",
    "staff_members",
    "agent_subscriptions",
    "merchant_entitlements",
    "notifications",
    "shipments",
    "knowledge_base",
    "customer_segments",
    "loyalty_points",
    "payment_links",
    "outbox_events",
    "dlq_events",
    "bulk_operations",
    "inventory_items",
    "inventory_locations",
    "objection_handlers",
    "winback_campaigns",
    "feature_requests",
  ];

  for (const t of keyTables) {
    try {
      const cols = await pool.query(
        "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position",
        [t],
      );
      if (cols.rows.length > 0) {
        console.log("\n=== " + t + " (" + cols.rows.length + " cols) ===");
        cols.rows.forEach((c) => {
          const def = c.column_default
            ? " DEF=" + c.column_default.substring(0, 30)
            : "";
          console.log(
            "  " +
              c.column_name +
              ": " +
              c.data_type +
              (c.is_nullable === "NO" ? " NOT NULL" : "") +
              def,
          );
        });
      }
    } catch (e) {}
  }

  const m = await pool.query(
    "SELECT * FROM merchants WHERE id = 'demo-merchant'",
  );
  if (m.rows.length > 0) {
    console.log("\n=== CURRENT MERCHANT ===");
    console.log(JSON.stringify(m.rows[0], null, 2));
  }

  console.log("\n=== DATA COUNTS ===");
  for (const t of keyTables) {
    try {
      const cnt = await pool.query(
        "SELECT COUNT(*) as c FROM " +
          t +
          " WHERE merchant_id = 'demo-merchant'",
      );
      console.log(t + ": " + cnt.rows[0].c);
    } catch (e) {
      try {
        const cnt2 = await pool.query("SELECT COUNT(*) as c FROM " + t);
        console.log(t + " (no merchant_id): " + cnt2.rows[0].c);
      } catch (e2) {
        console.log(t + ": TABLE NOT FOUND");
      }
    }
  }

  await pool.end();
}
run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
