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
      "063_create_missing_tables.sql",
    ),
    "utf-8",
  );
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Connected. Applying migration 063...");
  try {
    await client.query(sql);
    console.log("Migration 063 applied successfully.");
    // Verify tables exist
    const check = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('finance_snapshots','finance_insights','margin_alerts','objection_templates',
        'copilot_pending_actions','recovered_carts','substitution_suggestions','ocr_verification_rules','cod_collections')
      ORDER BY table_name
    `);
    console.log(
      `Verified ${check.rows.length}/9 tables created:`,
      check.rows.map((r) => r.table_name).join(", "),
    );
    // Total count
    const total = await client.query(
      `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    console.log("Total tables in DB:", total.rows[0].count);
  } catch (e) {
    console.error("Migration failed:", e.message);
  } finally {
    await client.end();
  }
}
main();
