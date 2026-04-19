"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  navigationSections,
  mobilePrimaryTabs,
  type NavIconKey,
} from "@/lib/constants/navigation";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  Copy,
  DollarSign,
  Grid2X2,
  HelpCircle,
  Info,
  Image,
  Lightbulb,
  Lock,
  MessageSquare,
  Monitor,
  Package,
  Phone,
  Shield,
  Star,
  Settings2,
  ShoppingCart,
  Tag,
  Target,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";

const iconMap: Record<
  NavIconKey,
  React.ComponentType<{ className?: string }>
> = {
  grid: Grid2X2,
  "message-square": MessageSquare,
  "shopping-cart": ShoppingCart,
  package: Package,
  settings: Settings2,
  info: Info,
  "help-circle": HelpCircle,
  phone: Phone,
  users: Users,
  monitor: Monitor,
  "dollar-sign": DollarSign,
  image: Image,
  "trending-up": TrendingUp,
  calendar: Calendar,
  truck: Truck,
  lightbulb: Lightbulb,
  "bar-chart": TrendingUp,
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

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreItems = useMemo(
    () =>
      navigationSections
        .flatMap((section) => section.items)
        .filter(
          (item) =>
            !mobilePrimaryTabs.some((tab) => tab.label === item.label) &&
            !item.locked,
        ),
    [],
  );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[60px] border-t border-[var(--border-subtle)] bg-[var(--bg-surface-1)] md:hidden">
        {mobilePrimaryTabs.map((tab) => {
          const Icon = iconMap[tab.icon];
          const active =
            tab.label === "المزيد"
              ? moreOpen
              : pathname === tab.href ||
                (tab.href !== "/dashboard" && pathname.startsWith(tab.href));

          return tab.label === "المزيد" ? (
            <button
              key={tab.label}
              type="button"
              onClick={() => setMoreOpen((current) => !current)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 border-t-2 text-[10px] font-medium transition duration-150 ease-in",
                active
                  ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                  : "border-transparent text-[var(--text-secondary)]",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </button>
          ) : (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 border-t-2 text-[10px] font-medium transition duration-150 ease-in",
                active
                  ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                  : "border-transparent text-[var(--text-secondary)]",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 bg-[rgba(10,10,11,0.72)] md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setMoreOpen(false)}
            aria-label="إغلاق المزيد"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-[24px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 pb-6 pt-4">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[var(--border-active)]" />
            <div className="grid grid-cols-1 gap-2 overflow-y-auto pb-16">
              {moreItems.map((item) => {
                const Icon = iconMap[item.icon];
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 text-[13px] text-[var(--text-secondary)]"
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
