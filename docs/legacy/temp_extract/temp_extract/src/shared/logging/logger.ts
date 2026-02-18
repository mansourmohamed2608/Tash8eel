import pino from "pino";
import {
  getCorrelationId,
  getMerchantId,
} from "../middleware/correlation-id.middleware";
import { maskPhone, maskAddress } from "../utils/helpers";

const isDevelopment = process.env.NODE_ENV !== "production";

// PII patterns to mask
const PII_PATTERNS = [
  { pattern: /01[0125][0-9]{8}/g, replacer: maskPhone },
  {
    pattern: /"phone"\s*:\s*"([^"]+)"/g,
    replacer: (match: string, phone: string) => `"phone":"${maskPhone(phone)}"`,
  },
];

// Custom serializers for PII masking
const maskPii = (obj: unknown): unknown => {
  if (typeof obj === "string") {
    let result = obj;
    for (const { pattern, replacer } of PII_PATTERNS) {
      result = result.replace(
        pattern,
        replacer as (substring: string, ...args: unknown[]) => string,
      );
    }
    return result;
  }
  if (typeof obj === "object" && obj !== null) {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes("phone")) {
        masked[key] = typeof value === "string" ? maskPhone(value) : value;
      } else if (
        key.toLowerCase().includes("address") &&
        typeof value === "string"
      ) {
        masked[key] = maskAddress(value);
      } else {
        masked[key] = maskPii(value);
      }
    }
    return masked;
  }
  return obj;
};

// Create base logger
const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    isDevelopment && process.env.LOG_PRETTY === "true"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: "operations-agent",
    env: process.env.NODE_ENV || "development",
  },
});

// Logger wrapper with context injection
class Logger {
  private context: string;
  private logger: pino.Logger;

  constructor(context: string) {
    this.context = context;
    this.logger = baseLogger.child({ context });
  }

  private enrichLog(data?: Record<string, unknown>): Record<string, unknown> {
    const correlationId = getCorrelationId();
    const merchantId = getMerchantId();
    const masked = maskPii(data || {}) as Record<string, unknown>;

    return {
      correlationId,
      merchantId,
      ...masked,
    };
  }

  info(message: string, data?: Record<string, unknown>) {
    this.logger.info(this.enrichLog(data), message);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.logger.warn(this.enrichLog(data), message);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>) {
    this.logger.error(
      {
        ...this.enrichLog(data),
        error: error
          ? {
              message: error.message,
              name: error.name,
              stack: error.stack,
            }
          : undefined,
      },
      message,
    );
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.logger.debug(this.enrichLog(data), message);
  }

  trace(message: string, data?: Record<string, unknown>) {
    this.logger.trace(this.enrichLog(data), message);
  }
}

// Factory function for creating loggers
export const createLogger = (context: string = "app"): Logger => {
  return new Logger(context);
};

// Default logger instance
export const logger = createLogger("app");

// Pino HTTP logger for requests
export const httpLogger = baseLogger.child({ context: "http" });
