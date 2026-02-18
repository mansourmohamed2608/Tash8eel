/**
 * Unified API client exports for Tash8eel portal.
 *
 * This barrel re-exports the two API layers so pages can import from a single location.
 *
 * Usage guide:
 *  - `merchantApi`   — for pages that use the x-api-key pattern (api.ts).
 *  - `portalApi`     — for pages that use JWT / next-auth session (authenticated-api.ts).
 *  - `apiFetch`      — low-level fetcher with api-key header support.
 *  - `authenticatedFetch` — low-level fetcher with JWT from next-auth.
 *
 * Legacy objects (`paymentsApi`, `visionApi`, `kpisApi`) are re-exported for
 * backward compatibility but are deprecated — new code should use `merchantApi`.
 */

// Primary API clients
export {
  merchantApi,
  apiFetch,
  checkApiHealth,
  getConnectionStatus,
} from "./api";
export { default as portalApi, authenticatedFetch } from "./authenticated-api";
export type { ApiError } from "./authenticated-api";

// Deprecated — kept for backward compat, will be removed in future
export { paymentsApi, visionApi, kpisApi } from "./api";
