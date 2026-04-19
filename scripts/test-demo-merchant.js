const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function testDemoMerchant() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "❌ DATABASE_URL not set. Create .env file or set environment variable.",
    );
    process.exit(1);
  }
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await c.connect();

  console.log("=== Demo Merchant Setup Test ===\n");

  // 1. Merchant record
  console.log("📦 Demo merchant:");
  const m = await c.query(
    `SELECT id, business_name, name, plan, enabled_agents FROM merchants WHERE id = 'demo-merchant-001'`,
  );
  if (m.rows.length > 0) {
    console.log("  ID:", m.rows[0].id);
    console.log("  Name:", m.rows[0].business_name || m.rows[0].name);
    console.log("  Plan:", m.rows[0].plan);
    console.log("  Enabled Agents:", m.rows[0].enabled_agents);
  } else {
    console.log("  ⚠️ NOT FOUND");
  }

  // 2. Entitlements
  console.log("\n📋 Entitlements:");
  const e = await c.query(
    `SELECT COUNT(*) as count FROM merchant_entitlements WHERE merchant_id = 'demo-merchant-001'`,
  );
  console.log("  Count:", e.rows[0].count);

  // 3. Subscription
  console.log("\n💳 Subscription:");
  const s = await c.query(`
    SELECT ms.status, bp.code, bp.features, bp.agents 
    FROM merchant_subscriptions ms 
    JOIN billing_plans bp ON bp.id = ms.plan_id 
    WHERE ms.merchant_id = 'demo-merchant-001'
  `);
  if (s.rows.length > 0) {
    console.log("  Status:", s.rows[0].status);
    console.log("  Plan Code:", s.rows[0].code);
    console.log("  Features:", JSON.stringify(s.rows[0].features));
    console.log("  Agents:", JSON.stringify(s.rows[0].agents));
  } else {
    console.log("  ⚠️ NOT FOUND");
  }

  // 4. Test API key
  console.log("\n🔑 API Key:");
  const k = await c.query(
    `SELECT api_key FROM merchants WHERE id = 'demo-merchant-001'`,
  );
  if (k.rows.length > 0 && k.rows[0].api_key) {
    console.log("  API Key:", k.rows[0].api_key.substring(0, 20) + "...");
  } else {
    console.log("  ⚠️ NO API KEY");
  }

  await c.end();
  console.log("\n✅ Test complete");
}

testDemoMerchant().catch(console.error);
