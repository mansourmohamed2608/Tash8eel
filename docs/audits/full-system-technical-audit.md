# Tash8eel Full System Technical Audit

## Scope And Method

- Truth source: codebase only
- Environment truth: not included
- Coverage: merchant, admin, public/auth, API, AI services, jobs/workers/schedulers, pricing, plans, billing catalog
- Primary evidence sources:
  - `apps/api/src/shared/entitlements/index.ts`
  - `apps/api/src/application/services/billing-catalog.service.ts`
  - `apps/api/src/api/controllers/*.ts`
  - `apps/api/src/application/llm/*.ts`
  - `apps/api/src/application/jobs/*.ts`
  - `apps/api/src/application/forecasting/forecast.scheduler.ts`
  - `apps/api/src/application/events/*`
  - `apps/api/src/application/dlq/*`
  - `apps/portal/src/app/**/*/page.tsx`

## Status Legend

- `Implemented`
- `Partial`
- `Stub / Coming Soon`
- `Internal Only`
- `Deprecated / Legacy`
- `Unclear / Needs Runtime Proof`

## Inventory Summary

- Merchant portal route families: `50+` top-level route families under `apps/portal/src/app/merchant`
- Admin portal route families: `9` top-level route families under `apps/portal/src/app/admin`
- Public/auth routes: landing page, login, signup, merchant shell, admin shell, public tracking path
- API controllers: `50+` controllers under `apps/api/src/api/controllers`
- AI/LLM services: customer commerce AI, merchant assistant/copilot AI, ops AI, inventory AI, finance AI, vision/OCR, embeddings, routing
- Jobs/workers/pollers: followups, delivery polling, daily/weekly reports, automation scheduler, forecasting scheduler, subscription expiry, merchant deletion, message delivery, outbox, DLQ

## Route Surface Inventory

### Merchant Route Families

- `merchant/agent-activity`
- `merchant/agents`
- `merchant/analytics`
- `merchant/assistant`
- `merchant/audit`
- `merchant/automations`
- `merchant/billing`
- `merchant/branches`
- `merchant/calls`
- `merchant/campaigns`
- `merchant/cashier`
- `merchant/change-password`
- `merchant/conversations`
- `merchant/customer-segments`
- `merchant/customers`
- `merchant/dashboard`
- `merchant/delivery-drivers`
- `merchant/expenses`
- `merchant/feature-requests`
- `merchant/followups`
- `merchant/forecast`
- `merchant/help`
- `merchant/import-export`
- `merchant/integrations`
- `merchant/inventory`
- `merchant/inventory-insights`
- `merchant/knowledge-base`
- `merchant/kpis`
- `merchant/loyalty`
- `merchant/notifications`
- `merchant/ocr-review`
- `merchant/onboarding`
- `merchant/orders`
- `merchant/payments`
- `merchant/plan`
- `merchant/pos-integrations`
- `merchant/pricing`
- `merchant/push-notifications`
- `merchant/quotes`
- `merchant/reports`
- `merchant/roadmap`
- `merchant/security`
- `merchant/settings`
- `merchant/suppliers`
- `merchant/team`
- `merchant/teams`
- `merchant/webhooks`

### Admin Route Families

- `admin/dashboard`
- `admin/analytics`
- `admin/audit-logs`
- `admin/dlq`
- `admin/entitlements`
- `admin/feature-requests`
- `admin/merchants`
- `admin/offers`

### Public/Auth Route Families

- `/`
- `/login`
- `/signup`
- `/track/[orderId]`

## Technical Audit Matrix By Domain

### Commerce And Communication

| Feature / Capability                         | Audience                 |              Status | Type                | Primary Entrypoint             | Backend Source                                                               | Portal Source                      | Sellable / Internal Flag | Evidence Note                                     |
| -------------------------------------------- | ------------------------ | ------------------: | ------------------- | ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------ | ------------------------------------------------- |
| WhatsApp customer messaging via Meta         | Merchant/customer-facing |         Implemented | AI + Non-AI         | Meta webhook + conversations   | `meta-webhook.controller.ts`, inbox/LLM services                             | `merchant/conversations/page.tsx`  | Sellable                 | Primary omnichannel production path               |
| Messenger channel                            | Merchant/customer-facing |         Implemented | AI + Non-AI         | Meta channel routing           | `meta-webhook.controller.ts`, channel adapters                               | `merchant/conversations/page.tsx`  | Sellable                 | Real inbound/outbound adapter path present        |
| Instagram DM channel                         | Merchant/customer-facing |         Implemented | AI + Non-AI         | Meta channel routing           | `meta-webhook.controller.ts`, channel adapters                               | `merchant/conversations/page.tsx`  | Sellable                 | Real inbound/outbound adapter path present        |
| Twilio WhatsApp webhook path                 | Internal / legacy        | Deprecated / Legacy | Non-AI              | Twilio webhook                 | `twilio-webhook.controller.ts`                                               | None primary                       | Not primary sell path    | Legacy path still exists alongside Meta path      |
| Conversation inbox and unified chat handling | Merchant-facing          |         Implemented | AI + Non-AI         | Conversations                  | `inbox.controller.ts`, `inbox.service.ts`, `conversations.controller.ts`     | `merchant/conversations/page.tsx`  | Sellable                 | Core communication hub                            |
| Customer order-taking AI in chat             | Customer-facing          |         Implemented | AI                  | Inbox / WhatsApp AI            | `llm.service.ts`, `message-router.service.ts`, `merchant-context.service.ts` | Conversations                      | Sellable / metered       | Dynamic `gpt-4o` vs `gpt-4o-mini` routing         |
| Voice notes transcription in chat            | Merchant/customer-facing |         Implemented | AI                  | Voice notes in inbox           | `transcription.adapter.ts`                                                   | Conversations                      | Sellable / metered       | Uses OpenAI transcription path                    |
| Broadcasts / proactive messaging limits      | Merchant-facing          |             Partial | Non-AI + Automation | Billing/limits + notifications | Entitlements + billing catalog + notifications services                      | Notifications / campaigns surfaces | Sellable with limits     | Commercially modeled, breadth needs runtime proof |
| Follow-up messaging                          | Merchant-facing          |         Implemented | Automation          | Followups                      | `followups.controller.ts`, `followup.scheduler.ts`, handlers                 | `merchant/followups/page.tsx`      | Sellable                 | Scheduled follow-up engine exists                 |
| Quotes and quote requests                    | Merchant-facing          |         Implemented | Non-AI              | Quotes                         | `quote-requests.controller.ts`                                               | `merchant/quotes/page.tsx`         | Sellable                 | Merchant quote workflow surface present           |

