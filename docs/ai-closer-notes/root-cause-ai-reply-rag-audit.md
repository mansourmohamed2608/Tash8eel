# Tash8eel AI Reply + RAG — Root-Cause Audit

## Context

The Tash8eel WhatsApp AI sales closer fails on a real conversation: customer says "I'm choosing between A and B," the AI offers options, customer replies "الاتنين / both / all," and the AI relists the same options instead of treating the short reply as a firm selection of the active choice frame and progressing the sale. The AI also asks delivery/payment/final-order questions before any product is selected. The user has confirmed the deployed Docker container holds the latest compiled code (markers `SHORT_REPLY_CONTEXT`, `REPLY_STRUCTURE`, `customerVisibleOnly`, `معلومات معروفة` are present), so this is no longer a stale-image problem — the architecture itself produces the failure.

This document is a read-only architectural audit. No code is edited. All fixes proposed are merchant-agnostic and data-driven.

---

# 1. Executive diagnosis (root causes ranked by severity)

| # | Severity | Root cause |
|---|---|---|
| **R1** | **CRITICAL** | After `selecting_all_options` / `ordinal_selection` resolves, **`lastOfferedOptions` is not cleared and `salesStage` is not forced past `comparison`**. `SalesStageAdvancer.advance()` short-circuits to `comparison` whenever `lastOfferedOptions.length >= 2` (sales-stage-advancer.ts:114). The next turn's stage prompt is still "compare options → recommend → ask one question" — so the model legitimately relists. Loop reproduces forever as long as cart stays empty. |
| **R2** | **CRITICAL** | After "الاتنين" / "الأول", **no deterministic state mutation** beyond the text label `lastCustomerSelection`. There is no `OrderAssembler` mapping option text → `{catalogItemId, quantity, variantKey}` (already flagged as missing Wave 3 in `docs/ai-closer-notes/ai-reply-rag-audit.md`), no `pendingCartItems`, and no auto-fill of the `product_interest` slot. So `cartItemCount` stays 0, `salesStage` cannot advance to `order_draft`, and the sale stalls. |
| **R3** | **HIGH** | **`OptionExtractor` only runs on the assistant's reply**, not on the customer's message. When the customer himself enumerates alternatives ("بختار بين A و B"), those alternatives are never persisted as `lastOfferedOptions` / `customerMentionedAlternatives`, so subsequent "الاتنين" resolves with `resolvedOptions = []` and only the generic note is injected. The LLM then has to re-discover the alternatives from raw history, which it does inconsistently. |
| **R4** | **HIGH** | **`OptionExtractor.extractOfferedOptions` is brittle** (option-extractor.ts:21–85). It only fires on (a) "X ولا/أو/or Y؟" with a trailing `؟`/`?`, (b) numbered lists, (c) explicit ordinal labels `الأول:` / `الثاني:`, or (d) bullet lists. Any prose/comma offer ("نقدر نقترح العود أو المسك ولو حابب نوريك الإيتنين") returns `[]`. After such replies, `lastOfferedOptions` is empty next turn (or stale-carried, which is worse — see R1). |
| **R5** | **HIGH** | **No "active choice frame" state distinct from `lastOfferedOptions`.** Once an offer is made, there is no separate `activeChoice = {axis, options, status}` that transitions `open → resolved → closed`. Every turn either overwrites `lastOfferedOptions` (when a new offer is detected) or carries the previous list forward. There is no signal to the LLM "this choice was already resolved — do not re-ask." |
| **R6** | **HIGH** | **Repeated-question prevention is prompt-only** for non-slot questions. `askedSlots` (dialog-orchestrator.ts:193–195) only tracks slot-graph keys, not actual questions like "do you want option A or B?". If the LLM repeats a non-slot question (e.g. relists options), nothing in the deterministic layer catches it. The `[DO_NOT_REPEAT]` fact (dialog-orchestrator.ts:540) is bound to the last *slot* question only. |
| **R7** | **HIGH** | **Premature delivery/payment asks** are not deterministically gated. `gateCommerceAction` (dialog-orchestrator.ts:381–450) only blocks mutating actions (`UPDATE_CART`, `CREATE_ORDER`); it does **not** strip delivery/payment/quantity *questions* from the reply text. The `forbiddenClaims` line ("do not ask for quantity, address, or payment during ...") is prompt instruction the LLM can ignore, especially under token pressure. There is no post-LLM check "if salesStage < order_draft and reply contains delivery/payment regex → rewrite or block." |
| **R8** | **HIGH** | **`SalesStage` flow has dead-end transitions.** From `comparison`, the only escape paths are: (a) `cartItemCount > 0` → `order_draft`, (b) `requiresConfirmation` → `confirmation`, (c) `OBJECTION_RE` match. Without a deterministic write to the cart after `selecting_all_options`, the conversation cannot leave `comparison` even when the customer has clearly chosen. |
| **R9** | **MEDIUM** | **Memory compression has no field-preservation matrix** (memory-compression.service.ts). When >6000 tokens, summary is reused and the last 20 messages are kept verbatim, but `dialog.lastOfferedOptions`, `lastProposal`, `lastRecommendation`, and `lastCustomerSelection` are only durable because they live in `conversation.context.dialog` JSONB — which IS preserved. However, summary regeneration does not explicitly capture "active choice resolved to X" — so a long conversation that compresses past the resolution turn can re-enter the loop. |
| **R10** | **MEDIUM** | **Demonstrative pronoun resolver is conservative** (short-reply-resolver.ts:156–171) — `ده / دي` only resolves when exactly one option exists, otherwise asks for clarification. Combined with R3 (no extraction from customer messages) this means many demonstratives degrade to clarification spam. The existing memory `feedback_short_reply_demo_pronouns.md` (preserved in user memory) confirmed this conservative behavior is intentional, but it amplifies R3 because customer-mentioned alternatives are never resolved. |
| **R11** | **MEDIUM** | **`buildConversationMemoryBrief` lists known facts but not active choice / selected options / sales stage** (merchant-context.service.ts:343–489). The LLM sees `معلومات معروفة` (filled slots) and `حقول أُجيب عنها`, but it does NOT see a structured "active choice frame: {opened, options, customer-selected}" block. The LLM has to infer this from prose. |
| **R12** | **MEDIUM** | **Token-budget recompute** — `getStageMaxTokens` (dialog-orchestrator.ts:624–640) caps `comparison` at the "non-rich" 520-token tier (only `recommendation/comparison/quote/objection/order_draft` get 680). Yet the dialog-turn system prompt is large (~2 KB system + multi-section context). Under contention, the LLM truncates structure, loses "ask one question," and falls back to generic relisting — masquerading as a sales-brain bug. |
| **R13** | **LOW** | **Reply polish keeps the first `?` / `؟`** (reply-composer.ts:121–134). If the LLM's *first* sentence is the relisted options ending in `؟`, polishing leaves it intact. There is no "if first question is already-asked, drop it" pass. |
| **R14** | **LOW** | **AI cache is not invoked on the dialog path** (verified: `aiCache` is only referenced in copilot/merchant-assistant; the dialog orchestrator and `LlmService.processDialogTurn` never call it). So **stale-cache is NOT a contributing cause** for the live bug — confirmed by grep. |
| **R15** | **LOW** | **KB retrieval is generally well-scoped**: merchant-id filter, `business_type` filter, `customerVisibleOnly` enforced at SQL level (kb-retrieval.service.ts:331–333, 373–375). Tests assert this (rag-quality.spec.ts:52–148). Embedding worker re-embeds on content change (kb-chunk.service.ts:354–360 sets `embedding=NULL` on content delta; embedding.worker.ts polls every 30s). Demo seed assets exist in `demo-seed-assets/` but rely on merchant_id scoping. **RAG architecture is sound; it is not the primary cause of the live bug.** |
| **R16** | **LOW** | **No production end-to-end test** exercising the full inbound→DB-state→retrieval→LLM→outbox path. All tests under `apps/api/src/application/dialog/__tests__/` are unit/component (resolver, extractor, stage advancer, polish). `human-reply-quality.spec.ts` and `rag-quality.spec.ts` are SQL/regex shape checks. There is no fixture covering a multi-turn live conversation that exposes R1–R6 deterministically. |

