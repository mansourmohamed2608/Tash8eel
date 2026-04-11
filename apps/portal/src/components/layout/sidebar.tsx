"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  Bell,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  Users,
  AlertTriangle,
  Activity,
  FileText,
  LogOut,
  Shield,
  Upload,
  UserCog,
  Star,
  TrendingUp,
  LineChart,
  ScanLine,
  Target,
  Lock,
  Brain,
  Bot,
  Lightbulb,
  HelpCircle,
  LifeBuoy,
  RefreshCw,
  Tag,
  Wallet,
  ClipboardList,
  Receipt,
  Cpu,
  DollarSign,
  UsersRound,
  Megaphone,
  UserCheck,
  Banknote,
  PhoneCall,
  Truck,
  Store,
  Image,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiStatusIndicator } from "./api-status";
import { NotificationsPopover } from "./notifications-popover";
import { merchantApi } from "@/lib/client";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Role hierarchy for RBAC
const ROLE_LEVEL: Record<string, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  AGENT: 40,
  CASHIER: 30,
  VIEWER: 20,
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  featureKey?: string; // Maps to merchant.features
  agentKey?: string; // Maps to merchant.enabledAgents
  upgradeText?: string; // Text to show in upgrade prompt
  minRole?: string; // Minimum role required (e.g., 'OWNER', 'ADMIN')
  hidden?: boolean; // Hide from sidebar (coming_soon features)
}

interface ProcessedNavItem extends NavItem {
  disabled: boolean;
  roleBlocked: boolean;
  hiddenBlocked: boolean;
}

interface SectionNavItem {
  href: string;
  label?: string;
  featureKey?: string;
}

interface MerchantSidebarSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: SectionNavItem[];
}

