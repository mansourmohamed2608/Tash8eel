import { test, expect, Page } from "@playwright/test";
import { DEMO, ADMIN, login } from "./helpers/auth";

async function noErrors(page: Page) {
  await expect(page.locator("h2:has-text('Something went wrong')")).toHaveCount(
    0,
  );
  await expect(
    page.locator("h1:has-text('404'), h1:has-text('500')"),
  ).toHaveCount(0);
}

/** Merchant pages that should render without crashing for a DEMO merchant */
const MERCHANT_PAGES = [
  "/merchant/dashboard",
  "/merchant/conversations",
  "/merchant/orders",
  "/merchant/inventory",
  "/merchant/analytics",
  "/merchant/reports",
  "/merchant/kpis",
  "/merchant/loyalty",
  "/merchant/team",
  "/merchant/settings",
  "/merchant/billing",
  "/merchant/plan",
  "/merchant/knowledge-base",
  "/merchant/notifications",
  "/merchant/customers",
  "/merchant/audit",
] as const;

test.describe("Merchant portal smoke tests", () => {
  let sessionSetup = false;

  test.beforeEach(async ({ page }) => {
    await login(page, DEMO);
  });

  for (const path of MERCHANT_PAGES) {
    test(`${path} renders without error`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noErrors(page);
      // Must stay within the portal (no redirect to login)
      await expect(page).not.toHaveURL(/\/login/);
    });
  }
});

test.describe("Admin portal smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
  });

  for (const path of ["/admin/dashboard", "/admin/merchants"] as const) {
    test(`${path} renders without error`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noErrors(page);
      await expect(page).not.toHaveURL(/\/login/);
    });
  }
});

test.describe("Public pages", () => {
  test("/login renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(
      errors.filter(
        (e) => !e.includes("ResizeObserver") && !e.includes("network"),
      ),
    ).toHaveLength(0);
  });

  test("/signup renders without crashing", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await noErrors(page);
  });
});
