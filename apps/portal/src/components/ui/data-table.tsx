"use client";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { EmptyState } from "./alerts";
import { Skeleton } from "./skeleton";

interface DataTableProps<T> {
  data: T[];
  columns: {
    key: string;
    header: string;
    render?: (item: T) => React.ReactNode;
    className?: string;
  }[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function DataTable<T extends { id?: string | number }>({
  data,
  columns,
  loading,
  emptyMessage = "لا توجد بيانات",
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card shadow-[0_20px_48px_-34px_rgba(15,23,42,0.48)]",
          className,
        )}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-muted)_90%,transparent)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="p-4 text-right font-bold text-[var(--text-muted)]"
                >
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr
                key={i}
                className="border-b border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)]"
              >
                {columns.map((col) => (
                  <td key={col.key} className="p-4">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card p-3 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.48)]",
          className,
        )}
      >
        <EmptyState title="لا توجد نتائج" description={emptyMessage} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-card shadow-[0_20px_48px_-34px_rgba(15,23,42,0.48)]",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-muted)_90%,transparent)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "p-4 text-right text-[0.6875rem] font-bold tracking-[0.08em] text-[var(--text-muted)]",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => (
              <tr
                key={item.id ?? idx}
                className={cn(
                  "border-b border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)] transition-colors last:border-0",
                  onRowClick &&
                    "cursor-pointer hover:bg-[color:color-mix(in_srgb,var(--surface-muted)_60%,transparent)]",
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("p-4 text-sm", col.className)}
                  >
                    {col.render
                      ? col.render(item)
                      : ((item as Record<string, unknown>)[
                          col.key
                        ]?.toString() ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visiblePages = pages.slice(
    Math.max(0, currentPage - 2),
    Math.min(totalPages, currentPage + 2),
  );

  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      <Button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        variant="outline"
        size="sm"
      >
        السابق
      </Button>

      {visiblePages[0] > 1 && (
        <>
          <Button onClick={() => onPageChange(1)} variant="ghost" size="sm">
            1
          </Button>
          {visiblePages[0] > 2 && <span className="px-2">...</span>}
        </>
      )}

      {visiblePages.map((page) => (
        <Button
          key={page}
          onClick={() => onPageChange(page)}
          variant={page === currentPage ? "default" : "ghost"}
          size="sm"
        >
          {page}
        </Button>
      ))}

      {visiblePages[visiblePages.length - 1] < totalPages && (
        <>
          {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
            <span className="px-2">...</span>
          )}
          <Button
            onClick={() => onPageChange(totalPages)}
            variant="ghost"
            size="sm"
          >
            {totalPages}
          </Button>
        </>
      )}

      <Button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        variant="outline"
        size="sm"
      >
        التالي
      </Button>
    </div>
  );
}
