"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/ui/skeleton";
import { AlertBanner } from "@/components/ui/alerts";
import { merchantApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Activity, MessageSquare, Brain, Mic, CreditCard, Map } from "lucide-react";

const METRIC_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  MESSAGES: { label: "الرسائل / شهر", icon: MessageSquare },
  AI_CALLS: { label: "ردود الذكاء الاصطناعي / يوم", icon: Brain },
  AI_CAPACITY: { label: "ردود الذكاء الاصطناعي / يوم", icon: Brain },
  AI_REPLIES: { label: "ردود الذكاء الاصطناعي / يوم", icon: Brain },
  PAID_TEMPLATES: { label: "القوالب المدفوعة / شهر", icon: CreditCard },
  PAYMENT_PROOF_SCANS: { label: "فحوصات إثبات الدفع / شهر", icon: CreditCard },
  VOICE_MINUTES: { label: "الدقائق الصوتية / شهر", icon: Mic },
  VOICE_TRANSCRIPTION: { label: "الدقائق الصوتية / شهر", icon: Mic },
  MAP_LOOKUPS: { label: "استعلامات الخرائط / شهر", icon: Map },
  IN_APP_AI_ACTIONS: { label: "إجراءات الذكاء الاصطناعي / شهر", icon: Activity },
};

const PLAN_NAME_AR: Record<string, string> = {
  TRIAL: "تجريبي",
  STARTER: "مبتدئ",
  CHAT_ONLY: "دردشة فقط",
  BASIC: "أساسي",
  GROWTH: "نمو",
  PRO: "احترافي",
  ENTERPRISE: "مؤسسي",
};

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-amber-500"
        : "bg-primary-600";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used.toLocaleString("ar-EG")}</span>
        <span>{limit > 0 ? limit.toLocaleString("ar-EG") : "غير محدود"}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function UsagePage() {
  const { data: session } = useSession();
  const [usageData, setUsageData] = useState<any>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const apiKey = session?.accessToken;

  useEffect(() => {
    if (!apiKey) return;

    const loadData = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [usage, summary] = await Promise.all([
          merchantApi.getBillingUsageStatus(apiKey),
          merchantApi.getBillingSummary(apiKey),
        ]);
        setUsageData(usage);
        setSummaryData(summary);
      } catch (err: any) {
        setError("تعذر تحميل بيانات الاستخدام.");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [apiKey]);

  const subscription = summaryData?.subscription;
  const planCode = subscription?.planCode || subscription?.plan?.code;
  const planName = planCode ? (PLAN_NAME_AR[planCode] || planCode) : null;

  const metrics: Array<any> = usageData?.metrics || [];

  return (
    <div className="space-y-6">
      <PageHeader title="الاستخدام" subtitle="مراقبة استخدامك الحالي وحدود باقتك" />

      {error && <AlertBanner type="error" message={error} />}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* Plan summary */}
          {subscription && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">الباقة الحالية</CardTitle>
                  {planName && (
                    <Badge variant="secondary" className="text-sm">
                      {planName}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  {subscription.status && (
                    <div>
                      <p className="text-muted-foreground text-xs">الحالة</p>
                      <p className="font-medium">
                        {subscription.status === "ACTIVE"
                          ? "نشطة"
                          : subscription.status === "TRIAL"
                            ? "تجريبية"
                            : subscription.status}
                      </p>
                    </div>
                  )}
                  {subscription.currentPeriodEnd && (
                    <div>
                      <p className="text-muted-foreground text-xs">تجديد في</p>
                      <p className="font-medium">
                        {new Date(subscription.currentPeriodEnd).toLocaleDateString("ar-EG")}
                      </p>
                    </div>
                  )}
                  {subscription.billingCycleMonths && (
                    <div>
                      <p className="text-muted-foreground text-xs">دورة الفوترة</p>
                      <p className="font-medium">
                        {subscription.billingCycleMonths === 1
                          ? "شهري"
                          : subscription.billingCycleMonths === 3
                            ? "ربع سنوي"
                            : subscription.billingCycleMonths === 12
                              ? "سنوي"
                              : `${subscription.billingCycleMonths} أشهر`}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Usage metrics */}
          {metrics.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map((m: any) => {
                const meta = METRIC_LABELS[m.metric] || {
                  label: m.metric,
                  icon: Activity,
                };
                const Icon = meta.icon;

                return (
                  <Card key={m.metric}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">
                          {meta.label}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <UsageBar used={m.used ?? 0} limit={m.limit ?? 0} />
                      {m.limit > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {Math.max(0, m.limit - m.used).toLocaleString("ar-EG")} متبقٍ
                          {m.periodEnd && (
                            <span>
                              {" "}
                              · حتى{" "}
                              {new Date(m.periodEnd).toLocaleDateString("ar-EG")}
                            </span>
                          )}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            !error && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  لا توجد بيانات استخدام متاحة حالياً.
                </CardContent>
              </Card>
            )
          )}
        </>
      )}
    </div>
  );
}
