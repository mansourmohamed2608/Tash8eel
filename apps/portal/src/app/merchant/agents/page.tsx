"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Check,
  Camera,
  Mic,
  Lock,
  Zap,
  Package,
  TrendingUp,
  MessageSquare,
  Sparkles,
  Palette,
  ShoppingCart,
  HeadphonesIcon,
  FileText,
  Activity,
  Brain,
  Settings,
  ChevronLeft,
  BarChart3,
  Eye,
  Cpu,
  Globe,
  Shield,
  Lightbulb,
  Users,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/alerts";

interface AgentInfo {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  status: "available" | "beta" | "coming_soon";
  eta?: string;
  color: string;
  dependencies: string[];
  features: string[];
  isEnabled: boolean;
  isIncludedInPlan: boolean;
  implemented: boolean;
  sellable: boolean;
  comingSoon: boolean;
  beta: boolean;
  subscriptionEnabled: boolean;
  routeVisibility: "visible" | "hidden" | "internal";
  requiredFeatures: string[];
  entrypoints: string[];
  config?: Record<string, unknown> | null;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  OPS_AGENT: Zap,
  INVENTORY_AGENT: Package,
  FINANCE_AGENT: TrendingUp,
  MARKETING_AGENT: MessageSquare,
  SUPPORT_AGENT: HeadphonesIcon,
  CONTENT_AGENT: FileText,
  SALES_AGENT: ShoppingCart,
  CREATIVE_AGENT: Palette,
};

const AI_CAPABILITIES = [
  {
    icon: Brain,
    title: "تصنيف العملاء تلقائياً",
    description: "يصنف العملاء لـ HOT/WARM/COLD بناءً على سلوكهم ورسائلهم",
    category: "مبيعات",
  },
  {
    icon: MessageSquare,
    title: "الرد على اعتراضات العملاء",
    description: 'يكتشف اعتراضات "غالي/مش واثق" ويرد تلقائياً بإقناع',
    category: "مبيعات",
  },
  {
    icon: TrendingUp,
    title: "تنبيهات هوامش الربح",
    description: "ينبهك لما الهامش ينزل عن 15% أو المصاريف تتجاوز 80%",
    category: "مالية",
  },
  {
    icon: Package,
    title: "توصيات إعادة الطلب الذكية",
    description: "يحلل المخزون ويقترح إجراءات إعادة طلب بأولويات",
    category: "مخزون",
  },
  {
    icon: Eye,
    title: "قراءة إيصالات الدفع (OCR)",
    description: "يقرأ صور الإيصالات ويستخرج المبلغ والمرجع والبنك تلقائياً",
    category: "مدفوعات",
  },
  {
    icon: BarChart3,
    title: "الملخص التنفيذي الأسبوعي",
    description: "يكتب تقرير CFO يقارن الأداء الحالي بالسابق",
    category: "تقارير",
  },
  {
    icon: Cpu,
    title: "مساعد الأوامر الصوتية",
    description: '"دفعت 500 للكهربا" - يفهم أوامرك ويحولها لإجراءات',
    category: "عام",
  },
  {
    icon: Globe,
    title: "بوت خدمة العملاء على واتساب",
    description: "يتحدث مع العملاء، يأخذ طلباتهم، يتفاوض، ويؤكد بذكاء",
    category: "عام",
  },
  {
    icon: Lightbulb,
    title: "رؤى ذكية في كل صفحة",
    description: "تحليلات فورية لبياناتك بدون استهلاك رصيد AI",
    category: "عام",
  },
  {
    icon: Shield,
    title: "كشف الأنماط الشاذة",
    description: "ينبهك لأي تغيير مفاجئ في الإيرادات أو المصاريف أو الطلبات",
    category: "مالية",
  },
];

const QUICK_LINKS = [
  {
    label: "المحادثات",
    href: "/merchant/conversations",
    icon: MessageSquare,
    description: "بوت WhatsApp الذكي",
  },
  {
    label: "المخزون",
    href: "/merchant/inventory",
    icon: Package,
    description: "تحليلات وتنبؤات المخزون",
  },
  {
    label: "تقرير CFO",
    href: "/merchant/reports/cfo",
    icon: TrendingUp,
    description: "الملخص التنفيذي الذكي",
  },
  {
    label: "المصاريف",
    href: "/merchant/expenses",
    icon: BarChart3,
    description: "تتبع المصاريف بالصوت",
  },
  {
    label: "الأمان",
    href: "/merchant/security",
    icon: Shield,
    description: "حماية الحساب",
  },
  {
    label: "الإعدادات",
    href: "/merchant/settings",
    icon: Settings,
    description: "إعدادات الذكاء الاصطناعي",
  },
];

