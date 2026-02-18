require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    const result = await pool.query(`
      SELECT resource_type, status, total_records, success_count, error_count, errors 
      FROM bulk_operations 
      ORDER BY created_at DESC 
      LIMIT 3
    `);

    result.rows.forEach((row) => {
      console.log("Type:", row.resource_type, "| Status:", row.status);
      console.log(
        "Total:",
        row.total_records,
        "Success:",
        row.success_count,
        "Errors:",
        row.error_count,
      );
      console.log("Error details:", JSON.stringify(row.errors, null, 2));
      console.log("---");
    });
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main();
