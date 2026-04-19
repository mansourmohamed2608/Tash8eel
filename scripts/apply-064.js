const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({
  path: path.resolve(__dirname, "..", "apps", "api", ".env"),
});

async function main() {
  const sql = fs.readFileSync(
    path.resolve(
      __dirname,
      "..",
      "apps",
      "api",
      "migrations",
      "064_fix_remaining.sql",
    ),
    "utf-8",
  );
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Connected. Applying migration 064...");
  try {
    await client.query(sql);
    console.log("Migration 064 applied successfully.");
    // Verify
    const t1 = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='merchant_command_channels')`,
    );
    console.log("merchant_command_channels exists:", t1.rows[0].exists);
    const t2 = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='permission_templates' ORDER BY ordinal_position`,
    );
    console.log(
      "permission_templates columns:",
      t2.rows.map((r) => r.column_name).join(", "),
    );
    const total = await client.query(
      `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    );
    console.log("Total tables:", total.rows[0].count);
  } catch (e) {
    console.error("Migration failed:", e.message);
  } finally {
    await client.end();
  }
}
main();
