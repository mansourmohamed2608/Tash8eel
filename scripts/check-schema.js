const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'conversations' 
      AND column_name IN ('collected_info', 'missing_slots')
    `);
    console.log("Found columns:");
    result.rows.forEach((r) => console.log("  ✓", r.column_name));

    if (result.rows.length === 0) {
      console.log("  ❌ No columns found - migration may have failed");
    }
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

check();
