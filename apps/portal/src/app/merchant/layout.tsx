"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar, TopBar } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WebSocketNotifications } from "@/components/notifications/websocket-notifications";
import { ActiveCallOrderFab } from "@/components/calls/active-call-order-fab";
import { MerchantProvider, useMerchant } from "@/hooks/use-merchant";
import { RealTimeEvent, useWebSocket } from "@/hooks/use-websocket";
import { useAnalytics } from "@/hooks/use-analytics";
import { Button, buttonVariants } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

const FEATURE_GATES: Array<{
  prefix: string;
  featureKey:
    | "conversations"
    | "inventory"
    | "payments"
    | "notifications"
    | "analytics"
    | "kpis"
    | "vision"
    | "loyalty"
    | "reports"
    | "team"
    | "webhooks"
    | "apiAccess"
    | "audit";
  title: string;
  description: string;
}> = [
  {
    prefix: "/merchant/conversations",
    featureKey: "conversations",
    title: "المحادثات غير مفعّلة",
    description: "ترقية للوصول إلى المحادثات وإدارة العملاء.",
  },
  {
    prefix: "/merchant/calls",
    featureKey: "conversations",
    title: "المكالمات غير مفعّلة",
    description: "ترقية لتفعيل مركز المكالمات الذكي.",
  },
  {
    prefix: "/merchant/inventory",
    featureKey: "inventory",
    title: "المخزون غير مفعّل",
    description: "ترقية لإدارة المخزون والمواقع والكميات.",
  },
  {
    prefix: "/merchant/payments",
    featureKey: "payments",
    title: "المدفوعات غير مفعّلة",
    description: "ترقية لقبول المدفوعات وإدارة إثباتات الدفع.",
  },
  {
    prefix: "/merchant/notifications",
    featureKey: "notifications",
    title: "الإشعارات غير مفعّلة",
    description: "ترقية لتفعيل إعدادات الإشعارات والقنوات.",
  },
  {
    prefix: "/merchant/analytics",
    featureKey: "analytics",
    title: "التحليلات غير مفعّلة",
    description: "ترقية للاطلاع على تحليلات الأداء.",
  },
  {
    prefix: "/merchant/kpis",
    featureKey: "kpis",
    title: "مؤشرات الأداء غير مفعّلة",
    description: "ترقية لعرض مؤشرات الأداء الرئيسية.",
  },
  {
    prefix: "/merchant/vision",
    featureKey: "vision",
    title: "OCR العام غير متاح",
    description: "OCR متاح فقط ضمن مسار التحقق من إثباتات الدفع.",
  },
  {
    prefix: "/merchant/loyalty",
    featureKey: "loyalty",
    title: "برنامج الولاء غير مفعّل",
    description: "ترقية لتفعيل برنامج الولاء ومكافآت العملاء.",
  },
  {
    prefix: "/merchant/reports",
    featureKey: "reports",
    title: "التقارير غير مفعّلة",
    description: "ترقية للوصول إلى التقارير المتقدمة.",
  },
  {
    prefix: "/merchant/team",
    featureKey: "team",
    title: "إدارة الفريق غير مفعّلة",
    description: "ترقية لإضافة أعضاء الفريق والصلاحيات.",
  },
  {
    prefix: "/merchant/pos-integrations",
    featureKey: "webhooks",
    title: "التكاملات غير مفعّلة",
    description: "ترقية لتفعيل POS Integrations والتكاملات.",
  },
  {
    prefix: "/merchant/integrations",
    featureKey: "apiAccess",
    title: "التكاملات غير مفعّلة",
    description: "ترقية لتفعيل التكاملات والوصول للـ API.",
  },
  {
    prefix: "/merchant/audit",
    featureKey: "audit",
    title: "سجل التدقيق غير مفعّل",
    description: "ترقية لعرض سجل التدقيق الكامل.",
  },
];

const AGENT_GATES: Array<{
  prefix: string;
  agentKey: string;
  title: string;
  description: string;
}> = [
  {
    prefix: "/merchant/loyalty",
    agentKey: "MARKETING_AGENT",
    title: "برنامج الولاء غير مفعّل",
    description: "برنامج الولاء يتطلب تفعيل وكيل التسويق ضمن خطتك.",
  },
  {
    prefix: "/merchant/campaigns",
    agentKey: "MARKETING_AGENT",
    title: "وكيل التسويق غير مفعّل",
    description: "هذه الصفحة ضمن إضافات التسويق. قم بالترقية لتفعيلها.",
  },
  {
    prefix: "/merchant/customer-segments",
    agentKey: "MARKETING_AGENT",
    title: "شرائح العملاء غير مفعّلة",
    description: "شرائح العملاء تتطلب تفعيل وكيل التسويق ضمن خطتك.",
  },
];

