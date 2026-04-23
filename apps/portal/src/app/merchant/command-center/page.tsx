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
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
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
    <div className="app-page-frame space-y-6 animate-fadeIn pb-8">
      <PageHeader
        title="غرفة القيادة"
        description="عرض حقيقي لأحداث التحكم والتخطيط المسجلة في النظام، مع تلخيص سريع للحالات التي تحتاج متابعة."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCommandCenter}
            disabled={loading}
          >
            <RefreshCw className="me-2 h-4 w-4" />
            تحديث
          </Button>
        }
      />

      <section className="app-hero-band app-hero-band--subtle">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">Control Plane</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                متابعة واحدة للمخطط، الموافقات، الموصلات، وأحداث التوصيل.
              </h2>
              <p className="app-hero-band__copy">
                هذه الصفحة لا تعرض بيانات تجريبية. كل مؤشر وسجل هنا يأتي من
                واجهات غرفة القيادة الحالية في الخادم، لتبقى شاشة المراقبة
                مرتبطة بالحقيقة التشغيلية.
              </p>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                تشغيلات المخطط
              </span>
              <strong className="app-hero-band__metric-value">
                {overview?.planner?.totalRuns24h ?? 0}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">تشغيلات فاشلة</span>
              <strong className="app-hero-band__metric-value">
                {failedRuns}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">موافقات معلقة</span>
              <strong className="app-hero-band__metric-value">
                {pendingApprovals}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">DLQ مفتوحة</span>
              <strong className="app-hero-band__metric-value">{openDlq}</strong>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <Card className="app-data-card border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="app-data-card app-data-card--muted">
                <CardContent className="p-4">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="mt-3 h-7 w-16 rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : overviewItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="app-data-card">
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

      <Card className="app-data-card app-data-card--muted">
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
