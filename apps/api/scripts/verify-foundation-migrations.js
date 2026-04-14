/* eslint-disable no-console */

const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[verify-foundations] Missing DATABASE_URL");
  process.exit(2);
}

function resolveSslConfig(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const sslMode = String(
      parsed.searchParams.get("sslmode") || "",
    ).toLowerCase();
    if (["require", "verify-full", "verify-ca", "prefer"].includes(sslMode)) {
      return { rejectUnauthorized: false };
    }
  } catch {
    // ignore parse issues and default to no SSL
  }
  if (String(process.env.DATABASE_SSL || "").toLowerCase() === "true") {
    return { rejectUnauthorized: false };
  }
  return false;
}

const REQUIRED_TABLES_113 = ["copilot_action_approvals"];
const REQUIRED_TABLES_114 = [
  "delivery_execution_events",
  "delivery_pod_records",
  "delivery_location_timeline",
  "delivery_sla_events",
  "connector_runtime_events",
  "connector_runtime_dlq",
  "connector_reconciliation_runs",
  "connector_reconciliation_items",
  "merchant_org_units",
  "merchant_org_policy_bindings",
  "merchant_org_staff_scopes",
  "control_policy_sets",
  "control_policy_simulations",
  "planner_trigger_policies",
  "planner_run_ledger",
];

async function tableExists(pool, tableName) {
  const result = await pool.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`],
  );
  return result.rows[0] && result.rows[0].exists === true;
}

async function migrationExecuted(pool, migrationName) {
  try {
    const result = await pool.query(
      "SELECT 1 FROM migrations WHERE name = $1 LIMIT 1",
      [migrationName],
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: resolveSslConfig(DATABASE_URL),
  });

  try {
    const migration113Recorded = await migrationExecuted(
      pool,
      "113_copilot_planner_foundations.sql",
    );
    const migration114Recorded = await migrationExecuted(
      pool,
      "114_chain_execution_foundations.sql",
    );

    const missing113 = [];
    for (const tableName of REQUIRED_TABLES_113) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await tableExists(pool, tableName);
      if (!exists) missing113.push(tableName);
    }

    const missing114 = [];
    for (const tableName of REQUIRED_TABLES_114) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await tableExists(pool, tableName);
      if (!exists) missing114.push(tableName);
    }

    console.log("[verify-foundations] Migration marker status:");
    console.log(
      JSON.stringify(
        {
          migration113Recorded,
          migration114Recorded,
        },
        null,
        2,
      ),
    );

    console.log("[verify-foundations] Missing foundation tables:");
    console.log(
      JSON.stringify(
        {
          migration113: missing113,
          migration114: missing114,
        },
        null,
        2,
      ),
    );

    if (missing113.length > 0 || missing114.length > 0) {
      console.error(
        "[verify-foundations] Foundation migration verification failed",
      );
      process.exit(1);
    }

    console.log(
      "[verify-foundations] Foundation migration requirements are satisfied",
    );
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("[verify-foundations] Unexpected error", error);
  process.exit(1);
});
