const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function checkAndFixSchema() {
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
  console.log("Connected to Neon\n");

  // Check merchant_entitlements schema
  console.log("📋 merchant_entitlements schema:");
  const entCols = await client.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'merchant_entitlements' 
    ORDER BY ordinal_position
  `);
  entCols.rows.forEach((r) =>
    console.log(
      `  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`,
    ),
  );

  // Check merchant_subscriptions schema
  console.log("\n📋 merchant_subscriptions schema:");
  const subCols = await client.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'merchant_subscriptions' 
    ORDER BY ordinal_position
  `);
  subCols.rows.forEach((r) =>
    console.log(
      `  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`,
    ),
  );

  // Check merchants schema for relevant columns
  console.log("\n📋 merchants relevant columns:");
  const merchCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'merchants' 
    AND column_name IN ('plan', 'enabled_agents', 'features')
    ORDER BY ordinal_position
  `);
  merchCols.rows.forEach((r) =>
    console.log(`  ${r.column_name}: ${r.data_type}`),
  );

  // Check current demo merchant data
  console.log("\n📊 Demo merchant current state:");
  try {
    const demo = await client.query(
      `SELECT * FROM merchants WHERE id = 'demo-merchant-001'`,
    );
    if (demo.rows.length > 0) {
      const m = demo.rows[0];
      console.log("  business_name:", m.business_name);
      console.log("  plan:", m.plan);
      console.log("  enabled_agents:", m.enabled_agents);
      console.log("  features:", m.features);
    }
  } catch (e) {
    console.log("  Error:", e.message);
  }

  // Now fix: Insert entitlements properly
  console.log("\n📝 Fixing merchant_entitlements...");

  // This table stores feature-by-feature entitlements
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
    try {
      await client.query(
        `
        INSERT INTO merchant_entitlements (merchant_id, feature_key, is_enabled, source)
        VALUES ('demo-merchant-001', $1, true, 'PRO_PLAN')
        ON CONFLICT (merchant_id, feature_key) DO UPDATE SET is_enabled = true, source = 'PRO_PLAN'
      `,
        [feature],
      );
    } catch (e) {
      // If no unique constraint, just insert
      try {
        // Check if exists first
        const exists = await client.query(
          `SELECT 1 FROM merchant_entitlements WHERE merchant_id = 'demo-merchant-001' AND feature_key = $1`,
          [feature],
        );
        if (exists.rows.length === 0) {
          await client.query(
            `
            INSERT INTO merchant_entitlements (merchant_id, feature_key, is_enabled, source)
            VALUES ('demo-merchant-001', $1, true, 'PRO_PLAN')
          `,
            [feature],
          );
        } else {
          await client.query(
            `
            UPDATE merchant_entitlements SET is_enabled = true, source = 'PRO_PLAN' 
            WHERE merchant_id = 'demo-merchant-001' AND feature_key = $1
          `,
            [feature],
          );
        }
      } catch (e2) {
        console.log(`  ⚠️ Could not set ${feature}:`, e2.message);
      }
    }
  }
  console.log("  ✅ Entitlements configured");

  // Fix merchant_subscriptions
  console.log("\n📝 Fixing merchant_subscriptions...");
  try {
    const planRes = await client.query(
      `SELECT id FROM billing_plans WHERE code = 'PRO'`,
    );
    if (planRes.rows.length > 0) {
      const planId = planRes.rows[0].id;

      // Check if subscription exists
      const subExists = await client.query(
        `SELECT id FROM merchant_subscriptions WHERE merchant_id = 'demo-merchant-001'`,
      );
      if (subExists.rows.length === 0) {
        await client.query(
          `
          INSERT INTO merchant_subscriptions (merchant_id, plan_id, status, provider, current_period_start, current_period_end)
          VALUES ('demo-merchant-001', $1, 'ACTIVE', 'manual', NOW(), NOW() + INTERVAL '365 days')
        `,
          [planId],
        );
        console.log("  ✅ Subscription created");
      } else {
        await client.query(
          `
          UPDATE merchant_subscriptions 
          SET plan_id = $1, status = 'ACTIVE', current_period_end = NOW() + INTERVAL '365 days'
          WHERE merchant_id = 'demo-merchant-001'
        `,
          [planId],
        );
        console.log("  ✅ Subscription updated");
      }
    }
  } catch (e) {
    console.log("  ❌ Error:", e.message);
  }

  // Verify
  console.log("\n📊 Final verification:");
  const entCount = await client.query(
    `SELECT COUNT(*) FROM merchant_entitlements WHERE merchant_id = 'demo-merchant-001'`,
  );
  console.log("  Entitlements count:", entCount.rows[0].count);

  const subCheck = await client.query(`
    SELECT ms.status, bp.code, bp.name 
    FROM merchant_subscriptions ms 
    JOIN billing_plans bp ON bp.id = ms.plan_id 
    WHERE ms.merchant_id = 'demo-merchant-001'
  `);
  if (subCheck.rows.length > 0) {
    console.log("  Subscription:", subCheck.rows[0]);
  }

  await client.end();
  console.log("\n✅ Done!");
}

checkAndFixSchema().catch(console.error);
