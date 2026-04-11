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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  MessageSquare,
  Banknote,
  Star,
  Truck,
  RefreshCw,
  ClipboardList,
  ArrowLeft,
  Clock,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { portalApi } from "@/lib/client";
import {
  AiInsightsCard,
  generateFollowupInsights,
} from "@/components/ai/ai-insights-card";
import { EmptyState, LoadingState } from "@/components/ui/alerts";

interface Followup {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  total: number | string;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  scheduled_at?: string | null;
  updated_at: string;
  is_due?: boolean;
  followup_type:
    | "cod_collection"
    | "feedback_request"
    | "delivery_check"
    | "abandoned_cart"
    | "general";
}

const FOLLOWUP_CONFIG: Record<
  string,
  { label: string; color: string; icon: any; description: string }
> = {
  cod_collection: {
    label: "تحصيل الدفع عند الاستلام",
    color: "bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    icon: Banknote,
    description: "طلبات تم تسليمها ولم يتم تحصيل مبلغ COD",
  },
  feedback_request: {
    label: "طلب تقييم",
    color: "bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    icon: Star,
    description: "طلبات تم تسليمها منذ 3+ أيام بدون تقييم",
  },
  delivery_check: {
    label: "التحقق من التسليم",
    color: "bg-[var(--accent-gold)]/12 text-[var(--accent-gold)]",
    icon: Truck,
    description: "طلبات مشحونة منذ 5+ أيام بدون تحديث",
  },
  abandoned_cart: {
    label: "السلات المتروكة",
    color: "bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    icon: ClipboardList,
    description: "عملاء توقفوا قبل إكمال الطلب وتحتاج محادثاتهم متابعة",
  },
  general: {
    label: "متابعة عامة",
    color: "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
    icon: ClipboardList,
    description: "متابعات أخرى",
  },
};

const FOLLOWUP_STATUS_LABELS: Record<string, string> = {
  DELIVERED: "تم التسليم",
  SHIPPED: "تم الشحن",
  OUT_FOR_DELIVERY: "قيد التوصيل",
  BOOKED: "محجوز",
  CONFIRMED: "مؤكد",
  PENDING: "متابعة معلقة",
};

