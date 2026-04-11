import { cn } from "@/lib/utils";

export function DashboardSkeleton({ className }: { className?: string }) {
  return <div className={cn("tash-skeleton rounded-[8px]", className)} />;
}
