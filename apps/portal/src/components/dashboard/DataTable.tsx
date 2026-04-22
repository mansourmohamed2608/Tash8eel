import { Info } from "lucide-react";
import { DashboardButton } from "@/components/dashboard/Button";
import { DashboardSkeleton } from "@/components/dashboard/Skeleton";
import { cn } from "@/lib/utils";

export interface DashboardColumn<T> {
  key: string;
  header: string;
  className?: string;
  mobileHidden?: boolean;
  render: (item: T) => React.ReactNode;
}

export function DashboardDataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyTitle = "لا توجد بيانات حتى الآن",
  emptyBody = "سيظهر المحتوى هنا بمجرد توفره.",
  emptyAction,
}: {
  columns: DashboardColumn<T>[];
  data: T[];
  rowKey: (item: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`dashboard-skeleton-row-${index + 1}`}
            className="grid grid-cols-4 gap-3"
          >
            <DashboardSkeleton className="h-12" />
            <DashboardSkeleton className="h-12" />
            <DashboardSkeleton className="h-12" />
            <DashboardSkeleton className="h-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]">
          <Info className="h-4 w-4" />
        </span>
        <div className="space-y-1">
          <p className="text-[14px] font-bold text-[var(--text-primary)]">
            {emptyTitle}
          </p>
          <p className="font-[var(--font-body)] text-[13px] text-[var(--text-secondary)]">
            {emptyBody}
          </p>
        </div>
        {emptyAction ? (
          emptyAction
        ) : (
          <DashboardButton variant="secondary">تحديث البيانات</DashboardButton>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full border-collapse">
        <thead>
          <tr className="h-9 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-right">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-4 text-[11px] font-semibold text-[var(--text-secondary)]",
                  column.className,
                  column.mobileHidden && "hidden md:table-cell",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={rowKey(item)}
              className="group h-12 border-b border-[var(--border-subtle)] transition duration-150 ease-in hover:bg-[var(--bg-surface-2)]"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle text-[13px] text-[var(--text-secondary)] group-hover:border-r-2 group-hover:border-[var(--color-brand-primary)]",
                    column.className,
                    column.mobileHidden && "hidden md:table-cell",
                  )}
                >
                  {column.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
