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
  CreditCard,
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
  Link2,
  Wallet,
  ClipboardList,
  Receipt,
  Cpu,
  DollarSign,
  UsersRound,
  Megaphone,
  UserCheck,
  BellRing,
  Banknote,
  Truck,
  Store,
  Image,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiStatusIndicator } from "./api-status";
import { NotificationsPopover } from "./notifications-popover";
import { merchantApi } from "@/lib/api";
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
  VIEWER: 20,
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  featureKey?: string; // Maps to merchant.features
  upgradeText?: string; // Text to show in upgrade prompt
  minRole?: string; // Minimum role required (e.g., 'OWNER', 'ADMIN')
  hidden?: boolean; // Hide from sidebar (coming_soon features)
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
  { href: "/merchant/orders", label: "الطلبات", icon: ShoppingCart },
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
    upgradeText: "ترقية لبرنامج الولاء",
  },
  {
    href: "/merchant/notifications",
    label: "صندوق الإشعارات",
    icon: Bell,
    featureKey: "notifications",
  },
  {
    href: "/merchant/push-notifications",
    label: "إرسال إشعارات",
    icon: BellRing,
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
  { href: "/merchant/agents", label: "الوكلاء والذكاء", icon: Cpu },
  { href: "/merchant/agent-activity", label: "نشاط الوكلاء", icon: Brain },
  { href: "/merchant/teams", label: "فرق الوكلاء", icon: UsersRound },
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
    label: "قرارات الذكاء الاصطناعي",
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

interface SidebarProps {
  role: "merchant" | "admin";
  merchantName?: string;
  merchantId?: string;
  apiKey?: string;
  userRole?: string; // Staff role: OWNER, ADMIN, MANAGER, AGENT, VIEWER
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
  };
}

export function Sidebar({
  role,
  merchantName,
  features,
  merchantId,
  apiKey,
  userRole,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [kbCompletion, setKbCompletion] = useState<number | null>(null);
  const [kbSyncing, setKbSyncing] = useState(false);
  const [kbLastUpdated, setKbLastUpdated] = useState<number | null>(null);

  // Process nav items: show all but mark disabled features or RBAC-restricted
  const processedNavItems = useMemo(() => {
    if (role !== "merchant") {
      return adminNavItems.map((item) => ({
        ...item,
        disabled: false,
        roleBlocked: false,
      }));
    }

    return merchantNavItems
      .filter((item) => !item.hidden)
      .map((item) => {
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

        return {
          ...item,
          disabled: featureDisabled || roleBlocked,
          roleBlocked,
        };
      });
  }, [role, features, userRole]);

  const navItems = processedNavItems;
  const title = role === "merchant" ? "تشغيل" : "تشغيل - لوحة الإدارة";

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
        className="lg:hidden fixed top-4 right-4 z-50 p-2 rounded-md bg-card border shadow-sm"
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
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        id="main-sidebar"
        role="complementary"
        aria-label="القائمة الجانبية"
        className={cn(
          "fixed top-0 right-0 h-full bg-card border-l shadow-sm z-50 transition-all duration-300",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            {!collapsed && (
              <div>
                <h1 className="text-lg font-bold text-primary-600">{title}</h1>
                {merchantName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {merchantName}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(false)}
                className="lg:hidden p-1 rounded-md hover:bg-muted"
                aria-label="إغلاق القائمة الجانبية"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden lg:flex p-1 rounded-md hover:bg-muted"
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
            className="flex-1 overflow-y-auto p-2"
            aria-label="التنقل الرئيسي"
          >
            <ul className="space-y-1" role="list">
              {navItems.map((item) => {
                // Use exact match, or prefix match only if no other nav item is a more specific match
                const isExact = pathname === item.href;
                const isPrefix = pathname.startsWith(item.href + "/");
                const hasMoreSpecificMatch =
                  isPrefix &&
                  navItems.some(
                    (other) =>
                      other.href !== item.href &&
                      other.href.startsWith(item.href + "/") &&
                      (pathname === other.href ||
                        pathname.startsWith(other.href + "/")),
                  );
                const isActive = isExact || (isPrefix && !hasMoreSpecificMatch);
                const isDisabled = item.disabled;

                // Disabled items show as greyed out with upgrade link or role restriction
                if (isDisabled) {
                  const isRoleRestricted = item.roleBlocked;
                  return (
                    <li key={item.href}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                              "text-muted-foreground/40 cursor-not-allowed",
                            )}
                          >
                            <item.icon className="h-5 w-5 flex-shrink-0 opacity-40" />
                            {!collapsed && (
                              <>
                                <span className="flex-1 line-through opacity-40">
                                  {item.label}
                                </span>
                                {isRoleRestricted ? (
                                  <Shield className="h-3 w-3 text-red-400/60" />
                                ) : (
                                  <Lock className="h-3 w-3 text-muted-foreground/60" />
                                )}
                              </>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {isRoleRestricted
                            ? "ليس لديك صلاحية للوصول لهذا القسم"
                            : item.upgradeText || "ترقية لتفعيل هذه الميزة"}
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
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary-100 text-primary-700"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && (
                        <>
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
                          {item.badge !== undefined && item.badge > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <ApiStatusIndicator collapsed={collapsed} />
            </div>
            {!collapsed && (
              <Button
                variant="ghost"
                className="w-full mt-3 text-muted-foreground"
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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface TopBarProps {
  role: "merchant" | "admin";
  collapsed?: boolean;
}

export function TopBar({ role, collapsed }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 h-14 flex items-center">
      <div className="flex items-center justify-between w-full">
        {/* Page title area - right side in RTL */}
        <h1 className="text-lg font-semibold lg:hidden">لوحة التحكم</h1>
        <div className="hidden lg:block" />

        {/* Actions - left side in RTL */}
        <div className="flex items-center gap-2">
          <NotificationsPopover />
        </div>
      </div>
    </header>
  );
}
