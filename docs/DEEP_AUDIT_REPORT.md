# Tash8eel SaaS Platform — Deep Audit Report

**Date:** June 2025  
**Scope:** Full codebase audit across 8 categories  
**Severity Legend:** 🔴 CRITICAL | 🟠 MAJOR | 🟡 MINOR

---

## 1. PRICING & ENTITLEMENTS

### 🔴 CRITICAL — Orchestrator Defaults Bypass Plan Entitlements

**File:** `apps/worker/src/orchestrator/orchestrator.service.ts` **Lines 261–265, 289–295**

The orchestrator defaults every merchant (including FREE-tier) to `['OPS_AGENT', 'INVENTORY_AGENT', 'SUPPORT_AGENT']` when no DB record or when `enabled_agents` is null. The FREE plan entitlement only grants `['OPS_AGENT']`. This means any merchant on the FREE plan gets INVENTORY_AGENT and SUPPORT_AGENT for free if their DB row is missing or the column is null.

```typescript
const defaults: MerchantAgentSubscription = {
  merchantId,
  enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "SUPPORT_AGENT"], // ← mismatch with FREE plan
  enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
  cachedAt: new Date(),
};
```

**Impact:** Revenue leakage — unpaid merchants get paid features.

---

### 🟠 MAJOR — SALES_AGENT and CREATIVE_AGENT Defined but Unreachable

**File:** `apps/api/src/shared/entitlements/index.ts` **Lines 16–17**

`SALES_AGENT` and `CREATIVE_AGENT` are defined as valid `AgentType` values and appear in `AGENT_CATALOG` (with `coming_soon` status), but they are **not included in any plan tier** — not even ENTERPRISE. If a merchant is assigned `ENTERPRISE`, they won't get these agents. This is fine for now ("coming soon") but there's no gating mechanism to prevent them from being manually assigned without billing.

---

### 🟡 MINOR — ENTERPRISE and CUSTOM Plans Have No Price

**File:** `apps/api/src/shared/entitlements/index.ts` **Lines 186–200**

`ENTERPRISE` and `CUSTOM` plans have no `price` or `currency` fields. While intended as "contact sales" plans, the absence of any guard or billing enforcement means they could be self-assigned without payment.

---

### 🟡 MINOR — No Frontend Pricing Page Detected

No `pricing.tsx`, `pricing.vue`, `Plans.tsx`, or similar frontend component was found in `apps/portal/`. Pricing is only defined server-side. Merchants have no way to compare plans in the portal UI.

---

## 2. AI AGENT CONNECTIVITY

### 🔴 CRITICAL — Silent Fallback to Mock LLM in Production

**File:** `apps/worker/src/infrastructure/llm-client.module.ts` **Lines 306–313**

When `API_BASE_URL` is not configured, the worker silently falls back to `MockLlmClient`, which returns hardcoded Arabic responses. The only signal is a `logger.warn()` — no alert, no metric, no health-check failure.

```typescript
if (!apiBaseUrl) {
  logger.warn("No API_BASE_URL configured, using mock LLM client");
  return new MockLlmClient();
}
```

**Impact:** A misconfigured deployment silently degrades all AI conversations to scripted mock responses. Merchants would see fake, wrong answers with no indication anything is broken.

---

### 🔴 CRITICAL — Test Mode Detected by API Key Pattern

**File:** `apps/api/src/application/llm/copilot-ai.service.ts` **Lines 65–72**  
**File:** `apps/api/src/application/llm/llm.service.ts` **Lines 92–96**

Both AI services detect "test mode" by checking if the OpenAI API key starts with `sk-test-`, `sk-dummy-`, or contains `dummy`. In production, if someone accidentally sets an API key containing `dummy` in its name, or if OpenAI changes key prefixes, the system silently switches to hardcoded mock responses.

```typescript
const isTestMode =
  !apiKey ||
  apiKey.startsWith("sk-test-") ||
  apiKey.startsWith("sk-dummy-") ||
  apiKey.includes("dummy") ||
  process.env.NODE_ENV === "test";
```

**Impact:** Fragile test-mode detection tied to string patterns in API keys.

---

### 🟠 MAJOR — No AI Response Caching

