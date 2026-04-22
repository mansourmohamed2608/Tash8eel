"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/alerts";
import { MetricCell } from "@/components/ui/metric-cell";
import {
  ActionItem,
  type ActionItemSeverity,
} from "@/components/ui/action-item";
import {
  ShoppingCart,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Wallet,
  Truck,
  AlertTriangle,
  DollarSign,
  CheckCircle2,
  Zap,
  Store,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import portalApi from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import {
  generateDashboardInsights,
  type AiInsight,
} from "@/components/ai/ai-insights-card";
import { normalizePortalRole } from "@/lib/constants/navigation";

interface DashboardData {
  stats: {
    totalOrders: number;
    ordersChange: number;
    totalRevenue: number;
    realizedRevenue?: number;
    bookedSales?: number;
    deliveredRevenue?: number;
    pendingCollections?: number;
    revenueChange: number;
    activeConversations: number;
    conversationsChange: number;
    pendingDeliveries: number;
    deliveriesChange: number;
  };
  revenueByDay: Array<{ name: string; value: number }>;
  ordersByDay: Array<{
    name: string;
    completed: number;
    pending: number;
    cancelled: number;
  }>;
  statusDistribution: Array<{ name: string; value: number; color: string }>;
  recentOrders: Array<{
    id: string;
    customer: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
  // Premium stats (optional - only for Pro+ plans)
  premium?: {
    recoveredCarts: { count: number; revenue: number };
    deliveryFailures: {
      count: number;
      reasons: Array<{ reason: string; count: number }>;
    };
    financeSummary: {
      profitEstimate: number;
      codPending: number;
      pendingCollections?: number;
      pendingOnline?: number;
      bookedSales?: number;
      deliveredRevenue?: number;
      refundsAmount?: number;
      spendingAlert: boolean;
      grossMargin: number;
    };
  };
}

const AGENT_LABELS: Record<string, string> = {
  CHAT_AGENT: "محادثات",
  SALES_AGENT: "مبيعات",
  FINANCE_AGENT: "حسابات",
  FOLLOWUP_AGENT: "متابعات",
  ORDERS_AGENT: "طلبات",
  VOICE_AGENT: "صوت",
};

function formatTrend(change?: number) {
  if (change === undefined || Number.isNaN(change)) return undefined;
  if (change === 0) return "بدون تغيير";
  return `${change > 0 ? "+" : ""}${change.toFixed(0)}%`;
}

function getFreshness(updatedAt: Date | null) {
  if (!updatedAt) return { label: "لم يتم التحديث", state: "old" as const };

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - updatedAt.getTime()) / 60000),
  );

  if (minutes < 1) return { label: "آخر تحديث: الآن", state: "fresh" as const };
  if (minutes <= 5) {
    return { label: `آخر تحديث: منذ ${minutes} د`, state: "fresh" as const };
  }
  if (minutes <= 30) {
    return { label: `آخر تحديث: منذ ${minutes} د`, state: "stale" as const };
  }
  return { label: "بيانات قديمة", state: "old" as const };
}

function isEmptyDashboard(data: DashboardData, realizedRevenue: number) {
  return (
    data.stats.totalOrders === 0 &&
    realizedRevenue === 0 &&
    data.stats.activeConversations === 0 &&
    data.stats.pendingDeliveries === 0 &&
    data.recentOrders.length === 0
  );
}

