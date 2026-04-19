import { Page } from "@playwright/test";

/** Credentials for the seeded demo merchant (dev/staging only) */
export const DEMO = {
  merchantId: "demo-merchant",
  email: "demo@tash8eel.com",
  password: "demo123",
} as const;

/** Admin credentials (dev/staging only) */
export const ADMIN = {
  merchantId: "system",
  email: "admin@tash8eel.com",
  password: "Admin123!",
} as const;

/**
 * Fill in and submit the login form.
 * Waits for navigation away from /login before resolving.
 */
export async function login(
  page: Page,
  creds: { merchantId: string; email: string; password: string },
) {
  await page.goto("/login");
  await page.fill("#merchantId", creds.merchantId);
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await page.click('button[type="submit"]');
  // Wait for redirect — the app uses window.location.href so wait for URL change
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}
