"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ElementType,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, AlertBanner } from "@/components/ui/alerts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Search,
  Edit,
  Settings,
  Crown,
  Check,
  X,
  Bot,
  Zap,
  Save,
  AlertTriangle,
  Info,
  Package,
  CreditCard,
  ScanLine,
  BarChart3,
  MessageSquare,
  ShoppingCart,
  Star,
  Bell,
  Shield,
  Webhook,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { portalApi } from "@/lib/client";

// Plan definitions
const DEFAULT_PLANS = [
  "TRIAL",
  "STARTER",
  "CHAT_ONLY",
  "BASIC",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
  "CUSTOM",
] as const;
type PlanType = string;

const PLAN_NAMES: Record<string, string> = {
  TRIAL: "تجريبي",
  STARTER: "المبتدئ",
  CHAT_ONLY: "شات فقط",
  BASIC: "الأساسي",
  GROWTH: "النمو",
  PRO: "الاحترافي",
  ENTERPRISE: "المؤسسات",
  CUSTOM: "مخصص",
};

const PLAN_COLORS: Record<string, string> = {
  TRIAL:
    "border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[var(--text-secondary)]",
  STARTER:
    "border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
  CHAT_ONLY:
    "border border-[var(--border-active)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]",
  BASIC:
    "border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10 text-[var(--text-primary)]",
  GROWTH:
    "border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
  PRO: "border border-[var(--color-brand-primary)]/25 bg-[var(--color-brand-subtle)] text-[var(--color-brand-primary)]",
  ENTERPRISE:
    "border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
  CUSTOM:
    "border border-[var(--border-active)] bg-[var(--bg-surface-2)] text-[var(--text-primary)]",
};

type CatalogAgent = {
  id: string;
  nameAr?: string;
  nameEn?: string;
  implemented?: boolean;
  sellable?: boolean;
  comingSoon?: boolean;
  beta?: boolean;
  subscriptionEnabled?: boolean;
  requiredFeatures?: string[];
  features?: string[];
};

type CatalogFeature = {
  id: string;
  nameAr?: string;
  nameEn?: string;
  requiredAgent?: string;
};

type CatalogPlan = {
  id: string;
  enabledAgents: string[];
  enabledFeatures: string[];
  limits: {
    messagesPerMonth: number;
    whatsappNumbers: number;
    teamMembers: number;
  };
};

const isLiveSellableAgent = (agent: {
  implemented?: boolean;
  sellable?: boolean;
  subscriptionEnabled?: boolean;
}) =>
  agent.implemented !== false &&
  agent.sellable !== false &&
  agent.subscriptionEnabled !== false;

const AGENT_ICON_MAP: Record<string, ElementType> = {
  OPS_AGENT: Bot,
  INVENTORY_AGENT: Package,
  FINANCE_AGENT: CreditCard,
  MARKETING_AGENT: Star,
  SUPPORT_AGENT: Users,
  CONTENT_AGENT: Zap,
  SALES_AGENT: ShoppingCart,
  CREATIVE_AGENT: ScanLine,
};

