"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const auth_1 = require("./helpers/auth");
async function noErrors(page) {
  await (0, test_1.expect)(
    page.locator("h2:has-text('Something went wrong')"),
  ).toHaveCount(0);
  await (0, test_1.expect)(
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
];
test_1.test.describe("Merchant portal smoke tests", () => {
  let sessionSetup = false;
  test_1.test.beforeEach(async ({ page }) => {
    await (0, auth_1.login)(page, auth_1.DEMO);
  });
  for (const path of MERCHANT_PAGES) {
    (0, test_1.test)(`${path} renders without error`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noErrors(page);
      // Must stay within the portal (no redirect to login)
      await (0, test_1.expect)(page).not.toHaveURL(/\/login/);
    });
  }
});
test_1.test.describe("Admin portal smoke tests", () => {
  test_1.test.beforeEach(async ({ page }) => {
    await (0, auth_1.login)(page, auth_1.ADMIN);
  });
  for (const path of ["/admin/dashboard", "/admin/merchants"]) {
    (0, test_1.test)(`${path} renders without error`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noErrors(page);
      await (0, test_1.expect)(page).not.toHaveURL(/\/login/);
    });
  }
});
test_1.test.describe("Public pages", () => {
  (0, test_1.test)("/login renders without JS errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    (0, test_1.expect)(
      errors.filter(
        (e) => !e.includes("ResizeObserver") && !e.includes("network"),
      ),
    ).toHaveLength(0);
  });
  (0, test_1.test)("/signup renders without crashing", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await noErrors(page);
  });
});
