const fs = require("fs");
const path = require("path");

const tables = [
  "_migrations",
  "accountant_exports",
  "address_cache",
  "agent_actions",
  "agent_results",
  "agent_subscription_audit",
  "agent_tasks",
  "ai_decision_log",
  "analytics_events",
  "audit_logs",
  "billing_history",
  "billing_invoices",
  "billing_plans",
  "bulk_operations",
  "cash_flow_forecasts",
  "catalog_items",
  "cod_reminders",
  "cod_statement_imports",
  "cod_statement_lines",
  "complaint_playbooks",
  "conversation_locks",
  "conversations",
  "custom_segments",
  "customer_loyalty",
  "customer_memory",
  "customer_points",
  "customer_referrals",
  "customer_risk_scores",
  "customer_segments",
  "customers",
  "data_requests",
  "delivery_drivers",
  "delivery_eta_config",
  "delivery_outcomes",
  "delivery_reports",
  "dlq_events",
  "early_access_waitlist",
  "entitlement_changes",
  "events",
  "expenses",
  "expiry_alerts",
  "feature_requests",
  "feature_usage",
  "followups",
  "gift_card_transactions",
  "gift_cards",
  "integration_endpoints",
  "integration_events",
  "inventory_alerts",
  "inventory_cost_layers",
  "inventory_items",
  "inventory_lots",
  "inventory_stock_by_location",
  "inventory_top_movers",
  "inventory_variants",
  "item_recipes",
  "known_areas",
  "loyalty_programs",
  "loyalty_tiers",
  "loyalty_transactions",
  "merchant_agent_subscriptions",
  "merchant_api_keys",
  "merchant_entitlements",
  "merchant_notifications",
  "merchant_phone_numbers",
  "merchant_reports",
  "merchant_settings",
  "merchant_staff",
  "merchant_subscriptions",
  "merchant_tax_config",
  "merchant_token_usage",
  "merchants",
  "message_events",
  "messages",
  "migrations",
  "monthly_closes",
  "notification_delivery_log",
  "notification_logs",
  "notification_preferences",
  "notification_queue",
  "notification_templates",
  "notifications",
  "ocr_extracted_products",
  "ocr_scans",
  "orchestrator_tasks",
  "order_ingredient_deductions",
  "order_items",
  "orders",
  "outbox_events",
  "payment_links",
  "payment_proofs",
  "permission_templates",
  "points_transactions",
  "pos_integrations",
  "product_ocr_confirmations",
  "product_ocr_logs",
  "promotion_usage",
  "promotions",
  "proof_requests",
  "push_subscriptions",
  "quote_request_events",
  "quote_requests",
  "rate_limit_counters",
  "rate_limit_violations",
  "refunds",
  "scheduled_notifications",
  "segment_memberships",
  "shipments",
  "shrinkage_records",
  "sku_merge_log",
  "staff_members",
  "staff_sessions",
  "stock_alerts",
  "stock_movements",
  "stock_reservations",
  "subscription_offers",
  "subscription_plans",
  "supplier_imports",
  "suppliers",
  "tax_reports",
  "team_tasks",
  "twilio_message_log",
  "upsell_rules",
  "vip_rules",
  "voice_transcriptions",
  "warehouse_locations",
  "webhook_deliveries",
  "webhooks",
  "whatsapp_media",
  "whatsapp_templates",
];

const BASE = path.join(__dirname);
const searchDirs = [
  path.join(BASE, "apps/api/src"),
  path.join(BASE, "apps/worker/src"),
  path.join(BASE, "apps/portal/src"),
  path.join(BASE, "packages"),
];

function getAllFiles(dir, exts) {
  let results = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (
          item.name === "node_modules" ||
          item.name === "dist" ||
          item.name === ".next"
        )
          continue;
        results = results.concat(getAllFiles(fullPath, exts));
      } else if (
        exts.some((ext) => item.name.endsWith(ext)) &&
        !item.name.endsWith(".d.ts")
      ) {
        results.push(fullPath);
      }
    }
  } catch (e) {}
  return results;
}

// Collect all files
let allFiles = [];
for (const d of searchDirs) {
  allFiles = allFiles.concat(getAllFiles(d, [".ts", ".js"]));
}

// Read all file contents once
const fileContents = {};
for (const f of allFiles) {
  try {
    fileContents[f] = fs.readFileSync(f, "utf-8");
  } catch (e) {}
}

const isSeedFile = (fp) =>
  fp.includes("seed.service") ||
  fp.includes("seed.ts") ||
  fp.includes("seed-demo") ||
  fp.includes("seed_data");

const results = {};

for (const table of tables) {
  let totalRefs = 0;
  let seedOnlyRefs = 0;
  let nonSeedRefs = 0;
  let refFiles = [];

  for (const [fp, content] of Object.entries(fileContents)) {
    // Search for the table name as a distinct word (in SQL, as string, etc.)
    const regex = new RegExp(`\\b${table}\\b`, "g");
    const matches = content.match(regex);
    if (matches) {
      const count = matches.length;
      totalRefs += count;
      if (isSeedFile(fp)) {
        seedOnlyRefs += count;
      } else {
        nonSeedRefs += count;
        refFiles.push(path.basename(fp) + ":" + count);
      }
    }
  }

  results[table] = { totalRefs, seedOnlyRefs, nonSeedRefs, refFiles };
}

// Output categorized
console.log("\n=== ZERO REFERENCES (DEAD) ===");
for (const [t, r] of Object.entries(results)) {
  if (r.totalRefs === 0) {
    console.log(`  ${t}: 0 refs`);
  }
}

console.log("\n=== SEED-ONLY (referenced only in seed files) ===");
for (const [t, r] of Object.entries(results)) {
  if (r.totalRefs > 0 && r.nonSeedRefs === 0) {
    console.log(`  ${t}: ${r.totalRefs} refs (all in seed files)`);
  }
}

console.log("\n=== LOW REFERENCES (1-3 non-seed refs, might be dead-ish) ===");
for (const [t, r] of Object.entries(results)) {
  if (r.nonSeedRefs >= 1 && r.nonSeedRefs <= 3) {
    console.log(
      `  ${t}: ${r.nonSeedRefs} non-seed refs [${r.refFiles.join(", ")}]`,
    );
  }
}

console.log("\n=== ACTIVELY USED (4+ non-seed refs) ===");
for (const [t, r] of Object.entries(results)) {
  if (r.nonSeedRefs >= 4) {
    console.log(
      `  ${t}: ${r.nonSeedRefs} non-seed refs [${r.refFiles.join(", ")}]`,
    );
  }
}
