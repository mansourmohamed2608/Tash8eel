"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { AreaChart, BarChart } from "@/components/charts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  PackageX,
  RefreshCw,
  CheckCircle,
  DollarSign,
  Users,
  Clock,
  Truck,
  Activity,
  BarChart3,
  Play,
  CheckSquare,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import portalApi from "@/lib/client";
import { useToast } from "@/hooks/use-toast";

const WHAT_IF_STORAGE_KEY = "forecast-what-if:last-success";

function getDefaultWhatIfParams(
  type: "demand" | "cashflow" | "campaign" | "pricing",
) {
  switch (type) {
    case "pricing":
      return { priceDeltaPct: 10 };
    case "demand":
      return { newLeadTimeDays: 5 };
    case "cashflow":
      return { extraRevenue: 0, extraExpense: 0 };
    case "campaign":
      return { discountPct: 15, campaignCost: 0 };
    default:
      return {};
  }
}

// ─── Urgency badge helper ─────────────────────────────────────────────────────
const UrgencyBadge = ({ urgency }: { urgency: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    critical: {
      label: "حرج",
      cls: "border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]",
    },
    high: {
      label: "مرتفع",
      cls: "border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    },
    medium: {
      label: "متوسط",
      cls: "border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    },
    low: {
      label: "منخفض",
      cls: "border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    },
    ok: {
      label: "جيد",
      cls: "border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
    },
  };
  const { label, cls } = map[urgency] ?? map.ok;
  return (
    <span
      className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", cls)}
    >
      {label}
    </span>
  );
};

// ─── Confidence bar ────────────────────────────────────────────────────────────
const ConfidenceBar = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75
      ? "bg-[var(--accent-success)]"
      : pct >= 50
        ? "bg-[var(--accent-warning)]"
        : "bg-[var(--accent-danger)]";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct}%</span>
    </div>
  );
};