export default function AgentsPage() {
  const { apiKey } = useMerchant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState("STARTER");
  const [activeTab, setActiveTab] = useState("overview");

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await merchantApi.getEntitlementsCatalog(apiKey);
      if (data) {
        setAgents(data.agents || []);
        setCurrentPlan(data.currentPlan || "STARTER");
      }
    } catch {
      setCurrentPlan("STARTER");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "overview" || tab === "agents" || tab === "capabilities") {
      setActiveTab(tab);
      return;
    }
    setActiveTab("overview");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const enabledCount = agents.filter((a) => a.isEnabled).length;
  const availableCount = agents.filter((a) => a.isIncludedInPlan).length;
  const comingSoonCount = agents.filter(
    (a) => a.status === "coming_soon",
  ).length;
  const categoriesCount = new Set(AI_CAPABILITIES.map((c) => c.category)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        title="مركز الذكاء"
        description="التحكم في الوكلاء، قدراتهم، وروابط التشغيل التي تهم الفريق فعلياً."
      />

      <div className="flex flex-wrap gap-2">
        {[
          [
            "الوكلاء المفعلة",
            String(enabledCount || 0),
            "text-[var(--accent-blue)]",
          ],
          [
            "المتاحة بالخطة",
            String(availableCount),
            "text-[var(--accent-success)]",
          ],
          [
            "مجالات الذكاء",
            String(categoriesCount),
            "text-[var(--accent-gold)]",
          ],
          [
            "قدرات قادمة",
            String(comingSoonCount),
            "text-[var(--accent-warning)]",
          ],
          ["الخطة الحالية", currentPlan, "text-foreground"],
          [
            "القدرات",
            String(AI_CAPABILITIES.length),
            "text-[var(--accent-blue)]",
          ],
        ].map(([label, value, color]) => (
          <div
            key={label}
            className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("font-mono", color)}>{value}</span>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <TabsTrigger value="overview" className="w-full">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="agents" className="w-full">
            الوكلاء ({agents.length || 8})
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="w-full">
            القدرات الذكية
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="app-data-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-[var(--accent-blue)]" />
                كيف يعمل الذكاء الاصطناعي في متجرك
              </CardTitle>
              <CardDescription>
                نظام تشغيل ذكي يعمل 24/7 لأتمتة عملياتك وزيادة مبيعاتك
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color:rgba(34,197,94,0.22)] bg-[color:rgba(34,197,94,0.12)]">
                      <MessageSquare className="h-5 w-5 text-[color:var(--accent-success)]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-medium text-[var(--accent-success)]">
                        بوت واتساب ذكي
                      </h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        يتحدث بالعامية المصرية مع عملاءك ← يأخذ الطلبات ← يتفاوض
                        ← يؤكد ويحجز التوصيل
                      </p>
                      <Link href="/merchant/conversations">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-auto p-0 text-[color:var(--accent-success)]"
                        >
                          عرض المحادثات →
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color:rgba(59,130,246,0.22)] bg-[color:rgba(59,130,246,0.12)]">
                      <Mic className="h-5 w-5 text-[color:var(--accent-blue)]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-medium text-[var(--accent-blue)]">
                        مساعد الأوامر
                      </h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        قوله "دفعت 500 للكهربا" أو "زوّد التيشيرت 10" - يفهم
                        ويحول لإجراءات فوراً
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--accent-gold)]/25 bg-[var(--accent-gold)]/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--accent-gold)]/25 bg-[var(--accent-gold)]/12">
                      <Camera className="h-5 w-5 text-[var(--accent-gold)]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-medium text-[var(--accent-gold)]">
                        قراءة الصور والإيصالات
                      </h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        يقرأ إيصالات الدفع ويستخرج البيانات تلقائياً - يحلل صور
                        المنتجات للكتالوج
                      </p>
                      <Link href="/merchant/payments/proofs">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-auto p-0 text-[var(--accent-gold)]"
                        >
                          إثباتات الدفع →
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12">
                      <BarChart3 className="h-5 w-5 text-[var(--accent-warning)]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-medium text-[var(--accent-warning)]">
                        تحليلات وتقارير ذكية
                      </h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        ملخص CFO أسبوعي - كشف الأنماط الشاذة - رؤى ذكية في كل
                        صفحة
                      </p>
                      <Link href="/merchant/reports/cfo">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-auto p-0 text-[var(--accent-warning)]"
                        >
                          تقرير CFO →
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">وصول سريع</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {QUICK_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link key={link.href} href={link.href}>
                      <div className="flex min-h-[72px] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-3 py-3 transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">
                            {link.label}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {link.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="app-data-card">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-[color:var(--accent-blue)]" />
                  المهام الجماعية للوكلاء
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  وزّع العمل على عدة وكلاء ليعملوا معاً بالتوازي على مهام معقدة
                </p>
              </div>
              <Link href="/merchant/teams">
                <Button className="w-full sm:w-auto">
                  إدارة الفرق <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          {currentPlan && (
            <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  خطتك الحالية:{" "}
                  <span className="font-bold text-[color:var(--accent-blue)]">
                    {currentPlan}
                  </span>
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  بعض الوكلاء مضمنون في خطتك والبقية يمكن إضافتهم كإضافات
                </p>
              </div>
              <Link href="/merchant/plan">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  ترقية الخطة
                </Button>
              </Link>
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <EmptyState
              icon={<Bot className="h-6 w-6" />}
              title="الوكلاء غير متوفرين حالياً"
              description="يعمل النظام بالذكاء الاصطناعي المدمج."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => {
                const AgentIcon = AGENT_ICONS[agent.id] || Bot;
                const isComingSoon = agent.status === "coming_soon";
                const isBeta = agent.status === "beta";
                const isNotSellable = !agent.sellable;
                return (
                  <Card
                    key={agent.id}
                    className={`border transition-all ${agent.isEnabled ? "border-[var(--accent-success)]/25 bg-[var(--accent-success)]/10" : isComingSoon ? "opacity-60" : ""}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-lg ${agent.isEnabled ? "border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]" : "border border-[var(--border-subtle)] bg-muted text-[var(--text-secondary)]"}`}
                          >
                            <AgentIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">
                              {agent.nameAr}
                            </CardTitle>
                            <p className="text-muted-foreground text-xs">
                              {agent.nameEn}
                            </p>
                          </div>
                        </div>
                        {agent.isEnabled ? (
                          <Badge
                            variant="outline"
                            className="border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)] text-xs"
                          >
                            <Check className="h-3 w-3 ml-1" />
                            مفعّل
                          </Badge>
                        ) : isBeta ? (
                          <Badge
                            variant="outline"
                            className="border-[var(--accent-gold)]/25 bg-[var(--accent-gold)]/12 text-[var(--accent-gold)] text-xs"
                          >
                            <Sparkles className="h-3 w-3 ml-1" />
                            تجريبي
                          </Badge>
                        ) : isComingSoon ? (
                          <Badge variant="secondary" className="text-xs">
                            قريباً {agent.eta ? `- ${agent.eta}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <Lock className="h-3 w-3 ml-1" />
                            غير مفعّل
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-muted-foreground text-sm mb-3">
                        {agent.descriptionAr}
                      </p>
                      {agent.features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {agent.features.slice(0, 4).map((f) => (
                            <span
                              key={f}
                              className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {f}
                            </span>
                          ))}
                          {agent.features.length > 4 && (
                            <span className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] px-2 py-0.5 text-[10px] text-muted-foreground">
                              +{agent.features.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mb-3 space-y-1">
                        <p className="text-[11px] text-muted-foreground">
                          الحالة التنفيذية:{" "}
                          <span className="font-medium text-foreground">
                            {agent.implemented ? "مطبّق" : "قيد التنفيذ"}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          الحالة التجارية:{" "}
                          <span className="font-medium text-foreground">
                            {isNotSellable ? "غير جاهز للبيع" : "جاهز للبيع"}
                          </span>
                        </p>
                      </div>
                      <div className="pt-3 border-t">
                        {agent.isIncludedInPlan ? (
                          <p className="text-xs text-[color:var(--accent-success)]">
                            مضمن في خطتك
                          </p>
                        ) : isComingSoon ? (
                          <p className="text-xs text-muted-foreground">
                            سيتوفر قريباً
                            {isNotSellable ? " وغير جاهز للبيع حالياً" : ""}
                          </p>
                        ) : !agent.subscriptionEnabled ? (
                          <p className="text-xs text-[var(--accent-warning)]">
                            غير قابل للتفعيل حالياً من سجل القدرات
                          </p>
                        ) : (
                          <Link href="/merchant/plan">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs text-[var(--accent-blue)]"
                            >
                              ترقية لتفعيل →
                            </Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Capabilities Tab */}
        <TabsContent value="capabilities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--accent-gold)]" />
                القدرات الذكية المفعّلة
              </CardTitle>
              <CardDescription>
                كل هذه القدرات تعمل تلقائياً في متجرك الآن
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {AI_CAPABILITIES.map((cap, i) => {
                  const Icon = cap.icon;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-all"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10">
                        <Icon className="h-4 w-4 text-[color:var(--accent-blue)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-sm font-medium">{cap.title}</h4>
                          <Badge variant="outline" className="text-[10px] py-0">
                            {cap.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {cap.description}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <div className="h-2 w-2 rounded-full bg-[color:var(--accent-success)] animate-pulse" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                القدرات الذكية المتاحة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-5 w-5 text-[var(--accent-blue)]" />
                    <h4 className="font-medium">المحادثات والتحليل</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    النموذج الأساسي - سريع واقتصادي
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• بوت خدمة العملاء (واتساب)</li>
                    <li>• مساعد الأوامر</li>
                    <li>• المساعد التجاري</li>
                    <li>• تحليلات المخزون والمالية</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-5 w-5 text-[var(--accent-gold)]" />
                    <h4 className="font-medium">تحليل الصور والمستندات</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    نموذج الرؤية - يقرأ الصور
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• تصنيف إيصالات الدفع</li>
                    <li>• استخراج بيانات الإيصالات</li>
                    <li>• تحليل صور المنتجات</li>
                    <li>• تحليل صور الأدوية</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
