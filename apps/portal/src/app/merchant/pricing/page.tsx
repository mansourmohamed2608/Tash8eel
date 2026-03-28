"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertBanner } from "@/components/ui/alerts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Sparkles,
  Package,
  CreditCard,
  MessageSquare,
  ShoppingCart,
  BarChart3,
  Bell,
  Shield,
  Webhook,
  ScanLine,
  Star,
  Users,
  Zap,
  Calculator,
  ArrowRight,
  Check,
  Crown,
  Phone,
  TrendingUp,
  Brain,
  Repeat,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";

const FEATURE_ICONS: Record<string, React.ElementType> = {
  CONVERSATIONS: MessageSquare,
  ORDERS: ShoppingCart,
  CATALOG: Package,
  INVENTORY: Package,
  PAYMENTS: CreditCard,
  VISION_OCR: ScanLine,
  VOICE_NOTES: MessageSquare,
  REPORTS: BarChart3,
  WEBHOOKS: Webhook,
  TEAM: Users,
  LOYALTY: Star,
  NOTIFICATIONS: Bell,
  AUDIT_LOGS: Shield,
  KPI_DASHBOARD: BarChart3,
  API_ACCESS: Webhook,
};

const AGENT_ICONS: Record<string, React.ElementType> = {
  OPS_AGENT: Bot,
  INVENTORY_AGENT: Package,
  FINANCE_AGENT: CreditCard,
  MARKETING_AGENT: Sparkles,
  SUPPORT_AGENT: Users,
  CONTENT_AGENT: Sparkles,
  SALES_AGENT: ShoppingCart,
  CREATIVE_AGENT: Star,
};

interface PricingData {
  plans: Array<{
    id: string;
    price: number | null;
    currency: string;
    trialDays: number | null;
    agents: string[];
    features: string[];
    limits: any;
  }>;
  featurePrices: Record<string, number>;
  agentPrices: Record<string, number>;
  aiUsageTiers: Record<
    string,
    { aiCallsPerDay: number; price: number; label: string }
  >;
  messageTiers: Record<
    string,
    { messagesPerMonth: number; price: number; label: string }
  >;
  agents: Array<{
    id: string;
    nameAr: string;
    descriptionAr: string;
    status: string;
    price: number;
    dependencies: string[];
    features: string[];
  }>;
  features: Array<{
    id: string;
    nameAr: string;
    descriptionAr: string;
    status: string;
    price: number;
    requiredAgent: string | null;
    dependencies: string[];
  }>;
}

const PLAN_NAMES: Record<string, string> = {
  TRIAL: "تجريبي (14 يوم)",
  STARTER: "المبتدئ - 999 ج.م",
  BASIC: "الأساسي - 2,200 ج.م",
  GROWTH: "النمو - 4,800 ج.م",
  PRO: "الاحترافي - 10,000 ج.م",
  ENTERPRISE: "المؤسسات - 21,500 ج.م",
};

const PLAN_TAGLINES: Record<string, string> = {
  STARTER: "واتساب ذكي + استقبال طلبات - 250 محادثة/شهر",
  BASIC: "كل مميزات المبتدئ + لينكات دفع + مخزون + API - 500 محادثة/شهر",
  GROWTH: "للنمو السريع مع أتمتة الأعمال وحملات التسويق - 1,500 محادثة/شهر",
  PRO: "للعمليات الاحترافية مع التنبؤات والخط الصوتي - 4,000 محادثة/شهر",
  ENTERPRISE:
    "للشركات الكبيرة مع محرك مكالمات ذكية وSLA مضمون - 10,000 محادثة/شهر",
};

const PLAN_COLORS: Record<string, string> = {
  STARTER: "border-slate-200",
  BASIC: "border-slate-300",
  GROWTH: "border-primary",
  PRO: "border-violet-400",
  ENTERPRISE: "border-amber-400",
};

const PLAN_BADGE: Record<string, string | null> = {
  STARTER: null,
  BASIC: null,
  GROWTH: "الأكثر شعبية",
  PRO: "الأفضل قيمة",
  ENTERPRISE: null,
};

const COUNTRY_CONFIG: Record<
  string,
  { nameAr: string; currency: string; flag: string }
