import { test, expect } from "@playwright/test";
import { DEMO, ADMIN, login } from "./helpers/auth";

test.describe("Authentication", () => {
  test("login page renders RTL form", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/تسجيل الدخول|Tash8eel/i);
    await expect(page.locator("#merchantId")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText(
      "تسجيل الدخول",
    );
  });

  test("wrong credentials shows Arabic error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#merchantId", "wrong-merchant");
    await page.fill("#email", "bad@example.com");
    await page.fill("#password", "badpass");
    await page.click('button[type="submit"]');
    // Error message should appear (div with bg-red-50)
    await expect(
      page.locator(".bg-red-50, .text-red-700").first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("demo merchant logs in and reaches dashboard", async ({ page }) => {
    await login(page, DEMO);
    await expect(page).toHaveURL(/\/merchant\/dashboard/);
  });

  test("admin logs in and reaches admin dashboard", async ({ page }) => {
    await login(page, ADMIN);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("authenticated user is redirected away from /login", async ({
    page,
  }) => {
    // Log in first
    await login(page, DEMO);
    // Revisit /login — should redirect to dashboard
    await page.goto("/login");
    await expect(page).toHaveURL(/\/merchant\/dashboard/, {
      timeout: 10_000,
    });
  });

  test("protected route redirects unauthenticated user to login", async ({
    page,
  }) => {
    // Fresh context (no session cookie) — just navigate directly
    await page.goto("/merchant/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("logout clears session", async ({ page }) => {
    await login(page, DEMO);
    await expect(page).toHaveURL(/\/merchant\/dashboard/);
    // Call NextAuth signOut API endpoint directly
    await page.goto("/api/auth/signout");
    await page.click('button[value="yes"]', { timeout: 5_000 }).catch(() => {
      // Some NextAuth builds auto-redirect; tolerate missing button
    });
    await page.goto("/merchant/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
