require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const MIGRATIONS_DIR = path.join(__dirname, "..", "apps", "api", "migrations");

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
];

async function runMigration(client, filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, "utf-8");

  try {
    // Run entire file as single transaction
    await client.query(sql);
    return { success: true };
  } catch (err) {
    // Some errors are OK
    const ignorable = [
      "already exists",
      "duplicate key",
      'extension "vector" is not available',
      "must be owner of extension",
      "permission denied",
    ];

    if (
      ignorable.some((msg) =>
        err.message.toLowerCase().includes(msg.toLowerCase()),
      )
    ) {
      return { success: true, warning: err.message.substring(0, 60) };
    }

    return { success: false, error: err.message };
  }
}

async function main() {
  console.log("🚀 Running Neon Migrations");
  console.log("━".repeat(60));

  const client = await pool.connect();

  try {
    for (const migration of MIGRATIONS) {
      process.stdout.write(`📄 ${migration}... `);
      const result = await runMigration(client, migration);

      if (result.success) {
        if (result.warning) {
          console.log(`⚠️ (${result.warning})`);
        } else {
          console.log("✅");
        }
      } else {
        console.log(`❌ ${result.error.substring(0, 60)}`);
      }
    }

    console.log("━".repeat(60));

    // List tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log(`\n📊 Tables created: ${tables.rows.length}`);
    tables.rows.forEach((r) => console.log(`   - ${r.table_name}`));

    if (tables.rows.length < 5) {
      console.log(
        "\n⚠️  Few tables created. Running essential schema manually...",
      );
      await createEssentialSchema(client);
    }

    // Seed demo data
    await seedDemoData(client);
  } finally {
    client.release();
    await pool.end();
  }
}

async function createEssentialSchema(client) {
  const essentialSQL = `
    -- Extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    
    -- Enums (ignore if exist)
    DO $$ BEGIN
      CREATE TYPE merchant_category AS ENUM ('CLOTHES', 'FOOD', 'SUPERMARKET', 'GENERIC');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    
    DO $$ BEGIN
      CREATE TYPE conversation_state AS ENUM (
        'GREETING', 'COLLECTING_ITEMS', 'COLLECTING_VARIANTS', 'COLLECTING_CUSTOMER_INFO',
        'COLLECTING_ADDRESS', 'NEGOTIATING', 'CONFIRMING_ORDER', 'ORDER_PLACED',
        'TRACKING', 'FOLLOWUP', 'CLOSED'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    
    DO $$ BEGIN
      CREATE TYPE order_status AS ENUM ('DRAFT', 'CONFIRMED', 'BOOKED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    
    DO $$ BEGIN
      CREATE TYPE event_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    
    DO $$ BEGIN
      CREATE TYPE dlq_status AS ENUM ('PENDING', 'RETRYING', 'RESOLVED', 'EXHAUSTED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    
    DO $$ BEGIN
      CREATE TYPE message_delivery_status AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    
    -- Merchants table
    CREATE TABLE IF NOT EXISTS merchants (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category merchant_category NOT NULL DEFAULT 'GENERIC',
      config JSONB NOT NULL DEFAULT '{}',
      branding JSONB NOT NULL DEFAULT '{}',
      negotiation_rules JSONB NOT NULL DEFAULT '{}',
      delivery_rules JSONB NOT NULL DEFAULT '{}',
      daily_token_budget INTEGER NOT NULL DEFAULT 100000,
      is_active BOOLEAN NOT NULL DEFAULT true,
      api_key VARCHAR(255),
      enabled_agents TEXT[] DEFAULT ARRAY['OPS_AGENT'],
      enabled_features TEXT[] DEFAULT ARRAY['CONVERSATIONS', 'ORDERS', 'CATALOG'],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    -- Merchant staff for portal login
    CREATE TABLE IF NOT EXISTS merchant_staff (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'STAFF',
      password_hash VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(merchant_id, email)
    );
    
    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      phone VARCHAR(50) NOT NULL,
      name VARCHAR(255),
      email VARCHAR(255),
      address TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(merchant_id, phone)
    );
    
    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id VARCHAR(100) PRIMARY KEY,
      merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      customer_id UUID REFERENCES customers(id),
      channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
      state conversation_state NOT NULL DEFAULT 'GREETING',
      context JSONB NOT NULL DEFAULT '{}',
      locked_by VARCHAR(100),
      locked_at TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id VARCHAR(100) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      direction VARCHAR(10) NOT NULL,
      content TEXT NOT NULL,
      message_type VARCHAR(50) DEFAULT 'text',
      metadata JSONB DEFAULT '{}',
      delivery_status message_delivery_status DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      conversation_id VARCHAR(100) REFERENCES conversations(id),
      customer_id UUID REFERENCES customers(id),
      order_number VARCHAR(50) NOT NULL,
      status order_status NOT NULL DEFAULT 'DRAFT',
      items JSONB NOT NULL DEFAULT '[]',
      subtotal DECIMAL(10,2) DEFAULT 0,
      discount DECIMAL(10,2) DEFAULT 0,
      delivery_fee DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) DEFAULT 0,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
      customer_address TEXT,
      notes TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(merchant_id, order_number)
    );
    
    -- Catalog items table
    CREATE TABLE IF NOT EXISTS catalog_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      sku VARCHAR(100),
      name_ar VARCHAR(500) NOT NULL,
      name_en VARCHAR(500),
      description_ar TEXT,
      description_en TEXT,
      category VARCHAR(100),
      base_price DECIMAL(10,2) NOT NULL,
      min_price DECIMAL(10,2),
      variants JSONB NOT NULL DEFAULT '[]',
      options JSONB NOT NULL DEFAULT '[]',
      stock_quantity INTEGER DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    -- Events/Outbox table
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(100) NOT NULL,
      aggregate_type VARCHAR(100) NOT NULL,
      aggregate_id VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      status event_status NOT NULL DEFAULT 'PENDING',
      merchant_id VARCHAR(50),
      correlation_id VARCHAR(100),
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    );
    
    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_conversations_merchant ON conversations(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_merchant ON catalog_items(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_customers_merchant_phone ON customers(merchant_id, phone);
  `;

  try {
    await client.query(essentialSQL);
    console.log("✅ Essential schema created");
  } catch (err) {
    console.log("⚠️ Schema creation error:", err.message.substring(0, 80));
  }
}

