"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { AlertBanner } from "@/components/ui/alerts";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Crown,
  Check,
  Lock,
  Zap,
  Package,
  CreditCard,
  ScanLine,
  BarChart3,
  Star,
  Users,
  Bell,
  Shield,
  Webhook,
  MessageSquare,
  ShoppingCart,
  Bot,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { merchantApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useToast } from "@/hooks/use-toast";
import {
  AiInsightsCard,
  generatePlanInsights,
} from "@/components/ai/ai-insights-card";

// Plan definitions with pricing (EGP)
// ── Cost-based pricing model (2025, Meta Cloud API direct) ───────
// WhatsApp msg via Meta Cloud API: FREE (service/utility in CSW)
// 1 conversation ≈ 10 messages + 3 AI calls = ~0.21 EGP cost (AI only)
// AI call (blended): ~0.07 EGP (85% GPT-4o-mini + 15% GPT-4o)
// Only marketing templates cost: ~3.70 EGP/msg (pass-through)
// ─────────────────────────────────────────────────────────────────

const PLANS = {
  STARTER: {
    name: "Starter",
    nameAr: "المبتدئ",
    price: 449,
    currency: "EGP",
    period: "شهرياً",
    description: "للتجار الجدد - وكيل عمليات ذكي + ~33 محادثة يومياً",
    color: "from-blue-500 to-blue-600",
    agents: ["OPS_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
    ],
    limits: {
      messagesPerMonth: 10000,
      whatsappNumbers: 1,
      teamMembers: 1,
      aiCallsPerDay: 300,
    },
    aiHighlights: [
      "300 أمر ذكاء/يوم (~1,000 محادثة/شهر)",
      "مساعد نصي + صوتي + رسائل صوتية",
      "تقارير أداء أساسية",
    ],
  },
  GROWTH: {
    name: "Growth",
    nameAr: "النمو",
    price: 799,
    currency: "EGP",
    period: "شهرياً",
    description: "للتجار المتوسعين - +وكيل مخزون + ~50 محادثة يومياً",
    color: "from-green-500 to-green-600",
    popular: true,
    agents: ["OPS_AGENT", "INVENTORY_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
      "INVENTORY",
      "API_ACCESS",
    ],
    limits: {
      messagesPerMonth: 15000,
      whatsappNumbers: 2,
      teamMembers: 2,
      aiCallsPerDay: 500,
    },
    aiHighlights: [
      "500 أمر ذكاء/يوم (~1,500 محادثة/شهر)",
      "وكيل مخزون ذكي + تنبيهات",
      "ربط API خارجي",
    ],
  },
  PRO: {
    name: "Pro",
    nameAr: "الاحترافي",
    price: 1499,
    currency: "EGP",
    period: "شهرياً",
    description: "للتجار المحترفين - +وكيل مالي + ~167 محادثة يومياً",
    color: "from-purple-500 to-purple-600",
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
      "INVENTORY",
      "API_ACCESS",
      "PAYMENTS",
      "VISION_OCR",
      "KPI_DASHBOARD",
      "WEBHOOKS",
      "TEAM",
      "AUDIT_LOGS",
    ],
    limits: {
      messagesPerMonth: 50000,
      whatsappNumbers: 3,
      teamMembers: 3,
      aiCallsPerDay: 1500,
    },
    aiHighlights: [
      "1,500 أمر ذكاء/يوم (~5,000 محادثة/شهر)",
      "وكيل مالي — إيصالات OCR + تقارير",
      "مدفوعات + مؤشرات KPI + رؤية بصرية",
    ],
  },
  ENTERPRISE: {
    name: "Enterprise",
    nameAr: "المؤسسات",
    price: 2999,
    currency: "EGP",
    period: "شهرياً",
    description: "للمؤسسات الكبيرة - 3 وكلاء ذكية + بلا حدود",
    color: "from-amber-500 to-amber-600",
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "INVENTORY",
      "PAYMENTS",
      "VISION_OCR",
      "VOICE_NOTES",
      "REPORTS",
      "WEBHOOKS",
      "TEAM",
      "NOTIFICATIONS",
      "AUDIT_LOGS",
      "KPI_DASHBOARD",
      "API_ACCESS",
    ],
    limits: {
      messagesPerMonth: -1,
      whatsappNumbers: -1,
      teamMembers: 10,
      aiCallsPerDay: -1,
    },
    aiHighlights: [
      "محادثات بلا حدود + كل ميزات الذكاء",
      "3 وكلاء ذكية كاملة",
      "OCR + رسائل صوتية + رؤية بصرية بلا حدود",
    ],
  },
};

// Feature metadata
const FEATURE_META: Record<
  string,
  {
    icon: React.ElementType;
    nameAr: string;
    descriptionAr: string;
    dependencies?: string[];
  }
> = {
  CONVERSATIONS: {
    icon: MessageSquare,
    nameAr: "المحادثات",
    descriptionAr: "التواصل مع العملاء عبر واتساب",
  },
  ORDERS: {
    icon: ShoppingCart,
    nameAr: "الطلبات",
    descriptionAr: "إدارة طلبات العملاء",
    dependencies: ["CONVERSATIONS"],
  },
  CATALOG: {
    icon: Package,
    nameAr: "الكتالوج",
    descriptionAr: "عرض المنتجات والخدمات",
  },
  INVENTORY: {
    icon: Package,
    nameAr: "المخزون",
    descriptionAr: "تتبع المخزون والكميات",
    dependencies: ["CATALOG"],
  },
  PAYMENTS: {
    icon: CreditCard,
    nameAr: "المدفوعات",
    descriptionAr: "روابط الدفع وإثباتات الدفع",
    dependencies: ["ORDERS"],
  },
  VISION_OCR: {
    icon: ScanLine,
    nameAr: "الرؤية البصرية",
    descriptionAr: "تحليل الصور والإيصالات",
  },
  VOICE_NOTES: {
    icon: MessageSquare,
    nameAr: "الرسائل الصوتية",
    descriptionAr: "تحويل الصوت إلى نص",
    dependencies: ["CONVERSATIONS"],
  },
  REPORTS: {
    icon: BarChart3,
    nameAr: "التقارير",
    descriptionAr: "تقارير الأداء والمبيعات",
    dependencies: ["ORDERS"],
  },
  WEBHOOKS: {
    icon: Webhook,
    nameAr: "التكاملات",
    descriptionAr: "ربط مع الأنظمة الخارجية",
  },
  TEAM: {
    icon: Users,
    nameAr: "الفريق",
    descriptionAr: "إدارة صلاحيات الفريق",
  },
  LOYALTY: {
    icon: Star,
    nameAr: "برنامج الولاء",
    descriptionAr: "نقاط ومكافآت العملاء",
    dependencies: ["ORDERS"],
  },
  NOTIFICATIONS: {
    icon: Bell,
    nameAr: "الإشعارات",
    descriptionAr: "إشعارات فورية للأحداث",
  },
  AUDIT_LOGS: {
    icon: Shield,
    nameAr: "سجل التدقيق",
    descriptionAr: "تتبع جميع التغييرات",
  },
  KPI_DASHBOARD: {
    icon: BarChart3,
    nameAr: "مؤشرات الأداء",
    descriptionAr: "لوحة قياس الأداء",
    dependencies: ["ORDERS"],
  },
  API_ACCESS: {
    icon: Webhook,
    nameAr: "وصول API",
    descriptionAr: "وصول مباشر للـ API",
  },
};

const AGENT_META: Record<
  string,
  { icon: React.ElementType; nameAr: string; descriptionAr: string }
> = {
  OPS_AGENT: {
    icon: Bot,
    nameAr: "وكيل العمليات",
    descriptionAr: "المحادثات والطلبات الأساسية",
  },
  INVENTORY_AGENT: {
    icon: Package,
    nameAr: "وكيل المخزون",
    descriptionAr: "إدارة المخزون التلقائية",
  },
  FINANCE_AGENT: {
    icon: CreditCard,
    nameAr: "وكيل المالية",
    descriptionAr: "المدفوعات والتقارير المالية",
  },
  MARKETING_AGENT: {
    icon: Sparkles,
    nameAr: "وكيل التسويق",
    descriptionAr: "التسويق والحملات عبر السوشيال",
  },
  SUPPORT_AGENT: {
    icon: Users,
    nameAr: "وكيل الدعم",
    descriptionAr: "دعم العملاء المتقدم",
  },
  CONTENT_AGENT: {
    icon: Sparkles,
    nameAr: "وكيل المحتوى",
    descriptionAr: "إنشاء محتوى للسوشيال والمتجر",
  },
  SALES_AGENT: {
    icon: ShoppingCart,
    nameAr: "وكيل المبيعات",
    descriptionAr: "متابعة المبيعات وتحويل الفرص",
  },
  CREATIVE_AGENT: {
    icon: Star,
    nameAr: "وكيل الإبداع",
    descriptionAr: "توليد صور وفيديوهات وإعلانات",
  },
};

