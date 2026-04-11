import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "danger" | "info" | "default";

const styles: Record<StatusVariant, string> = {
  success:
    "bg-[rgba(34,197,94,0.15)] text-[var(--accent-success)] border-[rgba(34,197,94,0.25)]",
  warning:
    "bg-[rgba(245,158,11,0.15)] text-[var(--accent-warning)] border-[rgba(245,158,11,0.25)]",
  danger:
    "bg-[rgba(239,68,68,0.15)] text-[var(--accent-danger)] border-[rgba(239,68,68,0.25)]",
  info: "bg-[rgba(59,130,246,0.15)] text-[var(--accent-blue)] border-[rgba(59,130,246,0.25)]",
  default:
    "bg-[rgba(255,255,255,0.08)] text-[var(--text-secondary)] border-[var(--border-default)]",
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
