"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getSession, signOut, useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar, TopBar } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WebSocketNotifications } from "@/components/notifications/websocket-notifications";
import { ActiveCallOrderFab } from "@/components/calls/active-call-order-fab";
import { MerchantProvider, useMerchant } from "@/hooks/use-merchant";
import { RealTimeEvent, useWebSocket } from "@/hooks/use-websocket";
import { useAnalytics } from "@/hooks/use-analytics";
import { useToast } from "@/hooks/use-toast";
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
    | "audit"
    | "cashier";
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
    prefix: "/merchant/cashier",
    featureKey: "cashier",
    title: "الكاشير غير مفعّل",
    description: "ترقية أو تفعيل إضافة الكاشير للوصول إلى شاشة نقطة البيع.",
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
    prefix: "/merchant/campaigns",
    featureKey: "loyalty",
    title: "الحملات غير مفعّلة",
    description: "الحملات وشرائح العملاء متاحة من Growth فأعلى.",
  },
  {
    prefix: "/merchant/customer-segments",
    featureKey: "loyalty",
    title: "شرائح العملاء غير مفعّلة",
    description: "الحملات وشرائح العملاء متاحة من Growth فأعلى.",
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
}> = [];

// ─── Pages that are removed or not yet launched - always redirect to dashboard ───
const BLOCKED_ROUTES = [
  "/merchant/integrations", // ERP integrations - removed (POS integrations is the single hub)
  "/merchant/webhooks", // Replaced by POS integrations
  "/merchant/vision", // General OCR removed (payment-proof workflow only)
  "/merchant/ocr-review", // OCR review - internal/not launched yet
];

