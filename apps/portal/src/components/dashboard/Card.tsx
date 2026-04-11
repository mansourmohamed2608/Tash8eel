import * as React from "react";
import { cn } from "@/lib/utils";

export function DashboardCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]",
        className,
      )}
      {...props}
    />
  );
}

export function DashboardCardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-b border-[var(--border-subtle)] px-5 py-4 md:px-5",
        className,
      )}
      {...props}
    />
  );
}

export function DashboardCardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
