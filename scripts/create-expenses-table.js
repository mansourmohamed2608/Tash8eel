const { Pool } = require("pg");
require("dotenv").config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Check migration tracking
    const mig = await pool
      .query(
        "SELECT name FROM migrations WHERE name LIKE '%046%' OR name LIKE '%048%' ORDER BY name",
      )
      .catch(() => ({ rows: [] }));
    console.log(
      "Applied migrations (046/048):",
      mig.rows.map((r) => r.name),
    );

    // 2. Check if table exists
    const check = await pool.query(
      "SELECT to_regclass('public.expenses') AS tbl",
    );
    console.log("Table exists:", check.rows[0].tbl);

    if (!check.rows[0].tbl) {
      console.log("Creating expenses table...");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS expenses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
          amount DECIMAL(12,2) NOT NULL,
          category VARCHAR(100),
          subcategory VARCHAR(100),
          description TEXT,
          expense_date DATE DEFAULT CURRENT_DATE,
          is_recurring BOOLEAN DEFAULT FALSE,
          recurring_day INTEGER,
          receipt_url TEXT,
          created_by VARCHAR(50) DEFAULT 'manual',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant_id)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(merchant_id, expense_date DESC)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(merchant_id, category)",
      );

      // Mark migration as applied
      await pool
        .query(
          "INSERT INTO migrations (name) VALUES ('048_merchant_copilot.sql') ON CONFLICT (name) DO NOTHING",
        )
        .catch(() => {});

      console.log("expenses table CREATED with indexes");
    }

    // 3. Verify columns
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'expenses' ORDER BY ordinal_position",
    );
    console.log("Columns:", cols.rows.map((r) => r.column_name).join(", "));

    // 4. Test insert
    const ins = await pool.query(
      `INSERT INTO expenses (merchant_id, category, subcategory, amount, description, expense_date, is_recurring, recurring_day, receipt_url, created_by)
       VALUES ('demo-merchant', 'shipping', null, 200, 'test-verify', CURRENT_DATE, false, null, null, 'portal')
       RETURNING id`,
    );
    console.log("INSERT OK, id:", ins.rows[0].id);
    await pool.query("DELETE FROM expenses WHERE id = $1", [ins.rows[0].id]);
    console.log("DONE - expenses table is ready");
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    await pool.end();
  }
}

main();
