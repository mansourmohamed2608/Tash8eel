# TASH8EEL_PRICING_AUTHORITY

**Status:** Internal pre-pilot pricing authority. Not public.  
**Version:** 1.0  
**Last updated:** 2026-04-15  
**Scope:** Internal pricing, packaging, lane logic, setup-fee policy, caps/overage, and pilot quoting guidance for Tash8heel AI.  
**Authority:** Merges and supersedes:

- `TASH8EEL_PRICING_PACKAGING_v1.docx`
- `TASH8EEL_UNIT_ECONOMICS_AND_PRICING_MODEL.md`
- latest pricing correction assumptions from the pricing audit/correction pass
  Important:
- This file is the current internal pricing authority.
- It is not a public pricing page.
- Exact prices and exact caps are still subject to pilot calibration.
- The **pricing structure** is more stable than the exact **numbers**.

---

## 1. PURPOSE

This file exists to stop pricing drift and pricing chaos.

It defines:

- the correct commercial lanes
- who each lane is for
- what each lane includes and excludes
- the safest floor / target / stretch pricing by lane
- setup-fee policy
- conversation overage logic
- telephony pass-through logic
- what is locked now
- what remains flexible until pilots

This file should guide:

- pilot quoting
- internal sales conversations
- feature-gating thinking
- future implementation planning for billing and subscription UX

It should **not** be used as:

- a public pricing page
- a website rate card
- a final post-pilot pricing truth

---

## 2. CORE PRICING PRINCIPLES

### 2.1 What stays true

1. Tash8heel AI is priced as a serious operational system, not a cheap bot tool.
2. The core chain offer is **branch-based**, not seat-based.
3. Setup/onboarding is real work and must be priced accordingly.
4. Pricing must stay simple enough to explain in one sales conversation.
5. The product should not be forced into a custom quote for every lead.
6. Public pricing is deferred until real pilot/customer proof exists.

### 2.2 What must be protected

1. High-message-volume merchants must not destroy margin.
2. Heavy telephony usage must not be silently bundled.
3. Setup effort must not become free founder labor.
4. Advanced unfinished surfaces must not be sold as if they are mature.
5. The small/online-first buyer must not distort the core chain strategy.

### 2.3 Strategic truth

The product has multiple commercial entry points, but it must remain commercially clean.

The right shape is:

- one **sales-only light lane**
- one **lite operational lane**
- one **core chain family**
- one **custom enterprise lane later**

Not:

- one ladder for everyone
- random bespoke bundles for every lead
- seven public plans

---

## 3. CURRENT COMMERCIAL LANES

### 3.1 Plan name reference

The pricing structure uses:

- one **sales-only lighter lane**
- one **lite operational lane**
- three named **core chain tiers**
- one **enterprise/custom lane later**

| Internal Label | Commercial Name             | Scope                            | Status     |
| -------------- | --------------------------- | -------------------------------- | ---------- |
| Lane A         | — (sales-only light lane)   | channel / KB / AI assistant only | sales-only |
| Lane B         | — (lite merchant lane)      | lighter operational lane         | launchable |
| T1             | TASHGHEEL                   | first chain tier                 | launchable |
| T2             | TAWASSU'                    | second chain tier                | launchable |
| T3             | HAYMANA                     | third chain tier                 | launchable |
| Lane D         | — (enterprise/custom later) | custom / enterprise              | deferred   |

Important:

- Lane B is **not** TASHGHEEL
- TASHGHEEL / TAWASSU' / HAYMANA are reserved for the **core chain family**
- do not hardcode final customer-facing strings in product implementation until naming is fully frozen

## 4. WHAT EACH LANE SHOULD INCLUDE

## 4.1 Lane A — Channel / KB / AI Assistant

### Includes

- unified inbox / conversation handling
- KB
- AI reply assistance
- AI inside-system help where relevant
- basic order capture
- basic customer thread/history
- 1–3 channels depending on deal

