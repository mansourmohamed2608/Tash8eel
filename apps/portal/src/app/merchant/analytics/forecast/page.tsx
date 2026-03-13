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
} from "lucide-react";
import portalApi from "@/lib/authenticated-api";
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function urgencyLabel(u: string) {
  switch (u) {
    case "critical": return "حرج";
    case "high":     return "عالي";
    case "medium":   return "متوسط";
    case "ok":       return "جيد";
    default:         return u;
  }
}

function urgencyVariant(u: string): "destructive" | "secondary" | "outline" | "default" {
  switch (u) {
    case "critical": return "destructive";
    case "high":     return "secondary";
    case "medium":   return "outline";
    default:         return "default";
  }
}

function urgencyBg(u: string) {
  switch (u) {
    case "critical": return "bg-red-50 border-red-200";
    case "high":     return "bg-orange-50 border-orange-200";
    case "medium":   return "bg-yellow-50 border-yellow-200";
    default:         return "bg-green-50 border-green-200";
  }
}

function TrendIcon({ pct }: { pct: number }) {
  if (pct > 5)  return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
  if (pct < -5) return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
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
  const [search, setSearch] = useState("");
  const [computedAt, setComputedAt] = useState<string | null>(null);

  const loadForecast = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await portalApi.getDemandForecast(forceRefresh);
      const forecasts: ForecastItem[] = data.forecasts ?? [];
      setItems(forecasts);
      if (forecasts.length > 0) {
        setComputedAt(forecasts[0].computed_at);
      }
    } catch (e: any) {
      setError(e?.message ?? "فشل تحميل التوقعات");
      toast({ title: "خطأ", description: "فشل تحميل تقرير الطلب", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  // ── Derived stats ────────────────────────────────────────────────────────

  const counts = {
    critical: items.filter((i) => i.urgency === "critical").length,
    high:     items.filter((i) => i.urgency === "high").length,
    medium:   items.filter((i) => i.urgency === "medium").length,
    ok:       items.filter((i) => i.urgency === "ok").length,
  };

  const trendingUp   = items.filter((i) => i.trend_pct >  5).length;
  const trendingDown = items.filter((i) => i.trend_pct < -5).length;

  const visibleItems = items.filter((item) => {
    const matchFilter = filter === "all" || item.urgency === filter;
    const matchSearch = search.trim() === "" ||
      item.product_name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div dir="rtl" className="p-6 max-w-5xl mx-auto">
        <PageHeader title="توقعات الطلب" description="تحليل ذكي للمخزون والطلب" />
        <Card className="mt-6 border-destructive">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => loadForecast()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <PageHeader
          title="توقعات الطلب"
          description="تحليل المبيعات والمخزون بالذكاء الاصطناعي"
        />
        <div className="flex items-center gap-2">
          {computedAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(computedAt).toLocaleString("ar-SA", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
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
      </div>

      {/* ── Summary strip ──────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-red-700">{counts.critical}</p>
              <p className="text-xs text-red-600 mt-0.5">حرج</p>
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-orange-700">{counts.high}</p>
              <p className="text-xs text-orange-600 mt-0.5">عالي</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{counts.medium}</p>
              <p className="text-xs text-yellow-600 mt-0.5">متوسط</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold text-green-700">{counts.ok}</p>
              <p className="text-xs text-green-600 mt-0.5">جيد</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="py-3 px-4 text-center flex flex-col items-center">
              <div className="flex items-center gap-1">
                <p className="text-2xl font-bold text-blue-700">{trendingUp}</p>
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs text-blue-600 mt-0.5">طلب متصاعد</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="py-3 px-4 text-center flex flex-col items-center">
              <div className="flex items-center gap-1">
                <p className="text-2xl font-bold text-gray-700">{trendingDown}</p>
                <TrendingDown className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">طلب منخفض</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Filter & search bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="ابحث عن منتج..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-52"
        />
        {(["all", "critical", "high", "medium", "ok"] as UrgencyFilter[]).map((f) => (
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

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              لا توجد بيانات كافية للتوقع — تأكد من وجود طلبات وبيانات مخزون
            </p>
            <Button variant="outline" className="mt-4" onClick={() => loadForecast(true)}>
              <RefreshCw className="w-4 h-4 ml-1" />
              تحديث التوقعات
            </Button>
          </CardContent>
        </Card>
      ) : visibleItems.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">لا توجد نتائج مطابقة</p>
      ) : (

        /* ── Product table ────────────────────────────────────────────── */
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <Card key={item.product_id} className={`border ${urgencyBg(item.urgency)}`}>
              <CardContent className="py-4 px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">

                  {/* Left: product info */}
                  <div className="flex-1 min-w-[160px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{item.product_name}</p>
                      <Badge variant={urgencyVariant(item.urgency)}>
                        {urgencyLabel(item.urgency)}
                      </Badge>
                    </div>

                    {item.ai_summary_ar && (
                      <p className="text-xs text-muted-foreground mt-1">{item.ai_summary_ar}</p>
                    )}
                  </div>

                  {/* Right: metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 text-xs text-right">

                    <div>
                      <p className="text-muted-foreground">المخزون الحالي</p>
                      <p className="font-medium flex items-center gap-1 justify-end">
                        {item.current_stock}
                        {item.current_stock === 0 && (
                          <PackageX className="w-3.5 h-3.5 text-destructive" />
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-muted-foreground">معدل يومي</p>
                      <p className="font-medium flex items-center gap-1 justify-end">
                        <ShoppingCart className="w-3 h-3 text-muted-foreground" />
                        {item.avg_daily_orders.toFixed(1)}
                      </p>
                    </div>

                    <div>
                      <p className="text-muted-foreground">أيام حتى النفاد</p>
                      <p className="font-medium text-right">
                        {item.days_until_stockout == null
                          ? "—"
                          : item.days_until_stockout > 999
                          ? "+999"
                          : `${item.days_until_stockout} يوم`}
                      </p>
                    </div>

                    <div>
                      <p className="text-muted-foreground">الاتجاه (7 أيام)</p>
                      <p className="font-medium flex items-center gap-1 justify-end">
                        <TrendIcon pct={item.trend_pct} />
                        {item.trend_pct > 0 ? "+" : ""}{item.trend_pct.toFixed(1)}%
                      </p>
                    </div>

                    <div>
                      <p className="text-muted-foreground">توقع 7 أيام</p>
                      <p className="font-medium">{Math.round(item.forecast_7d)}</p>
                    </div>

                    <div>
                      <p className="text-muted-foreground">توقع 30 يوم</p>
                      <p className="font-medium">{Math.round(item.forecast_30d)}</p>
                    </div>

                    <div className="sm:col-span-2">
                      <p className="text-muted-foreground">كمية إعادة الطلب المقترحة</p>
                      <p className="font-semibold text-base">{item.reorder_suggestion}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
