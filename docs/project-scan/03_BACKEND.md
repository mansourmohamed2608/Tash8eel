# Phase 2 - Backend Deep Scan

## Stack & Structure

- **Framework**: NestJS with modular layering. Evidence: `apps/api/package.json:31-40`, `apps/api/src/app.module.ts:7-78`.
- **Layering**: API controllers -> application services/policies/jobs -> domain entities/ports -> infrastructure repositories. Evidence: `docs/ARCHITECTURE.md:9-73`, `apps/api/src/api/api.module.ts:1-64`.

## Module Boundaries & Key Modules

- **AppModule** wires config, throttling, scheduling, infrastructure, and API modules. Evidence: `apps/api/src/app.module.ts:24-78`.
- **ApiModule** aggregates all controllers (admin, portal, inventory, webhooks, etc.). Evidence: `apps/api/src/api/api.module.ts:1-63`.
- **Infrastructure**: PG pool + Redis clients. Evidence: `apps/api/src/infrastructure/database/database.module.ts:1-75`, `apps/api/src/infrastructure/redis/redis.service.ts:13-120`.

## API Surface (Controller Inventory)

> Base paths are relative to the global prefix `/api` (set in `apps/api/src/main.ts:64-67`).

| Controller                   | Base Path                                                       | Auth/Guards                        | Evidence                                                                 |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| InboxController              | `v1/inbox`                                                      | Merchant API key                   | `apps/api/src/api/controllers/inbox.controller.ts:9`                     |
| MerchantsController          | `v1/merchants`                                                  | Merchant API key                   | `apps/api/src/api/controllers/merchants.controller.ts:19`                |
| CatalogController            | `v1/catalog`                                                    | Merchant API key                   | `apps/api/src/api/controllers/catalog.controller.ts:28`                  |
| ConversationsController      | `v1/conversations`                                              | Admin API key                      | `apps/api/src/api/controllers/conversations.controller.ts:47-53`         |
| OrdersController             | `v1/orders`                                                     | Admin API key                      | `apps/api/src/api/controllers/orders.controller.ts:34-41`                |
| AdminController              | `v1/admin`                                                      | Admin API key                      | `apps/api/src/api/controllers/admin.controller.ts:61`                    |
| MerchantPortalController     | `v1/portal`                                                     | Merchant API key                   | `apps/api/src/api/controllers/merchant-portal.controller.ts:34-41`       |
| ProductionFeaturesController | `v1/portal`                                                     | Merchant API key                   | `apps/api/src/api/controllers/production-features.controller.ts:32-41`   |
| StaffAuthController          | `v1/staff`                                                      | Public                             | `apps/api/src/api/controllers/production-features.controller.ts:681-759` |
| InventoryController          | `v1/inventory`                                                  | Merchant API key + Entitlements    | `apps/api/src/api/controllers/inventory.controller.ts:260-266`           |
| LoyaltyController            | `api/merchants/:merchantId/loyalty`                             | Merchant API key                   | `apps/api/src/api/controllers/loyalty.controller.ts:16-21`               |
| AnalyticsController          | `/merchants/:merchantId/analytics/*`                            | Merchant API key                   | `apps/api/src/api/controllers/analytics.controller.ts:12-70`             |
| NotificationsController      | `/merchants/:merchantId/notifications*`                         | Merchant API key                   | `apps/api/src/api/controllers/notifications.controller.ts:11-110`        |
| WebhooksController           | `v1/webhooks`                                                   | none (skip throttle)               | `apps/api/src/api/controllers/webhooks.controller.ts:44-155`             |
| TwilioWebhookController      | `v1/webhooks/twilio`                                            | none                               | `apps/api/src/api/controllers/twilio-webhook.controller.ts:32-66`        |
| VisionController             | `v1/vision`                                                     | Merchant API key + entitlements    | `apps/api/src/api/controllers/vision.controller.ts:20`                   |
| PaymentsController           | `v1/payments`                                                   | Merchant API key                   | `apps/api/src/api/controllers/payments.controller.ts:45`                 |
| KpiController                | `v1/kpis`                                                       | Merchant API key                   | `apps/api/src/api/controllers/kpi.controller.ts:14`                      |
| EarlyAccessController        | `/merchants/:merchantId/early-access` and `/admin/early-access` | Merchant API key (merchant routes) | `apps/api/src/api/controllers/early-access.controller.ts:27-205`         |

## Request Validation & Error Handling

- **Global validation**: ValidationPipe with whitelist and strict settings. Evidence: `apps/api/src/main.ts:52-61`.
- **DTO validation**: class-validator annotations in controllers (e.g., inventory DTOs). Evidence: `apps/api/src/api/controllers/inventory.controller.ts:14-257`.
- **LLM response validation**: Zod schema validation. Evidence: `apps/api/src/application/llm/llm.service.ts:71-120`, `apps/api/src/application/llm/llm-schema.ts:1-120`.
- **Error handling**: global exception filter. Evidence: `apps/api/src/shared/filters/all-exceptions.filter.ts:1-45`, wired in `apps/api/src/app.module.ts:68-76`.

## AuthN/AuthZ

