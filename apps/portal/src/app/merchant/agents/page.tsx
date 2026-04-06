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
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import Link from "next/link";

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

const AGENT_EMOJIS: Record<string, string> = {
  OPS_AGENT: "🔄",
  INVENTORY_AGENT: "📦",
  FINANCE_AGENT: "💰",
  MARKETING_AGENT: "📢",
  SUPPORT_AGENT: "🎧",
  CONTENT_AGENT: "✍️",
  SALES_AGENT: "📊",
  CREATIVE_AGENT: "🎨",
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز الذكاء"
        description="كل أدوات الذكاء الاصطناعي التي تعمل لصالح متجرك - من بوت الواتساب إلى تحليلات المخزون"
      />

      {/* Hero Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-green-200 dark:border-green-800/50">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-green-500" />
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {AI_CAPABILITIES.length}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">قدرة ذكية نشطة</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-800/50">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Bot className="h-4 w-4 text-blue-500" />
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {enabledCount || 1}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">وكيل مفعّل</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 dark:border-purple-800/50">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                متقدم
              </p>
            </div>
            <p className="text-xs text-muted-foreground">موديل الذكاء</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800/50">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-amber-500" />
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {currentPlan}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">خطتك الحالية</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full flex">
          <TabsTrigger value="overview" className="flex-1">
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex-1">
            الوكلاء ({agents.length || 8})
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="flex-1">
            القدرات الذكية
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-500" />
                كيف يعمل الذكاء الاصطناعي في متجرك
              </CardTitle>
              <CardDescription>
                نظام تشغيل ذكي يعمل 24/7 لأتمتة عملياتك وزيادة مبيعاتك
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center text-lg">
                      💬
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-green-800 dark:text-green-300 mb-1">
                        بوت واتساب ذكي
                      </h4>
                      <p className="text-sm text-green-700/80 dark:text-green-400/80">
                        يتحدث بالعامية المصرية مع عملاءك ← يأخذ الطلبات ← يتفاوض
                        ← يؤكد ويحجز التوصيل
                      </p>
                      <Link href="/merchant/conversations">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-green-600 dark:text-green-400 p-0 h-auto"
                        >
                          عرض المحادثات →
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-lg">
                      🎙️
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                        مساعد الأوامر
                      </h4>
                      <p className="text-sm text-blue-700/80 dark:text-blue-400/80">
                        قوله "دفعت 500 للكهربا" أو "زوّد التيشيرت 10" - يفهم
                        ويحول لإجراءات فوراً
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-lg">
                      📸
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-purple-800 dark:text-purple-300 mb-1">
                        قراءة الصور والإيصالات
                      </h4>
                      <p className="text-sm text-purple-700/80 dark:text-purple-400/80">
                        يقرأ إيصالات الدفع ويستخرج البيانات تلقائياً - يحلل صور
                        المنتجات للكتالوج
                      </p>
                      <Link href="/merchant/payments/proofs">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-purple-600 dark:text-purple-400 p-0 h-auto"
                        >
                          إثباتات الدفع →
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-lg">
                      📊
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1">
                        تحليلات وتقارير ذكية
                      </h4>
                      <p className="text-sm text-amber-700/80 dark:text-amber-400/80">
                        ملخص CFO أسبوعي - كشف الأنماط الشاذة - رؤى ذكية في كل
                        صفحة
                      </p>
                      <Link href="/merchant/reports/cfo">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-amber-600 dark:text-amber-400 p-0 h-auto"
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {QUICK_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link key={link.href} href={link.href}>
                      <div className="p-3 rounded-lg border hover:bg-muted/50 transition-all cursor-pointer">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {link.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {link.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-l from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800/50">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  👥 المهام الجماعية للوكلاء
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  وزّع العمل على عدة وكلاء ليعملوا معاً بالتوازي على مهام معقدة
                </p>
              </div>
              <Link href="/merchant/teams">
                <Button>
                  إدارة الفرق <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          {currentPlan && (
            <div className="bg-gradient-to-l from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-medium">
                  خطتك الحالية:{" "}
                  <span className="text-blue-600 dark:text-blue-300 font-bold">
                    {currentPlan}
                  </span>
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  بعض الوكلاء مضمنون في خطتك والبقية يمكن إضافتهم كإضافات
                </p>
              </div>
              <Link href="/merchant/plan">
                <Button variant="outline" size="sm">
                  ترقية الخطة
                </Button>
              </Link>
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-lg font-medium mb-1">
                  الوكلاء غير متوفرين حالياً
                </p>
                <p className="text-muted-foreground text-sm">
                  يعمل النظام بالذكاء الاصطناعي المدمج
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => {
                const emoji = AGENT_EMOJIS[agent.id] || "🤖";
                const isComingSoon = agent.status === "coming_soon";
                const isBeta = agent.status === "beta";
                return (
                  <Card
                    key={agent.id}
                    className={`border transition-all ${agent.isEnabled ? "border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/10" : isComingSoon ? "opacity-60" : ""}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${agent.isEnabled ? "bg-green-100 dark:bg-green-900/40" : "bg-muted"}`}
                          >
                            {emoji}
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
                            className="text-green-600 dark:text-green-400 border-green-300 text-xs"
                          >
                            <Check className="h-3 w-3 ml-1" />
                            مفعّل
                          </Badge>
                        ) : isBeta ? (
                          <Badge
                            variant="outline"
                            className="text-purple-600 dark:text-purple-400 border-purple-300 text-xs"
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
                              className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                            >
                              {f}
                            </span>
                          ))}
                          {agent.features.length > 4 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              +{agent.features.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="pt-3 border-t">
                        {agent.isIncludedInPlan ? (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            ✅ مضمن في خطتك
                          </p>
                        ) : isComingSoon ? (
                          <p className="text-xs text-muted-foreground">
                            سيتوفر قريباً
                          </p>
                        ) : (
                          <Link href="/merchant/plan">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-500 p-0 h-auto text-xs"
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
                <Sparkles className="h-5 w-5 text-purple-500" />
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
                      <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
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
                    <Brain className="h-5 w-5 text-blue-500" />
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
                    <Eye className="h-5 w-5 text-purple-500" />
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
