"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseZap,
  RefreshCw,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { portalApi } from "@/lib/client";

type CommandCenterOverview = {
  planner?: {
    totalRuns24h?: number;
    failedRuns24h?: number;
    skippedRuns24h?: number;
  };
  approvals?: { pending?: number };
  connectors?: { runtimePending?: number; dlqOpen?: number };
  delivery?: { recentEvents24h?: number };
  policy?: { simulations7d?: number };
};

type CommandCenterFeedItem = {
  id: string;
  category?: string;
  severity?: "low" | "medium" | "high" | string;
  title?: string;
  message?: string;
  referenceId?: string;
  createdAt?: string;
};

type CommandCenterFeed = {
  items?: CommandCenterFeedItem[];
  limit?: number;
};

function formatDate(value?: string) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  return date.toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function severityVariant(severity?: string) {
  if (severity === "high") return "destructive";
  if (severity === "medium") return "secondary";
  return "outline";
}

export default function CommandCenterPage() {
  const [overview, setOverview] = useState<CommandCenterOverview | null>(null);
  const [feed, setFeed] = useState<CommandCenterFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCommandCenter = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewResponse, feedResponse] = await Promise.all([
        portalApi.getControlPlaneCommandCenterOverview(),
        portalApi.getControlPlaneCommandCenterFeed(25),
      ]);
      setOverview((overviewResponse || {}) as CommandCenterOverview);
      setFeed(
        Array.isArray((feedResponse as CommandCenterFeed)?.items)
          ? ((feedResponse as CommandCenterFeed)
              .items as CommandCenterFeedItem[])
          : [],
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذر تحميل بيانات غرفة القيادة.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommandCenter();
  }, [fetchCommandCenter]);

  const overviewItems = overview
    ? [
        {
          label: "تشغيلات المخطط خلال 24 ساعة",
          value: overview.planner?.totalRuns24h ?? 0,
          icon: Workflow,
        },
        {
          label: "تشغيلات فاشلة خلال 24 ساعة",
          value: overview.planner?.failedRuns24h ?? 0,
          icon: AlertTriangle,
        },
        {
          label: "موافقات Copilot المعلقة",
          value: overview.approvals?.pending ?? 0,
          icon: ShieldCheck,
        },
        {
          label: "أحداث موصلات معلقة",
          value: overview.connectors?.runtimePending ?? 0,
          icon: DatabaseZap,
        },
        {
          label: "عناصر DLQ مفتوحة",
          value: overview.connectors?.dlqOpen ?? 0,
          icon: AlertTriangle,
        },
        {
          label: "أحداث توصيل خلال 24 ساعة",
          value: overview.delivery?.recentEvents24h ?? 0,
          icon: CheckCircle2,
        },
      ]
    : [];
  const failedRuns = overview?.planner?.failedRuns24h ?? 0;
  const pendingApprovals = overview?.approvals?.pending ?? 0;
  const openDlq = overview?.connectors?.dlqOpen ?? 0;

  return (
    <div className="space-y-4 animate-fadeIn pb-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground sm:text-xl">
            غرفة القيادة
          </h1>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              تشغيلات المخطط{" "}
              <strong className="text-foreground">
                {overview?.planner?.totalRuns24h ?? 0}
              </strong>
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs",
                failedRuns > 0
                  ? "border-red-200/60 bg-red-50/60 text-red-700"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              تشغيلات فاشلة <strong>{failedRuns}</strong>
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs",
                pendingApprovals > 0
                  ? "border-amber-200/60 bg-amber-50/60 text-amber-700"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              موافقات معلقة <strong>{pendingApprovals}</strong>
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs",
                openDlq > 0
                  ? "border-red-200/60 bg-red-50/60 text-red-700"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              DLQ مفتوحة <strong>{openDlq}</strong>
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchCommandCenter}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw className="me-2 h-4 w-4" />
          تحديث
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="bg-muted/30">
                <CardContent className="p-4">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="mt-3 h-7 w-16 rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : overviewItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="">
                  <CardContent className="flex items-start justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <div className="text-sm text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {item.value}
                      </div>
                    </div>
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-border/80 bg-muted/60 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <Card className="bg-muted/30">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                سجل غرفة القيادة
              </CardTitle>
              <CardDescription>
                يعرض فقط أحداث المخطط والموافقات والموصلات والتوصيل التي أرجعها
                الخادم.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit">
              {feed.length} سجل
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 rounded-[18px] bg-muted" />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className="flex items-center gap-2 rounded-[18px] border border-dashed p-4 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              لا توجد أحداث تحكم أو تخطيط مسجلة حتى الآن.
            </div>
          ) : (
            <div className="space-y-3">
              {feed.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[18px] border border-border/80 bg-background/70 p-4 text-sm"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-medium">
                        {item.title || item.category || "حدث مسجل"}
                      </div>
                      {item.message && (
                        <div className="mt-1 text-muted-foreground">
                          {item.message}
                        </div>
                      )}
                    </div>
                    <Badge variant={severityVariant(item.severity) as any}>
                      {item.severity || "recorded"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(item.createdAt)}</span>
                    {item.referenceId && <span>{item.referenceId}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
