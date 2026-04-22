"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Zap,
  Package,
  TrendingUp,
  Clock,
  Eye,
  Bell,
  ShieldCheck,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import { portalApi } from "@/lib/client";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────────── */
interface AgentAction {
  id: string;
  agent_type: string;
  action_type: string;
  severity: "INFO" | "WARNING" | "ACTION" | "CRITICAL";
  title: string;
  description: string;
  metadata: Record<string, any> | null;
  auto_resolved: boolean;
  merchant_ack: boolean;
  created_at: string;
}

interface Summary {
  last_24h: number;
  auto_resolved_24h: number;
  unack_critical: number;
  unack_warning: number;
  actions_taken_24h: number;
}

/* ─── Constants ──────────────────────────────────────────── */
const AGENT_META: Record<
  string,
  { icon: React.ElementType; label: string; color: string }
> = {
  OPS: { icon: Zap, label: "وكيل العمليات", color: "bg-blue-500" },
  INVENTORY: { icon: Package, label: "وكيل المخزون", color: "bg-amber-500" },
  FINANCE: { icon: TrendingUp, label: "وكيل المالية", color: "bg-emerald-500" },
  OPS_AGENT: { icon: Zap, label: "وكيل العمليات", color: "bg-blue-500" },
  INVENTORY_AGENT: {
    icon: Package,
    label: "وكيل المخزون",
    color: "bg-amber-500",
  },
  FINANCE_AGENT: {
    icon: TrendingUp,
    label: "وكيل المالية",
    color: "bg-emerald-500",
  },
  SUPPORT_AGENT: { icon: Bell, label: "وكيل الدعم", color: "bg-violet-500" },
  MARKETING_AGENT: { icon: Bell, label: "وكيل التسويق", color: "bg-pink-500" },
};

const SEVERITY_META: Record<
  string,
  {
    icon: React.ElementType;
    color: string;
    badgeVariant: string;
    label: string;
  }
> = {
  CRITICAL: {
    icon: AlertOctagon,
    color: "text-red-600",
    badgeVariant: "bg-red-100 text-red-700 border-red-200",
    label: "حرج",
  },
  ACTION: {
    icon: ShieldCheck,
    color: "text-orange-600",
    badgeVariant: "bg-orange-100 text-orange-700 border-orange-200",
    label: "إجراء تم",
  },
  WARNING: {
    icon: AlertTriangle,
    color: "text-yellow-600",
    badgeVariant: "bg-yellow-100 text-yellow-700 border-yellow-200",
    label: "تنبيه",
  },
  INFO: {
    icon: Info,
    color: "text-blue-600",
    badgeVariant: "bg-blue-100 text-blue-700 border-blue-200",
    label: "معلومة",
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    if (
      value.every((item) =>
        ["string", "number", "boolean"].includes(typeof item),
      )
    ) {
      return value.slice(0, 4).join("، ");
    }
    return `${value.length} عنصر`;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const label = obj.name || obj.title || obj.id;
    if (label) return String(label);
    return `${Object.keys(obj).length} حقول`;
  }
  if (value === null || value === undefined) return "-";
  return String(value);
}

function metadataLabel(key: string): string {
  const map: Record<string, string> = {
    orderNumbers: "أرقام الطلبات",
    totalAmount: "المبلغ الإجمالي",
    driverName: "اسم السائق",
    driverId: "السائق",
    conversationIds: "المحادثات",
    orderNumber: "رقم الطلب",
    currentStock: "المخزون الحالي",
    reorderQty: "كمية إعادة الطلب",
    previousMargin: "هامش سابق",
    currentMargin: "الهامش الحالي",
    rate: "النسبة",
    refunded: "المرتجع",
    total: "الإجمالي",
    items: "العناصر",
  };
  return map[key] || key;
}

