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
import { Progress } from "@/components/ui/progress";
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
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  Calendar,
  Wallet,
  Receipt,
  PieChart,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import portalApi from "@/lib/client";
import {
  REPORTING_PERIOD_OPTIONS,
  getStoredReportingDays,
  setStoredReportingDays,
  mapDaysToCfoPeriod,
} from "@/lib/reporting-period";

const CFO_PERIOD_OPTIONS = REPORTING_PERIOD_OPTIONS.filter((opt) =>
  [1, 7, 30, 90, 365].includes(opt.value),
);

interface CFOMetrics {
  // Revenue
  totalRevenue: number;
  realizedRevenue?: number;
  bookedSales: number;
  deliveredRevenue: number;
  pendingCollections: number;
  refundsAmount: number;
  revenueGrowth: number;
  averageOrderValue: number;
  aovGrowth: number;

  // Orders
  totalOrders: number;
  realizedOrders: number;
  ordersGrowth: number;
  cancelledOrders: number;
  cancellationRate: number;

  // Cash Flow
  cashInHand: number;
  pendingCOD: number;
  pendingOnline: number;
  totalExpenses: number;
  netCashFlow: number;

  // Inventory
  inventoryValue: number;
  slowMovingValue: number;
  turnoverRate: number;
  hasInventoryData: boolean;

  // Customers
  totalCustomers: number;
  newCustomers: number;
  repeatCustomerRate: number;
  customerLifetimeValue: number;

  // Alerts
  alerts: Array<{
    id: string;
    type: "warning" | "danger" | "info";
    message: string;
    action?: string;
  }>;

  // Top Products
  topProducts: Array<{
    name: string;
    revenue: number;
    units: number;
    margin: number;
  }>;

