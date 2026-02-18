const { Client } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "❌ DATABASE_URL not set. Create .env file or set environment variable.",
    );
    process.exit(1);
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  console.log("Connecting...");
  await client.connect();
  console.log("Connected!");

  try {
    console.log("Running migration...");
    await client.query(
      "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_operator_id VARCHAR(100)",
    );
    console.log("Migration complete!");

    // Verify
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'conversations' AND column_name = 'human_operator_id'
    `);
    console.log("Column exists:", res.rows.length > 0);
  } catch (e) {
    console.error("Error:", e.message);
  }

  await client.end();
  console.log("Done");
}

main();
