"use strict";
// Jest setup file for Worker tests
jest.setTimeout(30000);
// Mock environment variables - point to test infrastructure
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
    "postgresql://test_user:test_password@localhost:5433/operations_test";
process.env.REDIS_URL = "redis://localhost:6380";
process.env.REDIS_ENABLED = "false"; // Disable Redis in tests to avoid connection issues
process.env.OPENAI_API_KEY = "sk-test-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.OPENAI_MODEL = "gpt-4o-mini";
// Track NestJS app instances for cleanup
const appInstances = [];
// Track TestingModules for cleanup (unit tests)
const moduleInstances = [];
// Global helper to register app instances for cleanup (e2e tests)
global.registerTestApp = (app) => {
    appInstances.push(app);
};
// Global helper to register TestingModule instances for cleanup (unit tests)
global.registerTestModule = (module) => {
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
        }
        catch (error) {
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
        }
        catch (error) {
            // Ignore errors during cleanup
        }
    }
    moduleInstances.length = 0;
    // Clear all timers (important for @Cron and @Interval decorators)
    jest.clearAllTimers();
    // Give time for async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
});
