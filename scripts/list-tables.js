require("dotenv").config({
  path: require("path").join(__dirname, "..", "apps", "api", ".env"),
});
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const r = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  );
  console.log("TOTAL:", r.rows.length);
  r.rows.forEach((t) => console.log(t.table_name));
  await pool.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
