const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", "apps", "api", ".env"),
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const FAILED_MIGRATIONS = [
  "021_unify_staff_notifications.sql",
  "024_billing_subscriptions.sql",
  "029_schema_hotfix.sql",
];

async function runMigration(filename) {
  const filePath = path.join(
    __dirname,
    "..",
    "apps",
    "api",
    "migrations",
    filename,
  );
  const sql = fs.readFileSync(filePath, "utf-8");

  console.log(`\n📄 Running ${filename}...`);

  // Split by DO $$ blocks and regular statements properly
  // Find all DO $$ ... END $$; blocks first
  const doBlockRegex = /DO\s+\$\$[\s\S]*?END\s+\$\$;/gi;
  const doBlocks = sql.match(doBlockRegex) || [];

  // Replace DO blocks with placeholders
  let remaining = sql;
  doBlocks.forEach((block, i) => {
    remaining = remaining.replace(block, `__DO_BLOCK_${i}__`);
  });

  // Split remaining by semicolons
  const otherStatements = remaining
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--") && !s.match(/^__DO_BLOCK_\d+__$/));

  // Collect all statements in order
  const allStatements = [];

  // Re-parse to maintain order
  const lines = sql.split("\n");
  let currentStmt = "";
  let inDoBlock = false;
  let doBlockDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^DO\s+\$\$/i)) {
      inDoBlock = true;
      doBlockDepth = 1;
      currentStmt = line + "\n";
      continue;
    }

    if (inDoBlock) {
      currentStmt += line + "\n";
      if (trimmed.match(/\$\$/)) {
        // Check if it's BEGIN $$ or END $$
        if (trimmed.match(/END\s+\$\$;?/i)) {
          doBlockDepth--;
          if (doBlockDepth === 0) {
            allStatements.push(currentStmt.trim());
            currentStmt = "";
            inDoBlock = false;
          }
        }
      }
      continue;
    }

    // Regular statement
    currentStmt += line + "\n";
    if (trimmed.endsWith(";") && !inDoBlock) {
      const stmt = currentStmt.trim();
      if (stmt && !stmt.startsWith("--")) {
        allStatements.push(stmt);
      }
      currentStmt = "";
    }
  }

  // Run each statement
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const stmt of allStatements) {
    if (!stmt || stmt.length < 5) continue;

    try {
      await pool.query(stmt);
      success++;
      const preview = stmt.substring(0, 60).replace(/\n/g, " ").trim();
      console.log(`  ✓ ${preview}...`);
    } catch (err) {
      if (
        err.message.includes("already exists") ||
        err.message.includes("duplicate") ||
        err.message.includes("does not exist")
      ) {
        skipped++;
      } else {
        failed++;
        console.log(`  ⚠ ${err.message.substring(0, 80)}`);
      }
    }
  }

  console.log(
    `  📊 ${success} succeeded, ${skipped} skipped, ${failed} failed`,
  );
  return { success, skipped, failed };
}

async function main() {
  console.log("🔧 Fixing failed migrations...\n");

  let totalSuccess = 0;
  let totalFailed = 0;

  for (const migration of FAILED_MIGRATIONS) {
    try {
      const result = await runMigration(migration);
      totalSuccess += result.success;
      totalFailed += result.failed;
    } catch (err) {
      console.error(`❌ Critical error in ${migration}:`, err.message);
      totalFailed++;
    }
  }

  console.log("\n" + "━".repeat(50));
  console.log(
    `✨ Done! ${totalSuccess} statements succeeded, ${totalFailed} failed`,
  );

  // Verify key tables/columns
  console.log("\n🔍 Verifying schema...");

  const checks = [
    {
      name: "billing_plans",
      query: `SELECT COUNT(*) as cnt FROM billing_plans`,
    },
    {
      name: "notification_preferences columns",
      query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'notification_preferences' AND column_name = 'email_enabled'`,
    },
    {
      name: "merchants.whatsapp_reports_enabled",
      query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'whatsapp_reports_enabled'`,
    },
  ];

  for (const check of checks) {
    try {
      const result = await pool.query(check.query);
      if (result.rows.length > 0) {
        console.log(`  ✅ ${check.name}`);
      } else {
        console.log(`  ⚠️  ${check.name} - no results`);
      }
    } catch (err) {
      console.log(`  ❌ ${check.name} - ${err.message}`);
    }
  }

  await pool.end();
}

main().catch(console.error);
