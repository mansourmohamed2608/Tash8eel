"use client";

import { useEffect, useMemo, useState } from "react";
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
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Check,
  CreditCard,
  Layers,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";

type PricingPayload = Awaited<ReturnType<typeof merchantApi.getPricing>>;
type PricingPlan = PricingPayload["catalog"]["plans"][number];
type PricingFeatureAddOn = PricingPayload["catalog"]["featureAddOns"][number];
type PricingUsagePack = PricingPayload["catalog"]["usagePacks"][number];

const FULL_PLATFORM_ORDER = [
  "STARTER",
  "BASIC",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
] as const;

const FINAL_APPROVED_PLAN_QUOTAS: Record<
  string,
  {
    totalMessagesPerDay: number;
    totalMessagesPerMonth: number;
    aiRepliesPerDay: number;
    aiRepliesPerMonth: number;
  }
> = {
  STARTER: {
    totalMessagesPerDay: 480,
    totalMessagesPerMonth: 14_400,
    aiRepliesPerDay: 240,
    aiRepliesPerMonth: 7_200,
  },
  BASIC: {
    totalMessagesPerDay: 1_200,
    totalMessagesPerMonth: 36_000,
    aiRepliesPerDay: 600,
    aiRepliesPerMonth: 18_000,
  },
  GROWTH: {
    totalMessagesPerDay: 2_400,
    totalMessagesPerMonth: 72_000,
    aiRepliesPerDay: 1_200,
    aiRepliesPerMonth: 36_000,
  },
  PRO: {
    totalMessagesPerDay: 5_000,
    totalMessagesPerMonth: 150_000,
    aiRepliesPerDay: 2_500,
    aiRepliesPerMonth: 75_000,
  },
  ENTERPRISE: {
    totalMessagesPerDay: 10_000,
    totalMessagesPerMonth: 300_000,
    aiRepliesPerDay: 5_000,
    aiRepliesPerMonth: 150_000,
  },
  CHAT_ONLY: {
    totalMessagesPerDay: 960,
    totalMessagesPerMonth: 28_800,
    aiRepliesPerDay: 480,
    aiRepliesPerMonth: 14_400,
  },
};

const CURATED_FEATURE_ADDON_ORDER = [
  "inventory",
  "api_access",
  "automations",
  "forecasting",
  "cashier_pos",
  "team_rbac",
  "loyalty",
  "kpi_dashboard",
  "audit_logs",
  "branch_pack_plus_1",
  "pos_connection_plus_1",
] as const;

const CURATED_FEATURE_ADDON_SET = new Set(CURATED_FEATURE_ADDON_ORDER);

const FEATURE_MEANING_ALIAS: Record<string, string> = {
  inventory: "inventory",
  inventory_basic: "inventory",
  inventory_full: "inventory",
  api_access: "api_access",
  api_webhooks: "api_access",
  automations: "automations",
  followup_automations: "automations",
  autonomous_agent: "automations",
  forecasting: "forecasting",
  cashier_pos: "cashier_pos",
  pos_basic: "cashier_pos",
  pos_adv: "cashier_pos",
  team_rbac: "team_rbac",
  team_up_to_3: "team_rbac",
  team_upto3: "team_rbac",
  loyalty: "loyalty",
  kpi_dashboard: "kpi_dashboard",
  audit_logs: "audit_logs",
  branch_pack_plus_1: "branch_pack_plus_1",
  multi_branch_per_1: "branch_pack_plus_1",
  multi_branch_extra: "branch_pack_plus_1",
  pos_connection_plus_1: "pos_connection_plus_1",
  pos_integrations_basic: "pos_connection_plus_1",
};

const USAGE_FAMILY_ORDER: Record<string, number> = {
  AI_REPLIES: 1,
  MESSAGES: 2,
  PAYMENT_PROOF_SCANS: 3,
  VOICE_TRANSCRIPTION: 4,
};

const TIER_ORDER: Record<string, number> = {
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
};