### Orders And Fulfillment

| Feature / Capability                      | Audience                  |      Status | Type                | Primary Entrypoint | Backend Source                                          | Portal Source                                 | Sellable / Internal Flag                   | Evidence Note                                         |
| ----------------------------------------- | ------------------------- | ----------: | ------------------- | ------------------ | ------------------------------------------------------- | --------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Core order management                     | Merchant-facing           | Implemented | Non-AI              | Orders             | `orders.controller.ts`, `merchant-portal.controller.ts` | `merchant/orders/page.tsx`                    | Sellable                                   | Central order records and portal management           |
| Public order tracking                     | Customer-facing           | Implemented | Non-AI              | Public track page  | `public-orders.controller.ts`                           | `/track/[orderId]`                            | Sellable                                   | Public order status surface exists                    |
| Delivery workflow and courier integration | Merchant-facing           | Implemented | Non-AI + Automation | Delivery portal    | `portal-delivery.controller.ts`, delivery poller/events | `merchant/delivery-drivers/page.tsx` + orders | Sellable                                   | Includes polling and driver flows                     |
| Delivery status polling                   | Internal / merchant-value | Implemented | Automation          | Background poller  | `delivery-status.poller.ts`, event handlers             | Driver/orders pages consume results           | Internal engine powering merchant features | Repeated courier shipment sync                        |
| Follow-up on stale conversations/orders   | Merchant-facing           | Implemented | Automation          | Followups          | `followup.scheduler.ts`, `followup.handler.ts`          | Followups page                                | Sellable                                   | Automated re-engagement path                          |
| Quote-to-order workflow                   | Merchant-facing           |     Partial | Non-AI              | Quote requests     | `quote-requests.controller.ts`                          | Quotes page                                   | Sellable                                   | Exists, but full commercial depth needs runtime proof |
| Order receipts / printable output         | Merchant-facing           | Implemented | Non-AI              | Cashier / orders   | `merchant-portal.controller.ts` + cashier UI            | `merchant/cashier/page.tsx`, orders           | Sellable                                   | Dedicated receipt print path in portal                |

### POS / Cashier / Tables / Branches / Shifts

| Feature / Capability         | Audience        |      Status | Type   | Primary Entrypoint      | Backend Source                                              | Portal Source                                  | Sellable / Internal Flag  | Evidence Note                                                      |
| ---------------------------- | --------------- | ----------: | ------ | ----------------------- | ----------------------------------------------------------- | ---------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Cashier / POS checkout       | Merchant-facing | Implemented | Non-AI | Cashier                 | `merchant-portal.controller.ts`                             | `merchant/cashier/page.tsx`                    | Sellable                  | Real order creation path exists                                    |
| POS payments normalization   | Merchant-facing | Implemented | Non-AI | Cashier payments        | `merchant-portal.controller.ts`                             | Cashier UI                                     | Sellable                  | Uses `order_payments` style normalization path in current codebase |
| Suspended / draft sales      | Merchant-facing | Implemented | Non-AI | Cashier drafts          | `merchant-portal.controller.ts`                             | `merchant/cashier/page.tsx`                    | Sellable                  | Persisted draft/suspend-resume flows present in current code       |
| POS register sessions        | Merchant-facing | Implemented | Non-AI | Cashier / register      | `merchant-portal.controller.ts`                             | `merchant/cashier/page.tsx`                    | Sellable                  | Register open/close path present                                   |
| Branch support               | Merchant-facing | Implemented | Non-AI | Branches                | `branches.controller.ts`, `branch-extensions.controller.ts` | `merchant/branches/*`                          | Sellable                  | Multi-branch operational support exists                            |
| Shifts                       | Merchant-facing | Implemented | Non-AI | Branch shifts           | branch controllers/services                                 | `merchant/branches/[branchId]/shifts/page.tsx` | Sellable                  | Shift sessions and summaries exposed                               |
| POS tables / dine-in         | Merchant-facing | Implemented | Non-AI | Cashier tables          | `merchant-portal.controller.ts`                             | `merchant/cashier/page.tsx`                    | Sellable / category-gated | Restaurant-mode table operations exist in current code             |
| Split payments               | Merchant-facing | Implemented | Non-AI | Cashier                 | `merchant-portal.controller.ts`                             | Cashier UI                                     | Sellable                  | Multi-tender support present in current code                       |
| Refunds / exchanges from POS | Merchant-facing |     Partial | Non-AI | Cashier refund/exchange | `merchant-portal.controller.ts`, refund paths               | Cashier UI                                     | Sellable                  | Full and partial flow present; runtime breadth still needs proof   |
| POS integrations catalog     | Merchant-facing |     Partial | Non-AI | POS integrations        | `merchant-portal.controller.ts`                             | `merchant/pos-integrations/page.tsx`           | Sellable / evolving       | Exists as configuration and integration surface                    |

### Inventory And Catalog

