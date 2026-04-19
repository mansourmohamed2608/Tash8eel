#!/usr/bin/env node
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

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to database");

  // Check notifications table columns
  const cols = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notifications' ORDER BY ordinal_position",
  );
  console.log("\nNotifications table columns:");
  cols.rows.forEach((r) => console.log(`  - ${r.column_name}: ${r.data_type}`));

  // Expected columns from the service
  const expectedCols = [
    { name: "id", type: "UUID DEFAULT gen_random_uuid() PRIMARY KEY" },
    { name: "merchant_id", type: "VARCHAR(255) NOT NULL" },
    { name: "staff_id", type: "VARCHAR(255)" },
    { name: "type", type: "VARCHAR(50) NOT NULL" },
    { name: "title", type: "VARCHAR(255) NOT NULL" },
    { name: "title_ar", type: "VARCHAR(255) NOT NULL" },
    { name: "message", type: "TEXT NOT NULL" },
    { name: "message_ar", type: "TEXT NOT NULL" },
    { name: "data", type: "JSONB DEFAULT '{}'" },
    { name: "priority", type: "VARCHAR(20) DEFAULT 'MEDIUM'" },
    { name: "channels", type: "TEXT[] DEFAULT '{IN_APP}'" },
    { name: "is_read", type: "BOOLEAN DEFAULT false" },
    { name: "read_at", type: "TIMESTAMPTZ" },
    { name: "action_url", type: "VARCHAR(500)" },
    { name: "expires_at", type: "TIMESTAMPTZ" },
    { name: "created_at", type: "TIMESTAMPTZ DEFAULT NOW()" },
  ];

  const existingCols = cols.rows.map((r) => r.column_name);

  console.log("\nAdding missing columns to notifications...");
  for (const col of expectedCols) {
    if (!existingCols.includes(col.name)) {
      try {
        // Skip PRIMARY KEY for existing tables
        let colType = col.type.replace(" PRIMARY KEY", "");
        await client.query(
          `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ${col.name} ${colType}`,
        );
        console.log(`  ✓ Added ${col.name}`);
      } catch (e) {
        console.log(`  ✗ ${col.name}: ${e.message}`);
      }
    } else {
      console.log(`  - ${col.name} exists`);
    }
  }

  // Also create early_access_waitlist table for the roadmap feature
  console.log("\nCreating early_access_waitlist table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS early_access_waitlist (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      merchant_id VARCHAR(255) NOT NULL,
      feature_key VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      status VARCHAR(20) DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(merchant_id, feature_key)
    )
  `);
  console.log("  ✓ early_access_waitlist table ready");

  await client.end();
  console.log("\n✅ Done!");
}

main().catch(console.error);
