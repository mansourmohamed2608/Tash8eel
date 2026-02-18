#!/usr/bin/env node
/**
 * Neon Database Migration Script
 *
 * This script runs all migrations against a Neon database.
 * Usage: node scripts/migrate-neon.js
 *
 * Make sure DATABASE_URL is set in your environment or .env file
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Load .env if present
try {
  require("dotenv").config({
    path: path.join(__dirname, "..", "apps", "api", ".env"),
  });
} catch (e) {
  // dotenv not available, rely on environment variables
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  console.error("Please set it to your Neon connection string");
  process.exit(1);
}

// Migration files in order
const MIGRATIONS = [
  "001_init.sql",
  "002_production_features.sql",
  "003_delivery_lifecycle_reports.sql",
  "004_inventory_agent.sql",
  "005_twilio_whatsapp.sql",
  "006_merchant_agent_subscriptions.sql",
  "007_orchestrator_schema_fix.sql",
  "008_production_features.sql",
  "009_loyalty_and_promotions.sql",
  "010_notifications_system.sql",
  "011_payment_links_and_proofs.sql",
  "012_merchant_entitlements.sql",
  "013_product_ocr.sql",
  "014_inventory_locations.sql",
  "015_knowledge_base.sql",
  "016_demo_merchant_entitlements.sql",
  "017_add_human_takeover_state.sql",
  "018_add_order_out_for_delivery.sql",
  "019_inventory_items_columns.sql",
  "020_merchant_preferences.sql",
  "021_unify_staff_notifications.sql",
  "022_feature_requests.sql",
  "023_analytics_events.sql",
  "024_billing_subscriptions.sql",
  "025_push_subscriptions_providers.sql",
  "026_quote_requests.sql",
  "027_merchant_columns_fix.sql",
  "028_subscription_offers.sql",
  "029_payment_link_preferences.sql",
  "029_payment_links_conversation_id.sql",
  "029_schema_hotfix.sql",
  "030_payment_links_columns_fix.sql",
  "030_schema_patch.sql",
  "031_audit_logs_correlation_id.sql",
  "031_billing_schema_patch.sql",
  "032_customers_preferences.sql",
  "032_shipments_failure_reason.sql",
  "033_kpi_delivery_columns.sql",
  "034_team_schema_fix.sql",
  "035_team_columns_fix.sql",
  "036_team_password_hash_nullable.sql",
  "037_integrations.sql",
  "038_staff_must_change_password.sql",
  "039_conversations_missing_columns.sql",
  "040_customers_missing_columns.sql",
  "041_customers_phone_nullable.sql",
  "042_messages_content_nullable.sql",
  "043_orders_delivery_notes.sql",
  "044_orders_more_columns.sql",
  "045_conversations_human_operator.sql",
  "046_ops_finance_premium.sql",
  "047_agent_upgrades_v2.sql",
  "048_merchant_copilot.sql",
];

const MIGRATIONS_DIR = path.join(__dirname, "..", "apps", "api", "migrations");

async function runMigrations() {
  console.log("🚀 Neon Database Migration");
  console.log("━".repeat(50));

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Test connection
    console.log("📡 Connecting to Neon...");
    const client = await pool.connect();
    console.log("✅ Connected to Neon database");
    client.release();

    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get already executed migrations
    const executed = await pool.query("SELECT name FROM _migrations");
    const executedNames = new Set(executed.rows.map((r) => r.name));

    let migrationsRun = 0;

    for (const migrationFile of MIGRATIONS) {
      if (executedNames.has(migrationFile)) {
        console.log(`⏭️  Skipping ${migrationFile} (already executed)`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, migrationFile);

      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Migration file not found: ${migrationFile}`);
        continue;
      }

      console.log(`📄 Running ${migrationFile}...`);

      const sql = fs.readFileSync(filePath, "utf-8");

      try {
        // Split by semicolons and run each statement
        // (pg doesn't support multiple statements in one query)
        const statements = sql
          .split(
            /;(?=\s*(?:--|\/\*|CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|GRANT|REVOKE|$))/i,
          )
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("--"));

        for (const statement of statements) {
          if (statement) {
            try {
              await pool.query(statement);
            } catch (stmtErr) {
              // Some errors are OK (like "already exists")
              if (
                !stmtErr.message.includes("already exists") &&
                !stmtErr.message.includes("duplicate key") &&
                !stmtErr.message.includes("does not exist")
              ) {
                throw stmtErr;
              }
            }
          }
        }

        // Record migration as executed
        await pool.query(
          "INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
          [migrationFile],
        );

        console.log(`✅ ${migrationFile} completed`);
        migrationsRun++;
      } catch (err) {
        console.error(`❌ Error in ${migrationFile}:`, err.message);
        // Continue with next migration
      }
    }

    console.log("━".repeat(50));
    console.log(`✨ Migration complete! ${migrationsRun} migrations run.`);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Seed demo data function
async function seedDemoData() {
  console.log("\n🌱 Seeding demo data...");

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Check if demo merchant exists
    const existing = await pool.query(
      "SELECT id FROM merchants WHERE id = 'demo-merchant'",
    );

    if (existing.rows.length === 0) {
      // Insert demo merchant
      await pool.query(`
        INSERT INTO merchants (id, name, api_key, is_active, category, config)
        VALUES (
          'demo-merchant', 
          'متجر تجريبي', 
          'mkey_demo_1234567890abcdef1234567890abcdef12345678', 
          true, 
          'GENERAL',
          '{"currency": "EGP", "language": "ar-EG"}'::jsonb
        )
      `);
      console.log("✅ Demo merchant created");
    } else {
      // Update API key
      await pool.query(`
        UPDATE merchants 
        SET api_key = 'mkey_demo_1234567890abcdef1234567890abcdef12345678',
            is_active = true
        WHERE id = 'demo-merchant'
      `);
      console.log("✅ Demo merchant updated");
    }

    // Insert demo staff user (for portal login)
    await pool.query(`
      INSERT INTO merchant_staff (id, merchant_id, email, name, role, password_hash, status, created_at)
      VALUES (
        gen_random_uuid(),
        'demo-merchant',
        'demo@tash8eel.com',
        'صاحب المتجر',
        'OWNER',
        '$2b$10$demo.password.hash.placeholder',
        'ACTIVE',
        NOW()
      )
      ON CONFLICT (merchant_id, email) DO UPDATE SET status = 'ACTIVE'
    `);
    console.log("✅ Demo staff user created");

    console.log("✨ Demo data seeded successfully!");
  } catch (err) {
    console.error("❌ Seeding failed:", err.message);
  } finally {
    await pool.end();
  }
}

// Run based on command
const command = process.argv[2];

if (command === "seed") {
  seedDemoData();
} else if (command === "migrate-and-seed") {
  runMigrations().then(() => seedDemoData());
} else {
  runMigrations();
}
