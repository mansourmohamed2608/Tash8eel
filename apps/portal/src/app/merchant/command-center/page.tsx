"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
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
        },
        {
          label: "تشغيلات فاشلة خلال 24 ساعة",
          value: overview.planner?.failedRuns24h ?? 0,
        },
        {
          label: "موافقات Copilot المعلقة",
          value: overview.approvals?.pending ?? 0,
        },
        {
          label: "أحداث موصلات معلقة",
          value: overview.connectors?.runtimePending ?? 0,
        },
        {
          label: "عناصر DLQ مفتوحة",
          value: overview.connectors?.dlqOpen ?? 0,
        },
        {
          label: "أحداث توصيل خلال 24 ساعة",
          value: overview.delivery?.recentEvents24h ?? 0,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="غرفة القيادة"
        description="عرض حقيقي لأحداث التحكم والتخطيط المسجلة في النظام"
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

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="mt-3 h-7 w-16 rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : overviewItems.map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {item.value}
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل غرفة القيادة</CardTitle>
          <CardDescription>
            يعرض فقط أحداث المخطط والموافقات والموصلات والتوصيل التي أرجعها
            الخادم.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-14 rounded bg-muted" />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              لا توجد أحداث تحكم أو تخطيط مسجلة حتى الآن.
            </div>
          ) : (
            <div className="space-y-3">
              {feed.map((item) => (
                <div key={item.id} className="rounded-md border p-4 text-sm">
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