---

# 2. Current pipeline map

```
WhatsApp → Meta Cloud API
  └─ POST /v1/webhooks/meta
       meta-webhook.controller.ts:171  handleWhatsAppWebhook
        ├─ validate signature                 (HMAC-SHA256, WEBHOOK_VERIFY_TOKEN)
        ├─ 200 OK to Meta                      :235
        ├─ parseWebhook() → ParsedWhatsAppMessage
        ├─ merchant lookup by phoneNumberId    :266–358
        ├─ DEDUP: INSERT inbound_webhook_events (provider, message_id) :389–410
        │      → unique(provider, message_id)  ON CONFLICT DO NOTHING
        ├─ logInboundMessage → whatsapp_message_log
        └─ inboxService.processMessage(...) async

inbox.service.ts
  └─ processMessage :505
       ├─ usageGuard.checkMonthlyLimit
       ├─ Redis lock: conversation:{merchantId}:{channel}:{senderId}, TTL 30s
       ├─ DEDUP-2: messageRepo.findByProviderMessageId
       └─ processMessageWithLock :619
            ├─ conversationRepo.findByMerchantAndSender    (state ≠ CLOSED)
            ├─ create conversation if needed                (state=GREETING)
            ├─ create/lookup customer
            ├─ messageRepo.create (INBOUND, providerMessageId)
            ├─ outbox publish MESSAGE_RECEIVED
            ├─ catalogRepo.findByMerchant
            ├─ messageRepo.findByConversation               (no LIMIT — all rows)
            ├─ MemoryCompressionService.getConversationMemory
            │     - if est_tokens > 6000: keep last 20, reuse existing summary
            │     - DOES NOT regenerate summary inline
            ├─ buildTurnMemory
            │     ├─ MerchantMemorySchemaService.load
            │     ├─ BusinessContextClassifier.classify
            │     └─ SlotExtractorService.extract → universalSlots + customSlots
            └─ dialogOrchestrator.processTurn(LlmContext, opts, channel) :1249

dialog-orchestrator.ts:41  processTurn
  ├─ IntentClassifier.classify           :50    (greeting/browsing/spec/short-reply intents)
  ├─ DialogPlaybookService.getForMerchant
  ├─ ShortReplyResolver.resolve          :58–64
  │     reads previousDialog.{pendingSlot, pendingQuestionType,
  │                            lastOfferedOptions, lastRecommendation, lastProposal}
  ├─ resolveShortReplySlots              :67–70  (numeric→quantity/budget,
  │                                                location→delivery_area,
  │                                                date→deadline)
  ├─ filledSlots = previous + shortReplyPatch + llmSlots   :72–80
  ├─ SlotPlan.chooseNext                  :81–85  (from playbook.slotGraph)
  ├─ SalesStageAdvancer.advance           :88–99  (deterministic stage)
  ├─ MediaComposer.compose                :101–107
  ├─ ConstraintNegotiator.plan            :109
  ├─ DeEscalator.plan                     :113
  ├─ buildShortReplyFacts                 :117–121 → answerFacts:
  │     [SHORT_REPLY_CONTEXT] <note>
  │     [ANSWERED_BY_SHORT_REPLY] <slot>
  │     [DO_NOT_REPEAT] لا تعيد <lastQuestion>
  ├─ buildReplyIntent                     :122–132
  │     answerFacts = [
  │       [SALES_STAGE: ...] + stage instruction,
  │       [REPLY_STRUCTURE] ...,
  │       intent: ...,
  │       gating: do not collect address/payment/quantity ...,
  │       ...short-reply facts,
  │       per-intent goal lines,
  │       candidate catalog items (top 3),
  │       media captions
  │     ]
  ├─ getStageMaxTokens                    :133  (rich:680, simple:380, default:520)
  ├─ llmService.processDialogTurn         :137–141
  │
  └─ llm.service.ts:663  processDialogTurn
      ├─ MerchantContextService.buildCustomerReplyContext :703
      │     (merchant-context.service.ts:190–341)
      │   ├─ load all active catalog rows
      │   ├─ kbRetrievalService.hasStructuredKb
      │   ├─ if structured: searchChunks(merchant, query, businessType,
      │   │     customerVisibleOnly:true, limit:8)        ← KB scoped public-only
      │   │     SQL filter: merchant_id, is_active, embedding≠NULL,
      │   │                  source_type IN, locale, business_type OR NULL,
      │   │                  visibility='public'
      │   │     ranked by (embedding<=>queryVec) ASC
      │   ├─ else: extractKnowledgeBaseEntries from JSONB merchant.knowledgeBase
      │   ├─ filterCatalogForLlmContext (relevant + visible)
      │   ├─ buildConversationMemoryBrief  :297–310
      │   │     === ذاكرة المحادثة ===  (universal slots labeled)
      │   │     === تفاصيل إضافية ===  (custom slots applicable to businessType)
      │   │     المعلومات الناقصة المهمة: ...
      │   │     الخطوة التالية المقترحة: ...
      │   │     === معلومات معروفة — لا تسأل عنها مجدداً ===
      │   │     حقول أُجيب عنها بالفعل: ...
      │   │     حقول سُئل عنها: ...
      │   │     تعليمات: لا تسأل مجدداً ...
      │   │     === ملخص المحادثة الأقدم === (only if SUMMARY_MIN_MESSAGES)
      │   │     === آخر N رسالة ===
      │   └─ fullContext = SECTION A..E
      ├─ buildDialogTurnSystemPrompt        :710 (~80 lines Arabic system prompt
      │     with stage-by-stage REPLY_STRUCTURE blocks; NO short-reply specific block)
      ├─ userPrompt = JSON.stringify({
      │     salesStage, customerMessage, replyIntent, currentCart,
      │     dialogMemory: ctx.dialog,    ← FULL dialog state visible to LLM
      │     businessType, customSlots, slotConfidence, stillMissingImportant
      │   })
      ├─ openai.beta.chat.completions.parse  (gpt-4o-mini, JSON schema, temp=0.75)
      │     max_tokens: clamp(stageMax, 350, 800), default 520
      ├─ validateResponse → ReplyComposer.polish(reply_ar)
      │   (reply-composer.ts: strip bot words, stiff openers, human-promise patterns,
      │    keep one question only, signature gating)
      └─ return LlmResult

  back in dialog-orchestrator.processTurn:
  ├─ gateCommerceAction                   :142–146
  │     blocks UPDATE_CART/CREATE_ORDER/CONFIRM_ORDER unless intent ∈ commerce-like
  │     AND hasExplicitPurchaseCommitment(customerMessage)
  │     AND hasStrongCommerceAnchor(catalogMatch || cartItems>0)
  │   NB: does NOT rewrite reply_ar text — only changes action+cartItems
  ├─ extract from reply_ar:
  │     OptionExtractor.extractOfferedOptions :158
  │     OptionExtractor.detectPendingQuestionType :159
  │     OptionExtractor.detectPendingSlot :160
  │     OptionExtractor.extractLastProposal :161
  ├─ lastCustomerSelection from short-reply :164–169
  └─ contextPatch (merged into conversation.context.dialog) :171–225
        dialog: {
          lastIntent, filledSlots, askedSlots(append), answeredSlots(union),
          lastQuestion, lastMediaItemIds, lastDecision,
          lastOfferedOptions: NEW || prev || [],   ← STALE-CARRY when no new offer
          pendingQuestionType, pendingSlot,
          lastProposal: NEW || prev,
          lastRecommendation: prev (never set here!),
          lastCustomerSelection: from short-reply or prev,
          lastQuotedItems: prev,
          salesStage,
        }

inbox.service.ts continues (post-orchestrator):
  ├─ processLlmAction → maybe updateCart/createOrder
  ├─ messageRepo.create (OUTBOUND, sender_id='bot', text=replyText)
  ├─ collectedInfo merge (customerName/phone/address)
  ├─ mergedContextPatch = conversation.context + dialogTurn.contextPatch + turnMemory
  ├─ conversationRepo.update {cart, state, context, collectedInfo, missingSlots}
  └─ sendInboxResponseViaMetaWhatsApp(recipient, response, phoneNumberId)
       └─ metaAdapter.sendTextMessage → Meta Graph API
            on success: messages.provider_message_id_outbound = wamid

Outbox worker (every 5s) → drains MESSAGE_QUEUED / status events
Status callback POST /v1/webhooks/meta → updateMessageStatus → whatsapp_message_log
```