**Files:** `apps/api/src/application/llm/llm.service.ts`, `copilot-ai.service.ts`

Every customer message and every copilot command triggers a fresh OpenAI API call. There is zero caching of AI responses — no Redis cache, no in-memory cache, no deduplication. Repeated identical questions incur repeated costs and latency.

**Impact:** Unnecessary OpenAI spend; latency on repeated queries.

---

### 🟠 MAJOR — Single LLM Provider (No Failover)

**File:** `packages/shared/src/config/index.ts`

The platform is hardwired to OpenAI GPT-4o-mini. There is no secondary provider (Anthropic, Google, etc.), no provider abstraction layer, and no failover mechanism. If OpenAI is down, all AI features fail.

---

### 🟡 MINOR — Whisper Confidence Hardcoded to 0.95

**File:** `apps/api/src/application/adapters/transcription.adapter.ts` **Line ~240**

The Whisper adapter hardcodes `confidence: 0.95` for every transcription result because "Whisper doesn't return confidence." This means the system can never detect low-quality transcriptions.

---

### 🟡 MINOR — LLM Token Budget Warning Only at < 0.5 Confidence

**File:** `apps/api/src/application/llm/llm.service.ts` **Line ~145**

The confidence threshold for warning is 0.5, which is very permissive. Responses with 0.51 confidence are treated as fully trusted.

---

## 3. VOICE FUNCTIONALITY

### 🟠 MAJOR — Mock Transcription Adapter Used by Env Flag

**File:** `apps/api/src/application/adapters/transcription.adapter.ts` **Lines 283–295**

The `TranscriptionAdapterFactory` checks `TRANSCRIPTION_MOCK=true` to decide whether to use the mock. If this env variable is accidentally left as `true` in production, all voice notes return hardcoded Arabic phrases instead of actual transcription.

```typescript
const useMock =
  this.configService.get<string>("TRANSCRIPTION_MOCK", "false") === "true";
```

---

### 🟡 MINOR — Voice Feature Gated to STARTER+ but No Rate Limiting

**File:** `apps/api/src/shared/entitlements/index.ts` **Lines 142–150**

`VOICE_NOTES` is gated to STARTER and above, but there's no per-merchant rate limit on Whisper API calls. A STARTER merchant could flood the voice endpoint.

---

### 🟡 MINOR — MockTranscriptionAdapter Returns Duration-Based Responses

**File:** `apps/api/src/application/adapters/transcription.adapter.ts` **Lines 40–160**

The mock adapter returns different hardcoded Arabic messages based on audio file duration. This is fine for testing but could confuse developers who don't realize the different outputs are duration-keyed.

---

## 4. CACHING

### 🟠 MAJOR — Redis Used Only for Locking, Not Response Caching

Redis is used throughout the codebase, but **only** for:

- Distributed locking (inbox, outbox, followup scheduler)
- Continuity mode state sharing between instances
- Candidate retrieval caching

No AI responses, no API responses, no frequently-accessed data is cached. Every request hits the database and/or OpenAI.

---

### 🟠 MAJOR — In-Memory Fallback When Redis Disabled

**File:** `apps/worker/src/infrastructure/redis.module.ts` **Lines 7–49**

When Redis is disabled or unavailable, `MockRedisClient` is used — an in-memory stub with no persistence, no cross-instance awareness, and only a `logger.warn`. In a multi-instance deployment, locks won't work, leading to duplicate task processing.

---

### 🟡 MINOR — Orchestrator Subscription Cache is In-Memory Only

**File:** `apps/worker/src/orchestrator/orchestrator.service.ts` **Line 103**

Merchant subscription data is cached in a `Map` with a 5-minute TTL. This cache is per-process — multiple worker instances will each maintain separate caches and independently query the DB.

---

### 🟡 MINOR — Product OCR Pending Confirmations Use In-Memory Cache

**File:** `apps/api/src/application/services/product-ocr.service.ts` **Line ~42**

Comment reads: _"In-memory cache for pending confirmations (in production, use Redis)"_. This is still using in-memory storage.

---

## 5. PAYMENT LINKS

### 🟠 MAJOR — Duplicate Payment Link API Methods in Portal

