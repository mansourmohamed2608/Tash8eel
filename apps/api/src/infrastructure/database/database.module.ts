import {
  Module,
  Global,
  OnModuleDestroy,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Pool } from "pg";

export const DATABASE_POOL = Symbol("DATABASE_POOL");

function parseConnectionString(connectionString: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
} {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  const sslEnabled = sslMode
    ? ["require", "verify-full", "verify-ca", "prefer"].includes(sslMode)
    : false;
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    database: url.pathname.slice(1), // Remove leading /
    user: url.username,
    password: url.password,
    ssl: sslEnabled,
  };
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: async (configService: ConfigService) => {
        // Support DATABASE_URL (takes precedence) or individual vars
        const databaseUrl = configService.get<string>("DATABASE_URL");

        let connectionConfig: {
          host: string;
          port: number;
          database: string;
          user: string;
          password: string;
          ssl?: boolean;
        };

        if (databaseUrl) {
          connectionConfig = parseConnectionString(databaseUrl);
        } else {
          connectionConfig = {
            host: configService.get<string>("DATABASE_HOST", "localhost"),
            port: configService.get<number>("DATABASE_PORT", 5432),
            database: configService.get<string>(
              "DATABASE_NAME",
              "operations_agent",
            ),
            user: configService.get<string>("DATABASE_USER", "postgres"),
            password: configService.get<string>(
              "DATABASE_PASSWORD",
              "postgres",
            ),
          };
        }

        const sslFlag = configService.get<string>("DATABASE_SSL") === "true";
        const resolvedSsl = sslFlag || connectionConfig.ssl;
        // rejectUnauthorized must be true in production to validate the server's
        // TLS certificate and prevent man-in-the-middle attacks.
        // Set DATABASE_SSL_REJECT_UNAUTHORIZED=false ONLY for local dev with self-signed certs.
        const rejectUnauthorized =
          configService.get<string>("DATABASE_SSL_REJECT_UNAUTHORIZED") !== "false";
        const pool = new Pool({
          ...connectionConfig,
          ssl: resolvedSsl ? { rejectUnauthorized } : false,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 15000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        });

        // Prevent unhandled pool errors from crashing the process (Neon drops idle connections)
        pool.on("error", (err) => {
          const logger = new Logger("DatabasePool");
          logger.warn(
            `Idle client error (connection will be recycled): ${err.message}`,
          );
        });

        // Also guard checked-out clients from emitting unhandled 'error' events.
        pool.on("connect", (client) => {
          client.on("error", (err: Error) => {
            const logger = new Logger("DatabasePool");
            logger.warn(
              `Client connection error (query may retry/fail safely): ${err.message}`,
            );
          });
        });

        // Test connection with retry for Neon cold starts
        const logger = new Logger("DatabaseBootstrap");
        let retries = 3;
        while (retries > 0) {
          try {
            const client = await pool.connect();
            client.release();
            break;
          } catch (err) {
            retries--;
            if (retries === 0) throw err;
            logger.warn(
              `DB connection attempt failed (${retries} retries left): ${err.message}`,
            );
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        // Ensure critical tables exist
        try {
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
        } catch (e) {
          logger.warn(
            `Non-critical: could not ensure expenses table: ${e.message}`,
          );
        }

        // Ensure custom_segments table
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS custom_segments (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
              name VARCHAR(200) NOT NULL,
              description TEXT,
              rules JSONB NOT NULL DEFAULT '[]',
              match_type VARCHAR(10) NOT NULL DEFAULT 'all',
              customer_count INTEGER DEFAULT 0,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            )
          `);
          await pool.query(
            "CREATE INDEX IF NOT EXISTS idx_custom_segments_merchant ON custom_segments(merchant_id)",
          );
        } catch (e) {
          logger.warn(
            `Non-critical: could not ensure custom_segments table: ${e.message}`,
          );
        }

        return pool;
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      this.logger.log("Closing database connection pool...");
      await this.pool.end();
      this.logger.log("Database connection pool closed");
    }
  }
}
