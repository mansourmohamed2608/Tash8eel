"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock3,
  PlayCircle,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { portalApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";

type AnalysisContext =
  | "cfo"
  | "analytics"
  | "dashboard"
  | "inventory"
  | "operations";

const ANALYSIS_PROMPTS: Record<AnalysisContext, string> = {
  cfo: `أنت محلل مالي متخصص. بناءً على بيانات النظام الحية، قم بتحليل شامل يشمل:
1. ملخص الأداء المالي (إيرادات، مصاريف، هوامش ربح)
2. تحليل التدفق النقدي وتحصيل COD
3. أهم 3 نقاط قوة مالية
4. أهم 3 مخاطر أو تحديات
5. توصيات عملية لتحسين الأرباح خلال الأسبوع القادم
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية.
اكتب 5 نقاط مرقمة فقط بدون Markdown أو مقدمات إنشائية.
لا تستخدم ايموجي نهائيا في الرد.`,

  analytics: `أنت محلل بيانات متخصص. بناءً على بيانات النظام الحية، قم بتحليل شامل يشمل:
1. ملخص معدلات التحويل وأداء المبيعات
2. أوقات الذروة وأنماط الشراء
3. المنتجات الأكثر والأقل مبيعاً
4. تحليل سلوك العملاء (عملاء جدد vs عائدين)
5. توصيات عملية لزيادة المبيعات خلال الأسبوع القادم
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية.
اكتب 5 نقاط مرقمة فقط بدون Markdown أو مقدمات إنشائية.
لا تستخدم ايموجي نهائيا في الرد.`,

  dashboard: `أنت مستشار تشغيل ونمو لتاجر مصري. المطلوب: موجز يومي تنفيذي قصير يصلح للعرض داخل لوحة التحكم، اعتماداً فقط على بيانات النظام الحية.

قواعد إلزامية:
1. لا تبدأ بمقدمة عامة مثل "تقرير يومي سريع" أو اسم المتجر.
2. لا تستخدم Markdown أو ** أو عناوين مزخرفة.
3. اكتب 5 نقاط مرقمة فقط من 1 إلى 5.
4. استخدم هذه العناوين بالترتيب: الأداء اليوم، المقارنة، التنبيهات، الإجراء الآن، فرصة قريبة.
5. كل نقطة تكون جملة أو جملتين كحد أقصى وبأسلوب مباشر.
6. استخدم أرقاماً حقيقية فقط من البيانات المتاحة.
7. إذا كانت القيمة صفر أو لا توجد بيانات، قل ذلك بوضوح ولا تخترع استنتاجات.
8. لا تذكر أسماء عملاء أو فرص بيع محددة إلا إذا كانت مدعومة فعلاً بالبيانات الحالية.
9. لا تستخدم ايموجي نهائيا.

المطلوب داخل كل نقطة:
1. الأداء اليوم: الطلبات، الإيرادات، المحادثات أو التحويل لو متاح.
2. المقارنة: مقارنة قصيرة مع اليوم السابق أو الفترة السابقة إن كانت موجودة.
3. التنبيهات: أهم تنبيه فعلي فقط أو اذكر أنه لا توجد تنبيهات مهمة.
4. الإجراء الآن: أهم إجراء واحد واضح وقابل للتنفيذ فوراً.
5. فرصة قريبة: فرصة واحدة فقط، وإن لم توجد فرصة واضحة قل ذلك بصراحة.`,

  inventory: `أنت وكيل إدارة مخزون ذكي. بناءً على بيانات المخزون الحية، قم بتحليل:
1. ملخص حالة المخزون (إجمالي المنتجات، منخفضة، نافذة)
2. منتجات يجب إعادة طلبها فوراً مع تقدير الكميات
3. تحليل حركة المخزون (منتجات بطيئة الحركة وسريعة الحركة)
4. تقدير قيمة المخزون الراكد وتوصيات للتصريف
5. توصيات عملية لتحسين إدارة المخزون
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية.
اكتب 5 نقاط مرقمة فقط بدون Markdown أو مقدمات إنشائية.
لا تستخدم ايموجي نهائيا في الرد.`,

  operations: `أنت وكيل عمليات ذكي. بناءً على بيانات النظام الحية، قم بتحليل:
1. ملخص العمليات اليومية (طلبات جديدة، معلقة، مكتملة، ملغاة)
2. أداء التوصيل (متوسط وقت التوصيل، معدل النجاح، سائقين نشطين)
3. تحليل المحادثات (معدل الرد، رضا العملاء)
4. اختناقات العمليات (طلبات متأخرة، شكاوى، مشاكل توصيل)
5. توصيات عملية لتحسين الكفاءة التشغيلية
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية.
اكتب 5 نقاط مرقمة فقط بدون Markdown أو مقدمات إنشائية.
لا تستخدم ايموجي نهائيا في الرد.`,
};

const CONTEXT_TITLES: Record<AnalysisContext, string> = {
  cfo: "وكيل التحليل المالي",
  analytics: "وكيل تحليل الأداء",
  dashboard: "موجز اليوم الذكي",
  inventory: "وكيل المخزون الذكي",
  operations: "وكيل العمليات الذكي",
};

const CONTEXT_SUBTITLES: Record<AnalysisContext, string> = {
  cfo: "خلاصة مالية مركزة مبنية على بياناتك الحالية",
  analytics: "قراءة سريعة للأداء والسلوك والاتجاهات",
  dashboard: "موجز تنفيذي سريع لحالة النشاط الآن",
  inventory: "إشارات حركة المخزون والقرارات العاجلة",
  operations: "ملخص تشغيلي لأهم الاختناقات والفرص",
};

const ANALYSIS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ANALYSIS_STORAGE_VERSION = "v5";

function normalizeAnalysisText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ParsedAnalysisSection {
  index: number;
  title: string;
  body: string;
}

interface DashboardAnalysisSection extends ParsedAnalysisSection {
  details?: string[];
}

interface PersistedAnalysisState {
  rawText: string | null;
  updatedAt: string | null;
  dashboardSections?: DashboardAnalysisSection[] | null;
}

interface DailyDashboardReport {
  date?: string;
  orders?: {
    total?: number;
    delivered?: number;
    cancelled?: number;
    changeFromYesterday?: number;
  };
  revenue?: {
    total?: number;
    bookedSales?: number;
    deliveredRevenue?: number;
    pendingCollections?: number;
    refundsAmount?: number;
    changeFromYesterday?: number;
  };
  conversations?: {
    total?: number;
    converted?: number;
    conversionRate?: number;
  };
  customers?: {
    new?: number;
  };
  topProducts?: Array<{
    productName?: string;
    quantity?: number;
    revenue?: number;
  }>;
}

interface DashboardStatsResponse {
  period?: {
    days?: number;
    startDate?: string;
    endDate?: string;
  };
  stats?: {
    totalOrders?: number;
    ordersChange?: number;
    totalRevenue?: number;
    realizedRevenue?: number;
    bookedSales?: number;
    deliveredRevenue?: number;
    pendingCollections?: number;
    revenueChange?: number;
    activeConversations?: number;
    conversationsChange?: number;
    pendingDeliveries?: number;
    deliveriesChange?: number;
  };
  premium?: {
    recoveredCarts?: {
      count?: number;
      revenue?: number;
    };
    deliveryFailures?: {
      count?: number;
      reasons?: Array<{ reason?: string; count?: number }>;
    };
    financeSummary?: {
      codPending?: number;
      pendingCollections?: number;
      pendingOnline?: number;
      bookedSales?: number;
      deliveredRevenue?: number;
      refundsAmount?: number;
      spendingAlert?: boolean;
      grossMargin?: number;
    };
  };
}

interface PortalNotificationsResponse {
  notifications?: Array<{
    readAt?: string | null;
    read_at?: string | null;
    isRead?: boolean;
  }>;
  total?: number;
  unreadCount?: number;
}

interface PortalFollowupsResponse {
  followups?: Array<{
    status?: string;
    followup_type?: string;
    scheduled_at?: string;
  }>;
}

interface CartRecoveryResponse {
  period?: {
    days?: number;
  };
  recoveredCarts?: number;
  recoveryRate?: number;
  recoveredRevenue?: number;
}

interface PortalInventoryResponse {
  total?: number;
  items?: Array<{
    id?: string;
    name?: string;
    stock_quantity?: number;
    reserved_quantity?: number;
    available_quantity?: number;
    low_stock_threshold?: number;
    is_low_stock?: boolean;
  }>;
}

const SECTION_STYLES = [
  {
    icon: Activity,
    accent: "text-[var(--accent-blue)]",
    bullet: "bg-[var(--accent-blue)]",
    border:
      "border-[color:color-mix(in_srgb,var(--accent-blue)_22%,transparent)]",
    bg: "bg-[var(--accent-muted)]",
  },
  {
    icon: TrendingUp,
    accent: "text-[var(--accent-success)]",
    bullet: "bg-[var(--accent-success)]",
    border:
      "border-[color:color-mix(in_srgb,var(--accent-success)_22%,transparent)]",
    bg: "bg-[var(--success-muted)]",
  },
  {
    icon: AlertTriangle,
    accent: "text-[var(--accent-warning)]",
    bullet: "bg-[var(--accent-warning)]",
    border:
      "border-[color:color-mix(in_srgb,var(--accent-warning)_22%,transparent)]",
    bg: "bg-[var(--warning-muted)]",
  },
  {
    icon: PlayCircle,
    accent: "text-violet-700",
    bullet: "bg-violet-700",
    border: "border-violet-200 dark:border-violet-900/60",
    bg: "bg-violet-50/80 dark:bg-violet-950/20",
  },
  {
    icon: Target,
    accent: "text-rose-700",
    bullet: "bg-rose-700",
    border: "border-rose-200 dark:border-rose-900/60",
    bg: "bg-rose-50/80 dark:bg-rose-950/20",
  },
] as const;

function parseAnalysisSections(text: string): ParsedAnalysisSection[] {
  const normalized = normalizeAnalysisText(text);
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: Array<{ index: number; raw: string[] }> = [];

  for (const line of lines) {
    const numberedMatch = line.match(/^(\d+)[\.\-)\u066b]\s*(.+)$/);
    if (numberedMatch) {
      sections.push({
        index: Number(numberedMatch[1]),
        raw: [numberedMatch[2].trim()],
      });
      continue;
    }

    if (sections.length === 0) {
      sections.push({ index: 1, raw: [line] });
      continue;
    }

    sections[sections.length - 1].raw.push(line);
  }

  return sections
    .map(({ index, raw }) => {
      const [firstLine, ...rest] = raw;
      const inlineSplit = firstLine.match(/^([^:]+):\s*(.+)$/);
      const title = inlineSplit ? inlineSplit[1].trim() : firstLine.trim();
      const bodyParts = inlineSplit
        ? [inlineSplit[2].trim(), ...rest]
        : rest.length > 0
          ? rest
          : [];

      return {
        index,
        title: title.replace(/[.:،\s]+$/g, "").trim(),
        body: bodyParts.join("\n").trim(),
      };
    })
    .filter((section) => section.title || section.body);
}

