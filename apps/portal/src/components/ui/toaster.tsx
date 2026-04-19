"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle, X, Info } from "lucide-react";

interface ToastProps {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "default" | "destructive" | "success";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Toast({
  id,
  title,
  description,
  action,
  variant = "default",
  open = true,
  onOpenChange,
}: ToastProps) {
  const variantStyles = {
    default: "bg-background border-border",
    destructive: "bg-red-50 border-red-200 text-red-900",
    success: "bg-green-50 border-green-200 text-green-900",
  };

  const icons = {
    default: <Info className="h-5 w-5 text-blue-500" />,
    destructive: <XCircle className="h-5 w-5 text-red-500" />,
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5",
        variantStyles[variant],
      )}
    >
      <div className="flex-shrink-0">{icons[variant]}</div>
      <div className="flex-1 space-y-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {action}
      </div>
      <button
        onClick={() => onOpenChange?.(false)}
        className="flex-shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 w-full max-w-md pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
}

export { Toast };
