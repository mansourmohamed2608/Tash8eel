const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL not set. Create .env file or set environment variable.",
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    // Create the bulk_operations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bulk_operations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        staff_id UUID,
        operation_type VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        file_url VARCHAR(2048),
        result_url VARCHAR(2048),
        total_records INTEGER,
        processed_records INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        errors JSONB NOT NULL DEFAULT '[]',
        options JSONB NOT NULL DEFAULT '{}',
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("✅ bulk_operations table created");

    // Create indexes
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_bulk_ops_merchant ON bulk_operations(merchant_id)",
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_bulk_ops_status ON bulk_operations(status)",
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_bulk_ops_created ON bulk_operations(created_at)",
    );
    console.log("✅ Indexes created");

    console.log("✅ All done!");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
  }
}

run();
