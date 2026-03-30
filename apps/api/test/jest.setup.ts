// Jest setup file
// Add any global test setup here

// CRITICAL: Disable dotenv auto-loading and set test database BEFORE anything else
// Dotenv v17+ has auto-loading that we need to disable
process.env.DOTENV_CONFIG_DEBUG = ""; // Disable debug log

// Use DATABASE_URL from environment - required for tests
// CI should set this to a test database, locally use .env file
if (!process.env.DATABASE_URL) {
  // Try to load from .env file
  require("dotenv").config({
    path: require("path").join(__dirname, "..", "..", "..", ".env"),
  });
}

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL not set. Tests require a database connection.",
  );
  console.error(
    "Set DATABASE_URL environment variable or create .env file in project root.",
  );
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";
}
process.env.REDIS_URL = "redis://localhost:6380";
process.env.REDIS_ENABLED = "false"; // Disable Redis in tests to avoid connection issues
process.env.NODE_ENV = "test";

// Disable Meta webhook signature validation in tests
process.env.META_APP_SECRET = "";
process.env.WEBHOOK_VERIFY_TOKEN = "test_verify_token";

// Increase timeout for integration tests (Neon cold starts can be slow)
jest.setTimeout(90000);

// Log which database we're using for debugging
console.log(
  `[jest.setup] Using DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@")}`,
);

// Don't override API keys if set in .env
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || "test-admin-key";
process.env.INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY || "test-internal-key";

// Use mocked LLM behavior in tests by default to keep e2e deterministic.
// Set USE_REAL_OPENAI_IN_TESTS=true only when explicitly validating live model behavior.
if (process.env.USE_REAL_OPENAI_IN_TESTS !== "true") {
  process.env.OPENAI_API_KEY =
    "sk-test-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.AI_STRICT_MODE = "false";
}

// Suppress console logs during tests
if (process.env.SUPPRESS_LOGS === "true") {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Track NestJS app instances for cleanup
const appInstances: any[] = [];

// Track TestingModules for cleanup (unit tests)
const moduleInstances: any[] = [];

// Global helper to register app instances for cleanup (e2e tests)
(global as any).registerTestApp = (app: any) => {
  appInstances.push(app);
};

// Global helper to register TestingModule instances for cleanup (unit tests)
(global as any).registerTestModule = (module: any) => {
  moduleInstances.push(module);
};

// Global teardown - close all app and module instances
afterAll(async () => {
  // Close NestJS apps (e2e tests)
  for (const app of appInstances) {
    try {
      if (app && typeof app.close === "function") {
        await app.close();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  appInstances.length = 0;

  // Close TestingModules (unit tests)
  for (const module of moduleInstances) {
    try {
      if (module && typeof module.close === "function") {
        await module.close();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  moduleInstances.length = 0;

  // Clear all timers
  jest.clearAllTimers();
  jest.useRealTimers();

  // Give time for async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Force garbage collection if available (helps with connection cleanup)
  if (global.gc) {
    global.gc();
  }
});
