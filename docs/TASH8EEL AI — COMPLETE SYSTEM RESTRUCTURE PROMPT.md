# TASH8EEL AI — COMPLETE SYSTEM RESTRUCTURE PROMPT

### For: GPT-5.3 xHigh (or Claude Code) with Full Repo Access

### Type: Full Implementation Prompt — UX + UI + Navigation + All Modules

### Authority: All project documentation files listed at end of this document

---

## READ THIS FIRST — RULES FOR THIS IMPLEMENTATION

You have full repo access. You are implementing a complete product restructure. This is not a cosmetic update. This is not just colors. This is a full system-level rebuild of:

1. UX architecture (how the product is organized and flows)
2. Navigation structure (what the sidebar is and how it works)
3. Information hierarchy (what goes where and why)
4. Every module (redesigned from the ground up)
5. Design system (tokens, components, patterns, states)
6. RTL/Arabic-first implementation (native, not flipped)
7. Role-based access (what each user type sees and doesn't see)
8. AI surfacing (how the AI brain is visible through the product)
9. Empty states, loading states, error states (every state for every surface)
10. UX flows (how the operator moves through the system)

**Do not:**

- Only change colors and call it done
- Keep the existing navigation structure
- Keep the existing module organization
- Keep the existing dashboard layout
- Keep the existing sidebar (flat list of 10+ items at same weight)
- Keep "مدعوم بالذكاء الاصطناعي" or any AI marketing chrome
- Keep the full-black (#000) page backgrounds
- Keep gold/amber as the primary interactive color
- Keep landing-page-style headers inside product screens
- Keep 7+ tab rows inside modules
- Fake RTL (mirror an LTR layout) — build RTL native

**Do:**

- Read every section below completely before writing a single line of code
- Restructure navigation first (foundation for everything)
- Implement design tokens before building any component
- Build RTL from the HTML root, not as a patch
- Surface AI through consequences (recommendations, outcomes, anomalies) not through decoration
- Every screen must answer an operational question
- Every empty state must be honest, useful, and Arabic
- Every AI surface must have confidence + freshness indicators
- Design for the primary user (Egyptian 3-15 branch F&B/retail operator)

---

## SECTION 1: PRODUCT IDENTITY — WHAT YOU ARE BUILDING

Tash8heel AI is an **AI-driven merchant operating system** for Egyptian F&B and retail chains (3–15 branches).

It is NOT:

- A chatbot
- A WhatsApp tool
- A POS system with extra features
- An ERP
- A CRM
- A generic AI SaaS
- A startup demo

It IS:

- One system for orders, cashier, inventory, finance, customer communication (WhatsApp/Instagram/Facebook/Calls), delivery, automations, forecasting, and branch governance
- AI working in the background: automating routine tasks, surfacing anomalies, forecasting demand, recommending actions
- Built first for Egypt, then MENA
- Arabic-first, RTL-native
- The infrastructure layer of a well-run merchant business

**Emotional target:** The owner should feel IN CONTROL through the system. Not impressed BY it.

**Operational target:** The daily user (operations manager, branch manager, cashier) finds exactly what they need in 1-2 clicks without reading documentation.

**Interface personality:**

- Calm (not loud, not dramatic)
- Inspectable (every AI action is visible and explainable)
- Accountable (the system tells you what happened, when, and who did it)
- Operator-first (speed and clarity for daily users)
- Honest (if data is missing, the system says so)

---

## SECTION 2: DESIGN SYSTEM TOKENS — IMPLEMENT THESE FIRST

Before touching any screen, implement these as CSS custom properties (or your framework's token system).

### 2.1 Color Tokens

```css
:root {
  /* ============================
     BACKGROUND LAYERS
     ============================ */
  --color-page-bg: #f5f4f1; /* Warm off-white. Replaces black everywhere */
  --color-surface: #ffffff; /* Cards, panels, modals */
  --color-surface-secondary: #f8f7f4; /* Slightly off-white for nested sections */
  --color-elevated: #ffffff; /* Dropdowns, tooltips, popovers */
  --color-border: #e5e4e1; /* Standard border */
  --color-border-subtle: #eeede9; /* Very subtle border */

  /* ============================
     TEXT SCALE
     ============================ */
  --color-text-primary: #1a1a1a; /* Near-black, slightly warm */
  --color-text-secondary: #6b6b6b; /* Secondary labels */
  --color-text-tertiary: #9b9b9b; /* Metadata, timestamps */
  --color-text-disabled: #c4c3bf; /* Disabled state text */
  --color-text-inverse: #ffffff; /* On dark backgrounds */

  /* ============================
     BRAND (RESTRICTED USE)
     ============================ */
  --color-brand-primary: #1c5ae8; /* Primary CTA, active nav indicator, links */
  --color-brand-hover: #1549cc; /* Brand hover state */
  --color-brand-subtle: #eef2fd; /* Brand-tinted backgrounds */

  /* ============================
     SEMANTIC — SUCCESS
     ============================ */
  --color-success-text: #166534;
  --color-success-bg: #dcfce7;
  --color-success-border: #bbf7d0;
  --color-success-icon: #16a34a;

  /* ============================
     SEMANTIC — WARNING
     ============================ */
  --color-warning-text: #92400e;
  --color-warning-bg: #fef3c7;
  --color-warning-border: #fde68a;
  --color-warning-icon: #d97706;

  /* ============================
     SEMANTIC — DANGER
     ============================ */
  --color-danger-text: #991b1b;
  --color-danger-bg: #fee2e2;
  --color-danger-border: #fecaca;
  --color-danger-icon: #dc2626;

  /* ============================
     SEMANTIC — INFO / PENDING
     ============================ */
  --color-info-text: #1e40af;
  --color-info-bg: #dbeafe;
  --color-info-border: #bfdbfe;
  --color-info-icon: #2563eb;

  /* ============================
     SEMANTIC — NEUTRAL / DISABLED
     ============================ */
  --color-neutral-text: #374151;
  --color-neutral-bg: #f3f4f6;
  --color-neutral-border: #e5e7eb;

  /* ============================
     AI — TEAL (EXCLUSIVE USE)
     ============================ */
  /* IMPORTANT: Teal is ONLY used for AI-generated content.
     Never use for any other purpose. */
  --color-ai-text: #0f766e;
  --color-ai-bg: #ccfbf1;
  --color-ai-border: #99f6e4;
  --color-ai-icon: #0d9488;

  /* ============================
     SPACING SYSTEM (8px base grid)
     ============================ */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ============================
     TYPOGRAPHY
     ============================ */
  --font-family-base: "IBM Plex Arabic", "Segoe UI", system-ui, sans-serif;
  --font-size-xs: 12px; /* Metadata, timestamps */
  --font-size-sm: 14px; /* Body, table cells */
  --font-size-base: 16px; /* Section headers */
  --font-size-lg: 20px; /* Module titles */
  --font-size-xl: 24px; /* Page titles */
  --font-size-2xl: 32px; /* Primary KPIs (dashboard) */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --line-height-tight: 1.2;
  --line-height-base: 1.5;

  /* ============================
     COMPONENT SIZING
     ============================ */
  --row-height-compact: 36px;
  --row-height-standard: 44px;
  --row-height-comfortable: 56px;
  --btn-height-sm: 32px;
  --btn-height-base: 40px;
  --btn-height-lg: 48px;
  --input-height: 40px;
  --sidebar-width-expanded: 240px;
  --sidebar-width-collapsed: 60px;
  --radius-sm: 4px;
  --radius-base: 8px;
  --radius-lg: 12px;

  /* ============================
     TRANSITIONS
     ============================ */
  --transition-fast: 100ms ease;
  --transition-base: 150ms ease;
  --transition-slow: 200ms ease;
  /* Maximum transition: 200ms. No exceptions. */

  /* ============================
     SHADOWS
     ============================ */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-base:
    0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg:
    0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
}
```

### 2.2 RTL Foundation (Set on HTML Root)

```html
<!-- Every page must have these -->
<html dir="rtl" lang="ar"></html>
```

```css
/* Use logical CSS properties everywhere */
/* NEVER use margin-left/right, padding-left/right, left, right as absolute positions */
/* USE: margin-inline-start, margin-inline-end, padding-inline-start, padding-inline-end */
/* USE: inset-inline-start, inset-inline-end */

/* Example: */
.sidebar {
  inset-inline-end: 0; /* RTL: sidebar on right */
  inset-block: 0;
  width: var(--sidebar-width-expanded);
}

.main-content {
  margin-inline-end: var(
    --sidebar-width-expanded
  ); /* Space for right-side sidebar */
}
```

---

## SECTION 3: NAVIGATION ARCHITECTURE — IMPLEMENT EXACTLY AS SPECIFIED

### 3.1 Remove the Existing Navigation Structure

The current navigation (الرئيسية · المحادثات · الطلبات · الكاشير · المالية والاشتراك · المخزون · العملاء · التقارير · الإعدادات · المساعدة) is a FLAT LIST. Replace it entirely.

### 3.2 New Navigation Structure (5 Groups, RTL-Native)

The sidebar sits on the **RIGHT side** of the screen. Not the left.

```
SIDEBAR STRUCTURE (right side, RTL direction):

━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Logo: تشغيل] [Workspace Switcher]
━━━━━━━━━━━━━━━━━━━━━━━━━━

GROUP 1: اليومي
  ├─ الرئيسية               (Daily Briefing Dashboard)
  ├─ العمليات               (Operations — with sub-nav)
  │   ├─ الطلبات            (Orders Queue)
  │   ├─ التوصيل            (Delivery Sub-view)
  │   └─ الفروع والفريق     (Branches & Staff)
  └─ الكاشير                (POS — launches as full-screen mode)

GROUP 2: العملاء
  ├─ المحادثات              (Unified Inbox: WhatsApp + Messenger + Instagram)
  └─ المكالمات              (Call Queue & Disposition)

GROUP 3: المخزون والمالية
  ├─ المخزون                (Inventory — with sub-nav)
  │   ├─ قائمة المنتجات    (Products List)
  │   ├─ تنبيهات المخزون   (Stock Alerts)
  │   ├─ الموردون           (Suppliers)
  │   ├─ نقل المخزون        (Inter-Branch Transfers)
  │   └─ التوقعات الذكية    (Smart Forecasts — data-gated)
  └─ المالية                (Finance — with sub-nav)
      ├─ الملخص             (Summary)
      ├─ الإيرادات          (Revenue)
      ├─ المصروفات          (Expenses)
      ├─ التدفق النقدي      (Cash Flow)
      └─ التسويات           (COD + Reconciliation)

GROUP 4: النمو  [Manager+ role only]
  ├─ الحملات والعملاء       (CRM + Campaigns — merged)
  │   ├─ العملاء            (CRM Records)
  │   └─ الحملات            (Campaigns — may be gated)
  └─ التوقعات               (Forecasting — data-gated)

GROUP 5: النظام  [Admin only, visually subdued]
  ├─ الأتمتة               (Automations Rule Engine)
  ├─ مركز القيادة           (Command Center — Owner/Admin only)
  ├─ التقارير               (Reports & Exports)
  └─ الإعدادات              (Settings — with sub-nav)
      ├─ الفريق والأذونات   (Team & Roles)
      ├─ الفواتير والاشتراك (Billing — MOVED FROM FINANCE)
      ├─ التكاملات          (Integrations)
      ├─ المتجر والفروع     (Store & Branch Config)
      ├─ الإشعارات          (Notifications)
      └─ مساحة العمل        (Workspace)

━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSISTENT BOTTOM:
  [?] المساعدة             (Contextual Help — not a full module)
  [User Avatar] [Sign Out]
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3.3 Navigation Visual Specs

```css
/* Group headers */
.nav-group-label {
  font-size: var(--font-size-xs); /* 12px */
  font-weight: var(--font-weight-semibold); /* 600 */
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--space-4) var(--space-4) var(--space-2); /* 16px 16px 8px */
}

/* Nav items */
.nav-item {
  height: var(--row-height-standard); /* 44px */
  padding-inline: var(--space-4); /* 16px */
  border-radius: var(--radius-sm); /* 4px */
  display: flex;
  align-items: center;
  gap: var(--space-3); /* 12px between icon and label */
  color: var(--color-text-secondary);
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

/* Active state */
.nav-item.active {
  color: var(--color-brand-primary);
  background: var(--color-brand-subtle);
  /* RTL: right border */
  border-inline-end: 3px solid var(--color-brand-primary);
}

/* Hover state */
.nav-item:hover {
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
}

/* Sub-nav items (indented) */
.nav-item-sub {
  padding-inline-start: var(--space-10); /* 40px indent */
  height: var(--row-height-compact); /* 36px */
  font-size: var(--font-size-sm); /* 14px */
}

/* System group (visual subduing) */
.nav-group.system .nav-item {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}
```

### 3.4 Role-Based Navigation Visibility

```javascript
// Implement role-gating as render logic, not as lock icons
// If a user doesn't have access, the nav item IS NOT RENDERED
// Exception: if the feature is gated by plan tier (not role), show with lock icon

const NAV_VISIBILITY = {
  الرئيسية: ["owner", "admin", "ops_manager", "branch_manager", "finance"],
  العمليات: ["owner", "admin", "ops_manager", "branch_manager"],
  الكاشير: ["owner", "admin", "ops_manager", "branch_manager", "cashier"],
  المحادثات: ["owner", "admin", "ops_manager", "branch_manager"],
  المكالمات: ["owner", "admin", "ops_manager", "branch_manager"],
  المخزون: ["owner", "admin", "ops_manager", "branch_manager"],
  المالية: ["owner", "admin", "finance"], // branch_manager gets limited view
  "الحملات والعملاء": ["owner", "admin", "ops_manager"],
  التوقعات: ["owner", "admin", "ops_manager"],
  الأتمتة: ["owner", "admin"],
  "مركز القيادة": ["owner", "admin"], // OWNER ONLY
  التقارير: ["owner", "admin", "ops_manager", "branch_manager", "finance"],
  الإعدادات: ["owner", "admin"],
};

// Default landing by role
const DEFAULT_ROUTE = {
  owner: "/dashboard",
  admin: "/dashboard",
  ops_manager: "/operations/orders",
  branch_manager: "/operations/orders", // filtered to their branch
  cashier: "/pos", // auto-launch POS mode
  finance: "/finance/summary",
};
```

---

## SECTION 4: COMPLETE MODULE SPECIFICATIONS

### MODULE 1: الرئيسية (Dashboard — Daily Briefing)

**Purpose:** Owner's 60-second business health check. Not a feature showcase. Not a data dump.

**Answers these 4 questions only:**

1. ماذا يحدث الآن؟ (What is happening right now)
2. هل في مشاكل تحتاج تدخلي؟ (Are there problems requiring my intervention)
3. ماذا عمل النظام لي تلقائياً؟ (What did the system do automatically for me)
4. كيف صحة فروعي اليوم؟ (How healthy are my branches today)

**Layout: 5 Blocks, Vertical Scroll**

```
┌─────────────────────────────────────────────────────────────┐
│ BLOCK 1: شريط الحالة اليومية (Operational Pulse)           │
│ 4 KPI cells side by side                                    │
│ Each: Icon + Large Number (32px) + Label + Trend + Time     │
│ Cell 1: إيرادات اليوم  ↑12% منذ 2 دقيقة                   │
│ Cell 2: الطلبات النشطة  14 ↑3                              │
│ Cell 3: محادثات مفتوحة  8 ↓2                               │
│ Cell 4: توصيلات معلقة  3 🔴                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BLOCK 2: يحتاج انتباهك (Requires Your Attention)          │
│ Ranked list, max 5 items. Collapses to zero if empty.      │
│ Each item: [Severity Icon] Description + Time + [Action]   │
│ 🔴 "فشل الدفع: طلب #542 (2,400 ج.م) — منذ ساعة" [مراجعة] │
│ 🟠 "مخزون منخفض: BAG-001 — يوم 1 حتى النفاد" [إعادة طلب] │
│ 🔵 "عميل معلق: علي حسن — 30 يوم — مخاطر 65%" [حملة]      │
│ Overflow: "عرض جميع الإجراءات (12)"                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BLOCK 3: النظام عمل لك (System Activity — AI Did This)     │
│ Timeline: Last 24 hours of automated actions               │
│ ✓ تم إرسال 8 ردود واتساب تلقائياً                        │
│ ✓ تم تحديث توقعات المخزون                                 │
│ ⚠ تم رصد مخزون منخفض: BAG-001                            │
│ ✓ تمت إضافة 3 عملاء لشريحة "خامدون"                      │
│ ✓ تمت معالجة تسوية COD: 45,200 ج.م                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BLOCK 4: صحة الفروع (Branch Health) [Owner only]          │
│ One row per branch:                                         │
│ [Branch Name] [Revenue Today] [Active Orders] [Alerts]     │
│ Color: 🟢 green (normal) 🟡 amber (warning) 🔴 red (urgent)│
│ Click row → drill into that branch's operations            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ BLOCK 5: توصيات الذكاء (AI Recommendations) — Max 3       │
│ Each card [TEAL BACKGROUND]:                               │
│ What the AI noticed + What it suggests + Confidence        │
│ "6 عملاء معرضون للاضطراب — اقتراح: حملة إعادة تفاعل"     │
│ [تشغيل الحملة] or [تجاهل]                                 │
└─────────────────────────────────────────────────────────────┘

STICKY BOTTOM: Quick Actions Bar
[+ طلب جديد] [💳 جلسة كاشير] [💬 محادثة جديدة] [📊 تقرير اليوم]
```

**REMOVE PERMANENTLY from dashboard:**

- ❌ Plan usage progress bar (→ الإعدادات → الفواتير)
- ❌ "مدعوم بالذكاء الاصطناعي" badge anywhere
- ❌ Roadmap widgets or "Coming Soon" blocks
- ❌ Large chart panels loading on first view
- ❌ "مرحباً بك في تشغيل" welcome copy
- ❌ Intelligence Center / Command Room / Agent Activity as separate dashboard tabs
- ❌ 4-5 separate "center" pages — consolidate into مركز القيادة (one surface)
- ❌ Feature-promotion blocks (selling features to users inside the product)
- ❌ Zero-state metric cards that show "0" with no context or guidance

**Empty State (New Account):**

```
DO NOT show zero-value cards.
INSTEAD show:
┌─────────────────────────────────────┐
│ [Demo Data labeled clearly: تجريبي] │
│ إعداد المتجر                        │
│ Progress: 3/5 خطوات مكتملة         │
│ ✓ تم إنشاء المتجر                  │
│ ✓ تم ربط القنوات                   │
│ ⚬ أول طلب لم يصل بعد              │
│ ⚬ المخزون لم يُضاف بعد            │
│ ⚬ الفريق لم يُدعى بعد             │
│ [اكمل الإعداد →]                   │
└─────────────────────────────────────┘
```

**Freshness Rule:**
Every metric must show a freshness timestamp: "آخر تحديث: منذ X دقيقة"

- 0-5 minutes: Show quietly
- 5-30 minutes: Show in secondary text
- 30+ minutes: Show amber ⚠ with refresh button
- 2+ hours: Show red "بيانات قديمة" + prominent refresh button

---

### MODULE 2: العمليات (Operations — Consolidated)

**Purpose:** Unified dispatch board. Orders + Delivery + Branches + Staff in one place.

**Kill:** Delivery as a separate top-level nav item. It moves here as a sub-tab.

**3 Sub-Tabs:**

**Sub-Tab A: الطلبات (Orders Queue) — DEFAULT**

Status strip (always visible, sticky):

```
نشطة: 14  |  معلقة: 3  |  متأخرة: 2  |  مكتملة اليوم: 67
آخر تحديث: منذ 2 دقيقة  [🔄 تحديث]
```

Table columns (RTL order — right to left):

```
[حذف] [إجراء] [الوكيل] [الوقت المنقضي] [المبلغ] [العميل] [المصدر] [الفرع] [الحالة]
```

- Sortable by: Recent / Status / Time Elapsed / Amount
- Filter bar: الكل | واتساب | ماسنجر | إنستاجرام | يدوي | كاشير | معلق | مكتمل | ملغاة
- Time Elapsed: Red background if > SLA threshold
- Inline order lifecycle (progress bar inside each row):
  `إنشاء → تأكيد → تجهيز → شحن → تسليم → تسوية COD`
- Row click → detail panel slides in from the left (RTL: left = secondary)

Status badges:

```javascript
const ORDER_STATUS = {
  active: {
    label: "نشط",
    color: "var(--color-info-text)",
    bg: "var(--color-info-bg)",
  },
  delayed: {
    label: "متأخر",
    color: "var(--color-warning-text)",
    bg: "var(--color-warning-bg)",
  },
  completed: {
    label: "مكتمل",
    color: "var(--color-success-text)",
    bg: "var(--color-success-bg)",
  },
  cancelled: {
    label: "ملغى",
    color: "var(--color-neutral-text)",
    bg: "var(--color-neutral-bg)",
  },
  critical: {
    label: "حرج",
    color: "var(--color-danger-text)",
    bg: "var(--color-danger-bg)",
  },
};
```

**Sub-Tab B: التوصيل (Delivery)**

If delivery adapter is disabled:

```
DO NOT show mock data.
SHOW:
┌──────────────────────────────────────────────────────────────┐
│ ⚠ ربط شركة الشحن غير مفعّل حالياً                          │
│ التوصيلات قيد التتبع اليدوي.                                 │
│ [تفعيل تكامل Bosta] [تفعيل تكامل Aramex] [تكامل مخصص]      │
└──────────────────────────────────────────────────────────────┘
```

When enabled, show:

- Active deliveries table: Status | Order | Driver | Destination | ETA | COD Status | Action
- SLA indicator per delivery

**Sub-Tab C: الفروع والفريق (Branches & Staff)**

- Branch selector dropdown at top: "الكل" | "الفرع 1" | "الفرع 2" | etc.
- Once selected, all data scoped to that branch
- Staff roster table
- Shift schedule
- Task assignments
- Branch-level KPIs strip

---

### MODULE 3: الكاشير (POS — Full-Screen Mode)

**This is not a module to browse. It is a mode the operator enters.**

On entry:

```javascript
// When user navigates to /pos or clicks "جلسة كاشير جديدة"
document.body.classList.add("pos-mode");
// Hide: sidebar, top bar, all navigation chrome
// Show: only the POS layout
```

```css
body.pos-mode .sidebar,
body.pos-mode .topbar,
body.pos-mode .nav {
  display: none;
}
body.pos-mode .pos-layout {
  display: grid;
}
```

POS Layout (RTL, Full Screen):

```
┌──────────────────────────────────────────────────────────────┐
│ [Category Tabs: الكل | اللحوم | المشروبات | الحلويات...]    │
│ [🔍 بحث عن منتج]                    [اسم الكاشير | الفرع]  │
├──────────────────────────────┬───────────────────────────────┤
│                              │  ملخص الطلب                  │
│  PRODUCT GRID (LEFT/RTL)     │  ─────────────────────────── │
│  ┌───────┐ ┌───────┐         │  شاورما دجاج x2    120 ج.م  │
│  │Product│ │Product│         │  بيبسي كبير x1      20 ج.م  │
│  │  Name │ │  Name │         │  ─────────────────────────── │
│  │  25   │ │  15   │         │  الإجمالي قبل الضريبة 140   │
│  │ [+]   │ │ [+]   │         │  الضريبة (14%)        19.6  │
│  └───────┘ └───────┘         │  الإجمالي          159.6 ج.م│
│  Large touch targets 44px+   │                              │
│                              │  العميل: [اختياري]          │
│                              │  ملاحظات: [اختياري]         │
│                              │                              │
│                              │  [طريقة الدفع]              │
│                              │  💵 نقد  💳 بطاقة  📱 محول  │
│                              │                              │
│                              │  ┌────────────────────────┐ │
│                              │  │   [إتمام الدفع]         │ │
│                              │  │  159.6 ج.م              │ │
│                              │  └────────────────────────┘ │
└──────────────────────────────┴───────────────────────────────┘
[← الخروج من وضع الكاشير]
```

On session close:

1. Auto-generate shift summary (feeds → المالية automatically)
2. Offer: "إرسال إيصال واتساب للعميل" (one tap)
3. Option: "بدء جلسة جديدة" or "العودة للرئيسية"

---

### MODULE 4: المحادثات (Conversations — Unified Inbox)

**Kill:** Separate channel tabs (WhatsApp tab | Messenger tab | Instagram tab). This is wrong mental model.

**Replace with:** Unified inbox where channel is metadata, not the primary organizing principle.

**Layout: Two-Pane, RTL**

Left pane (RTL: right side, primary, conversation list):

```
[🔍 بحث بالاسم أو الرقم]
[الكل] [مفتوح] [معلق] [مغلق] [غير معين]
[واتساب ●] [ماسنجر ●] [إنستاجرام ●]

Status strip: مفتوحة: 14 | معلقة: 3 | غير معينة: 2 | مغلقة: 42

Each conversation row (44px):
[Avatar] [Customer Name/Phone] [Last message preview truncated]
         [Channel icon (small)] [Time] [Status badge] [Agent]
```

Right pane (RTL: left side, secondary, active thread):

```
[← رجوع] Customer Name | Phone | Channel Icon | Status

[Message thread, scrollable, chronological]
  Received: Gray bubble, right-aligned (RTL)
  Sent: Blue bubble, left-aligned (RTL)
  Auto-reply: Gray bubble + "رد تلقائي" label

[Customer context strip (collapsible)]
  اسم | هاتف | آخر 5 طلبات | مخاطر الاضطراب | التاجز

[Reply box (bottom)]
  [AI Suggestions — TEAL background]
  "الردود المقترحة:" [Suggestion 1] [Suggestion 2]

  [Text input — RTL]         [📎 إرفاق] [إرسال]

  رد تلقائي: [ON/OFF/يحتاج مراجعة]
```

Channel icons must be SMALL (16px dots, not dominant branding):

- WhatsApp: small green dot only
- Messenger: small blue dot only
- Instagram: small pink dot only

**Never:** Large WhatsApp green header, dominant platform branding

---

### MODULE 5: المكالمات (Calls)

**Kill:** 6 metric cards at the top of the calls screen. Replace with status strip.

**Kill:** "غرفة القيادة" and "سجل نشاط الوكلاء" inside Calls module — move to مركز القيادة.

Status strip (replaces the 6 KPI cards):

```
نشطة: 2  |  في الانتظار: 5  |  مكتملة اليوم: 23  |  معدل الإجابة: 87%
```

Layout: Two-Pane

Left pane: Call queue table

```
Columns (RTL): [إجراء] [الوكيل] [المدة] [الوقت] [المتصل] [الحالة]
Status: 🔴 نشطة | 🟡 معلقة | ✓ مكتملة | ⊘ مفقوتة
```

Active Call Banner (top, persistent when call is live):

```
┌─────────────────────────────────────────────────────────┐
│ 🔴 مكالمة نشطة: محمد أحمد (+2010xxxxxxx) — 02:47       │
│ [ملاحظات] [تحويل] [وضع صامت] [إنهاء المكالمة]         │
└─────────────────────────────────────────────────────────┘
```

Right pane: Call detail + AI context (shown during/after call)

```
اسم المتصل | الهاتف | تاريخ المكالمات السابقة

ملخص الذكاء الاصطناعي (TEAL background):
"استفسار عن طلب متأخر — المشاعر: محبطة — النية: شكوى"
الإجراء المقترح: [تطبيق خصم] [التوجيه للدعم] [إضافة ملاحظة]

ملاحظات: [text area]
التصنيف: استفسار | حجز | شكوى | إعادة توجيه | غير مهتم
```

---

### MODULE 6: المخزون (Inventory — Consolidated from 8 pages to 3 views)

**Current problem:** 8 separate pages (list, insights, suppliers, alerts, expiry, FIFO, duplicate SKUs, forecasts).
**Fix:** Consolidate into 3 coherent views with sub-sections.

**View 1: المنتجات (Products + Priority Table) — DEFAULT**

Status strip:

```
نفاد متوقع: 3  |  تنبيهات: 7  |  طلبات معلقة: 2  |  استلامات متأخرة: 1
```

Priority table (sorted by urgency — days until depletion):

```
Columns (RTL): [إعادة طلب] [الإجراء المقترح (AI)] [توقع الطلب] [حتى النفاد] [المعدل اليومي] [المخزون الحالي] [المنتج]
```

Color coding:

```
أيام حتى النفاد:
< 3 days: var(--color-danger-*)
3-7 days: var(--color-warning-*)
> 7 days: Normal
```

"الإجراء المقترح" column = AI-generated (render with teal background):

```
تنبيه تقصير BAG-001 [TEAL] "أعد الطلب — متوقع النفاد في 3 أيام"
```

Sub-sections (tabs or accordion within View 1):

- نفاد الصلاحية (Expiry Tracking — from the existing expiry page)
- تكرار SKU (Duplicate SKU Detector — from existing)
- FIFO التقييم (FIFO Valuation — from existing)

**View 2: الموردون (Suppliers)**

Supplier cards → Convert to a table. Remove the auto-message toggles from card UI and move to supplier detail page (they affect real behavior, need clear UX).

Table: المورد | المنتجات | آخر طلب | تأخيرات | حالة | إجراء

**View 3: التحليلات (Insights + Forecasts)**

Consolidate:

- Inventory Insights (location/category/COGS tabs)
- Smart Forecasts (requirements/restock/capital/confidence/what-if)

Sub-tabs: الرؤى | التوقعات | الدقة | ماذا لو؟

Forecasting data gate:

```javascript
if (daysOfData < 30) {
  showDataGateNotice(
    "نحتاج 30 يوم من البيانات لعرض التوقعات. ستكون متاحة في: " + targetDate,
  );
} else {
  showForecasts();
}
```

---

### MODULE 7: المالية (Finance — Critical Restructure)

**CRITICAL FIX:** Remove "الاشتراكات" (platform billing) from this module entirely.
Platform billing = Tash8heel's charges to the merchant.
Merchant finance = the merchant's own P&L.
These are different things. Mixing them is a category error that destroys trust.

Move platform billing → الإعدادات → الفواتير والاشتراك

**Kill:** Packages pricing page inside the product. Move to:

- Marketing website for new plans
- الإعدادات → الفواتير for current plan management only

Finance has 5 sub-tabs:

**1: الملخص (Summary)**

- Period selector (default: هذا الشهر)
- Comparison toggle: "مقارنة مع الشهر الماضي" (default ON)
- 3 key metrics: الإيرادات | صافي الدخل | هامش الربح الإجمالي
- Revenue by channel breakdown
- Expense by category breakdown

**2: الإيرادات (Revenue)**
Table: التاريخ | المصدر | المبلغ | حالة COD | ملاحظات
Period selector | Filter | Export always visible

**3: المصروفات (Expenses)**
Table: التاريخ | الفئة | المورد | المبلغ | حالة الموافقة | ملاحظات
Approval workflow: Pending expenses highlighted amber, approval buttons visible

**4: التدفق النقدي (Cash Flow)**

- Simple flow: الرصيد الافتتاحي → التدفقات الداخلة → التدفقات الخارجة → الرصيد الختامي
- 30-day projection
- COD collection queue: "بانتظار التحصيل: 8,200 ج.م من 14 طلب"

**5: التسويات (COD + Reconciliation) — GIVE THIS MORE PROMINENCE**
This is a serious, detailed workflow. Treat it as such.
Table: طريقة الدفع | المتوقع | المحصّل | الفرق | الحالة | إجراء
Payment Proofs + OCR workflow:

- Proof upload
- OCR extraction
- Validation against expected amount
- Variance flagging (red if mismatch > tolerance)

**Finance Access Rules (strictly enforced in the code):**

```javascript
// Operations Manager
financePermissions.opsManager = {
  canView: ["summary", "revenue", "expense_rollup", "branch_comparison"],
  cannotView: ["reconciliation", "cod_detailed", "subscription"],
};

// Branch Manager
financePermissions.branchManager = {
  canView: ["branch_summary_only"],
  cannotView: ["global_finance", "reconciliation", "subscription"],
};

// Finance / Admin / Owner
financePermissions.finance = {
  canView: ["all"],
};
```

---

### MODULE 8: الحملات والعملاء (Merged — Customers + Campaigns)

**Kill:** Separate nav items for العملاء and الحملات. They are the same workflow.

**Replace with:** One nav item "الحملات والعملاء" with two sub-tabs.

**Sub-Tab 1: العملاء (CRM)**

Status strip:

```
إجمالي: 1,247  |  نشطون: 987  |  معرضون للاضطراب: 34  |  VIP: 89
```

Table columns (RTL):

```
[إجراء] [مخاطر الاضطراب %] [آخر طلب] [إجمالي الإنفاق] [الطلبات] [الهاتف] [الاسم]
```

Churn Risk column:

- Red if > 30% (احتمالية الاضطراب مرتفعة)
- Amber if 15-30%
- Normal if < 15%

Row click → Customer detail panel: Purchase history | Tags | Churn signals | Campaign actions

**Sub-Tab 2: الحملات (Campaigns)**

If campaign execution is not production-ready:

```
SHOW the tab. DO NOT hide it. DO NOT show mock data.

SHOW INSTEAD:
┌────────────────────────────────────────────────────┐
│ الحملات قيد التطوير                               │
│ ستكون متاحة في الربع الثالث 2026               │
│                                                    │
│ ما يمكنك فعله الآن:                              │
│ ✓ إنشاء شرائح عملاء                              │
│ ✓ تصدير قائمة العملاء لإرسال يدوي              │
│ ✓ الاطلاع على مخاطر الاضطراب                   │
│                                                    │
│ [إشعرني عند الإطلاق]                              │
└────────────────────────────────────────────────────┘
```

---

### MODULE 9: التوقعات (Forecasting)

**Restructure tabs from 7 to 5. PROMOTE the What-If simulator.**

5 Sub-Tabs:

**1: نظرة عامة (Overview)**
4 KPI cards with confidence scores and data provenance:

- الطلب المتوقع (30 يوم) | الثقة: 87% | بناءً على 90 يوم من البيانات
- التدفق النقدي المتوقع | الثقة: 72%
- نفاد المخزون المحتمل: 3 أصناف
- مخاطر اضطراب العملاء: 34 عميل

**2: الطلب (Demand Forecast)**
Preserve the existing strong demand table. Add:

- Confidence column
- Suggested action column (AI - teal)
- Data provenance: "بناءً على X يوم من البيانات"

**3: التدفق النقدي (Cash Flow Forecast)**
30-day projected cash position
Weekly breakdown: الأسبوع 1 | الأسبوع 2 | الأسبوع 3 | الأسبوع 4
Minimum cash point highlighted if approaching negative

**4: السيناريوهات (What-If — PROMOTE THIS)**

This is the most impressive feature. Currently buried as tab 6 of 7. Fix this.

Add a shortcut to this view:

- From inventory module: "ماذا لو زاد الطلب؟ [افتح السيناريوهات →]"
- From dashboard recommendations

The simulator UI:

```
ماذا لو؟ — محاكي السيناريوهات

اختر سيناريو:
○ ماذا لو زاد الطلب بنسبة ___%؟
○ ماذا لو أغلقنا فرع [اختر] لمدة ___ أيام؟
○ ماذا لو رفعنا الأسعار بنسبة ___%؟
● بناء سيناريو مخصص

[تشغيل السيناريو]

النتائج:
التأثير على الإيرادات: ↑ 18% | التأثير على المخزون: ↑ 3 أصناف
[مقارنة سيناريوين]
```

**5: التنبيهات (Alerts & Anomalies)**
Forecast-based anomalies:

- Low stock: "BAG-001 متوقع النفاد في 5 أيام"
- Churn risk: "علي حسن — 27 يوم — مخاطر 72%"
- Branch performance: "الفرع 2 — انخفاض متوقع 15%"

---

### MODULE 10: الأتمتة (Automations)

**Admin-only. Move to النظام group.**

Status strip:

```
نشطة: 12  |  معطلة: 2  |  أخطاء: 1  |  تشغيل اليوم: 87
```

Automations grouped by category (not flat list):

```
📦 مخزون
  ┌─────────────────────────────────────────────────────┐
  │ [ON] تنبيه نفاد المخزون                           │
  │ يُنبّه عند انخفاض المخزون دون الحد المحدد         │
  │ آخر تشغيل: منذ 2 ساعة ✓  |  تشغيل 14 مرة        │
  │ وفّرت: 3 ساعات عمل يدوي هذا الأسبوع [TEAL]       │
  │ [سجل التشغيل]  [تعديل]                             │
  └─────────────────────────────────────────────────────┘

👥 عملاء
  [Automation cards...]

🔧 تشغيلي
  [Automation cards...]

💰 مالي
  [Automation cards...]
```

Impact measurement is REQUIRED on every card:

```
وفّرت: X ساعة من العمل اليدوي هذا الأسبوع
```

This is the primary retention hook for the automations module.

Pre-built playbooks library (default starting point for new users):

```
📚 مكتبة القواعد الجاهزة
  ○ رد تلقائي على طلبات واتساب
  ○ تنبيه نفاد المخزون
  ○ تسوية COD اليومية
  ○ تقرير الفرع اليومي
  ○ حملة إعادة تفاعل العملاء الخامدين
  [+ إنشاء قاعدة مخصصة]
```

Creation flow (step-by-step wizard, not a form dump):

```
Step 1: اختر المحفّز "متى يتشغل؟"
Step 2: اختر الشرط "إذا كان؟"
Step 3: اختر الإجراء "ماذا يفعل؟"
Step 4: اختبر "جرب على بيانات سابقة"
Step 5: راجع "الأثر المتوقع"
Step 6: فعّل "تشغيل الأتمتة"
```

---

### MODULE 11: مركز القيادة (Command Center — Consolidated)

**Kill:** Intelligence Center, Command Room, Agent Activity Log, Team Tasks as SEPARATE PAGES.
**Replace with:** ONE coherent surface: مركز القيادة

**Access:** Owner + Admin ONLY. Not rendered for any other role.

**How it surfaces in daily flow:**

- A "موافقات معلقة: 2" badge on the sidebar nav item
- An attention item in Block 2 of the dashboard: "2 قرارات بانتظار موافقتك [مراجعة]"

**Agent naming:** Use وكيل [Function] (not INVENTORY_AGENT):

- وكيل المخزون
- وكيل العمليات
- وكيل المبيعات
- وكيل الدعم

**Layout: 4 Sections (Single Page)**

```
SECTION 1: الحالة العامة
Active agents: [وكيل المخزون ● نشط] [وكيل العمليات ● نشط]
Last planner run: "منذ 3 دقائق — ✓ نجح — 3 إجراءات مُشغّلة"
Pending approvals: "2 قرارات بانتظار موافقتك"

SECTION 2: الموافقات المعلقة
Each approval item:
┌────────────────────────────────────────────────────┐
│ وكيل المخزون يقترح:                               │
│ "تطبيق خصم 15% للعميل أحمد (45 يوم بدون طلب)"   │
│ الأساس: مخاطر اضطراب 72%                         │
│ التأثير: خسارة محتملة 150 ج.م مقابل استعادة عميل │
│ [✓ موافقة]  [✗ رفض]  [⏳ تأجيل 24 ساعة]        │
│ منذ: 2 ساعات                                      │
└────────────────────────────────────────────────────┘

SECTION 3: سجل تشغيل الوكلاء (Replaces Agent Activity + Command Room)
Table: الوكيل | الإجراء | الوقت | الحالة | التفاصيل
With filters: الكل | نجح | فشل | معلق

SECTION 4: سجل القرارات (Audit Trail)
All AI actions logged, inspectable, explainable
Filter by: الوكيل | نوع الإجراء | النتيجة | التاريخ
```

**Roadmap page:** Move from Help Center public area to:

- In مركز القيادة: "الوكلاء القادمة" section (admin-readable, no toggles)
- Remove all enable-toggles on unshipped features
- Label states clearly: "متاح ✓" | "بيتا 🔶" | "قريباً ○"

---

### MODULE 12: الإعدادات (Settings — Consolidated)

Must absorb platform billing from المالية.

6 Sub-Sections:

**1: الفريق والأذونات**

- User list table: الاسم | الدور | الحالة | آخر دخول | إجراء
- Roles: مالك | مدير | تشغيل | كاشير | مالية | مخصص
- Add user: Email → invitation
- Security sub-section (from security page):
  - Active sessions table: الجهاز | الموقع | آخر نشاط | [إنهاء]
  - IMPORTANT: Current shows 21 sessions with no device context — fix this
  - Show: Device name (not just IP), last activity, location
  - 2FA toggle
  - Audit log: الإجراء | المستخدم | IP | التاريخ

**2: الفواتير والاشتراك (MOVED FROM FINANCE)**

- Current plan: "أنت على خطة النمو — تجديد في 15 يوم"
- Plan features: what's included, what's locked
- Usage meter (if conversations are capped)
- Invoice history: downloadable
- Payment method on file
- [ترقية الخطة → يفتح الموقع] (links out to website, not in-app pricing page)
- [إلغاء الاشتراك] (gated, requires confirmation)

**3: التكاملات**
Existing POS integrations page is strong — keep it but improve layout.
Supported: Oracle MICROS | Foodics | Odoo | Square | Shopify | Custom API | Google Sheets
Add: Delivery partners | Payment gateways | Accounting software
Status per integration: متصل ✓ | غير متصل ⚠ | إعداد جزئي 🔶
[اختبار الاتصال] button per integration

**4: المتجر والفروع**

- Store profile: Name, logo, description, hours
- Branch management: Add/edit/delete branches
- Operating hours per branch

**5: الإشعارات**
Keep existing notification settings structure — it's solid.
Events × Channels (email/WhatsApp/in-app) grid.
Quiet hours per role.

**6: مساحة العمل**
Language | Timezone | Currency | Data retention
Brand customization (logo, colors) if applicable.

---

## SECTION 5: COMPLETE STATE DESIGN SYSTEM

Every module must handle these states. Build them as reusable components.

### 5.1 Empty State Component

```jsx
// EmptyState component
// NEVER show zero-value metric cards
// NEVER show "0" as if it were meaningful data
// ALWAYS show: what's missing + what to do next

<EmptyState
  icon="📦"
  title="لا توجد منتجات في المخزون بعد"
  action={{ label: "إضافة منتج", href: "/inventory/add" }}
/>
```

Rules:

- Icon: 24px, secondary color
- Title: One-line Arabic explanation
- Action: ONE button only (not two)
- No illustrations
- No English copy
- Background: same as page

### 5.2 Loading State — Skeleton Screens

```jsx
// NEVER use full-page spinner
// NEVER show blank white screen
// ALWAYS show skeleton that matches the layout of the loaded content

// Table skeleton example:
<TableSkeleton
  rows={8}
  columns={["status", "name", "amount", "time", "action"]}
/>
```

Skeleton animation: subtle pulse, 1.5s cycle, 50% opacity.

### 5.3 Error States

```jsx
// System error (API failure):
<ErrorBanner
  message="خطأ في الاتصال. تحقق من الإنترنت وأعد المحاولة."
  action={{ label: "إعادة المحاولة", onClick: retry }}
  type="inline" // not full-page unless entire app is broken
/>

// Form validation:
// Show inline below the specific field. Never at top of form.

// Operation failure:
// Show on the specific row that failed. Expandable for detail.
```

### 5.4 Stale Data Indicators

```jsx
<FreshnessIndicator
  lastUpdated={timestamp}
  // < 5 min: quiet "منذ 2 دقيقة"
  // 5-30 min: secondary "منذ 15 دقيقة"
  // 30-120 min: amber ⚠ "منذ ساعة" + refresh button
  // > 2 hours: red "بيانات قديمة" + prominent refresh
/>
```

AI forecast data must ALWAYS show:

```jsx
<AIForecastMeta
  confidence={87} // "بثقة 87%"
  dataWindow={90} // "بناءً على 90 يوم"
  lastUpdated={timestamp} // "حتى 14 أبريل"
/>
```

### 5.5 Gated Feature State

```jsx
// Visible but not interactive. NEVER hidden entirely.
// NEVER show mock data behind a gate.

<GatedFeature
  featureName="الحملات"
  reason="plan" // "plan" | "coming_soon" | "data_required"
  message="هذه الميزة متوفرة في خطة النمو"
  // OR
  message="قيد التطوير — الربع الثالث 2026"
/>

// Shows as: 40% opacity, lock icon, tooltip on hover
// Does NOT prevent seeing the nav item
```

### 5.6 Approval Pending State

```jsx
<ApprovalPendingItem
  decision="تطبيق خصم 15% للعميل أحمد"
  reason="مخاطر اضطراب 72%"
  impact="خسارة 150 ج.م مقابل استعادة عميل"
  waitingSince={timestamp} // "منذ 2 ساعات"
  waitingFor="مالك"
  onApprove={handleApprove}
  onReject={handleReject}
  onDefer={handleDefer}
/>
```

---

## SECTION 6: RTL IMPLEMENTATION RULES — NON-NEGOTIABLE

These rules apply to every single component you build.

### 6.1 HTML Root

```html
<html dir="rtl" lang="ar"></html>
```

Never override this at the component level unless rendering LTR content (URLs, numbers).

### 6.2 CSS — Use Logical Properties Everywhere

```css
/* ❌ NEVER use these for layout: */
margin-left, margin-right, padding-left, padding-right
left, right (as positioning)
text-align: left, text-align: right
border-left, border-right

/* ✅ ALWAYS use these instead: */
margin-inline-start, margin-inline-end
padding-inline-start, padding-inline-end
inset-inline-start, inset-inline-end
text-align: start, text-align: end
border-inline-start, border-inline-end
```

### 6.3 Layout Rules

```
SIDEBAR:           inset-inline-end: 0  (right side in RTL)
MAIN CONTENT:      margin-inline-end: 240px
FORM LABELS:       text-align: end (right in RTL)
PRIMARY BUTTON:    inline-end position in button group
BREADCRUMBS:       read: الرئيسية > الطلبات > تفاصيل الطلب (right to left)
PROGRESS BARS:     fill from inline-end (right side in RTL)
ARROWS FOR NEXT:   ← (left arrow = forward in RTL)
ARROWS FOR BACK:   → (right arrow = back in RTL)
TABLE PRIMARY COL: rightmost column
TABLE ACTION COL:  leftmost column
```

### 6.4 What "Arabic-First" Means for Copy

Every UI string must be:

1. Written in Arabic first
2. Egyptian Arabic for operational microcopy
3. MSA only for formal documents and legal text
4. Never translated English — write Arabic natively

Tone rules:

- Direct: The most important thing first in every sentence
- No padding: Remove every word that doesn't earn its place
- Active verbs: يشتغل، يُنبّه، يُتابع، يُسجّل
- The word family تشغيل is load-bearing: شغّل، تشغيل، يشتغل — use it
- NEVER use: "ذكاء اصطناعي" as an opening claim, "نقلة نوعية", "حل متكامل" as filler
- NEVER: Exclamation marks in product copy

---

## SECTION 7: AI SURFACING RULES — HOW AI APPEARS IN THE PRODUCT

The AI brain is the underlying intelligence. It surfaces through CONSEQUENCES, not through announcements.

### 7.1 Permitted AI Surfaces

```
✅ Recommendation cards (teal background, --color-ai-*)
✅ Anomaly flags on table rows (teal icon, one-line explanation)
✅ Suggested actions with basis ("اقتراح: أعد الطلب — متوقع النفاد في 3 أيام")
✅ Automated action outcomes in System Activity block (Block 3 of dashboard)
✅ Forecast numbers with confidence scores (87%) and data window (90 يوم)
✅ AI reply suggestions in conversations (teal background, labeled "مقترح")
✅ Auto-reply status indicator (ON/OFF/يحتاج مراجعة)
✅ Approval queue items in مركز القيادة
✅ "وفّرت X ساعة" impact measurement in Automations
✅ Post-call AI summary in Calls module (teal)
```

### 7.2 Forbidden AI Surfaces

```
❌ "مدعوم بالذكاء الاصطناعي" badges anywhere in chrome
❌ "الذكاء الاصطناعي يعمل الآن" spinners
❌ "منصة الذكاء الاصطناعي" as a module header
❌ Decorative AI brain illustrations
❌ "AI Active" indicators
❌ Generic "powered by AI" section dividers
❌ AI vocabulary in module titles
❌ Token counters visible to merchants
❌ Model names visible to merchants
❌ "الذكاء الاصطناعي لاحظ شيئاً" with just a count (must show WHAT it noticed)
```

### 7.3 AI Visual Identity

All AI-generated content uses teal exclusively:

```css
.ai-content {
  background: var(--color-ai-bg); /* #CCFBF1 */
  color: var(--color-ai-text); /* #0F766E */
  border: 1px solid var(--color-ai-border); /* #99F6E4 */
}

/* AI recommendation tag */
.ai-tag::before {
  content: "✦"; /* or use a consistent AI icon */
  font-size: 10px;
  margin-inline-end: var(--space-1);
}
```

---

## SECTION 8: COMPONENT PATTERNS — BUILD THESE ONCE, USE EVERYWHERE

### 8.1 Table Component

```jsx
// All tables follow this pattern
<DataTable
  direction="rtl"
  columns={[
    { key: 'status', label: 'الحالة', width: '100px', position: 'start' }, // rightmost in RTL
    { key: 'name', label: 'الاسم', flex: 1 },
    { key: 'amount', label: 'المبلغ', align: 'start', type: 'currency' }, // numbers: logical start
    { key: 'time', label: 'الوقت', width: '120px' },
    { key: 'action', label: '', width: '80px', position: 'end' }, // leftmost in RTL
  ]}
  rowHeight="standard"        // 44px default
  stickyHeader                // required for long tables
  emptyState={<EmptyState ... />}
  loadingState={<TableSkeleton ... />}
/>
```

### 8.2 Status Badge Component

```jsx
// All status badges use the semantic color system
<StatusBadge status="delayed" />;
// Renders: amber bg + amber text + appropriate label

const STATUS_MAP = {
  active: { label: "نشط", color: "info" },
  delayed: { label: "متأخر", color: "warning" },
  completed: { label: "مكتمل", color: "success" },
  failed: { label: "فشل", color: "danger" },
  cancelled: { label: "ملغى", color: "neutral" },
  pending: { label: "معلق", color: "info" },
  ai: { label: "مقترح", color: "ai" }, // teal only for AI
};
```

### 8.3 Metric KPI Cell

```jsx
// Dashboard pulse strip
<MetricCell
  icon={<OrderIcon />}
  value={14}
  label="الطلبات النشطة"
  trend={{ direction: "up", value: 3, label: "مقارنة بالأمس" }}
  freshness={lastUpdated} // shows freshness indicator
/>
```

### 8.4 Action Item (Block 2 of Dashboard)

```jsx
<ActionItem
  severity="critical" // critical | warning | info
  message="فشل الدفع: طلب #542 (2,400 ج.م)"
  age={timestamp} // renders "منذ ساعة"
  action={{ label: "مراجعة", href: "/orders/542" }}
/>
```

---

## SECTION 9: WHAT TO KILL — EXACT LIST

Kill these completely. Do not preserve, do not hide behind a flag.

| What                                                                   | Where                  | Replace With                                            |
| ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- | ----- | ------------- | ------------ | --------- |
| Black (#000) page backgrounds                                          | Everywhere             | --color-page-bg (#F5F4F1)                               |
| Gold/amber as primary CTA color                                        | Buttons, active states | --color-brand-primary (blue)                            |
| "مدعوم بالذكاء الاصطناعي" badges                                       | All modules            | Nothing. AI shows through consequences.                 |
| "منصة التنبؤات الذكية" module headers                                  | Forecasting header     | "التوقعات"                                              |
| Flat sidebar with 10 items at same weight                              | Navigation             | 5-group structured sidebar                              |
| 7-tab row in Forecasting                                               | Tab bar                | 5-tab restructured: نظرة عامة                           | الطلب | التدفق النقدي | السيناريوهات | التنبيهات |
| Separate "الاشتراكات" tab in المالية                                   | Finance module         | Moved to الإعدادات → الفواتير                           |
| Full-page pricing/packages inside product                              | Packages page          | Link to website + الإعدادات/الفواتير only               |
| Delivery as separate nav item                                          | Sidebar                | Sub-tab inside العمليات                                 |
| Separate العملاء and الحملات nav items                                 | Sidebar                | Merged: الحملات والعملاء                                |
| Intelligence Center, Command Room, Activity, Tasks as 4 separate pages | Sidebar/nav            | Consolidated into مركز القيادة                          |
| Zero-value "0" metric cards on empty state                             | Dashboard              | Progress checklist + demo data                          |
| "مرحباً بك في تشغيل" welcome copy in dashboard                         | Dashboard              | Remove entirely                                         |
| Roadmap with toggles on unshipped features                             | Help Center            | Admin-only section in مركز القيادة, no toggles          |
| Supplier auto-message toggles on the card                              | Supplier cards         | Move to supplier detail page                            |
| 21 active sessions with "terminate all" and no device context          | Security page          | Sessions table with device/location/last-active per row |
| INVENTORY_AGENT, OPS_AGENT technical naming                            | Command center         | وكيل المخزون, وكيل العمليات                             |
| Platform billing mixed in financial reports                            | Finance                | الإعدادات → الفواتير والاشتراك                          |
| KPIs general tab with 11 cards at same hierarchy                       | Reports KPIs           | Reduce to 5-6 with clear priority                       |

---

## SECTION 10: IMPLEMENTATION SEQUENCE — FOLLOW THIS ORDER

**Do not skip phases. Do not parallelize Phase 0 with anything else.**

### PHASE 0 — Foundation (Do First, Everything Depends on This)

1. Implement all CSS custom properties from Section 2.1
2. Set `dir="rtl" lang="ar"` on HTML root
3. Audit every existing CSS file — replace `margin-left/right` with logical properties
4. Replace black backgrounds everywhere with `--color-page-bg`
5. Replace gold primary with `--color-brand-primary` (blue)
6. Implement semantic color system (success/warning/danger/info/ai)
7. Rebuild sidebar with 5-group structure from Section 3.2
8. Implement role-based nav visibility from Section 3.4
9. Remove all "مدعوم بالذكاء الاصطناعي" and "منصة [anything] الذكية" copy

**Phase 0 output:** Product looks completely different. No more black backgrounds, no more flat sidebar, no more AI marketing chrome.

---

### PHASE 1 — Core Daily Modules

10. Redesign لوحة التحكم (Dashboard) — 5 blocks, no charts, daily briefing
11. Build EmptyState component — apply to dashboard empty state
12. Build MetricCell component — apply to Block 1
13. Build ActionItem component — apply to Block 2
14. Redesign العمليات (Operations) — consolidated with 3 sub-tabs
15. Fix الكاشير (POS) — full-screen mode, hide sidebar on entry
16. Build DataTable component — apply to orders table
17. Build StatusBadge component — apply to orders
18. Implement role-based default routing (Section 3.4)

---

### PHASE 2 — Customer and Money Modules

19. Redesign المحادثات (Conversations) — unified inbox, kill channel tabs
20. Redesign المكالمات (Calls) — status strip, kill 6 KPI cards
21. Redesign المالية (Finance) — remove platform billing, 5 sub-tabs
22. Move platform billing → الإعدادات → الفواتير
23. Kill Packages pricing page inside product
24. COD Reconciliation with Payment Proofs — give more prominence in Finance
25. Redesign المخزون (Inventory) — consolidate 8 pages to 3 views
26. Apply freshness indicators everywhere (Section 5.4)

---

### PHASE 3 — Growth and System Modules

27. Merge العملاء + الحملات → الحملات والعملاء (one nav item)
28. Campaigns gating (Section: Gated Feature State)
29. Redesign التوقعات (Forecasting) — 5 tabs, promote السيناريوهات
30. Redesign الأتمتة (Automations) — categories, impact measurement, playbooks
31. Consolidate مركز القيادة (kill 4 separate pages, one coherent surface)
32. Fix agent naming (وكيل المخزون, not INVENTORY_AGENT)
33. Move Roadmap to admin-only, remove toggles
34. Redesign الإعدادات (Settings) — 6 sections, absorb platform billing
35. Fix security page (active sessions with device context, not just IP)

---

### PHASE 4 — States, Polish, and RTL Audit

36. Build all remaining state components (loading, error, warning, approval-pending)
37. Full RTL audit — every page, every component
38. Apply empty-state component to all list views that can be empty
39. Apply stale-data freshness to all metrics
40. Apply gated-feature state to all incomplete features
41. AI forecast provenance (confidence + data window) on all forecast surfaces
42. Review all Arabic copy — Egyptian Arabic operational register
43. Remove every instance of forbidden AI vocabulary (Section 7.2)
44. Test role-based visibility for all 5 user types
45. Test POS full-screen mode (sidebar hidden, chrome suppressed)
46. Validate Arabic copy with native Egyptian Arabic speaker

---

## SECTION 11: INFORMATION TO PRESERVE (DO NOT CHANGE)

These existing patterns are working. Preserve them.

- **KPI Reports tab structure (general/sales/delivery/agents/customers):** Keep 5-tab structure. Only reduce "general" from 11 to 5-6 cards with priority hierarchy.
- **Demand forecast table:** The table layout in the existing Forecasting module's Demand tab is strong — scannable, dense, professional. Keep it as-is, add confidence + suggested action columns.
- **Conversation analytics structure (sources/response times/peak hours):** Strong existing data — keep it, just reposition from buried Reports sub-tab to be more accessible.
- **Notification settings structure (events × channels grid):** Good pattern — preserve it.
- **POS Integrations support (Oracle MICROS/Foodics/Odoo/Square/Shopify/Custom API/Google Sheets):** Working list — preserve and improve layout only.
- **Supplier card structure:** Conceptually right. Remove auto-message toggles from card, move to detail page. Card stays.
- **COD Reconciliation multi-status workflow:** Already serious and detailed. Give it more visual prominence. Don't restructure the logic, just the visual hierarchy.
- **Payment Proofs with OCR:** Keep this feature. It's differentiated. Improve the UI shell but preserve the workflow.
- **Smart Forecasts accuracy metrics:** Keep the accuracy tracking tab — it's unusual and builds trust.

---

## SOURCE AUTHORITY FILES

This prompt was built from the following source documents. If you have questions about any decision, these files are the authority.

**Strategic Authority:**

- TASH8EEL_LOCKED_DECISIONS.md — Fixed ground truth. All decisions upstream from this file.
- TASH8EEL_POSITIONING_PRODUCT_IDENTITY.md — Positioning, buyer, ICP, product personality, tone of voice

**Architecture Authority:**

- TASH8EEL_WORKING_BLUEPRINT.md — Product architecture, navigation, module restructure
- TASH8EEL_IMPLEMENTATION_SPEC.md — Screen inventory, role-gating, navigation spec

**Design Authority:**

- TASH8EEL_BRAND_IDENTITY_PACKAGE.md — Brand personality, voice, color direction
- tash8eel_brand_color_system_final.html — Color system reference

**Build Authority:**

- TASH8EEL_REPO_STATE_SUMMARY.md — What's actually built, what needs care
- Tash8eel_Repo_Audit — Deep repo completeness audit

**Pricing Authority:**

- TASH8EEL_PRICING_AUTHORITY.md — Commercial lanes, feature gating
- TASH8EEL_UNIT_ECONOMICS_AND_PRICING_MODEL.md — Financial model

**AI Authority:**

- TASH8EEL_AI_BEHAVIOR_RULES.md — How AI must behave across all surfaces
- TASH8EEL_AI_COST_MAP.md — AI cost breakdown by feature
- TASH8EEL_KB_RAG_SCHEMA.md — Knowledge base structure

**Reference:**

- TASH8EEL_MERCHANT_EXAMPLES.md — Merchant personas for UX validation

**Ground Truth from 60+ Screenshot Audit (From Chat):**

- Current navigation: الرئيسية · المحادثات · الطلبات · الكاشير · المالية والاشتراك · المخزون · العملاء · التقارير · الإعدادات · المساعدة
- Confirmed modules: Dashboard, Orders (Kanban + Follow-ups + Delivery + Quotes), Finance (Invoices + COD + Payment Proofs + Packages + Expenses + Cash Flow + VAT + Returns + Branch Comparison), Inventory (list + insights + suppliers + alerts + FIFO + duplicate SKU + expiry + Smart Forecasts), Customers (CRM + segments), Reports (conversations + orders + revenue + KPIs), Settings (team + security + audit log + POS integrations)
- Confirmed problems: Zero-state dashboards everywhere, 4 overlapping "center" pages, agent names in English technical format, KPI general tab with 11 cards no hierarchy, supplier auto-message toggles with no UX clarity, security page with 21 sessions and generic terminate-all, roadmap with toggles on unshipped features, platform billing mixed in finance module
- Confirmed what works: KPI 5-tab structure, demand forecast table, conversation analytics, notification settings grid, POS integrations list, COD reconciliation logic, payment proofs OCR, smart forecasts accuracy tab

---

## FINAL VALIDATION CHECKLIST

Before submitting any implementation, validate:

**Visual Foundation:**

- ✅ No black backgrounds anywhere
- ✅ No gold/amber primary buttons
- ✅ Sidebar is on RIGHT side of screen (RTL)
- ✅ All module headers are operational labels (not marketing copy)
- ✅ No "مدعوم بالذكاء الاصطناعي" anywhere

**Navigation:**

- ✅ Sidebar has 5 groups (اليومي, العملاء, المخزون والمالية, النمو, النظام)
- ✅ Role-based visibility works (cashier only sees POS)
- ✅ Delivery is sub-tab of Operations, not separate nav item
- ✅ الحملات + العملاء are merged into one nav item
- ✅ Platform billing moved from Finance to Settings

**UX Flows:**

- ✅ Owner lands on Dashboard
- ✅ Operations Manager lands on Orders queue
- ✅ Cashier auto-launches POS (full screen, sidebar hidden)
- ✅ Finance user lands on Finance Summary
- ✅ Empty states show progress checklist (not zero-value cards)

**AI Surfaces:**

- ✅ No AI marketing chrome
- ✅ AI visible only through consequences (teal color, specific content)
- ✅ All forecasts show confidence % + data window
- ✅ All AI recommendations show basis ("اقتراح بناءً على...")
- ✅ Agent naming uses وكيل [Function] (not INVENTORY_AGENT)

**RTL:**

- ✅ HTML root has dir="rtl" lang="ar"
- ✅ Sidebar on right side
- ✅ All CSS uses logical properties (no margin-left/right)
- ✅ Table column order is RTL (primary rightmost, action leftmost)
- ✅ Button groups: primary button is rightmost
- ✅ Forms: labels to the right of inputs

**States:**

- ✅ Every list view has an empty state component
- ✅ Every loading state is a skeleton (not spinner for main content)
- ✅ Every error state explains what happened and what to do
- ✅ Every metric has freshness indicator
- ✅ Gated features are visible but clearly non-interactive (with explanation)

**Arabic Copy:**

- ✅ Every label, error, empty state is in Arabic
- ✅ Egyptian Arabic register for operational copy
- ✅ No "platform" style filler phrases
- ✅ تشغيل word family used appropriately

---

**This prompt is complete. Begin with Phase 0. Do not skip it.**
