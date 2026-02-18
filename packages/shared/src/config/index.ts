import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
  ssl: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  adminApiKey: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  openai: OpenAIConfig;
  defaultTokenBudget: number;
  maxMessagesContext: number;
  lockTtlSeconds: number;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer value for ${key}: ${value}`);
  }
  return parsed;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Require a secret in production mode
 * Falls back to default only in development
 */
function getSecret(key: string, defaultValue: string): string {
  const value = process.env[key];
  const nodeEnv = process.env.NODE_ENV || "development";

  if (value === undefined || value === defaultValue) {
    if (nodeEnv === "production") {
      throw new Error(
        `SECURITY: Missing required secret ${key} in production. ` +
          `Do not use default values in production environments.`,
      );
    }
    return defaultValue;
  }
  return value;
}

export function loadConfig(): AppConfig {
  const nodeEnv = getEnv("NODE_ENV", "development");

  return {
    nodeEnv,
    port: getEnvInt("PORT", 3000),
    corsOrigins: getEnv("CORS_ORIGINS", "*")
      .split(",")
      .map((s) => s.trim()),
    adminApiKey: getSecret("ADMIN_API_KEY", "admin-secret-key"),
    database: {
      host: getEnv("DATABASE_HOST", "localhost"),
      port: getEnvInt("DATABASE_PORT", 5432),
      database: getEnv("DATABASE_NAME", "tash8eel"),
      user: getEnv("DATABASE_USER", "postgres"),
      password: getSecret("DATABASE_PASSWORD", "postgres"),
      maxConnections: getEnvInt("DATABASE_MAX_CONNECTIONS", 20),
      ssl: getEnvBool("DATABASE_SSL", nodeEnv === "production"),
    },
    redis: {
      host: getEnv("REDIS_HOST", "localhost"),
      port: getEnvInt("REDIS_PORT", 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: getEnvInt("REDIS_DB", 0),
    },
    openai: {
      apiKey: getSecret("OPENAI_API_KEY", ""),
      model: getEnv("OPENAI_MODEL", "gpt-4o-mini"),
      maxTokens: getEnvInt("OPENAI_MAX_TOKENS", 2048),
      timeoutMs: getEnvInt("OPENAI_TIMEOUT_MS", 30000),
    },
    defaultTokenBudget: getEnvInt("DEFAULT_TOKEN_BUDGET", 100000),
    maxMessagesContext: getEnvInt("MAX_MESSAGES_CONTEXT", 12),
    lockTtlSeconds: getEnvInt("LOCK_TTL_SECONDS", 30),
  };
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function reloadConfig(): AppConfig {
  cachedConfig = loadConfig();
  return cachedConfig;
}
