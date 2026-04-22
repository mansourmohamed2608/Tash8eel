import { expect, test } from "@playwright/test";
import { DEMO, login } from "./helpers/auth";

test.describe("Forecast What-If", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO);
    await page.goto("/merchant/forecast");
    await page.waitForLoadState("networkidle");
  });

  test("pricing scenario runs successfully from the UI", async ({ page }) => {
    await page.getByRole("tab", { name: "ماذا لو" }).click();
    await page.getByRole("button", { name: "تغيير السعر" }).click();
    await page.getByRole("button", { name: "تشغيل السيناريو" }).click();

    await expect(page.getByText("تعذر تشغيل السيناريو")).toHaveCount(0);
    await expect(page.getByText("الأساس")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("المتوقع")).toBeVisible();
  });
});
