"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bot,
  CreditCard,
  Sparkles,
  Users,
  Star,
  Megaphone,
  Bell,
  ShoppingCart,
  Clock,
  Check,
  Rocket,
  Mail,
  ArrowRight,
  Loader2,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { portalApi } from "@/lib/client";

interface RoadmapFeature {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: React.ElementType;
  descriptionAr: string;
  outcomes: string[];
  status: "coming_soon" | "beta" | "available";
  eta?: string;
  tone: "gold" | "blue" | "success" | "warning" | "danger";
  agentType?: string;
  implemented?: boolean;
  sellable?: boolean;
  comingSoon?: boolean;
  subscriptionEnabled?: boolean;
  routeVisibility?: "visible" | "hidden" | "internal";
  entrypoints?: string[];
  requiredFeatures?: string[];
}

const ROADMAP_FEATURES: RoadmapFeature[] = [
  {
    id: "ops_agent",
    nameAr: "وكيل العمليات",
    nameEn: "Operations Agent",
    icon: Bot,
    descriptionAr: "يدير المحادثات والطلبات والعملاء والمتابعات تلقائياً",
    outcomes: [
      "محادثات ذكية مع العملاء عبر واتساب",
      "إنشاء وتتبع الطلبات تلقائياً",
      "تصنيف العملاء وتحليل المخاطر (RFM)",
      "متابعات وتصعيدات تلقائية",
    ],
    status: "available",
    eta: "متاح الآن",
    tone: "blue",
    agentType: "OPS_AGENT",
  },
  {
    id: "inventory_agent",
    nameAr: "وكيل المخزون",
    nameEn: "Inventory Agent",
    icon: Package,
    descriptionAr: "يتتبع المخزون والحجوزات والتنبيهات وتوصيات إعادة الطلب",
    outcomes: [
      "تتبع المخزون الحقيقي مع الحجوزات",
      "تنبيهات المخزون المنخفض تلقائياً",
      "توصيات إعادة الطلب بناءً على سرعة البيع",
      "تحليل المخزون الراكد والتقييم المالي",
    ],
    status: "available",
    eta: "متاح الآن",
    tone: "success",
    agentType: "INVENTORY_AGENT",
  },
  {
    id: "finance_agent",
    nameAr: "وكيل المالية",
    nameEn: "Finance Agent",
    icon: CreditCard,
    descriptionAr: "يدير المدفوعات والفواتير والتقارير المالية والمصروفات",
    outcomes: [
      "روابط دفع تلقائية مع تحقق بصري",
      "تقارير الربح والخسارة وإقفال شهري",
      "إنشاء فواتير وتسوية COD",
      "حزمة المحاسب الجاهزة للتصدير",
    ],
    status: "available",
    eta: "متاح الآن",
    tone: "gold",
    agentType: "FINANCE_AGENT",
  },
  {
    id: "support_agent",
    nameAr: "وكيل الدعم",
    nameEn: "Support Agent",
    icon: Users,
    descriptionAr: "دعم العملاء الذكي مع تصعيد تلقائي",
    outcomes: [
      "ردود تلقائية للأسئلة الشائعة",
      "تصعيد ذكي للحالات المعقدة",
      "تتبع رضا العملاء",
      "إدارة التذاكر والشكاوى",
    ],
    status: "coming_soon",
    eta: "Q2 2026",
    tone: "blue",
    agentType: "SUPPORT_AGENT",
  },
  {
    id: "marketing_agent",
    nameAr: "وكيل التسويق",
    nameEn: "Marketing Agent",
    icon: Megaphone,
    descriptionAr: "حملات تسويقية متعددة القنوات مع استهداف ذكي",
    outcomes: [
      "حملات على واتساب + إنستجرام + فيسبوك + تيك توك + البريد",
      "عروض مخصصة حسب سلوك العميل",
      "تحليل أداء القنوات والحملات",
      "رسائل المناسبات والأعياد عبر كل القنوات",
    ],
    status: "coming_soon",
    eta: "Q2 2026",
    tone: "gold",
    agentType: "MARKETING_AGENT",
  },
  {
    id: "sales_agent",
    nameAr: "وكيل المبيعات",
    nameEn: "Sales Agent",
    icon: ShoppingCart,
    descriptionAr:
      "متابعة فرص البيع عبر الرسائل والمكالمات لتحويلها إلى طلبات مؤكدة",
    outcomes: [
      "لوحة متابعة العملاء المحتملين",
      "رسائل مبيعات على جميع منصات التواصل",
      "مكالمات باردة ودافئة تلقائية/مجدولة",
      "تنبيهات إغلاق الصفقات والمتابعة",
      "تقارير تحويل المبيعات حسب القناة",
    ],
    status: "coming_soon",
    eta: "Q3 2026",
    tone: "danger",
    agentType: "SALES_AGENT",
  },
  {
    id: "content_agent",
    nameAr: "وكيل المحتوى",
    nameEn: "Content Agent",
    icon: Sparkles,
    descriptionAr: "إنشاء محتوى تسويقي متعدد الصيغ لكل منصات التواصل",
    outcomes: [
      "كتابة أوصاف المنتجات",
      "منشورات سوشيال ميديا مخصصة لكل منصة",
      "نسخ إعلانية وسيناريوهات قصيرة",
      "ترجمة المحتوى وتحسينه",
    ],
    status: "coming_soon",
    eta: "Q3 2026",
    tone: "gold",
    agentType: "CONTENT_AGENT",
  },
  {
    id: "creative_studio",
    nameAr: "وكيل الإبداع",
    nameEn: "Creative Studio",
    icon: Sparkles,
    descriptionAr: "توليد صور وفيديوهات وإعلانات جاهزة للنشر",
    outcomes: [
      "صور منتجات احترافية وخلفيات ذكية",
      "فيديوهات Reels/Shorts جاهزة",
      "تصميمات عروض وإعلانات متعددة المقاسات",
      "مكتبة قوالب مع تعديلات تلقائية",
    ],
    status: "coming_soon",
    eta: "Q4 2026",
    tone: "blue",
    agentType: "CREATIVE_AGENT",
  },
  {
    id: "loyalty_advanced",
    nameAr: "برنامج الولاء المتقدم",
    nameEn: "Advanced Loyalty",
    icon: Star,
    descriptionAr: "نظام نقاط ومكافآت متقدم مع مستويات العضوية",
    outcomes: [
      "مستويات عضوية (برونز، فضي، ذهبي)",
      "نقاط قابلة للاستبدال",
      "عروض حصرية للأعضاء",
      "هدايا عيد الميلاد",
    ],
    status: "beta",
    eta: "متاح للاختبار",
    tone: "warning",
  },
  {
    id: "multi_channel",
    nameAr: "تكامل متعدد القنوات",
    nameEn: "Multi-Channel",
    icon: Bell,
    descriptionAr: "إدارة المحادثات من واتساب وفيسبوك وانستجرام",
    outcomes: [
      "صندوق وارد موحد",
      "ردود متسقة عبر القنوات",
      "تحليلات موحدة",
      "إدارة مركزية للعملاء",
    ],
    status: "coming_soon",
    eta: "Q3 2026",
    tone: "blue",
  },
];

