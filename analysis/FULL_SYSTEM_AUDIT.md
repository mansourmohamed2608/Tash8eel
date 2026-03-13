# Full System Audit — Tash8eel Platform
Generated: 2025-01-26

---

## Part 1 — Complete Feature Inventory

### ✅ Implemented & Live (Backend + Frontend fully connected)

| # | Feature | Controller / Service | Portal Page | Plan Gate |
|---|---------|---------------------|-------------|-----------|
| 1 | WhatsApp Conversations (AI inbox) | `merchant-portal` / `llm.service` | `/merchant/conversations` | All plans |
| 2 | Orders Management | `merchant-portal` / `merchant-portal` | `/merchant/orders` | All plans |
| 3 | Catalog / Product Catalog | `portal-catalog` | `/merchant/inventory` | All plans |
| 4 | Inventory Tracking | `portal-inventory` / `inventory.service` | `/merchant/inventory` | All plans |
| 5 | Payment Proof Scanning (OCR) | `vision.service` / `product-ocr.service` | `/merchant/payments`, `/merchant/ocr-review` | Via `paymentProofScansPerMonth` limit |
| 6 | Reports (daily/weekly with AI narrative) | `portal-analytics` / `finance-ai.service` | `/merchant/reports` | All plans |
| 7 | KPI Dashboard | `kpi.controller` / `kpi.service` | `/merchant/kpis` | PRO+ |
| 8 | Audit Logs | `portal-analytics` / `audit.service` | `/merchant/audit` | PRO+ |
| 9 | Team Management | `portal-analytics` | `/merchant/team` | GROWTH+ |
| 10 | Webhooks / POS Integrations | `webhooks.controller` / `webhook.service` | `/merchant/webhooks`, `/merchant/pos-integrations` | GROWTH+ |
| 11 | Push Notifications / Broadcast | `notifications.controller` / `notifications.service` | `/merchant/notifications`, `/merchant/push-notifications` | All plans |
| 12 | Voice Notes Transcription | `llm.service` (Whisper) | `/merchant/conversations` | All plans (`voiceMinutesPerMonth`) |
| 13 | Copilot Chat (merchant AI assistant) | `copilot.controller` / `copilot-ai.service` | `/merchant/assistant` | All plans |
| 14 | Branch Management | `branches.controller` | `/merchant/branches` | All plans (1 branch Starter) |
| 15 | Analytics | `portal-analytics.controller` | `/merchant/analytics` | All plans |
| 16 | Billing History & Status | `billing-subscriptions.controller` | `/merchant/billing` | All plans |
| 17 | Plan Selection & Topups | `billing-plans.controller` / `billing-catalog.service` | `/merchant/plan` | All plans |
| 18 | Loyalty Tiers + Promotions ⚠️ | `loyalty.controller` / `loyalty.service` | `/merchant/loyalty` | BLOCKED (see Part 2) |
| 19 | Customer Segments | `merchant-portal.controller` (custom-segments) | `/merchant/customer-segments` | All plans |
| 20 | Win-back Campaigns | `merchant-portal.controller` (campaigns/winback) | `/merchant/campaigns` | All plans |
| 21 | Expense Tracking | `merchant-portal.controller` (expenses) | `/merchant/expenses` | All plans |
| 22 | Delivery Driver Management | `portal-delivery.controller` | `/merchant/delivery-drivers` | All plans |
| 23 | Quote Requests | `quote-requests.controller` | `/merchant/quotes` | All plans |
| 24 | Automated Followups | `followups.controller` / `followup.scheduler` | `/merchant/followups` | All plans |
| 25 | Knowledge Base (AI context) | `portal-knowledge-base.controller` | `/merchant/knowledge-base` | All plans |
| 26 | Merchant Onboarding | `portal-onboarding.controller` | `/merchant/onboarding` | All plans |
| 27 | AI Agent Activity Log | `portal-agent-activity.controller` | `/merchant/agent-activity` | All plans |
| 28 | Import / Export | `bulk-operations.service` | `/merchant/import-export` | All plans |
| 29 | Inventory AI Insights | `inventory-ai.service` | `/merchant/inventory-insights` | All plans |
| 30 | Vision / OCR Raw | `vision.service` (GPT-4o vision) | `/merchant/vision` | Standalone |
| 31 | Integrations | `integrations.controller` | `/merchant/integrations` | All plans |
| 32 | Security (Password / Session) | `merchant-portal.controller` | `/merchant/security` | All plans |
| 33 | Settings | `merchant-portal.controller` | `/merchant/settings` | All plans |
| 34 | Feature Requests | `feature-requests.controller` | `/merchant/feature-requests` | All plans |
| 35 | Roadmap + Early Access | `early-access.controller` | `/merchant/roadmap` | All plans |
| 36 | Customers (CRM) | `merchant-portal.controller` | `/merchant/customers` | All plans |
| 37 | Agent Teams | `agent-teams.controller` | `/merchant/teams`, `/merchant/agents` | All plans |
| 38 | Meta / Twilio Webhook Handling | `meta-webhook.controller`, `twilio-webhook.controller` | N/A (inbound) | All plans |
| 39 | Public Payments (checkout) | `public-payments.controller` | N/A | All plans |
| 40 | Admin: Merchant Management | `admin-merchants.controller` | `/admin/merchants` | Admin only |
| 41 | Admin: Ops Dashboard | `admin-ops.controller` | `/admin/dashboard` | Admin only |
| 42 | Admin: Billing Admin | `billing-admin.controller` | N/A | Admin only |
| 43 | Admin: DLQ Management | `admin-ops.controller` | `/admin/dlq` | Admin only |
| 44 | Admin: Entitlements Overrides | N/A | `/admin/entitlements` | Admin only |
| 45 | Admin: Feature Flags | `production-features.controller` | N/A | Admin only |

