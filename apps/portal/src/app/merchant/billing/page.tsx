"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  CreditCard,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  RefreshCw,
  Check,
  Clock,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface BillingEvent {
  id: string;
  type: "subscription" | "addon" | "payment" | "refund" | "credit";
  description: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed" | "refunded";
  createdAt: string;
  planCode?: string;
  invoiceUrl?: string;
}

interface BillingSummary {
  status: string;
  subscription: {
    planCode: string;
    planName: string;
    amount: number;
    currency: string;
    nextBillingDate: string;
    status: string;
    cashierPromoEligible?: boolean;
    cashierPromoActive?: boolean;
    cashierPromoEndsAt?: string | null;
    cashierEffective?: boolean;
  } | null;
}

const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  subscription: {
    label: "اشتراك",
    icon: CreditCard,
    color: "text-[var(--accent-blue)]",
  },
  addon: {
    label: "إضافة",
    icon: ArrowUpRight,
    color: "text-[var(--accent-gold)]",
  },
  payment: {
    label: "دفعة",
    icon: DollarSign,
    color: "text-[var(--accent-success)]",
  },
  refund: {
    label: "استرداد",
    icon: ArrowDownRight,
    color: "text-[var(--accent-danger)]",
  },
  credit: {
    label: "رصيد",
    icon: DollarSign,
    color: "text-[var(--text-secondary)]",
  },
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ElementType;
  }
> = {
  paid: { label: "مدفوع", variant: "default", icon: Check },
  pending: { label: "قيد الانتظار", variant: "secondary", icon: Clock },
  failed: { label: "فشل", variant: "destructive", icon: AlertTriangle },
  refunded: { label: "مسترد", variant: "outline", icon: ArrowDownRight },
};

const formatCurrency = (amount: number, currency = "EGP") => {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency }).format(
    amount,
  );
};

const formatBillingDate = (date: string) => {
  if (!date) return "غير محدد";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "غير محدد";
  return parsed.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const normalizeBillingStatus = (
  rawStatus: unknown,
  source: "subscription" | "invoice",
): BillingEvent["status"] => {
  const status = String(rawStatus || "")
    .trim()
    .toUpperCase();

  if (source === "subscription") {
    if (["ACTIVE", "PAID", "COMPLETED"].includes(status)) return "paid";
    if (["FAILED", "CANCELLED", "EXPIRED"].includes(status)) return "failed";
    if (["REFUNDED"].includes(status)) return "refunded";
    return "pending";
  }

  if (["PAID", "SUCCEEDED", "COMPLETED", "SETTLED"].includes(status))
    return "paid";
  if (["FAILED", "VOID", "CANCELLED"].includes(status)) return "failed";
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(status)) return "refunded";
  return "pending";
};

const normalizeSubscriptionStatusLabel = (
  rawStatus: unknown,
): { label: string; active: boolean } => {
  const status = String(rawStatus || "")
    .trim()
    .toUpperCase();
  if (status === "ACTIVE") return { label: "نشط", active: true };
  if (status === "PENDING") return { label: "قيد التفعيل", active: false };
  if (status === "EXPIRED") return { label: "منتهي", active: false };
  if (status === "CANCELLED") return { label: "ملغي", active: false };
  if (status === "FAILED") return { label: "فشل", active: false };
  if (status === "PAID") return { label: "مدفوع", active: true };
  return { label: status || "غير معروف", active: false };
};