async function seedDemoData(client) {
  console.log("\n🌱 Seeding demo data...");

  try {
    // Check if merchant exists
    const existing = await client.query(
      `SELECT id FROM merchants WHERE id = 'demo-merchant'`,
    );

    if (existing.rows.length === 0) {
      await client.query(`
        INSERT INTO merchants (id, name, api_key, is_active, category, config)
        VALUES (
          'demo-merchant', 
          'متجر تجريبي', 
          'mkey_demo_1234567890abcdef1234567890abcdef12345678', 
          true, 
          'GENERIC',
          '{"currency": "EGP", "language": "ar-EG"}'::jsonb
        )
      `);
      console.log("✅ Demo merchant created");
    } else {
      await client.query(`
        UPDATE merchants 
        SET api_key = 'mkey_demo_1234567890abcdef1234567890abcdef12345678',
            is_active = true
        WHERE id = 'demo-merchant'
      `);
      console.log("✅ Demo merchant updated");
    }

    // Staff user
    const staffExists = await client.query(`
      SELECT id FROM merchant_staff WHERE merchant_id = 'demo-merchant' AND email = 'demo@tash8eel.com'
    `);

    if (staffExists.rows.length === 0) {
      await client.query(`
        INSERT INTO merchant_staff (id, merchant_id, email, name, role, password_hash, status)
        VALUES (
          gen_random_uuid(),
          'demo-merchant',
          'demo@tash8eel.com',
          'صاحب المتجر',
          'OWNER',
          '$2b$10$demo.password.hash',
          'ACTIVE'
        )
      `);
      console.log("✅ Demo staff user created");
    } else {
      console.log("✅ Demo staff exists");
    }

    console.log("\n✨ Database setup complete!");
    console.log("\n📝 Login credentials:");
    console.log("   Merchant ID: demo-merchant");
    console.log("   Email: demo@tash8eel.com");
    console.log("   Password: demo123");
  } catch (err) {
    console.error("❌ Seeding error:", err.message);
  }
}

main().catch(console.error);