const CAPABILITY_LABELS: Record<string, string> = {
  OMNICHANNEL_INBOX: "صندوق الرسائل الموحد",
  WHATSAPP_META: "واتساب + Meta",
  MESSENGER_INSTAGRAM: "فيسبوك / ماسنجر",
  AI_CUSTOMER_REPLIES: "ردود العملاء بالذكاء الاصطناعي",
  ORDERS: "إدارة الطلبات",
  QUOTES_FOLLOW_UP: "العروض والمتابعة",
  PUBLIC_TRACKING: "التتبع العام للطلب",
  CATALOG: "كتالوج المنتجات",
  PAYMENTS: "المدفوعات",
  BASIC_COD: "COD أساسي",
  REPORTS_BASIC: "تقارير أساسية",
  NOTIFICATIONS: "الإشعارات",
  WEBHOOKS: "Webhooks",
  VOICE_NOTES_TRANSCRIPTION: "تفريغ الرسائل الصوتية",
  INVENTORY_BASIC: "مخزون أساسي",
  FINANCE_BASIC: "مالية أساسية",
  CRM_BASIC: "CRM أساسي",
  CASHIER_POS_PERMANENT: "الكاشير الدائم",
  CASHIER_POS: "الكاشير / POS",
  REGISTER_SESSIONS: "جلسات الصندوق",
  SUSPENDED_DRAFT_SALES: "المبيعات المعلقة / المسودات",
  INVENTORY_FULL: "مخزون كامل",
  SUPPLIERS: "الموردون",
  FINANCE_BASIC_PLUS: "مالية Basic+",
  API_ACCESS: "وصول API",
  CRM: "CRM",
  TEAM_RBAC: "الفريق والصلاحيات",
  LOYALTY: "الولاء",
  CUSTOMER_SEGMENTS: "شرائح العملاء",
  CAMPAIGN_SURFACES: "واجهات الحملات",
  AUTOMATIONS: "الأتمتة",
  KPI_DASHBOARD: "لوحة KPI",
  AUDIT_LOGS: "سجل التدقيق",
  FORECASTING: "التنبؤات",
  ADVANCED_REPORTS: "تقارير متقدمة",
  CFO_REPORTING: "تقارير CFO",
  CASH_FLOW_TAX_ACCOUNTANT_EXPORTS: "تقارير Cash-Flow / Tax / Accountant",
  INVENTORY_INSIGHTS: "رؤى المخزون",
  CUSTOM_INTEGRATIONS: "تكاملات مخصصة",
  SLA_ELIGIBLE: "أهلية SLA",
  VOICE_CALLING_ENABLEMENT_ELIGIBLE: "أهلية تفعيل المكالمات",
  CHAT_HISTORY: "سجل الرسائل",
  BASIC_ROUTING_TAGGING: "Routing / Tagging أساسي",
  INVENTORY: "المخزون",
  FINANCE: "المالية",
  BRANCHES: "الفروع",
  OPERATIONS_MODULES: "وحدات التشغيل",
  ADVANCED_REPORTS_ONLY: "التقارير المتقدمة",
};

const PLAN_TOP_BULLETS: Record<string, string[]> = {
  STARTER: [
    "رسائل العملاء عبر واتساب وفيسبوك",
    "ردود الذكاء الاصطناعي + إدارة الطلبات",
    "كتالوج + مخزون أساسي + مالية أساسية",
    "Webhooks + إشعارات + تفريغ صوتي",
    "Ops Agent",
    "الكاشير مجاني لأول 30 يومًا فقط",
  ],
  BASIC: [
    "كل ما في Starter",
    "الكاشير / POS دائم",
    "مخزون كامل + موردون",
    "API Access + CRM",
    "1 فرع + 1 POS",
    "Ops + Inventory + Finance",
  ],
  GROWTH: [
    "كل ما في Basic",
    "الفريق والصلاحيات (RBAC)",
    "الولاء + الشرائح + واجهات الحملات",
    "الأتمتة",
    "2 فرع + 2 POS",
    "Ops + Inventory + Finance",
  ],
  PRO: [
    "كل ما في Growth",
    "KPI + Audit Logs + Forecasting",
    "تقارير متقدمة + CFO",
    "تصديرات مالية ومحاسبية",
    "Inventory Insights",
    "5 فروع + 5 POS",
  ],
  ENTERPRISE: [
    "كل ما في Pro",
    "تكاملات مخصصة",
    "خيارات SLA متعددة",
    "أهلية تفعيل المكالمات الصوتية",
    "هيكل فروع / POS مخصص",
    "Ops + Inventory + Finance",
  ],
  CHAT_ONLY: [
    "واتساب + فيسبوك / ماسنجر",
    "ردود الذكاء الاصطناعي للعملاء",
    "سجل الرسائل",
    "Routing / Tagging أساسي",
    "لا يشمل وحدات التشغيل الكاملة",
  ],
};

