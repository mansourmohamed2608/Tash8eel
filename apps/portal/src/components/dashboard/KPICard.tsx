"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/Card";
import type { KpiMetric } from "@/lib/constants/mockData";

const iconMap = {
  "trending-up": TrendingUp,
  "shopping-cart": ShoppingCart,
  "message-square": MessageSquare,
  users: Users,
};

const toneClasses = {
  blue: "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]",
  gold: "bg-[var(--accent-gold-dim)] text-[var(--accent-gold)]",
  success: "bg-[rgba(34,197,94,0.12)] text-[var(--accent-success)]",
  info: "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]",
};

function useCountUp(value: number, duration = 800) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();

    const frame = (time: number) => {
      const progress = Math.min((time - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));

      if (progress < 1) requestAnimationFrame(frame);
    };

    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration, value]);

  return display;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function KPICard({ metric }: { metric: KpiMetric }) {
  const Icon = iconMap[metric.icon];
  const displayValue = useCountUp(metric.value);
  const formattedValue = useMemo(
    () => formatNumber(displayValue),
    [displayValue],
  );

  const trendLabel =
    metric.trend === null
      ? "— مماثل لأمس"
      : `${metric.trend > 0 ? "↑" : "↓"} ${formatNumber(Math.abs(metric.trend))}% ${metric.trendLabel}`;

  const trendTone =
    metric.trend === null
      ? "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]"
      : metric.trend > 0
        ? "bg-[rgba(34,197,94,0.12)] text-[var(--accent-success)]"
        : "bg-[rgba(239,68,68,0.12)] text-[var(--accent-danger)]";

  return (
    <DashboardCard className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-[6px] ${toneClasses[metric.tone]}`}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">
            {metric.label}
          </p>
        </div>
        <span
          className={`tash-latin inline-flex min-h-5 items-center rounded-[4px] px-1.5 py-0.5 text-[11px] ${trendTone}`}
        >
          {trendLabel}
        </span>
      </div>

      <div className="mt-4">
        <div className="tash-latin text-[28px] font-bold text-[var(--text-primary)] sm:text-[36px]">
          {formattedValue}
          {metric.suffix ? (
            <span className="mr-2 font-[var(--font-heading)] text-[18px]">
              {metric.suffix}
            </span>
          ) : null}
        </div>
        <p className="mt-2 font-[var(--font-body)] text-[12px] text-[var(--text-secondary)]">
          {metric.sublabel}
        </p>
      </div>
    </DashboardCard>
  );
}