| Feature / Capability                  | Audience        |      Status | Type            | Primary Entrypoint       | Backend Source                                               | Portal Source                   | Sellable / Internal Flag | Evidence Note                                                  |
| ------------------------------------- | --------------- | ----------: | --------------- | ------------------------ | ------------------------------------------------------------ | ------------------------------- | ------------------------ | -------------------------------------------------------------- |
| Product catalog                       | Merchant-facing | Implemented | Non-AI          | Catalog                  | `catalog.controller.ts`, merchant/portal catalog controllers | Inventory / orders / cashier    | Sellable                 | Core catalog capability present                                |
| Inventory management                  | Merchant-facing | Implemented | Non-AI          | Inventory                | `inventory.controller.ts`, `portal-inventory.controller.ts`  | `merchant/inventory/page.tsx`   | Sellable                 | Real inventory CRUD and views                                  |
| Inventory insights                    | Merchant-facing | Implemented | Non-AI + AI     | Inventory insights       | advanced/portal inventory reporting                          | `merchant/inventory-insights/*` | Sellable                 | FIFO, expiry, duplicate SKU, merge, valuation surfaces present |
| Product OCR                           | Merchant-facing | Implemented | AI + Automation | OCR review / product OCR | `vision.controller.ts`, `product-ocr.service.ts`             | `merchant/ocr-review/page.tsx`  | Sellable / metered       | OCR + review workflow exists                                   |
| Forecast-driven stock recommendations | Merchant-facing | Implemented | AI + Automation | Forecast                 | `forecast.scheduler.ts`, inventory AI / forecasting services | `merchant/forecast/page.tsx`    | Sellable add-on          | Add-on explicitly priced in entitlements                       |
| Supplier management                   | Merchant-facing | Implemented | Non-AI          | Suppliers                | supplier-related merchant portal/backend paths               | `merchant/suppliers/page.tsx`   | Sellable                 | Supplier-facing operations surface exists                      |

### Payments / COD / OCR / Proofs

| Feature / Capability              | Audience                  |        Status | Type        | Primary Entrypoint    | Backend Source                                   | Portal Source                       | Sellable / Internal Flag  | Evidence Note                                                  |
| --------------------------------- | ------------------------- | ------------: | ----------- | --------------------- | ------------------------------------------------ | ----------------------------------- | ------------------------- | -------------------------------------------------------------- |
| Payment links / payment workflows | Merchant-facing           |   Implemented | Non-AI      | Payments              | `payments.controller.ts`, merchant portal flows  | `merchant/payments/page.tsx`        | Sellable                  | Core payments surface exists                                   |
| Payment proof review              | Merchant-facing           |   Implemented | AI + Non-AI | Proofs                | `payments.controller.ts`, `vision.controller.ts` | `merchant/payments/proofs/page.tsx` | Sellable / metered        | OCR-assisted proof verification is core path                   |
| COD reconciliation                | Merchant-facing           |   Implemented | Non-AI      | COD payments          | merchant portal + delivery controllers           | `merchant/payments/cod/page.tsx`    | Sellable                  | COD import/reconciliation surface exists                       |
| Vision OCR standalone             | Internal / merchant-value | Internal Only | AI          | Vision API            | `vision.controller.ts`, `vision.service.ts`      | Consumed inside payments/OCR flows  | Internal in pricing model | Explicitly marked non-standalone in entitlements               |
| Receipt / invoice OCR             | Merchant-facing           |       Partial | AI          | OCR review / payments | vision + OCR services                            | OCR review                          | Sellable / metered        | Strong implementation signal, breadth depends on runtime setup |

### CRM / Loyalty / Segmentation / Campaigns

| Feature / Capability       | Audience        |      Status | Type                           | Primary Entrypoint | Backend Source                                    | Portal Source                                                     | Sellable / Internal Flag                        | Evidence Note                                                       |
| -------------------------- | --------------- | ----------: | ------------------------------ | ------------------ | ------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| Customers CRM              | Merchant-facing | Implemented | Non-AI                         | Customers          | customer-related merchant portal/controller paths | `merchant/customers/page.tsx`                                     | Sellable                                        | Real customer management surface                                    |
| Customer segments          | Merchant-facing | Implemented | Non-AI + AI-assisted analytics | Segments           | portal analytics / merchant portal data           | `merchant/customer-segments/page.tsx`                             | Sellable                                        | Segmentation surface exists                                         |
| Loyalty                    | Merchant-facing | Implemented | Non-AI                         | Loyalty            | `loyalty.controller.ts`                           | `merchant/loyalty/page.tsx`                                       | Sellable                                        | Explicitly priced feature in entitlements                           |
| Campaigns                  | Merchant-facing |     Partial | Non-AI + AI-adjacent           | Campaigns          | portal/campaign logic                             | `merchant/campaigns/page.tsx`                                     | Sellable / evolving                             | UI and product surface exist; implementation depth not fully proven |
| Feature requests / roadmap | Merchant-facing | Implemented | Non-AI                         | Feedback           | `feature-requests.controller.ts`                  | `merchant/feature-requests/page.tsx`, `merchant/roadmap/page.tsx` | Internal product ops + merchant-facing feedback | Real request capture surface                                        |

### Reports / Analytics / KPI / CFO / Forecasting

