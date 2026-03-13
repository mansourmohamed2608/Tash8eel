import * as fs from "fs";
import * as path from "path";
import { Logger } from "@nestjs/common";
import { Pool } from "pg";

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/operations";

const MIGRATIONS_DIR = path.join(__dirname, "../../../migrations");

const resolveSslConfig = (connectionString: string) => {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    const sslEnabled = sslMode
      ? ["require", "verify-full", "verify-ca", "prefer"].includes(sslMode)
      : false;
    return sslEnabled ? { rejectUnauthorized: false } : false;
  } catch {
    return false;
  }
};

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const lineEnd = sql.indexOf("\n", i);
      if (lineEnd === -1) break;
      i = lineEnd + 1;
      continue;
    }

    if (sql[i] === "/" && sql[i + 1] === "*") {
      const commentEnd = sql.indexOf("*/", i + 2);
      if (commentEnd === -1) break;
      i = commentEnd + 2;
      continue;
    }

    if (sql[i] === "$") {
      const tagMatch = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        current += tag;
        i += tag.length;
        const closingPos = sql.indexOf(tag, i);
        if (closingPos === -1) {
          current += sql.substring(i);
          break;
        }
        current += sql.substring(i, closingPos + tag.length);
        i = closingPos + tag.length;
        continue;
      }
    }

    if (sql[i] === "'") {
      current += sql[i];
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''";
          i += 2;
        } else if (sql[i] === "'") {
          current += sql[i];
          i++;
          break;
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }

    if (sql[i] === ";") {
      current += ";";
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed && trimmed !== ";") {
    statements.push(trimmed);
  }

  return statements;
}

function shouldSkipError(err: unknown, statement: string): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (!code) return false;

  const duplicateCodes = new Set(["42710", "42P07", "42701", "42P06"]);
  if (duplicateCodes.has(code)) return true;

  if (code === "42703" && /CREATE\s+INDEX/i.test(statement)) return true;

  return false;
}

export async function runPendingSqlMigrations(logger?: Logger): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const sslFromEnv = process.env.DATABASE_SSL === "true";
  const sslFromUrl = resolveSslConfig(databaseUrl);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslFromEnv ? { rejectUnauthorized: false } : sslFromUrl,
  });

  const client = await pool.connect();

  try {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      throw new Error(
        `Migrations directory not found at ${MIGRATIONS_DIR}. Aborting startup.`,
      );
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const executed = await client.query("SELECT name FROM migrations");
    const executedNames = new Set(
      executed.rows.map((row: { name: string }) => row.name),
    );

    const isProduction = process.env.NODE_ENV === "production";

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => {
        if (!f.endsWith(".sql")) return false;
        // Seed files (seed_*.sql) are development/staging fixtures — never auto-run in production
        if (isProduction && f.startsWith("seed_")) {
          logger?.warn(`Skipping seed file in production: ${f}`);
          return false;
        }
        return true;
      })
      .sort();

    let migrationsRun = 0;

    for (const file of files) {
      if (executedNames.has(file)) {
        continue;
      }

      logger?.log(`Running SQL migration ${file}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      const statements = splitSqlStatements(sql);

      for (const statement of statements) {
        if (!statement.trim()) continue;
        try {
          await client.query(statement);
        } catch (err) {
          if (shouldSkipError(err, statement)) {
            logger?.warn(`Skipping already-applied statement in ${file}`);
            continue;
          }
          throw err;
        }
      }

      await client.query("INSERT INTO migrations (name) VALUES ($1)", [file]);
      migrationsRun += 1;
    }

    return migrationsRun;
  } finally {
    client.release();
    await pool.end();
  }
}
