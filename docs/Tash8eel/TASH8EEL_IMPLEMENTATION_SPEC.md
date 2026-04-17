# TASH8EEL_IMPLEMENTATION_SPEC

Version: 1.1
Status: Implementation handoff draft
Last updated: 2026-04-14

Source authority:

- TASH8EEL_LOCKED_DECISIONS.md
- TASH8EEL_WORKING_BLUEPRINT.md
- Repo/completeness audits

Language default:
Arabic (RTL). All screen labels in Arabic. English only in technical/code references.

Important:

- Any pricing tier naming or gating in this file is placeholder until pricing/packaging is finalized.
- Any timeline in this file is an ordering guide, not a committed schedule.
- Onboarding structure in this file is a working hypothesis, not a locked decision.

---

## SECTION 1 — FINAL PRODUCT STRUCTURE SUMMARY

### 1.1 Product Architecture Summary

Tash8heel AI is structured in five functional layers:

| Layer                        | What it does                                                            | Primary home in product                                |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| AI Brain / Control Plane     | Plans, orchestrates, approves, surfaces anomalies, triggers automations | Command Center + embedded signals across modules       |
| Operational Core             | Daily merchant work: orders, cashier, inventory, finance                | Operations, POS, Inventory, Finance                    |
| Channel & Intelligence Layer | Customer-facing channels + growth intelligence                          | Conversations, Calls, Customers/Campaigns, Forecasting |
| Automation Layer             | Rule engine, playbooks, scheduled jobs                                  | Automations                                            |
| Governance & Config Layer    | Roles, branches, settings, integrations, billing                        | Settings, HQ Governance                                |

The product is not a chatbot, not a CRM-first SaaS, and not a WhatsApp tool.
It is a merchant operating system where AI works in the background and surfaces as consequences, not decorations.

### 1.2 Primary User Types

| User type          | Arabic role label | Primary need                                                           |
| ------------------ | ----------------- | ---------------------------------------------------------------------- |
| Owner / Founder    | صاحب العمل        | Daily briefing, financial health, AI recommendations, approval control |
| Operations Manager | مدير العمليات     | Order queue, delivery ops, branch health, escalations                  |
| Branch Manager     | مدير الفرع        | Branch-level ops, staff, local POS/inventory                           |
| Cashier            | الكاشير           | POS session, fast transaction mode                                     |
| Finance / Admin    | المحاسب / الإداري | Finance tables, reconciliation, reports                                |

### 1.3 What Each User Sees First

| User               | Default landing screen              |
| ------------------ | ----------------------------------- |
| Owner / Founder    | الرئيسية — Daily Briefing           |
| Operations Manager | العمليات — Operations queue         |
| Branch Manager     | العمليات — filtered to their branch |
| Cashier            | الكاشير — POS mode, auto-launched   |
| Finance / Admin    | المالية — Finance dashboard         |

---

## SECTION 2 — FINAL NAVIGATION SPEC

### 2.1 Top-Level Navigation Structure

Navigation is grouped into 5 sections:

**يومي**

- الرئيسية
- العمليات
- الكاشير

**العملاء**

- المحادثات
- المكالمات

**المخزون والمالية**

- المخزون
- المالية

**النمو**

- العملاء والحملات
- التوقعات

**النظام**

- الأتمتة
- مركز القيادة
- التقارير
- الإعدادات

### 2.2 Sub-Navigation by Module

| Module           | Sub-nav items                                                |
| ---------------- | ------------------------------------------------------------ |
| العمليات         | الطلبات / التوصيل / الفروع                                   |
| المحادثات        | الكل / مفتوح / معلق / مغلق                                   |
| المكالمات        | الطابور / السجل / معلق                                       |
| المخزون          | المنتجات / التنبيهات / نقل المخزون / الموردون                |
| المالية          | الملخص / الإيرادات / المصروفات / التسوية / التقارير          |
| العملاء والحملات | العملاء / الشرائح / الحملات                                  |
| التوقعات         | الطلب / التدفق النقدي / المخزون / الزبائن                    |
| الأتمتة          | التشغيل / السجل / المكتبة                                    |
| مركز القيادة     | النظرة العامة / خطط التشغيل / الموافقات / سجل القرارات       |
| الإعدادات        | الفريق / الفروع / التكاملات / الاشتراك / الإشعارات / الحوكمة |