const merchantNavItems: NavItem[] = [
  // OPERATIONS AGENT (أولاً)
  { href: "/merchant/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  {
    href: "/merchant/conversations",
    label: "المحادثات",
    icon: MessageSquare,
    featureKey: "conversations",
  },
  {
    href: "/merchant/calls",
    label: "المكالمات",
    icon: PhoneCall,
    featureKey: "conversations",
  },
  { href: "/merchant/orders", label: "الطلبات", icon: ShoppingCart },
  {
    href: "/merchant/cashier",
    label: "الكاشير",
    icon: Banknote,
    featureKey: "cashier",
  },
  { href: "/merchant/followups", label: "المتابعات", icon: ClipboardList },
  { href: "/merchant/delivery-drivers", label: "سائقي التوصيل", icon: Truck },
  { href: "/merchant/customers", label: "العملاء", icon: Users },
  {
    href: "/merchant/analytics",
    label: "التحليلات",
    icon: LineChart,
    featureKey: "analytics",
  },
  {
    href: "/merchant/kpis",
    label: "مؤشرات الأداء",
    icon: Target,
    featureKey: "kpis",
    upgradeText: "ترقية لمؤشرات الأداء",
  },
  {
    href: "/merchant/loyalty",
    label: "برنامج الولاء",
    icon: Star,
    featureKey: "loyalty",
    agentKey: "MARKETING_AGENT",
    upgradeText: "ترقية لبرنامج الولاء",
  },
  {
    href: "/merchant/notifications",
    label: "صندوق الإشعارات",
    icon: Bell,
    featureKey: "notifications",
  },

  // INVENTORY AGENT (ثانياً)
  {
    href: "/merchant/inventory",
    label: "المخزون",
    icon: Package,
    featureKey: "inventory",
    upgradeText: "ترقية لإدارة المخزون",
  },
  {
    href: "/merchant/inventory-insights",
    label: "رؤى المخزون",
    icon: BarChart3,
    featureKey: "inventory",
    upgradeText: "ترقية لإدارة المخزون",
  },
  {
    href: "/merchant/inventory-insights/expiry-alerts",
    label: "تنبيهات الصلاحية",
    icon: AlertTriangle,
    featureKey: "inventory",
    upgradeText: "ترقية لإدارة المخزون",
  },
  {
    href: "/merchant/inventory-insights/fifo-valuation",
    label: "تقييم المخزون (الوارد أولاً صادر أولاً)",
    icon: BarChart3,
    featureKey: "inventory",
    upgradeText: "ترقية لإدارة المخزون",
  },
  {
    href: "/merchant/inventory-insights/sku-merge",
    label: "دمج المنتجات المكررة",
    icon: ScanLine,
    featureKey: "inventory",
    upgradeText: "ترقية لإدارة المخزون",
  },
  {
    href: "/merchant/pos-integrations",
    label: "POS Integrations",
    icon: Store,
    featureKey: "webhooks",
    upgradeText: "ترقية لتفعيل POS Integrations",
  },
  { href: "/merchant/import-export", label: "استيراد/تصدير", icon: Upload },

  // SUPPLIER & AUTOMATION SECTION
  {
    href: "/merchant/suppliers",
    label: "الموردون",
    icon: Truck,
    featureKey: "inventory",
    upgradeText: "ترقية لإدارة الموردين",
  },
  {
    href: "/merchant/automations",
    label: "محرك الأتمتة",
    icon: Cpu,
    featureKey: "inventory",
    upgradeText: "ترقية لتفعيل الأتمتة",
  },
  {
    href: "/merchant/analytics/forecast",
    label: "توقعات الطلب",
    icon: TrendingUp,
    featureKey: "inventory",
    upgradeText: "ترقية لتوقعات الطلب",
  },
  {
    href: "/merchant/forecast",
    label: "منصة التنبؤات",
    icon: Brain,
    featureKey: "inventory",
    upgradeText: "ترقية لمنصة التنبؤات الذكية",
  },

  // FINANCE AGENT (ثالثاً)
  {
    href: "/merchant/campaigns",
    label: "الحملات",
    icon: Megaphone,
    hidden: true,
  }, // MARKETING_AGENT coming_soon
  {
    href: "/merchant/customer-segments",
    label: "شرائح العملاء",
    icon: UserCheck,
    hidden: true,
  }, // MARKETING_AGENT coming_soon
  {
    href: "/merchant/reports",
    label: "التقارير",
    icon: BarChart3,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
  },
  {
    href: "/merchant/reports/cfo",
    label: "ملخص المدير المالي",
    icon: FileText,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
  },
  {
    href: "/merchant/reports/accountant",
    label: "حزمة المحاسب",
    icon: Receipt,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
    minRole: "ADMIN",
  },
  {
    href: "/merchant/reports/tax",
    label: "تقرير الضرائب",
    icon: Receipt,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
  },
  {
    href: "/merchant/reports/cash-flow",
    label: "التدفق النقدي",
    icon: TrendingUp,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
  },
  {
    href: "/merchant/reports/discount-impact",
    label: "تأثير الخصومات",
    icon: Tag,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
  },
  {
    href: "/merchant/reports/refund-analysis",
    label: "تحليل المرتجعات",
    icon: RefreshCw,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
  },
  {
    href: "/merchant/expenses",
    label: "المصروفات",
    icon: Wallet,
    featureKey: "reports",
    upgradeText: "ترقية للمصروفات",
  },
  {
    href: "/merchant/branches",
    label: "الفروع",
    icon: Building2,
    featureKey: "reports",
    upgradeText: "ترقية لإدارة الفروع",
  },
  {
    href: "/merchant/branches/comparison",
    label: "مقارنة الفروع",
    icon: BarChart3,
    featureKey: "reports",
    upgradeText: "ترقية لمقارنة الفروع",
  },
  {
    href: "/merchant/payments/cod",
    label: "تحصيل عند الاستلام",
    icon: Banknote,
    featureKey: "reports",
    upgradeText: "ترقية للتقارير المتقدمة",
  },
  { href: "/merchant/payments/proofs", label: "إثباتات الدفع", icon: Image },
  { href: "/merchant/billing", label: "الفواتير", icon: DollarSign },
  { href: "/merchant/plan", label: "خطتي والأسعار", icon: TrendingUp },

  // OTHER (أخيراً)
  { href: "/merchant/assistant", label: "مساعد التاجر", icon: Bot },
  { href: "/merchant/agents", label: "مركز الذكاء", icon: Cpu },
  { href: "/merchant/agent-activity", label: "سجل نشاط الوكلاء", icon: Brain },
  {
    href: "/merchant/teams",
    label: "المهام الجماعية للوكلاء",
    icon: UsersRound,
  },
  {
    href: "/merchant/team",
    label: "الفريق",
    icon: UserCog,
    featureKey: "team",
    upgradeText: "ترقية لإدارة الفريق",
    minRole: "OWNER",
  },
  { href: "/merchant/knowledge-base", label: "قاعدة المعرفة", icon: Brain },
  {
    href: "/merchant/feature-requests",
    label: "الاقتراحات وعروض السعر",
    icon: Lightbulb,
  },
  { href: "/merchant/onboarding", label: "البدء السريع", icon: HelpCircle },
  { href: "/merchant/help", label: "مركز المساعدة", icon: LifeBuoy },
  {
    href: "/merchant/audit",
    label: "سجل التدقيق",
    icon: Shield,
    featureKey: "audit",
    upgradeText: "ترقية لسجل التدقيق",
    minRole: "ADMIN",
  },
  {
    href: "/merchant/audit/ai-decisions",
    label: "سجل قرارات الذكاء",
    icon: Brain,
    featureKey: "audit",
    upgradeText: "ترقية لسجل التدقيق",
    minRole: "ADMIN",
  },
  { href: "/merchant/security", label: "الأمان", icon: Lock, minRole: "ADMIN" },
  { href: "/merchant/roadmap", label: "قادم قريباً", icon: Star },
  {
    href: "/merchant/settings",
    label: "الإعدادات",
    icon: Settings,
    minRole: "ADMIN",
  },
];

