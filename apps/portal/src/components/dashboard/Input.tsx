"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DashboardInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  wrapperClassName?: string;
}

export const DashboardInput = React.forwardRef<
  HTMLInputElement,
  DashboardInputProps
>(({ className, label, error, wrapperClassName, ...props }, ref) => {
  const input = (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] hover:border-[var(--border-active)] focus:border-[var(--accent-blue)] focus:ring-4 focus:ring-[rgba(59,130,246,0.15)]",
        error &&
          "border-[var(--accent-danger)] focus:border-[var(--accent-danger)] focus:ring-[rgba(239,68,68,0.18)]",
        className,
      )}
      {...props}
    />
  );

  if (!label && !error) {
    return input;
  }

  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      {label ? (
        <label className="block text-[12px] font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      ) : null}
      {input}
      {error ? (
        <p className="text-[11px] text-[var(--accent-danger)]">{error}</p>
      ) : null}
    </div>
  );
});

DashboardInput.displayName = "DashboardInput";