### Excludes

- POS
- inventory
- finance
- operations queue
- forecasting
- automations engine
- command center
- HQ governance
- full chain logic

### Commercial role

This is an acquisition lane for lighter buyers.
It is not the flagship product story.

---

## 4.2 Lane B — Lite Merchant

### Includes

- conversations / channels
- KB / internal AI assistance
- basic operations queue
- basic inventory
- basic finance summary
- daily briefing
- optional cashier/POS as add-on
- basic reporting

### Excludes

- Calls by default
- advanced forecasting
- command center
- advanced HQ governance
- advanced campaigns
- advanced automations

### Commercial role

This is the “lighter real system” lane.
It is for merchants who need more than a chat tool, but are not yet full chain OS buyers.

---

## 4.3 T2 — Chain OS Standard

### Includes

- full operations layer
- inventory
- finance
- daily briefing
- AI signals across the system
- calls module with capped inclusion
- reporting
- multi-branch baseline
- stronger admin/operator flows

### Excludes / gates

- command center
- advanced franchise/HQ logic
- unfinished campaigns runtime
- enterprise-specific custom needs

### Commercial role

This is the main serious offer for real operators.

---

## 4.4 T3 — Chain OS Scale

### Includes

- everything in T2
- higher branch allowance
- more conversations/channels
- higher calls allowance
- stronger support/onboarding
- advanced forecasting where mature
- more governance/admin weight

### Still gated

- anything not production-ready
- true enterprise-specific/custom compliance scope

### Commercial role

This is the “control and scale” tier.

---

## 5. LAUNCH RECOMMENDATION

### 5.1 What should be actively sold at launch

Launch with:

- **Lane B**
- **T2**
- **T3**

### 5.2 What should not be public yet

Keep **Lane A** as:

- internal
- sales-handled
- not public on a pricing page
- only used when the buyer is clearly lighter and channel-first

### 5.3 Why

This gives you:

- enough coverage to not lose lighter leads
- enough simplicity to avoid pricing chaos
- enough seriousness to preserve the main chain strategy

---

## 6. FLOOR / TARGET / STRETCH PRICING

These are internal pricing ranges, not public promises.

## 6.1 Lane A — Channel / KB / AI Assistant

| Level   | Price (EGP / month) |
| ------- | ------------------: |
| Floor   |               1,150 |
| Target  |       1,800 – 2,200 |
| Stretch |               2,500 |

### Setup fee

| Type        |             Price |
| ----------- | ----------------: |
| Light setup | 2,000 – 3,500 EGP |

### Notes

- sales-only lane
- not public
- exact caps and included channels still flexible
- can be quoted selectively

---

## 6.2 Lane B — Lite Merchant

| Level   | Price (EGP / month) |
| ------- | ------------------: |
| Floor   |               1,800 |
| Target  |       3,000 – 3,500 |
| Stretch |               4,000 |

### Setup fee

| Type           |             Price |
| -------------- | ----------------: |
| Standard setup | 5,000 – 8,000 EGP |

### Notes

- safest smaller-merchant launch lane
- use this when the buyer needs real system value but not full chain OS

---

## 6.3 T2 — Chain OS Standard

| Level   | Price (EGP / month) |
| ------- | ------------------: |
| Floor   |               3,200 |
| Target  |       5,500 – 6,000 |
| Stretch |       6,500 – 7,500 |

### Setup fee

| Type                 |              Price |
| -------------------- | -----------------: |
| Standard chain setup | 9,000 – 12,000 EGP |

### Notes

- this is the strongest core offer
- branch-based logic remains fundamental

---

## 6.4 T3 — Chain OS Scale

| Level   | Price (EGP / month) |
| ------- | ------------------: |
| Floor   |               5,800 |
| Target  |     10,000 – 11,500 |
| Stretch |     12,000 – 16,000 |

### Setup fee