---

# 3. DB / state findings

| State item | Current storage | Problem | Recommendation |
|---|---|---|---|
| `conversation.context.dialog.lastOfferedOptions` | JSONB durable | **Stale-carries forward when no new offer detected**; never cleared after `selecting_all_options` resolves | Introduce `activeChoice` object with `status: open\|resolved\|closed` and clear `options` on `resolved` |
| `lastCustomerSelection` | JSONB durable, **text label only** | Not a structured selection; LLM must re-resolve to catalog | Pair with `selectedCatalogItemIds: string[]` written by `OrderAssembler` |
| `customerMentionedAlternatives` | **NOT stored** | Customer-volunteered options ("between A and B") are lost | Add field; populate from a `CustomerOptionExtractor` running on inbound text |
| `activeChoice` (frame) | **NOT stored** | No notion of "an open choice exists / has been resolved" | Add `dialog.activeChoice = { axis: string, options: string[], status: 'open'\|'resolved'\|'closed', resolvedAt: ISO, resolvedTo: string[] }` |
| `pendingCartItems` | **NOT stored** | After ordinal/all selection there is no draft of items to be added | Add ephemeral `dialog.pendingCartItems: Array<{catalogItemId, quantity?, variantKey?}>` |
| `purchaseIntentConfirmed` | **NOT stored** (regex per turn) | Gate is brittle; "تمام" mid-conversation may bypass | Persist `dialog.purchaseIntentConfirmed: boolean` set after first affirmative on a product |
| `salesStage` | JSONB durable in `dialog.salesStage` | Derived each turn; can regress because `lastOfferedOptions.length>=2` → `comparison` | Add monotonic floor: `stage = max(derivedStage, prevStage)` for forward-only stages, OR clear `lastOfferedOptions` after resolution so derivation moves forward |
| `askedQuestionsHistory` | Only `askedSlots` (slot keys) | Non-slot relists are not tracked | Add `dialog.askedQuestions: Array<{kind: 'slot'\|'choice'\|'qty'\|'delivery'\|..., key: string, askedAt}>`; orchestrator forbids repeats by `kind+key` deterministically |
| `lastRecommendation` | JSONB | **Never written by orchestrator** (only carried forward from `previousDialog.lastRecommendation` at dialog-orchestrator.ts:214) | Either remove from contract or let LLM emit it via structured output |
| `conversation_summary` | Column TEXT | Only generated on explicit `compressConversation()` call; not auto-triggered in `processMessage` | Hook compression into inbox flow when message count crosses threshold; preserve "active choice resolved to X" line in summary template |
| `compressed_history` | JSONB `{messageCountAtSummary}` | Only metadata, no preserved structured state | Persist a structured "facts kept across compression" object (active choice frame, sales stage timeline, last quote total) |
| `messages` (loaded) | `SELECT * ORDER BY created_at ASC` (no LIMIT) | Unbounded read for very long conversations; later truncated in-app | Apply `LIMIT 200` in repo or load only `last_n_for_context` post-summary |
| `idempotency` (BL-008) | `inbound_webhook_events(provider, message_id)` UNIQUE | OK | None |
| `outbox_events` | OK (transactional) | OK | None |
| `merchant_kb_chunks.embedding` | pgvector | Cleared on content change → re-embedded by worker | OK |
| `merchant_kb_chunks.visibility` | TEXT | Filter applied at SQL when `customerVisibleOnly` | OK; ensure default of new chunks is `internal` (verify in `kb-chunk.service.ts` upsert) |
| `catalog_items` | OK | OK | None |
| AI cache keys | `ai-cache.service.ts` Redis/in-memory | **Not used in dialog reply path** (verified by grep) | None — no risk |

