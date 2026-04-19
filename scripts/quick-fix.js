#!/usr/bin/env node
/**
 * Quick fix for missing enum values and columns
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

async function quickFix() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to Neon\n");

    // Add QUEUED to message_delivery_status enum
    console.log("Fixing message_delivery_status enum...");
    try {
      await client.query(
        `ALTER TYPE message_delivery_status ADD VALUE IF NOT EXISTS 'QUEUED'`,
      );
      console.log("  ✓ Added QUEUED");
    } catch (e) {
      if (e.message.includes("already exists")) {
        console.log("  - QUEUED already exists");
      } else {
        console.log("  ! Error:", e.message);
      }
    }

    // Add missing merchant columns
    console.log("\nAdding missing merchant columns...");
    const merchantColumns = [
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
      { name: "payment_reminders_enabled", type: "BOOLEAN DEFAULT true" },
      { name: "auto_reply_enabled", type: "BOOLEAN DEFAULT true" },
      { name: "ai_enabled", type: "BOOLEAN DEFAULT true" },
      { name: "notification_email", type: "VARCHAR(255)" },
      { name: "notification_phone", type: "VARCHAR(50)" },
      { name: "notification_whatsapp", type: "BOOLEAN DEFAULT true" },
      { name: "notification_sms", type: "BOOLEAN DEFAULT false" },
      { name: "working_hours", type: "JSONB DEFAULT '{}'" },
      { name: "auto_close_conversations_hours", type: "INTEGER DEFAULT 24" },
    ];

    for (const col of merchantColumns) {
      try {
        await client.query(
          `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
        );
        console.log(`  ✓ Added ${col.name}`);
      } catch (e) {
        console.log(`  - ${col.name}: ${e.message}`);
      }
    }

    // Add missing inventory_items columns
    console.log("\nAdding missing inventory_items columns...");
    const inventoryColumns = [
      { name: "name", type: "VARCHAR(255)" },
      { name: "description", type: "TEXT" },
      { name: "category", type: "VARCHAR(100)" },
      { name: "price", type: "DECIMAL(12,2)" },
      { name: "image_url", type: "TEXT" },
    ];

    for (const col of inventoryColumns) {
      try {
        await client.query(
          `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
        );
        console.log(`  ✓ Added ${col.name}`);
      } catch (e) {
        console.log(`  - ${col.name}: ${e.message}`);
      }
    }

    console.log("\n✅ Quick fix completed!");
  } finally {
    await client.end();
  }
}

quickFix().catch(console.error);
