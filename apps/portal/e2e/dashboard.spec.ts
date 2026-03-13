import { test, expect, Page } from "@playwright/test";
import { DEMO, login } from "./helpers/auth";

/**
 * Non-blocking check: expect an element to eventually appear or at least not
 * cause a page crash (404 / error boundary).
 */
async function expectNoErrorBoundary(page: Page) {
  // Next.js error pages contain a specific heading
  await expect(page.locator("h2:has-text('Something went wrong')")).toHaveCount(
    0,
  );
  await expect(
    page.locator("h1:has-text('404'), h1:has-text('500')"),
  ).toHaveCount(0);
}

test.describe("Merchant Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO);
    await page.goto("/merchant/dashboard");
    // Wait for the page content area to hydrate
    await page.waitForLoadState("networkidle");
  });

  test("renders without crashing", async ({ page }) => {
    await expect(page).toHaveURL(/\/merchant\/dashboard/);
    await expectNoErrorBoundary(page);
  });

  test("shows summary stat cards", async ({ page }) => {
    // Dashboard always has at least one Arabic stat card header
    // Text used in the premium insights row (always rendered)
    await expect(page.locator("text=السلات المستردة")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("page title includes merchant or Tash8eel brand", async ({ page }) => {
    const title = await page.title();
    expect(title).toMatch(/تش8يل|Tash8eel|dashboard|لوحة/i);
  });

  test("sidebar navigation is present", async ({ page }) => {
    // Sidebar should have a link to orders
    await expect(page.locator("a[href='/merchant/orders']")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("orders nav link is reachable from dashboard", async ({ page }) => {
    await page.click("a[href='/merchant/orders']");
    await page.waitForURL(/\/merchant\/orders/);
    await expectNoErrorBoundary(page);
  });

  test("conversations nav link is reachable", async ({ page }) => {
    await page.click("a[href='/merchant/conversations']");
    await page.waitForURL(/\/merchant\/conversations/);
    await expectNoErrorBoundary(page);
  });
});
