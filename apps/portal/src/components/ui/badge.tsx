import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[0.6875rem] font-semibold transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--brand-blue)] text-white shadow-[0_10px_24px_-16px_color-mix(in_srgb,var(--brand-blue)_86%,black)]",
        secondary:
          "border-[color:color-mix(in_srgb,var(--border-strong)_84%,transparent)] bg-[var(--surface-muted)] text-[var(--text-primary)]",
        destructive:
          "border-transparent bg-[var(--danger)] text-white shadow-[0_10px_24px_-16px_color-mix(in_srgb,var(--danger)_82%,black)]",
        success:
          "border-[color:color-mix(in_srgb,var(--success)_20%,transparent)] bg-[var(--success-muted)] text-[var(--success)]",
        warning:
          "border-[color:color-mix(in_srgb,var(--warning)_18%,var(--border-strong))] bg-[var(--warning-muted)] text-[var(--warning)]",
        info: "border-[color:color-mix(in_srgb,var(--brand-blue)_18%,var(--border-strong))] bg-[var(--accent-muted)] text-[var(--brand-blue)]",
        outline:
          "border-[color:color-mix(in_srgb,var(--border-strong)_88%,transparent)] bg-transparent text-[var(--text-muted)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
