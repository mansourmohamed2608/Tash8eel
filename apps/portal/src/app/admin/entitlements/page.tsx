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
  BASIC: "الأساسي",
  GROWTH: "النمو",
  PRO: "الاحترافي",
  ENTERPRISE: "المؤسسات",
  CUSTOM: "مخصص",
};

const PLAN_COLORS: Record<string, string> = {
  TRIAL: "bg-gray-100 text-gray-800",
  STARTER: "bg-blue-100 text-blue-800",
  BASIC: "bg-sky-100 text-sky-800",
  GROWTH: "bg-green-100 text-green-800",
  PRO: "bg-purple-100 text-purple-800",
  ENTERPRISE: "bg-amber-100 text-amber-800",
  CUSTOM: "bg-pink-100 text-pink-800",
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
  MARKETING_AGENT: "وكيل التسويق",
  SUPPORT_AGENT: "وكيل الدعم",
  CONTENT_AGENT: "وكيل المحتوى",
  SALES_AGENT: "وكيل المبيعات",
  CREATIVE_AGENT: "وكيل الإبداع",
};

const FALLBACK_FEATURE_NAMES: Record<string, string> = {
  CONVERSATIONS: "المحادثات",
  ORDERS: "الطلبات",
  CATALOG: "الكتالوج",
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
      "VOICE_NOTES",
      "NOTIFICATIONS",
    ],
  },
  BASIC: {
    agents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "INVENTORY",
      "PAYMENTS",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
      "API_ACCESS",
    ],
  },
  GROWTH: {
    agents: ["OPS_AGENT", "INVENTORY_AGENT"],
    features: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "INVENTORY",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
      "API_ACCESS",
    ],
  },
  PRO: {
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
  },
  ENTERPRISE: {
    agents: [
      "OPS_AGENT",
      "INVENTORY_AGENT",
      "FINANCE_AGENT",
      "MARKETING_AGENT",
      "SUPPORT_AGENT",
      "CONTENT_AGENT",
    ],
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
  MARKETING_AGENT: ["OPS_AGENT"],
  SUPPORT_AGENT: ["OPS_AGENT"],
  CONTENT_AGENT: [],
};

const AGENT_FEATURE_MAP: Record<string, string[]> = {
  OPS_AGENT: ["CONVERSATIONS", "ORDERS", "CATALOG"],
  INVENTORY_AGENT: ["INVENTORY"],
  FINANCE_AGENT: ["REPORTS", "KPI_DASHBOARD"],
  MARKETING_AGENT: ["LOYALTY"],
  SUPPORT_AGENT: ["CONVERSATIONS"],
  CONTENT_AGENT: [],
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
  REPORTS: "FINANCE_AGENT",
  LOYALTY: "MARKETING_AGENT",
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
      return catalogData.agents.map((agent) => ({
        key: agent.id,
        name:
          agent.nameAr ||
          FALLBACK_AGENT_NAMES[agent.id] ||
          agent.nameEn ||
          agent.id,
        icon: AGENT_ICON_MAP[agent.id] || Bot,
        implemented: agent.implemented ?? false,
        sellable: agent.sellable ?? false,
        subscriptionEnabled: agent.subscriptionEnabled ?? false,
      }));
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
            agents: plan.enabledAgents || [],
            features: plan.enabledFeatures || [],
          },
        ]),
      ) as Record<string, { agents: string[]; features: string[] }>;
    }

    return FALLBACK_PLAN_PRESETS;
  }, [catalogData]);

  const agentDependencies = useMemo(
    () => catalogData?.agentDependencies || AGENT_DEPENDENCIES,
    [catalogData],
  );

  const agentFeatureMap = useMemo(() => {
    if (catalogData?.agents?.length) {
      return Object.fromEntries(
        catalogData.agents.map((agent) => [
          agent.id,
          agent.requiredFeatures || agent.features || [],
        ]),
      ) as Record<string, string[]>;
    }

    return AGENT_FEATURE_MAP;
  }, [catalogData]);

  const featureAgentMap = useMemo(() => {
    const derived: Record<string, string> = { ...FEATURE_AGENT_MAP };

    if (catalogData?.features?.length) {
      for (const feature of catalogData.features) {
        if (feature.requiredAgent) {
          derived[feature.id] = feature.requiredAgent;
        }
      }
    }

    if (catalogData?.agents?.length) {
      for (const agent of catalogData.agents) {
        for (const feature of agent.requiredFeatures || agent.features || []) {
          if (!derived[feature]) {
            derived[feature] = agent.id;
          }
        }
      }
    }

    return derived;
  }, [catalogData]);

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
    setDependencyNotice(null);

    const isEnabled = editingEntitlements.enabledAgents.includes(agent);
    if (isEnabled) {
      const dependents = Object.entries(AGENT_DEPENDENCIES)
        .filter(([, deps]) => deps.includes(agent))
        .map(([key]) => key)
        .filter((dep) => editingEntitlements.enabledAgents.includes(dep));
      const catalogDependents = Object.entries(agentDependencies)
        .filter(([, deps]) => deps.includes(agent))
        .map(([key]) => key)
        .filter((dep) => editingEntitlements.enabledAgents.includes(dep));
      const dependentsSet = Array.from(
        new Set([...dependents, ...catalogDependents]),
      );

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
      render: (merchant: Merchant) => (
        <div className="text-xs">
          <div>
            {merchant.limits.messagesPerMonth === -1
              ? "∞"
              : merchant.limits.messagesPerMonth.toLocaleString()}{" "}
            رسالة
          </div>
          <div className="text-muted-foreground">
            {merchant.limits.whatsappNumbers} رقم
          </div>
        </div>
      ),
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
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="إدارة صلاحيات التجار"
        description="تعيين الخطط والميزات لكل تاجر"
      />

      {/* Filters */}
      <Card>
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
        <Card>
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
                          ? "border-primary-500 bg-primary-50"
                          : "border-muted hover:border-primary-300",
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
                          <Check className="h-5 w-5 text-primary-600" />
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
                      return (
                        <div
                          key={agent.key}
                          className={cn(
                            "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                            enabled
                              ? "bg-green-50 border-green-200"
                              : "bg-muted/30 hover:bg-muted/50",
                          )}
                          onClick={() => toggleAgent(agent.key)}
                        >
                          <Checkbox checked={enabled} />
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
