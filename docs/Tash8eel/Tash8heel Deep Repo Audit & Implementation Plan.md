# Tash8heel Deep Repo Audit & Implementation Plan

---

## 1. EXECUTIVE DIAGNOSIS

### What the repo currently is

Tash8heel is a **production-grade monorepo** (`apps/portal` + `apps/api` + `apps/worker` + `packages/shared` + `packages/agent-sdk`) implementing an AI-driven merchant operating system. The stack is **Next.js 16 (App Router)** for the portal, **NestJS 10** for the API, **PostgreSQL + TypeORM + pgvector** for data/retrieval, and **OpenAI (GPT-4o-mini/4o)** for AI. It has 90+ pages, 68 API controllers, 57 DB migrations, real-time WebSocket updates, feature gating, multi-agent AI (OPS/INVENTORY/FINANCE), vector search, voice transcription, and vision/OCR services.

### Where it matches the docs

- **Multi-merchant architecture**: The assistant engine is largely generic. Knowledge comes from `merchants.knowledge_base` JSONB, catalog embeddings, and live operational data — not from hardcoded per-merchant prompts. This matches the KB/RAG schema doc's core principle.
- **Agent separation**: OPS, INVENTORY, FINANCE agents are cleanly separated with distinct system prompts and service files.
- **Feature gating**: Entitlements system exists with agent dependencies, feature dependencies, and plan-based limits. Merchant layout enforces route blocking.
- **RTL foundation**: `<html lang="ar" dir="rtl">` is set. Arabic fonts (Cairo, IBM Plex Sans Arabic) are loaded. Logical CSS properties (`margin-inline`, `padding-inline`) are used.
- **Operational breadth**: Orders, inventory, conversations, calls, payments, reports, branches, cashier, billing, automations, forecasting — real modules with real API backing.
- **Off-topic filtering**: Zero-cost hard-deny patterns exist before LLM calls.
- **Confidence handling**: Confidence scoring (0-1) with escalation thresholds.
- **Voice + Vision**: Whisper transcription, GPT-4o vision for payment proofs/product images/medicine OCR.

### Where it clearly does NOT match

| Area                                                                     | Gap Severity |
| ------------------------------------------------------------------------ | ------------ |
| **Theme/colors: dark black+gold vs. warm off-white+blue**                | **CRITICAL** |
| **Typography: Cairo vs. IBM Plex Arabic**                                | **HIGH**     |
| **Pricing plan names: STARTER/BASIC/GROWTH/PRO vs. Lane A/B + T1/T2/T3** | **HIGH**     |
| **Dark-mode-only vs. light-mode-default**                                | **CRITICAL** |
| **Gold as primary accent vs. gold explicitly banned**                    | **CRITICAL** |
| **Category strategies (CLOTHES/FOOD/SUPERMARKET) = hardcoded verticals** | **MEDIUM**   |
| **KB schema far simpler than doc spec**                                  | **MEDIUM**   |
| **No router decision model (Path A-G)**                                  | **MEDIUM**   |
| **No conversation playbooks**                                            | **MEDIUM**   |
| **No setup fee / branch-based pricing logic**                            | **HIGH**     |
| **Consumer dashboard uses fake mock data**                               | **MEDIUM**   |
| **Navigation is feature-dump, not workflow-grouped**                     | **HIGH**     |

---

## 2. REPO-TO-DOC GAP MATRIX

### A. UI / Theme / Design Tokens

