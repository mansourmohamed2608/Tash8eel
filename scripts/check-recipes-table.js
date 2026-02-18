const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('item_recipes','order_ingredient_deductions')",
    );
    console.log(
      "Existing tables:",
      tables.rows.map((r) => r.table_name),
    );

    const col = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='catalog_items' AND column_name='has_recipe'",
    );
    console.log("has_recipe column exists:", col.rows.length > 0);
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}
main();
