require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    // Check inventory_items columns
    const cols1 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inventory_items' 
      ORDER BY ordinal_position
    `);
    console.log("inventory_items columns:");
    cols1.rows.forEach((c) =>
      console.log("  -", c.column_name, ":", c.data_type),
    );

    // Check inventory_variants columns
    const cols2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inventory_variants' 
      ORDER BY ordinal_position
    `);
    console.log("\ninventory_variants columns:");
    cols2.rows.forEach((c) =>
      console.log("  -", c.column_name, ":", c.data_type),
    );

    // Check catalog_items for demo-merchant
    const catalogItems = await pool.query(`
      SELECT id, sku, name_ar, stock_quantity 
      FROM catalog_items 
      WHERE merchant_id = 'demo-merchant' 
      LIMIT 5
    `);
    console.log("\ncatalog_items for demo-merchant:");
    catalogItems.rows.forEach((r) =>
      console.log("  -", r.sku, ":", r.name_ar, "- qty:", r.stock_quantity),
    );

    // Check if there's a relationship between catalog_items and inventory
    const fks = await pool.query(`
      SELECT
        tc.table_name, kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND (tc.table_name LIKE '%inventory%' OR ccu.table_name LIKE '%inventory%')
    `);
    console.log("\nInventory foreign keys:");
    fks.rows.forEach((r) =>
      console.log(
        "  -",
        r.table_name + "." + r.column_name,
        "->",
        r.foreign_table_name + "." + r.foreign_column_name,
      ),
    );
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main();
