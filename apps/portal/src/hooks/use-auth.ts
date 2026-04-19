"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAuth(requireAuth = true) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (requireAuth && status === "unauthenticated") {
      router.push("/login");
    }

    // Handle token refresh error
    if (session?.error === "RefreshAccessTokenError") {
      signOut({ callbackUrl: "/login" });
    }
  }, [status, session, router, requireAuth]);

  return {
    user: session?.user,
    accessToken: session?.accessToken,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
    logout: () => signOut({ callbackUrl: "/login" }),
  };
}

export function useRequireRole(allowedRoles: string[]) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && !allowedRoles.includes(user.role)) {
      router.push("/merchant/dashboard");
    }
  }, [user, isLoading, allowedRoles, router]);

  return {
    hasAccess: user ? allowedRoles.includes(user.role) : false,
    isLoading,
  };
}
