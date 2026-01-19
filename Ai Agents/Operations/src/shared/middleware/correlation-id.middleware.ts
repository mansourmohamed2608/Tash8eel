import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

// Extend Express Request to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string) || uuidv4();
    
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    
    next();
  }
}

// Async local storage for correlation ID (for use in services)
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  merchantId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getCorrelationId = (): string => {
  return requestContext.getStore()?.correlationId || 'unknown';
};

export const getMerchantId = (): string | undefined => {
  return requestContext.getStore()?.merchantId;
};
