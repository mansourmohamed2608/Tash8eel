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
    "cod_collections",
    "product_cogs",
    "recovered_carts",
    "substitution_suggestions",
    "ocr_verification_rules",
  ];
  for (const t of check) {
    const r = await pool.query(
      "SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
      [t],
    );
    console.log(t + ": " + (r.rows[0].c > 0 ? "EXISTS" : "NOT_EXISTS"));
  }
  const staff = await pool.query("SELECT id FROM merchant_staff LIMIT 5");
  console.log("merchant_staff rows:", staff.rows.length);
  if (staff.rows.length > 0)
    console.log(
      "staff IDs:",
      staff.rows.map((r) => r.id.substring(0, 8)).join(", "),
    );
  await pool.end();
})();
