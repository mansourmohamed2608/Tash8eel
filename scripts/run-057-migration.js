const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../apps/api/migrations/057_item_recipes.sql"),
      "utf8",
    );
    console.log("Running migration 057_item_recipes.sql...");
    await pool.query(sql);
    console.log("Migration completed successfully!");

    // Verify
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('item_recipes','order_ingredient_deductions')",
    );
    console.log(
      "Created tables:",
      tables.rows.map((r) => r.table_name),
    );

    const col = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='catalog_items' AND column_name='has_recipe'",
    );
    console.log("has_recipe column exists:", col.rows.length > 0);
  } catch (e) {
    console.error("Migration error:", e.message);
  } finally {
    await pool.end();
  }
}
main();
