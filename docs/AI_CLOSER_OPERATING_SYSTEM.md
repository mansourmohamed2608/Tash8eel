# Tash8eel AI Closer Operating System

## 1. Product Goal

The Tash8eel AI is not a FAQ bot and not a basic support assistant.

The AI should replace the human sales closer/operator/manager inside the merchant workflow.

It should be able to:
- answer customer questions
- understand short WhatsApp replies
- remember conversation context
- recommend products
- compare options
- handle objections
- quote prices
- calculate totals
- collect missing order details
- create an order draft
- confirm with the customer
- create the final order inside the system
- update conversation/order/customer state
- continue follow-up after order creation

There should be no default human handover flow.

If the AI lacks information, it asks one clear question.
If a tool fails, it reports the exact operational problem and preserves the customer/order context.
If payment cannot be completed in-system, it creates the order as pending payment or according to configured merchant rules.

---

## 2. Core Principle

The AI must act as a real commerce operator.

It should not only generate text. It must use system tools and backend services to complete work.

Core chain:

customer message
→ conversation memory
→ short-reply resolution
→ catalog/KB retrieval
→ sales-stage decision
→ reply or action
→ order draft / order creation
→ persisted state

---

## 3. Conversation Memory

The AI must not rely only on the latest message.

The prompt/context should include:
- latest customer message
- structured memory/slots
- short-reply resolution result
- last 16–20 recent messages verbatim
- older summary if conversation is long
- relevant KB/catalog context

Do not pass the full conversation forever.

For long conversations:
- keep recent messages verbatim
- summarize older messages
- keep structured slots as durable truth
- refresh summary periodically
- do not let summary generation block replies

---

## 4. Short-Reply Intelligence

The AI must understand short WhatsApp replies using prior context.

Examples:
- تمام
- ماشي
- اه
- أيوه
- نعم
- لا
- قولي
- ايوه قولي
- الاثنين
- الاتنين
- both
- all
- الأول
- التاني
- 150
- 200
- مصر الجديدة
- الأسبوع الجاي
- 👍
- ❤️

Short replies must be interpreted using:
- previous assistant question
- pending slot
- pending question type
- last offered options
- last proposal
- last recommendation
- last quoted items
- current conversation memory

The AI must not ask the same question again after a short reply answered it.

This must be generic and merchant-agnostic.

Do not hardcode demo products, demo businesses, product pairs, or verticals.

---

## 5. Option Extraction

After every assistant reply, the system should extract and persist:

- last offered options
- pending question type
- pending slot
- last proposal
- last recommendation
- last quoted items
- last requested confirmation

This allows the next short customer reply to be understood.

Example:
Assistant offers: “Option A or Option B?”
Customer replies: “الاثنين”

The AI should know the customer means both recently offered options.

---

## 6. Structured Memory / Slots

Universal base slots are allowed globally:

- business_type
- customer_intent
- product_interest
- quantity
- budget
- delivery_area
- deadline
- payment_state
- closing_stage

Custom slots must be merchant-defined and data-driven.

They may come from:
- merchant sales playbooks
- slot_graph
- constraint_dims
- catalog categories/tags/options
- KB metadata
- merchant configuration/profile

If no custom slot schema exists, fall back to universal slots only.

Do not hardcode merchant-specific custom slots in production code.

---

## 7. Context Stickiness

The AI must keep context stable.

Neutral messages must not change context by themselves.

Examples:
- السعر كام؟
- متاح؟
- بكام؟
- كام؟
- موجود؟
- delivery?
- price?
- ok
- yes
- no
- تمام

If context is already known, neutral messages should stay in that context.

Only switch context when the customer gives a strong explicit new signal.

---

## 8. Sales Stage Tracking

The AI should track the current stage of the sale.

Suggested stages:
- discovery
- qualification
- recommendation
- comparison
- objection_handling
- quote
- order_draft
- confirmation
- order_created
- payment_or_delivery_next_step
- followup

The AI should not stay in qualification forever.

It should progress toward order creation.

---

## 9. Commerce Action Layer

The AI must be able to do real system actions, not only chat.

Required actions:
- catalog search
- availability check
- price lookup
- total calculation
- customer profile create/update
- order draft create/update
- add order items
- set quantity/options
- set delivery/payment fields
- final order creation after confirmation
- order notes/conversation notes

Use existing domain services and APIs where possible.
Do not duplicate order logic if a manual order service already exists.

---

## 10. Confirmation Rules

The AI can create an order only after enough required fields are known:

- customer identity/channel
- selected product/items
- quantity
- selected options/variants
- delivery or pickup requirement
- delivery area/address if delivery
- quoted total or estimate
- payment/deposit rule if applicable
- explicit customer confirmation

If required fields are missing:
- ask one clear missing question
- do not ask many questions at once
- continue the sale

---

## 11. No Human Handover Default

The AI should not default to human handover.

If uncertain:
- ask one clarifying question

If a tool fails:
- retry safely or explain the exact operational issue

If payment cannot be completed:
- create the order as pending payment or according to merchant rules

If media understanding is unavailable:
- ask the customer to describe the image or send text details

Do not say “someone from the team will reply” unless a product policy explicitly allows it.

---

## 12. Reply Quality Rules

The AI should sound like a real closer/operator.

It should:
- answer first
- ask one useful next question
- avoid repeating questions already answered
- avoid asking 4 questions at once
- summarize known details when useful
- use exact catalog/KB prices when available
- compare options when relevant
- recommend the best option when the customer is unsure
- handle budget objections
- calculate examples/totals
- move toward order confirmation
- create orders after confirmation

Bad:
“محتاج تفاصيل أكتر.”

Better:
“تمام ❤️ بناءً على اللي قلته، أنسب اختيار هو كذا لأنه يوازن بين السعر والشكل. السعر كذا، ولو هنمشي على عدد 150 يبقى الإجمالي التقريبي كذا. تحب أأكدلك على ده ولا تحب أشوفلك بديل أوفر؟”

---

## 13. Testing Strategy

Test one active demo business at a time.

For demo testing:
- keep one active demo dataset
- disable/archive unrelated demo KB/catalog from retrieval
- clear old test conversation memory if needed
- test until the AI can close and create orders
- then swap to the next demo dataset

This is a demo data strategy only.
Production code must remain merchant-agnostic.

---

## 14. Required Tests

Tests should fail if:
- reply is generic despite enough context
- AI asks repeated questions
- AI ignores short replies
- AI ignores catalog/KB prices
- AI drifts context on neutral messages
- AI asks for already known data
- AI fails to create an order after confirmation
- AI only returns text when an order action is required

Required flows:
1. short-reply option resolution
2. context stickiness
3. product comparison
4. price quote
5. budget objection
6. quantity capture
7. delivery/location capture
8. order draft creation
9. final order creation
10. order visible in merchant orders

---

## 15. No-Hardcoding Rules

Production services must not hardcode:
- demo business names
- demo product names
- fixed vertical enum
- fixed product pairs
- merchant-specific slot names

Allowed hardcoding:
- universal conversation concepts
- generic language patterns for short replies
- generic sales stages
- generic confirmation rules

Demo-specific behavior belongs only in:
- seed data
- catalog data
- KB data
- playbook/config data

---

## 16. Build / Validation

After each backend wave:

Run:
npm run build -w apps/api

Run relevant tests.

If host shell cannot resolve Docker hostnames like postgres, run tests inside Docker Compose network.

Deploy only after:
- build passes
- tests pass
- API healthy
- worker healthy
- live WhatsApp test passes
