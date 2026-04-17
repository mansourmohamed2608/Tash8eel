# TASH8EEL_KB_RAG_SCHEMA

Last updated: 2026-04-15

Purpose:
This document defines the generic KB / retrieval / routing architecture for Tash8heel AI so the SaaS can support many merchant types without hardcoding one business vertical into the assistant.

Important:

- This is a SaaS-wide architecture document, not a single-merchant prompt
- Merchant behavior should come from data, rules, retrieval, and live systems
- Do not try to solve everything with one giant prompt
- Separate static knowledge, structured business data, and live operational data

---

## 1. CORE PRINCIPLE

Tash8heel AI should behave like:

**generic assistant engine + merchant-specific knowledge + live operational context**

Not:

- one hardcoded restaurant bot
- one painter-specific bot
- one giant prompt with all business logic pasted into it

The assistant must adapt through:

- merchant profile
- catalog / services
- business rules
- FAQ / examples
- enabled modules
- live data
- escalation policies

---

## 2. KNOWLEDGE LAYERS

Tash8heel should use 3 knowledge layers.

### Layer 1 — Static KB

Used for:

- FAQs
- policies
- supported / unsupported requests
- refund / cancellation rules
- delivery rules
- business descriptions
- general procedures
- escalation guidance

### Layer 2 — Structured Business Data

Used for:

- catalog / services
- prices
- variants
- categories
- sizes / colors / options
- availability rules
- supported customizations
- unsupported customizations
- branch/module configuration

### Layer 3 — Live Operational Data

Used for:

- order status
- inventory counts
- transaction/payment state
- customer history
- branch data
- support/conversation state
- usage/cap state
- telephony events
- active escalations

---

## 3. HIGH-LEVEL FLOW

Before answering, the assistant should decide:

1. Can this be answered from static KB?
2. Does it need structured business data?
3. Does it need live operational data?
4. Does it need image analysis?
5. Does it need OCR?
6. Does it need voice transcription?
7. Does it need human escalation?

This routing step matters more than just adding more KB content.

---

## 4. TENANT / MERCHANT PROFILE SCHEMA

Each merchant should have a structured profile.

Suggested fields:

- merchant_id
- business_name
- business_type
- country
- city
- timezone
- working_hours
- languages
- tone_of_voice
- channels_enabled
- modules_enabled
- delivery_zones
- payment_methods
- refund_policy_summary
- escalation_policy
- image_analysis_enabled
- OCR_enabled
- voice_notes_enabled
- AI_features_enabled
- pricing_visibility_rules
- branch_count
- has_POS
- has_inventory
- has_finance
- has_calls
- has_forecasting
- has_command_center
- created_at
- updated_at

Purpose:
This profile helps route the assistant correctly and prevents unsupported features from appearing.

---

## 5. CATALOG / SERVICES SCHEMA

Every merchant should be able to define what they sell in structured data.

Suggested fields per item/service:

- item_id
- merchant_id
- item_type
  - product
  - service
  - custom_job
- category
- subcategory
- title
- description
- short_description
- price_base
- price_rules
- currency
- variants
- options
- availability_status
- stock_status
- branch_availability
- supported_customizations
- unsupported_customizations
- requires_manual_review
- tags
- search_keywords
- reference_images
- linked_FAQ_ids
- linked_policy_ids
- created_at
- updated_at

Important:
Do not hide catalog truth only in free text.
Key business facts must be queryable as structured fields.

---

## 6. BUSINESS RULES / POLICY SCHEMA

This layer tells the assistant what the merchant can and cannot do.

Suggested rule groups:

### Supported / unsupported

- can_do
- cannot_do
- manual_review_required_for

### Quote / pricing logic

- quote_required_cases
- fixed_price_cases
- custom_price_cases
- rush_order_rules
- upsell_rules

### Fulfillment / delivery

- delivery_rules
- delivery_zones
- pickup_rules
- same_day_rules
- lead_time_rules

### Order / payment

- payment_methods
- deposit_rules
- COD_rules
- order_confirmation_rules
- cancellation_rules
- refund_rules

### Inventory / finance

- inventory_visibility_rules
- finance_visibility_rules
- low_stock_action_rules
- pricing_approval_rules

### Escalation

- always_escalate_conditions
- low_confidence_escalation_conditions
- image_review_escalation_conditions
- compliance_or_risk_escalation_conditions

Suggested metadata:

- rule_id
- merchant_id
- rule_type
- rule_name
- rule_description
- condition
- action
- confidence_required
- human_review_required
- status
- created_at
- updated_at

---

## 7. FAQ + GOLDEN ANSWERS SCHEMA

FAQs are not enough by themselves, but they help a lot.

Suggested fields:

- faq_id
- merchant_id
- question_patterns
- approved_answer
- answer_style_notes
- tags
- confidence_notes
- escalation_if_unsure
- locale
- created_at
- updated_at

Golden-answer examples should also exist for:

- how the merchant wants to sound
- good short answers
- good upsell answers
- careful boundary-setting answers
- unavailable-item answers
- escalation answers

---

## 8. CONVERSATION PLAYBOOKS SCHEMA

These are reusable scenario flows.

Suggested playbooks:

- customer knows exactly what they want
- customer is unsure
- customer sends image
- customer sends voice note
- customer asks price
- customer asks timing
- unavailable request
- complaint / support issue
- refund / cancellation request
- custom quote request

