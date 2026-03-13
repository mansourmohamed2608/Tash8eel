"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const auth_1 = require("./helpers/auth");
/**
 * Non-blocking check: expect an element to eventually appear or at least not
 * cause a page crash (404 / error boundary).
 */
async function expectNoErrorBoundary(page) {
    // Next.js error pages contain a specific heading
    await (0, test_1.expect)(page.locator("h2:has-text('Something went wrong')")).toHaveCount(0);
    await (0, test_1.expect)(page.locator("h1:has-text('404'), h1:has-text('500')")).toHaveCount(0);
}
test_1.test.describe("Merchant Dashboard", () => {
    test_1.test.beforeEach(async ({ page }) => {
        await (0, auth_1.login)(page, auth_1.DEMO);
        await page.goto("/merchant/dashboard");
        // Wait for the page content area to hydrate
        await page.waitForLoadState("networkidle");
    });
    (0, test_1.test)("renders without crashing", async ({ page }) => {
        await (0, test_1.expect)(page).toHaveURL(/\/merchant\/dashboard/);
        await expectNoErrorBoundary(page);
    });
    (0, test_1.test)("shows summary stat cards", async ({ page }) => {
        // Dashboard always has at least one Arabic stat card header
        // Text used in the premium insights row (always rendered)
        await (0, test_1.expect)(page.locator("text=السلات المستردة")).toBeVisible({
            timeout: 10_000,
        });
    });
    (0, test_1.test)("page title includes merchant or Tash8eel brand", async ({ page }) => {
        const title = await page.title();
        (0, test_1.expect)(title).toMatch(/تش8يل|Tash8eel|dashboard|لوحة/i);
    });
    (0, test_1.test)("sidebar navigation is present", async ({ page }) => {
        // Sidebar should have a link to orders
        await (0, test_1.expect)(page.locator("a[href='/merchant/orders']")).toBeVisible({
            timeout: 10_000,
        });
    });
    (0, test_1.test)("orders nav link is reachable from dashboard", async ({ page }) => {
        await page.click("a[href='/merchant/orders']");
        await page.waitForURL(/\/merchant\/orders/);
        await expectNoErrorBoundary(page);
    });
    (0, test_1.test)("conversations nav link is reachable", async ({ page }) => {
        await page.click("a[href='/merchant/conversations']");
        await page.waitForURL(/\/merchant\/conversations/);
        await expectNoErrorBoundary(page);
    });
});
