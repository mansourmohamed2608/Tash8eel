"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertBanner, EmptyState } from "@/components/ui/alerts";
import { CardSkeleton } from "@/components/ui/skeleton";
import { useMerchant } from "@/hooks/use-merchant";
import { merchantApi } from "@/lib/client";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  Calculator,
  Check,
  CreditCard,
  Layers,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type RegionCode = "EG" | "SA" | "AE" | "OM" | "KW";
type CycleMonths = 1 | 3 | 6 | 12;

const REGION_OPTIONS: Array<{ code: RegionCode; label: string }> = [
  { code: "EG", label: "مصر (EGP)" },
  { code: "SA", label: "السعودية (SAR)" },
  { code: "AE", label: "الإمارات (AED)" },
  { code: "OM", label: "عُمان (OMR)" },
  { code: "KW", label: "الكويت (KWD)" },
];

function getCycleOptions(
  prices: Array<{ cycleMonths: number; discountPercent: number }>,
): Array<{ value: CycleMonths; label: string }> {
  const disc = (months: number) =>
    prices.find((p) => p.cycleMonths === months)?.discountPercent ?? 0;
  return [
    { value: 1, label: "1 شهر" },
    { value: 3, label: disc(3) > 0 ? `3 أشهر (خصم ${disc(3)}%)` : "3 أشهر" },
    { value: 6, label: disc(6) > 0 ? `6 أشهر (خصم ${disc(6)}%)` : "6 أشهر" },
    { value: 12, label: disc(12) > 0 ? `12 شهر (خصم ${disc(12)}%)` : "12 شهر" },
  ];
}

const LIMIT_LABELS: Record<string, string> = {
  aiCallsPerDay: "ردود الذكاء الاصطناعي / يوم",
  messagesPerMonth: "محادثات واتساب / شهر",
  monthlyConversationsEgypt: "محادثات واتساب / شهر",
  monthlyConversationsGulf: "محادثات واتساب / شهر",
  monthlyConversationsIncluded: "محادثات واتساب / شهر",
  paidTemplatesPerMonth:
    "رسائل القوالب المدفوعة / شهر (Broadcast/OTP/خارج 24 ساعة)",
  voiceMinutesPerMonth: "دقائق الملاحظات الصوتية / شهر",
  paymentProofScansPerMonth: "فحوصات إثبات الدفع / شهر",
  mapsLookupsPerMonth: "استعلامات الخرائط / شهر",
  whatsappNumbers: "أرقام واتساب",
  teamMembers: "أعضاء الفريق",
  posConnections: "اتصالات نقاط البيع",
  branches: "الفروع",
  alertRules: "قواعد التنبيهات",
  automations: "عمليات تلقائية",
  autoRunsPerDay: "تشغيل تلقائي / يوم",
};

const METRIC_LABELS: Record<string, string> = {
  AI_CAPACITY: "الردود الذكية الإضافية",
  IN_APP_AI_ACTIONS: "إجراءات الذكاء الاصطناعي داخل النظام",
  PAYMENT_PROOF_SCANS: "فحوصات إثبات الدفع",
  VOICE_MINUTES: "الدقائق الصوتية",
  PAID_TEMPLATES: "القوالب المدفوعة",
  MAP_LOOKUPS: "استعلامات الخرائط",
  OTHER: "أخرى",
};

const USAGE_STATUS_LABELS: Record<string, string> = {
  MESSAGES: "محادثات واتساب / شهر",
  AI_CALLS: "ردود الذكاء الاصطناعي / يوم",
  PAID_TEMPLATES: "القوالب المدفوعة / شهر",
  PAYMENT_PROOF_SCANS: "فحوصات إثبات الدفع / شهر",
  VOICE_MINUTES: "الدقائق الصوتية / شهر",
  MAP_LOOKUPS: "استعلامات الخرائط / شهر",
};

const PLAN_NAME_AR: Record<string, string> = {
  STARTER: "باقة المبتدئ",
  BASIC: "باقة الأساسي",
  GROWTH: "باقة النمو",
  PRO: "الباقة الاحترافية",
  ENTERPRISE: "الباقة المؤسسية",
};

const PLAN_DESC_AR: Record<string, string> = {
  STARTER:
    "واتساب ذكي لاستقبال الطلبات والرد التلقائي - يشمل 1,200 محادثة/شهر في مصر",
  BASIC: "كل أساسيات التشغيل + الدفع والمخزون - يشمل 1,500 محادثة/شهر في مصر",
  GROWTH: "تشغيل متقدم مع الفريق والبث والولاء - يشمل 3,500 محادثة/شهر في مصر",
  PRO: "للعمليات المتقدمة والفروع المتعددة - يشمل 8,000 محادثة/شهر في مصر",
  ENTERPRISE:
    "للمؤسسات الكبيرة مع حدود تشغيل واسعة ودعم مخصص - يشمل 15,000 محادثة/شهر في مصر",
};

