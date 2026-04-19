/**
 * COMPLETE Inventory Agent Setup Script
 *
 * This fixes ALL the issues:
 * 1. merchants.enabled_agents - Must include 'INVENTORY_AGENT'
 * 2. merchants.enabled_features - Must include 'INVENTORY'
 * 3. merchant_agent_subscriptions - Must have INVENTORY subscription (correct case)
 * 4. inventory_items - Must have items synced from catalog
 * 5. inventory_variants - Must have variants with stock
 */
require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const MERCHANT_ID = "demo-merchant";

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("=".repeat(80));
    console.log("COMPLETE INVENTORY AGENT SETUP FOR:", MERCHANT_ID);
    console.log("=".repeat(80));

    // ======================================================================
    // STEP 1: Check current merchant state
    // ======================================================================
    console.log("\n📍 STEP 1: Current merchant state");
    const merchant = await client.query(
      `
      SELECT id, name, enabled_agents, enabled_features, is_active
      FROM merchants WHERE id = $1
    `,
      [MERCHANT_ID],
    );

    if (merchant.rows.length === 0) {
      throw new Error("Merchant not found!");
    }

    const m = merchant.rows[0];
    console.log("   Name:", m.name);
    console.log("   Active:", m.is_active);
    console.log("   Current enabled_agents:", m.enabled_agents);
    console.log("   Current enabled_features:", m.enabled_features);

    // ======================================================================
    // STEP 2: Update merchants.enabled_agents to include INVENTORY_AGENT
    // ======================================================================
    console.log("\n📍 STEP 2: Updating merchants.enabled_agents");

    let agents = m.enabled_agents || ["OPS_AGENT"];
    if (!agents.includes("INVENTORY_AGENT")) {
      agents.push("INVENTORY_AGENT");
      await client.query(
        `
        UPDATE merchants 
        SET enabled_agents = $1, updated_at = NOW()
        WHERE id = $2
      `,
        [agents, MERCHANT_ID],
      );
      console.log("   ✓ Added INVENTORY_AGENT to enabled_agents");
    } else {
      console.log("   ✓ INVENTORY_AGENT already in enabled_agents");
    }
    console.log("   New enabled_agents:", agents);

    // ======================================================================
    // STEP 3: Update merchants.enabled_features to include INVENTORY
    // ======================================================================
    console.log("\n📍 STEP 3: Updating merchants.enabled_features");

    let features = m.enabled_features || ["CONVERSATIONS", "ORDERS", "CATALOG"];
    if (!features.includes("INVENTORY")) {
      features.push("INVENTORY");
      await client.query(
        `
        UPDATE merchants 
        SET enabled_features = $1, updated_at = NOW()
        WHERE id = $2
      `,
        [features, MERCHANT_ID],
      );
      console.log("   ✓ Added INVENTORY to enabled_features");
    } else {
      console.log("   ✓ INVENTORY already in enabled_features");
    }
    console.log("   New enabled_features:", features);

    // ======================================================================
    // STEP 4: Fix merchant_agent_subscriptions (correct case: INVENTORY)
    // ======================================================================
    console.log("\n📍 STEP 4: Fixing merchant_agent_subscriptions");

    // Delete wrong case entries
    const deleted = await client.query(
      `
      DELETE FROM merchant_agent_subscriptions 
      WHERE merchant_id = $1 AND agent_type != 'INVENTORY' AND UPPER(agent_type) = 'INVENTORY'
      RETURNING agent_type
    `,
      [MERCHANT_ID],
    );
    if (deleted.rows.length > 0) {
      console.log(
        "   ✓ Removed wrong case entries:",
        deleted.rows.map((r) => r.agent_type),
      );
    }

    // Upsert correct entry
    const subResult = await client.query(
      `
      INSERT INTO merchant_agent_subscriptions (merchant_id, agent_type, is_enabled, config)
      VALUES ($1, 'INVENTORY', true, $2)
      ON CONFLICT (merchant_id, agent_type) DO UPDATE SET
        is_enabled = true,
        config = COALESCE(EXCLUDED.config, merchant_agent_subscriptions.config),
        updated_at = NOW()
      RETURNING *
    `,
      [
        MERCHANT_ID,
        JSON.stringify({
          lowStockThreshold: 10,
          autoReorderEnabled: false,
          alertPhoneNumber: null,
        }),
      ],
    );
    console.log(
      "   ✓ Subscription:",
      subResult.rows[0].agent_type,
      "- enabled:",
      subResult.rows[0].is_enabled,
    );

    // Show all subscriptions now
    const allSubs = await client.query(
      `
      SELECT agent_type, is_enabled FROM merchant_agent_subscriptions WHERE merchant_id = $1
    `,
      [MERCHANT_ID],
    );
    console.log(
      "   All subscriptions:",
      allSubs.rows.map((r) => `${r.agent_type}=${r.is_enabled}`).join(", "),
    );

    // ======================================================================
    // STEP 5: Ensure catalog items exist
    // ======================================================================
    console.log("\n📍 STEP 5: Checking catalog items");

    const catalogItems = await client.query(
      `
      SELECT id, sku, name_ar, name_en, base_price, stock_quantity, is_active
      FROM catalog_items
      WHERE merchant_id = $1
    `,
      [MERCHANT_ID],
    );

    if (catalogItems.rows.length === 0) {
      console.log("   ⚠ No catalog items found. Creating sample items...");

      const sampleProducts = [
        {
          sku: "PROD-001",
          nameAr: "منتج تجريبي 1",
          nameEn: "Sample Product 1",
          price: 100,
          stock: 50,
        },
        {
          sku: "PROD-002",
          nameAr: "منتج تجريبي 2",
          nameEn: "Sample Product 2",
          price: 150,
          stock: 30,
        },
        {
          sku: "PROD-003",
          nameAr: "منتج تجريبي 3",
          nameEn: "Sample Product 3",
          price: 200,
          stock: 5,
        }, // Low stock
      ];

      for (const p of sampleProducts) {
        const id = uuidv4();
        await client.query(
          `
          INSERT INTO catalog_items (id, merchant_id, sku, name_ar, name_en, base_price, stock_quantity, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, true)
        `,
          [id, MERCHANT_ID, p.sku, p.nameAr, p.nameEn, p.price, p.stock],
        );
        catalogItems.rows.push({
          id,
          sku: p.sku,
          name_ar: p.nameAr,
          name_en: p.nameEn,
          base_price: p.price,
          stock_quantity: p.stock,
        });
      }
      console.log(
        "   ✓ Created",
        sampleProducts.length,
        "sample catalog items",
      );
    } else {
      console.log("   ✓ Found", catalogItems.rows.length, "catalog items");
    }

    // ======================================================================
    // STEP 6: Sync catalog items to inventory_items
    // ======================================================================
    console.log("\n📍 STEP 6: Syncing to inventory_items");

    let createdItems = 0,
      updatedItems = 0;

    for (const item of catalogItems.rows) {
      const result = await client.query(
        `
        INSERT INTO inventory_items (
          id, merchant_id, catalog_item_id, name, sku, 
          track_inventory, allow_backorder, low_stock_threshold,
          price, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, true, false, 10, $6, NOW(), NOW())
        ON CONFLICT (merchant_id, sku) DO UPDATE SET
          catalog_item_id = EXCLUDED.catalog_item_id,
          name = EXCLUDED.name,
          price = EXCLUDED.price,
          updated_at = NOW()
        RETURNING id, (xmax = 0) as is_new
      `,
        [
          uuidv4(),
          MERCHANT_ID,
          item.id,
          item.name_ar || item.name_en,
          item.sku,
          item.base_price,
        ],
      );

      if (result.rows[0].is_new) createdItems++;
      else updatedItems++;
    }
    console.log("   ✓ Created:", createdItems, "| Updated:", updatedItems);

    // ======================================================================
    // STEP 7: Create inventory_variants
    // ======================================================================
    console.log("\n📍 STEP 7: Creating inventory variants");

    const inventoryItems = await client.query(
      `
      SELECT ii.id, ii.sku, ii.name, ii.low_stock_threshold, ii.price, ci.stock_quantity
      FROM inventory_items ii
      LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id
      WHERE ii.merchant_id = $1
    `,
      [MERCHANT_ID],
    );

    let createdVariants = 0,
      updatedVariants = 0;

    for (const item of inventoryItems.rows) {
      const result = await client.query(
        `
        INSERT INTO inventory_variants (
          id, inventory_item_id, merchant_id, sku, name,
          quantity_on_hand, quantity_reserved, low_stock_threshold,
          cost_price, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, true, NOW(), NOW())
        ON CONFLICT (merchant_id, sku) DO UPDATE SET
          inventory_item_id = EXCLUDED.inventory_item_id,
          name = EXCLUDED.name,
          quantity_on_hand = EXCLUDED.quantity_on_hand,
          low_stock_threshold = EXCLUDED.low_stock_threshold,
          updated_at = NOW()
        RETURNING id, (xmax = 0) as is_new
      `,
        [
          uuidv4(),
          item.id,
          MERCHANT_ID,
          item.sku,
          item.name,
          item.stock_quantity || 0,
          item.low_stock_threshold || 10,
          item.price ? parseFloat(item.price) * 0.7 : 0,
        ],
      );

      if (result.rows[0].is_new) createdVariants++;
      else updatedVariants++;
    }
    console.log(
      "   ✓ Created:",
      createdVariants,
      "| Updated:",
      updatedVariants,
    );

    await client.query("COMMIT");

    // ======================================================================
    // FINAL SUMMARY
    // ======================================================================
    console.log("\n" + "=".repeat(80));
    console.log("✅ SETUP COMPLETE - FINAL STATE");
    console.log("=".repeat(80));

    // Re-fetch merchant
    const finalMerchant = await pool.query(
      `
      SELECT enabled_agents, enabled_features FROM merchants WHERE id = $1
    `,
      [MERCHANT_ID],
    );
    console.log("\n📍 Merchant Entitlements:");
    console.log("   enabled_agents:", finalMerchant.rows[0].enabled_agents);
    console.log("   enabled_features:", finalMerchant.rows[0].enabled_features);

    // Subscriptions
    const finalSubs = await pool.query(
      `
      SELECT agent_type, is_enabled FROM merchant_agent_subscriptions WHERE merchant_id = $1
    `,
      [MERCHANT_ID],
    );
    console.log("\n📍 Agent Subscriptions:");
    finalSubs.rows.forEach((s) =>
      console.log(
        `   - ${s.agent_type}: ${s.is_enabled ? "ENABLED ✓" : "disabled"}`,
      ),
    );

    // Inventory counts
    const counts = await pool.query(
      `
      SELECT 
        (SELECT COUNT(*) FROM catalog_items WHERE merchant_id = $1) as catalog,
        (SELECT COUNT(*) FROM inventory_items WHERE merchant_id = $1) as items,
        (SELECT COUNT(*) FROM inventory_variants WHERE merchant_id = $1) as variants
    `,
      [MERCHANT_ID],
    );
    console.log("\n📍 Inventory Data:");
    console.log("   Catalog items:", counts.rows[0].catalog);
    console.log("   Inventory items:", counts.rows[0].items);
    console.log("   Inventory variants:", counts.rows[0].variants);

    // Show inventory status
    const variants = await pool.query(
      `
      SELECT sku, name, quantity_on_hand, quantity_reserved, low_stock_threshold
      FROM inventory_variants
      WHERE merchant_id = $1
      ORDER BY sku
    `,
      [MERCHANT_ID],
    );

    console.log("\n📍 Stock Status:");
    variants.rows.forEach((v) => {
      const available = v.quantity_on_hand - v.quantity_reserved;
      const status =
        available <= v.low_stock_threshold ? "⚠️  LOW STOCK" : "✓ OK";
      console.log(
        `   ${v.sku}: ${v.quantity_on_hand} on hand, ${v.quantity_reserved} reserved (${available} available) [${status}]`,
      );
    });

    console.log("\n" + "=".repeat(80));
    console.log("🎉 Inventory Agent is now fully configured!");
    console.log("=".repeat(80));
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ Error:", e.message);
    console.error(e.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
