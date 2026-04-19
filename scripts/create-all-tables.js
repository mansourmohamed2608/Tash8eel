#!/usr/bin/env node
/**
 * Comprehensive fix for all missing tables in Neon database
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

async function createAllMissingTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to Neon...\n");
    await client.connect();

    // All missing table creation statements
    const tables = [
      {
        name: "order_items",
        sql: `
          CREATE TABLE IF NOT EXISTS order_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id UUID NOT NULL,
            catalog_item_id UUID,
            variant_id UUID,
            name VARCHAR(255) NOT NULL,
            sku VARCHAR(100),
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_price DECIMAL(12,2) NOT NULL,
            total_price DECIMAL(12,2) NOT NULL,
            notes TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
        `,
      },
      {
        name: "merchant_token_usage",
        sql: `
          CREATE TABLE IF NOT EXISTS merchant_token_usage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            date DATE NOT NULL DEFAULT CURRENT_DATE,
            tokens_used INTEGER DEFAULT 0,
            requests_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, date)
          );
          CREATE INDEX IF NOT EXISTS idx_token_usage_merchant ON merchant_token_usage(merchant_id);
        `,
      },
      {
        name: "audit_logs",
        sql: `
          CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            staff_id UUID,
            action VARCHAR(100) NOT NULL,
            resource_type VARCHAR(100) NOT NULL,
            resource_id VARCHAR(255),
            old_values JSONB,
            new_values JSONB,
            ip_address VARCHAR(45),
            user_agent TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_logs(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
          CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
        `,
      },
      {
        name: "delivery_reports",
        sql: `
          CREATE TABLE IF NOT EXISTS delivery_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            order_id UUID,
            shipment_id UUID,
            report_type VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL,
            data JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_delivery_reports_merchant ON delivery_reports(merchant_id);
        `,
      },
      {
        name: "whatsapp_templates",
        sql: `
          CREATE TABLE IF NOT EXISTS whatsapp_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            language VARCHAR(10) DEFAULT 'ar',
            category VARCHAR(50) NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            components JSONB NOT NULL DEFAULT '[]',
            external_id VARCHAR(255),
            rejection_reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, name, language)
          );
          CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_merchant ON whatsapp_templates(merchant_id);
        `,
      },
      {
        name: "whatsapp_media",
        sql: `
          CREATE TABLE IF NOT EXISTS whatsapp_media (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            media_id VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL,
            mime_type VARCHAR(100),
            url TEXT,
            file_size INTEGER,
            sha256 VARCHAR(64),
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_whatsapp_media_merchant ON whatsapp_media(merchant_id);
        `,
      },
      {
        name: "merchant_agent_subscriptions",
        sql: `
          CREATE TABLE IF NOT EXISTS merchant_agent_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            agent_type VARCHAR(50) NOT NULL,
            is_enabled BOOLEAN DEFAULT true,
            config JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, agent_type)
          );
          CREATE INDEX IF NOT EXISTS idx_agent_subs_merchant ON merchant_agent_subscriptions(merchant_id);
        `,
      },
      {
        name: "merchant_settings",
        sql: `
          CREATE TABLE IF NOT EXISTS merchant_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL UNIQUE,
            timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
            currency VARCHAR(3) DEFAULT 'SAR',
            language VARCHAR(10) DEFAULT 'ar',
            business_hours JSONB DEFAULT '{}',
            notification_settings JSONB DEFAULT '{}',
            ai_settings JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `,
      },
      {
        name: "permission_templates",
        sql: `
          CREATE TABLE IF NOT EXISTS permission_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            permissions JSONB NOT NULL DEFAULT '{}',
            is_system BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `,
      },
      {
        name: "rate_limit_counters",
        sql: `
          CREATE TABLE IF NOT EXISTS rate_limit_counters (
            id VARCHAR(255) PRIMARY KEY,
            merchant_id VARCHAR(255),
            counter INTEGER DEFAULT 0,
            window_start TIMESTAMPTZ NOT NULL,
            window_end TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_counters(window_end);
        `,
      },
      {
        name: "rate_limit_violations",
        sql: `
          CREATE TABLE IF NOT EXISTS rate_limit_violations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255),
            endpoint VARCHAR(255) NOT NULL,
            ip_address VARCHAR(45),
            limit_type VARCHAR(50) NOT NULL,
            limit_value INTEGER NOT NULL,
            current_value INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_violations_merchant ON rate_limit_violations(merchant_id);
        `,
      },
      {
        name: "merchant_notifications",
        sql: `
          CREATE TABLE IF NOT EXISTS merchant_notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            staff_id UUID,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT,
            data JSONB DEFAULT '{}',
            is_read BOOLEAN DEFAULT false,
            read_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_merchant_notif_merchant ON merchant_notifications(merchant_id);
        `,
      },
      {
        name: "loyalty_programs",
        sql: `
          CREATE TABLE IF NOT EXISTS loyalty_programs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            points_per_currency DECIMAL(10,4) DEFAULT 1,
            currency_per_point DECIMAL(10,4) DEFAULT 0.01,
            min_redemption_points INTEGER DEFAULT 100,
            is_active BOOLEAN DEFAULT true,
            rules JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_loyalty_programs_merchant ON loyalty_programs(merchant_id);
        `,
      },
      {
        name: "customer_loyalty",
        sql: `
          CREATE TABLE IF NOT EXISTS customer_loyalty (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id UUID NOT NULL,
            merchant_id VARCHAR(255) NOT NULL,
            program_id UUID,
            points_balance INTEGER DEFAULT 0,
            lifetime_points INTEGER DEFAULT 0,
            tier VARCHAR(50) DEFAULT 'bronze',
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(customer_id, merchant_id)
          );
          CREATE INDEX IF NOT EXISTS idx_customer_loyalty_customer ON customer_loyalty(customer_id);
        `,
      },
      {
        name: "loyalty_transactions",
        sql: `
          CREATE TABLE IF NOT EXISTS loyalty_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_loyalty_id UUID NOT NULL,
            merchant_id VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL,
            points INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            reference_type VARCHAR(50),
            reference_id VARCHAR(255),
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_loyalty_trans_customer ON loyalty_transactions(customer_loyalty_id);
        `,
      },
      {
        name: "scheduled_notifications",
        sql: `
          CREATE TABLE IF NOT EXISTS scheduled_notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            template_id UUID,
            type VARCHAR(50) NOT NULL,
            target_type VARCHAR(50) NOT NULL,
            target_ids TEXT[],
            variables JSONB DEFAULT '{}',
            scheduled_at TIMESTAMPTZ NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            sent_at TIMESTAMPTZ,
            error TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_scheduled_notif_merchant ON scheduled_notifications(merchant_id);
        `,
      },
      {
        name: "notification_logs",
        sql: `
          CREATE TABLE IF NOT EXISTS notification_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            notification_id UUID,
            channel VARCHAR(50) NOT NULL,
            recipient VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            provider_response JSONB,
            error TEXT,
            sent_at TIMESTAMPTZ,
            delivered_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_notif_logs_merchant ON notification_logs(merchant_id);
        `,
      },
      {
        name: "payment_links",
        sql: `
          CREATE TABLE IF NOT EXISTS payment_links (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            order_id UUID,
            customer_id UUID,
            amount DECIMAL(12,2) NOT NULL,
            currency VARCHAR(3) DEFAULT 'SAR',
            status VARCHAR(50) DEFAULT 'pending',
            short_code VARCHAR(20) UNIQUE,
            expires_at TIMESTAMPTZ,
            paid_at TIMESTAMPTZ,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_payment_links_merchant ON payment_links(merchant_id);
          CREATE INDEX IF NOT EXISTS idx_payment_links_code ON payment_links(short_code);
        `,
      },
      {
        name: "payment_proofs",
        sql: `
          CREATE TABLE IF NOT EXISTS payment_proofs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            payment_link_id UUID,
            order_id UUID,
            customer_id UUID,
            image_url TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            review_notes TEXT,
            reviewed_by UUID,
            reviewed_at TIMESTAMPTZ,
            ocr_result JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_payment_proofs_merchant ON payment_proofs(merchant_id);
        `,
      },
      {
        name: "subscription_plans",
        sql: `
          CREATE TABLE IF NOT EXISTS subscription_plans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            name_ar VARCHAR(100),
            description TEXT,
            price_monthly DECIMAL(12,2) NOT NULL,
            price_yearly DECIMAL(12,2),
            currency VARCHAR(3) DEFAULT 'SAR',
            features JSONB DEFAULT '{}',
            limits JSONB DEFAULT '{}',
            is_active BOOLEAN DEFAULT true,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `,
      },
      {
        name: "merchant_subscriptions",
        sql: `
          CREATE TABLE IF NOT EXISTS merchant_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            plan_id UUID NOT NULL,
            status VARCHAR(50) DEFAULT 'active',
            billing_cycle VARCHAR(20) DEFAULT 'monthly',
            current_period_start TIMESTAMPTZ NOT NULL,
            current_period_end TIMESTAMPTZ NOT NULL,
            cancel_at_period_end BOOLEAN DEFAULT false,
            canceled_at TIMESTAMPTZ,
            trial_ends_at TIMESTAMPTZ,
            payment_method JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_merchant_subs_merchant ON merchant_subscriptions(merchant_id);
        `,
      },
      {
        name: "merchant_entitlements",
        sql: `
          CREATE TABLE IF NOT EXISTS merchant_entitlements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            feature_key VARCHAR(100) NOT NULL,
            is_enabled BOOLEAN DEFAULT true,
            limit_value INTEGER,
            used_value INTEGER DEFAULT 0,
            expires_at TIMESTAMPTZ,
            source VARCHAR(50) DEFAULT 'plan',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, feature_key)
          );
          CREATE INDEX IF NOT EXISTS idx_entitlements_merchant ON merchant_entitlements(merchant_id);
        `,
      },
      {
        name: "feature_usage",
        sql: `
          CREATE TABLE IF NOT EXISTS feature_usage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            feature_key VARCHAR(100) NOT NULL,
            usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
            usage_count INTEGER DEFAULT 0,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(merchant_id, feature_key, usage_date)
          );
          CREATE INDEX IF NOT EXISTS idx_feature_usage_merchant ON feature_usage(merchant_id);
        `,
      },
      {
        name: "billing_history",
        sql: `
          CREATE TABLE IF NOT EXISTS billing_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            subscription_id UUID,
            type VARCHAR(50) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            currency VARCHAR(3) DEFAULT 'SAR',
            status VARCHAR(50) DEFAULT 'pending',
            description TEXT,
            invoice_url TEXT,
            payment_method JSONB,
            paid_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_billing_merchant ON billing_history(merchant_id);
        `,
      },
      {
        name: "ocr_scans",
        sql: `
          CREATE TABLE IF NOT EXISTS ocr_scans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id VARCHAR(255) NOT NULL,
            image_url TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            scan_type VARCHAR(50) DEFAULT 'product_list',
            raw_text TEXT,
            structured_data JSONB,
            confidence_score DECIMAL(5,4),
            processed_at TIMESTAMPTZ,
            error TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_ocr_scans_merchant ON ocr_scans(merchant_id);
        `,
      },
      {
        name: "ocr_extracted_products",
        sql: `
          CREATE TABLE IF NOT EXISTS ocr_extracted_products (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            scan_id UUID NOT NULL,
            merchant_id VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            name_ar VARCHAR(255),
            price DECIMAL(12,2),
            sku VARCHAR(100),
            category VARCHAR(100),
            confidence DECIMAL(5,4),
            raw_data JSONB,
            status VARCHAR(50) DEFAULT 'pending',
            imported_item_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_ocr_products_scan ON ocr_extracted_products(scan_id);
        `,
      },
    ];

    console.log("Creating missing tables...\n");

    for (const table of tables) {
      try {
        // Check if exists
        const check = await client.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [table.name],
        );

        if (!check.rows[0].exists) {
          await client.query(table.sql);
          console.log(`  ✓ Created ${table.name}`);
        } else {
          console.log(`  - ${table.name} already exists`);
        }
      } catch (err) {
        console.error(`  ✗ Error creating ${table.name}:`, err.message);
      }
    }

    console.log("\n✅ All tables processed!");
  } finally {
    await client.end();
  }
}

createAllMissingTables().catch(console.error);
