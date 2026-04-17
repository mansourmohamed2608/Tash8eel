# CLAUDE.md

## Project identity

Tash8heel AI is an AI-driven merchant operating system / Operations OS.
It is not a generic AI chatbot SaaS, not a WhatsApp-only tool, and not a decorative copilot dashboard.

The product must support multiple merchant types through:

- merchant configuration
- catalog/service data
- business rules
- KB / retrieval
- live operational data
- escalation policies

Do not hardcode one vertical into the system.

---

## Source-of-truth documents

Always use these files as primary context before making major product, UI, AI, or pricing decisions:

- TASH8EEL_LOCKED_DECISIONS.md
- TASH8EEL_WORKING_BLUEPRINT.md
- TASH8EEL_IMPLEMENTATION_SPEC.md
- TASH8EEL_REPO_STATE_SUMMARY.md
- TASH8EEL_POSITIONING_PRODUCT_IDENTITY.md
- TASH8EEL_BRAND_COLOR_SYSTEM.md
- TASH8EEL_BRAND_IDENTITY_PACKAGE.md
- TASH8EEL_PRICING_AUTHORITY.md
- TASH8EEL_KB_RAG_SCHEMA.md
- TASH8EEL_AI_COST_MAP.md
- TASH8EEL_MERCHANT_EXAMPLES.md
- TASH8EEL_AI_BEHAVIOR_RULES.md

If repo reality conflicts with docs:

1. detect the conflict explicitly
2. explain it clearly
3. propose the safest implementation path
4. do not silently ignore the docs

---

## Core product truths

- Primary lead positioning: all-in-one merchant operating system
- AI is the intelligence layer working in the background
- AI brain/control plane is real, but should be surfaced through useful outcomes, not decorative chrome
- Core chain family pricing names are:
  - TASHGHEEL
  - TAWASSU'
  - HAYMANA
- Lane A is sales-only and not public
- Lane B is a lighter operational lane and is not the same as TASHGHEEL
- Pricing is internal/pre-pilot and must not be turned into a public rate card unless explicitly requested

---

## UI / UX rules

- Do not generate generic AI startup UI
- Do not use the old black/gold-heavy product style
- Default product visual system is warm off-white light mode
- Brand direction is operational blue with structured semantic colors
- Amber is warning only, not brand
- Teal is AI meaning only, not general accent
- Arabic-first and RTL-native by default
- Sidebar/navigation must reflect an Operations OS, not a feature dump
- Tables, queues, clarity, and seriousness beat flashy dashboards
- AI should be shown through recommendations, summaries, anomaly flags, and actions — not vague “AI is active” widgets

---

## Architecture rules

- Prefer refactor / completion over blind rewrite
- Preserve real business logic when possible
- Gate unfinished features honestly instead of faking completeness
- Keep strong separation between:
  - generic assistant engine
  - merchant-specific knowledge/rules
  - live transactional data
- Do not hardcode merchant-specific business behavior in prompts if it should come from data/config
- Image analysis, OCR, and voice-note support should be generic SaaS capabilities, not tied to one business type

---

## KB / RAG rules

The assistant architecture should use three knowledge layers:

1. Static KB
   - FAQ
   - policies
   - supported/unsupported requests
   - business descriptions
   - procedures

2. Structured business data
   - catalog
   - services
   - variants
   - pricing rules
   - branch/module configuration

3. Live operational data
   - orders
   - inventory
   - payments
   - customer history
   - usage state

Do not try to solve everything by stuffing more text into prompt context.
Use routing:

- static KB
- structured data
- live data
- image analysis
- OCR
- escalation

---

## AI behavior rules

- Never invent unavailable products/services/styles
- Ask clarifying questions when user intent is ambiguous
- Use merchant rules before making commitments
- If confidence is low, escalate instead of hallucinating
- Image analysis should classify and compare against merchant rules
- OCR should extract data, then route through normal business logic
- Voice notes should be transcribed, summarized, and then processed under the same policy rules
- Default low-cost model path should be used unless a heavier model is truly needed
- Internal AI features should feel useful and grounded, not magical

---

## Pricing / plan rules

- Respect `TASH8EEL_PRICING_AUTHORITY.md`
- Do not invent public pricing pages unless explicitly asked
- Do not ignore:
  - setup fee discipline
  - conversation caps / overage
  - telephony caps / pass-through
  - gated/unfinished features
- Lane A is sales-only
- Lane B is lighter ops
- TASHGHEEL / TAWASSU' / HAYMANA are the real chain family
- Command Center is gated and must not be surfaced casually if not ready

---

## Implementation priorities

When making major changes, prioritize in this order:

1. repo truth / architecture safety
2. layout / navigation / theme / RTL correctness
3. operational core flows
4. generic AI assistant architecture
5. KB / RAG scaffolding
6. pricing / gating surfaces
7. advanced AI-brain surfaces
8. polish and secondary features

---

## Execution style

For complex work:

- analyze first
- map gaps against source-of-truth docs
- propose bounded implementation waves
- prefer integrated slices over fake broad completeness

After changes:

- list files changed
- say what was implemented
- note what remains
- run validation where appropriate

Do not restart discovery every turn unless asked.

---

## What not to do

- do not create generic AI dashboard aesthetics
- do not hardcode one merchant vertical
- do not publish unfinished features in UI as if they are live
- do not invent pricing logic outside pricing authority
- do not replace operational seriousness with decorative design
- do not drift away from Arabic-first / RTL-native behavior
