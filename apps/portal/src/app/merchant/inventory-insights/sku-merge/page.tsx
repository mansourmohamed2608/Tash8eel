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
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { formatCurrency } from "@/lib/utils";
import { Copy, Merge, RefreshCw, CheckCircle } from "lucide-react";

export default function SkuMergePage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await merchantApi.getDuplicateSkus(merchantId, apiKey);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في تحميل بيانات دمج الأصناف",
      );
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMerge = async (sourceId: string, targetId: string) => {
    if (!merchantId || !apiKey) return;
    setMerging(sourceId);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await merchantApi.mergeSkus(
        merchantId,
        apiKey,
        sourceId,
        targetId,
        "تنظيف تكرارات رموز الأصناف من البوابة",
      );
      const transferred = Number(result?.stockTransferred || 0);
      setSuccessMessage(
        transferred > 0
          ? `تم الدمج بنجاح ونقل ${transferred.toLocaleString("ar-EG")} وحدة`
          : "تم الدمج بنجاح",
      );
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تنفيذ دمج الأصناف");
    } finally {
      setMerging(null);
    }
  };

  if (loading)
    return (
      <div>
        <PageHeader title="كشف التكرارات ودمج رموز الأصناف" />
        <DashboardSkeleton />
      </div>
    );

  const duplicates = data?.duplicates || [];

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="كشف التكرارات ودمج رموز الأصناف"
        description="اكتشف المنتجات المكررة وادمجها لتنظيف المخزون"
        actions={
          <Button
            variant="outline"
            onClick={fetchData}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="ml-2 h-4 w-4" /> فحص
          </Button>
        }
      />

      {error && (
        <Card className="border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/10">
          <CardContent className="py-4 text-sm text-[var(--accent-danger)]">
            {error}
          </CardContent>
        </Card>
      )}

      {successMessage && (
        <Card className="border-[var(--accent-success)]/20 bg-[var(--accent-success)]/10">
          <CardContent className="py-4 text-sm text-[var(--accent-success)]">
            {successMessage}
          </CardContent>
        </Card>
      )}

      <KPIGrid>
        <StatCard
          title="تكرارات محتملة"
          value={duplicates.length.toString()}
          icon={<Copy className="h-5 w-5 text-[var(--accent-warning)]" />}
        />
      </KPIGrid>

      {duplicates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="mb-4 h-12 w-12 text-[var(--accent-success)]" />
            <p className="text-lg font-medium">لا توجد تكرارات</p>
            <p className="text-muted-foreground">جميع الأصناف فريدة</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>التكرارات المكتشفة</CardTitle>
            <CardDescription>
              راجع كل زوج واختر الدمج إذا كانا نفس المنتج
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {duplicates.map((dup: any, i: number) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="mb-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded p-3 border border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/10">
                    <div className="mb-1 text-sm font-medium text-[var(--accent-danger)]">
                      المصدر (سيتم إلغاء تفعيله)
                    </div>
                    <div className="font-medium">{dup.itemA.name}</div>
                    <div className="text-sm text-muted-foreground">
                      رمز الصنف: {dup.itemA.sku} •{" "}
                      {formatCurrency(dup.itemA.price)}
                    </div>
                  </div>
                  <div className="rounded p-3 border border-[var(--accent-success)]/20 bg-[var(--accent-success)]/10">
                    <div className="mb-1 text-sm font-medium text-[var(--accent-success)]">
                      الهدف (سيحتفظ بالمخزون)
                    </div>
                    <div className="font-medium">{dup.itemB.name}</div>
                    <div className="text-sm text-muted-foreground">
                      رمز الصنف: {dup.itemB.sku} •{" "}
                      {formatCurrency(dup.itemB.price)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    onClick={() => handleMerge(dup.itemA.id, dup.itemB.id)}
                    disabled={merging === dup.itemA.id}
                    className="w-full sm:w-auto"
                  >
                    <Merge className="h-4 w-4 ml-1" />
                    {merging === dup.itemA.id
                      ? "جاري الدمج..."
                      : "دمج المصدر إلى الهدف"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMerge(dup.itemB.id, dup.itemA.id)}
                    disabled={merging === dup.itemB.id}
                    className="w-full sm:w-auto"
                  >
                    <Merge className="h-4 w-4 ml-1" />
                    دمج الهدف إلى المصدر
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
