"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { PieChart } from "@/components/charts";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { formatCurrency } from "@/lib/utils";
import {
  Percent,
  ShoppingCart,
  Tag,
  RefreshCw,
  TrendingDown,
} from "lucide-react";
import {
  REPORTING_PERIOD_OPTIONS,
  getReportingDateRange,
  getStoredReportingDays,
  resolveReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";

export default function DiscountImpactPage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [periodDays, setPeriodDays] = useState<number>(() =>
    getStoredReportingDays(30),
  );
  const effectivePeriodDays = resolveReportingDays(periodDays);
  const periodRange = getReportingDateRange(periodDays);

  const fetchData = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await merchantApi.getDiscountImpact(
        merchantId,
        apiKey,
        effectivePeriodDays,
      );
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في تحميل تحليل الخصومات",
      );
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, effectivePeriodDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading)
    return (
      <div>
        <PageHeader title="تحليل تأثير الخصومات" />
        <DashboardSkeleton />
      </div>
    );
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="تحليل تأثير الخصومات" />
        <Card className="border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/10">
          <CardContent className="py-6 text-sm text-[var(--accent-danger)]">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  const overview = data?.overview || {};
  const avgOv = data?.avgOrderValue || {};
  const byCode = data?.byCode || [];
  const realizedRevenue = Number(
    overview.realizedRevenue ?? overview.totalRevenue ?? 0,
  );
  const bookedSales = Number(overview.bookedSales || 0);
  const pendingCollections = Number(overview.pendingCollections || 0);
  const refundsAmount = Number(overview.refundsAmount || 0);

  const pieData = [
    {
      name: "طلبات مخصومة",
      value: overview.discountedOrders,
      color: "#f59e0b",
    },
    { name: "سعر كامل", value: overview.fullPriceOrders, color: "#3b82f6" },
  ];
  const discountedOrders = Number(overview.discountedOrders || 0);
  const fullPriceOrders = Number(overview.fullPriceOrders || 0);
  const totalOrders = discountedOrders + fullPriceOrders;
  const discountedRatio =
    totalOrders > 0 ? Math.round((discountedOrders / totalOrders) * 100) : 0;
  const selectedPeriodLabel =
    REPORTING_PERIOD_OPTIONS.find((option) => option.value === periodDays)
      ?.label || `آخر ${periodDays} يوم`;
  const selectedPeriodSummary =
    periodDays === 365
      ? `من ${periodRange.startDate.toLocaleDateString("ar-EG")} حتى ${periodRange.endDate.toLocaleDateString("ar-EG")}`
      : selectedPeriodLabel;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="تحليل تأثير الخصومات"
        description="مقارنة الطلبات المخصومة مع طلبات السعر الكامل"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <Select
              value={String(periodDays)}
              onValueChange={(value) => {
                const next = Number(value);
                setPeriodDays(next);
                setStoredReportingDays(next);
              }}
            >
              <SelectTrigger className="w-full md:w-[150px]">
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
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="ml-2 h-4 w-4" /> تحديث
            </Button>
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        الفترة الحالية: {selectedPeriodSummary}
      </p>

      <KPIGrid>
        <StatCard
          title="إجمالي الخصومات"
          value={formatCurrency(overview.totalDiscount)}
          icon={<Tag className="h-5 w-5 text-[var(--accent-warning)]" />}
        />
        <StatCard
          title="طلبات مخصومة"
          value={overview.discountedOrders?.toString() || "0"}
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <StatCard
          title="متوسط مخصوم"
          value={formatCurrency(avgOv.discounted)}
          icon={
            <TrendingDown className="h-5 w-5 text-[var(--accent-danger)]" />
          }
        />
        <StatCard
          title="متوسط سعر كامل"
          value={formatCurrency(avgOv.fullPrice)}
          icon={<Percent className="h-5 w-5 text-[var(--accent-success)]" />}
        />
        <StatCard
          title="الإيرادات المحققة"
          value={formatCurrency(realizedRevenue)}
          icon={
            <TrendingDown className="h-5 w-5 text-[var(--accent-success)]" />
          }
        />
      </KPIGrid>

      <Tabs defaultValue="overview">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:w-[320px] sm:grid-cols-2">
          <TabsTrigger value="overview" className="w-full">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="codes" className="w-full">
            حسب الكود
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PieChart data={pieData} title="توزيع الطلبات" />
            <Card>
              <CardHeader>
                <CardTitle>المقارنة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>إجمالي الإيرادات المحققة</span>
                  <span className="font-bold">
                    {formatCurrency(realizedRevenue)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>إجمالي المبيعات المحجوزة</span>
                  <span className="font-medium">
                    {formatCurrency(bookedSales)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>مبالغ قيد التحصيل</span>
                  <span className="font-medium">
                    {formatCurrency(pendingCollections)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>إجمالي المرتجعات</span>
                  <span className="font-medium text-[var(--accent-danger)]">
                    {formatCurrency(refundsAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>نسبة الطلبات المخصومة</span>
                  <Badge variant="outline">{`${discountedRatio}%`}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>فرق المتوسط</span>
                  <span
                    className={
                      avgOv.discounted < avgOv.fullPrice
                        ? "text-[var(--accent-danger)]"
                        : "text-[var(--accent-success)]"
                    }
                  >
                    {formatCurrency(
                      Math.abs(
                        (avgOv.discounted || 0) - (avgOv.fullPrice || 0),
                      ),
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="codes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>أداء أكواد الخصم</CardTitle>
            </CardHeader>
            <CardContent>
              {byCode.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  لا توجد أكواد خصم مستخدمة في هذه الفترة
                </p>
              ) : (
                <div className="space-y-3">
                  {byCode.map((c: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-[var(--bg-surface-2)]"
                    >
                      <div>
                        <Badge variant="outline" className="ml-2">
                          {c.code}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {c.orders} طلب • {c.uniqueCustomers} عميل
                        </span>
                      </div>
                      <div className="text-left">
                        <div className="font-medium">
                          {formatCurrency(c.revenue)}
                        </div>
                        <div className="text-sm text-[var(--accent-warning)]">
                          خصم: {formatCurrency(c.discount)}
                        </div>
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
