# Tash8eel — End-to-End Hardening & Product Completion Report

> Generated: June 2025 | Scope: Full Monorepo Scan + P0/P1 Fixes

---

## A. Security Hardening Report

### P0 — Critical (All Fixed ✅)

| #   | Vulnerability                                                                                                                                                                                                                                         | Risk                                              | Fix Applied                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Public payment pages broken** — `PaymentsController` has class-level `MerchantApiKeyGuard` + `EntitlementGuard`. Customer-facing `/pay/[code]` page calls `viewPaymentLink` and `submitProofForLink` — both require auth the customer doesn't have. | Page 404s / silent failure for every payment link | Created `PublicPaymentsController` (no auth) with `GET /v1/payments/pay/:code` and `POST /v1/payments/pay/:code/proof`. Input validation: code format regex, base64 ≤ 5 MB, MIME check, SSRF prevention (blocks private IPs in `imageUrl`). |
| 2   | **Staff logout IDOR** — `POST /v1/staff/logout` accepts `staffId` from body. Any unauthenticated user can log out any staff member.                                                                                                                   | Session hijack / DoS                              | `staffId` now derived from refresh token via `staffService.verifyRefreshTokenPayload()`. Body `staffId` ignored.                                                                                                                            |
| 3   | **Staff change-password IDOR** — `POST /v1/staff/change-password` accepts `staffId` from body (public endpoint).                                                                                                                                      | Account takeover                                  | Added `@UseGuards(MerchantApiKeyGuard)`. `staffId` extracted from JWT, not body. Portal updated to match.                                                                                                                                   |
| 4   | **Base64 image bomb** — No size validation on `imageBase64` payloads before OCR processing.                                                                                                                                                           | OOM / CPU exhaustion                              | Added validation in both `PublicPaymentsController` (7 MB raw / ~5 MB decoded) and `PaymentService` (same limits + MIME prefix check).                                                                                                      |

### P1 — High (All Fixed ✅)

| #   | Vulnerability                                                                                                      | Fix Applied                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5   | **No rate limiting on auth endpoints** — `login`, `forgot-password`, `reset-password` are public with no throttle. | Added `@UseGuards(EnhancedRateLimitGuard)` + `@RateLimit` to all three: login (5/min/IP), forgot-password (3/min/IP), reset-password (5/min/IP). |

### P2 — Medium (Documented, Deferred)

| #   | Issue                          | Recommendation                                                                                                         |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 6   | **CSRF protection missing**    | Add `csurf` middleware or SameSite strict cookies. Low urgency since API uses Bearer tokens, not cookies.              |
| 7   | **Rate-limit guard fail-open** | When Redis is down, `EnhancedRateLimitGuard` allows all requests. Add in-memory fallback counter.                      |
| 8   | **Custom CSP headers**         | Helmet defaults are applied. Add explicit `Content-Security-Policy` for portal (restrict `script-src`, `connect-src`). |
| 9   | **Refresh token rotation**     | Current refresh tokens don't rotate on use. Consider single-use refresh tokens with rotation.                          |

### Already Secure ✅

- **Helmet** — enabled in `main.ts`
- **CORS** — strict origin whitelist
- **ValidationPipe** — `whitelist: true`, `forbidNonWhitelisted: true`
- **JWT** — minimum 32-char secret enforced, 14-min access token expiry
- **Demo token** — rejected in production (`NODE_ENV=production`)
- **RBAC** — 5-tier hierarchy (OWNER > ADMIN > MANAGER > STAFF > VIEWER), all write endpoints guarded with `@RequireRole`/`@Roles`
- **npm audit** — 0 high/critical vulnerabilities

---

## B. Architecture & Code Health

### Stack

