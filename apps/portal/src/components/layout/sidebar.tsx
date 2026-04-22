"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronLeft,
  DollarSign,
  Grid2X2,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Package,
  Phone,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsPopover } from "./notifications-popover";
import { cn } from "@/lib/utils";
import {
  AUTHORITY_NAVIGATION,
  normalizePortalRole,
  type AppRole,
  type AuthorityNavigationItem,
  type AuthorityNavigationSection,
  type NavFeatureKey,
  type NavIconKey,
} from "@/lib/constants/navigation";
import { useMemo, useState, useEffect } from "react";

const MERCHANT_SECTION_STORAGE_KEY = "merchant-sidebar-open-section";

const iconMap: Record<NavIconKey, LucideIcon> = {
  activity: Activity,
  "bar-chart": BarChart3,
  building: Building2,
  "dollar-sign": DollarSign,
  grid: Grid2X2,
  "help-circle": HelpCircle,
  "message-square": MessageSquare,
  monitor: Monitor,
  package: Package,
  phone: Phone,
  settings: Settings,
  "shopping-cart": ShoppingCart,
  "trending-up": Activity,
  truck: Truck,
  users: Users,
};

const adminNavItems = [
  { href: "/admin/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/admin/merchants", label: "التجار", icon: Users },
  { href: "/admin/entitlements", label: "الصلاحيات", icon: Settings },
  { href: "/admin/offers", label: "عروض الاشتراك", icon: DollarSign },
  { href: "/admin/dlq", label: "DLQ", icon: Activity },
  { href: "/admin/analytics", label: "التحليلات", icon: BarChart3 },
  {
    href: "/admin/feature-requests",
    label: "اقتراحات الميزات",
    icon: HelpCircle,
  },
  { href: "/admin/audit-logs", label: "سجل النشاط", icon: Activity },
];

interface SidebarProps {
  role: "merchant" | "admin";
  merchantName?: string;
  merchantId?: string;
  apiKey?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  userRole?: string;
  enabledAgents?: string[];
  features?: Partial<Record<NavFeatureKey, boolean>>;
}

interface RenderableNavItem extends AuthorityNavigationItem {
  disabled?: boolean;
  children?: RenderableNavItem[];
}

interface RenderableNavSection extends Omit<
  AuthorityNavigationSection,
  "items"
> {
  items: RenderableNavItem[];
}

function normalizeHref(href: string) {
  return href.split("?")[0];
}

function isHrefActive(pathname: string, href: string, allHrefs: string[]) {
  const normalizedHref = normalizeHref(href);
  const isExact = pathname === normalizedHref;
  const isPrefix = pathname.startsWith(normalizedHref + "/");
  const hasMoreSpecificMatch =
    isPrefix &&
    allHrefs.some((otherHref) => {
      const normalizedOther = normalizeHref(otherHref);
      return (
        normalizedOther !== normalizedHref &&
        normalizedOther.startsWith(normalizedHref + "/") &&
        (pathname === normalizedOther ||
          pathname.startsWith(normalizedOther + "/"))
      );
    });

  return isExact || (isPrefix && !hasMoreSpecificMatch);
}

function filterItemForRole(
  item: AuthorityNavigationItem,
  role: AppRole,
  features?: Partial<Record<NavFeatureKey, boolean>>,
): RenderableNavItem | null {
  if (!item.roles.includes(role)) return null;

  const children = item.children
    ?.map((child) => filterItemForRole(child, role, features))
    .filter(Boolean) as RenderableNavItem[] | undefined;

  const disabled =
    !!item.featureKey && !!features && features[item.featureKey] === false;

  return {
    ...item,
    disabled,
    children,
  };
}

function filterSectionForRole(
  section: AuthorityNavigationSection,
  role: AppRole,
  features?: Partial<Record<NavFeatureKey, boolean>>,
): RenderableNavSection | null {
  if (!section.roles.includes(role)) return null;

  const items = section.items
    .map((item) => filterItemForRole(item, role, features))
    .filter(Boolean) as RenderableNavItem[];

  if (items.length === 0) return null;

  return { ...section, items };
}

function flattenHrefs(items: RenderableNavItem[]): string[] {
  return items.flatMap((item) => [
    item.href,
    ...(item.children ? flattenHrefs(item.children) : []),
  ]);
}

