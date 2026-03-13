"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
/**
 * Playwright E2E configuration for Tash8eel Portal.
 *
 * Requires the portal to be running at http://localhost:3001.
 * Set PORTAL_URL env var to override.
 *
 * Run: pnpm --filter @tash8eel/portal test:e2e
 * Install browsers once: npx playwright install --with-deps chromium
 */
const BASE_URL = process.env.PORTAL_URL || "http://localhost:3001";
exports.default = (0, test_1.defineConfig)({
    testDir: "./e2e",
    fullyParallel: true,
    // Playwright auto-discovers e2e/tsconfig.json for the e2e directory
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
    ],
    use: {
        baseURL: BASE_URL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        // Arabic RTL: use Cairo timezone for consistent date assertions
        timezoneId: "Africa/Cairo",
        locale: "ar-EG",
    },
    projects: [
        {
            name: "chromium",
            use: { ...test_1.devices["Desktop Chrome"] },
        },
        {
            name: "mobile-safari",
            use: { ...test_1.devices["iPhone 14"] },
        },
    ],
    // Optional: spin up Next.js dev server automatically when running locally
    // Disabled by default so CI can start the server separately
    // webServer: {
    //   command: "npm run dev",
    //   url: BASE_URL,
    //   reuseExistingServer: !process.env.CI,
    //   timeout: 120_000,
    // },
});
