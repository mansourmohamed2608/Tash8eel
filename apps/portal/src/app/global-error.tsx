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
      <body className="bg-gray-950 text-white flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2">حدث خطأ غير متوقع</h1>
          <p className="text-gray-400 mb-6">
            نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.
          </p>
          {error?.message && process.env.NODE_ENV === "development" && (
            <pre className="text-red-400 text-xs bg-gray-900 p-3 rounded mb-4 text-left overflow-auto">
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}
