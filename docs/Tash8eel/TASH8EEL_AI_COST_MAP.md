# TASH8EEL_AI_COST_MAP

Last updated: 2026-04-15

Purpose:
This file maps Tash8heel AI features to the recommended model/provider path and gives a practical cost/risk view for implementation and pricing decisions.

Important:

- This is an internal planning document.
- It is not billing truth.
- Costs must be recalibrated with real pilot usage.
- Default policy: use the cheapest model that safely does the job.

---

## 1. PRINCIPLES

1. Default to low-cost models for routine work.
2. Use heavier models only for genuinely harder tasks.
3. Do not treat all AI usage as “customer replies.”
4. Internal AI work matters too:
   - summaries
   - KB answers
   - anomaly surfacing
   - forecasting explanations
   - order/support suggestions
5. Messaging and telephony are often bigger margin risks than model cost.
6. Do not expose scary AI metering to customers unless absolutely necessary.

---

## 2. CURRENT DEFAULT MODEL POLICY

### Primary production model

- **GPT-4o mini**

### Secondary/heavier model

- **GPT-4o**
- use only for:
  - harder reasoning
  - ambiguous image interpretation
  - complex synthesis
  - rare higher-stakes cases

### Voice transcription default

- **gpt-4o-mini-transcribe**

### OCR / image analysis default

- **GPT-4o mini with image input**

### Guideline

Target operational mix:

- **85–95%** of tasks on **4o mini**
- **5–15%** of tasks on **4o**

---

## 3. FEATURE-TO-MODEL MAP

| Feature                                | Default Model          | Fallback / Premium                       | Cost Risk  | Commercial Treatment |
| -------------------------------------- | ---------------------- | ---------------------------------------- | ---------- | -------------------- |
| Customer reply drafting                | GPT-4o mini            | GPT-4o                                   | Low        | bundled              |
| KB answer generation                   | GPT-4o mini            | GPT-4o                                   | Low        | bundled              |
| Daily briefing generation              | GPT-4o mini            | GPT-4o for multi-branch harder synthesis | Low        | bundled              |
| Order summary / note condensation      | GPT-4o mini            | none usually                             | Very low   | bundled              |
| OCR / image reading                    | GPT-4o mini vision     | GPT-4o                                   | Low–medium | bundled              |
| Image classification vs merchant rules | GPT-4o mini vision     | GPT-4o                                   | Low–medium | bundled              |
| Voice note transcription               | gpt-4o-mini-transcribe | gpt-4o-transcribe                        | Low        | bundled              |
| Voice note summary / action extraction | GPT-4o mini            | GPT-4o                                   | Low        | bundled              |
| Anomaly explanation                    | GPT-4o mini            | GPT-4o                                   | Low        | bundled              |
| Forecast explanation text              | GPT-4o mini            | GPT-4o                                   | Low        | bundled              |
| Internal copilot suggestions           | GPT-4o mini            | GPT-4o                                   | Low        | bundled              |
| Human escalation summary               | GPT-4o mini            | GPT-4o                                   | Low        | bundled              |
| Future campaign copy                   | GPT-4o mini            | GPT-4o                                   | Low        | gated/add-on later   |

---

## 4. CURRENT COST ASSUMPTIONS

These are internal planning assumptions only.

### Text models

- 4o mini is the default cost baseline
- 4o is expensive enough that it should not be the default for normal traffic

### Voice

- mini transcription is cheap enough to bundle at normal usage

### OCR / image analysis

- usually cheap-to-moderate at normal merchant usage
- exact cost depends on:
  - image count
  - image size
  - prompt length
  - answer length

### Biggest cost risks

More likely to hurt margin than AI token usage:

1. WhatsApp / channel volume
2. Telephony
3. Founder onboarding/support time
4. Feature misuse by heavy merchants without caps

---

## 5. RECOMMENDED COMMERCIAL TREATMENT

### Bundle by default

These should normally be bundled:

- standard AI replies
- KB retrieval answers
- summaries
- OCR on normal usage
- image understanding on normal usage
- voice note transcription on normal usage
- internal AI helper features

### Protect operationally, not publicly

If usage becomes unusually heavy:

- rate-limit
- queue
- escalate to human
- move merchant to higher lane
- use overage or commercial renegotiation only if needed

### Do not publicly meter these early

Avoid public pricing language like:

- “X AI tokens”
- “Y AI credits”
- “Z OCR scans”

Customers should buy the product outcome, not a confusing AI bill.

---

## 6. COST RISK BY LANE

### Lane A — Channel / KB / AI Assistant

- AI cost risk: low
- messaging cost risk: medium
- telephony risk: none unless added
- best rule: keep cap on conversations

### Lane B — Lite Merchant

- AI cost risk: low
- messaging risk: medium
- ops complexity: moderate
- best rule: bundle AI, protect via lane boundaries

### T1 / T2 / T3 — Chain family

- AI risk: still manageable
- messaging risk: higher
- telephony risk: meaningful when enabled
- best rule:
  - caps
  - pass-through above thresholds
  - no fake unlimited usage

---

## 7. IMPLEMENTATION RULES

1. Every AI feature should declare:
   - model
   - fallback model
   - timeout behavior
   - escalation behavior
2. Avoid one giant agent doing everything.
3. Separate:
   - classification
   - retrieval
   - answer generation
   - action suggestion
4. For image analysis:
   - detect
   - compare to merchant rules
   - respond with confidence-aware wording
5. For voice notes:
   - transcribe
   - summarize
   - then route into the same business logic as text
6. Keep logging for:
   - task type
   - model used
   - error rate
   - escalation rate
   - approximate usage volume

---

## 8. WHAT MUST BE MONITORED AFTER PILOTS START

Track per merchant:

- number of messages handled
- number of AI calls
- OCR/image events
- voice-note minutes
- fallback-to-4o rate
- human escalation rate
- average reply length
- highest-cost merchants
- AI error/uncertainty patterns

---

## 9. FINAL RULE

Tash8heel should win by:

- useful workflow automation
- good KB/retrieval
- safe decision rules
- merchant-specific behavior

not by running the most expensive model on everything.
