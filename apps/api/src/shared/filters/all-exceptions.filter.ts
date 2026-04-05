import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { createLogger } from "../logging/logger";
import { getCorrelationId } from "../middleware/correlation-id.middleware";

const logger = createLogger("ExceptionFilter");

const TECHNICAL_MESSAGE_PATTERNS = [
  /cannot\s+(get|post|put|patch|delete)\s+\//i,
  /column\s+.+\s+does not exist/i,
  /relation\s+.+\s+does not exist/i,
  /invalid input syntax for type/i,
  /syntax error at or near/i,
  /duplicate key value violates unique constraint/i,
  /null value in column/i,
  /stack/i,
  /exception/i,
  /<!doctype html>/i,
  /<html/i,
];

const toMessageString = (input: unknown): string => {
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === "string" ? item : String(item)))
      .filter(Boolean)
      .join("، ");
  }
  if (typeof input === "string") return input;
  if (input === undefined || input === null) return "";
  return String(input);
};

const sanitizePublicMessage = (rawMessage: string, status: number): string => {
  const safeMessage = toMessageString(rawMessage).trim();
  const lower = safeMessage.toLowerCase();

  if (
    status === HttpStatus.UNAUTHORIZED ||
    status === HttpStatus.FORBIDDEN ||
    lower.includes("invalid or missing admin api key")
  ) {
    return "غير مصرح.";
  }

  const isTechnical = TECHNICAL_MESSAGE_PATTERNS.some((pattern) =>
    pattern.test(safeMessage),
  );
  if (status === HttpStatus.NOT_FOUND && isTechnical) {
    return "الخدمة المطلوبة غير متاحة حالياً.";
  }

  if (isTechnical || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return "حدث خطأ تقني أثناء تنفيذ الطلب. حاول مرة أخرى لاحقاً.";
  }

  return safeMessage || "حدث خطأ غير متوقع. حاول مرة أخرى.";
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const correlationId = getCorrelationId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "حدث خطأ غير متوقع. حاول مرة أخرى.";
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      let rawMessage = "";

      if (typeof exceptionResponse === "string") {
        rawMessage = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const resp = exceptionResponse as Record<string, unknown>;
        rawMessage = toMessageString(resp.message);
        details = resp.details;
      }

      message = sanitizePublicMessage(rawMessage || message, status);
      const technicalHidden = message !== rawMessage && rawMessage !== "";
      if (
        status === HttpStatus.UNAUTHORIZED ||
        status === HttpStatus.FORBIDDEN
      ) {
        logger.warn("Authentication/authorization request rejected", {
          correlationId,
          status,
          rawMessage,
          method: request?.method,
          path: request?.originalUrl || request?.url,
        });
      } else if (technicalHidden || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        details = undefined;
        logger.error("HTTP exception sanitized for client", exception, {
          correlationId,
          status,
          rawMessage,
        });
      }
    } else if (exception instanceof Error) {
      // Hide internal error details from clients; log full error server-side.
      message = "حدث خطأ غير متوقع. حاول مرة أخرى.";
      logger.error("Unhandled exception", exception, { correlationId });
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
