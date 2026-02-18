#!/usr/bin/env node
/**
 * Check all tables in Neon and compare with expected tables from migrations
 */

const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL not set. Create .env file or set environment variable.",
  );
  process.exit(1);
}

// All tables expected from migrations
const EXPECTED_TABLES = [
  // 001_init.sql
  "merchants",
  "customers",
  "conversations",
  "messages",
  "catalog_items",
  "orders",
  "order_items",
  "merchant_token_usage",
  "shipments",
  "outbox_events",
  "dlq_events",
  "merchant_reports",

  // 002_production_features.sql
  "merchant_staff",
  "audit_logs",

  // 003_delivery_lifecycle_reports.sql
  "stock_movements",
  "delivery_reports",

  // 004_inventory_agent.sql
  "inventory_items",
  "inventory_variants",
  "stock_reservations",
  "inventory_alerts",

  // 005_twilio_whatsapp.sql
  "whatsapp_templates",
  "whatsapp_media",

  // 006_merchant_agent_subscriptions.sql
  "merchant_agent_subscriptions",

  // 007_orchestrator_schema_fix.sql
  "orchestrator_tasks",

  // 008_production_features.sql
  "merchant_settings",
  "permission_templates",
  "webhooks",
  "webhook_deliveries",
  "rate_limit_counters",
  "rate_limit_violations",
  "merchant_notifications",
  "notification_preferences",

  // 009_loyalty_and_promotions.sql
  "loyalty_programs",
  "customer_loyalty",
  "loyalty_transactions",
  "promotions",
  "promotion_usage",

  // 010_notifications_system.sql
  "notification_templates",
  "scheduled_notifications",
  "notification_logs",

  // 011_payment_links_and_proofs.sql
  "payment_links",
  "payment_proofs",

  // 012_merchant_entitlements.sql
  "subscription_plans",
  "merchant_subscriptions",
  "merchant_entitlements",
  "feature_usage",
  "billing_history",

  // 013_product_ocr.sql
  "ocr_scans",
  "ocr_extracted_products",
];

async function checkTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to Neon...\n");
    await client.connect();

    // Get existing tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const existingTables = result.rows.map((r) => r.table_name);

    console.log("=== EXISTING TABLES IN NEON ===");
    existingTables.forEach((t) => console.log(`  ✓ ${t}`));
    console.log(`\nTotal: ${existingTables.length} tables\n`);

    // Find missing tables
    const missingTables = EXPECTED_TABLES.filter(
      (t) => !existingTables.includes(t),
    );

    if (missingTables.length > 0) {
      console.log("=== MISSING TABLES ===");
      missingTables.forEach((t) => console.log(`  ✗ ${t}`));
      console.log(`\nTotal missing: ${missingTables.length} tables`);
    } else {
      console.log("=== ALL EXPECTED TABLES EXIST ===");
    }

    // Find extra tables (in DB but not in expected list)
    const extraTables = existingTables.filter(
      (t) => !EXPECTED_TABLES.includes(t),
    );
    if (extraTables.length > 0) {
      console.log("\n=== EXTRA TABLES (not in expected list) ===");
      extraTables.forEach((t) => console.log(`  ? ${t}`));
    }

    return missingTables;
  } finally {
    await client.end();
  }
}

checkTables()
  .then((missing) => {
    if (missing.length > 0) {
      console.log(
        "\nRun: node scripts/fix-neon-tables.js to create missing tables",
      );
    }
  })
  .catch(console.error);