const ADDON_NAME_AR: Record<string, string> = {
  PLATFORM_CORE: "النظام الأساسي للمنصة",
  INVENTORY_BASIC: "المخزون الأساسي",
  FINANCE_BASIC: "المالية الأساسية",
  TEAM_UP_TO_3: "الفريق (حتى 3 مستخدمين)",
  POS_BASIC: "تكاملات نقاط البيع (أساسي)",
  POS_ADV: "تكاملات نقاط البيع (متقدم)",
  KPI_DASHBOARD: "لوحة مؤشرات الأداء",
  AUDIT_LOGS: "سجلات التدقيق",
  MULTI_BRANCH_PER_1: "فرع إضافي (+1)",
  PROACTIVE_ALERTS: "تنبيهات استباقية",
  AUTONOMOUS_AGENT: "وكيل ذاتي التشغيل",
  INBOX_AI_CHANNEL: "مساعد واتساب الذكي",
  WHATSAPP_BROADCASTS: "حملات البث على واتساب",
  MAPS_LOCATION_FLOWS: "تدفّقات الموقع والاتجاهات",
  PORTAL_ASSISTANT: "مساعد البوابة الذكي",
  COPILOT_WORKFLOWS: "أوامر سير العمل في Copilot",
  COPILOT_VOICE_NOTES: "الملاحظات الصوتية في Copilot",
  COPILOT_VISION_HELPER: "مساعد الرؤية في Copilot",
  FINANCE_AUTOMATION: "أتمتة المالية الذكية",
  INVENTORY_INSIGHTS: "رؤى المخزون الذكية",
  PAYMENT_LINKS: "روابط الدفع",
  DAILY_REPORTS: "التقارير اليومية",
  FOLLOWUP_AUTOMATIONS: "أتمتة المتابعات",
  ANOMALY_MONITOR: "مراقبة الشذوذ",
  MULTI_BRANCH: "إدارة الفروع المتعددة",
  TEAM_SEAT_EXPANSION: "مقاعد فريق إضافية",
  API_WEBHOOKS: "API و Webhooks",
  TEAM_UPTO3: "الفريق (حتى 3 مستخدمين)",
  POS_INTEGRATIONS_BASIC: "تكاملات نقاط البيع (أساسي)",
  POS_INTEGRATIONS_ADVANCED: "تكاملات نقاط البيع (متقدم)",
  MULTI_BRANCH_EXTRA: "فرع إضافي (+1)",
};

const ADDON_DESC_AR: Record<string, string> = {
  PLATFORM_CORE: "الأساس الإلزامي في بناء BYO",
  INVENTORY_BASIC: "مخزون فعلي وتنبيه نقص",
  FINANCE_BASIC: "مصروفات + ربح مبسط",
  TEAM_UP_TO_3: "يفعّل ميزة الفريق ويرفع الحد إلى 3",
  POS_BASIC: "يرفع سعة ربط نقاط البيع إلى 1",
  POS_ADV: "يرفع سعة ربط نقاط البيع إلى 3",
  KPI_DASHBOARD: "مؤشرات أداء تشغيلية",
  AUDIT_LOGS: "سجلات تدقيق واحتفاظ أطول",
  MULTI_BRANCH_PER_1: "كل وحدة = فرع إضافي + رقم واتساب إضافي",
  PROACTIVE_ALERTS: "يرفع سعة قواعد التنبيهات",
  AUTONOMOUS_AGENT: "يرفع سعة التشغيل التلقائي",
  INBOX_AI_CHANNEL: "ذكاء اصطناعي للردود داخل واتساب",
  WHATSAPP_BROADCASTS: "إطلاق حملات ورسائل جماعية على واتساب",
  MAPS_LOCATION_FLOWS: "مشاركة الموقع والاتجاهات وربط الخرائط",
  PORTAL_ASSISTANT: "مساعد AI داخل لوحة التاجر",
  COPILOT_WORKFLOWS: "أوامر تشغيل واختصارات ذكية داخل Copilot",
  COPILOT_VOICE_NOTES: "فهم الملاحظات الصوتية داخل Copilot",
  COPILOT_VISION_HELPER: "مساعد رؤية للصور والمهام البصرية داخل Copilot",
  FINANCE_AUTOMATION: "اقتراحات وأتمتة مالية ذكية",
  INVENTORY_INSIGHTS: "تحليلات ومؤشرات ذكية للمخزون",
  PAYMENT_LINKS: "روابط دفع مباشرة للعملاء",
  DAILY_REPORTS: "تقارير تشغيلية ومالية يومية",
  FOLLOWUP_AUTOMATIONS: "متابعات تلقائية بعد البيع أو عند التعثر",
  ANOMALY_MONITOR: "اكتشاف الشذوذ في الأداء والمدفوعات",
  MULTI_BRANCH: "الحزمة الأساسية لإدارة أكثر من فرع",
  TEAM_SEAT_EXPANSION: "كل وحدة = مقعد إضافي واحد للفريق",
  API_WEBHOOKS: "تكاملات API و Webhooks مباشرة",
  TEAM_UPTO3: "يفعّل ميزة الفريق ويرفع الحد إلى 3",
  POS_INTEGRATIONS_BASIC: "يرفع سعة ربط نقاط البيع إلى 1",
  POS_INTEGRATIONS_ADVANCED: "يرفع سعة ربط نقاط البيع إلى 3",
  MULTI_BRANCH_EXTRA: "كل وحدة = فرع إضافي + رقم واتساب إضافي",
};

const FEATURE_LABELS_AR: Record<string, string> = {
  CONVERSATIONS: "المحادثات",
  ORDERS: "الطلبات",
  CATALOG: "الكتالوج",
  INVENTORY: "المخزون الأساسي",
  REPORTS: "التقارير المالية الأساسية",
  NOTIFICATIONS: "الإشعارات",
  VOICE_NOTES: "الملاحظات الصوتية",
  PAYMENTS: "التحقق من إثبات الدفع",
  COPILOT_CHAT: "دردشة Copilot",
  TEAM: "الفريق",
  API_ACCESS: "الوصول عبر API",
  WEBHOOKS: "تكاملات نقاط البيع",
  KPI_DASHBOARD: "لوحة KPI",
  AUDIT_LOGS: "سجلات التدقيق",
  CUSTOM_INTEGRATIONS: "تكاملات مخصصة",
  SLA: "SLA",
};