---

# 4. RAG findings

| RAG area | Current behavior | Risk | Recommendation |
|---|---|---|---|
| KB chunk creation | `KbChunkService.syncFromMerchantKb` projects `merchants.knowledge_base` JSONB into `merchant_kb_chunks` rows | OK; structured projection with re-embedding on diff | None |
| Embedding generation | `EmbeddingWorker` cron 30s, batches 10 catalog + 10 KB, `text-embedding-3-small` 1536-dim | Up to 30s lag for new chunks | Acceptable; document the lag |
| Visibility filter | `customerVisibleOnly:true` applied at SQL (kb-retrieval.service.ts:331–333, 373–375) | OK | Verify default `visibility` for new admin-created chunks is `internal` |
| Merchant scoping | `WHERE merchant_id = $1` on every KB and catalog query | OK | None |
| Business-type filter | `WHERE business_type = $X OR business_type IS NULL` | OK; allows universal chunks | None |
| Catalog retrieval | `RagRetrievalService`: pgvector ANN ×3 → in-stock-first → MMR (λ=0.65) → text fallback | OK | None |
| Out-of-stock substitutes | `getSubstitutes` returns in-stock similar items | OK | None |
| Stale chunk safety | On content change, `embedding=NULL` cleared and re-embedded | OK | Verify deletes also trigger row removal or `is_active=false` |
| Catalog vs KB conflict | Catalog injected into "Section B," KB into "Section C"; price guidance: "use catalog price verbatim, never invent" | OK | None |
| Demo data leakage | `demo-seed-assets/` exists; tied to merchant_id; demo merchants seeded | LOW — relies on merchant_id scoping | Add a CI guard: production query plans must include `merchant_id` predicate |
| RAG observability | Errors logged; no per-query trace of "what was retrieved + scores + why" | MEDIUM | Add a debug log line: `rag_retrieval={merchantId, query, kbChunks: [...ids], catalogIds: [...], scores}` keyed by correlationId |
| Prompt grounding | System prompt has explicit "use catalog prices verbatim; if missing say 'السعر مش متوفر'" | OK | None |
| Hallucinated prices | Tests assert prompt contains the price guard (rag-quality.spec.ts:294–308) | OK | None |
| Inbound KB hit rate | No dashboard for "how often KB was retrieved with hits per turn" | LOW | Persist `kbCount` per turn (already returned) into an analytics row for tuning |

**Verdict on RAG**: production-grade with minor gaps. Not the primary cause of the live failure.

---

# 5. Short-reply / selection findings — why "الاتنين" failed

The exact failure trace, given the customer turn-by-turn:

1. Turn N: AI offers options. If the offer is in pattern A/B/C/D, `OptionExtractor.extractOfferedOptions` populates `dialog.lastOfferedOptions = ['A','B']`. **If the offer is prose**, it returns `[]` and `lastOfferedOptions` stays whatever it was. The customer's prior message ("بختار بين A و B") did **not** populate this field — the extractor only reads assistant replies (R3, R4).
2. Turn N+1: Customer sends "الاتنين."
   - `IntentClassifier.classify` → `selecting_all_options` (intent-classifier.ts:75).
   - `ShortReplyResolver.resolve` → `type:'selecting_all_options'`, `resolvedOptions: dialog.lastOfferedOptions`. If options were lost (R3/R4), `resolvedOptions = []` and the contextNote is generic ("العميل يريد كل الخيارات المتاحة").
   - `SalesStageAdvancer.advance` → `cartItemCount=0`, no `requiresConfirmation`, no objection, no quote signal, **`lastOfferedOptions.length>=2`** (or carried forward) → returns `comparison` (R1, R8).
   - `lastCustomerSelection` is set to `'A + B'` (text label), nothing else (R2).
   - `getStageMaxTokens('comparison')` → 680 tokens.
   - Stage REPLY_STRUCTURE for `comparison`: "(1) acknowledge → (2) compare → (3) recommend → (4) one question."
   - LLM follows the structure faithfully and produces another comparison reply. `OptionExtractor` re-extracts the same options. Loop closes.
