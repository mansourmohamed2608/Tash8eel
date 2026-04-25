# AI Closer Operating System — Backend Audit

> Audit against `docs/AI_CLOSER_OPERATING_SYSTEM.md`. No code changes in this document.

---

## Context

The Tash8eel backend has received a significant wave of dialog/conversation work (option-extractor, short-reply-resolver, dialog-orchestrator updates, conversation entity expansion). This audit maps exactly what is live, what is partial, and what is missing relative to the full AI Closer spec — then proposes the smallest implementation waves to close the gap.

---

## 1. What Already Exists

### Conversation Memory
- **`conversation.entity.ts`** — Full context object with:
  - `dialog` sub-object: `filledSlots`, `askedSlots`, `answeredSlots`, `lastQuestion`, `lastOfferedOptions`, `pendingSlot`, `pendingQuestionType`, `lastProposal`, `lastRecommendation`, `lastQuotedItems`, `lastCustomerSelection`, `lastMediaItemIds`, `lastDecision`
  - `businessType`, `businessTypeConfidence`, `customSlots`, `slotConfidence`, `stillMissingImportant`, `suggestedNextStep`
  - Premium fields: `leadScore` (HOT/WARM/COLD), `leadScoreSignals`, `nbaType`, `nbaText`, `objectionType`, `requiresConfirmation`, `addressConfidence`, `conversationSummary`, `compressedHistory`
- Recent messages (last 12–24) + older `conversationSummary` are injected into every prompt via `MerchantContextService`

### Short-Reply Resolver
- **`short-reply-resolver.ts`** — Full implementation:
  - All-selection: "الاتنين/كلهم" → all `lastOfferedOptions`
  - Ordinal (1st/2nd/3rd) → index into `lastOfferedOptions`
  - Demonstrative "ده/دي" → resolves only if exactly one option; else `needs_clarification`
  - Affirmative → passes `lastProposal` / `lastRecommendation`
  - Negative → offer alternative / clarify
  - Numeric → quantity/budget if `pendingSlot` matches
  - Date hints (بكرا/النهارده/الأسبوع الجاي) → deadline slot
  - Location hints → `delivery_area` if `pendingSlot` matches
  - Emoji ack (👍 ❤️) → affirmative
  - Returns Arabic `contextNote` injected into next LLM prompt

### Option Extractor
- **`option-extractor.ts`** — Full implementation:
  - `extractOfferedOptions()` → detects "X ولا Y؟", numbered lists, ordinal labels
  - `detectPendingQuestionType()` → quantity / delivery_area / deadline / option_choice / confirmation
  - `detectPendingSlot()` → maps to universal slot key
  - `extractLastProposal()` → detects "بنصحك بـ / أنسبلك / أقترح"
  - All stored in `conversation.context.dialog` for next turn

### Intent Classifier
- **`intent-classifier.ts`** — 14 intent types:
  - Commerce: `specifying`, `affirmative`, `negative_reply`, `selecting_all_options`, `ordinal_selection`, `answering_last_question`
  - Browse: `greeting`, `browsing`, `asking_question`, `custom_request`, `media_request`, `changing_mind`
  - Handling: `venting`, `demanding_human`, `infeasible_request`, `off_topic`
  - Confidence scores 0.45–0.92

### Dialog Orchestrator
- **`dialog-orchestrator.ts`** — Coordinates the full turn:
  - Calls IntentClassifier → ShortReplyResolver → SlotPlan → ConstraintNegotiator → DeEscalator → MediaComposer
  - Builds `ReplyIntent` (answerFacts, forbidden claims, next question)
  - **Commerce action gate**: blocks `CREATE_ORDER / UPDATE_CART / CONFIRM_ORDER` unless intent is purchase-like AND explicit commitment keywords detected
  - Calls `LlmService.processDialogTurn()` → returns `DialogTurnResult`
  - Runs `OptionExtractor` on generated reply to seed next turn's context
  - Returns `contextPatch` that is persisted to `conversation.context.dialog`

### Slot Planning & Memory
- **`slot-plan.ts`** — Deterministic slot ordering from merchant's `slotGraph` with conditional logic
- **`universal-slots.ts`** — 9 merchant-agnostic slots (business_type → closing_stage)
- **`slot-extractor.service.ts`** — GPT-4o-mini extracts universal + custom slots per message; conservative merge (confidence ≥ 0.8)
- **`merchant-memory-schema.service.ts`** — Builds merchant slot schema from playbook + KB + catalog (60s cache)
- **`business-context-classifier.service.ts`** — Rule-based + LLM fallback business type classification; sticky logic

