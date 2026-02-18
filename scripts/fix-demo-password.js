const { Client } = require("pg");

async function main() {
  const c = new Client(
    "postgresql://neondb_owner:npg_UlYV0QCeKkB4@ep-twilight-boat-afzfn9ls-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require",
  );
  await c.connect();

  const hash = "$2b$10$9c9HDJ4QI/lpTuzwz4AYl.1wApPR8YC.U2gpFbxGjghby5SvnizC.";
  const r = await c.query(
    "UPDATE merchant_staff SET password_hash = $1 WHERE id = '8f3515e4-a501-4e08-9904-5ff8544d1789'",
    [hash],
  );
  console.log("Updated:", r.rowCount);
  await c.end();
}
main().catch(console.error);