**File:** `apps/portal/src/lib/api.ts` **Lines 1383–1461** and **Lines 1687–1764**

The portal API client has **two identical sections** for payment link methods (`createPaymentLink`, `getPaymentLinks`, `getPaymentLink`, `cancelPaymentLink`). One set may shadow the other or cause confusion during maintenance.

---

### 🟡 MINOR — Hardcoded Payment Methods

**File:** `apps/worker/src/agents/finance/finance.handlers.ts`

Allowed payment methods are hardcoded to `INSTAPAY`, `BANK_TRANSFER`, `VODAFONE_CASH`. Adding new payment methods requires a code change rather than configuration.

---

### 🟡 MINOR — Payment Link URL Construction

Payment link URLs are built using the `APP_URL` config variable, which is good (not hardcoded). However, there's no validation that `APP_URL` is set correctly — a misconfigured `APP_URL` would generate broken payment links sent to customers.

---

## 6. FINANCE AI FEATURES

### 🟠 MAJOR — DAILY_REVENUE_SUMMARY Reuses Weekly CFO Brief

**File:** `apps/worker/src/agents/finance/finance.agent.ts` **Lines 47–49**

```typescript
case FINANCE_AGENT_TASK_TYPES.DAILY_REVENUE_SUMMARY:
  // Reuse weekly brief with modified date range - MVP approach
  output = await this.handlers.generateWeeklyCFOBrief(task);
```

The daily revenue summary calls the exact same handler as the weekly CFO brief. There's no date-range adjustment despite the comment saying "with modified date range." Daily summaries will show weekly data.

---

### 🟡 MINOR — Finance AI Anomaly Detection Has No Alerting Pipeline

**File:** `apps/api/src/application/llm/finance-ai.service.ts`

The `AnomalyNarrativeSchema`, `CfoBriefSchema`, and `MarginAlertSchema` are well-defined but the anomaly detection results are only returned as responses — there's no automated alerting, no push notification, no webhook trigger for detected anomalies.

---

### 🟡 MINOR — Copilot CLOSE_MONTH Requires ADMIN Role

**File:** `apps/api/src/application/llm/copilot-schema.ts` **Lines 318–360**

`CLOSE_MONTH` is marked as a destructive intent requiring ADMIN role. This is correct from a safety standpoint but may be too restrictive for smaller merchants where the owner has only an OWNER role (which has higher hierarchy but may not match the exact `ADMIN` check depending on implementation).

---

## 7. OPS AGENT FEATURES

### 🟡 MINOR — OPS Agent Does Not Handle Voice Directly

Voice notes are transcribed in the API layer (`copilot.controller.ts`) before being passed as text to agents. The OPS agent never sees raw audio — this is architecturally sound but means voice-specific context (tone, urgency) is lost in transcription.

---

### 🟡 MINOR — Escalation Handler Has No SLA Tracking

**File:** `apps/worker/src/agents/ops/ops.handlers.ts`

The `HANDLE_ESCALATION` task creates a notification but does not track response time, SLA deadlines, or re-escalation logic.

---

## 8. GENERAL ISSUES

### 🔴 CRITICAL — Three Agents Are Stubs with No Implementation

**File:** `apps/worker/src/agents/support/support.tasks.ts` **Line 2** — `(Stub)`  
**File:** `apps/worker/src/agents/content/content.tasks.ts` **Line 2** — `(Stub)`  
**File:** `apps/worker/src/agents/marketing/marketing.tasks.ts` **Line 2** — `(Stub)`

Support, Content, and Marketing agents are stubs. The Support agent returns `{ action: 'COMING_SOON' }` for all tasks. However:

- SUPPORT_AGENT is included in the orchestrator's **default agent list** (lines 261–265), meaning tasks can be dispatched to it
- MARKETING_AGENT is included in the ENTERPRISE plan
- These will silently do nothing when invoked

---

### 🟠 MAJOR — Delivery Adapter Permanently Disabled

**File:** `apps/api/src/application/adapters/adapters.module.ts` **Lines 21–24**

The delivery adapter is hardcoded to `DisabledDeliveryAdapter`, not `MockDeliveryAdapter`:

```typescript
{
  provide: DELIVERY_ADAPTER,
  useClass: DisabledDeliveryAdapter,
}
```

