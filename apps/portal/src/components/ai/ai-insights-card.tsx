"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Target,
  Shield,
  Zap,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import Link from "next/link";

export type InsightSeverity =
  | "critical"
  | "warning"
  | "success"
  | "info"
  | "tip";

export interface AiInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

const EXPENSE_CATEGORY_AR: Record<string, string> = {
  inventory: "المخزون",
  purchases: "المشتريات",
  purchase: "المشتريات",
  shipping: "الشحن",
  marketing: "التسويق",
  rent: "الإيجار",
  utilities: "المرافق",
  salaries: "الرواتب",
  equipment: "المعدات",
  fees: "الرسوم",
  other: "أخرى",
  المخزون: "المخزون",
  مشتريات: "المشتريات",
  المشتريات: "المشتريات",
  الشحن: "الشحن",
  التسويق: "التسويق",
  الإيجار: "الإيجار",
  المرافق: "المرافق",
  الرواتب: "الرواتب",
  المعدات: "المعدات",
  الرسوم: "الرسوم",
  أخرى: "أخرى",
};

function toArabicExpenseCategory(category: string): string {
  const normalized = category.trim().toLowerCase();
  return (
    EXPENSE_CATEGORY_AR[normalized] || EXPENSE_CATEGORY_AR[category] || "أخرى"
  );
}

