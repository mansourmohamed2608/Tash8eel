"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/alerts";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import portalApi from "@/lib/client";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import {
  REPORTING_PERIOD_OPTIONS,
  getStoredReportingDays,
  mapDaysToCfoPeriod,
  setStoredReportingDays,
} from "@/lib/reporting-period";

const FINANCE_PERIOD_OPTIONS = REPORTING_PERIOD_OPTIONS.filter((option) =>
  [1, 7, 30, 90, 365].includes(option.value),
);

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFreshness(updatedAt: Date | null) {
  if (!updatedAt) return { label: "لم يتم التحديث", state: "old" as const };
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - updatedAt.getTime()) / 60000),
  );
  if (minutes < 1) return { label: "آخر تحديث: الآن", state: "fresh" as const };
  if (minutes <= 5) {
    return { label: `آخر تحديث: منذ ${minutes} د`, state: "fresh" as const };
  }
  if (minutes <= 30) {
    return { label: `آخر تحديث: منذ ${minutes} د`, state: "stale" as const };
  }
  return { label: "بيانات الإيرادات قديمة", state: "old" as const };
}

export default function FinanceRevenuePage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(() => {
    const stored = getStoredReportingDays(30);
    return FINANCE_PERIOD_OPTIONS.some((option) => option.value === stored)
      ? stored
      : 30;
  });
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const fetchRevenue = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    try {
      setLoading(true);
      setError(null);
      const result = await portalApi.getCfoReport(
        mapDaysToCfoPeriod(periodDays),
      );
      setData(result as Record<string, any>);
      setLastUpdatedAt(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في تحميل بيانات الإيرادات",
      );
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, periodDays]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  const revenue = useMemo(() => {
    const summary = data?.summary ?? {};
    const cashFlow = data?.cashFlow ?? {};
    const orders = data?.orders ?? {};
    const paymentMethodBreakdown = data?.paymentMethodBreakdown ?? {};

    const realizedRevenue = toNumber(
      summary.realizedRevenue ?? summary.revenue,
    );
    const bookedSales = toNumber(summary.bookedSales);
    const deliveredRevenue = toNumber(summary.deliveredRevenue);
    const pendingCollections = toNumber(summary.pendingCollections);
    const pendingCod = toNumber(cashFlow.pendingCod);
    const pendingOnline = toNumber(cashFlow.pendingOnline);
    const refundsAmount = toNumber(cashFlow.refundsAmount);
    const averageOrderValue = toNumber(summary.aov);
    const totalOrders = Math.max(0, Math.round(toNumber(orders.total)));
    const deliveredOrders = Math.max(0, Math.round(toNumber(orders.delivered)));
    const cancelledOrders =
      Math.max(0, Math.round(toNumber(orders.cancelled))) +
      Math.max(0, Math.round(toNumber(orders.returned)));

    return {
      realizedRevenue,
      bookedSales,
      deliveredRevenue,
      pendingCollections,
      pendingCod,
      pendingOnline,
      refundsAmount,
      averageOrderValue,
      totalOrders,
      deliveredOrders,
      cancelledOrders,
      paymentMethodBreakdown,
    };
  }, [data]);

  const freshness = getFreshness(lastUpdatedAt);
  const hasRevenueData =
    revenue.realizedRevenue > 0 ||
    revenue.bookedSales > 0 ||
    revenue.pendingCollections > 0 ||
    revenue.totalOrders > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="الإيرادات" />
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="الإيرادات" />
        <Card className="app-data-card border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]">
          <CardContent className="space-y-3 p-6">
            <p className="font-semibold text-[var(--color-danger-text)]">
              تعذر تحميل الإيرادات
            </p>
            <p className="text-sm text-[var(--color-danger-text)]">{error}</p>
            <Button variant="outline" onClick={fetchRevenue}>
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإيرادات"
        description="قراءة مالية لإيرادات المتجر: المحقق، المحجوز، قيد التحصيل، والمرتجعات."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select
              value={String(periodDays)}
              onValueChange={(value) => {
                const next = Number(value);
                setPeriodDays(next);
                setStoredReportingDays(next);
              }}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINANCE_PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchRevenue}>
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {[
          ["الملخص", "/merchant/finance/summary"],
          ["الإيرادات", "/merchant/finance/revenue"],
          ["المصروفات", "/merchant/expenses"],
          ["التدفق النقدي", "/merchant/reports/cash-flow"],
          ["التسويات", "/merchant/payments/cod"],
        ].map(([label, href]) => (
          <Button
            key={href}
            asChild
            variant={
              href === "/merchant/finance/revenue" ? "default" : "outline"
            }
            size="sm"
          >
            <Link href={href}>{label}</Link>
          </Button>
        ))}
      </div>

      <section className="rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              محقق:{" "}
              <strong className="font-mono text-[var(--color-success-text)]">
                {formatCurrency(revenue.realizedRevenue)}
              </strong>
            </span>
            <span className="text-[var(--color-border)]">|</span>
            <span>
              محجوز:{" "}
              <strong className="font-mono">
                {formatCurrency(revenue.bookedSales)}
              </strong>
            </span>
            <span className="text-[var(--color-border)]">|</span>
            <span>
              قيد التحصيل:{" "}
              <strong className="font-mono text-[var(--color-warning-text)]">
                {formatCurrency(revenue.pendingCollections)}
              </strong>
            </span>
          </div>
          <span
            className={
              freshness.state === "old"
                ? "text-xs text-[var(--color-danger-text)]"
                : freshness.state === "stale"
                  ? "text-xs text-[var(--color-warning-text)]"
                  : "text-xs text-[var(--color-text-secondary)]"
            }
          >
            {freshness.label}
          </span>
        </div>
      </section>

      {!hasRevenueData ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="لا توجد إيرادات للفترة المحددة"
          description="ستظهر الإيرادات بعد تسجيل طلبات مدفوعة أو تحصيل مبالغ COD."
          action={
            <Button asChild variant="outline">
              <Link href="/merchant/orders">فتح الطلبات</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "الإيراد المحقق",
                value: revenue.realizedRevenue,
                icon: Wallet,
                tone: "text-[var(--color-success-text)]",
              },
              {
                title: "الإيراد المسلم",
                value: revenue.deliveredRevenue,
                icon: ShoppingCart,
                tone: "text-[var(--color-brand-primary)]",
              },
              {
                title: "قيد التحصيل",
                value: revenue.pendingCollections,
                icon: Banknote,
                tone: "text-[var(--color-warning-text)]",
              },
              {
                title: "المرتجعات",
                value: revenue.refundsAmount,
                icon: AlertTriangle,
                tone: "text-[var(--color-danger-text)]",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="app-data-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {item.title}
                      </p>
                      <Icon className={`h-4 w-4 ${item.tone}`} />
                    </div>
                    <p className="mt-3 font-mono text-2xl font-bold">
                      {formatCurrency(item.value)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card className="app-data-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-[var(--color-brand-primary)]" />
                  جودة الإيراد
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>متوسط قيمة الطلب</span>
                  <strong className="font-mono">
                    {formatCurrency(revenue.averageOrderValue)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>طلبات إجمالية</span>
                  <strong className="font-mono">
                    {formatNumber(revenue.totalOrders)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>طلبات محققة</span>
                  <strong className="font-mono">
                    {formatNumber(revenue.deliveredOrders)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>ملغية أو مرتجعة</span>
                  <strong className="font-mono">
                    {formatNumber(revenue.cancelledOrders)}
                  </strong>
                </div>
              </CardContent>
            </Card>

            <Card className="app-data-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4 text-[var(--color-brand-primary)]" />
                  طرق الدفع والتحصيل
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>COD معلق</span>
                  <strong className="font-mono text-[var(--color-warning-text)]">
                    {formatCurrency(revenue.pendingCod)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>أونلاين معلق</span>
                  <strong className="font-mono">
                    {formatCurrency(revenue.pendingOnline)}
                  </strong>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm">
                    <Link href="/merchant/payments/cod">فتح التسويات</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/merchant/payments/proofs">إثباتات الدفع</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
