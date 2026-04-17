"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  Calculator,
  Check,
  CreditCard,
  Layers,
  MessageSquare,
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
  aiRepliesPerDay: "ردود الذكاء الاصطناعي / يوم",
  aiRepliesPerMonth: "ردود الذكاء الاصطناعي / شهر",
  totalMessagesPerDay: "الرسائل / يوم",
  totalMessagesPerMonth: "الرسائل / شهر",
  messagesPerMonth: "الرسائل / شهر",
  monthlyConversationsEgypt: "الرسائل / شهر",
  monthlyConversationsGulf: "الرسائل / شهر",
  monthlyConversationsIncluded: "الرسائل / شهر",
  paidTemplatesPerMonth: "القوالب المدفوعة / شهر",
  voiceMinutesPerMonth: "الدقائق الصوتية / شهر",
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
  AI_CAPACITY: "ردود الذكاء الاصطناعي / يوم",
  AI_REPLIES: "ردود الذكاء الاصطناعي / يوم",
  MESSAGES: "الرسائل / شهر",
  PAYMENT_PROOF_SCANS: "فحوصات إثبات الدفع / شهر",
  VOICE_MINUTES: "الدقائق الصوتية / شهر",
  VOICE_TRANSCRIPTION: "الدقائق الصوتية / شهر",
  PAID_TEMPLATES: "القوالب المدفوعة / شهر",
  MAP_LOOKUPS: "استعلامات الخرائط / شهر",
  IN_APP_AI_ACTIONS: "إجراءات الذكاء الاصطناعي داخل النظام / شهر",
  OTHER: "أخرى",
};

const USAGE_STATUS_LABELS: Record<string, string> = {
  MESSAGES: "الرسائل / شهر",
  AI_CALLS: "ردود الذكاء الاصطناعي / يوم",
  PAID_TEMPLATES: "القوالب المدفوعة / شهر",
  PAYMENT_PROOF_SCANS: "فحوصات إثبات الدفع / شهر",
  VOICE_MINUTES: "الدقائق الصوتية / شهر",
  MAP_LOOKUPS: "استعلامات الخرائط / شهر",
};

const PLAN_NAME_AR: Record<string, string> = {
  TRIAL: "التجربة",
  STARTER: "باقة المبتدئ",
  CHAT_ONLY: "باقة الدردشة فقط",
  BASIC: "باقة الأساسي",
  GROWTH: "باقة النمو",
  PRO: "الباقة الاحترافية",
  ENTERPRISE: "الباقة المؤسسية",
};

