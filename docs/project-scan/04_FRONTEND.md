# Phase 3 - Frontend Deep Scan (Portal)

## Stack & Architecture

- **Framework**: Next.js 14 (App Router) with React 18. Evidence: `apps/portal/package.json:6-33`.
- **UI toolkit**: Radix UI components + Tailwind CSS. Evidence: `apps/portal/package.json:12-36`, `apps/portal/tailwind.config.js:1-88`.
- **Auth**: NextAuth credentials provider + JWT session strategy. Evidence: `apps/portal/src/lib/auth.ts:1-154`.

## App Structure

- **App router** pages under apps/portal/src/app/\* for admin and merchant routes. Evidence: `apps/portal/src/app/layout.tsx:1-25`, `apps/portal/src/app/admin/page.tsx:1-17`, `apps/portal/src/app/merchant/page.tsx:1-80`.
- **Shared components** in apps/portal/src/components/\* (layout, charts, UI primitives). Evidence: `apps/portal/src/components/layout/sidebar.tsx:1-120`, `apps/portal/src/components/ui/button.tsx:1-60`.
- **Hooks** for auth, merchant, websocket, and toast state. Evidence: `apps/portal/src/hooks/use-auth.ts:1-29`, `apps/portal/src/hooks/use-merchant.tsx:1-90`, `apps/portal/src/hooks/use-websocket.ts:1-120`, `apps/portal/src/hooks/use-toast.ts:1-120`.

## API Client Patterns

- **authenticatedFetch** (NextAuth Bearer token) for portal endpoints. Evidence: `apps/portal/src/lib/authenticated-api.ts:20-99`.
- **apiFetch** (x-api-key or admin key) for merchant API usage. Evidence: `apps/portal/src/lib/api.ts:1-90`.

## Auth Handling

- NextAuth credentials provider supports demo users for development. Evidence: `apps/portal/src/lib/auth.ts:23-69`.
- Session callback attaches accessToken and user metadata. Evidence: `apps/portal/src/lib/auth.ts:107-154`.
- Route protection via middleware (withAuth). Evidence: `apps/portal/src/middleware.ts:1-53`.

## Routing, Code Splitting, Performance

- WebSocket hook connects to /ws namespace using socket.io-client. Evidence: `apps/portal/src/hooks/use-websocket.ts:1-120`.

## UI Consistency / Design System

- Tailwind configuration defines design tokens and Arabic font family. Evidence: `apps/portal/tailwind.config.js:9-70`.
- Reusable UI primitives under apps/portal/src/components/ui/\*. Evidence: `apps/portal/src/components/ui/button.tsx:1-60`, `apps/portal/src/components/ui/card.tsx:1-78`.

## Error Handling & Empty States

- authenticatedFetch converts non-OK responses to typed errors and handles timeouts. Evidence: `apps/portal/src/lib/authenticated-api.ts:65-99`.
- Components include basic loading/empty states (e.g., notifications popover). Evidence: `apps/portal/src/components/layout/notifications-popover.tsx:29-136`.

## Security Review (Frontend)

- No dangerouslySetInnerHTML usage found. Evidence: `docs/project-scan/12_SEARCH_LOG.md:57-63`.
- Auth tokens stored in NextAuth JWT session (not localStorage). Evidence: `apps/portal/src/lib/auth.ts:129-154`.
- WebSocket auth uses access token + merchantId in authenticate event; server currently trusts merchantId (backend issue). Evidence: `apps/portal/src/hooks/use-websocket.ts:78-119`, `apps/api/src/infrastructure/websocket/events.gateway.ts:47-82`.

## Accessibility / i18n / Responsiveness

- RTL layout and Arabic metadata in root layout. Evidence: `apps/portal/src/app/layout.tsx:6-20`.
- No dedicated i18n framework detected. **Not found in repository** (no next-intl, react-intl, or i18n config files). Evidence: `docs/project-scan/12_SEARCH_LOG.md:49-55`.
- No automated a11y testing config found (e.g., jest-axe, playwright a11y). **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:65-82`.

## Testing

- Portal unit/e2e test setup **not found in repository** (no Jest/Vitest/Cypress/Playwright configs in apps/portal/). Evidence: `docs/project-scan/12_SEARCH_LOG.md:29-35`.

## Build Tooling / Linting

- Next lint is configured via `apps/portal/package.json:6-9`.
- Tailwind/PostCSS configs present. Evidence: `apps/portal/tailwind.config.js:1-88`, `apps/portal/postcss.config.js:1-6`.