- **Merchant API key**: validated in MerchantApiKeyGuard. Evidence: `apps/api/src/shared/guards/merchant-api-key.guard.ts:14-134`.
- **Admin API key**: validated in AdminApiKeyGuard. Evidence: `apps/api/src/shared/guards/admin-api-key.guard.ts:1-25`.
- **Internal API key**: internal guard for worker -> API. Evidence: `apps/api/src/shared/guards/internal-api.guard.ts:8-36`.
- **Entitlements**: feature/agent gating via EntitlementGuard. Evidence: `apps/api/src/shared/guards/entitlement.guard.ts:8-90`.
- **Staff JWT auth**: JWT token issuance and verification in StaffService. Evidence: `apps/api/src/application/services/staff.service.ts:49-583`.
- **WebSocket auth**: manual authenticate message trusts merchantId from client. Evidence: `apps/api/src/infrastructure/websocket/events.gateway.ts:47-82`.

## Data Access Layer

- **PostgreSQL via pg pool** (no ORM for runtime queries). Evidence: `apps/api/src/infrastructure/database/database.module.ts:1-73`, `apps/api/src/infrastructure/repositories/conversation.repository.impl.ts:1-44`.
- **TypeORM data-source only for migrations**. Evidence: `apps/api/src/infrastructure/database/data-source.ts:1-14`, `apps/api/package.json:21-24`.
- **Parameterized queries** are the norm. Example: ConversationRepository uses $1 parameters. Evidence: `apps/api/src/infrastructure/repositories/conversation.repository.impl.ts:11-44`.

## Background Jobs / Workers

- **Outbox pattern** in API, polled by worker service. Evidence: `apps/api/src/application/events/outbox.service.ts:1-128`, `apps/worker/src/outbox/outbox-poller.service.ts:34-120`.
- **Schedulers** in API and worker for followups and reports. Evidence: `apps/api/src/application/jobs/followup.scheduler.ts:1-120`, `apps/worker/src/jobs/daily-report-scheduler.service.ts:1-120`.

## Logging & Observability

- **Pino logger** with PII masking utilities. Evidence: `apps/api/src/shared/logging/logger.ts:1-90`.
- **Correlation ID middleware** exists but AsyncLocalStorage context is not initialized. Evidence: `apps/api/src/shared/middleware/correlation-id.middleware.ts:15-44`.
- **Health/ready endpoints** in main + controller. Evidence: `apps/api/src/main.ts:118-125`, `apps/api/src/api/controllers/health.controller.ts:24-110`.

## Configuration Management

- ConfigModule loads .env.local, .env, and repo-root .env. Evidence: `apps/api/src/app.module.ts:27-30`.
- Environment values include DB/Redis/OpenAI/keys (see security findings for risks). Evidence: `.env:7-54`, `apps/api/.env:8-52`.

## Performance / Hotspots

- Portal dashboard computation loads _all_ orders into memory and filters in JS. Evidence: `apps/api/src/api/controllers/merchant-portal.controller.ts:76-140`.
- Analytics endpoints build and return large HTML report strings in-process. Evidence: `apps/api/src/api/controllers/analytics.controller.ts:98-198`.

## Idempotency

- Helper functions exist for order idempotency, but **no usage found** in services/controllers. **Not found in repository**. Evidence: `apps/api/src/shared/utils/helpers.ts:22-40`, `docs/project-scan/12_SEARCH_LOG.md:37-46`.

## Testing Coverage

- **API unit tests**: example unit spec. Evidence: `apps/api/test/unit/address-depth.service.spec.ts:1-80`.
- **API e2e tests**: example e2e spec. Evidence: `apps/api/test/e2e/catalog.e2e-spec.ts:1-80`.
- **Worker tests**: agent unit tests present. Evidence: `apps/worker/src/agents/content/tests/content.agent.spec.ts:1-80`.
- **Portal tests**: **Not found in repository** (no Jest/Vitest/Cypress/Playwright files under apps/portal/). Evidence: `docs/project-scan/12_SEARCH_LOG.md:29-35`.

## Security Review (Backend)

### Injection

- Most SQL uses parameterized queries. Example: ConversationRepository uses $1 parameters. Evidence: `apps/api/src/infrastructure/repositories/conversation.repository.impl.ts:11-44`.

### SSRF / Outbound Requests

- Webhook delivery posts to arbitrary URLs stored in DB (no URL validation or allowlist). Evidence: `apps/api/src/application/services/webhook.service.ts:71-91`, `apps/api/src/application/services/webhook.service.ts:261-282`.

### AuthZ / Tenant Isolation

- Several merchant-scoped controllers accept merchantId from URL parameters without validating against authenticated merchantId. Evidence: `apps/api/src/api/controllers/analytics.controller.ts:12-70`, `apps/api/src/api/controllers/notifications.controller.ts:11-110`, `apps/api/src/api/controllers/early-access.controller.ts:27-160`, `apps/api/src/api/controllers/inventory.controller.ts:275-336`.

### Webhooks

- Twilio webhook signature validation only occurs when signature header is present; missing signature is not rejected. Evidence: `apps/api/src/api/controllers/twilio-webhook.controller.ts:87-97`.

### File Uploads

- CSV imports use memoryStorage() without size/type limits and log raw CSV preview. Evidence: `apps/api/src/api/controllers/production-features.controller.ts:467-485`.

### Secrets

- Sensitive credentials are present in committed .env files. Evidence: `.env:22-44`, `apps/api/.env:8-15`, `apps/worker/.env:1-8`.

### WebSocket Auth

- WebSocket authentication currently trusts client-supplied merchantId. Evidence: `apps/api/src/infrastructure/websocket/events.gateway.ts:47-82`.
