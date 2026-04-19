"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI to render instead of the default error message */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Reset key - when this changes, the error boundary resets */
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary component.
 * Catches render errors in child components and shows a fallback UI
 * instead of crashing the entire application.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyPage />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={<CustomError />}>
 *     <RiskyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log to console in development
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);

    // Notify parent if callback provided
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset when resetKey changes
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

/** Default error fallback UI — light-mode operational system */
function DefaultErrorFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <div
      className="flex items-center justify-center min-h-[400px] p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full bg-[var(--bg-surface-1)] border border-[color:color-mix(in_srgb,var(--accent-danger)_18%,var(--border-default))] rounded-xl p-8 text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--danger-muted)]">
          <AlertTriangle className="h-8 w-8 text-[var(--accent-danger)]" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          حدث خطأ غير متوقع
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          نعتذر عن هذا الخطأ. يمكنك محاولة تحديث الصفحة أو العودة للصفحة
          الرئيسية.
        </p>
        {error && process.env.NODE_ENV !== "production" && (
          <details className="text-left mb-4 text-xs">
            <summary className="text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] mb-1">
              تفاصيل الخطأ (تطوير فقط)
            </summary>
            <pre className="bg-[var(--bg-surface-2)] p-3 rounded-lg border border-[var(--border-default)] text-[var(--accent-danger)] overflow-auto max-h-32 whitespace-pre-wrap">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent-blue)] hover:opacity-90 text-white text-sm font-medium transition-opacity"
          >
            <RefreshCw className="h-4 w-4" />
            حاول مرة أخرى
          </button>
          <a
            href="/merchant/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] text-sm font-medium transition-colors"
          >
            <Home className="h-4 w-4" />
            الصفحة الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