const PLAN_ORDER = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];

const AGENT_DEPENDENCIES: Record<string, string[]> = {
  OPS_AGENT: [],
  INVENTORY_AGENT: ["OPS_AGENT"],
  FINANCE_AGENT: ["OPS_AGENT"],
  MARKETING_AGENT: ["OPS_AGENT"],
  SUPPORT_AGENT: ["OPS_AGENT"],
  CONTENT_AGENT: [],
  SALES_AGENT: ["OPS_AGENT"],
  CREATIVE_AGENT: ["CONTENT_AGENT"],
};

const AGENT_FEATURE_MAP: Record<string, string[]> = {
  OPS_AGENT: ["CONVERSATIONS", "ORDERS", "CATALOG"],
  INVENTORY_AGENT: ["INVENTORY"],
  FINANCE_AGENT: ["REPORTS", "KPI_DASHBOARD"],
  MARKETING_AGENT: ["LOYALTY"],
  SUPPORT_AGENT: ["CONVERSATIONS"],
  CONTENT_AGENT: [],
  SALES_AGENT: [],
  CREATIVE_AGENT: [],
};

// Features that the agent is responsible for (display only)
const AGENT_CAPABILITY_MAP: Record<string, string[]> = {
  OPS_AGENT: [
    "CONVERSATIONS",
    "ORDERS",
    "CATALOG",
    "VOICE_NOTES",
    "NOTIFICATIONS",
    "WEBHOOKS",
    "TEAM",
    "AUDIT_LOGS",
    "API_ACCESS",
    "VISION_OCR",
  ],
  INVENTORY_AGENT: ["INVENTORY"],
  FINANCE_AGENT: ["PAYMENTS", "REPORTS", "KPI_DASHBOARD"],
  MARKETING_AGENT: ["LOYALTY"],
  SUPPORT_AGENT: ["CONVERSATIONS"],
  CONTENT_AGENT: [],
  SALES_AGENT: [],
  CREATIVE_AGENT: [],
};

const FEATURE_DEPENDENCIES: Record<string, string[]> = {
  CONVERSATIONS: [],
  ORDERS: ["CONVERSATIONS"],
  CATALOG: [],
  INVENTORY: ["CATALOG"],
  PAYMENTS: ["ORDERS"],
  VISION_OCR: [],
  VOICE_NOTES: ["CONVERSATIONS"],
  REPORTS: ["ORDERS"],
  WEBHOOKS: [],
  TEAM: [],
  LOYALTY: ["ORDERS"],
  NOTIFICATIONS: [],
  AUDIT_LOGS: [],
  KPI_DASHBOARD: ["ORDERS"],
  API_ACCESS: [],
};

const FEATURE_AGENT_MAP: Record<string, string> = {
  INVENTORY: "INVENTORY_AGENT",
  PAYMENTS: "FINANCE_AGENT",
  VISION_OCR: "OPS_AGENT",
  VOICE_NOTES: "OPS_AGENT",
  WEBHOOKS: "OPS_AGENT",
  TEAM: "OPS_AGENT",
  NOTIFICATIONS: "OPS_AGENT",
  AUDIT_LOGS: "OPS_AGENT",
  API_ACCESS: "OPS_AGENT",
  REPORTS: "FINANCE_AGENT",
  LOYALTY: "MARKETING_AGENT",
  KPI_DASHBOARD: "FINANCE_AGENT",
};

const IMPLEMENTED_AGENTS = new Set([
  "OPS_AGENT",
  "INVENTORY_AGENT",
  "FINANCE_AGENT",
]);
const COMING_SOON_AGENTS = new Set([
  "SUPPORT_AGENT",
  "MARKETING_AGENT",
  "CONTENT_AGENT",
  "SALES_AGENT",
  "CREATIVE_AGENT",
]);
const COMING_SOON_FEATURES = new Set(["LOYALTY"]);

const formatAgentNames = (agents: string[]) =>
  agents.map((agent) => AGENT_META[agent]?.nameAr || agent).join("، ");

const formatFeatureNames = (features: string[]) =>
  features
    .map((feature) => FEATURE_META[feature]?.nameAr || feature)
    .join("، ");

const isAgentImplemented = (agent: string) => IMPLEMENTED_AGENTS.has(agent);
const isComingSoonAgent = (agent: string) =>
  COMING_SOON_AGENTS.has(agent) || !isAgentImplemented(agent);
const isComingSoonFeature = (feature: string) =>
  COMING_SOON_FEATURES.has(feature) ||
  (FEATURE_AGENT_MAP[feature]
    ? isComingSoonAgent(FEATURE_AGENT_MAP[feature])
    : false);

const FEATURE_KEY_MAP: Record<string, string> = {
  inventory: "INVENTORY",
  reports: "REPORTS",
  conversations: "CONVERSATIONS",
  webhooks: "WEBHOOKS",
  team: "TEAM",
  audit: "AUDIT_LOGS",
  payments: "PAYMENTS",
  vision: "VISION_OCR",
  kpis: "KPI_DASHBOARD",
  loyalty: "LOYALTY",
  voiceNotes: "VOICE_NOTES",
  notifications: "NOTIFICATIONS",
  apiAccess: "API_ACCESS",
};

const mapFeatureFlagsToCodes = (flags?: Record<string, boolean>) => {
  if (!flags) return [];
  return Object.entries(flags)
    .filter(([key, enabled]) => enabled && FEATURE_KEY_MAP[key])
    .map(([key]) => FEATURE_KEY_MAP[key]);
};

const normalizePlanCode = (value?: string | null) => {
  const raw = String(value || "").toUpperCase();
  if (!raw) return "STARTER";
  if (["PRO", "PROFESSIONAL", "PRO_PLAN"].includes(raw)) return "PRO";
  if (["ENTERPRISE", "ENTERPRISES"].includes(raw)) return "ENTERPRISE";
  if (["STARTER", "BASIC"].includes(raw)) return "STARTER";
  if (["GROWTH", "GROW"].includes(raw)) return "GROWTH";
  if (["TRIAL", "FREE", "FREE_TRIAL"].includes(raw)) return "TRIAL";
  return raw;
};

const QUOTE_STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  NEW: { label: "جديد", variant: "secondary" },
  UNDER_REVIEW: { label: "قيد المراجعة", variant: "default" },
  QUOTED: { label: "تم التسعير", variant: "default" },
  ACCEPTED: { label: "مقبول", variant: "secondary" },
  ACTIVE: { label: "نشط", variant: "secondary" },
  DONE: { label: "مكتمل", variant: "secondary" },
  REJECTED: { label: "مرفوض", variant: "destructive" },
};

interface MerchantPlan {
  currentPlan: string;
  enabledAgents: string[];
  enabledFeatures: string[];
  limits: {
    messagesPerMonth: number;
    messagesUsed: number;
    whatsappNumbers: number;
    teamMembers: number;
  };
  billingCycle: string;
  nextBillingDate: string;
}

const toFiniteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const normalizePlanLimits = (
  rawLimits: any,
  fallback: {
    messagesPerMonth: number;
    whatsappNumbers: number;
    teamMembers: number;
    aiCallsPerDay: number;
  },
) => ({
  messagesPerMonth:
    toFiniteNumber(
      rawLimits?.messagesPerMonth ?? rawLimits?.messages_per_month,
    ) ?? fallback.messagesPerMonth,
  whatsappNumbers:
    toFiniteNumber(rawLimits?.whatsappNumbers ?? rawLimits?.whatsapp_numbers) ??
    fallback.whatsappNumbers,
  teamMembers:
    toFiniteNumber(rawLimits?.teamMembers ?? rawLimits?.team_members) ??
    fallback.teamMembers,
  aiCallsPerDay:
    toFiniteNumber(rawLimits?.aiCallsPerDay ?? rawLimits?.ai_calls_per_day) ??
    fallback.aiCallsPerDay,
});

