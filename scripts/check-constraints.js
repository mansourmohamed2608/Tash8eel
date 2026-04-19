require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    const result = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as constraint_def
      FROM pg_constraint
      WHERE conrelid = 'customers'::regclass
    `);

    console.log("customers constraints:");
    result.rows.forEach((row) =>
      console.log("  -", row.conname, ":", row.constraint_def),
    );

    // Also check indexes
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'customers'
    `);

    console.log("\ncustomers indexes:");
    indexes.rows.forEach((row) => console.log("  -", row.indexname));
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main();
