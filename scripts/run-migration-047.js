const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", "apps", "api", ".env"),
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "apps",
      "api",
      "migrations",
      "047_agent_upgrades_v2.sql",
    ),
    "utf-8",
  );

  console.log("Running 047_agent_upgrades_v2.sql...");

  try {
    await pool.query(sql);
    console.log("✅ Migration executed successfully");
  } catch (e) {
    console.error("❌ Error:", e.message);
    // Try splitting and running each statement
    console.log("\n🔄 Retrying with statement-by-statement execution...\n");

    // Split by CREATE/ALTER statements but keep DO blocks intact
    const statements = sql
      .split(/(?=CREATE |ALTER |INSERT |DO \$\$)/gi)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    for (const stmt of statements) {
      if (!stmt || stmt.length < 10) continue;
      try {
        await pool.query(stmt);
        const preview = stmt.substring(0, 50).replace(/\n/g, " ");
        console.log(`✓ ${preview}...`);
      } catch (stmtErr) {
        if (
          !stmtErr.message.includes("already exists") &&
          !stmtErr.message.includes("duplicate")
        ) {
          console.log(`⚠ ${stmtErr.message.substring(0, 80)}`);
        }
      }
    }
  }

  // Verify tables
  const result = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name IN ('cod_statement_imports', 'cod_statement_lines')
  `);
  console.log(
    "\n✅ COD Tables now:",
    result.rows.map((r) => r.table_name),
  );

  await pool.end();
}

runMigration();
