require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    // Check all inventory-related tables
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%inventory%' OR table_name LIKE '%agent%')
      ORDER BY table_name
    `);
    console.log("Agent/Inventory related tables:");
    tables.rows.forEach((t) => console.log("  -", t.table_name));

    // Check what exists in each
    for (const t of tables.rows) {
      const count = await pool.query(
        `SELECT COUNT(*) as cnt FROM ${t.table_name}`,
      );
      const merchantCount = await pool
        .query(
          `
        SELECT COUNT(*) as cnt FROM ${t.table_name} 
        WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '${t.table_name}' AND column_name = 'merchant_id')
        AND merchant_id = 'demo-merchant'
      `,
        )
        .catch(() => ({ rows: [{ cnt: "N/A" }] }));
      console.log(
        `    ${t.table_name}: total=${count.rows[0].cnt}, demo-merchant=${merchantCount.rows[0].cnt}`,
      );
    }
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main();
