#!/usr/bin/env node
/**
 * Fix missing tables in Neon database
 * This script creates tables that may have been missed during migration
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

async function fixTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to Neon...");
    await client.connect();
    console.log("Connected!\n");

    // Create missing ENUM types first (if they don't exist)
    const enumStatements = [
      `DO $$ BEGIN CREATE TYPE event_status AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'RETRYING'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN CREATE TYPE dlq_status AS ENUM ('PENDING', 'RETRYING', 'RESOLVED', 'DEAD'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN CREATE TYPE webhook_status AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED', 'FAILING'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN CREATE TYPE webhook_delivery_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    ];

    console.log("Creating missing ENUM types...");
    for (const stmt of enumStatements) {
      try {
        await client.query(stmt);
        console.log("  ✓ ENUM check completed");
      } catch (err) {
        console.log("  - ENUM already exists or error:", err.message);
      }
    }

    // Check and create missing tables
    const tables = [
      {
        name: "shipments",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'shipments')`,
        create: `
          CREATE TABLE IF NOT EXISTS shipments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id UUID NOT NULL,
            merchant_id VARCHAR(50) NOT NULL,
            tracking_id VARCHAR(100),
            courier VARCHAR(100),
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            status_history JSONB NOT NULL DEFAULT '[]',
            estimated_delivery TIMESTAMPTZ,
            actual_delivery TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(order_id)
          );
          CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_id);
          CREATE INDEX IF NOT EXISTS idx_shipments_merchant ON shipments(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
        `,
      },
      {
        name: "outbox_events",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'outbox_events')`,
        create: `
          CREATE TABLE IF NOT EXISTS outbox_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            event_type VARCHAR(100) NOT NULL,
            aggregate_type VARCHAR(100) NOT NULL,
            aggregate_id VARCHAR(255) NOT NULL,
            merchant_id VARCHAR(50),
            payload JSONB NOT NULL,
            correlation_id VARCHAR(100),
            status event_status NOT NULL DEFAULT 'PENDING',
            processed_at TIMESTAMPTZ,
            error TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events(status) WHERE status = 'PENDING';
          CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox_events(created_at);
          CREATE INDEX IF NOT EXISTS idx_outbox_correlation ON outbox_events(correlation_id);
          CREATE INDEX IF NOT EXISTS idx_outbox_merchant ON outbox_events(merchant_id);
        `,
      },
      {
        name: "dlq_events",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dlq_events')`,
        create: `
          CREATE TABLE IF NOT EXISTS dlq_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            original_event_id UUID,
            event_type VARCHAR(100) NOT NULL,
            payload JSONB NOT NULL,
            error TEXT NOT NULL,
            stack TEXT,
            correlation_id VARCHAR(100),
            merchant_id VARCHAR(50),
            status dlq_status NOT NULL DEFAULT 'PENDING',
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 5,
            next_retry_at TIMESTAMPTZ,
            resolved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_dlq_status ON dlq_events(status);
          CREATE INDEX IF NOT EXISTS idx_dlq_next_retry ON dlq_events(next_retry_at) WHERE status IN ('PENDING', 'RETRYING');
        `,
      },
      {
        name: "webhooks",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'webhooks')`,
        create: `
          CREATE TABLE IF NOT EXISTS webhooks (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            merchant_id VARCHAR(50) NOT NULL,
            name VARCHAR(100) NOT NULL,
            url VARCHAR(2048) NOT NULL,
            secret VARCHAR(255) NOT NULL,
            events TEXT[] NOT NULL DEFAULT '{}',
            headers JSONB NOT NULL DEFAULT '{}',
            status webhook_status NOT NULL DEFAULT 'ACTIVE',
            retry_count INTEGER NOT NULL DEFAULT 3,
            timeout_ms INTEGER NOT NULL DEFAULT 10000,
            consecutive_failures INTEGER NOT NULL DEFAULT 0,
            last_triggered_at TIMESTAMPTZ,
            last_success_at TIMESTAMPTZ,
            last_failure_at TIMESTAMPTZ,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_webhooks_merchant ON webhooks(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);
          CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING gin(events);
        `,
      },
      {
        name: "webhook_deliveries",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'webhook_deliveries')`,
        create: `
          CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            webhook_id UUID NOT NULL,
            merchant_id VARCHAR(50) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            payload JSONB NOT NULL,
            status webhook_delivery_status NOT NULL DEFAULT 'PENDING',
            attempt_count INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            response_status INTEGER,
            response_body TEXT,
            response_time_ms INTEGER,
            error TEXT,
            next_retry_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
          CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
          CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'RETRYING';
          CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_merchant ON webhook_deliveries(merchant_id, created_at DESC);
        `,
      },
      {
        name: "orchestrator_tasks",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'orchestrator_tasks')`,
        create: `
          CREATE TABLE IF NOT EXISTS orchestrator_tasks (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            task_type VARCHAR(100) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}',
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            priority INTEGER NOT NULL DEFAULT 0,
            merchant_id VARCHAR(50),
            correlation_id VARCHAR(100),
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            scheduled_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            error TEXT,
            result JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_orch_tasks_status ON orchestrator_tasks(status);
          CREATE INDEX IF NOT EXISTS idx_orch_tasks_merchant ON orchestrator_tasks(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_orch_tasks_scheduled ON orchestrator_tasks(scheduled_at) WHERE status = 'pending';
        `,
      },
      {
        name: "merchant_reports",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'merchant_reports')`,
        create: `
          CREATE TABLE IF NOT EXISTS merchant_reports (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            merchant_id VARCHAR(50) NOT NULL,
            report_date DATE NOT NULL,
            summary JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(merchant_id, report_date)
          );
          CREATE INDEX IF NOT EXISTS idx_reports_merchant_date ON merchant_reports(merchant_id, report_date);
        `,
      },
      {
        name: "inventory_items",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inventory_items')`,
        create: `
          CREATE TABLE IF NOT EXISTS inventory_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            catalog_item_id UUID,
            name VARCHAR(255),
            sku VARCHAR(100) NOT NULL,
            barcode VARCHAR(100),
            track_inventory BOOLEAN DEFAULT true,
            allow_backorder BOOLEAN DEFAULT false,
            low_stock_threshold INTEGER DEFAULT 5,
            reorder_point INTEGER DEFAULT 10,
            reorder_quantity INTEGER DEFAULT 20,
            location VARCHAR(255),
            weight_grams INTEGER,
            dimensions JSONB DEFAULT '{}',
            cost_price DECIMAL(12,2),
            price DECIMAL(12,2),
            category VARCHAR(255),
            supplier_id VARCHAR(255),
            supplier_sku VARCHAR(100),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, sku)
          );
          CREATE INDEX IF NOT EXISTS idx_inventory_items_merchant ON inventory_items(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
        `,
      },
      {
        name: "inventory_variants",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inventory_variants')`,
        create: `
          CREATE TABLE IF NOT EXISTS inventory_variants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inventory_item_id UUID,
            merchant_id VARCHAR(255) NOT NULL,
            sku VARCHAR(100) NOT NULL,
            barcode VARCHAR(100),
            name VARCHAR(255) NOT NULL,
            attributes JSONB DEFAULT '{}',
            quantity_on_hand INTEGER DEFAULT 0,
            quantity_reserved INTEGER DEFAULT 0,
            low_stock_threshold INTEGER,
            cost_price DECIMAL(12,2),
            price_modifier DECIMAL(12,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, sku)
          );
          CREATE INDEX IF NOT EXISTS idx_inventory_variants_merchant ON inventory_variants(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_inventory_variants_item ON inventory_variants(inventory_item_id);
        `,
      },
      {
        name: "stock_movements",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stock_movements')`,
        create: `
          CREATE TABLE IF NOT EXISTS stock_movements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            variant_id UUID,
            movement_type VARCHAR(50) NOT NULL,
            quantity INTEGER NOT NULL,
            quantity_before INTEGER,
            quantity_after INTEGER,
            reference_type VARCHAR(50),
            reference_id VARCHAR(255),
            reason TEXT,
            notes TEXT,
            metadata JSONB DEFAULT '{}',
            created_by VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_stock_movements_merchant ON stock_movements(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
        `,
      },
      {
        name: "inventory_alerts",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inventory_alerts')`,
        create: `
          CREATE TABLE IF NOT EXISTS inventory_alerts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            variant_id UUID,
            alert_type VARCHAR(50) NOT NULL,
            status VARCHAR(50) DEFAULT 'active',
            severity VARCHAR(20) DEFAULT 'warning',
            message TEXT NOT NULL,
            quantity_at_alert INTEGER,
            threshold INTEGER,
            acknowledged_at TIMESTAMPTZ,
            acknowledged_by VARCHAR(255),
            resolved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_inventory_alerts_merchant ON inventory_alerts(merchant_id);
        `,
      },
      {
        name: "stock_reservations",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stock_reservations')`,
        create: `
          CREATE TABLE IF NOT EXISTS stock_reservations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            variant_id UUID,
            order_id UUID,
            conversation_id VARCHAR(255),
            quantity INTEGER NOT NULL,
            status VARCHAR(50) DEFAULT 'active',
            expires_at TIMESTAMPTZ NOT NULL,
            confirmed_at TIMESTAMPTZ,
            released_at TIMESTAMPTZ,
            release_reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_stock_reservations_merchant ON stock_reservations(merchant_id);
        `,
      },
      {
        name: "warehouse_locations",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'warehouse_locations')`,
        create: `
          CREATE TABLE IF NOT EXISTS warehouse_locations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            name_ar VARCHAR(255),
            address TEXT,
            city VARCHAR(100),
            is_default BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, name)
          );
          CREATE INDEX IF NOT EXISTS idx_warehouse_locations_merchant ON warehouse_locations(merchant_id);
        `,
      },
      {
        name: "inventory_stock_by_location",
        check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inventory_stock_by_location')`,
        create: `
          CREATE TABLE IF NOT EXISTS inventory_stock_by_location (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            variant_id UUID NOT NULL,
            location_id UUID NOT NULL,
            quantity_on_hand INTEGER DEFAULT 0,
            quantity_reserved INTEGER DEFAULT 0,
            quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
            bin_location VARCHAR(100),
            last_counted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, variant_id, location_id)
          );
          CREATE INDEX IF NOT EXISTS idx_stock_by_location_merchant ON inventory_stock_by_location(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_stock_by_location_variant ON inventory_stock_by_location(variant_id);
          CREATE INDEX IF NOT EXISTS idx_stock_by_location_location ON inventory_stock_by_location(location_id);
        `,
      },
    ];

    console.log("\nChecking and creating missing tables...\n");

    for (const table of tables) {
      try {
        const result = await client.query(table.check);
        const exists = result.rows[0].exists;

        if (!exists) {
          console.log(`Creating table: ${table.name}...`);
          await client.query(table.create);
          console.log(`  ✓ Created ${table.name}`);
        } else {
          console.log(`  ✓ Table ${table.name} already exists`);
        }
      } catch (err) {
        console.error(`  ✗ Error with ${table.name}:`, err.message);
      }
    }

    // Add missing columns to existing tables
    console.log("\nChecking for missing columns...\n");

    const columnFixes = [
      // Messages table columns
      {
        table: "messages",
        column: "merchant_id",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'merchant_id')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(50)`,
      },
      {
        table: "messages",
        column: "text",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'text')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS text TEXT`,
      },
      {
        table: "messages",
        column: "sender_id",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'sender_id')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id VARCHAR(255)`,
      },
      {
        table: "messages",
        column: "direction",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'direction')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'inbound'`,
      },
      {
        table: "messages",
        column: "provider_message_id",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'provider_message_id')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255)`,
      },
      {
        table: "messages",
        column: "attachments",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'attachments')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'`,
      },
      {
        table: "messages",
        column: "metadata",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'metadata')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
      },
      // Merchants table - knowledge_base column for AI
      {
        table: "merchants",
        column: "knowledge_base",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'knowledge_base')`,
        add: `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS knowledge_base JSONB DEFAULT '{}'`,
      },
      {
        table: "messages",
        column: "delivery_status",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'delivery_status')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'PENDING'`,
      },
      {
        table: "messages",
        column: "delivery_status_updated_at",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'delivery_status_updated_at')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status_updated_at TIMESTAMPTZ`,
      },
      {
        table: "messages",
        column: "llm_used",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'llm_used')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_used BOOLEAN DEFAULT false`,
      },
      {
        table: "messages",
        column: "tokens_used",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'tokens_used')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0`,
      },
      {
        table: "messages",
        column: "retry_count",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'retry_count')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`,
      },
      {
        table: "messages",
        column: "max_retries",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'max_retries')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3`,
      },
      {
        table: "messages",
        column: "next_retry_at",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'next_retry_at')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ`,
      },
      {
        table: "messages",
        column: "conversation_id",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'conversation_id')`,
        add: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(100)`,
      },
      // Conversations table columns
      {
        table: "conversations",
        column: "cart",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'cart')`,
        add: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cart JSONB DEFAULT '[]'`,
      },
      {
        table: "conversations",
        column: "sender_id",
        check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'sender_id')`,
        add: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_id VARCHAR(100)`,
      },
    ];

    for (const fix of columnFixes) {
      try {
        const result = await client.query(fix.check);
        const exists = result.rows[0].exists;

        if (!exists) {
          console.log(`Adding column ${fix.column} to ${fix.table}...`);
          await client.query(fix.add);
          console.log(`  ✓ Added ${fix.column} to ${fix.table}`);
        } else {
          console.log(`  ✓ Column ${fix.table}.${fix.column} already exists`);
        }
      } catch (err) {
        console.error(`  ✗ Error adding column ${fix.column}:`, err.message);
      }
    }

    // Create update trigger function if not exists
    console.log("\nCreating update trigger function...");
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);
      console.log("  ✓ Trigger function created");
    } catch (err) {
      console.log("  - Trigger function error:", err.message);
    }

    console.log("\n✅ Database fix completed!");
  } catch (error) {
    console.error("Fatal error:", error);
  } finally {
    await client.end();
    console.log("\nConnection closed.");
  }
}

fixTables();
