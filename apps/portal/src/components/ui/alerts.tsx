import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, XCircle, X } from "lucide-react";
import { Button } from "./button";
import { Skeleton } from "./skeleton";

interface AlertBannerProps {
  type: "error" | "success" | "warning" | "info";
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

const alertConfig = {
  error: {
    shell:
      "border-[color:color-mix(in_srgb,var(--danger)_18%,var(--border-strong))] bg-[var(--danger-muted)] text-[var(--danger)]",
    icon: XCircle,
  },
  success: {
    shell:
      "border-[color:color-mix(in_srgb,var(--success)_18%,var(--border-strong))] bg-[var(--success-muted)] text-[var(--success)]",
    icon: CheckCircle2,
  },
  warning: {
    shell:
      "border-[color:color-mix(in_srgb,var(--warning)_18%,var(--border-strong))] bg-[var(--warning-muted)] text-[var(--warning)]",
    icon: AlertCircle,
  },
  info: {
    shell:
      "border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-strong))] bg-[var(--accent-muted)] text-[var(--accent)]",
    icon: Info,
  },
};

export function AlertBanner({
  type,
  title,
  message,
  onDismiss,
  className,
}: AlertBannerProps) {
  const config = alertConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[20px] border p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]",
        config.shell,
        className,
      )}
      role="alert"
    >
      <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] border border-current/10 bg-white/55">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="flex-1">
        {title && <h4 className="font-black tracking-[-0.01em]">{title}</h4>}
        <p className="mt-1 text-sm leading-6 opacity-90">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-[12px] transition-colors hover:bg-black/5",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[color:color-mix(in_srgb,var(--border-strong)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-muted)_68%,transparent)] px-5 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--border-strong)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "جاري التحميل...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-muted)_62%,transparent)] px-5 py-12",
        className,
      )}
    >
      <div className="w-full max-w-sm space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-14 w-full rounded-[18px]" />
        <Skeleton className="h-14 w-[88%] rounded-[18px]" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <p className="mt-5 text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "حدث خطأ",
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[24px] border border-[color:color-mix(in_srgb,var(--danger)_16%,var(--border-strong))] bg-[color:color-mix(in_srgb,var(--danger-muted)_82%,transparent)] px-4 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-[20px] border border-[color:color-mix(in_srgb,var(--danger)_20%,var(--border-strong))] bg-white/60">
        <XCircle className="h-8 w-8 text-[var(--danger)]" />
      </div>
      <h3 className="mb-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mb-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">
        {message}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="destructive">
          حاول مرة أخرى
        </Button>
      )}
    </div>
  );
}
