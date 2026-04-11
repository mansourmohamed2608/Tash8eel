"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { AreaChart, BarChart } from "@/components/charts";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { formatCurrency } from "@/lib/utils";
import {
  getReportingDateRange,
  REPORTING_PERIOD_OPTIONS,
  getStoredReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  RefreshCw,
} from "lucide-react";

function toInputDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toAxisLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" });
}

function getDateRangeFromDays(days: number): {
  startDate: string;
  endDate: string;
} {
  const { startDate, endDate } = getReportingDateRange(days);
  return {
    startDate: toInputDate(startDate),
    endDate: toInputDate(endDate),
  };
}

export default function CashFlowPage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const initialDays = getStoredReportingDays(30);
  const initialRange = getDateRangeFromDays(initialDays);
  const [reportingDays, setReportingDays] = useState<number>(initialDays);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);

  const fetchData = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await merchantApi.getCashFlowForecast(merchantId, apiKey, {
        forecastDays: reportingDays,
        startDate,
        endDate,
      });
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "فشل في تحميل بيانات التدفق النقدي",
      );
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, reportingDays, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyDayRange = (days: number) => {
    const range = getDateRangeFromDays(days);
    setReportingDays(days);
    setStoredReportingDays(days);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  if (loading)
    return (
      <div>
        <PageHeader title="التدفق النقدي" />
        <DashboardSkeleton />
      </div>
    );
  if (error)
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader title="التدفق النقدي" />
        <Card className="app-data-card border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/12">
          <CardContent className="pt-6 text-[var(--accent-danger)]">
            {error}
          </CardContent>
        </Card>
      </div>
    );

  const summary = data?.summary || {};
  const forecast = data?.forecast || [];
  const realizedRevenue = Number(summary.realizedRevenue || 0);
  const bookedSales = Number(summary.bookedSales || 0);
  const pendingCollections = Number(summary.pendingCollections || 0);
  const refundsAmount = Number(summary.refundsAmount || 0);
  const actualNetCashFlow = Number(summary.actualNetCashFlow || 0);
  const chartData = forecast.map((f: any) => ({
    name: toAxisLabel(f.date),
    label: f.date,
    إيرادات: Number(f.projectedRevenue) || 0,
    مصروفات: Number(f.projectedExpenses) || 0,
    صافي: Number(f.netCashFlow) || 0,
  }));

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="التدفق النقدي"
        description="توقعات الإيرادات والمصروفات والتدفق النقدي للفترة المحددة"
        actions={
          <Button
            variant="outline"
            onClick={fetchData}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="ml-2 h-4 w-4" /> تحديث
          </Button>
        }
      />

      <Card className="app-data-card">
        <CardHeader>
          <CardTitle>فلاتر الفترة</CardTitle>
          <CardDescription>
            اختَر نفس أسلوب الفلترة الموجود بباقي الصفحات
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,180px)_repeat(2,minmax(0,1fr))_auto]">
            <div className="space-y-2">
              <Label>الفترة</Label>
              <Select
                value={String(reportingDays)}
                onValueChange={(value) => applyDayRange(Number(value))}
              >
                <SelectTrigger className="w-full lg:w-[160px]">
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
            </div>
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={fetchData} className="w-full md:w-auto">
              <RefreshCw className="ml-2 h-4 w-4" /> تطبيق
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "اليوم", days: 1 },
              { label: "آخر 7 أيام", days: 7 },
              { label: "آخر 30 يوم", days: 30 },
              { label: "آخر 90 يوم", days: 90 },
            ].map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                onClick={() => applyDayRange(preset.days)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <KPIGrid>
        <StatCard
          title="الإيرادات المتوقعة"
          value={formatCurrency(summary.projectedMonthlyRevenue)}
          icon={<TrendingUp className="h-5 w-5 text-[var(--accent-success)]" />}
        />
        <StatCard
          title="المصروفات المتوقعة"
          value={formatCurrency(summary.projectedMonthlyExpenses)}
          icon={
            <TrendingDown className="h-5 w-5 text-[var(--accent-danger)]" />
          }
        />
        <StatCard
          title="صافي التدفق المتوقع"
          value={formatCurrency(summary.projectedNetCashFlow)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="مستوى الثقة"
          value={
            summary.confidenceLevel === "HIGH"
              ? "عالي"
              : summary.confidenceLevel === "MEDIUM"
                ? "متوسط"
                : "منخفض"
          }
          icon={<Activity className="h-5 w-5" />}
        />
      </KPIGrid>

      <Card className="app-data-card border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10">
        <CardHeader>
          <CardTitle>الوضع الفعلي للفترة المحددة</CardTitle>
          <CardDescription>
            هذه القيم فعلية من الطلبات والمدفوعات، وليست توقعات.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              title="الإيرادات المحققة"
              value={formatCurrency(realizedRevenue)}
              icon={
                <DollarSign className="h-5 w-5 text-[var(--accent-success)]" />
              }
            />
            <StatCard
              title="المبيعات المحجوزة"
              value={formatCurrency(bookedSales)}
              icon={
                <TrendingUp className="h-5 w-5 text-[var(--accent-blue)]" />
              }
            />
            <StatCard
              title="قيد التحصيل"
              value={formatCurrency(pendingCollections)}
              icon={
                <Activity className="h-5 w-5 text-[var(--accent-warning)]" />
              }
            />
            <StatCard
              title="المرتجعات"
              value={formatCurrency(refundsAmount)}
              icon={
                <TrendingDown className="h-5 w-5 text-[var(--accent-danger)]" />
              }
            />
            <StatCard
              title="صافي التدفق الفعلي"
              value={formatCurrency(actualNetCashFlow)}
              icon={<DollarSign className="h-5 w-5" />}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AreaChart
          data={chartData}
          title="صافي التدفق المتوقع يومياً"
          dataKey="صافي"
          color="#3b82f6"
        />
        <BarChart
          data={chartData}
          title="الإيرادات والمصروفات المتوقعة يومياً"
          bars={[
            { dataKey: "إيرادات", color: "#22c55e", name: "الإيرادات" },
            { dataKey: "مصروفات", color: "#ef4444", name: "المصروفات" },
          ]}
        />
      </div>

      <Card className="app-data-card">
        <CardHeader>
          <CardTitle>التفاصيل اليومية</CardTitle>
          <CardDescription>
            الإيرادات والمصروفات وصافي كل يوم في الفترة المحددة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <div className="space-y-3 md:hidden">
              {forecast.map((f: any, i: number) => (
                <div key={i} className="rounded-lg border p-4 text-sm">
                  <div className="font-medium">{f.date}</div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="text-[var(--accent-success)]">
                      <span className="text-muted-foreground">الإيرادات:</span>{" "}
                      {formatCurrency(f.projectedRevenue)}
                    </div>
                    <div className="text-[var(--accent-danger)]">
                      <span className="text-muted-foreground">المصروفات:</span>{" "}
                      {formatCurrency(f.projectedExpenses)}
                    </div>
                    <div
                      className={
                        f.netCashFlow >= 0
                          ? "font-medium text-[var(--accent-success)]"
                          : "font-medium text-[var(--accent-danger)]"
                      }
                    >
                      <span className="text-muted-foreground">الصافي:</span>{" "}
                      {formatCurrency(f.netCashFlow)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-[var(--bg-surface-2)]">
                  <tr className="text-right">
                    <th className="p-2">التاريخ</th>
                    <th className="p-2">الإيرادات</th>
                    <th className="p-2">المصروفات</th>
                    <th className="p-2">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map((f: any, i: number) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]"
                    >
                      <td className="p-2">{f.date}</td>
                      <td className="p-2 text-[var(--accent-success)]">
                        {formatCurrency(f.projectedRevenue)}
                      </td>
                      <td className="p-2 text-[var(--accent-danger)]">
                        {formatCurrency(f.projectedExpenses)}
                      </td>
                      <td
                        className={`p-2 font-medium ${f.netCashFlow >= 0 ? "text-[var(--accent-success)]" : "text-[var(--accent-danger)]"}`}
                      >
                        {formatCurrency(f.netCashFlow)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
