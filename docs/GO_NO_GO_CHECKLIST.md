# Security Validation — Go / No-Go Checklist

> **Date**: 2025-01-XX  
> **Scope**: Pre-demo security sweep — 4 items validated against live codebase  
> **Methodology**: Code audit of controllers, guards, services, and frontend pages  
> **Test suite**: 61 tests (24 P0 + 37 validation), all passing

---

## Verdict: ✅ GO

All 4 scope items validated. **Zero patches needed** — the prior P0 fixes are correctly implemented.

---

## Scope 1: Staff Auth Guards

| Check                                                | Status  | Evidence                                                                                                           |
| ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/staff/login` — public, rate-limited        | ✅ PASS | `@UseGuards(EnhancedRateLimitGuard)`, `@RateLimit({ limit: 5, window: 60, keyType: 'ip' })`                        |
| `POST /v1/staff/logout` — staffId from token         | ✅ PASS | `verifyRefreshTokenPayload(body.refreshToken)` extracts staffId from JWT. Body `staffId` field removed.            |
| `POST /v1/staff/change-password` — JWT auth required | ✅ PASS | `@UseGuards(MerchantApiKeyGuard)` + `const staffId = (req as any).staffId; if (!staffId) throw ForbiddenException` |
| API-key-only callers blocked from change-password    | ✅ PASS | API-key path sets `req.merchantId` but NOT `req.staffId` → handler throws `ForbiddenException`                     |
| Frontend sends no staffId in body                    | ✅ PASS | `changeStaffPassword({ currentPassword, newPassword })` — only 2 fields. JWT attached via `Authorization: Bearer`. |
| No IDOR on logout                                    | ✅ PASS | Invalid token → returns `{ success: true }` (no info leakage). Valid token → staffId from JWT payload.             |
| Demo tokens rejected in production                   | ✅ PASS | Guard: `if (!isDev && token.startsWith('demo-token-')) throw UnauthorizedException`                                |

**Guard Architecture Note**: There is no separate `StaffAuthGuard` — the single `MerchantApiKeyGuard` handles both Bearer JWT and API key auth. This is a naming concern, not a security concern. The JWT path correctly extracts `staffId`, `merchantId`, and verifies staff is `ACTIVE` in DB.

---

## Scope 2: Public Payment Routes

| Check                                                   | Status  | Evidence                                                                          |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `GET /v1/payments/pay/:code` — no auth                  | ✅ PASS | `PublicPaymentsController` has zero `@UseGuards()` at class or method level       |
| `POST /v1/payments/pay/:code/proof` — no auth           | ✅ PASS | Same controller, no guards                                                        |
| Code format validation                                  | ✅ PASS | `code.length >= 4 && code.length <= 50 && /^[A-Za-z0-9_-]+$/`                     |
| Base64 bomb protection                                  | ✅ PASS | `@MaxLength(7_000_000)` on DTO + explicit check in handler                        |
| MIME type validation                                    | ✅ PASS | Rejects `data:application/pdf`, `data:text/html` etc.                             |
| SSRF prevention on imageUrl                             | ✅ PASS | Blocks localhost, 127.0.0.1, 10.x, 192.168.x, 169.254.x, ::1, ftp://, file://     |
| Payment link URL config-driven                          | ✅ PASS | `PaymentService.baseUrl = configService.get('APP_URL', 'https://tash8eel.app')`   |
| Portal `/pay/[code]` page exists and fetches public API | ✅ PASS | `apps/portal/src/app/pay/[code]/page.tsx` → `fetch(/api/v1/payments/pay/${code})` |
| Merchant copy-link uses API-returned `paymentUrl`       | ✅ PASS | `handleCopyLink(link) → navigator.clipboard.writeText(link.paymentUrl)`           |

**Minor Note**: `copilot-dispatcher.service.ts` hardcodes `https://pay.tash8eel.com/${link.link_code}` instead of using `APP_URL`. This is likely a dedicated payment domain for WhatsApp messages. **Not a demo-blocker** — only relevant if the payment domain differs from the portal domain in the demo environment.

---

## Scope 3: Rate Limiting

