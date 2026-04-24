"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { AreaChart, BarChart, PieChart } from "@/components/charts";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  MessageSquare,
  TrendingUp,
  Package,
  RefreshCw,
  AlertCircle,
  Wallet,
  Truck,
  RotateCcw,
  AlertTriangle,
  DollarSign,
  ArrowUpRight,
  Lock,
  Calendar,
} from "lucide-react";
import {
  formatCurrency,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
  cn,
} from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import portalApi from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import {
  getReportingDateRange,
  REPORTING_PERIOD_OPTIONS,
  getStoredReportingDays,
  resolveReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";

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

export default function MerchantDashboard() {
  const { merchantId, apiKey, isDemo, merchant } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(() =>
    getStoredReportingDays(30),
  );
  const [subUsage, setSubUsage] = useState<{
    tokensUsed: number;
    tokenLimit: number;
    tokenPct: number;
    conversationsUsed: number;
    conversationLimit: number;
    conversationPct: number;
    planName: string;
    periodEnd: string | null;
  } | null>(null);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const effectivePeriodDays = useMemo(
    () => resolveReportingDays(periodDays),
    [periodDays],
  );
  const periodRange = useMemo(
    () => getReportingDateRange(periodDays),
    [periodDays],
  );

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
  const hasFinance =
    merchant?.features?.reports ||
    hasPro ||
    enabledFeaturesUpper.includes("REPORTS");

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
      // Fetch subscription usage and AI brief in background.
      // Skip in demo mode - no session → 401 → signOut redirect loop.
      if (!isDemo) {
        portalApi
          .getSubscriptionUsage()
          .then((r) => setSubUsage(r))
          .catch(() => null);
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
  }, [merchantId, apiKey, effectivePeriodDays]);

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
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <div>
              <p className="font-medium text-red-800">خطأ في تحميل البيانات</p>
              <p className="text-sm text-red-600">
                تعذر تحميل بيانات لوحة التحكم حالياً. حاول مرة أخرى بعد قليل.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleRefresh}
              className="mr-auto"
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedPeriodLabel =
    REPORTING_PERIOD_OPTIONS.find((option) => option.value === periodDays)
      ?.label || `آخر ${periodDays} يوم`;
  const selectedPeriodSummary =
    periodDays === 365
      ? `من ${periodRange.startDate.toLocaleDateString("ar-EG")} حتى ${periodRange.endDate.toLocaleDateString("ar-EG")}`
      : selectedPeriodLabel;
  const realizedRevenue =
    data.stats.realizedRevenue ?? data.stats.totalRevenue ?? 0;
  const bookedSales =
    data.stats.bookedSales ??
    data.premium?.financeSummary?.bookedSales ??
    realizedRevenue;
  const deliveredRevenue =
    data.stats.deliveredRevenue ??
    data.premium?.financeSummary?.deliveredRevenue ??
    realizedRevenue;
  const pendingCollections =
    data.stats.pendingCollections ??
    data.premium?.financeSummary?.pendingCollections ??
    0;
  const pendingOnline = data.premium?.financeSummary?.pendingOnline ?? 0;
  const refundsAmount = data.premium?.financeSummary?.refundsAmount ?? 0;

  return (
    <div className="space-y-4 animate-fadeIn">
      <PageHeader
        title="لوحة التحكم"
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={String(periodDays)}
              onValueChange={(value) => {
                const next = Number(value);
                setPeriodDays(next);
                setStoredReportingDays(next);
              }}
            >
              <SelectTrigger className="w-40">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTING_PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {/* Demo Mode Banner */}
      {isDemo && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            <p className="text-sm text-blue-700">
              وضع العرض التجريبي - أنت تستخدم حساب تجريبي.
            </p>
          </CardContent>
        </Card>
      )}

      {/* AI Dashboard Insights */}
      {/* GPT-Powered Smart Analysis */}
      {/* KPI Cards */}
      <KPIGrid>
        <StatCard
          title="إجمالي الطلبات"
          value={data.stats.totalOrders}
          change={data.stats.ordersChange}
          changeLabel="من الفترة السابقة"
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <StatCard
          title="إجمالي الإيرادات المحققة"
          value={formatCurrency(realizedRevenue)}
          change={data.stats.revenueChange}
          changeLabel="من الفترة السابقة"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="المحادثات النشطة"
          value={data.stats.activeConversations}
          change={data.stats.conversationsChange}
          changeLabel="من الفترة السابقة"
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <StatCard
          title="التوصيلات المعلقة"
          value={data.stats.pendingDeliveries}
          change={data.stats.deliveriesChange}
          changeLabel="من الفترة السابقة"
          icon={<Package className="h-5 w-5" />}
        />
      </KPIGrid>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  إجمالي المبيعات المحجوزة
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {formatCurrency(bookedSales)}
                </p>
              </div>
              <Wallet className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  الإيراد من الطلبات المسلّمة
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {formatCurrency(deliveredRevenue)}
                </p>
              </div>
              <Truck className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  مبالغ قيد التحصيل
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {formatCurrency(pendingCollections)}
                </p>
                {pendingOnline > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    منها {formatCurrency(pendingOnline)} دفع إلكتروني قيد
                    المعالجة
                  </p>
                ) : null}
              </div>
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">مرتجعات الفترة</p>
                <p className="mt-2 text-2xl font-bold">
                  {formatCurrency(refundsAmount)}
                </p>
              </div>
              <RotateCcw className="h-5 w-5 text-rose-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Premium Insights Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recovered Carts Card */}
        <Card className={cn(!hasPro && "opacity-60")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-green-500" />
                السلات المستردة
              </CardTitle>
              {!hasPro && <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent>
            {!hasPro ? (
              <div className="text-sm text-muted-foreground">
                <Link
                  href="/merchant/plan"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  ترقية للخطة الاحترافية <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            ) : data.premium ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold text-green-600">
                  {data.premium.recoveredCarts.count}
                </p>
                <p className="text-xs text-muted-foreground">
                  قيمة {formatCurrency(data.premium.recoveredCarts.revenue)}
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>بيانات السلات المستردة قيد التحديث.</p>
                <p className="text-xs">تحقق من الإعدادات أو أعد التحديث.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery Failures Card */}
        <Card className={cn(!hasPro && "opacity-60")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4 text-red-500" />
                إخفاقات التوصيل
              </CardTitle>
              {!hasPro && <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent>
            {!hasPro ? (
              <div className="text-sm text-muted-foreground">
                <Link
                  href="/merchant/plan"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  ترقية للخطة الاحترافية <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            ) : data.premium ? (
              <div className="space-y-2">
                <p className="text-2xl font-bold text-red-600">
                  {data.premium.deliveryFailures.count}
                </p>
                {data.premium.deliveryFailures.reasons.length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    {data.premium.deliveryFailures.reasons
                      .slice(0, 2)
                      .map((r, i) => (
                        <div
                          key={i}
                          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span>{r.reason}</span>
                          <Badge variant="secondary" className="text-xs">
                            {r.count}
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>بيانات إخفاقات التوصيل قيد التحديث.</p>
                <p className="text-xs">تحقق من الإعدادات أو أعد التحديث.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Finance Summary Card */}
        <Card className={cn(!hasFinance && "opacity-60")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-500" />
                ملخص مالي
              </CardTitle>
              {!hasFinance && (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!hasFinance ? (
              <div className="text-sm text-muted-foreground">
                <Link
                  href="/merchant/plan"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  ترقية للخطة الاحترافية <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            ) : data.premium ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-muted-foreground">
                    الربح التقديري
                  </span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(data.premium.financeSummary.profitEstimate)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-muted-foreground">
                    COD معلق
                  </span>
                  <span className="font-medium">
                    {formatCurrency(data.premium.financeSummary.codPending)}
                  </span>
                </div>
                {data.premium.financeSummary.spendingAlert && (
                  <div className="flex items-center gap-1 text-amber-600 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    <span>تنبيه: المصاريف تتجاوز الإيرادات</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    هامش الربح
                  </span>
                  <Badge
                    variant={
                      data.premium.financeSummary.grossMargin > 20
                        ? "default"
                        : "destructive"
                    }
                    className="text-xs"
                  >
                    {data.premium.financeSummary.grossMargin.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>الملخص المالي قيد التحديث.</p>
                <p className="text-xs">
                  تحقق من إعدادات المصروفات أو أعد التحديث.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Subscription Usage + AI Brief Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subscription Usage Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              استخدام الخطة الحالية
              {subUsage && (
                <Badge variant="outline" className="text-xs mr-auto">
                  {subUsage.planName}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subUsage ? (
              <>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>الرسائل (توكن AI)</span>
                    <span>
                      {subUsage.tokensUsed.toLocaleString()} /{" "}
                      {subUsage.tokenLimit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        subUsage.tokenPct >= 90
                          ? "bg-red-500"
                          : subUsage.tokenPct >= 70
                            ? "bg-amber-400"
                            : "bg-blue-500"
                      }`}
                      style={{ width: `${Math.min(subUsage.tokenPct, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>المحادثات هذا الشهر</span>
                    <span>
                      {subUsage.conversationsUsed} /{" "}
                      {subUsage.conversationLimit}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        subUsage.conversationPct >= 90
                          ? "bg-red-500"
                          : subUsage.conversationPct >= 70
                            ? "bg-amber-400"
                            : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min(subUsage.conversationPct, 100)}%`,
                      }}
                    />
                  </div>
                </div>
                {subUsage.periodEnd && (
                  <p className="text-xs text-muted-foreground">
                    تجديد الخطة:{" "}
                    {new Date(subUsage.periodEnd).toLocaleDateString("ar-EG")}
                  </p>
                )}
              </>
            ) : (
              <div className="h-16 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                جارٍ تحميل بيانات الاستخدام...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily AI Brief */}
        <Card className="border-purple-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-500" />
              تقرير AI اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiBrief ? (
              <p
                className="text-sm text-muted-foreground leading-relaxed"
                dir="rtl"
              >
                {aiBrief}
              </p>
            ) : (
              <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">
                {hasPro ? (
                  <span className="animate-pulse">
                    يجهز الذكاء الاصطناعي تقريره اليومي...
                  </span>
                ) : (
                  <Link
                    href="/merchant/plan"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    ترقية للخطة الاحترافية <ArrowUpRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AreaChart
          data={data.revenueByDay}
          title="الإيرادات خلال الفترة"
          color="#3b82f6"
        />
        <BarChart
          data={data.ordersByDay}
          title="حالة الطلبات"
          bars={[
            { dataKey: "completed", color: "#22c55e", name: "مكتمل" },
            { dataKey: "pending", color: "#f59e0b", name: "معلق" },
            { dataKey: "cancelled", color: "#ef4444", name: "ملغي" },
          ]}
        />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-medium">
                آخر الطلبات
              </CardTitle>
              <Button variant="ghost" size="sm">
                <Link href="/merchant/orders">عرض الكل</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentOrders.length > 0 ? (
                <DataTable
                  data={data.recentOrders}
                  columns={[
                    { key: "id", header: "رقم الطلب" },
                    { key: "customer", header: "العميل" },
                    {
                      key: "total",
                      header: "المبلغ",
                      render: (item) => formatCurrency(item.total),
                    },
                    {
                      key: "status",
                      header: "الحالة",
                      render: (item) => (
                        <Badge className={getStatusColor(item.status)}>
                          {getStatusLabel(item.status)}
                        </Badge>
                      ),
                    },
                    {
                      key: "createdAt",
                      header: "التاريخ",
                      render: (item) => formatRelativeTime(item.createdAt),
                    },
                  ]}
                />
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  لا توجد طلبات بعد
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <PieChart
          data={data.statusDistribution}
          title="توزيع حالات الطلبات"
          height={250}
        />
      </div>
    </div>
  );
}
