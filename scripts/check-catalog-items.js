require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'catalog_items'
      ORDER BY ordinal_position
    `);

    console.log("catalog_items columns:");
    result.rows.forEach((row) =>
      console.log("  -", row.column_name, ":", row.data_type),
    );
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main();