| Type           |               Price |
| -------------- | ------------------: |
| Advanced setup | 16,000 – 22,000 EGP |

### Notes

- higher complexity
- stronger support burden
- more sensitive to cost-control rules

---

## 7. BRANCH / SCALE RULES

### Lane A

- not branch-based
- lighter account model
- no public multi-branch story

### Lane B

- practical fit: 1–3 branches
- flat monthly pricing is acceptable here
- do not overcomplicate with branch-by-branch billing unless growth forces it

### T2

- chain lane begins here
- multi-branch operator logic
- branch expansion pricing applies

### T3

- higher branch allowance
- enterprise-like expansion pressure starts here

---

## 8. BRANCH CAPS AND EXPANSION PRICING

### 8.1 Branch caps by lane

| Lane           | Included Branches | Pricing Logic          |
| -------------- | ----------------: | ---------------------- |
| Lane A         |  not branch-based | flat account pricing   |
| Lane B         | 1–3 practical fit | flat monthly pricing   |
| T1 — TASHGHEEL |  up to 5 branches | branch-based core tier |
| T2 — TAWASSU'  | up to 10 branches | branch-based core tier |
| T3 — HAYMANA   | up to 20 branches | branch-based core tier |
| Lane D         |        negotiated | custom                 |

Important:

- Lane B remains a lighter flat lane and is not the same thing as T1
- once a merchant clearly needs true multi-branch chain logic, move them into T1/T2/T3

### 8.2 Branch expansion pricing

| Tier           | Per Additional Branch / Month |
| -------------- | ----------------------------: |
| T1 — TASHGHEEL |                 700 – 900 EGP |
| T2 — TAWASSU'  |                 550 – 750 EGP |
| T3 — HAYMANA   |                 400 – 600 EGP |

### 8.3 Sales rule

If a buyer is:

- small, lighter, or online-first → Lane B
- true multi-branch operator needing OS control → T1/T2/T3
- above 20 branches or asking for unusual scope → Lane D conversation

## 8A. PLAN SNAPSHOT — WHAT EACH MERCHANT GETS

### Lane A — Sales-only light lane

**Best for:** merchants who mainly want channel handling, KB, and AI assistance  
**Includes:**

- unified inbox
- KB
- AI reply/help
- light internal AI assistance
- basic order capture
- 1–3 channels (quoted selectively)
- capped conversations

**Does not include:**

- POS
- inventory
- finance
- full operations OS
- calls by default
- forecasting
- command center
- HQ governance

---

### Lane B — Lite Merchant

**Best for:** smaller merchants, online-first operators, lighter 1–3 branch businesses  
**Includes:**

- conversations / channels
- KB
- AI assistant inside the system
- basic operations queue
- basic inventory
- basic finance summary
- daily briefing
- basic reporting
- optional POS add-on

**Does not include:**

- calls by default
- advanced forecasting
- command center
- advanced HQ governance
- advanced campaigns runtime
- advanced automations

---

### T1 — TASHGHEEL

**Best for:** first serious chain step, up to 5 branches  
**Includes:**

- full operations layer
- inventory
- finance
- daily briefing
- AI system support
- reporting
- true branch-based pricing
- capped conversations
- optional / controlled calls depending on final launch rules

**Does not include:**

- command center
- advanced HQ/franchise logic
- unfinished campaign execution
- enterprise custom scope

---

### T2 — TAWASSU'

**Best for:** growing multi-branch operators, up to 10 branches  
**Includes:**

- everything in T1
- stronger multi-branch control
- more included conversations
- calls with capped minutes
- stronger reporting / operational visibility
- more support headroom

**Still gated:**

- command center self-serve
- advanced franchise DSL
- unfinished campaign runtime
- enterprise-only needs

---

### T3 — HAYMANA

**Best for:** larger chain operators, up to 20 branches  
**Includes:**

