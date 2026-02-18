const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", "apps", "api", ".env"),
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  const result = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name IN ('cod_statement_imports', 'cod_statement_lines')
  `);
  console.log(
    "✅ COD Tables found:",
    result.rows.map((r) => r.table_name),
  );

  // Check columns
  const cols = await pool.query(`
    SELECT table_name, column_name FROM information_schema.columns 
    WHERE table_name IN ('cod_statement_imports', 'cod_statement_lines')
    ORDER BY table_name, ordinal_position
  `);
  console.log("\n📋 Columns:");
  cols.rows.forEach((r) => console.log(`  ${r.table_name}.${r.column_name}`));

  await pool.end();
}

check().catch((e) => {
  console.error("❌", e.message);
  pool.end();
});
