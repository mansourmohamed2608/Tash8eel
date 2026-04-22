"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/client";
import {
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  Link2,
  Sheet,
  CheckCircle2,
  Circle,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/layout";

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [endpointUrl, setEndpointUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventsCount, setEventsCount] = useState(0);
  const [mappingDraft, setMappingDraft] = useState<any>({
    order: {
      orderNumber: "",
      subtotal: "",
      discount: "",
      deliveryFee: "",
      total: "",
      notes: "",
      deliveryPreference: "",
    },
    customer: {
      name: "",
      phone: "",
      address: "",
    },
    items: { path: "" },
    payment: {
      orderNumber: "",
      amount: "",
      method: "",
      paidAt: "",
    },
  });
  const [pullDraft, setPullDraft] = useState<any>({
    enabled: false,
    baseUrl: "",
    authHeader: "Authorization",
    authToken: "",
    ordersPath: "/api/orders",
    ordersItemsPath: "",
    paymentsPath: "/api/payments",
    paymentsItemsPath: "",
  });
  const [savingMapping, setSavingMapping] = useState(false);
  const [savingPull, setSavingPull] = useState(false);

  // Google Sheets outbound webhook state
  const [gsWebhook, setGsWebhook] = useState<any | null>(null);
  const [gsUrl, setGsUrl] = useState("");
  const [gsEvents, setGsEvents] = useState<string[]>([
    "order.created",
    "order.delivered",
    "order.cancelled",
  ]);
  const [gsSaving, setGsSaving] = useState(false);
  const [gsScriptCopied, setGsScriptCopied] = useState(false);
  const [gsShowScript, setGsShowScript] = useState(false);
  const [syncMode, setSyncMode] = useState<"orders" | "payments" | "both">(
    "both",
  );

  const fetchIntegration = useCallback(async () => {
    try {
      setLoading(true);
      const [endpoint, events, config] = await Promise.all([
        portalApi.getErpIntegration(),
        portalApi.getErpIntegrationEvents({ limit: 1 }),
        portalApi.getErpIntegrationConfig(),
      ]);
      const rawUrl = endpoint.endpointUrl || "";
      const absoluteUrl =
        typeof window !== "undefined" && rawUrl.startsWith("/")
          ? `${window.location.origin}${rawUrl}`
          : rawUrl;
      setEndpointUrl(absoluteUrl);
      setSecret(endpoint.secret);
      setLastEventAt(endpoint.lastEventAt || null);
      setEventsCount(events.total || 0);
      const mapping = config?.mapping || {};
      setMappingDraft((prev: any) => ({
        ...prev,
        ...mapping,
        order: { ...prev.order, ...(mapping.order || {}) },
        customer: { ...prev.customer, ...(mapping.customer || {}) },
        items: { ...prev.items, ...(mapping.items || {}) },
        payment: { ...prev.payment, ...(mapping.payment || {}) },
      }));
      const pull = config?.pull || {};
      setPullDraft((prev: any) => ({
        ...prev,
        ...pull,
      }));
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تحميل التكاملات",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchIntegration();
  }, [fetchIntegration]);

  useEffect(() => {
    portalApi
      .getWebhooks()
      .then((hooks: any[]) => {
        const gs = (hooks || []).find(
          (h: any) => h.name === "__google_sheets__",
        );
        if (gs) {
          setGsWebhook(gs);
          setGsUrl(gs.url);
          setGsEvents(
            gs.events || [
              "order.created",
              "order.delivered",
              "order.cancelled",
            ],
          );
        }
      })
      .catch(() => {});
  }, []);

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "تم النسخ", description: "تم نسخ القيمة" });
    } catch {
      toast({
        title: "خطأ",
        description: "تعذر النسخ",
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = async () => {
    try {
      const result = await portalApi.regenerateErpIntegrationSecret();
      setSecret(result.secret);
      toast({ title: "تم التحديث", description: "تم تجديد السر بنجاح" });
    } catch {
      toast({
        title: "خطأ",
        description: "فشل تجديد السر",
        variant: "destructive",
      });
    }
  };

  const handleTest = async () => {
    try {
      await portalApi.sendErpIntegrationTest();
      toast({ title: "تم الاختبار", description: "تم إرسال حدث تجريبي" });
      fetchIntegration();
    } catch {
      toast({
        title: "خطأ",
        description: "فشل إرسال الاختبار",
        variant: "destructive",
      });
    }
  };

  const handleSaveMapping = async () => {
    try {
      setSavingMapping(true);
      await portalApi.updateErpIntegrationConfig({ mapping: mappingDraft });
      toast({ title: "تم الحفظ", description: "تم حفظ قواعد الربط بنجاح" });
    } catch {
      toast({
        title: "خطأ",
        description: "فشل حفظ قواعد الربط",
        variant: "destructive",
      });
    } finally {
      setSavingMapping(false);
    }
  };

  const handleSavePull = async () => {
    try {
      setSavingPull(true);
      await portalApi.updateErpIntegrationConfig({ pull: pullDraft });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات السحب بنجاح" });
    } catch {
      toast({
        title: "خطأ",
        description: "فشل حفظ إعدادات السحب",
        variant: "destructive",
      });
    } finally {
      setSavingPull(false);
    }
  };

  const GS_EVENTS = [
    { value: "order.created", label: "طلب جديد" },
    { value: "order.confirmed", label: "طلب مؤكد" },
    { value: "order.shipped", label: "طلب شُحن" },
    { value: "order.delivered", label: "طلب وصل" },
    { value: "order.cancelled", label: "طلب ملغي" },
    { value: "payment.received", label: "دفعة مستلمة" },
    { value: "customer.created", label: "عميل جديد" },
    { value: "conversation.started", label: "محادثة جديدة" },
  ];

  const GS_APPS_SCRIPT = `// ═══════════════════════════════════════════
// تشغيل - Google Sheets Webhook Receiver
// 1. افتح جدول Google Sheets جديد
// 2. Extensions > Apps Script
// 3. الصق هذا الكود بالكامل واحفظ
// 4. Deploy > New Deployment > Web app
//    Execute as: Me | Who has access: Anyone
// 5. انسخ الرابط والصقه في حقل الرابط أدناه
// ═══════════════════════════════════════════

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Add header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "التاريخ", "الحدث", "رقم الطلب",
        "اسم العميل", "هاتف العميل",
        "الإجمالي", "الحالة", "العنوان"
      ]);
    }

    var d = payload.data || {};
    var order = d.order || d;
    var customer = d.customer || {};

    sheet.appendRow([
      new Date(payload.timestamp || Date.now()),
      payload.event || "",
      order.orderNumber || order.id || "",
      customer.name || order.customerName || "",
      customer.phone || order.customerPhone || "",
      order.total || order.amount || "",
      order.status || "",
      customer.address || order.deliveryAddress || ""
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const handleGsToggleEvent = (ev: string) => {
    setGsEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev],
    );
  };

  const handleGsSave = async () => {
    if (!gsUrl.trim()) {
      toast({
        title: "خطأ",
        description: "أدخل رابط Apps Script أولاً",
        variant: "destructive",
      });
      return;
    }
    if (gsEvents.length === 0) {
      toast({
        title: "خطأ",
        description: "اختر حدثاً واحداً على الأقل",
        variant: "destructive",
      });
      return;
    }
    try {
      setGsSaving(true);
      if (gsWebhook) {
        const updated = await portalApi.updateWebhook(gsWebhook.id, {
          name: "__google_sheets__",
          url: gsUrl,
          events: gsEvents,
        });
        setGsWebhook(updated);
      } else {
        const created = await portalApi.createWebhook({
          name: "__google_sheets__",
          url: gsUrl,
          events: gsEvents,
        });
        setGsWebhook(created);
      }
      toast({ title: "تم الحفظ", description: "تم ربط جداول جوجل بنجاح" });
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err?.message || "فشل الحفظ",
        variant: "destructive",
      });
    } finally {
      setGsSaving(false);
    }
  };

  const handleGsTest = async () => {
    if (!gsWebhook) return;
    try {
      await portalApi.testWebhook(gsWebhook.id);
      toast({
        title: "تم الاختبار",
        description: "تم إرسال صف تجريبي إلى الشيت",
      });
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err?.message || "فشل الاختبار",
        variant: "destructive",
      });
    }
  };

  const handleGsDelete = async () => {
    if (!gsWebhook) return;
    try {
      await portalApi.deleteWebhook(gsWebhook.id);
      setGsWebhook(null);
      setGsUrl("");
      setGsEvents(["order.created", "order.delivered", "order.cancelled"]);
      toast({ title: "تم الحذف", description: "تم إزالة تكامل جداول جوجل" });
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err?.message || "فشل الحذف",
        variant: "destructive",
      });
    }
  };

  const handleGsCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(GS_APPS_SCRIPT);
      setGsScriptCopied(true);
      setTimeout(() => setGsScriptCopied(false), 2500);
    } catch {
      toast({
        title: "خطأ",
        description: "تعذر النسخ",
        variant: "destructive",
      });
    }
  };

  const handleSyncNow = async () => {
    try {
      await portalApi.pullErpIntegration({ mode: syncMode });
      toast({
        title: "تمت المزامنة",
        description: "تم سحب البيانات ومعالجتها",
      });
      fetchIntegration();
    } catch (error: any) {
      const message = error?.message || "فشل سحب البيانات";
      toast({ title: "خطأ", description: message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        جاري التحميل...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 animate-fadeIn">
      <PageHeader
        title="التكاملات"
        description="ربط نظام ERP الخاص بك لمزامنة الطلبات والمدفوعات تلقائياً"
      />

      {/* Data Flow Explanation */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader>
          <CardTitle className="text-base">كيف تعمل التكاملات؟</CardTitle>
          <CardDescription>
            هذه الصفحة لربط نظام الـ ERP (مثل ERPNext, Odoo, Zoho) بمنصتنا
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500 text-white">← استقبال</Badge>
                <span className="font-semibold text-sm">Push (Webhook)</span>
              </div>
              <p className="text-sm text-muted-foreground">
                نظام الـ ERP <strong>يرسل إلينا</strong> الطلبات والمدفوعات
                الجديدة تلقائياً عبر رابط Webhook. كل ما عليك هو ضبط الـ ERP
                ليرسل POST إلى رابط الاستقبال أدناه.
              </p>
              <p className="text-xs text-muted-foreground">
                ERP → تشغيل (إضافة طلبات + مدفوعات جديدة)
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500 text-white">→ سحب</Badge>
                <span className="font-semibold text-sm">Pull (Connector)</span>
              </div>
              <p className="text-sm text-muted-foreground">
                إذا كان الـ ERP لا يدعم Webhooks،{" "}
                <strong>نحن نسحب البيانات</strong> من API الـ ERP دورياً. تحدد
                المسارات وطريقة المصادقة ونجلب الطلبات والمدفوعات.
              </p>
              <p className="text-xs text-muted-foreground">
                تشغيل → يقرأ من ERP → يُنشئ طلبات + مدفوعات
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            💡 في الحالتين، البيانات <strong>تأتي من الـ ERP إلى نظامنا</strong>{" "}
            - لا نرسل بيانات إلى الـ ERP
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            تكامل ERP (إرسال إلى نظامنا)
          </CardTitle>
          <CardDescription>
            استخدم هذا الرابط في نظام الـ ERP لإرسال الطلبات والمدفوعات إلى
            منصتنا.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              رابط الاستقبال (Incoming Webhook)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={endpointUrl} />
              <Button variant="outline" onClick={() => copyValue(endpointUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">السر (Secret)</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                readOnly
                value={showSecret ? secret : "••••••••••••••••••"}
              />
              <Button
                variant="outline"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button variant="outline" onClick={() => copyValue(secret)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleRegenerate}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="secondary">الأحداث المستلمة: {eventsCount}</Badge>
            <Badge variant="outline">
              آخر حدث:{" "}
              {lastEventAt
                ? new Date(lastEventAt).toLocaleString("ar-EG")
                : "-"}
            </Badge>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleTest}>
              <Send className="h-4 w-4" />
              إرسال اختبار
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قواعد الربط (Field Mapping)</CardTitle>
          <CardDescription>
            عرّف مسارات الحقول القادمة من الـ ERP حتى نستطيع إنشاء الطلبات
            والمدفوعات بدقة.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">رقم الطلب</label>
            <Input
              value={mappingDraft.order.orderNumber}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  order: { ...prev.order, orderNumber: e.target.value },
                }))
              }
              placeholder="order.number أو order_id"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">الإجمالي</label>
            <Input
              value={mappingDraft.order.total}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  order: { ...prev.order, total: e.target.value },
                }))
              }
              placeholder="total.amount"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">القيمة قبل الخصم</label>
            <Input
              value={mappingDraft.order.subtotal}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  order: { ...prev.order, subtotal: e.target.value },
                }))
              }
              placeholder="subtotal"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">الخصم</label>
            <Input
              value={mappingDraft.order.discount}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  order: { ...prev.order, discount: e.target.value },
                }))
              }
              placeholder="discount.value"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">رسوم التوصيل</label>
            <Input
              value={mappingDraft.order.deliveryFee}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  order: { ...prev.order, deliveryFee: e.target.value },
                }))
              }
              placeholder="shipping.fee"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">ملاحظات الطلب</label>
            <Input
              value={mappingDraft.order.notes}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  order: { ...prev.order, notes: e.target.value },
                }))
              }
              placeholder="notes"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">تفضيل التوصيل</label>
            <Input
              value={mappingDraft.order.deliveryPreference}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  order: { ...prev.order, deliveryPreference: e.target.value },
                }))
              }
              placeholder="delivery.preference"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">مسار عناصر الطلب</label>
            <Input
              value={mappingDraft.items.path}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  items: { ...prev.items, path: e.target.value },
                }))
              }
              placeholder="items أو order.items"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">اسم العميل</label>
            <Input
              value={mappingDraft.customer.name}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  customer: { ...prev.customer, name: e.target.value },
                }))
              }
              placeholder="customer.name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">هاتف العميل</label>
            <Input
              value={mappingDraft.customer.phone}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  customer: { ...prev.customer, phone: e.target.value },
                }))
              }
              placeholder="customer.phone"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">عنوان العميل</label>
            <Input
              value={mappingDraft.customer.address}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  customer: { ...prev.customer, address: e.target.value },
                }))
              }
              placeholder="customer.address"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">رقم الطلب (الدفع)</label>
            <Input
              value={mappingDraft.payment.orderNumber}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  payment: { ...prev.payment, orderNumber: e.target.value },
                }))
              }
              placeholder="payment.order_id"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">قيمة الدفع</label>
            <Input
              value={mappingDraft.payment.amount}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  payment: { ...prev.payment, amount: e.target.value },
                }))
              }
              placeholder="payment.amount"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">طريقة الدفع</label>
            <Input
              value={mappingDraft.payment.method}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  payment: { ...prev.payment, method: e.target.value },
                }))
              }
              placeholder="payment.method"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">تاريخ الدفع</label>
            <Input
              value={mappingDraft.payment.paidAt}
              onChange={(e) =>
                setMappingDraft((prev: any) => ({
                  ...prev,
                  payment: { ...prev.payment, paidAt: e.target.value },
                }))
              }
              placeholder="payment.paid_at"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={handleSaveMapping}
              disabled={savingMapping}
              className="w-full sm:w-auto"
            >
              حفظ قواعد الربط
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>سحب البيانات من الـ ERP (Pull Connector)</CardTitle>
          <CardDescription>
            فعّل السحب إذا كان الـ ERP لديك لا يدعم الإرسال. سنقوم بجلب الطلبات
            والمدفوعات حسب المسارات التي تحددها.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              checked={!!pullDraft.enabled}
              onCheckedChange={(checked) =>
                setPullDraft((prev: any) => ({ ...prev, enabled: checked }))
              }
            />
            <span className="text-sm">تفعيل السحب الدوري</span>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">عنوان الـ ERP</label>
            <Input
              value={pullDraft.baseUrl}
              onChange={(e) =>
                setPullDraft((prev: any) => ({
                  ...prev,
                  baseUrl: e.target.value,
                }))
              }
              placeholder="https://erp.example.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">ترويسة المصادقة</label>
            <Input
              value={pullDraft.authHeader}
              onChange={(e) =>
                setPullDraft((prev: any) => ({
                  ...prev,
                  authHeader: e.target.value,
                }))
              }
              placeholder="Authorization"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">توكن المصادقة</label>
            <Input
              value={pullDraft.authToken}
              onChange={(e) =>
                setPullDraft((prev: any) => ({
                  ...prev,
                  authToken: e.target.value,
                }))
              }
              placeholder="Bearer xxxx"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">مسار الطلبات</label>
            <Input
              value={pullDraft.ordersPath}
              onChange={(e) =>
                setPullDraft((prev: any) => ({
                  ...prev,
                  ordersPath: e.target.value,
                }))
              }
              placeholder="/api/orders"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              مسار عناصر الطلبات (اختياري)
            </label>
            <Input
              value={pullDraft.ordersItemsPath}
              onChange={(e) =>
                setPullDraft((prev: any) => ({
                  ...prev,
                  ordersItemsPath: e.target.value,
                }))
              }
              placeholder="data.orders"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">مسار المدفوعات</label>
            <Input
              value={pullDraft.paymentsPath}
              onChange={(e) =>
                setPullDraft((prev: any) => ({
                  ...prev,
                  paymentsPath: e.target.value,
                }))
              }
              placeholder="/api/payments"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              مسار عناصر المدفوعات (اختياري)
            </label>
            <Input
              value={pullDraft.paymentsItemsPath}
              onChange={(e) =>
                setPullDraft((prev: any) => ({
                  ...prev,
                  paymentsItemsPath: e.target.value,
                }))
              }
              placeholder="data.payments"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Select
                value={syncMode}
                onValueChange={(value) => setSyncMode(value as any)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="نوع المزامنة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">طلبات + مدفوعات</SelectItem>
                  <SelectItem value="orders">طلبات فقط</SelectItem>
                  <SelectItem value="payments">مدفوعات فقط</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleSyncNow}
                className="w-full sm:w-auto"
              >
                مزامنة الآن
              </Button>
            </div>
            <Button
              onClick={handleSavePull}
              disabled={savingPull}
              className="w-full sm:w-auto"
            >
              حفظ إعدادات السحب
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Google Sheets Integration ─── */}
      <Card className="border-green-200">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sheet className="h-5 w-5 text-green-600" />
                تكامل جداول جوجل (Google Sheets)
                {gsWebhook && (
                  <Badge
                    className={
                      gsWebhook.status === "ACTIVE"
                        ? "bg-green-500 text-white"
                        : gsWebhook.status === "FAILING"
                          ? "bg-red-500 text-white"
                          : "bg-yellow-500 text-white"
                    }
                  >
                    {gsWebhook.status === "ACTIVE"
                      ? "مُفعَّل"
                      : gsWebhook.status === "FAILING"
                        ? "يفشل"
                        : "موقوف"}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                أرسل بيانات الطلبات والمحادثات مباشرة إلى جدول Google Sheets في
                الوقت الفعلي - بدون Zapier أو أي أداة وسيطة.
              </CardDescription>
            </div>
            {gsWebhook && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGsDelete}
                className="text-red-500 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Step 1 - Deploy Apps Script */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold">
                1
              </span>
              <span className="font-semibold text-sm">
                انشر Apps Script في جدولك
              </span>
              <Button
                variant="link"
                size="sm"
                className="text-xs text-muted-foreground ml-auto"
                onClick={() => setGsShowScript((v) => !v)}
              >
                {gsShowScript ? "إخفاء الكود" : "عرض الكود"}
              </Button>
            </div>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>افتح جدول Google Sheets جديد</li>
              <li>Extensions &rarr; Apps Script</li>
              <li>احذف الكود الموجود والصق الكود أدناه</li>
              <li>Deploy &rarr; New Deployment &rarr; Web app</li>
              <li>
                Execute as: <strong>Me</strong> - Who has access:{" "}
                <strong>Anyone</strong>
              </li>
              <li>انسخ رابط الـ Web app</li>
            </ol>
            {gsShowScript && (
              <div className="relative">
                <pre
                  className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed"
                  dir="ltr"
                >
                  {GS_APPS_SCRIPT}
                </pre>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2 gap-1"
                  onClick={handleGsCopyScript}
                >
                  {gsScriptCopied ? (
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {gsScriptCopied ? "تم النسخ" : "نسخ"}
                </Button>
              </div>
            )}
            {!gsShowScript && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleGsCopyScript}
              >
                {gsScriptCopied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {gsScriptCopied ? "تم نسخ الكود" : "نسخ كود Apps Script"}
              </Button>
            )}
          </div>

          {/* Step 2 - Paste URL */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold">
                2
              </span>
              <span className="font-semibold text-sm">
                الصق رابط Web app هنا
              </span>
            </div>
            <Input
              dir="ltr"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={gsUrl}
              onChange={(e) => setGsUrl(e.target.value)}
            />
          </div>

          {/* Step 3 - Choose events */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold">
                3
              </span>
              <span className="font-semibold text-sm">
                اختر الأحداث التي تريد تسجيلها في الشيت
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              {GS_EVENTS.map((ev) => (
                <label
                  key={ev.value}
                  className="flex items-center gap-2 cursor-pointer text-sm rounded-md border p-2 hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={gsEvents.includes(ev.value)}
                    onCheckedChange={() => handleGsToggleEvent(ev.value)}
                  />
                  {ev.label}
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              onClick={handleGsSave}
              disabled={gsSaving}
              className="gap-1"
            >
              {gsSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              {gsWebhook ? "تحديث الربط" : "ربط الشيت"}
            </Button>
            {gsWebhook && (
              <Button
                variant="outline"
                onClick={handleGsTest}
                className="gap-1"
              >
                <Send className="h-4 w-4" />
                إرسال صف تجريبي
              </Button>
            )}
            {gsWebhook?.lastTriggeredAt && (
              <span className="text-xs text-muted-foreground">
                آخر إرسال:{" "}
                {new Date(gsWebhook.lastTriggeredAt).toLocaleString("ar-EG")}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            💡 التكامل ثنائي الاتجاه: تشغيل يُرسل إلى الشيت تلقائياً عند كل حدث،
            ولربط الاتجاه العكسي (الشيت → تشغيل) استخدم Apps Script onEdit مع
            رابط الاستقبال في قسم ERP أعلاه.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>موصلات جاهزة (ERP)</CardTitle>
          <CardDescription>
            يمكنك استخدام القوالب التالية لتهيئة الـ ERP الخاص بك لإرسال الأحداث
            إلى رابط الاستقبال أعلاه.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            {
              name: "ERPNext",
              hint: "استخدم Webhooks لإرسال order.created و payment.received",
            },
            {
              name: "Odoo",
              hint: "استخدم Automated Actions + Webhook لإرسال الأحداث",
            },
            { name: "Zoho", hint: "استخدم Webhooks في Zoho Inventory/Books" },
            {
              name: "Custom ERP",
              hint: "أرسل POST إلى رابط الاستقبال باستخدام السر",
            },
          ].map((connector) => (
            <div key={connector.name} className="border rounded-lg p-4">
              <div className="font-semibold">{connector.name}</div>
              <div className="text-sm text-muted-foreground">
                {connector.hint}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
