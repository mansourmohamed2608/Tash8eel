# TASH8EEL_WORKING_BLUEPRINT

Last updated: 2026-04-14

Purpose:
This file stores the working product-structure and redesign blueprint for Tash8heel AI.
It contains detailed recommendations, evolving architecture, module logic, page-family logic, visual system direction, and implementation guidance.

Rules:

- This file is allowed to evolve.
- It is downstream from TASH8EEL_LOCKED_DECISIONS.md.
- If something here conflicts with the locked decisions file, the locked decisions file wins unless explicitly revised.
- Use this file as the working bridge between Claude strategy/design work and implementation work.

---

## 1. WORKING PRODUCT ARCHITECTURE

### 1.1 Core reframe

The product should stop behaving like a feature list with AI layered on top.

Working target architecture:

- **AI Brain / Control Plane**
  - planner
  - orchestration
  - approvals
  - anomaly detection
  - forecasting / automation intelligence

- **Operational Core**
  - operations
  - cashier / POS
  - inventory
  - finance

- **Channel & Intelligence Layer**
  - conversations
  - calls
  - customers / campaigns
  - forecasting

- **Automation Layer**
  - automations
  - playbooks
  - scheduled jobs
  - SLA logic

- **Governance & Configuration Layer**
  - HQ / branch governance
  - settings
  - integrations
  - roles / permissions
  - billing

### 1.2 AI Brain vs Command Center

The **AI Brain** is the full underlying intelligence/orchestration layer across the system.

The **Command Center** is only the UI surface where parts of that AI brain become inspectable:

- approvals
- planner runs
- decision history
- audit trail

These are not the same thing.

---

## 2. WORKING NAVIGATION DIRECTION

### 2.1 Navigation principles

- grouped by workflow, not by feature count
- role-aware
- RTL-native
- fewer top-level decisions
- admin/owner/system areas visually separated from daily operator areas

### 2.2 Proposed grouped navigation

Working direction:

**Daily**

- Dashboard / Daily Briefing
- Operations
- Cashier / POS

**Customer-facing**

- Conversations
- Calls

**Stock & Money**

- Inventory
- Finance

**Growth**

- Customers & Campaigns
- Forecasting

**System**

- Automations
- Command Center
- Reports
- HQ / Governance
- Settings

### 2.3 Working nav rules

- command center should not be buried under conversations
- reports should not dominate daily use
- cashier should behave more like a mode than a normal module
- role-gate system/admin sections
- hide or suppress incomplete surfaces where needed

---

## 3. DASHBOARD / DAILY BRIEFING WORKING BLUEPRINT

### 3.1 Role of dashboard

The dashboard becomes a **daily briefing**, not a feature showcase.

It should answer:

1. what is happening right now
2. what needs my attention
3. what did the system do for me
4. is the business healthy today

### 3.2 Working block structure

- **Business pulse**
  - today revenue
  - active orders
  - open conversations
  - delayed / pending deliveries
  - freshness on each metric

- **Requires your attention**
  - approvals
  - stock alerts
  - cash anomalies
  - delayed orders
  - operational risks

- **System activity / AI worked for you**
  - completed automations
  - auto-actions
  - forecast refreshes
  - anomaly detections
  - reminders triggered

- **Branch / location health**
  - branch-level status rows for multi-branch operators

- **AI recommendations**
  - capped set of recommendations
  - action + reason + confidence
  - no vague AI notices

### 3.3 Remove from dashboard

- token usage bars
- plan usage anxiety surfaces
- feature-selling promo blocks
- decorative AI banners
- non-actionable charts taking too much space

---

## 4. MODULE-BY-MODULE WORKING RESTRUCTURE

### 4.1 Operations

Purpose:
Unified operational dispatch board.

Should include:

- orders
- delivery as a sub-flow, not a separate worldview
- branch ops
- staff/shifts where relevant

Primary pattern:

- queue/table-first
- status-first
- time-elapsed
- required action visible per row

### 4.2 Cashier / POS

Purpose:
Dedicated high-speed transactional mode.

