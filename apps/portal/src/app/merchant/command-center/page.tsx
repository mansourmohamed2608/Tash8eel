"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import {
  AlertOctagon,
  AlertTriangle,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";

type FeedSeverity = "high" | "medium" | "low";

interface FeedItem {
  id: string;
  category: string;
  severity: FeedSeverity;
  title: string;
  message: string;
  referenceId: string;
  createdAt: string;
}

interface PlannerRun {
  id: string;
  trigger_type: string;
  trigger_key: string;
  run_status: "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
  reason: string | null;
  started_at: string;
}

interface CommandCenterOverview {
  planner: {
    totalRuns24h: number;
    failedRuns24h: number;
    skippedRuns24h: number;
  };
  approvals: {
    pending: number;
  };
  connectors: {
    runtimePending: number;
    dlqOpen: number;
  };
  delivery: {
    recentEvents24h: number;
  };
  policy: {
    simulations7d: number;
  };
}

interface RuntimeHealth {
  pendingQueue: number;
  retryQueue: number;
  dlqOpen: number;
  processingLagSeconds: number;
  oldestPendingAt: string | null;
}

function timeAgo(value?: string | null) {
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

const severityBadgeClass: Record<FeedSeverity, string> = {
  high: "border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.12)] text-red-700",
  medium:
    "border-[color:rgba(245,158,11,0.35)] bg-[color:rgba(245,158,11,0.12)] text-amber-700",
  low: "border-[color:rgba(59,130,246,0.32)] bg-[color:rgba(59,130,246,0.12)] text-blue-700",
};

const runStatusBadgeClass: Record<PlannerRun["run_status"], string> = {
  STARTED:
    "border-[color:rgba(59,130,246,0.32)] bg-[color:rgba(59,130,246,0.12)] text-blue-700",
  COMPLETED:
    "border-[color:rgba(34,197,94,0.32)] bg-[color:rgba(34,197,94,0.12)] text-emerald-700",
  FAILED:
    "border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.12)] text-red-700",
  SKIPPED:
    "border-[color:rgba(245,158,11,0.35)] bg-[color:rgba(245,158,11,0.12)] text-amber-700",
};

export default function MerchantCommandCenterPage() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<CommandCenterOverview | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(
    null,
  );
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [runs, setRuns] = useState<PlannerRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replayingRunId, setReplayingRunId] = useState<string | null>(null);
  const [retryingDlq, setRetryingDlq] = useState(false);

  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED"
  >("ALL");
  const [triggerTypeFilter, setTriggerTypeFilter] = useState<
    "ALL" | "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION"
  >("ALL");
  const [triggerKeyDraft, setTriggerKeyDraft] = useState("");
  const [triggerKeyFilter, setTriggerKeyFilter] = useState("");

  const loadCommandCenter = useCallback(async () => {
    const hasInitialData = Boolean(overview || runtimeHealth || runs.length);
    if (hasInitialData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [overviewResp, feedResp, runsResp, runtimeResp] = await Promise.all(
        [
          portalApi.getControlPlaneCommandCenterOverview(),
          portalApi.getControlPlaneCommandCenterFeed(25),
          portalApi.getControlPlanePlannerRuns({
            limit: 20,
            offset: 0,
            status: statusFilter === "ALL" ? undefined : statusFilter,
            triggerType:
              triggerTypeFilter === "ALL" ? undefined : triggerTypeFilter,
            triggerKey: triggerKeyFilter || undefined,
          }),
          portalApi.getErpRuntimeHealth(),
        ],
      );

      setOverview(overviewResp);
      setFeed((feedResp?.items || []) as FeedItem[]);
      setRuns((runsResp?.runs || []) as PlannerRun[]);
      setRuntimeHealth(runtimeResp as RuntimeHealth);
    } catch {
      toast({
        title: "تعذر تحميل غرفة القيادة",
        description: "حاول مرة أخرى بعد لحظات.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    overview,
    runtimeHealth,
    runs.length,
    statusFilter,
    triggerTypeFilter,
    triggerKeyFilter,
    toast,
  ]);

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  const handleReplay = async (runId: string) => {
    setReplayingRunId(runId);
    try {
      const replay = await portalApi.replayControlPlanePlannerRun(runId, {
        reason: "manual replay from merchant command center",
      });
      if (replay?.allowed === false) {
        toast({
          title: "تم منع إعادة التشغيل",
          description: replay?.gateReason || "تجاوز ميزانية المشغل.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "تم إنشاء إعادة التشغيل",
          description: "أضيفت إعادة تشغيل جديدة إلى سجل المشغل.",
        });
      }
      await loadCommandCenter();
    } catch {
      toast({
        title: "فشل إعادة التشغيل",
        description: "تعذر إعادة تشغيل هذا السجل حالياً.",
        variant: "destructive",
      });
    } finally {
      setReplayingRunId(null);
    }
  };

  const handleRetryOpenDlq = async () => {
    setRetryingDlq(true);
    try {
      const result = await portalApi.retryOpenErpRuntimeDlq({ limit: 25 });
      toast({
        title: "تم تشغيل إعادة DLQ",
        description: `تمت إعادة ${result?.retriedCount || 0} عنصر من DLQ.`,
      });
      await loadCommandCenter();
    } catch {
      toast({
        title: "فشل إعادة DLQ",
        description: "تعذر إعادة عناصر DLQ المفتوحة.",
        variant: "destructive",
      });
    } finally {
      setRetryingDlq(false);
    }
  };

  const summaryPills = useMemo(
    () => [
      {
        label: "فشل المشغل 24س",
        value: overview?.planner.failedRuns24h ?? 0,
        icon: AlertTriangle,
      },
      {
        label: "تشغيلات متخطاة 24س",
        value: overview?.planner.skippedRuns24h ?? 0,
        icon: Clock3,
      },
      {
        label: "موافقات معلقة",
        value: overview?.approvals.pending ?? 0,
        icon: ShieldCheck,
      },
      {
        label: "DLQ مفتوح",
        value: runtimeHealth?.dlqOpen ?? overview?.connectors.dlqOpen ?? 0,
        icon: AlertOctagon,
      },
      {
        label: "صف انتظار قيد المعالجة",
        value:
          runtimeHealth?.pendingQueue ??
          overview?.connectors.runtimePending ??
          0,
        icon: Zap,
      },
      {
        label: "محاكاة سياسات 7 أيام",
        value: overview?.policy.simulations7d ?? 0,
        icon: RefreshCw,
      },
    ],
    [overview, runtimeHealth],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <PageHeader
        title="غرفة القيادة"
        description="تشغيل مباشر للذكاء التشغيلي: فشل المشغل، موافقات قيد الانتظار، وصحة الموصلات."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void loadCommandCenter()} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="ml-2 h-4 w-4" />
          )}
          تحديث مباشر
        </Button>
        <Button
          variant="outline"
          onClick={handleRetryOpenDlq}
          disabled={retryingDlq}
        >
          {retryingDlq ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="ml-2 h-4 w-4" />
          )}
          إعادة DLQ المفتوح
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryPills.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-[var(--border-default)]">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold">{item.value}</p>
                </div>
                <span className="rounded-lg bg-[var(--bg-surface-2)] p-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2 border-[var(--border-default)]">
          <CardHeader>
            <CardTitle>خلاصة التنبيهات</CardTitle>
            <CardDescription>
              آخر العناصر من مشغل الذكاء والموصلات.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">
                جاري التحميل...
              </div>
            ) : feed.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                لا توجد تنبيهات حالياً.
              </div>
            ) : (
              feed.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        severityBadgeClass[item.severity],
                      )}
                    >
                      {item.severity === "high"
                        ? "حرج"
                        : item.severity === "medium"
                          ? "متوسط"
                          : "منخفض"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.message}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3 border-[var(--border-default)]">
          <CardHeader>
            <CardTitle>سجل المشغل</CardTitle>
            <CardDescription>
              تشغيلات planner مع إمكانية إعادة المحاولة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as any)}
              >
                <option value="ALL">كل الحالات</option>
                <option value="FAILED">FAILED</option>
                <option value="SKIPPED">SKIPPED</option>
                <option value="STARTED">STARTED</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>

              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={triggerTypeFilter}
                onChange={(event) =>
                  setTriggerTypeFilter(event.target.value as any)
                }
              >
                <option value="ALL">كل أنواع المشغلات</option>
                <option value="ON_DEMAND">ON_DEMAND</option>
                <option value="EVENT">EVENT</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="ESCALATION">ESCALATION</option>
              </select>

              <Input
                placeholder="فلتر trigger key"
                value={triggerKeyDraft}
                onChange={(event) => setTriggerKeyDraft(event.target.value)}
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setTriggerKeyFilter(triggerKeyDraft.trim())}
                >
                  تطبيق
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setTriggerKeyDraft("");
                    setTriggerKeyFilter("");
                  }}
                >
                  مسح
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  جاري تحميل السجل...
                </div>
              ) : runs.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  لا توجد تشغيلات مطابقة للفلاتر.
                </div>
              ) : (
                runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            runStatusBadgeClass[run.run_status],
                          )}
                        >
                          {run.run_status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {run.trigger_type}
                        </span>
                        <span className="text-xs text-muted-foreground">/</span>
                        <span className="text-xs font-mono">
                          {run.trigger_key}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {run.reason || "بدون سبب مسجل"} •{" "}
                        {timeAgo(run.started_at)}
                      </p>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleReplay(run.id)}
                      disabled={
                        replayingRunId === run.id ||
                        !["FAILED", "SKIPPED"].includes(run.run_status)
                      }
                    >
                      {replayingRunId === run.id ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="ml-2 h-4 w-4" />
                      )}
                      إعادة تشغيل
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