const adminNavItems: NavItem[] = [
  { href: "/admin/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/admin/merchants", label: "التجار", icon: Users },
  { href: "/admin/entitlements", label: "الصلاحيات", icon: Shield },
  { href: "/admin/offers", label: "عروض الاشتراك", icon: Tag },
  { href: "/admin/dlq", label: "DLQ", icon: AlertTriangle },
  { href: "/admin/analytics", label: "التحليلات", icon: Activity },
  {
    href: "/admin/feature-requests",
    label: "اقتراحات الميزات",
    icon: Lightbulb,
  },
  { href: "/admin/audit-logs", label: "سجل النشاط", icon: FileText },
];

const MERCHANT_SECTION_STORAGE_KEY = "merchant-sidebar-open-section";

const MERCHANT_SECTION_CONFIG: MerchantSidebarSection[] = [
  {
    id: "main",
    label: "الرئيسية",
    icon: LayoutDashboard,
    items: [
      { href: "/merchant/dashboard", label: "لوحة التحكم" },
      { href: "/merchant/onboarding", label: "البدء السريع" },
    ],
  },
  {
    id: "conversations",
    label: "المحادثات",
    icon: MessageSquare,
    items: [
      { href: "/merchant/conversations", label: "المحادثات" },
      { href: "/merchant/calls", label: "المكالمات" },
      {
        href: "/merchant/audit/ai-decisions",
        label: "سجل قرارات الذكاء",
      },
      { href: "/merchant/agent-activity", label: "سجل نشاط الوكلاء" },
      { href: "/merchant/agents", label: "مركز الذكاء" },
      { href: "/merchant/teams", label: "المهام الجماعية للوكلاء" },
    ],
  },
  {
    id: "orders",
    label: "الطلبات",
    icon: ShoppingCart,
    items: [
      { href: "/merchant/orders", label: "الطلبات" },
      {
        href: "/merchant/cashier",
        label: "الكاشير",
        featureKey: "cashier",
      },
      { href: "/merchant/billing", label: "الفواتير" },
      { href: "/merchant/payments/cod", label: "تحصيل عند الاستلام" },
      { href: "/merchant/payments/proofs", label: "إثبات الدفع" },
      { href: "/merchant/plan", label: "خطي والأسعار" },
      { href: "/merchant/followups", label: "المتابعات" },
      { href: "/merchant/delivery-drivers", label: "سائقو التوصيل" },
      { href: "/merchant/feature-requests", label: "اقتراحات وعروض السعر" },
    ],
  },
  {
    id: "inventory",
    label: "المخزون",
    icon: Package,
    items: [
      { href: "/merchant/inventory", label: "المخزون" },
      { href: "/merchant/inventory-insights", label: "رؤى المخزون" },
      { href: "/merchant/suppliers", label: "الموردون" },
      { href: "/merchant/automations", label: "الأتمتة" },
      { href: "/merchant/analytics/forecast", label: "توقعات الطلب" },
      { href: "/merchant/forecast", label: "منصة التنبؤ" },
      {
        href: "/merchant/inventory-insights/expiry-alerts",
        label: "تنبيهات الصلاحية",
      },
      {
        href: "/merchant/inventory-insights/fifo-valuation",
        label: "تقييم المخزون FIFO",
      },
      {
        href: "/merchant/inventory-insights/sku-merge",
        label: "دمج المنتجات المكررة",
      },
    ],
  },
  {
    id: "customers",
    label: "العملاء",
    icon: Users,
    items: [
      { href: "/merchant/customers", label: "العملاء" },
      { href: "/merchant/loyalty", label: "برنامج الولاء" },
      { href: "/merchant/campaigns", label: "الحملات" },
      { href: "/merchant/customer-segments", label: "شرائح العملاء" },
      { href: "/merchant/notifications", label: "الإشعارات" },
    ],
  },
  {
    id: "reports",
    label: "التقارير",
    icon: BarChart3,
    items: [
      { href: "/merchant/analytics", label: "التحليلات" },
      { href: "/merchant/kpis", label: "مؤشرات الأداء" },
      { href: "/merchant/reports", label: "التقارير" },
      { href: "/merchant/reports/cfo", label: "ملخص المدير المالي" },
      { href: "/merchant/reports/accountant", label: "حزمة المحاسب" },
      { href: "/merchant/reports/tax", label: "تقرير الضرائب" },
      { href: "/merchant/reports/cash-flow", label: "التدفق النقدي" },
      { href: "/merchant/reports/discount-impact", label: "تأثير الخصومات" },
      { href: "/merchant/reports/refund-analysis", label: "تحليل المرتجعات" },
      { href: "/merchant/expenses", label: "المصروفات" },
      { href: "/merchant/branches/comparison", label: "مقارنة الفروع" },
      { href: "/merchant/branches", label: "الفروع" },
    ],
  },
  {
    id: "settings",
    label: "الإعدادات",
    icon: Settings,
    items: [
      { href: "/merchant/team", label: "الفريق" },
      { href: "/merchant/security", label: "الأمان" },
      { href: "/merchant/audit", label: "سجل التدقيق" },
      { href: "/merchant/pos-integrations", label: "POS Integrations" },
      { href: "/merchant/settings", label: "الإعدادات" },
      { href: "/merchant/import-export", label: "استيراد/تصدير" },
      { href: "/merchant/assistant", label: "مساعد التاجر" },
    ],
  },
  {
    id: "help",
    label: "المساعدة",
    icon: HelpCircle,
    items: [
      { href: "/merchant/help", label: "مركز المساعدة" },
      { href: "/merchant/roadmap", label: "قادم قريباً" },
      { href: "/merchant/knowledge-base", label: "قاعدة المعرفة" },
    ],
  },
];