- everything in T2
- higher branch allowance
- higher conversation allowance
- higher telephony allowance
- stronger governance/admin weight
- advanced forecasting where mature
- strongest onboarding/support level

**Still gated:**

- anything not yet production-ready
- true enterprise-specific compliance/SLA/custom scope

---

## 9. CONVERSATION CAPS / OVERAGE

This is one of the most important protections in the whole pricing model.

### Why

WhatsApp / conversation cost can destroy margin if uncapped.

### Rule

Every active launch lane should have:

- included conversation allowance
- overage mechanism after the cap

### Suggested launch logic

| Lane   | Suggested Included Conversations | Overage Logic                        |
| ------ | -------------------------------: | ------------------------------------ |
| Lane A |         flexible / sales-defined | use pack or per-conversation overage |
| Lane B |                   ~1,200 / month | 400 EGP / 500 extra conversations    |
| T2     |                   ~3,000 / month | 450 EGP / 500 extra conversations    |
| T3     |                   ~6,000 / month | 400 EGP / 500 extra conversations    |

### Important

These are not final permanent numbers.
They are launch-safe placeholders until real usage data exists.

---

## 10. TELEPHONY POLICY

### Default

Telephony is **not assumed active by default** for lighter lanes.

### Provider assumption

- use lower-cost serious provider logic
- model on Telnyx-style cost structure, not high-cost default assumptions

### Commercial rule

Do **not** bundle effectively unlimited telephony into flat pricing.

### Launch-safe policy

- Lane A: no calls by default
- Lane B: no calls by default or optional add-on
- T2: include capped minutes
- T3: include higher capped minutes

### Overage / pass-through

Above included minutes:

- pass through cost
- or apply capped markup logic

---

## 11. WHAT IS BUNDLED VS PASS-THROUGH

## 11.1 Bundle into subscription

- internal AI usage
- daily briefing
- KB usage within normal usage
- standard operations usage
- standard reporting
- standard onboarding hours per lane
- standard infrastructure cost

## 11.2 Pass-through / overage / add-on

- conversation overage
- telephony overage
- extra conversation channels
- extra POS terminals
- premium onboarding
- future campaigns outbound cost when relevant

## 11.3 Never do this

- do not meter internal AI in a scary customer-facing way
- do not turn the product into a seat-metered mess
- do not make “AI power” a separate add-on tier

---

## 12. ADD-ON STRUCTURE

### Add-ons that should exist

| Add-On                         | Price Direction                                  |
| ------------------------------ | ------------------------------------------------ |
| Extra POS terminal             | 300 – 500 EGP / month                            |
| Extra conversation channel     | 400 – 700 EGP / month                            |
| Calls module for lighter lanes | 800 – 1,200 EGP / month + telephony pass-through |
| Premium onboarding             | 400 – 600 EGP / hour above standard              |
| Conversation overage packs     | priced per pack / cap logic                      |

### Add-ons that should not exist

- per-user seat pricing
- “AI premium mode” pricing
- micro-priced automations
- chaotic feature unlock add-ons for everything

---

## 13. PILOT POLICY

### General rule

- no free trials
- no open-ended pilots
- human-led pilot motion only

### Default pilot rule

- 90 days
- 50% subscription rate
- setup fee still applies, though can be deferred

### Lighter lane flexibility

Lane A may use a shorter/lighter pilot if needed, but do not turn it into free use.

### What must happen before pilot ends

- conversion discussion before the end
- no surprise at day 89
- reference value should be pursued if the pilot succeeds

---

## 14. WHAT IS LOCKED NOW

The following should be treated as current internal truth:

1. core chain pricing remains branch-based
2. setup fee discipline stays
3. no free trial
4. no public pricing yet
5. conversation caps / overage are mandatory
6. telephony pass-through or caps are mandatory
7. Lane A exists, but is sales-only for now
8. launch focus should be Lane B + T2 + T3
9. exact prices remain internal and calibratable