function NavigationLink({
  item,
  active,
  collapsed,
  depth = 0,
}: {
  item: RenderableNavItem;
  active: boolean;
  collapsed: boolean;
  depth?: number;
}) {
  const Icon = iconMap[item.icon];
  const baseClass = cn(
    "flex items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[13px] font-semibold transition duration-150 ease-in-out",
    collapsed && "justify-center px-0",
    depth > 0 && !collapsed && "ps-7 text-[12px] font-medium",
    item.disabled
      ? "cursor-not-allowed border-transparent text-[var(--color-text-disabled)]"
      : active
        ? "border-[var(--color-border)] bg-[var(--color-brand-subtle)] text-[var(--color-brand-primary)] [border-inline-end:3px_solid_var(--color-brand-primary)]"
        : "border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-primary)]",
  );

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && item.disabled && (
        <span className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px]">
          مقفل
        </span>
      )}
    </>
  );

  if (item.disabled) {
    return (
      <div className={baseClass} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={baseClass}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </Link>
  );
}

function NavigationItemTree({
  item,
  allHrefs,
  collapsed,
  pathname,
  depth = 0,
}: {
  item: RenderableNavItem;
  allHrefs: string[];
  collapsed: boolean;
  pathname: string;
  depth?: number;
}) {
  const active =
    isHrefActive(pathname, item.href, allHrefs) ||
    !!item.children?.some((child) =>
      isHrefActive(pathname, child.href, allHrefs),
    );

  return (
    <li className="space-y-1">
      <NavigationLink
        item={item}
        active={active}
        collapsed={collapsed}
        depth={depth}
      />
      {!collapsed && item.children && item.children.length > 0 && (
        <ul className="space-y-1" role="list">
          {item.children.map((child) => (
            <NavigationItemTree
              key={`${item.href}:${child.href}:${child.label}`}
              item={child}
              allHrefs={allHrefs}
              collapsed={collapsed}
              pathname={pathname}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Sidebar({
  role,
  merchantName,
  collapsed: collapsedProp,
  onCollapsedChange,
  userRole,
  features,
}: SidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const normalizedRole = normalizePortalRole(userRole);
  const collapsed =
    typeof collapsedProp === "boolean" ? collapsedProp : internalCollapsed;

  const setCollapsed = (next: boolean) => {
    if (typeof collapsedProp !== "boolean") {
      setInternalCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  const merchantSections = useMemo(
    () =>
      normalizedRole === "cashier"
        ? (AUTHORITY_NAVIGATION.map((section) =>
            filterSectionForRole(section, "cashier", features),
          ).filter(Boolean) as RenderableNavSection[])
        : (AUTHORITY_NAVIGATION.map((section) =>
            filterSectionForRole(section, normalizedRole, features),
          ).filter(Boolean) as RenderableNavSection[]),
    [features, normalizedRole],
  );

  const allMerchantHrefs = useMemo(
    () => merchantSections.flatMap((section) => flattenHrefs(section.items)),
    [merchantSections],
  );

  const activeMerchantSectionId = useMemo(() => {
    return (
      merchantSections.find((section) =>
        section.items.some((item) =>
          flattenHrefs([item]).some((href) =>
            isHrefActive(pathname, href, allMerchantHrefs),
          ),
        ),
      )?.id ??
      merchantSections[0]?.id ??
      null
    );
  }, [allMerchantHrefs, merchantSections, pathname]);

  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (role !== "merchant" || typeof window === "undefined") return;

    const savedSection = window.localStorage.getItem(
      MERCHANT_SECTION_STORAGE_KEY,
    );
    const nextSection =
      activeMerchantSectionId ||
      (savedSection &&
      merchantSections.some((section) => section.id === savedSection)
        ? savedSection
        : merchantSections[0]?.id);

    if (nextSection) setExpandedSectionId(nextSection);
  }, [activeMerchantSectionId, merchantSections, role]);

  const title = role === "merchant" ? "تشغيل" : "تشغيل - لوحة الإدارة";

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 end-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] backdrop-blur transition duration-150 ease-in hover:border-[var(--color-brand-primary)] hover:text-[var(--color-text-primary)] lg:hidden"
        aria-label="فتح القائمة الجانبية"
        aria-expanded={mobileOpen}
        aria-controls="main-sidebar"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">القائمة</span>
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(26,26,26,0.28)] backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="main-sidebar"
        role="complementary"
        aria-label="القائمة الجانبية"
        className={cn(
          "app-sidebar-shell fixed top-0 end-0 z-50 h-full transition-all duration-200",
          collapsed
            ? "w-[var(--sidebar-width-expanded)] lg:w-[var(--sidebar-width-collapsed)]"
            : "w-[var(--sidebar-width-expanded)]",
          !mobileOpen &&
            "[transform:translateX(100%)] lg:[transform:translateX(0)]",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-5">
            {!collapsed && (
              <div className="min-w-0">
                <p className="app-page-header-eyebrow">مساحة العمل</p>
                <h1 className="mt-2 truncate text-[1.15rem] font-bold text-[var(--color-text-primary)]">
                  {title}
                </h1>
                {merchantName && (
                  <p className="mt-1 truncate text-xs leading-5 text-[var(--color-text-secondary)]">
                    {merchantName}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] transition duration-150 ease-in hover:border-[var(--color-brand-primary)] hover:text-[var(--color-text-primary)] lg:hidden"
                aria-label="إغلاق القائمة الجانبية"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] transition duration-150 ease-in hover:border-[var(--color-brand-primary)] hover:text-[var(--color-text-primary)] lg:inline-flex"
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

          <nav
            className="flex-1 overflow-y-auto px-3 py-4"
            aria-label="التنقل الرئيسي"
          >
            {role === "merchant" ? (
              <ul className="space-y-3" role="list">
                {merchantSections.map((section) => {
                  const SectionIcon = iconMap[section.icon];
                  const isExpanded =
                    !collapsed && expandedSectionId === section.id;
                  const isActiveSection =
                    section.id === activeMerchantSectionId;

                  return (
                    <li key={section.id} className="space-y-1.5">
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
                          "h-11 w-full rounded-[var(--radius-base)] px-4 text-sm font-bold transition duration-150 ease-in-out",
                          collapsed
                            ? "flex items-center justify-center"
                            : "flex items-center justify-between",
                          isActiveSection
                            ? "border border-[var(--color-border)] bg-[var(--color-brand-subtle)] text-[var(--color-brand-primary)]"
                            : "border border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-primary)]",
                          section.subdued &&
                            !isActiveSection &&
                            "text-[var(--color-text-tertiary)]",
                        )}
                        aria-expanded={isExpanded}
                        aria-controls={`section-${section.id}`}
                        aria-label={collapsed ? section.label : undefined}
                      >
                        <span className="flex items-center gap-3">
                          <SectionIcon
                            className="h-5 w-5 shrink-0"
                            aria-hidden="true"
                          />
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

                      {!collapsed && isExpanded && (
                        <ul
                          id={`section-${section.id}`}
                          className="space-y-1 ps-3"
                          role="list"
                        >
                          {section.items.map((item) => (
                            <NavigationItemTree
                              key={`${section.id}:${item.href}:${item.label}`}
                              item={item}
                              allHrefs={allMerchantHrefs}
                              collapsed={collapsed}
                              pathname={pathname}
                            />
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-2" role="list">
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isHrefActive(
                    pathname,
                    item.href,
                    adminNavItems.map((entry) => entry.href),
                  );

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm font-semibold transition duration-150 ease-in-out",
                          collapsed && "justify-center",
                          isActive
                            ? "border-[var(--color-border)] bg-[var(--color-brand-subtle)] text-[var(--color-brand-primary)]"
                            : "border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-primary)]",
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        {!collapsed && (
                          <span className="flex-1">{item.label}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <div className="border-t border-[var(--color-border)] p-4">
            <Link
              href="/merchant/help"
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition duration-150 ease-in hover:border-[var(--color-brand-primary)] hover:text-[var(--color-text-primary)]",
                collapsed && "px-0",
              )}
              aria-label="المساعدة"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              {!collapsed && <span>المساعدة</span>}
            </Link>
            <Button
              variant="ghost"
              className={cn(
                "mt-3 w-full justify-center border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-danger-border)] hover:bg-transparent hover:text-[var(--color-danger-text)]",
                collapsed && "px-0",
              )}
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>تسجيل الخروج</span>}
            </Button>
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
        <h1 className="text-[16px] font-bold text-[var(--color-text-primary)] lg:hidden">
          لوحة التحكم
        </h1>
        <div className="hidden lg:block" />

        <div className="flex items-center gap-2">
          <NotificationsPopover />
        </div>
      </div>
    </header>
  );
}