3. Turn N+2: Customer says "الاتنين" again.
   - Same path. `lastOfferedOptions` still set (because the comparison was re-emitted). Same `comparison` stage. Same relisting. **The system has no signal that the customer already resolved this choice.**

What generic state should exist:

```ts
dialog.activeChoice: {
  axis: 'product_interest' | 'variant' | 'addon' | 'tier' | string,
  options: string[],                 // ["A","B"]
  status: 'open' | 'resolved' | 'closed',
  resolvedAt?: ISO,
  resolvedTo?: string[],             // ["A","B"] for selecting_all
  selectedCatalogItemIds?: string[]  // populated by OrderAssembler
}
```

When `ShortReplyResolver` returns `selecting_all_options` or `ordinal_selection`, the orchestrator must:
1. Set `dialog.activeChoice.status = 'resolved'` and `resolvedTo = resolvedOptions || [resolvedValue]`.
2. Run `OrderAssembler` (new) to map each resolved option text → `{catalogItemId, basePrice, variantKey}` against `context.catalogItems`.
3. Write `dialog.pendingCartItems = [...]` with default qty=1.
4. **Clear `lastOfferedOptions = []`** so `SalesStageAdvancer` can leave `comparison`.
5. Set `dialog.purchaseIntentConfirmed = true` for the resolved items.
6. Force `salesStage = max(currentStage, 'recommendation')` and let cart-write naturally lift to `order_draft` next turn.
7. Inject `[ACTIVE_CHOICE_RESOLVED] customer chose <list>` and `[DO_NOT_RELIST] do not re-offer this axis` into `answerFacts`.

For the **customer-side** option extraction (R3), add a `CustomerOptionExtractor` running on the inbound message. Generic patterns (data, no product names):
- `بختار بين X و Y` / `محتار بين X و Y` / `between X and Y` / `comparing X and Y`
- `X ولا Y` / `X أو Y` / `X or Y`

These populate `dialog.activeChoice.options` and `dialog.activeChoice.axis = 'product_interest'` BEFORE the LLM is called.

---

# 6. Sales / reply findings

**Why the AI asks delivery/payment/final-order details too early:**

- `gateCommerceAction` (dialog-orchestrator.ts:381) only stops *actions* (`UPDATE_CART`, `CREATE_ORDER`); it does not strip *questions* from `reply_ar`.
- `forbiddenClaims` and `replyIntent.answerFacts` "do not collect address/payment/quantity unless purchase confirmed" are prompt-only. Under stage `qualification` or `comparison`, the LLM has already chosen its question by the time it generates JSON.
- `slot-plan.ts` picks the first missing slot from `playbook.slotGraph`. If the merchant playbook lists `delivery_area` early, it can be picked while the customer hasn't even chosen a product.

**Why the AI repeats / sounds generic:**

- `[DO_NOT_REPEAT]` covers only the last *slot* question (R6). Choice questions, comparison questions, and confirmation questions are not tracked.
- Memory brief lists known facts well, but does NOT show the LLM "which questions you have already asked at the question level." The LLM sees "حقول سُئل عنها: delivery_area" but not "you already asked 'A or B?' twice."
- When `lastOfferedOptions` is empty (R4) the LLM has no anchor and falls back to generic re-discovery.

**Recommendation:**

1. Deterministic **askedQuestions** ledger: every turn records `{kind, key, askedAt}`. The orchestrator computes a `forbiddenAsks: string[]` (e.g. `'choice:product_interest:A_B'`) and injects `[DO_NOT_ASK_AGAIN] ...` into `answerFacts`.
2. Add a **post-LLM gate** that scans `reply_ar` for delivery/payment/quantity question patterns; if `salesStage < order_draft` and `purchaseIntentConfirmed=false`, the orchestrator *rewrites* the question to a stage-appropriate one (or asks `slotPlan.nextSlot` if available) before sending. This is a deterministic safety net for prompt drift.
3. Make `SlotPlan` stage-aware: filter `slotGraph` by `applicableStages: SalesStage[]` so `delivery_area` is only askable from `order_draft` onward. Add this as an optional field on `SlotGraphNode` (data-driven, merchant-defined).

---

# 7. Prompt findings

Conflicts and weaknesses in `buildDialogTurnSystemPrompt` (llm.service.ts:902–992):

| Issue | Where | Impact |
|---|---|---|
| Two separate "do not collect address/payment/quantity" rules — one in system prompt (line 936), one duplicated in `answerFacts` | system + replyIntent | Soft instruction; no deterministic enforcement |
| `dialogMemory` injected raw (large object) but no explicit `activeChoice` block; LLM has to infer | userPrompt JSON | Active-choice resolution is invisible |
| `معلومات معروفة` is structured but does not include "already-asked questions at question-level" | memory brief | R6 |
| `[REPLY_STRUCTURE]` is per stage but `comparison` reply structure literally tells the LLM to re-list and re-recommend — exactly what we don't want after `selecting_all_options` | dialog-orchestrator.ts:651 | Drives R1 loop |
| `[SHORT_REPLY_CONTEXT]` text is verbose Arabic prose; the LLM under JSON-schema constraint may dilute it | answerFacts | Acceptable but not deterministic |
| No explicit "active choice resolved → advance frame" instruction tied to short-reply intent | system prompt | The system prompt describes per-stage behavior, not per-short-reply behavior |
| Token budget 520 default for non-rich stages, but the system prompt + memory brief + replyIntent JSON often >2500 input tokens; output budget is fine but answer quality varies | llm.service.ts:753 | Minor |
| `temperature: 0.75` | llm.service.ts:756 | Mild drift; acceptable for warmth |

**Cleaner prompt contract (proposed, generic):**

