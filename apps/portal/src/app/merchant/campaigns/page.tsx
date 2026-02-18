"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Slider } from "@/components/ui/slider";
import {
  Gift,
  Send,
  UserMinus,
  TrendingUp,
  MessageSquare,
  Percent,
  Calendar,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Users,
  Zap,
  Video,
  Share2,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-api";
import { useMerchant } from "@/hooks/use-merchant";
import {
  AiInsightsCard,
  generateCampaignInsights,
} from "@/components/ai/ai-insights-card";
import { SmartAnalysisButton } from "@/components/ai/smart-analysis-button";
import portalApi from "@/lib/authenticated-api";

interface CampaignResult {
  sent: number;
  totalTargeted: number;
  message: string;
}

export default function WinbackCampaignsPage() {
  const { apiKey } = useMerchant();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // WhatsApp status
  const [waReady, setWaReady] = useState(false);
  const [waNumber, setWaNumber] = useState<string | null>(null);

  // Campaign options
  const [discountPercent, setDiscountPercent] = useState(15);
  const [validDays, setValidDays] = useState(7);
  const [message, setMessage] = useState(
    "وحشتنا! 🎁 عرض خاص لك — خصم {discount}% على طلبك القادم. العرض ساري لمدة {days} أيام فقط!",
  );

  useEffect(() => {
    if (!apiKey) return;
    authenticatedFetch<any>("/api/v1/portal/notifications/status")
      .then((data) => {
        const wa = data.whatsapp || {};
        setWaReady(wa.configured || false);
        setWaNumber(wa.number || null);
      })
      .catch(() => {
        /* WA status check non-blocking */
      });
  }, [apiKey]);

  const handleCreateCampaign = useCallback(async () => {
    setSending(true);
    setError(null);
    setResult(null);
    setConfirmSend(false);
    try {
      const data = await authenticatedFetch<any>(
        "/api/v1/portal/campaigns/winback",
        {
          method: "POST",
          body: {
            discountPercent,
            message: message
              .replace("{discount}", String(discountPercent))
              .replace("{days}", String(validDays)),
            validDays,
          },
        },
      );
      setResult({
        sent: data.sent || 0,
        totalTargeted: data.totalTargeted || 0,
        message: data.message || "تم إرسال الحملة بنجاح",
      });
      setShowCreate(false);
    } catch (err: any) {
      setError(err?.message || "فشل إرسال الحملة");
    } finally {
      setSending(false);
    }
  }, [discountPercent, validDays, message]);

  const campaignTypes = [
    {
      id: "winback",
      title: "استعادة العملاء",
      titleEn: "Win-back Campaign",
      description:
        "إرسال عروض خاصة عبر واتساب للعملاء الذين لم يطلبوا منذ فترة",
      icon: UserMinus,
      color: "text-orange-500",
      bgColor: "bg-orange-50 dark:bg-orange-950",
      available: true,
      channel: "واتساب",
    },
    {
      id: "loyalty",
      title: "مكافأة الولاء",
      titleEn: "Loyalty Reward",
      description: "إرسال خصومات حصرية لأفضل العملاء كمكافأة على ولائهم",
      icon: Gift,
      color: "text-purple-500",
      bgColor: "bg-purple-50 dark:bg-purple-950",
      available: false,
      channel: "واتساب",
    },
    {
      id: "reengagement",
      title: "إعادة التفاعل",
      titleEn: "Re-engagement",
      description: "إرسال رسائل تذكيرية للعملاء الذين لديهم سلة مشتريات متروكة",
      icon: Zap,
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-950",
      available: false,
      channel: "واتساب",
    },
    {
      id: "instagram",
      title: "حملة إنستغرام",
      titleEn: "Instagram Campaign",
      description: "إرسال رسائل ترويجية عبر Instagram Direct لمتابعيك",
      icon: MessageSquare,
      color: "text-pink-500",
      bgColor: "bg-pink-50 dark:bg-pink-950",
      available: false,
      channel: "إنستغرام",
    },
    {
      id: "facebook",
      title: "حملة فيسبوك",
      titleEn: "Facebook Campaign",
      description: "إرسال رسائل ترويجية عبر Messenger لمتابعي صفحتك",
      icon: Share2,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950",
      available: false,
      channel: "فيسبوك",
    },
    {
      id: "tiktok",
      title: "حملة تيك توك",
      titleEn: "TikTok Campaign",
      description: "إرسال عروض ترويجية عبر رسائل تيك توك لمتابعيك",
      icon: Video,
      color: "text-slate-800 dark:text-slate-200",
      bgColor: "bg-slate-50 dark:bg-slate-900",
      available: false,
      channel: "تيك توك",
    },
    {
      id: "telegram",
      title: "حملة تيليغرام",
      titleEn: "Telegram Campaign",
      description: "إرسال عروض وتحديثات لمشتركي قناة تيليغرام الخاصة بك",
      icon: Send,
      color: "text-sky-500",
      bgColor: "bg-sky-50 dark:bg-sky-950",
      available: false,
      channel: "تيليغرام",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="الحملات التسويقية"
        description="إنشاء وإدارة حملات استعادة العملاء والتسويق الذكي"
        actions={
          <Button
            onClick={() => {
              setShowCreate(true);
              setResult(null);
              setError(null);
            }}
            disabled={!waReady}
          >
            <Send className="h-4 w-4 ml-2" />
            إنشاء حملة جديدة
          </Button>
        }
      />

      {/* AI Campaign Insights */}
      <AiInsightsCard
        title="مساعد الحملات"
        insights={generateCampaignInsights({
          totalCampaigns: 0,
          activeCampaigns: result ? 1 : 0,
        })}
      />

      {/* WhatsApp Status */}
      {!waReady && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              يجب تفعيل واتساب أولاً لإرسال الحملات. أضف رقم واتساب الأعمال في
              الإعدادات ← الإشعارات.
            </p>
          </CardContent>
        </Card>
      )}
      {waReady && waNumber && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4 flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                واتساب جاهز{" "}
                <span
                  className="text-xs text-muted-foreground font-normal"
                  dir="ltr"
                >
                  ({waNumber})
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                الحملات تُرسل عبر واتساب من رقم نشاطك التجاري
              </p>
            </div>
            <Badge variant="default" className="text-xs">
              جاهز
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Campaign Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">عملاء مستهدفون</p>
                <p className="text-2xl font-bold">—</p>
                <p className="text-xs text-muted-foreground">
                  أنشئ حملة لمعرفة العدد
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">رسائل مرسلة</p>
                <p className="text-2xl font-bold">
                  {result?.sent?.toLocaleString("ar-EG") || "٠"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">معدل الاستجابة</p>
                <p className="text-2xl font-bold">—</p>
                <p className="text-xs text-muted-foreground">
                  ستظهر بعد الإرسال
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Percent className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">الخصم الحالي</p>
                <p className="text-2xl font-bold">{discountPercent}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Types */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaignTypes.map((type) => (
          <Card
            key={type.id}
            className={`relative ${!type.available ? "opacity-60" : "cursor-pointer hover:shadow-md transition-shadow"}`}
            onClick={
              type.available
                ? () => {
                    setShowCreate(true);
                    setResult(null);
                    setError(null);
                  }
                : undefined
            }
          >
            {!type.available && (
              <Badge variant="secondary" className="absolute top-3 left-3">
                قريباً
              </Badge>
            )}
            <CardHeader>
              <div
                className={`w-12 h-12 rounded-lg ${type.bgColor} flex items-center justify-center mb-2`}
              >
                <type.icon className={`h-6 w-6 ${type.color}`} />
              </div>
              <CardTitle className="text-lg">{type.title}</CardTitle>
              <CardDescription>{type.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{type.titleEn}</p>
                <Badge variant="outline" className="text-xs">
                  {type.channel}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Previous Results */}
      {result && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">
                  تم إرسال الحملة بنجاح!
                </p>
                <p className="text-sm text-muted-foreground">
                  تم إرسال {result.sent} رسالة من أصل {result.totalTargeted}{" "}
                  عميل مستهدف
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-orange-500" />
              حملة استعادة العملاء
            </DialogTitle>
            <DialogDescription>
              إرسال عروض خاصة للعملاء الذين لم يطلبوا منذ فترة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Discount Slider */}
            <div className="space-y-3">
              <Label className="flex items-center justify-between">
                <span>نسبة الخصم</span>
                <Badge variant="secondary">{discountPercent}%</Badge>
              </Label>
              <Slider
                value={[discountPercent]}
                onValueChange={([v]) => setDiscountPercent(v)}
                min={5}
                max={50}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                اختر نسبة الخصم بين 5% و 50%
              </p>
            </div>

            {/* Validity */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                صلاحية العرض (أيام)
              </Label>
              <Input
                type="number"
                value={validDays}
                onChange={(e) =>
                  setValidDays(Math.max(1, parseInt(e.target.value) || 7))
                }
                min={1}
                max={30}
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                نص الرسالة
              </Label>
              <div className="flex gap-2 mb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generatingMsg}
                  onClick={async () => {
                    setGeneratingMsg(true);
                    try {
                      const result = await portalApi.chatWithAssistant(
                        `أنت كاتب تسويقي محترف. اكتب رسالة واتساب تسويقية قصيرة (3-4 أسطر) لحملة استرجاع العملاء.
الخصم: ${discountPercent}%
المدة: ${validDays} أيام
استخدم المتغيرات: {discount} لنسبة الخصم و {days} لعدد الأيام.
اكتب بالعربية المصرية العامية. اجعلها جذابة ومختصرة. لا تستخدم ايموجي نهائيا.
أرجع نص الرسالة فقط بدون أي شرح.`,
                      );
                      if (result.reply) setMessage(result.reply);
                    } catch {}
                    setGeneratingMsg(false);
                  }}
                  className="text-purple-700 border-purple-300 hover:bg-purple-50"
                >
                  {generatingMsg ? (
                    <Loader2 className="h-3 w-3 animate-spin ml-1" />
                  ) : (
                    <Zap className="h-3 w-3 ml-1" />
                  )}
                  اقتراح بالذكاء الاصطناعي
                </Button>
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                استخدم {"{discount}"} لنسبة الخصم و {"{days}"} لعدد الأيام
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-lg">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {result && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                تم إرسال {result.sent} رسالة بنجاح!
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={sending}
            >
              إلغاء
            </Button>
            <Button onClick={() => setConfirmSend(true)} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 ml-2" />
                  إرسال عبر واتساب
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Send */}
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إرسال حملة الاستعادة</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                سيتم إرسال رسالة واتساب بخصم {discountPercent}% لجميع العملاء
                المعرّضين للخسارة (لم يطلبوا منذ 90+ يوم).
              </span>
              <span className="block text-xs">
                لا يمكن التراجع بعد الإرسال.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateCampaign}
              disabled={sending}
            >
              {sending ? "جاري الإرسال..." : "تأكيد الإرسال"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