| Feature / Capability     | Audience        |      Status | Type                 | Primary Entrypoint | Backend Source                                          | Portal Source                               | Sellable / Internal Flag | Evidence Note                             |
| ------------------------ | --------------- | ----------: | -------------------- | ------------------ | ------------------------------------------------------- | ------------------------------------------- | ------------------------ | ----------------------------------------- |
| Merchant dashboard       | Merchant-facing | Implemented | Non-AI + AI summary  | Dashboard          | `merchant-portal.controller.ts`, analytics controllers  | `merchant/dashboard/page.tsx`               | Sellable                 | Core merchant overview                    |
| Reports overview         | Merchant-facing | Implemented | Non-AI               | Reports            | merchant portal + advanced reports                      | `merchant/reports/page.tsx`                 | Sellable                 | Core reporting surface                    |
| CFO / finance report     | Merchant-facing | Implemented | Non-AI + AI summary  | CFO                | advanced reports / merchant portal                      | `merchant/reports/cfo/page.tsx`             | Sellable                 | Dedicated finance/CFO route exists        |
| KPI dashboard            | Merchant-facing | Implemented | Non-AI               | KPI                | `kpi.controller.ts`, `kpi.service.ts`                   | `merchant/kpis/page.tsx`                    | Sellable                 | Explicitly priced feature in entitlements |
| Generic analytics        | Merchant-facing | Implemented | Non-AI               | Analytics          | `portal-analytics.controller.ts`, analytics controllers | `merchant/analytics/page.tsx`               | Sellable                 | Analytics surface present                 |
| Forecasting              | Merchant-facing | Implemented | AI + Automation      | Forecast           | forecast scheduler/services, advanced reports           | `merchant/forecast/page.tsx`                | Sellable add-on          | Explicit add-on in entitlements           |
| Discount impact analysis | Merchant-facing | Implemented | Non-AI               | Discount report    | `advanced-reports.controller.ts`                        | `merchant/reports/discount-impact/page.tsx` | Sellable                 | Dedicated analytics route                 |
| Refund analysis          | Merchant-facing | Implemented | Non-AI               | Refund report      | advanced reports                                        | `merchant/reports/refund-analysis/page.tsx` | Sellable                 | Dedicated analytics route                 |
| Tax report               | Merchant-facing | Implemented | Non-AI               | Tax report         | advanced reports / finance paths                        | `merchant/reports/tax/page.tsx`             | Sellable                 | Dedicated reporting surface               |
| Cash-flow report         | Merchant-facing | Implemented | Non-AI + Forecasting | Cash-flow          | advanced reports / finance paths                        | `merchant/reports/cash-flow/page.tsx`       | Sellable                 | Explicit cash-flow surface                |
| Accountant report/export | Merchant-facing | Implemented | Non-AI               | Accountant report  | advanced reports / export paths                         | `merchant/reports/accountant/page.tsx`      | Sellable                 | Dedicated accountant export path          |

### AI Assistants / Copilot / Agent Activity / AI Decisions / Teams

| Feature / Capability        | Audience        |        Status | Type                           | Primary Entrypoint     | Backend Source                                                      | Portal Source                          | Sellable / Internal Flag  | Evidence Note                                |
| --------------------------- | --------------- | ------------: | ------------------------------ | ---------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------- | -------------------------------------------- |
| Merchant assistant          | Merchant-facing |   Implemented | AI                             | Assistant              | `assistant.controller.ts`, `merchant-assistant.service.ts`          | `merchant/assistant/page.tsx`          | Sellable / metered        | Merchant-facing AI helper                    |
| Copilot command AI          | Merchant-facing |   Implemented | AI                             | Copilot                | `copilot.controller.ts`, `copilot-ai.service.ts`, dispatcher/schema | Assistant UI                           | Sellable / metered        | Structured command parsing and confirmations |
| AI decisions audit          | Merchant-facing |   Implemented | Non-AI + AI evidence           | AI decisions           | `advanced-reports.controller.ts` or intelligence paths              | `merchant/audit/ai-decisions/page.tsx` | Sellable / audit-oriented | Real audit/log surface exists                |
| Agent activity              | Merchant-facing |   Implemented | Non-AI + Automation telemetry  | Agent activity         | `portal-agent-activity.controller.ts`                               | `merchant/agent-activity/page.tsx`     | Sellable                  | Activity feed surface exists                 |
| AI center / agents overview | Merchant-facing |   Implemented | Mostly non-AI orchestration UI | AI center              | entitlements/catalog + AI status paths                              | `merchant/agents/page.tsx`             | Sellable                  | Overview/control-center surface              |
| Agent teams / workflows     | Merchant-facing |   Implemented | AI + Non-AI orchestration      | Agent teams            | `agent-teams.controller.ts`                                         | `merchant/teams/page.tsx`              | Sellable / evolving       | Multi-step team workflow surface exists      |
| Internal AI ops endpoints   | Internal/admin  | Internal Only | AI                             | Internal AI controller | `internal-ai.controller.ts`                                         | None merchant-facing                   | Internal                  | Back-office/internal AI support endpoints    |

### Integrations / Webhooks / API Access

| Feature / Capability | Audience                   |      Status | Type   | Primary Entrypoint      | Backend Source                                                                 | Portal Source                        | Sellable / Internal Flag    | Evidence Note                               |
| -------------------- | -------------------------- | ----------: | ------ | ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------ | --------------------------- | ------------------------------------------- |
| Webhooks             | Merchant-facing            | Implemented | Non-AI | Webhooks                | `webhooks.controller.ts`, `production-features.controller.ts`, webhook service | `merchant/webhooks/page.tsx`         | Sellable                    | Explicitly priced feature                   |
| Public API access    | Merchant-facing            | Implemented | Non-AI | API access              | `integrations.controller.ts`, keys/rate-limit support, entitlements            | Integrations/settings surfaces       | Sellable                    | Explicitly priced feature                   |
| Integrations         | Merchant-facing            | Implemented | Non-AI | Integrations            | `integrations.controller.ts`, `integrations-public.controller.ts`              | `merchant/integrations/page.tsx`     | Sellable                    | Integration endpoints and portal surface    |
| POS integrations     | Merchant-facing            |     Partial | Non-AI | POS integrations        | merchant portal / integration config paths                                     | `merchant/pos-integrations/page.tsx` | Sellable / evolving         | Product surface exists, depth varies        |
| Custom integrations  | Merchant-facing enterprise |     Partial | Non-AI | Enterprise integrations | entitlements + integrations layer                                              | integrations surfaces                | Enterprise / custom pricing | Explicit enterprise-only feature in pricing |

### Security / Audit / Team / Permissions

