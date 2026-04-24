"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Public self-signup removed — merchant accounts are created by admin
export default function SignupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return null;
}
