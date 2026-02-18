const { Client } = require("pg");
const bcrypt = require("bcrypt");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Set it in your environment.");
  }

  const c = new Client({ connectionString });
  await c.connect();

  const r = await c.query(
    "SELECT id, email, role, password_hash FROM merchant_staff WHERE merchant_id='demo-merchant' LIMIT 5",
  );
  console.log("Staff rows:", r.rows.length);

  for (const row of r.rows) {
    console.log(`\nStaff: ${row.id} | ${row.email} | ${row.role}`);
    console.log(
      `Hash: ${row.password_hash ? row.password_hash.substring(0, 20) + "..." : "NULL"}`,
    );

    if (row.password_hash) {
      const match = await bcrypt.compare("demo123", row.password_hash);
      console.log(`demo123 matches: ${match}`);
    } else {
      console.log("No password hash set!");
    }
  }

  await c.end();
}
main().catch(console.error);