export default function BillingPage() {
  const { apiKey } = useMerchant();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summaryData = await merchantApi
        .getBillingSummary(apiKey)
        .catch(() => ({ status: "NOT_CONFIGURED", subscription: null }));

      // Map raw DB fields to frontend interface
      let mapped: BillingSummary = {
        status: summaryData.status,
        subscription: null,
      };
      if (summaryData.subscription) {
        const sub = summaryData.subscription;
        mapped.subscription = {
          planCode: sub.planCode || sub.plan_code || "",
          planName: sub.planName || sub.plan_name || "",
          amount:
            sub.amount ?? (sub.price_cents != null ? sub.price_cents / 100 : 0),
          currency: sub.currency || "EGP",
          nextBillingDate: sub.nextBillingDate || sub.current_period_end || "",
          status: sub.status || "pending",
          cashierPromoEligible: Boolean(sub.cashierPromoEligible),
          cashierPromoActive: Boolean(sub.cashierPromoActive),
          cashierPromoEndsAt: sub.cashierPromoEndsAt || null,
          cashierEffective: Boolean(sub.cashierEffective),
        };
      }
      setSummary(mapped);

      // Fetch billing history
      try {
        const historyData = await merchantApi.getBillingHistory(apiKey);
        const rawEvents: BillingEvent[] = [
          ...(historyData.subscriptions || []).map((s: any) => ({
            id: `subscription:${s.id}`,
            type: "subscription" as const,
            description: `اشتراك في باقة ${s.plan_name || s.planName || ""}`,
            amount:
              s.price_cents != null
                ? s.price_cents / 100
                : Number(s.amount || 0),
            currency: s.currency || "EGP",
            status: normalizeBillingStatus(s.status, "subscription"),
            createdAt: String(s.created_at || s.createdAt || ""),
            planCode: s.plan_code || s.planCode,
          })),
          ...(historyData.invoices || []).map((inv: any) => ({
            id: `invoice:${inv.id}`,
            type: "payment" as const,
            description: "فاتورة",
            amount:
              inv.amount_cents != null
                ? inv.amount_cents / 100
                : Number(inv.amount || 0),
            currency: inv.currency || "EGP",
            status: normalizeBillingStatus(inv.status, "invoice"),
            createdAt: String(inv.created_at || inv.createdAt || ""),
          })),
        ];

        const deduped = new Map<string, BillingEvent>();
        for (const event of rawEvents) {
          const dayKey = event.createdAt
            ? event.createdAt.slice(0, 10)
            : "unknown";
          const dedupeKey =
            event.type === "subscription"
              ? `subscription:${event.planCode || ""}:${event.status}:${event.amount}:${dayKey}`
              : event.id;
          const existing = deduped.get(dedupeKey);
          if (!existing) {
            deduped.set(dedupeKey, event);
            continue;
          }

          const existingTime = new Date(existing.createdAt).getTime();
          const eventTime = new Date(event.createdAt).getTime();
          if (eventTime > existingTime) {
            deduped.set(dedupeKey, event);
          }
        }

        const mappedEvents = Array.from(deduped.values()).sort((a, b) => {
          const left = new Date(a.createdAt).getTime();
          const right = new Date(b.createdAt).getTime();
          return (
            (Number.isFinite(right) ? right : 0) -
            (Number.isFinite(left) ? left : 0)
          );
        });

        setEvents(mappedEvents);
      } catch {
        // Billing history not critical
      }
    } catch (err) {
      console.error("Failed to fetch billing:", err);
      setError("فشل في تحميل بيانات الفواتير");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const subscriptionStatusInfo = summary?.subscription
    ? normalizeSubscriptionStatusLabel(summary.subscription.status)
    : null;

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          title="الفواتير"
          description="عرض تفاصيل الفواتير والمدفوعات"
        />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          title="الفواتير"
          description="عرض تفاصيل الفواتير والمدفوعات"
        />
        <Card className="mt-6">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">{error}</p>
            <Button onClick={fetchBilling} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 ml-2" />
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <PageHeader
        title="الفواتير"
        description="مركز الاشتراك والمدفوعات والفواتير مع قراءة واضحة للحالة الحالية."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/merchant/pricing">
              <Button variant="outline">عرض الخطط</Button>
            </Link>
            <Link href="/merchant/plan">
              <Button>إدارة الاشتراك</Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {[
          `الخطة الحالية: ${summary?.subscription?.planName || "بدون اشتراك"}`,
          `قيمة الاشتراك: ${summary?.subscription ? formatCurrency(summary.subscription.amount, summary.subscription.currency) : "—"}`,
          `الحالة: ${subscriptionStatusInfo?.label || "غير معروف"}`,
          `أحداث مالية: ${events.length}`,
        ].map((chip) => (
          <div
            key={chip}
            className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-secondary)]"
          >
            {chip}
          </div>
        ))}
      </div>

      {/* Current Subscription */}
      <Card className="app-data-card mb-6 border-[var(--accent-gold)]/25 bg-[var(--bg-surface-2)]">
        <CardContent className="p-6">
          {summary?.subscription ? (
            <div className="grid gap-6 lg:grid-cols-[1.3fr,0.7fr]">
              <div>
                <p className="text-xs text-[var(--text-muted)]">
                  الاشتراك الحالي
                </p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {summary.subscription.planName}
                </p>
                <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  الفاتورة القادمة:{" "}
                  {formatBillingDate(summary.subscription.nextBillingDate)}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-4 py-3">
                    <p className="text-xs text-[var(--text-muted)]">شهرياً</p>
                    <p className="mt-2 font-mono text-2xl font-bold text-[var(--text-primary)]">
                      {formatCurrency(
                        summary.subscription.amount,
                        summary.subscription.currency,
                      )}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-4 py-3">
                    <p className="text-xs text-[var(--text-muted)]">الحالة</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                      {subscriptionStatusInfo?.label || "غير معروف"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {summary.subscription.cashierPromoEligible ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={
                        summary.subscription.cashierPromoActive
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {summary.subscription.cashierPromoActive
                        ? "عرض الكاشير فعّال"
                        : "عرض الكاشير غير فعّال"}
                    </Badge>
                    <Badge
                      variant={
                        summary.subscription.cashierEffective
                          ? "default"
                          : "outline"
                      }
                    >
                      {summary.subscription.cashierEffective
                        ? "الكاشير متاح حالياً"
                        : "الكاشير غير متاح حالياً"}
                    </Badge>
                  </div>
                ) : null}
                {summary.subscription.cashierPromoActive &&
                summary.subscription.cashierPromoEndsAt ? (
                  <p className="text-xs text-muted-foreground">
                    ينتهي عرض الكاشير في{" "}
                    {formatBillingDate(summary.subscription.cashierPromoEndsAt)}
                  </p>
                ) : null}
                <div className="grid gap-2">
                  <Link href="/merchant/pricing">
                    <Button variant="outline" className="w-full">
                      قارن جميع الخطط
                    </Button>
                  </Link>
                  <Link href="/merchant/plan#usage">
                    <Button variant="outline" className="w-full">
                      راجع الاستخدام
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-lg font-medium text-foreground">
                لا يوجد اشتراك نشط
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                أنت على الخطة المجانية حالياً
              </p>
              <Link href="/merchant/plan">
                <Button className="mt-4">عرض الأسعار والخطط</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="mb-8 flex flex-wrap gap-2">
        <Link href="/merchant/plan">
          <Button variant="outline">إدارة الاشتراك</Button>
        </Link>
        <Link href="/merchant/plan#calculator">
          <Button variant="outline">حاسبة الأسعار</Button>
        </Link>
        <Link href="/merchant/plan#usage">
          <Button variant="outline">بيانات الاستخدام</Button>
        </Link>
      </div>

      {/* Billing Events / History */}
      <div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            سجل الفواتير
          </h2>
          <Button variant="outline" size="sm" onClick={fetchBilling}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {events.length === 0 ? (
          <Card className="app-data-card">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-lg font-medium text-foreground">
                لا توجد فواتير بعد
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                ستظهر هنا الفواتير والمدفوعات عند الاشتراك في خطة مدفوعة
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const typeConfig =
                EVENT_TYPE_CONFIG[event.type] || EVENT_TYPE_CONFIG.payment;
              const statusConfig =
                STATUS_CONFIG[event.status] || STATUS_CONFIG.pending;
              const TypeIcon = typeConfig.icon;
              const StatusIcon = statusConfig.icon;
              return (
                <Card key={event.id} className="app-data-card">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)]">
                        <TypeIcon className={cn("h-5 w-5", typeConfig.color)} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {event.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatBillingDate(event.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                      <Badge variant={statusConfig.variant}>
                        <StatusIcon className="h-3 w-3 ml-1" />
                        {statusConfig.label}
                      </Badge>
                      <span
                        className={cn(
                          "font-bold text-lg",
                          event.type === "refund" || event.type === "credit"
                            ? "text-[color:var(--accent-success)]"
                            : "text-foreground",
                        )}
                      >
                        {event.type === "refund" ? "+" : ""}
                        {formatCurrency(event.amount, event.currency)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