const PLAN_DESC_AR: Record<string, string> = {
  TRIAL: "وضع تجريبي بحدود منخفضة للتجربة الأولية.",
  STARTER: "تشغيل أساسي كامل مع رسائل وإدارة طلبات وكتالوج.",
  CHAT_ONLY: "باقة رسائل ذكية أعلى سعة وأضيق وظيفيًا دون وحدات تشغيل كاملة.",
  BASIC: "تشغيل يومي نشط مع كاشير دائم ومخزون كامل.",
  GROWTH: "تشغيل متقدم مع الفريق والولاء والأتمتة.",
  PRO: "تشغيل احترافي متعدد الفروع مع تحليلات وتنبؤات.",
  ENTERPRISE: "حل مؤسسي مخصص مع SLA وتكاملات ودعم مبيعات مباشر.",
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
  CONVERSATIONS: "الرسائل",
  ORDERS: "الطلبات",
  CATALOG: "الكتالوج",
  CASHIER_POS: "الكاشير",
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
  PROOF_XL: "فحوصات إثبات الدفع XL",
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
  PROOF_CHECKS_XL: "فحوصات إثبات الدفع XL",
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

const MESSAGE_TOOLTIP =
  "الرسائل = إجمالي الرسائل المُدارة داخل المنصة وتشمل رسائل العملاء + ردود الذكاء الاصطناعي.";

const HIDDEN_LIMIT_KEYS = new Set(["tokenBudgetDaily", "monthlyAiCapacity"]);

const HIDDEN_USAGE_METRICS = new Set(["TOKENS", "IN_APP_AI_ACTIONS"]);

const HIDDEN_USAGE_PACK_CODES = new Set<string>();

const FULL_PLATFORM_PLAN_CODES = new Set([
  "STARTER",
  "BASIC",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
]);

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

const CURATED_FEATURE_ADDON_CODES = new Set([
  "INVENTORY_BASIC",
  "INVENTORY_FULL",
  "API_WEBHOOKS",
  "FOLLOWUP_AUTOMATIONS",
  "AUTONOMOUS_AGENT",
  "FORECASTING",
  "CASHIER_POS",
  "POS_BASIC",
  "POS_ADV",
  "POS_INTEGRATIONS_BASIC",
  "POS_INTEGRATIONS_ADVANCED",
  "TEAM_UP_TO_3",
  "TEAM_UPTO3",
  "TEAM_SEAT_EXPANSION",
  "LOYALTY",
  "KPI_DASHBOARD",
  "AUDIT_LOGS",
  "MULTI_BRANCH_PER_1",
  "MULTI_BRANCH_EXTRA",
]);

const LIVE_AGENT_ADDON_ITEMS = [
  "Ops Agent",
  "Inventory Agent",
  "Finance Agent",
];

const ENTERPRISE_CUSTOM_ITEMS = [
  "تكاملات مخصصة",
  "SLA حسب احتياج النشاط",
  "تفعيل المكالمات الصوتية",
  "باقات مؤسسية مخصصة",
];

const CURATED_USAGE_METRICS = new Set([
  "AI_CAPACITY",
  "AI_REPLIES",
  "MESSAGES",
  "PAYMENT_PROOF_SCANS",
  "VOICE_TRANSCRIPTION",
  "VOICE_MINUTES",
  "PAID_TEMPLATES",
  "MAP_LOOKUPS",
]);

const TIER_ORDER: Record<string, number> = {
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
};

const ADDON_MEANING_ALIAS: Record<string, string> = {
  TEAM_UPTO3: "TEAM_UP_TO_3",
  TEAM_UP_TO_3: "TEAM_UP_TO_3",
  POS_INTEGRATIONS_BASIC: "POS_BASIC",
  POS_BASIC: "POS_BASIC",
  POS_INTEGRATIONS_ADVANCED: "POS_ADV",
  POS_ADV: "POS_ADV",
  MULTI_BRANCH_EXTRA: "MULTI_BRANCH_PER_1",
  MULTI_BRANCH: "MULTI_BRANCH_PER_1",
  MULTI_BRANCH_PER_1: "MULTI_BRANCH_PER_1",
};

const ADDON_CODE_PREFERENCE = [
  "TEAM_UP_TO_3",
  "POS_BASIC",
  "POS_ADV",
  "MULTI_BRANCH_PER_1",
  "API_WEBHOOKS",
  "FOLLOWUP_AUTOMATIONS",
  "AUTONOMOUS_AGENT",
  "PROACTIVE_ALERTS",
  "KPI_DASHBOARD",
  "AUDIT_LOGS",
];

const USAGE_CODE_PREFIX_PREFERENCE = [
  "AI_BOOST_",
  "PROOF_",
  "VOICE_",
  "TEMPLATE_",
  "MAPS_",
  "INAPP_AI_TOPUP_",
  "AI_CAPACITY_",
  "PROOF_CHECKS_",
  "VOICE_MINUTES_",
  "PAID_TEMPLATES_",
];

const DEFAULT_USAGE_THRESHOLDS = {
  attention: 70,
  warning: 85,
  critical: 95,
  exceeded: 100,
} as const;

const USAGE_BAND_LABELS: Record<string, string> = {
  healthy: "طبيعي",
  attention: "تنبيه",
  warning: "تحذير",
  critical: "حرج",
  exceeded: "متجاوز",
  unlimited: "غير محدود",
};

const USAGE_BAND_CARD_CLASSES: Record<string, string> = {
  healthy: "border",
  attention: "border border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10",
  warning:
    "border border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10",
  critical:
    "border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10",
  exceeded:
    "border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/15",
  unlimited: "border",
};

const USAGE_BAND_BAR_CLASSES: Record<string, string> = {
  healthy: "bg-[var(--accent-success)]",
  attention: "bg-[var(--accent-blue)]",
  warning: "bg-[var(--accent-warning)]",
  critical: "bg-[var(--accent-danger)]",
  exceeded: "bg-[var(--accent-danger)]",
  unlimited: "bg-[var(--accent-blue)]",
};

const PLAN_CARD_HIGHLIGHTS: Record<string, string[]> = {
  STARTER: [
    "رسائل العملاء + ردود الذكاء الاصطناعي",
    "إدارة الطلبات والكتالوج",
    "مخزون أساسي + مالية أساسية",
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
    "الفريق والصلاحيات",
    "الولاء + الشرائح",
    "الأتمتة",
    "2 فرع + 2 POS",
    "Ops + Inventory + Finance",
  ],
  PRO: [
    "كل ما في Growth",
    "KPI + Audit Logs + Forecasting",
    "تقارير مالية متقدمة",
    "Inventory Insights",
    "5 فروع + 5 POS",
    "Ops + Inventory + Finance",
  ],
  ENTERPRISE: [
    "كل ما في Pro",
    "تكاملات مخصصة + SLA",
    "أهلية تفعيل المكالمات الصوتية",
    "هيكل فروع / POS مخصص",
    "Ops + Inventory + Finance",
  ],
  CHAT_ONLY: [
    "واتساب + فيسبوك / ماسنجر",
    "ردود الذكاء الاصطناعي للعملاء",
    "سجل الرسائل",
    "Routing / Tagging أساسي",
    "بدون وحدات تشغيل كاملة",
  ],
};

const CHAT_ONLY_EXCLUDED_LABELS = [
  "المخزون",
  "المالية",
  "الكاشير / POS",
  "الفروع",
  "الولاء",
  "الأتمتة",
  "التقارير المتقدمة",
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

function getBundleDisplayQuotas(bundle: any) {
  const planCode = String(bundle?.code || "").toUpperCase();
  const fixed = FINAL_APPROVED_PLAN_QUOTAS[planCode];
  if (fixed) return fixed;

  const limits = bundle?.limits || {};
  const totalMessagesPerMonth = Number(
    limits.messagesPerMonth ||
      limits.monthlyConversationsEgypt ||
      limits.monthlyConversationsGulf ||
      limits.monthlyConversationsIncluded ||
      0,
  );
  const totalMessagesPerDay =
    totalMessagesPerMonth > 0 ? Math.round(totalMessagesPerMonth / 30) : 0;
  const aiRepliesPerDay = Number(
    limits.aiRepliesPerDay ||
      limits.dailyAiResponses ||
      limits.aiCallsPerDay ||
      0,
  );
  const aiRepliesPerMonth = Number(
    limits.aiRepliesPerMonth ||
      (aiRepliesPerDay > 0 ? aiRepliesPerDay * 30 : 0),
  );

  return {
    totalMessagesPerDay,
    totalMessagesPerMonth,
    aiRepliesPerDay,
    aiRepliesPerMonth,
  };
}

function getUsagePackPrimaryDelta(pack: any): {
  metric: string;
  units: number;
} {
  const metric = normalizeUsageMetricFamily(pack?.metricKey);
  const deltas = getUsagePackDeltas(pack);
  if (metric === "AI_REPLIES") {
    return {
      metric,
      units: Math.max(
        0,
        Number(pack?.includedAiCallsPerDay || deltas.aiCallsPerDay || 0),
      ),
    };
  }
  if (metric === "MESSAGES") {
    return {
      metric,
      units: Math.max(
        0,
        Number(
          deltas.totalMessagesPerMonth ||
            deltas.messagesPerMonth ||
            deltas.monthlyConversationsIncluded ||
            pack?.includedUnits ||
            0,
        ),
      ),
    };
  }
  if (metric === "PAYMENT_PROOF_SCANS") {
    return {
      metric,
      units: Math.max(
        0,
        Number(deltas.paymentProofScansPerMonth || pack?.includedUnits || 0),
      ),
    };
  }
  if (metric === "VOICE_TRANSCRIPTION") {
    return {
      metric,
      units: Math.max(
        0,
        Number(deltas.voiceMinutesPerMonth || pack?.includedUnits || 0),
      ),
    };
  }
  if (metric === "PAID_TEMPLATES") {
    return {
      metric,
      units: Math.max(
        0,
        Number(deltas.paidTemplatesPerMonth || pack?.includedUnits || 0),
      ),
    };
  }
  if (metric === "MAP_LOOKUPS") {
    return {
      metric,
      units: Math.max(
        0,
        Number(deltas.mapsLookupsPerMonth || pack?.includedUnits || 0),
      ),
    };
  }
  return {
    metric,
    units: Math.max(0, Number(pack?.includedUnits || 0)),
  };
}

function getCuratedUsagePackLabel(pack: any): string {
  const { metric, units } = getUsagePackPrimaryDelta(pack);
  const formatted = units.toLocaleString("ar-EG");

  if (metric === "AI_REPLIES") return `زيادة ${formatted} رد AI يوميًا`;
  if (metric === "MESSAGES") return `+${formatted} رسالة شهريًا`;
  if (metric === "PAYMENT_PROOF_SCANS") return `+${formatted} فحص شهريًا`;
  if (metric === "VOICE_TRANSCRIPTION") return `+${formatted} دقيقة شهريًا`;
  if (metric === "PAID_TEMPLATES") return `+${formatted} قالب مدفوع شهريًا`;
  if (metric === "MAP_LOOKUPS") return `+${formatted} استخدام خرائط شهريًا`;
  if (metric === "IN_APP_AI_ACTIONS") {
    return `+${formatted} إجراء AI داخل النظام شهريًا`;
  }

  const localized = localizeUsagePackName(pack?.code, pack?.name);
  return localized;
}

function normalizeUsageMetricFamily(metricKey: unknown): string {
  const normalized = String(metricKey || "OTHER")
    .toUpperCase()
    .trim();
  if (normalized === "AI_CAPACITY") return "AI_REPLIES";
  if (normalized === "VOICE_MINUTES") return "VOICE_TRANSCRIPTION";
  return normalized || "OTHER";
}

function normalizeTierCode(tierCode: unknown): string {
  const normalized = String(tierCode || "S")
    .toUpperCase()
    .trim();
  return normalized in TIER_ORDER ? normalized : "S";
}

function getUsageCodePreferenceRank(code: unknown): number {
  const normalized = String(code || "").toUpperCase();
  for (let index = 0; index < USAGE_CODE_PREFIX_PREFERENCE.length; index++) {
    if (normalized.startsWith(USAGE_CODE_PREFIX_PREFERENCE[index])) {
      return index;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function getAddOnCodePreferenceRank(code: unknown): number {
  const normalized = String(code || "").toUpperCase();
  const index = ADDON_CODE_PREFERENCE.indexOf(normalized);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function buildUsagePackMeaningKey(pack: any, collapseByTier = false): string {
  const family = normalizeUsageMetricFamily(pack?.metricKey);
  const tier = normalizeTierCode(pack?.tierCode);
  if (collapseByTier) {
    return `${family}|${tier}`;
  }
  const units = getUsagePackPrimaryDelta(pack).units;
  return `${family}|${tier}|${units}`;
}

function buildAddOnMeaningKey(addOn: any): string {
  const code = String(addOn?.code || "").toUpperCase();
  if (ADDON_MEANING_ALIAS[code]) {
    return ADDON_MEANING_ALIAS[code];
  }

  const features = [...(addOn?.featureEnables || [])]
    .map((entry) => String(entry || "").toUpperCase())
    .filter(Boolean)
    .sort()
    .join(",");
  const floor = Object.entries(addOn?.limitFloorUpdates || {})
    .map(([key, value]) => `${key}:${Number(value || 0)}`)
    .sort()
    .join("|");
  const increments = Object.entries(addOn?.limitIncrements || {})
    .map(([key, value]) => `${key}:${Number(value || 0)}`)
    .sort()
    .join("|");

  const meaningSignature = [
    String(addOn?.addonType || "FEATURE").toUpperCase(),
    features,
    floor,
    increments,
  ].join("::");

  if (features || floor || increments) {
    return meaningSignature;
  }

  return `CODE::${code}`;
}

function shouldPreferUsagePackCandidate(candidate: any, current: any): boolean {
  const candidateRank = getUsageCodePreferenceRank(candidate?.code);
  const currentRank = getUsageCodePreferenceRank(current?.code);
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank;
  }

  const candidateUnits = getUsagePackPrimaryDelta(candidate).units;
  const currentUnits = getUsagePackPrimaryDelta(current).units;
  if (candidateUnits !== currentUnits) {
    return candidateUnits > currentUnits;
  }

  const candidatePrice = Number(
    candidate?.priceCents ?? Number.MAX_SAFE_INTEGER,
  );
  const currentPrice = Number(current?.priceCents ?? Number.MAX_SAFE_INTEGER);
  return candidatePrice < currentPrice;
}

function shouldPreferAddOnCandidate(candidate: any, current: any): boolean {
  const candidateRank = getAddOnCodePreferenceRank(candidate?.code);
  const currentRank = getAddOnCodePreferenceRank(current?.code);
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank;
  }

  const candidatePrice = Number(
    mapPricesByCycle(candidate?.prices || []).get(1)?.effectiveMonthlyCents ??
      Number.MAX_SAFE_INTEGER,
  );
  const currentPrice = Number(
    mapPricesByCycle(current?.prices || []).get(1)?.effectiveMonthlyCents ??
      Number.MAX_SAFE_INTEGER,
  );
  return candidatePrice < currentPrice;
}

function dedupeAndSortUsagePacks(
  packs: any[],
  options: { collapseByTier?: boolean } = {},
): any[] {
  const deduped = new Map<string, any>();
  for (const pack of packs || []) {
    const key = buildUsagePackMeaningKey(pack, options.collapseByTier === true);
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, pack);
      continue;
    }
    if (shouldPreferUsagePackCandidate(pack, current)) {
      deduped.set(key, pack);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const familyCompare = normalizeUsageMetricFamily(
      a?.metricKey,
    ).localeCompare(normalizeUsageMetricFamily(b?.metricKey));
    if (familyCompare !== 0) return familyCompare;

    const tierCompare =
      (TIER_ORDER[normalizeTierCode(a?.tierCode)] || 99) -
      (TIER_ORDER[normalizeTierCode(b?.tierCode)] || 99);
    if (tierCompare !== 0) return tierCompare;

    const aUnits = getUsagePackPrimaryDelta(a).units;
    const bUnits = getUsagePackPrimaryDelta(b).units;
    return aUnits - bUnits;
  });
}

function dedupeAndSortAddOnsByMeaning(addOns: any[]): any[] {
  const deduped = new Map<string, any>();
  for (const addOn of addOns || []) {
    const key = buildAddOnMeaningKey(addOn);
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, addOn);
      continue;
    }
    if (shouldPreferAddOnCandidate(addOn, current)) {
      deduped.set(key, addOn);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const aName = localizeAddOnName(a?.code, a?.name);
    const bName = localizeAddOnName(b?.code, b?.name);
    return aName.localeCompare(bName, "ar");
  });
}

