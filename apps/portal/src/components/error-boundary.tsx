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

/** Default error fallback UI - dark theme, matches portal design */
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
      <div className="max-w-md w-full bg-[#1a1a2e] border border-red-900/50 rounded-xl p-8 text-center">
        <div className="mx-auto mb-4 p-3 bg-red-900/30 rounded-full w-fit">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">
          حدث خطأ غير متوقع
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          نعتذر عن هذا الخطأ. يمكنك محاولة تحديث الصفحة أو العودة للصفحة
          الرئيسية.
        </p>
        {error && process.env.NODE_ENV !== "production" && (
          <details className="text-left mb-4 text-xs">
            <summary className="text-gray-500 cursor-pointer hover:text-gray-400 mb-1">
              تفاصيل الخطأ (تطوير فقط)
            </summary>
            <pre className="bg-[#0f0f23] p-3 rounded-lg border border-gray-800 text-red-300 overflow-auto max-h-32 whitespace-pre-wrap">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            حاول مرة أخرى
          </button>
          <a
            href="/merchant/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
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
