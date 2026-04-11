"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { AreaChart, BarChart, PieChart } from "@/components/charts";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  ShoppingCart,
  Users,
  MessageSquare,
  Calendar,
  FileText,
  MessageCircle,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import portalApi from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useToast } from "@/hooks/use-toast";
import {
  getReportingDateRange,
  REPORTING_PERIOD_OPTIONS,
  getStoredReportingDays,
  resolveReportingDays,
  setStoredReportingDays,
  mapDaysToPdfPeriod,
} from "@/lib/reporting-period";

interface ReportsData {
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
}

interface ConversionData {
  period: { days: number; startDate: string };
  funnel: {
    totalConversations: number;
    addedToCart: number;
    startedCheckout: number;
    completedOrder: number;
  };
  rates: {
    cartRate: number;
    checkoutRate: number;
    conversionRate: number;
    cartToCheckout: number;
    checkoutToOrder: number;
  };
}

interface PopularProduct {
  id?: string;
  rank: number;
  itemId: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

function buildReportHtml(data: ReportsData, period: number): string {
  const formatMoney = (value: number) =>
    new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
    }).format(value || 0);
  const formatNum = (value: number) =>
    new Intl.NumberFormat("ar-EG").format(value || 0);
  const dayLabel =
    REPORTING_PERIOD_OPTIONS.find((p) => p.value === period)?.label ||
    `آخر ${period} يوم`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير الأداء</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 32px; color: #0f172a; }
    .head { border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; padding-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; }
    .k { color: #64748b; font-size: 12px; margin-bottom: 4px; }
    .v { font-size: 22px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: right; }
    th { background: #f1f5f9; font-weight: 700; }
    .meta { color: #64748b; font-size: 12px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="head">
    <h1>تقرير الأداء</h1>
    <div>${dayLabel}</div>
    <div class="meta">تاريخ الإنشاء: ${new Date().toLocaleString("ar-EG")}</div>
  </div>
  <div class="grid">
    <div class="card"><div class="k">إجمالي الإيرادات المحققة</div><div class="v">${formatMoney(data.stats.realizedRevenue ?? data.stats.totalRevenue)}</div></div>
    <div class="card"><div class="k">إجمالي الطلبات</div><div class="v">${formatNum(data.stats.totalOrders)}</div></div>
    <div class="card"><div class="k">إجمالي المبيعات المحجوزة</div><div class="v">${formatMoney(data.stats.bookedSales || 0)}</div></div>
    <div class="card"><div class="k">مبالغ قيد التحصيل</div><div class="v">${formatMoney(data.stats.pendingCollections || 0)}</div></div>
    <div class="card"><div class="k">المحادثات النشطة</div><div class="v">${formatNum(data.stats.activeConversations)}</div></div>
    <div class="card"><div class="k">التوصيلات المعلقة</div><div class="v">${formatNum(data.stats.pendingDeliveries)}</div></div>
  </div>
  <h2>حالة الطلبات</h2>
  <table>
    <thead><tr><th>الحالة</th><th>العدد</th></tr></thead>
    <tbody>
      ${(data.statusDistribution || []).map((item) => `<tr><td>${item.name}</td><td>${formatNum(item.value)}</td></tr>`).join("")}
    </tbody>
  </table>
  <h2>آخر الطلبات</h2>
  <table>
    <thead><tr><th>رقم الطلب</th><th>العميل</th><th>القيمة</th><th>الحالة</th></tr></thead>
    <tbody>
      ${(data.recentOrders || []).map((item) => `<tr><td>${item.id}</td><td>${item.customer}</td><td>${formatMoney(item.total)}</td><td>${item.status}</td></tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
}

export default function ReportsPage() {
  const { merchantId, apiKey } = useMerchant();
  const { canExport } = useRoleAccess("reports");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<number>(() =>
    getStoredReportingDays(30),
  );
  const [waTrend, setWaTrend] = useState<{
    trend: Array<{
      name: string;
      value: number;
      delivered: number;
      failed: number;
      rate: number;
    }>;
    overallRate: number;
  } | null>(null);
  const effectivePeriodDays = useMemo(
    () => resolveReportingDays(period),
    [period],
  );
  const periodRange = useMemo(() => getReportingDateRange(period), [period]);

  const [dashboardData, setDashboardData] = useState<ReportsData | null>(null);
  const [conversionData, setConversionData] = useState<ConversionData | null>(
    null,
  );
  const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);

  const fetchReportsData = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    setError(null);
    try {
      const [dashboard, conversion, products] = await Promise.all([
        merchantApi.getDashboardStats(merchantId, apiKey, effectivePeriodDays),
        merchantApi
          .getConversionAnalytics(apiKey, effectivePeriodDays)
          .catch(() => null),
        merchantApi
          .getPopularProductsAnalytics(apiKey, effectivePeriodDays, 10)
          .catch(() => ({ products: [] })),
      ]);

      setDashboardData(dashboard);
      setConversionData(conversion);
      // Map products to ensure they have an id for DataTable
      const mappedProducts = (products.products || []).map(
        (p: any, index: number) => ({
          ...p,
          id: p.itemId || String(index),
        }),
      );
      setPopularProducts(mappedProducts);

      // Fetch WhatsApp delivery trend in background
      portalApi
        .getWhatsappDeliveryTrend(14)
        .then((r) => {
          if (r?.trend?.length) {
            setWaTrend({
              trend: r.trend.map((d) => ({
                name: d.date,
                value: d.sent,
                delivered: d.delivered,
                failed: d.failed,
                rate: d.rate,
              })),
              overallRate: r.overallRate,
            });
          }
        })
        .catch(() => null);
    } catch (err) {
      console.error("Failed to fetch reports:", err);
      setError(err instanceof Error ? err.message : "فشل في تحميل التقارير");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [merchantId, apiKey, effectivePeriodDays]);

  const selectedPeriodLabel =
    REPORTING_PERIOD_OPTIONS.find((p) => p.value === period)?.label ||
    `آخر ${period} يوم`;
  const selectedPeriodSummary =
    period === 365
      ? `من ${periodRange.startDate.toLocaleDateString("ar-EG")} حتى ${periodRange.endDate.toLocaleDateString("ar-EG")}`
      : selectedPeriodLabel;

  useEffect(() => {
    fetchReportsData();
  }, [fetchReportsData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReportsData();
  };

  const handleExportPDF = async () => {
    if (!dashboardData) return;
    try {
      const html = buildReportHtml(dashboardData, period);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `تقرير-${mapDaysToPdfPeriod(period)}-${new Date().toISOString().split("T")[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "تم التحميل", description: "تم تنزيل التقرير بنجاح" });
    } catch (err) {
      console.error("Failed to export PDF:", err);
      toast({
        title: "خطأ",
        description: "فشل في تحميل التقرير",
        variant: "destructive",
      });
    }
  };

  const handleShareWhatsApp = useCallback(() => {
    if (!dashboardData) return;
    const { stats } = dashboardData;
    const realizedRevenue = stats.realizedRevenue ?? stats.totalRevenue;
    const text = encodeURIComponent(
      `ملخص الأداء - ${selectedPeriodSummary}\n\n` +
        `الطلبات: ${stats.totalOrders}\n` +
        `الإيرادات المحققة: ${formatCurrency(realizedRevenue)}\n` +
        `المبيعات المحجوزة: ${formatCurrency(stats.bookedSales || 0)}\n` +
        `قيد التحصيل: ${formatCurrency(stats.pendingCollections || 0)}\n` +
        `المحادثات: ${stats.activeConversations}\n` +
        `التوصيلات المعلقة: ${stats.pendingDeliveries}\n\n` +
        `تم إنشاؤه بواسطة تسهيل`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [dashboardData, selectedPeriodSummary]);

  if (loading) {
    return (
      <div>
        <PageHeader title="التقارير" />
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader title="التقارير" />
        <Card className="border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/10">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-6 w-6 text-[var(--accent-danger)]" />
            <div>
              <p className="font-medium text-[var(--accent-danger)]">
                خطأ في تحميل البيانات
              </p>
              <p className="text-sm text-[var(--accent-danger)]">{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={handleRefresh}
              className="mr-0 w-full sm:mr-auto sm:w-auto"
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader title="التقارير" />
        <Card className="border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/10">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-6 w-6 text-[var(--accent-warning)]" />
            <p className="text-[var(--accent-warning)]">لا توجد بيانات متاحة</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { stats, revenueByDay, ordersByDay, statusDistribution } =
    dashboardData;
  const realizedRevenue = stats.realizedRevenue ?? stats.totalRevenue;
  const bookedSales = stats.bookedSales ?? 0;
  const deliveredRevenue = stats.deliveredRevenue ?? 0;
  const pendingCollections = stats.pendingCollections ?? 0;

  const totalOrdersInStatus = statusDistribution.reduce(
    (sum, s) => sum + s.value,
    0,
  );
  const completedOrders =
    statusDistribution.find((s) => s.name === "مكتمل")?.value || 0;

  // Revenue is realized; compute AOV against realized orders to avoid mixed definitions.
  const avgOrderValue =
    completedOrders > 0 ? Math.round(realizedRevenue / completedOrders) : 0;

  // Find max revenue day
  const maxRevenueDay = revenueByDay.reduce(
    (max, day) => (day.value > max.value ? day : max),
    { name: "-", value: 0 },
  );

  // Calculate completion rate
  const completionRate =
    totalOrdersInStatus > 0
      ? Math.round((completedOrders / totalOrdersInStatus) * 100)
      : 0;

  // Calculate cancellation rate
  const cancelledOrders =
    statusDistribution.find((s) => s.name === "ملغي")?.value || 0;
  const cancellationRate =
    totalOrdersInStatus > 0
      ? Math.round((cancelledOrders / totalOrdersInStatus) * 100)
      : 0;

  return (
    <div className="space-y-8 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="التقارير"
        description="قراءة تنفيذية للأداء والمبيعات والتحويل خلال الفترة المحددة."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full sm:w-auto"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
              تحديث
            </Button>
            <Select
              value={String(period)}
              onValueChange={(v) => {
                const next = Number(v);
                setPeriod(next);
                setStoredReportingDays(next);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
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
            {canExport && (
              <Button
                variant="outline"
                onClick={handleExportPDF}
                className="w-full sm:w-auto"
              >
                <FileText className="h-4 w-4" />
                تصدير
              </Button>
            )}
            {canExport && (
              <Button
                variant="outline"
                onClick={handleShareWhatsApp}
                className="w-full sm:w-auto"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {[
          `الفترة: ${selectedPeriodSummary}`,
          `الإيراد المحقق: ${formatCurrency(realizedRevenue)}`,
          `الطلبات: ${formatNumber(stats.totalOrders)}`,
          `الإكمال: ${completionRate}%`,
        ].map((chip) => (
          <div
            key={chip}
            className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-secondary)]"
          >
            {chip}
          </div>
        ))}
      </div>

      {/* KPI Overview */}
      <KPIGrid>
        <StatCard
          title="إجمالي الإيرادات المحققة"
          value={formatCurrency(realizedRevenue)}
          change={stats.revenueChange}
          changeLabel="من الفترة السابقة"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="إجمالي الطلبات"
          value={formatNumber(stats.totalOrders)}
          change={stats.ordersChange}
          changeLabel="من الفترة السابقة"
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <StatCard
          title="التوصيلات المعلقة"
          value={formatNumber(stats.pendingDeliveries)}
          change={stats.deliveriesChange}
          changeLabel="من الفترة السابقة"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="المحادثات النشطة"
          value={formatNumber(stats.activeConversations)}
          change={stats.conversationsChange}
          changeLabel="من الفترة السابقة"
          icon={<MessageSquare className="h-5 w-5" />}
        />
      </KPIGrid>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="app-data-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              إجمالي المبيعات المحجوزة
            </p>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(bookedSales)}
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              الإيراد من الطلبات المسلّمة
            </p>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(deliveredRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">مبالغ قيد التحصيل</p>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(pendingCollections)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different reports */}
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <TabsTrigger value="sales" className="w-full">
            المبيعات
          </TabsTrigger>
          <TabsTrigger value="products" className="w-full">
            المنتجات
          </TabsTrigger>
          <TabsTrigger value="conversion" className="w-full">
            التحويل
          </TabsTrigger>
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AreaChart
              data={revenueByDay}
              title="الإيرادات اليومية"
              color="#3b82f6"
            />
            <BarChart
              data={ordersByDay}
              title="حالة الطلبات اليومية"
              bars={[
                { dataKey: "completed", color: "#22c55e", name: "مكتمل" },
                { dataKey: "pending", color: "#f59e0b", name: "معلق" },
                { dataKey: "cancelled", color: "#ef4444", name: "ملغي" },
              ]}
            />
          </div>

          <Card className="app-data-card">
            <CardHeader>
              <CardTitle className="text-base">ملخص الفترة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    متوسط قيمة الطلب
                  </p>
                  <p className="text-xl font-bold">
                    {formatCurrency(avgOrderValue)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    أعلى يوم مبيعات
                  </p>
                  <p className="text-xl font-bold">
                    {formatCurrency(maxRevenueDay.value)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {maxRevenueDay.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">نسبة الإكمال</p>
                  <p className="text-xl font-bold text-[var(--accent-success)]">
                    {completionRate}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">نسبة الإلغاء</p>
                  <p className="text-xl font-bold text-[var(--accent-danger)]">
                    {cancellationRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PieChart data={statusDistribution} title="توزيع حالة الطلبات" />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  أفضل المنتجات مبيعاً
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {popularProducts.length > 0 ? (
                  <>
                    <div className="space-y-4 p-6 md:hidden">
                      {popularProducts.map((product) => (
                        <div key={product.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-muted-foreground">
                                #{product.rank}
                              </div>
                              <div className="font-medium">{product.name}</div>
                            </div>
                            <div className="text-sm font-semibold">
                              {formatCurrency(product.totalRevenue)}
                            </div>
                          </div>
                          <div className="mt-3 text-sm text-muted-foreground">
                            الكمية: {formatNumber(product.totalQuantity)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block">
                      <DataTable
                        data={popularProducts}
                        columns={[
                          { key: "rank", header: "#" },
                          { key: "name", header: "المنتج" },
                          { key: "totalQuantity", header: "الكمية" },
                          {
                            key: "totalRevenue",
                            header: "الإيرادات",
                            render: (item) => formatCurrency(item.totalRevenue),
                          },
                        ]}
                      />
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center text-muted-foreground">
                    لا توجد بيانات منتجات متاحة
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Conversion Tab */}
        <TabsContent value="conversion" className="space-y-6">
          {conversionData ? (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold text-primary-600">
                      {conversionData.rates.conversionRate}%
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      معدل التحويل
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold text-[var(--accent-success)]">
                      {conversionData.rates.cartRate}%
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      إضافة للسلة
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold text-[var(--accent-blue)]">
                      {conversionData.rates.checkoutRate}%
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      بدء الدفع
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">قمع التحويل</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span>إجمالي المحادثات</span>
                      <span className="font-bold">
                        {conversionData.funnel.totalConversations}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="h-4 rounded-full bg-[var(--accent-blue)]"
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span>أضافوا للسلة</span>
                      <span className="font-bold">
                        {conversionData.funnel.addedToCart}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="h-4 rounded-full bg-[var(--accent-success)]"
                        style={{ width: `${conversionData.rates.cartRate}%` }}
                      />
                    </div>

                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span>بدأوا الدفع</span>
                      <span className="font-bold">
                        {conversionData.funnel.startedCheckout}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="h-4 rounded-full bg-[var(--accent-warning)]"
                        style={{
                          width: `${conversionData.rates.checkoutRate}%`,
                        }}
                      />
                    </div>

                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span>أكملوا الطلب</span>
                      <span className="font-bold">
                        {conversionData.funnel.completedOrder}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="h-4 rounded-full bg-[var(--accent-gold)]"
                        style={{
                          width: `${conversionData.rates.conversionRate}%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/10">
              <CardContent className="flex items-center gap-3 p-6">
                <AlertCircle className="h-6 w-6 text-[var(--accent-warning)]" />
                <p className="text-[var(--accent-warning)]">
                  بيانات التحويل غير متاحة حالياً
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* WhatsApp Delivery Trend */}
      {waTrend && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[var(--accent-success)]" />
                معدل تسليم واتساب (14 يوم)
              </CardTitle>
              <span
                className={cn(
                  "text-sm font-bold px-2 py-0.5 rounded",
                  waTrend.overallRate >= 90
                    ? "bg-[var(--accent-success)]/15 text-[var(--accent-success)]"
                    : waTrend.overallRate >= 70
                      ? "bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]"
                      : "bg-[var(--accent-danger)]/15 text-[var(--accent-danger)]",
                )}
              >
                {waTrend.overallRate}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <AreaChart data={waTrend.trend} title="" color="#22c55e" />
            <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
              <span>
                إجمالي المرسل:{" "}
                {waTrend.trend
                  .reduce((s, r) => s + r.value, 0)
                  .toLocaleString("ar-EG")}
              </span>
              <span>
                مسلّم:{" "}
                {waTrend.trend
                  .reduce((s, r) => s + r.delivered, 0)
                  .toLocaleString("ar-EG")}
              </span>
              <span>
                فشل:{" "}
                {waTrend.trend
                  .reduce((s, r) => s + r.failed, 0)
                  .toLocaleString("ar-EG")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links to Sub-Reports */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <a href="/merchant/reports/cfo">
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
              <div className="rounded-lg border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10 p-3">
                <FileText className="h-6 w-6 text-[var(--accent-blue)]" />
              </div>
              <div>
                <h3 className="font-semibold">التقرير التنفيذي (CFO Brief)</h3>
                <p className="text-sm text-muted-foreground">
                  ملخص مالي شامل بالإيرادات والمصروفات والتدفق النقدي
                </p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="/merchant/reports/accountant">
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
              <div className="rounded-lg border border-[var(--accent-success)]/20 bg-[var(--accent-success)]/10 p-3">
                <FileText className="h-6 w-6 text-[var(--accent-success)]" />
              </div>
              <div>
                <h3 className="font-semibold">حزمة المحاسب</h3>
                <p className="text-sm text-muted-foreground">
                  صدّر الطلبات والمصروفات وحركة المخزون بصيغة CSV لمحاسبك
                </p>
              </div>
            </CardContent>
          </Card>
        </a>
      </div>
    </div>
  );
}