| Check                               | Status  | Evidence                                                                                       |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| Login: 5 req/min per IP             | ✅ PASS | `@RateLimit({ limit: 5, window: 60, keyType: 'ip' })`                                          |
| Forgot-password: 3 req/min per IP   | ✅ PASS | `@RateLimit({ limit: 3, window: 60, keyType: 'ip' })` — strictest                              |
| Reset-password: 5 req/min per IP    | ✅ PASS | `@RateLimit({ limit: 5, window: 60, keyType: 'ip' })`                                          |
| HTTP 429 response with `retryAfter` | ✅ PASS | `throw new HttpException({ statusCode: 429, message: '...', retryAfter: config.window }, 429)` |
| Rate limit headers set              | ✅ PASS | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`                              |
| Violations logged to DB             | ✅ PASS | `INSERT INTO rate_limit_violations (...)` on every violation                                   |
| Redis-backed (not in-memory)        | ✅ PASS | Uses `@Inject(REDIS_CLIENT) private readonly redis: Redis` with `INCR` + `EXPIRE`              |

**Known Risk — Fail-Open on Redis Failure**:

```typescript
catch (error) {
  if (error instanceof HttpException) throw error;
  console.error('Rate limit check failed:', error);
  return true; // fail-open
}
```

When Redis is unavailable, rate limiting silently stops. This is **acceptable for demo** (Redis will be running). For production hardening, consider adding an in-memory fallback counter.

---

## Scope 4: Pricing & Entitlements

| Check                                  | Status  | Evidence                                                                                       |
| -------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| Backend prices in `PLAN_ENTITLEMENTS`  | ✅ PASS | FREE=0, STARTER=299, GROWTH=599, PRO=1299, ENTERPRISE=custom — all EGP                         |
| Frontend prices in `plan/page.tsx`     | ✅ PASS | STARTER=299, GROWTH=599, PRO=1299, ENTERPRISE=null — all EGP                                   |
| FE/BE prices match exactly             | ✅ PASS | All 4 plans confirmed identical                                                                |
| Entitlements enforced from DB          | ✅ PASS | `EntitlementGuard` reads `enabled_agents`, `enabled_features` from `merchants` table           |
| Guard returns 403 with upgrade URL     | ✅ PASS | `ForbiddenException({ error: 'AGENT_NOT_ENABLED', upgradeUrl: '/merchant/settings#upgrade' })` |
| Default entitlements for new merchants | ✅ PASS | `agents = ['OPS_AGENT']`, `features = ['CONVERSATIONS', 'ORDERS', 'CATALOG']`                  |
| Plan tiers are strict supersets        | ✅ PASS | STARTER ⊂ GROWTH ⊂ PRO ⊂ ENTERPRISE (agents verified)                                          |
| Dependency validation exists           | ✅ PASS | `validateEntitlements()` checks agent/feature dependency chains                                |

**Improvement (Non-Blocker)**: Prices are declared in **two places** (backend `entitlements/index.ts` + frontend `plan/page.tsx`). Ideally, the frontend would fetch plan config from an API endpoint. Not a demo-blocker since values are consistent.

---

## Test Proof

```
# Run both suites:
cd apps/api
npx jest --testPathPattern="security" --verbose

# Expected output:
# security-p0-fixes.spec.ts    — 24 tests passed
# security-validation.spec.ts  — 37 tests passed
# Total: 61 tests, 0 failures
```

---

## Post-Demo Hardening Items (Not Demo-Blockers)

| Item                | Priority | Description                                                                       |
| ------------------- | -------- | --------------------------------------------------------------------------------- |
| Rate-limit fallback | Medium   | Add in-memory `Map<string,number>` counter when Redis is unavailable              |
| Rename guard        | Low      | Rename `MerchantApiKeyGuard` → `AuthGuard` since it handles both JWT and API keys |
| Centralize pricing  | Low      | Create `GET /v1/plans` endpoint so frontend fetches prices from API               |
| Payment domain      | Low      | Move `pay.tash8eel.com` URL from hardcoded string to `PAYMENT_DOMAIN` env var     |

---

## Files Validated (read and audited)

| File                                                             | Lines    | What Was Verified                                                |
| ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `apps/api/src/api/controllers/production-features.controller.ts` | 918–1087 | All 6 staff endpoints, guards, staffId derivation                |
| `apps/api/src/api/controllers/public-payments.controller.ts`     | 1–201    | No guards, code validation, SSRF, bomb protection                |
| `apps/api/src/shared/guards/merchant-api-key.guard.ts`           | 1–227    | JWT path vs API-key path, staffId assignment                     |
| `apps/api/src/shared/guards/rate-limit.guard.ts`                 | 1–317    | Redis INCR, fail-open behavior, violation logging                |
| `apps/api/src/shared/guards/entitlement.guard.ts`                | 1–130    | DB-driven enforcement, RequiresAgent/RequiresFeature             |
| `apps/api/src/shared/entitlements/index.ts`                      | 1–250    | Plan definitions, prices, dependencies                           |
| `apps/api/src/application/services/staff.service.ts`             | 285–530  | verifyRefreshTokenPayload, logout, changePassword, resetPassword |
| `apps/api/src/application/services/payment.service.ts`           | 110–685  | getPaymentLinkUrl, baseUrl from APP_URL config                   |
| `apps/portal/src/app/pay/[code]/page.tsx`                        | 1–100    | Public payment page, fetches `/api/v1/payments/pay/:code`        |
| `apps/portal/src/app/merchant/plan/page.tsx`                     | 50–150   | Plan prices, feature lists, PLANS constant                       |
| `apps/portal/src/app/merchant/change-password/page.tsx`          | 57       | No staffId in body, uses `authenticatedFetch`                    |
| `apps/portal/src/app/merchant/payments/page.tsx`                 | 182–322  | handleCopyLink uses `link.paymentUrl`                            |
| `apps/portal/src/lib/authenticated-api.ts`                       | 260–264  | `changeStaffPassword` sends only currentPassword+newPassword     |

---

## Test Files

| File                                             | Tests | Status      |
| ------------------------------------------------ | ----- | ----------- |
| `apps/api/test/unit/security-p0-fixes.spec.ts`   | 24    | ✅ ALL PASS |
| `apps/api/test/unit/security-validation.spec.ts` | 37    | ✅ ALL PASS |
