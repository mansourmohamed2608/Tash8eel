const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "❌ DATABASE_URL not set. Create .env file or set environment variable.",
    );
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("Running migration 045...");
    await pool.query(
      "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_operator_id VARCHAR(100)",
    );
    console.log("Migration 045 complete");

    // Verify
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'conversations' AND column_name = 'human_operator_id'
    `);
    console.log("human_operator_id exists:", res.rows.length > 0);
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

runMigration();
