const { Pool } = require("pg");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool
  .query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='conversations' AND table_schema='public' ORDER BY ordinal_position",
  )
  .then((r) => {
    r.rows.forEach((c) => console.log(c.column_name + ": " + c.data_type));
    pool.end();
  });
