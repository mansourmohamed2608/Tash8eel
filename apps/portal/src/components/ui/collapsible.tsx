"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CollapsibleContext = React.createContext<
  CollapsibleContextValue | undefined
>(undefined);

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  (
    {
      className,
      children,
      open: openProp,
      onOpenChange,
      defaultOpen = false,
      ...props
    },
    ref,
  ) => {
    const [openState, setOpenState] = React.useState(defaultOpen);

    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : openState;

    const handleOpenChange = React.useCallback(
      (value: boolean) => {
        if (!isControlled) {
          setOpenState(value);
        }
        onOpenChange?.(value);
      },
      [isControlled, onOpenChange],
    );

    return (
      <CollapsibleContext.Provider
        value={{ open, onOpenChange: handleOpenChange }}
      >
        <div
          ref={ref}
          className={cn(className)}
          data-state={open ? "open" : "closed"}
          {...props}
        >
          {children}
        </div>
      </CollapsibleContext.Provider>
    );
  },
);
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, children, asChild, onClick, ...props }, ref) => {
  const context = React.useContext(CollapsibleContext);

  if (!context) {
    throw new Error("CollapsibleTrigger must be used within a Collapsible");
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    context.onOpenChange(!context.open);
    onClick?.(e);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: handleClick,
      "data-state": context.open ? "open" : "closed",
    });
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cn(className)}
      onClick={handleClick}
      data-state={context.open ? "open" : "closed"}
      {...props}
    >
      {children}
    </button>
  );
});
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(CollapsibleContext);

  if (!context) {
    throw new Error("CollapsibleContent must be used within a Collapsible");
  }

  if (!context.open) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn("animate-fadeIn", className)}
      data-state={context.open ? "open" : "closed"}
      {...props}
    >
      {children}
    </div>
  );
});
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
