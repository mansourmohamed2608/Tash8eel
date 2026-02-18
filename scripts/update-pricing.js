/**
 * Update billing_plans with real cost-based pricing (2026, Meta Cloud API direct)
 *
 * Cost basis:
 * - WhatsApp msgs via Meta Cloud API: SERVICE = FREE, utility in CSW = FREE
 * - Only marketing templates cost money: ~$0.074/msg = ~3.70 EGP (pass-through)
 * - AI call (blended 85% mini + 15% 4o): ~0.05 EGP
 * - 1 conversation ≈ 10 messages (FREE) + 4 AI calls = ~0.20 EGP cost
 * - Infrastructure share: ~70 EGP/merchant/mo
 * - WA number: FREE (Meta Cloud API direct)
 */
const { Client } = require("pg");

const client = new Client({
  connectionString:
    "postgresql://neondb_owner:npg_UlYV0QCeKkB4@ep-twilight-boat-afzfn9ls-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require",
});

async function main() {
  await client.connect();
  console.log("Connected to Neon DB");

  // STARTER: 449 EGP | 10K msgs (~1000 convos/mo, ~33/day) | 300 AI/day
  await client.query(`
    UPDATE billing_plans SET 
      price_cents = 44900,
      description = 'Core operations + AI assistant — ~33 conversations/day',
      features = '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS"]'::jsonb,
      agents = '["OPS_AGENT"]'::jsonb,
      limits = '{"messagesPerMonth":10000,"whatsappNumbers":1,"teamMembers":1,"tokenBudgetDaily":150000,"aiCallsPerDay":300}'::jsonb
    WHERE code = 'STARTER'
  `);
  console.log("✅ STARTER → 449 EGP (10K msgs ≈ 33 convos/day, 300 AI/day)");

  // GROWTH: 799 EGP | 15K msgs (~1,500 convos/mo, ~50/day) | 500 AI/day
  await client.query(`
    UPDATE billing_plans SET 
      price_cents = 79900,
      description = 'Operations + Inventory AI — ~50 conversations/day',
      features = '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","VOICE_NOTES","REPORTS","NOTIFICATIONS","API_ACCESS"]'::jsonb,
      agents = '["OPS_AGENT","INVENTORY_AGENT"]'::jsonb,
      limits = '{"messagesPerMonth":15000,"whatsappNumbers":2,"teamMembers":2,"tokenBudgetDaily":300000,"aiCallsPerDay":500}'::jsonb
    WHERE code = 'GROWTH'
  `);
  console.log("✅ GROWTH → 799 EGP (15K msgs ≈ 50 convos/day, 500 AI/day)");

  // PRO: 1,499 EGP | 50K msgs (~5K convos/mo, ~167/day) | 1,500 AI/day
  await client.query(`
    UPDATE billing_plans SET 
      price_cents = 149900,
      description = 'Full suite + Finance AI — ~167 conversations/day',
      features = '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","PAYMENTS","VISION_OCR","VOICE_NOTES","REPORTS","WEBHOOKS","TEAM","NOTIFICATIONS","AUDIT_LOGS","KPI_DASHBOARD","API_ACCESS"]'::jsonb,
      agents = '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
      limits = '{"messagesPerMonth":50000,"whatsappNumbers":3,"teamMembers":3,"tokenBudgetDaily":800000,"aiCallsPerDay":1500}'::jsonb
    WHERE code = 'PRO'
  `);
  console.log("✅ PRO → 1,499 EGP (50K msgs ≈ 167 convos/day, 1500 AI/day)");

  // ENTERPRISE: 2,999 EGP | unlimited
  await client.query(`
    UPDATE billing_plans SET 
      price_cents = 299900,
      billing_period = 'monthly',
      description = '3 AI agents + unlimited conversations',
      features = '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","PAYMENTS","VISION_OCR","VOICE_NOTES","REPORTS","WEBHOOKS","TEAM","NOTIFICATIONS","AUDIT_LOGS","KPI_DASHBOARD","API_ACCESS"]'::jsonb,
      agents = '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
      limits = '{"messagesPerMonth":-1,"whatsappNumbers":-1,"teamMembers":10,"tokenBudgetDaily":-1,"aiCallsPerDay":-1}'::jsonb
    WHERE code = 'ENTERPRISE'
  `);
  console.log("✅ ENTERPRISE → 2,999 EGP (3 agents, unlimited)");

  // Verify
  const { rows } = await client.query(
    `SELECT code, name, price_cents, billing_period, limits FROM billing_plans ORDER BY price_cents NULLS LAST`,
  );
  console.log("\n📋 Updated billing_plans:");
  rows.forEach((r) => {
    const price = r.price_cents ? r.price_cents / 100 : "N/A";
    const msgs =
      r.limits?.messagesPerMonth === -1
        ? "unlimited"
        : r.limits?.messagesPerMonth;
    const convos =
      msgs === "unlimited" ? "unlimited" : `~${Math.round(msgs / 10)}`;
    console.log(
      `  ${r.code}: ${price} EGP/${r.billing_period} | ${msgs} msgs (${convos} convos) | AI: ${r.limits?.aiCallsPerDay}/day`,
    );
  });

  await client.end();
  console.log("\n✅ Done! All plans updated with conversation-based pricing.");
}

main().catch((err) => {
  console.error("Error:", err);
  client.end();
  process.exit(1);
});