export default function RoadmapPage() {
  const { data: session } = useSession();
  const [showWaitlistDialog, setShowWaitlistDialog] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<RoadmapFeature | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [earlyAccess, setEarlyAccess] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API catalog data
  const [catalogData, setCatalogData] = useState<{
    agents: Array<{
      id: string;
      status: string;
      eta?: string;
      nameAr?: string;
      descriptionAr?: string;
      implemented: boolean;
      sellable: boolean;
      comingSoon: boolean;
      beta: boolean;
      subscriptionEnabled: boolean;
      routeVisibility: "visible" | "hidden" | "internal";
      requiredFeatures: string[];
      entrypoints: string[];
    }>;
  } | null>(null);

  const merchantId = session?.user?.merchantId || "demo-merchant";

  // Merge API data with UI-specific data (icons, outcomes)
  const roadmapFeatures = useMemo(() => {
    return ROADMAP_FEATURES.map((feature) => {
      // Find matching agent from API by agentType
      const apiAgent = catalogData?.agents?.find(
        (a) => a.id === feature.agentType,
      );
      if (apiAgent) {
        return {
          ...feature,
          status: apiAgent.status as "coming_soon" | "beta" | "available",
          eta: apiAgent.eta || feature.eta,
          // Optionally use API names if available
          nameAr: apiAgent.nameAr || feature.nameAr,
          descriptionAr: apiAgent.descriptionAr || feature.descriptionAr,
          implemented: apiAgent.implemented,
          sellable: apiAgent.sellable,
          comingSoon: apiAgent.comingSoon,
          subscriptionEnabled: apiAgent.subscriptionEnabled,
          routeVisibility: apiAgent.routeVisibility,
          entrypoints: apiAgent.entrypoints,
          requiredFeatures: apiAgent.requiredFeatures,
        };
      }
      return feature;
    });
  }, [catalogData]);

  // Load catalog data on mount
  const loadCatalog = useCallback(async () => {
    try {
      const catalog = await portalApi.getEntitlementsCatalog();
      setCatalogData({ agents: catalog.agents });
    } catch (err) {
      console.error("Failed to load catalog:", err);
    }
  }, []);

  // Load existing signups on mount
  const loadSignups = useCallback(async () => {
    try {
      const { signups } = await portalApi.getEarlyAccessSignups(merchantId);
      const accessMap: Record<string, boolean> = {};
      signups.forEach((s: any) => {
        if (s.status === "pending") {
          accessMap[s.featureKey] = true;
        }
      });
      setEarlyAccess(accessMap);
    } catch (err) {
      console.error("Failed to load early access signups:", err);
    }
  }, [merchantId]);

  useEffect(() => {
    loadCatalog();
    loadSignups();
  }, [loadCatalog, loadSignups]);

  const handleWaitlist = (feature: RoadmapFeature) => {
    setSelectedFeature(feature);
    setShowWaitlistDialog(true);
    setError(null);
  };

  const submitWaitlist = async () => {
    if (!selectedFeature || !email) return;

    setSubmitting(true);
    setError(null);

    try {
      await portalApi.signupForEarlyAccess(merchantId, {
        featureKey: selectedFeature.id,
        email,
      });

      setEarlyAccess((prev) => ({ ...prev, [selectedFeature.id]: true }));
      setShowWaitlistDialog(false);
      setEmail("");
    } catch (err: any) {
      setError(err.message || "فشل في التسجيل. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEarlyAccess = async (featureId: string) => {
    const isCurrentlyEnabled = earlyAccess[featureId] || false;

    setLoading((prev) => ({ ...prev, [featureId]: true }));

    try {
      await portalApi.toggleEarlyAccess(merchantId, {
        featureKey: featureId,
        enabled: !isCurrentlyEnabled,
      });

      setEarlyAccess((prev) => ({ ...prev, [featureId]: !isCurrentlyEnabled }));
    } catch (err: any) {
      console.error("Failed to toggle early access:", err);
    } finally {
      setLoading((prev) => ({ ...prev, [featureId]: false }));
    }
  };

  const getStatusBadge = (status: RoadmapFeature["status"]) => {
    switch (status) {
      case "available":
        return (
          <Badge className="border-0 bg-[var(--accent-success)]/15 text-[var(--accent-success)]">
            متاح
          </Badge>
        );
      case "beta":
        return (
          <Badge className="border-0 bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]">
            تجريبي
          </Badge>
        );
      case "coming_soon":
        return (
          <Badge className="border-0 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
            قريباً
          </Badge>
        );
    }
  };

  const getCapabilityBadge = (feature: RoadmapFeature) => {
    if (!feature.agentType) return null;

    if (feature.implemented === false) {
      return <Badge variant="secondary">قيد التنفيذ</Badge>;
    }

    if (feature.sellable === false) {
      return <Badge variant="outline">غير جاهز للبيع</Badge>;
    }

    if (feature.subscriptionEnabled === false) {
      return <Badge variant="outline">غير قابل للاشتراك الآن</Badge>;
    }

    return (
      <Badge className="border-0 bg-[var(--accent-success)]/15 text-[var(--accent-success)]">
        جاهز للبيع
      </Badge>
    );
  };

  const toneClasses: Record<RoadmapFeature["tone"], string> = {
    gold: "border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]",
    blue: "border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]",
    success:
      "border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10 text-[var(--accent-success)]",
    warning:
      "border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]",
    danger:
      "border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="خارطة الطريق"
        description="الميزات والوكلاء القادمة - سجّل للوصول المبكر"
      />

      {/* Hero Section */}
      <Card className="border-[var(--accent-gold)]/20 bg-[var(--bg-surface-2)]">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/10 p-3 text-[var(--accent-gold)]">
              <Rocket className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                نعمل على ميزات جديدة
              </h2>
              <p className="mt-1 text-muted-foreground">
                {roadmapFeatures.filter((f) => f.status === "available").length}{" "}
                وكلاء متاحين حالياً - سجّل للوصول المبكر لـ{" "}
                {roadmapFeatures.filter((f) => f.status !== "available").length}{" "}
                ميزات قادمة
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features Grid - only upcoming and beta */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {roadmapFeatures
          .filter((f) => f.status !== "available")
          .map((feature) => (
            <Card
              key={feature.id}
              className="overflow-hidden border-[var(--border-subtle)] bg-[var(--bg-surface-1)] transition-colors hover:bg-[var(--bg-surface-2)]"
            >
              <div
                className={cn("h-1.5", {
                  "bg-[var(--accent-gold)]": feature.tone === "gold",
                  "bg-[var(--accent-blue)]": feature.tone === "blue",
                  "bg-[var(--accent-success)]": feature.tone === "success",
                  "bg-[var(--accent-warning)]": feature.tone === "warning",
                  "bg-[var(--accent-danger)]": feature.tone === "danger",
                })}
              />
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "rounded-lg border p-2",
                        toneClasses[feature.tone],
                      )}
                    >
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {feature.nameAr}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {feature.nameEn}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(feature.status)}
                </div>
                <CardDescription className="mt-2">
                  {feature.descriptionAr}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Outcomes */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    ما ستحصل عليه:
                  </p>
                  <ul className="space-y-1">
                    {feature.outcomes.slice(0, 3).map((outcome, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <Check className="h-3 w-3 text-[var(--accent-success)]" />
                        {outcome}
                      </li>
                    ))}
                    {feature.outcomes.length > 3 && (
                      <li className="text-xs text-muted-foreground">
                        +{feature.outcomes.length - 3} ميزات أخرى
                      </li>
                    )}
                  </ul>
                </div>

                {/* ETA */}
                {feature.eta && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{feature.eta}</span>
                  </div>
                )}

                {feature.agentType ? (
                  <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">
                        حالة المنتج:
                      </span>
                      {getCapabilityBadge(feature)}
                    </div>
                    {feature.implemented === false ? (
                      <p className="text-muted-foreground">
                        هذا الوكيل ما زال في مرحلة التنفيذ ولم يصل بعد إلى مسار
                        تشغيلي مكتمل داخل المنصة.
                      </p>
                    ) : feature.sellable === false ? (
                      <p className="text-muted-foreground">
                        هذا الوكيل ظاهر في خارطة الطريق لكن لم يتم اعتماده
                        تجارياً كاشتراك مباشر بعد.
                      </p>
                    ) : feature.subscriptionEnabled === false ? (
                      <p className="text-muted-foreground">
                        الوكيل مطبّق، لكن التفعيل الذاتي من البوابة غير متاح
                        حالياً لهذا المسار.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        هذا الوكيل يملك مساراً تشغيلياً وقابلية اشتراك مباشرة من
                        البوابة.
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Actions */}
                <div className="flex flex-col gap-3 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {loading[feature.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Switch
                        id={`early-${feature.id}`}
                        checked={earlyAccess[feature.id] || false}
                        onCheckedChange={() => toggleEarlyAccess(feature.id)}
                        disabled={loading[feature.id]}
                      />
                    )}
                    <Label htmlFor={`early-${feature.id}`} className="text-sm">
                      وصول مبكر
                    </Label>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => handleWaitlist(feature)}
                    disabled={feature.status === "available"}
                  >
                    {feature.status === "available" ? (
                      <>
                        <Check className="h-4 w-4 ml-1" />
                        متاح
                      </>
                    ) : (
                      <>
                        قائمة الانتظار
                        <ArrowRight className="h-4 w-4 mr-1" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Coming Soon Note */}
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg border border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10 p-2 text-[var(--accent-blue)]">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold">ملاحظة مهمة</h3>
              <p className="text-sm text-muted-foreground mt-1">
                الحالات المعروضة هنا تختلف بين ميزات قيد التنفيذ وميزات تجريبية
                وميزات غير جاهزة للبيع بعد. التسجيل في قائمة الانتظار لا يضمن
                الوصول المبكر وقد يختلف الشكل النهائي للميزات عن المعروض.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Waitlist Dialog */}
      <Dialog open={showWaitlistDialog} onOpenChange={setShowWaitlistDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>انضم لقائمة الانتظار</DialogTitle>
            <DialogDescription>
              سجّل بريدك الإلكتروني للحصول على تحديثات حول{" "}
              {selectedFeature?.nameAr}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {selectedFeature && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <selectedFeature.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{selectedFeature.nameAr}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedFeature.descriptionAr}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setShowWaitlistDialog(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={submitWaitlist}
              disabled={!email || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري التسجيل...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 ml-2" />
                  تسجيل
                </>
              )}
            </Button>
          </DialogFooter>
          {error && (
            <p className="mt-2 text-sm text-[var(--accent-danger)]">{error}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
