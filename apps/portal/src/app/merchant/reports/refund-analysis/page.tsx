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
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { BarChart } from "@/components/charts";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import { formatCurrency } from "@/lib/utils";
import {
  Undo2,
  AlertTriangle,
  Users,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import {
  REPORTING_PERIOD_OPTIONS,
  getReportingDateRange,
  getStoredReportingDays,
  resolveReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";

export default function RefundAnalysisPage() {
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
      const result = await merchantApi.getRefundAnalysis(
        merchantId,
        apiKey,
        effectivePeriodDays,
      );
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في تحميل تحليل الاسترجاعات",
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
        <PageHeader title="تحليل الاسترجاعات" />
        <DashboardSkeleton />
      </div>
    );
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="تحليل الاسترجاعات" />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6 text-red-700 text-sm">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = data?.summary || {};
  const byReason = data?.byReason || [];
  const reasonChartData = byReason.map((r: any) => ({
    name: r.reason,
    قيمة: r.totalAmount,
    عدد: r.count,
  }));
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
        title="تحليل الاسترجاعات"
        description="تتبع وتحليل عمليات الاسترجاع والأسباب"
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
              <SelectTrigger className="w-[150px]">
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
          title="استرجاعات مقبولة"
          value={summary.approvedRefunds?.toString() || "0"}
          icon={<Undo2 className="h-5 w-5 text-red-500" />}
        />
        <StatCard
          title="إجمالي المسترجع"
          value={formatCurrency(summary.totalRefunded)}
          icon={<TrendingDown className="h-5 w-5 text-red-600" />}
        />
        <StatCard
          title="نسبة الاسترجاع"
          value={`${summary.refundRate || 0}%`}
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
        />
        <StatCard
          title="استرجاعات معلقة"
          value={summary.pendingRefunds?.toString() || "0"}
          icon={<Users className="h-5 w-5 text-blue-500" />}
        />
      </KPIGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {byReason.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>حسب السبب</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                لا توجد استرجاعات معتمدة في هذه الفترة
              </p>
            </CardContent>
          </Card>
        ) : (
          <BarChart
            data={reasonChartData}
            title="حسب السبب"
            bars={[{ dataKey: "قيمة", color: "#ef4444", name: "القيمة" }]}
          />
        )}
        <Card>
          <CardHeader>
            <CardTitle>تفاصيل الأسباب</CardTitle>
          </CardHeader>
          <CardContent>
            {byReason.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                لا توجد استرجاعات في هذه الفترة
              </p>
            ) : (
              <div className="space-y-3">
                {byReason.map((r: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border rounded-lg p-3"
                  >
                    <div>
                      <Badge variant="destructive" className="ml-2">
                        {r.reason}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {r.count} استرجاع
                      </span>
                    </div>
                    <span className="font-bold text-red-600">
                      {formatCurrency(r.totalAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
