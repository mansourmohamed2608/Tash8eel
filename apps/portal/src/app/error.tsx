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
        <div className="text-5xl mb-4">❌</div>
        <h2 className="text-xl font-bold mb-2 text-white">حدث خطأ</h2>
        <p className="text-gray-400 mb-6">
          حدث خطأ أثناء تحميل هذه الصفحة. يرجى المحاولة مرة أخرى.
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
    </div>
  );
}
