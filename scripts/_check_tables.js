require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");
const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
p.query(
  `ALTER TABLE merchant_staff ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL`,
)
  .then((r) => {
    console.log("custom_permissions added to merchant_staff!");
    p.end();
  })
  .catch((e) => {
    console.error(e.message);
    p.end();
  });
