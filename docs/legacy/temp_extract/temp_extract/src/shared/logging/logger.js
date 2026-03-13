"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpLogger = exports.logger = exports.createLogger = void 0;
const pino_1 = __importDefault(require("pino"));
const correlation_id_middleware_1 = require("../middleware/correlation-id.middleware");
const helpers_1 = require("../utils/helpers");
const isDevelopment = process.env.NODE_ENV !== "production";
// PII patterns to mask
const PII_PATTERNS = [
    { pattern: /01[0125][0-9]{8}/g, replacer: helpers_1.maskPhone },
    {
        pattern: /"phone"\s*:\s*"([^"]+)"/g,
        replacer: (match, phone) => `"phone":"${(0, helpers_1.maskPhone)(phone)}"`,
    },
];
// Custom serializers for PII masking
const maskPii = (obj) => {
    if (typeof obj === "string") {
        let result = obj;
        for (const { pattern, replacer } of PII_PATTERNS) {
            result = result.replace(pattern, replacer);
        }
        return result;
    }
    if (typeof obj === "object" && obj !== null) {
        const masked = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key.toLowerCase().includes("phone")) {
                masked[key] = typeof value === "string" ? (0, helpers_1.maskPhone)(value) : value;
            }
            else if (key.toLowerCase().includes("address") &&
                typeof value === "string") {
                masked[key] = (0, helpers_1.maskAddress)(value);
            }
            else {
                masked[key] = maskPii(value);
            }
        }
        return masked;
    }
    return obj;
};
// Create base logger
const baseLogger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || "info",
    transport: isDevelopment && process.env.LOG_PRETTY === "true"
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
    context;
    logger;
    constructor(context) {
        this.context = context;
        this.logger = baseLogger.child({ context });
    }
    enrichLog(data) {
        const correlationId = (0, correlation_id_middleware_1.getCorrelationId)();
        const merchantId = (0, correlation_id_middleware_1.getMerchantId)();
        const masked = maskPii(data || {});
        return {
            correlationId,
            merchantId,
            ...masked,
        };
    }
    info(message, data) {
        this.logger.info(this.enrichLog(data), message);
    }
    warn(message, data) {
        this.logger.warn(this.enrichLog(data), message);
    }
    error(message, error, data) {
        this.logger.error({
            ...this.enrichLog(data),
            error: error
                ? {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                }
                : undefined,
        }, message);
    }
    debug(message, data) {
        this.logger.debug(this.enrichLog(data), message);
    }
    trace(message, data) {
        this.logger.trace(this.enrichLog(data), message);
    }
}
// Factory function for creating loggers
const createLogger = (context = "app") => {
    return new Logger(context);
};
exports.createLogger = createLogger;
// Default logger instance
exports.logger = (0, exports.createLogger)("app");
// Pino HTTP logger for requests
exports.httpLogger = baseLogger.child({ context: "http" });
