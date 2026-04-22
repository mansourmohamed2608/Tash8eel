import { Page } from "@playwright/test";
/** Credentials for the seeded demo merchant (dev/staging only) */
export declare const DEMO: {
  readonly merchantId: "demo-merchant";
  readonly email: "demo@tash8eel.com";
  readonly password: "demo123";
};
/** Admin credentials (dev/staging only) */
export declare const ADMIN: {
  readonly merchantId: "system";
  readonly email: "admin@tash8eel.com";
  readonly password: "Admin123!";
};
/**
 * Fill in and submit the login form.
 * Waits for navigation away from /login before resolving.
 */
export declare function login(
  page: Page,
  creds: {
    merchantId: string;
    email: string;
    password: string;
  },
): Promise<void>;
