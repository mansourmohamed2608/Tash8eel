const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is required. Set it in your environment.");
  process.exit(1);
}

const p = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const MERCHANT_ID = process.env.MERCHANT_ID || "demo-merchant";

  // Summary counts
  const catCount = await p.query(
    "SELECT count(*) FROM catalog_items WHERE merchant_id = $1",
    [MERCHANT_ID],
  );
  const invCount = await p.query(
    "SELECT count(*) FROM inventory_items WHERE merchant_id = $1",
    [MERCHANT_ID],
  );
  console.log(
    `Catalog items: ${catCount.rows[0].count}, Inventory items: ${invCount.rows[0].count}`,
  );

  // لبس item - stale link check
  const lbs = await p.query(
    "SELECT id, name, sku, catalog_item_id FROM inventory_items WHERE sku = $1 AND merchant_id = $2",
    ["SKUSZ", MERCHANT_ID],
  );
  console.log("\nلبس item:", JSON.stringify(lbs.rows));
  if (lbs.rows[0]?.catalog_item_id) {
    const old = await p.query("SELECT id FROM catalog_items WHERE id = $1", [
      lbs.rows[0].catalog_item_id,
    ]);
    console.log(
      "  Catalog item exists?",
      old.rows.length > 0 ? "YES" : "NO (STALE LINK - will be fixed)",
    );
  }

  // Inventory items with no catalog link
  const unlinked = await p.query(
    `
    SELECT id, name, sku
    FROM inventory_items
    WHERE merchant_id = $1
      AND (
        catalog_item_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM catalog_items WHERE id = inventory_items.catalog_item_id
        )
      )
    `,
    [MERCHANT_ID],
  );
  console.log(
    "\nUnlinked inventory items (will push to catalog):",
    unlinked.rows.length,
  );
  unlinked.rows.forEach((r) => console.log(`  - ${r.name} (${r.sku})`));

  // Catalog items with no inventory link
  const unlinkedCat = await p.query(
    `
    SELECT id, name_ar, sku
    FROM catalog_items
    WHERE merchant_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM inventory_items WHERE catalog_item_id = catalog_items.id
      )
    `,
    [MERCHANT_ID],
  );
  console.log(
    "\nUnlinked catalog items (will pull to inventory):",
    unlinkedCat.rows.length,
  );
  unlinkedCat.rows.forEach((r) => console.log(`  - ${r.name_ar} (${r.sku})`));

  // Variant counts
  const varCount = await p.query(
    "SELECT count(*) FROM inventory_variants WHERE merchant_id = $1",
    [MERCHANT_ID],
  );
  console.log("\nInventory variants:", varCount.rows[0].count);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.end();
  });