### Catalog / KB Grounding
- **`rag-retrieval.service.ts`** — pgvector semantic search → MMR re-rank → trgm fallback; stock-aware
- **`kb-retrieval.service.ts`** — Chunk semantic search + rules retrieval; source_type filtering
- **`merchant-context.service.ts`** — Assembles full prompt: business info + top-5 catalog items + 8 KB chunks + history + slots
- Both are injected into every LLM call

### Order Creation
- **`inbox.service.ts`** — Full order creation:
  - Triggered when LLM action = `CONFIRM_ORDER / CREATE_ORDER / ORDER_CONFIRMED`
  - Updates customer profile (name, phone, address) from `collectedInfo`
  - Creates order as `DRAFT` → immediately `CONFIRMED`
  - Publishes `ORDER_CREATED` event via `OutboxService`
  - `updateCart()` fuzzy-matches LLM-extracted item names against catalog

### Constraint & Escalation Handling
- **`constraint-negotiator.ts`** — Detects deadline/size/quality/budget/personalization conflicts; asks customer which axis to relax
- **`de-escalator.ts`** — Handles complaints/human demands; never invents human transfer if `backup=none`
- **`reply-composer.ts`** — Post-processes reply: strips bot language, reduces to one question, removes stiff openers
- **`media-composer.ts`** — Attaches product photos on request

### Demo Data
- **`demo-seed-assets/`** + migration scripts — 7 customers, 13 orders, 5 SKUs (apparel), 8 expenses, 7 conversations
- One active demo merchant (`demo-merchant`) seeded

### Tests
- **`dialog-core.spec.ts`** — 321-line test suite covering: no fake handoff, constraint axes, reply polishing, slot tracking, media selection, gating gates

---

## 2. What Is Partially Implemented

| Area | Gap |
|------|-----|
| **Sales Stage Tracking** | `closing_stage` universal slot exists, `nbaType` field exists — but no service advances stages (discovery → quote → order_draft → confirmation → order_created). NBA is set by automation scheduler, not dialog orchestrator in real-time. |
| **Short-reply → CartItem mapping** | Resolver returns string text (e.g., "الخيار الأول: عطر عود 100 مل"), not a structured `{catalogItemId, quantity, variant}`. The LLM is responsible for mapping; no deterministic catalog lookup after ordinal selection. |
| **Purchase commitment tracking** | Gating evaluates purchase intent per-turn via regex; no persistent "customer has confirmed purchase intent" flag across turns to disambiguate "تمام" (confirming slot) from "تمام" (confirming order). |
| **Delivery address confidence** | `addressConfidence` field exists in conversation entity but no service populates it from parsed address text. |
| **Payment method tracking** | `payment_state` slot exists but dialog layer has no validation that it is filled before permitting close. |
| **Objection handling** | `objectionType` field exists ("expensive", "trust", "delivery_cost", etc.) but no handler in dialog layer responds dynamically (e.g., offer discount/bundle when "expensive"). |
| **Demo merchant isolation** | Seed data and migration exist; no runtime switch to activate/archive specific demo KB/catalog sets for focused testing (per spec section 13). |

---

## 3. What Is Missing

| # | Missing Capability | Spec Reference |
|---|---|---|
| 1 | **SalesStageAdvancer** — explicit stage machine (discovery → qualification → recommendation → quote → order_draft → confirmation → order_created → followup) with real-time advancement per turn | §8 |
| 2 | **ClosingCriteriaValidator** — "ready to close" check validating all required fields are filled + customer has given explicit confirmation before emitting `CONFIRM_ORDER` | §10 |
| 3 | **OrderAssembler** — maps resolved short-reply option text → `{catalogItemId, quantity, variantKey}` deterministically, without relying only on LLM text extraction | §9 |
| 4 | **ObjectionHandler** — responds to "expensive/trust/thinking" with discount, bundle alternative, social proof, or deferred follow-up per merchant rules | §12 |
| 5 | **"still_missing_for_close" pre-close signal** — distinct from `stillMissingImportant` (which covers all slots), this checks only the subset required before order creation | §10 |
| 6 | **Persistent purchase-intent flag** — session-wide boolean (`purchaseIntentConfirmed`) set after first affirmative/ordinal on a product, used by gate instead of per-turn regex | §8, §10 |
| 7 | **Demo dataset activation control** — a mechanism to activate one demo KB/catalog dataset and deactivate others for clean single-business testing (seed data exists; runtime control does not) | §13 |
| 8 | **End-to-end order visibility test** — no test verifying order appears in merchant orders dashboard after AI creates it (spec §14 flow 10) | §14 |
| 9 | **Budget objection + total calculation in reply** — dialog layer does not calculate and inject "if 150 units, estimated total = X" into `answerFacts`; LLM must derive this from catalog prices without server-side pre-calculation | §12 |
| 10 | **Conditional slot skipping** — merchant-defined logic like "if budget < 100, skip personalization upsell slot" not in `SlotPlan` | §6 |

