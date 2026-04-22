"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type ActionItemSeverity = "critical" | "warning" | "info" | "success";

interface ActionItemProps {
  severity: ActionItemSeverity;
  title: string;
  description?: string;
  time?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: ReactNode;
  className?: string;
}

const severityClasses: Record<ActionItemSeverity, string> = {
  critical:
    "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
  warning:
    "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  info: "border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  success:
    "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
};

const severityIcons: Record<ActionItemSeverity, ReactNode> = {
  critical: <AlertCircle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
};

export function ActionItem({
  severity,
  title,
  description,
  time,
  actionLabel,
  actionHref,
  icon,
  className,
}: ActionItemProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-base)] border p-3 sm:flex-row sm:items-center",
        severityClasses[severity],
        className,
      )}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-current/15 bg-white/55">
        {icon || severityIcons[severity]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[var(--font-size-sm)] font-semibold">{title}</p>
        {description ? (
          <p className="mt-1 text-[var(--font-size-xs)] leading-5 opacity-85">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {time ? (
          <span className="text-[var(--font-size-xs)] opacity-75">{time}</span>
        ) : null}
        {actionLabel && actionHref ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 bg-white/60"
          >
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
