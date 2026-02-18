"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BellRing,
  Send,
  Plus,
  RefreshCw,
  Users,
  CheckCircle,
  AlertCircle,
  Clock,
  MessageSquare,
  Crown,
  Heart,
  UserCheck,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import { useMerchant } from "@/hooks/use-merchant";
import { authenticatedFetch } from "@/lib/authenticated-api";

// ── Types ──
interface BroadcastNotification {
  id: string;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  type: string;
  priority: string;
  channels: string[];
  data: any;
  isRead: boolean;
  createdAt: string;
}

const SEGMENT_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; desc: string }
> = {
  all: {
    label: "جميع العملاء",
    icon: Users,
    color: "text-blue-600",
    desc: "إرسال لكل العملاء المسجلين",
  },
  vip: {
    label: "عملاء VIP",
    icon: Crown,
    color: "text-amber-600",
    desc: "أكثر من 5 طلبات و 1000 ر.س",
  },
  loyal: {
    label: "عملاء مخلصون",
    icon: Heart,
    color: "text-pink-600",
    desc: "أكثر من 3 طلبات خلال 60 يوم",
  },
  regular: {
    label: "عملاء منتظمون",
    icon: UserCheck,
    color: "text-green-600",
    desc: "طلب واحد على الأقل خلال 90 يوم",
  },
  new: {
    label: "عملاء جدد",
    icon: UserPlus,
    color: "text-indigo-600",
    desc: "لم يطلبوا بعد",
  },
  at_risk: {
    label: "معرضون للخسارة",
    icon: AlertTriangle,
    color: "text-red-600",
    desc: "لم يطلبوا منذ أكثر من 90 يوم",
  },
};

const TYPE_LABELS: Record<string, string> = {
  promotional: "ترويجي",
  transactional: "معاملات",
  reminder: "تذكير",
  update: "تحديث",
};