| Aspect                 | Repo Reality                                                      | Doc Truth                                              | Gap Severity | Risk                                                     |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ | ------------ | -------------------------------------------------------- |
| **Color mode**         | Dark-only (`color-scheme: dark`, `--bg-base: #0a0a0b`)            | Light-mode default, warm off-white `#FAF9F7`           | **CRITICAL** | Product looks like AI demo, not operations OS            |
| **Primary accent**     | Gold `#e8c547` (brand, scrollbars, insight strips, ghost actions) | Operational Blue `#2D6BE4`                             | **CRITICAL** | Directly contradicts brand identity package              |
| **AI semantic color**  | No dedicated AI color; gold used decoratively                     | AI Teal `#1AAFA0` reserved exclusively for AI signals  | **HIGH**     | AI meaning is invisible; gold conflates brand+AI+warning |
| **Warning color**      | Amber `#f59e0b` exists but gold blurs the boundary                | Amber = warning ONLY, never brand or accent            | **HIGH**     | Semantic confusion between brand gold and warning amber  |
| **Background palette** | 4-level dark scale (#0a0a0b → #222228)                            | Warm off-white `#FAF9F7` base, white `#FFFFFF` surface | **CRITICAL** | Entire product surface needs inversion                   |
| **Text palette**       | Light-on-dark (#f4f4f5, #a1a1aa, #52525b)                         | Dark-on-light (#1C1E23, #4B5260, #8891A0)              | **CRITICAL** | Every text color needs changing                          |
| **Border system**      | White-alpha borders (rgba 255,255,255,0.06-0.18)                  | Neutral 300 `#C4C7D0` borders                          | **HIGH**     | Structural change to all surfaces                        |
| **Drop shadows**       | Present on some cards                                             | Explicitly banned in brand rules                       | **MEDIUM**   | Minor cleanup                                            |

### B. Typography

| Aspect              | Repo Reality                 | Doc Truth                               | Gap Severity | Risk                                                          |
| ------------------- | ---------------------------- | --------------------------------------- | ------------ | ------------------------------------------------------------- |
| **Arabic headings** | Cairo 600/700/900            | IBM Plex Arabic SemiBold (600)          | **HIGH**     | Cairo explicitly called out as "overused in Egyptian digital" |
| **Arabic body**     | IBM Plex Sans Arabic 400/500 | IBM Plex Arabic 400                     | **MEDIUM**   | Close but not identical font family                           |
| **English body**    | Cairo (via Tailwind `sans`)  | IBM Plex Sans                           | **HIGH**     | Tailwind config routes all sans to Cairo                      |
| **Monospace**       | JetBrains Mono               | IBM Plex Mono (for brand/data contexts) | **LOW**      | JetBrains Mono is fine for code/data; Plex Mono for brand     |
| **Line height**     | 1.8 globally                 | 1.7-1.8 Arabic, 1.6-1.7 English         | **LOW**      | Minor tuning                                                  |

### C. Pricing / Plan Structure

| Aspect                 | Repo Reality                                                      | Doc Truth                                                     | Gap Severity | Risk                                                |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- | ------------ | --------------------------------------------------- |
| **Plan names**         | TRIAL, STARTER, BASIC, GROWTH, PRO, ENTERPRISE, CHAT_ONLY, CUSTOM | Lane A, Lane B, T1 TASHGHEEL, T2 TAWASSU', T3 HAYMANA, Lane D | **HIGH**     | Complete naming mismatch                            |
| **Pricing model**      | Per-plan flat monthly (999-21,500 EGP)                            | Branch-based for chain family, flat for lighter lanes         | **HIGH**     | No branch-based pricing logic exists                |
| **Setup fees**         | Not implemented                                                   | Required: 2,000-22,000 EGP by lane                            | **HIGH**     | Missing revenue protection                          |
| **Conversation caps**  | Per-day message limits exist                                      | Per-month conversation caps with overage packs                | **MEDIUM**   | Different metering unit (messages vs conversations) |
| **No-free-trial rule** | TRIAL plan exists (14-day, free)                                  | "No free trials" — pilot = 90 days, 50% rate                  | **HIGH**     | Direct contradiction                                |
| **Public pricing**     | `/merchant/pricing` page exists                                   | "No public pricing page"                                      | **HIGH**     | Premature exposure                                  |
| **Add-on structure**   | Feature add-ons and AI usage tiers defined                        | Add-ons = extra POS, extra channel, calls module, onboarding  | **MEDIUM**   | Different add-on philosophy                         |
| **T1 TASHGHEEL**       | Does not exist                                                    | First chain tier, up to 5 branches                            | **HIGH**     | Missing tier                                        |

### D. AI / Assistant Architecture

| Aspect                     | Repo Reality                                                                       | Doc Truth                                                                         | Gap Severity | Risk                                            |
| -------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| **Generic engine**         | Mostly generic via merchant profile + KB                                           | Must be fully generic, no vertical hacks                                          | **MEDIUM**   | Category strategies are a partial violation     |
| **Category strategies**    | `CategoryStrategyFactory` with CLOTHES, FOOD, SUPERMARKET, GENERIC                 | Behavior from data/config, NOT hardcoded verticals                                | **MEDIUM**   | These are relatively thin but set a bad pattern |
| **KB structure**           | Single JSONB column (`merchants.knowledge_base`) with businessInfo, faqs, policies | 3-layer system: static KB, structured business data, live operational data        | **HIGH**     | KB is flat, not layered or routed               |
| **Router decision model**  | No explicit routing (Path A-G)                                                     | Must classify every request into KB/data/live/image/OCR/voice/escalate paths      | **HIGH**     | Missing core architectural piece                |
| **Conversation playbooks** | Not implemented                                                                    | Reusable scenario flows (knows-what-wants, unsure, image, voice, complaint, etc.) | **MEDIUM**   | Missing but not blocking                        |
| **FAQ golden answers**     | Basic faqs array in KB JSONB                                                       | Structured FAQ with question_patterns, confidence_notes, escalation_if_unsure     | **MEDIUM**   | Simplified version exists                       |
| **Retrieval chunking**     | Catalog embedding via pgvector (good)                                              | Detailed chunking rules with metadata per chunk                                   | **MEDIUM**   | Catalog RAG exists; KB retrieval doesn't        |
| **Chunk metadata**         | Minimal (merchant_id, text)                                                        | Full metadata: source_type, module, category, locale, confidence_level            | **MEDIUM**   | Missing metadata enrichment                     |
| **Image analysis**         | GPT-4o vision for payment proofs, product images, medicine packages                | Generic SaaS capability with merchant-rule comparison                             | **LOW**      | Exists, needs generalization                    |
| **OCR**                    | Part of vision service                                                             | Separate OCR path with text extraction → normalization → routing                  | **LOW**      | Exists, needs formalization                     |
| **Voice notes**            | Whisper transcription + order creation                                             | Transcribe → summarize → route through same logic as text                         | **LOW**      | Exists, mostly correct                          |

### E. Navigation / Page Structure

| Aspect                    | Repo Reality                                                                       | Doc Truth                              | Gap Severity | Risk                          |
| ------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- | ------------ | ----------------------------- |
| **Navigation philosophy** | 8 sections, 50+ items = feature dump                                               | Grouped by workflow, not feature count | **HIGH**     | Overwhelming sidebar          |
| **Dashboard**             | Feature showcase with charts/KPIs                                                  | Daily briefing (not feature showcase)  | **MEDIUM**   | Conceptual shift needed       |
| **Command center**        | `/merchant/command-center` exists                                                  | Must be gated, not surfaced casually   | **MEDIUM**   | Should be hidden if not ready |
| **Duplicate pages**       | `/merchant/team` AND `/merchant/teams`; `/merchant/analytics` AND `/merchant/kpis` | Clean, deduplicated                    | **LOW**      | Cleanup needed                |
| **Assistant page**        | `/merchant/assistant` in both nav sections 2 and 7                                 | Should appear once, clearly positioned | **LOW**      | Duplicate nav entry           |

### F. Production Readiness

| Aspect                      | Repo Reality                                            | Risk                                                  |
| --------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| **Consumer dashboard**      | Uses `mockData.ts` — all KPIs/charts are fake           | **HIGH** — misleading if shown to prospects           |
| **Merchant layout**         | 1,276-line file with inline feature gates               | **MEDIUM** — maintainability risk                     |
| **Sidebar**                 | 1,276-line file with complex nav + RBAC                 | **MEDIUM** — should be split                          |
| **Pricing page**            | Exists at `/merchant/pricing`                           | **HIGH** — docs say no public pricing                 |
| **Roadmap page**            | `/merchant/roadmap` exposes internal plans              | **MEDIUM** — should be gated                          |
| **Forecast/command center** | Exposed in nav                                          | **MEDIUM** — if not production-ready, should be gated |
| **Dead routes**             | Multiple blocked routes in layout but pages still exist | **LOW** — dead code                                   |

---

## 3. WHAT IS ALREADY STRONG AND SHOULD BE PRESERVED

### Real logic worth keeping

1. **Entitlements system** (`apps/api/src/shared/entitlements/index.ts`) — agent types, feature types, dependencies, plan limits. Structurally sound; needs name/number remapping, not rewrite.
2. **Vector search** (`apps/api/src/application/llm/vector-search.service.ts`) — pgvector with cosine distance, MMR re-ranking (λ=0.65), 30 nearest neighbors. Production-quality RAG foundation.
3. **Embedding service** (`apps/api/src/application/llm/embedding.service.ts`) — batch processing, text cleaning, test-mode fallbacks. Solid.
4. **Merchant context service** (`apps/api/src/application/llm/merchant-context.service.ts`) — loads KB from DB, syncs from catalog. Good foundation for Layer 1+2 of KB schema.
5. **Off-topic filter** (`apps/api/src/application/llm/llm.service.ts` lines 37-73) — zero-cost hard-deny patterns. Exactly right.
6. **Usage guard** (`apps/api/src/application/services/usage-guard.service.ts`) — tracks messages, AI calls, tokens, templates, voice minutes, map lookups. Real metering.
7. **Vision service** (`apps/api/src/application/llm/vision.service.ts`) — payment proof classification, product image analysis. Generic enough.
8. **Voice AI service** (`apps/api/src/application/services/voice-ai.service.ts`) — Whisper transcription, voice ordering. Works.
9. **WebSocket real-time** — Socket.io integration baked into layouts for live updates. Production-quality.
10. **Auth system** — NextAuth + JWT + API keys + admin keys + internal keys. Three-tier auth is solid.
11. **Middleware** — correlation IDs, rate limiting, Helmet security headers, CORS. Production-ready.
12. **Migration system** — 57 raw SQL migrations. Stable schema evolution.
13. **Worker** — outbox processor, agent orchestrator, followup scheduler, daily reports. Real async infrastructure.
14. **Shadcn/Radix component library** — 30+ UI primitives. Framework is right; tokens need updating.

### Components worth reusing

- All Radix UI primitives (dialog, dropdown, tabs, etc.)
- Data table components
- Chart components (recharts) — need token updates
- Error boundary
- Auth guard
- WebSocket notification system
- Shell layout structure (grid-based, collapsible sidebar)

### Modules more mature than expected

- **Billing system**: Full billing plans/subscriptions/invoices with DB tables, catalog service, checkout flow. Needs lane remapping but infrastructure is there.
- **Inventory system**: Multiple sub-pages (insights, expiry alerts, FIFO valuation, SKU merge, recipes, shrinkage). Deep.
- **Reports system**: CFO summary, accountant package, tax report, cash flow, monthly close, discount impact, refund analysis. Serious.
- **Branch management**: Branch-level settings, inventory, alerts, P&L, shifts. Multi-branch is real.

---

## 4. WHAT IS PARTIAL, MISLEADING, DUPLICATED, OR STRUCTURALLY WEAK

### Partial

- **KB/RAG**: Only catalog embeddings exist. Static KB (FAQs, policies) has no vector retrieval. No chunking pipeline. No metadata-enriched chunks. No router decision model.
- **Conversation playbooks**: Not implemented at all. The doc defines 10 playbook types.
- **Business rules schema**: No structured rules table. Rules live in KB JSONB as free text.
- **Setup fees**: No implementation. No billing for onboarding work.
- **Branch-based pricing**: No per-branch billing logic. Plans are flat monthly.

### Misleading

- **Consumer dashboard** (`/dashboard`): Renders fake data from `mockData.ts`. KPICard, RevenueChart, TopProductsChart, ChannelStatus all show static numbers. If shown to prospects, this fakes production readiness.
- **Pricing page** (`/merchant/pricing`): Exists and is accessible. Docs explicitly say no public pricing page.
- **TRIAL plan** (14-day free): Docs say "no free trials" — pilots are 90-day at 50% rate.
- **Feature roadmap page** (`/merchant/roadmap`): Exposes internal plans.

### Duplicated

- `/merchant/team` AND `/merchant/teams` — two team pages
- `/merchant/analytics` AND `/merchant/kpis` — overlapping analytics
- `/merchant/forecast` AND `/merchant/analytics/forecast` — two forecast entries
- `components/layout/sidebar.tsx` AND `components/shell/Sidebar.tsx` — two sidebar implementations
- `components/dashboard/DataTable.tsx` AND `components/ui/data-table.tsx` AND `components/ui/DataTable.tsx` — three data table variants
- `components/dashboard/StatusPill.tsx` AND `components/ui/StatusPill.tsx` — two status pill components
- `components/dashboard/Button.tsx`, `components/dashboard/Card.tsx`, `components/dashboard/Input.tsx` — shadow copies of base UI components

### Structurally weak

- **Merchant layout** (1,276 lines): Auth guard + feature gates + sidebar toggle + WebSocket + floating action button + route blocking all in one file. Should be decomposed.
- **Sidebar** (1,276 lines): Navigation definition, RBAC, feature gates, real-time badges, collapse animation, mobile overlay all in one component.
- **Category strategy factory**: Creates hardcoded vertical strategies (CLOTHES, FOOD, SUPERMARKET). Should be data-driven.
- **globals.css** (675 lines): Mixes CSS variables, utility classes, animations, responsive styles, and component-specific styles. Should be layered.

---

## 5. HIGHEST-RISK AREAS

### Could break product truth

1. **Dark black+gold theme** — Every screenshot, demo, and first impression contradicts the locked brand identity. This is the single most visible gap.
2. **Plan names in code** — If billing goes live with STARTER/BASIC/GROWTH/PRO, it's wrong. The real lanes are Lane A/B + TASHGHEEL/TAWASSU'/HAYMANA.
3. **No public pricing** rule violated — `/merchant/pricing` page exists.

### Could break trust

1. **Fake consumer dashboard** — Mock data pretending to be real metrics.
2. **TRIAL plan** contradicting "no free trials" policy.
3. **Unfinished features visible in nav** — Command center, forecast, advanced features shown but potentially incomplete.
4. **Gold/amber confusion** — Warning signals lost in gold-heavy UI.

### Could create fake completeness

1. **50+ merchant pages** many of which may be shells or stubs.
2. **Pricing page** suggesting billing is ready when lane structure isn't implemented.
3. **Advanced reports** (CFO, tax, monthly-close) may not have real data pipelines behind them.

### Could create expensive rewrite risk later

1. **Category strategy pattern** — If more verticals get hardcoded strategies, this becomes an unmaintainable mess. Must be data-driven before more are added.
2. **KB as single JSONB column** — No migration path to proper 3-layer retrieval without schema changes.
3. **Plan entitlements hardcoded in TypeScript** — Difficult to change without code deploys. Should be DB-driven.

---

## 6. AI ARCHITECTURE AUDIT

### Is the assistant generic enough?

**Mostly yes, with one significant violation.** The core `MerchantAssistantService` builds prompts from merchant profile + KB + live data — this is correct. The `VectorSearchService` does catalog-agnostic semantic search — also correct. The off-topic filter, confidence handling, and escalation logic are all generic.

**The violation**: `CategoryStrategyFactory` (`apps/api/src/categories/`) creates hardcoded strategies per business type. Currently thin (CLOTHES, FOOD, SUPERMARKET, GENERIC), but the pattern invites vertical-specific growth. This should be replaced with data-driven rules from the merchant profile/KB.

### Where is it too hardcoded?

1. **Category strategies** — greeting templates, slot requirements, and post-order actions vary by category via code, not data.
2. **Egyptian market context** in the system prompt — mentions "EGP currency, COD payments, Ramadan/holiday seasonality, WhatsApp preferences." This is fine for now (Egypt-first) but should eventually come from merchant profile.
3. **Medicine OCR** (`analyzeMedicinePackage()`) — very vertical-specific. Should be a generic "document analysis" capability.

### What is missing for the KB/RAG schema?

1. **No static KB retrieval** — FAQs/policies in JSONB are loaded into prompt context, not retrieved via embeddings. This won't scale.
2. **No structured business rules table** — Rules live as free text in KB JSONB.
3. **No router decision model** — The doc defines 7 paths (A-G). Currently the assistant just gets everything dumped into context.
4. **No conversation playbooks** — No reusable scenario flows.
5. **No chunk metadata** — Catalog embeddings exist but lack source_type, module, category, confidence_level.
6. **No FAQ retrieval** — FAQs are loaded wholesale, not searched.

### What is missing for image/OCR/voice-note routing?

1. **Image analysis** exists but doesn't compare against merchant rules (the doc requires: classify → compare against merchant taxonomy → decide supported/unsupported/uncertain).
2. **OCR** exists but no formal extract → normalize → route → escalate pipeline.
3. **Voice notes** work for order creation but don't "route through same logic as typed text" — they go through a separate voice-ordering pipeline.

### What needs redesign first?

1. **KB layer separation** — Split JSONB into proper tables (static_kb_entries, business_rules, faq_entries).
2. **Router service** — New service that classifies requests into Path A-G before answering.
3. **Category strategy elimination** — Migrate to data-driven merchant rules.

---

## 7. UI/UX RESTRUCTURE AUDIT

### What must change first

1. **Color system flip**: Dark → light mode. `#0a0a0b` backgrounds → `#FAF9F7`. Gold accent → Operational Blue `#2D6BE4`. This touches globals.css, tailwind.config.js, and every component using `bg-`, `text-`, `border-` tokens.
2. **Gold purge**: Remove `--accent-gold`, replace with `--brand-blue: #2D6BE4`. Add `--ai-teal: #1AAFA0` as dedicated AI signal color.
3. **Font swap**: Cairo → IBM Plex Arabic (headings + body). Add IBM Plex Sans for English. Update `layout.tsx` font imports and tailwind.config.js fontFamily.

### What should be preserved

1. **Shell layout structure** — CSS Grid with collapsible sidebar is architecturally correct. Just needs token updates.
2. **Radix UI primitives** — All primitives are color-token-driven. Updating tokens will cascade.
3. **RTL foundation** — `dir="rtl"`, logical properties, `.tash-latin` isolation. Solid.
4. **Responsive breakpoints** — Mobile/tablet/desktop tiers are reasonable.
5. **Animation system** — Page enter, skeleton shimmer, sidebar collapse. Tasteful and operational.

### Can the current design token/layout system be refactored or does it need replacement?

**It can be refactored.** The CSS custom property system is well-structured. The problem is the VALUES, not the architecture. Changing `:root` variables in `globals.css` from dark-gold to light-blue will cascade through Tailwind tokens to all components. The Tailwind config uses `hsl(var(--primary))` indirection — updating `--primary` from gold HSL to blue HSL changes everything downstream.

**However**: Some components use raw hex values (`#e8c547`, `var(--accent-gold)`) instead of tokens. These need manual cleanup.

### Where RTL is broken or weak

RTL is **mostly correct** but:

1. **Charts** (Recharts) — may render left-to-right for time series. Need explicit `reversed` or `direction` props.
2. **Some inline styles** use `left`/`right` instead of logical properties.
3. **Tooltip positioning** uses hardcoded `right: calc(100% + 8px)` — should use `inset-inline-start`.
4. **Admin audit-logs** uses `dir="ltr"` for JSON/technical data — correct but could be formalized.
5. **No automated RTL testing** — no visual regression tests for RTL correctness.

---

## 8. RECOMMENDED IMPLEMENTATION ORDER

### Wave 0: Safety / Architecture / Foundation

**Purpose**: Remove misleading states, fix structural risks, prepare for theme migration.

- Hide/gate fake consumer dashboard
- Hide pricing page (or gate behind admin flag)
- Remove TRIAL plan or rename to pilot with correct rules
- Deduplicate components (data tables, sidebars, status pills)
- Split merchant layout.tsx (auth guard, feature gate, nav, layout into separate files)
- Split sidebar.tsx into nav definition + rendering + mobile overlay
- Remove dead routes and duplicate pages

### Wave 1: Theme / Tokens / Nav / RTL

**Purpose**: Flip the entire visual identity from dark-gold to light-blue.

- Rewrite globals.css `:root` variables (light mode, off-white, blue)
- Update Tailwind config (primary from gold to blue, add AI teal, add semantic palette)
- Swap fonts (Cairo → IBM Plex Arabic, add IBM Plex Sans)
- Purge all raw gold hex references
- Add `--ai-teal` token and dedicated AI surface styles
- Update shell components (sidebar, topbar) to new palette
- Fix RTL issues in charts and inline styles
- Restructure navigation into workflow-grouped sections (fewer, clearer groups)

### Wave 2: Operational Core

**Purpose**: Ensure core merchant flows work correctly with new visual system.

- Dashboard redesign as daily briefing (not feature showcase)
- Orders page polish
- Conversations page polish
- Inventory page polish
- Payments/billing page polish
- Settings consolidation
- Honest gated states for unfinished features (empty states with explanation, not hidden nav)

### Wave 3: Assistant Architecture + KB/RAG Scaffolding

**Purpose**: Build the 3-layer KB architecture and router decision model.

- Create `static_kb_entries` table with proper schema
- Create `business_rules` table
- Create `faq_entries` table with question_patterns and golden answers
- Implement embedding pipeline for static KB (not just catalog)
- Build router service (classify requests into Path A-G)
- Eliminate category strategy factory, migrate to data-driven rules
- Add chunk metadata (source_type, module, category, confidence_level)

### Wave 4: Image/OCR/Voice-Note and Escalation Flows

**Purpose**: Formalize media handling as generic platform capabilities.

- Generalize image analysis (classify → compare merchant rules → decide)
- Formalize OCR pipeline (extract → normalize → route → escalate)
- Unify voice note flow (transcribe → route through standard text logic)
- Build conversation playbooks schema and initial templates
- Strengthen escalation logic (explicit triggers, audit trail)

### Wave 5: Pricing/Plan Gating Alignment

**Purpose**: Align billing system with Pricing Authority document.

- Rename plans: map STARTER→Lane A, BASIC→Lane B, GROWTH→T1, PRO→T2, ENTERPRISE→T3
- Implement branch-based pricing for chain family (T1/T2/T3)
- Add setup fee billing
- Implement conversation overage packs (per-month, not per-day)
- Remove TRIAL, implement pilot (90-day, 50% rate)
- Gate pricing page behind admin/internal flag
- Add TASHGHEEL/TAWASSU'/HAYMANA as commercial names (display only, not code identifiers)

### Wave 6: Advanced AI-Brain Surfaces

**Purpose**: Surface AI intelligence through operational outcomes.

- AI recommendation cards with teal semantic styling
- Anomaly detection alerts in daily briefing
- AI decision audit trail UI
- Copilot integration polish
- Forecasting surface (if data pipeline is real)

### Wave 7: Polish / Production Readiness

**Purpose**: Final cleanup for controlled pilot launch.

- Loading/error states audit across all pages
- Empty state design (honest, informative, operational)
- Performance audit (bundle size, API response times)
- Accessibility audit (focus management, screen reader, keyboard nav)
- E2E test coverage for critical flows
- Environment validation (all required env vars documented)

---

## 9. FIRST 3 IMPLEMENTATION WAVES IN DETAIL

### Wave 0: Safety / Architecture / Foundation

**Purpose**: Stop the bleeding. Remove misleading states and fix structural risks before any visual changes.

**Areas/files affected**:

- `apps/portal/src/app/dashboard/page.tsx` — gate or replace fake consumer dashboard
- `apps/portal/src/app/merchant/pricing/page.tsx` — hide or gate behind internal flag
- `apps/portal/src/app/merchant/layout.tsx` (1,276 lines) — decompose into:
  - `AuthGuardWrapper.tsx` — auth logic
  - `FeatureGate.tsx` — entitlement checks
  - `MerchantShell.tsx` — layout structure
  - `RouteBlocker.tsx` — blocked route logic
- `apps/portal/src/components/layout/sidebar.tsx` (1,276 lines) — decompose into:
  - `navigation-config.ts` — nav tree definition
  - `SidebarNav.tsx` — rendering
  - `SidebarMobile.tsx` — mobile overlay
- Deduplicate:
  - `components/dashboard/DataTable.tsx` + `components/ui/data-table.tsx` + `components/ui/DataTable.tsx` → single DataTable
  - `components/dashboard/StatusPill.tsx` + `components/ui/StatusPill.tsx` → single StatusPill
  - `components/dashboard/Button.tsx`, `Card.tsx`, `Input.tsx` → remove, use `components/ui/` versions
  - `components/layout/sidebar.tsx` vs `components/shell/Sidebar.tsx` → unify
- Remove dead pages: `/merchant/teams` (duplicate of `/merchant/team`)
- Remove or gate: `/merchant/roadmap`, `/merchant/command-center` (if not production-ready)
- `apps/api/src/shared/entitlements/index.ts` — remove or rename TRIAL plan to align with pilot model

**Why now**: These are safety fixes. Every subsequent wave builds on a clean, honest, non-misleading foundation.

**Risks**: Decomposing layout.tsx could break feature gating if not careful. Test each route after decomposition.

**Validation**:

- Navigate every merchant route — verify gating still works
- Verify consumer dashboard shows honest state
- Verify no pricing page is publicly accessible
- `npm run build` passes without errors

---

### Wave 1: Theme / Tokens / Nav / RTL

**Purpose**: Flip the product's visual identity from dark-gold AI demo to warm-light operational OS.

**Areas/files affected**:

**globals.css** (`apps/portal/src/app/globals.css`, 675 lines) — rewrite `:root`:

```
Old: --bg-base: #0a0a0b (black), --accent-gold: #e8c547, --primary: 47 77% 59% (gold HSL)
New: --bg-base: #FAF9F7 (warm off-white), --brand-blue: #2D6BE4, --primary: 220 75% 53% (blue HSL)
     --ai-teal: #1AAFA0, --bg-surface: #FFFFFF, --bg-subtle: #F0EEE9
     --text-primary: #1C1E23, --text-secondary: #4B5260, --text-tertiary: #8891A0
     color-scheme: light (not dark)
```

**tailwind.config.js** (`apps/portal/tailwind.config.js`) — update:

- primary: gold → blue
- Add semantic colors: success `#1A7A4A`, warning `#B45309`, danger `#C0291D`, ai `#1AAFA0`
- fontFamily: Cairo → IBM Plex Arabic + IBM Plex Sans

**layout.tsx** (`apps/portal/src/app/layout.tsx`) — swap fonts:

```
Old: Cairo (heading), IBM Plex Sans Arabic (body), JetBrains Mono
New: IBM Plex Arabic (heading + body), IBM Plex Sans (English), IBM Plex Mono (data)
```

**Component token cleanup** — grep for raw hex values and replace:

- `#e8c547` → `var(--brand-blue)` or remove
- `var(--accent-gold)` → `var(--brand-blue)`
- `var(--accent-gold-dim)` → `var(--brand-blue-dim)`
- Add `var(--ai-teal)` usage in AI-related components

**Shell updates**:

- Sidebar: dark glass background → `#F0EEE9` subtle background
- Topbar: dark glass → white surface
- Gold scrollbar → blue scrollbar (or default)
- `.app-insight-strip` gold border → teal border (AI signal)

**Navigation restructure** (`apps/portal/src/lib/constants/navigation.ts` + sidebar):

- Reduce 8 sections to ~5 workflow groups:
  1. Daily Briefing (dashboard, notifications)
  2. Operations (orders, conversations, calls, cashier, payments)
  3. Inventory & Supply (inventory, suppliers, branches)
  4. Finance & Reports (reports, analytics, expenses, billing)
  5. Settings & Admin (team, security, integrations, settings)
- Move AI/assistant features to contextual placement (not separate nav sections)
- Gate advanced features with honest "coming soon" states

**RTL fixes**:

- Audit all `left`/`right` CSS → convert to `inset-inline-start`/`inset-inline-end`
- Add `direction` prop to Recharts components
- Formalize `.tash-latin` usage for all LTR data contexts

**Why now**: The visual identity is the single most visible representation of product truth. Every demo, screenshot, and pilot impression will be wrong until this is fixed.

**Risks**:

- Massive visual diff — every component will look different. Need systematic testing.
- Some components may have dark-theme-specific logic (opacity, backdrop-filter) that breaks in light mode.
- Font swap may affect layout widths and line breaks.

**Validation**:

- Visual inspection of every major page family (dashboard, orders, conversations, inventory, settings)
- RTL correctness check (sidebar on right, text alignment, number formatting)
- Mobile responsive check (sidebar overlay, topbar, content flow)
- No gold/dark-theme remnants visible anywhere
- Lighthouse audit for contrast ratios (WCAG AA)
- `npm run build` passes

---

### Wave 2: Operational Core

**Purpose**: Ensure the core merchant workflows are polished, honest, and aligned with daily-briefing-first philosophy.

**Areas/files affected**:

**Dashboard redesign** (`apps/portal/src/app/merchant/dashboard/page.tsx`):

- Redesign as "daily briefing" not "feature showcase"
- Lead with: today's orders count, pending actions, alerts, AI signals
- Remove or minimize decorative charts
- Add: operations queue summary, conversations needing attention, low-stock alerts
- Use AI teal for AI-surfaced insights only

**Orders page** (`apps/portal/src/app/merchant/orders/page.tsx`):

- Ensure table-first layout (not card-first)
- Status pills using new semantic colors
- Honest loading/error states

**Conversations page** (`apps/portal/src/app/merchant/conversations/page.tsx`):

- Ensure real-time updates work with new theme
- AI-handled vs human-handled visual distinction (teal marker for AI)
- Escalation status visible

**Inventory page** (`apps/portal/src/app/merchant/inventory/page.tsx`):

- Table-first with status colors
- Low-stock warnings in amber (not gold)
- AI insights panel using teal (if AI-generated)

**Billing/payments** (`apps/portal/src/app/merchant/billing/page.tsx`, `payments/`):

- Ensure correct plan display (prep for Wave 5 naming)
- Payment proof flow with vision service
- Honest states for unimplemented billing features

**Settings consolidation** (`apps/portal/src/app/merchant/settings/page.tsx`):

- Consolidate: settings, security, team, integrations into tabbed view or clear sub-nav
- Remove duplicate pages

**Gated states for unfinished features**:

- Create reusable `<FeatureComingSoon />` component
- Apply to: command center, advanced automations, advanced forecasting, campaigns
- Show: feature name, brief description, "this feature is being prepared" — not a fake-ready UI

**Why now**: After Wave 0 (safety) and Wave 1 (theme), the core pages need to work correctly with the new visual system. This is the "make it real" wave.

**Risks**:

- Dashboard redesign is a product decision — may need user input on exact daily briefing structure
- Some pages may have complex state management that's entangled with old theme

**Validation**:

- Walk through complete merchant journey: login → dashboard → create order → view conversations → check inventory → view reports
- Verify all status colors are semantically correct (green=healthy, amber=warning, red=critical, teal=AI)
- Verify gated features show honest states
- Verify no fake data is visible to merchants
- Mobile walkthrough of the same journey

---

## 10. DOCS/CONFIG SCAFFOLDING THAT MUST EXIST IN-REPO

### Missing docs

- `docs/tash8heel/` directory does not exist in the worktree — the docs live at `D:\Downloads\Saas\Tash8eel\docs\Tash8eel\` (main repo). These should be committed and version-controlled with the code.
- Missing: `TASH8EEL_BRAND_COLOR_SYSTEM.md` (referenced in Brand Identity Package but not found as a separate file)
- Missing: Architecture decision records (ADRs) for major choices

### Missing config files

- No `.env.example` documenting all required/optional environment variables (the API validates some in main.ts but no reference file exists)
- No `docker-compose.yml` for local development (PostgreSQL, Redis, etc.)
- No design token JSON/TS export file — tokens only live in CSS

### Missing CLAUDE.md / skills coverage

- CLAUDE.md exists at repo root and is comprehensive. However:
  - It references `TASH8EEL_BRAND_COLOR_SYSTEM.md` which doesn't exist as a separate file
  - It doesn't mention the category strategy factory as a known deviation
  - It doesn't document the pricing name mismatch (code names vs. doc names)

### Missing schema/contract docs

- No OpenAPI/Swagger spec for the 68 API controllers
- No TypeScript interface exports for frontend-backend contracts
- No event schema documentation for WebSocket events
- No webhook payload documentation

### HTML color file sufficiency

- The Brand Identity Package (`TASH8EEL_BRAND_IDENTITY_PACKAGE.md`) contains the complete color system with exact hex values, roles, and usage rules. A separate color system file would be redundant UNLESS it's an interactive HTML reference. The current markdown is sufficient for implementation; a design token JSON export would be more useful than an HTML file.

---

## 11. FINAL RECOMMENDATION

### Safest next move

**Wave 0 (Safety/Foundation)** is the safest starting point. It:

- Removes misleading states (fake dashboard, public pricing, free trial)
- Decomposes oversized files (layout, sidebar) without changing appearance
- Deduplicates components without changing behavior
- Creates no visible change for existing users
- Reduces risk for all subsequent waves

### What should happen first when execution is approved

1. **Wave 0** — decompose merchant layout, deduplicate components, gate misleading pages
2. **Wave 1** — theme flip (this is the biggest single change and needs focused attention)
3. **Wave 2** — operational core polish

These three waves together transform the product from "dark-gold AI demo" to "warm-light operational OS" — which is the single most important alignment between repo and docs.

### What should explicitly wait

- **Pricing lane remapping (Wave 5)** — until the visual foundation is stable and you're closer to pilot
- **KB/RAG schema redesign (Wave 3)** — until core UI is aligned; the current flat KB works for initial pilots
- **Advanced AI surfaces (Wave 6)** — until the assistant architecture is properly layered
- **Category strategy elimination (Wave 3)** — important but not urgent; current strategies are thin enough to not cause immediate harm
- **Dark mode** — the docs explicitly say it's a future option, not current identity. Do not build it yet.
- **Public pricing page** — must not exist until explicitly requested

---

_End of audit. Ready for execution approval._
