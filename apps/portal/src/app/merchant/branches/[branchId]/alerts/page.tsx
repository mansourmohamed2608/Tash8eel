"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Settings,
  RefreshCw,
  Save,
  Bell,
  Package,
  FileText,
  BellOff,
  AlertTriangle,
  Timer,
  Wallet,
  CalendarClock,
  Mail,
  Phone,
} from "lucide-react";
import Link from "next/link";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { branchesApi } from "@/lib/client";

export default function BranchAlertsPage() {
  const params = useParams<{ branchId: string }>();
  const branchId = params.branchId;
  const router = useRouter();
  const { apiKey } = useMerchant();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>(null);

  // Form state
  const [isActive, setIsActive] = useState(true);
  const [noOrdersMinutes, setNoOrdersMinutes] = useState("120");
  const [lowCash, setLowCash] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");
  const [cashFlowDays, setCashFlowDays] = useState("30");
  const [spikeMultiplier, setSpikeMultiplier] = useState("1.5");
  const [alertEmail, setAlertEmail] = useState("");
  const [alertWhatsapp, setAlertWhatsapp] = useState("");

  const fetchConfig = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const data = await branchesApi.getBranchAlerts(apiKey, branchId);
      if (data) {
        setConfig(data);
        setIsActive(data.is_active ?? true);
        setNoOrdersMinutes(String(data.no_orders_threshold_minutes ?? 120));
        setLowCash(
          data.low_cash_threshold != null
            ? String(data.low_cash_threshold)
            : "",
        );
        setExpiryDays(String(data.expiry_threshold_days ?? 7));
        setCashFlowDays(String(data.cash_flow_forecast_days ?? 30));
        setSpikeMultiplier(String(data.demand_spike_multiplier ?? 1.5));
        setAlertEmail(data.alert_email ?? "");
        setAlertWhatsapp(data.alert_whatsapp ?? "");
      }
    } catch {
      toast({ title: "فشل تحميل إعدادات التنبيهات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, branchId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    if (!apiKey) return;
    setSaving(true);
    try {
      await branchesApi.updateBranchAlerts(apiKey, branchId, {
        isActive,
        noOrdersThresholdMinutes: parseInt(noOrdersMinutes) || 120,
        lowCashThreshold: lowCash ? parseFloat(lowCash) : null,
        expiryThresholdDays: parseInt(expiryDays) || 7,
        cashFlowForecastDays: parseInt(cashFlowDays) || 30,
        demandSpikeMultiplier: parseFloat(spikeMultiplier) || 1.5,
        alertEmail: alertEmail || null,
        alertWhatsapp: alertWhatsapp || null,
      });
      toast({ title: "تم حفظ الإعدادات بنجاح" });
      fetchConfig();
    } catch {
      toast({ title: "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="flex gap-1 border-b pb-0">
        <Link
          href={`/merchant/branches/${branchId}`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <BarChart3 className="h-4 w-4" />
          التحليلات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/settings`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          الإعدادات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/shifts`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Clock className="h-4 w-4" />
          الجلسات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/inventory`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Package className="h-4 w-4" />
          المخزون
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/alerts`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
        >
          <Bell className="h-4 w-4" />
          التنبيهات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/pl-report`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-4 w-4" />
          تقرير الأرباح
        </Link>
      </div>

      <PageHeader
        title="إعدادات التنبيهات الاستباقية"
        description="تكوين عتبات التنبيه لهذا الفرع"
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/merchant/branches")}
            >
              <ArrowLeft className="h-4 w-4 ml-1" />
              الفروع
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchConfig}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              <Save className="h-4 w-4 ml-1" />
              {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        }
      />

      {loading ? (
        <p className="text-center py-20 text-muted-foreground">
          جارٍ التحميل...
        </p>
      ) : (
        <div className="space-y-4 max-w-2xl">
          {/* Master toggle */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isActive ? (
                    <Bell className="h-5 w-5 text-primary" />
                  ) : (
                    <BellOff className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">تفعيل التنبيهات</p>
                    <p className="text-sm text-muted-foreground">
                      {isActive
                        ? "التنبيهات مفعّلة لهذا الفرع"
                        : "التنبيهات معطّلة لهذا الفرع"}
                    </p>
                  </div>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </CardContent>
          </Card>

          {/* Alert thresholds */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                عتبات التنبيه
              </CardTitle>
              <CardDescription>
                حدد الحدود التي تستوجب إرسال تنبيه
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" />
                    دقائق بدون طلبات
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={noOrdersMinutes}
                    onChange={(e) => setNoOrdersMinutes(e.target.value)}
                    placeholder="120"
                  />
                  <p className="text-xs text-muted-foreground">
                    تنبيه عند انقطاع الطلبات لأكثر من هذه المدة
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" />
                    حد النقد المنخفض (ريال)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={lowCash}
                    onChange={(e) => setLowCash(e.target.value)}
                    placeholder="اتركه فارغاً لتعطيل"
                  />
                  <p className="text-xs text-muted-foreground">
                    تنبيه عند انخفاض النقد عن هذا المبلغ (اختياري)
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    أيام انتهاء الصلاحية
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    placeholder="7"
                  />
                  <p className="text-xs text-muted-foreground">
                    تنبيه للمنتجات قبل انتهاء صلاحيتها بهذه المدة
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>توقعات التدفق النقدي (أيام)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cashFlowDays}
                    onChange={(e) => setCashFlowDays(e.target.value)}
                    placeholder="30"
                  />
                  <p className="text-xs text-muted-foreground">
                    نافذة التوقعات المالية
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>معامل الطفرة في الطلب</Label>
                <Input
                  type="number"
                  min={1}
                  step={0.1}
                  value={spikeMultiplier}
                  onChange={(e) => setSpikeMultiplier(e.target.value)}
                  placeholder="1.5"
                  className="max-w-[200px]"
                />
                <p className="text-xs text-muted-foreground">
                  تنبيه عند تجاوز الطلبات للمعدل الطبيعي بهذا المعامل (مثال: 1.5
                  = 150%)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Notification channels */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                قنوات الإشعار
              </CardTitle>
              <CardDescription>أين يتم إرسال التنبيهات</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  البريد الإلكتروني
                </Label>
                <Input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="example@domain.com (اختياري)"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  واتساب التنبيهات
                </Label>
                <Input
                  type="tel"
                  value={alertWhatsapp}
                  onChange={(e) => setAlertWhatsapp(e.target.value)}
                  placeholder="+966xxxxxxxxx (اختياري)"
                  dir="ltr"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              <Save className="h-4 w-4 ml-1" />
              {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
