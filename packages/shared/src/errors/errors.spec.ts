import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  TokenBudgetExceededError,
  LockAcquisitionError,
  ExternalServiceError,
  LLMServiceError,
  ContinuityModeError,
  isOperationalError,
  formatErrorResponse,
} from "./index";

describe("Errors", () => {
  describe("AppError", () => {
    it("should create with correct properties", () => {
      const err = new AppError("test error", "TEST", 400, true, { foo: "bar" });
      expect(err.message).toBe("test error");
      expect(err.code).toBe("TEST");
      expect(err.statusCode).toBe(400);
      expect(err.isOperational).toBe(true);
      expect(err.context).toEqual({ foo: "bar" });
      expect(err).toBeInstanceOf(Error);
    });

    it("should default to 500 status code", () => {
      const err = new AppError("test", "TEST");
      expect(err.statusCode).toBe(500);
    });
  });

  describe("NotFoundError", () => {
    it("should create with resource name", () => {
      const err = new NotFoundError("Order");
      expect(err.message).toBe("Order not found");
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
    });

    it("should include ID in message", () => {
      const err = new NotFoundError("Order", "123");
      expect(err.message).toBe("Order with id '123' not found");
    });
  });

  describe("ValidationError", () => {
    it("should create with error details", () => {
      const errors = [{ field: "email", message: "required" }];
      const err = new ValidationError("Invalid input", errors);
      expect(err.statusCode).toBe(400);
      expect(err.errors).toEqual(errors);
    });
  });

  describe("UnauthorizedError", () => {
    it("should default message", () => {
      const err = new UnauthorizedError();
      expect(err.message).toBe("Unauthorized");
      expect(err.statusCode).toBe(401);
    });
  });

  describe("ForbiddenError", () => {
    it("should create with 403", () => {
      const err = new ForbiddenError("Not allowed");
      expect(err.statusCode).toBe(403);
    });
  });

  describe("ConflictError", () => {
    it("should create with 409", () => {
      const err = new ConflictError("Duplicate", { key: "email" });
      expect(err.statusCode).toBe(409);
      expect(err.context).toEqual({ key: "email" });
    });
  });

  describe("RateLimitError", () => {
    it("should create with retry info", () => {
      const err = new RateLimitError("Too fast", 5000);
      expect(err.statusCode).toBe(429);
      expect(err.retryAfterMs).toBe(5000);
    });

    it("should have default retry of 60s", () => {
      const err = new RateLimitError();
      expect(err.retryAfterMs).toBe(60000);
    });
  });

  describe("TokenBudgetExceededError", () => {
    it("should track merchant budget", () => {
      const err = new TokenBudgetExceededError("m_123", 100000, 110000);
      expect(err.merchantId).toBe("m_123");
      expect(err.budget).toBe(100000);
      expect(err.used).toBe(110000);
      expect(err.statusCode).toBe(429);
    });
  });

  describe("LockAcquisitionError", () => {
    it("should include lock key", () => {
      const err = new LockAcquisitionError("order:123");
      expect(err.lockKey).toBe("order:123");
      expect(err.statusCode).toBe(503);
    });
  });

  describe("ExternalServiceError", () => {
    it("should wrap external errors", () => {
      const original = new Error("connection refused");
      const err = new ExternalServiceError("Redis", "Down", original);
      expect(err.serviceName).toBe("Redis");
      expect(err.statusCode).toBe(502);
      expect(err.originalError).toBe(original);
    });
  });

  describe("LLMServiceError", () => {
    it("should extend ExternalServiceError", () => {
      const err = new LLMServiceError("Rate limited");
      expect(err.serviceName).toBe("LLM");
      expect(err).toBeInstanceOf(ExternalServiceError);
    });
  });

  describe("ContinuityModeError", () => {
    it("should create for different reasons", () => {
      const llm = new ContinuityModeError("llm_failure");
      expect(llm.reason).toBe("llm_failure");
      expect(llm.message).toBe("LLM service unavailable");
      expect(llm.statusCode).toBe(503);

      const redis = new ContinuityModeError("redis_failure");
      expect(redis.message).toBe("Redis service unavailable");

      const custom = new ContinuityModeError("unexpected", "Something broke");
      expect(custom.message).toBe("Something broke");
    });
  });

  describe("isOperationalError", () => {
    it("should return true for AppError", () => {
      expect(isOperationalError(new NotFoundError("X"))).toBe(true);
    });

    it("should return false for programming errors", () => {
      expect(isOperationalError(new Error("random"))).toBe(false);
    });

    it("should respect isOperational flag", () => {
      const err = new AppError("bug", "BUG", 500, false);
      expect(isOperationalError(err)).toBe(false);
    });
  });

  describe("formatErrorResponse", () => {
    it("should format AppError with code and details", () => {
      const err = new ValidationError("Bad input", [
        { field: "name", message: "required" },
      ]);
      const response = formatErrorResponse(err);
      expect(response.error.code).toBe("VALIDATION_ERROR");
      expect(response.error.message).toBe("Bad input");
    });

    it("should hide details for non-operational errors", () => {
      const err = new Error("secret stack trace");
      const response = formatErrorResponse(err);
      expect(response.error.code).toBe("INTERNAL_ERROR");
      expect(response.error.message).toBe("An unexpected error occurred");
    });
  });
});
