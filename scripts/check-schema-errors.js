const path = require("path");
const { Client } = require("pg");
require("dotenv").config({
  path: path.resolve(__dirname, "..", "apps", "api", ".env"),
});

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r1 = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='merchants' AND column_name IN ('whatsapp_phone_id','whatsapp_business_id','knowledge_base') ORDER BY column_name`,
  );
  console.log(
    "merchants whatsapp/kb cols:",
    r1.rows.map((r) => r.column_name),
  );

  const r2 = await c.query(
    `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='catalog_item_variants')`,
  );
  console.log("catalog_item_variants exists:", r2.rows[0].exists);

  const r3 = await c.query(
    `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='knowledge_base')`,
  );
  console.log("knowledge_base table exists:", r3.rows[0].exists);

  const r4 = await c.query(
    `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='inventory_variants')`,
  );
  console.log("inventory_variants exists:", r4.rows[0].exists);

  const r5 = await c.query(
    `SELECT enumlabel FROM pg_enum WHERE enumtypid='order_status'::regtype ORDER BY enumsortorder`,
  );
  console.log(
    "order_status enum values:",
    r5.rows.map((r) => r.enumlabel),
  );

  const r6 = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND column_name LIKE '%read%'`,
  );
  console.log(
    "notifications read-like cols:",
    r6.rows.map((r) => r.column_name),
  );

  const r7 = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='merchants' ORDER BY ordinal_position`,
  );
  console.log(
    "All merchants columns:",
    r7.rows.map((r) => r.column_name),
  );

  const r8 = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='inventory_variants' ORDER BY ordinal_position`,
  );
  console.log(
    "inventory_variants columns:",
    r8.rows.map((r) => r.column_name),
  );

  await c.end();
})();
