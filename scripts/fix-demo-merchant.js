const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function fixDemoMerchant() {
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

  console.log("=== Fixing Demo Merchant Setup ===\n");

  const merchantId = "demo-merchant";

  // 1. Update merchant plan and agents
  console.log("📝 Updating merchant...");
  await c.query(
    `
    UPDATE merchants 
    SET plan = 'PRO', 
        enabled_agents = ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'FINANCE_AGENT']
    WHERE id = $1
  `,
    [merchantId],
  );
  console.log("  ✅ Merchant updated");

  // 2. Clear old entitlements and add new ones
  console.log("\n📝 Setting up entitlements...");
  await c.query(
    `DELETE FROM merchant_entitlements WHERE merchant_id = 'demo-merchant-001'`,
  );

  const features = [
    "conversations",
    "orders",
    "catalog",
    "inventory",
    "payments",
    "vision_ocr",
    "voice_notes",
    "reports",
    "webhooks",
    "team",
    "notifications",
    "audit_logs",
    "kpi_dashboard",
    "api_access",
    "payment_proofs",
    "analytics",
    "product_vision",
    "delivery_agent",
    "custom_agents",
    "integrations",
    "team_management",
    "advanced_reports",
    "knowledge_base",
    "roadmap_access",
  ];

  for (const feature of features) {
    const exists = await c.query(
      `SELECT 1 FROM merchant_entitlements WHERE merchant_id = $1 AND feature_key = $2`,
      [merchantId, feature],
    );
    if (exists.rows.length === 0) {
      await c.query(
        `
        INSERT INTO merchant_entitlements (merchant_id, feature_key, is_enabled, source)
        VALUES ($1, $2, true, 'PRO_PLAN')
      `,
        [merchantId, feature],
      );
    } else {
      await c.query(
        `
        UPDATE merchant_entitlements SET is_enabled = true, source = 'PRO_PLAN' 
        WHERE merchant_id = $1 AND feature_key = $2
      `,
        [merchantId, feature],
      );
    }
  }
  console.log("  ✅ Entitlements configured");

  // 3. Fix subscription
  console.log("\n📝 Setting up subscription...");
  await c.query(
    `DELETE FROM merchant_subscriptions WHERE merchant_id = 'demo-merchant-001'`,
  );

  const planRes = await c.query(
    `SELECT id FROM billing_plans WHERE code = 'PRO'`,
  );
  if (planRes.rows.length > 0) {
    const planId = planRes.rows[0].id;
    const subExists = await c.query(
      `SELECT id FROM merchant_subscriptions WHERE merchant_id = $1`,
      [merchantId],
    );

    if (subExists.rows.length === 0) {
      await c.query(
        `
        INSERT INTO merchant_subscriptions (merchant_id, plan_id, status, provider, current_period_start, current_period_end)
        VALUES ($1, $2, 'ACTIVE', 'manual', NOW(), NOW() + INTERVAL '365 days')
      `,
        [merchantId, planId],
      );
      console.log("  ✅ Subscription created");
    } else {
      await c.query(
        `
        UPDATE merchant_subscriptions 
        SET plan_id = $1, status = 'ACTIVE', current_period_end = NOW() + INTERVAL '365 days'
        WHERE merchant_id = $2
      `,
        [planId, merchantId],
      );
      console.log("  ✅ Subscription updated");
    }
  }

  // Verify
  console.log("\n📊 Verification:");
  const m = await c.query(
    `SELECT id, business_name, plan, enabled_agents FROM merchants WHERE id = $1`,
    [merchantId],
  );
  console.log(
    "  Merchant:",
    m.rows[0]?.business_name,
    "- Plan:",
    m.rows[0]?.plan,
  );

  const e = await c.query(
    `SELECT COUNT(*) FROM merchant_entitlements WHERE merchant_id = $1`,
    [merchantId],
  );
  console.log("  Entitlements:", e.rows[0].count);

  const s = await c.query(
    `
    SELECT ms.status, bp.code 
    FROM merchant_subscriptions ms 
    JOIN billing_plans bp ON bp.id = ms.plan_id 
    WHERE ms.merchant_id = $1
  `,
    [merchantId],
  );
  console.log("  Subscription:", s.rows[0]?.status, "-", s.rows[0]?.code);

  await c.end();
  console.log("\n✅ Done!");
}

fixDemoMerchant().catch(console.error);