const LIVE_AGENT_LABELS: Record<string, string> = {
  OPS_AGENT: "وكيل العمليات",
  INVENTORY_AGENT: "وكيل المخزون",
  FINANCE_AGENT: "وكيل المالية",
};

const PLAN_COLORS: Record<string, string> = {
  STARTER: "border-[var(--border-default)]",
  BASIC: "border-[var(--accent-blue)]/35",
  GROWTH: "border-[var(--accent-blue)]/55",
  PRO: "border-[var(--accent-success)]/35",
  ENTERPRISE: "border-[var(--accent-blue)]/45",
  CHAT_ONLY: "border-[var(--accent-blue)]/45",
};

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  if (value === -1) return "مخصص";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatEgp(value: number | null | undefined) {
  if (value == null) return "حسب الطلب";
  return `${formatNumber(value)} ج.م / شهر`;
}

function labelCapability(id: string) {
  return CAPABILITY_LABELS[id] || id.replaceAll("_", " ");
}

function getPlanCtaLabel(planId: string) {
  if (planId === "ENTERPRISE") return "تواصل مع المبيعات";
  if (planId === "CHAT_ONLY") return "ابدأ بباقة الدردشة";
  if (planId === "STARTER") return "ابدأ الآن";
  return "اختر الباقة";
}

function getCashierLabel(planId: string) {
  if (planId === "STARTER") return "مجاني لأول 30 يومًا فقط";
  if (["BASIC", "GROWTH", "PRO", "ENTERPRISE"].includes(planId)) {
    return "مضمن دائمًا";
  }
  return "غير متاح";
}

function getDisplayQuotas(plan: {
  id: string;
  totalMessagesPerDay: number;
  totalMessagesPerMonth: number;
  aiRepliesPerDay: number;
  aiRepliesPerMonth: number;
}) {
  const fixed = FINAL_APPROVED_PLAN_QUOTAS[plan.id];
  if (fixed) return fixed;
  return {
    totalMessagesPerDay: Number(plan.totalMessagesPerDay || 0),
    totalMessagesPerMonth: Number(plan.totalMessagesPerMonth || 0),
    aiRepliesPerDay: Number(plan.aiRepliesPerDay || 0),
    aiRepliesPerMonth: Number(plan.aiRepliesPerMonth || 0),
  };
}

function normalizeFeatureMeaning(code: string) {
  const normalized = String(code || "")
    .toLowerCase()
    .trim();
  return FEATURE_MEANING_ALIAS[normalized] || normalized;
}

function parseUsageUnits(item: PricingUsagePack): number {
  const code = String(item.code || "").toLowerCase();
  let match = code.match(/ai_plus_(\d+)_per_day/);
  if (match) return Number(match[1] || 0);

  match = code.match(/messages_plus_(\d+)k_month/);
  if (match) return Number(match[1] || 0) * 1000;

  match = code.match(/proof_scans_plus_(\d+)/);
  if (match) return Number(match[1] || 0);

  match = code.match(/transcription_minutes_plus_(\d+)/);
  if (match) return Number(match[1] || 0);

  const nameDigits = String(item.nameAr || "").match(/\d[\d,]*/);
  if (nameDigits) {
    return Number(String(nameDigits[0]).replaceAll(",", "")) || 0;
  }
  return 0;
}

function normalizeUsageFamily(item: PricingUsagePack): string {
  const code = String(item.code || "").toLowerCase();
  if (code.startsWith("ai_plus_")) return "AI_REPLIES";
  if (code.startsWith("messages_plus_")) return "MESSAGES";
  if (code.startsWith("proof_scans_plus_")) return "PAYMENT_PROOF_SCANS";
  if (code.startsWith("transcription_minutes_plus_")) {
    return "VOICE_TRANSCRIPTION";
  }
  return "OTHER";
}

