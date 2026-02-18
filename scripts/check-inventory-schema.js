require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set in environment variables");
  console.error("Please set DATABASE_URL in .env file or environment");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    // Check inventory_items columns
    const items = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inventory_items' 
      ORDER BY ordinal_position
    `);
    console.log("=== INVENTORY_ITEMS TABLE ===");
    items.rows.forEach((c) =>
      console.log(`  ${c.column_name}: ${c.data_type}`),
    );

    // Check inventory_variants columns
    const variants = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inventory_variants' 
      ORDER BY ordinal_position
    `);
    console.log("\n=== INVENTORY_VARIANTS TABLE ===");
    variants.rows.forEach((c) =>
      console.log(`  ${c.column_name}: ${c.data_type}`),
    );

    // Check sample data
    const sampleItems = await pool.query(`
      SELECT i.*, 
             COUNT(v.id) as variant_count,
             COALESCE(SUM(v.quantity_on_hand), 0) as total_stock,
             COALESCE(SUM(v.quantity_reserved), 0) as total_reserved
      FROM inventory_items i
      LEFT JOIN inventory_variants v ON v.inventory_item_id = i.id
      WHERE i.merchant_id = 'demo-merchant'
      GROUP BY i.id
      LIMIT 3
    `);
    console.log("\n=== SAMPLE ITEMS WITH VARIANTS ===");
    console.log(JSON.stringify(sampleItems.rows, null, 2));

    // Check sample variants
    const sampleVariants = await pool.query(`
      SELECT * FROM inventory_variants 
      WHERE merchant_id = 'demo-merchant'
      LIMIT 3
    `);
    console.log("\n=== SAMPLE VARIANTS ===");
    console.log(JSON.stringify(sampleVariants.rows, null, 2));

    // Calculate actual total value
    const totalValue = await pool.query(`
      SELECT 
        SUM(v.quantity_on_hand * COALESCE(v.cost_price, i.cost_price, i.price, 0)) as total_value,
        SUM(v.quantity_on_hand) as total_stock,
        COUNT(DISTINCT i.id) as item_count
      FROM inventory_variants v
      JOIN inventory_items i ON v.inventory_item_id = i.id
      WHERE i.merchant_id = 'demo-merchant'
    `);
    console.log("\n=== CALCULATED TOTALS ===");
    console.log(JSON.stringify(totalValue.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
