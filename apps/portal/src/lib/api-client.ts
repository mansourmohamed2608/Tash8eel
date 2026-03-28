/**
 * Unified API client exports for Tash8eel portal.
 *
 * This barrel re-exports the single consolidated client entry point so pages
 * can import from one location.
 */

// Primary API clients
export {
  merchantApi,
  apiFetch,
  checkApiHealth,
  getConnectionStatus,
} from "./client";
export { default as portalApi, authenticatedFetch } from "./client";
export type { ApiError } from "./client";

// Deprecated - kept for backward compat, will be removed in future
export { paymentsApi, visionApi, kpisApi } from "./client";