const USAGE_PACK_NAME_AR: Record<string, string> = {
  AI_BOOST_S: "تعزيز الذكاء الاصطناعي S",
  AI_BOOST_M: "تعزيز الذكاء الاصطناعي M",
  AI_BOOST_L: "تعزيز الذكاء الاصطناعي L",
  AI_BOOST_XL: "تعزيز الذكاء الاصطناعي XL",
  PROOF_S: "فحوصات إثبات الدفع S (100)",
  PROOF_M: "فحوصات إثبات الدفع M (300)",
  PROOF_L: "فحوصات إثبات الدفع L (800)",
  PROOF_XL: "فحوصات إثبات الدفع XL (1500)",
  VOICE_S: "دقائق صوتية S (30)",
  VOICE_M: "دقائق صوتية M (90)",
  VOICE_L: "دقائق صوتية L (240)",
  VOICE_XL: "دقائق صوتية XL (600)",
  TEMPLATE_S: "قوالب مدفوعة S (100)",
  TEMPLATE_M: "قوالب مدفوعة M (300)",
  TEMPLATE_L: "قوالب مدفوعة L (1000)",
  MAPS_S: "استعلامات خرائط S (500)",
  MAPS_M: "استعلامات خرائط M (2000)",
  MAPS_L: "استعلامات خرائط L (6000)",
  AI_CAPACITY_S: "سعة الذكاء الاصطناعي S",
  AI_CAPACITY_M: "سعة الذكاء الاصطناعي M",
  AI_CAPACITY_L: "سعة الذكاء الاصطناعي L",
  AI_CAPACITY_XL: "سعة الذكاء الاصطناعي XL",
  PROOF_CHECKS_S: "فحوصات إثبات الدفع S (100)",
  PROOF_CHECKS_M: "فحوصات إثبات الدفع M (300)",
  PROOF_CHECKS_L: "فحوصات إثبات الدفع L (800)",
  PROOF_CHECKS_XL: "فحوصات إثبات الدفع XL (1500)",
  VOICE_MINUTES_S: "دقائق صوتية S (30)",
  VOICE_MINUTES_M: "دقائق صوتية M (90)",
  VOICE_MINUTES_L: "دقائق صوتية L (240)",
  VOICE_MINUTES_XL: "دقائق صوتية XL (600)",
  PAID_TEMPLATES_S: "قوالب مدفوعة S (100)",
  PAID_TEMPLATES_M: "قوالب مدفوعة M (300)",
  PAID_TEMPLATES_L: "قوالب مدفوعة L (1000)",
  INAPP_AI_TOPUP_S: "باقة إجراءات AI داخل النظام S (5,000)",
  INAPP_AI_TOPUP_M: "باقة إجراءات AI داخل النظام M (20,000)",
  INAPP_AI_TOPUP_L: "باقة إجراءات AI داخل النظام L (60,000)",
};

const SCALABLE_CAPACITY_ADDONS = new Set([
  "MULTI_BRANCH_PER_1",
  "MULTI_BRANCH",
  "TEAM_SEAT_EXPANSION",
  "PROACTIVE_ALERTS",
  "AUTONOMOUS_AGENT",
  "MULTI_BRANCH_EXTRA",
]);

const CONVERSATION_TOOLTIP =
  "المحادثة = 24 ساعة مع نفس العميل على واتساب. مثال: إذا راسلك العميل 10 مرات في يوم واحد = محادثة واحدة فقط";

const HIDDEN_LIMIT_KEYS = new Set(["tokenBudgetDaily", "monthlyAiCapacity"]);

const HIDDEN_USAGE_METRICS = new Set(["TOKENS"]);

const HIDDEN_USAGE_PACK_CODES = new Set(["AI_CAPACITY_L", "AI_CAPACITY_XL"]);

const STARTER_INCLUDED_FEATURES = [
  "✅ الرد التلقائي الذكي على رسائل واتساب",
  "✅ إدارة الطلبات والمبيعات",
  "✅ كتالوج المنتجات",
  "✅ المخزون الأساسي",
  "✅ قاعدة المعرفة",
  "✅ التقارير الأساسية",
  "✅ عضوان في الفريق",
  "✅ فرع واحد",
];

const STARTER_UPGRADE_FEATURES = [
  "✗ الكوبايلوت (متاح من الباقة الأساسية)",
  "✗ الرسائل الصوتية والملفات (متاح من الباقة الأساسية)",
  "✗ تحليلات الذكاء الاصطناعي المتقدمة (متاح من باقة النمو)",
  "✗ التقارير المالية المتقدمة (متاح من باقة النمو)",
];

function localizePlanName(code?: string, fallbackName?: string): string {
  const key = String(code || "").toUpperCase();
  return PLAN_NAME_AR[key] || fallbackName || key;
}

function localizePlanDescription(
  code?: string,
  fallbackDescription?: string,
): string {
  const key = String(code || "").toUpperCase();
  return PLAN_DESC_AR[key] || fallbackDescription || "";
}

function localizeFeatureLabel(key?: string, fallbackLabel?: string): string {
  const featureKey = String(key || "").toUpperCase();
  return FEATURE_LABELS_AR[featureKey] || fallbackLabel || featureKey;
}

function localizeAddOnName(code?: string, fallbackName?: string): string {
  const key = String(code || "").toUpperCase();
  return ADDON_NAME_AR[key] || fallbackName || key;
}

function localizeAddOnDescription(
  code?: string,
  fallbackDescription?: string,
): string {
  const key = String(code || "").toUpperCase();
  return ADDON_DESC_AR[key] || fallbackDescription || "";
}

function localizeUsagePackName(code?: string, fallbackName?: string): string {
  const key = String(code || "").toUpperCase();
  return USAGE_PACK_NAME_AR[key] || fallbackName || key;
}

function toCurrency(cents: number, currency: string): string {
  return formatCurrency((cents || 0) / 100, currency || "EGP");
}

function mapPricesByCycle(prices: any[] = []) {
  const byCycle = new Map<number, any>();
  for (const price of prices || []) {
    byCycle.set(Number(price.cycleMonths), price);
  }
  return byCycle;
}

