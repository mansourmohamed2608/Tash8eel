# Consolidated TODO List (All Project-Scan Findings)

This checklist consolidates **all findings** from the project‑scan docs into one execution list.  
Each task includes evidence references and the intended outcome.

## P0 — Critical (Security / Isolation)

- [ ] **Remove committed secrets + rotate keys** (OpenAI, Twilio, DB, admin).  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:3-6`, `docs/project-scan/06_DEVOPS_FINDINGS.md:3-5`  
      Outcome: repo contains no live secrets; all keys rotated.

- [x] **Enforce tenant isolation** for merchant‑scoped endpoints (validate `merchantId` vs authenticated merchant).  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:3-6`  
      Outcome: cross‑tenant request returns 403.

- [x] **Protect admin early‑access endpoint** with admin guard.  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:5-6`  
      Outcome: unauthenticated request returns 401.

## P1 — High (Security / Correctness / UX)

- [x] **WebSocket authentication** (reject client‑supplied merchantId without JWT).  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:6-7`  
      Outcome: connection without valid JWT is rejected.

- [x] **Require Twilio signature** when validation is enabled.  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:7-8`  
      Outcome: unsigned webhook is rejected.

- [x] **Upload limits + MIME validation** for CSV imports; remove raw CSV logging.  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:7-9`  
      Outcome: oversized/invalid file returns 4xx; no PII in logs.

- [x] **Fix `portalApi` duplicate keys** so notifications popover works.  
      Evidence: `docs/project-scan/04_FRONTEND_FINDINGS.md:3-5`  
      Outcome: portal notifications load successfully.

- [x] **Stop returning password reset tokens in production**.  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:8-9`  
      Outcome: production response does not expose reset tokens.

## P2 — Medium (Data / Correctness / Reliability)

- [x] **Resolve loyalty API path mismatch** (`/api/api/...` vs `/api/...`).  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:9-10`, `docs/project-scan/04_FRONTEND_FINDINGS.md:5-6`  
      Outcome: loyalty UI works without 404.

- [x] **Consolidate `notification_preferences` schema** (duplicate table definitions).  
      Evidence: `docs/project-scan/05_DATABASE_FINDINGS.md:3-5`  
      Outcome: single canonical table + migration.

- [x] **Unify staff tables** (`merchant_staff` vs `staff_members`).  
      Evidence: `docs/project-scan/05_DATABASE_FINDINGS.md:3-4`  
      Outcome: one staff table; code references updated.

- [x] **pgvector extension compatibility** (use `pgvector/pgvector` image or gate extension).  
      Evidence: `docs/project-scan/05_DATABASE_FINDINGS.md:3-4`  
      Outcome: fresh local migrations succeed.

- [x] **Portal test harness** (Vitest/Jest + RTL).  
      Evidence: `docs/project-scan/04_FRONTEND_FINDINGS.md:6-7`  
      Outcome: portal tests run in CI.

- [x] **Remove legacy migration fallback** in custom runner to avoid drift.  
      Evidence: `docs/project-scan/05_DATABASE_FINDINGS.md:5-6`  
      Outcome: DB can be fully rebuilt from migrations.

## P3 — Low (DX / Observability / Governance)

- [x] **Add repo standards**: `.editorconfig`, CODEOWNERS, PR/issue templates.  
      Evidence: `docs/project-scan/08_CODE_QUALITY_STANDARDS.md:7-15`  
      Outcome: consistent dev experience + review ownership.

- [x] **Add pre‑commit hooks** (lint‑staged/husky).  
      Evidence: `docs/project-scan/08_CODE_QUALITY_STANDARDS.md:7-15`  
      Outcome: formatting + lint enforced.

- [x] **Add metrics/tracing (OpenTelemetry)**.  
      Evidence: `docs/project-scan/06_DEVOPS_FINDINGS.md:5-6`  
      Outcome: metrics available in monitoring stack.

- [x] **Archive/remove legacy snapshot** (temp_extract).  
      Evidence: `docs/project-scan/03_BACKEND_FINDINGS.md:9-10`  
      Outcome: repo tree clean; builds unaffected.

## Product / Business Gaps (Not Found in Repo)

- [x] **Billing/subscription integration** (provider + provisioning).  
      Evidence: `docs/project-scan/09_BUSINESS_AND_ROADMAP.md:15-23`  
      Outcome: paid tiers enforced beyond entitlements.

- [x] **Product analytics instrumentation** (activation/retention funnels).  
      Evidence: `docs/project-scan/09_BUSINESS_AND_ROADMAP.md:18-21`  
      Outcome: KPI tracking in dashboard or analytics pipeline.

- [x] **Onboarding flows** (guided setup + checklists).  
      Evidence: `docs/project-scan/09_BUSINESS_AND_ROADMAP.md:18-21`  
      Outcome: new merchants can complete setup step‑by‑step.

## New Features Requested (To Build)

- [x] **Feature/Agent suggestion system** (merchant request intake + admin review).  
      Evidence: _Not found in repository_ (no current feature request module).  
      Outcome: merchants submit ideas; admins triage.

- [x] **Merchant AI Assistant chat** (uses KB + merchant context).  
      Evidence: _Not found in repository_ (no merchant‑facing AI chat UI).  
      Outcome: merchant can ask questions; assistant responds with context.

- [x] **Onboarding help & documentation hub** (tips, tutorials, walkthroughs).  
      Evidence: `docs/project-scan/09_BUSINESS_AND_ROADMAP.md:18-21`  
      Outcome: in‑app onboarding content + help center.

## Execution Order (Requested)

1. Inventory → Notifications → Knowledge Base hardening + UX.
2. Ops agent + Ops UI enhancements.
3. Feature Requests + AI Assistant + Onboarding.
