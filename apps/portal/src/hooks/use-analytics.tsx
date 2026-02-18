"use client";

import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { merchantApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";

const isAnalyticsEnabled = () =>
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false";

export function useAnalytics() {
  const { merchantId, apiKey } = useMerchant();
  const pathname = usePathname();

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const existing = window.sessionStorage.getItem("analytics_session_id");
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem("analytics_session_id", next);
    return next;
  }, []);

  const trackEvent = useCallback(
    async (eventName: string, properties?: Record<string, any>) => {
      if (!merchantId || !apiKey || !isAnalyticsEnabled()) return;
      try {
        await merchantApi.trackAnalyticsEvent(merchantId, apiKey, {
          eventName,
          properties,
          sessionId,
          source: "portal",
          path: pathname,
        });
      } catch {
        // Fail silently to avoid UX impact
      }
    },
    [merchantId, apiKey, pathname, sessionId],
  );

  const trackPageView = useCallback(
    async (pathOverride?: string) => {
      await trackEvent("page_view", { path: pathOverride || pathname });
    },
    [trackEvent, pathname],
  );

  return { trackEvent, trackPageView };
}