function getUsagePackDeltas(pack: any): Record<string, number> {
  const deltas: Record<string, number> = {
    ...(pack?.limitDeltas || {}),
  };

  const aiCalls = Number(pack?.includedAiCallsPerDay || 0);
  const tokens = Number(pack?.includedTokenBudgetDaily || 0);
  if (aiCalls > 0 && !deltas.aiCallsPerDay) deltas.aiCallsPerDay = aiCalls;
  if (tokens > 0 && !deltas.tokenBudgetDaily) deltas.tokenBudgetDaily = tokens;

  const metricKey = String(pack?.metricKey || "").toUpperCase();
  const units = Number(pack?.includedUnits || 0);
  if (units > 0) {
    if (
      metricKey === "PAYMENT_PROOF_SCANS" &&
      !deltas.paymentProofScansPerMonth
    ) {
      deltas.paymentProofScansPerMonth = units;
    } else if (metricKey === "VOICE_MINUTES" && !deltas.voiceMinutesPerMonth) {
      deltas.voiceMinutesPerMonth = units;
    } else if (
      metricKey === "PAID_TEMPLATES" &&
      !deltas.paidTemplatesPerMonth
    ) {
      deltas.paidTemplatesPerMonth = units;
    } else if (metricKey === "MAP_LOOKUPS" && !deltas.mapsLookupsPerMonth) {
      deltas.mapsLookupsPerMonth = units;
    }
  }

  return deltas;
}

function usagePackBenefitLines(pack: any, quantity = 1): string[] {
  const metricKey = String(pack?.metricKey || "").toUpperCase();
  const safeQty = Math.max(1, Number(quantity || 1));

  if (metricKey === "IN_APP_AI_ACTIONS") {
    const actions = Math.max(0, Number(pack?.includedUnits || 0)) * safeQty;
    return actions > 0
      ? [`+${actions.toLocaleString("ar-EG")} إجراء AI داخل النظام / شهر`]
      : [];
  }

  const deltas = getUsagePackDeltas(pack);
  return Object.entries(deltas)
    .filter(([, value]) => Number(value) > 0)
    .filter(([key]) => !HIDDEN_LIMIT_KEYS.has(key))
    .map(([key, value]) => {
      const total = Number(value) * safeQty;
      return `+${total.toLocaleString("ar-EG")} ${LIMIT_LABELS[key] || key}`;
    });
}

function getConversationLimit(
  bundle: any,
  regionCode: RegionCode,
): number | null {
  const limits = bundle?.limits || {};
  if (regionCode === "EG") {
    const value = Number(
      limits.monthlyConversationsEgypt || limits.messagesPerMonth || 0,
    );
    return value > 0 ? value : null;
  }

  const gulfValue = Number(
    limits.monthlyConversationsGulf ||
      limits.monthlyConversationsIncluded ||
      limits.messagesPerMonth ||
      0,
  );
  return gulfValue > 0 ? gulfValue : null;
}

function getOverageRate(bundle: any, currency: string): number | null {
  const limits = bundle?.limits || {};
  if (currency === "AED") {
    const value = Number(limits.overageRateAed ?? 0);
    return value > 0 ? value : null;
  }
  if (currency === "SAR") {
    const value = Number(limits.overageRateSar ?? 0);
    return value > 0 ? value : null;
  }
  return null;
}

function getModelBadgeText(planCode?: string): string {
  const normalized = String(planCode || "").toUpperCase();
  if (normalized === "STARTER" || normalized === "BASIC") {
    return "AI: GPT-4o-mini";
  }
  return "AI: GPT-4o + 4o-mini";
}

