import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const CORRELATION_ID_HEADER = "x-correlation-id";

// Extend Express Request to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

// UUIDs are 36 characters in the canonical format (8-4-4-4-12)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Accept x-correlation-id only from trusted internal callers (worker→api).
    // Validate that it is a well-formed UUID to prevent log injection; otherwise
    // generate a fresh one. Public clients should NOT be able to forge correlation
    // IDs that propagate into logs and audit records.
    const incomingId = req.headers[CORRELATION_ID_HEADER] as string | undefined;
    const isInternalCaller =
      process.env.INTERNAL_CALL_SECRET &&
      req.headers["x-internal-call"] === process.env.INTERNAL_CALL_SECRET;
    const correlationId =
      isInternalCaller && incomingId && UUID_REGEX.test(incomingId)
        ? incomingId
        : uuidv4();

    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}

// Async local storage for correlation ID (for use in services)
import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  correlationId: string;
  merchantId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getCorrelationId = (): string => {
  return requestContext.getStore()?.correlationId || "unknown";
};

export const getMerchantId = (): string | undefined => {
  return requestContext.getStore()?.merchantId;
};
