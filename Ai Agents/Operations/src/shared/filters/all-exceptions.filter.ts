import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { createLogger } from '../logging/logger';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

const logger = createLogger('ExceptionFilter');

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const correlationId = getCorrelationId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        details = resp.details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      logger.error('Unhandled exception', exception, { correlationId });
    }

    response.status(status).json({
      statusCode: status,
      message,
      details,
      correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
