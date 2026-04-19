"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  Copy,
  DollarSign,
  Grid2X2,
  HelpCircle,
  Image,
  Info,
  MessageSquare,
  Lightbulb,
  Lock,
  LucideIcon,
  Monitor,
  Package,
  Phone,
  Settings2,
  Shield,
  ShoppingCart,
  Star,
  Tag,
  Target,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavIconKey, NavigationItem } from "@/lib/constants/navigation";

const iconMap: Record<NavIconKey, LucideIcon> = {
  grid: Grid2X2,
  "help-circle": HelpCircle,
  "message-square": MessageSquare,
  phone: Phone,
  info: Info,
  settings: Settings2,
  users: Users,
  "shopping-cart": ShoppingCart,
  monitor: Monitor,
  "dollar-sign": DollarSign,
  image: Image,
  "trending-up": TrendingUp,
  calendar: Calendar,
  truck: Truck,
  lightbulb: Lightbulb,
  package: Package,
  "bar-chart": BarChart3,
  "alert-triangle": AlertTriangle,
  copy: Copy,
  star: Star,
  "arrow-left-right": ArrowLeftRight,
  bell: Bell,
  target: Target,
  tag: Tag,
  wallet: Wallet,
  building: Building2,
  lock: Lock,
  shield: Shield,
  upload: Upload,
  briefcase: Briefcase,
};

export function SidebarSectionTrigger({
  label,
  icon,
  expanded,
  collapsed,
  onClick,
}: {
  label: string;
  icon: NavIconKey;
  expanded: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = iconMap[icon];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-10 w-full items-center rounded-[var(--radius-sm)] px-[10px] text-[13px] text-[var(--text-secondary)] transition duration-150 ease-in hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
        collapsed ? "justify-center" : "justify-between gap-2",
      )}
    >
      <span className="flex items-center gap-2 overflow-hidden">
        <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition duration-150 group-hover:text-[var(--text-secondary)]" />
        {!collapsed ? <span className="font-semibold">{label}</span> : null}
      </span>
      {!collapsed ? (
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-[var(--text-muted)] transition duration-150",
            expanded && "rotate-180",
          )}
        />
      ) : (
        <span className="tash-tooltip">{label}</span>
      )}
    </button>
  );
}

export function SidebarItem({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = iconMap[item.icon];
  const content = (
    <>
      <span
        className={cn(
          "flex items-center gap-2",
          collapsed ? "justify-center" : "justify-start pr-8",
        )}
      >
        <Icon
          className={cn(
            "h-[14px] w-[14px] shrink-0",
            active ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)]",
          )}
        />
        {!collapsed ? (
          <span
            className={cn(
              "truncate text-[13px]",
              active
                ? "font-medium text-[var(--text-primary)]"
                : "font-normal text-[var(--text-secondary)]",
            )}
          >
            {item.label}
          </span>
        ) : null}
      </span>
      {item.locked && !collapsed ? (
        <Lock className="mr-auto h-[10px] w-[10px] text-[var(--text-muted)]" />
      ) : null}
      {item.badge && !collapsed ? (
        <span className="mr-auto rounded-[4px] border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-gold)]">
          {item.badge}
        </span>
      ) : null}
      {collapsed ? <span className="tash-tooltip">{item.label}</span> : null}
    </>
  );

  const baseClass = cn(
    "group relative flex h-9 items-center rounded-[var(--radius-sm)] transition duration-150 ease-in",
    collapsed ? "justify-center px-0" : "px-[10px]",
    item.locked
      ? "cursor-not-allowed opacity-40"
      : "hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
    active &&
      "bg-[var(--accent-gold-dim)] text-[var(--text-primary)] [border-inline-end:2px_solid_var(--accent-gold)]",
  );

  if (item.locked) {
    return <div className={baseClass}>{content}</div>;
  }

  return (
    <Link href={item.href} className={baseClass} onClick={onNavigate}>
      {content}
    </Link>
  );
}
