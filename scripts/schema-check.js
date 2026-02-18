require("dotenv").config({
  path: require("path").resolve(__dirname, "..", "apps", "api", ".env"),
});
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const check = [
    "finance_snapshots",
    "finance_insights",
    "margin_alerts",
    "objection_templates",
    "copilot_pending_actions",
    "product_cogs",
    "recovered_carts",
    "substitution_suggestions",
    "ocr_verification_rules",
  ];
  console.log("=== TABLE CHECK ===");
  for (const t of check) {
    const r = await pool.query(
      "SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
      [t],
    );
    console.log(t + ": " + (r.rows[0].c > 0 ? "EXISTS" : "MISSING"));
  }
  console.log("=== COLUMN CHECK ===");
  const mas = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='merchant_agent_subscriptions' ORDER BY ordinal_position",
  );
  console.log(
    "merchant_agent_subscriptions: " +
      mas.rows.map((c) => c.column_name).join(", "),
  );
  const al = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' ORDER BY ordinal_position",
  );
  console.log("audit_logs: " + al.rows.map((c) => c.column_name).join(", "));
  console.log("=== STAFF CHECK ===");
  const staff = await pool.query("SELECT id FROM merchant_staff LIMIT 5");
  console.log("merchant_staff rows:", staff.rows.length);
  if (staff.rows.length > 0) {
    staff.rows.forEach((s) => console.log("  " + s.id));
  }
  await pool.end();
})();
