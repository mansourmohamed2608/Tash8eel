"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { AreaChart, BarChart, PieChart } from "@/components/charts";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  ShoppingCart,
  Users,
  MessageSquare,
  Download,
  Calendar,
  Activity,
  Zap,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { portalApi } from "@/lib/client";

interface PlatformStats {
  totalRevenue: number;
  realizedRevenue?: number;
  revenueChange: number;
  totalOrders: number;
  ordersChange: number;
  activeMerchants: number;
  merchantsChange: number;
  totalConversations: number;
  conversationsChange: number;
}

interface TopMerchant {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  conversion: number;
}

interface AgentMetric {
  name: string;
  value: string;
  change: number;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("month");

  const [platformStats, setPlatformStats] = useState<PlatformStats>({
    totalRevenue: 0,
    realizedRevenue: 0,
    revenueChange: 0,
    totalOrders: 0,
    ordersChange: 0,
    activeMerchants: 0,
    merchantsChange: 0,
    totalConversations: 0,
    conversationsChange: 0,
  });
  const [revenueByMonth, setRevenueByMonth] = useState<
    { name: string; value: number }[]
  >([]);
  const [ordersByCategory, setOrdersByCategory] = useState<
    { name: string; value: number; color: string }[]
  >([]);
  const [conversionRates, setConversionRates] = useState<
    { name: string; rate: number }[]
  >([]);
  const [topMerchants, setTopMerchants] = useState<TopMerchant[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<AgentMetric[]>([]);
  const [hourlyActivity, setHourlyActivity] = useState<
    { name: string; conversations: number; orders: number }[]
  >([]);
  const peakHours = hourlyActivity
    .map((entry) => ({
      ...entry,
      totalActivity: (entry.conversations || 0) + (entry.orders || 0),
    }))
    .filter((entry) => entry.totalActivity > 0)
    .sort((a, b) => b.totalActivity - a.totalActivity)
    .slice(0, 6);
  const realizedPlatformRevenue =
    platformStats.realizedRevenue ?? platformStats.totalRevenue;

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await portalApi.getAdminAnalytics({ period });
      const realizedRevenue = data.realizedRevenue || data.totalRevenue || 0;

      setPlatformStats({
        totalRevenue: realizedRevenue,
        realizedRevenue,
        revenueChange: data.revenueChange || 0,
        totalOrders: data.totalOrders || 0,
        ordersChange: data.ordersChange || 0,
        activeMerchants: data.activeMerchants || 0,
        merchantsChange: data.merchantsChange || 0,
        totalConversations: data.totalConversations || 0,
        conversationsChange: data.conversationsChange || 0,
      });
      setRevenueByMonth(data.revenueByMonth || []);
      setOrdersByCategory(data.ordersByCategory || []);
      setConversionRates(data.conversionRates || []);
      setTopMerchants(data.topMerchants || []);
      setAgentPerformance(data.agentPerformance || []);
      setHourlyActivity(data.hourlyActivity || []);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  const handleExport = () => {
    // TODO: implement analytics export
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="التحليلات" />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader
        title="تحليلات المنصة"
        description="تحليلات تنفيذية على مستوى المنصة: النمو، النشاط، وأداء التجار والوكلاء."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full md:w-36">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">هذا الأسبوع</SelectItem>
                <SelectItem value="month">هذا الشهر</SelectItem>
                <SelectItem value="quarter">هذا الربع</SelectItem>
                <SelectItem value="year">هذا العام</SelectItem>
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
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              تصدير
            </Button>
          </div>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">Platform Analytics</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                اقرأ الأداء الكلي للمنصة ثم انزل مباشرة إلى التجار والوكلاء
                والساعات الأكثر نشاطاً.
              </h2>
              <p className="app-hero-band__copy">
                هذه الصفحة مبنية كلوحة قرار، لا كصفحة تقارير تقليدية. كل قسم
                يجيب على سؤال تشغيل واضح: أين النمو، من يقود الإيراد، ما أداء
                الوكلاء، ومتى تتركز الذروة.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">الفترة: {period}</Badge>
              <Badge variant="secondary">
                الإيراد المحقق: {formatCurrency(realizedPlatformRevenue)}
              </Badge>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                الإيراد المحقق
              </span>
              <strong className="app-hero-band__metric-value">
                {formatCurrency(realizedPlatformRevenue)}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                إجمالي الطلبات
              </span>
              <strong className="app-hero-band__metric-value">
                {formatNumber(platformStats.totalOrders)}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                التجار النشطون
              </span>
              <strong className="app-hero-band__metric-value">
                {platformStats.activeMerchants}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                إجمالي المحادثات
              </span>
              <strong className="app-hero-band__metric-value">
                {formatNumber(platformStats.totalConversations)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* Platform KPIs */}
      <KPIGrid>
        <StatCard
          title="إجمالي الإيرادات المحققة"
          value={formatCurrency(realizedPlatformRevenue)}
          change={platformStats.revenueChange}
          changeLabel="من الفترة السابقة"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="إجمالي الطلبات"
          value={formatNumber(platformStats.totalOrders)}
          change={platformStats.ordersChange}
          changeLabel="من الفترة السابقة"
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <StatCard
          title="التجار النشطون"
          value={platformStats.activeMerchants}
          change={platformStats.merchantsChange}
          changeLabel="من الفترة السابقة"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="إجمالي المحادثات"
          value={formatNumber(platformStats.totalConversations)}
          change={platformStats.conversationsChange}
          changeLabel="من الفترة السابقة"
          icon={<MessageSquare className="h-5 w-5" />}
        />
      </KPIGrid>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 lg:grid-cols-4">
          <TabsTrigger value="overview" className="w-full">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="merchants" className="w-full">
            التجار
          </TabsTrigger>
          <TabsTrigger value="agent" className="w-full">
            أداء الوكيل
          </TabsTrigger>
          <TabsTrigger value="activity" className="w-full">
            النشاط
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <AreaChart
              data={revenueByMonth}
              title="اتجاه الإيرادات المحققة"
              dataKey="value"
              color="#3b82f6"
              height={300}
            />

            {/* Orders by Category */}
            <PieChart
              data={ordersByCategory}
              title="الطلبات حسب الفئة"
              height={300}
            />
          </div>

          {/* Conversion Rate Trend */}
          <BarChart
            data={conversionRates}
            title="معدل التحويل خلال الأسبوع"
            bars={[{ dataKey: "rate", color: "#10b981", name: "معدل التحويل" }]}
            height={250}
          />
        </TabsContent>

        <TabsContent value="merchants" className="space-y-6">
          {/* Top Merchants */}
          <Card className="app-data-card">
            <CardHeader>
              <CardTitle>أفضل التجار</CardTitle>
            </CardHeader>
            <CardContent>
              {topMerchants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  لا توجد بيانات
                </p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {topMerchants.map((merchant, index) => (
                      <div
                        key={merchant.id}
                        className="rounded-xl border bg-muted/20 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{merchant.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {merchant.orders} طلب •{" "}
                              {formatCurrency(merchant.revenue)}
                            </p>
                          </div>
                          <Badge variant="outline">#{index + 1}</Badge>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-primary-600"
                              style={{ width: `${merchant.conversion}%` }}
                            />
                          </div>
                          <span className="text-xs">
                            {merchant.conversion}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="text-right p-4 font-medium text-sm">
                            #
                          </th>
                          <th className="text-right p-4 font-medium text-sm">
                            التاجر
                          </th>
                          <th className="text-right p-4 font-medium text-sm">
                            الطلبات
                          </th>
                          <th className="text-right p-4 font-medium text-sm">
                            الإيرادات
                          </th>
                          <th className="text-right p-4 font-medium text-sm">
                            معدل التحويل
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {topMerchants.map((merchant, index) => (
                          <tr key={merchant.id} className="hover:bg-muted/30">
                            <td className="p-4">
                              <span
                                className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                  index === 0
                                    ? "bg-[var(--accent-gold)]/12 text-[var(--accent-gold)]"
                                    : index === 1
                                      ? "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]"
                                      : index === 2
                                        ? "bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]"
                                        : "bg-muted text-muted-foreground",
                                )}
                              >
                                {index + 1}
                              </span>
                            </td>
                            <td className="p-4 font-medium">{merchant.name}</td>
                            <td className="p-4">{merchant.orders}</td>
                            <td className="p-4">
                              {formatCurrency(merchant.revenue)}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-muted rounded-full h-2 max-w-24">
                                  <div
                                    className="bg-primary-600 h-2 rounded-full"
                                    style={{ width: `${merchant.conversion}%` }}
                                  />
                                </div>
                                <span className="text-sm">
                                  {merchant.conversion}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent" className="space-y-6">
          {/* Agent Performance Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {agentPerformance.length === 0 ? (
              <Card className="app-data-card col-span-full">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    لا توجد بيانات أداء
                  </p>
                </CardContent>
              </Card>
            ) : (
              agentPerformance.map((metric) => (
                <Card key={metric.name} className="app-data-card">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {metric.name}
                        </p>
                        <p className="text-2xl font-bold mt-1">
                          {metric.value}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-1 text-sm",
                          metric.change > 0
                            ? "text-[var(--accent-success)]"
                            : "text-[var(--accent-danger)]",
                        )}
                      >
                        {metric.change > 0 ? "+" : ""}
                        {metric.change}%
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <Card className="app-data-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                ملخص تشغيل الوكيل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium">مؤشرات حية من سجل الذكاء</h4>
                  {agentPerformance.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      لا توجد بيانات تشغيل كافية في الفترة الحالية.
                    </p>
                  ) : (
                    agentPerformance.map((metric) => (
                      <div
                        key={metric.name}
                        className="flex flex-col gap-2 rounded-[18px] bg-[color:color-mix(in_srgb,var(--surface-muted)_72%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-sm">{metric.name}</span>
                        <div className="text-right sm:text-left">
                          <p className="font-medium">{metric.value}</p>
                          <p
                            className={cn(
                              "text-xs",
                              metric.change >= 0
                                ? "text-[var(--accent-success)]"
                                : "text-[var(--accent-danger)]",
                            )}
                          >
                            {metric.change >= 0 ? "+" : ""}
                            {metric.change}%
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">ملاحظات تشغيلية</h4>
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                    <p>
                      هذه الصفحة تعتمد الآن على بيانات تشغيل فعلية من الطلبات،
                      المحادثات، وسجل التوجيه الذكي بدلاً من أمثلة ثابتة.
                    </p>
                    <p className="text-muted-foreground">
                      أي تغير في الإيرادات أو النشاط هنا يجب أن يطابق بقية صفحات
                      النظام للفترة نفسها.
                    </p>
                  </div>
                  {agentPerformance.slice(0, 2).map((metric) => (
                    <div
                      key={`${metric.name}-note`}
                      className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--border-strong)_84%,transparent)] bg-background p-3 text-sm"
                    >
                      <p className="font-medium">{metric.name}</p>
                      <p className="mt-1 text-muted-foreground">
                        القيمة الحالية {metric.value} مع تغير{" "}
                        {metric.change >= 0 ? "إيجابي" : "سلبي"} قدره{" "}
                        {Math.abs(metric.change)}%.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          {/* Hourly Activity - using BarChart since LineChart needs title */}
          <BarChart
            data={hourlyActivity.length > 0 ? hourlyActivity.slice(8, 22) : []} // Show business hours only
            title="النشاط حسب الساعة"
            bars={[
              { dataKey: "conversations", name: "المحادثات", color: "#3b82f6" },
              { dataKey: "orders", name: "الطلبات", color: "#10b981" },
            ]}
            height={300}
          />

          <Card className="app-data-card">
            <CardHeader>
              <CardTitle>أكثر الساعات نشاطاً</CardTitle>
            </CardHeader>
            <CardContent>
              {peakHours.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  لا توجد بيانات نشاط كافية في الفترة الحالية.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {peakHours.map((entry) => (
                    <div
                      key={entry.name}
                      className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--border-strong)_84%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-muted)_62%,transparent)] p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-medium">{entry.name}</p>
                        <Badge variant="outline">
                          {entry.totalActivity.toLocaleString("ar-EG")}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                        <p>المحادثات: {entry.conversations}</p>
                        <p>الطلبات: {entry.orders}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