| Layer       | Technology                       | Status                                               |
| ----------- | -------------------------------- | ---------------------------------------------------- |
| API         | NestJS (port 3000)               | 51 migrations, ~15 controllers, comprehensive guards |
| Portal      | Next.js 14 (port 3001)           | Turbopack, NextAuth JWT, Tailwind                    |
| Worker      | NestJS                           | 3 agents (Ops, Inventory, Finance)                   |
| Database    | PostgreSQL (Neon)                | 51 migration files                                   |
| Cache/Queue | Redis                            | Rate limiting, BullMQ                                |
| Auth        | NextAuth + custom JWT staff auth | Dual-auth (merchant API key + staff JWT)             |

### Guard Architecture

```
Request → MerchantApiKeyGuard → RolesGuard → EntitlementGuard → Controller
                                    ↓
                            EnhancedRateLimitGuard (auth endpoints)
                            FinanceActionGuard (write finance ops)
                            DestructiveActionGuard (delete ops)
                            PermissionsGuard (granular feature flags)
```

### Entitlement Plans (EGP)

| Plan       | Price  | Agents                    | Features         |
| ---------- | ------ | ------------------------- | ---------------- |
| FREE       | 0      | Ops                       | Basic            |
| STARTER    | 299    | Ops + Inventory           | +WhatsApp        |
| GROWTH     | 599    | Ops + Inventory + Finance | +Bulk, Analytics |
| PRO        | 1,299  | All + Accountant          | Full suite       |
| ENTERPRISE | Custom | Unlimited                 | Custom           |

### Code Quality

- **18 unit test files** + **7 agent test files**
- TypeScript strict mode across all apps
- Swagger/OpenAPI documentation on all endpoints
- Audit logging on all sensitive operations

---

## C. Agent Completeness Audit

### Operations Agent (1,440 lines) ✅ Complete

- Order CRUD, status management, COD reconciliation
- Customer management, conversation tracking
- Bulk operations (CSV import/export)
- WhatsApp message templates

### Inventory Agent (1,880 lines) ✅ Complete

- Catalog management, stock tracking
- AI shrinkage detection, restock suggestions
- Substitutes management
- Low-stock alerts, inventory valuation

### Finance Agent (1,043 lines) ✅ Complete

- Expense tracking, revenue reports
- COD reconciliation engine
- Payment proof OCR + auto-verify
- CFO Brief generation
- Payout settings management

### Feature Gaps Addressed This Session

| Feature             | Before                            | After                                                                                                      |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CFO Brief metrics   | 5 key values hardcoded to 0       | Computed from API data with smart fallbacks                                                                |
| CFO PDF export      | Button present, no handler        | Opens print-ready Arabic RTL PDF in new window                                                             |
| Demo seed data      | Only orders + catalog + inventory | Full: 7 customers, 13 orders, 8 expenses, 4 COD collections, 2 payment links, 10 messages, 5 notifications |
| Public payment flow | Broken (behind auth guard)        | Working via dedicated `PublicPaymentsController`                                                           |

### Remaining Feature Gaps (P2, no blockers for demo)

| Feature                      | Status                                    | Effort  |
| ---------------------------- | ----------------------------------------- | ------- |
| Accountant Pack CSV download | Backend handler exists, no portal UI      | 1 day   |
| COD Collection Reminders     | DB table + handler exist, no scheduler/UI | 2 days  |
| CSRF middleware              | Missing                                   | 0.5 day |

---

## D. Business & Pricing

### Pricing Model — Confirmed in Code

Four paid tiers targeting Egyptian SMEs, all in EGP/month:

|                | Starter | Growth  | Pro       | Enterprise |
| -------------- | ------- | ------- | --------- | ---------- |
| **Price**      | 299 EGP | 599 EGP | 1,299 EGP | Custom     |
| **Ops Agent**  | ✅      | ✅      | ✅        | ✅         |
| **Inventory**  | ✅      | ✅      | ✅        | ✅         |
| **Finance**    | —       | ✅      | ✅        | ✅         |
| **WhatsApp**   | ✅      | ✅      | ✅        | ✅         |
| **Bulk Ops**   | —       | ✅      | ✅        | ✅         |
| **Accountant** | —       | —       | ✅        | ✅         |
| **API Access** | —       | —       | ✅        | ✅         |

