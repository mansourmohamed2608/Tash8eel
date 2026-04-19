# Phase 8 - Business / Product / Engineering Strategy

## What This Product Is (Business View)

- **Product**: AI-powered WhatsApp commerce agent for Egyptian SMBs. Evidence: `README.md:3-16`, `docs/BUSINESS_SCORECARD.md:5-8`.
- **Core value**: Automates WhatsApp conversations, order handling, inventory, and follow-ups. Evidence: `README.md:7-28`, `docs/BUSINESS_SCORECARD.md:11-24`.

## Target Users

- Primary: Egyptian SMB owners and staff operating WhatsApp-based commerce. Evidence: `docs/BUSINESS_SCORECARD.md:5-24`.
- Secondary: Admin operators managing entitlements/tenants via portal. Evidence: `apps/portal/src/app/admin/merchants/page.tsx:1-100`, `apps/portal/src/app/admin/entitlements/page.tsx:1-120`.

## Monetization / Business Model Hints

- Draft pricing tiers and KPI targets described in business scorecard. Evidence: `docs/BUSINESS_SCORECARD.md:89-107`.
- Feature gating implied by entitlements and agent subscriptions. Evidence: `apps/api/src/shared/guards/entitlement.guard.ts:1-88`, `apps/api/migrations/012_merchant_entitlements.sql:1-58`.

## Product Fundamentals (Current State)

- **Billing & subscription baseline** is now in place (plans, subscriptions, invoices, portal endpoints), but **no external billing provider integration** yet. Evidence: `apps/api/migrations/024_billing_subscriptions.sql:1-120`, `apps/api/src/api/controllers/billing.controller.ts:1-120`, `apps/portal/src/app/merchant/plan/page.tsx:120-420`.
- **Product analytics instrumentation** exists via `analytics_events` table + portal tracking hook (page_view), but **no dashboards/ETL yet**. Evidence: `apps/api/migrations/023_analytics_events.sql:1-52`, `apps/api/src/api/controllers/analytics-events.controller.ts:1-120`, `apps/portal/src/hooks/use-analytics.tsx:1-80`.
- **Onboarding flows** exist in portal + API DTO, but **no guided checklist completion tracking yet**. Evidence: `apps/portal/src/app/merchant/onboarding/page.tsx:1-200`, `apps/portal/src/components/layout/sidebar.tsx:50-80`, `apps/api/src/api/controllers/merchants.controller.ts:130-210`.

## Competitive Differentiation Opportunities

- Emphasize Egyptian Arabic, voice notes, and WhatsApp-native flows. Evidence: `README.md:7-28`, `docs/BUSINESS_SCORECARD.md:47-57`.
- Double down on local courier integrations (Twilio/WhatsApp + delivery adapters). Evidence: `README.md:11-12`, `apps/api/src/application/adapters/delivery-adapter.interface.ts:1-20`, `apps/api/src/application/adapters/mock-delivery.adapter.ts:1-40`.

## KPI Suggestions

Based on scorecard targets and existing dashboards:

- Response time, conversion rate, failed delivery rate, cart recovery, token spend. Evidence: `docs/BUSINESS_SCORECARD.md:28-39`.
- Merchant activation and retention metrics are listed in the scorecard; baseline instrumentation exists, but no KPI dashboards/ETL are wired yet. Evidence: `docs/BUSINESS_SCORECARD.md:131-138`, `apps/api/migrations/023_analytics_events.sql:1-52`.

## Roadmap Recommendations (30/60/90 days)

### 30 Days

- Resolve P0 security issues (secret removal, tenant isolation). Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:1-8`.
- Fix portal API correctness issues (duplicate methods, loyalty path). Evidence: `docs/project-scan/04_FRONTEND_FINDINGS.md:1-6`.
- Stabilize migrations (pgvector image, unify staff/notification schema). Evidence: `docs/project-scan/05_DATABASE_FINDINGS.md:1-6`.

### 60 Days

- Implement staff JWT auth guard for portal endpoints and WebSocket auth. Evidence: `apps/api/src/application/services/staff.service.ts:49-583`, `apps/api/src/infrastructure/websocket/events.gateway.ts:47-82`.
- Expand onboarding checklist and product setup screens (catalog import, WhatsApp connection). Evidence: `apps/portal/src/app/merchant/onboarding/page.tsx:1-200`.
- Add KPI dashboards/ETL for analytics_events and alerting. Evidence: `apps/api/migrations/023_analytics_events.sql:1-52`, `docs/OBSERVABILITY.md:95-142`.

### 90 Days

- Integrate billing provider (Stripe/Paymob/etc) and automate entitlement provisioning. Evidence: `apps/api/migrations/024_billing_subscriptions.sql:1-120`, `apps/api/migrations/012_merchant_entitlements.sql:1-58`.
- Expand integrations (official WhatsApp Business, courier APIs). Evidence: `docs/BUSINESS_SCORECARD.md:54-55`.
- Improve reliability: outbox monitoring, alerting, SLOs, backups. Evidence: `docs/OBSERVABILITY.md:95-142`.

## Engineering Roadmap (Themes)

- **Reliability**: tighten webhook validation, add request retries, add DB and worker monitoring.
- **Security**: remove secrets, enforce merchant scoping, JWT guards, WS auth.
- **Performance**: move dashboard computations to SQL aggregates; add indices for common filters.
- **UX polish**: improve portal error states and onboarding, reduce auth friction.
- **Developer velocity**: add pre-commit hooks, CI for portal tests, CODEOWNERS.