| Feature / Capability                      | Audience        |      Status | Type                | Primary Entrypoint | Backend Source                                      | Portal Source                          | Sellable / Internal Flag     | Evidence Note                           |
| ----------------------------------------- | --------------- | ----------: | ------------------- | ------------------ | --------------------------------------------------- | -------------------------------------- | ---------------------------- | --------------------------------------- |
| Team / RBAC                               | Merchant-facing | Implemented | Non-AI              | Team               | role/guard/services + merchant portal               | `merchant/team/page.tsx`               | Sellable                     | Explicitly priced feature               |
| Security settings                         | Merchant-facing | Implemented | Non-AI              | Security           | security/auth paths                                 | `merchant/security/page.tsx`           | Sellable                     | Dedicated security surface              |
| Audit logs                                | Merchant-facing | Implemented | Non-AI              | Audit              | audit-related controllers + services                | `merchant/audit/page.tsx`              | Sellable                     | Explicitly priced feature               |
| Notifications                             | Merchant-facing | Implemented | Non-AI + Automation | Notifications      | `notifications.controller.ts`, notification service | `merchant/notifications/page.tsx`      | Sellable                     | Explicitly priced feature               |
| Push notifications                        | Merchant-facing |     Partial | Non-AI              | Push notifications | notifications subsystem                             | `merchant/push-notifications/page.tsx` | Sellable / evolving          | Route exists; runtime depth needs proof |
| Change password / auth account management | Merchant-facing | Implemented | Non-AI              | Account            | auth/account paths                                  | `merchant/change-password/page.tsx`    | Included platform capability | Standard account management             |

### Billing / Plans / Pricing / Entitlements / Usage Packs

| Feature / Capability               | Audience          |      Status | Type   | Primary Entrypoint  | Backend Source                                                          | Portal Source                                                                      | Sellable / Internal Flag     | Evidence Note                                  |
| ---------------------------------- | ----------------- | ----------: | ------ | ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| Static plan entitlements           | Merchant/internal | Implemented | Non-AI | Entitlements module | `shared/entitlements/index.ts`                                          | Pricing/plan surfaces consume it                                                   | Internal source of truth     | Canonical default plan map in code             |
| Billing catalog by region          | Merchant/internal | Implemented | Non-AI | Billing catalog     | `billing-catalog.service.ts`, billing plan controllers                  | `merchant/billing/page.tsx`, `merchant/pricing/page.tsx`, `merchant/plan/page.tsx` | Sellable                     | DB-driven bundles/add-ons/usage packs          |
| Checkout / subscriptions           | Merchant-facing   | Implemented | Non-AI | Billing checkout    | `billing-checkout.controller.ts`, `billing-subscriptions.controller.ts` | Billing pages                                                                      | Sellable                     | Checkout + subscription controller set present |
| Admin entitlements and offers      | Admin/internal    | Implemented | Non-AI | Admin billing ops   | `billing-admin.controller.ts`, admin entitlements/offers controllers    | `admin/entitlements/page.tsx`, `admin/offers/page.tsx`                             | Internal/admin               | Real admin surfaces exist                      |
| BYO pricing / custom quote catalog | Merchant/internal | Implemented | Non-AI | Billing catalog     | `billing-catalog.service.ts`                                            | Plan/pricing/billing surfaces                                                      | Sellable / enterprise/custom | Explicit BYO block in catalog response         |

### Admin Platform Features

| Feature / Capability       | Audience       |      Status | Type                  | Primary Entrypoint     | Backend Source                                     | Portal Source                     | Sellable / Internal Flag | Evidence Note                           |
| -------------------------- | -------------- | ----------: | --------------------- | ---------------------- | -------------------------------------------------- | --------------------------------- | ------------------------ | --------------------------------------- |
| Admin dashboard            | Admin          | Implemented | Non-AI                | Admin dashboard        | `admin-ops.controller.ts`, other admin controllers | `admin/dashboard/page.tsx`        | Internal Only            | Central admin overview                  |
| Admin analytics            | Admin          | Implemented | Non-AI + AI telemetry | Admin analytics        | `admin-ops.controller.ts`                          | `admin/analytics/page.tsx`        | Internal Only            | Real analytics and model usage metrics  |
| Admin merchants management | Admin          | Implemented | Non-AI                | Merchants admin        | `admin-merchants.controller.ts`                    | `admin/merchants/page.tsx`        | Internal Only            | Merchant administration surface         |
| DLQ management / replay    | Admin/internal | Implemented | Automation ops        | DLQ                    | DLQ service/controllers + admin ops                | `admin/dlq/page.tsx`              | Internal Only            | Operational replay and failure handling |
| Audit logs admin           | Admin          | Implemented | Non-AI                | Audit logs             | admin audit controllers/services                   | `admin/audit-logs/page.tsx`       | Internal Only            | Back-office audit surface               |
| Feature request admin      | Admin          | Implemented | Non-AI                | Feature request triage | feature request controllers                        | `admin/feature-requests/page.tsx` | Internal Only            | Product ops surface                     |

## AI Usage Audit

