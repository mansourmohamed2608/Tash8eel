const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function fixBillingSchema() {
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
  console.log("Connected to Neon");

  // 1. Add plan column to merchants if missing
  console.log("\n📝 Checking merchants.plan column...");
  try {
    await client.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'STARTER'`,
    );
    console.log("  ✅ plan column ensured");
  } catch (e) {
    console.error("  ❌ Error:", e.message);
  }

  // 2. Add enabled_agents column
  console.log("📝 Checking merchants.enabled_agents column...");
  try {
    await client.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS enabled_agents TEXT[] DEFAULT ARRAY['OPS_AGENT']`,
    );
    console.log("  ✅ enabled_agents column ensured");
  } catch (e) {
    console.error("  ❌ Error:", e.message);
  }

  // 3. Ensure demo merchant has plan
  console.log("\n📝 Setting demo merchant plan...");
  try {
    await client.query(
      `UPDATE merchants SET plan = 'PRO', enabled_agents = ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'FINANCE_AGENT'] WHERE id = 'demo-merchant-001'`,
    );
    console.log("  ✅ demo merchant updated");
  } catch (e) {
    console.error("  ❌ Error:", e.message);
  }

  // 4. Create/update merchant_entitlements for demo merchant
  console.log("\n📝 Setting up merchant_entitlements for demo merchant...");
  try {
    // Check current schema
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'merchant_entitlements'`,
    );
    console.log("  Columns:", cols.rows.map((r) => r.column_name).join(", "));

    // Insert or update entitlement
    await client.query(`
      INSERT INTO merchant_entitlements (merchant_id, plan_tier, enabled_agents, enabled_features, token_budget, is_active)
      VALUES (
        'demo-merchant-001', 
        'PRO',
        ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'FINANCE_AGENT'],
        ARRAY['CONVERSATIONS', 'ORDERS', 'CATALOG', 'INVENTORY', 'PAYMENTS', 'VISION_OCR', 'VOICE_NOTES', 'REPORTS', 'WEBHOOKS', 'TEAM', 'NOTIFICATIONS', 'AUDIT_LOGS', 'KPI_DASHBOARD', 'API_ACCESS'],
        500000,
        true
      )
      ON CONFLICT (merchant_id) DO UPDATE SET
        plan_tier = EXCLUDED.plan_tier,
        enabled_agents = EXCLUDED.enabled_agents,
        enabled_features = EXCLUDED.enabled_features,
        token_budget = EXCLUDED.token_budget,
        is_active = EXCLUDED.is_active
    `);
    console.log("  ✅ merchant_entitlements set for demo-merchant-001");
  } catch (e) {
    console.error("  ❌ Error:", e.message);
  }

  // 5. Create subscription for demo merchant
  console.log("\n📝 Creating subscription for demo merchant...");
  try {
    // Get PRO plan id
    const planRes = await client.query(
      `SELECT id FROM billing_plans WHERE code = 'PRO'`,
    );
    if (planRes.rows.length > 0) {
      const planId = planRes.rows[0].id;
      await client.query(
        `
        INSERT INTO merchant_subscriptions (merchant_id, plan_id, status, provider, current_period_start, current_period_end)
        VALUES ('demo-merchant-001', $1, 'ACTIVE', 'manual', NOW(), NOW() + INTERVAL '365 days')
        ON CONFLICT (merchant_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          status = EXCLUDED.status,
          current_period_end = EXCLUDED.current_period_end
      `,
        [planId],
      );
      console.log("  ✅ subscription created for demo-merchant-001");
    } else {
      console.log("  ⚠️ PRO plan not found");
    }
  } catch (e) {
    console.error("  ❌ Error:", e.message);
  }

  // Verify
  console.log("\n📊 Verification:");
  try {
    const merchant = await client.query(
      `SELECT id, business_name, plan, enabled_agents FROM merchants WHERE id = 'demo-merchant-001'`,
    );
    console.log("  Merchant:", merchant.rows[0]);
  } catch (e) {
    console.log("  Error:", e.message);
  }

  try {
    const ent = await client.query(
      `SELECT merchant_id, plan_tier, enabled_agents FROM merchant_entitlements WHERE merchant_id = 'demo-merchant-001'`,
    );
    console.log("  Entitlement:", ent.rows[0]);
  } catch (e) {
    console.log("  Error:", e.message);
  }

  try {
    const sub = await client.query(
      `SELECT ms.status, bp.code FROM merchant_subscriptions ms JOIN billing_plans bp ON bp.id = ms.plan_id WHERE ms.merchant_id = 'demo-merchant-001'`,
    );
    console.log("  Subscription:", sub.rows[0]);
  } catch (e) {
    console.log("  Error:", e.message);
  }

  await client.end();
  console.log("\n✅ Done!");
}

fixBillingSchema().catch(console.error);