/* ─── Page Component ─────────────────────────────────────── */
export default function AgentActivityPage() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  // Compute a 24-hour activity heatmap from the loaded actions
  const heatmap = (() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    actions.forEach((a) => {
      const h = new Date(a.created_at).getHours();
      hours[h].count += 1;
    });
    const max = Math.max(...hours.map((h) => h.count), 1);
    return hours.map((h) => ({
      ...h,
      intensity: Math.round((h.count / max) * 4),
    }));
  })();

  const fetchData = useCallback(async () => {
    try {
      const params: any = { limit: 100 };
      if (filter !== "ALL") params.agent = filter;
      const res = await portalApi.getAgentActivity(params);
      setActions(res.actions || []);
      setSummary(res.summary || null);
    } catch {
      // silently fail - page still renders with empty state
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAcknowledge = async (id: string) => {
    setAcknowledging(id);
    try {
      await portalApi.acknowledgeAgentAction(id);
      setActions((prev) =>
        prev.map((a) => (a.id === id ? { ...a, merchant_ack: true } : a)),
      );
    } catch {
      // silently fail
    } finally {
      setAcknowledging(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6" dir="rtl">
        <PageHeader
          title="سجل نشاط الوكلاء"
          description="ما قامت به الوكلاء تلقائياً"
        />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const filtered = actions;
  const activeAgentsCount = new Set(actions.map((a) => a.agent_type)).size;
  const unresolvedCount = actions.filter((a) => !a.merchant_ack).length;
  const autoResolvedCount = actions.filter((a) => a.auto_resolved).length;
  const latestAction = actions[0];

  return (
    <div className="space-y-8 p-4 sm:p-6" dir="rtl">
      {/* Back link */}
      <Link
        href="/merchant/agents"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> العودة للوكلاء
      </Link>

      <PageHeader
        title="سجل نشاط الوكلاء"
        description="عرض تشغيلي مباشر لكل ما التقطه النظام أو نفذه الوكلاء من تنبيهات وإجراءات."
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">
              Agent Operations Feed
            </span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                راقب ما اكتشفه الوكلاء، ما تم حله تلقائياً، وما يزال يحتاج تدخل
                بشري.
              </h2>
              <p className="app-hero-band__copy">
                هذا السجل يركز على النشاط التنفيذي نفسه: تنبيهات، محاولات إصلاح،
                عناصر حرجة، وإشارات تحتاج اطلاعك. إذا كنت تريد منطق القرار نفسه
                فانتقل إلى سجل قرارات الذكاء.
              </p>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">السجل الحالي</span>
              <strong className="app-hero-band__metric-value">
                {actions.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">غير مطلع عليه</span>
              <strong className="app-hero-band__metric-value">
                {unresolvedCount}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                تم حلها تلقائياً
              </span>
              <strong className="app-hero-band__metric-value">
                {autoResolvedCount}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">آخر حركة</span>
              <strong className="app-hero-band__metric-value">
                {latestAction ? timeAgo(latestAction.created_at) : "لا يوجد"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="app-data-card border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-strong))] bg-[var(--accent-muted)]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">إجمالي السجل الحالي</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">
              {actions.length}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              هذا feed النشاط التشغيلي للوكلاء، وليس سجل قراراتهم.
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card border-[color:color-mix(in_srgb,var(--warning)_18%,var(--border-strong))] bg-[var(--warning-muted)]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">غير مُطّلع عليه</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              {unresolvedCount}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              عناصر ما زالت تحتاج اطلاع أو متابعة من التاجر.
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card border-[color:color-mix(in_srgb,var(--success)_18%,var(--border-strong))] bg-[var(--success-muted)]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">تم حلها تلقائياً</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">
              {autoResolvedCount}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              تنبيهات أو إجراءات أنجزها النظام بدون تدخل يدوي.
            </p>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">وكلاء ظهر نشاطهم</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">
              {activeAgentsCount}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {latestAction
                ? `آخر نشاط: ${timeAgo(latestAction.created_at)}`
                : "لا يوجد نشاط مسجل بعد."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Summary Cards ──────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="app-data-card">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold">{summary.last_24h || 0}</div>
              <div className="text-xs text-muted-foreground">
                نشاط آخر 24 ساعة
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-green-600">
                {summary.auto_resolved_24h || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                تم حلها تلقائياً
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-orange-600">
                {summary.actions_taken_24h || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                إجراءات اتخذها
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-red-600">
                {summary.unack_critical || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                حرج - يحتاج انتباهك
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {summary.unack_warning || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                تنبيهات لم تُقرأ
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Activity Heatmap ───────────────────────── */}
      {actions.length > 0 && (
        <Card className="app-data-card">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              نشاط الوكلاء حسب الساعة
            </p>
            <div className="flex items-end gap-1 flex-wrap" dir="ltr">
              {heatmap.map(({ hour, count, intensity }) => {
                const colors = [
                  "bg-muted",
                  "bg-blue-200",
                  "bg-blue-400",
                  "bg-blue-600",
                  "bg-blue-800",
                ];
                return (
                  <div
                    key={hour}
                    className="flex flex-col items-center gap-0.5 group relative"
                  >
                    <div
                      className={`w-6 rounded-sm transition-all ${colors[intensity]} cursor-default`}
                      style={{ height: `${8 + intensity * 8}px` }}
                      title={`${hour}:00 - ${count} نشاط`}
                    />
                    {hour % 6 === 0 && (
                      <span className="text-[9px] text-muted-foreground">
                        {hour}:00
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="app-data-card app-data-card--muted border-dashed">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">
              ما الفرق بين هذه الصفحة وسجل القرارات؟
            </p>
            <p className="text-sm text-muted-foreground">
              هنا ترى ما فعله الوكلاء أو اكتشفوه عملياً. أما سجل قرارات الذكاء
              فيعرض منطق القرار نفسه ودرجة الثقة.
            </p>
          </div>
          <Link
            href="/merchant/audit/ai-decisions"
            className="text-sm text-primary hover:underline"
          >
            افتح سجل قرارات الذكاء
          </Link>
        </CardContent>
      </Card>

      {/* ─── Filter Tabs ────────────────────────────── */}
      <Tabs defaultValue="ALL" onValueChange={setFilter}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
          <TabsTrigger value="ALL" className="w-full">
            الكل
          </TabsTrigger>
          <TabsTrigger value="OPS" className="w-full">
            العمليات
          </TabsTrigger>
          <TabsTrigger value="INVENTORY" className="w-full">
            المخزون
          </TabsTrigger>
          <TabsTrigger value="FINANCE" className="w-full">
            المالية
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ─── Refresh Button ─────────────────────────── */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
        >
          <RefreshCw className="h-4 w-4 ml-1" /> تحديث
        </Button>
      </div>

      {/* ─── Actions Feed ───────────────────────────── */}
      {filtered.length === 0 ? (
        <Card className="app-data-card">
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">لا يوجد نشاط بعد</p>
            <p className="text-sm text-muted-foreground mt-1">
              الوكلاء تعمل كل ساعة - سيظهر النشاط هنا تلقائياً
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((action) => {
            const agentMeta = AGENT_META[action.agent_type] || AGENT_META.OPS;
            const sevMeta =
              SEVERITY_META[action.severity] || SEVERITY_META.INFO;
            const AgentIcon = agentMeta.icon;
            const SevIcon = sevMeta.icon;

            return (
              <Card
                key={action.id}
                className={`app-data-card transition-all ${!action.merchant_ack && action.severity === "CRITICAL" ? "border-[color:color-mix(in_srgb,var(--danger)_22%,var(--border-strong))] bg-[color:color-mix(in_srgb,var(--danger-muted)_72%,transparent)]" : ""} ${!action.merchant_ack && action.severity === "WARNING" ? "border-[color:color-mix(in_srgb,var(--warning)_22%,var(--border-strong))] bg-[color:color-mix(in_srgb,var(--warning-muted)_72%,transparent)]" : ""}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    {/* Agent icon */}
                    <div
                      className={`mt-0.5 p-2 rounded-lg ${agentMeta.color} text-white flex-shrink-0`}
                    >
                      <AgentIcon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">
                          {action.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${sevMeta.badgeVariant}`}
                        >
                          <SevIcon className="h-3 w-3 ml-0.5" />
                          {sevMeta.label}
                        </Badge>
                        {action.auto_resolved && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200"
                          >
                            <CheckCircle2 className="h-3 w-3 ml-0.5" />
                            تم الحل تلقائياً
                          </Badge>
                        )}
                        {action.merchant_ack && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 border-gray-200"
                          >
                            <Eye className="h-3 w-3 ml-0.5" />
                            تم الإطلاع
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {action.description}
                      </p>

                      {/* Metadata chips */}
                      {action.metadata &&
                        Object.keys(action.metadata).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(action.metadata)
                              .slice(0, 4)
                              .map(([k, v]) => (
                                <span
                                  key={k}
                                  className="text-[10px] bg-muted px-2 py-0.5 rounded-full"
                                >
                                  {metadataLabel(k)}: {formatMetadataValue(v)}
                                </span>
                              ))}
                          </div>
                        )}
                    </div>

                    {/* Right side - time + ack */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(action.created_at)}
                      </span>
                      {!action.merchant_ack && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={acknowledging === action.id}
                          onClick={() => handleAcknowledge(action.id)}
                        >
                          {acknowledging === action.id ? "..." : "✓ تم"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