function normalizeUsageTier(item: PricingUsagePack): string {
  const family = normalizeUsageFamily(item);
  const units = parseUsageUnits(item);

  if (family === "AI_REPLIES") {
    if (units <= 100) return "S";
    if (units <= 250) return "M";
    if (units <= 500) return "L";
    return "XL";
  }

  if (family === "MESSAGES") {
    if (units <= 25_000) return "S";
    if (units <= 50_000) return "M";
    if (units <= 100_000) return "L";
    return "XL";
  }

  if (family === "PAYMENT_PROOF_SCANS") {
    if (units <= 50) return "S";
    if (units <= 100) return "M";
    return "L";
  }

  if (family === "VOICE_TRANSCRIPTION") {
    if (units <= 100) return "S";
    if (units <= 250) return "M";
    return "L";
  }

  return "S";
}

function buildUsageMeaningKey(item: PricingUsagePack): string {
  const family = normalizeUsageFamily(item);
  const tier = normalizeUsageTier(item);
  return ["usage", family, tier, "M1", "PUBLIC", "MERCHANT"].join("|");
}

function supportsFeature(planId: string, key: string) {
  const map: Record<string, Record<string, boolean>> = {
    STARTER: {
      TEAM_RBAC: false,
      LOYALTY: false,
      AUTOMATIONS: false,
      PRO_ANALYTICS: false,
      API_ACCESS: false,
      FULL_INVENTORY: false,
    },
    BASIC: {
      TEAM_RBAC: false,
      LOYALTY: false,
      AUTOMATIONS: false,
      PRO_ANALYTICS: false,
      API_ACCESS: true,
      FULL_INVENTORY: true,
    },
    GROWTH: {
      TEAM_RBAC: true,
      LOYALTY: true,
      AUTOMATIONS: true,
      PRO_ANALYTICS: false,
      API_ACCESS: true,
      FULL_INVENTORY: true,
    },
    PRO: {
      TEAM_RBAC: true,
      LOYALTY: true,
      AUTOMATIONS: true,
      PRO_ANALYTICS: true,
      API_ACCESS: true,
      FULL_INVENTORY: true,
    },
    ENTERPRISE: {
      TEAM_RBAC: true,
      LOYALTY: true,
      AUTOMATIONS: true,
      PRO_ANALYTICS: true,
      API_ACCESS: true,
      FULL_INVENTORY: true,
    },
    CHAT_ONLY: {
      TEAM_RBAC: false,
      LOYALTY: false,
      AUTOMATIONS: false,
      PRO_ANALYTICS: false,
      API_ACCESS: false,
      FULL_INVENTORY: false,
    },
  };

  return map[planId]?.[key] || false;
}

