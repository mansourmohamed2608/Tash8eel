"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "./skeleton";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  loading,
  className,
}: StatCardProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]",
          className,
        )}
      >
        <Skeleton className="mb-3 h-3.5 w-1/2" />
        <Skeleton className="mb-2 h-8 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    );
  }

  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === 0;

  return (
    <div
      className={cn(
        "group rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] transition-all duration-150 ease-in-out hover:border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-strong))] hover:shadow-[0_24px_50px_-34px_rgba(15,23,42,0.55)]",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">
            {title}
          </p>
        </div>
        {icon && (
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[color:color-mix(in_srgb,var(--border-strong)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-muted)_80%,transparent)] text-[var(--accent)]">
            {icon}
          </div>
        )}
      </div>
      <p className="text-[1.8rem] font-black tracking-[-0.03em] text-[var(--text-primary)]">
        {value}
      </p>
      {change !== undefined && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          {isPositive && (
            <TrendingUp className="h-4 w-4 text-[var(--success)]" />
          )}
          {isNegative && (
            <TrendingDown className="h-4 w-4 text-[var(--danger)]" />
          )}
          {isNeutral && <Minus className="h-4 w-4 text-[var(--text-muted)]" />}
          <span
            className={cn(
              "font-bold",
              isPositive && "text-[var(--success)]",
              isNegative && "text-[var(--danger)]",
              isNeutral && "text-[var(--text-muted)]",
            )}
          >
            {isPositive && "+"}
            {change}%
          </span>
          {changeLabel && (
            <span className="text-[var(--text-muted)]">{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface KPIGridProps {
  children: React.ReactNode;
  className?: string;
}

export function KPIGrid({ children, className }: KPIGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
