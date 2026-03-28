"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Truck,
  Bot,
  DollarSign,
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Target,
  Zap,
  Timer,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { kpisApi } from "@/lib/client";
import portalApi from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import {
  AiInsightsCard,
  generateKpiInsights,
} from "@/components/ai/ai-insights-card";
import {
  getReportingDateRange,
  REPORTING_PERIOD_OPTIONS,
  getStoredReportingDays,
  resolveReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";

interface RecoveredCartsData {
  totalAbandoned: number;
  totalRecovered: number;
  recoveryRate: number;
  recoveredValue: number;
  averageRecoveryTime: number;
  byDay: Array<{ date: string; abandoned: number; recovered: number }>;
}
interface DeliveryFailuresData {
  totalDeliveries: number;
  totalFailures: number;
  failureRate: number;
  failuresByReason: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  failuresByDay: Array<{ date: string; failures: number }>;
  topFailureAreas: Array<{ area: string; failures: number }>;
}
interface AgentPerformanceData {
  totalInteractions: number;
  totalTasks: number;
  successfulTasks: number;
  successRate: number;
  averageConfidence: number;
  totalTakeovers: number;
  takeoverRate: number;
  tokenUsage: { total: number; byAgent: Record<string, number> };
  byAgent: Array<{
    agent: string;
    tasks: number;
    successRate: number;
    avgConfidence: number;
  }>;
}
interface RevenueData {
  totalRevenue: number;
  previousPeriodRevenue: number;
  revenueChange: number;
  averageOrderValue: number;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  revenueByDay: Array<{ date: string; revenue: number }>;
  paymentMethods: Array<{ method: string; amount: number; percentage: number }>;
}
interface CustomerData {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  retentionRate: number;
  avgOrdersPerCustomer?: number;
  topCustomers: Array<{
    name: string;
    phone: string;
    totalOrders: number;
    totalSpent: number;
  }>;
  customersByRegion: Array<{ region: string; count: number }>;
}

export default function KpisPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const [period, setPeriod] = useState(() =>
    String(getStoredReportingDays(30)),
  );
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [recoveredCarts, setRecoveredCarts] =
    useState<RecoveredCartsData | null>(null);
  const [deliveryFailures, setDeliveryFailures] =
    useState<DeliveryFailuresData | null>(null);
  const [agentPerformance, setAgentPerformance] =
    useState<AgentPerformanceData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [customers, setCustomers] = useState<CustomerData | null>(null);
  const [aiAvailable, setAiAvailable] = useState<
    "unknown" | "active" | "quota" | "disabled"
  >("unknown");
  const selectedPeriodValue = useMemo(() => Number(period), [period]);
  const selectedPeriodDays = useMemo(
    () => resolveReportingDays(selectedPeriodValue),
    [selectedPeriodValue],
  );
  const periodRange = useMemo(
    () => getReportingDateRange(selectedPeriodValue),
    [selectedPeriodValue],
  );
  const selectedPeriodLabel = useMemo(
    () =>
      REPORTING_PERIOD_OPTIONS.find((opt) => opt.value === selectedPeriodValue)
        ?.label || `آخر ${selectedPeriodValue} يوم`,
    [selectedPeriodValue],
  );
  const selectedPeriodSummary = useMemo(
    () =>
      selectedPeriodValue === 365
        ? `من ${periodRange.startDate.toLocaleDateString("ar-EG")} حتى ${periodRange.endDate.toLocaleDateString("ar-EG")}`
        : selectedPeriodLabel,
    [
      periodRange.endDate,
      periodRange.startDate,
      selectedPeriodLabel,
      selectedPeriodValue,
    ],
  );

  const formatPercentValue = (value: number) => `${value.toFixed(1)}%`;

  const fetchAllKpis = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const days = selectedPeriodDays;
      const [cartsData, deliveryData, agentData, revenueData, customerData] =
        await Promise.all([
          kpisApi.getRecoveredCarts(apiKey, days).catch(() => null),
          kpisApi.getDeliveryFailures(apiKey, days).catch(() => null),
          kpisApi.getAgentPerformance(apiKey, days).catch(() => null),
          kpisApi.getRevenueKpis(apiKey, days).catch(() => null),
          kpisApi.getCustomerKpis(apiKey, days).catch(() => null),
        ]);
      setRecoveredCarts(cartsData);
      setDeliveryFailures(deliveryData);
      setAgentPerformance(agentData);
      setRevenue(revenueData);
      setCustomers(customerData);

      // Check AI availability for agents tab
      try {
        const merchantId = apiKey; // merchantId used as apiKey in many places
        const aiRes = await portalApi.getInventoryAiStatus(merchantId);
        if (aiRes?.active) setAiAvailable("active");
        else if (aiRes?.budgetExhausted) setAiAvailable("quota");
        else setAiAvailable("disabled");
      } catch {
        setAiAvailable("unknown");
      }
    } catch (err) {
      console.error("Failed to fetch KPIs:", err);
      toast({
        title: "خطأ",
        description: "فشل في جلب مؤشرات الأداء",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [apiKey, selectedPeriodDays, toast]);

  useEffect(() => {
    fetchAllKpis();
  }, [fetchAllKpis]);

  const TrendIndicator = ({
    value,
    suffix = "%",
    good = "up",
  }: {
    value: number;
    suffix?: string;
    good?: "up" | "down";
  }) => {
    const isPositive = value > 0;
    const isGood =
      (good === "up" && isPositive) || (good === "down" && !isPositive);
    const Icon = value === 0 ? Minus : isPositive ? ArrowUp : ArrowDown;
    return (
      <span
        className={cn(
          "flex items-center gap-1 text-sm font-medium",
          isGood
            ? "text-green-600"
            : value === 0
              ? "text-gray-500"
              : "text-red-600",
        )}
      >
        <Icon className="h-4 w-4" />
        {Math.abs(value).toFixed(1)}
        {suffix}
      </span>
    );
  };

  const StatCard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    trendGood = "up",
    color = "blue",
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    trend?: number;
    trendGood?: "up" | "down";
    color?: "blue" | "green" | "yellow" | "red" | "purple";
  }) => {
    const colorClasses = {
      blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      green:
        "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
      yellow:
        "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
      red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
      purple:
        "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    };
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
              {trend !== undefined && (
                <div className="mt-2">
                  <TrendIndicator value={trend} good={trendGood} />
                </div>
              )}
            </div>
            <div className={cn("p-3 rounded-lg", colorClasses[color])}>
              <Icon className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const ProgressBar = ({
    value,
    max,
    color = "blue",
  }: {
    value: number;
    max: number;
    color?: string;
  }) => {
    const percent = max > 0 ? (value / max) * 100 : 0;
    const colorClass =
      color === "green"
        ? "bg-green-500"
        : color === "red"
          ? "bg-red-500"
          : color === "yellow"
            ? "bg-yellow-500"
            : "bg-blue-500";
    return (
      <div className="w-full bg-muted rounded-full h-2.5">
        <div
          className={cn("h-2.5 rounded-full transition-all", colorClass)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    );
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-8 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="مؤشرات الأداء (KPIs)"
        description="تحليل شامل لأداء متجرك ومعدلات النجاح"
        actions={
          <div className="flex items-center gap-3">
            <Select
              value={period}
              onValueChange={(value) => {
                setPeriod(value);
                setStoredReportingDays(Number(value));
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTING_PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchAllKpis} disabled={loading}>
              <RefreshCw
                className={cn("h-4 w-4 ml-2", loading && "animate-spin")}
              />
              تحديث
            </Button>
          </div>
        }
      />

      <AiInsightsCard
        insights={generateKpiInsights({
          conversionRate: recoveredCarts?.recoveryRate ?? 0,
          avgOrderValue: revenue?.averageOrderValue ?? 0,
          customerSatisfaction: agentPerformance?.successRate ?? 0,
        })}
      />

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="carts">السلات</TabsTrigger>
            <TabsTrigger value="delivery">التوصيل</TabsTrigger>
            <TabsTrigger value="agents">الوكلاء</TabsTrigger>
            <TabsTrigger value="customers">العملاء</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="معدل استرداد السلات"
                value={formatPercentValue(recoveredCarts?.recoveryRate || 0)}
                subtitle={`مسترد: ${recoveredCarts?.totalRecovered || 0} / ${(recoveredCarts?.totalRecovered || 0) + (recoveredCarts?.totalAbandoned || 0)} سلة`}
                icon={ShoppingCart}
                color="green"
              />
              <StatCard
                title="معدل فشل التوصيل"
                value={formatPercentValue(deliveryFailures?.failureRate || 0)}
                subtitle={`فاشل: ${deliveryFailures?.totalFailures || 0} / ${deliveryFailures?.totalDeliveries || 0} توصيلة`}
                icon={Truck}
                trendGood="down"
                color="red"
              />
              <StatCard
                title="نجاح الوكيل الذكي"
                value={formatPercentValue(agentPerformance?.successRate || 0)}
                subtitle={`ناجح: ${agentPerformance?.successfulTasks || 0} / ${agentPerformance?.totalTasks || agentPerformance?.totalInteractions || 0} مهمة`}
                icon={Bot}
                color="purple"
              />
              <StatCard
                title="إجمالي الإيرادات المحققة"
                value={formatCurrency(revenue?.totalRevenue || 0, "EGP")}
                trend={revenue?.revenueChange}
                icon={DollarSign}
                color="blue"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-600" />
                    قيمة السلات المستردة
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">
                    {formatCurrency(recoveredCarts?.recoveredValue || 0, "EGP")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    متوسط وقت الاسترداد:{" "}
                    {recoveredCarts?.averageRecoveryTime || 0} ساعة
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-5 w-5 text-purple-600" />
                    معدل التدخل البشري
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-purple-600">
                    {formatPercentValue(agentPerformance?.takeoverRate || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {agentPerformance?.totalTakeovers || 0} تدخل من{" "}
                    {agentPerformance?.totalInteractions || 0} محادثة
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    عملاء أول طلب خلال الفترة
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">
                    {customers?.newCustomers || 0}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    معدل الاحتفاظ:{" "}
                    {formatPercentValue(customers?.retentionRate || 0)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="carts" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="سلات متروكة"
                value={recoveredCarts?.totalAbandoned || 0}
                icon={ShoppingCart}
                color="yellow"
              />
              <StatCard
                title="سلات مستردة"
                value={recoveredCarts?.totalRecovered || 0}
                icon={CheckCircle}
                color="green"
              />
              <StatCard
                title="معدل الاسترداد"
                value={formatPercentValue(recoveredCarts?.recoveryRate || 0)}
                icon={TrendingUp}
                color="blue"
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>قيمة السلات المستردة</CardTitle>
                <CardDescription>
                  إجمالي المبيعات المحققة من استرداد السلات المتروكة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-5xl font-bold text-green-600">
                    {formatCurrency(recoveredCarts?.recoveredValue || 0, "EGP")}
                  </p>
                  <p className="text-muted-foreground mt-2">
                    خلال {selectedPeriodSummary}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  متوسط وقت الاسترداد:{" "}
                  {recoveredCarts?.averageRecoveryTime || 0} ساعة
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="إجمالي التوصيلات"
                value={deliveryFailures?.totalDeliveries || 0}
                icon={Truck}
                color="blue"
              />
              <StatCard
                title="توصيلات فاشلة"
                value={deliveryFailures?.totalFailures || 0}
                icon={AlertCircle}
                color="red"
              />
              <StatCard
                title="معدل الفشل"
                value={formatPercentValue(deliveryFailures?.failureRate || 0)}
                trendGood="down"
                icon={TrendingDown}
                color="yellow"
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>أسباب الفشل</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {deliveryFailures?.failuresByReason?.length ? (
                    deliveryFailures.failuresByReason.map((item, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>{item.reason}</span>
                          <span className="text-muted-foreground">
                            {item.count} ({formatPercentValue(item.percentage)})
                          </span>
                        </div>
                        <ProgressBar
                          value={item.percentage}
                          max={100}
                          color={i === 0 ? "red" : "yellow"}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      لا توجد بيانات
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>أكثر المناطق فشلاً</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {deliveryFailures?.topFailureAreas?.length ? (
                    deliveryFailures.topFailureAreas.map((item, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center p-3 bg-muted/50 rounded-lg"
                      >
                        <span className="font-medium">{item.area}</span>
                        <Badge variant="destructive">{item.failures} فشل</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      لا توجد بيانات
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="agents" className="space-y-6">
            {aiAvailable !== "active" && aiAvailable !== "unknown" && (
              <Card
                className={
                  aiAvailable === "quota"
                    ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"
                    : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30"
                }
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Zap
                    className={cn(
                      "h-5 w-5 shrink-0",
                      aiAvailable === "quota"
                        ? "text-orange-500"
                        : "text-blue-500",
                    )}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {aiAvailable === "quota"
                        ? "تم استنفاد رصيد الذكاء الاصطناعي اليومي"
                        : "الذكاء الاصطناعي غير مفعّل"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {aiAvailable === "quota"
                        ? "البيانات المعروضة من الفترة السابقة. يتم تجديد الرصيد يومياً أو يمكنك ترقية الباقة."
                        : "فعّل الذكاء الاصطناعي لتتبع أداء الوكلاء بدقة."}
                    </p>
                  </div>
                  <a
                    href="/merchant/plan"
                    className="shrink-0 text-xs font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors"
                  >
                    ترقية الباقة
                  </a>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                title="إجمالي المهام"
                value={agentPerformance?.totalTasks || 0}
                icon={Bot}
                color="purple"
              />
              <StatCard
                title="مهام ناجحة"
                value={agentPerformance?.successfulTasks || 0}
                icon={CheckCircle}
                color="green"
              />
              <StatCard
                title="معدل النجاح"
                value={formatPercentValue(agentPerformance?.successRate || 0)}
                icon={Target}
                color="blue"
              />
              <StatCard
                title="تدخلات بشرية"
                value={agentPerformance?.totalTakeovers || 0}
                icon={Users}
                color="yellow"
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>أداء الوكلاء</CardTitle>
                <CardDescription>مقارنة أداء كل وكيل ذكي</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {agentPerformance?.byAgent?.length ? (
                    agentPerformance.byAgent.map((agent, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                            <Bot className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-medium">{agent.agent}</p>
                            <p className="text-sm text-muted-foreground">
                              {agent.tasks} مهمة
                            </p>
                          </div>
                        </div>
                        <div className="text-end">
                          <p className="font-medium">
                            {formatPercentValue(agent.successRate)} نجاح
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatPercentValue(agent.avgConfidence)} ثقة
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      لا توجد بيانات
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>استهلاك التوكنات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-4xl font-bold">
                    {formatNumber(agentPerformance?.tokenUsage?.total || 0)}
                  </p>
                  <p className="text-muted-foreground">
                    إجمالي التوكنات المستخدمة
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                title="عملاء نشطون خلال الفترة"
                value={customers?.totalCustomers || 0}
                icon={Users}
                color="blue"
              />
              <StatCard
                title="عملاء أول طلب خلال الفترة"
                value={customers?.newCustomers || 0}
                icon={TrendingUp}
                color="green"
              />
              <StatCard
                title="عملاء لديهم طلبات قبل الفترة"
                value={customers?.returningCustomers || 0}
                icon={RefreshCw}
                color="purple"
              />
              <StatCard
                title="معدل الاحتفاظ"
                value={formatPercentValue(customers?.retentionRate || 0)}
                icon={Target}
                color="yellow"
              />
            </div>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  ملاحظة: هذه الأرقام مبنية على نشاط الفترة المختارة فقط (من
                  لديه طلبات داخل الفترة). لذلك قد تختلف عن شرائح صفحة العملاء
                  العامة مثل &quot;منتظم&quot; أو &quot;جديد&quot;.
                </p>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>أفضل العملاء</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {customers?.topCustomers?.length ? (
                    customers.topCustomers.slice(0, 5).map((customer, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {customer.totalOrders} طلب
                          </p>
                        </div>
                        <p className="font-semibold text-green-600">
                          {formatCurrency(customer.totalSpent, "EGP")}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      لا توجد بيانات
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>توزيع العملاء بالمنطقة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {customers?.customersByRegion?.length ? (
                    customers.customersByRegion.slice(0, 5).map((region, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>{region.region}</span>
                          <span className="text-muted-foreground">
                            {region.count} عميل
                          </span>
                        </div>
                        <ProgressBar
                          value={region.count}
                          max={customers.customersByRegion[0]?.count || 1}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      لا توجد بيانات
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
