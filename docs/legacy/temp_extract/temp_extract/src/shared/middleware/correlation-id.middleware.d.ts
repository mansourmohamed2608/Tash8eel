import { NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
export declare const CORRELATION_ID_HEADER = "x-correlation-id";
declare global {
    namespace Express {
        interface Request {
            correlationId: string;
        }
    }
}
export declare class CorrelationIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void;
}
import { AsyncLocalStorage } from "async_hooks";
export interface RequestContext {
    correlationId: string;
    merchantId?: string;
}
export declare const requestContext: AsyncLocalStorage<RequestContext>;
export declare const getCorrelationId: () => string;
export declare const getMerchantId: () => string | undefined;
