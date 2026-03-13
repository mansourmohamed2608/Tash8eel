import pino from "pino";
declare class Logger {
    private context;
    private logger;
    constructor(context: string);
    private enrichLog;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, error?: Error, data?: Record<string, unknown>): void;
    debug(message: string, data?: Record<string, unknown>): void;
    trace(message: string, data?: Record<string, unknown>): void;
}
export declare const createLogger: (context?: string) => Logger;
export declare const logger: Logger;
export declare const httpLogger: pino.Logger<never>;
export {};