export default function FollowupsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchFollowups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await portalApi.getFollowups();
      setFollowups(data.followups || []);
    } catch (error) {
      console.error("Failed to fetch followups:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "all" ||
      tab === "cod_collection" ||
      tab === "feedback_request" ||
      tab === "delivery_check" ||
      tab === "abandoned_cart" ||
      tab === "general"
    ) {
      setActiveTab(tab);
      return;
    }
    setActiveTab("all");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "all") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const filteredFollowups =
    activeTab === "all"
      ? followups
      : followups.filter((f) => f.followup_type === activeTab);

  // Count by type
  const counts = {
    all: followups.length,
    cod_collection: followups.filter(
      (f) => f.followup_type === "cod_collection",
    ).length,
    feedback_request: followups.filter(
      (f) => f.followup_type === "feedback_request",
    ).length,
    delivery_check: followups.filter(
      (f) => f.followup_type === "delivery_check",
    ).length,
    abandoned_cart: followups.filter(
      (f) => f.followup_type === "abandoned_cart",
    ).length,
  };

  const handleWhatsApp = (phone: string, type: string, orderNumber: string) => {
    if (!phone) return;
    let message = "";
    switch (type) {
      case "cod_collection":
        message = `مرحباً، بخصوص الطلب رقم ${orderNumber}، نود تذكيرك بتحصيل مبلغ الدفع عند الاستلام. شكراً لك!`;
        break;
      case "feedback_request":
        message = `مرحباً، نتمنى أن تكون قد استلمت الطلب رقم ${orderNumber} بنجاح. سنكون سعداء بسماع رأيك! ⭐`;
        break;
      case "delivery_check":
        message = `مرحباً، بخصوص الطلب رقم ${orderNumber} المشحون إليك، هل وصل الطلب؟ لا تتردد في التواصل معنا.`;
        break;
      case "abandoned_cart":
        message = `مرحباً، لاحظنا أنك توقفت قبل إكمال الطلب. إذا أحببت نكمل الطلب رقم ${orderNumber} معك الآن 👍`;
        break;
      default:
        message = `مرحباً، بخصوص الطلب رقم ${orderNumber}. تواصل معنا لأي استفسار.`;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    window.open(
      `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
  };

  const handleMarkComplete = async (followupId: string) => {
    try {
      setCompletingId(followupId);
      await portalApi.completeFollowup(followupId);
      setFollowups((prev) => prev.filter((f) => f.id !== followupId));
    } catch (error) {
      console.error("Failed to complete followup:", error);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="المتابعات"
        description="مركز متابعة ذكي للطلبات التي تحتاج تحصيلاً أو تدخلاً أو تواصلاً سريعاً."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFollowups}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">Followup Queue</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                اعرف فوراً ما يحتاج تواصلاً بشرياً أو إجراءً مالياً قبل أن
                يتأخر.
              </h2>
              <p className="app-hero-band__copy">
                هذه الشاشة تجمع تحصيلات COD، طلبات التقييم، التوصيلات المتأخرة،
                والسلات المتروكة في قائمة واحدة قابلة للتنفيذ، مع انتقال مباشر
                إلى واتساب وإغلاق المتابعة من نفس المكان.
              </p>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                إجمالي المتابعات
              </span>
              <strong className="app-hero-band__metric-value">
                {counts.all}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">تحصيلات COD</span>
              <strong className="app-hero-band__metric-value">
                {counts.cod_collection}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                توصيلات تحتاج مراجعة
              </span>
              <strong className="app-hero-band__metric-value">
                {counts.delivery_check}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">سلات متروكة</span>
              <strong className="app-hero-band__metric-value">
                {counts.abandoned_cart}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* AI Followup Insights */}
      <AiInsightsCard
        title="مساعد المتابعات"
        insights={generateFollowupInsights({
          totalFollowups: followups.length,
          codFollowups: counts.cod_collection,
          overdueCount: followups.filter(
            (f) => f.followup_type === "delivery_check",
          ).length,
        })}
        loading={loading}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Object.entries(FOLLOWUP_CONFIG).map(([key, config]) => {
          const count = followups.filter((f) => f.followup_type === key).length;
          const Icon = config.icon;
          return (
            <Card
              key={key}
              className={cn(
                "app-data-card cursor-pointer transition-all duration-150 ease-in-out hover:-translate-y-0.5",
                activeTab === key &&
                  "ring-2 ring-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]",
              )}
              onClick={() => handleTabChange(activeTab === key ? "all" : key)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", config.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{config.label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="app-data-card app-data-card--muted border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div>
            <span className="font-medium text-foreground">
              تحصيل الدفع عند الاستلام:
            </span>{" "}
            طلب تم تسليمه + طريقة الدفع COD + حالة الدفع غير مدفوعة.
          </div>
          <div>
            <span className="font-medium text-foreground">طلب تقييم:</span> طلب
            تم تسليمه وآخر تحديث أقدم من 3 أيام.
          </div>
          <div>
            <span className="font-medium text-foreground">
              التحقق من التسليم:
            </span>{" "}
            طلب مشحون وآخر تحديث أقدم من 5 أيام.
          </div>
          <div>
            <span className="font-medium text-foreground">
              السلات المتروكة:
            </span>{" "}
            محادثات توقفت بدون إكمال الطلب ويتم جدولة متابعة تلقائية.
          </div>
          <div>
            <span className="font-medium text-foreground">متابعة عامة:</span> أي
            حالة متابعة أخرى مطابقة للشروط العامة.
          </div>
        </CardContent>
      </Card>

      {/* Followups Table */}
      <Card className="app-data-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            {activeTab === "all"
              ? "جميع المتابعات"
              : FOLLOWUP_CONFIG[activeTab]?.label}
          </CardTitle>
          <CardDescription>
            {filteredFollowups.length} متابعة
            {activeTab !== "all" && FOLLOWUP_CONFIG[activeTab] && (
              <span className="ml-2">
                - {FOLLOWUP_CONFIG[activeTab].description}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState message="جاري تحميل المتابعات..." />
          ) : filteredFollowups.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-7 w-7" />}
              title="لا توجد متابعات حالياً"
              description="كل الطلبات المراقبة محدثة حالياً ولا تحتاج إجراء إضافياً."
            />
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredFollowups.map((followup) => {
                  const config =
                    FOLLOWUP_CONFIG[followup.followup_type] ||
                    FOLLOWUP_CONFIG.general;
                  const Icon = config.icon;
                  return (
                    <div
                      key={followup.id}
                      className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--border-strong)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs">
                            {followup.order_number}
                          </p>
                          <p className="mt-1 font-medium">
                            {followup.customer_name}
                          </p>
                          <p
                            className="text-xs text-muted-foreground"
                            dir="ltr"
                          >
                            {followup.customer_phone}
                          </p>
                        </div>
                        <Badge className={cn(config.color, "gap-1")}>
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            المبلغ
                          </p>
                          <p className="font-medium">
                            {formatCurrency(Number(followup.total) || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            الحالة
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline">
                              {FOLLOWUP_STATUS_LABELS[followup.status] ||
                                followup.status ||
                                "متابعة"}
                            </Badge>
                            {followup.payment_method === "COD" && (
                              <Badge variant="outline" className="text-xs">
                                COD
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground">
                            موعد المتابعة
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(
                                followup.scheduled_at || followup.updated_at,
                              )}
                            </span>
                            {followup.is_due === false && (
                              <Badge
                                variant="outline"
                                className="w-fit text-[10px]"
                              >
                                مجدولة
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 w-full sm:w-auto"
                          onClick={() =>
                            handleWhatsApp(
                              followup.customer_phone,
                              followup.followup_type,
                              followup.order_number,
                            )
                          }
                          disabled={!followup.customer_phone}
                        >
                          <MessageSquare className="h-3 w-3" />
                          واتساب
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full gap-1 text-[var(--accent-success)] hover:bg-[var(--accent-success)]/10 hover:text-[var(--accent-success)] sm:w-auto"
                          onClick={() => void handleMarkComplete(followup.id)}
                          disabled={completingId === followup.id}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {completingId === followup.id ? "..." : "تم"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--border-strong)_86%,transparent)] md:block">
                <table className="w-full text-sm" dir="rtl">
                  <thead className="bg-[color:color-mix(in_srgb,var(--surface-muted)_90%,transparent)]">
                    <tr>
                      <th className="p-3 text-right font-medium">رقم الطلب</th>
                      <th className="p-3 text-right font-medium">العميل</th>
                      <th className="p-3 text-right font-medium">المبلغ</th>
                      <th className="p-3 text-right font-medium">الحالة</th>
                      <th className="p-3 text-right font-medium">
                        نوع المتابعة
                      </th>
                      <th className="p-3 text-right font-medium">
                        موعد المتابعة
                      </th>
                      <th className="p-3 text-right font-medium">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFollowups.map((followup) => {
                      const config =
                        FOLLOWUP_CONFIG[followup.followup_type] ||
                        FOLLOWUP_CONFIG.general;
                      const Icon = config.icon;
                      return (
                        <tr
                          key={followup.id}
                          className="border-t border-[color:color-mix(in_srgb,var(--border-strong)_72%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--surface-muted)_60%,transparent)]"
                        >
                          <td className="p-3 font-mono text-xs">
                            {followup.order_number}
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">
                                {followup.customer_name}
                              </p>
                              <p
                                className="text-xs text-muted-foreground"
                                dir="ltr"
                              >
                                {followup.customer_phone}
                              </p>
                            </div>
                          </td>
                          <td className="p-3 font-medium">
                            {formatCurrency(Number(followup.total) || 0)}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">
                              {FOLLOWUP_STATUS_LABELS[followup.status] ||
                                followup.status ||
                                "متابعة"}
                            </Badge>
                            {followup.payment_method === "COD" && (
                              <Badge variant="outline" className="ml-1 text-xs">
                                COD
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge className={cn(config.color, "gap-1")}>
                              <Icon className="h-3 w-3" />
                              {config.label}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(
                                  followup.scheduled_at || followup.updated_at,
                                )}
                              </div>
                              {followup.is_due === false && (
                                <Badge
                                  variant="outline"
                                  className="w-fit text-[10px]"
                                >
                                  مجدولة
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() =>
                                  handleWhatsApp(
                                    followup.customer_phone,
                                    followup.followup_type,
                                    followup.order_number,
                                  )
                                }
                                disabled={!followup.customer_phone}
                              >
                                <MessageSquare className="h-3 w-3" />
                                واتساب
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-[var(--accent-success)] hover:bg-[var(--accent-success)]/10 hover:text-[var(--accent-success)]"
                                onClick={() =>
                                  void handleMarkComplete(followup.id)
                                }
                                disabled={completingId === followup.id}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {completingId === followup.id ? "..." : "تم"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