Suggested fields:

- playbook_id
- merchant_id or global_template_id
- trigger_type
- intent_type
- opening_question_sequence
- recommended_followups
- data_to_collect
- safe_response_patterns
- escalation_conditions
- success_condition
- created_at
- updated_at

---

## 9. LIVE OPERATIONAL DATA CONTRACTS

Do not dump live operational truth into static KB chunks.

Use live system queries or service contracts for:

- orders
- order_items
- order_status
- payments
- inventory quantities
- stock alerts
- customer history
- branch status
- team assignment
- conversation counts
- telephony minutes
- active caps/usage
- invoice / subscription state if needed internally

The assistant should fetch live data only when necessary.

---

## 10. RETRIEVAL CHUNKING RULES

For static KB content:

### Good chunk types

- policy chunk
- FAQ chunk
- supported/unsupported capability chunk
- category explainer chunk
- escalation chunk
- delivery/payment chunk

### Avoid

- giant mixed paragraphs
- chunks that contain unrelated policies
- chunks that mix multiple merchants
- chunks without metadata
- chunks that bury important rule boundaries

### Chunk design rule

Each chunk should answer one clear business question or one policy boundary.

---

## 11. REQUIRED METADATA ON EVERY KB CHUNK

Every chunk should carry:

- merchant_id
- source_type
- business_type
- module
- category
- locale
- visibility
- confidence_level
- requires_manual_review
- tags
- last_updated
- source_reference

Suggested source_type values:

- faq
- policy
- product_rule
- playbook
- delivery_rule
- payment_rule
- escalation_rule
- style_rule
- support_rule

---

## 12. ROUTER DECISION MODEL

The assistant should internally classify every incoming request into one or more paths:

### Path A — static KB only

Use when:

- general questions
- FAQ
- policies
- support boundaries
- supported / unsupported explanation

### Path B — structured business data

Use when:

- product/service lookup
- pricing lookup
- category guidance
- branch/module rules
- availability logic

### Path C — live operational data

Use when:

- order status
- stock check
- payment status
- customer history
- usage / caps

### Path D — image analysis

Use when:

- customer sends product/style/reference photo
- merchant supports image handling

### Path E — OCR

Use when:

- customer sends screenshot / invoice / written text image
- system needs text extraction

### Path F — voice note flow

Use when:

- customer sends voice note
- system transcribes and routes into normal logic

### Path G — escalate to human

Use when:

- low confidence
- unsupported request
- custom quote/manual approval
- risk/compliance issue
- business rule conflict

---

## 13. IMAGE ANALYSIS PATTERN

Image understanding should be a reusable SaaS feature, not tied to one merchant type.

Flow:

1. receive image
2. classify likely category / style / object
3. compare against merchant taxonomy and rules
4. decide:
   - supported
   - unsupported
   - uncertain
   - needs manual review
5. respond carefully

Important:

- “looks like” is not the same as “confirmed supported”
- do not let image classification override merchant rules
- confidence-aware language must be used

---

## 14. OCR PATTERN

OCR flow:

1. extract text
2. normalize text
3. identify intent/entity
4. route through standard business logic
5. escalate if the extracted text affects risky decisions

Use OCR for:

- screenshots
- labels
- basic documents
- text on customer-uploaded references

Do not trust OCR blindly for:

- finance decisions
- compliance-sensitive actions
- high-risk confirmations without validation

---

## 15. VOICE NOTE PATTERN

Voice-note flow:

1. transcribe
2. summarize intent
3. identify entities
4. route through same logic as typed text
5. reply or escalate

Important:
Voice should not become a separate business logic world.
It should feed the same assistant rules.

---

## 16. CONFIDENCE + ESCALATION MODEL

Every meaningful AI action should map internally to:

- high confidence
- medium confidence
- low confidence
- escalate

### High confidence

Proceed normally

### Medium confidence

Proceed with one confirming question if needed

### Low confidence

Do not commit; ask clarifying question or escalate

### Escalate

Hand to human or workflow queue

---

## 17. MULTI-BUSINESS SUPPORT RULE

The same architecture must work for:

- painters
- restaurants
- clothing stores
- furniture sellers
- pharmacies
- flowers/gifts
- other merchant types

That means:

- merchant-specific behavior must come from config and knowledge
- not from hardcoded prompt branches for each business type

---

## 18. IMPLEMENTATION RULES

1. Keep KB, rules, and live data separate.
2. Route first, answer second.
3. Use structured data for anything operationally important.
4. Store good example replies.
5. Log:
   - retrieval path used
   - escalation reason
   - confidence band
   - merchant/module context
6. Prefer reusable schemas over vertical-specific hacks.

---

## 19. MINIMUM CONTENT EVERY MERCHANT SHOULD PROVIDE

Every merchant onboarding should at least provide:

- business summary
- products/services
- prices or quote rules
- supported / unsupported requests
- delivery / payment rules
- FAQs
- escalation boundaries
- tone of voice
- examples of good replies

Without that, the assistant quality will always be unstable.

---

## 20. FINAL RULE

Tash8heel AI should behave like a generic merchant assistant platform whose behavior is shaped by:

- merchant profile
- merchant knowledge
- merchant rules
- live business state

not by hardcoded industry prompts.