| Capability                   | Provider            | Model                                   | Selection Logic                                | Audience                          | Runtime Mode                    | Gating / Metering                       | Status                | Evidence                                                              |
| ---------------------------- | ------------------- | --------------------------------------- | ---------------------------------------------- | --------------------------------- | ------------------------------- | --------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| Customer chat commerce AI    | OpenAI              | `gpt-4o` / `gpt-4o-mini`                | Dynamic via `message-router.service.ts`        | Customer-facing                   | Real-time                       | Plan/usage limited by AI call quotas    | Implemented           | `llm.service.ts`, `message-router.service.ts`, `inbox.service.ts`     |
| Message routing              | OpenAI-aware router | `gpt-4o` / `gpt-4o-mini`                | Score-based and plan-aware                     | Internal/customer-facing          | Real-time                       | Implicit in commerce AI path            | Implemented           | `message-router.service.ts`                                           |
| Merchant assistant           | OpenAI              | `gpt-4o-mini` by `OPENAI_MODEL` default | Config-driven                                  | Merchant-facing                   | Real-time                       | Metered / quota-based                   | Implemented           | `merchant-assistant.service.ts`                                       |
| Copilot command parser       | OpenAI              | `gpt-4o-mini` by `OPENAI_MODEL` default | Config-driven structured parse                 | Merchant-facing                   | Real-time                       | Metered / quota-based                   | Implemented           | `copilot-ai.service.ts`, `copilot.controller.ts`                      |
| Ops AI                       | OpenAI              | `gpt-4o-mini` by `OPENAI_MODEL` default | Config-driven                                  | Merchant/internal                 | Real-time / background-assisted | Likely bundled by agent/plan            | Implemented           | `ops-ai.service.ts`                                                   |
| Inventory AI                 | OpenAI              | `gpt-4o-mini` by `OPENAI_MODEL` default | Config-driven                                  | Merchant/internal                 | Real-time / background-assisted | Likely bundled by agent/plan            | Implemented           | `inventory-ai.service.ts`                                             |
| Finance AI                   | OpenAI              | `gpt-4o-mini` by `OPENAI_MODEL` default | Config-driven                                  | Merchant/internal                 | Real-time / background-assisted | Likely bundled by agent/plan            | Implemented           | `finance-ai.service.ts`                                               |
| Vision / OCR analysis        | OpenAI              | `gpt-4o`                                | Fixed in service                               | Merchant/internal                 | Real-time / async review        | Metered through proof scans / OCR usage | Implemented           | `vision.service.ts`                                                   |
| Embeddings                   | OpenAI              | `text-embedding-3-small`                | Fixed in service                               | Internal RAG/retrieval            | Real-time / async indexing      | Internal enabler                        | Implemented           | `embedding.service.ts`, `rag-retrieval.service.ts`                    |
| Voice AI response generation | OpenAI              | `gpt-4o-mini`                           | Fixed in service                               | Customer-facing / merchant ops    | Real-time                       | Voice packs / enterprise implications   | Implemented           | `voice-ai.service.ts`, `voice.controller.ts`                          |
| Transcription                | OpenAI              | `whisper-1`                             | Default if not overridden                      | Customer-facing / merchant-facing | Real-time / async               | Metered via voice note / voice usage    | Implemented           | `transcription.adapter.ts`, `copilot.controller.ts`                   |
| TTS                          | ElevenLabs          | `eleven_multilingual_v2`                | Fixed model id                                 | Customer-facing / merchant-facing | Real-time                       | Voice-related metering                  | Implemented           | `voice-ai.service.ts`                                                 |
| Memory compression           | OpenAI              | `gpt-4o-mini`                           | Fixed in service                               | Internal                          | Async/background                | Internal                                | Implemented           | `memory-compression.service.ts`                                       |
| Agent/team abstraction       | Mixed orchestration | No single model                         | Uses underlying AI services and workflow logic | Merchant-facing                   | Real-time + workflow            | Varies by plan and feature surface      | Implemented / Partial | `agent-teams.controller.ts`, agents pages, copilot/assistant services |
| Marketing agent              | N/A                 | N/A                                     | Cataloged but not active                       | Merchant-facing                   | N/A                             | Not sellable yet                        | Stub / Coming Soon    | `AGENT_PRICES_EGP` explicitly `0`, stub                               |
| Support agent                | N/A                 | N/A                                     | Cataloged but not active                       | Merchant-facing                   | N/A                             | Not sellable yet                        | Stub / Coming Soon    | `AGENT_PRICES_EGP` explicitly `0`, stub                               |
| Content agent                | N/A                 | N/A                                     | Cataloged but not active                       | Merchant-facing                   | N/A                             | Not sellable yet                        | Stub / Coming Soon    | `AGENT_PRICES_EGP` explicitly `0`, stub                               |
| Sales agent                  | N/A                 | N/A                                     | Not implemented                                | Merchant-facing                   | N/A                             | Not sellable yet                        | Stub / Coming Soon    | `AGENT_PRICES_EGP` comment says not implemented                       |
| Creative agent               | N/A                 | N/A                                     | Not implemented                                | Merchant-facing                   | N/A                             | Not sellable yet                        | Stub / Coming Soon    | `AGENT_PRICES_EGP` comment says not implemented                       |

## Automation And Job Audit

### Merchant-Value Automations

| Job / Automation                          | Trigger / Cadence  | Action                                            | Audience        | Status      | Evidence                     |
| ----------------------------------------- | ------------------ | ------------------------------------------------- | --------------- | ----------- | ---------------------------- |
| Automation scheduler                      | Hourly `0 * * * *` | Runs merchant automation rules                    | Merchant-facing | Implemented | `automation.scheduler.ts`    |
| Follow-up scheduler                       | Every 10 min       | Queues conversation follow-ups                    | Merchant-facing | Implemented | `followup.scheduler.ts`      |
| Delivery status poller                    | Every 5 min        | Polls shipment status and emits updates           | Merchant-facing | Implemented | `delivery-status.poller.ts`  |
| Daily reports                             | Daily              | Sends/generates daily merchant reports            | Merchant-facing | Implemented | `daily-report.scheduler.ts`  |
| Weekly reports                            | Weekly + monthly   | Generates weekly/monthly report payloads          | Merchant-facing | Implemented | `weekly-report.scheduler.ts` |
| Forecast scheduler                        | Nightly            | Demand, churn, SLA, workforce forecast generation | Merchant-facing | Implemented | `forecast.scheduler.ts`      |
| Product OCR pipeline cleanup / processing | Every 10 min       | Supports OCR review workflow                      | Merchant-facing | Implemented | `product-ocr.service.ts`     |

### Merchant Automation Types Found In Code

