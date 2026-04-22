import { cn } from "@/lib/utils";

interface PageActionBarProps {
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageActionBar({
  filters,
  actions,
  className,
}: PageActionBarProps) {
  return (
    <div className={cn("app-action-bar", className)}>
      {filters && <div className="app-action-bar__filters">{filters}</div>}
      {actions && <div className="app-action-bar__actions">{actions}</div>}
    </div>
  );
}

interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  icon,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("app-section-header", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--color-brand-primary)]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold leading-snug tracking-[-0.01em] text-[var(--text-primary)]">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