const normalizeMerchantLimits = (
  rawLimits: any,
  fallback: {
    messagesPerMonth: number;
    messagesUsed: number;
    whatsappNumbers: number;
    teamMembers: number;
  },
) => ({
  messagesPerMonth:
    toFiniteNumber(
      rawLimits?.messagesPerMonth ?? rawLimits?.messages_per_month,
    ) ?? fallback.messagesPerMonth,
  messagesUsed:
    toFiniteNumber(rawLimits?.messagesUsed ?? rawLimits?.messages_used) ??
    fallback.messagesUsed,
  whatsappNumbers:
    toFiniteNumber(rawLimits?.whatsappNumbers ?? rawLimits?.whatsapp_numbers) ??
    fallback.whatsappNumbers,
  teamMembers:
    toFiniteNumber(rawLimits?.teamMembers ?? rawLimits?.team_members) ??
    fallback.teamMembers,
});

const KNOWN_AGENT_CODES = new Set(Object.keys(AGENT_META));
const KNOWN_FEATURE_CODES = new Set(Object.keys(FEATURE_META));

const normalizeCodeArray = (value: unknown, allowed: Set<string>): string[] => {
  const asArray = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return Array.from(
    new Set(
      asArray
        .map((item) =>
          String(item || "")
            .toUpperCase()
            .trim(),
        )
        .filter((item) => allowed.has(item)),
    ),
  );
};

