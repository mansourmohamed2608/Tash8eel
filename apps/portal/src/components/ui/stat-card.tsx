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
          "min-h-[80px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4",
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
        "group min-h-[80px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4 transition-all duration-150 ease-in-out hover:border-[var(--accent-blue)]",
        isNegative && "border-r-2 border-r-[var(--accent-danger)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {icon && (
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--accent-blue)]">
            {icon}
          </div>
        )}
        <p className="min-w-0 text-[11px] font-semibold text-[var(--text-muted)]">
          {title}
        </p>
        {change !== undefined && (
          <div className="flex items-center gap-1 text-[11px] font-semibold">
            {isPositive && (
              <TrendingUp className="h-3.5 w-3.5 text-[var(--accent-success)]" />
            )}
            {isNegative && (
              <TrendingDown className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
            )}
            {isNeutral && (
              <Minus className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            )}
            <span
              className={cn(
                isPositive && "text-[var(--accent-success)]",
                isNegative && "text-[var(--accent-danger)]",
                isNeutral && "text-[var(--text-muted)]",
              )}
            >
              {isPositive && "+"}
              {change}%
            </span>
          </div>
        )}
      </div>
      <p className="mt-3 font-mono text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[var(--text-primary)]">
        {value}
      </p>
      {changeLabel && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          {changeLabel}
        </p>
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