Rules:

- full-screen / focused mode
- hide normal product chrome while active
- session-first flow
- touch-optimized
- shift/session summary feeds finance

### 4.3 Conversations

Purpose:
Unified customer inbox, not separate channel silos.

Rules:

- customer-first, not channel-first
- unified inbox default
- AI suggestions inside conversation workflow
- channel shown as metadata, not the main framing

### 4.4 Calls

Purpose:
Operational queue for phone channel.

Rules:

- call list / queue first
- active call state clear
- AI summary and actions contextual
- not a decorative “AI call center” screen

### 4.5 Inventory

Purpose:
Action-oriented stock control.

Rules:

- priority table
- urgency / days until depletion / suggested action
- supplier + reorder workflow integrated
- transfer workflows explicit

### 4.6 Finance

Purpose:
Serious operator/accounting surface.

Rules:

- table-first
- period comparison
- revenue / expense / cashflow / reconciliation separation
- platform billing moved to settings
- merchant finance kept distinct from SaaS billing

#### Limited finance access working definition

This is a working rule until final implementation locking:

- **Operations Manager**: can view period summaries, revenue/expense rollups, branch/channel summaries; cannot access full reconciliation workflow or subscription/billing settings
- **Branch Manager**: can view branch-scoped summary only; cannot access global finance, reconciliation, or transaction-level admin controls

### 4.7 Customers & Campaigns

Purpose:
CRM + growth actions.

Rules:

- customer intelligence available first
- campaign execution may be gated if incomplete
- churn and reactivation logic surfaced
- keep execution honesty if runtime is incomplete

### 4.8 Forecasting

Purpose:
Planning and foresight layer.

Rules:

- only show after enough data exists
- promote the most useful forecasts first
- scenario simulation should be elevated
- freshness/confidence always visible

### 4.9 Automations

Purpose:
Rule engine / workflow control.

Rules:

- admin/manager oriented
- playbook-first
- impact measurement visible
- execution logs available
- not a technical engine room for normal users

### 4.10 Command Center

Purpose:
AI brain made inspectable.

Rules:

- role-gated
- audit / approvals / planner-run logic
- surfaced through pending action summaries elsewhere
- not every operator’s daily home

### 4.11 Settings / Governance

Purpose:
Control panel, not dumping ground.

Rules:

- grouped
- low-chrome
- explicit categories
- no flat chaos
- includes:
  - team/roles
  - integrations
  - billing/subscription
  - workspace/store/branches
  - notifications
  - governance where relevant

### 4.12 Governance phase split

- **Basic governance**: branch list, simple branch settings, basic policy visibility
- **Advanced governance**: franchise override logic, deeper policy control, advanced HQ rule enforcement

---

## 5. WORKING PAGE FAMILIES

### 5.1 Daily Briefing

Use for:

- owner / ops lead start-of-day
- summary + required actions + AI outcomes

### 5.2 Queue / List / Table View

Use for:

- operations
- conversations
- calls
- inventory
- customers
- finance transaction lists

Key principle:
tables and queues are the default serious pattern.

### 5.3 Detail / Investigation View

Use for:

- order details
- customer details
- automation run detail
- AI/planner investigation
- financial record review

### 5.4 Transaction / POS Mode

Use for:

- cashier
- fast interactions
- session flows
- almost kiosk-like behavior

### 5.5 Configuration / Setup Flow

Use for:

- onboarding
- integrations
- automation creation
- role setup
- branch setup

### 5.6 Analytics / Review View

Use for:

- finance summaries
- forecast reviews
- campaign performance
- structured period analysis

### 5.7 Approval / Control-Plane View

Use for:

- approvals
- planner-run reviews
- triage / replay / audit contexts
- command-center workflows

---

## 6. WORKING VISUAL SYSTEM DIRECTION

### 6.1 Personality

The product should feel:

- calm
- serious
- inspectable
- accountable
- Arabic-native
- operational
- premium through consistency

### 6.2 What must die

