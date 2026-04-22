"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border text-[13px] font-semibold transition duration-150 ease-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(59,130,246,0.15)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-brand-hover)]",
        primary:
          "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-brand-hover)]",
        secondary:
          "border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)]",
        outline:
          "border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)]",
        ghost:
          "border-transparent bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        link: "border-transparent bg-transparent px-0 text-[var(--color-brand-primary)] hover:underline",
        destructive:
          "border-[var(--accent-danger)] bg-[var(--accent-danger)] text-white hover:brightness-110",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-[var(--radius-sm)] px-3 text-[12px]",
        lg: "h-11 px-6 text-[14px]",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
