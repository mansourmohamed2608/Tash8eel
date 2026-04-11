"use client";

import { type ElementType, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/ui/alerts";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Bot,
  CreditCard,
  Check,
  MessageSquare,
  Package,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type PricingPayload = Awaited<ReturnType<typeof merchantApi.getPricing>>;

const CAPABILITY_LABELS: Record<string, string> = {
  OMNICHANNEL_INBOX: "صندوق محادثات موحد",
  WHATSAPP_META: "WhatsApp عبر Meta",
  MESSENGER_INSTAGRAM: "Messenger وInstagram DM",
  AI_CUSTOMER_REPLIES: "ردود العملاء بالذكاء الاصطناعي",
  ORDERS: "الطلبات",
  QUOTES_FOLLOW_UP: "العروض والمتابعة",
  PUBLIC_TRACKING: "تتبع الطلب العام",
  CATALOG: "الكتالوج",
  PAYMENTS: "المدفوعات",
  BASIC_COD: "COD أساسي",
  REPORTS_BASIC: "تقارير أساسية",
  NOTIFICATIONS: "الإشعارات",
  WEBHOOKS: "الويب هوكس",
  VOICE_NOTES_TRANSCRIPTION: "تفريغ الرسائل الصوتية",
  INVENTORY_BASIC: "مخزون أساسي",
  FINANCE_BASIC: "مالية أساسية",
  CRM_BASIC: "CRM أساسي",
  EVERYTHING_IN_STARTER: "كل ما في Starter",
  CASHIER_POS: "الكاشير / POS",
  REGISTER_SESSIONS: "جلسات الصندوق",
  SUSPENDED_DRAFT_SALES: "المبيعات المعلقة / المسودات",
  INVENTORY_FULL: "مخزون كامل",
  SUPPLIERS: "الموردون",
  FINANCE_BASIC_PLUS: "مالية Basic+",
  API_ACCESS: "وصول API",
  CRM: "CRM",
  EVERYTHING_IN_BASIC: "كل ما في Basic",
  TEAM_RBAC: "الفريق والصلاحيات",
  LOYALTY: "الولاء",
  CUSTOMER_SEGMENTS: "شرائح العملاء",
  CAMPAIGN_SURFACES: "واجهات الحملات",
  AUTOMATIONS: "الأتمتة",
  EVERYTHING_IN_GROWTH: "كل ما في Growth",
  KPI_DASHBOARD: "لوحة KPI",
  AUDIT_LOGS: "سجل التدقيق",
  FORECASTING: "التنبؤات",
  ADVANCED_REPORTS: "التقارير المتقدمة",
  CFO_REPORTING: "تقارير CFO",
  CASH_FLOW_TAX_ACCOUNTANT_EXPORTS: "تقارير cash-flow / tax / accountant",
  INVENTORY_INSIGHTS: "رؤى المخزون",
  EVERYTHING_IN_PRO: "كل ما في Pro",
  CUSTOM_INTEGRATIONS: "تكاملات مخصصة",
  SLA_ELIGIBLE: "أهلية SLA",
  VOICE_CALLING_ENABLEMENT_ELIGIBLE: "أهلية تفعيل المكالمات",
  ENTERPRISE_LIMIT_OVERRIDES: "مرونة حدود المؤسسات",
  CUSTOM_BRANCH_POS_STRUCTURE: "هيكل فروع / POS مخصص",
  CHAT_HISTORY: "سجل المحادثات",
  BASIC_ROUTING_TAGGING: "Routing / tagging أساسي",
  INVENTORY: "المخزون",
  FINANCE: "المالية",
  BRANCHES: "الفروع",
  OPERATIONS_MODULES: "وحدات التشغيل",
  ADVANCED_REPORTS_ONLY: "التقارير المتقدمة",
  CACHIER_POS_PERMANENT: "الكاشير الدائم",
};

const PLAN_COLORS: Record<string, string> = {
  STARTER: "border-[var(--border-default)]",
  BASIC: "border-[var(--accent-blue)]/35",
  GROWTH: "border-[var(--accent-gold)]/55",
  PRO: "border-[var(--accent-success)]/35",
  ENTERPRISE: "border-[var(--accent-warning)]/45",
  CHAT_ONLY: "border-[var(--border-active)]",
};

const AGENT_ICONS: Record<string, ElementType> = {
  OPS_AGENT: Bot,
  INVENTORY_AGENT: Package,
  FINANCE_AGENT: CreditCard,
};

function formatLimit(value: number) {
  if (value === -1) return "مخصص";
  return new Intl.NumberFormat("en-US").format(value);
}

function labelCapability(id: string) {
  return CAPABILITY_LABELS[id] || id.replaceAll("_", " ");
}

function PricingMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function getPlanCtaLabel(planId: string) {
  if (planId === "ENTERPRISE") return "تواصل مع المبيعات";
  if (planId === "CHAT_ONLY") return "ابدأ بخطة المحادثات";
  return "اختر هذه الخطة";
}

export default function MerchantPricingPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const router = useRouter();
  const [pricing, setPricing] = useState<PricingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    merchantApi
      .getPricing(apiKey)
      .then((data) => {
        if (!cancelled) {
          setPricing(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const handlePlanAction = async (planId: string) => {
    if (!apiKey) return;

    if (planId === "ENTERPRISE") {
      router.push("/merchant/plan?contactSales=enterprise");
      return;
    }

    try {
      setCheckoutPlan(planId);
      const result = await merchantApi.createBillingCheckout(apiKey, planId);
      toast({
        title: "تم إنشاء الطلب",
        description:
          result.cashierPromoPreview?.activeOnPurchase &&
          result.cashierPromoPreview?.note
            ? `${result.message} ${result.cashierPromoPreview.note}`
            : result.message,
      });
    } catch (error: any) {
      toast({
        title: "تعذر إنشاء الطلب",
        description: error?.message || "حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setCheckoutPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          title="Pricing"
          description="جاري تحميل هيكل الأسعار والاشتراكات..."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-56 animate-pulse bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!pricing) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          title="Pricing"
          description="تعذر تحميل بيانات التسعير حالياً."
        />
        <AlertBanner
          type="error"
          title="تعذر تحميل صفحة الأسعار"
          message="حدث خطأ أثناء تحميل كتالوج الأسعار. حاول مرة أخرى."
        />
      </div>
    );
  }

  const fullPlatformPlans = pricing.catalog.plans.filter(
    (plan) => plan.isFullPlatformPlan,
  );
  const chatOnlyPlan = pricing.catalog.plans.find(
    (plan) => plan.id === "CHAT_ONLY",
  );
  const recommendedPlanId = "GROWTH";

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <PageHeader
        title="خطي والأسعار"
        description="اختر الخطة المناسبة لنشاطك وقارن السعة والميزات بوضوح."
      />

      <AlertBanner
        type="info"
        title="عرض الكاشير"
        message="الكاشير مجاني لأول 30 يوم في الاشتراكات المدفوعة الجديدة على الخطط الكاملة. لا ينطبق على خطة المحادثات فقط."
      />

      <div className="grid gap-4 xl:grid-cols-5">
        {pricing.catalog.plans.map((plan) => {
          const isEnterprise = plan.id === "ENTERPRISE";
          const isCurrent = false;
          const isRecommended = plan.id === recommendedPlanId;
          return (
            <Card
              key={plan.id}
              className={cn(
                "app-data-card flex h-full flex-col border",
                PLAN_COLORS[plan.id] || "border-[var(--border-default)]",
                isRecommended && "border-[var(--accent-gold)]",
              )}
            >
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">{plan.nameAr}</CardTitle>
                  {isRecommended && (
                    <Badge className="border-0 bg-[var(--accent-gold-dim)] text-[var(--accent-gold)]">
                      الأكثر شيوعاً
                    </Badge>
                  )}
                  {plan.id === "CHAT_ONLY" && (
                    <Badge variant="secondary">المحادثات فقط</Badge>
                  )}
                </div>
                <CardDescription>{plan.bestFor}</CardDescription>
                <div className="font-mono text-4xl font-black text-[var(--accent-gold)]">
                  {formatLimit(plan.monthlyPriceEgp || 0)}
                  <span className="mr-2 text-sm font-medium text-[var(--text-secondary)]">
                    ج.م / شهر
                  </span>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  {plan.mainValue}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <div className="space-y-2">
                  <PricingMetricRow
                    label="الرسائل / يوم"
                    value={formatLimit(plan.totalMessagesPerDay)}
                  />
                  <PricingMetricRow
                    label="الرسائل / شهر"
                    value={formatLimit(plan.totalMessagesPerMonth)}
                  />
                  <PricingMetricRow
                    label="ردود AI / يوم"
                    value={formatLimit(plan.aiRepliesPerDay)}
                  />
                  <PricingMetricRow
                    label="الفروع"
                    value={formatLimit(plan.includedBranches)}
                  />
                </div>

                <div className="space-y-2">
                  {plan.includedFeatures.slice(0, 6).map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                    >
                      <Check className="h-4 w-4 text-[var(--accent-gold)]" />
                      <span>{labelCapability(feature)}</span>
                    </div>
                  ))}
                  {plan.excludedFeatures.slice(0, 3).map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-2 text-sm text-[var(--text-muted)]"
                    >
                      <span className="text-base leading-none">—</span>
                      <span>{labelCapability(feature)}</span>
                    </div>
                  ))}
                </div>

                <Button
                  className="mt-auto w-full"
                  variant={isEnterprise || isCurrent ? "outline" : "default"}
                  onClick={() => handlePlanAction(plan.id)}
                  disabled={checkoutPlan === plan.id || isCurrent}
                >
                  {checkoutPlan === plan.id
                    ? "جاري الإنشاء..."
                    : isCurrent
                      ? "خطتك الحالية"
                      : getPlanCtaLabel(plan.id)}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {chatOnlyPlan ? (
        <Card className="app-data-card border-[var(--border-default)] bg-[var(--bg-surface-2)]">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>خيار المحادثات فقط</CardTitle>
              <Badge variant="secondary">بدون وحدات تشغيل</Badge>
              <Badge className="border-0 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                سعة محادثات أعلى من Starter
              </Badge>
            </div>
            <CardDescription>
              {chatOnlyPlan.mainValue}. السعر{" "}
              {formatLimit(chatOnlyPlan.monthlyPriceEgp || 0)} ج.م / شهر.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold">يشمل</h3>
                <div className="flex flex-wrap gap-2">
                  {chatOnlyPlan.includedFeatures.map((feature) => (
                    <Badge key={feature} variant="outline">
                      {labelCapability(feature)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">لا يشمل</h3>
                <div className="flex flex-wrap gap-2">
                  {chatOnlyPlan.excludedFeatures.map((feature) => (
                    <Badge key={feature} variant="secondary">
                      {labelCapability(feature)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border bg-background p-4">
              <PricingMetricRow
                label="الرسائل / يوم"
                value={formatLimit(chatOnlyPlan.totalMessagesPerDay)}
              />
              <PricingMetricRow
                label="الرسائل / شهر"
                value={formatLimit(chatOnlyPlan.totalMessagesPerMonth)}
              />
              <PricingMetricRow
                label="ردود AI / يوم"
                value={formatLimit(chatOnlyPlan.aiRepliesPerDay)}
              />
              <PricingMetricRow
                label="ردود AI / شهر"
                value={formatLimit(chatOnlyPlan.aiRepliesPerMonth)}
              />
              <Button
                className="w-full"
                onClick={() => handlePlanAction(chatOnlyPlan.id)}
                disabled={checkoutPlan === chatOnlyPlan.id}
              >
                {checkoutPlan === chatOnlyPlan.id
                  ? "جاري الإنشاء..."
                  : "ابدأ بخطة المحادثات"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>إضافات الميزات</CardTitle>
            <CardDescription>
              إضافات شهرية لتوسيع الخطة الحالية دون تغيير الباقة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pricing.catalog.featureAddOns.map((item) => (
              <div
                key={item.code}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{item.nameAr}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.descriptionAr}
                  </div>
                </div>
                <Badge className="w-fit">
                  {formatLimit(item.monthlyPriceEgp)} EGP
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الوكلاء الإضافيون</CardTitle>
            <CardDescription>
              فقط الوكلاء الحية القابلة للبيع حالياً.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pricing.catalog.liveAgentAddOns.map((item) => (
              <div
                key={item.code}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{item.nameAr}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.descriptionAr}
                  </div>
                </div>
                <Badge className="w-fit">
                  {formatLimit(item.monthlyPriceEgp)} EGP
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>باقات السعة</CardTitle>
            <CardDescription>
              باقات سعة قابلة للإضافة خلال فترة الفوترة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pricing.catalog.usagePacks.map((item) => (
              <div
                key={item.code}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{item.nameAr}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.descriptionAr}
                  </div>
                </div>
                <Badge className="w-fit">
                  {formatLimit(item.monthlyPriceEgp)} EGP
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>المؤسسات والتسعير المخصص</CardTitle>
            <CardDescription>
              عناصر تسعير تبدأ من حد أدنى وتذهب لمسار المبيعات.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pricing.catalog.enterprise.map((item) => (
              <div
                key={item.code}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{item.nameAr}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.descriptionAr}
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {formatLimit(item.priceEgp)} ج.م /{" "}
                  {item.billingType === "one_time" ? "مرة واحدة" : "شهر"}
                </Badge>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/merchant/plan?contactSales=custom")}
            >
              تواصل مع المبيعات
              <ShieldCheck className="mr-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ملاحظات مهمة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pricing.catalog.notes.map((note) => (
            <div
              key={note}
              className="rounded-lg border px-4 py-3 text-sm text-muted-foreground"
            >
              {note}
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-4">
              <MessageSquare className="mb-2 h-5 w-5 text-primary" />
              <div className="text-sm font-medium">
                Starter مقابل المحادثات فقط
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Chat Only أعلى في سعة الرسائل من Starter لكنه لا يفتح وحدات
                التشغيل الأوسع.
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <Bot className="mb-2 h-5 w-5 text-primary" />
              <div className="text-sm font-medium">الوكلاء الإضافيون فقط</div>
              <div className="mt-1 text-sm text-muted-foreground">
                لا نظهر Marketing / Support / Content / Sales / Creative كوكلاء
                مدفوعين مباشرين.
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <Sparkles className="mb-2 h-5 w-5 text-primary" />
              <div className="text-sm font-medium">وضوح حدود الاستخدام</div>
              <div className="mt-1 text-sm text-muted-foreground">
                حدود الرسائل والردود الذكية تظهر في واجهات الخطة والفوترة وتتحول
                إلى ترقية أو شراء باقة سعة عند الاقتراب من الحد.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
