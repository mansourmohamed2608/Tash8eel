import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

// Start the MSW mock server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));

// Reset handlers after each test so they don't bleed between tests
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