```
SYSTEM (constant per merchant):
  identity, language/style, forbidden-claims, structured-output-rules

USER prompt (JSON):
{
  customerMessage,
  interpretedShortReply: { type, resolvedOptions, contextNote },
  knownFacts: { universalSlots, customSlots, summaryOfPriorTurns },
  activeChoice: { axis, options, status, resolvedTo, selectedCatalogItemIds } | null,
  askedQuestions: [{kind, key}, ...],
  pendingCartItems: [...],
  salesStage,
  nextBestAction: { kind: 'recommend'|'compare'|'quote'|'collect_quantity'|'collect_delivery'|'confirm', target },
  catalogFacts: [{id, name, price, available, ...}],
  kbFacts: [{sourceType, title, content, confidence}],
  forbiddenAsks: [...]
  replyMustInclude: [...]    // e.g. "summarize the resolved selection in one short sentence"
  replyMustAvoid: [...]      // e.g. "do not re-offer the resolved choice"
}
```

The LLM returns:
```
{
  reply_ar,
  actionType,
  contextPatch: { activeChoice?, pendingCartItems?, purchaseIntentConfirmed?, ...},
  selectedCatalogItemIds: [],
  askedQuestionThisTurn: { kind, key },
  nextBestActionSuggested: { kind, target }
}
```

A deterministic reducer runs after the LLM call:
1. Validate the LLM did not ask a `forbiddenAsks` question; if it did, rewrite or downgrade.
2. If `nextBestAction=='confirm'` but `purchaseIntentConfirmed=false`, demote.
3. Merge `contextPatch` into `conversation.context.dialog`.

---

# 8. Cache findings

`ai-cache.service.ts` exists and supports `LLM_CONVERSATION` TTL=120s. **It is not invoked on the dialog reply path** (verified: no `aiCache` reference in `dialog-orchestrator.ts` or in the `processDialogTurn` function of `llm.service.ts`). The cache is only used by `copilot-ai.service.ts` and `merchant-assistant.service.ts` for ASK-style queries. **Stale cache is NOT a contributing cause of the live failure.** No change needed; document this as the current behavior.

---

# 9. Old-code / git history findings

- **The single most recent commit `7c655f2 — improve ai reply brain memory rag and sales quality`** (Apr 25, 2026) is the wave that introduced `SalesStageAdvancer`, the short-reply resolver, option extractor, conversation memory expansion, and the `معلومات معروفة` brief. It is the current architecture, not a regression. No older implementation is more advanced than current; the audit doc `docs/ai-closer-notes/ai-reply-rag-audit.md` from `af34971` already lists Wave 3 (`OrderAssembler`) and Wave 1 (sales stage + purchase intent flag) as **never built**. The stalled sale matches that gap exactly — Wave 3 is the missing piece that would deterministically write to the cart on `selecting_all_options`/`ordinal_selection`.
- No prior generic implementations worth reverting to.
- Earlier commits (`70276b7 rescue(group-b): KB/RAG backend`, `83f5189 rescue(group-c): LLM and AI service improvements`, `7237dcb feat(ai-reply): Wave 1+2+3 inbox reply quality`) introduced the KB chunk pipeline, retrieval visibility, and routing — all retained and consistent with current architecture. **Do not revert.**

---

# 10. Required architecture (target state — fully generic)

### State model (additions to `ConversationContext.dialog`)

```ts
dialog: {
  // existing fields…
  activeChoice: {
    axis: string,                          // 'product_interest' | 'variant' | merchant-defined
    options: string[],
    status: 'open' | 'resolved' | 'closed',
    openedAt: ISO,
    resolvedAt?: ISO,
    resolvedTo?: string[],
    selectedCatalogItemIds?: string[],
  } | null,
  customerMentionedAlternatives: string[], // populated by CustomerOptionExtractor
  pendingCartItems: Array<{                // ephemeral, cleared once moved to cart
    catalogItemId: string,
    quantity?: number,
    variantKey?: string,
    sourceText: string,
  }>,
  purchaseIntentConfirmed: boolean,
  askedQuestions: Array<{
    kind: 'slot' | 'choice' | 'qty' | 'delivery' | 'payment' | 'confirm' | 'recommend',
    key: string,
    askedAt: ISO,
  }>,
}
```

### Memory model

- **Last 20 messages verbatim** (existing).
- **Conversation summary** regenerated when `messages > 30` (auto-trigger in inbox flow), preserving:
  - active choice frames (axis + resolution)
  - selected items
  - quoted totals
  - sales stage transitions
- **Structured `dialog.*` JSONB is durable** across compression (already true).

### Active choice model

- `CustomerOptionExtractor` (new, pure function) runs on each inbound text.
- `OptionExtractor` (existing) runs on each assistant reply.
- Either source opens an `activeChoice` if none is open.
- `ShortReplyResolver`'s `selecting_all_options` / `ordinal_selection` resolves the open `activeChoice`.
- `OrderAssembler` (new, pure function) maps resolved option text → catalog IDs against `context.catalogItems`.
- After resolution: `lastOfferedOptions = []`, `activeChoice.status='resolved'`, `pendingCartItems` populated, `purchaseIntentConfirmed=true`.

### RAG model

Already adequate. Add:
- per-turn retrieval log (correlationId-keyed)
- explicit "no chunks retrieved → reply must say 'السعر/المعلومة مش متوفرة'" deterministic guard

### Prompt contract

As described in §7. Inputs are structured; LLM returns reply + structured contextPatch; deterministic reducer applies post-LLM validation.

### Deterministic reducer (post-LLM)

1. Reject `actionType=CREATE_ORDER` if `purchaseIntentConfirmed=false`.
2. Detect repeated questions by `askedQuestions` ledger; rewrite or strip.
3. Detect premature delivery/payment asks based on `salesStage` floor.
4. Merge `contextPatch` from LLM output into JSONB.

### Optional structured output schema

Already used (`response_format: json_schema`). Extend the schema to include:
- `selectedCatalogItemIds: string[]`
- `pendingCartItems: [...]`
- `activeChoiceUpdate: {...}`
- `askedQuestionThisTurn: {...}`

### Eval harness