---

## 4. Exact Files / Services Involved

```
apps/api/src/application/dialog/
  dialog-orchestrator.ts         ← main turn coordinator
  intent-classifier.ts           ← 14 intent types
  short-reply-resolver.ts        ← all short-reply patterns
  option-extractor.ts            ← seeds next-turn context
  slot-plan.ts                   ← slot ordering from slotGraph
  slot-extractor.service.ts      ← GPT-4o-mini slot extraction
  universal-slots.ts             ← 9 universal slots
  merchant-memory-schema.service.ts  ← merchant slot schema
  business-context-classifier.service.ts
  dialog-playbook.service.ts
  constraint-negotiator.ts
  de-escalator.ts
  reply-composer.ts
  media-composer.ts
  __tests__/dialog-core.spec.ts

apps/api/src/application/services/
  inbox.service.ts               ← order creation trigger, cart management, full message processing

apps/api/src/application/llm/
  llm.service.ts                 ← OpenAI call, prompt assembly
  merchant-context.service.ts    ← builds full prompt context
  kb-retrieval.service.ts        ← KB chunk search
  rag-retrieval.service.ts       ← catalog semantic search + MMR

apps/api/src/domain/entities/
  conversation.entity.ts         ← full context schema including dialog + memory + premium ops
  order.entity.ts                ← order structure
  catalog.entity.ts              ← catalog items + variants

demo-seed-assets/                ← 3 demo business archives
scripts/demo-seed.sql            ← 7 customers, 13 orders, 5 SKUs
```

---

## 5. Smallest Implementation Waves

### Wave 1 — Sales Stage Machine + Persistent Purchase Intent Flag
**Goal**: Dialog layer knows exactly where in the sale it is, every turn.

- Add `salesStage` to `ConversationContext` (enum: discovery | qualification | recommendation | comparison | quote | order_draft | confirmation | order_created | followup)
- Create `SalesStageAdvancer` (pure function, no DB): given `{filledSlots, lastIntent, cartItems, requiresConfirmation}` → returns `nextStage`
- Set `purchaseIntentConfirmed: boolean` in `ConversationContext.dialog` after first affirmative/ordinal on a product
- Wire `SalesStageAdvancer` into `DialogOrchestrator.processTurn()` after slot extraction
- Inject `salesStage` into LLM user prompt so the model knows its current position
- **Files**: `conversation.entity.ts`, `dialog-orchestrator.ts`, new `sales-stage-advancer.ts`

### Wave 2 — Closing Criteria Validator
**Goal**: Block premature `CONFIRM_ORDER`; show exact missing field as next question.

- Create `ClosingCriteriaValidator` (pure function): given `{filledSlots, cartItems, requiresConfirmation}` → returns `{ready: boolean, missingForClose: string[]}`
- Required fields before close: customer identity/channel (auto from conversation), at least one cart item, quantity, delivery_area (or pickup), quoted total in `filledSlots`, `requiresConfirmation = true`
- Wire into `DialogOrchestrator`: if `!ready`, force `nextSlot = missingForClose[0]`, block `CONFIRM_ORDER` gate
- Replace fuzzy regex gate with `purchaseIntentConfirmed` flag check
- **Files**: `dialog-orchestrator.ts`, new `closing-criteria-validator.ts`

### Wave 3 — Order Assembler (Deterministic Item → CartItem)
**Goal**: After short-reply ordinal resolution, map option text → catalog ID deterministically.

