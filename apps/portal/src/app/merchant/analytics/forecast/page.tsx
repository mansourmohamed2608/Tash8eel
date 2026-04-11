"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  PackageX,
  ShoppingCart,
  BarChart3,
  Clock,
  Search,
  X,
  ArrowUpDown,
} from "lucide-react";
import portalApi from "@/lib/client";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ForecastItem {
  product_id: string;
  product_name: string;
  current_stock: number;
  avg_daily_orders: number;
  days_until_stockout: number | null;
  trend_pct: number;
  forecast_7d: number;
  forecast_30d: number;
  reorder_suggestion: number;
  urgency: "critical" | "high" | "medium" | "ok";
  ai_summary_ar: string | null;
  computed_at: string;
}

type UrgencyFilter = "all" | "critical" | "high" | "medium" | "ok";
type SortBy = "urgency" | "stockout" | "trend" | "name";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return asNumber(value, 0);
}

function urgencyLabel(u: string) {
  switch (u) {
    case "critical":
      return "حرج";
    case "high":
      return "عالي";
    case "medium":
      return "متوسط";
    case "ok":
      return "جيد";
    default:
      return u;
  }
}

function urgencyVariant(
  u: string,
): "destructive" | "secondary" | "outline" | "default" {
  switch (u) {
    case "critical":
      return "destructive";
    case "high":
      return "secondary";
    case "medium":
      return "outline";
    default:
      return "default";
  }
}

function urgencyBg(u: string) {
  switch (u) {
    case "critical":
      return "bg-[var(--accent-danger)]/10 border-[var(--accent-danger)]/20";
    case "high":
      return "bg-orange-50 border-orange-200";
    case "medium":
      return "bg-[var(--accent-warning)]/10 border-[var(--accent-warning)]/20";
    default:
      return "bg-[var(--accent-success)]/10 border-[var(--accent-success)]/20";
  }
}

function urgencyWeight(u: string): number {
  switch (u) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "ok":
      return 1;
    default:
      return 0;
  }
}

function formatDays(daysUntilStockout: number | null): string {
  if (daysUntilStockout == null) return "غير متاح";
  if (daysUntilStockout > 999) return "+999";
  if (daysUntilStockout <= 0) return "نفد";
  return `${daysUntilStockout} يوم`;
}

function getDisplayCode(productId: string): string | null {
  const id = (productId ?? "").trim();
  if (!id) return null;

  // Hide raw UUID identifiers from the UI because they are noisy for users.
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    );
  if (isUuid) return null;

  if (id.length > 20) return null;
  return id;
}

