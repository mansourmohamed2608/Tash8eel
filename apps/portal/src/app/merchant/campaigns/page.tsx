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
  PhoneCall,
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
import portalApi, { authenticatedFetch, merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";

interface CampaignResult {
  sent: number;
  totalTargeted: number;
  message: string;
}

interface CampaignPerformanceSummary {
  generatedAt: string;
  windowDays: number;
  campaignType: "ALL" | "WIN_BACK" | "SEASONAL" | "REENGAGEMENT";
  totals: {
    campaigns: number;
    targeted: number;
    sent: number;
    failed: number;
    successRatePct: number;
    avgAudienceSize: number;
  };
  byType: Array<{
    type: string;
    campaigns: number;
    targeted: number;
    sent: number;
    failed: number;
    successRatePct: number;
  }>;
  recentCampaigns: Array<{
    id: string;
    createdAt: string;
    type: string;
    label: string;
    targeted: number;
    sent: number;
    failed: number;
    successRatePct: number;
    metadata?: {
      code?: string | null;
      recipientFilter?: string | null;
      inactiveDays?: number | null;
      discountPercent?: number | null;
      validDays?: number | null;
    };
  }>;
}

type CallbackBridgeStatus =
  | "DRAFT"
  | "APPROVED"
  | "EXECUTING"
  | "EXECUTED"
  | "CANCELLED";

interface CallbackBridgeDraft {
  id: string;
  status: CallbackBridgeStatus;
  createdAt?: string;
  approvedAt?: string | null;
  executedAt?: string | null;
  targetCount: number;
  sentCount?: number;
  failedCount?: number;
  messageTemplate: string;
  discountCode?: string | null;
  inactiveDays: number;
  callbackDueBefore?: string | null;
}

interface CallbackBridgeRecipient {
  callId: string;
  workflowEventId?: string | null;
  customerPhone: string;
  customerName?: string | null;
  callbackDueAt?: string | null;
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

  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceSummary, setPerformanceSummary] =
    useState<CampaignPerformanceSummary | null>(null);
  const [opsRefreshNonce, setOpsRefreshNonce] = useState(0);
  const [callbackActionability, setCallbackActionability] = useState<{
    callbackRequested: number;
    callbackDueSoon: number;
    openHighPriority: number;
  }>({
    callbackRequested: 0,
    callbackDueSoon: 0,
    openHighPriority: 0,
  });
  const [callbackBridgeActorId, setCallbackBridgeActorId] =
    useState("ops-supervisor");
  const [callbackBridgeApprovalNote, setCallbackBridgeApprovalNote] =
    useState("");
  const [callbackBridgeDraft, setCallbackBridgeDraft] =
    useState<CallbackBridgeDraft | null>(null);
  const [callbackBridgeRecipients, setCallbackBridgeRecipients] = useState<
    CallbackBridgeRecipient[]
  >([]);
  const [callbackBridgeOpen, setCallbackBridgeOpen] = useState(false);
  const [callbackBridgeBusy, setCallbackBridgeBusy] = useState(false);
  const [callbackBridgeError, setCallbackBridgeError] = useState<string | null>(
    null,
  );
  const [callbackBridgeInfo, setCallbackBridgeInfo] = useState<string | null>(
    null,
  );
  const [callbackBridgeExecutionErrors, setCallbackBridgeExecutionErrors] =
    useState<Array<{ phone: string; error: string }>>([]);

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

  useEffect(() => {
    if (!apiKey) {
      setPerformanceSummary(null);
      setPerformanceError(null);
      setCallbackActionability({
        callbackRequested: 0,
        callbackDueSoon: 0,
        openHighPriority: 0,
      });
      return;
    }

    let cancelled = false;
    const loadCampaignOps = async () => {
      setPerformanceLoading(true);
      setPerformanceError(null);
      try {
        const [summaryRaw, followUpRaw] = await Promise.all([
          portalApi.getCampaignPerformanceSummary({
            days: 30,
            campaignType: "ALL",
            limit: 8,
          }),
          merchantApi.getCallFollowUpQueue(merchantId, apiKey, {
            limit: 200,
            offset: 0,
            hours: 168,
            includeResolved: true,
            handledBy: "all",
          }),
        ]);

        if (cancelled) return;

        const summary = summaryRaw as CampaignPerformanceSummary;
        setPerformanceSummary(summary);

        const queueRows = Array.isArray(followUpRaw?.queue)
          ? followUpRaw.queue
          : [];
        const now = Date.now();
        const callbackDueSoonCutoff = now + 24 * 60 * 60 * 1000;

        const callbackRequested = queueRows.filter(
          (row: any) =>
            String((row as any)?.disposition || "")
              .trim()
              .toUpperCase() === "CALLBACK_REQUESTED",
        ).length;

        const callbackDueSoon = queueRows.filter((row: any) => {
          const disposition = String((row as any)?.disposition || "")
            .trim()
            .toUpperCase();
          if (disposition !== "CALLBACK_REQUESTED") return false;

          const rawDueAt = String((row as any)?.callbackDueAt || "").trim();
          if (!rawDueAt) return false;

          const epoch = new Date(rawDueAt).getTime();
          if (!Number.isFinite(epoch)) return false;

          return epoch <= callbackDueSoonCutoff;
        }).length;

        const openHighPriority = queueRows.filter((row: any) => {
          const workflowState = String((row as any)?.workflowState || "OPEN")
            .trim()
            .toUpperCase();
          const priority = String((row as any)?.priority || "")
            .trim()
            .toLowerCase();
          return workflowState !== "RESOLVED" && priority === "high";
        }).length;

        setCallbackActionability({
          callbackRequested,
          callbackDueSoon,
          openHighPriority,
        });
      } catch (error) {
        if (cancelled) return;
        setPerformanceSummary(null);
        setPerformanceError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل مؤشرات تشغيل الحملات",
        );
        setCallbackActionability({
          callbackRequested: 0,
          callbackDueSoon: 0,
          openHighPriority: 0,
        });
      } finally {
        if (!cancelled) {
          setPerformanceLoading(false);
        }
      }
    };

    void loadCampaignOps();

    return () => {
      cancelled = true;
    };
  }, [apiKey, merchantId, opsRefreshNonce]);

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

  const handleCreateCallbackBridgeDraft = useCallback(async () => {
    const actorId = callbackBridgeActorId.trim();
    if (!actorId) {
      setCallbackBridgeError("أدخل معرف المشغل أولاً");
      return;
    }

    setCallbackBridgeBusy(true);
    setCallbackBridgeError(null);
    setCallbackBridgeInfo(null);
    setCallbackBridgeExecutionErrors([]);

    try {
      const data = await portalApi.createCallbackCampaignBridgeDraft({
        actorId,
        dueWithinHours: 24,
        maxRecipients: 200,
        inactiveDays: reengageInactiveDays,
        messageTemplate: reengageMsg,
        discountCode: reengageCode || undefined,
      });

      if (!data.created || !data.bridge) {
        setCallbackBridgeDraft(null);
        setCallbackBridgeRecipients([]);
        setCallbackBridgeInfo(data.reason || "لا توجد حالات مؤهلة حاليًا");
        setCallbackBridgeOpen(true);
        return;
      }

      setCallbackBridgeDraft({
        id: data.bridge.id,
        status: data.bridge.status,
        createdAt: data.bridge.createdAt,
        targetCount: data.bridge.targetCount,
        messageTemplate: data.bridge.messageTemplate,
        discountCode: data.bridge.discountCode,
        inactiveDays: data.bridge.inactiveDays,
        callbackDueBefore: data.bridge.callbackDueBefore,
      });
      setCallbackBridgeRecipients(data.recipients || []);
      setCallbackBridgeInfo(
        `تم تجهيز مسودة تضم ${data.bridge.targetCount} عميل. يلزم اعتماد صريح قبل التنفيذ.`,
      );
      setCallbackBridgeOpen(true);
    } catch (err: any) {
      setCallbackBridgeError(err?.message || "تعذر إنشاء مسودة جسر المعاودة");
      setCallbackBridgeOpen(true);
    } finally {
      setCallbackBridgeBusy(false);
    }
  }, [callbackBridgeActorId, reengageCode, reengageInactiveDays, reengageMsg]);

  const handleApproveCallbackBridgeDraft = useCallback(async () => {
    const actorId = callbackBridgeActorId.trim();
    if (!actorId || !callbackBridgeDraft?.id) {
      setCallbackBridgeError("تعذر اعتماد المسودة: بيانات غير مكتملة");
      return;
    }

    setCallbackBridgeBusy(true);
    setCallbackBridgeError(null);
    setCallbackBridgeInfo(null);
    try {
      const data = await portalApi.approveCallbackCampaignBridgeDraft(
        callbackBridgeDraft.id,
        {
          actorId,
          note: callbackBridgeApprovalNote || undefined,
        },
      );

      setCallbackBridgeDraft((prev) =>
        prev
          ? {
              ...prev,
              status: data.bridge.status,
              approvedAt: data.bridge.approvedAt,
            }
          : prev,
      );
      setCallbackBridgeInfo("تم اعتماد المسودة ويمكن التنفيذ الآن.");
    } catch (err: any) {
      setCallbackBridgeError(err?.message || "فشل اعتماد المسودة");
    } finally {
      setCallbackBridgeBusy(false);
    }
  }, [
    callbackBridgeActorId,
    callbackBridgeApprovalNote,
    callbackBridgeDraft?.id,
  ]);

  const handleExecuteCallbackBridgeDraft = useCallback(async () => {
    const actorId = callbackBridgeActorId.trim();
    if (!actorId || !callbackBridgeDraft?.id) {
      setCallbackBridgeError("تعذر تنفيذ المسودة: بيانات غير مكتملة");
      return;
    }

    setCallbackBridgeBusy(true);
    setCallbackBridgeError(null);
    setCallbackBridgeInfo(null);
    setCallbackBridgeExecutionErrors([]);
    try {
      const data = await portalApi.executeCallbackCampaignBridgeDraft(
        callbackBridgeDraft.id,
        {
          actorId,
        },
      );

      setCallbackBridgeDraft((prev) =>
        prev
          ? {
              ...prev,
              status: data.bridge.status,
              executedAt: data.bridge.executedAt,
              targetCount: data.bridge.targetCount,
              sentCount: data.bridge.sentCount,
              failedCount: data.bridge.failedCount,
            }
          : prev,
      );
      setCallbackBridgeExecutionErrors(data.sampleErrors || []);
      setCallbackBridgeInfo(
        `تم التنفيذ: ${data.bridge.sentCount} نجحت و${data.bridge.failedCount} فشلت.`,
      );
      setOpsRefreshNonce((value) => value + 1);
    } catch (err: any) {
      setCallbackBridgeError(err?.message || "فشل تنفيذ المسودة");
    } finally {
      setCallbackBridgeBusy(false);
    }
  }, [callbackBridgeActorId, callbackBridgeDraft?.id]);

  const campaignTypes = [
    {
      id: "winback",
      title: "استعادة العملاء",
      titleEn: "Win-back Campaign",
      description:
        "إرسال عروض خاصة عبر واتساب للعملاء الذين لم يطلبوا منذ فترة",
      icon: UserMinus,
      color: "text-[var(--accent-warning)]",
      bgColor: "bg-[var(--accent-warning)]/12",
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
      color: "text-[var(--accent-success)]",
      bgColor: "bg-[var(--accent-success)]/12",
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
      color: "text-[var(--accent-blue)]",
      bgColor: "bg-[var(--accent-blue)]/12",
      available: true,
      channel: "واتساب",
    },
    {
      id: "loyalty",
      title: "مكافأة الولاء",
      titleEn: "Loyalty Reward",
      description: "إرسال خصومات حصرية لأفضل العملاء كمكافأة على ولائهم",
      icon: Gift,
      color: "text-[var(--accent-gold)]",
      bgColor: "bg-[var(--accent-gold-dim)]",
      available: false,
      channel: "واتساب",
    },
    {
      id: "instagram",
      title: "حملة إنستغرام",
      titleEn: "Instagram Campaign",
      description: "إرسال رسائل ترويجية عبر Instagram Direct لمتابعيك",
      icon: MessageSquare,
      color: "text-[var(--accent-gold)]",
      bgColor: "bg-[var(--accent-gold)]/12",
      available: false,
      channel: "إنستغرام",
    },
    {
      id: "facebook",
      title: "حملة فيسبوك",
      titleEn: "Facebook Campaign",
      description: "إرسال رسائل ترويجية عبر Messenger لمتابعي صفحتك",
      icon: Share2,
      color: "text-[var(--accent-blue)]",
      bgColor: "bg-[var(--accent-blue)]/12",
      available: false,
      channel: "فيسبوك",
    },
    {
      id: "tiktok",
      title: "حملة تيك توك",
      titleEn: "TikTok Campaign",
      description: "إرسال عروض ترويجية عبر رسائل تيك توك لمتابعيك",
      icon: Video,
      color: "text-[var(--text-secondary)]",
      bgColor: "bg-[var(--bg-surface-2)]",
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
      bgColor: "bg-sky-50",
      available: false,
      channel: "تيليغرام",
    },
  ];

  const campaignTotals = performanceSummary?.totals || null;
  const recentCampaignRows =
    performanceSummary?.recentCampaigns.slice(0, 4) || [];
  const byTypeRows = performanceSummary?.byType.slice(0, 3) || [];

  return (
    <div className="space-y-6 p-4 sm:p-6">
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

      <div className="flex flex-wrap gap-2">
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Send className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          <span className="text-muted-foreground">الحملات النشطة</span>
          <span className="font-mono text-[var(--accent-gold)]">
            {result ? 1 : 0}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-success)]" />
          <span className="text-muted-foreground">واتساب</span>
          <span className="font-mono text-[var(--accent-success)]">
            {waReady ? "جاهز" : "غير مفعّل"}
          </span>
        </div>
      </div>

      {/* WhatsApp Status */}
      {!waReady && (
        <Card className="app-data-card border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/12">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-[var(--accent-warning)]" />
            <p className="text-sm text-[var(--accent-warning)]">
              يجب تفعيل واتساب أولاً لإرسال الحملات. أضف رقم واتساب الأعمال في
              الإعدادات ← الإشعارات.
            </p>
          </CardContent>
        </Card>
      )}
      {waReady && waNumber && (
        <Card className="app-data-card border-[var(--accent-success)]/20">
          <CardContent className="p-4 flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-[var(--accent-success)]" />
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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-[var(--accent-blue)]" />
              <div>
                <p className="text-sm text-muted-foreground">عملاء مستهدفون</p>
                <p className="text-2xl font-bold">
                  {campaignTotals
                    ? campaignTotals.targeted.toLocaleString("ar-EG")
                    : "٠"}
                </p>
                <p className="text-xs text-muted-foreground">
                  آخر {performanceSummary?.windowDays || 30} يوم
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-[var(--accent-success)]" />
              <div>
                <p className="text-sm text-muted-foreground">رسائل مرسلة</p>
                <p className="text-2xl font-bold">
                  {campaignTotals
                    ? campaignTotals.sent.toLocaleString("ar-EG")
                    : result?.sent?.toLocaleString("ar-EG") || "٠"}
                </p>
                <p className="text-xs text-muted-foreground">
                  فشل التسليم: {campaignTotals ? campaignTotals.failed : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-[var(--accent-gold)]" />
              <div>
                <p className="text-sm text-muted-foreground">معدل الاستجابة</p>
                <p className="text-2xl font-bold">
                  {campaignTotals
                    ? `${campaignTotals.successRatePct.toLocaleString("ar-EG")}%`
                    : "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  متوسط الجمهور:{" "}
                  {campaignTotals ? campaignTotals.avgAudienceSize : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <PhoneCall className="h-8 w-8 text-[var(--accent-warning)]" />
              <div>
                <p className="text-sm text-muted-foreground">فرص المعاودة</p>
                <p className="text-2xl font-bold">
                  {callbackActionability.callbackRequested.toLocaleString(
                    "ar-EG",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  خلال 24 ساعة: {callbackActionability.callbackDueSoon} • عالية
                  الأولوية: {callbackActionability.openHighPriority}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {performanceError ? (
        <Card className="app-data-card border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/12">
          <CardContent className="p-4 text-sm text-[var(--accent-warning)]">
            {performanceError}
          </CardContent>
        </Card>
      ) : null}

      <Card className="app-data-card border-[var(--accent-blue)]/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--accent-blue)]" />
            نضج تشغيل الحملات
          </CardTitle>
          <CardDescription>
            قياس التنفيذ الفعلي للحملات مع ربط فرص المعاودة القادمة من العمليات.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {performanceLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحميل مؤشرات تشغيل الحملات...
            </div>
          ) : performanceSummary ? (
            <>
              <div className="flex flex-wrap gap-2">
                {byTypeRows.length > 0 ? (
                  byTypeRows.map((row) => (
                    <Badge key={row.type} variant="outline" className="text-xs">
                      {row.type}: {row.successRatePct}% ({row.campaigns})
                    </Badge>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    لا توجد بيانات أنواع حملات كافية حتى الآن.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {recentCampaignRows.length > 0 ? (
                  recentCampaignRows.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="rounded-md border border-[var(--border-default)] p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{campaign.label}</p>
                        <Badge variant="secondary">{campaign.type}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        مستهدف {campaign.targeted} • مرسل {campaign.sent} • نجاح{" "}
                        {campaign.successRatePct}%
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    لم يتم تسجيل حملات حديثة خلال النافذة المحددة.
                  </p>
                )}
              </div>

              {callbackActionability.callbackRequested > 0 ? (
                <div className="space-y-3 rounded-md border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 p-3">
                  <p className="text-xs text-[var(--accent-blue)]">
                    يوجد {callbackActionability.callbackRequested} عميل بطلب
                    معاودة اتصال. يمكن تحويل الحالات المؤهلة إلى مسودة حملة
                    إعادة تفاعل مع اعتماد صريح قبل التنفيذ.
                  </p>

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      value={callbackBridgeActorId}
                      onChange={(e) => setCallbackBridgeActorId(e.target.value)}
                      placeholder="معرف المشغل المسؤول"
                      dir="ltr"
                    />
                    <Button
                      onClick={handleCreateCallbackBridgeDraft}
                      disabled={
                        callbackBridgeBusy ||
                        !waReady ||
                        callbackActionability.callbackRequested <= 0
                      }
                      className="w-full sm:w-auto"
                    >
                      {callbackBridgeBusy ? (
                        <>
                          <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                          جاري إنشاء المسودة...
                        </>
                      ) : (
                        <>
                          <PhoneCall className="h-4 w-4 ml-2" />
                          إنشاء مسودة جسر المعاودة
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              لا توجد بيانات تشغيل حملات كافية حتى الآن.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={callbackBridgeOpen} onOpenChange={setCallbackBridgeOpen}>
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-[var(--accent-blue)]" />
              جسر المعاودة إلى حملة إعادة التفاعل
            </DialogTitle>
            <DialogDescription>
              تحويل الحالات المؤهلة إلى مسودة حملات مع اعتماد صريح قبل التنفيذ.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {callbackBridgeInfo ? (
              <div className="rounded-md border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 p-3 text-xs text-[var(--accent-blue)]">
                {callbackBridgeInfo}
              </div>
            ) : null}

            {callbackBridgeError ? (
              <div className="rounded-md border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/12 p-3 text-xs text-[var(--accent-danger)]">
                {callbackBridgeError}
              </div>
            ) : null}

            {callbackBridgeDraft ? (
              <div className="space-y-3">
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">حالة المسودة</p>
                    <p className="font-semibold">
                      {callbackBridgeDraft.status}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">العملاء المستهدفون</p>
                    <p className="font-semibold">
                      {callbackBridgeDraft.targetCount.toLocaleString("ar-EG")}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">كود الخصم</p>
                    <p className="font-semibold" dir="ltr">
                      {callbackBridgeDraft.discountCode || "-"}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">حد عدم النشاط</p>
                    <p className="font-semibold">
                      {callbackBridgeDraft.inactiveDays.toLocaleString("ar-EG")}{" "}
                      يوم
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>ملاحظة الاعتماد (اختياري)</Label>
                  <Textarea
                    value={callbackBridgeApprovalNote}
                    onChange={(e) =>
                      setCallbackBridgeApprovalNote(e.target.value)
                    }
                    rows={2}
                    placeholder="سبب أو ملاحظة تنفيذ الحملة"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium">
                    عينة المستلمين المرتبطين بالأحداث
                  </p>
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                    {callbackBridgeRecipients.length > 0 ? (
                      callbackBridgeRecipients.slice(0, 20).map((recipient) => (
                        <div
                          key={`${recipient.callId}:${recipient.customerPhone}`}
                          className="rounded-md border p-2 text-xs"
                        >
                          <p className="font-medium">
                            {recipient.customerName || "عميل"} •{" "}
                            {recipient.customerPhone}
                          </p>
                          <p className="text-muted-foreground" dir="ltr">
                            Call: {recipient.callId}
                          </p>
                          <p className="text-muted-foreground" dir="ltr">
                            Event: {recipient.workflowEventId || "-"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        لا توجد عناصر مستلمين في هذه المسودة.
                      </p>
                    )}
                  </div>
                </div>

                {callbackBridgeDraft.status === "EXECUTED" ? (
                  <div className="rounded-md border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 p-3 text-xs text-[var(--accent-success)]">
                    التنفيذ النهائي: نجحت {callbackBridgeDraft.sentCount || 0}{" "}
                    وفشلت {callbackBridgeDraft.failedCount || 0}
                  </div>
                ) : null}

                {callbackBridgeExecutionErrors.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 p-3 text-xs text-[var(--accent-warning)]">
                    <p className="font-medium">أخطاء تنفيذ (عينة):</p>
                    {callbackBridgeExecutionErrors.map((item, index) => (
                      <p key={`${item.phone}:${index}`} dir="ltr">
                        {item.phone}: {item.error}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setCallbackBridgeOpen(false)}
              disabled={callbackBridgeBusy}
              className="w-full sm:w-auto"
            >
              إغلاق
            </Button>
            {callbackBridgeDraft?.status === "DRAFT" ? (
              <Button
                onClick={handleApproveCallbackBridgeDraft}
                disabled={callbackBridgeBusy || !callbackBridgeActorId.trim()}
                className="w-full sm:w-auto"
              >
                {callbackBridgeBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الاعتماد...
                  </>
                ) : (
                  "اعتماد المسودة"
                )}
              </Button>
            ) : null}
            {callbackBridgeDraft?.status === "APPROVED" ? (
              <Button
                onClick={handleExecuteCallbackBridgeDraft}
                disabled={callbackBridgeBusy || !callbackBridgeActorId.trim()}
                className="w-full sm:w-auto"
              >
                {callbackBridgeBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري التنفيذ...
                  </>
                ) : (
                  "تنفيذ الحملة"
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Audience Picker */}
      <Card className="app-data-card border-[var(--accent-gold)]/20 bg-[var(--accent-gold-dim)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--accent-gold)]" />
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
                    <span className="text-[var(--accent-gold)]">
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
            className={`app-data-card relative ${!type.available ? "opacity-60" : "cursor-pointer transition-colors hover:border-[var(--border-active)]"}`}
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
        <Card className="app-data-card border-[var(--accent-success)]/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[var(--accent-success)]" />
              <div>
                <p className="font-medium text-[var(--accent-success)]">
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
              <UserMinus className="h-5 w-5 text-[var(--accent-warning)]" />
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
                  className="border-[var(--accent-gold)]/25 text-[var(--accent-gold)] hover:bg-[var(--accent-gold-dim)]"
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
              <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-danger)]/12 p-3 text-sm text-[var(--accent-danger)]">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {result && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-success)]/12 p-3 text-sm text-[var(--accent-success)]">
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
              <Sparkles className="h-5 w-5 text-[var(--accent-gold)]" />
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
                  className="w-full border-[var(--accent-gold)]/25 text-[var(--accent-gold)] hover:bg-[var(--accent-gold-dim)] sm:w-auto"
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
              <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-danger)]/12 p-3 text-sm text-[var(--accent-danger)]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {seasonalError}
              </div>
            )}
            {seasonalResult && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-success)]/12 p-3 text-sm text-[var(--accent-success)]">
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
              <Zap className="h-5 w-5 text-[var(--accent-blue)]" />
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
                  className="border-[var(--accent-gold)]/25 text-[var(--accent-gold)] hover:bg-[var(--accent-gold-dim)]"
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
              <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-danger)]/12 p-3 text-sm text-[var(--accent-danger)]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {reengagementError}
              </div>
            )}
            {reengagementResult && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--accent-success)]/12 p-3 text-sm text-[var(--accent-success)]">
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
