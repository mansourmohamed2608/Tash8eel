export type NavIconKey =
  | "grid"
  | "help-circle"
  | "message-square"
  | "phone"
  | "info"
  | "settings"
  | "users"
  | "shopping-cart"
  | "monitor"
  | "dollar-sign"
  | "image"
  | "trending-up"
  | "calendar"
  | "truck"
  | "lightbulb"
  | "package"
  | "bar-chart"
  | "alert-triangle"
  | "copy"
  | "star"
  | "arrow-left-right"
  | "bell"
  | "target"
  | "tag"
  | "wallet"
  | "building"
  | "lock"
  | "shield"
  | "upload"
  | "briefcase";

export interface NavigationItem {
  label: string;
  href: string;
  icon: NavIconKey;
  locked?: boolean;
  badge?: string;
}

export interface NavigationSection {
  label: string;
  icon: NavIconKey;
  items: NavigationItem[];
}

export const navigationSections: NavigationSection[] = [
  {
    label: "الرئيسية",
    icon: "grid",
    items: [
      { label: "لوحة التحكم", href: "/dashboard", icon: "grid" },
      {
        label: "البدء السريع",
        href: "/merchant/help",
        icon: "help-circle",
      },
    ],
  },
  {
    label: "المحادثات",
    icon: "message-square",
    items: [
      {
        label: "المحادثات",
        href: "/merchant/conversations",
        icon: "message-square",
      },
      { label: "المكالمات", href: "/merchant/calls", icon: "phone" },
      {
        label: "سجل قرارات الذكاء",
        href: "/merchant/audit/ai-decisions",
        icon: "info",
      },
      {
        label: "سجل نشاط الوكلاء",
        href: "/merchant/agent-activity",
        icon: "info",
      },
      {
        label: "مركز الذكاء",
        href: "/merchant/assistant",
        icon: "settings",
      },
      {
        label: "المهام الجماعية للوكلاء",
        href: "/merchant/agents",
        icon: "users",
      },
    ],
  },
  {
    label: "الطلبات",
    icon: "shopping-cart",
    items: [
      { label: "الطلبات", href: "/merchant/orders", icon: "shopping-cart" },
      { label: "الكاشير", href: "/merchant/cashier", icon: "monitor" },
      { label: "الفواتير", href: "/merchant/billing", icon: "dollar-sign" },
      {
        label: "تحصيل عند الاستلام",
        href: "/merchant/payments/cod",
        icon: "monitor",
      },
      {
        label: "إثبات الدفع",
        href: "/merchant/payments/proofs",
        icon: "image",
      },
      {
        label: "خطي والأسعار",
        href: "/merchant/pricing",
        icon: "trending-up",
      },
      { label: "المتابعات", href: "/merchant/followups", icon: "calendar" },
      {
        label: "سائقو التوصيل",
        href: "/merchant/delivery-drivers",
        icon: "truck",
      },
      {
        label: "اقتراحات وعروض السعر",
        href: "/merchant/feature-requests",
        icon: "lightbulb",
      },
    ],
  },
  {
    label: "المخزون",
    icon: "package",
    items: [
      { label: "المخزون", href: "/merchant/inventory", icon: "package" },
      {
        label: "رؤى المخزون",
        href: "/merchant/inventory-insights",
        icon: "bar-chart",
      },
      { label: "الموردون", href: "/merchant/suppliers", icon: "truck" },
      {
        label: "الأتمتة",
        href: "/merchant/automations",
        icon: "settings",
      },
      {
        label: "توقعات الطلب",
        href: "/merchant/analytics/forecast",
        icon: "trending-up",
      },
      { label: "منصة التنبؤ", href: "/merchant/forecast", icon: "info" },
      {
        label: "تنبيهات الصلاحية",
        href: "/merchant/inventory-insights/expiry-alerts",
        icon: "alert-triangle",
      },
      {
        label: "تقييم المخزون FIFO",
        href: "/merchant/inventory-insights/fifo-valuation",
        icon: "bar-chart",
      },
      {
        label: "دمج المنتجات المكررة",
        href: "/merchant/inventory-insights/sku-merge",
        icon: "copy",
      },
    ],
  },
  {
    label: "العملاء",
    icon: "users",
    items: [
      { label: "العملاء", href: "/merchant/customers", icon: "users" },
      {
        label: "برنامج الولاء",
        href: "/merchant/loyalty",
        icon: "star",
        locked: true,
      },
      {
        label: "التحصيل",
        href: "/merchant/payments",
        icon: "arrow-left-right",
        locked: true,
      },
      {
        label: "فرائح العملاء",
        href: "/merchant/customer-segments",
        icon: "users",
        locked: true,
      },
      {
        label: "الإشعارات",
        href: "/merchant/notifications",
        icon: "bell",
      },
    ],
  },
  {
    label: "التقارير",
    icon: "bar-chart",
    items: [
      {
        label: "التحليلات",
        href: "/merchant/analytics",
        icon: "trending-up",
      },
      { label: "مؤشرات الأداء", href: "/merchant/kpis", icon: "target" },
      { label: "التقارير", href: "/merchant/reports", icon: "bar-chart" },
      {
        label: "ملخص المدير المالي",
        href: "/merchant/reports/cfo",
        icon: "info",
      },
      {
        label: "حزمة المحاسب",
        href: "/merchant/reports/accountant",
        icon: "dollar-sign",
      },
      {
        label: "تقرير الضرائب",
        href: "/merchant/reports/tax",
        icon: "dollar-sign",
      },
      {
        label: "التدفق النقدي",
        href: "/merchant/reports/cash-flow",
        icon: "trending-up",
      },
      {
        label: "تأثير الخصومات",
        href: "/merchant/reports/discount-impact",
        icon: "tag",
      },
      {
        label: "تحليل المرتجعات",
        href: "/merchant/reports/refund-analysis",
        icon: "copy",
      },
      { label: "المصروفات", href: "/merchant/expenses", icon: "wallet" },
      {
        label: "مقارنة الفروع",
        href: "/merchant/branches/comparison",
        icon: "bar-chart",
      },
      { label: "الفروع", href: "/merchant/branches", icon: "building" },
    ],
  },
  {
    label: "الإعدادات",
    icon: "settings",
    items: [
      { label: "الفريق", href: "/merchant/team", icon: "users" },
      { label: "الأمان", href: "/merchant/security", icon: "lock" },
      { label: "سجل التدقيق", href: "/merchant/audit", icon: "shield" },
      {
        label: "POS Integrations",
        href: "/merchant/pos-integrations",
        icon: "monitor",
      },
      { label: "الإعدادات", href: "/merchant/settings", icon: "settings" },
      {
        label: "استيراد/تصدير",
        href: "/merchant/import-export",
        icon: "upload",
      },
      {
        label: "مساعد التاجر",
        href: "/merchant/assistant",
        icon: "briefcase",
      },
    ],
  },
  {
    label: "المساعدة",
    icon: "help-circle",
    items: [
      { label: "مركز المساعدة", href: "/merchant/help", icon: "help-circle" },
      { label: "قادم قريباً", href: "/merchant/roadmap", icon: "star" },
      {
        label: "قاعدة المعرفة",
        href: "/merchant/knowledge-base",
        icon: "info",
        badge: "100%",
      },
    ],
  },
];

export const mobilePrimaryTabs = [
  { label: "الرئيسية", href: "/dashboard", icon: "grid" as const },
  {
    label: "المحادثات",
    href: "/merchant/conversations",
    icon: "message-square" as const,
  },
  {
    label: "الطلبات",
    href: "/merchant/orders",
    icon: "shopping-cart" as const,
  },
  {
    label: "المخزون",
    href: "/merchant/inventory",
    icon: "package" as const,
  },
  { label: "المزيد", href: "#", icon: "settings" as const },
];