function SetupEmptyState() {
  const steps = [
    { label: "تم إنشاء المتجر", done: true },
    { label: "تم ربط القنوات", done: true },
    { label: "أول طلب لم يصل بعد", done: false },
    { label: "المخزون لم يُضاف بعد", done: false },
    { label: "الفريق لم يُدعَ بعد", done: false },
  ];

  return (
    <Card className="app-data-card">
      <CardContent className="p-6">
        <div className="mb-4 inline-flex rounded-[var(--radius-sm)] border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-2 py-1 text-[var(--font-size-xs)] font-semibold text-[var(--color-info-text)]">
          تجريبي
        </div>
        <EmptyState
          icon={<Store className="h-7 w-7" />}
          title="إعداد المتجر"
          description="لا توجد بيانات تشغيل حقيقية بعد. أكمل الخطوات الأساسية لتبدأ لوحة التحكم في عرض مؤشرات يومية مفيدة."
          action={
            <div className="w-full max-w-md space-y-4 text-start">
              <div>
                <div className="flex items-center justify-between text-[var(--font-size-xs)] text-[var(--color-text-secondary)]">
                  <span>3/5 خطوات مكتملة</span>
                  <span>60%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[var(--color-neutral-bg)]">
                  <div className="h-full w-[60%] rounded-full bg-[var(--color-brand-primary)]" />
                </div>
              </div>
              <div className="space-y-2">
                {steps.map((step) => (
                  <div
                    key={step.label}
                    className="flex items-center gap-2 text-[var(--font-size-sm)]"
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 text-[var(--color-success-text)]" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-[var(--color-border)]" />
                    )}
                    <span
                      className={
                        step.done
                          ? "text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-secondary)]"
                      }
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
              <Button asChild className="w-full">
                <Link href="/merchant/onboarding">اكمل الإعداد</Link>
              </Button>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}

export default function MerchantDashboard() {
  const { data: session } = useSession();
  const { merchantId, apiKey, isDemo, merchant } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const effectivePeriodDays = 1;

  // Resolve Pro access from plan and entitlements to avoid false downgrade when /me has partial payload
  const planUpper = (merchant?.plan || "").toUpperCase();
  const enabledAgentsUpper = (merchant?.enabledAgents || []).map((agent) =>
    String(agent || "").toUpperCase(),
  );
  const enabledFeaturesUpper = (merchant?.enabledFeatures || []).map(
    (feature) => String(feature || "").toUpperCase(),
  );
  const hasProByPlan =
    planUpper === "PRO" ||
    planUpper === "ENTERPRISE" ||
    planUpper === "PROFESSIONAL" ||
    planUpper === "CUSTOM";
  const hasProByEntitlements =
    enabledAgentsUpper.includes("FINANCE_AGENT") ||
    enabledFeaturesUpper.includes("KPI_DASHBOARD");
  const hasPro = hasProByPlan || hasProByEntitlements;
  const fetchDashboardData = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    try {
      setError(null);
      const result = await merchantApi.getDashboardStats(
        merchantId,
        apiKey,
        effectivePeriodDays,
      );
      setData(result);
      setLastUpdatedAt(new Date());
      // Fetch subscription usage and the daily operating brief in background.
      // Skip in demo mode - no session → 401 → signOut redirect loop.
      if (!isDemo) {
        portalApi
          .getCfoAiBrief()
          .then((r) => {
            const brief =
              (r as any)?.data?.summaryAr || (r as any)?.summaryAr || null;
            if (brief) setAiBrief(brief);
          })
          .catch(() => null);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data");
      setError(
        err instanceof Error ? err.message : "فشل في تحميل بيانات لوحة التحكم",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="لوحة التحكم" />
        <DashboardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="لوحة التحكم" />
        <Card className="app-data-card border-[color:rgba(239,68,68,0.28)] bg-[color:rgba(239,68,68,0.10)]">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-6 w-6 text-[var(--accent-danger)]" />
            <div>
              <p className="font-medium text-[var(--text-primary)]">
                خطأ في تحميل البيانات
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                تعذر تحميل بيانات لوحة التحكم حالياً. حاول مرة أخرى بعد قليل.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleRefresh}
              className="me-auto"
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const realizedRevenue =
    data.stats.realizedRevenue ?? data.stats.totalRevenue ?? 0;
  const pendingCollections =
    data.stats.pendingCollections ??
    data.premium?.financeSummary?.pendingCollections ??
    0;
  const freshness = getFreshness(lastUpdatedAt);
  const normalizedRole = normalizePortalRole(session?.user?.role);
  const canSeeBranchHealth =
    normalizedRole === "owner" || normalizedRole === "admin";
  const hasNoOperationalData = isEmptyDashboard(data, realizedRevenue);

  const attentionItems: Array<{
    severity: ActionItemSeverity;
    title: string;
    description?: string;
    actionLabel: string;
    actionHref: string;
  }> = [
    data.stats.pendingDeliveries > 0
      ? {
          severity: data.stats.pendingDeliveries > 5 ? "critical" : "warning",
          title: `${data.stats.pendingDeliveries} توصيلات معلقة`,
          description: "راجع الطلبات التي لم تغلق دورة التسليم بعد.",
          actionLabel: "مراجعة",
          actionHref: "/merchant/orders",
        }
      : null,
    pendingCollections > 0
      ? {
          severity: "warning",
          title: `تحصيلات COD معلقة بقيمة ${formatCurrency(pendingCollections)}`,
          description: "تأخير التحصيل يؤثر على التدفق النقدي اليومي.",
          actionLabel: "تسوية",
          actionHref: "/merchant/payments/cod",
        }
      : null,
    data.premium?.deliveryFailures?.count
      ? {
          severity: "critical",
          title: `${data.premium.deliveryFailures.count} إخفاقات توصيل`,
          description: "تحتاج متابعة مع شركة الشحن أو الفرع المسؤول.",
          actionLabel: "مراجعة",
          actionHref: "/merchant/orders",
        }
      : null,
    data.premium?.financeSummary?.spendingAlert
      ? {
          severity: "warning",
          title: "المصاريف تتجاوز الإيرادات",
          description: "راجع المصروفات اليومية قبل نهاية الوردية.",
          actionLabel: "المصاريف",
          actionHref: "/merchant/expenses",
        }
      : null,
    data.stats.activeConversations > 5
      ? {
          severity: "info",
          title: `${data.stats.activeConversations} محادثات مفتوحة`,
          description: "الرد السريع يحافظ على معدل التحويل.",
          actionLabel: "فتح",
          actionHref: "/merchant/conversations",
        }
      : null,
  ].filter(Boolean) as Array<{
    severity: ActionItemSeverity;
    title: string;
    description?: string;
    actionLabel: string;
    actionHref: string;
  }>;

  const systemActivities = [
    aiBrief
      ? {
          label: "تم تجهيز تقرير التشغيل اليومي",
          detail: "آخر موجز متاح للمالك والفريق.",
        }
      : null,
    data.premium?.recoveredCarts?.count
      ? {
          label: `تم استرداد ${data.premium.recoveredCarts.count} سلات`,
          detail: `قيمة مستردة ${formatCurrency(data.premium.recoveredCarts.revenue)}`,
        }
      : null,
    enabledAgentsUpper.length > 0
      ? {
          label: `تعمل ${enabledAgentsUpper.length} قدرات تشغيلية حالياً`,
          detail: enabledAgentsUpper
            .slice(0, 3)
            .map((agent) => AGENT_LABELS[agent] ?? agent)
            .join("، "),
        }
      : null,
    pendingCollections > 0
      ? {
          label: "تم تحديث متابعة التحصيل",
          detail: `${formatCurrency(pendingCollections)} لا تزال قيد التسوية.`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; detail: string }>;

  const recommendations = hasNoOperationalData
    ? []
    : generateDashboardInsights({
        todayOrders: data.stats.totalOrders,
        todayRevenue: realizedRevenue,
        pendingOrders: data.stats.pendingDeliveries,
        lowStockCount: 0,
        unreadNotifications: 0,
        activeConversations: data.stats.activeConversations,
        periodLabel: "اليوم",
      }).slice(0, 3);

  return (
    <div className="space-y-6 pb-24 animate-fadeIn">
      <PageHeader
        title="الرئيسية"
        description="فحص يومي سريع لصحة التشغيل وما يحتاج قراراً الآن."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
          </div>
        }
      />

      {hasNoOperationalData ? <SetupEmptyState /> : null}

      {!hasNoOperationalData ? (
        <section className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="grid gap-0 lg:grid-cols-4">
            <MetricCell
              icon={<Wallet className="h-4 w-4" />}
              label="إيرادات اليوم"
              value={formatCurrency(realizedRevenue)}
              trend={formatTrend(data.stats.revenueChange)}
              freshness={freshness.label}
              freshnessState={freshness.state}
            />
            <MetricCell
              icon={<ShoppingCart className="h-4 w-4" />}
              label="الطلبات النشطة"
              value={data.stats.pendingDeliveries}
              trend={formatTrend(data.stats.ordersChange)}
              freshness={freshness.label}
              freshnessState={freshness.state}
            />
            <MetricCell
              icon={<MessageSquare className="h-4 w-4" />}
              label="محادثات مفتوحة"
              value={data.stats.activeConversations}
              trend={formatTrend(data.stats.conversationsChange)}
              freshness={freshness.label}
              freshnessState={freshness.state}
            />
            <MetricCell
              icon={<Truck className="h-4 w-4" />}
              label="توصيلات معلقة"
              value={data.stats.pendingDeliveries}
              trend={formatTrend(data.stats.deliveriesChange)}
              freshness={freshness.label}
              freshnessState={freshness.state}
            />
          </div>
        </section>
      ) : null}

      {!hasNoOperationalData ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[var(--font-size-base)] font-semibold text-[var(--color-text-primary)]">
              يحتاج انتباهك
            </h2>
            {attentionItems.length > 5 ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/merchant/notifications">عرض جميع الإجراءات</Link>
              </Button>
            ) : null}
          </div>
          {attentionItems.length > 0 ? (
            <div className="space-y-2">
              {attentionItems.slice(0, 5).map((item) => (
                <ActionItem
                  key={item.title}
                  severity={item.severity}
                  title={item.title}
                  description={item.description}
                  time={freshness.label.replace("آخر تحديث: ", "")}
                  actionLabel={item.actionLabel}
                  actionHref={item.actionHref}
                />
              ))}
            </div>
          ) : (
            <Card className="app-data-card">
              <CardContent className="p-4">
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="لا توجد إجراءات عاجلة الآن"
                  description="كل المؤشرات التشغيلية المتاحة لا تحتاج تدخلاً فورياً. راقب التحديث التالي قبل نهاية الوردية."
                  className="py-8"
                />
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="app-data-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-[var(--color-brand-primary)]" />
              النظام عمل لك
            </CardTitle>
          </CardHeader>
          <CardContent>
            {systemActivities.length > 0 ? (
              <div className="space-y-3">
                {systemActivities.map((activity) => (
                  <div key={activity.label} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{activity.label}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        {activity.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                لا يوجد نشاط آلي مسجل خلال آخر 24 ساعة.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="app-data-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-[var(--color-brand-primary)]" />
              تقرير التشغيل اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiBrief ? (
              <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                {aiBrief}
              </p>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {hasPro
                  ? "يتم تجهيز تقرير التشغيل اليومي عند توفر بيانات كافية."
                  : "يتوفر تقرير التشغيل اليومي ضمن باقات التشغيل الكاملة."}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {canSeeBranchHealth ? (
        <section className="space-y-3">
          <h2 className="text-[var(--font-size-base)] font-semibold text-[var(--color-text-primary)]">
            صحة الفروع
          </h2>
          <Card className="app-data-card">
            <CardContent className="p-4">
              <EmptyState
                icon={<Store className="h-6 w-6" />}
                title="بيانات الفروع التفصيلية غير جاهزة هنا"
                description="لا نعرض أرقاماً تقديرية. افتح صفحة الفروع لمراجعة البيانات المتاحة أو اربط الفروع لتظهر صحة كل فرع في هذه المساحة."
                action={
                  <Button asChild variant="outline">
                    <Link href="/merchant/branches">فتح الفروع</Link>
                  </Button>
                }
                className="py-8"
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      {!hasNoOperationalData ? (
        <section className="space-y-3">
          <h2 className="text-[var(--font-size-base)] font-semibold text-[var(--color-text-primary)]">
            توصيات مقترحة
          </h2>
          {recommendations.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {recommendations.map((insight: AiInsight) => (
                <Card
                  key={insight.id}
                  className="border-[var(--color-ai-border)] bg-[var(--color-ai-bg)]"
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-[var(--color-ai-icon)]" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-ai-text)]">
                          {insight.title}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-[var(--color-ai-text)]/85">
                          {insight.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-ai-text)]">
                      <span>مصدرها: بيانات تشغيل اليوم</span>
                      <span>{freshness.label}</span>
                    </div>
                    {insight.actionLabel && insight.actionHref ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="bg-white/60"
                      >
                        <Link href={insight.actionHref}>
                          {insight.actionLabel}
                        </Link>
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="app-data-card">
              <CardContent className="p-4">
                <EmptyState
                  icon={<AlertTriangle className="h-6 w-6" />}
                  title="لا توجد توصية تشغيلية الآن"
                  description="لا توجد إشارة كافية لإجراء مقترح. ستظهر التوصيات عندما تتغير الطلبات أو المحادثات أو التحصيلات."
                  className="py-8"
                />
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}

      <div className="sticky bottom-4 z-20 rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-lg)]">
        <div className="grid gap-2 sm:grid-cols-4">
          <Button asChild>
            <Link href="/merchant/orders">+ طلب جديد</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/merchant/cashier">جلسة كاشير</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/merchant/conversations">محادثة جديدة</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/merchant/reports">تقرير اليوم</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
