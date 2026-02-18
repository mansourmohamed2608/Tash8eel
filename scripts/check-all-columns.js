#!/usr/bin/env node
/**
 * Check all columns in key tables
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "❌ DATABASE_URL not set. Create .env file or set environment variable.",
    );
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(`
      SELECT table_name, column_name, data_type, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('customers', 'conversations', 'orders', 'merchants', 'order_items', 'cart_items', 'messages')
      ORDER BY table_name, ordinal_position
    `);

    console.log("=== Current Schema ===\n");
    let currentTable = "";
    for (const row of result.rows) {
      if (row.table_name !== currentTable) {
        if (currentTable) console.log("");
        currentTable = row.table_name;
        console.log(`📋 ${row.table_name.toUpperCase()}`);
        console.log("-".repeat(40));
      }
      console.log(
        `  ${row.column_name} (${row.data_type})${row.is_nullable === "YES" ? " NULL" : " NOT NULL"}`,
      );
    }
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

main();
