"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar, TopBar } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WebSocketNotifications } from "@/components/notifications/websocket-notifications";
import { MerchantProvider, useMerchant } from "@/hooks/use-merchant";
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
    title: "الذكاء البصري غير مفعّل",
    description: "ترقية لاستخدام الرؤية البصرية وتحليل الصور.",
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
    prefix: "/merchant/webhooks",
    featureKey: "webhooks",
    title: "التكاملات غير مفعّلة",
    description: "ترقية لتفعيل الـ Webhooks والتكاملات.",
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

// ─── Pages that are removed or not yet launched — always redirect to dashboard ───
const BLOCKED_ROUTES = [
  "/merchant/integrations", // ERP integrations — removed (POS integrations is the single hub)
  "/merchant/campaigns", // Marketing Agent — coming soon
  "/merchant/customer-segments", // Marketing Agent — coming soon
  "/merchant/webhooks", // Replaced by POS integrations
  "/merchant/vision", // Vision AI — not launched yet
  "/merchant/quotes", // Quote requests — not launched yet
  "/merchant/pricing", // Old pricing page — replaced by /merchant/plan
  "/merchant/ocr-review", // OCR review — internal/not launched yet
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

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
    if (
      status === "authenticated" &&
      pathname &&
      BLOCKED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))
    ) {
      router.replace("/merchant/dashboard");
    }
  }, [status, router, session, pathname]);

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
  const { merchant, isLoading, isDemo, merchantId, apiKey } = useMerchant();
  const { data: session } = useSession();
  const pathname = usePathname();
  const { trackPageView } = useAnalytics();

  const merchantName =
    merchant?.name || (isDemo ? "وضع تجريبي" : "جاري التحميل...");
  const featureGate = FEATURE_GATES.find((gate) =>
    pathname?.startsWith(gate.prefix),
  );
  const isFeatureBlocked =
    !isLoading &&
    !!featureGate &&
    !!merchant?.features &&
    merchant.features[featureGate.featureKey] === false;

  useEffect(() => {
    if (pathname) {
      trackPageView(pathname);
    }
  }, [pathname, trackPageView]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar
        role="merchant"
        merchantName={merchantName}
        features={merchant?.features}
        merchantId={merchantId}
        apiKey={apiKey}
        userRole={session?.user?.role}
      />
      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "lg:mr-16" : "lg:mr-64",
        )}
      >
        <TopBar role="merchant" collapsed={collapsed} />
        <main className="p-4 lg:p-6">
          {isDemo && (
            <div className="mb-4 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg text-yellow-800 dark:text-yellow-200 text-sm">
              <strong>وضع العرض التجريبي:</strong> البيانات المعروضة للتجربة
              فقط.{" "}
              <a href="/login" className="underline font-medium">
                سجل دخول
              </a>{" "}
              للوصول لبياناتك الحقيقية.
            </div>
          )}
          {isFeatureBlocked && featureGate ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Lock className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{featureGate.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {featureGate.description}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/merchant/plan" className={buttonVariants({})}>
                  عرض الخطط والترقيات
                </Link>
                <Link
                  href="/merchant/feature-requests"
                  className={buttonVariants({ variant: "outline" })}
                >
                  اطلب تفعيل الميزة
                </Link>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      {/* Real-time WebSocket Notifications */}
      <WebSocketNotifications />
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
