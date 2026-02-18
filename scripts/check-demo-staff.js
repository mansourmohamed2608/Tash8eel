const { Client } = require("pg");
const bcrypt = require("bcrypt");

async function main() {
  const c = new Client(
    "postgresql://neondb_owner:npg_UlYV0QCeKkB4@ep-twilight-boat-afzfn9ls-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require",
  );
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
