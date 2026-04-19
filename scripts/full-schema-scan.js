/**
 * Full database schema scan - all tables and columns
 */
require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    // Get ALL tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log("=".repeat(80));
    console.log("FULL DATABASE SCHEMA SCAN");
    console.log("=".repeat(80));
    console.log("\nTotal tables:", tables.rows.length);
    console.log("\n");

    // For each table, get columns and row count
    for (const t of tables.rows) {
      const tableName = t.table_name;

      // Get columns
      const cols = await pool.query(
        `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `,
        [tableName],
      );

      // Get row count
      const count = await pool.query(
        `SELECT COUNT(*) as cnt FROM "${tableName}"`,
      );

      // Check if has merchant_id
      const hasMerchantId = cols.rows.some(
        (c) => c.column_name === "merchant_id",
      );

      // Get demo-merchant count if applicable
      let demoCount = "N/A";
      if (hasMerchantId) {
        try {
          const dc = await pool.query(
            `SELECT COUNT(*) as cnt FROM "${tableName}" WHERE merchant_id = 'demo-merchant'`,
          );
          demoCount = dc.rows[0].cnt;
        } catch (e) {
          demoCount = "error";
        }
      }

      console.log("─".repeat(80));
      console.log(`📋 ${tableName.toUpperCase()}`);
      console.log(
        `   Total rows: ${count.rows[0].cnt} | demo-merchant rows: ${demoCount}`,
      );
      console.log("   Columns:");

      for (const col of cols.rows) {
        const nullable = col.is_nullable === "YES" ? "?" : "";
        const def = col.column_default
          ? ` = ${col.column_default.substring(0, 30)}`
          : "";

        // Highlight important columns
        let marker = "  ";
        if (
          col.column_name.includes("subscription") ||
          col.column_name.includes("enabled") ||
          col.column_name.includes("active") ||
          col.column_name.includes("feature") ||
          col.column_name.includes("plan") ||
          col.column_name.includes("tier")
        ) {
          marker = "⭐";
        }

        console.log(
          `   ${marker} ${col.column_name}: ${col.data_type}${nullable}${def}`,
        );
      }
      console.log("");
    }

    // Special focus on subscription/feature related tables
    console.log("\n");
    console.log("=".repeat(80));
    console.log("SUBSCRIPTION/FEATURE RELATED ANALYSIS");
    console.log("=".repeat(80));

    // Check merchants table in detail
    console.log("\n📍 MERCHANTS TABLE DATA:");
    const merchants = await pool.query(`SELECT * FROM merchants LIMIT 5`);
    for (const m of merchants.rows) {
      console.log("\n   Merchant:", m.id);
      for (const [key, value] of Object.entries(m)) {
        if (value !== null && value !== undefined) {
          const val = typeof value === "object" ? JSON.stringify(value) : value;
          console.log(`     ${key}: ${val}`);
        }
      }
    }

    // Check merchant_agent_subscriptions
    console.log("\n📍 MERCHANT_AGENT_SUBSCRIPTIONS DATA:");
    const agentSubs = await pool.query(
      `SELECT * FROM merchant_agent_subscriptions`,
    );
    console.log("   Total:", agentSubs.rows.length);
    for (const s of agentSubs.rows) {
      console.log(
        `   - ${s.merchant_id}: ${s.agent_type} = ${s.is_enabled ? "ENABLED" : "disabled"}`,
      );
      if (s.config) console.log(`     config: ${JSON.stringify(s.config)}`);
    }

    // Look for any other subscription-related tables
    console.log(
      '\n📍 TABLES WITH "subscription" OR "feature" OR "plan" IN NAME OR COLUMNS:',
    );
    const subTables = await pool.query(`
      SELECT DISTINCT table_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND (
        table_name ILIKE '%subscription%' OR
        table_name ILIKE '%feature%' OR
        table_name ILIKE '%plan%' OR
        table_name ILIKE '%entitlement%' OR
        table_name ILIKE '%tier%' OR
        column_name ILIKE '%subscription%' OR
        column_name ILIKE '%feature%' OR
        column_name ILIKE '%plan%' OR
        column_name ILIKE '%entitlement%' OR
        column_name ILIKE '%tier%'
      )
      ORDER BY table_name
    `);

    for (const t of subTables.rows) {
      console.log(`\n   Table: ${t.table_name}`);
      const data = await pool.query(`SELECT * FROM "${t.table_name}" LIMIT 3`);
      if (data.rows.length > 0) {
        console.log(`   Sample data (${data.rows.length} rows):`);
        data.rows.forEach((r, i) => {
          console.log(`     [${i + 1}]`, JSON.stringify(r).substring(0, 200));
        });
      } else {
        console.log("   (empty)");
      }
    }

    // Check if there's any entitlements in code vs DB
    console.log("\n📍 CHECKING FOR ENTITLEMENTS PATTERN:");
    const entitlementTables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name ILIKE '%entitle%' OR table_name ILIKE '%permission%' OR table_name ILIKE '%access%')
    `);
    console.log(
      "   Entitlement-related tables:",
      entitlementTables.rows.map((r) => r.table_name).join(", ") ||
        "none found",
    );
  } catch (e) {
    console.error("Error:", e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main();