function formatAnalysisTimestamp(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatMoney(value: number): string {
  return `${formatCount(Math.round(toNumber(value)))} ج.م`;
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: Math.abs(value) < 10 && value % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(toNumber(value))}%`;
}

function isHumanReadableProductName(value: string | undefined): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  return !/^[A-Z0-9-]{3,}$/.test(normalized);
}

function countUnreadNotifications(
  payload: PortalNotificationsResponse | null,
): number {
  if (!payload) {
    return 0;
  }

  if (typeof payload.unreadCount === "number") {
    return payload.unreadCount;
  }

  return (payload.notifications || []).filter((notification) => {
    if (notification.isRead === true) {
      return false;
    }
    return !notification.readAt && !notification.read_at;
  }).length;
}

function buildDashboardSystemSummary(input: {
  report: DailyDashboardReport | null;
  stats: DashboardStatsResponse | null;
  notifications: PortalNotificationsResponse | null;
  followups: PortalFollowupsResponse | null;
  cartRecovery: CartRecoveryResponse | null;
  inventory: PortalInventoryResponse | null;
}): { rawText: string; sections: DashboardAnalysisSection[] } {
  const { report, stats, notifications, followups, cartRecovery, inventory } =
    input;
  const ordersToday = toNumber(report?.orders?.total);
  const deliveredToday = toNumber(report?.orders?.delivered);
  const cancelledToday = toNumber(report?.orders?.cancelled);
  const revenueToday = toNumber(report?.revenue?.total);
  const orderChange = toNumber(report?.orders?.changeFromYesterday);
  const revenueChange = toNumber(report?.revenue?.changeFromYesterday);
  const conversationsToday = toNumber(report?.conversations?.total);
  const convertedToday = toNumber(report?.conversations?.converted);
  const conversionRateToday = toNumber(report?.conversations?.conversionRate);
  const newCustomersToday = toNumber(report?.customers?.new);

  const periodDays = Math.max(1, toNumber(stats?.period?.days) || 30);
  const periodOrders = toNumber(stats?.stats?.totalOrders);
  const periodRealizedRevenue = toNumber(
    stats?.stats?.realizedRevenue ?? stats?.stats?.totalRevenue,
  );
  const periodBookedSales = toNumber(
    stats?.stats?.bookedSales ?? report?.revenue?.bookedSales,
  );
  const periodDeliveredRevenue = toNumber(
    stats?.stats?.deliveredRevenue ??
      stats?.premium?.financeSummary?.deliveredRevenue ??
      report?.revenue?.deliveredRevenue,
  );
  const periodPendingCollections = toNumber(
    stats?.stats?.pendingCollections ??
      stats?.premium?.financeSummary?.pendingCollections ??
      report?.revenue?.pendingCollections,
  );
  const activeConversations = toNumber(stats?.stats?.activeConversations);
  const pendingDeliveries = toNumber(stats?.stats?.pendingDeliveries);
  const unreadNotifications = countUnreadNotifications(notifications);
  const followupsCount = (followups?.followups || []).length;
  const deliveryFailures = toNumber(stats?.premium?.deliveryFailures?.count);
  const codPending = toNumber(stats?.premium?.financeSummary?.codPending);
  const recoveredCarts = toNumber(cartRecovery?.recoveredCarts);
  const recoveryRate = toNumber(cartRecovery?.recoveryRate);
  const recoveredRevenue = toNumber(cartRecovery?.recoveredRevenue);
  const inventoryItems = inventory?.items || [];
  const totalProducts = toNumber(inventory?.total || inventoryItems.length);
  const outOfStockCount = inventoryItems.filter((item) => {
    return toNumber(item.available_quantity) <= 0;
  }).length;
  const lowStockCount = inventoryItems.filter((item) => {
    const availableQuantity = toNumber(item.available_quantity);
    const threshold = Math.max(0, toNumber(item.low_stock_threshold) || 5);
    return availableQuantity > 0 && availableQuantity <= threshold;
  }).length;
  const highestRiskInventoryItem =
    inventoryItems.find((item) => toNumber(item.available_quantity) <= 0) ||
    inventoryItems.find((item) => {
      const availableQuantity = toNumber(item.available_quantity);
      const threshold = Math.max(0, toNumber(item.low_stock_threshold) || 5);
      return availableQuantity > 0 && availableQuantity <= threshold;
    }) ||
    null;
  const highestRiskInventoryLabel = isHumanReadableProductName(
    highestRiskInventoryItem?.name,
  )
    ? highestRiskInventoryItem?.name?.trim() || null
    : null;

  const topProduct =
    report?.topProducts?.find((product) =>
      isHumanReadableProductName(product?.productName),
    ) || null;
  const unconvertedConversations = Math.max(
    0,
    conversationsToday - convertedToday,
  );

  const performanceParts: string[] = [];
  if (ordersToday > 0) {
    performanceParts.push(
      `تم تسجيل ${formatCount(ordersToday)} طلب اليوم، منها ${formatCount(deliveredToday)} تم تسليمه و${formatCount(cancelledToday)} تم إلغاؤه.`,
    );
  } else {
    performanceParts.push("لم يتم تسجيل أي طلبات اليوم.");
  }
  if (conversationsToday > 0 && convertedToday === 0) {
    performanceParts.push(
      `الإيرادات المحققة اليوم ${formatMoney(revenueToday)}، مع ${formatMoney(periodPendingCollections)} ما زال قيد التحصيل، وتم تسجيل ${formatCount(conversationsToday)} محادثات اليوم لكن لم يتحول أي منها إلى طلب حتى الآن.`,
    );
  } else {
    performanceParts.push(
      `الإيرادات المحققة اليوم ${formatMoney(revenueToday)}، وعدد المحادثات ${formatCount(conversationsToday)} مع تحويل ${formatCount(convertedToday)} إلى طلبات بمعدل ${formatPercent(conversionRateToday)}.`,
    );
  }
  if (periodBookedSales > revenueToday) {
    performanceParts.push(
      `إجمالي المبيعات المحجوزة خلال الفترة الحالية هو ${formatMoney(periodBookedSales)} مقابل ${formatMoney(periodRealizedRevenue)} فقط كإيراد محقق.`,
    );
  }
  if (newCustomersToday > 0) {
    performanceParts.push(
      `كما دخل ${formatCount(newCustomersToday)} عميل جديد إلى قاعدة العملاء اليوم.`,
    );
  }

  const comparisonParts: string[] = [];
  if (
    ordersToday === 0 &&
    revenueToday === 0 &&
    orderChange === 0 &&
    revenueChange === 0
  ) {
    comparisonParts.push(
      "مقارنة بأمس لا يوجد تغير فعلي في الطلبات أو الإيرادات.",
    );
  } else {
    const ordersDirection =
      orderChange > 0 ? "ارتفعت" : orderChange < 0 ? "انخفضت" : "استقرت";
    const revenueDirection =
      revenueChange > 0 ? "وارتفعت" : revenueChange < 0 ? "وانخفضت" : "واستقرت";
    comparisonParts.push(
      `مقارنة بأمس ${ordersDirection} الطلبات ${formatPercent(Math.abs(orderChange))} ${revenueDirection} الإيرادات ${formatPercent(Math.abs(revenueChange))}.`,
    );
  }
  comparisonParts.push(
    `وخلال آخر ${formatCount(periodDays)} يوم سُجل ${formatCount(periodOrders)} طلب، بإجمالي مبيعات محجوزة ${formatMoney(periodBookedSales)} وإيراد محقق ${formatMoney(periodRealizedRevenue)}، مع ${formatCount(activeConversations)} محادثة نشطة حالياً.`,
  );
  if (periodPendingCollections > 0) {
    comparisonParts.push(
      `يوجد أيضاً ${formatMoney(periodPendingCollections)} مبالغ لم تُحصّل بعد، وهو ما يفسّر الفارق بين الطلبات المسجلة والنقد المحقق.`,
    );
  }
  if (ordersToday === 0 && newCustomersToday > 0) {
    comparisonParts.push(
      `رغم هدوء الطلبات اليوم، دخول ${formatCount(newCustomersToday)} عميل جديد يعني أن الاهتمام موجود لكن لم يُغلق إلى شراء بعد.`,
    );
  }

  const alerts: string[] = [];
  if (outOfStockCount > 0) {
    alerts.push(`${formatCount(outOfStockCount)} منتج نافد`);
  }
  if (lowStockCount > 0) {
    alerts.push(`${formatCount(lowStockCount)} منتج منخفض المخزون`);
  }
  if (pendingDeliveries > 0) {
    alerts.push(`${formatCount(pendingDeliveries)} طلب قيد التوصيل`);
  }
  if (followupsCount > 0) {
    alerts.push(`${formatCount(followupsCount)} متابعة مفتوحة`);
  }
  if (unreadNotifications > 0) {
    alerts.push(`${formatCount(unreadNotifications)} إشعار غير مقروء`);
  }
  if (deliveryFailures > 0) {
    alerts.push(`${formatCount(deliveryFailures)} حالة تعثر توصيل`);
  }
  if (codPending > 0) {
    alerts.push(`تحصيل COD معلق بقيمة ${formatMoney(codPending)}`);
  }
  if (periodPendingCollections > 0 && codPending <= 0) {
    alerts.push(
      `مبالغ قيد التحصيل بقيمة ${formatMoney(periodPendingCollections)}`,
    );
  }
  const alertsText =
    alerts.length > 0
      ? `أبرز التنبيهات الآن: ${alerts.slice(0, 3).join("، ")} من أصل ${formatCount(totalProducts)} منتج في المخزون.`
      : "لا توجد تنبيهات حرجة مؤكدة من البيانات الحالية.";

  let actionText =
    "لا يوجد إجراء عاجل ظاهر الآن، والأفضل مراقبة أول طلب أو محادثة جديدة فور دخولها.";
  if (outOfStockCount > 0 && highestRiskInventoryLabel) {
    actionText = `ابدأ بمراجعة المنتج ${highestRiskInventoryLabel} لأنه ضمن العناصر الأكثر ضغطاً في المخزون، ثم حدّث البدائل أو أعد التوريد قبل فقد مبيعات إضافية.`;
  } else if (outOfStockCount > 0) {
    actionText =
      "ابدأ بمراجعة المنتجات النافدة الآن وتحديد البدائل أو خطة إعادة التوريد قبل فقد مبيعات إضافية.";
  } else if (pendingDeliveries > 0) {
    actionText =
      "ابدأ بمتابعة الطلبات قيد التوصيل والتأكد من تحديث حالتها، لأنها أقرب نقطة تؤثر على رضا العميل والتحصيل.";
  } else if (lowStockCount > 0) {
    actionText =
      "راجع المنتجات منخفضة المخزون الآن وحدد ما يجب إعادة طلبه أو إبرازه بحذر حتى لا يتحول النقص إلى نفاد كامل.";
  } else if (followupsCount > 0) {
    actionText =
      "نفّذ المتابعات المفتوحة أولاً، لأنها تمثل عملاء أو طلبات تحتاج قراراً مباشراً قبل أن تبرد.";
  } else if (unreadNotifications > 0) {
    actionText =
      "راجع الإشعارات غير المقروءة وحدد ما يحتاج تصعيداً أو إجراءً تشغيلياً سريعاً.";
  } else if (unconvertedConversations > 0) {
    actionText =
      "ركّز على المحادثات غير المحولة اليوم وحاول دفعها إلى طلب مكتمل بدل تركها مفتوحة.";
  } else if (ordersToday === 0 && activeConversations > 0) {
    actionText =
      "راجع المحادثات النشطة الحالية لأن عدم وجود طلبات اليوم يعني أن فرصة التحويل ما زالت قائمة داخل المحادثات نفسها.";
  }

  let opportunityText = "لا تظهر فرصة قريبة مدعومة بالأرقام حالياً.";
  if (newCustomersToday > 0 && unconvertedConversations > 0) {
    opportunityText = `لديك ${formatCount(newCustomersToday)} عميل جديد و${formatCount(unconvertedConversations)} محادثة لم تتحول بعد اليوم، وأقرب فرصة الآن هي متابعة هؤلاء برسالة موجهة أو عرض افتتاحي سريع لتحويل الاهتمام إلى أول طلب.`;
  } else if (unconvertedConversations > 0 && topProduct) {
    opportunityText = `هناك ${formatCount(unconvertedConversations)} محادثة اليوم لم تتحول بعد، وأقرب فرصة هي الدفع بمنتج ${topProduct.productName} لأنه الأكثر حضوراً اليوم بعدد ${formatCount(
      toNumber(topProduct.quantity),
    )}.`;
  } else if (outOfStockCount === 0 && lowStockCount === 0 && topProduct) {
    opportunityText = `المخزون الحالي لا يظهر ضغطاً فورياً، ويمكن استغلال ذلك في إبراز ${topProduct.productName} كمنتج دفع رئيسي لرفع التحويل بسرعة.`;
  } else if (newCustomersToday > 0) {
    opportunityText = `تم تسجيل ${formatCount(newCustomersToday)} عميل جديد اليوم، وأفضل فرصة قريبة هي متابعته بعرض تكميلي أو رسالة ترحيب سريعة لرفع أول عملية شراء.`;
  } else if (recoveredCarts > 0 || recoveredRevenue > 0) {
    opportunityText = `استرداد السلات يحقق حالياً ${formatPercent(recoveryRate)} مع ${formatCount(recoveredCarts)} سلة مستردة بقيمة ${formatMoney(
      recoveredRevenue,
    )}، ويمكن تكرار نفس الأسلوب على المحادثات المتوقفة لرفع المبيعات بسرعة.`;
  } else if (topProduct) {
    opportunityText = `المنتج الأوضح في بيانات اليوم هو ${topProduct.productName}، ويمكن استخدامه كمنتج دفع أساسي في المحادثات أو الواجهة لزيادة التحويل.`;
  }

  const performanceDetails = [
    `إجمالي الطلبات اليوم: ${formatCount(ordersToday)}.`,
    `الطلبات المسلّمة: ${formatCount(deliveredToday)}، والملغاة: ${formatCount(cancelledToday)}.`,
    `إيرادات اليوم المحققة: ${formatMoney(revenueToday)}.`,
    `المبيعات المحجوزة في الفترة: ${formatMoney(periodBookedSales)}.`,
    `الإيراد المسلّم في الفترة: ${formatMoney(periodDeliveredRevenue)}.`,
    `المبالغ قيد التحصيل: ${formatMoney(periodPendingCollections)}.`,
    `المحادثات اليوم: ${formatCount(conversationsToday)}، والمحوّلة إلى طلبات: ${formatCount(convertedToday)}.`,
    `العملاء الجدد اليوم: ${formatCount(newCustomersToday)}.`,
  ];

  const comparisonDetails = [
    `تغير الطلبات عن أمس: ${formatPercent(Math.abs(orderChange))} ${orderChange > 0 ? "ارتفاع" : orderChange < 0 ? "انخفاض" : "استقرار"}.`,
    `تغير الإيرادات المحققة عن أمس: ${formatPercent(Math.abs(revenueChange))} ${revenueChange > 0 ? "ارتفاع" : revenueChange < 0 ? "انخفاض" : "استقرار"}.`,
    `خلال آخر ${formatCount(periodDays)} يوم: ${formatCount(periodOrders)} طلب بمبيعات محجوزة ${formatMoney(periodBookedSales)} وإيراد محقق ${formatMoney(periodRealizedRevenue)}.`,
    `المحادثات النشطة حالياً: ${formatCount(activeConversations)}.`,
  ];

  const alertDetails = [
    `إجمالي المنتجات في المخزون: ${formatCount(totalProducts)}.`,
    `منتجات نافدة: ${formatCount(outOfStockCount)}.`,
    `منتجات منخفضة المخزون: ${formatCount(lowStockCount)}.`,
    `طلبات قيد التوصيل: ${formatCount(pendingDeliveries)}.`,
    `إشعارات غير مقروءة: ${formatCount(unreadNotifications)}.`,
    `متابعات مفتوحة: ${formatCount(followupsCount)}.`,
  ];
  if (deliveryFailures > 0) {
    alertDetails.push(`حالات تعثر التوصيل: ${formatCount(deliveryFailures)}.`);
  }
  if (codPending > 0) {
    alertDetails.push(`تحصيل COD المعلّق: ${formatMoney(codPending)}.`);
  }
  if (highestRiskInventoryLabel) {
    alertDetails.push(`أعلى عنصر ضغط حالياً: ${highestRiskInventoryLabel}.`);
  }

  const actionDetails: string[] = [];
  if (outOfStockCount > 0 || lowStockCount > 0) {
    actionDetails.push(
      `ضغط المخزون الحالي: ${formatCount(outOfStockCount)} نافد و${formatCount(lowStockCount)} منخفض المخزون.`,
    );
  }
  if (pendingDeliveries > 0) {
    actionDetails.push(
      `يوجد ${formatCount(pendingDeliveries)} طلب قيد التوصيل يحتاج متابعة.`,
    );
  }
  if (unconvertedConversations > 0) {
    actionDetails.push(
      `لا تزال ${formatCount(unconvertedConversations)} محادثة اليوم بدون تحويل إلى طلب.`,
    );
  }
  if (actionDetails.length === 0) {
    actionDetails.push(
      "لا توجد إشارة تشغيلية طارئة تتفوق بوضوح على غيرها حالياً.",
    );
  }

  const opportunityDetails: string[] = [];
  if (newCustomersToday > 0) {
    opportunityDetails.push(
      `دخل اليوم ${formatCount(newCustomersToday)} عميل جديد يمكن تحويله إلى أول طلب.`,
    );
  }
  if (unconvertedConversations > 0) {
    opportunityDetails.push(
      `هناك ${formatCount(unconvertedConversations)} محادثة ما زالت مفتوحة بدون شراء.`,
    );
  }
  if (topProduct?.productName) {
    opportunityDetails.push(
      `المنتج الأوضح في اليوم: ${topProduct.productName}${toNumber(topProduct.quantity) > 0 ? ` بعدد ${formatCount(toNumber(topProduct.quantity))}` : ""}.`,
    );
  }
  if (recoveredCarts > 0 || recoveredRevenue > 0) {
    opportunityDetails.push(
      `استرداد السلات خلال الفترة: ${formatCount(recoveredCarts)} سلة بقيمة ${formatMoney(recoveredRevenue)}.`,
    );
  }
  if (opportunityDetails.length === 0) {
    opportunityDetails.push(
      "لا توجد فرصة قصيرة الأجل أوضح من بقية الإشارات الحالية.",
    );
  }

  const sections: DashboardAnalysisSection[] = [
    {
      index: 1,
      title: "الأداء اليوم",
      body: performanceParts.join(" "),
      details: performanceDetails,
    },
    {
      index: 2,
      title: "المقارنة",
      body: comparisonParts.join(" "),
      details: comparisonDetails,
    },
    {
      index: 3,
      title: "التنبيهات",
      body: alertsText,
      details: alertDetails,
    },
    {
      index: 4,
      title: "الإجراء الآن",
      body: actionText,
      details: actionDetails,
    },
    {
      index: 5,
      title: "فرصة قريبة",
      body: opportunityText,
      details: opportunityDetails,
    },
  ];

  return {
    rawText: normalizeAnalysisText(
      sections
        .map((section) => `${section.index}. ${section.title}: ${section.body}`)
        .join("\n"),
    ),
    sections,
  };
}

interface SmartAnalysisButtonProps {
  context: AnalysisContext;
  className?: string;
}

export function SmartAnalysisButton({
  context,
  className = "",
}: SmartAnalysisButtonProps) {
  const { merchantId } = useMerchant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedSectionIds, setExpandedSectionIds] = useState<number[]>([]);
  const storageKey = merchantId
    ? `smart-analysis:${ANALYSIS_STORAGE_VERSION}:${merchantId}:${context}`
    : null;
  const [persistedAnalysis, setPersistedAnalysis, isPersistedAnalysisHydrated] =
    useLocalStorageState<PersistedAnalysisState>(storageKey, {
      rawText: null,
      updatedAt: null,
      dashboardSections: null,
    });

  useEffect(() => {
    if (!isPersistedAnalysisHydrated || !persistedAnalysis.updatedAt) {
      return;
    }

    const ageMs = Date.now() - new Date(persistedAnalysis.updatedAt).getTime();
    if (ageMs > ANALYSIS_CACHE_TTL_MS) {
      setPersistedAnalysis({
        rawText: null,
        updatedAt: null,
        dashboardSections: null,
      });
    }
  }, [
    isPersistedAnalysisHydrated,
    persistedAnalysis.updatedAt,
    setPersistedAnalysis,
  ]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (context === "dashboard") {
        const [
          reportResult,
          statsResult,
          notificationsResult,
          followupsResult,
          cartRecoveryResult,
          inventoryResult,
        ] = await Promise.allSettled([
          portalApi.getDailyReport(),
          portalApi.getDashboardStats(30),
          portalApi.getPortalNotifications({ unreadOnly: true }),
          portalApi.getFollowups(),
          portalApi.getCartRecoveryKpi(30),
          portalApi.getInventory(),
        ]);

        if (
          reportResult.status === "rejected" &&
          statsResult.status === "rejected" &&
          notificationsResult.status === "rejected" &&
          followupsResult.status === "rejected" &&
          cartRecoveryResult.status === "rejected" &&
          inventoryResult.status === "rejected"
        ) {
          throw new Error("تعذر جلب بيانات الموجز من النظام حالياً.");
        }

        const dashboardSummary = buildDashboardSystemSummary({
          report:
            reportResult.status === "fulfilled" ? reportResult.value : null,
          stats: statsResult.status === "fulfilled" ? statsResult.value : null,
          notifications:
            notificationsResult.status === "fulfilled"
              ? notificationsResult.value
              : null,
          followups:
            followupsResult.status === "fulfilled"
              ? followupsResult.value
              : null,
          cartRecovery:
            cartRecoveryResult.status === "fulfilled"
              ? cartRecoveryResult.value
              : null,
          inventory:
            inventoryResult.status === "fulfilled"
              ? inventoryResult.value
              : null,
        });

        setPersistedAnalysis({
          rawText: dashboardSummary.rawText,
          updatedAt: new Date().toISOString(),
          dashboardSections: dashboardSummary.sections,
        });
        setExpandedSectionIds([]);
        setIsExpanded(true);
        return;
      }

      const prompt = ANALYSIS_PROMPTS[context];
      const result = await portalApi.chatWithAssistant(prompt);
      setPersistedAnalysis({
        rawText: result.reply,
        updatedAt: new Date().toISOString(),
        dashboardSections: null,
      });
      setExpandedSectionIds([]);
      setIsExpanded(true);
    } catch (err: any) {
      setError(err?.message || "فشل في تحليل البيانات. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, [context, setPersistedAnalysis]);

  const normalizedAnalysis = persistedAnalysis.rawText
    ? normalizeAnalysisText(persistedAnalysis.rawText)
    : null;
  const parsedSections = useMemo(
    () => (normalizedAnalysis ? parseAnalysisSections(normalizedAnalysis) : []),
    [normalizedAnalysis],
  );
  const structuredSections = useMemo<DashboardAnalysisSection[]>(
    () =>
      context === "dashboard" &&
      Array.isArray(persistedAnalysis.dashboardSections) &&
      persistedAnalysis.dashboardSections.length > 0
        ? persistedAnalysis.dashboardSections
        : parsedSections,
    [context, parsedSections, persistedAnalysis.dashboardSections],
  );
  const renderStructuredSections = structuredSections.length >= 3;
  const formattedUpdatedAt = useMemo(
    () => formatAnalysisTimestamp(persistedAnalysis.updatedAt),
    [persistedAnalysis.updatedAt],
  );
  const toggleSectionDetails = useCallback((sectionIndex: number) => {
    setExpandedSectionIds((current) =>
      current.includes(sectionIndex)
        ? current.filter((value) => value !== sectionIndex)
        : [...current, sectionIndex],
    );
  }, []);

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-blue-50 shadow-sm dark:border-purple-800 dark:from-purple-950/30 dark:via-slate-950 dark:to-blue-950/30 ${className}`}
    >
      {/* Header with button */}
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold text-purple-950 dark:text-purple-50">
                {CONTEXT_TITLES[context]}
              </h3>
              <p className="text-xs text-purple-700/80 dark:text-purple-300/80">
                {CONTEXT_SUBTITLES[context]}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:bg-purple-400"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              جاري التحليل...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
              {normalizedAnalysis ? "تحديث التحليل" : "تحليل ذكي"}
            </>
          )}
        </button>
      </div>

      {formattedUpdatedAt && (
        <div className="px-4 pb-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/70 px-3 py-1 text-xs text-purple-700 dark:border-purple-800 dark:bg-slate-950/40 dark:text-purple-300">
            <Clock3 className="h-3.5 w-3.5" />
            آخر تحديث: {formattedUpdatedAt}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-[var(--danger-muted)] border border-[color:color-mix(in_srgb,var(--accent-danger)_22%,transparent)] rounded-lg text-[var(--accent-danger)] text-sm">
          {error}
        </div>
      )}

      {/* Analysis result */}
      {normalizedAnalysis && (
        <div className="border-t border-purple-200 dark:border-purple-800">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm text-purple-700 transition-colors hover:bg-purple-100/50 dark:text-purple-300 dark:hover:bg-purple-900/30"
          >
            <span>{isExpanded ? "إخفاء التحليل" : "عرض التحليل"}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
          {isExpanded && (
            <div className="px-4 pb-4">
              {renderStructuredSections ? (
                <div className="grid gap-3 md:grid-cols-2" dir="rtl">
                  {structuredSections.map((section, idx) => {
                    const style = SECTION_STYLES[idx % SECTION_STYLES.length];
                    const Icon = style.icon;
                    const hasDetails =
                      Array.isArray(section.details) &&
                      section.details.length > 0;
                    const isSectionExpanded = expandedSectionIds.includes(
                      section.index,
                    );

                    return (
                      <section
                        key={`${section.index}-${section.title}`}
                        className={`rounded-2xl border p-4 shadow-sm ${style.border} ${style.bg}`}
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-950/40 ${style.accent}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {section.index.toString().padStart(2, "0")}
                            </p>
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                              {section.title}
                            </h4>
                          </div>
                        </div>
                        <p className="text-sm leading-7 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {section.body || "لا توجد تفاصيل إضافية."}
                        </p>
                        {hasDetails && (
                          <div className="mt-4 border-t border-white/70 pt-3 dark:border-slate-800/70">
                            <button
                              type="button"
                              onClick={() =>
                                toggleSectionDetails(section.index)
                              }
                              className={`inline-flex items-center gap-2 rounded-full border border-current/15 bg-white/70 px-3 py-1 text-xs font-medium transition-colors hover:bg-white dark:bg-slate-950/30 dark:hover:bg-slate-950/50 ${style.accent}`}
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${isSectionExpanded ? "rotate-180" : ""}`}
                              />
                              {isSectionExpanded
                                ? "إخفاء التفاصيل"
                                : "تفاصيل أكثر"}
                            </button>
                            {isSectionExpanded && (
                              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                                {section.details?.map((detail) => (
                                  <li
                                    key={`${section.index}-${detail}`}
                                    className="flex items-start gap-2"
                                  >
                                    <span
                                      className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${style.bullet}`}
                                    />
                                    <span>{detail}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="mx-auto max-w-4xl rounded-2xl border border-purple-100 bg-white p-5 text-sm leading-8 text-gray-800 shadow-sm whitespace-pre-wrap dark:border-purple-900/60 dark:bg-gray-900 dark:text-gray-200"
                  dir="rtl"
                >
                  {normalizedAnalysis}
                </div>
              )}
              <p className="mt-2 text-xs text-purple-500 dark:text-purple-400 text-center">
                {context === "dashboard"
                  ? "تم توليد هذا الموجز من بيانات النظام مباشرة"
                  : "تم التحليل بواسطة الذكاء الاصطناعي • البيانات من النظام مباشرة"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state hint */}
      {!normalizedAnalysis &&
        !loading &&
        !error &&
        isPersistedAnalysisHydrated && (
          <div className="px-4 pb-4 text-center">
            <p className="text-sm text-purple-500 dark:text-purple-400">
              {context === "dashboard"
                ? 'اضغط "تحليل ذكي" لتوليد موجز يومي مؤكد من بيانات النظام الحالية'
                : 'اضغط "تحليل ذكي" للحصول على تحليل مبني على بيانات نشاطك الحقيقية بالذكاء الاصطناعي'}
            </p>
          </div>
        )}
    </div>
  );
}
