import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--surface-muted)_88%,transparent)_20%,color-mix(in_srgb,var(--surface-muted)_62%,white)_50%,color-mix(in_srgb,var(--surface-muted)_88%,transparent)_80%)] bg-[length:200%_100%] animate-[assistantShimmer_1.6s_linear_infinite]",
        className,
      )}
      {...props}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]">
      <Skeleton className="mb-4 h-3.5 w-1/3" />
      <Skeleton className="mb-2 h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)]">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

function TableSkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]">
      <div className="border-b border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)] p-4">
        <Skeleton className="h-6 w-1/4" />
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-muted)_92%,transparent)]">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="p-4">
                <Skeleton className="h-4 w-full" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex items-center space-x-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--border-strong)_84%,transparent)] p-4"
        >
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  // Deterministic heights to avoid hydration mismatch
  const barHeights = [65, 85, 45, 70, 90, 55, 75];

  return (
    <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card p-6 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]">
      <Skeleton className="mb-4 h-6 w-1/3" />
      <div className="flex items-end justify-between h-48 gap-2">
        {barHeights.map((height, i) => (
          <Skeleton
            key={i}
            className="w-full"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton rows={5} columns={6} />
    </div>
  );
}

export {
  Skeleton,
  CardSkeleton,
  TableRowSkeleton,
  TableSkeleton,
  ListSkeleton,
  ChartSkeleton,
  DashboardSkeleton,
};