function FeatureFlagCell({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-600">
      <Check className="h-3.5 w-3.5" /> نعم
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <X className="h-3.5 w-3.5" /> لا
    </span>
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

  const fullPlatformPlans = useMemo(() => {
    const plans = pricing?.catalog?.plans || [];
    return FULL_PLATFORM_ORDER.map((id) =>
      plans.find((plan) => plan.id === id),
    ).filter(Boolean) as PricingPlan[];
  }, [pricing]);

  const chatOnlyPlan = useMemo(
    () =>
      (pricing?.catalog?.plans || []).find((plan) => plan.id === "CHAT_ONLY"),
    [pricing],
  );

  const comparisonPlans = useMemo(() => {
    const plans = [...fullPlatformPlans];
    if (chatOnlyPlan) plans.push(chatOnlyPlan);
    return plans;
  }, [fullPlatformPlans, chatOnlyPlan]);

  const curatedFeatureAddOns = useMemo(() => {
    const order = new Map<string, number>(
      CURATED_FEATURE_ADDON_ORDER.map((code, index) => [code, index]),
    );
    const deduped = new Map<string, PricingFeatureAddOn>();
    for (const item of pricing?.catalog?.featureAddOns || []) {
      const code = String(
        item.code || "",
      ) as (typeof CURATED_FEATURE_ADDON_ORDER)[number];
      if (!CURATED_FEATURE_ADDON_SET.has(code)) continue;

      const meaningKey = normalizeFeatureMeaning(code);
      const current = deduped.get(meaningKey);
      if (!current) {
        deduped.set(meaningKey, item);
        continue;
      }

      const currentPrice = Number(
        current.monthlyPriceEgp || Number.MAX_SAFE_INTEGER,
      );
      const candidatePrice = Number(
        item.monthlyPriceEgp || Number.MAX_SAFE_INTEGER,
      );
      if (candidatePrice < currentPrice) {
        deduped.set(meaningKey, item);
      }
    }

    return Array.from(deduped.values()).sort(
      (a, b) =>
        (order.get(String(a.code || "")) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(String(b.code || "")) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [pricing]);

  const curatedUsagePacks = useMemo(() => {
    const deduped = new Map<string, PricingUsagePack>();
    for (const item of pricing?.catalog?.usagePacks || []) {
      const key = buildUsageMeaningKey(item);
      const current = deduped.get(key);
      if (!current) {
        deduped.set(key, item);
        continue;
      }

      const currentPrice = Number(
        current.monthlyPriceEgp || Number.MAX_SAFE_INTEGER,
      );
      const candidatePrice = Number(
        item.monthlyPriceEgp || Number.MAX_SAFE_INTEGER,
      );
      if (candidatePrice < currentPrice) {
        deduped.set(key, item);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => {
      const familyCompare =
        (USAGE_FAMILY_ORDER[normalizeUsageFamily(a)] || 99) -
        (USAGE_FAMILY_ORDER[normalizeUsageFamily(b)] || 99);
      if (familyCompare !== 0) return familyCompare;

      const tierCompare =
        (TIER_ORDER[normalizeUsageTier(a)] || 99) -
        (TIER_ORDER[normalizeUsageTier(b)] || 99);
      if (tierCompare !== 0) return tierCompare;

      return parseUsageUnits(a) - parseUsageUnits(b);
    });
  }, [pricing]);

  const handlePlanAction = async (planId: string) => {
    if (!apiKey) return;

    if (planId === "ENTERPRISE") {
      router.push("/merchant/billing?contactSales=enterprise");
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
        <PageHeader title="الأسعار" description="جاري تحميل باقات الأسعار..." />
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
          title="الأسعار"
          description="تعذر تحميل بيانات التسعير حالياً."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <PageHeader
        title="الأسعار والباقات"
        description="باقات التشغيل الكاملة + باقة الدردشة فقط + إضافات التوسّع"
      />

      <Card className="overflow-hidden border bg-[linear-gradient(120deg,var(--bg-surface)_0%,var(--bg-surface-2)_55%,var(--bg-surface)_100%)]">
        <CardContent className="space-y-4 p-5 sm:p-7">
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">
            شغّل المبيعات والعمليات ورسائل العملاء من مكان واحد
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            اختَر باقة تشغيل كاملة أو ابدأ بباقة الدردشة فقط
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">كل الأسعار بالـ EGP</Badge>
            <Badge className="border-0 bg-[var(--brand-blue-dim)] text-[var(--brand-blue)]">
              Trial لا يظهر كباقة مدفوعة رئيسية
            </Badge>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">باقات التشغيل الكاملة</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {fullPlatformPlans.map((plan) => {
            const cta = getPlanCtaLabel(plan.id);
            const quotas = getDisplayQuotas(plan);
            return (
              <Card
                key={plan.id}
                className={cn(
                  "app-data-card flex h-full flex-col border",
                  PLAN_COLORS[plan.id] || "border-[var(--border-default)]",
                )}
              >
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{plan.nameAr}</CardTitle>
                    {plan.id === "GROWTH" ? (
                      <Badge className="border-0 bg-[var(--brand-blue-dim)] text-[var(--brand-blue)]">
                        الأكثر توازنًا
                      </Badge>
                    ) : null}
                    {plan.id === "STARTER" ? (
                      <Badge variant="secondary">
                        الكاشير مجاني لأول 30 يومًا فقط
                      </Badge>
                    ) : null}
                  </div>
                  <CardDescription className="min-h-[36px]">
                    {plan.bestFor}
                  </CardDescription>
                  <p className="font-mono text-2xl font-black text-[var(--brand-blue)]">
                    {formatEgp(plan.monthlyPriceEgp)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {plan.mainValue}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2 rounded-lg border bg-background/70 p-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">الرسائل / يوم</p>
                      <p className="font-semibold">
                        {formatNumber(quotas.totalMessagesPerDay)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">الرسائل / شهر</p>
                      <p className="font-semibold">
                        {formatNumber(quotas.totalMessagesPerMonth)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        ردود الذكاء الاصطناعي / يوم
                      </p>
                      <p className="font-semibold">
                        {formatNumber(quotas.aiRepliesPerDay)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        ردود الذكاء الاصطناعي / شهر
                      </p>
                      <p className="font-semibold">
                        {formatNumber(quotas.aiRepliesPerMonth)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {(PLAN_TOP_BULLETS[plan.id] || [])
                      .slice(0, 6)
                      .map((line) => (
                        <p
                          key={line}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <Check className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                          <span>{line}</span>
                        </p>
                      ))}
                  </div>

                  <Button
                    className="mt-auto w-full"
                    variant={plan.id === "ENTERPRISE" ? "outline" : "default"}
                    onClick={() => handlePlanAction(plan.id)}
                    disabled={checkoutPlan === plan.id}
                  >
                    {checkoutPlan === plan.id ? "جاري الإنشاء..." : cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {chatOnlyPlan ? (
        <section className="space-y-4">
          {(() => {
            const quotas = getDisplayQuotas(chatOnlyPlan);
            return (
              <>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-semibold">باقة الدردشة فقط</h2>
                </div>

                <Card className="border-[var(--accent-blue)]/40 bg-[var(--bg-surface-2)]">
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{chatOnlyPlan.nameAr}</CardTitle>
                      <Badge variant="secondary">منتج تواصل فقط</Badge>
                      <Badge className="border-0 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                        سعة رسائل أعلى من Starter
                      </Badge>
                    </div>
                    <CardDescription>{chatOnlyPlan.bestFor}</CardDescription>
                    <p className="font-mono text-2xl font-black text-[var(--accent-blue)]">
                      {formatEgp(chatOnlyPlan.monthlyPriceEgp)}
                    </p>
                  </CardHeader>

                  <CardContent className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
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

                      <div className="rounded-lg border bg-background/70 p-3 text-xs text-muted-foreground">
                        هذه الباقة أضيق وظيفيًا من Starter لكنها موجهة للتواصل
                        وتقدم سعة رسائل أعلى.
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border bg-background p-4">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">الرسائل / يوم</p>
                          <p className="font-semibold">
                            {formatNumber(quotas.totalMessagesPerDay)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">الرسائل / شهر</p>
                          <p className="font-semibold">
                            {formatNumber(quotas.totalMessagesPerMonth)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            ردود الذكاء الاصطناعي / يوم
                          </p>
                          <p className="font-semibold">
                            {formatNumber(quotas.aiRepliesPerDay)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            ردود الذكاء الاصطناعي / شهر
                          </p>
                          <p className="font-semibold">
                            {formatNumber(quotas.aiRepliesPerMonth)}
                          </p>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => handlePlanAction(chatOnlyPlan.id)}
                        disabled={checkoutPlan === chatOnlyPlan.id}
                      >
                        {checkoutPlan === chatOnlyPlan.id
                          ? "جاري الإنشاء..."
                          : getPlanCtaLabel(chatOnlyPlan.id)}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>مقارنة تفصيلية بين الباقات</CardTitle>
          <CardDescription>
            افتح الجدول لمقارنة الحدود، الوكلاء، والوصول للميزات الأساسية.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details className="group rounded-lg border bg-background/70 p-3">
            <summary className="cursor-pointer list-none text-sm font-semibold">
              فتح / إغلاق جدول المقارنة
            </summary>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[980px] text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-semibold">العنصر</th>
                    {comparisonPlans.map((plan) => (
                      <th key={plan.id} className="p-2 font-semibold">
                        {plan.nameAr}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 font-medium">نوع الباقة</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-scope`} className="p-2">
                        {plan.isFullPlatformPlan ? "تشغيل كامل" : "دردشة فقط"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">الرسائل / يوم</td>
                    {comparisonPlans.map((plan) => {
                      const quotas = getDisplayQuotas(plan);
                      return (
                        <td key={`${plan.id}-day-msg`} className="p-2">
                          {formatNumber(quotas.totalMessagesPerDay)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">الرسائل / شهر</td>
                    {comparisonPlans.map((plan) => {
                      const quotas = getDisplayQuotas(plan);
                      return (
                        <td key={`${plan.id}-month-msg`} className="p-2">
                          {formatNumber(quotas.totalMessagesPerMonth)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">
                      ردود الذكاء الاصطناعي / يوم
                    </td>
                    {comparisonPlans.map((plan) => {
                      const quotas = getDisplayQuotas(plan);
                      return (
                        <td key={`${plan.id}-day-ai`} className="p-2">
                          {formatNumber(quotas.aiRepliesPerDay)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">
                      ردود الذكاء الاصطناعي / شهر
                    </td>
                    {comparisonPlans.map((plan) => {
                      const quotas = getDisplayQuotas(plan);
                      return (
                        <td key={`${plan.id}-month-ai`} className="p-2">
                          {formatNumber(quotas.aiRepliesPerMonth)}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">الفروع</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-branches`} className="p-2">
                        {formatNumber(plan.includedBranches)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">اتصالات POS</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-pos`} className="p-2">
                        {formatNumber(plan.includedPosConnections)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">الكاشير</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-cashier`} className="p-2">
                        {getCashierLabel(plan.id)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">الفريق / RBAC</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-team`} className="p-2">
                        <FeatureFlagCell
                          value={supportsFeature(plan.id, "TEAM_RBAC")}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">الولاء</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-loyalty`} className="p-2">
                        <FeatureFlagCell
                          value={supportsFeature(plan.id, "LOYALTY")}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">الأتمتة</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-auto`} className="p-2">
                        <FeatureFlagCell
                          value={supportsFeature(plan.id, "AUTOMATIONS")}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">
                      KPI / Audit / Forecasting
                    </td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-analytics`} className="p-2">
                        <FeatureFlagCell
                          value={supportsFeature(plan.id, "PRO_ANALYTICS")}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">API Access</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-api`} className="p-2">
                        <FeatureFlagCell
                          value={supportsFeature(plan.id, "API_ACCESS")}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">مخزون كامل</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-inventory`} className="p-2">
                        <FeatureFlagCell
                          value={supportsFeature(plan.id, "FULL_INVENTORY")}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 font-medium">الوكلاء الحية المضمنة</td>
                    {comparisonPlans.map((plan) => (
                      <td key={`${plan.id}-agents`} className="p-2">
                        {plan.includedAgents.length
                          ? plan.includedAgents
                              .map((agent) => LIVE_AGENT_LABELS[agent] || agent)
                              .join(" + ")
                          : "غير مضمن"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">الإضافات</h2>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>1) إضافات المزايا</CardTitle>
              <CardDescription>
                توسّع مزايا الخطة دون تغيير الباقة.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {curatedFeatureAddOns.map((item) => (
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
                    {formatNumber(item.monthlyPriceEgp)} ج.م
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2) إضافات الوكلاء</CardTitle>
              <CardDescription>
                الوكلاء الحية القابلة للبيع فقط: Ops / Inventory / Finance.
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
                    {formatNumber(item.monthlyPriceEgp)} ج.م
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3) باقات الاستخدام</CardTitle>
              <CardDescription>
                سعات إضافية للردود الذكية، الرسائل، الفحوصات، والتفريغ الصوتي.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {curatedUsagePacks.map((item) => (
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
                    {formatNumber(item.monthlyPriceEgp)} ج.م
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4) الباقات المخصصة / المؤسسية</CardTitle>
              <CardDescription>
                حدود تسعير البداية للتكاملات وSLA وتفعيل المكالمات.
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
                    {formatNumber(item.priceEgp)} ج.م /{" "}
                    {item.billingType === "one_time" ? "مرة واحدة" : "شهر"}
                  </Badge>
                </div>
              ))}

              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  router.push("/merchant/billing?contactSales=custom")
                }
              >
                تواصل مع المبيعات
                <CreditCard className="mr-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>ملاحظات مهمة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• الرسائل = إجمالي الرسائل المُدارة داخل المنصة.</p>
          <p>• تشمل رسائل العملاء + ردود الذكاء الاصطناعي.</p>
          <p>• رسوم قوالب واتساب المدفوعة تُحاسب بشكل منفصل.</p>
          <p>• المكالمات لا تشملها الباقات القياسية.</p>
          <p>• الكاشير مجاني لأول 30 يومًا في الاشتراكات الجديدة المؤهلة.</p>
        </CardContent>
      </Card>
    </div>
  );
}