> = {
  EG: { nameAr: "مصر", currency: "ج.م", flag: "🇪🇬" },
  SA: { nameAr: "السعودية", currency: "ر.س", flag: "🇸🇦" },
  AE: { nameAr: "الإمارات", currency: "د.إ", flag: "🇦🇪" },
  OM: { nameAr: "عُمان", currency: "ر.ع", flag: "🇴🇲" },
  KW: { nameAr: "الكويت", currency: "د.ك", flag: "🇰🇼" },
};

const ADDON_LIST: Array<{
  id: string;
  nameAr: string;
  descAr: string;
  icon: React.ElementType;
  appliesTo: string;
  prices: Record<string, number>;
  priceUsd?: number;
}> = [
  {
    id: "ADDON_AUTONOMOUS_AGENT",
    nameAr: "وكيل ذاتي التحكم",
    descAr: "إجراءات مستقلة - إضافة على خطط المبتدئ / الأساسي / النمو",
    icon: Bot,
    appliesTo: "STARTER / BASIC / GROWTH",
    prices: { EG: 1650, SA: 175, AE: 185, OM: 17.5, KW: 14.9 },
  },
  {
    id: "ADDON_MULTI_BRANCH",
    nameAr: "إدارة فروع متعددة",
    descAr:
      "لوحة تحكم موحدة لكل الفروع - إضافة على خطط المبتدئ / الأساسي / النمو",
    icon: Users,
    appliesTo: "STARTER / BASIC / GROWTH",
    prices: { EG: 1100, SA: 120, AE: 125, OM: 11.5, KW: 9.9 },
  },
  {
    id: "ADDON_PROACTIVE_ALERTS",
    nameAr: "تنبيهات استباقية",
    descAr:
      "رصد مخزون / دفع / عملاء تلقائياً - إضافة على خطط المبتدئ / الأساسي / النمو",
    icon: Bell,
    appliesTo: "STARTER / BASIC / GROWTH",
    prices: { EG: 650, SA: 70, AE: 75, OM: 7, KW: 6 },
  },
  {
    id: "ADDON_TEAM_SEAT_BUNDLE",
    nameAr: "حزمة مقاعد الفريق",
    descAr: "3 مقاعد وكلاء إضافية - متاح لجميع الخطط",
    icon: Users,
    appliesTo: "جميع الخطط",
    prices: { EG: 900, SA: 95, AE: 100, OM: 9, KW: 8 },
  },
  {
    id: "AI_TOPUP_SMALL",
    nameAr: "باقة ذكاء اصطناعي صغيرة",
    descAr: "5,000 إجراء ذكاء اصطناعي إضافية - متاح لجميع الخطط",
    icon: Zap,
    appliesTo: "جميع الخطط",
    prices: {},
    priceUsd: 25,
  },
  {
    id: "AI_TOPUP_MEDIUM",
    nameAr: "باقة ذكاء اصطناعي متوسطة",
    descAr: "20,000 إجراء ذكاء اصطناعي إضافية - متاح لجميع الخطط",
    icon: Zap,
    appliesTo: "جميع الخطط",
    prices: {},
    priceUsd: 95,
  },
  {
    id: "WA_TOPUP_SMALL",
    nameAr: "باقة واتساب صغيرة",
    descAr: "1,000 محادثة واتساب إضافية - متاح لجميع الخطط",
    icon: MessageSquare,
    appliesTo: "جميع الخطط",
    prices: {},
    priceUsd: 40,
  },
  {
    id: "WA_TOPUP_MEDIUM",
    nameAr: "باقة واتساب متوسطة",
    descAr: "4,000 محادثة واتساب إضافية - متاح لجميع الخطط",
    icon: MessageSquare,
    appliesTo: "جميع الخطط",
    prices: {},
    priceUsd: 140,
  },
];

interface PlanSection {
  heading: string;
  icon: React.ElementType;
  items: string[];
}