Replace shallow tests with a transcript harness (a starter exists at `apps/api/src/application/dialog/__tests__/transcript-harness.ts`). Each scenario:
```
{
  name, merchantFixture, turns: [
    { from: 'customer', text },
    { expect: { resolvedShortReply, activeChoice, salesStage, askedQuestionKind, mustNotContain, mustContain } }
  ]
}
```
Required scenarios:
1. customer comparing A/B → AI offers → "الاتنين" → AI continues without relist + cart populated
2. customer says "بختار بين X و Y" → AI offers → "الأول" → AI advances to specific X
3. repeated "الاتنين" after resolution → AI does not relist
4. delivery question pre-selection → blocked
5. price ask → catalog price verbatim or "السعر مش متوفر"
6. private-KB chunk does not appear in reply
7. stale chunk after content edit → not used (re-embed lag check)
8. compression past 30 messages → resolved-choice summary preserved
9. emoji/affirmative after recommendation → advance, do not re-qualify
10. "تمام" mid-discovery with no proposal → does NOT trigger purchase intent

### Deploy verification

Standard checklist (already partially implemented — extend):
- `npm run build -w apps/api` passes
- jest tests green
- docker image timestamp newer than HEAD commit
- container recreated (`docker compose up -d --no-deps --build api`)
- `docker exec api grep -r 'ACTIVE_CHOICE_RESOLVED' dist/` returns matches (after Wave 1)
- API `/health` 200
- worker `/health` 200
- live test in a fresh conversation (new sender_id)
- correlation-ID trace in logs from webhook → outbox

---

# 11. Implementation plan — minimal safe waves

Each wave is merchant-agnostic, generic, and data-driven.

### Wave 1 — `activeChoice` frame + `OrderAssembler` + clear-on-resolution

**Goal**: After `selecting_all_options` / `ordinal_selection` resolves, the orchestrator deterministically (a) writes the resolution into `dialog.activeChoice`, (b) maps options to catalog IDs via `OrderAssembler`, (c) populates `pendingCartItems`, (d) clears `lastOfferedOptions`, (e) sets `purchaseIntentConfirmed=true` for the resolved items.

- **Files**:
  - `apps/api/src/domain/entities/conversation.entity.ts` (add `activeChoice`, `pendingCartItems`, `customerMentionedAlternatives`, `purchaseIntentConfirmed`, `askedQuestions` types)
  - `apps/api/src/application/dialog/order-assembler.ts` (NEW, pure function: text → `{catalogItemId, variantKey?}` via fuzzy normalization in `dialog-orchestrator.ts:607–616`)
  - `apps/api/src/application/dialog/dialog-orchestrator.ts` (call OrderAssembler in `processTurn` after short-reply resolution; build `contextPatch.dialog.activeChoice/pendingCartItems`; clear `lastOfferedOptions` on resolve)
  - `apps/api/src/application/services/inbox.service.ts` (consume `pendingCartItems`: if non-empty and gate allows, append to cart on next turn — or surface to LLM as `[CART_PENDING]` fact)
- **DB**: no schema migration (all under existing `context` JSONB).
- **Tests**:
  - extend `short-reply.spec.ts`: assert `activeChoice.status='resolved'` and `pendingCartItems.length>=1` after `الاتنين` with two catalog matches
  - new `order-assembler.spec.ts`: pure unit with synthetic catalog
  - extend `dialog-orchestrator` tests: after resolution, `lastOfferedOptions=[]` and `salesStage` no longer regresses to `comparison`
- **Acceptance**:
  - in a synthetic conversation with two offered catalog items, `الاتنين` causes both items to appear in `pendingCartItems`, `lastOfferedOptions` empty, `salesStage` advances to `recommendation` or `order_draft`
  - no merchant/product names hardcoded
- **Deploy verify**: grep `dist/` for `ACTIVE_CHOICE_RESOLVED`, `OrderAssembler`; live test with fresh conversation.

### Wave 2 — `CustomerOptionExtractor` + customer-mentioned alternatives

**Goal**: Capture alternatives the customer mentions ("بختار بين X و Y") so subsequent short replies can resolve even when the AI's reply was prose.

- **Files**:
  - `apps/api/src/application/dialog/customer-option-extractor.ts` (NEW, generic regex on `بختار بين X و Y` / `محتار بين X و Y` / `between X and Y` / `comparing X and Y` / `X ولا Y`)
  - `dialog-orchestrator.ts` (run before short-reply resolver; if `activeChoice` is null and the customer enumerated alternatives, open the frame)
- **DB**: none.
- **Tests**: new `customer-option-extractor.spec.ts` with generic Arabic + English patterns; integration test in dialog-orchestrator covering "بختار بين A و B → الاتنين" path.
- **Acceptance**: `dialog.customerMentionedAlternatives` and `activeChoice.options` populated from inbound text; short-reply resolution uses them.
- **Deploy verify**: marker grep + live test.

### Wave 3 — `askedQuestions` ledger + post-LLM stage gate

**Goal**: Deterministic prevention of repeated questions (any kind) and premature delivery/payment asks.

- **Files**:
  - `dialog-orchestrator.ts` (track `askedQuestions` of kinds `slot`, `choice`, `qty`, `delivery`, `payment`, `confirm`, `recommend`; inject `[DO_NOT_ASK_AGAIN]` per kind)
  - `apps/api/src/application/dialog/post-llm-gate.ts` (NEW, pure function: scans `reply_ar` for delivery/payment/qty question patterns; if `salesStage` < `order_draft` and `purchaseIntentConfirmed=false`, replace the question with `slotPlan.nextSlot` question or strip)
  - integrate in `processTurn` after `gateCommerceAction`
- **DB**: none.
- **Tests**: dialog-orchestrator scenarios where LLM asks delivery early → gate rewrites; `askedQuestions` accumulates; repeat-question rejected.
- **Acceptance**: live conversation never asks delivery before product selection; same question never asked twice.

### Wave 4 — Memory compression triggered inline + active-choice preservation in summary

**Goal**: Auto-compress when message count >30; preserved summary template includes resolved choices, selected items, quoted totals.

- **Files**:
  - `memory-compression.service.ts` (auto-trigger; new template prompt)
  - `inbox.service.ts` (await compression non-blockingly inside `processMessageWithLock`)
- **DB**: none.
- **Tests**: long-conversation fixture; assert summary contains "active choice resolved to: ..." and "items selected: ..." structure.

