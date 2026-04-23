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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Sparkles,
} from "lucide-react";
import { authenticatedFetch } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import portalApi from "@/lib/client";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";

interface CampaignResult {
  sent: number;
  totalTargeted: number;
  message: string;
}

export default function WinbackCampaignsPage() {
  const { apiKey, merchantId } = useMerchant();
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
  const [message, setMessage] = useLocalStorageState(
    merchantId ? `campaigns:winback-message:${merchantId}` : null,
    "وحشتنا! 🎁 عرض خاص لك - خصم {discount}% على طلبك القادم. العرض ساري لمدة {days} أيام فقط!",
  );

  // Seasonal campaign state
  const [showSeasonal, setShowSeasonal] = useState(false);
  const [seasonalMsg, setSeasonalMsg] = useLocalStorageState(
    merchantId ? `campaigns:seasonal-message:${merchantId}` : null,
    "مرحباً {name}! 🎉 بمناسبة العيد، استمتع بعروضنا الحصرية. تسوق الآن وادخل كود الخصم: {code}",
  );
  const [seasonalSegment, setSeasonalSegment] = useState<
    "all" | "vip" | "loyal" | "regular" | "new" | "at_risk"
  >("all");
  const [seasonalOccasion, setSeasonalOccasion] = useState("");
  const [seasonalCode, setSeasonalCode] = useState("");
  const [sendingSeasonal, setSendingSeasonal] = useState(false);
  const [seasonalResult, setSeasonalResult] = useState<CampaignResult | null>(
    null,
  );
  const [seasonalError, setSeasonalError] = useState<string | null>(null);
  const [generatingSeasonalMsg, setGeneratingSeasonalMsg] = useState(false);

  // Re-engagement campaign state
  const [showReengagement, setShowReengagement] = useState(false);
  const [reengageMsg, setReengageMsg] = useLocalStorageState(
    merchantId ? `campaigns:reengagement-message:${merchantId}` : null,
    "مرحبًا {name}! غبت عنا {days} يوم - يسعدنا رجوعك. خصم خاص ينتظرك باستخدام كود: {code}",
  );
  const [reengageInactiveDays, setReengageInactiveDays] = useState(30);
  const [reengageCode, setReengageCode] = useState("");
  const [sendingReengagement, setSendingReengagement] = useState(false);
  const [reengagementResult, setReengagementResult] =
    useState<CampaignResult | null>(null);
  const [reengagementError, setReengagementError] = useState<string | null>(
    null,
  );
  const [generatingReengageMsg, setGeneratingReengageMsg] = useState(false);

  // AI audience suggestion state
  const [aiAudienceGoal, setAiAudienceGoal] = useState("");
  const [aiAudienceLoading, setAiAudienceLoading] = useState(false);
  const [aiAudienceResult, setAiAudienceResult] = useState<{
    recommendedSegmentId: string | null;
    segmentName: string;
    reason: string;
    estimatedSize: number;
    segments: Array<{
      id: string;
      name: string;
      size: number;
      match_score: number;
    }>;
  } | null>(null);

  const handleAiAudienceSuggest = useCallback(async () => {
    if (!aiAudienceGoal.trim()) return;
    setAiAudienceLoading(true);
    setAiAudienceResult(null);
    try {
      const res = await portalApi.suggestCampaignAudience(aiAudienceGoal);
      setAiAudienceResult(res as any);
    } catch {
      /* ignore */
    } finally {
      setAiAudienceLoading(false);
    }
  }, [aiAudienceGoal]);

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

  const handleSeasonalCampaign = useCallback(async () => {
    setSendingSeasonal(true);
    setSeasonalError(null);
    setSeasonalResult(null);
    try {
      const data = await portalApi.createSeasonalCampaign({
        message: seasonalMsg,
        segment: seasonalSegment,
        occasion: seasonalOccasion || undefined,
        discountCode: seasonalCode || undefined,
      });
      setSeasonalResult({
        sent: data.sent || 0,
        totalTargeted: data.totalTargeted || 0,
        message: data.message || "تم إرسال الحملة بنجاح",
      });
      setShowSeasonal(false);
    } catch (err: any) {
      setSeasonalError(err?.message || "فشل إرسال الحملة الموسمية");
    } finally {
      setSendingSeasonal(false);
    }
  }, [seasonalMsg, seasonalSegment, seasonalOccasion, seasonalCode]);

  const handleReengagementCampaign = useCallback(async () => {
    setSendingReengagement(true);
    setReengagementError(null);
    setReengagementResult(null);
    try {
      const data = await portalApi.createReengagementCampaign({
        message: reengageMsg,
        inactiveDays: reengageInactiveDays,
        discountCode: reengageCode || undefined,
      });
      setReengagementResult({
        sent: data.sent || 0,
        totalTargeted: data.totalTargeted || 0,
        message: data.message || "تم إرسال الحملة بنجاح",
      });
      setShowReengagement(false);
    } catch (err: any) {
      setReengagementError(err?.message || "فشل إرسال حملة إعادة التفاعل");
    } finally {
      setSendingReengagement(false);
    }
  }, [reengageMsg, reengageInactiveDays, reengageCode]);

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
      id: "seasonal",
      title: "حملة موسمية",
      titleEn: "Seasonal Campaign",
      description:
        "إرسال رسائل ترويجية موسمية لشريحة مختارة من العملاء (عيد، تخفيضات، مناسبات)",
      icon: Sparkles,
      color: "text-green-500",
      bgColor: "bg-green-50 dark:bg-green-950",
      available: true,
      channel: "واتساب",
    },
    {
      id: "reengagement",
      title: "إعادة التفاعل",
      titleEn: "Re-engagement",
      description:
        "إرسال رسائل تذكيرية مع كود خصم للعملاء الذين توقفوا عن الطلب",
      icon: Zap,
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-950",
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
    <div className="app-page-frame space-y-6 p-4 pb-8 sm:p-6">
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
            className="w-full sm:w-auto"
          >
            <Send className="h-4 w-4 ml-2" />
            إنشاء حملة جديدة
          </Button>
        }
      />

      {/* WhatsApp Status */}
      {!waReady && (
        <Card className="app-data-card border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-900/20">
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
        <Card className="app-data-card border-green-200 dark:border-green-800">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="app-data-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">عملاء مستهدفون</p>
                <p className="text-2xl font-bold">-</p>
                <p className="text-xs text-muted-foreground">
                  أنشئ حملة لمعرفة العدد
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
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
        <Card className="app-data-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">معدل الاستجابة</p>
                <p className="text-2xl font-bold">-</p>
                <p className="text-xs text-muted-foreground">
                  ستظهر بعد الإرسال
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
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

      {/* AI Audience Picker */}
      <Card className="app-data-card app-data-card--muted border-purple-100/70 bg-gradient-to-br from-purple-50/80 to-white dark:from-purple-950/20 dark:to-background">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            اقتراح الجمهور بالذكاء الاصطناعي
          </CardTitle>
          <CardDescription>
            اكتب هدف حملتك بالعربي وسيقترح الذكاء الاصطناعي أفضل شريحة عملاء
            لاستهدافها
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="مثال: استرجاع العملاء الخاملين بخصم..."
              value={aiAudienceGoal}
              onChange={(e) => setAiAudienceGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAiAudienceSuggest()}
              dir="rtl"
            />
            <Button
              onClick={handleAiAudienceSuggest}
              disabled={aiAudienceLoading || !aiAudienceGoal.trim()}
              className="w-full shrink-0 sm:w-auto"
            >
              {aiAudienceLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              اقتراح
            </Button>
          </div>
          {aiAudienceResult && (
            <div className="rounded-lg border bg-background p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">
                    الشريحة المقترحة:{" "}
                    <span className="text-purple-600">
                      {aiAudienceResult.segmentName}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {aiAudienceResult.reason}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {aiAudienceResult.estimatedSize.toLocaleString("ar-EG")} عميل
                </Badge>
              </div>
              {aiAudienceResult.segments.length > 1 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    شرائح أخرى مناسبة:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiAudienceResult.segments.slice(1, 4).map((s) => (
                      <Badge key={s.id} variant="secondary" className="text-xs">
                        {s.name} ({s.size})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Types */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaignTypes.map((type) => (
          <Card
            key={type.id}
            className={`relative ${!type.available ? "opacity-60" : "cursor-pointer hover:shadow-md transition-shadow"}`}
            onClick={
              type.available
                ? () => {
                    if (type.id === "winback") {
                      setShowCreate(true);
                      setResult(null);
                      setError(null);
                    } else if (type.id === "seasonal") {
                      setShowSeasonal(true);
                      setSeasonalResult(null);
                      setSeasonalError(null);
                    } else if (type.id === "reengagement") {
                      setShowReengagement(true);
                      setReengagementResult(null);
                      setReengagementError(null);
                    }
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
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md"
          dir="rtl"
        >
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

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={sending}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={() => setConfirmSend(true)}
              disabled={sending}
              className="w-full sm:w-auto"
            >
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
        <AlertDialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
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
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel disabled={sending} className="w-full sm:w-auto">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateCampaign}
              disabled={sending}
              className="w-full sm:w-auto"
            >
              {sending ? "جاري الإرسال..." : "تأكيد الإرسال"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Seasonal Campaign Dialog */}
      <Dialog open={showSeasonal} onOpenChange={setShowSeasonal}>
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-green-500" />
              حملة موسمية
            </DialogTitle>
            <DialogDescription>
              إرسال رسالة ترويجية لشريحة مختارة من عملائك
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Segment */}
            <div className="space-y-2">
              <Label>الشريحة المستهدفة</Label>
              <Select
                value={seasonalSegment}
                onValueChange={(v) => setSeasonalSegment(v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع العملاء</SelectItem>
                  <SelectItem value="vip">VIP فقط</SelectItem>
                  <SelectItem value="loyal">العملاء المخلصون</SelectItem>
                  <SelectItem value="regular">العملاء العاديون</SelectItem>
                  <SelectItem value="new">العملاء الجدد</SelectItem>
                  <SelectItem value="at_risk">
                    العملاء المعرّضون للخسارة
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Occasion */}
            <div className="space-y-2">
              <Label>المناسبة (اختياري)</Label>
              <Input
                placeholder="مثال: عيد الفطر، تخفيضات الصيف..."
                value={seasonalOccasion}
                onChange={(e) => setSeasonalOccasion(e.target.value)}
              />
            </div>

            {/* Discount code */}
            <div className="space-y-2">
              <Label>كود الخصم (اختياري)</Label>
              <Input
                placeholder="مثال: EID20"
                value={seasonalCode}
                onChange={(e) => setSeasonalCode(e.target.value.toUpperCase())}
                dir="ltr"
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                نص الرسالة
              </Label>
              <div className="mb-1 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generatingSeasonalMsg}
                  onClick={async () => {
                    setGeneratingSeasonalMsg(true);
                    try {
                      const r = await portalApi.chatWithAssistant(
                        `أنت كاتب تسويقي محترف. اكتب رسالة واتساب قصيرة (3-4 أسطر) لحملة موسمية.
المناسبة: ${seasonalOccasion || "عروض حصرية"}
كود الخصم: ${seasonalCode || "لا يوجد"}
الشريحة: ${seasonalSegment}
استخدم {name} لاسم العميل و{code} لكود الخصم إذا توفر.
اكتب بالعربية المصرية العامية. مختصرة وجذابة.
أرجع نص الرسالة فقط.`,
                      );
                      if (r.reply) setSeasonalMsg(r.reply);
                    } catch {}
                    setGeneratingSeasonalMsg(false);
                  }}
                  className="w-full text-purple-700 border-purple-300 hover:bg-purple-50 sm:w-auto"
                >
                  {generatingSeasonalMsg ? (
                    <Loader2 className="h-3 w-3 animate-spin ml-1" />
                  ) : (
                    <Zap className="h-3 w-3 ml-1" />
                  )}
                  اقتراح بالذكاء الاصطناعي
                </Button>
              </div>
              <Textarea
                value={seasonalMsg}
                onChange={(e) => setSeasonalMsg(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                استخدم {"{name}"} لاسم العميل و{"{code}"} لكود الخصم
              </p>
            </div>

            {seasonalError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 p-3 rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {seasonalError}
              </div>
            )}
            {seasonalResult && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                تم إرسال {seasonalResult.sent} رسالة من{" "}
                {seasonalResult.totalTargeted} عميل
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowSeasonal(false)}
              disabled={sendingSeasonal}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSeasonalCampaign}
              disabled={sendingSeasonal || !seasonalMsg.trim()}
              className="w-full sm:w-auto"
            >
              {sendingSeasonal ? (
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

      {/* Re-engagement Campaign Dialog */}
      <Dialog open={showReengagement} onOpenChange={setShowReengagement}>
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              حملة إعادة التفاعل
            </DialogTitle>
            <DialogDescription>
              إرسال رسالة تذكيرية مع كود خصم للعملاء الذين توقفوا عن الطلب
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Inactive days */}
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>الحد الأدنى لأيام الغياب</span>
                <Badge variant="secondary">{reengageInactiveDays} يوم</Badge>
              </Label>
              <Slider
                value={[reengageInactiveDays]}
                onValueChange={([v]) => setReengageInactiveDays(v)}
                min={7}
                max={180}
                step={7}
              />
              <p className="text-xs text-muted-foreground">
                سيتم استهداف عملاء لم يطلبوا منذ {reengageInactiveDays}+ يوم
              </p>
            </div>

            {/* Discount code */}
            <div className="space-y-2">
              <Label>كود الخصم (اختياري)</Label>
              <Input
                placeholder="مثال: BACK15"
                value={reengageCode}
                onChange={(e) => setReengageCode(e.target.value.toUpperCase())}
                dir="ltr"
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
                  disabled={generatingReengageMsg}
                  onClick={async () => {
                    setGeneratingReengageMsg(true);
                    try {
                      const r = await portalApi.chatWithAssistant(
                        `أنت كاتب تسويقي محترف. اكتب رسالة واتساب قصيرة (3-4 أسطر) لإعادة استرجاع عميل بعيد.
أيام الغياب: ${reengageInactiveDays} يوم على الأقل
كود الخصم: ${reengageCode || "لا يوجد"}
استخدم {name} لاسم العميل و{days} لعدد الأيام و{code} لكود الخصم إذا توفر.
اكتب بالعربية المصرية العامية. مختصرة وجذابة.
أرجع نص الرسالة فقط.`,
                      );
                      if (r.reply) setReengageMsg(r.reply);
                    } catch {}
                    setGeneratingReengageMsg(false);
                  }}
                  className="text-purple-700 border-purple-300 hover:bg-purple-50"
                >
                  {generatingReengageMsg ? (
                    <Loader2 className="h-3 w-3 animate-spin ml-1" />
                  ) : (
                    <Zap className="h-3 w-3 ml-1" />
                  )}
                  اقتراح بالذكاء الاصطناعي
                </Button>
              </div>
              <Textarea
                value={reengageMsg}
                onChange={(e) => setReengageMsg(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                استخدم {"{name}"} لاسم العميل، {"{days}"} لعدد أيام الغياب،{" "}
                {"{code}"} لكود الخصم
              </p>
            </div>

            {reengagementError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 p-3 rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {reengagementError}
              </div>
            )}
            {reengagementResult && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                تم إرسال {reengagementResult.sent} رسالة من{" "}
                {reengagementResult.totalTargeted} عميل
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowReengagement(false)}
              disabled={sendingReengagement}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleReengagementCampaign}
              disabled={sendingReengagement || !reengageMsg.trim()}
              className="w-full sm:w-auto"
            >
              {sendingReengagement ? (
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
    </div>
  );
}
