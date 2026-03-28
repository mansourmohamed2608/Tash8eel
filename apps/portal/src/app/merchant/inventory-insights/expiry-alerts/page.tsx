"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import {
  AlertTriangle,
  Package,
  Timer,
  CheckCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";

export default function ExpiryAlertsPage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    try {
      const result = await merchantApi.getExpiryAlerts(merchantId, apiKey);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في تحميل تنبيهات الصلاحية",
      );
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAcknowledge = async (alertId: string) => {
    if (!merchantId || !apiKey) return;
    try {
      await merchantApi.acknowledgeExpiryAlert(merchantId, alertId, apiKey);
      fetchData();
    } catch {}
  };

  if (loading)
    return (
      <div>
        <PageHeader title="تنبيهات الصلاحية" />
        <DashboardSkeleton />
      </div>
    );

  if (error) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <PageHeader
          title="تنبيهات الصلاحية"
          description="تتبع المنتجات القابلة للتلف وتواريخ انتهاء الصلاحية"
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

  const alerts = data?.alerts || [];
  const summary = data?.summary || {};
  const missingExpiryItems = data?.missingExpiryItems || [];
  const hasMissingExpiry = Number(summary.missingExpiryDates || 0) > 0;
  const dataSourceLabel =
    data?.source === "calculated"
      ? "محسوبة مباشرة من المخزون"
      : "مسجلة من تنبيهات النظام";

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="تنبيهات الصلاحية"
        description="تتبع المنتجات القابلة للتلف وتواريخ انتهاء الصلاحية"
        actions={
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="ml-2 h-4 w-4" /> تحديث
          </Button>
        }
      />

      <KPIGrid>
        <StatCard
          title="منتهي الصلاحية"
          value={summary.expired?.toString() || "0"}
          icon={<XCircle className="h-5 w-5 text-red-600" />}
        />
        <StatCard
          title="حرج (أقل من 3 أيام)"
          value={summary.critical?.toString() || "0"}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
        />
        <StatCard
          title="تحذير (أقل من 7 أيام)"
          value={summary.warning?.toString() || "0"}
          icon={<Timer className="h-5 w-5 text-yellow-500" />}
        />
        <StatCard
          title="إجمالي التنبيهات"
          value={alerts.length.toString()}
          icon={<Package className="h-5 w-5" />}
        />
      </KPIGrid>

      <div className="flex justify-start">
        <Badge variant="outline">{dataSourceLabel}</Badge>
      </div>

      {hasMissingExpiry && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-medium text-amber-900">
              يوجد {summary.missingExpiryDates} صنف بالمخزون بدون تاريخ صلاحية.
            </p>
            <p className="text-xs text-amber-800">
              أضف تاريخ الصلاحية من المخزون عبر "تعديل المنتج" (منتج قابل للتلف
              + تاريخ الصلاحية) أو عند استلام دفعة جديدة لضمان دقة التنبيهات.
            </p>
            {missingExpiryItems.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {missingExpiryItems.map((item: any) => (
                  <Badge key={item.id} variant="outline" className="bg-white">
                    {item.itemName} {item.sku ? `(${item.sku})` : ""}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">لا توجد تنبيهات صلاحية</p>
            <p className="text-muted-foreground">
              جميع المنتجات ضمن فترة الصلاحية
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>التنبيهات النشطة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert: any) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {alert.alertType === "EXPIRED" && (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    {alert.alertType === "CRITICAL" && (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    )}
                    {alert.alertType === "WARNING" && (
                      <Timer className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <div className="font-medium">{alert.itemName}</div>
                      <div className="text-sm text-muted-foreground">
                        رمز الصنف: {alert.sku} • الكمية: {alert.quantityAtRisk}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <Badge
                        variant={
                          alert.alertType === "EXPIRED"
                            ? "destructive"
                            : alert.alertType === "CRITICAL"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {alert.alertType === "EXPIRED"
                          ? "منتهي"
                          : alert.alertType === "CRITICAL"
                            ? "حرج"
                            : "تحذير"}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {alert.daysLeft < 0
                          ? `منتهي منذ ${Math.abs(alert.daysLeft)} يوم`
                          : `${alert.daysLeft} يوم متبقي`}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAcknowledge(alert.id)}
                    >
                      <CheckCircle className="h-4 w-4 ml-1" /> تم
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