// ─── Pages that are removed or not yet launched - always redirect to dashboard ───
const BLOCKED_ROUTES = [
  "/merchant/integrations", // ERP integrations - removed (POS integrations is the single hub)
  "/merchant/campaigns", // Marketing Agent - coming soon
  "/merchant/customer-segments", // Marketing Agent - coming soon
  "/merchant/webhooks", // Replaced by POS integrations
  "/merchant/vision", // General OCR removed (payment-proof workflow only)
  "/merchant/quotes", // Quote requests - not launched yet
  "/merchant/pricing", // Old pricing page - replaced by /merchant/plan
  "/merchant/ocr-review", // OCR review - internal/not launched yet
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isHardBlockedRoute =
    !!pathname &&
    BLOCKED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  useEffect(() => {
    // If not authenticated and not loading, redirect to login
    if (status === "unauthenticated") {
      router.replace(
        "/login?callbackUrl=" + encodeURIComponent(window.location.pathname),
      );
    }
    if (session?.error === "RefreshAccessTokenError") {
      signOut({ callbackUrl: "/login", redirect: true });
      return;
    }
    if (
      session?.requiresPasswordChange &&
      pathname !== "/merchant/change-password"
    ) {
      router.replace("/merchant/change-password");
    }
    // Block access to removed/coming-soon pages
    if (status === "authenticated" && isHardBlockedRoute) {
      router.replace("/merchant/plan");
    }
  }, [status, router, session, pathname, isHardBlockedRoute]);

  // Show loading while checking session
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  if (
    session?.requiresPasswordChange &&
    pathname !== "/merchant/change-password"
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            يجب تغيير كلمة المرور قبل المتابعة...
          </p>
        </div>
      </div>
    );
  }

  if (status === "authenticated" && isHardBlockedRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            جاري التوجيه إلى صفحة الخطة...
          </p>
        </div>
      </div>
    );
  }

  // If not authenticated, show nothing (will redirect)
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التوجيه لتسجيل الدخول...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function MerchantLayoutContent({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [liveRevision, setLiveRevision] = useState(0);
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const router = useRouter();
  const { merchant, isLoading, isDemo, merchantId, apiKey } = useMerchant();
  const { data: session } = useSession();
  const pathname = usePathname();
  const { trackPageView } = useAnalytics();
  const { isConnected, on } = useWebSocket({
    autoConnect: true,
    subscribeToEvents: [
      RealTimeEvent.ORDER_CREATED,
      RealTimeEvent.ORDER_UPDATED,
      RealTimeEvent.ORDER_STATUS_CHANGED,
      RealTimeEvent.ORDER_CANCELLED,
      RealTimeEvent.DELIVERY_STATUS_UPDATED,
      RealTimeEvent.DELIVERY_COMPLETED,
      RealTimeEvent.MESSAGE_RECEIVED,
      RealTimeEvent.MESSAGE_SENT,
      RealTimeEvent.CONVERSATION_STARTED,
      RealTimeEvent.CONVERSATION_CLOSED,
      RealTimeEvent.NOTIFICATION,
      RealTimeEvent.ALERT,
      RealTimeEvent.STATS_UPDATED,
      RealTimeEvent.REVENUE_UPDATED,
      RealTimeEvent.STOCK_UPDATED,
      RealTimeEvent.STOCK_LOW,
      RealTimeEvent.STOCK_OUT,
    ],
  });

  const merchantName =
    merchant?.name || (isDemo ? "وضع تجريبي" : "جاري التحميل...");
  const featureGate = FEATURE_GATES.find((gate) =>
    pathname?.startsWith(gate.prefix),
  );
  const agentGate = AGENT_GATES.find((gate) =>
    pathname?.startsWith(gate.prefix),
  );
  const isCashierRoute = pathname === "/merchant/cashier";
  const shouldWaitForEntitlements = !!(featureGate || agentGate) && isLoading;
  const isFeatureBlocked =
    !isLoading &&
    !!featureGate &&
    !!merchant?.features &&
    merchant.features[featureGate.featureKey] === false;
  const isAgentBlocked =
    !isLoading &&
    !!agentGate &&
    !!merchant &&
    !merchant.enabledAgents?.includes(agentGate.agentKey);
  const isEntitlementBlocked = isFeatureBlocked || isAgentBlocked;

  useEffect(() => {
    if (pathname) {
      trackPageView(pathname);
    }
  }, [pathname, trackPageView]);

  useEffect(() => {
    if (isEntitlementBlocked && pathname) {
      router.replace(`/merchant/plan?blocked=${encodeURIComponent(pathname)}`);
    }
  }, [isEntitlementBlocked, pathname, router]);

  const triggerRealtimeRefresh = useCallback(() => {
    if (!pathname || pathname === "/merchant/change-password") return;

    // Force client pages under merchant layout to remount and refetch.
    setLiveRevision((prev) => prev + 1);

    // Also refresh server components/data caches for hybrid pages.
    router.refresh();

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("app:realtime-data-changed", {
          detail: { scope: "merchant", path: pathname, at: Date.now() },
        }),
      );
    }
  }, [pathname, router]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (liveRefreshTimerRef.current) return;
    // Debounce event bursts into one UI refresh.
    liveRefreshTimerRef.current = setTimeout(() => {
      liveRefreshTimerRef.current = null;
      triggerRealtimeRefresh();
    }, 1000);
  }, [triggerRealtimeRefresh]);

  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      on(RealTimeEvent.ORDER_CREATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ORDER_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ORDER_STATUS_CHANGED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ORDER_CANCELLED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.DELIVERY_STATUS_UPDATED, () =>
        scheduleRealtimeRefresh(),
      ),
      on(RealTimeEvent.DELIVERY_COMPLETED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.MESSAGE_RECEIVED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.MESSAGE_SENT, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.CONVERSATION_STARTED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.CONVERSATION_CLOSED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.NOTIFICATION, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.ALERT, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STATS_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.REVENUE_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STOCK_UPDATED, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STOCK_LOW, () => scheduleRealtimeRefresh()),
      on(RealTimeEvent.STOCK_OUT, () => scheduleRealtimeRefresh()),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [isConnected, on, scheduleRealtimeRefresh]);

  useEffect(() => {
    if (isConnected) return;

    // Fallback sync for environments where websocket is unavailable.
    const interval = setInterval(() => {
      scheduleRealtimeRefresh();
    }, 60000);

    return () => clearInterval(interval);
  }, [isConnected, scheduleRealtimeRefresh]);

  useEffect(() => {
    return () => {
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-muted/30">
      {!isCashierRoute && (
        <Sidebar
          role="merchant"
          merchantName={merchantName}
          features={merchant?.features}
          enabledAgents={merchant?.enabledAgents}
          merchantId={merchantId}
          apiKey={apiKey}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          userRole={session?.user?.role}
        />
      )}
      <div
        className={cn(
          isCashierRoute ? "min-h-screen" : "transition-all duration-300",
          !isCashierRoute && (collapsed ? "lg:mr-16" : "lg:mr-64"),
        )}
      >
        {!isCashierRoute && <TopBar role="merchant" collapsed={collapsed} />}
        <main
          key={liveRevision}
          className={cn(isCashierRoute ? "p-0" : "p-4 lg:p-6")}
        >
          {isDemo && !isCashierRoute && (
            <div className="mb-4 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg text-yellow-800 dark:text-yellow-200 text-sm">
              <strong>وضع العرض التجريبي:</strong> البيانات المعروضة للتجربة
              فقط.{" "}
              <a href="/login" className="underline font-medium">
                سجل دخول
              </a>{" "}
              للوصول لبياناتك الحقيقية.
            </div>
          )}
          {shouldWaitForEntitlements ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                جاري التحقق من الصلاحيات المتاحة لحسابك...
              </p>
            </div>
          ) : isEntitlementBlocked ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                هذه الصفحة غير متاحة ضمن خطتك الحالية. جاري التوجيه إلى صفحة
                الخطة...
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      {/* Real-time WebSocket Notifications */}
      <WebSocketNotifications />
      <ActiveCallOrderFab />
    </div>
  );
}

export default function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <MerchantProvider>
        <TooltipProvider>
          <MerchantLayoutContent>{children}</MerchantLayoutContent>
        </TooltipProvider>
      </MerchantProvider>
    </AuthGuard>
  );
}
