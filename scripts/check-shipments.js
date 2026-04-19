const path = require("path");
const { Client } = require("pg");
require("dotenv").config({
  path: path.resolve(__dirname, "..", "apps", "api", ".env"),
});

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Check shipments columns
  const r = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='shipments' ORDER BY ordinal_position",
  );
  console.log("=== SHIPMENTS COLUMNS ===");
  r.rows.forEach((row) =>
    console.log(`  ${row.column_name} (${row.data_type})`),
  );

  // Check notification columns
  const nc = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='notifications' ORDER BY ordinal_position",
  );
  console.log("\n=== NOTIFICATION COLUMNS ===");
  nc.rows.forEach((row) =>
    console.log(`  ${row.column_name} (${row.data_type})`),
  );

  // Check notification data
  const n = await c.query("SELECT DISTINCT type FROM notifications LIMIT 20");
  console.log("\n=== NOTIFICATION TYPES ===");
  n.rows.forEach((row) => console.log(`  type=${row.type}`));

  await c.end();
})();
