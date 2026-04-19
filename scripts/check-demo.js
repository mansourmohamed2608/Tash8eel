#!/usr/bin/env node
// Quick demo-readiness check script
const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const mode = process.argv[2]; // 'tables', 'columns', or default

  try {
    console.log("Connecting to database...");

    if (mode === "tables") {
      const tables = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
      );
      console.log("=== ALL TABLES ===");
      tables.rows.forEach((r) => console.log(r.table_name));
      await pool.end();
      return;
    }

    if (mode === "columns") {
      const tbl = process.argv[3] || "merchants";
      const cols = await pool.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
        [tbl],
      );
      console.log(`=== ${tbl.toUpperCase()} COLUMNS ===`);
      cols.rows.forEach((c) =>
        console.log(
          `  ${c.column_name} (${c.data_type}, nullable: ${c.is_nullable})`,
        ),
      );
      await pool.end();
      return;
    }

    if (mode === "merchant") {
      const m = await pool.query(
        "SELECT * FROM merchants WHERE id = 'demo-merchant'",
      );
      if (m.rows.length > 0) console.log(JSON.stringify(m.rows[0], null, 2));
      else console.log("NOT FOUND");
      await pool.end();
      return;
    }

    // Default: full check
    // 1. Check merchant
    const merchant = await pool.query(
      "SELECT id, name, plan, is_active FROM merchants WHERE id = 'demo-merchant'",
    );
    if (merchant.rows.length === 0) {
      console.log("BLOCKER: demo-merchant does NOT exist in the database!");
    } else {
      const m = merchant.rows[0];
      console.log(
        `Merchant: ${m.name} | Plan: ${m.plan} | Active: ${m.is_active}`,
      );
    }

    // 2. Check orders
    const orders = await pool.query(
      "SELECT COUNT(*) as cnt FROM orders WHERE merchant_id = 'demo-merchant'",
    );
    console.log(`Orders: ${orders.rows[0].cnt}`);

    // 3. Check customers
    const customers = await pool.query(
      "SELECT COUNT(*) as cnt FROM customers WHERE merchant_id = 'demo-merchant'",
    );
    console.log(`Customers: ${customers.rows[0].cnt}`);

    // 4. Check conversations
    const convos = await pool.query(
      "SELECT COUNT(*) as cnt FROM conversations WHERE merchant_id = 'demo-merchant'",
    );
    console.log(`Conversations: ${convos.rows[0].cnt}`);

    // 5. Check catalog
    const catalog = await pool.query(
      "SELECT COUNT(*) as cnt FROM catalog_items WHERE merchant_id = 'demo-merchant'",
    );
    console.log(`Catalog items: ${catalog.rows[0].cnt}`);

    // 6. Check staff
    try {
      const staff = await pool.query(
        "SELECT id, email, role FROM staff_members WHERE merchant_id = 'demo-merchant'",
      );
      console.log(`Staff: ${staff.rows.length} members`);
      staff.rows.forEach((s) => console.log(`  ${s.email} (${s.role})`));
    } catch (e) {
      console.log("staff_members: table missing");
    }

    // 7. Check agent subscriptions
    try {
      const agents = await pool.query(
        "SELECT agent_type, is_active FROM agent_subscriptions WHERE merchant_id = 'demo-merchant'",
      );
      console.log(`Agents: ${agents.rows.length}`);
      agents.rows.forEach((a) =>
        console.log(`  ${a.agent_type} (active: ${a.is_active})`),
      );
    } catch (e) {
      console.log("agent_subscriptions: table missing");
    }

    // 8. Check entitlements
    try {
      const ent = await pool.query(
        "SELECT feature, enabled FROM merchant_entitlements WHERE merchant_id = 'demo-merchant'",
      );
      console.log(`Entitlements: ${ent.rows.length} features`);
    } catch (e) {
      console.log("merchant_entitlements: table missing");
    }

    // 9. Check messages
    try {
      const msgs = await pool.query(
        "SELECT COUNT(*) as cnt FROM messages WHERE merchant_id = 'demo-merchant'",
      );
      console.log(`Messages: ${msgs.rows[0].cnt}`);
    } catch (e) {
      console.log("messages: table missing");
    }

    // 10. Check token budgets
    try {
      const tkn = await pool.query(
        "SELECT * FROM token_usage WHERE merchant_id = 'demo-merchant'",
      );
      console.log(`Token usage records: ${tkn.rows.length}`);
    } catch (e) {
      console.log("token_usage: table missing or empty");
    }

    console.log("\nSummary:");
    if (
      merchant.rows.length > 0 &&
      parseInt(orders.rows[0].cnt) > 0 &&
      parseInt(convos.rows[0].cnt) > 0
    ) {
      console.log("Database looks ready for demo!");
    } else {
      console.log("Database needs seed data.");
    }
  } catch (err) {
    console.error("Database connection failed:", err.message);
  } finally {
    await pool.end();
  }
}

check();
