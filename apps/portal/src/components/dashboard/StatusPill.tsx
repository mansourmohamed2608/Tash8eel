import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "danger" | "info" | "default";

const styles: Record<StatusVariant, string> = {
  success:
    "bg-[var(--success-muted)] text-[var(--accent-success)] border-[color:color-mix(in_srgb,var(--accent-success)_20%,transparent)]",
  warning:
    "bg-[var(--warning-muted)] text-[var(--accent-warning)] border-[color:color-mix(in_srgb,var(--accent-warning)_20%,transparent)]",
  danger:
    "bg-[var(--danger-muted)] text-[var(--accent-danger)] border-[color:color-mix(in_srgb,var(--accent-danger)_20%,transparent)]",
  info: "bg-[var(--info-muted)] text-[var(--info)] border-[color:color-mix(in_srgb,var(--info)_20%,transparent)]",
  default:
    "bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border-[var(--border-default)]",
};

export function StatusPill({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: StatusVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-[4px] border px-2 text-[11px] font-semibold",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
