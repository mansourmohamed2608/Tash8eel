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
import {
  ArrowRight,
  Bot,
  CreditCard,
  MessageSquare,
  Package,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type PricingPayload = Awaited<ReturnType<typeof merchantApi.getPricing>>;

const CAPABILITY_LABELS: Record<string, string> = {
  OMNICHANNEL_INBOX: "Omnichannel inbox",
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
  STARTER: "border-slate-300",
  BASIC: "border-blue-300",
  GROWTH: "border-emerald-300",
  PRO: "border-violet-300",
  ENTERPRISE: "border-amber-300",
  CHAT_ONLY: "border-cyan-300",
};

const AGENT_ICONS: Record<string, ElementType> = {
  OPS_AGENT: Bot,
  INVENTORY_AGENT: Package,
  FINANCE_AGENT: CreditCard,
};

function formatLimit(value: number) {
  if (value === -1) return "Custom";
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

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <PageHeader
        title="Run sales, operations, and customer conversations from one system."
        description="Choose a full business plan or start with chat-only."
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div>
            <p className="app-hero-band__eyebrow">Plans and packaging</p>
            <h2 className="app-hero-band__title">
              Clear packaging for chat, operations, and full business workflows
            </h2>
            <p className="app-hero-band__copy">
              Compare platform plans, understand message capacity, and surface
              add-ons without forcing the buyer through generic pricing noise.
            </p>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">Full plans</span>
              <strong className="app-hero-band__metric-value">
                {fullPlatformPlans.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">Chat-only</span>
              <strong className="app-hero-band__metric-value">
                {chatOnlyPlan ? "Available" : "Hidden"}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">Add-on groups</span>
              <strong className="app-hero-band__metric-value">4</strong>
            </div>
          </div>
        </div>
      </section>

      <AlertBanner
        type="info"
        title="عرض الكاشير"
        message="الكاشير مجاني لأول 30 يوم في الاشتراكات المدفوعة الجديدة على الخطط الكاملة. لا ينطبق على Chat Only."
      />

      <Card className="app-data-card border-slate-200">
        <CardHeader>
          <CardTitle>خطط المنصة الكاملة</CardTitle>
          <CardDescription>
            الأسعار ثابتة بالجنيه المصري وتشمل هيكل الرسائل وحدود الردود الذكية
            كما هو مطبق في الكتالوج.
          </CardDescription>
        </CardHeader>
        <CardContent className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="py-3 pr-0">الخطة</th>
                <th className="py-3">السعر</th>
                <th className="py-3">Best for</th>
                <th className="py-3">Messages / day</th>
                <th className="py-3">Messages / month</th>
                <th className="py-3 pl-0">Main value</th>
              </tr>
            </thead>
            <tbody>
              {fullPlatformPlans.map((plan) => (
                <tr key={plan.id} className="border-b last:border-b-0">
                  <td className="py-4 pr-0 font-semibold">{plan.nameAr}</td>
                  <td className="py-4">
                    {formatLimit(plan.monthlyPriceEgp || 0)} EGP
                  </td>
                  <td className="py-4 text-muted-foreground">{plan.bestFor}</td>
                  <td className="py-4">
                    {formatLimit(plan.totalMessagesPerDay)}
                  </td>
                  <td className="py-4">
                    {formatLimit(plan.totalMessagesPerMonth)}
                  </td>
                  <td className="py-4 pl-0 text-muted-foreground">
                    {plan.mainValue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        <CardContent className="grid gap-3 md:hidden">
          {fullPlatformPlans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-4 ${PLAN_COLORS[plan.id] || "border-slate-200"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">{plan.nameAr}</div>
                {plan.cashierPromoEligible ? (
                  <Badge className="bg-emerald-600 text-white">
                    Cashier promo
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {plan.bestFor}
              </div>
              <div className="mt-4 grid gap-2">
                <PricingMetricRow
                  label="السعر"
                  value={`${formatLimit(plan.monthlyPriceEgp || 0)} EGP`}
                />
                <PricingMetricRow
                  label="Messages / day"
                  value={formatLimit(plan.totalMessagesPerDay)}
                />
                <PricingMetricRow
                  label="Messages / month"
                  value={formatLimit(plan.totalMessagesPerMonth)}
                />
                <PricingMetricRow label="Main value" value={plan.mainValue} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {chatOnlyPlan ? (
        <Card className="app-data-card border-2 border-cyan-300 bg-cyan-50/40">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{chatOnlyPlan.nameAr}</CardTitle>
              <Badge variant="secondary">Narrower chat product</Badge>
              <Badge className="bg-cyan-600 text-white">
                Higher chat capacity than Starter
              </Badge>
            </div>
            <CardDescription>
              {chatOnlyPlan.mainValue}. السعر{" "}
              {formatLimit(chatOnlyPlan.monthlyPriceEgp || 0)} EGP / month.
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
                label="Messages / day"
                value={formatLimit(chatOnlyPlan.totalMessagesPerDay)}
              />
              <PricingMetricRow
                label="Messages / month"
                value={formatLimit(chatOnlyPlan.totalMessagesPerMonth)}
              />
              <PricingMetricRow
                label="AI replies / day"
                value={formatLimit(chatOnlyPlan.aiRepliesPerDay)}
              />
              <PricingMetricRow
                label="AI replies / month"
                value={formatLimit(chatOnlyPlan.aiRepliesPerMonth)}
              />
              <Button
                className="w-full"
                onClick={() => handlePlanAction(chatOnlyPlan.id)}
                disabled={checkoutPlan === chatOnlyPlan.id}
              >
                {checkoutPlan === chatOnlyPlan.id
                  ? "جاري الإنشاء..."
                  : "Start chat-only"}
                <ArrowRight className="mr-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {pricing.catalog.plans.map((plan) => {
          const isEnterprise = plan.id === "ENTERPRISE";
          const isChatOnly = plan.id === "CHAT_ONLY";
          const ctaLabel = isEnterprise
            ? "Talk to sales"
            : isChatOnly
              ? "Start chat-only"
              : "Choose plan";

          return (
            <Card
              key={plan.id}
              className={`app-data-card border-2 ${PLAN_COLORS[plan.id] || "border-slate-200"}`}
            >
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{plan.nameAr}</CardTitle>
                  {!plan.isFullPlatformPlan ? (
                    <Badge variant="secondary">Chat-only</Badge>
                  ) : null}
                  {plan.cashierPromoEligible ? (
                    <Badge className="bg-emerald-600 text-white">
                      Cashier promo
                    </Badge>
                  ) : null}
                </div>
                <CardDescription>{plan.bestFor}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">السعر</div>
                    <div className="mt-1 text-lg font-semibold">
                      {formatLimit(plan.monthlyPriceEgp || 0)} EGP / month
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">
                      Main value
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {plan.mainValue}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">
                      Messages
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {formatLimit(plan.totalMessagesPerDay)} / day
                      <br />
                      {formatLimit(plan.totalMessagesPerMonth)} / month
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">
                      AI replies
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {formatLimit(plan.aiRepliesPerDay)} / day
                      <br />
                      {formatLimit(plan.aiRepliesPerMonth)} / month
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">
                      Branches
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {plan.includedBranches === -1
                        ? "Custom"
                        : formatLimit(plan.includedBranches)}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">
                      POS connections
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {plan.includedPosConnections === -1
                        ? "Custom"
                        : formatLimit(plan.includedPosConnections)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Included features
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {plan.includedFeatures.map((feature) => (
                        <li
                          key={feature}
                          className="rounded-md border px-3 py-2"
                        >
                          {labelCapability(feature)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Excluded features
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {plan.excludedFeatures.length > 0 ? (
                        plan.excludedFeatures.map((feature) => (
                          <li
                            key={feature}
                            className="rounded-md border border-dashed px-3 py-2"
                          >
                            {labelCapability(feature)}
                          </li>
                        ))
                      ) : (
                        <li className="rounded-md border px-3 py-2">
                          لا توجد استثناءات رئيسية في هذه الخطة.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">
                    Included live agents
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {plan.includedAgents.length > 0 ? (
                      plan.includedAgents.map((agent) => {
                        const Icon = AGENT_ICONS[agent] || Sparkles;
                        return (
                          <Badge
                            key={agent}
                            variant="outline"
                            className="gap-1"
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {agent}
                          </Badge>
                        );
                      })
                    ) : (
                      <Badge variant="secondary">
                        No standalone live agent included
                      </Badge>
                    )}
                  </div>
                </div>

                {plan.notes.length > 0 ? (
                  <div className="rounded-lg border bg-amber-50/60 p-3 text-sm text-muted-foreground">
                    {plan.notes.join(" ")}
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  variant={isEnterprise ? "outline" : "default"}
                  onClick={() => handlePlanAction(plan.id)}
                  disabled={checkoutPlan === plan.id}
                >
                  {checkoutPlan === plan.id ? "جاري الإنشاء..." : ctaLabel}
                  <ArrowRight className="mr-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Feature add-ons</CardTitle>
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
            <CardTitle>Live agents</CardTitle>
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
            <CardTitle>Usage packs</CardTitle>
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
            <CardTitle>Enterprise / custom</CardTitle>
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
                  {formatLimit(item.priceEgp)} EGP /{" "}
                  {item.billingType === "one_time" ? "one-time" : "month"}
                </Badge>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/merchant/plan?contactSales=custom")}
            >
              Talk to sales
              <ShieldCheck className="mr-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Important notes</CardTitle>
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
              <div className="text-sm font-medium">Starter vs Chat Only</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Chat Only أعلى في سعة الرسائل من Starter لكنه لا يفتح وحدات
                التشغيل الأوسع.
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <Bot className="mb-2 h-5 w-5 text-primary" />
              <div className="text-sm font-medium">Live agents only</div>
              <div className="mt-1 text-sm text-muted-foreground">
                لا نظهر Marketing / Support / Content / Sales / Creative كوكلاء
                مدفوعين مباشرين.
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <Sparkles className="mb-2 h-5 w-5 text-primary" />
              <div className="text-sm font-medium">Usage visibility</div>
              <div className="mt-1 text-sm text-muted-foreground">
                حدود الرسائل والردود الذكية تظهر في واجهات الخطة والفوترة وتتحول
                إلى ترقية أو شراء usage pack عند الاقتراب من الحد.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