const CASHIER_ONLY_SECTION_CONFIG: MerchantSidebarSection[] = [
  {
    id: "cashier",
    label: "الكاشير",
    icon: Banknote,
    items: [{ href: "/merchant/cashier", label: "الكاشير" }],
  },
];

interface SidebarProps {
  role: "merchant" | "admin";
  merchantName?: string;
  merchantId?: string;
  apiKey?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  userRole?: string; // Staff role: OWNER, ADMIN, MANAGER, AGENT, CASHIER, VIEWER
  enabledAgents?: string[];
  features?: {
    inventory?: boolean;
    reports?: boolean;
    conversations?: boolean;
    analytics?: boolean;
    webhooks?: boolean;
    team?: boolean;
    audit?: boolean;
    payments?: boolean;
    vision?: boolean;
    kpis?: boolean;
    loyalty?: boolean;
    voiceNotes?: boolean;
    notifications?: boolean;
    apiAccess?: boolean;
    cashier?: boolean;
  };
}

export function Sidebar({
  role,
  merchantName,
  features,
  enabledAgents,
  merchantId,
  apiKey,
  collapsed: collapsedProp,
  onCollapsedChange,
  userRole,
}: SidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [kbCompletion, setKbCompletion] = useState<number | null>(null);
  const [kbSyncing, setKbSyncing] = useState(false);
  const [kbLastUpdated, setKbLastUpdated] = useState<number | null>(null);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(
    null,
  );

  const collapsed =
    typeof collapsedProp === "boolean" ? collapsedProp : internalCollapsed;

  const setCollapsed = (next: boolean) => {
    if (typeof collapsedProp !== "boolean") {
      setInternalCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  // Process nav items: show all but mark disabled features or RBAC-restricted
  const processedNavItems = useMemo<ProcessedNavItem[]>(() => {
    if (role !== "merchant") {
      return adminNavItems.map((item) => ({
        ...item,
        disabled: false,
        roleBlocked: false,
        hiddenBlocked: false,
      }));
    }

    return merchantNavItems.map((item) => {
      // Check role-based restriction first
      const userLevel = ROLE_LEVEL[userRole || "OWNER"] ?? 0;
      const requiredLevel = item.minRole
        ? (ROLE_LEVEL[item.minRole] ?? 100)
        : 0;
      const roleBlocked = userLevel < requiredLevel;

      // Check feature gate
      let featureDisabled = false;
      if (item.featureKey && features) {
        featureDisabled =
          features[item.featureKey as keyof typeof features] === false;
      }

      const agentDisabled =
        !!item.agentKey &&
        Array.isArray(enabledAgents) &&
        !enabledAgents.includes(item.agentKey);

      const hiddenBlocked = !!item.hidden;

      return {
        ...item,
        disabled:
          featureDisabled || roleBlocked || agentDisabled || hiddenBlocked,
        roleBlocked,
        hiddenBlocked,
      };
    });
  }, [role, features, userRole, enabledAgents]);

  const navItems = processedNavItems;
  const title = role === "merchant" ? "تشغيل" : "تشغيل - لوحة الإدارة";

  const isItemActive = (href: string, hrefs: string[]) => {
    const isExact = pathname === href;
    const isPrefix = pathname.startsWith(href + "/");
    const hasMoreSpecificMatch =
      isPrefix &&
      hrefs.some(
        (otherHref) =>
          otherHref !== href &&
          otherHref.startsWith(href + "/") &&
          (pathname === otherHref || pathname.startsWith(otherHref + "/")),
      );

    return isExact || (isPrefix && !hasMoreSpecificMatch);
  };

  const merchantSections = useMemo(() => {
    if (role !== "merchant") return [];

    const navByHref = new Map(navItems.map((item) => [item.href, item]));
    const usedHrefs = new Set<string>();
    const sectionConfig =
      userRole === "CASHIER"
        ? CASHIER_ONLY_SECTION_CONFIG
        : MERCHANT_SECTION_CONFIG;

    const sections = sectionConfig.map((section) => {
      const items = section.items
        .map((mappedItem) => {
          const sourceItem = navByHref.get(mappedItem.href);
          if (!sourceItem) return null;
          usedHrefs.add(mappedItem.href);
          return {
            ...sourceItem,
            label: mappedItem.label || sourceItem.label,
          };
        })
        .filter(Boolean) as ProcessedNavItem[];

      return {
        ...section,
        items,
      };
    });

    const uncategorizedItems = navItems.filter(
      (item) => !usedHrefs.has(item.href),
    );

    if (uncategorizedItems.length > 0) {
      const helpSection = sections.find((section) => section.id === "help");
      if (helpSection) {
        helpSection.items.push(...uncategorizedItems);
      }
    }

    return sections;
  }, [role, navItems, userRole]);

  const merchantSectionItemHrefs = useMemo(
    () =>
      merchantSections.flatMap((section) =>
        section.items.map((item) => item.href),
      ),
    [merchantSections],
  );

  const activeMerchantSectionId = useMemo(() => {
    if (role !== "merchant") return null;

    return (
      merchantSections.find((section) =>
        section.items.some((item) =>
          isItemActive(item.href, merchantSectionItemHrefs),
        ),
      )?.id ?? null
    );
  }, [role, merchantSections, merchantSectionItemHrefs, pathname]);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (role !== "merchant" || typeof window === "undefined") return;

    const savedSection = window.localStorage.getItem(
      MERCHANT_SECTION_STORAGE_KEY,
    );

    if (
      savedSection &&
      merchantSections.some((section) => section.id === savedSection)
    ) {
      setExpandedSectionId(savedSection);
      return;
    }

    setExpandedSectionId(merchantSections[0]?.id ?? null);
  }, [role, merchantSections]);

  useEffect(() => {
    if (role !== "merchant" || !activeMerchantSectionId) return;

    setExpandedSectionId((previous) =>
      previous === activeMerchantSectionId ? previous : activeMerchantSectionId,
    );

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        MERCHANT_SECTION_STORAGE_KEY,
        activeMerchantSectionId,
      );
    }
  }, [role, activeMerchantSectionId]);

  useEffect(() => {
    if (role !== "merchant" || !merchantId || !apiKey) return;
    let cancelled = false;
    const loadKbStatus = async () => {
      try {
        if (typeof window !== "undefined") {
          const cachedRaw = window.localStorage.getItem(
            `kbCompletion:${merchantId}`,
          );
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (
              cached &&
              typeof cached.value === "number" &&
              Date.now() - cached.ts < 10 * 60 * 1000
            ) {
              setKbCompletion(cached.value);
              setKbLastUpdated(cached.ts);
              return;
            }
          }
        }
        setKbSyncing(true);
        const [kbResponse, catalogResponse] = await Promise.all([
          merchantApi.getKnowledgeBase(merchantId, apiKey).catch(() => null),
          merchantApi
            .getCatalogItems(merchantId, apiKey)
            .catch(() => ({ items: [] })),
        ]);

        const businessInfo = (kbResponse?.businessInfo || {}) as any;
        const faqs = Array.isArray(kbResponse?.faqs)
          ? kbResponse.faqs.filter((f: any) => f && f.isActive !== false)
          : [];
        const menuCount = catalogResponse?.items?.length || 0;

        const deliveryPricing = businessInfo.deliveryPricing || {};
        const deliveryPricingOk =
          deliveryPricing.mode === "BY_CITY"
            ? Array.isArray(deliveryPricing.byCity) &&
              deliveryPricing.byCity.length > 0
            : deliveryPricing.unifiedPrice !== undefined &&
              deliveryPricing.unifiedPrice !== null &&
              deliveryPricing.unifiedPrice !== "";

        const checklist = [
          Boolean(businessInfo.name) && Boolean(businessInfo.category),
          Boolean(
            businessInfo.phone || businessInfo.whatsapp || businessInfo.website,
          ),
          menuCount >= 5,
          faqs.length >= 3,
          Boolean(
            businessInfo.policies?.deliveryInfo ||
            businessInfo.policies?.returnPolicy ||
            (businessInfo.policies?.paymentMethods &&
              businessInfo.policies.paymentMethods.length > 0),
          ),
          deliveryPricingOk,
        ];

        const completed = checklist.filter(Boolean).length;
        const percent = Math.round((completed / checklist.length) * 100);
        if (!cancelled) {
          setKbCompletion(Number.isFinite(percent) ? percent : 0);
          setKbLastUpdated(Date.now());
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              `kbCompletion:${merchantId}`,
              JSON.stringify({
                value: Number.isFinite(percent) ? percent : 0,
                ts: Date.now(),
              }),
            );
          }
        }
      } catch {
        // keep silent
      } finally {
        if (!cancelled) {
          setKbSyncing(false);
        }
      }
    };
    loadKbStatus();
    return () => {
      cancelled = true;
    };
  }, [role, merchantId, apiKey]);

  useEffect(() => {
    if (role !== "merchant" || !merchantId || typeof window === "undefined")
      return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { merchantId?: string; value?: number; ts?: number }
        | undefined;
      if (!detail || detail.merchantId !== merchantId) return;
      if (typeof detail.value === "number") {
        setKbCompletion(detail.value);
      }
      if (detail.ts) {
        setKbLastUpdated(detail.ts);
      }
    };
    window.addEventListener("kb:completion", handler as EventListener);
    return () =>
      window.removeEventListener("kb:completion", handler as EventListener);
  }, [role, merchantId]);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 right-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-[var(--border-default)] bg-[color:var(--bg-surface-1)] text-[var(--text-secondary)] backdrop-blur transition duration-150 ease-in hover:border-[var(--border-active)] hover:text-[var(--text-primary)]"
        aria-label="فتح القائمة الجانبية"
        aria-expanded={mobileOpen}
        aria-controls="main-sidebar"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">القائمة</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-[rgba(10,10,11,0.72)] backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        id="main-sidebar"
        role="complementary"
        aria-label="القائمة الجانبية"
        className={cn(
          "app-sidebar-shell fixed top-0 right-0 z-50 h-full transition-all duration-300",
          collapsed ? "w-72 lg:w-[88px]" : "w-72",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-5">
            {!collapsed && (
              <div className="min-w-0">
                <p className="app-page-header-eyebrow">Workspace</p>
                <h1 className="mt-2 truncate text-[1.15rem] font-bold tracking-[-0.02em] text-foreground">
                  {title}
                </h1>
                {merchantName && (
                  <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                    {merchantName}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(false)}
                className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] transition duration-150 ease-in hover:border-[var(--border-active)] hover:text-[var(--text-primary)]"
                aria-label="إغلاق القائمة الجانبية"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden lg:inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] transition duration-150 ease-in hover:border-[var(--border-active)] hover:text-[var(--text-primary)]"
                aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
                aria-expanded={!collapsed}
              >
                <ChevronLeft
                  className={cn(
                    "h-5 w-5 transition-transform",
                    collapsed && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav
            className="flex-1 overflow-y-auto px-3 py-4"
            aria-label="التنقل الرئيسي"
          >
            {role === "merchant" ? (
              <ul className="space-y-2" role="list">
                {merchantSections.map((section) => {
                  const isExpanded =
                    !collapsed && expandedSectionId === section.id;
                  const isActiveSection = section.items.some((item) =>
                    isItemActive(item.href, merchantSectionItemHrefs),
                  );

                  const sectionButton = (
                    <button
                      type="button"
                      onClick={() => {
                        if (collapsed) return;

                        setExpandedSectionId((previous) => {
                          const nextValue =
                            previous === section.id && !isActiveSection
                              ? null
                              : section.id;

                          if (typeof window !== "undefined" && nextValue) {
                            window.localStorage.setItem(
                              MERCHANT_SECTION_STORAGE_KEY,
                              nextValue,
                            );
                          }

                          return nextValue;
                        });
                      }}
                      className={cn(
                        "h-12 w-full rounded-[12px] px-4 text-sm font-bold transition-all duration-150 ease-in-out",
                        collapsed
                          ? "flex items-center justify-center"
                          : "flex flex-row-reverse items-center justify-between",
                        isActiveSection
                          ? "border border-[var(--border-default)] bg-[var(--accent-gold-dim)] text-[var(--text-primary)]"
                          : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                      )}
                      aria-expanded={isExpanded}
                      aria-controls={`section-${section.id}`}
                      aria-label={collapsed ? section.label : undefined}
                    >
                      <span className="flex items-center gap-3">
                        <section.icon className="h-5 w-5 flex-shrink-0" />
                        {!collapsed && <span>{section.label}</span>}
                      </span>
                      {!collapsed && (
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded && "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );

                  return (
                    <li key={section.id} className="space-y-1.5">
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {sectionButton}
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {section.label}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        sectionButton
                      )}

                      {!collapsed && isExpanded && (
                        <ul
                          id={`section-${section.id}`}
                          className="space-y-1 pr-4 pt-2"
                          role="list"
                        >
                          {section.items.map((item) => {
                            const isActive = isItemActive(
                              item.href,
                              merchantSectionItemHrefs,
                            );

                            if (item.disabled) {
                              const tooltipText = item.roleBlocked
                                ? "ليس لديك صلاحية للوصول لهذا القسم"
                                : item.hiddenBlocked
                                  ? "هذه الصفحة قادمة قريباً"
                                  : item.upgradeText ||
                                    "ترقية لتفعيل هذه الميزة";

                              return (
                                <li key={item.href}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={cn(
                                          "flex items-center gap-3 rounded-[12px] border border-transparent px-3 py-2.5 text-[13px] font-medium",
                                          "cursor-not-allowed text-[color:rgba(161,161,170,0.45)]",
                                        )}
                                      >
                                        <item.icon className="h-4 w-4 flex-shrink-0 opacity-45" />
                                        <span className="flex-1 line-through opacity-50">
                                          {item.label}
                                        </span>
                                        {item.roleBlocked ? (
                                          <Shield className="h-3 w-3 text-red-400/70" />
                                        ) : (
                                          <Lock className="h-3 w-3 text-muted-foreground/70" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                      {tooltipText}
                                    </TooltipContent>
                                  </Tooltip>
                                </li>
                              );
                            }

                            return (
                              <li key={item.href}>
                                <Link
                                  href={item.href}
                                  aria-current={isActive ? "page" : undefined}
                                  className={cn(
                                    "flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 ease-in-out",
                                    isActive
                                      ? "border-[var(--border-default)] bg-[var(--accent-gold-dim)] text-[var(--text-primary)]"
                                      : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                                  )}
                                >
                                  <item.icon className="h-4 w-4 flex-shrink-0" />
                                  <span className="flex-1">{item.label}</span>
                                  {item.href === "/merchant/knowledge-base" &&
                                    kbCompletion !== null && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex items-center gap-1">
                                            <RefreshCw
                                              className={cn(
                                                "h-3 w-3 text-muted-foreground",
                                                kbSyncing && "animate-spin",
                                              )}
                                            />
                                            <Badge
                                              variant={
                                                kbCompletion < 100
                                                  ? "secondary"
                                                  : "default"
                                              }
                                              className="text-xs"
                                            >
                                              {kbCompletion}%
                                            </Badge>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {kbLastUpdated
                                            ? `آخر تحديث: ${new Date(kbLastUpdated).toLocaleString("ar-SA")}`
                                            : "آخر تحديث: غير متوفر"}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  {item.badge !== undefined &&
                                    item.badge > 0 && (
                                      <Badge
                                        variant="destructive"
                                        className="text-xs"
                                      >
                                        {item.badge}
                                      </Badge>
                                    )}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-2" role="list">
                {navItems.map((item) => {
                  const isActive = isItemActive(
                    item.href,
                    navItems.map((entry) => entry.href),
                  );

                  const adminLink = (
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-sm font-semibold transition-all duration-150 ease-in-out",
                        collapsed && "justify-center",
                        isActive
                          ? "border-[var(--border-default)] bg-[var(--accent-gold-dim)] text-[var(--text-primary)]"
                          : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && (
                        <span className="flex-1">{item.label}</span>
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{adminLink}</TooltipTrigger>
                          <TooltipContent side="left">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        adminLink
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t border-border/70 p-4">
            <div className="flex items-center gap-3">
              <ApiStatusIndicator collapsed={collapsed} />
            </div>
            {!collapsed && (
              <Button
                variant="ghost"
                className="mt-3 w-full justify-center border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--accent-danger)] hover:bg-transparent hover:text-[var(--accent-danger)]"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-4 w-4 ml-2" />
                تسجيل الخروج
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

interface PageHeaderProps {
  title: string;
  titleEn?: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  titleEn,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="app-page-header">
      <div className="min-w-0">
        {titleEn && <p className="app-page-header-eyebrow">{titleEn}</p>}
        <h1 className="app-page-title break-words">{title}</h1>
        {description && (
          <p className="app-page-description mt-2 break-words">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}

interface TopBarProps {
  role: "merchant" | "admin";
  collapsed?: boolean;
}

export function TopBar({ role, collapsed }: TopBarProps) {
  return (
    <header className="app-topbar-shell sticky top-0 z-30 flex h-14 items-center px-4 lg:px-5">
      <div className="app-shell-main flex w-full items-center justify-between">
        {/* Page title area - right side in RTL */}
        <h1 className="text-[16px] font-bold tracking-[-0.02em] text-[var(--text-primary)] lg:hidden">
          لوحة التحكم
        </h1>
        <div className="hidden lg:block" />

        {/* Actions - left side in RTL */}
        <div className="flex items-center gap-2">
          <NotificationsPopover />
        </div>
      </div>
    </header>
  );
}