const PLAN_CONFIGS: Record<string, PlanSection[]> = {
  STARTER: [
    {
      heading: "التجارة الأساسية",
      icon: ShoppingCart,
      items: [
        "إدارة الطلبات عبر واتساب",
        "كتالوج المنتجات والمتغيرات",
        "ملفات العملاء والتاريخ الكامل",
        "إدارة التوصيل والمناطق",
        "بوابة سائقي التوصيل",
      ],
    },
    {
      heading: "المخزون",
      icon: Package,
      items: [
        "إدارة المخزون ومتابعة المنتجات",
        "تنبيهات المخزون المنخفض",
        "متغيرات المنتج (مقاس / لون / وزن)",
      ],
    },
    {
      heading: "الذكاء الاصطناعي",
      icon: Bot,
      items: [
        "وكيل مبيعات عربي 24/7",
        "التحقق من إثباتات الدفع بالصور",
        "ملاحظات صوتية (نسخ تلقائي)",
        "500 رد ذكي / يوم",
      ],
    },
    {
      heading: "التقارير والبنية التحتية",
      icon: BarChart3,
      items: [
        "تقارير مالية أساسية",
        "لوحة العمليات اليومية",
        "استيراد وتصدير CSV",
      ],
    },
  ],
  BASIC: [
    {
      heading: "كل ميزات المبتدئ +",
      icon: Check,
      items: [],
    },
    {
      heading: "الدفع والتكاملات",
      icon: ShoppingCart,
      items: [
        "لينكات دفع - العميل يدفع أونلاين مباشرة",
        "ربط بأنظمة خارجية عبر API",
        "إدارة المخزون ومتابعة المنتجات",
        "تنبيهات المخزون المنخفض",
        "وكيل المالية والتقارير",
      ],
    },
    {
      heading: "الذكاء الاصطناعي",
      icon: Bot,
      items: [
        "وكيل مبيعات عربي 24/7",
        "التحقق من إثباتات الدفع بالصور",
        "200 رد ذكي / يوم",
      ],
    },
  ],
  GROWTH: [
    {
      heading: "كل ميزات الأساسي +",
      icon: Check,
      items: [],
    },
    {
      heading: "التسويق والمبيعات",
      icon: Sparkles,
      items: [
        "حملات البث على واتساب",
        "تقسيم العملاء الديناميكي",
        "برنامج الولاء والنقاط",
        "اختيار الجمهور بالذكاء الاصطناعي",
        "الإشعارات الفورية",
      ],
    },
    {
      heading: "الأتمتة",
      icon: Zap,
      items: [
        "10 أتمتات نشطة في وقت واحد",
        "تنبيهات المخزون المنخفض",
        "متابعة الدفع التلقائية",
        "إشعارات مراحل الطلب للعميل",
        "تذكير تجديد الاشتراك",
        "إنقاذ السلة المتروكة",
      ],
    },
    {
      heading: "التحليلات",
      icon: BarChart3,
      items: [
        "لوحة KPI المتقدمة",
        "تحليلات المبيعات التفصيلية",
        "أداء الفريق والوكلاء",
        "تقرير المدير المالي الشهري",
      ],
    },
  ],
  PRO: [
    {
      heading: "كل ميزات النمو +",
      icon: Check,
      items: [],
    },
    {
      heading: "الأتمتة المتقدمة",
      icon: Repeat,
      items: [
        "50 أتمتة نشطة في وقت واحد",
        "جميع 17 نوع أتمتة",
        "رصد مشاعر العملاء (سخط / رضا)",
        "تقييم العملاء المحتملين بالذكاء الاصطناعي",
        "تصنيف VIP والعملاء في خطر تلقائياً",
        "تنبيه تجاوز مواعيد التوصيل (SLA)",
        "استعادة العملاء الخاملين تلقائياً",
      ],
    },
    {
      heading: "منصة التنبؤات الذكية",
      icon: TrendingUp,
      items: [
        "توقعات الطلب بنطاقات الثقة 95%",
        "التنبؤ بتاريخ نفاد المخزون",
        "حساب المخزون الأمني الأمثل",
        "توصيات التزويد بنقرة واحدة",
        "توقع التدفق النقدي 30 يوماً",
        "توقع مغادرة العملاء وإعادة استهدافهم",
        "توقع تأخير التوصيل",
        "توقع حِمل الفريق الأسبوعي",
        "توقع عائد الحملات قبل إطلاقها",
        "محاكي السيناريوهات (ماذا لو)",
      ],
    },
    {
      heading: "المخزون والموردين",
      icon: Package,
      items: [
        "مخزون متعدد المواقع",
        "رؤى ذكاء اصطناعي للمخزون",
        "تقييم FIFO للتكلفة الحقيقية",
        "تتبع تواريخ الانتهاء",
        "اكتشاف الموردين بالذكاء الاصطناعي",
        "أوامر الشراء الكاملة",
      ],
    },
    {
      heading: "فريق ومالية",
      icon: Users,
      items: [
        "فروع متعددة",
        "أدوار وصلاحيات متقدمة",
        "حزمة المحاسب لإدارة الضرائب",
        "وكيل ذاتي التحكم",
      ],
    },
  ],
  ENTERPRISE: [
    {
      heading: "كل ميزات الاحترافي +",
      icon: Check,
      items: [],
    },
    {
      heading: "محرك المكالمات بالذكاء الاصطناعي",
      icon: Phone,
      items: [
        "وكيل مبيعات هاتفي صادر بالعربية",
        "استقبال مكالمات تلقائي 24/7",
        "مكالمات تأكيد الطلبات",
        "مكالمات إشعار التوصيل",
        "حملات استعادة العملاء بالهاتف",
        "مكالمات رضا ما بعد التوصيل",
        "تسجيل ونسخ المكالمات بالعربية",
        "لوحة تحليلات المكالمات",
        "تدفقات هجينة (مكالمة + واتساب)",
        "تحويل للوكيل البشري مع السياق",
      ],
    },
    {
      heading: "العمليات المؤسسية",
      icon: Brain,
      items: [
        "فروع غير محدودة",
        "مدير حساب مخصص",
        "SLA دعم 4 ساعات",
        "مفاتيح API مؤسسية",
        "دعم التكامل مع الأنظمة الخارجية",
      ],
    },
  ],
};