- `SUPPLIER_LOW_STOCK`
- `REVIEW_REQUEST`
- `NEW_CUSTOMER_WELCOME`
- `REENGAGEMENT_AUTO`
- `CHURN_PREVENTION`
- `QUOTE_FOLLOWUP`
- `LOYALTY_MILESTONE`
- `EXPENSE_SPIKE_ALERT`
- `DELIVERY_SLA_BREACH`
- `TOKEN_USAGE_WARNING`
- `AI_ANOMALY_DETECTION`
- `SEASONAL_STOCK_PREP`
- `SENTIMENT_MONITOR`
- `LEAD_SCORE`
- `AUTO_VIP_TAG`
- `AT_RISK_TAG`
- `HIGH_RETURN_FLAG`

### System Maintenance Jobs

| Job / Automation                | Trigger / Cadence            | Action                                         | Audience                      | Status      | Evidence                           |
| ------------------------------- | ---------------------------- | ---------------------------------------------- | ----------------------------- | ----------- | ---------------------------------- |
| Subscription expiry scheduler   | Daily 2 AM UTC               | Expires overdue subscriptions / warns renewals | Internal + merchant-affecting | Implemented | `subscription-expiry.scheduler.ts` |
| Merchant deletion scheduler     | Daily 2 AM UTC               | Executes deletion workflow                     | Internal + admin              | Implemented | `merchant-deletion.scheduler.ts`   |
| Usage guard sync/reset          | Daily jobs                   | Usage sync / quota maintenance                 | Internal                      | Implemented | `usage-guard.service.ts`           |
| Notifications maintenance       | Daily 3 AM                   | Cleanup / maintenance                          | Internal                      | Implemented | `notifications.service.ts`         |
| Bulk operations cleanup         | Daily 4 AM                   | Cleanup old bulk ops artifacts                 | Internal                      | Implemented | `bulk-operations.service.ts`       |
| Staff service midnight cron     | Daily midnight               | Staff-related maintenance                      | Internal                      | Implemented | `staff.service.ts`                 |
| Overage service monthly cron    | Monthly                      | Overage maintenance/billing logic              | Internal                      | Implemented | `overage.service.ts`               |
| Webhook service recurring tasks | Every 10 sec + daily cleanup | Webhook delivery/cleanup maintenance           | Internal + merchant-affecting | Implemented | `webhook.service.ts`               |

### Internal Ops / Admin Event Pipelines

| Job / Pipeline          | Trigger / Cadence  | Action                                          | Audience       | Status      | Evidence                        |
| ----------------------- | ------------------ | ----------------------------------------------- | -------------- | ----------- | ------------------------------- |
| Message delivery worker | Every 30 sec       | Delivers queued outbound messages               | Internal ops   | Implemented | `message-delivery.worker.ts`    |
| Outbox worker           | Every 5 sec        | Publishes outbox events                         | Internal ops   | Implemented | `outbox.worker.ts`              |
| Outbox service          | Event-driven       | Persists outbox entries                         | Internal ops   | Implemented | `outbox.service.ts`             |
| DLQ service             | Event/admin driven | Stores/replays failed events                    | Internal/admin | Implemented | `dlq.service.ts`                |
| Event handlers          | Event-driven       | Handle order, shipment, follow-up, alert events | Internal       | Implemented | `application/events/handlers/*` |

## Pricing And Bundle Audit

## Default Plan Entitlements From Static Code

| Plan         |      Price | Currency | Included Agents         | Included Features                                                                                                            | Key Limits                                                                | Sellability Note              | Evidence                       |
| ------------ | ---------: | -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- | ------------------------------ |
| `TRIAL`      |        `0` | EGP      | Ops, Inventory, Finance | Conversations, Orders, Catalog, Inventory, Reports, Notifications, Voice Notes, Payments, Copilot Chat                       | 50 msgs/mo, 20 AI calls/day, 10 proof scans/mo, 1 branch                  | Trial only, 14 days           | `PLAN_ENTITLEMENTS.TRIAL`      |
| `STARTER`    |      `999` | EGP      | Ops                     | Conversations, Orders, Catalog, Payments, Reports, Notifications, Webhooks, Voice Notes, Copilot Chat                        | 5k msgs/mo, 100 AI calls/day, 25 proof scans/mo, 1 branch                 | Sellable                      | `PLAN_ENTITLEMENTS.STARTER`    |
| `BASIC`      |     `2200` | EGP      | Ops, Inventory, Finance | Conversations, Orders, Catalog, Inventory, Reports, Notifications, Payments, Webhooks, API Access, Voice Notes, Copilot Chat | 15k msgs/mo, 200 AI calls/day, 50 proof scans/mo, 1 branch                | Sellable                      | `PLAN_ENTITLEMENTS.BASIC`      |
| `GROWTH`     |     `4800` | EGP      | Ops, Inventory, Finance | Basic features plus Team, Loyalty, Automations                                                                               | 30k msgs/mo, 500 AI calls/day, 1 POS connection, 10 automations           | Sellable                      | `PLAN_ENTITLEMENTS.GROWTH`     |
| `PRO`        |    `10000` | EGP      | Ops, Inventory, Finance | Growth-like core plus KPI Dashboard, Audit Logs, Forecasting                                                                 | 100k msgs/mo, 2500 AI calls/day, 3 POS, 2 branches, 50 automations        | Sellable                      | `PLAN_ENTITLEMENTS.PRO`        |
| `ENTERPRISE` |    `21500` | EGP      | Ops, Inventory, Finance | Pro-like core plus Custom Integrations, SLA, Voice Calling                                                                   | 250k msgs/mo, 5000 AI calls/day, 5 POS, 5 branches, unlimited automations | Sellable / enterprise         | `PLAN_ENTITLEMENTS.ENTERPRISE` |
| `CUSTOM`     | Negotiated | Varies   | Base template only      | Minimal base template, customized                                                                                            | Unlimited placeholders                                                    | Conceptually defined / custom | `PLAN_ENTITLEMENTS.CUSTOM`     |

