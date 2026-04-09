"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  DollarSign,
  ReceiptText,
  BarChart3,
  RefreshCw,
  PackageOpen,
  Percent,
  Building2,
  Minus,
  Settings,
  Clock,
  Package,
  Bell,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { AreaChart, BarChart, PieChart } from "@/components/charts";
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { type Branch, type BranchSummary, branchesApi } from "@/lib/client";

const PERIOD_OPTIONS = [
  { label: "7 أيام", value: "7" },
  { label: "30 يوم", value: "30" },
  { label: "60 يوم", value: "60" },
  { label: "90 يوم", value: "90" },
];

function TrendIcon({ change }: { change: number }) {
  if (change > 0)
    return <TrendingUp className="h-4 w-4 text-green-500 inline ml-1" />;
  if (change < 0)
    return <TrendingDown className="h-4 w-4 text-red-500 inline ml-1" />;
  return <Minus className="h-4 w-4 text-muted-foreground inline ml-1" />;
}

function ChangeLabel({ change }: { change: number }) {
  if (change === 0) return null;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        change > 0 ? "text-green-600" : "text-red-500",
      )}
    >
      <TrendIcon change={change} />
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export default function BranchAnalyticsPage() {
  const params = useParams<{ branchId: string }>();
  const branchId = params.branchId;
  const router = useRouter();
  const { apiKey } = useMerchant();
  const { toast } = useToast();

  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [summary, setSummary] = useState<BranchSummary | null>(null);
  const [revenueByDay, setRevenueByDay] = useState<
    Array<{ date: string; revenue: number; orders: number }>
  >([]);
  const [topProducts, setTopProducts] = useState<
    Array<{ name: string; revenue: number; quantity: number }>
  >([]);
  const [expensesBreakdown, setExpensesBreakdown] = useState<
    Array<{ category: string; total: number; count: number; pct: number }>
  >([]);
  const [goals, setGoals] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    if (!apiKey) return;
    try {
      setLoading(true);

      const [
        branchData,
        summaryData,
        revData,
        productsData,
        expData,
        goalsData,
      ] = await Promise.allSettled([
        branchId !== "all"
          ? branchesApi.get(apiKey, branchId)
          : Promise.resolve(null),
        branchesApi.getSummary(apiKey, branchId, parseInt(days)),
        branchesApi.getRevenueByDay(apiKey, branchId, parseInt(days)),
        branchesApi.getTopProducts(apiKey, branchId, parseInt(days)),
        branchesApi.getExpensesBreakdown(apiKey, branchId, parseInt(days)),
        branchId !== "all"
          ? branchesApi.listGoals(apiKey, branchId, true)
          : Promise.resolve({ data: [] }),
      ]);

      if (branchData.status === "fulfilled" && branchData.value) {
        setBranch(branchData.value as Branch);
      }
      if (summaryData.status === "fulfilled") {
        setSummary(summaryData.value);
      }
      if (revData.status === "fulfilled") {
        setRevenueByDay(revData.value.series);
      }
      if (productsData.status === "fulfilled") {
        setTopProducts(productsData.value.products);
      }
      if (expData.status === "fulfilled") {
        setExpensesBreakdown(expData.value.categories);
      }
      if (goalsData.status === "fulfilled") {
        setGoals((goalsData.value as any).data ?? []);
      }
    } catch {
      toast({ title: "تعذر تحميل بيانات الفرع", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, branchId, days, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const branchName =
    branchId === "all" ? "جميع الفروع" : (branch?.name ?? "تحميل...");
  const realizedRevenue = summary?.realizedRevenue ?? summary?.revenue ?? 0;

  // Chart data
  const revenueChartData = revenueByDay.map((r) => ({
    name: r.date.slice(5), // MM-DD
    value: r.revenue,
  }));

  const ordersChartData = revenueByDay.map((r) => ({
    name: r.date.slice(5),
    طلبات: r.orders,
  }));

  const expPieData = expensesBreakdown.map((e, i) => ({
    name: e.category,
    value: e.total,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Branch sub-navigation tabs */}
      <div className="grid grid-cols-2 gap-2 border-b pb-0 sm:grid-cols-3 xl:grid-cols-6">
        <Link
          href={`/merchant/branches/${branchId}`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-primary px-4 py-2 text-center text-sm font-medium text-primary"
        >
          <BarChart3 className="h-4 w-4" />
          التحليلات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/settings`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          الإعدادات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/shifts`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Clock className="h-4 w-4" />
          الجلسات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/inventory`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Package className="h-4 w-4" />
          المخزون
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/alerts`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          التنبيهات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/pl-report`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-4 w-4" />
          تقرير الأرباح
        </Link>
      </div>

      <PageHeader
        title={branchName}
        description={`تحليلات الأداء - آخر ${days} يوم`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/merchant/branches")}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 ml-1" />
              الفروع
            </Button>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-full sm:w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAll}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <KPIGrid>
        <StatCard
          title="الإيرادات المحققة"
          value={formatCurrency(realizedRevenue)}
          change={summary?.revenueChange}
          changeLabel="مقارنة بالفترة السابقة"
          icon={<DollarSign className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="إجمالي الطلبات"
          value={formatNumber(summary?.totalOrders ?? 0)}
          change={undefined}
          icon={<ShoppingCart className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="متوسط قيمة الطلب"
          value={formatCurrency(summary?.avgOrderValue ?? 0)}
          change={undefined}
          icon={<BarChart3 className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="صافي الربح"
          value={formatCurrency(summary?.netProfit ?? 0)}
          change={undefined}
          icon={<TrendingUp className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="إجمالي المصاريف"
          value={formatCurrency(summary?.totalExpenses ?? 0)}
          change={undefined}
          icon={<ReceiptText className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="هامش الربح"
          value={`${(summary?.margin ?? 0).toFixed(1)}%`}
          change={undefined}
          icon={<Percent className="h-5 w-5" />}
          loading={loading}
        />
      </KPIGrid>

      {/* Revenue trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الإيرادات اليومية</CardTitle>
            <CardDescription>
              مجموع الإيرادات المحققة يومياً خلال الفترة
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : revenueChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                لا توجد بيانات
              </div>
            ) : (
              <AreaChart
                data={revenueChartData}
                height={200}
                color="#22c55e"
                title=""
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الطلبات اليومية</CardTitle>
            <CardDescription>عدد الطلبات المكتملة يومياً</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : ordersChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                لا توجد بيانات
              </div>
            ) : (
              <BarChart
                data={ordersChartData}
                height={200}
                title=""
                bars={[{ dataKey: "طلبات", color: "#6366f1", name: "طلبات" }]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products + Expenses */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top Products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-primary" />
              أفضل المنتجات
            </CardTitle>
            <CardDescription>
              المنتجات الأعلى مبيعاً في هذا الفرع
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                لا توجد منتجات في هذه الفترة
              </p>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {topProducts.slice(0, 8).map((product, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <p className="font-medium text-sm">{product.name}</p>
                      <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-muted-foreground">الكمية</p>
                          <p>{formatNumber(product.quantity)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">الإيرادات</p>
                          <p className="font-medium text-green-600">
                            {formatCurrency(product.revenue)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المنتج</TableHead>
                        <TableHead className="text-right">الكمية</TableHead>
                        <TableHead className="text-right">الإيرادات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.slice(0, 8).map((product, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm max-w-[140px] truncate">
                            {product.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatNumber(product.quantity)}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-green-600">
                            {formatCurrency(product.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Expenses Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" />
              توزيع المصاريف
            </CardTitle>
            <CardDescription>تفصيل المصاريف حسب الفئة</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : expensesBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                لا توجد مصاريف في هذه الفترة
              </p>
            ) : (
              <div className="space-y-3">
                <PieChart data={expPieData} height={160} title="" />
                <div className="space-y-1.5 mt-2">
                  {expensesBreakdown.map((exp, i) => (
                    <div
                      key={exp.category}
                      className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                        <span className="truncate text-muted-foreground">
                          {exp.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 self-start shrink-0 sm:self-auto">
                        <Badge variant="outline" className="text-xs">
                          {exp.pct.toFixed(0)}%
                        </Badge>
                        <span className="font-medium">
                          {formatCurrency(exp.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick metrics summary */}
      {summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              ملخص الأداء المالي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-muted-foreground">طلبات مكتملة</p>
                <p className="font-semibold text-lg">
                  {formatNumber(summary.completedOrders)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">طلبات ملغاة</p>
                <p className="font-semibold text-lg text-red-500">
                  {formatNumber(summary.cancelledOrders)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">رسوم توصيل</p>
                <p className="font-semibold text-lg">
                  {formatCurrency(summary.deliveryFeesCollected)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">إجمالي الخصومات</p>
                <p className="font-semibold text-lg text-amber-600">
                  {formatCurrency(summary.discountsGiven)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals Progress */}
      {goals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" />
              الأهداف والمستهدفات
            </CardTitle>
            <CardDescription>تقدم الفرع نحو الأهداف المحددة</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {goals.map((goal) => (
                <div key={goal.id} className="space-y-1.5">
                  <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">
                      {goal.period_type === "MONTHLY"
                        ? "هدف شهري"
                        : goal.period_type === "WEEKLY"
                          ? "هدف أسبوعي"
                          : goal.period_type === "QUARTERLY"
                            ? "هدف ربعي"
                            : "هدف سنوي"}
                      {" - "}
                      <span className="text-muted-foreground text-xs">
                        {goal.start_date} → {goal.end_date}
                      </span>
                    </span>
                  </div>
                  {goal.target_revenue != null && (
                    <div className="space-y-0.5">
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between">
                        <span>الإيراد</span>
                        <span>
                          {formatCurrency(goal.actual_revenue ?? 0)} /{" "}
                          {formatCurrency(goal.target_revenue)}
                          {goal.revenue_pct != null && (
                            <Badge
                              variant={
                                goal.revenue_pct >= 100 ? "default" : "outline"
                              }
                              className="mr-1 text-[10px] px-1 py-0"
                            >
                              {goal.revenue_pct}%
                            </Badge>
                          )}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            (goal.revenue_pct ?? 0) >= 100
                              ? "bg-green-500"
                              : (goal.revenue_pct ?? 0) >= 70
                                ? "bg-amber-500"
                                : "bg-primary",
                          )}
                          style={{
                            width: `${Math.min(100, goal.revenue_pct ?? 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {goal.target_orders != null && (
                    <div className="space-y-0.5">
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between">
                        <span>الطلبات</span>
                        <span>
                          {goal.actual_orders ?? 0} / {goal.target_orders} طلب
                          {goal.orders_pct != null && (
                            <Badge
                              variant={
                                goal.orders_pct >= 100 ? "default" : "outline"
                              }
                              className="mr-1 text-[10px] px-1 py-0"
                            >
                              {goal.orders_pct}%
                            </Badge>
                          )}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            (goal.orders_pct ?? 0) >= 100
                              ? "bg-green-500"
                              : (goal.orders_pct ?? 0) >= 70
                                ? "bg-amber-500"
                                : "bg-primary",
                          )}
                          style={{
                            width: `${Math.min(100, goal.orders_pct ?? 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const PIE_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];