  // Expenses by Category
  expensesByCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const n =
    typeof value === "string" ? Number(value) : Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function toSafeInt(value: unknown, fallback = 0): number {
  return Math.max(0, Math.round(toSafeNumber(value, fallback)));
}

function roundTo(value: number, digits = 1): number {
  const n = toSafeNumber(value, 0);
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function toAlertType(severity: unknown): "warning" | "danger" | "info" {
  const normalized = String(severity || "").toLowerCase();
  if (
    normalized === "critical" ||
    normalized === "danger" ||
    normalized === "error"
  )
    return "danger";
  if (normalized === "warning" || normalized === "warn") return "warning";
  return "info";
}

function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  format = "currency",
  subtitle,
}: {
  title: string;
  value: number;
  change?: number;
  icon: any;
  format?: "currency" | "number" | "percent";
  subtitle?: string;
}) {
  const safeValue = toSafeNumber(value, 0);
  const safeChange = change === undefined ? undefined : toSafeNumber(change, 0);
  const formattedValue =
    format === "currency"
      ? formatCurrency(safeValue)
      : format === "percent"
        ? `${roundTo(safeValue, 1).toFixed(1)}%`
        : formatNumber(safeValue, {
            maximumFractionDigits: Number.isInteger(safeValue) ? 0 : 2,
          });

  return (
    <Card className="app-data-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-700">
          {title}
        </CardTitle>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-muted/60 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-950">
          {formattedValue}
        </div>
        {safeChange !== undefined && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            {safeChange >= 0 ? (
              <TrendingUp className="h-3 w-3 text-emerald-600" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-600" />
            )}
            <span
              className={safeChange >= 0 ? "text-emerald-700" : "text-red-700"}
            >
              {safeChange >= 0 ? "+" : ""}
              {roundTo(safeChange, 1).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">
              مقارنة بالفترة السابقة
            </span>
          </div>
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function AlertCard({
  type,
  message,
  action,
}: {
  type: "warning" | "danger" | "info";
  message: string;
  action?: string;
}) {
  const config = {
    warning: {
      icon: AlertTriangle,
      color: "border-amber-200 bg-amber-50",
      iconColor: "text-amber-600",
    },
    danger: {
      icon: AlertTriangle,
      color: "border-red-200 bg-red-50",
      iconColor: "text-red-600",
    },
    info: {
      icon: CheckCircle2,
      color: "border-blue-200 bg-blue-50",
      iconColor: "text-blue-600",
    },
  };

  const Icon = config[type].icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        config[type].color,
      )}
    >
      <Icon className={cn("h-5 w-5 mt-0.5", config[type].iconColor)} />
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
        {action && (
          <Button variant="link" size="sm" className="p-0 h-auto text-xs">
            {action}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function CFOBriefPage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState<number>(() => {
    const stored = getStoredReportingDays(30);
    return CFO_PERIOD_OPTIONS.some((opt) => opt.value === stored) ? stored : 30;
  });
  const [metrics, setMetrics] = useState<CFOMetrics | null>(null);
  const [aiBrief, setAiBrief] = useState<{
    data: Record<string, any>;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
  } | null>(null);
  const [aiBriefError, setAiBriefError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    try {
      setLoading(true);

      const apiPeriod = mapDaysToCfoPeriod(periodDays);
      const data = await portalApi.getCfoReport(apiPeriod);

      // Fetch AI-generated weekly brief in parallel (non-blocking)
      portalApi
        .getCfoAiBrief()
        .then((res) => {
          if (res.available && res.brief) {
            setAiBrief(res.brief as any);
            setAiBriefError(null);
          }
        })
        .catch((err: any) => {
          const errMsg = err?.message || err?.error || "";
          const isQuotaError =
            typeof errMsg === "string" &&
            (errMsg.includes("AI_QUOTA_EXHAUSTED") ||
              errMsg.includes("AI_NOT_ENABLED") ||
              errMsg.includes("AI_TEMPORARILY_UNAVAILABLE") ||
              errMsg.includes("AI_LIMIT_EXCEEDED") ||
              errMsg.includes("Token budget exceeded") ||
              errMsg.includes("budget"));
          if (isQuotaError) {
            setAiBriefError("quota");
          }
          // Non-quota errors are silently ignored (AI brief is optional)
        });

      // Transform API data to match CFOMetrics interface
      const summary = (data as Record<string, any>)?.summary ?? {};
      const orders = (data as Record<string, any>)?.orders ?? {};
      const cashFlow = (data as Record<string, any>)?.cashFlow ?? {};
      const customers = (data as Record<string, any>)?.customers ?? {};
      const alertsRaw = Array.isArray((data as Record<string, any>)?.alerts)
        ? (data as Record<string, any>).alerts
        : [];
      const topProductsRaw = Array.isArray(
        (data as Record<string, any>)?.topProducts,
      )
        ? (data as Record<string, any>).topProducts
        : [];
      const expenseBreakdownRaw = Array.isArray(
        (data as Record<string, any>)?.expenseBreakdown,
      )
        ? (data as Record<string, any>).expenseBreakdown
        : [];

      const normalizedExpenses = expenseBreakdownRaw.map((expense: any) => ({
        category: String(expense?.category || "أخرى"),
        amount: Math.max(0, toSafeNumber(expense?.amount, 0)),
      }));
      const expensesTotalFromBreakdown = normalizedExpenses.reduce(
        (sum: number, row: { amount: number }) => sum + row.amount,
        0,
      );

      const totalOrders = toSafeInt(orders.total ?? summary.orderCount, 0);
      const realizedOrders = toSafeInt(
        summary.realizedOrders ?? orders.delivered,
        0,
      );
      const cancelledOrders =
        toSafeInt(orders.cancelled, 0) + toSafeInt(orders.returned, 0);
      const cancellationRate =
        totalOrders > 0 ? roundTo((cancelledOrders / totalOrders) * 100, 1) : 0;

      const transformedMetrics: CFOMetrics = {
        // Revenue
        totalRevenue: toSafeNumber(
          summary.realizedRevenue ?? summary.revenue,
          0,
        ),
        realizedRevenue: toSafeNumber(
          summary.realizedRevenue ?? summary.revenue,
          0,
        ),
        bookedSales: toSafeNumber(summary.bookedSales, 0),
        deliveredRevenue: toSafeNumber(summary.deliveredRevenue, 0),
        pendingCollections: toSafeNumber(summary.pendingCollections, 0),
        refundsAmount: toSafeNumber(cashFlow.refundsAmount, 0),
        revenueGrowth: toSafeNumber(summary.revenueGrowth, 0),
        averageOrderValue: toSafeNumber(summary.aov, 0),
        aovGrowth: 0, // Not provided by API yet

        // Orders
        totalOrders,
        realizedOrders,
        ordersGrowth: toSafeNumber(summary.orderGrowth, 0),
        cancelledOrders,
        cancellationRate,

        // Cash Flow
        cashInHand: toSafeNumber(cashFlow.cashInHand, 0),
        pendingCOD: toSafeNumber(cashFlow.pendingCod ?? 0, 0),
        pendingOnline: toSafeNumber(cashFlow.pendingOnline ?? 0, 0),
        totalExpenses: Math.max(
          0,
          toSafeNumber(cashFlow.expenses, expensesTotalFromBreakdown),
        ),
        netCashFlow: toSafeNumber(cashFlow.netCashFlow ?? cashFlow.profit, 0),

        // Inventory - use API data or 0 (not fabricated heuristics)
        inventoryValue: Math.max(
          0,
          toSafeNumber(
            (data as Record<string, any>).inventory?.totalValue ?? 0,
            0,
          ),
        ),
        slowMovingValue: Math.max(
          0,
          toSafeNumber(
            (data as Record<string, any>).inventory?.slowMovingValue ?? 0,
            0,
          ),
        ),
        turnoverRate: Math.max(
          0,
          toSafeNumber(
            (data as Record<string, any>).inventory?.turnoverRate ?? 0,
            0,
          ),
        ),
        hasInventoryData:
          (data as Record<string, any>).inventory?.available === true,

        // Customers - use API data or 0 (not fabricated heuristics)
        totalCustomers: toSafeInt(
          customers.totalCount ?? summary.uniqueCustomers ?? 0,
          0,
        ),
        newCustomers: toSafeInt(customers.newCount ?? 0, 0),
        repeatCustomerRate: roundTo(
          toSafeNumber(
            customers.repeatRate ??
              (toSafeInt(summary.uniqueCustomers, 0) > 0 &&
              toSafeInt(summary.orderCount, 0) >
                toSafeInt(summary.uniqueCustomers, 0)
                ? ((toSafeInt(summary.orderCount, 0) -
                    toSafeInt(summary.uniqueCustomers, 0)) /
                    toSafeInt(summary.orderCount, 0)) *
                  100
                : 0),
            0,
          ),
          1,
        ),
        customerLifetimeValue: Math.max(
          0,
          toSafeNumber(customers.avgLtv ?? 0, 0),
        ),

        // Alerts from API
        alerts: alertsRaw.map((alert: any, idx: number) => ({
          id: String(idx),
          type: toAlertType(alert?.severity),
          message: String(alert?.message || "تنبيه"),
        })),

        // Top Products from API
        topProducts: topProductsRaw
          .map((product: any) => ({
            name: String(product?.name || "منتج"),
            revenue: Math.max(0, toSafeNumber(product?.revenue, 0)),
            units: toSafeInt(product?.quantity, 0),
            margin: 0,
          }))
          .filter((product: any) => product.units > 0 || product.revenue > 0),

        // Expenses by Category from API
        expensesByCategory: normalizedExpenses
          .map((expense: { category: string; amount: number }) => ({
            category: expense.category,
            amount: expense.amount,
            percentage:
              expensesTotalFromBreakdown > 0
                ? roundTo(
                    (expense.amount / expensesTotalFromBreakdown) * 100,
                    1,
                  )
                : 0,
          }))
          .filter((expense: { amount: number }) => expense.amount > 0),
      };

      setMetrics(transformedMetrics);
    } catch (error) {
      console.error("Failed to fetch CFO metrics:", error);
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, periodDays]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading || !metrics) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4 sm:p-6">
        <div className="app-data-card px-5 py-4 text-sm text-muted-foreground">
          جاري تحميل التقرير...
        </div>
      </div>
    );
  }

  const realizedRevenue = toSafeNumber(
    metrics.realizedRevenue ?? metrics.totalRevenue,
    0,
  );
  const aiBriefRevenue = toSafeNumber(
    aiBrief?.data?.realizedRevenue ?? aiBrief?.data?.totalRevenue,
    0,
  );

  return (
    <div className="app-page-frame space-y-5 animate-fadeIn p-4 pb-8 sm:p-6">
      <PageHeader
        title="ملخص المدير المالي"
        description="نظرة مالية وتشغيلية أوضح مبنية على نفس الأرقام الخلفية الحالية."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Select
              value={String(periodDays)}
              onValueChange={(value) => {
                const next = Number(value);
                setPeriodDays(next);
                setStoredReportingDays(next);
              }}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CFO_PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMetrics}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                const printArea = document.getElementById("cfo-report");
                if (!printArea) return;
                const w = window.open("", "_blank");
                if (!w) return;
                const periodLabel =
                  CFO_PERIOD_OPTIONS.find((opt) => opt.value === periodDays)
                    ?.label || `آخر ${periodDays} يوم`;
                w.document
                  .write(`<!DOCTYPE html><html dir="rtl"><head><title>تقرير CFO - ${periodLabel}</title>
                <style>body{font-family:system-ui,sans-serif;padding:2rem;direction:rtl}
                table{width:100%;border-collapse:collapse;margin:1rem 0}
                th,td{border:1px solid #ddd;padding:8px;text-align:right}
                th{background:#f5f5f5}.header{text-align:center;margin-bottom:2rem}
                @media print{body{padding:0}}</style></head><body>`);
                w.document.write(
                  `<div class="header"><h1>التقرير المالي التنفيذي</h1><p>${periodLabel}</p><p>${new Date().toLocaleDateString("ar-EG")}</p></div>`,
                );
                w.document
                  .write(`<table><tr><th>المقياس</th><th>القيمة</th></tr>
                <tr><td>إجمالي الإيرادات المحققة</td><td>${formatCurrency(realizedRevenue)}</td></tr>
                <tr><td>إجمالي الطلبات (كل الحالات)</td><td>${metrics.totalOrders}</td></tr>
                <tr><td>الطلبات المحققة</td><td>${metrics.realizedOrders}</td></tr>
                <tr><td>متوسط قيمة الطلب</td><td>${formatCurrency(metrics.averageOrderValue)}</td></tr>
                <tr><td>صافي التدفق النقدي</td><td>${formatCurrency(metrics.netCashFlow)}</td></tr>
                <tr><td>COD معلق</td><td>${formatCurrency(metrics.pendingCOD)}</td></tr>
                <tr><td>قيمة المخزون</td><td>${formatCurrency(metrics.inventoryValue)}</td></tr>
                <tr><td>إجمالي العملاء</td><td>${metrics.totalCustomers}</td></tr>
                <tr><td>نسبة العملاء المتكررين</td><td>${metrics.repeatCustomerRate}%</td></tr>
                <tr><td>إجمالي المصروفات</td><td>${formatCurrency(metrics.totalExpenses)}</td></tr>
              </table>`);
                if (metrics.alerts.length > 0) {
                  w.document.write("<h2>تنبيهات</h2><ul>");
                  metrics.alerts.forEach((a) =>
                    w.document.write(`<li>${a.message}</li>`),
                  );
                  w.document.write("</ul>");
                }
                w.document.write("</body></html>");
                w.document.close();
                w.print();
              }}
            >
              <Download className="h-4 w-4 ml-2" />
              PDF
            </Button>
          </div>
        }
      />

      <Card className="app-filter-card app-filter-card--muted border-[color:color-mix(in_srgb,var(--accent)_14%,var(--border-strong))] bg-[color:color-mix(in_srgb,var(--accent-muted)_78%,var(--surface))]">
        <CardContent className="space-y-1 pt-4 text-sm">
          <p className="font-medium text-[var(--accent)]">
            مصدر الأرقام في هذا التقرير
          </p>
          <p className="text-[var(--text-primary)]">
            الأرقام المحاسبية أدناه محسوبة مباشرة من بيانات قاعدة البيانات
            (الطلبات، المدفوعات، المصروفات، المخزون).
          </p>
          <p className="text-[var(--text-muted)]">
            يستخدم هذا التقرير نفس تعريف الإيراد المحقق المستخدم في لوحة التحكم:
            مبالغ مدفوعة ومحصلة فعلياً، وليس كل الطلبات المحجوزة.
          </p>
        </CardContent>
      </Card>

      {/* Alerts Section */}
      {metrics.alerts.length > 0 && (
        <Card className="app-data-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              تنبيهات تحتاج اهتمامك
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {metrics.alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                type={alert.type}
                message={alert.message}
                action={alert.action}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI-Generated Weekly CFO Brief (interpretation layer, not source of record) */}
      {aiBriefError === "quota" && !aiBrief && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <Sparkles className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                تم استنفاد رصيد الذكاء الاصطناعي اليومي
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                الملخص الأسبوعي بالذكاء الاصطناعي غير متاح حالياً. يتم تجديد
                الرصيد يومياً أو يمكنك ترقية الباقة.
              </p>
            </div>
            <a
              href="/merchant/plan"
              className="inline-flex w-full items-center justify-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 sm:w-auto"
            >
              ترقية الباقة
            </a>
          </CardContent>
        </Card>
      )}
      {aiBrief && (
        <Card className="app-data-card border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border-strong))] bg-[var(--accent-muted)]">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-700" />
                الملخص الأسبوعي بالذكاء الاصطناعي
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {new Date(aiBrief.generatedAt).toLocaleDateString("ar-EG")}
              </Badge>
            </div>
            <CardDescription>
              الفترة:{" "}
              {new Date(aiBrief.periodStart).toLocaleDateString("ar-EG")} -{" "}
              {new Date(aiBrief.periodEnd).toLocaleDateString("ar-EG")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-center">
                <div className="text-xl font-bold text-emerald-700">
                  {formatCurrency(aiBriefRevenue)}
                </div>
                <div className="text-xs text-muted-foreground">
                  الإيرادات المحققة للأسبوع
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-center">
                <div className="text-xl font-bold text-blue-700">
                  {(aiBrief.data.paidOrders ?? 0).toLocaleString("ar-EG")}
                </div>
                <div className="text-xs text-muted-foreground">
                  طلبات مدفوعة
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-center">
                <div className="text-xl font-bold text-amber-700">
                  {formatCurrency(aiBrief.data.pendingPayments ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  مدفوعات معلقة
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-center">
                <div className="text-xl font-bold text-slate-950">
                  {formatCurrency(aiBrief.data.averageOrderValue ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  متوسط قيمة الطلب
                </div>
              </div>
            </div>
            {aiBrief.data.codPendingAmount > 0 && (
              <div className="mt-3 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 sm:flex-row sm:items-center">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  COD قيد التحصيل:{" "}
                  {formatCurrency(aiBrief.data.codPendingAmount)}
                </span>
              </div>
            )}
            {aiBrief.data.refundsCount > 0 && (
              <div className="mt-2 flex flex-col gap-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 sm:flex-row sm:items-center">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  مرتجعات: {aiBrief.data.refundsCount} (
                  {formatCurrency(aiBrief.data.refundsAmount ?? 0)})
                </span>
              </div>
            )}
            {aiBrief.data.paymentMethodBreakdown &&
              Object.keys(aiBrief.data.paymentMethodBreakdown).length > 0 && (
                <div className="mt-3 text-sm text-muted-foreground">
                  <span className="font-medium">طرق الدفع: </span>
                  {Object.entries(aiBrief.data.paymentMethodBreakdown).map(
                    ([method, amount], i) => (
                      <span key={method}>
                        {i > 0 && " • "}
                        {method}: {formatCurrency(amount as number)}
                      </span>
                    ),
                  )}
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* Revenue & Orders */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="إجمالي الإيرادات المحققة"
          value={realizedRevenue}
          change={metrics.revenueGrowth}
          icon={DollarSign}
        />
        <MetricCard
          title="الطلبات المحققة"
          value={metrics.realizedOrders}
          change={metrics.ordersGrowth}
          icon={ShoppingCart}
          format="number"
          subtitle={`من أصل ${formatNumber(metrics.totalOrders, { maximumFractionDigits: 0 })} طلب`}
        />
        <MetricCard
          title="متوسط قيمة الطلب"
          value={metrics.averageOrderValue}
          change={metrics.aovGrowth}
          icon={Receipt}
        />
        <MetricCard
          title="نسبة الإلغاء"
          value={metrics.cancellationRate}
          icon={Package}
          format="percent"
          subtitle={`${metrics.cancelledOrders} طلب ملغي/مرتجع`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="إجمالي المبيعات المحجوزة"
          value={metrics.bookedSales}
          icon={Wallet}
        />
        <MetricCard
          title="الإيراد من الطلبات المسلّمة"
          value={metrics.deliveredRevenue}
          icon={Package}
        />
        <MetricCard
          title="مبالغ قيد التحصيل"
          value={metrics.pendingCollections}
          icon={TrendingDown}
        />
        <MetricCard
          title="إجمالي المرتجعات"
          value={metrics.refundsAmount}
          icon={AlertTriangle}
        />
      </div>

      {/* Cash Flow */}
      <Card className="app-data-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            التدفق النقدي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-700">
                {formatCurrency(metrics.cashInHand)}
              </div>
              <div className="text-sm text-muted-foreground">نقدي متاح</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-700">
                {formatCurrency(metrics.pendingCOD)}
              </div>
              <div className="text-sm text-muted-foreground">
                COD قيد التسوية
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">
                {formatCurrency(metrics.pendingOnline)}
              </div>
              <div className="text-sm text-muted-foreground">
                دفع إلكتروني قيد المعالجة
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-700">
                {formatCurrency(metrics.totalExpenses)}
              </div>
              <div className="text-sm text-muted-foreground">
                إجمالي المصروفات
              </div>
            </div>
            <div className="border-t-2 border-primary pt-4 text-center sm:border-t-0 sm:border-r-2 sm:pt-0 sm:pr-4">
              <div className="text-2xl font-bold">
                {formatCurrency(metrics.netCashFlow)}
              </div>
              <div className="text-sm text-muted-foreground">صافي التدفق</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Top Products */}
        <Card className="app-data-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              أعلى المنتجات مبيعاً
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.topProducts.length > 0 ? (
              <div className="space-y-4">
                {metrics.topProducts.map((product, index) => (
                  <div
                    key={index}
                    className="app-mini-surface px-3 py-2 sm:flex sm:items-center sm:justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatNumber(product.units, {
                          maximumFractionDigits: 0,
                        })}{" "}
                        وحدة
                        {product.margin > 0
                          ? ` • هامش ${formatNumber(product.margin, { maximumFractionDigits: 1 })}%`
                          : ""}
                      </div>
                    </div>
                    <div className="text-start sm:text-right">
                      <div className="font-bold">
                        {formatCurrency(product.revenue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-6">
                لا توجد بيانات منتجات في الفترة المحددة
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses Breakdown */}
        <Card className="app-data-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              توزيع المصروفات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.expensesByCategory.length > 0 ? (
              <div className="space-y-4">
                {metrics.expensesByCategory.map((expense, index) => (
                  <div key={index} className="app-mini-surface px-3 py-2">
                    <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium">
                        {expense.category}
                      </span>
                      <span className="text-sm">
                        {formatCurrency(expense.amount)} (
                        {formatNumber(expense.percentage, {
                          maximumFractionDigits: 1,
                        })}
                        %)
                      </span>
                    </div>
                    <Progress
                      value={Math.max(0, Math.min(100, expense.percentage))}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-6">
                لا توجد بيانات مصروفات للفترة المحددة
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inventory & Customers */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="قيمة المخزون"
          value={metrics.inventoryValue}
          icon={Package}
          subtitle={
            metrics.hasInventoryData
              ? `${formatCurrency(metrics.slowMovingValue)} بطيء الحركة`
              : "لا توجد بيانات مخزون بعد"
          }
        />
        <MetricCard
          title="معدل دوران المخزون"
          value={metrics.turnoverRate}
          icon={TrendingUp}
          format="number"
          subtitle={
            metrics.hasInventoryData ? "مرات/شهر" : "لا توجد بيانات كافية"
          }
        />
        <MetricCard
          title="عملاء جدد"
          value={metrics.newCustomers}
          icon={Users}
          format="number"
          subtitle={`من أصل ${metrics.totalCustomers.toLocaleString("ar-EG")} عميل`}
        />
        <MetricCard
          title="معدل تكرار الشراء"
          value={metrics.repeatCustomerRate}
          icon={TrendingUp}
          format="percent"
          subtitle={`CLV: ${formatCurrency(metrics.customerLifetimeValue)}`}
        />
      </div>
    </div>
  );
}
