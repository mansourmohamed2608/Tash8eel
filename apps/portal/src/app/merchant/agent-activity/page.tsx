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
import { cn } from "@/lib/utils";

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
  OPS: {
    icon: Zap,
    label: "العمليات",
    color: "bg-[color:rgba(59,130,246,0.16)] text-[color:var(--accent-blue)]",
  },
  INVENTORY: {
    icon: Package,
    label: "المخزون",
    color:
      "bg-[color:rgba(245,158,11,0.14)] text-[color:var(--accent-warning)]",
  },
  FINANCE: {
    icon: TrendingUp,
    label: "المالية",
    color: "bg-[color:rgba(34,197,94,0.14)] text-[color:var(--accent-success)]",
  },
  OPS_AGENT: {
    icon: Zap,
    label: "العمليات",
    color: "bg-[color:rgba(59,130,246,0.16)] text-[color:var(--accent-blue)]",
  },
  INVENTORY_AGENT: {
    icon: Package,
    label: "المخزون",
    color:
      "bg-[color:rgba(245,158,11,0.14)] text-[color:var(--accent-warning)]",
  },
  FINANCE_AGENT: {
    icon: TrendingUp,
    label: "المالية",
    color: "bg-[color:rgba(34,197,94,0.14)] text-[color:var(--accent-success)]",
  },
  SUPPORT_AGENT: {
    icon: Bell,
    label: "الدعم",
    color: "bg-[color:rgba(45,107,228,0.10)] text-[color:var(--brand-blue)]",
  },
  MARKETING_AGENT: {
    icon: Bell,
    label: "النمو",
    color: "bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
  },
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
    color: "text-[color:var(--accent-danger)]",
    badgeVariant:
      "border-[color:rgba(239,68,68,0.28)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
    label: "حرج",
  },
  ACTION: {
    icon: ShieldCheck,
    color: "text-[color:var(--accent-warning)]",
    badgeVariant:
      "border-[color:rgba(245,158,11,0.26)] bg-[color:rgba(245,158,11,0.1)] text-[color:#fdba74]",
    label: "إجراء تم",
  },
  WARNING: {
    icon: AlertTriangle,
    color: "text-[color:var(--accent-warning)]",
    badgeVariant:
      "border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]",
    label: "تنبيه",
  },
  INFO: {
    icon: Info,
    color: "text-[color:var(--accent-blue)]",
    badgeVariant:
      "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
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
          title="مركز القيادة / سجل النشاط"
          description="ما التقطه النظام أو نفذه تلقائياً ضمن مسارات التشغيل."
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
        href="/merchant/command-center"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> العودة لمركز القيادة
      </Link>

      <PageHeader
        title="مركز القيادة / سجل النشاط"
        description="عرض تشغيلي مباشر لكل ما التقطه النظام أو نفذه من تنبيهات وإجراءات."
      />

      <div className="flex flex-wrap gap-2">
        {[
          ["إجمالي السجل", String(actions.length), "text-[var(--accent-blue)]"],
          [
            "غير مطلع عليه",
            String(unresolvedCount),
            "text-[var(--accent-warning)]",
          ],
          [
            "تم حلها تلقائياً",
            String(autoResolvedCount),
            "text-[var(--accent-success)]",
          ],
          [
            "مجالات نشطة",
            String(activeAgentsCount),
            "text-[var(--color-brand-primary)]",
          ],
          [
            "آخر حركة",
            latestAction ? timeAgo(latestAction.created_at) : "لا يوجد",
            "text-foreground",
          ],
        ].map(([label, value, color]) => (
          <div
            key={label}
            className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("font-mono", color)}>{value}</span>
          </div>
        ))}
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2">
          {[
            ["آخر 24 ساعة", String(summary.last_24h || 0), "text-foreground"],
            [
              "حل تلقائي",
              String(summary.auto_resolved_24h || 0),
              "text-[var(--accent-success)]",
            ],
            [
              "إجراءات منفذة",
              String(summary.actions_taken_24h || 0),
              "text-[var(--accent-warning)]",
            ],
            [
              "حرج غير مقروء",
              String(summary.unack_critical || 0),
              "text-[var(--accent-danger)]",
            ],
            [
              "تنبيهات غير مقروءة",
              String(summary.unack_warning || 0),
              "text-[var(--accent-warning)]",
            ],
          ].map(([label, value, color]) => (
            <div
              key={label}
              className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className={cn("font-mono", color)}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Activity Heatmap ───────────────────────── */}
      {actions.length > 0 && (
        <Card className="app-data-card">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              نشاط النظام حسب الساعة
            </p>
            <div className="flex items-end gap-1 flex-wrap" dir="ltr">
              {heatmap.map(({ hour, count, intensity }) => {
                const colors = [
                  "bg-[color:var(--bg-surface-3)]",
                  "bg-[color:rgba(59,130,246,0.24)]",
                  "bg-[color:rgba(59,130,246,0.42)]",
                  "bg-[color:rgba(59,130,246,0.68)]",
                  "bg-[color:var(--accent-blue)]",
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
              هنا ترى ما نفذه النظام أو اكتشفه عملياً. أما سجل القرارات فيعرض
              منطق القرار نفسه ودرجة الثقة.
            </p>
          </div>
          <Link
            href="/merchant/audit/ai-decisions"
            className="text-sm text-primary hover:underline"
          >
            افتح سجل القرارات
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
              النظام يراجع النشاط دورياً - ستظهر النتائج هنا تلقائياً
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
                      className={`mt-0.5 rounded-[var(--radius-sm)] p-2 ${agentMeta.color} flex-shrink-0`}
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
                            className="border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] px-1.5 py-0 text-[10px] text-[color:#86efac]"
                          >
                            <CheckCircle2 className="h-3 w-3 ml-0.5" />
                            تم الحل تلقائياً
                          </Badge>
                        )}
                        {action.merchant_ack && (
                          <Badge
                            variant="outline"
                            className="border-[color:var(--border-default)] bg-[color:var(--bg-surface-2)] px-1.5 py-0 text-[10px] text-[color:var(--text-secondary)]"
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
                                  className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
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
