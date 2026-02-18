const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function listMerchants() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "❌ DATABASE_URL not set. Create .env file or set environment variable.",
    );
    process.exit(1);
  }
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await c.connect();

  console.log("=== All Merchants ===\n");

  const m = await c.query(`
    SELECT id, business_name, name, plan, api_key, is_active, created_at 
    FROM merchants 
    ORDER BY created_at DESC
    LIMIT 10
  `);

  m.rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.id}`);
    console.log(`   Name: ${r.business_name || r.name}`);
    console.log(`   Plan: ${r.plan || "N/A"}`);
    console.log(
      `   API Key: ${r.api_key ? r.api_key.substring(0, 20) + "..." : "N/A"}`,
    );
    console.log(`   Active: ${r.is_active}`);
    console.log("");
  });

  console.log("Total merchants:", m.rows.length);

  await c.end();
}

listMerchants().catch(console.error);
