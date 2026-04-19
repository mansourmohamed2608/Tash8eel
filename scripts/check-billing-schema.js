const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function checkSchema() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "❌ DATABASE_URL not set. Create .env file or set environment variable.",
    );
    process.exit(1);
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  // Check billing tables
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE '%billing%' 
         OR table_name LIKE '%entitlement%' 
         OR table_name LIKE '%subscription%'
         OR table_name LIKE '%plan%')
    ORDER BY table_name
  `);
  console.log("\n📋 Billing/Entitlement Tables:");
  tables.rows.forEach((r) => console.log("  -", r.table_name));

  // Check billing_plans data
  try {
    const plans = await client.query(
      "SELECT code, name, price_cents, is_active FROM billing_plans ORDER BY price_cents NULLS LAST",
    );
    console.log("\n💰 Billing Plans:");
    plans.rows.forEach((r) =>
      console.log(
        `  - ${r.code}: ${r.name} (${r.price_cents} cents, active: ${r.is_active})`,
      ),
    );
  } catch (e) {
    console.log("\n⚠️ billing_plans table missing or error:", e.message);
  }

  // Check merchant_subscriptions
  try {
    const subs = await client.query(
      "SELECT COUNT(*) as count FROM merchant_subscriptions",
    );
    console.log("\n📊 Merchant Subscriptions:", subs.rows[0].count, "records");
  } catch (e) {
    console.log(
      "\n⚠️ merchant_subscriptions table missing or error:",
      e.message,
    );
  }

  // Check merchant_entitlements
  try {
    const ents = await client.query(
      "SELECT COUNT(*) as count FROM merchant_entitlements",
    );
    console.log("📊 Merchant Entitlements:", ents.rows[0].count, "records");
  } catch (e) {
    console.log("⚠️ merchant_entitlements table missing or error:", e.message);
  }

  // Check demo merchant
  try {
    const demo = await client.query(
      `SELECT id, business_name, plan FROM merchants WHERE id = 'demo-merchant-001'`,
    );
    if (demo.rows.length > 0) {
      console.log(
        "\n🏪 Demo Merchant:",
        demo.rows[0].business_name,
        "- Plan:",
        demo.rows[0].plan,
      );
    }
  } catch (e) {
    console.log("\n⚠️ Error checking demo merchant:", e.message);
  }

  await client.end();
}

checkSchema().catch(console.error);