### 🚧 Coming Soon (Stubs, no real backend logic)

| # | Feature | ETA | Status |
|---|---------|-----|--------|
| 1 | Marketing Agent | Q2 2026 | UI placeholder, no AI service |
| 2 | Support Agent | Q2 2026 | UI placeholder, no AI service |
| 3 | Content Agent | Q3 2026 | UI placeholder, no AI service |
| 4 | Sales Agent | Q3 2026 | UI placeholder, no AI service |
| 5 | Creative Agent (image/video gen) | Q4 2026 | UI placeholder, no AI service |

### ⚙️ Background Jobs / Infrastructure (no UI)

| Job | Trigger | Purpose |
|-----|---------|---------|
| `weekly-report.scheduler` | Every Sunday 7am UTC + 1st of month | AI-generated weekly & monthly report, WhatsApp delivery |
| `daily-report.scheduler` | Daily 6am UTC | Day summary per merchant |
| `message-delivery.worker` | Every 30s | Retry queued outbound messages |
| `webhook.service` outbox | Every 10s | Push events to merchant webhook endpoints |
| `webhook.service` cleanup | Daily 3am | Prune old webhook events |
| `followup.scheduler` | Every 10 min | Send pending automated followups |
| `delivery-status.poller` | Every 5 min | Update delivery driver statuses |
| `bulk-operations.service` | Daily 4am | Cleanup completed bulk jobs |
| `outbox.worker` | Every 5s | Transactional outbox pattern for events |

---

## Part 2 — Critical Missing & Broken Features

### 🔴 P0: Merchant Cannot Function (Blockers)

#### 1. Loyalty Feature Entitlement Bug
**Impact**: Loyalty backend is 100% complete (all endpoints in `loyalty.controller.ts`). But in `entitlements/index.ts` line 26, `LOYALTY` is tagged as legacy/gated behind `MARKETING_AGENT` which is `coming_soon`. Any `hasFeature(entitlements, 'LOYALTY')` check returns false for all merchants → loyalty page loads but write operations will fail auth guards.