## Feature Add-On Prices From Static Code

| Feature             | Price EGP / mo | Sellability / Note                     |
| ------------------- | -------------: | -------------------------------------- |
| Conversations       |             99 | Implemented                            |
| Orders              |             79 | Implemented                            |
| Catalog             |             49 | Implemented                            |
| Inventory           |            149 | Implemented                            |
| Payments            |            129 | Implemented                            |
| Vision OCR          |              0 | Internal only, included under Payments |
| Voice Notes         |             69 | Implemented                            |
| Reports             |             99 | Implemented                            |
| Webhooks            |             49 | Implemented                            |
| Team                |             79 | Implemented                            |
| Loyalty             |            149 | Implemented                            |
| Notifications       |             39 | Implemented                            |
| Audit Logs          |             49 | Implemented                            |
| KPI Dashboard       |             79 | Implemented                            |
| API Access          |             99 | Implemented                            |
| Copilot Chat        |              0 | Included, metered by quota             |
| Custom Integrations |              0 | Enterprise custom pricing              |
| SLA                 |              0 | Enterprise custom pricing              |
| Automations         |            249 | Implemented add-on                     |
| Forecasting         |            349 | Implemented add-on                     |
| Voice Calling       |              0 | Enterprise voice-pack/custom pricing   |

## Agent Add-On Prices From Static Code

| Agent           | Price EGP / mo | Status             |
| --------------- | -------------: | ------------------ |
| Ops Agent       |            299 | Implemented        |
| Inventory Agent |            199 | Implemented        |
| Finance Agent   |            349 | Implemented        |
| Marketing Agent |              0 | Stub / Coming Soon |
| Support Agent   |              0 | Stub / Coming Soon |
| Content Agent   |              0 | Stub / Coming Soon |
| Sales Agent     |              0 | Stub / Coming Soon |
| Creative Agent  |              0 | Stub / Coming Soon |

## AI Usage Tier Labels In Static Code

| Tier         | AI Calls / Day | Token Budget / Day | Price EGP / mo | Note              |
| ------------ | -------------: | -----------------: | -------------: | ----------------- |
| Basic        |            300 |            150,000 |              0 | Reference/UI tier |
| Standard     |            500 |            300,000 |            129 | Reference/UI tier |
| Professional |          1,500 |            800,000 |            349 | Reference/UI tier |
| Unlimited    |      Unlimited |          Unlimited |            699 | Reference/UI tier |

## Message Tier Labels In Static Code

| Tier         | Messages / Month | Price EGP / mo | Note                            |
| ------------ | ---------------: | -------------: | ------------------------------- |
| Starter      |           10,000 |              0 | Replacement tier, not stackable |
| Basic        |           15,000 |             99 | Replacement tier, not stackable |
| Standard     |           50,000 |            399 | Replacement tier, not stackable |
| Professional |          150,000 |            699 | Replacement tier, not stackable |
| Enterprise   |        Unlimited |          1,299 | Replacement tier, not stackable |

## Regional Billing Catalog

- Source: `billing-catalog.service.ts`
- Regions explicitly supported in code: `EG`, `SA`, `AE`, `OM`, `KW`
- Catalog shape includes:
  - bundles
  - bundle capacity add-ons
  - bundle usage packs
  - BYO core add-on
  - BYO feature add-ons
  - BYO usage packs
- DB-backed tables used:
  - `plans`
  - `plan_limits`
  - `plan_prices`
  - `plan_entitlements`
  - `add_ons`
  - `add_on_prices`
  - `usage_packs`
  - `usage_pack_prices`
- Commercial modifiers in service:
  - `byoMarkup = 1.15`
  - cycle discounts: `1 month = 0%`, `3 = 5%`, `6 = 10%`, `12 = 15%`

## Regional Pricing Evidence In Migrations

- `apps/api/migrations/098_update_production_plan_limits.sql`
  - seeds AE/SA regional bundle base pricing
- `apps/api/migrations/088_add_om_kw_region_prices.sql`
  - seeds OM/KW regional pricing
- `apps/api/migrations/101_update_byo_addon_prices.sql`
  - seeds AE/SA add-on and usage-pack pricing

## Watch-Outs And Contradictions

- The codebase has both static plan entitlements and a richer DB-driven regional billing catalog. Do not treat one as the full commercial story by itself.
- Several agents are priced/cataloged but explicitly marked not implemented or coming soon.
- `VISION_OCR` is technically implemented but not modeled as a standalone purchasable feature in static pricing.
- Legacy Twilio webhook code still exists even though Meta appears to be the primary omnichannel path.
- Some surfaces, especially agent/team pages, are part workflow/orchestration framing and not separate deep model families by themselves.
- Pricing constants in `shared/entitlements/index.ts` are static defaults. Real regional bundle/add-on values can differ through the billing catalog and migrations.

## Appendix: High-Signal API Surface Families

- Commerce/inbox: `meta-webhook`, `twilio-webhook`, `inbox`, `conversations`, `assistant`, `copilot`, `voice`
- Orders/merchant ops: `orders`, `merchant-portal`, `portal-delivery`, `portal-calls`, `followups`, `quote-requests`
- Catalog/inventory: `catalog`, `merchant-catalog`, `portal-catalog`, `inventory`, `portal-inventory`
- Payments: `payments`, `vision`, COD/payment-related merchant portal paths
- Reports/analytics: `analytics`, `portal-analytics`, `kpi`, `advanced-reports`
- Billing: `billing`, `billing-plans`, `billing-checkout`, `billing-subscriptions`, `billing-admin`
- Admin: `admin-ops`, `admin-merchants`, `admin`, `production-features`
- Integrations/webhooks: `integrations`, `integrations-public`, `webhooks`
