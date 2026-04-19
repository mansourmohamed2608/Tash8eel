import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("tash-skeleton rounded-[8px]", className)} />;
}

export function DashboardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-1)] p-4"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-8 rounded-[6px]" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="mb-3 h-9 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-1)] p-5",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-16 rounded-[6px]" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  );
}

export function ChartSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-1)] p-5",
        className,
      )}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-14 rounded-[6px]" />
          <Skeleton className="h-7 w-14 rounded-[6px]" />
          <Skeleton className="h-7 w-14 rounded-[6px]" />
        </div>
      </div>
      <Skeleton className="h-[220px] w-full rounded-[8px]" />
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 5,
  className,
}: TableSkeletonProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-1)]",
        className,
      )}
    >
      <div className="grid min-h-9 gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] px-4 py-2">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-4/5" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-[color:var(--border-subtle)]">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-4 py-3">
            <div
              className="grid items-center gap-3"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: columns }).map((__, columnIndex) => (
                <Skeleton
                  key={columnIndex}
                  className={cn(
                    "h-4",
                    columnIndex === 0
                      ? "w-16"
                      : columnIndex === columns - 1
                        ? "w-12"
                        : "w-full",
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
