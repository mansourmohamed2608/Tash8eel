"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
async function runMigrations() {
    console.log("🔄 Starting database migrations...\n");
    const client = await pool.connect();
    try {
        // Create migrations tracking table if not exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);
        // Get already executed migrations
        const { rows: executed } = await client.query("SELECT name FROM migrations");
        const executedNames = new Set(executed.map((r) => r.name));
        // Read SQL files from migrations directory
        const migrationsDir = path.join(__dirname, "../../migrations");
        if (!fs.existsSync(migrationsDir)) {
            console.log("📁 Migrations directory not found. Creating schema directly...\n");
            // Run inline schema creation
            await createSchema(client);
            return;
        }
        const files = fs
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .sort();
        if (files.length === 0) {
            console.log("📁 No migration files found. Creating schema directly...\n");
            await createSchema(client);
            return;
        }
        let migrationsRun = 0;
        for (const file of files) {
            if (executedNames.has(file)) {
                console.log(`⏭️  Skipping ${file} (already executed)`);
                continue;
            }
            console.log(`🔄 Running ${file}...`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
            await client.query("BEGIN");
            try {
                await client.query(sql);
                await client.query("INSERT INTO migrations (name) VALUES ($1)", [file]);
                await client.query("COMMIT");
                console.log(`✅ Completed ${file}`);
                migrationsRun++;
            }
            catch (err) {
                await client.query("ROLLBACK");
                throw err;
            }
        }
        console.log(`\n✅ Migrations complete! (${migrationsRun} executed)`);
    }
    finally {
        client.release();
        await pool.end();
    }
}
async function createSchema(client) {
    console.log("📋 Creating database schema...\n");
    const schema = `
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Merchants table
    CREATE TABLE IF NOT EXISTS merchants (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'generic',
      api_key VARCHAR(255) UNIQUE NOT NULL,
      webhook_url VARCHAR(500),
      is_active BOOLEAN DEFAULT true,
      city VARCHAR(100) DEFAULT 'cairo',
      currency VARCHAR(10) DEFAULT 'EGP',
      language VARCHAR(10) DEFAULT 'ar-EG',
      daily_token_budget INTEGER DEFAULT 100000,
      config JSONB DEFAULT '{}',
      branding JSONB DEFAULT '{}',
      negotiation_rules JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(255) PRIMARY KEY,
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      external_id VARCHAR(255),
      name VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      language VARCHAR(10) DEFAULT 'ar-EG',
      address JSONB DEFAULT '{}',
      preferences JSONB DEFAULT '{}',
      last_order_at TIMESTAMP,
      order_count INTEGER DEFAULT 0,
      total_spent DECIMAL(12,2) DEFAULT 0,
      vip_status BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(merchant_id, external_id)
    );

    -- Catalog items table
    CREATE TABLE IF NOT EXISTS catalog_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      external_id VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      name_ar VARCHAR(255),
      description TEXT,
      description_ar TEXT,
      price DECIMAL(12,2) NOT NULL,
      base_price DECIMAL(12,2),
      min_price DECIMAL(12,2),
      category VARCHAR(100),
      subcategory VARCHAR(100),
      tags TEXT[],
      variants JSONB DEFAULT '[]',
      images TEXT[],
      is_active BOOLEAN DEFAULT true,
      stock_quantity INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(merchant_id, external_id)
    );

    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id VARCHAR(255) PRIMARY KEY,
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      customer_id VARCHAR(255) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'open',
      channel VARCHAR(50) DEFAULT 'whatsapp',
      language VARCHAR(10) DEFAULT 'ar-EG',
      context JSONB DEFAULT '{}',
      cart JSONB DEFAULT '{"items": [], "total": 0}',
      collected_info JSONB DEFAULT '{}',
      summary TEXT,
      last_message_at TIMESTAMP DEFAULT NOW(),
      message_count INTEGER DEFAULT 0,
      escalated BOOLEAN DEFAULT false,
      escalation_reason TEXT,
      closed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      customer_id VARCHAR(255) REFERENCES customers(id),
      direction VARCHAR(10) NOT NULL,
      content TEXT NOT NULL,
      content_type VARCHAR(50) DEFAULT 'text',
      media_url TEXT,
      sender_type VARCHAR(20) DEFAULT 'customer',
      metadata JSONB DEFAULT '{}',
      tokens_used INTEGER DEFAULT 0,
      model_used VARCHAR(50),
      latency_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(255) PRIMARY KEY,
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      customer_id VARCHAR(255) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      conversation_id VARCHAR(255) REFERENCES conversations(id),
      status VARCHAR(50) DEFAULT 'pending',
      items JSONB NOT NULL DEFAULT '[]',
      subtotal DECIMAL(12,2) DEFAULT 0,
      discount DECIMAL(12,2) DEFAULT 0,
      delivery_fee DECIMAL(12,2) DEFAULT 0,
      total DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'EGP',
      payment_method VARCHAR(50) DEFAULT 'cod',
      payment_status VARCHAR(50) DEFAULT 'pending',
      shipping_address JSONB,
      notes TEXT,
      confirmed_at TIMESTAMP,
      shipped_at TIMESTAMP,
      delivered_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      cancellation_reason TEXT,
      external_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Shipments table
    CREATE TABLE IF NOT EXISTS shipments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      carrier VARCHAR(100),
      tracking_number VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      estimated_delivery TIMESTAMP,
      actual_delivery TIMESTAMP,
      tracking_url TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Outbox events table (for reliable event processing)
    CREATE TABLE IF NOT EXISTS outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(100) NOT NULL,
      aggregate_type VARCHAR(100) NOT NULL,
      aggregate_id VARCHAR(255) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      scheduled_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Known areas table (for address validation)
    CREATE TABLE IF NOT EXISTS known_areas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      city VARCHAR(100) NOT NULL,
      area_name_ar VARCHAR(255) NOT NULL,
      area_name_en VARCHAR(255),
      area_aliases TEXT[] DEFAULT '{}',
      is_serviceable BOOLEAN DEFAULT true,
      delivery_zone VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Token usage tracking
    CREATE TABLE IF NOT EXISTS token_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      request_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(merchant_id, date)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_customers_merchant ON customers(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_catalog_merchant ON catalog_items(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_name ON catalog_items(name);
    CREATE INDEX IF NOT EXISTS idx_conversations_merchant ON conversations(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events(status);
    CREATE INDEX IF NOT EXISTS idx_outbox_scheduled ON outbox_events(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_known_areas_city ON known_areas(city);
    CREATE INDEX IF NOT EXISTS idx_token_usage_merchant_date ON token_usage(merchant_id, date);

    -- Insert default Cairo areas
    INSERT INTO known_areas (city, area_name_ar, area_name_en, area_aliases, delivery_zone)
    VALUES 
      ('القاهرة', 'المعادي', 'Maadi', ARRAY['maadi', 'المعادى'], 'zone_a'),
      ('القاهرة', 'مدينة نصر', 'Nasr City', ARRAY['nasr city', 'مدينه نصر'], 'zone_a'),
      ('القاهرة', 'مصر الجديدة', 'Heliopolis', ARRAY['heliopolis', 'مصر الجديده'], 'zone_a'),
      ('القاهرة', 'التجمع الخامس', 'Fifth Settlement', ARRAY['fifth settlement', 'التجمع', '5th settlement'], 'zone_b'),
      ('القاهرة', 'الشيخ زايد', 'Sheikh Zayed', ARRAY['sheikh zayed', 'زايد'], 'zone_c'),
      ('القاهرة', 'المهندسين', 'Mohandessin', ARRAY['mohandessin', 'المهندسين'], 'zone_a'),
      ('القاهرة', 'الدقي', 'Dokki', ARRAY['dokki', 'الدقى'], 'zone_a'),
      ('القاهرة', 'وسط البلد', 'Downtown', ARRAY['downtown', 'وسط البلد'], 'zone_a')
    ON CONFLICT DO NOTHING;
  `;
    await client.query(schema);
    console.log("✅ Database schema created successfully!\n");
}
runMigrations()
    .then(() => {
    console.log("\n🎉 Database ready!");
    process.exit(0);
})
    .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
