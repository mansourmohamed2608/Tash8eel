import { Module, Global, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

export const DATABASE_POOL = "DATABASE_POOL";

const parseConnectionString = (connectionString: string) => {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    database: url.pathname.slice(1),
    user: url.username,
    password: url.password,
    sslmode: url.searchParams.get("sslmode") || undefined,
  };
};

const databasePoolFactory = {
  provide: DATABASE_POOL,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const logger = new Logger("WorkerDatabasePool");
    const databaseUrl = configService.get<string>("DATABASE_URL");

    const connectionConfig = databaseUrl
      ? parseConnectionString(databaseUrl)
      : {
          host: configService.get<string>("DATABASE_HOST", "localhost"),
          port: configService.get<number>("DATABASE_PORT", 5432),
          database: configService.get<string>("DATABASE_NAME", "tash8eel"),
          user: configService.get<string>("DATABASE_USER", "postgres"),
          password: configService.get<string>("DATABASE_PASSWORD", "postgres"),
          sslmode: undefined,
        };

    const sslFlag = configService.get<string>("DATABASE_SSL");
    const sslMode = (connectionConfig as any).sslmode;
    const sslEnabled =
      sslFlag === "true" ||
      sslMode === "require" ||
      sslMode === "verify-full" ||
      sslMode === "verify-ca";
    const rejectUnauthorized =
      configService.get<string>("DB_SSL_REJECT_UNAUTHORIZED", "true") !==
      "false";

    const pool = new Pool({
      host: connectionConfig.host,
      port: connectionConfig.port,
      database: connectionConfig.database,
      user: connectionConfig.user,
      password: connectionConfig.password,
      ssl: sslEnabled ? { rejectUnauthorized } : false,
      max: configService.get<number>("DATABASE_MAX_CONNECTIONS", 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    // Handle dropped idle connections (common on cloud/serverless PG) without crashing the worker.
    pool.on("error", (error: Error) => {
      logger.warn(
        `Idle PostgreSQL client error (recycled by pool): ${error.message}`,
      );
    });

    // Ensure checked-out clients also have an error listener to avoid unhandled 'error' events.
    pool.on("connect", (client) => {
      client.on("error", (error: Error) => {
        logger.warn(`PostgreSQL client error: ${error.message}`);
      });
    });

    return pool;
  },
};

@Global()
@Module({
  providers: [databasePoolFactory],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
