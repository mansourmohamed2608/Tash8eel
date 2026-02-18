/**
 * Base error class for Tash8eel application errors
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, "NOT_FOUND", 404, true, { resource, id });
  }
}

/**
 * Bad request / validation error
 */
export class ValidationError extends AppError {
  public readonly errors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    errors: Array<{ field: string; message: string }> = [],
  ) {
    super(message, "VALIDATION_ERROR", 400, true, { errors });
    this.errors = errors;
  }
}

/**
 * Unauthorized access error
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401, true);
  }
}

/**
 * Forbidden access error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, "FORBIDDEN", 403, true);
  }
}

/**
 * Conflict error (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONFLICT", 409, true, context);
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends AppError {
  public readonly retryAfterMs: number;

  constructor(
    message: string = "Rate limit exceeded",
    retryAfterMs: number = 60000,
  ) {
    super(message, "RATE_LIMIT_EXCEEDED", 429, true, { retryAfterMs });
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Token budget exceeded error
 */
export class TokenBudgetExceededError extends AppError {
  public readonly merchantId: string;
  public readonly budget: number;
  public readonly used: number;

  constructor(merchantId: string, budget: number, used: number) {
    super(
      `Token budget exceeded for merchant ${merchantId}. Budget: ${budget}, Used: ${used}`,
      "TOKEN_BUDGET_EXCEEDED",
      429,
      true,
      { merchantId, budget, used },
    );
    this.merchantId = merchantId;
    this.budget = budget;
    this.used = used;
  }
}

/**
 * Lock acquisition failed error
 */
export class LockAcquisitionError extends AppError {
  public readonly lockKey: string;

  constructor(lockKey: string) {
    super(
      `Failed to acquire lock: ${lockKey}`,
      "LOCK_ACQUISITION_FAILED",
      503,
      true,
      { lockKey },
    );
    this.lockKey = lockKey;
  }
}

/**
 * External service error (e.g., OpenAI, delivery provider)
 */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string;
  public readonly originalError?: Error;

  constructor(serviceName: string, message: string, originalError?: Error) {
    super(
      `${serviceName} error: ${message}`,
      "EXTERNAL_SERVICE_ERROR",
      502,
      true,
      { serviceName, originalError: originalError?.message },
    );
    this.serviceName = serviceName;
    this.originalError = originalError;
  }
}

/**
 * LLM service error
 */
export class LLMServiceError extends ExternalServiceError {
  constructor(message: string, originalError?: Error) {
    super("LLM", message, originalError);
    // code is set by parent constructor
  }
}

/**
 * Continuity mode error - triggers graceful degradation
 */
export class ContinuityModeError extends AppError {
  public readonly reason:
    | "llm_failure"
    | "redis_failure"
    | "budget_exceeded"
    | "unexpected";

  constructor(
    reason: "llm_failure" | "redis_failure" | "budget_exceeded" | "unexpected",
    message?: string,
  ) {
    const defaultMessages = {
      llm_failure: "LLM service unavailable",
      redis_failure: "Redis service unavailable",
      budget_exceeded: "Token budget exceeded",
      unexpected: "Unexpected system error",
    };
    super(message || defaultMessages[reason], "CONTINUITY_MODE", 503, true, {
      reason,
    });
    this.reason = reason;
  }
}

/**
 * Check if error is operational (expected) vs programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: Error): {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
} {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.context,
      },
    };
  }

  // For non-operational errors, don't expose internal details
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  };
}
