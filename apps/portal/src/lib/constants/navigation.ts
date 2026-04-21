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

export type AppRole =
  | "owner"
  | "admin"
  | "ops_manager"
  | "branch_manager"
  | "cashier"
  | "finance";

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

export const DEFAULT_LANDING_ROUTES: Record<AppRole, string> = {
  owner: "/merchant/dashboard",
  admin: "/merchant/dashboard",
  ops_manager: "/merchant/orders",
  branch_manager: "/merchant/orders",
  cashier: "/merchant/cashier",
  finance: "/merchant/finance/summary",
};

export function normalizePortalRole(role?: string): AppRole {
  const normalized = String(role || "")
    .trim()
    .toUpperCase();

  if (normalized === "OWNER") return "owner";
  if (normalized === "ADMIN") return "admin";
  if (normalized === "CASHIER") return "cashier";
  if (normalized === "FINANCE") return "finance";
  if (normalized === "OPS_MANAGER") return "ops_manager";
  if (normalized === "BRANCH_MANAGER") return "branch_manager";

  if (normalized === "MANAGER") return "ops_manager";
  if (normalized === "AGENT" || normalized === "VIEWER") {
    return "branch_manager";
  }

  return "owner";
}

export const navigationSections: NavigationSection[] = [
  {
    label: "اليومي",
    icon: "grid",
    items: [
      { label: "الرئيسية", href: "/merchant/dashboard", icon: "grid" },
      { label: "العمليات", href: "/merchant/orders", icon: "shopping-cart" },
      { label: "الكاشير", href: "/merchant/cashier", icon: "monitor" },
    ],
  },
  {
    label: "العملاء",
    icon: "message-square",
    items: [
      {
        label: "المحادثات",
        href: "/merchant/conversations",
        icon: "message-square",
      },
      { label: "المكالمات", href: "/merchant/calls", icon: "phone" },
    ],
  },
  {
    label: "المخزون والمالية",
    icon: "package",
    items: [
      { label: "المخزون", href: "/merchant/inventory", icon: "package" },
      { label: "الموردون", href: "/merchant/suppliers", icon: "truck" },
      {
        label: "التوقعات الذكية",
        href: "/merchant/analytics/forecast",
        icon: "trending-up",
      },
      { label: "المالية", href: "/merchant/reports/cfo", icon: "dollar-sign" },
      {
        label: "التسويات",
        href: "/merchant/payments/cod",
        icon: "arrow-left-right",
      },
    ],
  },
  {
    label: "النمو",
    icon: "users",
    items: [
      { label: "الحملات والعملاء", href: "/merchant/customers", icon: "users" },
      {
        label: "الحملات",
        href: "/merchant/campaigns",
        icon: "bell",
        locked: true,
      },
      {
        label: "التوقعات",
        href: "/merchant/forecast",
        icon: "trending-up",
        locked: true,
      },
    ],
  },
  {
    label: "النظام",
    icon: "settings",
    items: [
      { label: "الأتمتة", href: "/merchant/automations", icon: "settings" },
      {
        label: "مركز القيادة",
        href: "/merchant/command-center",
        icon: "monitor",
      },
      { label: "التقارير", href: "/merchant/reports", icon: "bar-chart" },
      {
        label: "الفواتير والاشتراك",
        href: "/merchant/billing",
        icon: "dollar-sign",
      },
      { label: "الإعدادات", href: "/merchant/settings", icon: "settings" },
    ],
  },
];

export const mobilePrimaryTabs = [
  { label: "الرئيسية", href: "/merchant/dashboard", icon: "grid" as const },
  {
    label: "العمليات",
    href: "/merchant/orders",
    icon: "shopping-cart" as const,
  },
  {
    label: "العملاء",
    href: "/merchant/conversations",
    icon: "message-square" as const,
  },
  {
    label: "المخزون",
    href: "/merchant/inventory",
    icon: "package" as const,
  },
  { label: "المزيد", href: "#", icon: "settings" as const },
];
