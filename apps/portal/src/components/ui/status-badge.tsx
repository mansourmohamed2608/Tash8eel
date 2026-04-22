"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OrderStatusTone =
  | "active"
  | "delayed"
  | "completed"
  | "cancelled"
  | "critical";

interface StatusBadgeProps {
  tone: OrderStatusTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<OrderStatusTone, string> = {
  active:
    "border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  delayed:
    "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  completed:
    "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  cancelled:
    "border-[var(--color-neutral-border)] bg-[var(--color-neutral-bg)] text-[var(--color-neutral-text)]",
  critical:
    "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
};

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[var(--font-size-xs)] font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function getOrderStatusTone(
  status: string,
  delayed = false,
): OrderStatusTone {
  const normalized = String(status || "").toUpperCase();
  if (["CANCELLED", "RETURNED"].includes(normalized)) return "cancelled";
  if (["FAILED"].includes(normalized)) return "critical";
  if (delayed) return "delayed";
  if (["DELIVERED", "COMPLETED"].includes(normalized)) return "completed";
  return "active";
}