- full black background
- gold/amber-first operational UI
- module headers that sound like marketing copy
- “AI-powered” decorative chrome
- flat long sidebar
- tab overload
- colored-number card dumps
- startup landing-page logic inside product

### 6.3 AI visual rule

AI is visible only as:

- recommendations
- anomaly flags
- action suggestions
- automation outcomes
- confidence/freshness-aware forecasts
- decision traces

Never as:

- decorative glowing AI widgets
- spinning “AI active” signals
- vague AI notices with no action meaning

---

## 7. WORKING COLOR STRATEGY

### 7.1 Separation principle

Brand color and product semantic color should be partially separated.

### 7.2 Background direction

Working direction:

- warm off-white page background
- white / lightly elevated panels
- clearer layer separation
- optional dark mode later, but not the current black-first product identity

### 7.3 Semantic color logic

- success = green
- warning = amber
- danger = red
- pending/info = blue
- disabled = gray
- AI recommendation = teal only

### 7.4 Color restrictions

- red only means real problem
- amber should not be brand CTA and warning at the same time
- product should not look neon or gradient-led
- charts should avoid rainbow complexity

### 7.5 Color truth

Exact hex values are **not locked yet**.
Any specific color values elsewhere should be treated as **starting points for design QA**, not permanent truth.

---

## 8. WORKING TYPOGRAPHY / DENSITY / COMPONENT DIRECTION

### 8.1 Typography

- Arabic-first readable system font
- minimal type scale
- strong table readability
- no decorative display style

### 8.2 Density

- dense where needed
- compact but breathable
- operator efficiency first
- not artificially spacious like landing pages

### 8.3 Components to standardize

- status badges
- action queue items
- metric strips
- table rows
- approval queue items
- recommendation cards
- timeline items
- setting rows
- empty states
- stale-data states

---

## 9. WORKING RTL / ARABIC-FIRST RULES

### 9.1 Non-negotiable RTL truths

- full HTML/app RTL, not partial flipping
- sidebar on the right
- primary importance anchored to RTL reading order
- tables reordered for RTL logic, not just translated
- forms, button groups, and actions must behave natively in RTL

### 9.2 Arabic product rule

Arabic is the primary language of the product experience.
English appears only where structurally necessary.

### 9.3 Anti-fake-RTL rule

Do not allow:

- LTR structure with Arabic labels pasted in
- left-anchored interaction logic disguised as RTL
- left-sidebar-first mental models

---

## 10. WORKING STATE DESIGN DIRECTION

### 10.1 States required

- empty
- loading
- error
- warning
- stale/freshness
- approval pending
- disabled/gated
- success/completed

### 10.2 State rules

- no fake zero-state “live” metrics
- stale data must be visible
- approvals need queue time and ownership
- disabled features must be honest and explain why
- empty states must guide next action, not entertain

---

## 11. WORKING IMPLEMENTATION PRIORITIES

### 11.1 P0 design/system changes

- replace black background system
- rebuild sidebar/navigation hierarchy
- remove AI marketing chrome from modules
- fix RTL structure properly
- define semantic status color system
- reframe dashboard as daily briefing

### 11.2 P1 redesign work

- operations/orders queue redesign
- forecasting restructure
- automations redesign
- finance redesign
- inventory redesign

### 11.3 P2 redesign work

- conversations redesign
- calls redesign
- command center redesign
- settings/governance regrouping
- customers/campaigns redesign

### 11.4 P3 work

- login/signup polish
- onboarding refinement
- dark mode
- responsive refinement
- animation polish

---

## 12. OPEN WORKING NOTES

- pricing tier names are not decided
- plan gating rules are not final
- onboarding flow is a working hypothesis
- exact reports phase split still needs final locking
- exact finance visibility matrix still needs final locking in implementation spec

---

## 13. WHAT THIS FILE IS FOR NEXT

Use this file as the working design and structure source for:

- implementation-ready product spec generation
- page inventory
- wireframe planning
- frontend refactor planning
- Claude Code / Copilot / Codex implementation prompts

It should evolve as implementation planning becomes more concrete.