function TrendIcon({ pct }: { pct: number }) {
  if (pct > 5)
    return <TrendingUp className="h-3.5 w-3.5 text-[var(--accent-success)]" />;
  if (pct < -5)
    return <TrendingDown className="h-3.5 w-3.5 text-[var(--accent-danger)]" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UrgencyFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("urgency");
  const [search, setSearch] = useState("");
  const [computedAt, setComputedAt] = useState<string | null>(null);

  const loadForecast = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await portalApi.getDemandForecast(forceRefresh);
        const rawForecasts = "forecasts" in data ? data.forecasts : [];
        const forecasts: ForecastItem[] = rawForecasts.map((item: any) => ({
          ...item,
          current_stock: asNumber(item.current_stock),
          avg_daily_orders: asNumber(item.avg_daily_orders),
          days_until_stockout: asNullableNumber(item.days_until_stockout),
          trend_pct: asNumber(item.trend_pct),
          forecast_7d: asNumber(item.forecast_7d),
          forecast_30d: asNumber(item.forecast_30d),
          reorder_suggestion: asNumber(item.reorder_suggestion),
        }));
        setItems(forecasts);
        if (forecasts.length > 0) {
          setComputedAt(forecasts[0].computed_at);
        }
      } catch (e: any) {
        setError(e?.message ?? "فشل تحميل التوقعات");
        toast({
          title: "خطأ",
          description: "فشل تحميل تقرير الطلب",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  // ── Derived stats ────────────────────────────────────────────────────────

  const counts = {
    critical: items.filter((i) => i.urgency === "critical").length,
    high: items.filter((i) => i.urgency === "high").length,
    medium: items.filter((i) => i.urgency === "medium").length,
    ok: items.filter((i) => i.urgency === "ok").length,
  };

  const trendingUp = items.filter((i) => i.trend_pct > 5).length;
  const trendingDown = items.filter((i) => i.trend_pct < -5).length;
  const totalReorderSuggested = items.reduce(
    (sum, i) => sum + i.reorder_suggestion,
    0,
  );
  const nearStockout = items.filter(
    (i) => i.days_until_stockout != null && i.days_until_stockout <= 7,
  ).length;

  const visibleItems = items
    .filter((item) => {
      const matchFilter = filter === "all" || item.urgency === filter;
      const matchSearch =
        search.trim() === "" ||
        item.product_name.toLowerCase().includes(search.toLowerCase()) ||
        item.product_id.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    })
    .sort((a, b) => {
      if (sortBy === "name") {
        return a.product_name.localeCompare(b.product_name, "ar");
      }

      if (sortBy === "trend") {
        return Math.abs(b.trend_pct) - Math.abs(a.trend_pct);
      }

      if (sortBy === "stockout") {
        const aDays = a.days_until_stockout ?? Number.POSITIVE_INFINITY;
        const bDays = b.days_until_stockout ?? Number.POSITIVE_INFINITY;
        return aDays - bDays;
      }

      const urgencyDiff = urgencyWeight(b.urgency) - urgencyWeight(a.urgency);
      if (urgencyDiff !== 0) return urgencyDiff;
      const aDays = a.days_until_stockout ?? Number.POSITIVE_INFINITY;
      const bDays = b.days_until_stockout ?? Number.POSITIVE_INFINITY;
      return aDays - bDays;
    });

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 sm:px-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div dir="rtl" className="w-full space-y-6 p-4 sm:p-6">
        <PageHeader
          title="توقعات الطلب"
          description="تحليل ذكي للمخزون والطلب"
        />
        <Card className="mt-6 border-destructive">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => loadForecast()}
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full space-y-8 p-4 sm:p-6">
      <PageHeader
        title="توقعات الطلب"
        description="تحليل المبيعات والمخزون بالذكاء الاصطناعي"
        actions={
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {computedAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(computedAt).toLocaleString("ar-SA", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => loadForecast(true)}
            >
              {refreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="mr-1.5">تحديث</span>
            </Button>
          </div>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div>
            <p className="app-hero-band__eyebrow">توقع وتشغيل</p>
            <h2 className="app-hero-band__title">
              تعرف على الأصناف المعرضة للنفاد قبل أن تتحول إلى خسارة مبيعات
            </h2>
            <p className="app-hero-band__copy">
              يجمع هذا التقرير معدل الطلب، سرعة الاستهلاك، واتجاه التغير ليمنح
              الفريق قائمة أولوية واضحة لإعادة الطلب والتوزيع.
            </p>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                الأصناف المحللة
              </span>
              <strong className="app-hero-band__metric-value">
                {items.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                خطر خلال 7 أيام
              </span>
              <strong className="app-hero-band__metric-value">
                {nearStockout}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                إعادة طلب مقترحة
              </span>
              <strong className="app-hero-band__metric-value">
                {Math.round(totalReorderSuggested)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* ── Summary strip ──────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-8 gap-3">
          <Card className="app-data-card border-[var(--border-default)] bg-[var(--bg-surface-2)] md:col-span-2">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-foreground">
                {items.length}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                إجمالي الأصناف
              </p>
            </CardContent>
          </Card>
          <button
            className={`text-right rounded-lg border transition ${filter === "critical" ? "ring-2 ring-[var(--accent-danger)]" : ""}`}
            onClick={() => setFilter("critical")}
            type="button"
          >
            <Card className="app-data-card h-full border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/10">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-[var(--accent-danger)]">
                  {counts.critical}
                </p>
                <p className="mt-0.5 text-xs text-[var(--accent-danger)]">
                  حرج
                </p>
              </CardContent>
            </Card>
          </button>
          <button
            className={`text-right rounded-lg border transition ${filter === "high" ? "ring-2 ring-[var(--accent-gold)]" : ""}`}
            onClick={() => setFilter("high")}
            type="button"
          >
            <Card className="app-data-card h-full border-[var(--accent-gold)]/20 bg-[var(--accent-gold)]/10">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-[var(--accent-gold)]">
                  {counts.high}
                </p>
                <p className="mt-0.5 text-xs text-[var(--accent-gold)]">عالي</p>
              </CardContent>
            </Card>
          </button>
          <button
            className={`text-right rounded-lg border transition ${filter === "medium" ? "ring-2 ring-[var(--accent-warning)]" : ""}`}
            onClick={() => setFilter("medium")}
            type="button"
          >
            <Card className="app-data-card h-full border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/10">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-[var(--accent-warning)]">
                  {counts.medium}
                </p>
                <p className="mt-0.5 text-xs text-[var(--accent-warning)]">
                  متوسط
                </p>
              </CardContent>
            </Card>
          </button>
          <button
            className={`text-right rounded-lg border transition ${filter === "ok" ? "ring-2 ring-[var(--accent-success)]" : ""}`}
            onClick={() => setFilter("ok")}
            type="button"
          >
            <Card className="app-data-card h-full border-[var(--accent-success)]/20 bg-[var(--accent-success)]/10">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-[var(--accent-success)]">
                  {counts.ok}
                </p>
                <p className="mt-0.5 text-xs text-[var(--accent-success)]">
                  جيد
                </p>
              </CardContent>
            </Card>
          </button>
          <Card className="app-data-card border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10">
            <CardContent className="py-3 px-4 text-center flex flex-col items-center">
              <div className="flex items-center gap-1">
                <p className="text-2xl font-bold text-[var(--accent-blue)]">
                  {trendingUp}
                </p>
                <TrendingUp className="h-4 w-4 text-[var(--accent-blue)]" />
              </div>
              <p className="mt-0.5 text-xs text-[var(--accent-blue)]">
                طلب متصاعد
              </p>
            </CardContent>
          </Card>
          <Card className="app-data-card bg-gray-50 border-gray-200">
            <CardContent className="py-3 px-4 text-center flex flex-col items-center">
              <div className="flex items-center gap-1">
                <p className="text-2xl font-bold text-gray-700">
                  {trendingDown}
                </p>
                <TrendingDown className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">طلب منخفض</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Filter & search bar ─────────────────────────────────────────── */}
      <Card className="app-data-card app-data-card--muted border-dashed">
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-muted-foreground absolute top-1/2 -translate-y-1/2 right-3" />
              <Input
                placeholder="ابحث بالاسم أو الكود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
              {search && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 -translate-y-1/2 left-1 h-7 w-7"
                  onClick={() => setSearch("")}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">ترتيب:</span>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["urgency", "الأولوية"],
                    ["stockout", "النفاد"],
                    ["trend", "الاتجاه"],
                    ["name", "الاسم"],
                  ] as Array<[SortBy, string]>
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={sortBy === value ? "default" : "ghost"}
                    className="h-7 w-full sm:w-auto"
                    onClick={() => setSortBy(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {(
              ["all", "critical", "high", "medium", "ok"] as UrgencyFilter[]
            ).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "الكل" : urgencyLabel(f)}
                {f !== "all" && (
                  <span className="mr-1 text-xs opacity-70">
                    ({counts[f as keyof typeof counts] ?? 0})
                  </span>
                )}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2">
              <p className="text-muted-foreground">
                إجمالي إعادة الطلب المقترح
              </p>
              <p className="text-lg font-semibold">
                {Math.round(totalReorderSuggested)} وحدة
              </p>
            </div>
            <div className="rounded-md border bg-amber-50 px-3 py-2">
              <p className="text-muted-foreground">
                أصناف مهددة بالنفاد خلال 7 أيام
              </p>
              <p className="text-lg font-semibold text-[var(--accent-warning)]">
                {nearStockout} صنف
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground px-1">
        <span>
          إظهار {visibleItems.length} من {items.length} صنف
        </span>
        <span>
          الوضع الحالي:{" "}
          {filter === "all" ? "كل الأولويات" : urgencyLabel(filter)}
        </span>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              لا توجد بيانات كافية للتوقع, تأكد من وجود طلبات وبيانات مخزون
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => loadForecast(true)}
            >
              <RefreshCw className="w-4 h-4 ml-1" />
              تحديث التوقعات
            </Button>
          </CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              لا توجد نتائج مطابقة للفلاتر الحالية
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" onClick={() => setSearch("")}>
                مسح البحث
              </Button>
              <Button variant="outline" onClick={() => setFilter("all")}>
                عرض الكل
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── Product table ────────────────────────────────────────────── */
        <div className="space-y-3">
          {visibleItems.map((item) => {
            const displayCode = getDisplayCode(item.product_id);
            return (
              <Card
                key={item.product_id}
                className={`border ${urgencyBg(item.urgency)}`}
              >
                <CardContent className="py-4 px-4 sm:px-5">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <p className="font-semibold text-sm truncate max-w-[260px] sm:max-w-none">
                          {item.product_name}
                        </p>
                        <Badge variant={urgencyVariant(item.urgency)}>
                          {urgencyLabel(item.urgency)}
                        </Badge>
                        {displayCode && (
                          <Badge
                            variant="outline"
                            className="font-mono text-[11px]"
                          >
                            {displayCode}
                          </Badge>
                        )}
                      </div>

                      <div className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs self-start sm:self-auto">
                        <AlertCircle className="h-3.5 w-3.5 text-[var(--accent-warning)]" />
                        <span>
                          النفاد المتوقع: {formatDays(item.days_until_stockout)}
                        </span>
                      </div>
                    </div>

                    {item.ai_summary_ar && (
                      <p className="text-xs text-muted-foreground leading-6">
                        {item.ai_summary_ar}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-2 text-xs">
                      <div className="rounded-md border bg-background/75 px-2.5 py-2">
                        <p className="text-muted-foreground">المخزون الحالي</p>
                        <p className="font-medium mt-0.5 flex items-center gap-1">
                          {item.current_stock}
                          {item.current_stock === 0 && (
                            <PackageX className="w-3.5 h-3.5 text-destructive" />
                          )}
                        </p>
                      </div>

                      <div className="rounded-md border bg-background/75 px-2.5 py-2">
                        <p className="text-muted-foreground">معدل يومي</p>
                        <p className="font-medium mt-0.5 flex items-center gap-1">
                          <ShoppingCart className="w-3 h-3 text-muted-foreground" />
                          {item.avg_daily_orders.toFixed(1)}
                        </p>
                      </div>

                      <div className="rounded-md border bg-background/75 px-2.5 py-2">
                        <p className="text-muted-foreground">أيام حتى النفاد</p>
                        <p className="font-medium mt-0.5">
                          {formatDays(item.days_until_stockout)}
                        </p>
                      </div>

                      <div className="rounded-md border bg-background/75 px-2.5 py-2">
                        <p className="text-muted-foreground">
                          الاتجاه خلال 7 أيام
                        </p>
                        <p className="font-medium mt-0.5 flex items-center gap-1">
                          <TrendIcon pct={item.trend_pct} />
                          {item.trend_pct > 0 ? "+" : ""}
                          {item.trend_pct.toFixed(1)}%
                        </p>
                      </div>

                      <div className="rounded-md border bg-background/75 px-2.5 py-2">
                        <p className="text-muted-foreground">توقع 7 أيام</p>
                        <p className="font-medium mt-0.5">
                          {Math.round(item.forecast_7d)}
                        </p>
                      </div>

                      <div className="rounded-md border bg-background/75 px-2.5 py-2">
                        <p className="text-muted-foreground">توقع 30 يوم</p>
                        <p className="font-medium mt-0.5">
                          {Math.round(item.forecast_30d)}
                        </p>
                      </div>

                      <div className="rounded-md border bg-blue-50 px-2.5 py-2">
                        <p className="text-muted-foreground">
                          إعادة الطلب المقترحة
                        </p>
                        <p className="mt-0.5 text-base font-semibold text-[var(--accent-blue)]">
                          {item.reorder_suggestion}
                        </p>
                      </div>
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
