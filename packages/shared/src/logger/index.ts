import pino, { Logger, LoggerOptions } from "pino";
import { v4 as uuidv4 } from "uuid";

export interface LogContext {
  correlationId?: string;
  merchantId?: string;
  conversationId?: string;
  orderId?: string;
  [key: string]: unknown;
}

const isProduction = process.env.NODE_ENV === "production";

const defaultOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
};

const rootLogger = pino(defaultOptions);

export function createLogger(name: string, context?: LogContext): Logger {
  return rootLogger.child({ name, ...context });
}

export function createChildLogger(parent: Logger, context: LogContext): Logger {
  return parent.child(context);
}

export function generateCorrelationId(): string {
  return uuidv4();
}

export class StructuredLogger {
  private logger: Logger;
  private context: LogContext;

  constructor(name: string, context: LogContext = {}) {
    this.logger = createLogger(name, context);
    this.context = context;
  }

  withContext(additionalContext: LogContext): StructuredLogger {
    const newLogger = new StructuredLogger(
      this.logger.bindings().name as string,
      {
        ...this.context,
        ...additionalContext,
      },
    );
    return newLogger;
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info({ ...data }, message);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug({ ...data }, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn({ ...data }, message);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.error(
      {
        ...data,
        err: error
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

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.fatal(
      {
        ...data,
        err: error
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
}

export { Logger };
export default rootLogger;
