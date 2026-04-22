"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const auth_1 = require("./helpers/auth");
test_1.test.describe("Authentication", () => {
  (0, test_1.test)("login page renders RTL form", async ({ page }) => {
    await page.goto("/login");
    await (0, test_1.expect)(page).toHaveTitle(/تسجيل الدخول|Tash8eel/i);
    await (0, test_1.expect)(page.locator("#merchantId")).toBeVisible();
    await (0, test_1.expect)(page.locator("#email")).toBeVisible();
    await (0, test_1.expect)(page.locator("#password")).toBeVisible();
    await (0, test_1.expect)(
      page.locator('button[type="submit"]'),
    ).toContainText("تسجيل الدخول");
  });
  (0, test_1.test)("wrong credentials shows Arabic error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#merchantId", "wrong-merchant");
    await page.fill("#email", "bad@example.com");
    await page.fill("#password", "badpass");
    await page.click('button[type="submit"]');
    // Error message should appear (div with bg-red-50)
    await (0, test_1.expect)(
      page.locator(".bg-red-50, .text-red-700").first(),
    ).toBeVisible({ timeout: 8_000 });
  });
  (0, test_1.test)(
    "demo merchant logs in and reaches dashboard",
    async ({ page }) => {
      await (0, auth_1.login)(page, auth_1.DEMO);
      await (0, test_1.expect)(page).toHaveURL(/\/merchant\/dashboard/);
    },
  );
  (0, test_1.test)(
    "admin logs in and reaches admin dashboard",
    async ({ page }) => {
      await (0, auth_1.login)(page, auth_1.ADMIN);
      await (0, test_1.expect)(page).toHaveURL(/\/admin\/dashboard/);
    },
  );
  (0, test_1.test)(
    "authenticated user is redirected away from /login",
    async ({ page }) => {
      // Log in first
      await (0, auth_1.login)(page, auth_1.DEMO);
      // Revisit /login — should redirect to dashboard
      await page.goto("/login");
      await (0, test_1.expect)(page).toHaveURL(/\/merchant\/dashboard/, {
        timeout: 10_000,
      });
    },
  );
  (0, test_1.test)(
    "protected route redirects unauthenticated user to login",
    async ({ page }) => {
      // Fresh context (no session cookie) — just navigate directly
      await page.goto("/merchant/dashboard");
      await (0, test_1.expect)(page).toHaveURL(/\/login/, { timeout: 10_000 });
    },
  );
  (0, test_1.test)("logout clears session", async ({ page }) => {
    await (0, auth_1.login)(page, auth_1.DEMO);
    await (0, test_1.expect)(page).toHaveURL(/\/merchant\/dashboard/);
    // Call NextAuth signOut API endpoint directly
    await page.goto("/api/auth/signout");
    await page.click('button[value="yes"]', { timeout: 5_000 }).catch(() => {
      // Some NextAuth builds auto-redirect; tolerate missing button
    });
    await page.goto("/merchant/dashboard");
    await (0, test_1.expect)(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