- Create `OrderAssembler` service: given resolved option text + `catalogItems` in context → fuzzy name match → returns `{catalogItemId, quantity, variantKey}`
- Wire into `ShortReplyResolver` output path: if resolved type is `ordinal` or `all_selection`, call `OrderAssembler` and push to `pendingCartItems` in `contextPatch`
- `InboxService.updateCart()` already does fuzzy match; consolidate into `OrderAssembler` to avoid duplication
- **Files**: `short-reply-resolver.ts`, `dialog-orchestrator.ts`, `inbox.service.ts`, new `order-assembler.ts`

### Wave 4 — Objection Handler
**Goal**: AI responds to "expensive/trust/thinking" with actionable next step, not dead-end.

- Extend `DialogOrchestrator` to detect `objectionType` from intent + message patterns
- Add `ObjectionHandler` (pure function): given `{objectionType, cartItems, catalogItems, merchantPlaybook}` → returns `answerFact` string (discount mention / bundle alternative / trust signal)
- Inject into `answerFacts` array before LLM call
- Persist `objectionType` to `ConversationContext` for tracking
- **Files**: `dialog-orchestrator.ts`, `conversation.entity.ts`, new `objection-handler.ts`

### Wave 5 — Demo Dataset Isolation Control
**Goal**: One clean test loop per demo business dataset.

- Add a seeded `active_demo_merchant_id` config or env var
- Create a DB migration / script to mark specific KB chunks and catalog items as `demo_active: boolean`
- `RagRetrievalService` and `KbRetrievalService` filter by `demo_active` when running in demo mode
- Add a CLI seed command to swap the active demo dataset
- Write E2E test validating: customer message → AI reply with correct catalog prices → order appears in orders table
- **Files**: `rag-retrieval.service.ts`, `kb-retrieval.service.ts`, `demo-seed-assets/`, new migration

---

## 6. Which Wave Should Be Done First

**Wave 1 (Sales Stage Machine + Purchase Intent Flag)**

**Reason**: Every other wave depends on knowing where in the sale the conversation is.
- Wave 2 (closing criteria) needs `salesStage === order_draft` to decide "ready to close"
- Wave 3 (order assembler) needs to know if we are in `recommendation` vs. `order_draft`
- Wave 4 (objection handler) needs to know if we are in `quote` stage to trigger discount logic
- Wave 5 (demo isolation) is independent but has lower functional impact

Wave 1 is also the lowest-risk wave: it is a pure function (`SalesStageAdvancer`) with no DB schema changes except one new field on `ConversationContext` (already a JSONB column — no migration needed). It can be built, tested in isolation, and wired in a single PR.

---

## 7. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| **LLM produces `CONFIRM_ORDER` despite gate** | HIGH | Gate is regex-based per-turn. A persuasive customer message that hits commitment keywords but is mid-conversation will bypass. Wave 2 (closing criteria) closes this. |
| **Short-reply resolver misidentifies neutral messages** | MEDIUM | "تمام" after a KB explanation (not a product offer) may pass `lastProposal` and trigger purchase intent. Mitigated by `purchaseIntentConfirmed` flag (Wave 1). |
| **Fuzzy cart item matching silently maps wrong SKU** | MEDIUM | `inbox.service.updateCart()` fuzzy matches LLM-extracted item names against catalog. Low catalog density = higher collision risk. Wave 3 (OrderAssembler) moves this earlier and makes it auditable. |
| **GPT-4o-mini slot extraction quota throttle** | LOW | `SlotExtractorService` already has fail-open guard. Risk is stale slots causing wrong slot plan. No immediate fix needed. |
| **Demo dataset contamination across test runs** | MEDIUM | Without Wave 5 isolation, multiple demo merchants' KB/catalog items appear in same retrieval space. AI may mix products across businesses. |
| **`conversationSummary` staleness on long conversations** | LOW | Summary generation is deferred (non-blocking). If the scheduler hasn't run recently, older context may be missing. Existing `compressedHistory` field is the mitigation but isn't wired yet. |
| **Order status jump (DRAFT → CONFIRMED immediately)** | LOW | Matches current behavior. Risk: payment not confirmed before status change. Per spec, "pending payment" is valid. This needs a merchant rule, not a code change. |
| **No E2E test for order in merchant dashboard** | MEDIUM | Spec §14 flow 10 is untested. A regression could silently break order visibility without failing CI. Wave 5 should include this test. |