export default function BroadcastNotificationsPage() {
  const { apiKey } = useMerchant();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<BroadcastNotification[]>([]);
  const [whatsappStatus, setWhatsappStatus] = useState<{
    configured: boolean;
    metaReady: boolean;
    numberRegistered: boolean;
    number: string | null;
  }>({
    configured: false,
    metaReady: false,
    numberRegistered: false,
    number: null,
  });
  const [customerCount, setCustomerCount] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [sendError, setSendError] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    message: "",
    type: "promotional",
    recipientFilter: "all",
  });

  const [confirmSend, setConfirmSend] = useState(false);

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [notifData, statusData, customersData] = await Promise.all([
        authenticatedFetch<any>("/api/v1/portal/notifications").catch(() => ({
          notifications: [],
        })),
        authenticatedFetch<any>("/api/v1/portal/notifications/status").catch(
          () => ({
            whatsapp: {
              configured: false,
              metaReady: false,
              numberRegistered: false,
              number: null,
            },
          }),
        ),
        authenticatedFetch<any>("/api/v1/portal/customers?limit=1").catch(
          () => ({ pagination: { total: 0 } }),
        ),
      ]);

      const broadcasts = (notifData.notifications || []).filter(
        (n: any) => n.data?.broadcast === true,
      );
      setHistory(broadcasts);
      setWhatsappStatus(
        statusData.whatsapp || {
          configured: false,
          metaReady: false,
          numberRegistered: false,
          number: null,
        },
      );
      setCustomerCount(customersData.pagination?.total || 0);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isFormValid = formData.title.trim() && formData.message.trim();
  const whatsappReady = whatsappStatus.configured;

  // ── Send broadcast ──
  const handleSendBroadcast = async () => {
    if (!apiKey || !isFormValid) return;
    setSending(true);
    setSendError("");
    setSendResult(null);
    try {
      const result = await authenticatedFetch<any>(
        "/api/v1/portal/notifications/broadcast",
        {
          method: "POST",
          body: {
            title: formData.title,
            message: formData.message,
            type: formData.type,
            recipientFilter: formData.recipientFilter,
          },
        },
      );
      let msg = result.message || `تم الإرسال إلى ${result.sentCount} مستلم`;
      if (result.failCount > 0) msg += ` (${result.failCount} فشل)`;
      setSendResult({ success: true, message: msg });
      setFormData({
        title: "",
        message: "",
        type: "promotional",
        recipientFilter: "all",
      });
      setShowCreate(false);
      loadData();
    } catch (err: any) {
      setSendError(err.message || "حدث خطأ أثناء الإرسال");
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  };

  const openCreate = () => {
    setSendError("");
    setSendResult(null);
    setFormData({
      title: "",
      message: "",
      type: "promotional",
      recipientFilter: "all",
    });
    setShowCreate(true);
  };

  const totalBroadcasts = history.length;
  const totalRecipients = history.reduce(
    (sum, n) => sum + (n.data?.recipientCount || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="رسائل واتساب الجماعية"
        description="أرسل رسائل ترويجية وتذكيرات لعملائك عبر واتساب"
      />

      {/* WhatsApp Status */}
      <Card
        className={
          whatsappReady
            ? "border-green-200 dark:border-green-800"
            : "border-amber-200 dark:border-amber-800"
        }
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${whatsappReady ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}
          >
            <MessageSquare
              className={`h-5 w-5 ${whatsappReady ? "text-green-600" : "text-amber-500"}`}
            />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              واتساب{" "}
              {whatsappStatus.number ? (
                <span
                  className="text-xs text-muted-foreground font-normal"
                  dir="ltr"
                >
                  ({whatsappStatus.number})
                </span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {whatsappReady
                ? "جاهز للإرسال — الرسائل تُرسل من رقمك المسجّل"
                : !whatsappStatus.metaReady
                  ? "خدمة واتساب غير مفعّلة — تواصل مع الدعم الفني"
                  : "أضف رقم واتساب الخاص بك من الإعدادات ← الإشعارات"}
            </p>
          </div>
          <Badge
            variant={whatsappReady ? "default" : "secondary"}
            className="text-xs"
          >
            {whatsappReady
              ? "جاهز"
              : !whatsappStatus.metaReady
                ? "غير مفعّل"
                : "بحاجة لرقم"}
          </Badge>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي العملاء</p>
              <p className="text-xl font-bold">{customerCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Send className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رسائل مُرسلة</p>
              <p className="text-xl font-bold">{totalBroadcasts}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <CheckCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المستلمين</p>
              <p className="text-xl font-bold">{totalRecipients}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Success banner */}
      {sendResult?.success && (
        <Card className="border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-300">
              {sendResult.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">سجل الرسائل</h2>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`}
            />
            تحديث
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!whatsappReady}>
            <Plus className="h-4 w-4 ml-1" />
            رسالة جديدة
          </Button>
        </div>
      </div>

      {!whatsappReady && (
        <Card className="border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {!whatsappStatus.metaReady
                ? "خدمة واتساب غير مفعّلة حالياً. تواصل مع الدعم الفني لتفعيل واتساب لحسابك."
                : "أضف رقم واتساب الخاص بنشاطك التجاري في صفحة الإعدادات ← الإشعارات ← رقم واتساب للرسائل الجماعية. يجب أن يكون الرقم مسجّلاً ومعتمداً عبر الدعم الفني."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : history.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BellRing className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              لا توجد رسائل جماعية بعد
            </h3>
            <p className="text-muted-foreground mb-4">
              أرسل أول رسالة واتساب جماعية لعملائك لتعزيز التواصل والمبيعات
            </p>
            {whatsappReady && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 ml-1" />
                إرسال رسالة
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {history.map((notif) => {
            const broadcastData = notif.data || {};
            return (
              <Card
                key={notif.id}
                className="hover:bg-muted/50 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <MessageSquare className="h-4 w-4 text-green-500 shrink-0" />
                        <h3 className="font-medium">
                          {notif.titleAr || notif.title || "رسالة"}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {TYPE_LABELS[broadcastData.type] || "رسالة"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {notif.messageAr || notif.message || ""}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />{" "}
                          {broadcastData.recipientCount || 0} مستلم
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(notif.createdAt).toLocaleDateString(
                            "ar-EG",
                            { day: "numeric", month: "long", year: "numeric" },
                          )}
                        </span>
                        {broadcastData.filter &&
                          broadcastData.filter !== "all" && (
                            <Badge variant="outline" className="text-xs">
                              {SEGMENT_CONFIG[broadcastData.filter]?.label ||
                                broadcastData.filter}
                            </Badge>
                          )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create Broadcast Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>رسالة واتساب جماعية</DialogTitle>
            <DialogDescription>
              أرسل رسالة لعملائك عبر واتساب — ستظهر باسم نشاطك التجاري
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-1">العنوان</Label>
              <Input
                placeholder="مثال: عرض خاص - خصم 20% لمدة محدودة!"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>

            <div>
              <Label className="mb-1">نص الرسالة</Label>
              <Textarea
                placeholder="اكتب رسالتك هنا... سيتم إرسالها كما هي للعملاء عبر واتساب"
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                className="min-h-[100px]"
              />
            </div>

            <div>
              <Label className="mb-1">نوع الرسالة</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="promotional">ترويجي</SelectItem>
                  <SelectItem value="transactional">معاملات</SelectItem>
                  <SelectItem value="reminder">تذكير</SelectItem>
                  <SelectItem value="update">تحديث</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3 shrink-0" />
              سيتم الإرسال فقط للعملاء الذين لديهم رقم هاتف مسجّل.
            </p>

            <div>
              <Label className="mb-1">المستلمون</Label>
              <Select
                value={formData.recipientFilter}
                onValueChange={(v) =>
                  setFormData({ ...formData, recipientFilter: v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span>{cfg.label}</span>
                        <span className="text-xs text-muted-foreground">
                          — {cfg.desc}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sendError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4 shrink-0" /> {sendError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => setConfirmSend(true)}
              disabled={sending || !isFormValid}
            >
              <Send className="h-4 w-4 ml-1" />
              إرسال عبر واتساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Send ── */}
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إرسال الرسالة الجماعية</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                سيتم إرسال هذه الرسالة عبر واتساب إلى{" "}
                {formData.recipientFilter === "all"
                  ? "جميع العملاء"
                  : SEGMENT_CONFIG[formData.recipientFilter]?.label}
                .
              </span>
              <span className="block font-medium">
                &quot;{formData.title}&quot;
              </span>
              <span className="block text-xs">
                لا يمكن التراجع بعد الإرسال.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendBroadcast} disabled={sending}>
              {sending ? "جاري الإرسال..." : "تأكيد الإرسال"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
