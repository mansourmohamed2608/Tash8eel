#!/usr/bin/env node
/**
 * Comprehensive check and fix for ALL missing columns in Neon database
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

// Expected columns for each table
const TABLE_COLUMNS = {
  merchants: [
    { name: "id", type: "VARCHAR(255)" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "business_name", type: "VARCHAR(255)" },
    { name: "email", type: "VARCHAR(255)" },
    { name: "phone", type: "VARCHAR(50)" },
    { name: "whatsapp_number", type: "VARCHAR(50)" },
    { name: "city", type: "VARCHAR(100)" },
    { name: "address", type: "TEXT" },
    { name: "country", type: "VARCHAR(100) DEFAULT 'Saudi Arabia'" },
    { name: "postal_code", type: "VARCHAR(20)" },
    { name: "logo_url", type: "TEXT" },
    { name: "website", type: "VARCHAR(255)" },
    { name: "description", type: "TEXT" },
    { name: "category", type: "VARCHAR(100)" },
    { name: "tax_number", type: "VARCHAR(50)" },
    { name: "commercial_register", type: "VARCHAR(50)" },
    { name: "api_key", type: "VARCHAR(255)" },
    { name: "webhook_url", type: "TEXT" },
    { name: "webhook_secret", type: "VARCHAR(255)" },
    { name: "settings", type: "JSONB DEFAULT '{}'" },
    { name: "is_active", type: "BOOLEAN DEFAULT true" },
    { name: "timezone", type: "VARCHAR(50) DEFAULT 'Asia/Riyadh'" },
    { name: "currency", type: "VARCHAR(3) DEFAULT 'SAR'" },
    { name: "language", type: "VARCHAR(10) DEFAULT 'ar'" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  customers: [
    { name: "id", type: "UUID" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "phone", type: "VARCHAR(50)" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "email", type: "VARCHAR(255)" },
    { name: "whatsapp_id", type: "VARCHAR(100)" },
    { name: "preferred_language", type: "VARCHAR(10) DEFAULT 'ar'" },
    { name: "tags", type: "TEXT[] DEFAULT '{}'" },
    { name: "metadata", type: "JSONB DEFAULT '{}'" },
    { name: "notes", type: "TEXT" },
    { name: "total_orders", type: "INTEGER DEFAULT 0" },
    { name: "total_spent", type: "DECIMAL(12,2) DEFAULT 0" },
    { name: "last_order_at", type: "TIMESTAMPTZ" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  conversations: [
    { name: "id", type: "VARCHAR(100)" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "customer_id", type: "UUID" },
    { name: "channel", type: "VARCHAR(50) DEFAULT 'whatsapp'" },
    { name: "status", type: "VARCHAR(50) DEFAULT 'active'" },
    { name: "assigned_to", type: "UUID" },
    { name: "context", type: "JSONB DEFAULT '{}'" },
    { name: "cart", type: "JSONB DEFAULT '[]'" },
    { name: "sender_id", type: "VARCHAR(100)" },
    { name: "last_message_at", type: "TIMESTAMPTZ" },
    { name: "resolved_at", type: "TIMESTAMPTZ" },
    { name: "metadata", type: "JSONB DEFAULT '{}'" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  messages: [
    { name: "id", type: "UUID" },
    { name: "conversation_id", type: "VARCHAR(100)" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "provider_message_id", type: "VARCHAR(255)" },
    { name: "direction", type: "VARCHAR(10) DEFAULT 'inbound'" },
    { name: "sender_id", type: "VARCHAR(255)" },
    { name: "text", type: "TEXT" },
    { name: "attachments", type: "JSONB DEFAULT '[]'" },
    { name: "metadata", type: "JSONB DEFAULT '{}'" },
    { name: "delivery_status", type: "VARCHAR(20) DEFAULT 'PENDING'" },
    { name: "delivery_status_updated_at", type: "TIMESTAMPTZ" },
    { name: "llm_used", type: "BOOLEAN DEFAULT false" },
    { name: "tokens_used", type: "INTEGER DEFAULT 0" },
    { name: "retry_count", type: "INTEGER DEFAULT 0" },
    { name: "max_retries", type: "INTEGER DEFAULT 3" },
    { name: "next_retry_at", type: "TIMESTAMPTZ" },
    { name: "error", type: "TEXT" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  orders: [
    { name: "id", type: "UUID" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "customer_id", type: "UUID" },
    { name: "conversation_id", type: "VARCHAR(100)" },
    { name: "order_number", type: "VARCHAR(50)" },
    { name: "status", type: "VARCHAR(50) DEFAULT 'pending'" },
    { name: "items", type: "JSONB DEFAULT '[]'" },
    { name: "subtotal", type: "DECIMAL(12,2) DEFAULT 0" },
    { name: "tax", type: "DECIMAL(12,2) DEFAULT 0" },
    { name: "discount", type: "DECIMAL(12,2) DEFAULT 0" },
    { name: "total", type: "DECIMAL(12,2) DEFAULT 0" },
    { name: "currency", type: "VARCHAR(3) DEFAULT 'SAR'" },
    { name: "payment_method", type: "VARCHAR(50)" },
    { name: "payment_status", type: "VARCHAR(50) DEFAULT 'pending'" },
    { name: "shipping_address", type: "JSONB DEFAULT '{}'" },
    { name: "billing_address", type: "JSONB DEFAULT '{}'" },
    { name: "notes", type: "TEXT" },
    { name: "metadata", type: "JSONB DEFAULT '{}'" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  catalog_items: [
    { name: "id", type: "UUID" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "sku", type: "VARCHAR(100)" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "name_ar", type: "VARCHAR(255)" },
    { name: "description", type: "TEXT" },
    { name: "description_ar", type: "TEXT" },
    { name: "category", type: "VARCHAR(100)" },
    { name: "price", type: "DECIMAL(12,2)" },
    { name: "compare_at_price", type: "DECIMAL(12,2)" },
    { name: "cost_price", type: "DECIMAL(12,2)" },
    { name: "currency", type: "VARCHAR(3) DEFAULT 'SAR'" },
    { name: "image_url", type: "TEXT" },
    { name: "images", type: "JSONB DEFAULT '[]'" },
    { name: "variants", type: "JSONB DEFAULT '[]'" },
    { name: "is_active", type: "BOOLEAN DEFAULT true" },
    { name: "stock_quantity", type: "INTEGER DEFAULT 0" },
    { name: "track_inventory", type: "BOOLEAN DEFAULT true" },
    { name: "metadata", type: "JSONB DEFAULT '{}'" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  inventory_items: [
    { name: "id", type: "UUID" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "catalog_item_id", type: "UUID" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "description", type: "TEXT" },
    { name: "sku", type: "VARCHAR(100)" },
    { name: "barcode", type: "VARCHAR(100)" },
    { name: "category", type: "VARCHAR(100)" },
    { name: "price", type: "DECIMAL(12,2)" },
    { name: "cost_price", type: "DECIMAL(12,2)" },
    { name: "image_url", type: "TEXT" },
    { name: "track_inventory", type: "BOOLEAN DEFAULT true" },
    { name: "allow_backorder", type: "BOOLEAN DEFAULT false" },
    { name: "low_stock_threshold", type: "INTEGER DEFAULT 5" },
    { name: "reorder_point", type: "INTEGER DEFAULT 10" },
    { name: "reorder_quantity", type: "INTEGER DEFAULT 20" },
    { name: "location", type: "VARCHAR(255)" },
    { name: "weight_grams", type: "INTEGER" },
    { name: "dimensions", type: "JSONB DEFAULT '{}'" },
    { name: "supplier_id", type: "VARCHAR(255)" },
    { name: "supplier_sku", type: "VARCHAR(100)" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  inventory_variants: [
    { name: "id", type: "UUID" },
    { name: "inventory_item_id", type: "UUID" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "sku", type: "VARCHAR(100)" },
    { name: "barcode", type: "VARCHAR(100)" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "attributes", type: "JSONB DEFAULT '{}'" },
    { name: "quantity_on_hand", type: "INTEGER DEFAULT 0" },
    { name: "quantity_reserved", type: "INTEGER DEFAULT 0" },
    { name: "low_stock_threshold", type: "INTEGER" },
    { name: "cost_price", type: "DECIMAL(12,2)" },
    { name: "price_modifier", type: "DECIMAL(12,2) DEFAULT 0" },
    { name: "is_active", type: "BOOLEAN DEFAULT true" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  merchant_staff: [
    { name: "id", type: "UUID" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "email", type: "VARCHAR(255)" },
    { name: "password_hash", type: "VARCHAR(255)" },
    { name: "name", type: "VARCHAR(255)" },
    { name: "phone", type: "VARCHAR(50)" },
    { name: "role", type: "VARCHAR(50) DEFAULT 'STAFF'" },
    { name: "permissions", type: "JSONB DEFAULT '{}'" },
    { name: "is_active", type: "BOOLEAN DEFAULT true" },
    { name: "last_login_at", type: "TIMESTAMPTZ" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  outbox_events: [
    { name: "id", type: "UUID" },
    { name: "event_type", type: "VARCHAR(100)" },
    { name: "aggregate_type", type: "VARCHAR(100)" },
    { name: "aggregate_id", type: "VARCHAR(255)" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "payload", type: "JSONB" },
    { name: "correlation_id", type: "VARCHAR(100)" },
    { name: "status", type: "VARCHAR(20) DEFAULT 'PENDING'" },
    { name: "processed_at", type: "TIMESTAMPTZ" },
    { name: "error", type: "TEXT" },
    { name: "retry_count", type: "INTEGER DEFAULT 0" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
  shipments: [
    { name: "id", type: "UUID" },
    { name: "order_id", type: "UUID" },
    { name: "merchant_id", type: "VARCHAR(255)" },
    { name: "tracking_id", type: "VARCHAR(100)" },
    { name: "courier", type: "VARCHAR(100)" },
    { name: "status", type: "VARCHAR(50) DEFAULT 'pending'" },
    { name: "status_history", type: "JSONB DEFAULT '[]'" },
    { name: "estimated_delivery", type: "TIMESTAMPTZ" },
    { name: "actual_delivery", type: "TIMESTAMPTZ" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
    { name: "updated_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ],
};

async function checkAndFixColumns() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to Neon\n");

    let totalFixed = 0;

    for (const [tableName, columns] of Object.entries(TABLE_COLUMNS)) {
      console.log(`\n=== Checking ${tableName} ===`);

      // Check if table exists
      const tableCheck = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [tableName],
      );

      if (!tableCheck.rows[0].exists) {
        console.log(`  ⚠ Table does not exist - skipping`);
        continue;
      }

      // Get existing columns
      const existingCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [tableName],
      );
      const existingColNames = existingCols.rows.map((r) => r.column_name);

      let addedCount = 0;
      // Check each expected column
      for (const col of columns) {
        if (!existingColNames.includes(col.name)) {
          try {
            await client.query(
              `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
            );
            console.log(`  ✓ Added ${col.name}`);
            totalFixed++;
            addedCount++;
          } catch (e) {
            console.log(`  ✗ ${col.name}: ${e.message}`);
          }
        }
      }

      if (addedCount === 0) {
        console.log(`  ✓ All columns present`);
      }
    }

    console.log(`\n\n✅ Fixed ${totalFixed} missing columns!`);
  } finally {
    await client.end();
  }
}

checkAndFixColumns().catch(console.error);
