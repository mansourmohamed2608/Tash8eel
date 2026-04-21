"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_LANDING_ROUTES,
  normalizePortalRole,
} from "@/lib/constants/navigation";

export default function MerchantRootRedirect() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;

    const normalizedRole = normalizePortalRole(session?.user?.role);
    const target = DEFAULT_LANDING_ROUTES[normalizedRole];
    router.replace(target);
  }, [router, session?.user?.role, status]);

  return (
    <div className="app-shell flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
