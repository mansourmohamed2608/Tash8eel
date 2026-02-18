require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");
const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await p.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'STARTER'`,
    );
    console.log("1/6 plan column added");

    await p.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan_limits JSONB DEFAULT '{}'`,
    );
    console.log("2/6 plan_limits column added");

    await p.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS custom_price INTEGER`,
    );
    console.log("3/6 custom_price column added");

    await p.query(`
      CREATE TABLE IF NOT EXISTS delivery_drivers (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        whatsapp_number VARCHAR(50),
        status VARCHAR(20) DEFAULT 'ACTIVE',
        vehicle_type VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("4/6 delivery_drivers table created");

    await p.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_driver_id UUID`,
    );
    await p.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_collected BOOLEAN DEFAULT FALSE`,
    );
    await p.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_collected_at TIMESTAMPTZ`,
    );
    await p.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_collected_amount NUMERIC(12,2)`,
    );
    console.log("5/6 orders driver/COD columns added");

    await p.query(`
      CREATE TABLE IF NOT EXISTS pos_integrations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'INACTIVE',
        config JSONB DEFAULT '{}',
        credentials JSONB DEFAULT '{}',
        last_sync_at TIMESTAMPTZ,
        sync_interval_minutes INTEGER DEFAULT 15,
        field_mapping JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(merchant_id, provider)
      )
    `);
    console.log("6/6 pos_integrations table created");

    await p.query(
      `ALTER TABLE staff ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL`,
    );
    console.log("BONUS: staff custom_permissions column added");

    console.log("\n✅ All migrations applied successfully!");
  } catch (err) {
    console.error("Migration error:", err.message);
  } finally {
    await p.end();
  }
}

run();