export default function PlanPage() {
  const { apiKey, merchantId } = useMerchant();
  const { canEdit } = useRoleAccess("plan");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [merchantPlan, setMerchantPlan] = useState<MerchantPlan | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [expandedFeatures, setExpandedFeatures] = useState(false);
  const [billingPlans, setBillingPlans] = useState<any[]>([]);
  const [billingOffers, setBillingOffers] = useState<any[]>([]);
  const [customAgents, setCustomAgents] = useState<string[]>([]);
  const [customFeatures, setCustomFeatures] = useState<string[]>([]);
  const [customLimits, setCustomLimits] = useState({
    messagesPerMonth: "",
    whatsappNumbers: "",
    teamMembers: "",
  });
  const [customNotes, setCustomNotes] = useState("");
  const [dependencyNotice, setDependencyNotice] = useState<string | null>(null);
  const [quoteSending, setQuoteSending] = useState(false);
  const [customInitialized, setCustomInitialized] = useState(false);
  const [quoteRequests, setQuoteRequests] = useState<any[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  // API-fetched catalog data
  const [catalogData, setCatalogData] = useState<{
    agents: Array<{ id: string; status: string; eta?: string }>;
    features: Array<{ id: string; status: string; eta?: string }>;
  } | null>(null);

  // Pricing calculator state
  const [pricingData, setPricingData] = useState<any>(null);
  const [calcAgents, setCalcAgents] = useState<Set<string>>(
    new Set(["OPS_AGENT"]),
  );
  const [calcFeatures, setCalcFeatures] = useState<Set<string>>(
    new Set(["CONVERSATIONS", "ORDERS", "CATALOG"]),
  );
  const [calcAiTier, setCalcAiTier] = useState("BASIC");
  const [calcMessageTier, setCalcMessageTier] = useState("STARTER");
  const [calcResult, setCalcResult] = useState<{
    totalMonthly: number;
    breakdown: Array<{ item: string; nameAr: string; price: number }>;
    recommendedPlan: string | null;
    recommendedPlanPrice: number | null;
    savingsVsCustom: number;
  } | null>(null);

  // Derive coming soon sets from API data
  const comingSoonAgentsFromApi = useMemo(() => {
    if (!catalogData?.agents) return null;
    return new Set(
      catalogData.agents
        .filter((a) => a.status === "coming_soon")
        .map((a) => a.id),
    );
  }, [catalogData]);

  const comingSoonFeaturesFromApi = useMemo(() => {
    if (!catalogData?.features) return null;
    return new Set(
      catalogData.features
        .filter((f) => f.status === "coming_soon")
        .map((f) => f.id),
    );
  }, [catalogData]);

  // Use API data when available, fallback to hardcoded
  const effectiveComingSoonAgents =
    comingSoonAgentsFromApi || COMING_SOON_AGENTS;
  const effectiveComingSoonFeatures =
    comingSoonFeaturesFromApi || COMING_SOON_FEATURES;

  const isComingSoonAgentDynamic = useCallback(
    (agent: string) => {
      return (
        effectiveComingSoonAgents.has(agent) || !IMPLEMENTED_AGENTS.has(agent)
      );
    },
    [effectiveComingSoonAgents],
  );

  const isComingSoonFeatureDynamic = useCallback(
    (feature: string) => {
      return (
        effectiveComingSoonFeatures.has(feature) ||
        (FEATURE_AGENT_MAP[feature]
          ? isComingSoonAgentDynamic(FEATURE_AGENT_MAP[feature])
          : false)
      );
    },
    [effectiveComingSoonFeatures, isComingSoonAgentDynamic],
  );

  const displayedPlans = useMemo(() => {
    if (!billingPlans.length) return PLANS;
    const mapped = { ...PLANS } as any;
    billingPlans.forEach((plan: any) => {
      const code = String(plan.code || "").toUpperCase();
      if (code && mapped[code]) {
        const target = mapped[code];
        mapped[code] = {
          ...target,
          price:
            typeof plan.price_cents === "number"
              ? Math.round(plan.price_cents / 100)
              : target.price,
          currency: plan.currency || target.currency,
          description: plan.description || target.description,
          features: plan.features || target.features,
          agents: plan.agents || target.agents,
          limits: normalizePlanLimits(plan.limits, target.limits),
        };
      }
    });
    // Guard against malformed DB pricing so cards stay ordered and sensible.
    let previousPrice = 0;
    PLAN_ORDER.forEach((code) => {
      const targetPlan = mapped[code];
      const fallbackPrice =
        toFiniteNumber(PLANS[code as keyof typeof PLANS]?.price) ?? 0;
      const currentPrice = toFiniteNumber(targetPlan?.price) ?? fallbackPrice;
      const minAllowed = previousPrice > 0 ? previousPrice + 1 : fallbackPrice;
      targetPlan.price = Math.max(currentPrice, fallbackPrice, minAllowed);
      previousPrice = targetPlan.price;
    });
    return mapped as typeof PLANS;
  }, [billingPlans]);

  // Fetch pricing data for calculator
  useEffect(() => {
    if (!apiKey) return;
    merchantApi
      .getPricing(apiKey)
      .then(setPricingData)
      .catch(() => {
        /* pricing load non-blocking */
      });
  }, [apiKey]);

  // Auto-calculate price when calculator selections change
  useEffect(() => {
    if (!apiKey) return;
    const timer = setTimeout(() => {
      merchantApi
        .calculatePrice(apiKey, {
          agents: Array.from(calcAgents),
          features: Array.from(calcFeatures),
          aiTier: calcAiTier,
          messageTier: calcMessageTier,
        })
        .then(setCalcResult)
        .catch(() => {
          /* calc non-blocking */
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [apiKey, calcAgents, calcFeatures, calcAiTier, calcMessageTier]);

  const toggleCalcAgent = useCallback(
    (agentId: string) => {
      setCalcAgents((prev) => {
        const next = new Set(prev);
        if (next.has(agentId)) {
          if (agentId === "OPS_AGENT") return prev;
          next.delete(agentId);
          if (pricingData) {
            const agentFeatures =
              pricingData.agents?.find((a: any) => a.id === agentId)
                ?.features || [];
            setCalcFeatures((sf) => {
              const nf = new Set(sf);
              agentFeatures.forEach((f: string) => nf.delete(f));
              return nf;
            });
          }
        } else {
          next.add(agentId);
          const agent = pricingData?.agents?.find((a: any) => a.id === agentId);
          agent?.dependencies?.forEach((dep: string) => next.add(dep));
          agent?.features?.forEach((f: string) => {
            setCalcFeatures((sf) => new Set([...sf, f]));
          });
        }
        return next;
      });
    },
    [pricingData],
  );

  const toggleCalcFeature = useCallback(
    (featureId: string) => {
      setCalcFeatures((prev) => {
        const next = new Set(prev);
        if (next.has(featureId)) {
          if (["CONVERSATIONS", "ORDERS", "CATALOG"].includes(featureId))
            return prev;
          next.delete(featureId);
        } else {
          next.add(featureId);
          const feature = pricingData?.features?.find(
            (f: any) => f.id === featureId,
          );
          feature?.dependencies?.forEach((dep: string) => next.add(dep));
          if (
            feature?.requiredAgent &&
            !calcAgents.has(feature.requiredAgent)
          ) {
            setCalcAgents((sa) => {
              const na = new Set(sa);
              na.add(feature.requiredAgent);
              return na;
            });
          }
        }
        return next;
      });
    },
    [pricingData, calcAgents],
  );

  const resolveDependencies = useCallback(
    (agents: string[], features: string[]) => {
      const baseAgents = new Set(agents);
      const baseFeatures = new Set(features);
      const resolvedAgents = new Set(agents);
      const resolvedFeatures = new Set(features);
      const addedAgents = new Set<string>();
      const addedFeatures = new Set<string>();

      let changed = true;
      while (changed) {
        changed = false;

        for (const agent of Array.from(resolvedAgents)) {
          const deps = AGENT_DEPENDENCIES[agent] || [];
          for (const dep of deps) {
            if (!resolvedAgents.has(dep)) {
              resolvedAgents.add(dep);
              if (!baseAgents.has(dep)) addedAgents.add(dep);
              changed = true;
            }
          }

          const requiredFeatures = AGENT_FEATURE_MAP[agent] || [];
          for (const feature of requiredFeatures) {
            if (!resolvedFeatures.has(feature)) {
              resolvedFeatures.add(feature);
              if (!baseFeatures.has(feature)) addedFeatures.add(feature);
              changed = true;
            }
          }
        }

        for (const feature of Array.from(resolvedFeatures)) {
          const deps = FEATURE_DEPENDENCIES[feature] || [];
          for (const dep of deps) {
            if (!resolvedFeatures.has(dep)) {
              resolvedFeatures.add(dep);
              if (!baseFeatures.has(dep)) addedFeatures.add(dep);
              changed = true;
            }
          }

          const requiredAgent = FEATURE_AGENT_MAP[feature];
          if (requiredAgent && !resolvedAgents.has(requiredAgent)) {
            resolvedAgents.add(requiredAgent);
            if (!baseAgents.has(requiredAgent)) addedAgents.add(requiredAgent);
            changed = true;
          }
        }
      }

      return {
        agents: Array.from(resolvedAgents),
        features: Array.from(resolvedFeatures),
        addedAgents: Array.from(addedAgents),
        addedFeatures: Array.from(addedFeatures),
      };
    },
    [],
  );

  const dependencyLocks = useMemo(() => {
    const lockedAgents = new Set<string>();
    const lockedFeatures = new Set<string>();

    for (const agent of customAgents) {
      const deps = AGENT_DEPENDENCIES[agent] || [];
      deps.forEach((dep) => lockedAgents.add(dep));
      const requiredFeatures = AGENT_FEATURE_MAP[agent] || [];
      requiredFeatures.forEach((feature) => lockedFeatures.add(feature));
    }

    for (const feature of customFeatures) {
      const deps = FEATURE_DEPENDENCIES[feature] || [];
      deps.forEach((dep) => lockedFeatures.add(dep));
      const requiredAgent = FEATURE_AGENT_MAP[feature];
      if (requiredAgent) lockedAgents.add(requiredAgent);
    }

    return { lockedAgents, lockedFeatures };
  }, [customAgents, customFeatures]);

  const agentCatalog = useMemo(() => {
    return Object.entries(AGENT_META).map(([key, meta]) => {
      const includedPlanKey = PLAN_ORDER.find((planKey) =>
        displayedPlans[
          planKey as keyof typeof displayedPlans
        ]?.agents?.includes(key),
      );
      const includedPlan = includedPlanKey
        ? displayedPlans[includedPlanKey as keyof typeof displayedPlans]
        : null;
      // Use API data for coming soon status if available
      const apiAgent = catalogData?.agents?.find((a) => a.id === key);
      const comingSoon = apiAgent
        ? apiAgent.status === "coming_soon"
        : isComingSoonAgent(key);
      return {
        key,
        meta,
        includedPlanKey,
        includedPlan,
        features: AGENT_CAPABILITY_MAP[key] || [],
        comingSoon,
        eta: apiAgent?.eta,
      };
    });
  }, [displayedPlans, catalogData]);

  const fetchPlan = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [me, billingSummary, plans, offers, catalog] = await Promise.all([
        merchantApi.getMe(apiKey),
        merchantApi
          .getBillingSummary(apiKey)
          .catch(() => ({ status: "NOT_CONFIGURED", subscription: null })),
        merchantApi.getBillingPlans(apiKey).catch(() => ({ plans: [] })),
        merchantApi.getBillingOffers(apiKey).catch(() => ({ offers: [] })),
        merchantApi.getEntitlementsCatalog(apiKey).catch(() => null),
      ]);

      setBillingPlans(plans.plans || []);
      setBillingOffers(offers.offers || []);

      // Set catalog data from API
      if (catalog) {
        setCatalogData({
          agents: catalog.agents,
          features: catalog.features,
        });
      }

      if (billingSummary?.subscription) {
        const sub = billingSummary.subscription;
        const currentPlan = normalizePlanCode(
          sub.plan_code || me.plan || "STARTER",
        );
        const planDefaults =
          PLANS[currentPlan as keyof typeof PLANS] || PLANS.STARTER;
        const subAgents = normalizeCodeArray(sub.agents, KNOWN_AGENT_CODES);
        const subFeatures = normalizeCodeArray(
          sub.features,
          KNOWN_FEATURE_CODES,
        );
        const meAgents = normalizeCodeArray(
          me.enabledAgents,
          KNOWN_AGENT_CODES,
        );
        const meFeatures = normalizeCodeArray(
          (me as any).enabledFeatures,
          KNOWN_FEATURE_CODES,
        );
        setMerchantPlan({
          currentPlan,
          enabledAgents: Array.from(
            new Set([...planDefaults.agents, ...meAgents, ...subAgents]),
          ),
          enabledFeatures: Array.from(
            new Set([...planDefaults.features, ...meFeatures, ...subFeatures]),
          ),
          limits: normalizeMerchantLimits(sub.limits, {
            messagesPerMonth: planDefaults.limits.messagesPerMonth,
            messagesUsed: 0,
            whatsappNumbers: planDefaults.limits.whatsappNumbers,
            teamMembers: planDefaults.limits.teamMembers,
          }),
          billingCycle: sub.billing_period || "monthly",
          nextBillingDate: sub.current_period_end || "غير محدد",
        });
      } else {
        const currentPlan = normalizePlanCode(me.plan || "STARTER");
        const planDefaults =
          PLANS[currentPlan as keyof typeof PLANS] || PLANS.STARTER;
        const meAgents = normalizeCodeArray(
          me.enabledAgents,
          KNOWN_AGENT_CODES,
        );
        const meFeatures = normalizeCodeArray(
          (me as any).enabledFeatures,
          KNOWN_FEATURE_CODES,
        );
        setMerchantPlan({
          currentPlan,
          enabledAgents: Array.from(
            new Set([...planDefaults.agents, ...meAgents]),
          ),
          enabledFeatures: Array.from(
            new Set([
              ...planDefaults.features,
              ...meFeatures,
              ...mapFeatureFlagsToCodes(me.features || {}),
            ]),
          ),
          limits: normalizeMerchantLimits(null, {
            messagesPerMonth: planDefaults.limits.messagesPerMonth,
            messagesUsed: 0,
            whatsappNumbers: planDefaults.limits.whatsappNumbers,
            teamMembers: planDefaults.limits.teamMembers,
          }),
          billingCycle: "monthly",
          nextBillingDate: "غير محدد",
        });
      }
    } catch (err) {
      console.error("Failed to load plan:", err);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات الخطة",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [apiKey, toast]);

  const fetchQuotes = useCallback(async () => {
    if (!apiKey) return;
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const res = await merchantApi.getQuotes(apiKey);
      setQuoteRequests(res.quotes || []);
    } catch (err: any) {
      setQuotesError(err.message || "فشل في تحميل عروض السعر");
    } finally {
      setQuotesLoading(false);
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    if (!merchantPlan || customInitialized) return;
    const planKey = (merchantPlan.currentPlan ||
      "STARTER") as keyof typeof displayedPlans;
    const basePlan = displayedPlans[planKey] || displayedPlans.STARTER;
    const baseAgents = merchantPlan.enabledAgents?.length
      ? merchantPlan.enabledAgents
      : basePlan.agents;
    const baseFeatures = merchantPlan.enabledFeatures?.length
      ? merchantPlan.enabledFeatures
      : basePlan.features;

    const resolved = resolveDependencies(baseAgents, baseFeatures);
    setCustomAgents(resolved.agents);
    setCustomFeatures(resolved.features);
    setCustomLimits({
      messagesPerMonth:
        merchantPlan.limits?.messagesPerMonth > 0
          ? String(merchantPlan.limits.messagesPerMonth)
          : "",
      whatsappNumbers:
        merchantPlan.limits?.whatsappNumbers > 0
          ? String(merchantPlan.limits.whatsappNumbers)
          : "",
      teamMembers:
        merchantPlan.limits?.teamMembers > 0
          ? String(merchantPlan.limits.teamMembers)
          : "",
    });
    setCustomInitialized(true);
  }, [merchantPlan, displayedPlans, customInitialized, resolveDependencies]);

  const handleUpgrade = (planKey: string) => {
    setSelectedPlan(planKey);
    setShowUpgradeDialog(true);
  };

  const confirmUpgrade = async () => {
    if (!selectedPlan) return;
    try {
      const checkout = await merchantApi.createBillingCheckout(
        apiKey,
        selectedPlan,
      );
      toast({
        title: "تم إنشاء الطلب",
        description:
          checkout.message || "سيتم التواصل معك لإتمام عملية الترقية",
      });
      setShowUpgradeDialog(false);
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في طلب الترقية. يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    }
  };

  const isFeatureEnabled = (feature: string) => {
    return (
      merchantPlan?.enabledFeatures.includes(feature) ||
      merchantPlan?.enabledFeatures.includes(feature.toLowerCase())
    );
  };

  const isAgentEnabled = (agent: string) => {
    return merchantPlan?.enabledAgents.includes(agent);
  };

  const applyCustomSelection = (agents: string[], features: string[]) => {
    const resolved = resolveDependencies(agents, features);
    setCustomAgents(resolved.agents);
    setCustomFeatures(resolved.features);

    if (resolved.addedAgents.length || resolved.addedFeatures.length) {
      const noticeParts: string[] = [];
      if (resolved.addedAgents.length) {
        noticeParts.push(
          `تم تفعيل وكلاء مطلوبين: ${formatAgentNames(resolved.addedAgents)}`,
        );
      }
      if (resolved.addedFeatures.length) {
        noticeParts.push(
          `تم تفعيل ميزات مطلوبة: ${formatFeatureNames(resolved.addedFeatures)}`,
        );
      }
      setDependencyNotice(noticeParts.join(" • "));
    } else {
      setDependencyNotice(null);
    }
    return resolved;
  };

  const toggleAgent = (agent: string) => {
    if (isComingSoonAgent(agent)) {
      toast({
        title: "قريباً",
        description: "هذا الوكيل غير متاح حالياً وسيتم إطلاقه قريباً.",
      });
      return;
    }
    const nextAgents = new Set(customAgents);
    const wasEnabled = nextAgents.has(agent);
    const nextFeatures = new Set(customFeatures);
    if (wasEnabled) {
      nextAgents.delete(agent);
      (AGENT_FEATURE_MAP[agent] || []).forEach((feature) =>
        nextFeatures.delete(feature),
      );
    } else {
      nextAgents.add(agent);
    }

    const resolved = applyCustomSelection(
      Array.from(nextAgents),
      Array.from(nextFeatures),
    );
    if (
      wasEnabled &&
      resolved.agents.includes(agent) &&
      !nextAgents.has(agent)
    ) {
      toast({
        title: "مطلوب",
        description: "لا يمكن إيقاف هذا الوكيل لأنه مطلوب لميزات أخرى.",
        variant: "destructive",
      });
    }
  };

  const toggleFeature = (feature: string) => {
    if (isComingSoonFeature(feature)) {
      toast({
        title: "قريباً",
        description: "هذه الميزة غير متاحة حالياً وسيتم إطلاقها قريباً.",
      });
      return;
    }
    const nextFeatures = new Set(customFeatures);
    const wasEnabled = nextFeatures.has(feature);
    if (wasEnabled) {
      nextFeatures.delete(feature);
    } else {
      nextFeatures.add(feature);
    }

    const resolved = applyCustomSelection(
      customAgents,
      Array.from(nextFeatures),
    );
    if (
      wasEnabled &&
      resolved.features.includes(feature) &&
      !nextFeatures.has(feature)
    ) {
      toast({
        title: "مطلوب",
        description: "لا يمكن إيقاف هذه الميزة لأنها مطلوبة لميزات أخرى.",
        variant: "destructive",
      });
    }
  };

  const handleRequestQuote = async () => {
    if (!apiKey) return;
    if (!customAgents.length && !customFeatures.length) {
      toast({
        title: "اختر ميزات",
        description: "حدد الوكلاء أو الميزات المطلوبة أولاً.",
        variant: "destructive",
      });
      return;
    }

    setQuoteSending(true);
    try {
      const limits = {
        messagesPerMonth: customLimits.messagesPerMonth
          ? Number(customLimits.messagesPerMonth)
          : null,
        whatsappNumbers: customLimits.whatsappNumbers
          ? Number(customLimits.whatsappNumbers)
          : null,
        teamMembers: customLimits.teamMembers
          ? Number(customLimits.teamMembers)
          : null,
      };

      const descriptionLines = [
        "طلب عرض سعر لباقة مخصصة.",
        `الوكلاء: ${formatAgentNames(customAgents) || "—"}`,
        `الميزات: ${formatFeatureNames(customFeatures) || "—"}`,
        `الحدود المتوقعة: رسائل=${limits.messagesPerMonth ?? "غير محدد"}، أرقام واتساب=${limits.whatsappNumbers ?? "غير محدد"}، أعضاء فريق=${limits.teamMembers ?? "غير محدد"}`,
      ];

      if (customNotes.trim()) {
        descriptionLines.push(`ملاحظات: ${customNotes.trim()}`);
      }

      await merchantApi.createFeatureRequest(merchantId, apiKey, {
        title: "طلب باقة مخصصة",
        description: descriptionLines.join("\n"),
        category: "QUOTE",
        priority: "MEDIUM",
        metadata: {
          quote: {
            agents: customAgents,
            features: customFeatures,
            limits,
            currentPlan: merchantPlan?.currentPlan || "STARTER",
          },
        },
      });

      toast({
        title: "تم إرسال الطلب",
        description: "سيقوم فريقنا بمراجعة طلبك والتواصل معك قريباً.",
      });
      setCustomNotes("");
    } catch (error) {
      toast({
        title: "خطأ",
        description: "تعذر إرسال طلب عرض السعر. حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setQuoteSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="خطتي والأسعار" description="إدارة اشتراكك وميزاتك" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const currentPlanData =
    displayedPlans[merchantPlan?.currentPlan as keyof typeof displayedPlans] ||
    displayedPlans.STARTER;
  const currentUsageLimits = normalizePlanLimits(
    merchantPlan?.limits,
    currentPlanData.limits,
  );
  const usagePercent = merchantPlan
    ? currentUsageLimits.messagesPerMonth > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (currentUsageLimits.messagesUsed /
              currentUsageLimits.messagesPerMonth) *
              100,
          ),
        )
      : 0
    : 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="خطتي والأسعار"
        description="عرض وإدارة خطتك الحالية والأسعار والميزات المفعّلة"
      />

      <AiInsightsCard
        insights={generatePlanInsights({
          currentPlan: merchantPlan?.currentPlan ?? "STARTER",
          usagePercent: usagePercent ?? 0,
        })}
      />

      {merchantPlan?.currentPlan === "TRIAL" && (
        <AlertBanner
          type="warning"
          title="أنت على الباقة التجريبية"
          message="مدة التجربة المجانية 14 يوم — اشترك في باقة مدفوعة للاستمرار بدون انقطاع"
        />
      )}

      {billingOffers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader>
            <CardTitle>عروض حالية</CardTitle>
            <CardDescription>
              خصومات متاحة على الاشتراكات خلال فترة محدودة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {billingOffers.map((offer) => {
              const discountLabel =
                offer.discount_type === "AMOUNT"
                  ? `${offer.discount_value} ${offer.currency || "EGP"}`
                  : `${offer.discount_value}%`;
              return (
                <div
                  key={offer.id}
                  className="flex items-center justify-between rounded border bg-white/70 p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {offer.name_ar || offer.name}
                    </div>
                    <div className="text-muted-foreground">
                      خصم {discountLabel} •{" "}
                      {offer.applies_to_plan || "جميع الخطط"}
                    </div>
                  </div>
                  {offer.ends_at && (
                    <Badge variant="outline">
                      ينتهي{" "}
                      {new Date(offer.ends_at).toLocaleDateString("ar-SA")}
                    </Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Current Plan Overview */}
      <Card
        className={cn(
          "border-2 overflow-hidden",
          "popular" in currentPlanData &&
            currentPlanData.popular &&
            "border-primary-500",
        )}
      >
        <div className={cn("h-2 bg-gradient-to-r", currentPlanData.color)} />
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "p-3 rounded-lg bg-gradient-to-br",
                  currentPlanData.color,
                  "text-white",
                )}
              >
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  خطة {currentPlanData.nameAr}
                  {"popular" in currentPlanData && currentPlanData.popular && (
                    <Badge className="bg-primary-100 text-primary-700">
                      الأكثر شعبية
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{currentPlanData.description}</CardDescription>
              </div>
            </div>
            <div className="text-end">
              {currentPlanData.price ? (
                <>
                  <div className="text-3xl font-bold">
                    {currentPlanData.price} {currentPlanData.currency}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {currentPlanData.period}
                  </div>
                </>
              ) : (
                <div className="text-xl font-bold">مخصص</div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Usage Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  الرسائل الشهرية
                </span>
                <span className="text-sm font-medium">
                  {currentUsageLimits.messagesUsed?.toLocaleString()} /{" "}
                  {currentUsageLimits.messagesPerMonth === -1
                    ? "∞"
                    : currentUsageLimits.messagesPerMonth?.toLocaleString()}
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" />
              {usagePercent > 80 && (
                <p className="text-xs text-amber-600 mt-1">
                  اقتربت من الحد الأقصى
                </p>
              )}
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">
                أرقام واتساب
              </div>
              <div className="text-2xl font-bold">
                {currentUsageLimits.whatsappNumbers === -1
                  ? "∞"
                  : currentUsageLimits.whatsappNumbers}
              </div>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">
                أعضاء الفريق
              </div>
              <div className="text-2xl font-bold">
                {currentUsageLimits.teamMembers === -1
                  ? "∞"
                  : currentUsageLimits.teamMembers}
              </div>
            </div>
          </div>

          {/* Enabled Agents */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Bot className="h-5 w-5" />
              الوكلاء المفعّلون
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(AGENT_META).map(([key, meta]) => {
                const comingSoon = isComingSoonAgent(key);
                const enabled = isAgentEnabled(key) && !comingSoon;
                return (
                  <div
                    key={key}
                    className={cn(
                      "p-3 rounded-lg border flex items-center gap-3 transition-colors",
                      enabled
                        ? "bg-green-50 border-green-200"
                        : "bg-muted/30 opacity-50",
                    )}
                  >
                    <div
                      className={cn(
                        "p-2 rounded-md",
                        enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <meta.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {meta.nameAr}
                      </div>
                    </div>
                    {comingSoon && <Badge variant="secondary">قريباً</Badge>}
                    {!comingSoon &&
                      (enabled ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Enabled Features */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5" />
                الميزات المفعّلة
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedFeatures(!expandedFeatures)}
              >
                {expandedFeatures ? (
                  <>
                    طي <ChevronUp className="h-4 w-4 mr-1" />
                  </>
                ) : (
                  <>
                    عرض الكل <ChevronDown className="h-4 w-4 mr-1" />
                  </>
                )}
              </Button>
            </div>
            <div
              className={cn(
                "grid grid-cols-2 md:grid-cols-4 gap-2",
                !expandedFeatures && "max-h-[120px] overflow-hidden",
              )}
            >
              {Object.entries(FEATURE_META).map(([key, meta]) => {
                const comingSoon = isComingSoonFeature(key);
                const enabled = isFeatureEnabled(key) && !comingSoon;
                return (
                  <div
                    key={key}
                    className={cn(
                      "p-2 rounded-md border flex items-center gap-2 text-sm",
                      enabled
                        ? "bg-primary-50 border-primary-200"
                        : "bg-muted/30 opacity-50",
                    )}
                  >
                    <meta.icon
                      className={cn(
                        "h-4 w-4",
                        enabled ? "text-primary-600" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{meta.nameAr}</span>
                    {comingSoon && <Badge variant="secondary">قريباً</Badge>}
                    {!comingSoon &&
                      (enabled ? (
                        <Check className="h-3 w-3 text-primary-600 mr-auto" />
                      ) : (
                        <Lock className="h-3 w-3 text-muted-foreground mr-auto" />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-xl font-bold mb-4">ترقية خطتك</h2>

        {/* AI Usage Explainer */}
        <Card className="mb-6 border-purple-200 bg-gradient-to-r from-purple-50/50 to-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              ماذا يعني &quot;أمر ذكاء&quot;؟ — شرح استخدام الذكاء الاصطناعي
            </CardTitle>
            <CardDescription className="text-xs">
              كل خطة تشمل أوامر ذكاء يومية. الجدول التالي يوضح تكلفتنا الحقيقية
              لتقديم كل ميزة — وهي مشمولة بالكامل داخل اشتراكك.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white rounded-lg border space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  💬 محادثة واتساب ذكية
                </div>
                <div className="text-muted-foreground">
                  رد تلقائي على العميل = 2-3 أوامر
                </div>
                <div className="text-purple-600 font-medium">
                  تكلفتنا: ~0.15 جنيه • مشمولة
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  🎙️ رسالة صوتية
                </div>
                <div className="text-muted-foreground">
                  تحويل الصوت لنص + فهم = 2 أمر
                </div>
                <div className="text-purple-600 font-medium">
                  تكلفتنا: ~0.15 جنيه • مشمولة
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  📸 الرؤية البصرية / OCR
                </div>
                <div className="text-muted-foreground">
                  تحليل إيصال أو صورة منتج = 1 أمر
                </div>
                <div className="text-purple-600 font-medium">
                  تكلفتنا: ~0.75 جنيه • مشمولة
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  🤖 مساعد الكوبايلوت (لوحة التحكم)
                </div>
                <div className="text-muted-foreground">
                  سؤال نصي أو صوتي = 1-2 أمر
                </div>
                <div className="text-purple-600 font-medium">
                  تكلفتنا: ~0.05 جنيه • مشمولة
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  ⚡ أزرار الإجراء الذكية
                </div>
                <div className="text-muted-foreground">
                  تأكيد طلب، رد سريع = 1 أمر
                </div>
                <div className="text-purple-600 font-medium">
                  تكلفتنا: ~0.05 جنيه • مشمولة
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  📍 روابط خريطة + تقارير
                </div>
                <div className="text-muted-foreground">
                  معالجة موقع أو تلخيص تقرير = 1 أمر
                </div>
                <div className="text-purple-600 font-medium">
                  تكلفتنا: ~0.05 جنيه • مشمولة
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              💡 هذه تكاليفنا الفعلية لمعالجة الذكاء الاصطناعي — كلها{" "}
              <strong>مشمولة في اشتراكك الشهري</strong> بدون رسوم إضافية.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(displayedPlans).map(([key, plan]) => {
            const isCurrent = merchantPlan?.currentPlan === key;
            const isDowngrade =
              Object.keys(displayedPlans).indexOf(key) <
              Object.keys(displayedPlans).indexOf(
                merchantPlan?.currentPlan || "STARTER",
              );
            const fallbackLimits =
              PLANS[key as keyof typeof PLANS]?.limits || PLANS.STARTER.limits;
            const safePlanLimits = normalizePlanLimits(
              plan?.limits,
              fallbackLimits,
            );

            return (
              <Card
                key={key}
                className={cn(
                  "relative overflow-hidden transition-all hover:shadow-lg",
                  isCurrent && "ring-2 ring-primary-500",
                  "popular" in plan && plan.popular && "border-primary-300",
                )}
              >
                {"popular" in plan && plan.popular && (
                  <div className="absolute top-0 left-0 right-0 bg-primary-500 text-white text-xs text-center py-1">
                    الأكثر شعبية
                  </div>
                )}
                <div className={cn("h-1 bg-gradient-to-r", plan.color)} />
                <CardHeader
                  className={cn("popular" in plan && plan.popular && "pt-8")}
                >
                  <CardTitle>{plan.nameAr}</CardTitle>
                  <CardDescription className="text-xs">
                    {plan.description}
                  </CardDescription>
                  <div className="mt-2">
                    {plan.price ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">{plan.price}</span>
                        <span className="text-sm text-muted-foreground">
                          {plan.currency}/{plan.period}
                        </span>
                      </div>
                    ) : (
                      <div className="text-lg font-bold">تواصل معنا</div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      الوكلاء:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {plan.agents.map((agent) => (
                        <Badge
                          key={agent}
                          variant={
                            isComingSoonAgent(agent) ? "outline" : "secondary"
                          }
                          className={cn(
                            "text-xs",
                            isComingSoonAgent(agent) &&
                              "border-amber-300 text-amber-700",
                          )}
                        >
                          {AGENT_META[agent]?.nameAr || agent}
                          {isComingSoonAgent(agent) && " • قريباً"}
                        </Badge>
                      ))}
                    </div>
                    {plan.agents.some((agent) => isComingSoonAgent(agent)) && (
                      <div className="text-[11px] text-amber-700">
                        بعض الوكلاء ضمن هذه الخطة قادمون قريباً ولن يتم تفعيلهم
                        الآن.
                      </div>
                    )}
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      {safePlanLimits.messagesPerMonth === -1
                        ? "رسائل غير محدودة"
                        : `${safePlanLimits.messagesPerMonth.toLocaleString()} رسالة/شهر`}
                    </div>
                    <div className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      {safePlanLimits.aiCallsPerDay === -1
                        ? "أوامر ذكاء غير محدودة"
                        : `${safePlanLimits.aiCallsPerDay} أمر ذكاء/يوم`}
                    </div>
                    <div className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      {safePlanLimits.whatsappNumbers === -1
                        ? "أرقام غير محدودة"
                        : `${safePlanLimits.whatsappNumbers} رقم واتساب`}
                    </div>
                    <div className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      {safePlanLimits.teamMembers === -1
                        ? "فريق غير محدود"
                        : `${safePlanLimits.teamMembers} أعضاء فريق`}
                    </div>
                    {plan.aiHighlights && (
                      <div className="mt-2 pt-2 border-t border-muted">
                        <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          يشمل الذكاء الاصطناعي:
                        </div>
                        {plan.aiHighlights.map((h: string, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground"
                          >
                            <Sparkles className="h-2.5 w-2.5 text-purple-500" />
                            {h}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    variant={
                      isCurrent ? "outline" : isDowngrade ? "ghost" : "default"
                    }
                    disabled={isCurrent || !canEdit}
                    onClick={() => handleUpgrade(key)}
                  >
                    {isCurrent
                      ? "خطتك الحالية"
                      : isDowngrade
                        ? "تخفيض"
                        : "ترقية"}
                    {!isCurrent && !isDowngrade && (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Agent Pricing Catalog */}
      <div>
        <h2 className="text-xl font-bold mb-4">كتالوج الوكلاء والتسعير</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentCatalog.map(
            ({
              key,
              meta,
              includedPlan,
              includedPlanKey,
              features,
              comingSoon,
            }) => {
              const isSelected = customAgents.includes(key);
              return (
                <Card
                  key={key}
                  className={cn(
                    "border",
                    isSelected && "border-primary-300 shadow-sm",
                  )}
                >
                  <CardHeader className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-md bg-muted">
                        <meta.icon className="h-4 w-4 text-primary-600" />
                      </div>
                      <div className="font-semibold">{meta.nameAr}</div>
                      {comingSoon && <Badge variant="secondary">قريباً</Badge>}
                      {!comingSoon && isSelected && (
                        <Badge variant="secondary">مضاف</Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs">
                      {meta.descriptionAr}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between text-muted-foreground text-xs">
                      <span>متاح ابتداءً من</span>
                      {includedPlan ? (
                        <Badge variant="outline">
                          {includedPlan.nameAr}
                          {includedPlan.price
                            ? ` • ${includedPlan.price} ${includedPlan.currency}`
                            : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline">تسعير مخصص</Badge>
                      )}
                    </div>
                    {features.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        الميزات الأساسية: {formatFeatureNames(features)}
                      </div>
                    )}
                    <Button
                      variant={isSelected ? "outline" : "default"}
                      size="sm"
                      className="w-full"
                      onClick={() => toggleAgent(key)}
                      disabled={
                        dependencyLocks.lockedAgents.has(key) || comingSoon
                      }
                    >
                      {comingSoon
                        ? "قريباً"
                        : isSelected
                          ? "إزالة من الباقة"
                          : "أضف للباقة المخصصة"}
                    </Button>
                  </CardContent>
                </Card>
              );
            },
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          الأسعار النهائية تعتمد على الاستخدام والحدود المطلوبة. يمكنك طلب عرض
          سعر مخصص أدناه.
        </p>
      </div>

      {/* Pricing Calculator */}
      {pricingData && (
        <div id="calculator">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            حاسبة الأسعار
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            اختر الميزات والوكلاء اللي تحتاجهم وشوف السعر مباشرة — بدون انتظار
            أحد
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: selections */}
            <div className="lg:col-span-2 space-y-4">
              {/* Agent selection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    الوكلاء الذكية
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(pricingData.agents || []).map((agent: any) => {
                    const isSelected = calcAgents.has(agent.id);
                    const isCore = agent.id === "OPS_AGENT";
                    const isComingSoon = agent.status === "coming_soon";
                    return (
                      <div
                        key={agent.id}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg border text-sm transition-colors cursor-pointer",
                          isSelected
                            ? "bg-primary/5 border-primary/50"
                            : "bg-background hover:bg-muted/50",
                          isComingSoon && "opacity-50",
                        )}
                        onClick={() =>
                          !isComingSoon && toggleCalcAgent(agent.id)
                        }
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isCore || isComingSoon}
                        />
                        <span className="flex-1">{agent.nameAr}</span>
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
                        <span className="font-semibold text-xs">
                          {agent.price} جنيه
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Feature selection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    الميزات الإضافية
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(pricingData.features || []).map((feature: any) => {
                      const isSelected = calcFeatures.has(feature.id);
                      const isComingSoon = feature.status === "coming_soon";
                      const includedByAgent = (pricingData.agents || []).some(
                        (a: any) =>
                          calcAgents.has(a.id) &&
                          a.features?.includes(feature.id),
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
                            toggleCalcFeature(feature.id)
                          }
                        >
                          <Checkbox
                            checked={isSelected || includedByAgent}
                            disabled={includedByAgent || isComingSoon}
                          />
                          <span className="flex-1 text-xs">
                            {feature.nameAr}
                          </span>
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

              {/* Usage tiers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pricingData.aiUsageTiers && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs flex items-center gap-2">
                        <Sparkles className="h-3 w-3" />
                        باقة الذكاء الاصطناعي
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Select value={calcAiTier} onValueChange={setCalcAiTier}>
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(pricingData.aiUsageTiers).map(
                            ([key, tier]: [string, any]) => (
                              <SelectItem key={key} value={key}>
                                {tier.label} —{" "}
                                {tier.aiCallsPerDay === -1
                                  ? "بلا حدود"
                                  : `${tier.aiCallsPerDay} أمر/يوم`}
                                {tier.price > 0 ? ` (+${tier.price} جنيه)` : ""}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )}
                {pricingData.messageTiers && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs flex items-center gap-2">
                        <MessageSquare className="h-3 w-3" />
                        حجم الرسائل
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Select
                        value={calcMessageTier}
                        onValueChange={setCalcMessageTier}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(pricingData.messageTiers).map(
                            ([key, tier]: [string, any]) => (
                              <SelectItem key={key} value={key}>
                                {tier.label}
                                {tier.price > 0 ? ` (+${tier.price} جنيه)` : ""}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Right: Price summary */}
            <div>
              <Card className="border-2 border-primary/50 shadow-lg sticky top-4">
                <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    ملخص السعر
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {calcResult ? (
                    <>
                      <div className="space-y-2">
                        {calcResult.breakdown.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {item.nameAr}
                            </span>
                            <span className="font-medium">
                              {item.price} جنيه
                            </span>
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
                      {calcResult.recommendedPlan &&
                        calcResult.savingsVsCustom > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                              <Crown className="h-4 w-4" />
                              وفّر {calcResult.savingsVsCustom} جنيه/شهر!
                            </div>
                            <p className="text-xs text-green-600 mt-1">
                              باقة{" "}
                              {calcResult.recommendedPlan === "STARTER"
                                ? "المبتدئ"
                                : calcResult.recommendedPlan === "GROWTH"
                                  ? "النمو"
                                  : calcResult.recommendedPlan === "PRO"
                                    ? "الاحترافي"
                                    : calcResult.recommendedPlan}{" "}
                              تشمل كل اللي اخترته بسعر{" "}
                              {calcResult.recommendedPlanPrice} جنيه بس
                            </p>
                            <Button
                              size="sm"
                              className="w-full mt-2 bg-green-600 hover:bg-green-700"
                              onClick={() =>
                                handleUpgrade(calcResult.recommendedPlan!)
                              }
                            >
                              <Check className="h-4 w-4 ml-1" />
                              اشترك في هذه الباقة
                            </Button>
                          </div>
                        )}
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
            </div>
          </div>
        </div>
      )}

      {/* Custom Package Builder */}
      <Card className="border-2 border-dashed border-primary-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary-600" />
            صمم باقتك الخاصة
          </CardTitle>
          <CardDescription>
            اختر الوكلاء والميزات التي تحتاجها. سنقوم بتفعيل المتطلبات تلقائياً
            وإرسال طلب عرض السعر للفريق.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {dependencyNotice && (
            <AlertBanner type="warning" message={dependencyNotice} />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold">الوكلاء</h4>
              <div className="space-y-2">
                {Object.entries(AGENT_META).map(([key, meta]) => {
                  const checked = customAgents.includes(key);
                  const locked = dependencyLocks.lockedAgents.has(key);
                  const comingSoon = isComingSoonAgent(key);
                  const deps = AGENT_DEPENDENCIES[key] || [];
                  return (
                    <label
                      key={key}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-3 transition-colors",
                        checked
                          ? "bg-primary-50 border-primary-200"
                          : "bg-muted/30",
                        (locked || comingSoon) && "opacity-70",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleAgent(key)}
                        disabled={locked || comingSoon}
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <meta.icon className="h-4 w-4 text-primary-600" />
                          <span className="font-medium">{meta.nameAr}</span>
                          {locked && <Badge variant="secondary">مطلوب</Badge>}
                          {comingSoon && (
                            <Badge variant="secondary">قريباً</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {meta.descriptionAr}
                        </p>
                        {deps.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            يعتمد على: {formatAgentNames(deps)}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold">الميزات</h4>
              <div className="space-y-2">
                {Object.entries(FEATURE_META).map(([key, meta]) => {
                  const checked = customFeatures.includes(key);
                  const locked = dependencyLocks.lockedFeatures.has(key);
                  const comingSoon = isComingSoonFeature(key);
                  const deps = FEATURE_DEPENDENCIES[key] || [];
                  const requiredAgent = FEATURE_AGENT_MAP[key];
                  return (
                    <label
                      key={key}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-3 transition-colors",
                        checked
                          ? "bg-primary-50 border-primary-200"
                          : "bg-muted/30",
                        (locked || comingSoon) && "opacity-70",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleFeature(key)}
                        disabled={locked || comingSoon}
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <meta.icon className="h-4 w-4 text-primary-600" />
                          <span className="font-medium">{meta.nameAr}</span>
                          {locked && <Badge variant="secondary">مطلوب</Badge>}
                          {comingSoon && (
                            <Badge variant="secondary">قريباً</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {meta.descriptionAr}
                        </p>
                        {(deps.length > 0 || requiredAgent) && (
                          <p className="text-xs text-muted-foreground">
                            {deps.length > 0 &&
                              `يعتمد على: ${formatFeatureNames(deps)}`}
                            {deps.length > 0 && requiredAgent ? " • " : ""}
                            {requiredAgent
                              ? `يتطلب: ${AGENT_META[requiredAgent]?.nameAr || requiredAgent}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>الرسائل الشهرية المتوقعة</Label>
              <Input
                type="number"
                min="0"
                placeholder="مثال: 5000"
                value={customLimits.messagesPerMonth}
                onChange={(e) =>
                  setCustomLimits((prev) => ({
                    ...prev,
                    messagesPerMonth: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>أرقام واتساب</Label>
              <Input
                type="number"
                min="0"
                placeholder="مثال: 2"
                value={customLimits.whatsappNumbers}
                onChange={(e) =>
                  setCustomLimits((prev) => ({
                    ...prev,
                    whatsappNumbers: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>أعضاء الفريق</Label>
              <Input
                type="number"
                min="0"
                placeholder="مثال: 5"
                value={customLimits.teamMembers}
                onChange={(e) =>
                  setCustomLimits((prev) => ({
                    ...prev,
                    teamMembers: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>ملاحظات إضافية</Label>
            <Textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="اكتب أي تفاصيل تساعد الفريق في تجهيز عرض السعر..."
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              الملخص: {customAgents.length} وكلاء • {customFeatures.length}{" "}
              ميزات
            </div>
            <Button
              onClick={handleRequestQuote}
              disabled={!canEdit || quoteSending}
            >
              {quoteSending ? "جاري الإرسال..." : "اطلب عرض سعر"}
              <ArrowRight className="h-4 w-4 mr-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quote Requests */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>طلبات عرض السعر</CardTitle>
              <CardDescription>
                تتبع حالة الباقات المخصصة التي طلبتها
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchQuotes}
                disabled={quotesLoading}
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                تحديث
              </Button>
              <Link
                href="/merchant/feature-requests?tab=quotes"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                عرض الكل
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {quotesError && <AlertBanner type="error" message={quotesError} />}
          {!quotesLoading && quoteRequests.length === 0 && (
            <div className="text-sm text-muted-foreground">
              لا توجد طلبات عروض سعر بعد. أنشئ طلباً من قسم الباقة المخصصة
              أعلاه.
            </div>
          )}
          {quoteRequests.slice(0, 3).map((req) => {
            const status = QUOTE_STATUS_LABELS[req.status] || {
              label: req.status,
              variant: "secondary",
            };
            return (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <div className="text-sm font-medium">{req.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {req.updated_at
                      ? new Date(req.updated_at).toLocaleDateString("ar-EG")
                      : ""}
                  </div>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Locked Features CTA */}
      {merchantPlan &&
        !["PRO", "ENTERPRISE"].includes(
          (merchantPlan.currentPlan || "").toUpperCase(),
        ) && (
          <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Lock className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">ميزات مقفلة في خطتك</h3>
                    <p className="text-sm text-muted-foreground">
                      قم بالترقية للوصول إلى المدفوعات، الرؤية البصرية، والمزيد
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleUpgrade("PRO")}
                  disabled={!canEdit}
                >
                  استكشف الخطط
                  <ArrowRight className="h-4 w-4 mr-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              ترقية إلى{" "}
              {selectedPlan &&
                displayedPlans[selectedPlan as keyof typeof displayedPlans]
                  ?.nameAr}
            </DialogTitle>
            <DialogDescription>
              سيتم التواصل معك من فريق المبيعات لإتمام عملية الترقية وتفعيل
              الميزات الجديدة.
            </DialogDescription>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span>الخطة الجديدة</span>
                  <span className="font-bold">
                    {
                      displayedPlans[
                        selectedPlan as keyof typeof displayedPlans
                      ]?.nameAr
                    }
                  </span>
                </div>
                {displayedPlans[selectedPlan as keyof typeof displayedPlans]
                  ?.price && (
                  <div className="flex items-center justify-between">
                    <span>السعر</span>
                    <span className="font-bold">
                      {
                        displayedPlans[
                          selectedPlan as keyof typeof displayedPlans
                        ]?.price
                      }{" "}
                      {
                        displayedPlans[
                          selectedPlan as keyof typeof displayedPlans
                        ]?.currency
                      }
                      /شهر
                    </span>
                  </div>
                )}
              </div>
              <AlertBanner
                type="info"
                message="سيتم إضافة الميزات الجديدة فوراً بعد تأكيد الدفع"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUpgradeDialog(false)}
            >
              إلغاء
            </Button>
            <Button onClick={confirmUpgrade} disabled={!canEdit}>
              تأكيد طلب الترقية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
