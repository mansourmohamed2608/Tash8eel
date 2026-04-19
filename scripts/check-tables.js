require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log("Tables in Neon database:");
    if (result.rows.length === 0) {
      console.log("  (no tables found)");
    } else {
      result.rows.forEach((row) => console.log("  -", row.table_name));
    }
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main();
