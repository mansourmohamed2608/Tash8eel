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
import { merchantApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useToast } from "@/hooks/use-toast";
import {
  AiInsightsCard,
  generateReportsInsights,
} from "@/components/ai/ai-insights-card";
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
    <div class="card"><div class="k">إجمالي الإيرادات المحققة</div><div class="v">${formatMoney(data.stats.totalRevenue)}</div></div>
    <div class="card"><div class="k">إجمالي الطلبات</div><div class="v">${formatNum(data.stats.totalOrders)}</div></div>
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
    const text = encodeURIComponent(
      `📊 ملخص الأداء - ${selectedPeriodSummary}\n\n` +
        `📦 الطلبات: ${stats.totalOrders}\n` +
        `💰 الإيرادات: ${formatCurrency(stats.totalRevenue)}\n` +
        `💬 المحادثات: ${stats.activeConversations}\n` +
        `🚚 التوصيلات المعلقة: ${stats.pendingDeliveries}\n\n` +
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
      <div className="space-y-6">
        <PageHeader title="التقارير" />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <div>
              <p className="font-medium text-red-800">خطأ في تحميل البيانات</p>
              <p className="text-sm text-red-600">{error}</p>
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

  if (!dashboardData) {
    return (
      <div className="space-y-6">
        <PageHeader title="التقارير" />
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-6 w-6 text-yellow-500" />
            <p className="text-yellow-800">لا توجد بيانات متاحة</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { stats, revenueByDay, ordersByDay, statusDistribution } =
    dashboardData;

  const totalOrdersInStatus = statusDistribution.reduce(
    (sum, s) => sum + s.value,
    0,
  );
  const completedOrders =
    statusDistribution.find((s) => s.name === "مكتمل")?.value || 0;

  // Revenue is realized; compute AOV against realized orders to avoid mixed definitions.
  const avgOrderValue =
    completedOrders > 0 ? Math.round(stats.totalRevenue / completedOrders) : 0;

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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="التقارير"
        description="تحليل أداء متجرك ومؤشرات النجاح"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
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
            {canExport && (
              <Button variant="outline" onClick={handleExportPDF}>
                <FileText className="h-4 w-4" />
                تصدير
              </Button>
            )}
            {canExport && (
              <Button variant="outline" onClick={handleShareWhatsApp}>
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            )}
          </div>
        }
      />

      {/* AI Reports Insights */}
      <AiInsightsCard
        title="تحليلات التقارير"
        insights={generateReportsInsights({
          totalRevenue: stats.totalRevenue,
          totalOrders: stats.totalOrders,
          avgOrderValue:
            completedOrders > 0 ? stats.totalRevenue / completedOrders : 0,
        })}
        loading={loading}
      />

      {/* KPI Overview */}
      <KPIGrid>
        <StatCard
          title="إجمالي الإيرادات المحققة"
          value={formatCurrency(stats.totalRevenue)}
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

      {/* Tabs for different reports */}
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sales">المبيعات</TabsTrigger>
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="conversion">التحويل</TabsTrigger>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ملخص الفترة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
                  <p className="text-xl font-bold text-green-600">
                    {completionRate}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">نسبة الإلغاء</p>
                  <p className="text-xl font-bold text-red-600">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    <p className="text-4xl font-bold text-green-600">
                      {conversionData.rates.cartRate}%
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      إضافة للسلة
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold text-blue-600">
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
                    <div className="flex items-center justify-between">
                      <span>إجمالي المحادثات</span>
                      <span className="font-bold">
                        {conversionData.funnel.totalConversations}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full"
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span>أضافوا للسلة</span>
                      <span className="font-bold">
                        {conversionData.funnel.addedToCart}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-green-500 h-4 rounded-full"
                        style={{ width: `${conversionData.rates.cartRate}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span>بدأوا الدفع</span>
                      <span className="font-bold">
                        {conversionData.funnel.startedCheckout}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-yellow-500 h-4 rounded-full"
                        style={{
                          width: `${conversionData.rates.checkoutRate}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span>أكملوا الطلب</span>
                      <span className="font-bold">
                        {conversionData.funnel.completedOrder}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-purple-600 h-4 rounded-full"
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
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="flex items-center gap-3 p-6">
                <AlertCircle className="h-6 w-6 text-yellow-500" />
                <p className="text-yellow-800">
                  بيانات التحويل غير متاحة حالياً
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Quick Links to Sub-Reports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/merchant/reports/cfo">
          <Card className="hover:border-primary/40 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600" />
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
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 bg-green-100 rounded-lg">
                <FileText className="h-6 w-6 text-green-600" />
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
