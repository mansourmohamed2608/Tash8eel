"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const dashboardButtonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border text-[13px] font-semibold transition duration-150 ease-in active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] px-4 text-[var(--color-text-inverse)] hover:bg-[var(--color-brand-hover)]",
        secondary:
          "border-[var(--border-default)] bg-transparent px-4 text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)]",
        danger:
          "border-[var(--accent-danger)] bg-[var(--accent-danger)] px-4 text-white hover:brightness-110",
        ghost:
          "border-transparent bg-transparent px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
      },
      size: {
        default: "px-4",
        sm: "h-9 px-3 text-[12px]",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface DashboardButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dashboardButtonVariants> {
  asChild?: boolean;
}

export function DashboardButton({
  asChild,
  className,
  variant,
  size,
  ...props
}: DashboardButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(dashboardButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