**Fix**: Decouple loyalty from MARKETING_AGENT. Add `LOYALTY` to the GROWTH+ plan entitlements now — the code is done.

```ts
// entitlements/index.ts — GROWTH.enabledFeatures
"LOYALTY",  // add this line — backend is implemented and ready
```

#### 2. No Self-Serve Payment Processing
**Impact**: The `/merchant/plan` page lets merchants select a plan and shows a "Subscribe" button, but there is no actual payment gateway integrated (no Stripe, Paymob, Fawry, etc.). Plan activation is either manual or relies on an offline flow. Merchants can't self-service upgrade = direct revenue loss.

**Fix needed**: Integrate Paymob or Stripe (Stripe supports EGP). Wire `billing-checkout.controller.ts` to a real payment provider.

#### 3. VISION_OCR Removed from Plans but OCR Scan Limits Still Apply
**Impact**: `VISION_OCR` label says "removed from merchant plans" but the `paymentProofScansPerMonth` limit controls OCR usage. If a merchant exhausts this limit, there's no way to buy a top-up since OCR is no longer a purchasable add-on on the plan page. Merchants stuck at limit with no upgrade path.

**Fix**: Add OCR scan top-up as a purchasable add-on in `billing-catalog.service.ts`, or restore `VISION_OCR` to the PRO+ plans.

### 🟠 P1: Important Missing Features (Causing Revenue Loss or Poor UX)

#### 4. No Public Order Tracking Page
Customers receive WhatsApp messages but there is no web page where a customer can type their order ID and check status themselves. High-volume merchants get repeat "where is my order?" messages.

#### 5. Team Members Can Share One WhatsApp Number (No Agent Routing UI)
Agent teams (`agent-teams.controller`) exist but there's no clear UI for conversation assignment rules beyond basic round-robin. Merchants with multiple team members have no visibility into which agent handled which conversation from the team view.

#### 6. No Automated Re-stock Purchase Orders
`InventoryAiService.generateSupplierMessage()` is implemented but there's no UI flow to convert an AI-generated restock insight into an actual purchase order or supplier message. The insight is generated, shown in `/merchant/inventory-insights`, but the "send to supplier" action is missing end-to-end.

#### 7. No Email Notifications for Merchants
All merchant alerts (new order, low stock, payment received) go through the portal's in-app notification system. No email fallback. If merchant is offline and misses the WhatsApp notification, they miss the order.

#### 8. Campaigns Page is Single-Use (Win-back Only)
`/merchant/campaigns` only calls `/api/v1/portal/campaigns/winback`. There is no support for other campaign types (custom broadcast, promotional, seasonal). The page UI shows it's designed for more but the backend only has winback.

---

## Part 3 — Frontend ↔ Backend ↔ AI Connectivity Audit

### ✅ Properly Wired

| Page | Calls | Backend Endpoint | AI Wired |
|------|-------|-----------------|----------|
| Dashboard | `merchantApi.getDashboardStats()` | `GET /portal/dashboard` | Partial (AI insights card client-side) |
| Analytics | `merchantApi.getConversionAnalytics()` + 3 more | `portal-analytics.controller` | `finance-ai.service` |
| Orders | `merchantApi` + direct fetch | `merchant-portal` (orders) | `ops-ai.service` |
| Billing | `merchantApi.getBillingSummary()` | `billing-subscriptions` | AI insights card |
| Plan | `merchantApi.getBillingCatalog()` + `subscribeBundlePlan()` | `billing-plans` + `billing-checkout` | No |
| Loyalty | `portalApi.getLoyaltyTiers()` etc. | `loyalty.controller` (all 10 endpoints) | No (AI insights stub) |
| Expenses | `authenticatedFetch /portal/expenses` | `merchant-portal.controller` (line 5514) | No |
| Customer Segments | `authenticatedFetch /portal/custom-segments` | `merchant-portal.controller` (line 8113) | No |
| Campaigns | `authenticatedFetch /portal/campaigns/winback` | `merchant-portal.controller` (line 4526) | `notifications.service` |
| Delivery Drivers | `portalApi.getDeliveryDrivers()` etc. | `portal-delivery.controller` | No |
| Quotes | `merchantApi.getQuotes()` etc. | `quote-requests.controller` | No |
| Push Notifications | `authenticatedFetch /portal/notifications` | `notifications.controller` | No |
| Roadmap | `portalApi.getEntitlementsCatalog()` + `signupForEarlyAccess()` | `early-access.controller` | No |
| Inventory Insights | `portalApi.*` | `portal-inventory.controller` | `inventory-ai.service` ✅ |
| Conversations | `portalApi.*` | `merchant-portal` (inbox) | `llm.service` ✅ |
| Assistant (Copilot) | `portalApi.*` | `copilot.controller` | `copilot-ai.service` ✅ |
| KPIs | `portalApi.*` | `kpi.controller` | `finance-ai.service` ✅ |
| Reports | `merchantApi.*` | `portal-analytics.controller` | `finance-ai.service` ✅ |

