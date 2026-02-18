const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function checkPlanData() {
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

  console.log("=== Checking Plan Data ===\n");

  // Check billing_plans
  console.log("1. Billing Plans (agents column):");
  const plans = await c.query(
    `SELECT code, name, agents, features FROM billing_plans ORDER BY price_cents NULLS LAST`,
  );
  for (const p of plans.rows) {
    console.log(`   ${p.code}: agents=${JSON.stringify(p.agents)}`);
  }

  // Check demo-merchant subscription
  console.log("\n2. Demo Merchant Subscription:");
  const sub = await c.query(`
    SELECT ms.*, bp.code, bp.agents, bp.features 
    FROM merchant_subscriptions ms 
    JOIN billing_plans bp ON bp.id = ms.plan_id 
    WHERE ms.merchant_id = 'demo-merchant'
  `);
  if (sub.rows[0]) {
    console.log("   Plan:", sub.rows[0].code);
    console.log("   Agents:", JSON.stringify(sub.rows[0].agents));
    console.log("   Features:", JSON.stringify(sub.rows[0].features));
  } else {
    console.log("   ⚠️ No subscription found!");
  }

  // Check merchant direct
  console.log("\n3. Merchant Record:");
  const m = await c.query(
    `SELECT id, plan, enabled_agents FROM merchants WHERE id = 'demo-merchant'`,
  );
  if (m.rows[0]) {
    console.log("   Plan:", m.rows[0].plan);
    console.log("   Enabled Agents:", JSON.stringify(m.rows[0].enabled_agents));
  }

  // Check entitlements
  console.log("\n4. Entitlements Count:");
  const ent = await c.query(
    `SELECT COUNT(*) FROM merchant_entitlements WHERE merchant_id = 'demo-merchant'`,
  );
  console.log("   Count:", ent.rows[0].count);

  await c.end();
}

checkPlanData().catch(console.error);