const FEATURE_ICON_MAP: Record<string, ElementType> = {
  CONVERSATIONS: MessageSquare,
  ORDERS: ShoppingCart,
  CATALOG: Package,
  CASHIER_POS: CreditCard,
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

const FALLBACK_AGENT_NAMES: Record<string, string> = {
  OPS_AGENT: "وكيل العمليات",
  INVENTORY_AGENT: "وكيل المخزون",
  FINANCE_AGENT: "وكيل المالية",
};

const FALLBACK_FEATURE_NAMES: Record<string, string> = {
  CONVERSATIONS: "المحادثات",
  ORDERS: "الطلبات",
  CATALOG: "الكتالوج",
  CASHIER_POS: "الكاشير",
  INVENTORY: "المخزون",
  PAYMENTS: "المدفوعات",
  VISION_OCR: "الرؤية البصرية",
  VOICE_NOTES: "الرسائل الصوتية",
  REPORTS: "التقارير",
  WEBHOOKS: "التكاملات",
  TEAM: "الفريق",
  LOYALTY: "برنامج الولاء",
  NOTIFICATIONS: "الإشعارات",
  AUDIT_LOGS: "سجل التدقيق",
  KPI_DASHBOARD: "مؤشرات الأداء",
  API_ACCESS: "وصول API",
};

// Plan presets
const FALLBACK_PLAN_PRESETS: Record<
  string,
  { agents: string[]; features: string[] }
> = {
  TRIAL: {
    agents: ["OPS_AGENT"],
    features: ["CONVERSATIONS", "ORDERS", "CATALOG"],
  },
  STARTER: {
    agents: ["OPS_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "INVENTORY",
      "PAYMENTS",
      "REPORTS",
      "NOTIFICATIONS",
      "WEBHOOKS",
      "API_ACCESS",
    ],
  },
  CHAT_ONLY: {
    agents: ["OPS_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "INVENTORY",
      "PAYMENTS",
      "REPORTS",
      "NOTIFICATIONS",
      "WEBHOOKS",
      "API_ACCESS",
    ],
  },
  BASIC: {
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "PAYMENTS",
      "VOICE_NOTES",
      "REPORTS",
      "WEBHOOKS",
      "TEAM",
      "LOYALTY",
      "NOTIFICATIONS",
      "AUDIT_LOGS",
      "KPI_DASHBOARD",
      "API_ACCESS",
    ],
  },
  GROWTH: {
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "PAYMENTS",
      "VISION_OCR",
      "VOICE_NOTES",
      "REPORTS",
      "WEBHOOKS",
      "TEAM",
      "LOYALTY",
      "NOTIFICATIONS",
      "AUDIT_LOGS",
      "KPI_DASHBOARD",
      "API_ACCESS",
    ],
  },
  PRO: {
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
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
  },
  ENTERPRISE: {
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "PAYMENTS",
      "VISION_OCR",
      "VOICE_NOTES",
      "REPORTS",
      "WEBHOOKS",
      "TEAM",
      "LOYALTY",
      "NOTIFICATIONS",
      "AUDIT_LOGS",
      "KPI_DASHBOARD",
      "API_ACCESS",
    ],
  },
  CUSTOM: {
    agents: ["OPS_AGENT"],
    features: ["CONVERSATIONS", "ORDERS", "CATALOG"],
  },
};

const AGENT_DEPENDENCIES: Record<string, string[]> = {
  OPS_AGENT: [],
  INVENTORY_AGENT: ["OPS_AGENT"],
  FINANCE_AGENT: ["OPS_AGENT"],
  SALES_AGENT: ["OPS_AGENT"],
  CREATIVE_AGENT: ["OPS_AGENT"],
};

const AGENT_FEATURE_MAP: Record<string, string[]> = {
  OPS_AGENT: ["CONVERSATIONS", "ORDERS", "CATALOG"],
  INVENTORY_AGENT: ["INVENTORY"],
  FINANCE_AGENT: ["PAYMENTS", "REPORTS", "KPI_DASHBOARD"],
  SALES_AGENT: ["LOYALTY"],
  CREATIVE_AGENT: [],
};

const FEATURE_DEPENDENCIES: Record<string, string[]> = {
  CONVERSATIONS: [],
  ORDERS: ["CONVERSATIONS"],
  CATALOG: [],
  CASHIER_POS: ["ORDERS"],
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
  REPORTS: "FINANCE_AGENT",
  LOYALTY: "OPS_AGENT",
  KPI_DASHBOARD: "FINANCE_AGENT",
};

interface Merchant {
  id: string;
  tradeName: string;
  whatsappNumber: string;
  email: string;
  category: string;
  isActive: boolean;
  plan: PlanType;
  enabledAgents: string[];
  enabledFeatures: string[];
  cashierPromoActive?: boolean;
  cashierPromoEndsAt?: string | null;
  cashierEffective?: boolean;
  limits: {
    messagesPerMonth: number;
    whatsappNumbers: number;
    teamMembers: number;
  };
  usage?: {
    messagesUsedMonth: number;
    messagesLimitMonth: number;
    messagesUsagePercent: number | null;
    aiRepliesUsedMonth: number;
    aiRepliesLimitMonth: number;
    aiRepliesUsagePercent: number | null;
    thresholdBand: string;
  };
  createdAt: string;
}

interface MerchantEntitlements {
  plan: PlanType;
  enabledAgents: string[];
  enabledFeatures: string[];
  limits: {
    messagesPerMonth: number;
    whatsappNumbers: number;
    teamMembers: number;
  };
}

export default function AdminEntitlementsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <AdminEntitlementsContent />
    </Suspense>
  );
}

function AdminEntitlementsContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalMerchants, setTotalMerchants] = useState(0);
  const itemsPerPage = 10;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(
    null,
  );
  const [editingEntitlements, setEditingEntitlements] =
    useState<MerchantEntitlements | null>(null);
  const [saving, setSaving] = useState(false);
  const [dependencyNotice, setDependencyNotice] = useState<string | null>(null);
  const [autoOpenHandled, setAutoOpenHandled] = useState(false);
  const [prefillMerchant, setPrefillMerchant] = useState<string | null>(null);
  const [catalogData, setCatalogData] = useState<{
    agents: CatalogAgent[];
    features: CatalogFeature[];
    plans: CatalogPlan[];
    agentDependencies: Record<string, string[]>;
  } | null>(null);

  useEffect(() => {
    const merchantParam = searchParams.get("merchant");
    if (merchantParam) {
      setSearchQuery(merchantParam);
      setCurrentPage(1);
      setPrefillMerchant(merchantParam);
    }
  }, [searchParams]);

  const fetchMerchants = useCallback(async () => {
    try {
      const data = await portalApi.getAdminEntitlements({
        search: searchQuery || undefined,
        plan: planFilter !== "all" ? planFilter : undefined,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      });
      setMerchants(data?.merchants || []);
      setTotalMerchants(data?.total || 0);
    } catch (err) {
      console.error("Failed to fetch entitlements:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, planFilter, currentPage]);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  const fetchCatalog = useCallback(async () => {
    try {
      const data = await portalApi.getEntitlementsCatalog();
      setCatalogData({
        agents: data.agents || [],
        features: data.features || [],
        plans: data.plans || [],
        agentDependencies: data.agentDependencies || {},
      });
    } catch (err) {
      console.error("Failed to fetch entitlements catalog:", err);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const allAgents = useMemo(() => {
    if (catalogData?.agents?.length) {
      const liveAgents = catalogData.agents.filter(isLiveSellableAgent);
      const sourceAgents = liveAgents.length > 0 ? liveAgents : [];
      if (sourceAgents.length > 0) {
        return sourceAgents.map((agent) => ({
          key: agent.id,
          name:
            agent.nameAr ||
            FALLBACK_AGENT_NAMES[agent.id] ||
            agent.nameEn ||
            agent.id,
          icon: AGENT_ICON_MAP[agent.id] || Bot,
          implemented: agent.implemented ?? true,
          sellable: agent.sellable ?? true,
          subscriptionEnabled: agent.subscriptionEnabled ?? true,
        }));
      }
    }

    return Object.entries(FALLBACK_AGENT_NAMES).map(([key, name]) => ({
      key,
      name,
      icon: AGENT_ICON_MAP[key] || Bot,
      implemented: true,
      sellable: true,
      subscriptionEnabled: true,
    }));
  }, [catalogData]);

  const selectableAgentKeys = useMemo(
    () => new Set(allAgents.map((agent) => agent.key)),
    [allAgents],
  );

  const allFeatures = useMemo(() => {
    if (catalogData?.features?.length) {
      return catalogData.features.map((feature) => ({
        key: feature.id,
        name:
          feature.nameAr ||
          FALLBACK_FEATURE_NAMES[feature.id] ||
          feature.nameEn ||
          feature.id,
        icon: FEATURE_ICON_MAP[feature.id] || Settings,
      }));
    }

    return Object.entries(FALLBACK_FEATURE_NAMES).map(([key, name]) => ({
      key,
      name,
      icon: FEATURE_ICON_MAP[key] || Settings,
    }));
  }, [catalogData]);

  const plans = useMemo(
    () =>
      catalogData?.plans?.length
        ? catalogData.plans.map((plan) => String(plan.id).toUpperCase())
        : [...DEFAULT_PLANS],
    [catalogData],
  );

  const planPresets = useMemo(() => {
    if (catalogData?.plans?.length) {
      return Object.fromEntries(
        catalogData.plans.map((plan) => [
          String(plan.id).toUpperCase(),
          {
            agents: (plan.enabledAgents || []).filter((agent) =>
              selectableAgentKeys.has(agent),
            ),
            features: plan.enabledFeatures || [],
          },
        ]),
      ) as Record<string, { agents: string[]; features: string[] }>;
    }

    return Object.fromEntries(
      Object.entries(FALLBACK_PLAN_PRESETS).map(([plan, preset]) => [
        plan,
        {
          ...preset,
          agents: preset.agents.filter((agent) =>
            selectableAgentKeys.has(agent),
          ),
        },
      ]),
    ) as Record<string, { agents: string[]; features: string[] }>;
  }, [catalogData, selectableAgentKeys]);

  const agentDependencies = useMemo(() => {
    const source =
      catalogData?.agentDependencies &&
      Object.keys(catalogData.agentDependencies).length > 0
        ? catalogData.agentDependencies
        : AGENT_DEPENDENCIES;
    return Object.fromEntries(
      Object.entries(source)
        .filter(([agent]) => selectableAgentKeys.has(agent))
        .map(([agent, deps]) => [
          agent,
          (deps || []).filter((dep) => selectableAgentKeys.has(dep)),
        ]),
    ) as Record<string, string[]>;
  }, [catalogData, selectableAgentKeys]);

  const agentFeatureMap = useMemo(() => {
    if (catalogData?.agents?.length) {
      return Object.fromEntries(
        catalogData.agents
          .filter((agent) => selectableAgentKeys.has(agent.id))
          .map((agent) => [
            agent.id,
            agent.requiredFeatures || agent.features || [],
          ]),
      ) as Record<string, string[]>;
    }

    return AGENT_FEATURE_MAP;
  }, [catalogData, selectableAgentKeys]);

  const featureAgentMap = useMemo(() => {
    const derived: Record<string, string> = { ...FEATURE_AGENT_MAP };

    if (catalogData?.features?.length) {
      for (const feature of catalogData.features) {
        if (
          feature.requiredAgent &&
          selectableAgentKeys.has(feature.requiredAgent)
        ) {
          derived[feature.id] = feature.requiredAgent;
        }
      }
    }

    if (catalogData?.agents?.length) {
      for (const agent of catalogData.agents.filter((entry) =>
        selectableAgentKeys.has(entry.id),
      )) {
        for (const feature of agent.requiredFeatures || agent.features || []) {
          if (!derived[feature]) {
            derived[feature] = agent.id;
          }
        }
      }
    }

    return derived;
  }, [catalogData, selectableAgentKeys]);

  useEffect(() => {
    if (
      autoOpenHandled ||
      loading ||
      !prefillMerchant ||
      merchants.length === 0
    ) {
      return;
    }
    const match = merchants.find(
      (merchant) =>
        merchant.id === prefillMerchant ||
        merchant.email === prefillMerchant ||
        merchant.tradeName?.includes(prefillMerchant),
    );
    if (match) {
      handleEditEntitlements(match);
      setAutoOpenHandled(true);
    }
  }, [autoOpenHandled, loading, prefillMerchant, merchants]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMerchants();
    setRefreshing(false);
  };

  const handleEditEntitlements = (merchant: Merchant) => {
    setSelectedMerchant(merchant);
    setEditingEntitlements({
      plan: merchant.plan,
      enabledAgents: [...merchant.enabledAgents],
      enabledFeatures: [...merchant.enabledFeatures],
      limits: { ...merchant.limits },
    });
    setDependencyNotice(null);
    setShowEditDialog(true);
  };

  const handlePlanChange = (plan: PlanType) => {
    if (!editingEntitlements) return;

    const preset = planPresets[plan] || { agents: [], features: [] };
    setEditingEntitlements({
      ...editingEntitlements,
      plan,
      enabledAgents:
        plan === "CUSTOM"
          ? editingEntitlements.enabledAgents
          : [...preset.agents],
      enabledFeatures:
        plan === "CUSTOM"
          ? editingEntitlements.enabledFeatures
          : [...preset.features],
    });
  };

  const resolveDependencies = (agents: string[], features: string[]) => {
    const resolvedAgents = new Set(agents);
    const resolvedFeatures = new Set(features);

    let changed = true;
    while (changed) {
      changed = false;
      for (const agent of Array.from(resolvedAgents)) {
        const deps = agentDependencies[agent] || [];
        deps.forEach((dep) => {
          if (!resolvedAgents.has(dep)) {
            resolvedAgents.add(dep);
            changed = true;
          }
        });

        const agentFeatures = agentFeatureMap[agent] || [];
        agentFeatures.forEach((feature) => {
          if (!resolvedFeatures.has(feature)) {
            resolvedFeatures.add(feature);
            changed = true;
          }
        });
      }

      for (const feature of Array.from(resolvedFeatures)) {
        const deps = FEATURE_DEPENDENCIES[feature] || [];
        deps.forEach((dep) => {
          if (!resolvedFeatures.has(dep)) {
            resolvedFeatures.add(dep);
            changed = true;
          }
        });
        const requiredAgent = featureAgentMap[feature];
        if (requiredAgent && !resolvedAgents.has(requiredAgent)) {
          resolvedAgents.add(requiredAgent);
          changed = true;
        }
      }
    }

    return {
      enabledAgents: Array.from(resolvedAgents),
      enabledFeatures: Array.from(resolvedFeatures),
    };
  };

  const toggleAgent = (agent: string) => {
    if (!editingEntitlements) return;
    const agentMeta = allAgents.find((entry) => entry.key === agent);
    if (
      !agentMeta ||
      !agentMeta.implemented ||
      !agentMeta.sellable ||
      !agentMeta.subscriptionEnabled
    ) {
      setDependencyNotice("هذا الوكيل غير متاح للاشتراك حالياً");
      return;
    }
    setDependencyNotice(null);

    const isEnabled = editingEntitlements.enabledAgents.includes(agent);
    if (isEnabled) {
      const catalogDependents = Object.entries(agentDependencies)
        .filter(([, deps]) => deps.includes(agent))
        .map(([key]) => key)
        .filter((dep) => editingEntitlements.enabledAgents.includes(dep));
      const dependentsSet = Array.from(new Set(catalogDependents));

      if (dependentsSet.length > 0) {
        const names = dependentsSet
          .map((dep) => allAgents.find((a) => a.key === dep)?.name || dep)
          .join("، ");
        setDependencyNotice(`لا يمكن تعطيل الوكيل لأنه مطلوب لـ: ${names}`);
        return;
      }
    }

    const nextAgents = isEnabled
      ? editingEntitlements.enabledAgents.filter((a) => a !== agent)
      : [...editingEntitlements.enabledAgents, agent];

    const resolved = resolveDependencies(
      nextAgents,
      editingEntitlements.enabledFeatures,
    );
    const addedAgents = resolved.enabledAgents.filter(
      (a) => !nextAgents.includes(a),
    );
    const addedFeatures = resolved.enabledFeatures.filter(
      (f) => !editingEntitlements.enabledFeatures.includes(f),
    );

    if (addedAgents.length || addedFeatures.length) {
      const names = [
        ...addedAgents.map(
          (a) => allAgents.find((item) => item.key === a)?.name || a,
        ),
        ...addedFeatures.map(
          (f) => allFeatures.find((item) => item.key === f)?.name || f,
        ),
      ];
      setDependencyNotice(
        `تم تفعيل عناصر مطلوبة تلقائياً: ${names.join("، ")}`,
      );
    }

    setEditingEntitlements({
      ...editingEntitlements,
      enabledAgents: resolved.enabledAgents,
      enabledFeatures: resolved.enabledFeatures,
      plan: "CUSTOM",
    });
  };

  const toggleFeature = (feature: string) => {
    if (!editingEntitlements) return;
    setDependencyNotice(null);

    const isEnabled = editingEntitlements.enabledFeatures.includes(feature);
    if (isEnabled) {
      const dependents = Object.entries(FEATURE_DEPENDENCIES)
        .filter(([, deps]) => deps.includes(feature))
        .map(([key]) => key)
        .filter((dep) => editingEntitlements.enabledFeatures.includes(dep));

      if (dependents.length > 0) {
        const names = dependents
          .map((dep) => allFeatures.find((f) => f.key === dep)?.name || dep)
          .join("، ");
        setDependencyNotice(`لا يمكن تعطيل الميزة لأنها مطلوبة لـ: ${names}`);
        return;
      }
    }

    const nextFeatures = isEnabled
      ? editingEntitlements.enabledFeatures.filter((f) => f !== feature)
      : [...editingEntitlements.enabledFeatures, feature];

    const resolved = resolveDependencies(
      editingEntitlements.enabledAgents,
      nextFeatures,
    );
    const addedAgents = resolved.enabledAgents.filter(
      (a) => !editingEntitlements.enabledAgents.includes(a),
    );
    const addedFeatures = resolved.enabledFeatures.filter(
      (f) => !nextFeatures.includes(f),
    );

    if (addedAgents.length || addedFeatures.length) {
      const names = [
        ...addedAgents.map(
          (a) => allAgents.find((item) => item.key === a)?.name || a,
        ),
        ...addedFeatures.map(
          (f) => allFeatures.find((item) => item.key === f)?.name || f,
        ),
      ];
      setDependencyNotice(
        `تم تفعيل عناصر مطلوبة تلقائياً: ${names.join("، ")}`,
      );
    }

    setEditingEntitlements({
      ...editingEntitlements,
      enabledAgents: resolved.enabledAgents,
      enabledFeatures: resolved.enabledFeatures,
      plan: "CUSTOM",
    });
  };

  const updateLimit = (
    key: keyof MerchantEntitlements["limits"],
    value: number,
  ) => {
    if (!editingEntitlements) return;
    setEditingEntitlements({
      ...editingEntitlements,
      limits: { ...editingEntitlements.limits, [key]: value },
    });
  };

  const saveEntitlements = async () => {
    if (!selectedMerchant || !editingEntitlements) return;

    setSaving(true);
    try {
      const response = await portalApi.updateMerchantEntitlement(
        selectedMerchant.id,
        editingEntitlements,
      );
      const updated = response?.enabledAgents
        ? {
            plan: editingEntitlements.plan,
            enabledAgents: response.enabledAgents,
            enabledFeatures: response.enabledFeatures,
            limits: response.limits || editingEntitlements.limits,
          }
        : editingEntitlements;

      // Update local state
      setMerchants((prev) =>
        prev.map((m) =>
          m.id === selectedMerchant.id ? { ...m, ...updated } : m,
        ),
      );

      setShowEditDialog(false);
    } catch (err) {
      console.error("Failed to save entitlements:", err);
    } finally {
      setSaving(false);
    }
  };

  const usageBandLabels: Record<string, string> = {
    healthy: "طبيعي",
    attention: "تنبيه",
    warning: "تحذير",
    critical: "حرج",
    exceeded: "متجاوز",
  };

  const usageBandClasses: Record<string, string> = {
    healthy: "bg-[var(--accent-success)]",
    attention: "bg-[var(--accent-blue)]",
    warning: "bg-[var(--accent-warning)]",
    critical: "bg-[var(--accent-danger)]",
    exceeded: "bg-[var(--accent-danger)]",
  };

  const columns = [
    {
      key: "tradeName",
      header: "التاجر",
      render: (merchant: Merchant) => (
        <div>
          <div className="font-medium">{merchant.tradeName}</div>
          <div className="text-xs text-muted-foreground">{merchant.email}</div>
        </div>
      ),
    },
    {
      key: "plan",
      header: "الخطة",
      render: (merchant: Merchant) => (
        <div className="flex flex-col gap-1">
          <Badge
            className={PLAN_COLORS[merchant.plan] || "bg-muted text-foreground"}
          >
            {PLAN_NAMES[merchant.plan] || merchant.plan}
          </Badge>
          {merchant.cashierPromoActive ? (
            <Badge variant="outline" className="text-xs">
              عرض الكاشير فعّال
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {merchant.cashierEffective ? "الكاشير متاح" : "الكاشير غير متاح"}
          </span>
        </div>
      ),
    },
    {
      key: "agents",
      header: "الوكلاء",
      render: (merchant: Merchant) => (
        <div className="flex gap-1">
          {merchant.enabledAgents.slice(0, 3).map((agent) => (
            <Badge key={agent} variant="outline" className="text-xs">
              {allAgents.find((a) => a.key === agent)?.name.split(" ")[1] ||
                agent}
            </Badge>
          ))}
          {merchant.enabledAgents.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{merchant.enabledAgents.length - 3}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "features",
      header: "الميزات",
      render: (merchant: Merchant) => (
        <span className="text-sm text-muted-foreground">
          {merchant.enabledFeatures.length} ميزة
        </span>
      ),
    },
    {
      key: "limits",
      header: "الحدود",
      render: (merchant: Merchant) => {
        const usagePercent = merchant.usage?.messagesUsagePercent;
        const usageBand = merchant.usage?.thresholdBand || "healthy";
        const progress = Math.max(0, Math.min(100, Number(usagePercent || 0)));
        const usageBandClass =
          usageBandClasses[usageBand] || usageBandClasses.healthy;
        return (
          <div className="space-y-1 text-xs">
            <div>
              {merchant.limits.messagesPerMonth === -1
                ? "∞"
                : merchant.limits.messagesPerMonth.toLocaleString()}{" "}
              رسالة
            </div>
            <div className="text-muted-foreground">
              {merchant.limits.whatsappNumbers} رقم
            </div>
            {usagePercent != null ? (
              <>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      usageBandClass,
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  استخدام الرسائل: {usagePercent.toLocaleString("ar-EG")}٪ •{" "}
                  {usageBandLabels[usageBand] || usageBandLabels.healthy}
                </div>
              </>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (merchant: Merchant) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleEditEntitlements(merchant)}
        >
          <Edit className="h-4 w-4 ml-1" />
          تعديل
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <PageHeader
        title="إدارة صلاحيات التجار"
        description="تعيين الخطط والميزات لكل تاجر"
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div>
            <p className="app-hero-band__eyebrow">خطط وصلاحيات</p>
            <h2 className="app-hero-band__title">
              رؤية أوضح للخطط، الوكلاء، والميزات الفعالة لكل تاجر
            </h2>
            <p className="app-hero-band__copy">
              وحّد إدارة التسعير التشغيلي والصلاحيات من واجهة واحدة تبرز
              الاستثناءات، العروض المؤقتة، وتوزيع الخطط عبر قاعدة العملاء.
            </p>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                التجار المعروضون
              </span>
              <strong className="app-hero-band__metric-value">
                {merchants.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">عدد الخطط</span>
              <strong className="app-hero-band__metric-value">
                {plans.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">كاشير متاح</span>
              <strong className="app-hero-band__metric-value">
                {
                  merchants.filter((merchant) => merchant.cashierEffective)
                    .length
                }
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <Card className="app-data-card app-data-card--muted">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="جميع الخطط" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الخطط</SelectItem>
                {plans.map((plan) => (
                  <SelectItem key={plan} value={plan}>
                    {PLAN_NAMES[plan] || plan}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Merchants Table */}
      {loading ? (
        <TableSkeleton columns={6} rows={5} />
      ) : merchants.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="لا يوجد تجار"
          description="لم يتم العثور على تجار مطابقين للبحث"
        />
      ) : (
        <Card className="app-data-card">
          <div className="divide-y md:hidden">
            {merchants.map((merchant) => (
              <div key={merchant.id} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{merchant.tradeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {merchant.email}
                    </p>
                  </div>
                  <Badge
                    className={
                      PLAN_COLORS[merchant.plan] || "bg-muted text-foreground"
                    }
                  >
                    {PLAN_NAMES[merchant.plan] || merchant.plan}
                  </Badge>
                  {merchant.cashierPromoActive ? (
                    <Badge variant="outline" className="text-xs">
                      عرض الكاشير فعّال
                    </Badge>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">الوكلاء</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {merchant.enabledAgents.slice(0, 3).map((agent) => (
                        <Badge
                          key={agent}
                          variant="outline"
                          className="text-xs"
                        >
                          {allAgents
                            .find((a) => a.key === agent)
                            ?.name.split(" ")[1] || agent}
                        </Badge>
                      ))}
                      {merchant.enabledAgents.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{merchant.enabledAgents.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">الميزات</p>
                    <p>{merchant.enabledFeatures.length} ميزة</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {merchant.cashierEffective
                        ? "الكاشير متاح حالياً"
                        : "الكاشير غير متاح حالياً"}
                    </p>
                    {merchant.cashierPromoActive &&
                    merchant.cashierPromoEndsAt ? (
                      <p className="text-xs text-muted-foreground">
                        ينتهي العرض في{" "}
                        {new Date(
                          merchant.cashierPromoEndsAt,
                        ).toLocaleDateString("ar-EG")}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-muted-foreground">الحدود</p>
                    <p>
                      {merchant.limits.messagesPerMonth === -1
                        ? "∞"
                        : merchant.limits.messagesPerMonth.toLocaleString()}{" "}
                      رسالة
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {merchant.limits.whatsappNumbers} رقم
                    </p>
                    {merchant.usage?.messagesUsagePercent != null ? (
                      <p className="text-xs text-muted-foreground">
                        استخدام الرسائل:{" "}
                        {merchant.usage.messagesUsagePercent.toLocaleString(
                          "ar-EG",
                        )}
                        ٪
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-muted-foreground">تاريخ الإنشاء</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(merchant.createdAt)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => handleEditEntitlements(merchant)}
                >
                  <Edit className="h-4 w-4 ml-1" />
                  تعديل
                </Button>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <DataTable columns={columns} data={merchants} />
          </div>
          {totalMerchants > itemsPerPage && (
            <div className="border-t p-4">
              <Pagination
                totalPages={Math.ceil(totalMerchants / itemsPerPage)}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </Card>
      )}

      {/* Edit Entitlements Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" />
              تعديل صلاحيات: {selectedMerchant?.tradeName}
            </DialogTitle>
            <DialogDescription>
              قم بتعديل الخطة والميزات المتاحة لهذا التاجر
            </DialogDescription>
          </DialogHeader>

          {dependencyNotice && (
            <AlertBanner
              type="warning"
              title="تنبيه الاعتمادات"
              message={dependencyNotice}
              onDismiss={() => setDependencyNotice(null)}
            />
          )}

          {editingEntitlements && (
            <Tabs defaultValue="plan" className="mt-4">
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
                <TabsTrigger value="plan" className="w-full">
                  الخطة
                </TabsTrigger>
                <TabsTrigger value="features" className="w-full">
                  الميزات
                </TabsTrigger>
                <TabsTrigger value="limits" className="w-full">
                  الحدود
                </TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {plans.map((plan) => (
                    <div
                      key={plan}
                      className={cn(
                        "p-4 border-2 rounded-lg cursor-pointer transition-all",
                        editingEntitlements.plan === plan
                          ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-subtle)]"
                          : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--border-active)]",
                      )}
                      onClick={() => handlePlanChange(plan)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          className={
                            PLAN_COLORS[plan] || "bg-muted text-foreground"
                          }
                        >
                          {PLAN_NAMES[plan] || plan}
                        </Badge>
                        {editingEntitlements.plan === plan && (
                          <Check className="h-5 w-5 text-[var(--color-brand-primary)]" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {planPresets[plan]?.agents.length || 0} وكيل •{" "}
                        {planPresets[plan]?.features.length || 0} ميزة
                      </div>
                    </div>
                  ))}
                </div>

                {editingEntitlements.plan === "CUSTOM" && (
                  <AlertBanner
                    type="info"
                    message="الخطة المخصصة تسمح لك بتحديد الوكلاء والميزات يدوياً من التبويبات الأخرى"
                  />
                )}
              </TabsContent>

              <TabsContent value="features" className="space-y-6 mt-4">
                {/* Agents */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    الوكلاء
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {allAgents.map((agent) => {
                      const enabled =
                        editingEntitlements.enabledAgents.includes(agent.key);
                      const selectable =
                        !!agent.implemented &&
                        !!agent.sellable &&
                        !!agent.subscriptionEnabled;
                      return (
                        <div
                          key={agent.key}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border p-3 transition-colors",
                            !selectable
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer",
                            enabled && selectable
                              ? "border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12"
                              : "bg-[var(--bg-surface-2)] hover:bg-[var(--bg-surface-3)]",
                          )}
                          onClick={() => {
                            if (!selectable) return;
                            toggleAgent(agent.key);
                          }}
                        >
                          <Checkbox checked={enabled} disabled={!selectable} />
                          <agent.icon className="h-4 w-4" />
                          <div className="min-w-0">
                            <span className="text-sm">{agent.name}</span>
                            {!agent.sellable ||
                            !agent.subscriptionEnabled ||
                            !agent.implemented ? (
                              <div className="text-[11px] text-muted-foreground">
                                {!agent.implemented
                                  ? "قيد التنفيذ"
                                  : !agent.sellable
                                    ? "غير جاهز للبيع"
                                    : "غير قابل للاشتراك"}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Features */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    الميزات
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {allFeatures.map((feature) => {
                      const enabled =
                        editingEntitlements.enabledFeatures.includes(
                          feature.key,
                        );
                      return (
                        <div
                          key={feature.key}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                            enabled
                              ? "bg-primary-50 border-primary-200"
                              : "bg-muted/30 hover:bg-muted/50",
                          )}
                          onClick={() => toggleFeature(feature.key)}
                        >
                          <Checkbox checked={enabled} />
                          <feature.icon className="h-4 w-4" />
                          <span className="text-sm">{feature.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>الرسائل الشهرية</Label>
                    <Input
                      type="number"
                      value={
                        editingEntitlements.limits.messagesPerMonth === -1
                          ? ""
                          : editingEntitlements.limits.messagesPerMonth
                      }
                      onChange={(e) =>
                        updateLimit(
                          "messagesPerMonth",
                          e.target.value ? parseInt(e.target.value) : -1,
                        )
                      }
                      placeholder="غير محدود"
                    />
                    <p className="text-xs text-muted-foreground">
                      اترك فارغاً لغير محدود
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>أرقام واتساب</Label>
                    <Input
                      type="number"
                      value={
                        editingEntitlements.limits.whatsappNumbers === -1
                          ? ""
                          : editingEntitlements.limits.whatsappNumbers
                      }
                      onChange={(e) =>
                        updateLimit(
                          "whatsappNumbers",
                          e.target.value ? parseInt(e.target.value) : -1,
                        )
                      }
                      placeholder="غير محدود"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>أعضاء الفريق</Label>
                    <Input
                      type="number"
                      value={
                        editingEntitlements.limits.teamMembers === -1
                          ? ""
                          : editingEntitlements.limits.teamMembers
                      }
                      onChange={(e) =>
                        updateLimit(
                          "teamMembers",
                          e.target.value ? parseInt(e.target.value) : -1,
                        )
                      }
                      placeholder="غير محدود"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={saveEntitlements}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? (
                "جاري الحفظ..."
              ) : (
                <>
                  <Save className="h-4 w-4 ml-2" />
                  حفظ التغييرات
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
