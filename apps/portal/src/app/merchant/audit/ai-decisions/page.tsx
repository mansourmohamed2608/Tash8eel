"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { Activity, Shield, Eye, RefreshCw } from "lucide-react";

const parseJsonMaybe = (value: unknown): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const decisionActorLabels: Record<string, string> = {
  OPS_AGENT: "العمليات",
  INVENTORY_AGENT: "المخزون",
  FINANCE_AGENT: "المالية",
  MARKETING_AGENT: "النمو",
  SUPPORT_AGENT: "الدعم",
};

const decisionTypeLabels: Record<string, string> = {
  APPROVAL: "موافقة",
  RECOMMENDATION: "توصية",
  AUTOMATION: "أتمتة",
  ANOMALY: "انحراف",
  FORECAST: "توقع",
};

function formatDecisionActor(value?: string) {
  if (!value) return "غير محدد";
  return decisionActorLabels[value] || value.replaceAll("_", " ");
}

function formatDecisionType(value?: string) {
  if (!value) return "قرار";
  return decisionTypeLabels[value] || value.replaceAll("_", " ");
}

export default function AiAuditPage() {
  const { merchantId, apiKey, isDemo } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [agentFilter, setAgentFilter] = useState("ALL");

  const fetchData = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    try {
      const filters: any = { limit: 100 };
      if (agentFilter !== "ALL") filters.agentType = agentFilter;
      const result = await merchantApi.getAiDecisionLog(
        merchantId,
        apiKey,
        filters,
      );
      setData(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, agentFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading)
    return (
      <div>
        <PageHeader title="مركز القيادة / سجل القرارات" />
        <DashboardSkeleton />
      </div>
    );

  const decisions = data?.decisions || [];
  const stats = data?.weeklyStats || [];
  const confidenceValues = decisions
    .map((d: any) => Number(d.confidence))
    .filter((n: number) => Number.isFinite(n));
  const avgConfidence = confidenceValues.length
    ? Math.round(
        (confidenceValues.reduce((sum: number, n: number) => sum + n, 0) /
          confidenceValues.length) *
          100,
      )
    : 0;
  const agentsInLog = new Set(decisions.map((d: any) => d.agent_type)).size;
  const decisionTypes = new Set(decisions.map((d: any) => d.decision_type))
    .size;

  return (
    <div className="space-y-8 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="مركز القيادة / سجل القرارات"
        description="مراجعة لماذا اتُخذ القرار، سياقه، وثقة النظام قبل التنفيذ."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">جميع المجالات</SelectItem>
                <SelectItem value="OPS_AGENT">العمليات</SelectItem>
                <SelectItem value="INVENTORY_AGENT">المخزون</SelectItem>
                <SelectItem value="FINANCE_AGENT">المالية</SelectItem>
                <SelectItem value="MARKETING_AGENT">التسويق</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={fetchData}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="ml-2 h-4 w-4" /> تحديث
            </Button>
          </div>
        }
      />

      <Card className="app-data-card app-data-card--muted border-dashed">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">سجل القرارات تابع لمركز القيادة</p>
            <p className="text-sm text-muted-foreground">
              استخدمه للتدقيق في السبب والثقة، بينما تبقى الحالة العامة
              والموافقات وسجل التشغيل في مركز القيادة.
            </p>
          </div>
          <a
            href="/merchant/command-center"
            className="text-sm text-primary hover:underline"
          >
            العودة لمركز القيادة
          </a>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <span className="text-muted-foreground">القرارات المعروضة</span>
          <span className="font-mono text-[var(--color-brand-primary)]">
            {decisions.length}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <span className="text-muted-foreground">أنواع القرارات</span>
          <span className="font-mono text-[var(--accent-blue)]">
            {decisionTypes}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <span className="text-muted-foreground">متوسط الثقة</span>
          <span className="font-mono text-[var(--accent-success)]">
            {avgConfidence}%
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <span className="text-muted-foreground">المجالات المشاركة</span>
          <span className="font-mono text-foreground">{agentsInLog}</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="app-data-card">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              إجمالي القرارات المعروضة
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-brand-primary)]">
              {decisions.length}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              هذا السجل يركز على لماذا اتُخذ القرار، لا على feed النشاط
              التشغيلي.
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-strong))] bg-[var(--accent-muted)]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">أنواع القرارات</p>
            <p className="mt-1 text-2xl font-bold text-[var(--accent-blue)]">
              {decisionTypes}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              عدد الأنماط المختلفة للقرارات داخل السجل الحالي.
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card border-[color:color-mix(in_srgb,var(--success)_18%,var(--border-strong))] bg-[var(--success-muted)]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">متوسط الثقة</p>
            <p className="mt-1 text-2xl font-bold text-[var(--accent-success)]">
              {avgConfidence}%
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              متوسط confidence للقرارات المعروضة حالياً بعد الفلترة.
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card border-[color:color-mix(in_srgb,var(--warning)_18%,var(--border-strong))] bg-[var(--warning-muted)]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">المجالات المشاركة</p>
            <p className="mt-1 text-2xl font-bold text-[var(--accent-warning)]">
              {agentsInLog}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              عدد المجالات التي ظهرت لها قرارات في النتائج الحالية.
            </p>
          </CardContent>
        </Card>
      </div>

      <KPIGrid>
        <StatCard
          title="قرارات هذا الأسبوع"
          value={stats
            .reduce((s: number, st: any) => s + parseInt(st.count), 0)
            .toString()}
          icon={
            <Shield className="h-5 w-5 text-[var(--color-brand-primary)]" />
          }
        />
        <StatCard
          title="أنواع القرارات"
          value={new Set(
            stats.map((s: any) => s.decision_type),
          ).size.toString()}
          icon={<Activity className="h-5 w-5 text-[var(--accent-blue)]" />}
        />
        <StatCard
          title="مجالات نشطة"
          value={new Set(stats.map((s: any) => s.agent_type)).size.toString()}
          icon={<Shield className="h-5 w-5 text-[var(--accent-success)]" />}
        />
      </KPIGrid>

      <Card
        className={
          isDemo
            ? "app-data-card border-[color:color-mix(in_srgb,var(--warning)_18%,var(--border-strong))] bg-[var(--warning-muted)]"
            : "app-data-card border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-strong))] bg-[var(--accent-muted)]"
        }
      >
        <CardContent className="pt-4 text-sm leading-6">
          {isDemo ? (
            <p>
              أنت في وضع تجريبي. قد تظهر قرارات تجريبية وليست من نشاط متجرك
              الحقيقي.
            </p>
          ) : (
            <p>
              هذه الصفحة تعرض سجل قرارات النظام الفعلي كما وصل من طبقة التشغيل.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="app-data-card app-data-card--muted border-dashed">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">ما الذي تراه هنا بالضبط؟</p>
            <p className="text-sm text-muted-foreground">
              كل صف هنا يمثل قراراً محدداً: المدخلات، القرار النهائي، سبب
              القرار، ودرجة الثقة. إذا أردت ما حدث فعلياً على مدار اليوم فاذهب
              إلى سجل النشاط.
            </p>
          </div>
          <a
            href="/merchant/agent-activity"
            className="text-sm text-primary hover:underline"
          >
            افتح سجل النشاط
          </a>
        </CardContent>
      </Card>

      {/* Weekly stats */}
      {stats.length > 0 && (
        <Card className="app-data-card">
          <CardHeader>
            <CardTitle>إحصائيات الأسبوع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.map((s: any, i: number) => (
                <Badge key={i} variant="outline" className="px-3 py-1">
                  {formatDecisionActor(s.agent_type)} /{" "}
                  {formatDecisionType(s.decision_type)}: {s.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Decision log */}
      <Card className="app-data-card">
        <CardHeader>
          <CardTitle>سجل القرارات</CardTitle>
          <CardDescription>{decisions.length} قرار</CardDescription>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              لا توجد قرارات مسجلة بعد
            </p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {decisions.map((d: any) => (
                <div
                  key={d.id}
                  className="space-y-2 rounded-[22px] border border-[color:color-mix(in_srgb,var(--border-strong)_84%,transparent)] p-4 transition-colors hover:bg-[color:color-mix(in_srgb,var(--surface-muted)_56%,transparent)]"
                >
                  {(() => {
                    const metadata = parseJsonMaybe(d.metadata);
                    const source = metadata?.source || metadata?.origin || null;
                    return (
                      <>
                        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {formatDecisionActor(d.agent_type)}
                            </Badge>
                            <Badge>{formatDecisionType(d.decision_type)}</Badge>
                            {d.confidence && (
                              <Badge
                                variant={
                                  d.confidence > 0.8
                                    ? "default"
                                    : d.confidence > 0.5
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                ثقة: {Math.round(d.confidence * 100)}%
                              </Badge>
                            )}
                            {source && (
                              <Badge variant="secondary">
                                المصدر: {String(source)}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(d.created_at).toLocaleString("ar-EG")}
                          </span>
                        </div>
                        {d.input_summary && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">
                              المدخلات:
                            </span>{" "}
                            {d.input_summary}
                          </p>
                        )}
                        {d.decision && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">
                              القرار:
                            </span>{" "}
                            {d.decision}
                          </p>
                        )}
                        {d.reasoning && (
                          <p className="text-sm text-muted-foreground mb-1">
                            <Eye className="h-3 w-3 inline ml-1" />{" "}
                            {d.reasoning}
                          </p>
                        )}
                        {d.entity_type && (
                          <div className="text-xs text-muted-foreground">
                            {d.entity_type}: {d.entity_id}
                          </div>
                        )}
                        {metadata && (
                          <pre className="text-[11px] bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(metadata, null, 2)}
                          </pre>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