function formatInsightNumber(value: number, maxFractionDigits = 1): string {
  return formatNumber(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatInsightPercent(value: number, maxFractionDigits = 1): string {
  return `${formatInsightNumber(value, maxFractionDigits)}%`;
}

const severityConfig: Record<
  InsightSeverity,
  { icon: any; bg: string; border: string; text: string; dot: string }
> = {
  critical: {
    icon: AlertTriangle,
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-900",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-900",
    text: "text-orange-700 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  success: {
    icon: TrendingUp,
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-900",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
  },
  info: {
    icon: Target,
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-900",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  tip: {
    icon: Lightbulb,
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-200 dark:border-purple-900",
    text: "text-purple-700 dark:text-purple-300",
    dot: "bg-purple-500",
  },
};

interface AiInsightsCardProps {
  insights: AiInsight[];
  title?: string;
  className?: string;
  maxVisible?: number;
  loading?: boolean;
}

export function AiInsightsCard({
  insights,
  title = "تنبيهات ذكية",
  className,
  maxVisible = 3,
  loading = false,
}: AiInsightsCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <Card
        className={cn(
          "border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20",
          className,
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-purple-500 animate-pulse" />
            <span className="font-semibold text-purple-700 dark:text-purple-300">
              {title}
            </span>
          </div>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-12 bg-purple-100/50 dark:bg-purple-900/20 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) return null;

  const visible = expanded ? insights : insights.slice(0, maxVisible);
  const hasMore = insights.length > maxVisible;

  return (
    <Card
      className={cn(
        "border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20",
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <span className="font-semibold text-purple-700 dark:text-purple-300">
              {title}
            </span>
            <span className="text-xs text-muted-foreground bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">
              {insights.length} {insights.length === 1 ? "توصية" : "توصيات"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span>مُولّد تلقائياً</span>
          </div>
        </div>

        <div className="space-y-2">
          {visible.map((insight) => {
            const config = severityConfig[insight.severity];
            const Icon = config.icon;
            return (
              <div
                key={insight.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  config.bg,
                  config.border,
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 h-2 w-2 rounded-full shrink-0",
                    config.dot,
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", config.text)}>
                    {insight.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {insight.description}
                  </p>
                </div>
                {insight.actionLabel && insight.actionHref && (
                  <Link href={insight.actionHref}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn("text-xs shrink-0 h-7", config.text)}
                    >
                      {insight.actionLabel}
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-purple-600 dark:text-purple-300 hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 ml-1" />
                عرض أقل
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 ml-1" />
                عرض {insights.length - maxVisible} توصيات أخرى
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ============== INSIGHT GENERATORS ==============
// Rule-based insight generators that analyze page data to produce helpful AI-style tips.

export function generateOrderInsights(data: {
  totalOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  deliveredOrders: number;
  pendingOrders: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalOrders === 0) {
    insights.push({
      id: "no-orders",
      severity: "info",
      title: "لا توجد طلبات بعد",
      description:
        "ابدأ بمشاركة رابط المتجر مع العملاء عبر واتساب لاستقبال أول طلب.",
      actionLabel: "إعداد واتساب",
      actionHref: "/merchant/settings",
    });
    return insights;
  }

  const cancelRate =
    data.totalOrders > 0 ? (data.cancelledOrders / data.totalOrders) * 100 : 0;
  if (cancelRate > 15) {
    insights.push({
      id: "high-cancel-rate",
      severity: "critical",
      title: `معدل إلغاء مرتفع (${formatInsightPercent(cancelRate, 0)})`,
      description:
        "معدل الإلغاء أعلى من 15%. تحقق من أسباب الإلغاء — قد تكون مشاكل في التسليم أو عدم وضوح المنتج.",
      actionLabel: "تحليل الطلبات",
      actionHref: "/merchant/analytics",
    });
  } else if (cancelRate < 5 && data.totalOrders > 10) {
    insights.push({
      id: "low-cancel-rate",
      severity: "success",
      title: `معدل إلغاء منخفض (${formatInsightPercent(cancelRate, 0)}) 👏`,
      description:
        "أداء ممتاز! معدل الإلغاء أقل من 5% مما يدل على رضا العملاء.",
    });
  }

  if (data.pendingOrders > 5) {
    insights.push({
      id: "pending-orders",
      severity: "warning",
      title: `${data.pendingOrders} طلب في الانتظار`,
      description:
        "لديك طلبات تنتظر التأكيد أو الشحن. سرعة المعالجة تحسّن تجربة العميل.",
    });
  }

  if (data.averageOrderValue > 0 && data.averageOrderValue < 50) {
    insights.push({
      id: "low-aov",
      severity: "tip",
      title: "زيادة متوسط قيمة الطلب",
      description:
        'جرّب تقديم عروض "اشترِ 2 واحصل على خصم" أو حد أدنى للتوصيل المجاني لرفع قيمة السلة.',
      actionLabel: "إنشاء حملة",
      actionHref: "/merchant/campaigns",
    });
  }

  return insights;
}

export function generateCfoInsights(data: {
  revenue: number;
  expenses: number;
  profit: number;
  orderCount: number;
  aov: number;
  codPercentage: number;
  uniqueCustomers: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.revenue === 0 && data.orderCount === 0) {
    insights.push({
      id: "no-data",
      severity: "info",
      title: "لا توجد بيانات مالية بعد",
      description: "ستظهر التحليلات المالية تلقائياً بعد استقبال أول طلب.",
    });
    return insights;
  }

  // Profit margin analysis
  const profitMargin =
    data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
  if (profitMargin < 10 && data.revenue > 0) {
    insights.push({
      id: "low-margin",
      severity: "critical",
      title: `هامش ربح منخفض (${formatInsightPercent(profitMargin, 1)})`,
      description:
        "هامش الربح أقل من 10%. راجع تكاليف التشغيل والتوصيل، وفكّر في رفع الأسعار أو تقليل المصاريف.",
      actionLabel: "مراجعة المصاريف",
      actionHref: "/merchant/expenses",
    });
  } else if (profitMargin > 30) {
    insights.push({
      id: "healthy-margin",
      severity: "success",
      title: `هامش ربح صحي (${formatInsightPercent(profitMargin, 1)})`,
      description:
        "أداء مالي جيد! حافظ على هذا المستوى واستثمر الفائض في التسويق.",
    });
  }

  // COD dependency
  if (data.codPercentage > 70) {
    insights.push({
      id: "cod-heavy",
      severity: "warning",
      title: `اعتماد كبير على الدفع عند الاستلام (${formatInsightPercent(data.codPercentage, 0)})`,
      description:
        "أكثر من 70% من طلباتك بالدفع عند الاستلام. فعّل بوابات الدفع الإلكتروني لتقليل المخاطر وتسريع التحصيل.",
      actionLabel: "إعداد الدفع",
      actionHref: "/merchant/settings",
    });
  }

  // Expense ratio
  if (data.expenses > 0 && data.revenue > 0) {
    const expenseRatio = (data.expenses / data.revenue) * 100;
    if (expenseRatio > 60) {
      insights.push({
        id: "high-expenses",
        severity: "warning",
        title: `مصاريف مرتفعة (${formatInsightPercent(expenseRatio, 0)} من الإيرادات)`,
        description:
          "المصاريف تستهلك أكثر من 60% من الإيرادات. حلل أكبر بنود المصاريف عبر صفحة المصاريف.",
        actionLabel: "تحليل المصاريف",
        actionHref: "/merchant/expenses",
      });
    }
  }

  // Customer concentration
  if (data.uniqueCustomers > 0 && data.orderCount > 0) {
    const ordersPerCustomer = data.orderCount / data.uniqueCustomers;
    if (ordersPerCustomer < 1.2 && data.uniqueCustomers > 20) {
      insights.push({
        id: "low-repeat",
        severity: "tip",
        title: "معدل إعادة الشراء منخفض",
        description:
          "معظم عملائك يطلبون مرة واحدة فقط. جرّب برنامج ولاء أو حملات إعادة التفاعل.",
        actionLabel: "برنامج الولاء",
        actionHref: "/merchant/loyalty",
      });
    } else if (ordersPerCustomer > 2) {
      insights.push({
        id: "good-repeat",
        severity: "success",
        title: "معدل إعادة شراء ممتاز 🔄",
        description: `متوسط ${formatInsightNumber(ordersPerCustomer, 1)} طلب لكل عميل. عملاؤك يعودون!`,
      });
    }
  }

  return insights;
}

export function generateExpenseInsights(data: {
  totalExpenses: number;
  expensesByCategory: Record<string, number>;
  monthlyTrend: number[]; // last 3 months
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalExpenses === 0) {
    insights.push({
      id: "no-expenses",
      severity: "tip",
      title: "سجّل مصاريفك لتحليل أفضل",
      description:
        "إضافة المصاريف يساعدك على فهم هامش الربح الحقيقي وتحديد فرص التوفير.",
    });
    return insights;
  }

  // Find top expense category
  const sortedCategories = Object.entries(data.expensesByCategory).sort(
    (a, b) => b[1] - a[1],
  );
  if (sortedCategories.length > 0) {
    const [topCat, topAmount] = sortedCategories[0];
    const percentage = (topAmount / data.totalExpenses) * 100;
    if (percentage > 50) {
      const topCategoryAr = toArabicExpenseCategory(topCat);
      insights.push({
        id: "dominant-category",
        severity: "warning",
        title: `${topCategoryAr} يستهلك ${formatInsightPercent(percentage, 0)} من المصاريف`,
        description:
          "بند واحد يسيطر على أكثر من نصف مصاريفك. ابحث عن بدائل أقل تكلفة أو فاوض الموردين.",
      });
    }
  }

  // Monthly trend
  if (data.monthlyTrend.length >= 2) {
    const latest = data.monthlyTrend[data.monthlyTrend.length - 1];
    const previous = data.monthlyTrend[data.monthlyTrend.length - 2];
    if (previous > 0 && latest > previous * 1.3) {
      const increase = ((latest - previous) / previous) * 100;
      insights.push({
        id: "spending-spike",
        severity: "warning",
        title: `ارتفاع المصاريف ${formatInsightPercent(increase, 0)} عن الشهر السابق`,
        description: "تحقق من سبب الزيادة — هل هي موسمية أم مصاريف غير متوقعة؟",
      });
    } else if (previous > 0 && latest < previous * 0.8) {
      insights.push({
        id: "spending-decrease",
        severity: "success",
        title: "انخفاض المصاريف 📉",
        description: `المصاريف انخفضت مقارنة بالشهر السابق. استمر في ضبط الميزانية!`,
      });
    }
  }

  return insights;
}

export function generateDashboardInsights(data: {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  lowStockCount: number;
  unreadNotifications: number;
  activeConversations: number;
  periodLabel?: string;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  const periodLabel = data.periodLabel || "الفترة المحددة";
  const isTodayPeriod = periodLabel === "اليوم";
  const periodPhrase = isTodayPeriod ? "اليوم" : `خلال ${periodLabel}`;

  if (data.pendingOrders > 3) {
    insights.push({
      id: "pending-action",
      severity: "warning",
      title: `${data.pendingOrders} طلب ينتظر إجراءك`,
      description:
        "تأخير تأكيد الطلبات يؤثر على رضا العملاء. أكّد الطلبات المعلقة الآن.",
      actionLabel: "عرض الطلبات",
      actionHref: "/merchant/orders",
    });
  }

  if (data.lowStockCount > 0) {
    insights.push({
      id: "low-stock",
      severity: "critical",
      title: `${data.lowStockCount} منتج قارب على النفاد`,
      description:
        "منتجات بمخزون منخفض قد تتسبب في خسارة مبيعات. اطلب إعادة تعبئة فوراً.",
      actionLabel: "عرض المخزون",
      actionHref: "/merchant/inventory-insights",
    });
  }

  if (data.activeConversations > 5) {
    insights.push({
      id: "active-conversations",
      severity: "info",
      title: `${data.activeConversations} محادثة نشطة ${periodPhrase}`,
      description:
        "لديك محادثات مفتوحة مع عملاء. الرد السريع على المحادثات يزيد معدل التحويل.",
      actionLabel: "المحادثات",
      actionHref: "/merchant/conversations",
    });
  }

  if (data.todayOrders === 0) {
    insights.push({
      id: "no-orders-today",
      severity: "tip",
      title: isTodayPeriod
        ? "لا طلبات اليوم حتى الآن"
        : `لا طلبات ${periodPhrase}`,
      description:
        "جرّب إرسال حملة ترويجية عبر واتساب لتحفيز العملاء على الطلب.",
      actionLabel: "إنشاء حملة",
      actionHref: "/merchant/campaigns",
    });
  } else if (data.todayOrders > 0) {
    insights.push({
      id: "today-summary",
      severity: "success",
      title: `${data.todayOrders} طلب ${periodPhrase}`,
      description: isTodayPeriod
        ? `تم تحقيق إيرادات بقيمة ${formatInsightNumber(data.todayRevenue, 0)} ج.م حتى الآن.`
        : `تم تحقيق إيرادات بقيمة ${formatInsightNumber(data.todayRevenue, 0)} ج.م ${periodPhrase}.`,
    });
  }

  return insights;
}

export function generateCampaignInsights(data: {
  totalCampaigns: number;
  activeCampaigns: number;
  avgResponseRate?: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalCampaigns === 0) {
    insights.push({
      id: "no-campaigns",
      severity: "tip",
      title: "ابدأ أول حملة تسويقية",
      description:
        "الحملات عبر واتساب تحقق معدل فتح أعلى من 90%. جرّب إرسال عرض خاص لعملائك.",
    });
  }

  if (data.activeCampaigns > 3) {
    insights.push({
      id: "many-campaigns",
      severity: "warning",
      title: "عدد كبير من الحملات النشطة",
      description:
        "كثرة الرسائل قد تزعج العملاء. ركّز على 1-2 حملة فعّالة بدلاً من عدة حملات متفرقة.",
    });
  }

  return insights;
}

export function generateFollowupInsights(data: {
  totalFollowups: number;
  codFollowups: number;
  overdueCount: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalFollowups === 0) {
    insights.push({
      id: "all-clear",
      severity: "success",
      title: "لا متابعات معلقة 🎉",
      description: "جميع الطلبات محدثة. استمر في هذا الأداء!",
    });
    return insights;
  }

  if (data.codFollowups > 0) {
    insights.push({
      id: "cod-pending",
      severity: "warning",
      title: `${data.codFollowups} طلب COD بحاجة تحصيل`,
      description:
        "تأخير تحصيل مبالغ الدفع عند الاستلام يؤثر على التدفق النقدي. تابع مع شركات الشحن.",
      actionLabel: "تسوية COD",
      actionHref: "/merchant/payments/cod",
    });
  }

  if (data.overdueCount > 3) {
    insights.push({
      id: "overdue",
      severity: "critical",
      title: `${data.overdueCount} متابعات متأخرة`,
      description:
        "هذه الطلبات تحتاج اهتمامك الفوري. تواصل مع العملاء لتجنب شكاوى.",
    });
  }

  insights.push({
    id: "automation-tip",
    severity: "tip",
    title: "فعّل المتابعة التلقائية",
    description:
      "الذكاء الاصطناعي يمكنه إرسال رسائل متابعة تلقائية عبر واتساب بدلاً من المتابعة اليدوية.",
    actionLabel: "الإعدادات",
    actionHref: "/merchant/settings",
  });

  return insights;
}

// ── Analytics Insights ──
export function generateAnalyticsInsights(data: {
  conversionRate?: number;
  avgResponseTime?: number;
  topProductCount?: number;
  peakHour?: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.conversionRate !== undefined) {
    if (data.conversionRate < 5) {
      insights.push({
        id: "low-conversion",
        severity: "critical",
        title: `معدل التحويل ${formatInsightPercent(data.conversionRate, 1)} — منخفض جداً`,
        description:
          "أقل من 5% من الزوار يشترون. حسّن صفحات المنتجات وسرعة الرد على الاستفسارات.",
        actionLabel: "تحسين المحادثات",
        actionHref: "/merchant/conversations",
      });
    } else if (data.conversionRate > 15) {
      insights.push({
        id: "high-conversion",
        severity: "success",
        title: `معدل التحويل ${formatInsightPercent(data.conversionRate, 1)} — ممتاز!`,
        description:
          "أداء ممتاز في تحويل الزوار لعملاء. استمر في هذه الاستراتيجية.",
      });
    }
  }

  if (data.avgResponseTime !== undefined && data.avgResponseTime > 30) {
    insights.push({
      id: "slow-response",
      severity: "warning",
      title: `متوسط الرد ${formatInsightNumber(data.avgResponseTime, 1)} دقيقة`,
      description:
        "سرعة الرد تؤثر على قرار الشراء. حاول الرد خلال 5 دقائق باستخدام المساعد الذكي.",
      actionLabel: "المساعد الذكي",
      actionHref: "/merchant/assistant",
    });
  }

  if (data.peakHour !== undefined) {
    insights.push({
      id: "peak-hour",
      severity: "info",
      title: `ذروة النشاط الساعة ${data.peakHour}:00`,
      description:
        "ركّز حملاتك التسويقية ورسائل واتساب حول هذا التوقيت لأعلى تفاعل.",
    });
  }

  if (
    Object.keys(data).length === 0 ||
    (!data.conversionRate && !data.avgResponseTime)
  ) {
    insights.push({
      id: "analytics-empty",
      severity: "tip",
      title: "جمّع بيانات أكثر",
      description:
        "كلما زاد عدد الطلبات والمحادثات، أصبحت التحليلات أدق وأكثر فائدة.",
    });
  }

  return insights;
}

// ── Reports Insights ──
export function generateReportsInsights(data: {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  topStatus?: string;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalOrders > 0 && data.avgOrderValue < 100) {
    insights.push({
      id: "low-aov",
      severity: "warning",
      title: `متوسط الطلب ${formatInsightNumber(data.avgOrderValue, 0)} ج.م — يمكن تحسينه`,
      description:
        'جرّب عروض "اشترِ 2 واحصل على خصم" أو أضف منتجات مكمّلة لرفع قيمة السلة.',
    });
  }

  if (data.totalOrders === 0) {
    insights.push({
      id: "no-data",
      severity: "tip",
      title: "لا بيانات لهذه الفترة",
      description:
        "جرّب تغيير نطاق التاريخ لعرض التقارير، أو ابدأ ببيع منتجاتك.",
    });
  }

  insights.push({
    id: "export-tip",
    severity: "tip",
    title: "صدّر تقاريرك للمحاسب",
    description:
      "يمكنك تصدير تقرير مفصل بصيغة PDF أو Excel لمشاركته مع المحاسب.",
    actionLabel: "تقرير المحاسب",
    actionHref: "/merchant/reports/accountant",
  });

  return insights;
}

// ── COD/Payments Insights ──
export function generateCodInsights(data: {
  pendingAmount: number;
  collectedAmount: number;
  disputedAmount: number;
  totalOrders: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.pendingAmount > 0) {
    insights.push({
      id: "cod-pending",
      severity: "warning",
      title: `${formatInsightNumber(data.pendingAmount, 0)} ج.م معلّقة للتحصيل`,
      description:
        "تابع مع شركات الشحن لتسوية المبالغ المعلقة وتحسين التدفق النقدي.",
    });
  }

  if (data.disputedAmount > 0) {
    insights.push({
      id: "cod-disputed",
      severity: "critical",
      title: `${formatInsightNumber(data.disputedAmount, 0)} ج.م متنازع عليها`,
      description:
        "هناك مبالغ بها خلاف مع شركات الشحن. راجع التفاصيل وقدّم المستندات اللازمة.",
    });
  }

  if (data.collectedAmount > 0 && data.pendingAmount === 0) {
    insights.push({
      id: "cod-clear",
      severity: "success",
      title: "جميع مبالغ COD محصّلة ✅",
      description: "لا توجد مبالغ معلقة. أداء ممتاز في إدارة التدفق النقدي.",
    });
  }

  insights.push({
    id: "cod-tip",
    severity: "tip",
    title: "فعّل تذكيرات التحصيل",
    description:
      "النظام يمكنه إرسال تذكيرات تلقائية لشركات الشحن عند تأخر التسوية.",
    actionLabel: "الإعدادات",
    actionHref: "/merchant/settings",
  });

  return insights;
}

// ── Customer Segments Insights ──
export function generateSegmentInsights(data: {
  totalSegments: number;
  totalCustomersInSegments: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalSegments === 0) {
    insights.push({
      id: "no-segments",
      severity: "tip",
      title: "أنشئ شريحة عملاء ذكية",
      description:
        "تقسيم العملاء لشرائح يساعدك على إرسال رسائل مخصصة وحملات أكثر فعالية.",
    });
  } else {
    insights.push({
      id: "segment-count",
      severity: "info",
      title: `${data.totalSegments} شريحة تشمل ${data.totalCustomersInSegments} عميل`,
      description:
        "استخدم الشرائح لإطلاق حملات مستهدفة — الرسائل المخصصة تحقق تفاعل أعلى بـ3 أضعاف.",
      actionLabel: "إنشاء حملة",
      actionHref: "/merchant/campaigns",
    });
  }

  insights.push({
    id: "segment-ai",
    severity: "tip",
    title: "الذكاء الاصطناعي يقترح شرائح",
    description:
      'بناءً على سجل الطلبات، يمكن للنظام اقتراح شرائح مثل "عملاء VIP" و"عملاء خاملين".',
  });

  return insights;
}

// ── Loyalty Insights ──
export function generateLoyaltyInsights(data: {
  totalMembers: number;
  activeMembers: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalMembers === 0) {
    insights.push({
      id: "no-loyalty",
      severity: "tip",
      title: "ابدأ برنامج الولاء",
      description:
        "برامج الولاء تزيد معدل عودة العملاء بنسبة 60%. أنشئ مستويات ومكافآت جذابة.",
    });
    return insights;
  }

  const redemptionRate =
    data.totalPointsIssued > 0
      ? (data.totalPointsRedeemed / data.totalPointsIssued) * 100
      : 0;
  if (redemptionRate < 20) {
    insights.push({
      id: "low-redemption",
      severity: "warning",
      title: `معدل استخدام النقاط ${formatInsightPercent(redemptionRate, 0)} فقط`,
      description:
        "العملاء لا يستخدمون نقاطهم. ذكّرهم عبر واتساب بالمكافآت المتاحة.",
      actionLabel: "إرسال تذكير",
      actionHref: "/merchant/push-notifications",
    });
  }

  const activeRate =
    data.totalMembers > 0 ? (data.activeMembers / data.totalMembers) * 100 : 0;
  if (activeRate < 50) {
    insights.push({
      id: "inactive-members",
      severity: "info",
      title: `${formatInsightPercent(100 - activeRate, 0)} من الأعضاء غير نشطين`,
      description:
        "أعد تفعيل الأعضاء الخاملين بعروض خاصة أو نقاط مضاعفة لفترة محدودة.",
    });
  }

  return insights;
}

// ── Billing Insights ──
export function generateBillingInsights(data: {
  plan?: string;
  status?: string;
  nextBillingDate?: string;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.plan === "free" || data.plan === "trial") {
    insights.push({
      id: "upgrade-plan",
      severity: "info",
      title: "أنت على الباقة المجانية",
      description:
        "ترقية الباقة تفتح ميزات AI متقدمة مثل المساعد الصوتي وتحليلات مفصلة.",
      actionLabel: "عرض الباقات",
      actionHref: "/merchant/plan",
    });
  }

  if (data.nextBillingDate) {
    const nextDate = new Date(data.nextBillingDate);
    const daysLeft = Math.ceil(
      (nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysLeft <= 3 && daysLeft > 0) {
      insights.push({
        id: "billing-soon",
        severity: "warning",
        title: `التجديد بعد ${daysLeft} أيام`,
        description: "تأكد من وجود رصيد كافٍ لتجنب انقطاع الخدمة.",
      });
    }
  }

  insights.push({
    id: "billing-tip",
    severity: "tip",
    title: "راجع استهلاكك الشهري",
    description:
      "تتبع استخدام الرسائل والمحادثات لضمان أنك على الباقة المناسبة لحجم أعمالك.",
  });

  return insights;
}

// ── Notifications Insights ──
export function generateNotificationsInsights(data: {
  unreadCount: number;
  totalNotifications: number;
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.unreadCount > 10) {
    insights.push({
      id: "many-unread",
      severity: "warning",
      title: `${data.unreadCount} إشعار غير مقروء`,
      description:
        "إشعارات كثيرة غير مقروءة قد تعني فقدان معلومات مهمة. راجعها الآن.",
    });
  }

  if (!data.whatsappEnabled) {
    insights.push({
      id: "enable-whatsapp",
      severity: "info",
      title: "فعّل إشعارات واتساب",
      description:
        "تلقَّ تنبيهات فورية عن الطلبات الجديدة والمحادثات مباشرة على واتساب.",
      actionLabel: "الإعدادات",
      actionHref: "/merchant/settings",
    });
  }

  if (!data.emailEnabled) {
    insights.push({
      id: "enable-email",
      severity: "tip",
      title: "فعّل إشعارات البريد",
      description:
        "البريد الإلكتروني مفيد للتقارير اليومية والأسبوعية وملخصات الأداء.",
    });
  }

  return insights;
}

// ── Quotes Insights ──
export function generateQuotesInsights(data: {
  totalQuotes: number;
  pendingQuotes: number;
  acceptedQuotes: number;
  rejectedQuotes: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.pendingQuotes > 3) {
    insights.push({
      id: "pending-quotes",
      severity: "warning",
      title: `${data.pendingQuotes} طلب عرض سعر بانتظار ردك`,
      description: "تأخير الرد يقلل فرصة إتمام الصفقة. حاول الرد خلال 24 ساعة.",
    });
  }

  if (data.totalQuotes > 5 && data.rejectedQuotes > data.acceptedQuotes) {
    insights.push({
      id: "high-rejection",
      severity: "critical",
      title: "معدل الرفض أعلى من القبول",
      description:
        "العملاء يرفضون عروضك. راجع أسعارك أو أضف قيمة إضافية للعروض.",
    });
  }

  if (data.totalQuotes === 0) {
    insights.push({
      id: "no-quotes",
      severity: "tip",
      title: "لا طلبات عروض أسعار",
      description:
        "فعّل ميزة طلب عرض سعر في متجرك ليتمكن العملاء من طلب أسعار مخصصة.",
    });
  }

  return insights;
}

// ── Security Insights ──
export function generateSecurityInsights(data: {
  twoFactorEnabled?: boolean;
  activeSessions: number;
  lastPasswordChange?: string;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (!data.twoFactorEnabled) {
    insights.push({
      id: "enable-2fa",
      severity: "critical",
      title: "المصادقة الثنائية غير مفعّلة",
      description:
        "حسابك معرض للاختراق. فعّل المصادقة الثنائية لحماية بياناتك وبيانات عملائك.",
    });
  }

  if (data.activeSessions > 3) {
    insights.push({
      id: "many-sessions",
      severity: "warning",
      title: `${data.activeSessions} جلسات نشطة`,
      description:
        "تحقق من الجلسات النشطة وأنهِ أي جلسات مشبوهة أو غير مستخدمة.",
    });
  }

  if (data.lastPasswordChange) {
    const daysSince = Math.floor(
      (Date.now() - new Date(data.lastPasswordChange).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysSince > 90) {
      insights.push({
        id: "old-password",
        severity: "warning",
        title: `آخر تغيير كلمة مرور منذ ${daysSince} يوم`,
        description:
          "يُنصح بتغيير كلمة المرور كل 90 يوم للحفاظ على أمان الحساب.",
        actionLabel: "تغيير كلمة المرور",
        actionHref: "/merchant/change-password",
      });
    }
  }

  return insights;
}

// ── Audit Insights ──
export function generateAuditInsights(data: {
  totalLogs: number;
  staffCount: number;
  recentActions: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.recentActions > 50) {
    insights.push({
      id: "high-activity",
      severity: "info",
      title: `${data.recentActions} إجراء مسجّل مؤخراً`,
      description:
        "نشاط كبير — تأكد من أن جميع الإجراءات مصرّح بها ومن فريقك فقط.",
    });
  }

  if (data.staffCount > 1) {
    insights.push({
      id: "team-audit",
      severity: "tip",
      title: "راقب نشاط فريقك",
      description: "راجع سجل النشاط بانتظام لضمان التزام الفريق بسياسات العمل.",
      actionLabel: "إدارة الفريق",
      actionHref: "/merchant/team",
    });
  }

  if (data.totalLogs === 0) {
    insights.push({
      id: "no-logs",
      severity: "tip",
      title: "لا سجلات نشاط بعد",
      description: "سجل النشاط يسجل كل الإجراءات تلقائياً لمراجعتها لاحقاً.",
    });
  }

  return insights;
}

// ── Team Insights ──
export function generateTeamInsights(data: {
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.totalStaff === 1) {
    insights.push({
      id: "solo",
      severity: "tip",
      title: "أنت تعمل وحدك",
      description: "أضف أعضاء فريق لتوزيع المهام — محادثات، طلبات، ومتابعات.",
    });
  }

  if (data.inactiveStaff > 0) {
    insights.push({
      id: "inactive-staff",
      severity: "warning",
      title: `${data.inactiveStaff} عضو غير نشط`,
      description:
        "أعضاء غير نشطين يمثلون خطراً أمنياً. أوقف حساباتهم أو احذفها.",
    });
  }

  insights.push({
    id: "roles-tip",
    severity: "info",
    title: "استخدم الأدوار والصلاحيات",
    description:
      "حدد صلاحيات كل عضو (مشاهدة فقط، تعديل، إدارة) لحماية بياناتك.",
  });

  return insights;
}

// ── Payments Insights ──
export function generatePaymentsInsights(data: {
  totalLinks: number;
  pendingProofs: number;
  totalProofs: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.pendingProofs > 0) {
    insights.push({
      id: "pending-proofs",
      severity: "warning",
      title: `${data.pendingProofs} إثبات دفع بانتظار المراجعة`,
      description:
        "راجع إثباتات الدفع المعلقة لتأكيد الطلبات وتجنب تأخير الشحن.",
      actionLabel: "مراجعة الإثباتات",
      actionHref: "/merchant/payments/proofs",
    });
  }

  if (data.totalLinks === 0) {
    insights.push({
      id: "no-payment-links",
      severity: "tip",
      title: "أنشئ رابط دفع",
      description:
        "روابط الدفع تسهّل على العملاء الدفع إلكترونياً وتقلل الاعتماد على الدفع عند الاستلام.",
    });
  }

  return insights;
}

// ── Import/Export Insights ──
export function generateImportExportInsights(data: {
  totalOperations: number;
  failedOperations: number;
  lastOperationType?: string;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.failedOperations > 0) {
    insights.push({
      id: "failed-ops",
      severity: "critical",
      title: `${data.failedOperations} عملية فشلت`,
      description:
        "تحقق من صيغة الملف والأعمدة المطلوبة. تأكد أن البيانات تتوافق مع النظام.",
    });
  }

  insights.push({
    id: "import-tip",
    severity: "tip",
    title: "استورد بياناتك بسرعة",
    description:
      "يمكنك رفع ملف Excel لاستيراد المنتجات والعملاء والطلبات دفعة واحدة.",
  });

  return insights;
}

// ── Webhooks Insights ──
export function generateWebhooksInsights(data: {
  totalWebhooks: number;
  activeWebhooks: number;
  failureCount: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];

  if (data.failureCount > 0) {
    insights.push({
      id: "webhook-failures",
      severity: "critical",
      title: `${data.failureCount} فشل في إرسال Webhook`,
      description:
        "تحقق من صحة عنوان URL وأن الخادم الطرف الآخر يستجيب بشكل صحيح.",
    });
  }

  if (data.totalWebhooks === 0) {
    insights.push({
      id: "no-webhooks",
      severity: "tip",
      title: "ربط النظام بأدوات خارجية",
      description:
        "Webhooks تمكنك من إرسال بيانات الطلبات تلقائياً لنظام ERP أو محاسبة.",
    });
  }

  return insights;
}

// ── Generic Page Insights (for static/config pages) ──
export function generateGenericPageInsights(
  data:
    | string
    | {
        pageName: string;
        hasData?: boolean;
      },
): AiInsight[] {
  const insights: AiInsight[] = [];

  insights.push({
    id: "ai-help",
    severity: "info",
    title: "المساعد الذكي متاح دائماً",
    description:
      "يمكنك سؤال المساعد الذكي عن أي شيء يتعلق بنشاطك التجاري — مبيعات، مخزون، أو نصائح نمو.",
    actionLabel: "افتح المساعد",
    actionHref: "/merchant/assistant",
  });

  return insights;
}

// ── Conversations Insights ──
export function generateConversationInsights(data: {
  totalConversations: number;
  activeConversations: number;
  avgResponseTime: number;
  unreadCount: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (data.unreadCount > 5) {
    insights.push({
      id: "unread-conv",
      severity: "warning",
      title: `${data.unreadCount} محادثة غير مقروءة`,
      description:
        "الرد السريع على العملاء يزيد معدل التحويل بنسبة 30% أو أكتر.",
    });
  }
  if (data.activeConversations > 10) {
    insights.push({
      id: "active-conv",
      severity: "info",
      title: `${data.activeConversations} محادثة نشطة`,
      description:
        "البوت الذكي بيتولى الردود تلقائياً — ركز على المحادثات اللي محتاجة تدخل بشري.",
    });
  }
  if (data.avgResponseTime > 5) {
    insights.push({
      id: "slow-response",
      severity: "warning",
      title: "وقت الرد بطيء",
      description: `متوسط الرد ${formatInsightNumber(data.avgResponseTime, 1)} دقائق. حاول تخليه أقل من 3 دقائق لزيادة المبيعات.`,
    });
  }
  if (data.totalConversations === 0) {
    insights.push({
      id: "no-conv",
      severity: "tip",
      title: "ابدأ التواصل مع عملاءك",
      description: "فعّل بوت واتساب عشان العملاء يقدروا يتواصلوا معاك 24/7.",
    });
  }
  return insights;
}

// ── Customers Insights ──
export function generateCustomerInsights(data: {
  totalCustomers: number;
  vipCount: number;
  newThisMonth: number;
  repeatRate: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (data.repeatRate < 20) {
    insights.push({
      id: "low-repeat",
      severity: "warning",
      title: "معدل العملاء المتكررين منخفض",
      description: `${formatInsightPercent(data.repeatRate, 1)} بس من عملاءك بيرجعوا. جرب برنامج ولاء أو حملات متابعة.`,
      actionLabel: "برنامج الولاء",
      actionHref: "/merchant/loyalty",
    });
  }
  if (data.vipCount === 0 && data.totalCustomers > 10) {
    insights.push({
      id: "no-vip",
      severity: "tip",
      title: "صنّف عملاءك المميزين",
      description:
        "علّم أفضل عملاءك كـ VIP — ده بيساعد في التسعير والعروض الشخصية.",
    });
  }
  if (data.newThisMonth > 0) {
    insights.push({
      id: "new-customers",
      severity: "success",
      title: `${data.newThisMonth} عميل جديد هذا الشهر`,
      description: "استمر في التسويق والمتابعة لتحويلهم لعملاء دائمين.",
    });
  }
  return insights;
}

// ── Inventory Insights ──
export function generateInventoryInsights(data: {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalValue: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (data.outOfStockCount > 0) {
    insights.push({
      id: "out-of-stock",
      severity: "critical",
      title: `${data.outOfStockCount} منتج نفد من المخزون`,
      description:
        "المنتجات النافذة بتضيع مبيعات حقيقية. أعد الطلب من المورد دلوقتي.",
      actionLabel: "إعادة طلب",
      actionHref: "/merchant/inventory",
    });
  }
  if (data.lowStockCount > 0) {
    insights.push({
      id: "low-stock",
      severity: "warning",
      title: `${data.lowStockCount} منتج بمخزون منخفض`,
      description: "منتجات قربت تخلص — اطلبها قبل ما تنفذ وتفقد مبيعات.",
    });
  }
  if (data.totalProducts === 0) {
    insights.push({
      id: "no-products",
      severity: "tip",
      title: "أضف منتجاتك للكتالوج",
      description: "البوت محتاج المنتجات عشان يقدر يبيع للعملاء تلقائياً.",
      actionLabel: "إضافة منتج",
      actionHref: "/merchant/inventory",
    });
  }
  return insights;
}

// ── Settings Insights ──
export function generateSettingsInsights(data: {
  hasKnowledgeBase: boolean;
  hasPayoutSetup: boolean;
  hasDeliveryRules: boolean;
  hasWorkingHours: boolean;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (!data.hasKnowledgeBase) {
    insights.push({
      id: "no-kb",
      severity: "warning",
      title: "أضف معلومات نشاطك",
      description:
        "قاعدة المعرفة بتخلي البوت يرد على أسئلة العملاء بذكاء أكتر (ساعات العمل، سياسة الإرجاع، إلخ).",
      actionLabel: "قاعدة المعرفة",
      actionHref: "/merchant/knowledge-base",
    });
  }
  if (!data.hasPayoutSetup) {
    insights.push({
      id: "no-payout",
      severity: "tip",
      title: "إعداد طرق التحصيل",
      description:
        "أضف بيانات إنستاباي أو فودافون كاش عشان العملاء يقدروا يدفعوا بسهولة.",
    });
  }
  if (!data.hasDeliveryRules) {
    insights.push({
      id: "no-delivery",
      severity: "tip",
      title: "حدد قواعد التوصيل",
      description: "حدد رسوم التوصيل والمناطق عشان البوت يحسب الإجمالي صح.",
    });
  }
  return insights;
}

// ── KPIs Insights ──
export function generateKpiInsights(data: {
  conversionRate: number;
  avgOrderValue: number;
  customerSatisfaction: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (data.conversionRate < 5) {
    insights.push({
      id: "low-conversion",
      severity: "warning",
      title: `معدل التحويل ${formatInsightPercent(data.conversionRate, 1)}`,
      description:
        "أقل من المتوسط. حسّن سرعة الرد وأضف عروض مغرية لزيادة المبيعات.",
    });
  }
  if (data.avgOrderValue > 0) {
    insights.push({
      id: "aov-tip",
      severity: "info",
      title: `متوسط قيمة الطلب: ${formatInsightNumber(data.avgOrderValue, 0)} ج.م`,
      description:
        "جرب عروض باقات أو توصيل مجاني للطلبات الكبيرة لزيادة هذا الرقم.",
    });
  }
  return insights;
}

// ── Plan/Pricing Insights ──
export function generatePlanInsights(data: {
  currentPlan: string;
  usagePercent: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (data.usagePercent > 80) {
    insights.push({
      id: "high-usage",
      severity: "warning",
      title: "اقتربت من حدود خطتك",
      description: `استهلكت ${formatInsightPercent(data.usagePercent, 1)} من حدود خطتك. ترقية الخطة بتديك مساحة أكبر.`,
      actionLabel: "ترقية",
      actionHref: "/merchant/plan",
    });
  }
  insights.push({
    id: "plan-tip",
    severity: "info",
    title: "تعرف على مميزات خطتك",
    description:
      "كل خطة بتديك وكلاء وقدرات ذكية مختلفة — اتأكد إنك مستفيد من كل المميزات.",
  });
  return insights;
}

// ── OCR Review Insights ──
export function generateOcrInsights(data: {
  pendingReview: number;
  approved: number;
  rejected: number;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (data.pendingReview > 0) {
    insights.push({
      id: "pending-ocr",
      severity: "warning",
      title: `${data.pendingReview} إيصال بانتظار المراجعة`,
      description:
        "راجع إيصالات الدفع عشان تتأكد من صحة البيانات المستخرجة. الذكاء الاصطناعي يقرأها لكن التأكيد النهائي عليك.",
    });
  }
  if (data.approved > 0) {
    insights.push({
      id: "ocr-accuracy",
      severity: "success",
      title: `${data.approved} إيصال تم قبوله`,
      description:
        "نظام قراءة الإيصالات شغال كويس — كل إيصال بيتقرأ تلقائياً ويستخرج البيانات.",
    });
  }
  return insights;
}

// ── Knowledge Base Insights ──
export function generateKnowledgeBaseInsights(data: {
  totalEntries: number;
  hasFaqs: boolean;
  hasOffers: boolean;
  hasDeliveryPricing: boolean;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  if (data.totalEntries === 0) {
    insights.push({
      id: "empty-kb",
      severity: "critical",
      title: "قاعدة المعرفة فارغة!",
      description:
        "البوت مش هيقدر يرد على أسئلة العملاء بدون معلومات. أضف الأسئلة الشائعة والعروض وقواعد التوصيل.",
      actionLabel: "أضف الآن",
      actionHref: "/merchant/knowledge-base",
    });
  }
  if (!data.hasFaqs) {
    insights.push({
      id: "no-faqs",
      severity: "tip",
      title: "أضف الأسئلة الشائعة",
      description:
        "أضف أسئلة العملاء المتكررة — البوت هيرد عليها تلقائياً ويوفر عليك وقت.",
    });
  }
  if (!data.hasOffers) {
    insights.push({
      id: "no-offers",
      severity: "tip",
      title: "أضف عروضك الحالية",
      description:
        "لما تضيف العروض، البوت هيعرضها على العملاء تلقائياً ويزيد المبيعات.",
    });
  }
  return insights;
}