export default function PricingCalculatorPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Country / currency
  const [country, setCountry] = useState("EG");
  const currencyLabel = COUNTRY_CONFIG[country]?.currency ?? "ج.م";

  // User selections
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(["OPS_AGENT"]),
  );
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(
    new Set(["CONVERSATIONS", "ORDERS", "CATALOG"]),
  );
  const [aiTier, setAiTier] = useState("BASIC");
  const [messageTier, setMessageTier] = useState("STARTER");

  // Calculated price
  const [calcResult, setCalcResult] = useState<{
    totalMonthly: number;
    breakdown: Array<{ item: string; nameAr: string; price: number }>;
    recommendedPlan: string | null;
    recommendedPlanPrice: number | null;
    savingsVsCustom: number;
  } | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    merchantApi
      .getPricing(apiKey)
      .then((data) => {
        setPricing(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    merchantApi
      .getBillingCatalog(apiKey, country as "EG" | "SA" | "AE" | "OM" | "KW")
      .then(setCatalog)
      .catch(() => {
        /* non-blocking */
      });
  }, [apiKey, country]);

  // Auto-calculate when selections change
  useEffect(() => {
    if (!apiKey) return;
    const timer = setTimeout(() => {
      merchantApi
        .calculatePrice(apiKey, {
          agents: Array.from(selectedAgents),
          features: Array.from(selectedFeatures),
          aiTier,
          messageTier,
        })
        .then(setCalcResult)
        .catch(() => {
          /* price calc non-blocking */
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [apiKey, selectedAgents, selectedFeatures, aiTier, messageTier]);

  const toggleAgent = useCallback(
    (agentId: string) => {
      setSelectedAgents((prev) => {
        const next = new Set(prev);
        if (next.has(agentId)) {
          if (agentId === "OPS_AGENT") return prev; // Can't remove core agent
          next.delete(agentId);
          // Remove features that require this agent
          if (pricing) {
            const agentFeatures =
              pricing.agents.find((a) => a.id === agentId)?.features || [];
            setSelectedFeatures((sf) => {
              const nf = new Set(sf);
              agentFeatures.forEach((f) => nf.delete(f));
              return nf;
            });
          }
        } else {
          next.add(agentId);
          // Auto-add dependencies
          const agent = pricing?.agents.find((a) => a.id === agentId);
          agent?.dependencies.forEach((dep) => next.add(dep));
          // Auto-add agent's core features
          agent?.features.forEach((f) => {
            setSelectedFeatures((sf) => new Set([...sf, f]));
          });
        }
        return next;
      });
    },
    [pricing],
  );

  const toggleFeature = useCallback(
    (featureId: string) => {
      setSelectedFeatures((prev) => {
        const next = new Set(prev);
        if (next.has(featureId)) {
          // Don't remove core features
          if (["CONVERSATIONS", "ORDERS", "CATALOG"].includes(featureId))
            return prev;
          next.delete(featureId);
        } else {
          next.add(featureId);
          // Auto-add dependencies
          const feature = pricing?.features.find((f) => f.id === featureId);
          feature?.dependencies.forEach((dep) => next.add(dep));
          // Auto-add required agent
          if (
            feature?.requiredAgent &&
            !selectedAgents.has(feature.requiredAgent)
          ) {
            setSelectedAgents((sa) => {
              const na = new Set(sa);
              na.add(feature.requiredAgent!);
              // Also add agent's dependencies
              const agentEntry = pricing?.agents.find(
                (a) => a.id === feature.requiredAgent,
              );
              agentEntry?.dependencies.forEach((dep) => na.add(dep));
              return na;
            });
          }
        }
        return next;
      });
    },
    [pricing, selectedAgents],
  );

  const selectPresetPlan = useCallback(
    (planId: string) => {
      const plan = pricing?.plans.find((p) => p.id === planId);
      if (!plan) return;
      setSelectedAgents(new Set(plan.agents));
      setSelectedFeatures(new Set(plan.features));
    },
    [pricing],
  );

  const handleCheckout = useCallback(
    async (planCode: string) => {
      if (!apiKey) return;
      try {
        const result = await merchantApi.createBillingCheckout(
          apiKey,
          planCode,
        );
        toast({ title: "تم", description: result.message });
      } catch (err: any) {
        toast({
          title: "خطأ",
          description: err.message || "فشل في إنشاء طلب الاشتراك",
          variant: "destructive",
        });
      }
    },
    [apiKey, toast],
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <PageHeader title="حاسبة الأسعار" description="جاري التحميل..." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!pricing) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="حاسبة الأسعار"
          description="تعذر تحميل بيانات الأسعار"
        />
        <AlertBanner
          type="error"
          title="خطأ"
          message="تعذر تحميل بيانات الأسعار. حاول مرة أخرى."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="حاسبة الأسعار"
        description="اختر الميزات والوكلاء اللي تحتاجهم وشوف السعر مباشرة - بدون انتظار أحد"
        actions={
          <div className="flex items-center gap-2">
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COUNTRY_CONFIG).map(([code, cfg]) => (
                  <SelectItem key={code} value={code}>
                    {cfg.flag} {cfg.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
              <Calculator className="h-4 w-4 ml-1" />
              أسعار بـ{currencyLabel}
            </Badge>
          </div>
        }
      />

      {/* Plan Comparison Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-1">الباقات الجاهزة</h2>
        <p className="text-sm text-muted-foreground mb-4">
          اختر الباقة المناسبة - أو استخدم حاسبة الأسعار أدناه لتخصيص باقتك
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {pricing.plans
            .filter((p) => p.id !== "TRIAL")
            .map((plan) => {
              const badge = PLAN_BADGE[plan.id];
              const sections = PLAN_CONFIGS[plan.id] || [];
              const isRecommended = calcResult?.recommendedPlan === plan.id;
              const catalogBundle = catalog?.bundles?.find(
                (b: any) => b.code === plan.id,
              );
              const catalogMonthlyPrice: number | null =
                catalogBundle?.prices?.find((p: any) => p.cycleMonths === 1)
                  ?.effectiveMonthlyCents != null
                  ? catalogBundle.prices.find((p: any) => p.cycleMonths === 1)
                      .effectiveMonthlyCents / 100
                  : null;
              const displayPrice: number | null =
                catalogMonthlyPrice ?? plan.price;
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-lg border-2 flex flex-col",
                    isRecommended
                      ? "border-primary shadow-md"
                      : PLAN_COLORS[plan.id] || "border-transparent",
                  )}
                  onClick={() => selectPresetPlan(plan.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {PLAN_NAMES[plan.id] || plan.id}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {PLAN_TAGLINES[plan.id]}
                        </p>
                      </div>
                      {badge && (
                        <Badge className="text-[10px] shrink-0 bg-primary">
                          {badge}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-2xl font-bold">
                        {displayPrice != null ? `${displayPrice}` : "مخصص"}
                      </span>
                      {displayPrice != null && (
                        <span className="text-sm text-muted-foreground mr-1">
                          {currencyLabel}/شهر
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 flex-1 space-y-3">
                    {sections.map((section) => {
                      const SectionIcon = section.icon;
                      return (
                        <div key={section.heading}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <SectionIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs font-semibold text-primary">
                              {section.heading}
                            </span>
                          </div>
                          {section.items.length > 0 && (
                            <ul className="space-y-1">
                              {section.items.map((item) => (
                                <li
                                  key={item}
                                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                                >
                                  <Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>

                  <div className="p-4 pt-0 mt-auto">
                    <Button
                      size="sm"
                      variant={isRecommended ? "default" : "outline"}
                      className={cn(
                        "w-full text-xs",
                        plan.id === "BASIC" &&
                          !isRecommended &&
                          "border-blue-300 text-blue-700 hover:bg-blue-50",
                        plan.id === "PRO" &&
                          !isRecommended &&
                          "border-violet-400 text-violet-700 hover:bg-violet-50",
                        plan.id === "ENTERPRISE" &&
                          !isRecommended &&
                          "border-amber-400 text-amber-700 hover:bg-amber-50",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckout(plan.id);
                      }}
                    >
                      {plan.id === "ENTERPRISE" ? "تواصل معنا" : "اشترك الآن"}
                    </Button>
                  </div>
                </Card>
              );
            })}
        </div>
      </div>

      {/* Add-Ons Section */}
      <div>
        <h2 className="text-lg font-semibold mb-1">الإضافات المتاحة</h2>
        <p className="text-sm text-muted-foreground mb-4">
          أضفها على أي خطة - تُفعَّل وتُلغى في أي وقت بدون عقود
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ADDON_LIST.map((addon) => {
            const Icon = addon.icon;
            const localPrice = addon.prices[country] ?? null;
            const priceDisplay =
              localPrice != null ? String(localPrice) : `~$${addon.priceUsd}`;
            const unitLabel =
              localPrice != null ? `${currencyLabel}/شهر` : "USD/شهر";
            return (
              <Card
                key={addon.id}
                className="flex flex-col border border-border"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-2">
                    <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <CardTitle className="text-sm">{addon.nameAr}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {addon.descAr}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 mt-auto">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold text-primary">
                      {priceDisplay}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {unitLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    صالح لـ: {addon.appliesTo}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Feature Builder */}
        <div className="lg:col-span-2 space-y-6">
          {/* Agents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                الوكلاء الذكية
              </CardTitle>
              <CardDescription>
                اختر الوكلاء اللي محتاجهم - كل وكيل بيجيب ميزات معينة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pricing.agents.map((agent) => {
                const Icon = AGENT_ICONS[agent.id] || Bot;
                const isSelected = selectedAgents.has(agent.id);
                const isCore = agent.id === "OPS_AGENT";
                const isComingSoon = agent.status === "coming_soon";

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary/5 border-primary"
                        : "bg-background hover:bg-muted/50",
                      isComingSoon && "opacity-50",
                    )}
                    onClick={() => !isComingSoon && toggleAgent(agent.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isCore || isComingSoon}
                    />
                    <Icon className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {agent.nameAr}
                        </span>
                        {isCore && (
                          <Badge variant="secondary" className="text-[10px]">
                            أساسي
                          </Badge>
                        )}
                        {isComingSoon && (
                          <Badge variant="outline" className="text-[10px]">
                            قريباً
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {agent.descriptionAr}
                      </p>
                    </div>
                    <span className="font-bold text-sm">
                      {agent.price} جنيه
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                الميزات الإضافية
              </CardTitle>
              <CardDescription>
                أضف ميزات فردية حسب احتياجك - بعض الميزات مشمولة مع الوكيل
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {pricing.features.map((feature) => {
                  const Icon = FEATURE_ICONS[feature.id] || Zap;
                  const isSelected = selectedFeatures.has(feature.id);
                  const isComingSoon = feature.status === "coming_soon";
                  // Check if included via agent
                  const includedByAgent = pricing.agents.some(
                    (a) =>
                      selectedAgents.has(a.id) &&
                      a.features.includes(feature.id),
                  );

                  return (
                    <div
                      key={feature.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors",
                        isSelected
                          ? "bg-primary/5 border-primary/50"
                          : "bg-background",
                        includedByAgent && "bg-green-50 border-green-200",
                        isComingSoon && "opacity-50",
                        !isComingSoon && "cursor-pointer hover:bg-muted/50",
                      )}
                      onClick={() =>
                        !isComingSoon &&
                        !includedByAgent &&
                        toggleFeature(feature.id)
                      }
                    >
                      <Checkbox
                        checked={isSelected || includedByAgent}
                        disabled={includedByAgent || isComingSoon}
                      />
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{feature.nameAr}</span>
                      {includedByAgent ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-green-600"
                        >
                          مشمول
                        </Badge>
                      ) : (
                        <span className="text-xs font-semibold">
                          {feature.price} جنيه
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Usage Tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  باقة الذكاء الاصطناعي
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={aiTier} onValueChange={setAiTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(pricing.aiUsageTiers).map(([key, tier]) => (
                      <SelectItem key={key} value={key}>
                        {tier.label} -{" "}
                        {tier.aiCallsPerDay === -1
                          ? "بلا حدود"
                          : `${tier.aiCallsPerDay} أمر/يوم`}
                        {tier.price > 0
                          ? ` (+${tier.price} جنيه)`
                          : " (مجاناً مع الباقة)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  حجم الرسائل
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={messageTier} onValueChange={setMessageTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(pricing.messageTiers).map(([key, tier]) => (
                      <SelectItem key={key} value={key}>
                        {tier.label}
                        {tier.price > 0
                          ? ` (+${tier.price} جنيه)`
                          : " (مجاناً مع الباقة)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right: Price Summary (Sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <Card className="border-2 border-primary/50 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  ملخص السعر
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {calcResult ? (
                  <>
                    {/* Breakdown */}
                    <div className="space-y-2">
                      {calcResult.breakdown.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {item.nameAr}
                          </span>
                          <span className="font-medium">{item.price} جنيه</span>
                        </div>
                      ))}
                      {calcResult.breakdown.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          اختر وكيل أو ميزة
                        </p>
                      )}
                    </div>

                    <div className="border-t pt-3">
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold">الإجمالي الشهري</span>
                        <span className="text-2xl font-bold text-primary">
                          {calcResult.totalMonthly}{" "}
                          <span className="text-sm">جنيه/شهر</span>
                        </span>
                      </div>
                    </div>

                    {/* Recommended plan */}
                    {calcResult.recommendedPlan &&
                      calcResult.savingsVsCustom > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                            <Crown className="h-4 w-4" />
                            وفّر {calcResult.savingsVsCustom} جنيه/شهر!
                          </div>
                          <p className="text-xs text-green-600 mt-1">
                            باقة {PLAN_NAMES[calcResult.recommendedPlan]} تشمل
                            كل اللي اخترته بسعر{" "}
                            {calcResult.recommendedPlanPrice} جنيه بس
                          </p>
                          <Button
                            size="sm"
                            className="w-full mt-2 bg-green-600 hover:bg-green-700"
                            onClick={() =>
                              handleCheckout(calcResult.recommendedPlan!)
                            }
                          >
                            <Check className="h-4 w-4 ml-1" />
                            اشترك في {PLAN_NAMES[calcResult.recommendedPlan]}
                          </Button>
                        </div>
                      )}

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => handleCheckout("CUSTOM")}
                    >
                      <ArrowRight className="h-4 w-4 ml-2" />
                      اطلب هذه الباقة المخصصة
                    </Button>

                    <p className="text-[11px] text-center text-muted-foreground">
                      الأسعار بالجنيه المصري · تجدد شهرياً · بدون عقود
                    </p>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">اختر ميزات لحساب السعر</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trial CTA */}
            <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
              <CardContent className="pt-4 text-center">
                <Sparkles className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                <p className="font-semibold text-sm">جرّب مجاناً 14 يوم</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ابدأ بالتجربة المجانية - بدون بطاقة ائتمان
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={() => handleCheckout("TRIAL")}
                >
                  ابدأ التجربة
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
