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
import { merchantApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  AiInsightsCard,
  generateBillingInsights,
} from "@/components/ai/ai-insights-card";

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
  } | null;
}

const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  subscription: { label: "اشتراك", icon: CreditCard, color: "text-blue-500" },
  addon: { label: "إضافة", icon: ArrowUpRight, color: "text-purple-500" },
  payment: { label: "دفعة", icon: DollarSign, color: "text-green-500" },
  refund: { label: "استرداد", icon: ArrowDownRight, color: "text-orange-500" },
  credit: { label: "رصيد", icon: DollarSign, color: "text-cyan-500" },
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
      <>
        <PageHeader
          title="الفواتير"
          description="عرض تفاصيل الفواتير والمدفوعات"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="الفواتير"
        description="عرض تفاصيل الفواتير والاشتراك والمدفوعات"
      />

      {/* AI Billing Insights */}
      <AiInsightsCard
        title="مساعد الفواتير"
        insights={generateBillingInsights({
          plan: summary?.subscription?.planName?.toLowerCase(),
          status: summary?.subscription?.status,
          nextBillingDate: summary?.subscription?.nextBillingDate,
        })}
        loading={loading}
      />

      {/* Current Subscription */}
      <Card className="bg-gradient-to-l from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800/50 mb-6">
        <CardContent className="p-6">
          {summary?.subscription ? (
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">الاشتراك الحالي</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {summary.subscription.planName}
                </p>
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  الفاتورة القادمة:{" "}
                  {formatBillingDate(summary.subscription.nextBillingDate)}
                </p>
              </div>
              <div className="text-start sm:text-end">
                <p className="text-3xl font-bold text-foreground">
                  {formatCurrency(
                    summary.subscription.amount,
                    summary.subscription.currency,
                  )}
                </p>
                <p className="text-sm text-muted-foreground">/ شهرياً</p>
                <Badge
                  variant={
                    subscriptionStatusInfo?.active ? "default" : "secondary"
                  }
                  className="mt-2"
                >
                  {subscriptionStatusInfo?.label || "غير معروف"}
                </Badge>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link href="/merchant/plan">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-foreground">إدارة الاشتراك</p>
                <p className="text-xs text-muted-foreground">
                  تعديل أو ترقية خطتك
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/merchant/plan#calculator">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950/50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-foreground">حاسبة الأسعار</p>
                <p className="text-xs text-muted-foreground">
                  احسب تكلفة الخطة المناسبة
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/merchant/plan#usage">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-medium text-foreground">بيانات الاستخدام</p>
                <p className="text-xs text-muted-foreground">
                  الرسائل والتوكنز المستخدمة
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Billing Events / History */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            سجل الفواتير
          </h2>
          <Button variant="outline" size="sm" onClick={fetchBilling}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {events.length === 0 ? (
          <Card>
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
                <Card key={event.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
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
                    <div className="flex items-center gap-4">
                      <Badge variant={statusConfig.variant}>
                        <StatusIcon className="h-3 w-3 ml-1" />
                        {statusConfig.label}
                      </Badge>
                      <span
                        className={cn(
                          "font-bold text-lg",
                          event.type === "refund" || event.type === "credit"
                            ? "text-green-600 dark:text-green-400"
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
    </>
  );
}