Pricing page fully built: 1,349 lines at `apps/portal/src/app/pricing/page.tsx`.

---

## E. Demo Readiness Pack

### Seed Data

File: `scripts/demo-seed.sql`

Run after database migration:

```bash
psql $DATABASE_URL < scripts/demo-seed.sql
```

Contents:

- 7 Egyptian customers with realistic names/addresses
- 7 WhatsApp conversations
- 13 orders (COD, InstaPay, VodafoneCash — pending/shipped/delivered/completed)
- 8 expenses (rent, salaries, ads, delivery, utilities, packaging)
- 4 COD collections (exact match, partial, pending — for reconciliation demo)
- 2 payment links (PAY-DEMO01, PAY-DEMO02)
- Merchant payout settings (InstaPay alias, VodafoneCash, bank)
- 10 WhatsApp messages (order conversation flow + reorder + new customer)
- 5 notifications
- Demo merchant set to PRO plan with all agents enabled

### 10-Minute Demo Script

1. **Login** → Portal at `localhost:3001` with demo credentials
2. **Dashboard** → Show order count, revenue, today's summary
3. **Orders** → Filter by status, show COD vs online breakdown
4. **WhatsApp** → Open conversations, show message history and templates
5. **Inventory** → Show catalog, stock levels, AI shrinkage alerts, restock suggestions
6. **Finance → CFO Brief** → Show revenue, expenses, cash flow, pending COD — click **PDF** to export
7. **Finance → Expenses** → Show expense breakdown by category
8. **Payments** → Open `localhost:3001/pay/PAY-DEMO01` — show customer-facing payment page
9. **Staff** → Show role-based access control (OWNER > ADMIN > MANAGER > STAFF > VIEWER)
10. **Pricing** → Show tiers and feature comparison at `/pricing`

### Run Commands

```bash
# Install
cd Tash8eel && npm install

# Database
psql $DATABASE_URL < migrations/init.sql
psql $DATABASE_URL < scripts/demo-seed.sql

# Start (dev)
npm run dev          # Starts API + Portal + Worker

# Start (Docker)
docker compose up -d

# Verify
curl -s http://localhost:3000/v1/health | jq .
```

---

## Files Modified This Session

### New Files

| File                                                         | Purpose                                     |
| ------------------------------------------------------------ | ------------------------------------------- |
| `apps/api/src/api/controllers/public-payments.controller.ts` | Customer-facing payment endpoints (no auth) |
| `scripts/demo-seed.sql`                                      | Comprehensive demo data                     |
| `docs/HARDENING_REPORT.md`                                   | This report                                 |

### Modified Files

| File                                                             | Changes                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/api/src/api/controllers/payments.controller.ts`            | Removed public endpoints (moved to PublicPaymentsController) |
| `apps/api/src/api/api.module.ts`                                 | Registered PublicPaymentsController                          |
| `apps/api/src/api/controllers/production-features.controller.ts` | Staff auth IDOR fixes + rate limiting on login/forgot/reset  |
| `apps/api/src/application/services/staff.service.ts`             | Added `verifyRefreshTokenPayload()`                          |
| `apps/api/src/application/services/payment.service.ts`           | Base64 bomb protection (size + MIME validation)              |
| `apps/portal/src/lib/authenticated-api.ts`                       | Removed `staffId` from `changeStaffPassword` signature       |
| `apps/portal/src/app/merchant/change-password/page.tsx`          | Removed `staffId` from body                                  |
| `apps/portal/src/app/merchant/reports/cfo/page.tsx`              | Fixed 5 hardcoded zeros + wired PDF download                 |

### Verification

All 8 modified files: **0 TypeScript errors** ✅