---

## 15. WHAT REMAINS FLEXIBLE UNTIL PILOTS

Do not over-lock these yet:

- exact EGP price points
- exact included conversation caps
- exact branch caps for the lighter lanes
- exact telephony allowance numbers
- exact Lane A commercial shape
- exact annual discount depth
- exact setup fee inside the allowed ranges
- whether Lane B later becomes more branch-based

---

## 16. WHEN PRICES MAY CHANGE LATER

The pricing **structure** should stay more stable than the **numbers**.

Prices may change when:

1. pilots show stronger willingness to pay
2. support/onboarding burden is heavier than expected
3. messaging usage is lighter or heavier than expected
4. the product becomes clearly more valuable
5. advanced modules become truly sellable
6. costs become clearer from real usage

### Practical rule

Do not change the whole architecture casually.
More likely:

- keep the lanes
- adjust the numbers
- adjust caps
- tighten setup/support rules

---

## 17. SAFEST MINIMUM VIABLE LAUNCH PRICING

If you had to operate with one internal quoting baseline now:

### Lane B

- 3,000 – 3,500 EGP / month
- 5,000 – 7,000 EGP setup
- lighter operational buyer
- no calls by default

### T2

- 5,500 – 6,000 EGP / month
- 9,000 – 12,000 EGP setup
- 3-branch-ish serious operator
- calls capped
- conversation cap enforced

### T3

- 10,000 – 11,500 EGP / month
- 16,000 – 22,000 EGP setup
- more complex operator
- stronger support burden
- conversation and telephony protection enforced

### Lane A

- quote selectively
- 1,800 – 2,200 EGP / month
- 2,000 – 3,500 EGP setup
- not public yet

---

## 18. FINAL GUIDING PRINCIPLE

Tash8heel should not price blindly from “what sounds good,” and it should not price purely from abstract market comparisons either.

The right model is:

- strong commercial structure
- realistic low-end cost assumptions
- hard protection against usage blowups
- pilot-based calibration of the exact numbers

### In plain words

The goal now is not to find the one perfect permanent price.

The goal now is to launch with:

- a sane structure
- sane floors
- sane targets
- protection rules
- and enough flexibility to learn from the first real pilots without breaking margin or credibility.

## 19. SAFEST MINIMUM VIABLE LAUNCH PRICING

### Lane A — Sales-only light lane

- 1,800 – 2,200 EGP / month
- 2,000 – 3,500 EGP setup
- 1,000 – 2,000 conversations / month included
- no calls by default
- not public
- quoted selectively

### Lane B — Lite Merchant

- 3,000 – 3,500 EGP / month
- 5,000 – 8,000 EGP setup
- lighter merchant / online-first / 1–3 branch fit
- ~1,200 conversations / month included
- no calls by default
- optional POS add-on

### T1 — TASHGHEEL

- 4,000 – 4,800 EGP / month
- 6,000 – 9,000 EGP setup
- up to 5 branches included
- 2,000 – 2,500 conversations / month included
- branch expansion: 700 – 900 EGP / branch / month
- calls optional or capped depending on final launch decision

### T2 — TAWASSU'

- 5,500 – 6,500 EGP / month
- 8,000 – 15,000 EGP setup
- up to 10 branches included
- ~3,000 conversations / month included
- branch expansion: 550 – 750 EGP / branch / month
- calls: ~200–400 minutes / month included
- telephony pass-through above cap

### T3 — HAYMANA

- 10,000 – 11,500 EGP / month
- 16,000 – 22,000 EGP setup
- up to 20 branches included
- ~6,000 conversations / month included
- branch expansion: 400 – 600 EGP / branch / month
- calls: ~500–1,000 minutes / month included
- telephony pass-through above cap
- strongest support burden and strongest protection rules

### Annual commitment baseline

- 2 months free (~16% effective discount)
- not stackable with pilot pricing
