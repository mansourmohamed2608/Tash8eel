export type NavIconKey =
  | "activity"
  | "bar-chart"
  | "building"
  | "dollar-sign"
  | "grid"
  | "help-circle"
  | "message-square"
  | "monitor"
  | "package"
  | "phone"
  | "settings"
  | "shopping-cart"
  | "trending-up"
  | "truck"
  | "users";

export type AppRole =
  | "owner"
  | "admin"
  | "ops_manager"
  | "branch_manager"
  | "cashier"
  | "finance";

export type NavFeatureKey =
  | "conversations"
  | "inventory"
  | "payments"
  | "notifications"
  | "analytics"
  | "kpis"
  | "vision"
  | "loyalty"
  | "reports"
  | "team"
  | "webhooks"
  | "apiAccess"
  | "audit"
  | "cashier";

export interface AuthorityNavigationItem {
  label: string;
  href: string;
  icon: NavIconKey;
  roles: AppRole[];
  featureKey?: NavFeatureKey;
  children?: AuthorityNavigationItem[];
}

export interface AuthorityNavigationSection {
  id: string;
  label: string;
  icon: NavIconKey;
  subdued?: boolean;
  roles: AppRole[];
  items: AuthorityNavigationItem[];
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

const ALL_EXCEPT_CASHIER: AppRole[] = [
  "owner",
  "admin",
  "ops_manager",
  "branch_manager",
  "finance",
];

const OPS_ROLES: AppRole[] = [
  "owner",
  "admin",
  "ops_manager",
  "branch_manager",
];

const OWNER_ADMIN: AppRole[] = ["owner", "admin"];
const MANAGER_PLUS: AppRole[] = ["owner", "admin", "ops_manager"];

export const AUTHORITY_NAVIGATION: AuthorityNavigationSection[] = [
  {
    id: "daily",
    label: "اليومي",
    icon: "grid",
    roles: ["owner", "admin", "ops_manager", "branch_manager", "cashier"],
    items: [
      {
        label: "الرئيسية",
        href: "/merchant/dashboard",
        icon: "grid",
        roles: ALL_EXCEPT_CASHIER,
      },
      {
        label: "العمليات",
        href: "/merchant/orders",
        icon: "shopping-cart",
        roles: OPS_ROLES,
        children: [
          {
            label: "الطلبات",
            href: "/merchant/orders",
            icon: "shopping-cart",
            roles: OPS_ROLES,
          },
          {
            label: "التوصيل",
            href: "/merchant/delivery-drivers",
            icon: "truck",
            roles: OPS_ROLES,
          },
        ],
      },
      {
        label: "الكاشير",
        href: "/merchant/cashier",
        icon: "monitor",
        roles: ["owner", "admin", "ops_manager", "branch_manager", "cashier"],
        featureKey: "cashier",
      },
    ],
  },
  {
    id: "customers",
    label: "العملاء",
    icon: "message-square",
    roles: OPS_ROLES,
    items: [
      {
        label: "المحادثات",
        href: "/merchant/conversations",
        icon: "message-square",
        roles: OPS_ROLES,
        featureKey: "conversations",
      },
      {
        label: "المكالمات",
        href: "/merchant/calls",
        icon: "phone",
        roles: OPS_ROLES,
        featureKey: "conversations",
      },
    ],
  },
  {
    id: "inventory-finance",
    label: "المخزون والمالية",
    icon: "package",
    roles: ALL_EXCEPT_CASHIER,
    items: [
      {
        label: "المخزون",
        href: "/merchant/inventory",
        icon: "package",
        roles: OPS_ROLES,
        featureKey: "inventory",
        children: [
          {
            label: "قائمة المنتجات",
            href: "/merchant/inventory",
            icon: "package",
            roles: OPS_ROLES,
            featureKey: "inventory",
          },
          {
            label: "الموردون",
            href: "/merchant/suppliers",
            icon: "truck",
            roles: OPS_ROLES,
            featureKey: "inventory",
          },
          {
            label: "التوقعات الذكية",
            href: "/merchant/analytics/forecast",
            icon: "trending-up",
            roles: OPS_ROLES,
            featureKey: "inventory",
          },
        ],
      },
      {
        label: "المالية",
        href: "/merchant/finance/summary",
        icon: "dollar-sign",
        roles: ["owner", "admin", "finance"],
        featureKey: "reports",
        children: [
          {
            label: "الملخص",
            href: "/merchant/finance/summary",
            icon: "dollar-sign",
            roles: ["owner", "admin", "finance"],
            featureKey: "reports",
          },
          {
            label: "الإيرادات",
            href: "/merchant/finance/revenue",
            icon: "bar-chart",
            roles: ["owner", "admin", "finance"],
            featureKey: "reports",
          },
          {
            label: "المصروفات",
            href: "/merchant/expenses",
            icon: "dollar-sign",
            roles: ["owner", "admin", "finance"],
            featureKey: "reports",
          },
          {
            label: "التدفق النقدي",
            href: "/merchant/reports/cash-flow",
            icon: "trending-up",
            roles: ["owner", "admin", "finance"],
            featureKey: "reports",
          },
          {
            label: "التسويات",
            href: "/merchant/payments/cod",
            icon: "dollar-sign",
            roles: ["owner", "admin", "finance"],
            featureKey: "reports",
          },
        ],
      },
    ],
  },
  {
    id: "growth",
    label: "النمو",
    icon: "users",
    roles: MANAGER_PLUS,
    items: [
      {
        label: "الحملات والعملاء",
        href: "/merchant/customers",
        icon: "users",
        roles: MANAGER_PLUS,
        featureKey: "loyalty",
        children: [
          {
            label: "العملاء",
            href: "/merchant/customers",
            icon: "users",
            roles: MANAGER_PLUS,
            featureKey: "loyalty",
          },
          {
            label: "الحملات",
            href: "/merchant/campaigns",
            icon: "users",
            roles: MANAGER_PLUS,
            featureKey: "loyalty",
          },
        ],
      },
      {
        label: "التوقعات",
        href: "/merchant/forecast",
        icon: "trending-up",
        roles: MANAGER_PLUS,
        featureKey: "analytics",
      },
    ],
  },
  {
    id: "system",
    label: "النظام",
    icon: "settings",
    subdued: true,
    roles: ["owner", "admin", "ops_manager", "branch_manager", "finance"],
    items: [
      {
        label: "الأتمتة",
        href: "/merchant/automations",
        icon: "settings",
        roles: OWNER_ADMIN,
      },
      {
        label: "مركز القيادة",
        href: "/merchant/command-center",
        icon: "monitor",
        roles: OWNER_ADMIN,
      },
      {
        label: "التقارير",
        href: "/merchant/reports",
        icon: "bar-chart",
        roles: ["owner", "admin", "ops_manager", "branch_manager", "finance"],
        featureKey: "reports",
      },
      {
        label: "الإعدادات",
        href: "/merchant/settings",
        icon: "settings",
        roles: OWNER_ADMIN,
        children: [
          {
            label: "الفريق والأذونات",
            href: "/merchant/team",
            icon: "users",
            roles: OWNER_ADMIN,
            featureKey: "team",
          },
          {
            label: "الفواتير والاشتراك",
            href: "/merchant/billing",
            icon: "dollar-sign",
            roles: OWNER_ADMIN,
          },
          {
            label: "التكاملات",
            href: "/merchant/pos-integrations",
            icon: "settings",
            roles: OWNER_ADMIN,
            featureKey: "webhooks",
          },
          {
            label: "المتجر والفروع",
            href: "/merchant/branches",
            icon: "building",
            roles: OWNER_ADMIN,
          },
          {
            label: "الإشعارات",
            href: "/merchant/notifications",
            icon: "settings",
            roles: OWNER_ADMIN,
            featureKey: "notifications",
          },
          {
            label: "مساحة العمل",
            href: "/merchant/settings?tab=workspace",
            icon: "settings",
            roles: OWNER_ADMIN,
          },
        ],
      },
    ],
  },
];