### ⚠️ Static / Hardcoded Data Found (UI Config, Not Business Data)

These are **intentionally static UI metadata** — not business data problems:

| File | Static Data | Assessment |
|------|------------|------------|
| `merchant/team/page.tsx:229` | `const permissions = [...]` | UI role-permission display list — OK |
| `merchant/notifications/page.tsx:74` | `const NOTIFICATION_TYPES = [...]` | UI filter chips — OK |
| `merchant/webhooks/page.tsx:98` | `const eventCategories = [...]` | UI event type labels — OK |
| `merchant/settings/page.tsx:113` | `const reportPeriodOptions = [...]` | Dropdown options — OK |
| `merchant/knowledge-base/page.tsx:202` | `const menuCategories = [...]` | AI prompt hint categories — OK |
| `merchant/payments/cod/page.tsx:206` | `const deliveryPartners = [...]` | COD partner list — ⚠️ Should be from DB, not hardcoded |
| `merchant/reports/discount-impact/page.tsx:96` | `const pieData = [...]` | Demo data for empty state only — OK |
| `merchant/plan/page.tsx` | `REGION_OPTIONS`, `CYCLE_OPTIONS` | UI config constants — OK |

### 🔴 Actual Static Data Problems

| File | Issue |
|------|-------|
| `merchant/payments/cod/page.tsx:206` | `deliveryPartners` is hardcoded (Bosta, Aramex, etc.). If a new partner is added, a code deploy is required. Should come from DB table or config API. |

---

## Part 4 — Business Model Assessment

### Plan Pricing (EGP/month)

| Plan | Price | Messages/mo | AI Calls/day | Team | WA Numbers | POS | Branches |
|------|-------|------------|-------------|------|-----------|-----|---------|
| TRIAL | 0 | 50 | 20 | 1 | 1 | 0 | 1 |
| STARTER | **999** | 15,000 | 500 | 1 | 1 | 0 | 1 |
| GROWTH | **1,899** | 30,000 | 1,000 | 2 | 2 | 1 | 1 |
| PRO | **3,299** | 100,000 | 2,500 | 5 | 3 | 3 | 2 |
| ENTERPRISE | **5,999** | 250,000 | 5,000 | 10 | 5 | 5 | 5 |
| CUSTOM | Negotiated | -1 | -1 | -1 | -1 | -1 | -1 |

### Message Tier Add-ons (standalone, stacked on plan)
| Tier | Messages/mo | Price EGP |
|------|------------|-----------|
| STARTER | 15,000 | 99 |
| BASIC | 15,000 | 99 |
| STANDARD | 50,000 | 399 |
| PROFESSIONAL | 150,000 | 699 |
| ENTERPRISE | Unlimited | 1,299 |

> ⚠️ **Overlap confusion**: Plans already include messages in their pricing (999 EGP = 15k msgs). The MESSAGE_TIERS add-ons seem redundant. It is unclear if these are "extra packs" on top of plan limits or a separate billing axis. This will confuse buyers. Recommend: either absorb message costs into one plan price (current model), or clearly label these as "additional message top-up packs."

