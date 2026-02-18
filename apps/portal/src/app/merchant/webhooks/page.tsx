"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Webhook,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Send,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Zap,
  Activity,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/authenticated-api";
import {
  AiInsightsCard,
  generateWebhooksInsights,
} from "@/components/ai/ai-insights-card";

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  status?: "ACTIVE" | "PAUSED" | "DISABLED" | "FAILING";
  isActive: boolean;
  lastDeliveryAt?: string;
  lastDeliveryStatus?: "SUCCESS" | "FAILED" | "PENDING" | "RETRYING";
  successCount: number;
  failureCount: number;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "RETRYING";
  statusCode?: number;
  requestBody?: string | null;
  responseBody?: string | null;
  attemptNumber: number;
  maxAttempts: number;
  deliveredAt?: string;
  nextRetryAt?: string;
  error?: string;
  duration?: number;
}

const eventCategories = [
  {
    name: "الطلبات",
    events: [
      { key: "order.created", label: "طلب جديد" },
      { key: "order.confirmed", label: "تأكيد طلب" },
      { key: "order.shipped", label: "شحن طلب" },
      { key: "order.delivered", label: "توصيل طلب" },
      { key: "order.cancelled", label: "إلغاء طلب" },
    ],
  },
  {
    name: "المحادثات",
    events: [
      { key: "conversation.started", label: "بدء محادثة" },
      { key: "conversation.order_placed", label: "تم تأكيد الطلب" },
      { key: "conversation.takeover", label: "تدخل بشري" },
      { key: "conversation.closed", label: "إغلاق محادثة" },
    ],
  },
  {
    name: "الرسائل",
    events: [
      { key: "message.received", label: "رسالة واردة" },
      { key: "message.sent", label: "رسالة صادرة" },
    ],
  },
  {
    name: "العملاء",
    events: [
      { key: "customer.created", label: "عميل جديد" },
      { key: "customer.updated", label: "تحديث عميل" },
    ],
  },
  {
    name: "المخزون",
    events: [
      { key: "inventory.low_stock", label: "مخزون منخفض" },
      { key: "inventory.out_of_stock", label: "نفاد المخزون" },
    ],
  },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(
    null,
  );
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: "",
    url: "",
    events: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "failed">(
    "idle",
  );
  const [lastTestedUrl, setLastTestedUrl] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const [hooksResponse, deliveriesResponse] = await Promise.all([
        portalApi.getWebhooks(),
        portalApi.getWebhookDeliveries({ limit: 50 }),
      ]);

      const rawWebhooks = hooksResponse.webhooks || hooksResponse || [];
      const mappedWebhooks = rawWebhooks.map((webhook: any) => ({
        ...webhook,
        isActive:
          typeof webhook.isActive === "boolean"
            ? webhook.isActive
            : webhook.status === "ACTIVE",
      })) as WebhookConfig[];

      setWebhooks(mappedWebhooks);
      setDeliveries(deliveriesResponse.deliveries || []);
    } catch (error) {
      console.error("Failed to fetch webhooks:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل Webhooks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleCreate = async () => {
    if (!form.name || !form.url || form.events.length === 0) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    if (testStatus !== "success" || lastTestedUrl !== form.url) {
      toast({
        title: "خطأ",
        description: "يرجى اختبار الرابط قبل الحفظ",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      await portalApi.createWebhook({
        name: form.name,
        url: form.url,
        events: form.events,
      });

      setForm({ name: "", url: "", events: [] });
      setTestStatus("idle");
      setLastTestedUrl(null);
      setTestMessage(null);
      setIsCreateOpen(false);
      toast({ title: "تم الإنشاء", description: "تم إنشاء Webhook بنجاح" });
      fetchWebhooks();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في إنشاء Webhook",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (webhookId: string) => {
    const webhook = webhooks.find((w) => w.id === webhookId);
    if (!webhook) return;

    try {
      const nextStatus = webhook.isActive ? "PAUSED" : "ACTIVE";
      await portalApi.updateWebhookStatus(webhookId, nextStatus);
      setWebhooks(
        webhooks.map((w) =>
          w.id === webhookId
            ? { ...w, isActive: !w.isActive, status: nextStatus }
            : w,
        ),
      );
      toast({
        title: webhook.isActive ? "تم الإيقاف" : "تم التفعيل",
        description: webhook.isActive ? "تم إيقاف Webhook" : "تم تفعيل Webhook",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تحديث الحالة",
        variant: "destructive",
      });
    }
  };

  const handleTestUrl = async () => {
    if (!form.url) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رابط قبل الاختبار",
        variant: "destructive",
      });
      return;
    }

    try {
      setTesting(true);
      const result = await portalApi.testWebhookUrl({ url: form.url });
      if (result?.success) {
        setTestStatus("success");
        setLastTestedUrl(form.url);
        setTestMessage("تم الاختبار بنجاح");
        toast({ title: "نجاح", description: "تم اختبار الرابط بنجاح" });
      } else {
        setTestStatus("failed");
        setTestMessage("فشل الاختبار");
        toast({
          title: "فشل",
          description: "فشل اختبار الرابط",
          variant: "destructive",
        });
      }
    } catch (error) {
      setTestStatus("failed");
      setTestMessage("فشل الاختبار");
      toast({
        title: "فشل",
        description: "تعذر اختبار الرابط",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (webhookId: string) => {
    try {
      await portalApi.deleteWebhook(webhookId);
      setWebhooks(webhooks.filter((w) => w.id !== webhookId));
      toast({ title: "تم الحذف", description: "تم حذف Webhook بنجاح" });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في حذف Webhook",
        variant: "destructive",
      });
    }
  };

  const handleTest = async (webhook: WebhookConfig) => {
    toast({ title: "جاري الاختبار...", description: "يتم إرسال طلب اختبار" });
    try {
      await portalApi.testWebhook(webhook.id);
      toast({ title: "نجح الاختبار", description: "تم إرسال الطلب بنجاح" });
    } catch (error) {
      toast({
        title: "فشل الاختبار",
        description: "فشل في إرسال طلب الاختبار",
        variant: "destructive",
      });
    }
  };

  const handleRegenerateSecret = async (webhookId: string) => {
    try {
      const result = await portalApi.regenerateWebhookSecret(webhookId);
      const secret = result?.secret || "";
      setWebhooks(
        webhooks.map((w) => (w.id === webhookId ? { ...w, secret } : w)),
      );
      setShowSecret((prev) => ({ ...prev, [webhookId]: true }));
      toast({ title: "تم التجديد", description: "تم تجديد مفتاح التوقيع" });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تجديد المفتاح",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ", description: "تم نسخ النص إلى الحافظة" });
  };

  const toggleEventSelection = (eventKey: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(eventKey)
        ? prev.events.filter((e) => e !== eventKey)
        : [...prev.events, eventKey],
    }));
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "SUCCESS":
        return <Badge className="bg-green-500">ناجح</Badge>;
      case "FAILED":
        return <Badge variant="destructive">فشل</Badge>;
      case "PENDING":
        return <Badge variant="secondary">قيد الانتظار</Badge>;
      case "RETRYING":
        return <Badge className="bg-yellow-500">إعادة المحاولة</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `منذ ${days} يوم`;
    if (hours > 0) return `منذ ${hours} ساعة`;
    if (minutes > 0) return `منذ ${minutes} دقيقة`;
    return "الآن";
  };

  const totalSuccess = webhooks.reduce((sum, w) => sum + w.successCount, 0);
  const totalFailure = webhooks.reduce((sum, w) => sum + w.failureCount, 0);
  const successRate =
    totalSuccess + totalFailure > 0
      ? ((totalSuccess / (totalSuccess + totalFailure)) * 100).toFixed(1)
      : "100";

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* AI Webhooks Insights */}
          <AiInsightsCard
            title="مساعد Webhooks"
            insights={generateWebhooksInsights({
              totalWebhooks: webhooks.length,
              activeWebhooks: webhooks.filter((w) => w.isActive).length,
              failureCount: webhooks.reduce(
                (sum, w) => sum + (w.failureCount || 0),
                0,
              ),
            })}
            loading={loading}
          />
          <PageHeader
            title="Webhooks"
            description="إدارة تكاملات Webhook للأحداث المختلفة"
            actions={
              <>
                <Button variant="outline" onClick={fetchWebhooks}>
                  <RefreshCw className="h-4 w-4" />
                  تحديث
                </Button>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4" />
                      إنشاء Webhook
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>إنشاء Webhook جديد</DialogTitle>
                      <DialogDescription>
                        قم بإعداد Webhook لاستقبال إشعارات عن الأحداث
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="space-y-2">
                        <Label htmlFor="name">اسم Webhook</Label>
                        <Input
                          id="name"
                          placeholder="مثال: Webhook الطلبات"
                          value={form.name}
                          onChange={(e) =>
                            setForm({ ...form, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="url">عنوان URL</Label>
                        <Input
                          id="url"
                          type="url"
                          placeholder="https://example.com/webhook"
                          value={form.url}
                          onChange={(e) =>
                            setForm({ ...form, url: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-3">
                        <Label>الأحداث</Label>
                        {eventCategories.map((category) => (
                          <div key={category.name} className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                              {category.name}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {category.events.map((event) => (
                                <div
                                  key={event.key}
                                  className="flex items-center space-x-2 space-x-reverse"
                                >
                                  <Checkbox
                                    id={event.key}
                                    checked={form.events.includes(event.key)}
                                    onCheckedChange={() =>
                                      toggleEventSelection(event.key)
                                    }
                                  />
                                  <Label
                                    htmlFor={event.key}
                                    className="text-sm font-normal cursor-pointer"
                                  >
                                    {event.label}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsCreateOpen(false)}
                      >
                        إلغاء
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleTestUrl}
                        disabled={testing || !form.url}
                      >
                        {testing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        اختبار الرابط
                      </Button>
                      <Button onClick={handleCreate} disabled={saving}>
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        إنشاء
                      </Button>
                    </div>
                    {testStatus !== "idle" && (
                      <div className="text-sm text-muted-foreground">
                        {testStatus === "success"
                          ? "✅ تم الاختبار بنجاح"
                          : "❌ فشل اختبار الرابط"}
                        {testMessage ? ` — ${testMessage}` : ""}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </>
            }
          />

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي Webhooks
                </CardTitle>
                <Webhook className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{webhooks.length}</div>
                <p className="text-xs text-muted-foreground">
                  {webhooks.filter((w) => w.isActive).length} نشط
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي الإرسالات
                </CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(totalSuccess + totalFailure).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">كل الأوقات</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  معدل النجاح
                </CardTitle>
                <Activity className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {successRate}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalSuccess.toLocaleString()} ناجح
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">الفشل</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {totalFailure}
                </div>
                <p className="text-xs text-muted-foreground">يحتاج مراجعة</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="webhooks">
            <TabsList>
              <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
              <TabsTrigger value="deliveries">سجل الإرسال</TabsTrigger>
            </TabsList>

            <TabsContent value="webhooks" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>قائمة Webhooks</CardTitle>
                  <CardDescription>
                    جميع Webhooks المُعدة وحالتها
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {webhooks.map((webhook) => (
                      <div
                        key={webhook.id}
                        className="border rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-3 w-3 rounded-full ${webhook.isActive ? "bg-green-500" : "bg-gray-300"}`}
                            />
                            <div>
                              <h3 className="font-semibold">{webhook.name}</h3>
                              <p className="text-sm text-muted-foreground font-mono">
                                {webhook.url}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={webhook.isActive}
                              onCheckedChange={() =>
                                handleToggleActive(webhook.id)
                              }
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleTest(webhook)}
                                >
                                  <Send className="h-4 w-4" />
                                  اختبار
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleRegenerateSecret(webhook.id)
                                  }
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  تجديد المفتاح
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setSelectedWebhook(webhook)}
                                >
                                  <Edit className="h-4 w-4" />
                                  تعديل
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDelete(webhook.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  حذف
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {webhook.events.map((event) => (
                            <Badge
                              key={event}
                              variant="outline"
                              className="text-xs"
                            >
                              {event}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span>مفتاح التوقيع:</span>
                            <code className="bg-muted px-1 rounded text-xs font-mono">
                              {showSecret[webhook.id]
                                ? webhook.secret
                                : "••••••••••••••••••••"}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                setShowSecret({
                                  ...showSecret,
                                  [webhook.id]: !showSecret[webhook.id],
                                })
                              }
                            >
                              {showSecret[webhook.id] ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(webhook.secret)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm border-t pt-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>
                              {webhook.successCount.toLocaleString()} ناجح
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span>{webhook.failureCount} فشل</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>
                              آخر إرسال: {formatTime(webhook.lastDeliveryAt)}
                            </span>
                          </div>
                          {webhook.lastDeliveryStatus &&
                            getStatusBadge(webhook.lastDeliveryStatus)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="deliveries" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>سجل الإرسال</CardTitle>
                  <CardDescription>آخر محاولات إرسال Webhook</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الحدث</TableHead>
                        <TableHead>Webhook</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>كود الاستجابة</TableHead>
                        <TableHead>المحاولة</TableHead>
                        <TableHead>المدة</TableHead>
                        <TableHead>الوقت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((delivery) => {
                        const webhook = webhooks.find(
                          (w) => w.id === delivery.webhookId,
                        );
                        return (
                          <TableRow key={delivery.id}>
                            <TableCell>
                              <Badge variant="outline">{delivery.event}</Badge>
                            </TableCell>
                            <TableCell>{webhook?.name || "-"}</TableCell>
                            <TableCell>
                              {getStatusBadge(delivery.status)}
                            </TableCell>
                            <TableCell>
                              {delivery.statusCode ? (
                                <span
                                  className={
                                    delivery.statusCode < 400
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }
                                >
                                  {delivery.statusCode}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell>
                              {delivery.attemptNumber}/{delivery.maxAttempts}
                            </TableCell>
                            <TableCell>
                              {delivery.duration
                                ? `${delivery.duration}ms`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {delivery.deliveredAt
                                ? formatTime(delivery.deliveredAt)
                                : delivery.nextRetryAt
                                  ? `إعادة ${formatTime(delivery.nextRetryAt)}`
                                  : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Documentation Card */}
          <Card>
            <CardHeader>
              <CardTitle>كيفية التحقق من صحة Webhook</CardTitle>
              <CardDescription>
                استخدم مفتاح التوقيع للتحقق من صحة الطلبات الواردة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre>{`// Node.js example
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from('sha256=' + expectedSig)
  );
}

// Usage
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const isValid = verifyWebhook(
    JSON.stringify(req.body),
    signature,
    'your-webhook-secret'
  );
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process the webhook
  console.log('Event:', req.body.event);
  res.status(200).send('OK');
});`}</pre>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