export default function ForecastPage() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("demand");
  const [loading, setLoading] = useState(true);
  const [moduleErrors, setModuleErrors] = useState<Record<string, boolean>>({});

  // Demand
  const [demandData, setDemandData] = useState<any>(null);
  const [demandFilter, setDemandFilter] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productHistory, setProductHistory] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Replenishment
  const [replenishment, setReplenishment] = useState<any>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Cash flow
  const [cashflow, setCashflow] = useState<any>(null);

  // Churn
  const [churnData, setChurnData] = useState<any>(null);

  // Workforce
  const [workforce, setWorkforce] = useState<any>(null);

  // Model metrics
  const [metrics, setMetrics] = useState<any>(null);

  // What-if
  const [whatIfType, setWhatIfType] = useState<
    "demand" | "cashflow" | "campaign" | "pricing"
  >("pricing");
  const [whatIfParams, setWhatIfParams] = useState<Record<string, any>>({
    priceDeltaPct: 10,
  });
  const [whatIfResult, setWhatIfResult] = useState<any>(null);
  const [runningWhatIf, setRunningWhatIf] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  // Load data
  const moduleNotice = (key: string, text: string) =>
    moduleErrors[key] ? (
      <Card className="border border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/12">
        <CardContent className="p-3 text-sm text-[var(--accent-warning)]">
          {text}
        </CardContent>
      </Card>
    ) : null;

  const loadDemand = useCallback(
    async (urgency?: string) => {
      try {
        const res = await portalApi.getDemandForecast({
          urgency: urgency === "all" ? undefined : urgency,
        });
        setDemandData(res);
        setModuleErrors((prev) => ({ ...prev, demand: false }));
      } catch {
        setModuleErrors((prev) => ({ ...prev, demand: true }));
        toast({
          title: "خطأ",
          description: "تعذّر تحميل بيانات الطلب",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const tasks: Array<{ key: string; task: Promise<any> }> = [
        {
          key: "demand",
          task: portalApi
            .getDemandForecast({ urgency: undefined })
            .then(setDemandData),
        },
        {
          key: "replenishment",
          task: portalApi.getReplenishmentList().then(setReplenishment),
        },
        {
          key: "cashflow",
          task: portalApi.getCashFlowForecast(30).then(setCashflow),
        },
        {
          key: "churn",
          task: portalApi.getChurnForecast(50).then(setChurnData),
        },
        {
          key: "workforce",
          task: portalApi.getWorkforceForecast().then(setWorkforce),
        },
        {
          key: "metrics",
          task: portalApi.getForecastModelMetrics().then(setMetrics),
        },
      ];

      const results = await Promise.allSettled(tasks.map((t) => t.task));
      const nextErrors: Record<string, boolean> = {};
      results.forEach((result, index) => {
        nextErrors[tasks[index].key] = result.status === "rejected";
      });
      setModuleErrors(nextErrors);

      const failedCount = results.filter(
        (result) => result.status === "rejected",
      ).length;
      if (failedCount > 0) {
        toast({
          title: "بعض البيانات غير متاحة",
          description:
            "بعض الرؤى غير متاحة حالياً. يمكنك المحاولة مرة أخرى بعد قليل.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [loadDemand, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(WHAT_IF_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (
        parsed.type === "demand" ||
        parsed.type === "cashflow" ||
        parsed.type === "campaign" ||
        parsed.type === "pricing"
      ) {
        setWhatIfType(parsed.type);
      }
      if (parsed.params && typeof parsed.params === "object") {
        setWhatIfParams(parsed.params);
      }
      if (parsed.result && typeof parsed.result === "object") {
        setWhatIfResult(parsed.result);
      }
    } catch {
      // Ignore malformed persisted scenario state
    }
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "demand" ||
      tab === "replenishment" ||
      tab === "cashflow" ||
      tab === "churn" ||
      tab === "workforce" ||
      tab === "whatif" ||
      tab === "metrics"
    ) {
      setActiveTab(tab);
      return;
    }
    setActiveTab("demand");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "demand") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const loadProductHistory = async (productId: string) => {
    setHistoryLoading(true);
    try {
      const res = await portalApi.getDemandForecastHistory(productId);
      setProductHistory(res);
      setSelectedProduct(productId);
    } catch {
      toast({
        title: "خطأ",
        description: "تعذّر تحميل تاريخ المنتج",
        variant: "destructive",
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await portalApi.approveReplenishment(id);
      toast({
        title: "تمت الموافقة",
        description: "تمت الموافقة على أمر التوريد",
      });
      portalApi.getReplenishmentList().then(setReplenishment);
    } catch {
      toast({
        title: "خطأ",
        description: "تعذّرت الموافقة",
        variant: "destructive",
      });
    } finally {
      setApprovingId(null);
    }
  };

  const runWhatIf = async () => {
    if (
      whatIfType === "demand" &&
      !(
        whatIfParams.productId ??
        selectedProduct ??
        demandData?.items?.[0]?.productId
      )
    ) {
      toast({
        title: "خطأ",
        description: "اختر منتجاً لتشغيل سيناريو الطلب",
        variant: "destructive",
      });
      return;
    }

    setRunningWhatIf(true);
    setWhatIfError(null);
    try {
      const params =
        whatIfType === "demand"
          ? {
              ...whatIfParams,
              productId:
                whatIfParams.productId ??
                selectedProduct ??
                demandData?.items?.[0]?.productId,
            }
          : whatIfParams;
      const res = await portalApi.runWhatIfScenario({
        type: whatIfType,
        params,
      });
      setWhatIfResult(res);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          WHAT_IF_STORAGE_KEY,
          JSON.stringify({
            type: whatIfType,
            params,
            result: res,
            updatedAt: new Date().toISOString(),
          }),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "تعذّر تشغيل السيناريو حالياً. راجع المدخلات وحاول مرة أخرى.";
      setWhatIfError(message);
      toast({
        title: "خطأ",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRunningWhatIf(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  // Chart data helpers
  const cashflowChartData = (cashflow?.projection ?? []).map((p: any) => ({
    name: new Date(p.date).toLocaleDateString("ar-SA", {
      month: "short",
      day: "numeric",
    }),
    الرصيد: p.balance,
    واردات: p.inflow,
    صادرات: p.outflow,
  }));

  const workforceHourData = (workforce?.hourPattern ?? []).map((h: any) => ({
    name: `${h.hour}:00`,
    رسائل: h.avgMessages,
  }));

  const workforceDayData = (workforce?.dayPattern ?? []).map((d: any) => ({
    name: d.dayName,
    رسائل: d.avgMessages,
  }));

  const churnByRisk = [
    { name: "حرج", count: churnData?.summary?.critical ?? 0 },
    { name: "مرتفع", count: churnData?.summary?.high ?? 0 },
    { name: "متوسط", count: churnData?.summary?.medium ?? 0 },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <PageHeader
        title="منصة التنبؤات الذكية"
        description="تحليلات متقدمة وتوقعات مدعومة بالذكاء الاصطناعي"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="w-4 h-4 ml-2" />
            تحديث
          </Button>
        }
      />

      {/* Summary row */}
      {demandData?.summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "حرج",
              value: demandData.summary.critical,
              color: "text-[var(--accent-danger)]",
              icon: AlertTriangle,
            },
            {
              label: "مرتفع",
              value: demandData.summary.high,
              color: "text-[var(--accent-warning)]",
              icon: TrendingDown,
            },
            {
              label: "عملاء معرضون للاضطراب",
              value: churnData?.summary?.critical ?? 0,
              color: "text-[var(--accent-gold)]",
              icon: Users,
            },
            {
              label: "توصيات توريد",
              value: replenishment?.total ?? 0,
              color: "text-[var(--accent-blue)]",
              icon: PackageX,
            },
          ].map((s) => (
            <Card key={s.label} className="app-data-card">
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    "rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2",
                    s.color,
                  )}
                >
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
          <TabsTrigger value="demand" className="w-full">
            <TrendingUp className="w-4 h-4 ml-1" />
            الطلب
          </TabsTrigger>
          <TabsTrigger value="replenishment" className="w-full">
            <PackageX className="w-4 h-4 ml-1" />
            التوريد
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="w-full">
            <DollarSign className="w-4 h-4 ml-1" />
            التدفقات
          </TabsTrigger>
          <TabsTrigger value="churn" className="w-full">
            <Users className="w-4 h-4 ml-1" />
            الاضطراب
          </TabsTrigger>
          <TabsTrigger value="workforce" className="w-full">
            <Activity className="w-4 h-4 ml-1" />
            العمالة
          </TabsTrigger>
          <TabsTrigger value="whatif" className="w-full">
            <Brain className="w-4 h-4 ml-1" />
            ماذا لو
          </TabsTrigger>
          <TabsTrigger value="metrics" className="w-full">
            <BarChart3 className="w-4 h-4 ml-1" />
            الدقة
          </TabsTrigger>
        </TabsList>

        {/* ─── DEMAND TAB ────────────────────────────────────────────────── */}
        <TabsContent value="demand" className="space-y-4">
          {moduleNotice(
            "demand",
            "بيانات التنبؤ بالطلب غير متاحة حالياً. حاول التحديث بعد قليل.",
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Select
              value={demandFilter}
              onValueChange={(v) => {
                setDemandFilter(v);
                loadDemand(v);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="الأولوية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="critical">حرج</SelectItem>
                <SelectItem value="high">مرتفع</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="ok">جيد</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {demandData?.total ?? 0} منتج
            </p>
          </div>

          {/* Product history chart */}
          {selectedProduct && productHistory && (
            <Card className="app-data-card">
              <CardHeader>
                <CardTitle className="text-base">
                  {productHistory.productName} - تاريخ المبيعات والتوقعات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    جاري التحميل...
                  </div>
                ) : (
                  <AreaChart
                    data={[
                      ...(productHistory.historicalData ?? []).map(
                        (d: any) => ({
                          name: new Date(d.date).toLocaleDateString("ar-SA", {
                            month: "short",
                            day: "numeric",
                          }),
                          فعلي: d.value,
                        }),
                      ),
                    ]}
                    series={[{ key: "فعلي", color: "#3b82f6" }]}
                    height={200}
                  />
                )}
                <div className="mt-4 grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                  {[
                    { label: "توقع 7 أيام", value: productHistory.forecast7d },
                    { label: "توقع 14 يوم", value: productHistory.forecast14d },
                    { label: "توقع 30 يوم", value: productHistory.forecast30d },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="font-bold text-lg">
                        {formatNumber(s.value)}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <span>دقة النموذج:</span>
                  <ConfidenceBar value={productHistory.confidence} />
                  <span>MAPE: {productHistory.mape7d}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Product table */}
          {!demandData?.items?.length ? (
            <div className="py-12 text-center text-muted-foreground">
              لا توجد بيانات - قم بتشغيل أول دورة تنبؤ أولاً
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {(demandData?.items ?? []).map((item: any) => (
                  <Card
                    key={item.productId}
                    className="app-data-card cursor-pointer"
                    onClick={() => loadProductHistory(item.productId)}
                  >
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {item.productName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            المخزون الحالي: {formatNumber(item.currentStock)}
                          </p>
                        </div>
                        <UrgencyBadge urgency={item.urgency} />
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">أيام للنفاد</p>
                          <p
                            className={cn(
                              "font-medium",
                              item.daysUntilStockout !== null &&
                                item.daysUntilStockout <= 7
                                ? "text-[var(--accent-danger)]"
                                : "",
                            )}
                          >
                            {item.daysUntilStockout !== null
                              ? `${item.daysUntilStockout} يوم`
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">توقع 7 أيام</p>
                          <p className="font-medium">
                            {formatNumber(item.forecast7d)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">توقع 30 يوم</p>
                          <p className="font-medium">
                            {formatNumber(item.forecast30d)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">الاتجاه</p>
                          <span
                            className={cn(
                              "flex items-center gap-1 text-xs",
                              item.trendPct >= 10
                                ? "text-[var(--accent-success)]"
                                : item.trendPct <= -10
                                  ? "text-[var(--accent-danger)]"
                                  : "text-muted-foreground",
                            )}
                          >
                            {item.trendPct >= 10 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : item.trendPct <= -10 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : null}
                            {item.trendPct > 0 ? "+" : ""}
                            {item.trendPct}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          الثقة
                        </p>
                        <ConfidenceBar value={item.confidence} />
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          loadProductHistory(item.productId);
                        }}
                      >
                        تفاصيل
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-muted-foreground">
                      <th className="px-3 py-2 text-right">المنتج</th>
                      <th className="px-3 py-2 text-center">المخزون</th>
                      <th className="px-3 py-2 text-center">أيام للنفاد</th>
                      <th className="px-3 py-2 text-center">7 أيام</th>
                      <th className="px-3 py-2 text-center">30 يوم</th>
                      <th className="px-3 py-2 text-center">الاتجاه</th>
                      <th className="px-3 py-2 text-center">الأولوية</th>
                      <th className="px-3 py-2 text-center">الثقة</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(demandData?.items ?? []).map((item: any) => (
                      <tr
                        key={item.productId}
                        className="cursor-pointer border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]"
                        onClick={() => loadProductHistory(item.productId)}
                      >
                        <td className="max-w-[180px] truncate px-3 py-2 font-medium">
                          {item.productName}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {formatNumber(item.currentStock)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.daysUntilStockout !== null ? (
                            <span
                              className={cn(
                                item.daysUntilStockout <= 7
                                  ? "font-semibold text-[var(--accent-danger)]"
                                  : "",
                              )}
                            >
                              {item.daysUntilStockout} يوم
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {formatNumber(item.forecast7d)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {formatNumber(item.forecast30d)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={cn(
                              "flex items-center justify-center gap-1 text-xs",
                              item.trendPct >= 10
                                ? "text-[var(--accent-success)]"
                                : item.trendPct <= -10
                                  ? "text-[var(--accent-danger)]"
                                  : "text-muted-foreground",
                            )}
                          >
                            {item.trendPct >= 10 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : item.trendPct <= -10 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : null}
                            {item.trendPct > 0 ? "+" : ""}
                            {item.trendPct}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <UrgencyBadge urgency={item.urgency} />
                        </td>
                        <td className="px-3 py-2">
                          <ConfidenceBar value={item.confidence} />
                        </td>
                        <td
                          className="px-3 py-2 text-center text-xs text-[var(--accent-blue)] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadProductHistory(item.productId);
                          }}
                        >
                          تفاصيل
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── REPLENISHMENT TAB ─────────────────────────────────────────── */}
        <TabsContent value="replenishment" className="space-y-4">
          {moduleNotice("replenishment", "بيانات التوريد غير متاحة مؤقتاً.")}
          <h3 className="text-sm font-medium text-primary">
            توصيات أوامر الشراء المعلقة
          </h3>
          {!replenishment?.items?.length ? (
            <div className="py-12 text-center text-muted-foreground">
              لا توجد توصيات معلقة
            </div>
          ) : (
            <div className="space-y-3">
              {(replenishment?.items ?? []).map((item: any) => (
                <Card key={item.id} className="app-data-card">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <p className="font-medium">
                        {item.product_name ?? item.product_id}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>
                          توصية: <b>{formatNumber(item.recommended_qty)}</b>{" "}
                          وحدة
                        </span>
                        <span>
                          نقطة إعادة الطلب:{" "}
                          <b>{formatNumber(item.reorder_point)}</b>
                        </span>
                        <span>
                          مخزون أمان: <b>{formatNumber(item.safety_stock)}</b>
                        </span>
                        {item.est_stockout_date && (
                          <span className="text-[var(--accent-danger)]">
                            نفاد متوقع:{" "}
                            <b>
                              {new Date(
                                item.est_stockout_date,
                              ).toLocaleDateString("ar-SA")}
                            </b>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <UrgencyBadge urgency={item.urgency} />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approvingId === item.id}
                        onClick={() => handleApprove(item.id)}
                        className="w-full sm:w-auto"
                      >
                        <CheckSquare className="ml-1 h-4 w-4 text-[var(--accent-success)]" />
                        موافقة
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── CASHFLOW TAB ──────────────────────────────────────────────── */}
        <TabsContent value="cashflow" className="space-y-4">
          {moduleNotice("cashflow", "توقع التدفق النقدي غير متاح حالياً.")}
          {cashflow && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "الرصيد الحالي (تقريبي)",
                    value: formatCurrency(cashflow.currentBalance),
                    color: "text-[var(--accent-blue)]",
                  },
                  {
                    label: "متوسط الواردات اليومي",
                    value: formatCurrency(cashflow.avgDailyInflow),
                    color: "text-[var(--accent-success)]",
                  },
                  {
                    label: "متوسط الصادرات اليومي",
                    value: formatCurrency(cashflow.avgDailyOutflow),
                    color: "text-[var(--accent-danger)]",
                  },
                  {
                    label: "أيام الاحتياطي",
                    value:
                      cashflow.runwayDays !== null
                        ? `${cashflow.runwayDays} يوم`
                        : "كافٍ",
                    color:
                      cashflow.runwayDays !== null && cashflow.runwayDays < 30
                        ? "text-[var(--accent-danger)]"
                        : "text-[var(--accent-success)]",
                  },
                ].map((s) => (
                  <Card key={s.label} className="app-data-card">
                    <CardContent className="p-4">
                      <p className={cn("text-xl font-bold", s.color)}>
                        {s.value}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.label}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="app-data-card">
                <CardHeader>
                  <CardTitle className="text-base">
                    توقع التدفق النقدي - 30 يوم
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AreaChart
                    data={cashflowChartData}
                    series={[
                      { key: "الرصيد", color: "#3b82f6" },
                      { key: "واردات", color: "#22c55e" },
                      { key: "صادرات", color: "#ef4444" },
                    ]}
                    height={260}
                  />
                </CardContent>
              </Card>

              {cashflow.riskDays?.length > 0 && (
                <Card className="border border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/10">
                  <CardContent className="p-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--accent-danger)]">
                      <AlertTriangle className="h-4 w-4" /> أيام تحذير
                    </p>
                    <div className="space-y-1">
                      {cashflow.riskDays.slice(0, 5).map((rd: any) => (
                        <div
                          key={rd.date}
                          className="flex justify-between text-xs text-secondary"
                        >
                          <span>
                            {new Date(rd.date).toLocaleDateString("ar-SA")}
                          </span>
                          <span className="text-[var(--accent-danger)]">
                            {rd.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ─── CHURN TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="churn" className="space-y-4">
          {moduleNotice("churn", "تحليل اضطراب العملاء غير متاح حالياً.")}
          <div className="grid grid-cols-3 gap-4 mb-2">
            {churnByRisk.map((r) => (
              <Card key={r.name} className="app-data-card text-center">
                <CardContent className="p-4">
                  <p className="text-2xl font-bold">{r.count}</p>
                  <p className="text-xs text-muted-foreground">{r.name}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-muted-foreground">
                  <th className="px-3 py-2 text-right">العميل</th>
                  <th className="px-3 py-2 text-center">أيام منذ آخر طلب</th>
                  <th className="px-3 py-2 text-center">دورة الطلب</th>
                  <th className="px-3 py-2 text-center">احتمالية الاضطراب</th>
                  <th className="px-3 py-2 text-center">القيمة الإجمالية</th>
                  <th className="px-3 py-2">الإجراء المقترح</th>
                </tr>
              </thead>
              <tbody>
                {(churnData?.items ?? []).map((c: any) => (
                  <tr
                    key={c.customerId}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{c.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.customerPhone}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.daysSinceLastOrder}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.avgOrderCycleDays} يوم
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          "font-semibold",
                          c.churnProbability >= 0.8
                            ? "text-[var(--accent-danger)]"
                            : c.churnProbability >= 0.5
                              ? "text-[var(--accent-warning)]"
                              : "text-[var(--accent-gold)]",
                        )}
                      >
                        {Math.round(c.churnProbability * 100)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {formatCurrency(c.lifetimeValue)}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {c.recommendedAction}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!churnData?.items?.length && (
              <div className="py-12 text-center text-muted-foreground">
                لا توجد بيانات
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── WORKFORCE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="workforce" className="space-y-4">
          {moduleNotice("workforce", "توقع عبء العمل غير متاح مؤقتاً.")}
          {workforce && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="app-data-card">
                  <CardHeader>
                    <CardTitle className="text-sm">
                      متوسط الرسائل حسب اليوم
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarChart
                      data={workforceDayData}
                      series={[{ key: "رسائل", color: "#6366f1" }]}
                      height={200}
                    />
                  </CardContent>
                </Card>
                <Card className="app-data-card">
                  <CardHeader>
                    <CardTitle className="text-sm">
                      متوسط الرسائل حسب الساعة
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarChart
                      data={workforceHourData}
                      series={[{ key: "رسائل", color: "#8b5cf6" }]}
                      height={200}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="app-data-card">
                <CardHeader>
                  <CardTitle className="text-sm">
                    توقعات الأسبوع القادم
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {(workforce.nextSevenDays ?? []).map((d: any) => (
                      <div
                        key={d.date}
                        className="rounded bg-[var(--bg-surface-2)] p-2 text-center"
                      >
                        <p className="text-xs text-muted-foreground">
                          {new Date(d.date).toLocaleDateString("ar-SA", {
                            weekday: "short",
                          })}
                        </p>
                        <p className="font-semibold mt-1">
                          {d.forecastMessages}
                        </p>
                        <p className="text-xs text-muted-foreground">رسالة</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    أوقات الذروة: <b>{workforce.peakDay}</b> الساعة{" "}
                    <b>{workforce.peakHour}:00</b>
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── WHAT-IF TAB ───────────────────────────────────────────────── */}
        <TabsContent value="whatif" className="space-y-4">
          {whatIfError && (
            <Card className="border border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/12">
              <CardContent className="p-3 text-sm text-[var(--accent-warning)]">
                {whatIfError}
              </CardContent>
            </Card>
          )}
          <Card className="app-data-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-5 w-5 text-[var(--accent-gold)]" />
                محاكي السيناريوهات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="mb-2 block text-sm">نوع السيناريو</Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { v: "pricing", label: "تغيير السعر" },
                    { v: "demand", label: "تغيير المهلة" },
                    { v: "cashflow", label: "تدفق نقدي" },
                    { v: "campaign", label: "حملة تسويقية" },
                  ].map((opt) => (
                    <Button
                      key={opt.v}
                      size="sm"
                      variant={whatIfType === opt.v ? "default" : "outline"}
                      onClick={() => {
                        const nextType = opt.v as
                          | "demand"
                          | "cashflow"
                          | "campaign"
                          | "pricing";
                        setWhatIfType(nextType);
                        setWhatIfParams(getDefaultWhatIfParams(nextType));
                        setWhatIfError(null);
                        setWhatIfResult(null);
                      }}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Type-specific controls */}
              {whatIfType === "pricing" && (
                <div className="space-y-3">
                  <Label className="text-sm">
                    تغيير السعر بنسبة: {whatIfParams.priceDeltaPct ?? 10}%
                  </Label>
                  <Slider
                    min={-30}
                    max={50}
                    step={5}
                    value={[whatIfParams.priceDeltaPct ?? 10]}
                    onValueChange={([v]) =>
                      setWhatIfParams({ priceDeltaPct: v })
                    }
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    المرونة السعرية المفترضة: -1.5 (1% ارتفاع سعر → 1.5% تراجع
                    حجم)
                  </p>
                </div>
              )}

              {whatIfType === "demand" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">المنتج</Label>
                    <Select
                      value={String(
                        whatIfParams.productId ??
                          selectedProduct ??
                          demandData?.items?.[0]?.productId ??
                          "",
                      )}
                      onValueChange={(value) =>
                        setWhatIfParams({ ...whatIfParams, productId: value })
                      }
                    >
                      <SelectTrigger className="mt-2 w-full md:w-[320px]">
                        <SelectValue placeholder="اختر منتجاً" />
                      </SelectTrigger>
                      <SelectContent>
                        {(demandData?.items ?? []).map((item: any) => (
                          <SelectItem
                            key={item.productId}
                            value={String(item.productId)}
                          >
                            {item.productName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Label className="text-sm">مهلة التوريد الجديدة (أيام)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={whatIfParams.newLeadTimeDays ?? 5}
                    onChange={(e) =>
                      setWhatIfParams({
                        newLeadTimeDays: parseInt(e.target.value) || 5,
                      })
                    }
                    className="w-full sm:w-32"
                  />
                </div>
              )}

              {whatIfType === "cashflow" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm">إيرادات إضافية يومية</Label>
                    <Input
                      type="number"
                      value={whatIfParams.extraRevenue ?? 0}
                      onChange={(e) =>
                        setWhatIfParams({
                          ...whatIfParams,
                          extraRevenue: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">نفقات إضافية يومية</Label>
                    <Input
                      type="number"
                      value={whatIfParams.extraExpense ?? 0}
                      onChange={(e) =>
                        setWhatIfParams({
                          ...whatIfParams,
                          extraExpense: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {whatIfType === "campaign" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm">نسبة الخصم %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={80}
                      value={whatIfParams.discountPct ?? 15}
                      onChange={(e) =>
                        setWhatIfParams({
                          ...whatIfParams,
                          discountPct: parseFloat(e.target.value) || 15,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-sm">تكلفة الحملة</Label>
                    <Input
                      type="number"
                      value={whatIfParams.campaignCost ?? 0}
                      onChange={(e) =>
                        setWhatIfParams({
                          ...whatIfParams,
                          campaignCost: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={runWhatIf}
                disabled={runningWhatIf}
                className="w-full gap-2 sm:w-auto"
              >
                <Play className="w-4 h-4" />
                {runningWhatIf ? "جاري التحليل..." : "تشغيل السيناريو"}
              </Button>

              {/* Result */}
              {whatIfResult && (
                <div
                  className={cn(
                    "p-4 rounded-lg border",
                    whatIfResult.delta >= 0
                      ? "bg-[var(--accent-success)]/12 border-[var(--accent-success)]/20"
                      : "bg-[var(--accent-danger)]/12 border-[var(--accent-danger)]/20",
                  )}
                >
                  <p className="font-semibold text-sm mb-3">
                    {whatIfResult.scenarioType}
                  </p>
                  <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                    <div>
                      <p className="text-lg font-bold">
                        {formatNumber(whatIfResult.baselineValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">الأساس</p>
                    </div>
                    <div>
                      <p
                        className={cn(
                          "text-lg font-bold",
                          whatIfResult.delta >= 0
                            ? "text-[var(--accent-success)]"
                            : "text-[var(--accent-danger)]",
                        )}
                      >
                        {whatIfResult.delta >= 0 ? "+" : ""}
                        {formatNumber(whatIfResult.delta)}
                      </p>
                      <p className="text-xs text-muted-foreground">التغيير</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {formatNumber(whatIfResult.adjustedValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">المتوقع</p>
                    </div>
                  </div>
                  <p
                    className={cn(
                      "text-center text-sm mt-2 font-medium",
                      whatIfResult.deltaPct >= 0
                        ? "text-[var(--accent-success)]"
                        : "text-[var(--accent-danger)]",
                    )}
                  >
                    {whatIfResult.deltaPct >= 0 ? "+" : ""}
                    {whatIfResult.deltaPct}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── MODEL METRICS TAB ─────────────────────────────────────────── */}
        <TabsContent value="metrics" className="space-y-4">
          {moduleNotice("metrics", "مقاييس دقة النموذج غير متاحة حالياً.")}
          {metrics?.latest && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "MAPE",
                  value: `${metrics.latest.mape}%`,
                  description: "Mean Absolute % Error",
                  good: metrics.latest.mape < 20,
                },
                {
                  label: "WMAPE",
                  value: `${metrics.latest.wmape}%`,
                  description: "Weighted MAPE",
                  good: metrics.latest.wmape < 20,
                },
                {
                  label: "Bias",
                  value: metrics.latest.bias,
                  description: "Systematic skew",
                  good: Math.abs(metrics.latest.bias) < 5,
                },
                {
                  label: "MAE",
                  value: metrics.latest.mae,
                  description: "Mean Absolute Error",
                  good: true,
                },
              ].map((m) => (
                <Card key={m.label} className="app-data-card">
                  <CardContent className="p-4">
                    <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs font-mono text-muted-foreground">
                        {m.label}
                      </span>
                      {m.good ? (
                        <CheckCircle className="h-4 w-4 text-[var(--accent-success)]" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-[var(--accent-warning)]" />
                      )}
                    </div>
                    <p className="text-2xl font-bold">{m.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {metrics?.history?.length > 0 && (
            <Card className="app-data-card">
              <CardHeader>
                <CardTitle className="text-sm">سجل دقة النموذج</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-muted-foreground">
                        <th className="px-3 py-2 text-right">النوع</th>
                        <th className="px-3 py-2 text-center">MAPE</th>
                        <th className="px-3 py-2 text-center">WMAPE</th>
                        <th className="px-3 py-2 text-center">Bias</th>
                        <th className="px-3 py-2 text-center">عينة</th>
                        <th className="px-3 py-2 text-center">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.history.map((h: any, i: number) => (
                        <tr
                          key={i}
                          className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {h.forecast_type}
                          </td>
                          <td className="px-3 py-2 text-center">{h.mape}%</td>
                          <td className="px-3 py-2 text-center">{h.wmape}%</td>
                          <td className="px-3 py-2 text-center">{h.bias}</td>
                          <td className="px-3 py-2 text-center">
                            {h.sample_size}
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                            {h.computed_at
                              ? new Date(h.computed_at).toLocaleDateString(
                                  "ar-SA",
                                )
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {!metrics?.latest && (
            <div className="py-16 text-center text-muted-foreground">
              <Brain className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p>لا توجد مقاييس بعد - تعمل الدورة الليلية على حساب الدقة</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