const CHAT_ONLY_BLOCKED_ROUTES = [
  "/merchant/orders",
  "/merchant/cashier",
  "/merchant/branches",
  "/merchant/team",
  "/merchant/inventory",
  "/merchant/payments",
  "/merchant/reports",
  "/merchant/analytics",
  "/merchant/kpis",
  "/merchant/forecast",
  "/merchant/loyalty",
  "/merchant/campaigns",
  "/merchant/customer-segments",
  "/merchant/pos-integrations",
  "/merchant/tables",
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isRecoveringSession, setIsRecoveringSession] = useState(false);
  const lastRecoveryToastAtRef = useRef(0);
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

  useEffect(() => {
    if (session?.error !== "RefreshAccessTokenError") {
      setIsRecoveringSession(false);
      return;
    }

    let cancelled = false;
    setIsRecoveringSession(true);
    toast({
      title: "إعادة الاتصال بالجلسة...",
      description: "نحاول استعادة الجلسة تلقائياً. لحظة واحدة.",
    });

    const recoverSession = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const nextSession = await getSession();

        if (cancelled) return;

        if (nextSession && !(nextSession as any).error) {
          setIsRecoveringSession(false);
          toast({
            title: "تمت استعادة الجلسة",
            description: "يمكنك متابعة العمل بشكل طبيعي.",
            variant: "success",
          });
          return;
        }
      } catch {
        // fall through to sign out below
      }

      if (!cancelled) {
        toast({
          title: "انتهت الجلسة",
          description: "يرجى تسجيل الدخول مرة أخرى.",
          variant: "destructive",
        });
        signOut({
          callbackUrl: "/login?reason=session_expired",
          redirect: true,
        });
      }
    };

    recoverSession();

    return () => {
      cancelled = true;
    };
  }, [session?.error, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onAuthRecovering = (event: Event) => {
      const now = Date.now();
      if (now - lastRecoveryToastAtRef.current < 5000) {
        return;
      }
      lastRecoveryToastAtRef.current = now;

      const detail = (
        event as CustomEvent<{
          attempt?: number;
          maxAttempts?: number;
        }>
      ).detail;

      const attempt = Number(detail?.attempt || 1);
      const maxAttempts = Number(detail?.maxAttempts || 3);

      toast({
        title: "الجلسة قيد الاستعادة",
        description: `تعذر التحقق من الجلسة مؤقتاً (محاولة ${attempt}/${maxAttempts}).`,
      });
    };

    window.addEventListener("app:auth-recovering", onAuthRecovering);
    return () => {
      window.removeEventListener("app:auth-recovering", onAuthRecovering);
    };
  }, [toast]);

  // Show loading while checking session
  if (status === "loading") {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  if (isRecoveringSession) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            جاري استعادة الجلسة تلقائياً...
          </p>
        </div>
      </div>
    );
  }

  if (
    session?.requiresPasswordChange &&
    pathname !== "/merchant/change-password"
  ) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
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
      <div className="app-shell flex min-h-screen items-center justify-center">
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
      <div className="app-shell flex min-h-screen items-center justify-center">
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
  const userRole = String(session?.user?.role || "");
  const isCashierUser = userRole === "CASHIER";
  const isCashierRoute = pathname === "/merchant/cashier";
  const showCashierChrome = isCashierUser && isCashierRoute;
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
  const isChatOnlyPlan =
    String(merchant?.plan || "").toLowerCase() === "chat_only";
  const isChatOnlyRouteBlocked =
    !isLoading &&
    isChatOnlyPlan &&
    !!pathname &&
    CHAT_ONLY_BLOCKED_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/"),
    );

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

  useEffect(() => {
    if (isChatOnlyRouteBlocked && pathname) {
      router.replace(
        `/merchant/pricing?blocked=${encodeURIComponent(pathname)}`,
      );
    }
  }, [isChatOnlyRouteBlocked, pathname, router]);

  useEffect(() => {
    if (!isCashierUser || !pathname) return;
    if (
      pathname === "/merchant/cashier" ||
      pathname === "/merchant/change-password"
    ) {
      return;
    }
    router.replace("/merchant/cashier");
  }, [isCashierUser, pathname, router]);

  const triggerRealtimeRefresh = useCallback(() => {
    if (!pathname || pathname === "/merchant/change-password") return;

    const shouldRefreshServerData =
      pathname.startsWith("/merchant/dashboard") ||
      pathname.startsWith("/merchant/analytics") ||
      pathname.startsWith("/merchant/reports");

    // Refresh server data only on metric-heavy pages to avoid disruptive remounts.
    if (shouldRefreshServerData) {
      router.refresh();
    }

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
    return () => {
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="app-shell">
      {(!isCashierRoute || showCashierChrome) && (
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
          isCashierRoute && !showCashierChrome
            ? "min-h-screen"
            : "transition-all duration-300",
          (!isCashierRoute || showCashierChrome) &&
            (collapsed ? "lg:mr-[88px]" : "lg:mr-72"),
        )}
      >
        {(!isCashierRoute || showCashierChrome) && (
          <TopBar role="merchant" collapsed={collapsed} />
        )}
        <main
          className={cn(
            isCashierRoute && !showCashierChrome
              ? "p-0"
              : "app-shell-main p-4 lg:p-6",
          )}
        >
          {isDemo && (!isCashierRoute || showCashierChrome) && (
            <div className="mb-4 rounded-[18px] border border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 px-4 py-3 text-sm text-[var(--accent-warning)]">
              <strong>وضع العرض التجريبي:</strong> البيانات المعروضة للتجربة
              فقط.{" "}
              <a href="/login" className="underline font-medium">
                سجل دخول
              </a>{" "}
              للوصول لبياناتك الحقيقية.
            </div>
          )}
          {shouldWaitForEntitlements ? (
            <div className="app-surface mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-[24px] p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                جاري التحقق من الصلاحيات المتاحة لحسابك...
              </p>
            </div>
          ) : isChatOnlyRouteBlocked ? (
            <div className="app-surface mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-[24px] p-8 text-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                خطة Chat Only مخصصة للمحادثات فقط. للوصول إلى التشغيل والمخزون
                والمالية، اختر خطة منصة كاملة.
              </p>
              <Link
                href="/merchant/pricing"
                className={buttonVariants({ variant: "default" })}
              >
                عرض الخطط
              </Link>
            </div>
          ) : isEntitlementBlocked ? (
            <div className="app-surface mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-[24px] p-8 text-center">
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