### Wave 5 — Eval harness scaling (transcript fixtures)

**Goal**: Replace shallow tests with multi-turn transcript scenarios covering all 10 must-pass cases (see §10 eval harness).

- **Files**:
  - `apps/api/src/application/dialog/__tests__/transcript-harness.ts` (extend existing)
  - `apps/api/src/application/dialog/__fixtures__/<generic_scenarios>/`
- **DB**: none. **No production code changes.**
- **Acceptance**: all 10 scenarios pass; CI fails on regression.

### Wave 6 — RAG observability + retrieval debug log

**Goal**: Per-turn correlation-ID-keyed log of `{kbChunkIds, catalogIds, scores}`. Optional admin-only endpoint to inspect.

- Lower priority; tackle after waves 1–5.

---

# 12. First implementation wave to execute

**Wave 1** — `activeChoice` + `OrderAssembler` + clear `lastOfferedOptions` on resolution.

**Why first**:
- Directly fixes R1, R2, R5, R8 (the four critical causes of the live failure).
- Pure code addition + JSONB shape extension; no DB migration; low risk.
- Unlocks Wave 3 (the gate needs `purchaseIntentConfirmed`) and Wave 4 (summary needs `activeChoice` history).
- Independently testable with a synthetic catalog.
- Without this, every other wave is cosmetic — the sale will still stall.

---

# 13. Risks

| Risk | Mitigation |
|---|---|
| Hardcoding any product / business name | Code review checklist; no string literal matches catalog name; only generic patterns and merchant_id-scoped data lookups |
| Stale RAG chunks after edit | Already handled (`embedding=NULL` on content diff + worker re-embed); add CI guard that `is_active=false` is set on KB delete |
| Prompt-only fixes | Disallowed; every wave includes deterministic reducer logic |
| DB migration | Wave 1 has none; later waves only add fields under existing JSONB |
| Production data corruption | All writes are scoped by `merchant_id`; `activeChoice` defaults null; backward-compatible |
| Eval coverage too thin | Wave 5 explicitly addresses; CI must run the harness |
| Cache stalemate | N/A — dialog path does not use cache (R14) |
| Docker deployment confusion | After each wave: `npm run build`, image timestamp check, container rebuild + grep dist for new marker, fresh-conversation live test |
| LLM prompt drift on stage `comparison` | Wave 3 post-LLM gate provides a deterministic safety net |
| Customer-option extractor false positives | Conservative regex (named connectors only); tests with adversarial Arabic prose |

---

# 14. Do-not-do list

- Do NOT hardcode demo products, demo merchants, product pairs, categories, or verticals.
- Do NOT patch only the prompt — every fix needs a deterministic reducer.
- Do NOT rely only on live WhatsApp testing — Wave 5 transcript harness must pass first.
- Do NOT start payment / media-creation / order-creation work until Wave 1 lands.
- Do NOT deploy until: build passes, tests pass, image timestamp updated, container recreated, `dist/` grep proves new code, fresh-conversation live test verified.
- Do NOT reuse old code unless it is generic, tested, and not demo-specific (none qualifies in this case).
- Do NOT treat helper unit tests as enough; the production reply path (`inbox.service` → `dialog-orchestrator` → `llm.service`) must be exercised end-to-end.
- Do NOT clear `dialog.activeChoice` on an unrelated turn — it must follow `open → resolved → closed` transitions tied to actual selections or explicit context switches.
- Do NOT introduce per-turn LLM calls for short-reply resolution (current resolver is deterministic; preserve that).
- Do NOT change the AI-cache behavior on the dialog path; it is not used and should not be added without a structured key including `dialog.activeChoice`, `lastOfferedOptions`, and `purchaseIntentConfirmed`.

---

# 15. Verdict

`ROOT_CAUSE_FOUND_READY_FOR_IMPLEMENTATION`

The architecture is well-built and merchant-agnostic at the boundary level (intent classifier, short-reply resolver, KB visibility, embedding worker, gating). The live "الاتنين stalls forever" failure is fully explained by R1+R2+R5+R8: the system has no `activeChoice` frame, no `OrderAssembler` to write to the cart on resolution, and `SalesStageAdvancer` deterministically falls back to `comparison` whenever ≥2 options exist — which they always do when the resolver carries them forward. Wave 1 closes those four gaps in a single small change.

---

# Critical files referenced

- `/opt/tash8eel/CLAUDE.md`
- `/opt/tash8eel/docs/AI_CLOSER_OPERATING_SYSTEM.md`
- `/opt/tash8eel/docs/ai-closer-notes/ai-reply-rag-audit.md`
- `/opt/tash8eel/apps/api/src/application/dialog/dialog-orchestrator.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/short-reply-resolver.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/option-extractor.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/sales-stage-advancer.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/intent-classifier.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/slot-plan.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/reply-composer.ts`
- `/opt/tash8eel/apps/api/src/application/llm/llm.service.ts`
- `/opt/tash8eel/apps/api/src/application/llm/merchant-context.service.ts`
- `/opt/tash8eel/apps/api/src/application/llm/kb-retrieval.service.ts`
- `/opt/tash8eel/apps/api/src/application/services/rag-retrieval.service.ts`
- `/opt/tash8eel/apps/api/src/application/services/inbox.service.ts`
- `/opt/tash8eel/apps/api/src/application/services/kb-chunk.service.ts`
- `/opt/tash8eel/apps/api/src/application/jobs/embedding.worker.ts`
- `/opt/tash8eel/apps/api/src/infrastructure/cache/ai-cache.service.ts`
- `/opt/tash8eel/apps/api/src/api/controllers/meta-webhook.controller.ts`
- `/opt/tash8eel/apps/api/src/domain/entities/conversation.entity.ts`
- `/opt/tash8eel/apps/api/src/application/services/memory-compression.service.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/__tests__/short-reply.spec.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/__tests__/sales-stage.spec.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/__tests__/conversation-memory.spec.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/__tests__/rag-quality.spec.ts`
- `/opt/tash8eel/apps/api/src/application/dialog/__tests__/human-reply-quality.spec.ts`