### AI Usage Tiers (add-on)
| Tier | AI Calls/day | Price EGP |
|------|-------------|-----------|
| BASIC | 300 | 0 |
| STANDARD | 500 | 129 |
| PROFESSIONAL | 1,500 | 349 |
| UNLIMITED | -1 | 699 |

> ⚠️ **Another overlap**: STARTER plan already includes 500 AI calls/day, which equals the STANDARD AI tier. The AI tiers make sense as standalone add-ons for merchants who want more AI on top of their plan, but the names clash. Rename them to "AI Booster Pack - 500 calls/day (129 EGP)" style.

### Gross Margin Estimates (from entitlements cost comments)
| Plan | Revenue | Est. COGS | Gross Margin |
|------|---------|----------|-------------|
| STARTER | 999 EGP | ~220 EGP | **104%** |
| GROWTH | 1,899 EGP | ~333 EGP | **140%** |
| PRO | 3,299 EGP | ~858 EGP | **75%** at 50% avg usage |
| ENTERPRISE | 5,999 EGP | ~2,000–3,000 EGP | **~100–200%** |

> Margins are healthy. The cost model (AI blended ~0.05 EGP/call, WhatsApp free via Meta Cloud API, infra 70 EGP/merchant/mo) is solid.

### Revenue Loss Risks

| Risk | Impact | Severity |
|------|--------|----------|
| No payment gateway | Subscriptions are manual = cannot scale sales | 🔴 HIGH |
| Loyalty blocked in entitlements | Feature built, not monetizable → wasted dev | 🟠 MEDIUM |
| No OCR top-up add-on | Heavy-scan merchants hit limit with no upgrade path | 🟠 MEDIUM |
| MESSAGE_TIERS vs plan limits confusion | Buyers don't understand what they're buying | 🟡 LOW |
| Campaigns limited to win-back only | Upsell opportunity missed (promotional campaigns) | 🟡 LOW |
| No email alerts for merchants | Missed orders = merchant churn | 🟡 LOW |

### What the System Does Well (Business Strengths)

1. **All-in-one for WhatsApp commerce**: Single platform handles orders, inventory, payments, reports, customer management via WhatsApp AI. Strong value proposition for Egyptian SMBs.
2. **Tiered pricing is logical**: STARTER → GROWTH → PRO → ENTERPRISE has clear differentiation (team, POS, analytics, multi-branch).
3. **AI is genuinely wired**: OPS, INVENTORY, FINANCE agents are all real AI services with metrics, not just UI labels. The `AiMetricsService` tracks all calls for cost visibility.
4. **Cost model is healthy**: Even at STARTER (lowest), 104% gross margin means sustainable unit economics.
5. **Background jobs cover all automation**: Reports, followups, delivery, webhooks all run automatically without merchant action.
6. **CUSTOM plan for enterprise**: Allows unlimited negotiation with large merchants without forcing them into rigid plan boxes.

---

## Summary Checklist of Action Items

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 P0 | Integrate payment gateway (Paymob or Stripe) | Large |
| 🔴 P0 | Fix Loyalty entitlement gate — add LOYALTY to GROWTH+ plans | 5 min |
| 🟠 P1 | Add OCR scan top-up to billing catalog | Medium |
| 🟠 P1 | Move delivery partners from hardcoded array to DB/config | Small |
| 🟠 P1 | Expand campaigns beyond win-back (broadcast, seasonal) | Medium |
| 🟡 P2 | Public order tracking page for customers | Medium |
| 🟡 P2 | Email notification fallback for merchants (new order, low stock) | Small |
| 🟡 P2 | Supplier message action from inventory insights page | Small |
| 🟡 P2 | Rename/clarify MESSAGE_TIERS vs plan includes in UI | Small |
| 🟡 P3 | Conversation assignment rules UI for multi-agent teams | Medium |