### 2.3 Role-Gating Rules

| Nav item         | Cashier               | Branch Manager         | Ops Manager                 | Owner / Finance  |
| ---------------- | --------------------- | ---------------------- | --------------------------- | ---------------- |
| الرئيسية         | Hidden                | ✓ branch-scoped        | ✓                           | ✓                |
| العمليات         | Hidden                | ✓ branch-scoped        | ✓                           | ✓                |
| الكاشير          | ✓ auto-launch         | ✓ manual entry         | ✓ manual entry              | ✓ if permitted   |
| المحادثات        | Hidden                | ✓ branch-scoped        | ✓                           | ✓                |
| المكالمات        | Hidden                | ✓ if branch-enabled    | ✓                           | ✓                |
| المخزون          | Hidden                | ✓ branch-scoped        | ✓                           | ✓                |
| المالية          | Hidden                | Limited                | Limited                     | ✓                |
| العملاء والحملات | Hidden                | Hidden                 | ✓                           | ✓                |
| التوقعات         | Hidden                | Hidden                 | ✓                           | ✓                |
| الأتمتة          | Hidden                | Hidden                 | ✓ view-limited              | ✓                |
| مركز القيادة     | Hidden                | Hidden                 | Hidden                      | Owner/Admin only |
| التقارير         | Hidden                | ✓ basic branch reports | ✓ basic operational reports | ✓ full           |
| الإعدادات        | Hidden except profile | Limited                | Limited                     | ✓                |

### 2.4 Finance access definitions

**Operations Manager**

- can view period summaries
- can view revenue/expense rollups
- can view branch/channel summaries
- cannot access full reconciliation workflow
- cannot access subscription/billing controls
- cannot access finance admin-only controls

**Branch Manager**

- can view branch-scoped summary only
- cannot view global finance
- cannot access reconciliation
- cannot access transaction-level admin controls
- cannot access subscription/billing controls

### 2.5 Plan-Tier Visibility — PLACEHOLDER ONLY

Important:
This section is a placeholder until pricing/packaging is finalized.
Do not implement pricing tier names or feature gates as permanent truth yet.

| Feature area                      | Placeholder tiering direction          |
| --------------------------------- | -------------------------------------- |
| Core ops, POS, inventory, finance | base access                            |
| Conversations                     | limited vs expanded by plan            |
| Calls                             | higher-tier or add-on candidate        |
| Forecasting                       | basic vs advanced split possible       |
| Automations                       | capped vs expanded split possible      |
| Campaigns                         | likely gated higher                    |
| Command Center                    | likely premium / owner-only surface    |
| HQ Governance                     | likely higher-tier / enterprise-facing |

### 2.6 Hidden Completely in Phase 1

- advanced HQ/franchise policy DSL views
- internal AI planner debug/log views
- raw connector event log
- deep content-agent surfaces
- deep call-center QA disposition flows

### 2.7 Reports phase split

- **P1 reports** = basic branch-scoped and operational summaries, period tables, exports
- **P2 reports** = richer structured analytics, advanced comparisons, more customizable reporting

### 2.8 HQ governance phase split

- **P1 basic HQ governance** = branch list management, basic policy visibility, simple branch configuration and oversight
- **P2 advanced HQ governance** = deeper policy logic, franchise override behavior, advanced multi-branch enforcement surfaces

---

## SECTION 3 — SCREEN INVENTORY

### 3.1 Dashboard / Daily Briefing

Required:

- الرئيسية — Daily Briefing
- branch-scoped briefing variant
- empty/onboarding state

Deferred:

- richer personalized AI narrative block

### 3.2 Operations

Required:

- طابور الطلبات
- تفاصيل الطلب
- لوحة التوصيل
- تفاصيل التوصيل
- الفروع / حالة الفروع
- تفاصيل الفرع
- إضافة طلب يدوي
- سجل الطلبات

Deferred:

- deeper staff scheduling
- deeper SLA investigation

### 3.3 Cashier / POS

Required:

- جلسة الكاشير
- ملخص الجلسة
- تاريخ الجلسات
- بدء الجلسة
- تفاصيل المعاملة

Rule:
POS mode hides standard product chrome during active use.

**Branch Manager POS rule**
Branch Manager can manually enter POS mode from the sidebar if their role allows it.
On entering POS mode, the same chrome suppression applies as for Cashier.
Exit returns them to العمليات.

### 3.4 Conversations

Required:

- الصندوق الموحد
- تفاصيل المحادثة
- assign/escalate actions
- summary strip if useful

### 3.5 Calls

Required:

- طابور المكالمات
- تفاصيل المكالمة
- سجل المكالمات
- active-call state

Deferred:

- deep QA/coaching flows

### 3.6 Inventory

Required:

- قائمة المنتجات
- تنبيهات المخزون
- تفاصيل المنتج
- نقل المخزون
- طلبات إعادة التوريد
- الموردون
- إضافة / تعديل منتج

Optional:

- تفاصيل المورد

### 3.7 Finance

Required:

- ملخص مالي
- الإيرادات
- المصروفات
- التسوية
- التقارير المالية
- سجل المعاملات
- تفاصيل معاملة

Moved out:

- platform billing/subscription → الإعدادات / الاشتراك

### 3.8 Customers / Campaigns

Required:

- قائمة العملاء
- تفاصيل العميل
- الشرائح

P1 visible but honest:

- الحملات
- إنشاء حملة
- تفاصيل الحملة

Rule:
Campaign execution can be visually present while actual execution remains honestly gated if runtime is incomplete.

### 3.9 Forecasting

Required:

- نظرة عامة
- توقع الطلب
- توقع التدفق النقدي
- توقع المخزون

P1/P2 depending readiness:

- توقع الزبائن
- محاكاة السيناريوهات

### 3.10 Automations

Required:

- نظرة عامة
- قائمة الأتمتة
- تفاصيل الأتمتة
- إنشاء قاعدة
- سجل التشغيل

Optional:

- مكتبة القواعد

### 3.11 Command Center

Required later:

- نظرة عامة
- خطط التشغيل
- الموافقات
- سجل القرارات
- تفاصيل خطة

Clarification:
**Command Center is not the whole AI Brain.**
It is the explicit inspection surface for the AI brain’s planner and approval logic.
The AI brain also surfaces across all other modules as embedded signals, outcomes, and recommendations.

### 3.12 Settings / Governance

Required:

- إعدادات المتجر
- الفريق والأدوار
- الفروع
- التكاملات
- تفاصيل التكامل
- الاشتراك
- الإشعارات

P1/P2 depending governance readiness:

- الحوكمة

### 3.13 Login / Signup / Onboarding

Required:

- تسجيل الدخول
- إنشاء حساب
- نسيت كلمة المرور
- مرحباً / workspace init
- الإعداد الأولي
- إضافة فرع
- ربط القنوات
- دعوة الفريق

Important:
The 4-step onboarding flow is a working hypothesis, not a locked truth.

---

## SECTION 4 — SCREEN-BY-SCREEN SPEC

### 4.1 الرئيسية — Daily Briefing

Purpose:
Owner/manager start-of-day awareness.

Primary user:
Owner, Operations Manager

Core blocks:

1. شريط الحالة اليومية
2. يحتاج انتباهك
3. النظام عمل لك
4. صحة الفروع
5. توصيات الذكاء الاصطناعي

Primary actions:

- approve pending item
- view flagged order
- restock now

Secondary actions:

- filter by branch
- change date range
- view all recommendations

AI surfaces:

- anomaly flags
- recommendation cards
- system activity list

Visually dominant:

- requires-attention block

Minimized:

- reports/charts-first
- usage meters
- promo blocks
- decorative AI chrome

State conditions:

- empty/new account
- stale data
- no branches
- no pending items

### 4.2 العمليات — Operations Queue

Purpose:
Real-time dispatch and order management.

Primary user:
Operations Manager, Branch Manager

Core blocks:

- filter/status bar
- order queue table
- delivery sub-view
- branch status strip

Primary actions:

- assign driver
- change status
- print
- cancel

Secondary actions:

- filter
- search
- export

AI surfaces:

- SLA breach prediction
- auto-routing suggestion
- cancellation anomaly flags

Visually dominant:

- table/queue

Minimized:

- charts
- decorative cards

### 4.3 الكاشير — POS Mode

Purpose:
Fast transactional session.

Primary user:
Cashier, Branch Manager

Core blocks:

- product grid/list
- order summary panel
- payment CTA
- session strip

Primary actions:

- add product
- apply discount
- complete payment
- cancel order

Secondary actions:

- product search
- add note
- suspend order

AI surfaces:

- optional suggestions
- out-of-stock warnings

Visually dominant:

- checkout/payment flow

### 4.4 المحادثات — Unified Inbox

Purpose:
Single communication surface.

Primary user:
Ops/branch staff

Core blocks:

- filter/tabs
- conversation list
- conversation thread
- customer info strip/panel

Primary actions:

- reply
- assign
- escalate
- close

Secondary actions:

- add note
- link to order
- open customer profile

AI surfaces:

- AI draft reply
- sentiment tag
- escalation suggestion

### 4.5 المكالمات — Call Queue

Purpose:
Call-center queue.

Primary user:
Ops/assigned staff

Core blocks:

- live status strip
- call queue table
- active call surface
- call log

Primary actions:

- answer
- assign
- close
- add note

AI surfaces:

- post-call summary
- next-action suggestion
- call-volume anomaly signal

### 4.6 المخزون — Inventory

Purpose:
Stock control + reorder flow.

Primary user:
Ops, Branch Manager

Core blocks:

- stock alerts queue
- products table
- transfer flow
- reorder flow

AI surfaces:

- days-until-depletion
- reorder suggestion
- unusual stock movement anomaly

### 4.7 المالية — Finance

Purpose:
Serious financial operations surface.

Primary user:
Owner, Finance/Admin

Core blocks:

- period summary
- transactions table
- reconciliation panel
- finance reports

AI surfaces:

- anomaly detection
- forecast signal

### 4.8 العملاء والحملات — Customers & Campaigns

Purpose:
CRM + campaign execution.

Primary user:
Owner, Ops Manager

Core blocks:

- customer table
- customer profile
- segments
- campaigns list/create/detail

Rule:
If campaign runtime is incomplete, UI must be honest and visibly gated.

### 4.9 التوقعات — Forecasting

Purpose:
Planning/foresight layer.

Primary user:
Owner, Ops Manager

Core blocks:

- overview
- demand forecast
- cashflow forecast
- inventory forecast
- churn forecast
- scenarios

Required on every forecast:

- freshness
- confidence
- data-window note

### 4.10 الأتمتة — Automations

Purpose:
Business rule engine.

Primary user:
Owner, Operations Manager, manager+

Core blocks:

- automation summary
- rules list
- rule detail
- execution log
- create rule

AI surfaces:

- suggested automations
- impact measurement

### 4.11 مركز القيادة — Command Center

Purpose:
AI planner/approval inspection surface.

Primary user:
Owner/Admin only

Core blocks:

- pending approvals
- planner runs
- plan detail
- decision log

### 4.12 الإعدادات — Settings

Purpose:
Grouped control panel.

Core groups:

- store settings
- team & roles
- branches
- integrations
- subscription
- notifications
- governance

### 4.13 Login / Signup / Onboarding

Purpose:
Entry + activation.

Rule:
Do not over-market here.
Keep trust, clarity, and activation speed.

---

## SECTION 5 — PAGE FAMILY MAPPING