`MockDeliveryAdapter` exists with full booking/tracking simulation but is never wired in. Real delivery integration is completely absent — there's no env-based switching to a real adapter.

---

### 🟠 MAJOR — TODO: Merchant Alert Handler Incomplete

**File:** `apps/api/src/application/events/handlers/merchant-alert.handler.ts` **Line 56**

```typescript
// TODO: Send actual alert via configured channel
```

Merchant alerts are generated but never actually sent anywhere. The handler exists but the delivery mechanism is a TODO.

---

### 🟠 MAJOR — Entitlement Guard Defaults Override DB

**File:** `apps/api/src/shared/guards/entitlement.guard.ts` **Lines 88–89**

When the DB returns null for a merchant's agents/features, the guard defaults to `['OPS_AGENT']` and `['CONVERSATIONS', 'ORDERS', 'CATALOG']`. This is different from the orchestrator's defaults (which include INVENTORY_AGENT + SUPPORT_AGENT). The inconsistent defaults mean the API guards block features that the worker would happily process.

---

### 🟡 MINOR — MockDeliveryAdapter Has 10% Random Failure Rate

**File:** `apps/api/src/application/adapters/mock-delivery.adapter.ts` **Line 33**

```typescript
if (Math.random() < 0.1) {
  return { success: false, error: "Mock delivery booking failed" };
}
```

Even though `MockDeliveryAdapter` isn't wired in production, if it were ever activated, the random 10% failure rate would cause real order delivery failures.

---

### 🟡 MINOR — Marketing Agent Promotional Message Is a Placeholder

**File:** `apps/worker/src/agents/marketing/marketing.handlers.ts` **Line 177**

Comment: _"Send a promotional message (placeholder for WhatsApp integration)"_. No actual WhatsApp send logic.

---

### 🟡 MINOR — Agent Catalog Shows ETAs (Q2–Q4 2026) with No Feature Flags

**File:** `apps/api/src/shared/entitlements/index.ts` **Lines 520–580**

Agents like Sales, Creative, Marketing, Support, Content have `status: 'coming_soon'` with ETA dates shown to users, but there's no feature-flag system to gradually roll them out. Activation would require a code deployment.

---

## SUMMARY TABLE

| Category                  | 🔴 CRITICAL | 🟠 MAJOR | 🟡 MINOR | Total  |
| ------------------------- | ----------- | -------- | -------- | ------ |
| 1. Pricing & Entitlements | 1           | 1        | 2        | 4      |
| 2. AI Agent Connectivity  | 2           | 2        | 2        | 6      |
| 3. Voice Functionality    | 0           | 1        | 2        | 3      |
| 4. Caching                | 0           | 2        | 2        | 4      |
| 5. Payment Links          | 0           | 1        | 2        | 3      |
| 6. Finance AI Features    | 0           | 1        | 2        | 3      |
| 7. OPS Agent Features     | 0           | 0        | 2        | 2      |
| 8. General Issues         | 1           | 3        | 3        | 7      |
| **TOTAL**                 | **4**       | **11**   | **17**   | **32** |

---

## TOP 5 PRIORITY FIXES

1. **Fix orchestrator default agents** — Change defaults from `['OPS_AGENT', 'INVENTORY_AGENT', 'SUPPORT_AGENT']` to `['OPS_AGENT']` to match FREE plan. (`orchestrator.service.ts:261`)

2. **Add health-check for LLM connectivity** — Fail loud (not silent mock) when `API_BASE_URL` is missing or OpenAI key is invalid. (`llm-client.module.ts:306`, `copilot-ai.service.ts:65`)

3. **Implement merchant alert delivery** — The alert handler is a dead end. Wire it to email, SMS, or webhook. (`merchant-alert.handler.ts:56`)

4. **Gate stub agents from task dispatch** — Prevent the orchestrator from dispatching tasks to `SUPPORT_AGENT`, `CONTENT_AGENT`, `MARKETING_AGENT` until they're implemented. (`orchestrator.service.ts`)

5. **Add AI response caching** — Cache identical customer queries to reduce OpenAI spend and improve response times. (`llm.service.ts`, `copilot-ai.service.ts`)
