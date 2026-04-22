"use client";

import type { ReactNode } from "react";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCellProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  freshness: string;
  freshnessState?: "fresh" | "stale" | "old";
  className?: string;
}

export function MetricCell({
  icon,
  label,
  value,
  trend,
  freshness,
  freshnessState = "fresh",
  className,
}: MetricCellProps) {
  const isNegative = trend?.trim().startsWith("-");
  const isPositive = trend?.trim().startsWith("+") || trend?.includes("↑");

  return (
    <div
      className={cn(
        "min-h-[128px] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4 last:border-b-0 lg:border-b-0 lg:border-s lg:last:border-s-0",
        className,
      )}
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-brand-primary)]">
            {icon}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[var(--font-size-xs)] text-[var(--color-text-tertiary)]",
              freshnessState === "stale" && "text-[var(--color-warning-text)]",
              freshnessState === "old" && "text-[var(--color-danger-text)]",
            )}
          >
            {freshnessState !== "fresh" && (
              <AlertTriangle className="h-3 w-3" />
            )}
            {freshness}
          </span>
        </div>
        <div>
          <p className="font-mono text-[var(--font-size-2xl)] font-bold leading-none text-[var(--color-text-primary)]">
            {value}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[var(--font-size-sm)] font-medium text-[var(--color-text-secondary)]">
              {label}
            </p>
            {trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[var(--font-size-xs)] font-semibold",
                  isPositive &&
                    "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
                  isNegative &&
                    "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
                  !isPositive &&
                    !isNegative &&
                    "bg-[var(--color-neutral-bg)] text-[var(--color-neutral-text)]",
                )}
              >
                {isPositive && <TrendingUp className="h-3 w-3" />}
                {isNegative && <TrendingDown className="h-3 w-3" />}
                {trend}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
