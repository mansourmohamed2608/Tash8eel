"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LegacyQuotesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/merchant/pricing?tab=quotes");
  }, [router]);

  return (
    <div className="min-h-[320px] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