export default function PlanPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const router = useRouter();
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

  const curatedFeatureAddOns = useMemo(() => {
    const source = (catalog?.bundleAddOns?.capacityAddOns || []).filter(
      (item: any) => {
        if (item?.isActive === false) return false;
        const code = String(item?.code || "").toUpperCase();
        return CURATED_FEATURE_ADDON_CODES.has(code);
      },
    );
    return dedupeAndSortAddOnsByMeaning(source);
  }, [catalog]);

  const curatedFeatureMeaningKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const addOn of curatedFeatureAddOns) {
      keys.add(buildAddOnMeaningKey(addOn));
    }
    return keys;
  }, [curatedFeatureAddOns]);

  const byoAddOns = useMemo(() => {
    const source = (catalog?.byo?.featureAddOns || []).filter((item: any) => {
      if (item?.isActive === false) return false;
      const code = String(item?.code || "").toUpperCase();
      return code !== "PLATFORM_CORE";
    });

    return dedupeAndSortAddOnsByMeaning(source).filter(
      (addOn) => !curatedFeatureMeaningKeys.has(buildAddOnMeaningKey(addOn)),
    );
  }, [catalog, curatedFeatureMeaningKeys]);

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
      const key = normalizeUsageMetricFamily(usagePack.metricKey);
      if (HIDDEN_USAGE_METRICS.has(key) || !CURATED_USAGE_METRICS.has(key)) {
        continue;
      }
      groups[key] = groups[key] || [];
      groups[key].push(usagePack);
    }

    for (const key of Object.keys(groups)) {
      groups[key] = dedupeAndSortUsagePacks(groups[key], {
        collapseByTier: true,
      });
    }

    return groups;
  }, [catalog]);

  const curatedUsageMeaningKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const packs of Object.values(bundleUsagePacksByMetric)) {
      for (const pack of packs || []) {
        keys.add(buildUsagePackMeaningKey(pack, true));
      }
    }
    return keys;
  }, [bundleUsagePacksByMetric]);

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
      const key = normalizeUsageMetricFamily(usagePack.metricKey);
      const meaningKey = buildUsagePackMeaningKey(usagePack, true);
      if (
        CURATED_USAGE_METRICS.has(key) &&
        curatedUsageMeaningKeys.has(meaningKey)
      ) {
        continue;
      }
      groups[key] = groups[key] || [];
      groups[key].push(usagePack);
    }

    for (const key of Object.keys(groups)) {
      groups[key] = dedupeAndSortUsagePacks(groups[key], {
        collapseByTier: true,
      });
    }

    return groups;
  }, [catalog, curatedUsageMeaningKeys]);

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
        const result = await merchantApi.subscribeBundlePlan(apiKey, {
          planCode,
          regionCode,
          cycleMonths,
        });
        toast({
          title: "تم التفعيل",
          description:
            result?.cashierPromo?.active && result?.cashierPromo?.endsAt
              ? `تم تفعيل ${localizePlanName(planCode, planCode)} بنجاح. الكاشير متاح ضمن العرض حتى ${new Date(result.cashierPromo.endsAt).toLocaleDateString("ar-EG")}.`
              : `تم تفعيل ${localizePlanName(planCode, planCode)} بنجاح.`,
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

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="لا توجد بيانات"
          description="حاول التحديث مرة أخرى."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="الباقات والفوترة"
        description="باقات التشغيل + إضافات التوسّع + خيارات مخصصة"
        actions={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={loadCatalog}
          >
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
        <CardContent className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(usageStatus?.metrics || {})
            .filter(([metric]) => !HIDDEN_USAGE_METRICS.has(String(metric)))
            .slice(0, 8)
            .map(([metric, data]: any) => {
              const thresholds =
                usageStatus?.usageThresholds || DEFAULT_USAGE_THRESHOLDS;
              const used = Number(data?.used || 0);
              const limit = Number(data?.limit || 0);
              const usagePercent =
                typeof data?.usagePercent === "number"
                  ? Number(data.usagePercent)
                  : Number.isFinite(limit) && limit > 0
                    ? Math.round((used / limit) * 1000) / 10
                    : null;
              const thresholdBand =
                typeof data?.thresholdBand === "string"
                  ? data.thresholdBand
                  : usagePercent == null
                    ? "unlimited"
                    : usagePercent >= thresholds.exceeded
                      ? "exceeded"
                      : usagePercent >= thresholds.critical
                        ? "critical"
                        : usagePercent >= thresholds.warning
                          ? "warning"
                          : usagePercent >= thresholds.attention
                            ? "attention"
                            : "healthy";
              const progress = Math.max(
                0,
                Math.min(100, Number(usagePercent || 0)),
              );
              const bandLabel =
                data?.thresholdMessage ||
                USAGE_BAND_LABELS[thresholdBand] ||
                USAGE_BAND_LABELS.healthy;

              return (
                <div
                  key={metric}
                  className={cn(
                    "rounded-md p-3",
                    USAGE_BAND_CARD_CLASSES[thresholdBand] ||
                      USAGE_BAND_CARD_CLASSES.healthy,
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {USAGE_STATUS_LABELS[String(metric)] || metric}
                    {String(metric) === "MESSAGES" ? (
                      <span className="mr-1" title={MESSAGE_TOOLTIP}>
                        ℹ️
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm font-semibold">
                    {used.toLocaleString("ar-EG")} /{" "}
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
                  {usagePercent != null ? (
                    <>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            USAGE_BAND_BAR_CLASSES[thresholdBand] ||
                              USAGE_BAND_BAR_CLASSES.healthy,
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {usagePercent.toLocaleString("ar-EG")}٪ • {bandLabel}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {USAGE_BAND_LABELS.unlimited}
                    </p>
                  )}
                </div>
              );
            })}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">باقات التشغيل الكاملة</h2>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
          {(catalog.bundles || [])
            .filter((bundle: any) => {
              const code = String(bundle?.code || "").toUpperCase();
              return FULL_PLATFORM_PLAN_CODES.has(code);
            })
            .map((bundle: any) => {
              const cyclePriceMap = mapPricesByCycle(bundle.prices);
              const selectedCyclePrice = cyclePriceMap.get(Number(cycleMonths));
              const isCurrent =
                currentPlan === String(bundle.code || "").toUpperCase();
              const hasPrice = Boolean(selectedCyclePrice);
              const normalizedPlanCode = String(
                bundle.code || "",
              ).toUpperCase();
              const canSelect = canEdit && !isCurrent && hasPrice;
              const isEnterprise = normalizedPlanCode === "ENTERPRISE";
              const quotas = getBundleDisplayQuotas(bundle);
              const highlights =
                PLAN_CARD_HIGHLIGHTS[normalizedPlanCode] ||
                (bundle.features || [])
                  .slice(0, 6)
                  .map((feature: any) =>
                    localizeFeatureLabel(feature.key, feature.label),
                  );
              return (
                <Card
                  key={bundle.code}
                  className={isCurrent ? "border-primary" : ""}
                >
                  <CardHeader className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle>
                        {localizePlanName(bundle.code, bundle.name)}
                      </CardTitle>
                      {isCurrent ? <Badge>الباقة الحالية</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {localizePlanDescription(bundle.code, bundle.description)}
                    </p>
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
                    <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                      الرسائل = إجمالي الرسائل المُدارة داخل المنصة وتشمل رسائل
                      العملاء + ردود الذكاء الاصطناعي.
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/10 p-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">الرسائل / يوم</p>
                        <p className="font-semibold">
                          {quotas.totalMessagesPerDay.toLocaleString("ar-EG")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">الرسائل / شهر</p>
                        <p className="font-semibold">
                          {quotas.totalMessagesPerMonth.toLocaleString("ar-EG")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          ردود الذكاء الاصطناعي / يوم
                        </p>
                        <p className="font-semibold">
                          {quotas.aiRepliesPerDay.toLocaleString("ar-EG")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          ردود الذكاء الاصطناعي / شهر
                        </p>
                        <p className="font-semibold">
                          {quotas.aiRepliesPerMonth.toLocaleString("ar-EG")}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      الفروع / POS:{" "}
                      {Number(bundle?.limits?.branches || 0).toLocaleString(
                        "ar-EG",
                      )}{" "}
                      /{" "}
                      {Number(
                        bundle?.limits?.posConnections ||
                          bundle?.limits?.pos_connections ||
                          0,
                      ).toLocaleString("ar-EG")}
                    </p>

                    <div className="space-y-1">
                      {highlights.slice(0, 6).map((line: string) => (
                        <p
                          key={line}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span>{line}</span>
                        </p>
                      ))}
                    </div>

                    <Button
                      className="w-full"
                      variant={isEnterprise ? "outline" : "default"}
                      disabled={
                        isCurrent ? true : isEnterprise ? false : !canSelect
                      }
                      onClick={() => {
                        if (isEnterprise) {
                          router.push("/merchant/plan?contactSales=enterprise");
                          return;
                        }
                        handleSubscribeBundle(bundle.code);
                      }}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      {isCurrent
                        ? "الباقة الحالية"
                        : isEnterprise
                          ? "تواصل مع المبيعات"
                          : hasPrice
                            ? "اختيار الباقة"
                            : "غير متاحة حالياً"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </div>

      {(() => {
        const chatOnlyBundle = (catalog?.bundles || []).find(
          (bundle: any) =>
            String(bundle?.code || "").toUpperCase() === "CHAT_ONLY",
        );
        if (!chatOnlyBundle) return null;

        const cyclePriceMap = mapPricesByCycle(chatOnlyBundle.prices);
        const selectedCyclePrice = cyclePriceMap.get(Number(cycleMonths));
        const normalizedCode = String(chatOnlyBundle.code || "").toUpperCase();
        const isCurrent = currentPlan === normalizedCode;
        const canSelect = canEdit && !isCurrent && Boolean(selectedCyclePrice);
        const quotas = getBundleDisplayQuotas(chatOnlyBundle);

        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">باقة الدردشة فقط</h2>
            </div>

            <Card className="border-[var(--accent-blue)]/40 bg-[var(--bg-surface-2)]">
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>
                    {localizePlanName(chatOnlyBundle.code, chatOnlyBundle.name)}
                  </CardTitle>
                  <Badge variant="secondary">منتج تواصل فقط</Badge>
                  <Badge className="border-0 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                    سعة رسائل أعلى من الباقة المبتدئة
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  باقة أضيق وظيفيًا من الباقة المبتدئة لكنها أعلى في سعة
                  الرسائل.
                </p>
                {selectedCyclePrice ? (
                  <p className="text-2xl font-bold">
                    {toCurrency(
                      selectedCyclePrice.effectiveMonthlyCents,
                      selectedCyclePrice.currency,
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    لا يوجد سعر لهذه الدولة
                  </p>
                )}
              </CardHeader>

              <CardContent className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-sm font-medium">يشمل</p>
                    <div className="space-y-1">
                      {(PLAN_CARD_HIGHLIGHTS.CHAT_ONLY || []).map((line) => (
                        <p
                          key={line}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span>{line}</span>
                        </p>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-medium">لا يشمل</p>
                    <div className="space-y-1">
                      {CHAT_ONLY_EXCLUDED_LABELS.map((line) => (
                        <p
                          key={line}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span>—</span>
                          <span>{line}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-md border bg-background/80 p-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">الرسائل / يوم</p>
                    <p className="font-semibold">
                      {quotas.totalMessagesPerDay.toLocaleString("ar-EG")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">الرسائل / شهر</p>
                    <p className="font-semibold">
                      {quotas.totalMessagesPerMonth.toLocaleString("ar-EG")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      ردود الذكاء الاصطناعي / يوم
                    </p>
                    <p className="font-semibold">
                      {quotas.aiRepliesPerDay.toLocaleString("ar-EG")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      ردود الذكاء الاصطناعي / شهر
                    </p>
                    <p className="font-semibold">
                      {quotas.aiRepliesPerMonth.toLocaleString("ar-EG")}
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    disabled={!canSelect}
                    onClick={() => handleSubscribeBundle(chatOnlyBundle.code)}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {isCurrent
                      ? "الباقة الحالية"
                      : selectedCyclePrice
                        ? "ابدأ بباقة الدردشة"
                        : "غير متاحة حالياً"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">إضافات التوسّع</h2>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">A) إضافات المزايا</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {curatedFeatureAddOns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  لا توجد إضافات مزايا مباشرة متاحة لهذه الباقة حاليًا.
                </p>
              ) : (
                curatedFeatureAddOns.map((addOn: any) => {
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
                    <div
                      key={addOn.code}
                      className="space-y-2 rounded-md border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">
                          {localizeAddOnName(addOn.code, addOn.name)}
                        </p>
                        {alreadyIncluded ? (
                          <Badge variant="secondary">مضمنة بالفعل</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {localizeAddOnDescription(
                          addOn.code,
                          addOn.description,
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedCyclePrice
                          ? `سعر شهري فعلي: ${toCurrency(
                              selectedCyclePrice.effectiveMonthlyCents,
                              selectedCyclePrice.currency,
                            )}`
                          : "غير متاح لهذه الدولة"}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {allowsQuantity ? (
                          <Input
                            type="number"
                            min={1}
                            className="h-8 w-full sm:w-24"
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
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            مرة واحدة
                          </span>
                        )}
                        <Button
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={!canEdit || alreadyIncluded}
                          onClick={() => handleBuyCapacity(addOn.code)}
                        >
                          شراء الإضافة
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">B) إضافات الوكلاء</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {LIVE_AGENT_ADDON_ITEMS.map((agent) => (
                <div
                  key={agent}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <p className="text-sm font-medium">{agent}</p>
                  <Badge variant="outline">وكيل حي قابل للبيع</Badge>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  router.push("/merchant/plan?contactSales=agents")
                }
              >
                تواصل مع المبيعات
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">C) باقات الاستخدام</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                اختَر باقة واحدة لكل فئة، والكمية لتكرار نفس الباقة شهريًا.
              </p>
              {Object.entries(bundleUsagePacksByMetric).map(
                ([metric, packs]) => (
                  <div key={metric} className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium">
                        {METRIC_LABELS[metric] || metric}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={!canEdit}
                        onClick={() => handleBuyUsagePack(metric)}
                      >
                        شراء الفئة المحددة
                      </Button>
                    </div>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                      {(packs || []).map((pack: any) => {
                        const selected =
                          bundleSelectedPackByMetric[metric] === pack.code;
                        const quantity = Math.max(
                          1,
                          Number(bundlePackQty[pack.code] || 1),
                        );
                        return (
                          <Card
                            key={pack.code}
                            className={selected ? "border-primary" : ""}
                          >
                            <CardContent className="space-y-2 pt-4">
                              <p className="font-medium text-sm">
                                {getCuratedUsagePackLabel(pack)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {pack.priceCents
                                  ? toCurrency(
                                      pack.priceCents,
                                      pack.currency || currency,
                                    )
                                  : "-"}
                              </p>
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
                                className="h-8 w-full sm:w-24"
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
                ),
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                D) الباقات المخصصة / المؤسسية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ENTERPRISE_CUSTOM_ITEMS.map((item) => (
                <div key={item} className="rounded-md border p-3 text-sm">
                  {item}
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  router.push("/merchant/plan?contactSales=custom")
                }
              >
                تواصل مع المبيعات
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ملاحظات مهمة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• الرسائل = إجمالي الرسائل المُدارة داخل المنصة</p>
          <p>• تشمل رسائل العملاء + ردود الذكاء الاصطناعي</p>
          <p>• رسوم قوالب واتساب المدفوعة تُحاسب بشكل منفصل</p>
          <p>• المكالمات لا تشملها الباقات القياسية</p>
          <p>• الكاشير مجاني لأول 30 يومًا في الاشتراكات الجديدة المؤهلة</p>
        </CardContent>
      </Card>

      <details className="group rounded-md border bg-background/70 p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold">
          وضع متقدم: بناء باقة مخصصة (BYO)
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          تم إخفاء تفاصيل البناء المخصص من المسار الافتراضي. افتح هذا القسم فقط
          إذا كنت تحتاج إعدادًا متقدمًا.
        </p>

        <div className="mt-3 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                اختر إضافات BYO + باقات الاستخدام
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-medium">إضافات BYO (تخضع لخصم الدورة)</h3>
                {byoAddOns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    لا توجد إضافات مخصصة إضافية بعد استبعاد العناصر المكررة مع
                    المسار القياسي.
                  </p>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                    {byoAddOns.map((addOn: any) => {
                      const checked = Number(byoAddOnQty[addOn.code] || 0) > 0;
                      const normalizedAddOnCode = String(
                        addOn.code || "",
                      ).toUpperCase();
                      const allowsQuantity =
                        SCALABLE_CAPACITY_ADDONS.has(normalizedAddOnCode) ||
                        Object.keys(addOn.limitIncrements || {}).length > 0;
                      const cyclePriceMap = mapPricesByCycle(
                        addOn.prices || [],
                      );
                      const selectedCyclePrice = cyclePriceMap.get(
                        Number(cycleMonths),
                      );

                      return (
                        <Card
                          key={addOn.code}
                          className={checked ? "border-primary" : ""}
                        >
                          <CardContent className="space-y-2 pt-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
                            </div>

                            <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
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

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={checked}
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
                                  className="h-8 w-full sm:w-20"
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
                )}
              </div>

              <div className="space-y-3">
                <h3 className="font-medium">باقات الاستخدام (بدون خصم دورة)</h3>
                <p className="text-xs text-muted-foreground">
                  لكل فئة اختر باقة واحدة فقط. الرقم = تكرار نفس الباقة شهريًا.
                </p>
                {Object.keys(byoUsagePacksByMetric).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    لا توجد باقات استخدام إضافية تتجاوز المعروض في المسار
                    القياسي.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(byoUsagePacksByMetric).map(
                      ([metric, packs]) => (
                        <div key={metric} className="space-y-2">
                          <p className="text-sm font-medium">
                            {METRIC_LABELS[metric] || metric}
                          </p>
                          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
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
                                      {getCuratedUsagePackLabel(pack)}
                                    </p>
                                    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
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
                                          القيم بعد تطبيق الكمية الحالية (
                                          {quantity}
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
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={(nextChecked) => {
                                            const enabled =
                                              nextChecked === true;
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
                                        className="h-8 w-full sm:w-20"
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
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  onClick={calculateByo}
                  disabled={calculating}
                  className="w-full sm:w-auto"
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  {calculating ? "جاري الحساب..." : "إعادة حساب BYO"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  هذه نتيجة تقديرية للباندل المخصص قبل اعتمادها نهائيًا عبر فريق
                  المبيعات.
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
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      قبل معامل BYO (شهري)
                    </p>
                    <p className="text-lg font-semibold">
                      {toCurrency(
                        byoResult.subtotals?.preMarkupEffectiveMonthlyCents ||
                          0,
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
                        className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between"
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
                    <p className="mt-2 text-xs text-[var(--accent-warning)]">
                      تم تطبيق حد أدنى: BYO ≥ الباقة المكافئة × 1.15
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </details>
    </div>
  );
}
