"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Alias route — redirects to the authenticated change-password page under merchant shell
export default function ChangePasswordAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/merchant/change-password");
  }, [router]);

  return null;
}