export default function PlanPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const { canEdit } = useRoleAccess("plan");

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [regionCode, setRegionCode] = useState<RegionCode>("EG");
  const [cycleMonths, setCycleMonths] = useState<CycleMonths>(1);
  const [catalog, setCatalog] = useState<any | null>(null);
  const [byoResult, setByoResult] = useState<any | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>("");
  const [usageStatus, setUsageStatus] = useState<any | null>(null);

  const [capacityQty, setCapacityQty] = useState<Record<string, number>>({});
  const [bundlePackQty, setBundlePackQty] = useState<Record<string, number>>(
    {},
  );
  const [bundleSelectedPackByMetric, setBundleSelectedPackByMetric] = useState<
    Record<string, string>
  >({});

  const [byoAddOnQty, setByoAddOnQty] = useState<Record<string, number>>({
    PLATFORM_CORE: 1,
  });
  const [byoPackQty, setByoPackQty] = useState<Record<string, number>>({});

  const currency = catalog?.currency || "EGP";

  const selectedByoAddOns = useMemo(
    () =>
      Object.entries(byoAddOnQty)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([code, quantity]) => ({ code, quantity: Number(quantity) })),
    [byoAddOnQty],
  );

  const selectedByoUsagePacks = useMemo(
    () =>
      Object.entries(byoPackQty)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([code, quantity]) => ({ code, quantity: Number(quantity) })),
    [byoPackQty],
  );

  const currentBundle = useMemo(() => {
    const planCode = String(currentPlan || "").toUpperCase();
    return (catalog?.bundles || []).find(
      (bundle: any) => String(bundle.code || "").toUpperCase() === planCode,
    );
  }, [catalog, currentPlan]);

  const byoAddOns = useMemo(() => {
    const core = catalog?.byo?.coreAddOn ? [catalog.byo.coreAddOn] : [];
    const rest = catalog?.byo?.featureAddOns || [];
    return [...core, ...rest];
  }, [catalog]);

  const bundleUsagePacksByMetric = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const usagePack of (catalog?.bundleAddOns?.usagePacks || []).filter(
      (addon: any) => addon?.isActive !== false,
    )) {
      if (
        HIDDEN_USAGE_PACK_CODES.has(String(usagePack.code || "").toUpperCase())
      ) {
        continue;
      }
      const key = String(usagePack.metricKey || "OTHER");
      groups[key] = groups[key] || [];
      groups[key].push(usagePack);
    }
    return groups;
  }, [catalog]);

  const byoUsagePacksByMetric = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const usagePack of (catalog?.byo?.usagePacks || []).filter(
      (addon: any) => addon?.isActive !== false,
    )) {
      if (
        HIDDEN_USAGE_PACK_CODES.has(String(usagePack.code || "").toUpperCase())
      ) {
        continue;
      }
      const key = String(usagePack.metricKey || "OTHER");
      groups[key] = groups[key] || [];
      groups[key].push(usagePack);
    }
    return groups;
  }, [catalog]);

  const loadCatalog = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [catalogRes, summary, usage] = await Promise.all([
        merchantApi.getBillingCatalog(apiKey, regionCode),
        merchantApi.getBillingSummary(apiKey).catch(() => null),
        merchantApi.getBillingUsageStatus(apiKey).catch(() => null),
      ]);

      setCatalog(catalogRes);
      setUsageStatus(usage);

      const planCode = String(
        summary?.subscription?.plan_code ||
          summary?.subscription?.planCode ||
          "",
      ).toUpperCase();
      setCurrentPlan(planCode);

      setByoAddOnQty((prev) => ({
        ...prev,
        PLATFORM_CORE: 1,
      }));
    } catch (error) {
      console.error("Failed to load billing catalog", error);
      toast({
        title: "خطأ",
        description: "تعذر تحميل بيانات الباقات والفوترة.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [apiKey, regionCode, toast]);

  const calculateByo = useCallback(async () => {
    if (!apiKey) return;
    setCalculating(true);
    try {
      const result = await merchantApi.calculateByoPricing(apiKey, {
        regionCode,
        cycleMonths,
        addOns: selectedByoAddOns,
        usagePacks: selectedByoUsagePacks,
      });
      setByoResult(result);
    } catch (error) {
      console.error("Failed to calculate BYO", error);
      toast({
        title: "خطأ",
        description: "تعذر حساب تسعير BYO.",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  }, [
    apiKey,
    regionCode,
    cycleMonths,
    selectedByoAddOns,
    selectedByoUsagePacks,
    toast,
  ]);

  const handleSubscribeBundle = useCallback(
    async (planCode: string) => {
      if (!apiKey || !canEdit) return;
      try {
        await merchantApi.subscribeBundlePlan(apiKey, {
          planCode,
          regionCode,
          cycleMonths,
        });
        toast({
          title: "تم التفعيل",
          description: `تم تفعيل ${localizePlanName(planCode, planCode)} بنجاح.`,
        });
        await loadCatalog();
      } catch (error) {
        console.error("Subscribe bundle failed", error);
        toast({
          title: "خطأ",
          description: "تعذر تفعيل الباقة الآن.",
          variant: "destructive",
        });
      }
    },
    [apiKey, canEdit, cycleMonths, loadCatalog, regionCode, toast],
  );

  const handleBuyCapacity = useCallback(
    async (code: string) => {
      if (!apiKey || !canEdit) return;
      const quantity = Math.max(1, Number(capacityQty[code] || 1));
      try {
        const result = await merchantApi.buyBillingTopup(apiKey, {
          type: "CAPACITY_ADDON",
          code,
          quantity,
        });
        if (result?.status === "ALREADY_INCLUDED") {
          toast({
            title: "مضمنة بالفعل",
            description: "هذه الإضافة موجودة ضمن حدود باقتك الحالية.",
          });
          return;
        }
        toast({
          title: "تم الشراء",
          description: `تم شراء ${localizeAddOnName(code, code)} بنجاح.`,
        });
        await loadCatalog();
      } catch (error) {
        console.error("Buy capacity add-on failed", error);
        toast({
          title: "خطأ",
          description: "تعذر شراء الإضافة الآن.",
          variant: "destructive",
        });
      }
    },
    [apiKey, canEdit, capacityQty, loadCatalog, toast],
  );

  const handleBuyUsagePack = useCallback(
    async (metric: string) => {
      if (!apiKey || !canEdit) return;
      const selectedCode = bundleSelectedPackByMetric[metric];
      if (!selectedCode) {
        toast({
          title: "تنبيه",
          description: "اختر باقة واحدة أولاً داخل هذه الفئة.",
        });
        return;
      }

      const quantity = Math.max(1, Number(bundlePackQty[selectedCode] || 1));
      try {
        await merchantApi.buyBillingTopup(apiKey, {
          type: "USAGE_PACK",
          code: selectedCode,
          quantity,
        });
        toast({
          title: "تم الشراء",
          description: `تم شراء ${localizeUsagePackName(selectedCode, selectedCode)} بنجاح.`,
        });
        await loadCatalog();
      } catch (error) {
        console.error("Buy usage pack failed", error);
        toast({
          title: "خطأ",
          description: "تعذر شراء باقة الاستخدام الآن.",
          variant: "destructive",
        });
      }
    },
    [
      apiKey,
      bundlePackQty,
      bundleSelectedPackByMetric,
      canEdit,
      loadCatalog,
      toast,
    ],
  );

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!loading) {
      calculateByo();
    }
  }, [loading, calculateByo]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="p-6">
        <EmptyState
          title="لا توجد بيانات"
          description="حاول التحديث مرة أخرى."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="الباقات والفوترة"
        description="الباقات الجاهزة + إضافات الباقة + BYO"
        actions={
          <Button variant="outline" onClick={loadCatalog}>
            <RefreshCw className="mr-2 h-4 w-4" />
            تحديث
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">الدولة</p>
            <Select
              value={regionCode}
              onValueChange={(value) => setRegionCode(value as RegionCode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGION_OPTIONS.map((region) => (
                  <SelectItem key={region.code} value={region.code}>
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">دورة الاشتراك</p>
            <Select
              value={String(cycleMonths)}
              onValueChange={(value) =>
                setCycleMonths(Number(value) as CycleMonths)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getCycleOptions(catalog?.bundles?.[0]?.prices ?? []).map(
                  (cycle) => (
                    <SelectItem key={cycle.value} value={String(cycle.value)}>
                      {cycle.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <AlertBanner
              type="info"
              title="الخصومات"
              message="3 أشهر: 5% • 6 أشهر: 10% • 12 شهر: 15% (على الباقات وإضافات الاشتراك فقط)"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">استهلاكك الحالي</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(usageStatus?.metrics || {})
            .filter(([metric]) => !HIDDEN_USAGE_METRICS.has(String(metric)))
            .slice(0, 8)
            .map(([metric, data]: any) => (
              <div key={metric} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  {USAGE_STATUS_LABELS[String(metric)] || metric}
                  {String(metric) === "MESSAGES" ? (
                    <span className="mr-1" title={CONVERSATION_TOOLTIP}>
                      ℹ️
                    </span>
                  ) : null}
                </p>
                <p className="text-sm font-semibold">
                  {Number(data?.used || 0).toLocaleString("ar-EG")} /{" "}
                  {data?.limit === -1
                    ? "غير محدود"
                    : Number(data?.limit || 0).toLocaleString("ar-EG")}
                </p>
                <p className="text-xs text-muted-foreground">
                  المتبقي:{" "}
                  {data?.remaining === -1
                    ? "غير محدود"
                    : Number(data?.remaining || 0).toLocaleString("ar-EG")}
                </p>
              </div>
            ))}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">الباقات الجاهزة</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {(catalog.bundles || []).map((bundle: any) => {
            const cyclePriceMap = mapPricesByCycle(bundle.prices);
            const selectedCyclePrice = cyclePriceMap.get(Number(cycleMonths));
            const isCurrent =
              currentPlan === String(bundle.code || "").toUpperCase();
            const normalizedPlanCode = String(bundle.code || "").toUpperCase();
            const conversationLimit = getConversationLimit(bundle, regionCode);
            const overageRate = getOverageRate(bundle, currency);
            const visibleLimits = Object.entries(bundle.limits || {}).filter(
              ([key]) =>
                !HIDDEN_LIMIT_KEYS.has(key) &&
                key !== "messagesPerMonth" &&
                key !== "monthlyConversationsEgypt" &&
                key !== "monthlyConversationsGulf" &&
                key !== "monthlyConversationsIncluded" &&
                key !== "overageRateAed" &&
                key !== "overageRateSar",
            );
            return (
              <Card
                key={bundle.code}
                className={isCurrent ? "border-primary" : ""}
              >
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      {localizePlanName(bundle.code, bundle.name)}
                    </CardTitle>
                    {isCurrent ? <Badge>الباقة الحالية</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {localizePlanDescription(bundle.code, bundle.description)}
                  </p>
                  <Badge variant="secondary" className="w-fit text-xs">
                    {getModelBadgeText(bundle.code)}
                  </Badge>
                  {selectedCyclePrice ? (
                    <div>
                      <p className="text-2xl font-bold">
                        {toCurrency(
                          selectedCyclePrice.effectiveMonthlyCents,
                          selectedCyclePrice.currency,
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        شهري فعلي ({cycleMonths} شهر)
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      لا يوجد سعر لهذه الدولة
                    </p>
                  )}
                  {conversationLimit ? (
                    <div className="rounded-md border bg-muted/20 p-2 text-xs">
                      <p className="font-medium">
                        {currency === "AED" || currency === "SAR"
                          ? `يشمل ${conversationLimit.toLocaleString("ar-EG")} محادثة - بعدها ${overageRate ?? 0} ${currency} لكل محادثة إضافية`
                          : `يشمل ${conversationLimit.toLocaleString("ar-EG")} محادثة`}
                        <span className="mr-1" title={CONVERSATION_TOOLTIP}>
                          ℹ️
                        </span>
                      </p>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    {visibleLimits.map(([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between gap-2 text-xs"
                      >
                        <span className="text-muted-foreground">
                          {LIMIT_LABELS[key] || key}
                        </span>
                        <span className="font-medium">
                          {Number(value).toLocaleString("ar-EG")}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1">
                    {normalizedPlanCode === "STARTER" ? (
                      <>
                        <p className="text-sm font-medium">
                          ما يشمله الباقة المبتدئة
                        </p>
                        {STARTER_INCLUDED_FEATURES.map((line) => (
                          <p key={line} className="text-xs">
                            {line}
                          </p>
                        ))}
                        <div className="border-t pt-2" />
                        {STARTER_UPGRADE_FEATURES.map((line) => (
                          <p
                            key={line}
                            className="text-xs text-muted-foreground"
                          >
                            {line}
                          </p>
                        ))}
                      </>
                    ) : (
                      (bundle.features || [])
                        .slice(0, 9)
                        .map((feature: any) => (
                          <p
                            key={feature.key}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span>
                              {localizeFeatureLabel(feature.key, feature.label)}
                            </span>
                          </p>
                        ))
                    )}
                  </div>

                  <Button
                    className="w-full"
                    disabled={!canEdit || isCurrent}
                    onClick={() => handleSubscribeBundle(bundle.code)}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {isCurrent ? "الباقة الحالية" : "اختيار الباقة"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">إضافات الباقة الحالية</h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              إضافات السعة (Capacity Add-ons)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              الرقم داخل الحقل = عدد الوحدات المراد شراؤها من نفس الإضافة. إذا
              ظهرت "مضمنة بالفعل" فهذا يعني أن باقتك الحالية تغطيها.
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(catalog.bundleAddOns?.capacityAddOns || [])
                .filter((addon: any) => addon?.isActive !== false)
                .map((addOn: any) => {
                  const allowsQuantity =
                    SCALABLE_CAPACITY_ADDONS.has(
                      String(addOn.code || "").toUpperCase(),
                    ) || Object.keys(addOn.limitIncrements || {}).length > 0;
                  const quantity = Math.max(
                    1,
                    Number(capacityQty[addOn.code] || 1),
                  );
                  const cyclePriceMap = mapPricesByCycle(addOn.prices || []);
                  const selectedCyclePrice = cyclePriceMap.get(
                    Number(cycleMonths),
                  );

                  const floor = addOn.limitFloorUpdates || {};
                  const floorIncluded = Object.entries(floor).every(
                    ([key, value]) => {
                      const current = Number(currentBundle?.limits?.[key] || 0);
                      return current >= Number(value || 0);
                    },
                  );
                  const noIncrements =
                    Object.keys(addOn.limitIncrements || {}).length === 0;
                  const alreadyIncluded = floorIncluded && noIncrements;

                  return (
                    <Card key={addOn.code}>
                      <CardContent className="space-y-2 pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">
                              {localizeAddOnName(addOn.code, addOn.name)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {localizeAddOnDescription(
                                addOn.code,
                                addOn.description,
                              )}
                            </p>
                          </div>
                          {alreadyIncluded ? (
                            <Badge variant="secondary">مضمنة بالفعل</Badge>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span>شهري فعلي ({cycleMonths} شهر)</span>
                          <span className="font-medium">
                            {selectedCyclePrice
                              ? toCurrency(
                                  selectedCyclePrice.effectiveMonthlyCents,
                                  selectedCyclePrice.currency,
                                )
                              : "-"}
                          </span>
                        </div>

                        {allowsQuantity ? (
                          <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">
                              الكمية = عدد وحدات هذه الإضافة.
                            </p>
                            <Input
                              type="number"
                              min={1}
                              className="h-8 w-28"
                              value={quantity}
                              disabled={alreadyIncluded || !canEdit}
                              onChange={(event) => {
                                const next = Math.max(
                                  1,
                                  Number(event.target.value || 1),
                                );
                                setCapacityQty((prev) => ({
                                  ...prev,
                                  [addOn.code]: next,
                                }));
                              }}
                            />
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            هذه الإضافة تُشترى مرة واحدة فقط.
                          </p>
                        )}

                        <Button
                          className="w-full"
                          disabled={!canEdit || alreadyIncluded}
                          onClick={() => handleBuyCapacity(addOn.code)}
                        >
                          شراء الإضافة
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              باقات الاستخدام للباقة الحالية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              داخل كل فئة اختر باقة واحدة فقط. الرقم = عدد مرات تكرار نفس الباقة
              شهريًا.
            </p>
            {Object.entries(bundleUsagePacksByMetric).map(([metric, packs]) => (
              <div key={metric} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {METRIC_LABELS[metric] || metric}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canEdit}
                    onClick={() => handleBuyUsagePack(metric)}
                  >
                    شراء الفئة المحددة
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {(packs || []).map((pack: any) => {
                    const selected =
                      bundleSelectedPackByMetric[metric] === pack.code;
                    const quantity = Math.max(
                      1,
                      Number(bundlePackQty[pack.code] || 1),
                    );
                    const benefitLines = usagePackBenefitLines(pack, quantity);
                    return (
                      <Card
                        key={pack.code}
                        className={selected ? "border-primary" : ""}
                      >
                        <CardContent className="space-y-2 pt-4">
                          <p className="font-medium text-sm">
                            {localizeUsagePackName(pack.code, pack.name)}
                          </p>
                          <div className="flex items-center justify-between text-xs">
                            <span>شهري</span>
                            <span className="font-medium">
                              {pack.priceCents
                                ? toCurrency(
                                    pack.priceCents,
                                    pack.currency || currency,
                                  )
                                : "-"}
                            </span>
                          </div>
                          <div className="rounded-md border bg-muted/20 p-2">
                            <p className="text-[11px] text-muted-foreground">
                              ماذا تضيف هذه الباقة:
                            </p>
                            {quantity > 1 ? (
                              <p className="text-[11px] text-muted-foreground">
                                القيم بعد تطبيق الكمية الحالية ({quantity}).
                              </p>
                            ) : null}
                            {benefitLines.length > 0 ? (
                              benefitLines.map((line) => (
                                <p
                                  key={line}
                                  className="text-[11px] font-medium"
                                >
                                  {line}
                                </p>
                              ))
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                لا توجد تفاصيل زيادة متاحة.
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(nextChecked) => {
                                setBundleSelectedPackByMetric((prev) => ({
                                  ...prev,
                                  [metric]:
                                    nextChecked === true ? pack.code : "",
                                }));
                              }}
                            />
                            <span>اختيار هذه الباقة</span>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            className="h-8 w-24"
                            disabled={!selected}
                            value={quantity}
                            onChange={(event) => {
                              const next = Math.max(
                                1,
                                Number(event.target.value || 1),
                              );
                              setBundlePackQty((prev) => ({
                                ...prev,
                                [pack.code]: next,
                              }));
                            }}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">حاسبة BYO (مخصص)</h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              اختر إضافات BYO + باقات الاستخدام
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-medium">إضافات BYO (تخضع لخصم الدورة)</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(byoAddOns || [])
                  .filter((addon: any) => addon?.isActive !== false)
                  .map((addOn: any) => {
                    const checked = Number(byoAddOnQty[addOn.code] || 0) > 0;
                    const isCore = addOn.code === "PLATFORM_CORE";
                    const normalizedAddOnCode = String(
                      addOn.code || "",
                    ).toUpperCase();
                    const allowsQuantity =
                      SCALABLE_CAPACITY_ADDONS.has(normalizedAddOnCode) ||
                      Object.keys(addOn.limitIncrements || {}).length > 0;
                    const cyclePriceMap = mapPricesByCycle(addOn.prices || []);
                    const selectedCyclePrice = cyclePriceMap.get(
                      Number(cycleMonths),
                    );

                    return (
                      <Card
                        key={addOn.code}
                        className={checked ? "border-primary" : ""}
                      >
                        <CardContent className="space-y-2 pt-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">
                                {localizeAddOnName(addOn.code, addOn.name)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {localizeAddOnDescription(
                                  addOn.code,
                                  addOn.description,
                                )}
                              </p>
                            </div>
                            {isCore ? <Badge>إلزامي</Badge> : null}
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>شهري فعلي ({cycleMonths} شهر)</span>
                            <span className="font-medium">
                              {selectedCyclePrice
                                ? toCurrency(
                                    selectedCyclePrice.effectiveMonthlyCents,
                                    selectedCyclePrice.currency,
                                  )
                                : "-"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={checked}
                                disabled={isCore}
                                onCheckedChange={(nextChecked) => {
                                  const enabled = nextChecked === true;
                                  setByoAddOnQty((prev) => ({
                                    ...prev,
                                    [addOn.code]: enabled
                                      ? allowsQuantity
                                        ? Math.max(
                                            1,
                                            Number(prev[addOn.code] || 1),
                                          )
                                        : 1
                                      : 0,
                                  }));
                                }}
                              />
                              <span className="text-xs">اختيار</span>
                            </div>

                            {allowsQuantity ? (
                              <Input
                                type="number"
                                min={1}
                                value={Math.max(
                                  1,
                                  Number(byoAddOnQty[addOn.code] || 1),
                                )}
                                className="h-8 w-20"
                                disabled={!checked || !canEdit}
                                onChange={(event) => {
                                  const quantity = Math.max(
                                    1,
                                    Number(event.target.value || 1),
                                  );
                                  setByoAddOnQty((prev) => ({
                                    ...prev,
                                    [addOn.code]: quantity,
                                  }));
                                }}
                              />
                            ) : null}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {allowsQuantity
                              ? "الرقم = عدد الفروع الإضافية المطلوبة."
                              : "هذه الإضافة تُختار مرة واحدة فقط."}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium">باقات الاستخدام (بدون خصم دورة)</h3>
              <p className="text-xs text-muted-foreground">
                لكل فئة اختر باقة واحدة فقط. الرقم = تكرار نفس الباقة شهريًا.
              </p>
              <div className="space-y-4">
                {Object.entries(byoUsagePacksByMetric).map(
                  ([metric, packs]) => (
                    <div key={metric} className="space-y-2">
                      <p className="text-sm font-medium">
                        {METRIC_LABELS[metric] || metric}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {(packs || []).map((pack: any) => {
                          const checked =
                            Number(byoPackQty[pack.code] || 0) > 0;
                          const quantity = Math.max(
                            1,
                            Number(byoPackQty[pack.code] || 1),
                          );
                          const benefitLines = usagePackBenefitLines(
                            pack,
                            quantity,
                          );
                          return (
                            <Card
                              key={pack.code}
                              className={checked ? "border-primary" : ""}
                            >
                              <CardContent className="space-y-2 pt-4">
                                <p className="font-medium text-sm">
                                  {localizeUsagePackName(pack.code, pack.name)}
                                </p>
                                <div className="flex items-center justify-between text-xs">
                                  <span>شهري</span>
                                  <span className="font-medium">
                                    {pack.priceCents
                                      ? toCurrency(
                                          pack.priceCents,
                                          pack.currency || currency,
                                        )
                                      : "-"}
                                  </span>
                                </div>
                                <div className="rounded-md border bg-muted/20 p-2">
                                  <p className="text-[11px] text-muted-foreground">
                                    ماذا تضيف هذه الباقة:
                                  </p>
                                  {quantity > 1 ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      القيم بعد تطبيق الكمية الحالية ({quantity}
                                      ).
                                    </p>
                                  ) : null}
                                  {benefitLines.length > 0 ? (
                                    benefitLines.map((line) => (
                                      <p
                                        key={line}
                                        className="text-[11px] font-medium"
                                      >
                                        {line}
                                      </p>
                                    ))
                                  ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                      لا توجد تفاصيل زيادة متاحة.
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(nextChecked) => {
                                        const enabled = nextChecked === true;
                                        setByoPackQty((prev) => {
                                          const next = { ...prev };
                                          const codesInMetric = (
                                            packs || []
                                          ).map((item: any) =>
                                            String(item.code),
                                          );
                                          if (enabled) {
                                            for (const c of codesInMetric) {
                                              if (c !== pack.code) {
                                                next[c] = 0;
                                              }
                                            }
                                            next[pack.code] = Math.max(
                                              1,
                                              Number(prev[pack.code] || 1),
                                            );
                                          } else {
                                            next[pack.code] = 0;
                                          }
                                          return next;
                                        });
                                      }}
                                    />
                                    <span className="text-xs">اختيار</span>
                                  </div>
                                  <Input
                                    type="number"
                                    min={1}
                                    className="h-8 w-20"
                                    disabled={!checked}
                                    value={quantity}
                                    onChange={(event) => {
                                      const quantity = Math.max(
                                        1,
                                        Number(event.target.value || 1),
                                      );
                                      setByoPackQty((prev) => ({
                                        ...prev,
                                        [pack.code]: quantity,
                                      }));
                                    }}
                                  />
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={calculateByo} disabled={calculating}>
                <Layers className="mr-2 h-4 w-4" />
                {calculating ? "جاري الحساب..." : "إعادة حساب BYO"}
              </Button>
              <p className="text-xs text-muted-foreground">
                معامل زيادة BYO = {catalog.byoMarkup}x، وباقات الاستخدام شهرية
                بدون خصم دورة.
              </p>
            </div>
          </CardContent>
        </Card>

        {byoResult ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">نتيجة تسعير BYO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    قبل معامل BYO (شهري)
                  </p>
                  <p className="text-lg font-semibold">
                    {toCurrency(
                      byoResult.subtotals?.preMarkupEffectiveMonthlyCents || 0,
                      currency,
                    )}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    إجمالي BYO (شهري فعلي)
                  </p>
                  <p className="text-lg font-semibold">
                    {toCurrency(
                      byoResult.totals?.effectiveMonthlyCents || 0,
                      currency,
                    )}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    إجمالي الدورة ({cycleMonths} شهر)
                  </p>
                  <p className="text-lg font-semibold">
                    {toCurrency(
                      byoResult.totals?.cycleTotalCents || 0,
                      currency,
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">
                  مقارنة الباقات الجاهزة مقابل BYO
                </p>
                <div className="mt-2 space-y-1">
                  {(byoResult.bundleComparison || []).map((entry: any) => (
                    <div
                      key={entry.code}
                      className="flex items-center justify-between text-xs"
                    >
                      <span>{localizePlanName(entry.code, entry.name)}</span>
                      <span>
                        {toCurrency(
                          entry.effectiveMonthlyCents,
                          entry.currency || currency,
                        )}{" "}
                        • الوفر مقابل BYO:{" "}
                        {Number(entry.savesPercent || 0).toLocaleString(
                          "ar-EG",
                        )}
                        %
                      </span>
                    </div>
                  ))}
                </div>
                {byoResult.floor?.applied ? (
                  <p className="mt-2 text-xs text-amber-600">
                    تم تطبيق حد أدنى: BYO ≥ الباقة المكافئة × 1.15
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
