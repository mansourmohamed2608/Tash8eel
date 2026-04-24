"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Route migrated — plan page is now under /merchant/usage
export default function PlanPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/merchant/usage");
  }, [router]);

  return null;
}
