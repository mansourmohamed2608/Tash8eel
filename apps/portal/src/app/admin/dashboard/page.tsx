"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { BarChart, PieChart } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/ui/alerts";
import {
  Users,
  ShoppingCart,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Server,
  Activity,
  Loader2,
} from "lucide-react";
import { formatNumber, formatRelativeTime, cn } from "@/lib/utils";
import { portalApi } from "@/lib/client";

interface DashboardMetrics {
  totalMerchants: number;
  activeMerchants: number;
  totalOrders: number;
  ordersToday: number;
  totalConversations: number;
  activeConversations: number;
  dlqPending: number;
  systemHealth: "healthy" | "degraded" | "critical";
}

interface SystemService {
  name: string;
  status: "healthy" | "degraded" | "critical";
  uptime: string;
  latency: string;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalMerchants: 0,
    activeMerchants: 0,
    totalOrders: 0,
    ordersToday: 0,
    totalConversations: 0,
    activeConversations: 0,
    dlqPending: 0,
    systemHealth: "healthy",
  });
  const [systemServices, setSystemServices] = useState<SystemService[]>([]);
  const [dailyOrders, setDailyOrders] = useState<
    { name: string; orders: number }[]
  >([]);
  const [merchantDistribution, setMerchantDistribution] = useState<
    { name: string; value: number; color: string }[]
  >([]);
  const [recentDlq, setRecentDlq] = useState<
    { id: string; type: string; merchant: string; time: string }[]
  >([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsData, healthData] = await Promise.all([
        portalApi.getAdminDashboardStats().catch(() => ({})),
        portalApi.getAdminSystemHealth().catch(() => ({ services: [] })),
      ]);

      setMetrics({
        totalMerchants: statsData.totalMerchants || 0,
        activeMerchants: statsData.activeMerchants || 0,
        totalOrders: statsData.totalOrders || 0,
        ordersToday: statsData.ordersToday || 0,
        totalConversations: statsData.totalConversations || 0,
        activeConversations: statsData.activeConversations || 0,
        dlqPending: statsData.dlqPending || 0,
        systemHealth: statsData.systemHealth || "healthy",
      });

      setSystemServices(healthData.services || []);
      setDailyOrders(statsData.dailyOrders || []);
      setMerchantDistribution(statsData.merchantDistribution || []);
      setRecentDlq(statsData.recentDlq || []);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="لوحة تحكم النظام" />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="لوحة تحكم النظام"
        description="غرفة التحكم المركزية للمنصة: صحة الخدمات، النشاط، والاختناقات التشغيلية."
        actions={
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full sm:w-auto"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            تحديث
          </Button>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">Platform Control</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                راقب المنصة على مستوى التجار، الطلبات، المحادثات، والخدمات من
                نفس الشاشة.
              </h2>
              <p className="app-hero-band__copy">
                هذه الواجهة تعطيك قراءة سريعة عن حالة النظام، وتلفت انتباهك إلى
                أحداث DLQ والمشكلات التشغيلية قبل أن تتحول إلى أثر واضح على
                التجار أو العملاء.
              </p>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">صحة النظام</span>
              <strong className="app-hero-band__metric-value">
                {metrics.systemHealth === "healthy"
                  ? "مستقر"
                  : metrics.systemHealth === "degraded"
                    ? "متراجع"
                    : "حرج"}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                التجار النشطون
              </span>
              <strong className="app-hero-band__metric-value">
                {metrics.activeMerchants}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">طلبات اليوم</span>
              <strong className="app-hero-band__metric-value">
                {metrics.ordersToday}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">DLQ المعلق</span>
              <strong className="app-hero-band__metric-value">
                {metrics.dlqPending}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* System Health Alert */}
      {metrics.systemHealth !== "healthy" && (
        <AlertBanner
          type="error"
          title="تحذير النظام"
          message="بعض الخدمات تعاني من مشاكل في الأداء"
        />
      )}

      {metrics.dlqPending > 10 && (
        <AlertBanner
          type="warning"
          title="أحداث DLQ معلقة"
          message={`يوجد ${metrics.dlqPending} حدث معلق في DLQ يحتاج مراجعة`}
        />
      )}

      {/* KPI Cards */}
      <KPIGrid>
        <StatCard
          title="التجار النشطون"
          value={metrics.activeMerchants}
          changeLabel={`من إجمالي ${metrics.totalMerchants}`}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="طلبات اليوم"
          value={metrics.ordersToday}
          changeLabel={`إجمالي ${formatNumber(metrics.totalOrders)}`}
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <StatCard
          title="محادثات نشطة"
          value={metrics.activeConversations}
          changeLabel={`إجمالي ${formatNumber(metrics.totalConversations)}`}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <StatCard
          title="DLQ معلق"
          value={metrics.dlqPending}
          changeLabel="يحتاج مراجعة"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </KPIGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* System Services Health */}
        <Card className="app-data-card lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              حالة الخدمات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {systemServices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  لا توجد بيانات
                </p>
              ) : (
                systemServices.map((service) => (
                  <div
                    key={service.name}
                    className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          service.status === "healthy"
                            ? "bg-green-500"
                            : service.status === "degraded"
                              ? "bg-yellow-500"
                              : "bg-red-500",
                        )}
                      />
                      <span className="text-sm font-medium">
                        {service.name}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {service.latency}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Daily Orders Chart */}
        <div className="lg:col-span-2">
          <BarChart
            data={dailyOrders}
            title="الطلبات خلال الأسبوع"
            bars={[{ dataKey: "orders", color: "#3b82f6", name: "الطلبات" }]}
            height={250}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Merchant Distribution */}
        <PieChart
          data={merchantDistribution}
          title="توزيع التجار حسب الفئة"
          height={250}
        />

        {/* Recent DLQ Events */}
        <Card className="app-data-card">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              أحداث DLQ الأخيرة
            </CardTitle>
            <Button variant="ghost" size="sm" className="w-full sm:w-auto">
              <Link href="/admin/dlq">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentDlq.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  لا توجد أحداث معلقة
                </p>
              ) : (
                recentDlq.map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-col gap-2 rounded-[18px] border border-[color:color-mix(in_srgb,var(--border-strong)_84%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{event.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.merchant}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(event.time)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
