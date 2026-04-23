import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, XCircle, X } from "lucide-react";

interface AlertBannerProps {
  type: "error" | "success" | "warning" | "info";
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

const alertConfig = {
  error: {
    bgColor: "bg-red-50 border-red-200",
    textColor: "text-red-800",
    icon: XCircle,
    iconColor: "text-red-600",
  },
  success: {
    bgColor: "bg-green-50 border-green-200",
    textColor: "text-green-800",
    icon: CheckCircle2,
    iconColor: "text-green-600",
  },
  warning: {
    bgColor: "bg-yellow-50 border-yellow-200",
    textColor: "text-yellow-800",
    icon: AlertCircle,
    iconColor: "text-yellow-600",
  },
  info: {
    bgColor: "bg-blue-50 border-blue-200",
    textColor: "text-blue-800",
    icon: Info,
    iconColor: "text-blue-600",
  },
};

export function AlertBanner({
  type,
  title,
  message,
  onDismiss,
  className,
}: AlertBannerProps) {
  const config = alertConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border",
        config.bgColor,
        className,
      )}
      role="alert"
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1">
        {title && (
          <h4 className={cn("font-semibold", config.textColor)}>{title}</h4>
        )}
        <p className={cn("text-sm", config.textColor)}>{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "p-1 rounded-md hover:bg-black/10 transition-colors",
            config.textColor,
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "جاري التحميل...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12",
        className,
      )}
    >
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-muted"></div>
        <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-4 border-primary-600 border-t-transparent animate-spin"></div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "حدث خطأ",
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className,
      )}
    >
      <div className="rounded-full bg-red-100 p-4 mb-4">
        <XCircle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
        >
          حاول مرة أخرى
        </button>
      )}
    </div>
  );
}
