"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center max-w-md p-8">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--danger-muted)]">
          <span className="text-2xl text-[var(--accent-danger)]">!</span>
        </div>
        <h2 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
          حدث خطأ
        </h2>
        <p className="text-[var(--text-secondary)] mb-6">
          حدث خطأ أثناء تحميل هذه الصفحة. يرجى المحاولة مرة أخرى.
        </p>
        {error?.message && process.env.NODE_ENV === "development" && (
          <pre className="text-[var(--accent-danger)] text-xs bg-[var(--bg-surface-2)] border border-[var(--border-default)] p-3 rounded mb-4 text-left overflow-auto">
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className="bg-[var(--accent-blue)] hover:opacity-90 text-white px-6 py-2 rounded-lg transition-opacity"
        >
          حاول مرة أخرى
        </button>
      </div>
    </div>
  );
}
