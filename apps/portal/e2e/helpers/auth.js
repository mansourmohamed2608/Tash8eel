"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN = exports.DEMO = void 0;
exports.login = login;
/** Credentials for the seeded demo merchant (dev/staging only) */
exports.DEMO = {
  merchantId: "demo-merchant",
  email: "demo@tash8eel.com",
  password: "demo123",
};
/** Admin credentials (dev/staging only) */
exports.ADMIN = {
  merchantId: "system",
  email: "admin@tash8eel.com",
  password: "Admin123!",
};
/**
 * Fill in and submit the login form.
 * Waits for navigation away from /login before resolving.
 */
async function login(page, creds) {
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
