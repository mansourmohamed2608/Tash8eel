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
import { Badge } from "@/components/ui/badge";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { formatCurrency } from "@/lib/utils";
import {
  Package,
  DollarSign,
  BarChart3,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

export default function FifoValuationPage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    try {
      const result = await merchantApi.getInventoryValuationFifo(
        merchantId,
        apiKey,
      );
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في تحميل تقييم المخزون",
      );
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading)
    return (
      <div>
        <PageHeader title="تقييم المخزون (الوارد أولاً صادر أولاً)" />
        <DashboardSkeleton />
      </div>
    );
  if (error) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <PageHeader
          title="تقييم المخزون (الوارد أولاً صادر أولاً)"
          description="تقييم المخزون بطريقة FIFO أو تقدير متوسط التكلفة عند غياب طبقات التكلفة"
          actions={
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="ml-2 h-4 w-4" /> تحديث
            </Button>
          }
        />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6 text-red-700 text-sm">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = data?.items || [];
  const usingEstimatedMethod = data?.method === "ESTIMATED_AVERAGE";
  const methodLabel = usingEstimatedMethod
    ? "تقدير متوسط التكلفة"
    : "الوارد أولاً صادر أولاً";

  const totalCostValue = items.reduce(
    (sum: number, item: any) => sum + (Number(item.costValue) || 0),
    0,
  );
  const totalRetailValue = items.reduce((sum: number, item: any) => {
    const qty = Number(item.quantity) || 0;
    const retail = Number(item.retailPrice) || 0;
    return sum + qty * retail;
  }, 0);
  const overallMarginPct =
    totalRetailValue > 0
      ? Math.round(
          ((totalRetailValue - totalCostValue) / totalRetailValue) * 10000,
        ) / 100
      : 0;
  const calculatedSummary = {
    totalCostValue: Math.round(totalCostValue * 100) / 100,
    totalRetailValue: Math.round(totalRetailValue * 100) / 100,
    overallMarginPct,
    skuCount: items.length,
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="تقييم المخزون (الوارد أولاً صادر أولاً)"
        description="تقييم المخزون بطريقة FIFO أو تقدير متوسط التكلفة عند غياب طبقات التكلفة"
        actions={
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="ml-2 h-4 w-4" /> تحديث
          </Button>
        }
      />

      {usingEstimatedMethod && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4 flex items-start gap-2 text-amber-900 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              لا توجد طبقات FIFO كافية، لذلك يعرض النظام تقديراً من تكلفة
              المخزون الحالية. للحصول على FIFO دقيق: سجّل الاستلام عبر الدُفعات
              (Lots).
            </p>
          </CardContent>
        </Card>
      )}

      <KPIGrid>
        <StatCard
          title="قيمة التكلفة"
          value={formatCurrency(calculatedSummary.totalCostValue)}
          icon={<DollarSign className="h-5 w-5 text-blue-600" />}
        />
        <StatCard
          title="قيمة المخزون بسعر البيع"
          value={formatCurrency(calculatedSummary.totalRetailValue)}
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
        />
        <StatCard
          title="هامش الربح التقديري"
          value={`${calculatedSummary.overallMarginPct || 0}%`}
          icon={<BarChart3 className="h-5 w-5 text-purple-600" />}
        />
        <StatCard
          title="عدد الأكواد (SKU)"
          value={calculatedSummary.skuCount.toString()}
          icon={<Package className="h-5 w-5" />}
        />
      </KPIGrid>

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-3 text-xs text-blue-900">
          هذه الصفحة تحسب قيمة المخزون الحالية، وليست إجمالي الإيرادات المحققة
          من الطلبات. الأرقام أعلى الصفحة محسوبة من نفس صفوف الجدول أدناه.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تفاصيل الأصناف</CardTitle>
          <CardDescription>طريقة التقييم: {methodLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              لا توجد طبقات تكلفة مسجلة. ابدأ باستلام دفعات مع تتبع التكلفة.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-right">
                    <th className="p-3">الصنف</th>
                    <th className="p-3">رمز الصنف (SKU)</th>
                    <th className="p-3">الفئة</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3">متوسط التكلفة</th>
                    <th className="p-3">سعر البيع</th>
                    <th className="p-3">قيمة التكلفة</th>
                    <th className="p-3">الهامش</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any) => {
                    const margin =
                      item.retailPrice > 0
                        ? Math.round(
                            ((item.retailPrice - item.weightedAvgCost) /
                              item.retailPrice) *
                              100,
                          )
                        : 0;
                    return (
                      <tr
                        key={`${item.id}-${item.sku}`}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="p-3 font-medium">{item.name}</td>
                        <td className="p-3">
                          <Badge variant="outline">{item.sku}</Badge>
                        </td>
                        <td className="p-3">{item.category}</td>
                        <td className="p-3">{item.quantity}</td>
                        <td className="p-3">
                          {formatCurrency(item.weightedAvgCost)}
                        </td>
                        <td className="p-3">
                          {formatCurrency(item.retailPrice)}
                        </td>
                        <td className="p-3 font-medium">
                          {formatCurrency(item.costValue)}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              margin > 30
                                ? "default"
                                : margin > 10
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {margin}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
