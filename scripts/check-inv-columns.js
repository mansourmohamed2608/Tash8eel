require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    // Check inventory_variants columns
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inventory_variants' 
      ORDER BY ordinal_position
    `);
    console.log("inventory_variants columns:");
    cols.rows.forEach((c) =>
      console.log("  -", c.column_name, ":", c.data_type),
    );

    // Check if quantity_available is a computed column or needs to be added
    const hasQtyAvailable = cols.rows.some(
      (c) => c.column_name === "quantity_available",
    );
    console.log("\nHas quantity_available column:", hasQtyAvailable);

    // Test the problematic query
    console.log("\nTesting API query...");
    const items = await pool.query(`
      SELECT i.*, 
             COUNT(v.id) as variant_count,
             SUM(v.quantity_on_hand) as total_on_hand,
             SUM(COALESCE(v.quantity_on_hand, 0) - COALESCE(v.quantity_reserved, 0)) as total_available
      FROM inventory_items i
      LEFT JOIN inventory_variants v ON v.inventory_item_id = i.id
      WHERE i.merchant_id = 'demo-merchant'
      GROUP BY i.id
      ORDER BY i.name
    `);
    console.log("Items found:", items.rows.length);
    items.rows.forEach((i) =>
      console.log(
        "  -",
        i.sku,
        ":",
        i.name,
        "- on_hand:",
        i.total_on_hand,
        "- available:",
        i.total_available,
      ),
    );
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main();
