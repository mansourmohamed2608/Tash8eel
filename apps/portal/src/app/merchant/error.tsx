"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function MerchantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Merchant error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center max-w-md p-8">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold mb-2">خطأ في لوحة التحكم</h2>
        <p className="text-muted-foreground mb-6">
          حدث خطأ أثناء تحميل هذا القسم. يرجى المحاولة مرة أخرى أو العودة للصفحة
          الرئيسية.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>حاول مرة أخرى</Button>
          <Button variant="outline" asChild>
            <a href="/merchant">الرئيسية</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
