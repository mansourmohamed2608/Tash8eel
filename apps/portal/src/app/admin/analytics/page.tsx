"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { AreaChart, BarChart, PieChart } from "@/components/charts";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
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

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await portalApi.getAdminAnalytics({ period });

      setPlatformStats({
        totalRevenue: data.totalRevenue || 0,
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="تحليلات المنصة"
        description="إحصائيات شاملة عن أداء المنصة والتجار"
        actions={
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36">
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

      {/* Platform KPIs */}
      <KPIGrid>
        <StatCard
          title="إجمالي الإيرادات"
          value={formatCurrency(platformStats.totalRevenue)}
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
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="merchants">التجار</TabsTrigger>
          <TabsTrigger value="agent">أداء الوكيل</TabsTrigger>
          <TabsTrigger value="activity">النشاط</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <AreaChart
              data={revenueByMonth}
              title="اتجاه الإيرادات"
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
          <Card>
            <CardHeader>
              <CardTitle>أفضل التجار</CardTitle>
            </CardHeader>
            <CardContent>
              {topMerchants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  لا توجد بيانات
                </p>
              ) : (
                <div className="overflow-x-auto">
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
                                  ? "bg-yellow-100 text-yellow-700"
                                  : index === 1
                                    ? "bg-gray-100 text-gray-700"
                                    : index === 2
                                      ? "bg-orange-100 text-orange-700"
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent" className="space-y-6">
          {/* Agent Performance Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {agentPerformance.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    لا توجد بيانات أداء
                  </p>
                </CardContent>
              </Card>
            ) : (
              agentPerformance.map((metric) => (
                <Card key={metric.name}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
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
                          metric.change > 0 ? "text-green-600" : "text-red-600",
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

          {/* Agent Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                قدرات الوكيل الذكي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-medium">معدل النجاح حسب المهمة</h4>
                  {[
                    { task: "جمع بيانات الطلب", rate: 96 },
                    { task: "التفاوض على السعر", rate: 88 },
                    { task: "التعامل مع الشكاوى", rate: 82 },
                    { task: "البيع المتقاطع", rate: 45 },
                  ].map((item) => (
                    <div key={item.task} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.task}</span>
                        <span>{item.rate}%</span>
                      </div>
                      <div className="bg-muted rounded-full h-2">
                        <div
                          className={cn(
                            "h-2 rounded-full",
                            item.rate >= 90
                              ? "bg-green-500"
                              : item.rate >= 70
                                ? "bg-blue-500"
                                : item.rate >= 50
                                  ? "bg-yellow-500"
                                  : "bg-red-500",
                          )}
                          style={{ width: `${item.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">توزيع أسباب التحويل للبشر</h4>
                  {[
                    { reason: "طلب العميل", count: 45 },
                    { reason: "مشكلة معقدة", count: 32 },
                    { reason: "شكوى", count: 18 },
                    { reason: "استفسار خاص", count: 12 },
                  ].map((item) => (
                    <div
                      key={item.reason}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <span className="text-sm">{item.reason}</span>
                      <span className="font-medium">{item.count}</span>
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

          {/* Activity Heatmap would go here */}
          <Card>
            <CardHeader>
              <CardTitle>أوقات الذروة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {[
                  "السبت",
                  "الأحد",
                  "الإثنين",
                  "الثلاثاء",
                  "الأربعاء",
                  "الخميس",
                  "الجمعة",
                ].map((day) => (
                  <div key={day} className="text-center">
                    <p className="text-xs text-muted-foreground mb-2">{day}</p>
                    <div className="space-y-1">
                      {[9, 12, 15, 18, 21].map((hour) => {
                        const intensity = Math.random();
                        return (
                          <div
                            key={hour}
                            className={cn(
                              "h-6 rounded text-xs flex items-center justify-center",
                              intensity > 0.7
                                ? "bg-primary-600 text-white"
                                : intensity > 0.4
                                  ? "bg-primary-300 text-primary-800"
                                  : "bg-primary-100 text-primary-600",
                            )}
                            title={`${hour}:00`}
                          >
                            {hour}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary-100" />
                  منخفض
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary-300" />
                  متوسط
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary-600" />
                  مرتفع
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
