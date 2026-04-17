"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{ background: "#F7F6F3", color: "#1A1A1A" }}
        className="flex items-center justify-center min-h-screen"
      >
        <div className="text-center max-w-md p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#1A1A1A" }}>
            حدث خطأ غير متوقع
          </h1>
          <p className="mb-6" style={{ color: "#6B6A66" }}>
            نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.
          </p>
          {error?.message && process.env.NODE_ENV === "development" && (
            <pre
              style={{
                color: "#A32D2D",
                background: "#FCEBEB",
                border: "1px solid rgba(163,45,45,0.2)",
              }}
              className="text-xs p-3 rounded mb-4 text-left overflow-auto"
            >
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            style={{ background: "#2D6BE4" }}
            className="hover:opacity-90 text-white px-6 py-2 rounded-lg transition-opacity"
          >
            حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}
