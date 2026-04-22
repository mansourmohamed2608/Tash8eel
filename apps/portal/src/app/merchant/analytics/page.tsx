"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  TrendingUp,
  TrendingDown,
  Clock,
  ShoppingCart,
  Users,
  RefreshCw,
  AlertCircle,
  Package,
  Target,
  Zap,
  Calendar,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { formatCurrency } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import {
  AiInsightsCard,
  generateAnalyticsInsights,
} from "@/components/ai/ai-insights-card";
import { SmartAnalysisButton } from "@/components/ai/smart-analysis-button";
import {
  REPORTING_PERIOD_OPTIONS,
  getReportingDateRange,
  getStoredReportingDays,
  resolveReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";

interface ConversionData {
  period: { days: number; startDate: string };
  funnel: {
    totalConversations: number;
    addedToCart: number;
    startedCheckout: number;
    completedOrder: number;
  };
  rates: {
    cartRate: number;
    checkoutRate: number;
    conversionRate: number;
    cartToCheckout: number;
    checkoutToOrder: number;
  };
}

interface ResponseTimeData {
  period: { days: number; startDate: string };
  hasData?: boolean;
  responseTimes: {
    sampleCount?: number;
    averageSeconds: number;
    minSeconds: number;
    maxSeconds: number;
    medianSeconds: number;
  };
  formatted: {
    average: string;
    min: string;
    max: string;
    median: string;
  };
}

interface PopularProduct {
  rank: number;
  itemId: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

interface PeakHoursData {
  period: { days: number; startDate: string };
  hasData?: boolean;
  hourlyStats: Array<{
    hour: number;
    hourLabel: string;
    messageCount: number;
    orderCount: number;
  }>;
  peaks: {
    messages: { hour: number; label: string; count: number };
    orders: { hour: number; label: string; count: number };
  };
}

export default function AnalyticsPage() {
  const { apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isInitialLoad = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<{
    conversion?: string;
    response?: string;
    products?: string;
    peaks?: string;
  }>({});
  const [periodDays, setPeriodDays] = useState<number>(() =>
    getStoredReportingDays(30),
  );
  const latestRequestRef = useRef(0);

  const [conversionData, setConversionData] = useState<ConversionData | null>(
    null,
  );
  const [responseTimeData, setResponseTimeData] =
    useState<ResponseTimeData | null>(null);
  const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);
  const [peakHoursData, setPeakHoursData] = useState<PeakHoursData | null>(
    null,
  );
  const effectivePeriodDays = useMemo(
    () => resolveReportingDays(periodDays),
    [periodDays],
  );
  const periodRange = useMemo(
    () => getReportingDateRange(periodDays),
    [periodDays],
  );

  const fetchAllAnalytics = useCallback(async () => {
    if (!apiKey) return;
    const requestId = ++latestRequestRef.current;

    if (isInitialLoad.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    setSectionErrors({});
    try {
      const [conversionResult, responseResult, productsResult, peaksResult] =
        await Promise.allSettled([
          merchantApi.getConversionAnalytics(apiKey, effectivePeriodDays),
          merchantApi.getResponseTimeAnalytics(apiKey, effectivePeriodDays),
          merchantApi.getPopularProductsAnalytics(
            apiKey,
            effectivePeriodDays,
            10,
          ),
          merchantApi.getPeakHoursAnalytics(apiKey, effectivePeriodDays),
        ]);

      if (requestId !== latestRequestRef.current) return;

      const nextErrors: {
        conversion?: string;
        response?: string;
        products?: string;
        peaks?: string;
      } = {};

      if (conversionResult.status === "fulfilled") {
        setConversionData(conversionResult.value);
      } else {
        setConversionData(null);
        nextErrors.conversion =
          conversionResult.reason instanceof Error
            ? conversionResult.reason.message
            : "تعذر تحميل بيانات التحويلات";
      }

      if (responseResult.status === "fulfilled") {
        setResponseTimeData(responseResult.value);
      } else {
        setResponseTimeData(null);
        nextErrors.response =
          responseResult.reason instanceof Error
            ? responseResult.reason.message
            : "تعذر تحميل بيانات الاستجابة";
      }

      if (productsResult.status === "fulfilled") {
        setPopularProducts(productsResult.value.products || []);
      } else {
        setPopularProducts([]);
        nextErrors.products =
          productsResult.reason instanceof Error
            ? productsResult.reason.message
            : "تعذر تحميل بيانات المنتجات";
      }

      if (peaksResult.status === "fulfilled") {
        setPeakHoursData(peaksResult.value);
      } else {
        setPeakHoursData(null);
        nextErrors.peaks =
          peaksResult.reason instanceof Error
            ? peaksResult.reason.message
            : "تعذر تحميل بيانات أوقات الذروة";
      }

      setSectionErrors(nextErrors);

      const failedCount = Object.keys(nextErrors).length;
      if (failedCount === 4) {
        setError("تعذر تحميل التحليلات حالياً. حاول مرة أخرى.");
      }
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      console.error("Failed to fetch analytics:", err);
      setError(err instanceof Error ? err.message : "فشل في تحميل التحليلات");
    } finally {
      if (requestId !== latestRequestRef.current) return;
      isInitialLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiKey, effectivePeriodDays]);

  useEffect(() => {
    fetchAllAnalytics();
  }, [fetchAllAnalytics]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="التحليلات" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-20 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="التحليلات" />
        <Card>
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">خطأ في تحميل التحليلات</h3>
              <p className="text-muted-foreground mt-2">{error}</p>
              <Button
                onClick={fetchAllAnalytics}
                variant="outline"
                className="mt-4 w-full sm:w-auto"
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                إعادة المحاولة
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedPeriodLabel =
    REPORTING_PERIOD_OPTIONS.find((option) => option.value === periodDays)
      ?.label || `آخر ${periodDays} يوم`;
  const selectedPeriodSummary =
    periodDays === 365
      ? `من ${periodRange.startDate.toLocaleDateString("ar-EG")} حتى ${periodRange.endDate.toLocaleDateString("ar-EG")}`
      : selectedPeriodLabel;
  const failedSectionsCount = Object.keys(sectionErrors).length;
  const shouldSuggestWiderRange = periodDays < 30;

  const switchToThirtyDays = () => {
    setPeriodDays(30);
    setStoredReportingDays(30);
  };

  return (
    <div className="space-y-8 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="التحليلات"
        description="قراءة تنفيذية دقيقة للتحويلات، الاستجابة، المنتجات، وأوقات الذروة."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Select
              value={periodDays.toString()}
              onValueChange={(v) => {
                const next = parseInt(v, 10);
                setPeriodDays(next);
                setStoredReportingDays(next);
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTING_PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAllAnalytics}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">Commerce Analytics</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                تحليلات تشغيلية مركزة على القرارات، لا مجرد رسوم بيانية.
              </h2>
              <p className="app-hero-band__copy">
                راقب مسار التحويل، زمن الاستجابة، المنتجات الأعلى أداءً، وأوقات
                الذروة من نفس الصفحة. كل تبويب هنا مصمم ليقودك إلى إجراء واضح.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{selectedPeriodSummary}</Badge>
              {failedSectionsCount > 0 ? (
                <Badge variant="warning">
                  تعذر تحميل {failedSectionsCount} قسم
                </Badge>
              ) : (
                <Badge variant="success">جميع الأقسام محدثة</Badge>
              )}
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">التحويل الكلي</span>
              <strong className="app-hero-band__metric-value">
                {Math.round(conversionData?.rates?.conversionRate || 0)}%
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                متوسط الاستجابة
              </span>
              <strong className="app-hero-band__metric-value">
                {responseTimeData?.formatted?.average || "—"}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">أعلى منتج</span>
              <strong className="app-hero-band__metric-value">
                {popularProducts[0]?.name || "—"}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">ذروة الرسائل</span>
              <strong className="app-hero-band__metric-value">
                {peakHoursData?.peaks?.messages?.label || "—"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* AI Analytics Insights */}
      <AiInsightsCard
        title="تحليلات ذكية"
        insights={generateAnalyticsInsights({
          conversionRate: conversionData?.rates?.conversionRate,
          avgResponseTime: responseTimeData?.responseTimes?.averageSeconds
            ? responseTimeData.responseTimes.averageSeconds / 60
            : undefined,
          topProductCount: popularProducts?.length ?? 0,
          peakHour: peakHoursData?.peaks?.messages?.hour,
        })}
        loading={loading}
      />

      {/* GPT-Powered Smart Analysis */}
      <SmartAnalysisButton context="analytics" />

      <div className="app-data-card app-data-card--muted rounded-[22px] px-3 py-2 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span>الفترة الحالية: {selectedPeriodSummary}</span>
          {refreshing && (
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>
      {failedSectionsCount > 0 && (
        <p className="text-xs text-amber-600">
          تعذر تحميل {failedSectionsCount} قسم من التحليلات في هذه المحاولة.
          يمكن إعادة التحديث.
        </p>
      )}

      <Tabs defaultValue="conversion" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <TabsTrigger value="conversion" className="w-full">
            <Target className="h-4 w-4 ml-2" />
            التحويلات
          </TabsTrigger>
          <TabsTrigger value="response" className="w-full">
            <Clock className="h-4 w-4 ml-2" />
            أوقات الاستجابة
          </TabsTrigger>
          <TabsTrigger value="products" className="w-full">
            <Package className="h-4 w-4 ml-2" />
            المنتجات
          </TabsTrigger>
          <TabsTrigger value="peaks" className="w-full">
            <Zap className="h-4 w-4 ml-2" />
            أوقات الذروة
          </TabsTrigger>
        </TabsList>

        {/* Conversion Funnel Tab */}
        <TabsContent value="conversion" className="space-y-6">
          {sectionErrors.conversion ? (
            <Card className="app-data-card">
              <CardContent className="p-12 text-center text-muted-foreground">
                <p>{sectionErrors.conversion}</p>
              </CardContent>
            </Card>
          ) : conversionData && conversionData.funnel.totalConversations > 0 ? (
            <>
              {/* Funnel Stats */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <Card className="app-data-card">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Users className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {conversionData.funnel.totalConversations}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          إجمالي المحادثات
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="app-data-card">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-500/10 rounded-lg">
                        <ShoppingCart className="h-5 w-5 text-yellow-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {conversionData.funnel.addedToCart}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          أضافوا للسلة
                        </p>
                        <Badge variant="secondary" className="text-xs mt-1">
                          {conversionData.rates.cartRate}% من الكل
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500/10 rounded-lg">
                        <BarChart className="h-5 w-5 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {conversionData.funnel.startedCheckout}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          بدأوا الدفع
                        </p>
                        <Badge variant="secondary" className="text-xs mt-1">
                          {conversionData.rates.cartToCheckout}% من السلة
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {conversionData.funnel.completedOrder}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          أكملوا الطلب
                        </p>
                        <Badge
                          variant="default"
                          className="text-xs mt-1 bg-green-500"
                        >
                          {conversionData.rates.checkoutToOrder}% من الدفع
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Funnel Visualization */}
              <Card>
                <CardHeader>
                  <CardTitle>قمع التحويل</CardTitle>
                  <CardDescription>
                    تتبع رحلة العميل من المحادثة إلى الطلب
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      {
                        label: "المحادثات",
                        value: conversionData.funnel.totalConversations,
                        rate: 100,
                        color: "bg-blue-500",
                      },
                      {
                        label: "السلة",
                        value: conversionData.funnel.addedToCart,
                        rate: conversionData.rates.cartRate,
                        color: "bg-yellow-500",
                      },
                      {
                        label: "الدفع",
                        value: conversionData.funnel.startedCheckout,
                        rate: conversionData.rates.checkoutRate,
                        color: "bg-orange-500",
                      },
                      {
                        label: "مكتمل",
                        value: conversionData.funnel.completedOrder,
                        rate: conversionData.rates.conversionRate,
                        color: "bg-green-500",
                      },
                    ].map((step, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-20 text-sm font-medium">
                          {step.label}
                        </div>
                        <div className="flex-1 h-8 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${step.color} transition-all duration-500`}
                            style={{ width: `${Math.min(100, step.rate)}%` }}
                          />
                        </div>
                        <div className="w-16 text-end text-sm">
                          {step.value}
                        </div>
                        <div className="w-12 text-end text-sm text-muted-foreground">
                          {step.rate}%
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Conversion insights */}
                  <div className="mt-6 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        من السلة للدفع
                      </p>
                      <p className="text-2xl font-bold">
                        {conversionData.rates.cartToCheckout}%
                      </p>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        من الدفع للطلب
                      </p>
                      <p className="text-2xl font-bold">
                        {conversionData.rates.checkoutToOrder}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                لا تتوفر بيانات التحويل
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Response Times Tab */}
        <TabsContent value="response" className="space-y-6">
          {sectionErrors.response ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <p>{sectionErrors.response}</p>
              </CardContent>
            </Card>
          ) : responseTimeData &&
            (responseTimeData.hasData ??
              (responseTimeData.responseTimes.sampleCount || 0) > 0) ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-6 text-center">
                  <Clock className="h-8 w-8 mx-auto text-primary mb-2" />
                  <p className="text-3xl font-bold">
                    {responseTimeData.formatted.average}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    متوسط وقت الاستجابة
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <TrendingDown className="h-8 w-8 mx-auto text-green-500 mb-2" />
                  <p className="text-3xl font-bold">
                    {responseTimeData.formatted.min}
                  </p>
                  <p className="text-sm text-muted-foreground">أسرع استجابة</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <TrendingUp className="h-8 w-8 mx-auto text-red-500 mb-2" />
                  <p className="text-3xl font-bold">
                    {responseTimeData.formatted.max}
                  </p>
                  <p className="text-sm text-muted-foreground">أبطأ استجابة</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <BarChart className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                  <p className="text-3xl font-bold">
                    {responseTimeData.formatted.median}
                  </p>
                  <p className="text-sm text-muted-foreground">الوسيط</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <p>
                  لا تتوفر بيانات أوقات الاستجابة خلال {selectedPeriodSummary}
                </p>
                {shouldSuggestWiderRange && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={switchToThirtyDays}
                  >
                    عرض آخر 30 يوم
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Popular Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>المنتجات الأكثر مبيعاً</CardTitle>
              <CardDescription>
                أفضل 10 منتجات خلال {selectedPeriodSummary}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sectionErrors.products ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{sectionErrors.products}</p>
                </div>
              ) : popularProducts.length > 0 ? (
                <div className="space-y-3">
                  {popularProducts.map((product) => (
                    <div
                      key={`${product.itemId}-${product.rank}`}
                      className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {product.rank}
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {product.orderCount} طلب
                          </p>
                        </div>
                      </div>
                      <div className="text-start sm:text-end">
                        <p className="font-bold">
                          {product.totalQuantity} قطعة
                        </p>
                        <p className="text-sm text-green-600">
                          {formatCurrency(product.totalRevenue)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>لا توجد بيانات منتجات خلال {selectedPeriodSummary}</p>
                  {shouldSuggestWiderRange && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={switchToThirtyDays}
                    >
                      عرض آخر 30 يوم
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Peak Hours Tab */}
        <TabsContent value="peaks" className="space-y-6">
          {sectionErrors.peaks ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <p>{sectionErrors.peaks}</p>
              </CardContent>
            </Card>
          ) : peakHoursData &&
            (peakHoursData.hasData ??
              peakHoursData.hourlyStats.some(
                (s) => s.messageCount > 0 || s.orderCount > 0,
              )) ? (
            <>
              {/* Peak Summary */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-lg">
                        <Users className="h-6 w-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          ذروة الرسائل
                        </p>
                        <p className="text-2xl font-bold">
                          {peakHoursData.peaks.messages.label}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {peakHoursData.peaks.messages.count} رسالة
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-500/10 rounded-lg">
                        <ShoppingCart className="h-6 w-6 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          ذروة الطلبات
                        </p>
                        <p className="text-2xl font-bold">
                          {peakHoursData.peaks.orders.label}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {peakHoursData.peaks.orders.count} طلب
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Hourly Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>النشاط حسب الساعة</CardTitle>
                  <CardDescription>
                    توزيع الرسائل والطلبات على مدار اليوم
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden">
                    <div className="flex h-64 items-end gap-px sm:gap-1">
                      {peakHoursData.hourlyStats.map((stat) => {
                        const maxActivity = Math.max(
                          ...peakHoursData.hourlyStats.map((s) =>
                            Math.max(s.messageCount, s.orderCount),
                          ),
                          1,
                        );
                        const messageHeight =
                          (stat.messageCount / maxActivity) * 100;
                        const orderHeight =
                          (stat.orderCount / maxActivity) * 100;
                        return (
                          <div
                            key={stat.hour}
                            className="flex min-w-0 flex-1 flex-col items-center gap-1"
                            title={`${stat.hourLabel}: ${stat.messageCount} رسالة، ${stat.orderCount} طلب`}
                          >
                            <div className="w-full h-full flex items-end justify-center gap-[2px]">
                              <div
                                className="w-[45%] bg-primary/80 rounded-t transition-all duration-300 hover:bg-primary"
                                style={{
                                  height: `${messageHeight}%`,
                                  minHeight:
                                    stat.messageCount > 0 ? "4px" : "0",
                                }}
                              />
                              <div
                                className="w-[45%] bg-green-500/80 rounded-t transition-all duration-300 hover:bg-green-500"
                                style={{
                                  height: `${orderHeight}%`,
                                  minHeight: stat.orderCount > 0 ? "4px" : "0",
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {stat.hour % 4 === 0
                                ? stat.hourLabel.split(":")[0]
                                : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-2 text-sm sm:flex-row sm:justify-center sm:gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-primary rounded" />
                      <span>الرسائل</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded" />
                      <span>الطلبات</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <p>لا تتوفر بيانات أوقات الذروة خلال {selectedPeriodSummary}</p>
                {shouldSuggestWiderRange && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={switchToThirtyDays}
                  >
                    عرض آخر 30 يوم
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