- Daily Briefing → dashboard
- Queue/List/Table → operations, conversations, calls, inventory, customers, finance lists
- Detail/Investigation → detail pages
- Transaction/POS Mode → cashier
- Configuration/Setup → onboarding, create/edit flows, settings
- Analytics/Review → finance summary, forecasting, performance views
- Approval/Control-Plane → command center

---

## SECTION 6 — COMPONENT INVENTORY

Core reusable components:

- MetricStrip
- StatusBadge
- QueueRow
- ActionItemCard
- RecommendationCard
- TimelineItem
- TableShell
- DetailHeader
- ApprovalQueueItem
- SettingsRow
- FreshnessIndicator
- EmptyState
- ErrorBanner
- StaleBanner
- PlanLockRow
- AIOutcomeChip

Important:
These should be audited against the real existing component library before rebuilding from scratch.

---

## SECTION 7 — ROLE VISIBILITY MATRIX

### Owner / Founder

- default landing: الرئيسية
- sees all modules
- full approvals / billing / governance / command center

### Operations Manager

- default landing: العمليات
- sees operational modules + limited finance + limited automation visibility
- does not see command center

### Branch Manager

- default landing: العمليات for their branch
- sees branch-scoped operational modules
- can manually enter POS mode if allowed
- no global finance/governance/command center

### Cashier

- default landing: الكاشير
- sees POS only
- no normal app navigation beyond minimal profile/sign-out

### Finance / Admin

- default landing: المالية
- sees finance + reports + relevant settings
- does not see operational/control-plane modules unless separately allowed

---

## SECTION 8 — PHASE IMPLEMENTATION MAP

### P0

- dashboard / daily briefing
- operations queue
- order detail
- POS mode
- inventory list + alerts
- finance summary + transaction table
- login/signup
- semantic color system
- grouped sidebar
- RTL structural fix
- remove AI chrome

### P1

- conversations
- calls
- delivery board
- forecasting basics
- automations basics
- grouped settings
- onboarding
- role-visibility gates
- freshness indicators wired to real data

### P2

- command center
- approvals queue
- decision log
- customers/campaigns deeper
- advanced forecasting
- richer reports
- broader HQ governance

### P3

- dark mode
- mobile/tablet polish
- advanced onboarding polish
- advanced call-center QA
- later incomplete agent surfaces if runtime matures

### Timeline note

Any ordering timeline should be treated as an **ordering guide only**, not a committed schedule.

---

## SECTION 9 — DESIGN QA CHECKLIST

Check every implemented screen for:

- Operations OS feel
- not AI-startup-demo feel
- RTL correctness
- hierarchy clarity
- operator usability
- trust/freshness visibility
- AI consequence surfacing
- role-aware visibility
- semantic color use

---

## SECTION 10 — HANDOFF INSTRUCTIONS FOR IMPLEMENTATION

### 10.1 Refactor first

- background and semantic color token system
- RTL structural audit
- grouped navigation
- dashboard rebuild
- removal of AI marketing chrome

### 10.2 Redesign first

- dashboard
- operations queue
- inventory
- finance
- POS mode

### 10.3 Do not touch yet

- backend API contracts
- order state machine
- auth/session layer
- webhook/channel integration layer
- incomplete runtime surfaces that are not ready

### 10.4 Must remain functionally stable

- POS transaction flow
- order lifecycle
- messaging delivery
- stock updates
- finance records
- role permissions

### 10.5 Ordering guide only

This is not a committed timeline.
Actual sprint planning depends on:

- real repo state
- team size
- current component/library maturity
- backend readiness

### 10.6 Prompt template for implementation tools

Use a screen-by-screen handoff template referencing:

- screen name
- page family
- primary user
- core blocks
- required components
- RTL requirement
- AI surfaces
- what to avoid
- what not to break

---

## SECTION 11 — KNOWN PLACEHOLDERS / HYPOTHESES

- plan tier names and feature gates
- onboarding exact step flow
- exact final color values
- exact implementation timeline
- any screen details for pages not fully seen yet
