"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  Package,
  AlertTriangle,
  TrendingUp,
  Repeat,
  ArrowDown,
  ShoppingCart,
  RefreshCw,
  Lightbulb,
  BarChart3,
  Zap,
  Calendar,
  DollarSign,
  MapPin,
  ArrowRightLeft,
  Target,
  Gauge,
  Factory,
} from "lucide-react";
import portalApi from "@/lib/authenticated-api";
import { useMerchant } from "@/hooks/use-merchant";
import {
  REPORTING_PERIOD_OPTIONS,
  getReportingDateRange,
  getStoredReportingDays,
  resolveReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";

interface AIStatus {
  configured: boolean;
  active: boolean;
  error?: string | null;
  budgetExhausted?: boolean;
}

interface SubstituteSuggestion {
  productId: string;
  productName: string;
  reason: string;
  substitutes: Array<{
    name: string;
    similarity: number;
    priceRange: string;
    supplier?: string;
  }>;
}

interface RestockRecommendation {
  productId: string;
  productName: string;
  currentStock: number;
  avgDailySales: number;
  daysUntilStockout: number;
  recommendedQty: number;
  urgency: "critical" | "high" | "warning" | "medium" | "normal" | "low";
  reason: string;
}

interface InventoryOrderConsumption {
  summary?: {
    orderCount: number;
    totalConsumedUnits: number;
    totalEstimatedCost: number;
  };
  orders?: Array<{
    orderId?: string | null;
    orderNumber: string;
    customerName: string;
    status: string;
    totalConsumedUnits: number;
    estimatedCost: number;
    items: Array<{
      sku: string;
      productName: string;
      consumedQty: number;
      quantityBefore: number;
      quantityAfter: number;
      unitCost: number;
      estimatedCost: number;
    }>;
  }>;
}

interface InventoryMonthlyCostTrend {
  source?: "LOTS" | "MOVEMENTS";
  summary?: {
    totalSkus: number;
    totalPurchasedUnits: number;
    totalPurchasedCost: number;
  };
  items?: Array<{
    sku: string;
    productName: string;
    totalPurchasedUnits: number;
    totalPurchasedCost: number;
    overallAvgUnitCost: number;
    months: Array<{
      month: string;
      purchasedUnits: number;
      totalCost: number;
      avgUnitCost: number;
    }>;
  }>;
}

interface InventoryMovementTrace {
  summary?: {
    totalMovements: number;
    affectedSkus: number;
    totalInbound: number;
    totalOutbound: number;
    netOnHandImpact: number;
    totalEstimatedInboundCost?: number;
    totalEstimatedOutboundCost?: number;
    estimatedNetCostImpact?: number;
  };
  bySource?: Array<{
    source: string;
    count: number;
    inbound: number;
    outbound: number;
    net: number;
  }>;
  movements?: Array<{
    movementId: string;
    createdAt: string;
    source: string;
    sourceLabel?: string;
    movementType: string;
    referenceType: string;
    referenceId: string;
    sku: string;
    productName: string;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    unitCost?: number;
    estimatedCostImpact?: number;
    onHandImpact: number;
    direction: "IN" | "OUT" | "NEUTRAL";
    reason?: string;
    orderNumber?: string;
    fromLocationId?: string;
    fromLocationName?: string;
    toLocationId?: string;
    toLocationName?: string;
  }>;
}

interface InventoryLocationBalance {
  summary?: {
    totalLocations: number;
    locationsNeedTransfer: number;
    locationsNeedPurchase: number;
    transferRecommendations: number;
    purchaseRecommendations: number;
  };
  locations?: Array<{
    locationId: string;
    locationName: string;
    isDefault: boolean;
    totalOnHand: number;
    totalReserved: number;
    totalAvailable: number;
    variantsCount: number;
    productsCount: number;
    lowStockVariants: number;
    zeroStockVariants: number;
    recentDemandUnits: number;
    recentDemandOrders: number;
    dailyDemand: number;
    coverageDays: number | null;
    transferInQty: number;
    transferOutQty: number;
    purchaseQty: number;
    actionRecommendation: string;
    riskLevel: string;
  }>;
  transferRecommendations?: Array<{
    variantId: string;
    sku: string;
    productName: string;
    fromLocationId: string;
    fromLocationName: string;
    toLocationId: string;
    toLocationName: string;
    quantity: number;
    reason: string;
  }>;
  purchaseRecommendations?: Array<{
    variantId: string;
    sku: string;
    productName: string;
    locationId: string;
    locationName: string;
    suggestedQty: number;
    reason: string;
  }>;
}

interface CostControlSettings {
  overallTargetPct: number;
  warningDeltaPct: number;
  criticalDeltaPct: number;
  allowedWastePct: number;
  targetYieldPct: number;
  categoryTargets: Record<string, number>;
  skuTargets: Record<string, number>;
  locationTargets: Record<string, number>;
}

const COST_CONTROL_SETTINGS_KEY = "inventory_insights_cost_control_settings_v1";
const DEFAULT_COST_CONTROL_SETTINGS: CostControlSettings = {
  overallTargetPct: 35,
  warningDeltaPct: 2,
  criticalDeltaPct: 5,
  allowedWastePct: 3,
  targetYieldPct: 90,
  categoryTargets: {},
  skuTargets: {},
  locationTargets: {},
};

export default function InventoryInsightsPage() {
  const { merchantId } = useMerchant();
  const [tab, setTab] = useState("restock");
  const [substitutions, setSubstitutions] = useState<SubstituteSuggestion[]>(
    [],
  );
  const [restockItems, setRestockItems] = useState<RestockRecommendation[]>([]);
  const [movementTrace, setMovementTrace] = useState<InventoryMovementTrace>(
    {},
  );
  const [locationBalance, setLocationBalance] =
    useState<InventoryLocationBalance>({});
  const [orderConsumption, setOrderConsumption] =
    useState<InventoryOrderConsumption>({});
  const [monthlyCostTrend, setMonthlyCostTrend] =
    useState<InventoryMonthlyCostTrend>({});
  const [ordersSnapshot, setOrdersSnapshot] = useState<any[]>([]);
  const [inventorySnapshot, setInventorySnapshot] = useState<any[]>([]);
  const [costSettings, setCostSettings] = useState<CostControlSettings>(
    DEFAULT_COST_CONTROL_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    configured: false,
    active: false,
  });
  const [periodDays, setPeriodDays] = useState<number>(() =>
    getStoredReportingDays(30),
  );
  const [draftStartDate, setDraftStartDate] = useState<string>("");
  const [draftEndDate, setDraftEndDate] = useState<string>("");
  const [appliedStartDate, setAppliedStartDate] = useState<string>("");
  const [appliedEndDate, setAppliedEndDate] = useState<string>("");
  const [movementSourceFilter, setMovementSourceFilter] =
    useState<string>("ALL");

  const hasCustomRange = Boolean(appliedStartDate && appliedEndDate);
  const effectivePeriodDays = useMemo(
    () => resolveReportingDays(periodDays),
    [periodDays],
  );
  const periodRange = useMemo(
    () => getReportingDateRange(periodDays),
    [periodDays],
  );
  const periodMonths = useMemo(
    () => Math.max(1, Math.min(24, Math.ceil(effectivePeriodDays / 30))),
    [effectivePeriodDays],
  );
  const selectedPeriodLabel =
    REPORTING_PERIOD_OPTIONS.find((option) => option.value === periodDays)
      ?.label || `آخر ${periodDays} يوم`;
  const selectedPeriodSummary = hasCustomRange
    ? `من ${new Date(appliedStartDate).toLocaleDateString("ar-EG")} حتى ${new Date(appliedEndDate).toLocaleDateString("ar-EG")}`
    : periodDays === 365
      ? `من ${periodRange.startDate.toLocaleDateString("ar-EG")} حتى ${periodRange.endDate.toLocaleDateString("ar-EG")}`
      : selectedPeriodLabel;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(COST_CONTROL_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CostControlSettings>;
      setCostSettings({
        ...DEFAULT_COST_CONTROL_SETTINGS,
        ...parsed,
        categoryTargets: parsed?.categoryTargets || {},
        skuTargets: parsed?.skuTargets || {},
        locationTargets: parsed?.locationTargets || {},
      });
    } catch (storageError) {
      console.warn(
        "Failed to read cost control settings from storage",
        storageError,
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        COST_CONTROL_SETTINGS_KEY,
        JSON.stringify(costSettings),
      );
    } catch (storageError) {
      console.warn("Failed to persist cost control settings", storageError);
    }
  }, [costSettings]);

  const fetchData = useCallback(async () => {
    if (!merchantId) return;
    if (
      hasCustomRange &&
      new Date(appliedEndDate) < new Date(appliedStartDate)
    ) {
      setError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }

    const movementParamsBase = hasCustomRange
      ? { startDate: appliedStartDate, endDate: appliedEndDate }
      : { days: effectivePeriodDays };
    const movementParams =
      movementSourceFilter === "ALL"
        ? movementParamsBase
        : { ...movementParamsBase, source: movementSourceFilter };
    const orderConsumptionParams = hasCustomRange
      ? { startDate: appliedStartDate, endDate: appliedEndDate }
      : { days: effectivePeriodDays };
    const monthlyCostParams = hasCustomRange
      ? { startDate: appliedStartDate, endDate: appliedEndDate }
      : { months: periodMonths };

    setLoading(true);
    setError(null);
    try {
      const [
        subData,
        restockData,
        aiStatusData,
        movementTraceData,
        locationBalanceData,
        orderConsumptionData,
        monthlyCostData,
        ordersData,
        inventoryData,
      ] = await Promise.allSettled([
        portalApi.getSubstituteSuggestions(merchantId),
        portalApi.getRestockRecommendations(merchantId),
        portalApi.getInventoryAiStatus(merchantId),
        portalApi.getInventoryMovementTrace(movementParams),
        portalApi.getInventoryLocationBalance(orderConsumptionParams),
        portalApi.getInventoryOrderConsumption(orderConsumptionParams),
        portalApi.getInventoryMonthlyCostTrend(monthlyCostParams),
        portalApi.getOrders({ limit: 2000, offset: 0 }),
        portalApi.getInventory(),
      ]);

      const failedSections: string[] = [];

      if (subData.status === "fulfilled") {
        setSubstitutions(
          subData.value?.suggestions || subData.value?.items || [],
        );
      } else {
        setSubstitutions([]);
        failedSections.push("بدائل المنتجات");
      }

      if (restockData.status === "fulfilled") {
        const rd = restockData.value;
        setRestockItems(rd?.recommendations || rd?.items || []);
        if (rd?.aiStatus) {
          setAiStatus(rd.aiStatus);
        }
      } else {
        setRestockItems([]);
        failedSections.push("توصيات إعادة الطلب");
      }

      if (aiStatusData.status === "fulfilled" && aiStatusData.value) {
        setAiStatus(aiStatusData.value);
      }

      if (movementTraceData.status === "fulfilled" && movementTraceData.value) {
        setMovementTrace(movementTraceData.value || {});
      } else {
        setMovementTrace({});
        failedSections.push("مسار حركة المخزون");
      }

      if (
        locationBalanceData.status === "fulfilled" &&
        locationBalanceData.value
      ) {
        setLocationBalance(locationBalanceData.value || {});
      } else {
        setLocationBalance({});
        failedSections.push("توازن المواقع");
      }

      if (
        orderConsumptionData.status === "fulfilled" &&
        orderConsumptionData.value
      ) {
        setOrderConsumption(orderConsumptionData.value || {});
      } else {
        setOrderConsumption({});
        failedSections.push("استهلاك الطلبات");
      }

      if (monthlyCostData.status === "fulfilled" && monthlyCostData.value) {
        setMonthlyCostTrend(monthlyCostData.value || {});
      } else {
        setMonthlyCostTrend({});
        failedSections.push("اتجاه تكلفة الشراء الشهري");
      }

      if (ordersData.status === "fulfilled" && ordersData.value) {
        const raw = ordersData.value;
        const extractedOrders = Array.isArray(raw?.orders)
          ? raw.orders
          : Array.isArray(raw?.items)
            ? raw.items
            : Array.isArray(raw)
              ? raw
              : [];
        setOrdersSnapshot(extractedOrders);
      } else {
        setOrdersSnapshot([]);
        failedSections.push("أوامر المقارنة");
      }

      if (inventoryData.status === "fulfilled" && inventoryData.value) {
        const raw = inventoryData.value;
        const extractedInventory = Array.isArray(raw?.inventory)
          ? raw.inventory
          : Array.isArray(raw?.items)
            ? raw.items
            : Array.isArray(raw?.products)
              ? raw.products
              : Array.isArray(raw)
                ? raw
                : [];
        setInventorySnapshot(extractedInventory);
      } else {
        setInventorySnapshot([]);
        failedSections.push("لقطة المخزون");
      }

      if (failedSections.length > 0) {
        setError(`تعذر تحميل بعض أجزاء الصفحة: ${failedSections.join("، ")}`);
      }
    } catch (err) {
      console.error("Failed to fetch insights:", err);
      setError("تعذر تحميل التحليلات");
    } finally {
      setLoading(false);
    }
  }, [
    merchantId,
    hasCustomRange,
    appliedStartDate,
    appliedEndDate,
    effectivePeriodDays,
    periodMonths,
    movementSourceFilter,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyCustomDateRange = () => {
    if (!draftStartDate || !draftEndDate) {
      setError("يرجى تحديد تاريخ البداية والنهاية");
      return;
    }
    if (new Date(draftEndDate) < new Date(draftStartDate)) {
      setError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    setError(null);
    setAppliedStartDate(draftStartDate);
    setAppliedEndDate(draftEndDate);
  };

  const clearCustomDateRange = () => {
    setDraftStartDate("");
    setDraftEndDate("");
    setAppliedStartDate("");
    setAppliedEndDate("");
    setError(null);
  };

  const urgencyBadge = (urgency: string) => {
    switch (urgency) {
      case "critical":
      case "high":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 ml-1" />
            حرج
          </Badge>
        );
      case "warning":
      case "medium":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
            تحذير
          </Badge>
        );
      default:
        return <Badge variant="secondary">طبيعي</Badge>;
    }
  };

  const criticalCount = restockItems.filter(
    (i) => i.urgency === "critical" || i.urgency === "high",
  ).length;
  const warningCount = restockItems.filter(
    (i) => i.urgency === "warning" || i.urgency === "medium",
  ).length;
  const formatCurrency = (value: number) =>
    `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(value || 0)} ج.م`;
  const formatQty = (value: number) =>
    new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(
      value || 0,
    );
  const sourceLabelMap: Record<string, string> = {
    ORDER: "طلب عميل",
    PURCHASE: "شراء/توريد",
    TRANSFER: "تحويل بين المواقع",
    RETURN_OR_RELEASE: "مرتجع/إرجاع للحركة",
    ADJUSTMENT: "تعديل مخزون",
    SYSTEM: "النظام",
    ALL: "الكل",
  };
  const movementTypeLabelMap: Record<string, string> = {
    RESTOCK: "توريد",
    PURCHASE: "شراء",
    SALE: "بيع",
    RETURN: "مرتجع",
    RELEASE: "إرجاع حجز",
    ADJUSTMENT: "تعديل",
    TRANSFER: "تحويل",
    RESERVATION: "حجز",
    CONSUME: "استهلاك",
    IN: "دخول",
    OUT: "خروج",
  };
  const orderStatusLabelMap: Record<string, string> = {
    PENDING: "قيد الانتظار",
    CONFIRMED: "مؤكد",
    BOOKED: "تم الحجز",
    SHIPPED: "تم الشحن",
    OUT_FOR_DELIVERY: "قيد التوصيل",
    DELIVERED: "تم التوصيل",
    COMPLETED: "مكتمل",
    CANCELLED: "ملغي",
    FAILED: "فشل",
    DRAFT: "مسودة",
  };

  const toArabicLabel = (
    value: string | undefined,
    map: Record<string, string>,
  ) => {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();
    return map[normalized] || value || "—";
  };

  const renderTransferPath = (
    movement: NonNullable<InventoryMovementTrace["movements"]>[number],
  ) => {
    const fromLabel =
      movement.fromLocationName || movement.fromLocationId || "غير محدد";
    const toLabel =
      movement.toLocationName || movement.toLocationId || "غير محدد";
    if (!movement.fromLocationId && !movement.toLocationId) return "—";
    return `${fromLabel} → ${toLabel}`;
  };

  const costStatusBadge = (
    status: "critical" | "warning" | "good" | "neutral",
  ) => {
    if (status === "critical") return <Badge variant="destructive">حرج</Badge>;
    if (status === "warning")
      return <Badge className="bg-yellow-100 text-yellow-700">تحذير</Badge>;
    if (status === "good")
      return <Badge className="bg-green-100 text-green-700">جيد</Badge>;
    return <Badge variant="outline">محايد</Badge>;
  };

  const updateBaseCostSetting = (
    key:
      | "overallTargetPct"
      | "warningDeltaPct"
      | "criticalDeltaPct"
      | "allowedWastePct"
      | "targetYieldPct",
    rawValue: string,
  ) => {
    const value = Number(rawValue);
    setCostSettings((previous) => ({
      ...previous,
      [key]: Number.isFinite(value) ? Math.max(0, value) : previous[key],
    }));
  };

  const updateMapCostSetting = (
    bucket: "categoryTargets" | "skuTargets" | "locationTargets",
    targetKey: string,
    rawValue: string,
  ) => {
    setCostSettings((previous) => {
      const nextBucket = { ...previous[bucket] };
      if (rawValue === "" || Number.isNaN(Number(rawValue))) {
        delete nextBucket[targetKey];
      } else {
        nextBucket[targetKey] = Math.max(0, Number(rawValue));
      }
      return { ...previous, [bucket]: nextBucket };
    });
  };

  const costControl = useMemo(() => {
    const round2 = (value: number) =>
      Math.round((Number(value) || 0) * 100) / 100;
    const safeNumber = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const toDate = (value: unknown) => {
      const parsed = value ? new Date(String(value)) : null;
      return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
    };
    const normalizeStatus = (value: unknown) =>
      String(value || "")
        .trim()
        .toUpperCase();
    const isRevenueStatus = (value: unknown) => {
      const status = normalizeStatus(value);
      return (
        status === "DELIVERED" || status === "COMPLETED" || status === "PAID"
      );
    };
    const isWasteMovement = (
      movement: NonNullable<InventoryMovementTrace["movements"]>[number],
    ) => {
      const mt = String(movement.movementType || "").toUpperCase();
      const reason = String(movement.reason || "").toLowerCase();
      return (
        mt === "ADJUSTMENT" ||
        mt === "OUT" ||
        reason.includes("expired") ||
        reason.includes("damage") ||
        reason.includes("damaged") ||
        reason.includes("theft") ||
        reason.includes("loss") ||
        reason.includes("waste") ||
        reason.includes("هالك") ||
        reason.includes("تالف") ||
        reason.includes("فاقد")
      );
    };
    const parseOrderItems = (order: any) => {
      const parseRaw = (raw: unknown): any[] => {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string" && raw.trim()) {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      };
      const items = parseRaw(order?.items);
      if (items.length > 0) return items;
      if (Array.isArray(order?.orderItems)) return order.orderItems;
      if (Array.isArray(order?.itemsDetails)) return order.itemsDetails;
      return [];
    };
    const parseQuantity = (item: any) => {
      const candidates = [
        item?.orderQuantity,
        item?.orderedQuantity,
        item?.requestedQty,
        item?.requestedQuantity,
        item?.quantityOrdered,
        item?.qtyOrdered,
        item?.order_qty,
        item?.quantity_ordered,
        item?.quantity,
        item?.qty,
        item?.count,
      ];
      for (const candidate of candidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return 0;
    };
    const parseLineTotal = (item: any, qty: number) => {
      const candidates = [
        item?.lineTotal,
        item?.total,
        item?.total_price,
        item?.subtotal,
        item?.rowTotal,
      ];
      for (const candidate of candidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
      const unitPrice = safeNumber(
        item?.unitPrice ??
          item?.unit_price ??
          item?.price ??
          item?.basePrice ??
          item?.base_price,
      );
      return qty * unitPrice;
    };

    const startBoundary = hasCustomRange
      ? (() => {
          const start = new Date(appliedStartDate);
          start.setHours(0, 0, 0, 0);
          return start;
        })()
      : new Date(periodRange.startDate);
    const endBoundary = hasCustomRange
      ? (() => {
          const end = new Date(appliedEndDate);
          end.setHours(23, 59, 59, 999);
          return end;
        })()
      : new Date(periodRange.endDate);
    const isInAppliedRange = (value: unknown) => {
      const date = toDate(value);
      if (!date) return false;
      return date >= startBoundary && date <= endBoundary;
    };

    const movements = movementTrace.movements || [];
    const inboundMovements = movements.filter(
      (movement) => safeNumber(movement.onHandImpact) > 0,
    );
    const outboundMovements = movements.filter(
      (movement) => safeNumber(movement.onHandImpact) < 0,
    );
    const outboundAdjustments = outboundMovements.filter((movement) =>
      isWasteMovement(movement),
    );

    const inboundCostFromSummary = safeNumber(
      movementTrace.summary?.totalEstimatedInboundCost,
    );
    const outboundCostFromSummary = safeNumber(
      movementTrace.summary?.totalEstimatedOutboundCost,
    );

    const inboundCostFallback = inboundMovements.reduce(
      (sum, movement) =>
        sum + Math.abs(safeNumber(movement.estimatedCostImpact)),
      0,
    );
    const outboundCostFallback = outboundMovements.reduce(
      (sum, movement) =>
        sum + Math.abs(safeNumber(movement.estimatedCostImpact)),
      0,
    );

    let inboundCost =
      inboundCostFromSummary > 0 ? inboundCostFromSummary : inboundCostFallback;
    let outboundCost =
      outboundCostFromSummary > 0
        ? outboundCostFromSummary
        : outboundCostFallback;
    const adjustmentLossCost = outboundAdjustments.reduce(
      (sum, movement) =>
        sum + Math.abs(safeNumber(movement.estimatedCostImpact)),
      0,
    );

    const skuMetaMap = new Map<
      string,
      { productName: string; category: string }
    >();
    const upsertSkuMeta = (
      skuValue: unknown,
      productName: unknown,
      category: unknown,
    ) => {
      const sku = String(skuValue || "").trim();
      if (!sku) return;
      const existing = skuMetaMap.get(sku);
      skuMetaMap.set(sku, {
        productName:
          String(productName || existing?.productName || sku).trim() || sku,
        category:
          String(category || existing?.category || "غير مصنف").trim() ||
          "غير مصنف",
      });
    };

    inventorySnapshot.forEach((item: any) => {
      const category =
        item?.category ||
        item?.categoryName ||
        item?.category_name ||
        item?.group ||
        item?.department ||
        "غير مصنف";
      const productName =
        item?.display_name ||
        item?.name ||
        item?.productName ||
        item?.title ||
        item?.sku ||
        "منتج";
      upsertSkuMeta(item?.sku, productName, category);
      if (Array.isArray(item?.variants)) {
        item.variants.forEach((variant: any) => {
          upsertSkuMeta(variant?.sku, variant?.name || productName, category);
        });
      }
    });

    (monthlyCostTrend.items || []).forEach((item) => {
      upsertSkuMeta(item.sku, item.productName, "غير مصنف");
    });
    movements.forEach((movement) => {
      upsertSkuMeta(movement.sku, movement.productName, "غير مصنف");
    });

    const salesBySku = new Map<string, number>();
    let netSales = 0;
    let paidOrdersCount = 0;
    let ordersInRangeCount = 0;
    let salesCapturedFromItems = 0;

    ordersSnapshot.forEach((order: any) => {
      const createdAt =
        order?.createdAt ||
        order?.created_at ||
        order?.orderedAt ||
        order?.date;
      if (!isInAppliedRange(createdAt)) return;
      ordersInRangeCount += 1;

      const paymentStatus = normalizeStatus(
        order?.paymentStatus ?? order?.payment_status,
      );
      const orderStatus = normalizeStatus(order?.status);
      const hasRevenue =
        isRevenueStatus(orderStatus) || paymentStatus === "PAID";
      if (!hasRevenue) return;

      const orderTotal = safeNumber(
        order?.totalPrice ?? order?.total ?? order?.amount ?? order?.grandTotal,
      );
      netSales += orderTotal;
      paidOrdersCount += 1;

      const items = parseOrderItems(order);
      items.forEach((item: any) => {
        const qty = parseQuantity(item);
        const lineTotal = parseLineTotal(item, qty);
        const sku = String(
          item?.sku || item?.productSku || item?.product_sku || "",
        ).trim();
        if (!sku || lineTotal <= 0) return;
        salesBySku.set(sku, round2((salesBySku.get(sku) || 0) + lineTotal));
        salesCapturedFromItems += lineTotal;
      });
    });

    type SkuAggregate = {
      sku: string;
      productName: string;
      category: string;
      purchasedQty: number;
      consumedQty: number;
      cogs: number;
      wasteQty: number;
      wasteCost: number;
      inboundCost: number;
      salesAmount: number;
      targetCostPct: number;
      actualCostPct: number;
      variancePct: number;
      varianceAmount: number;
      wastePct: number;
      yieldPct: number;
      status: "critical" | "warning" | "good" | "neutral";
      recommendation: string;
    };

    const bySkuMap = new Map<string, SkuAggregate>();
    const ensureSkuAggregate = (sku: string, fallbackName?: string) => {
      const key = sku || "غير معروف";
      const existing = bySkuMap.get(key);
      if (existing) return existing;
      const meta = skuMetaMap.get(key);
      const aggregate: SkuAggregate = {
        sku: key,
        productName: String(fallbackName || meta?.productName || key),
        category: String(meta?.category || "غير مصنف"),
        purchasedQty: 0,
        consumedQty: 0,
        cogs: 0,
        wasteQty: 0,
        wasteCost: 0,
        inboundCost: 0,
        salesAmount: 0,
        targetCostPct: 0,
        actualCostPct: 0,
        variancePct: 0,
        varianceAmount: 0,
        wastePct: 0,
        yieldPct: 0,
        status: "neutral",
        recommendation: "—",
      };
      bySkuMap.set(key, aggregate);
      return aggregate;
    };

    const locationNameMap = new Map<string, string>();
    (locationBalance.locations || []).forEach((location) => {
      locationNameMap.set(location.locationId, location.locationName);
    });

    const byLocationMap = new Map<
      string,
      {
        locationId: string;
        locationName: string;
        purchasedQty: number;
        consumedQty: number;
        cogs: number;
        wasteQty: number;
        wasteCost: number;
        salesAmount: number;
        targetCostPct: number;
        actualCostPct: number;
        variancePct: number;
        varianceAmount: number;
        status: "critical" | "warning" | "good" | "neutral";
        recommendation: string;
      }
    >();

    const ensureLocationAggregate = (
      locationId: string,
      fallbackName?: string,
    ) => {
      const key = locationId || "UNSPECIFIED";
      const existing = byLocationMap.get(key);
      if (existing) return existing;
      const aggregate = {
        locationId: key,
        locationName: fallbackName || locationNameMap.get(key) || "غير محدد",
        purchasedQty: 0,
        consumedQty: 0,
        cogs: 0,
        wasteQty: 0,
        wasteCost: 0,
        salesAmount: 0,
        targetCostPct: 0,
        actualCostPct: 0,
        variancePct: 0,
        varianceAmount: 0,
        status: "neutral" as const,
        recommendation: "—",
      };
      byLocationMap.set(key, aggregate);
      return aggregate;
    };

    movements.forEach((movement, index) => {
      const sku = String(movement.sku || `SKU_${index}`).trim();
      const aggregate = ensureSkuAggregate(sku, movement.productName);
      const onHandImpact = safeNumber(movement.onHandImpact);
      const quantityImpact = Math.abs(onHandImpact);
      const costImpact = Math.abs(safeNumber(movement.estimatedCostImpact));
      const isWaste = isWasteMovement(movement);

      const movementLocationId = String(
        movement.fromLocationId || movement.toLocationId || "UNSPECIFIED",
      );
      const movementLocationName =
        movement.fromLocationName || movement.toLocationName || "غير محدد";
      const locationAggregate = ensureLocationAggregate(
        movementLocationId,
        movementLocationName,
      );

      if (onHandImpact > 0) {
        aggregate.purchasedQty += quantityImpact;
        aggregate.inboundCost += costImpact;
        locationAggregate.purchasedQty += quantityImpact;
      } else if (onHandImpact < 0) {
        aggregate.consumedQty += quantityImpact;
        aggregate.cogs += costImpact;
        locationAggregate.consumedQty += quantityImpact;
        locationAggregate.cogs += costImpact;
        if (isWaste) {
          aggregate.wasteQty += quantityImpact;
          aggregate.wasteCost += costImpact;
          locationAggregate.wasteQty += quantityImpact;
          locationAggregate.wasteCost += costImpact;
        }
      }
    });

    (monthlyCostTrend.items || []).forEach((item) => {
      const aggregate = ensureSkuAggregate(item.sku, item.productName);
      aggregate.purchasedQty = Math.max(
        aggregate.purchasedQty,
        safeNumber(item.totalPurchasedUnits),
      );
      aggregate.inboundCost = Math.max(
        aggregate.inboundCost,
        safeNumber(item.totalPurchasedCost),
      );
    });

    bySkuMap.forEach((aggregate, sku) => {
      aggregate.salesAmount = safeNumber(salesBySku.get(sku));
    });

    const totalTrackedSkuSales = Array.from(bySkuMap.values()).reduce(
      (sum, row) => sum + row.salesAmount,
      0,
    );
    const remainingSalesToDistribute = Math.max(
      0,
      netSales - totalTrackedSkuSales,
    );
    if (remainingSalesToDistribute > 0) {
      const skusWithoutSales = Array.from(bySkuMap.values()).filter(
        (row) => row.salesAmount <= 0 && row.cogs > 0,
      );
      const cogsWithoutSales = skusWithoutSales.reduce(
        (sum, row) => sum + row.cogs,
        0,
      );
      if (cogsWithoutSales > 0) {
        skusWithoutSales.forEach((row) => {
          const share = row.cogs / cogsWithoutSales;
          row.salesAmount += remainingSalesToDistribute * share;
        });
      }
    }

    const resolveSkuTarget = (row: { sku: string; category: string }) => {
      const skuTarget = costSettings.skuTargets[row.sku];
      if (Number.isFinite(skuTarget)) return skuTarget;
      const categoryTarget = costSettings.categoryTargets[row.category];
      if (Number.isFinite(categoryTarget)) return categoryTarget;
      return costSettings.overallTargetPct;
    };

    const resolveLocationTarget = (row: { locationId: string }) => {
      const locationTarget = costSettings.locationTargets[row.locationId];
      if (Number.isFinite(locationTarget)) return locationTarget;
      return costSettings.overallTargetPct;
    };

    const classifyRow = (
      variancePct: number,
      wastePct: number,
      yieldPct: number,
    ) => {
      if (
        variancePct >= costSettings.criticalDeltaPct ||
        wastePct > costSettings.allowedWastePct + 1 ||
        (yieldPct > 0 && yieldPct < costSettings.targetYieldPct - 5)
      )
        return "critical" as const;
      if (
        variancePct >= costSettings.warningDeltaPct ||
        wastePct > costSettings.allowedWastePct ||
        (yieldPct > 0 && yieldPct < costSettings.targetYieldPct)
      )
        return "warning" as const;
      if (variancePct === 0 && wastePct === 0 && yieldPct === 0)
        return "neutral" as const;
      return "good" as const;
    };

    bySkuMap.forEach((row) => {
      const targetCostPct = resolveSkuTarget(row);
      const actualCostPct =
        row.salesAmount > 0 ? (row.cogs / row.salesAmount) * 100 : 0;
      const variancePct =
        row.salesAmount > 0 ? actualCostPct - targetCostPct : 0;
      const targetCostAmount =
        row.salesAmount > 0 ? (row.salesAmount * targetCostPct) / 100 : 0;
      const varianceAmount = row.cogs - targetCostAmount;
      const wastePct =
        row.purchasedQty > 0 ? (row.wasteQty / row.purchasedQty) * 100 : 0;
      const usableQty = Math.max(0, row.consumedQty - row.wasteQty);
      const yieldPct =
        row.purchasedQty > 0 ? (usableQty / row.purchasedQty) * 100 : 0;
      const status = classifyRow(variancePct, wastePct, yieldPct);

      let recommendation = "ضمن الحدود";
      if (wastePct > costSettings.allowedWastePct) {
        recommendation = "خفض الهدر ومراجعة التشغيل";
      } else if (yieldPct > 0 && yieldPct < costSettings.targetYieldPct) {
        recommendation = "تحسين العائد التشغيلي";
      } else if (variancePct >= costSettings.criticalDeltaPct) {
        recommendation = "مراجعة سعر البيع أو تكلفة الشراء";
      } else if (variancePct >= costSettings.warningDeltaPct) {
        recommendation = "متابعة هامش التكلفة";
      }

      row.targetCostPct = round2(targetCostPct);
      row.actualCostPct = round2(actualCostPct);
      row.variancePct = round2(variancePct);
      row.varianceAmount = round2(varianceAmount);
      row.wastePct = round2(wastePct);
      row.yieldPct = round2(yieldPct);
      row.status = status;
      row.recommendation = recommendation;
    });

    const totalSkuCogs = Array.from(bySkuMap.values()).reduce(
      (sum, row) => sum + row.cogs,
      0,
    );
    byLocationMap.forEach((row) => {
      const targetCostPct = resolveLocationTarget(row);
      row.salesAmount =
        totalSkuCogs > 0 ? (netSales * row.cogs) / totalSkuCogs : 0;
      const actualCostPct =
        row.salesAmount > 0 ? (row.cogs / row.salesAmount) * 100 : 0;
      const variancePct =
        row.salesAmount > 0 ? actualCostPct - targetCostPct : 0;
      const targetCostAmount =
        row.salesAmount > 0 ? (row.salesAmount * targetCostPct) / 100 : 0;
      row.varianceAmount = row.cogs - targetCostAmount;
      const wastePct =
        row.purchasedQty > 0 ? (row.wasteQty / row.purchasedQty) * 100 : 0;
      const yieldPct =
        row.purchasedQty > 0
          ? (Math.max(0, row.consumedQty - row.wasteQty) / row.purchasedQty) *
            100
          : 0;
      row.targetCostPct = round2(targetCostPct);
      row.actualCostPct = round2(actualCostPct);
      row.variancePct = round2(variancePct);
      row.varianceAmount = round2(row.varianceAmount);
      row.status = classifyRow(variancePct, wastePct, yieldPct);
      row.recommendation =
        row.status === "critical"
          ? "تحويل/شراء عاجل أو ضبط السعر"
          : row.status === "warning"
            ? "مراجعة التوزيع بين المواقع"
            : "مستقر";
    });

    const byCategoryMap = new Map<
      string,
      {
        category: string;
        salesAmount: number;
        cogs: number;
        purchasedQty: number;
        consumedQty: number;
        wasteQty: number;
        wasteCost: number;
        targetCostPct: number;
        actualCostPct: number;
        variancePct: number;
        varianceAmount: number;
        wastePct: number;
        yieldPct: number;
        status: "critical" | "warning" | "good" | "neutral";
        recommendation: string;
      }
    >();

    bySkuMap.forEach((row) => {
      const categoryKey = row.category || "غير مصنف";
      const existing = byCategoryMap.get(categoryKey);
      if (!existing) {
        byCategoryMap.set(categoryKey, {
          category: categoryKey,
          salesAmount: row.salesAmount,
          cogs: row.cogs,
          purchasedQty: row.purchasedQty,
          consumedQty: row.consumedQty,
          wasteQty: row.wasteQty,
          wasteCost: row.wasteCost,
          targetCostPct: 0,
          actualCostPct: 0,
          variancePct: 0,
          varianceAmount: 0,
          wastePct: 0,
          yieldPct: 0,
          status: "neutral",
          recommendation: "—",
        });
        return;
      }
      existing.salesAmount += row.salesAmount;
      existing.cogs += row.cogs;
      existing.purchasedQty += row.purchasedQty;
      existing.consumedQty += row.consumedQty;
      existing.wasteQty += row.wasteQty;
      existing.wasteCost += row.wasteCost;
    });

    byCategoryMap.forEach((row) => {
      const categoryTarget = Number.isFinite(
        costSettings.categoryTargets[row.category],
      )
        ? costSettings.categoryTargets[row.category]
        : costSettings.overallTargetPct;
      const actualCostPct =
        row.salesAmount > 0 ? (row.cogs / row.salesAmount) * 100 : 0;
      const variancePct =
        row.salesAmount > 0 ? actualCostPct - categoryTarget : 0;
      const targetCostAmount =
        row.salesAmount > 0 ? (row.salesAmount * categoryTarget) / 100 : 0;
      const wastePct =
        row.purchasedQty > 0 ? (row.wasteQty / row.purchasedQty) * 100 : 0;
      const yieldPct =
        row.purchasedQty > 0
          ? (Math.max(0, row.consumedQty - row.wasteQty) / row.purchasedQty) *
            100
          : 0;
      row.targetCostPct = round2(categoryTarget);
      row.actualCostPct = round2(actualCostPct);
      row.variancePct = round2(variancePct);
      row.varianceAmount = round2(row.cogs - targetCostAmount);
      row.wastePct = round2(wastePct);
      row.yieldPct = round2(yieldPct);
      row.status = classifyRow(variancePct, wastePct, yieldPct);
      row.recommendation =
        row.status === "critical"
          ? "تحسين التسعير والمشتريات"
          : row.status === "warning"
            ? "مراقبة التكلفة والهدر"
            : "ضمن المستهدف";
    });

    const bySku = Array.from(bySkuMap.values())
      .filter(
        (row) => row.cogs > 0 || row.salesAmount > 0 || row.purchasedQty > 0,
      )
      .sort((a, b) => b.varianceAmount - a.varianceAmount);
    const byCategory = Array.from(byCategoryMap.values()).sort(
      (a, b) => b.varianceAmount - a.varianceAmount,
    );
    const byLocation = Array.from(byLocationMap.values())
      .filter(
        (row) => row.cogs > 0 || row.purchasedQty > 0 || row.consumedQty > 0,
      )
      .sort((a, b) => b.varianceAmount - a.varianceAmount);

    const totalPurchasedQty = bySku.reduce(
      (sum, row) => sum + row.purchasedQty,
      0,
    );
    const totalConsumedQty = bySku.reduce(
      (sum, row) => sum + row.consumedQty,
      0,
    );
    const totalWasteQty = bySku.reduce((sum, row) => sum + row.wasteQty, 0);
    const totalWasteCost = bySku.reduce((sum, row) => sum + row.wasteCost, 0);
    const totalCogs = bySku.reduce((sum, row) => sum + row.cogs, 0);

    inboundCost = Math.max(
      inboundCost,
      bySku.reduce((sum, row) => sum + row.inboundCost, 0),
    );
    outboundCost = Math.max(outboundCost, totalCogs);

    const actualCostPct = netSales > 0 ? (totalCogs / netSales) * 100 : 0;
    const targetCostPct = costSettings.overallTargetPct;
    const variancePct = actualCostPct - targetCostPct;
    const targetCostAmount =
      netSales > 0 ? (netSales * targetCostPct) / 100 : 0;
    const varianceAmount = totalCogs - targetCostAmount;
    const wastePct =
      totalPurchasedQty > 0 ? (totalWasteQty / totalPurchasedQty) * 100 : 0;
    const yieldPct =
      totalPurchasedQty > 0
        ? (Math.max(0, totalConsumedQty - totalWasteQty) / totalPurchasedQty) *
          100
        : 0;

    const alerts: Array<{
      level: "critical" | "warning" | "info";
      title: string;
      action: string;
    }> = [];
    if (variancePct >= costSettings.criticalDeltaPct) {
      alerts.push({
        level: "critical",
        title: `التكلفة أعلى من المستهدف بـ ${round2(variancePct)}%`,
        action: "راجع سعر البيع، سعر الشراء، أو نقل الكميات بين المواقع.",
      });
    } else if (variancePct >= costSettings.warningDeltaPct) {
      alerts.push({
        level: "warning",
        title: `انحراف تكلفة يحتاج متابعة (${round2(variancePct)}%)`,
        action: "ثبّت الأسعار الحرجة وراقب المشتريات خلال الأسبوع الحالي.",
      });
    }
    if (wastePct > costSettings.allowedWastePct) {
      alerts.push({
        level: "warning",
        title: `نسبة الهدر ${round2(wastePct)}% أعلى من المسموح ${costSettings.allowedWastePct}%`,
        action: "قلّل الفاقد في الأصناف الأعلى هدرًا وراجع أسباب التالف.",
      });
    }
    if (yieldPct > 0 && yieldPct < costSettings.targetYieldPct) {
      alerts.push({
        level: "warning",
        title: `العائد الفعلي ${round2(yieldPct)}% أقل من الهدف ${costSettings.targetYieldPct}%`,
        action: "راجع عمليات التحضير والتخزين للأصناف ضعيفة العائد.",
      });
    }
    if ((locationBalance.summary?.locationsNeedTransfer || 0) > 0) {
      alerts.push({
        level: "info",
        title: `هناك ${locationBalance.summary?.locationsNeedTransfer || 0} موقع يحتاج نقل داخلي`,
        action: "انقل الكميات بين الفروع قبل تنفيذ شراء جديد.",
      });
    }
    if ((locationBalance.summary?.locationsNeedPurchase || 0) > 0) {
      alerts.push({
        level: "info",
        title: `هناك ${locationBalance.summary?.locationsNeedPurchase || 0} موقع يحتاج شراء`,
        action: "أنشئ أمر شراء للأصناف المطلوبة عالية الطلب.",
      });
    }

    const recommendations = bySku
      .filter((row) => row.status === "critical" || row.status === "warning")
      .slice(0, 8)
      .map((row) => ({
        sku: row.sku,
        productName: row.productName,
        message: row.recommendation,
        variancePct: row.variancePct,
        wastePct: row.wastePct,
        yieldPct: row.yieldPct,
      }));

    const topCostDrains = [...outboundMovements]
      .sort(
        (a, b) =>
          Math.abs(safeNumber(b.estimatedCostImpact)) -
          Math.abs(safeNumber(a.estimatedCostImpact)),
      )
      .slice(0, 20);

    return {
      inboundCost: round2(inboundCost),
      outboundCost: round2(outboundCost),
      adjustmentLossCost: round2(adjustmentLossCost),
      netCostImpact: round2(inboundCost - outboundCost),
      topCostDrains,
      sales: {
        netSales: round2(netSales),
        ordersInRangeCount,
        paidOrdersCount,
        salesCapturedFromItems: round2(salesCapturedFromItems),
      },
      overall: {
        targetCostPct: round2(targetCostPct),
        actualCostPct: round2(actualCostPct),
        variancePct: round2(variancePct),
        varianceAmount: round2(varianceAmount),
      },
      wasteYield: {
        allowedWastePct: round2(costSettings.allowedWastePct),
        actualWastePct: round2(wastePct),
        targetYieldPct: round2(costSettings.targetYieldPct),
        actualYieldPct: round2(yieldPct),
        totalWasteQty: round2(totalWasteQty),
        totalWasteCost: round2(totalWasteCost),
      },
      rows: {
        bySku,
        byCategory,
        byLocation,
      },
      alerts,
      recommendations,
    };
  }, [
    movementTrace,
    locationBalance,
    monthlyCostTrend,
    inventorySnapshot,
    ordersSnapshot,
    periodRange.startDate,
    periodRange.endDate,
    hasCustomRange,
    appliedStartDate,
    appliedEndDate,
    costSettings,
  ]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="رؤى المخزون"
        description="تابع الاستهلاك، التكلفة، وحركة المخزون بالكامل بشكل مبسط"
        actions={
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`}
            />
            تحديث
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={periodDays.toString()}
                onValueChange={(value) => {
                  const next = Number.parseInt(value, 10);
                  setPeriodDays(next);
                  setStoredReportingDays(next);
                  setAppliedStartDate("");
                  setAppliedEndDate("");
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <Calendar className="h-4 w-4 ml-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORTING_PERIOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={movementSourceFilter}
                onValueChange={setMovementSourceFilter}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">كل مصادر الحركة</SelectItem>
                  <SelectItem value="ORDER">طلبات العملاء</SelectItem>
                  <SelectItem value="PURCHASE">الشراء/التوريد</SelectItem>
                  <SelectItem value="TRANSFER">التحويل بين المواقع</SelectItem>
                  <SelectItem value="RETURN_OR_RELEASE">
                    المرتجعات/الإرجاع
                  </SelectItem>
                  <SelectItem value="ADJUSTMENT">تعديلات المخزون</SelectItem>
                  <SelectItem value="SYSTEM">النظام</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={draftStartDate}
                onChange={(e) => setDraftStartDate(e.target.value)}
                className="w-[170px]"
              />
              <Input
                type="date"
                value={draftEndDate}
                onChange={(e) => setDraftEndDate(e.target.value)}
                className="w-[170px]"
              />
              <Button variant="outline" onClick={applyCustomDateRange}>
                تطبيق تاريخ مخصص
              </Button>
              {(hasCustomRange || draftStartDate || draftEndDate) && (
                <Button variant="ghost" onClick={clearCustomDateRange}>
                  مسح التاريخ المخصص
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            الفترة الحالية: {selectedPeriodSummary}
          </p>
          <p className="text-xs text-muted-foreground">
            ملاحظة: فلتر التاريخ يطبق على الحركة الكاملة، الاستهلاك حسب الطلب،
            ومتوسط تكلفة الشراء. فلتر مصدر الحركة يطبق على الحركة الكاملة وتحكم
            التكلفة فقط. توصيات إعادة التخزين تعتمد آخر 30 يوم تشغيلية.
          </p>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
        <CardContent className="pt-4">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            هذه الصفحة تعرض الصورة الكاملة للمخزون: من أين دخلت الكميات، أين
            خرجت، وما تكلفة الشراء الشهرية لكل صنف.
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card
          className={
            criticalCount > 0 ? "border-red-300 dark:border-red-800" : ""
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle
                className={`h-8 w-8 ${criticalCount > 0 ? "text-red-500" : "text-muted-foreground"}`}
              />
              <div>
                <p className="text-sm text-muted-foreground">منتجات حرجة</p>
                <p className="text-2xl font-bold text-red-600">
                  {criticalCount}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowDown className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">تحذيرات تخزين</p>
                <p className="text-2xl font-bold">{warningCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Repeat className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">بدائل متاحة</p>
                <p className="text-2xl font-bold">{substitutions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Brain className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">توصيات نشطة</p>
                <p className="text-2xl font-bold">
                  {restockItems.length + substitutions.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Status Banner */}
      {!aiStatus.active && (
        <Card
          className={cn(
            "border",
            aiStatus.budgetExhausted
              ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"
              : aiStatus.error === "AI_TEMPORARILY_UNAVAILABLE"
                ? "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30"
                : "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
          )}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Zap
              className={cn(
                "h-5 w-5 shrink-0",
                aiStatus.budgetExhausted
                  ? "text-orange-500"
                  : aiStatus.error === "AI_TEMPORARILY_UNAVAILABLE"
                    ? "text-yellow-500"
                    : "text-blue-500",
              )}
            />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {aiStatus.budgetExhausted
                  ? "تم استنفاد رصيد الذكاء الاصطناعي اليومي"
                  : aiStatus.error === "AI_TEMPORARILY_UNAVAILABLE"
                    ? "خدمة الذكاء الاصطناعي غير متاحة مؤقتاً"
                    : "الذكاء الاصطناعي غير مفعّل"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {aiStatus.budgetExhausted
                  ? "التوصيات المعروضة هي بيانات تجريبية. يتم تجديد الرصيد يومياً أو يمكنك ترقية الباقة."
                  : aiStatus.error === "AI_TEMPORARILY_UNAVAILABLE"
                    ? "سيتم إعادة المحاولة تلقائياً. التوصيات المعروضة تجريبية."
                    : "فعّل الذكاء الاصطناعي من إعدادات الوكلاء للحصول على توصيات حقيقية."}
              </p>
            </div>
            <a
              href="/merchant/plan"
              className="shrink-0 text-xs font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors"
            >
              ترقية الباقة
            </a>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-700 dark:text-yellow-300">
          {error}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="restock" className="flex items-center gap-1">
            <ShoppingCart className="h-4 w-4" />
            إعادة التخزين
            {criticalCount > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">
                {criticalCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="substitutes" className="flex items-center gap-1">
            <Repeat className="h-4 w-4" />
            البدائل المقترحة
          </TabsTrigger>
          <TabsTrigger
            value="movement-trace"
            className="flex items-center gap-1"
          >
            <Package className="h-4 w-4" />
            الحركة الكاملة
          </TabsTrigger>
          <TabsTrigger
            value="location-balance"
            className="flex items-center gap-1"
          >
            <MapPin className="h-4 w-4" />
            المخزون حسب الموقع
          </TabsTrigger>
          <TabsTrigger value="order-usage" className="flex items-center gap-1">
            <Package className="h-4 w-4" />
            استهلاك المخزون حسب الطلب
          </TabsTrigger>
          <TabsTrigger value="cost-trend" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            متوسط تكلفة الشراء الشهري
          </TabsTrigger>
          <TabsTrigger value="cost-control" className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            تحكم التكلفة
          </TabsTrigger>
        </TabsList>

        {/* Restock Recommendations */}
        <TabsContent value="restock" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  توصيات إعادة التخزين
                </CardTitle>
                <CardDescription>
                  مرتبة حسب الأولوية — المنتجات الحرجة أولاً
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المنتج</TableHead>
                      <TableHead className="text-center">
                        المخزون الحالي
                      </TableHead>
                      <TableHead className="text-center">
                        معدل المبيعات/يوم
                      </TableHead>
                      <TableHead className="text-center">أيام متبقية</TableHead>
                      <TableHead className="text-center">
                        الكمية المقترحة
                      </TableHead>
                      <TableHead className="text-center">الأولوية</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {restockItems
                      .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
                      .map((item, index) => (
                        <TableRow
                          key={`${item.productId || "restock"}-${index}`}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.productName}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.reason}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {item.currentStock}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.avgDailySales.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={
                                item.daysUntilStockout <= 2
                                  ? "text-red-600 font-bold"
                                  : item.daysUntilStockout <= 7
                                    ? "text-yellow-600 font-bold"
                                    : ""
                              }
                            >
                              {item.daysUntilStockout} يوم
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-bold">
                            {item.recommendedQty > 0
                              ? item.recommendedQty
                              : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {urgencyBadge(item.urgency)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Substitute Suggestions */}
        <TabsContent value="substitutes" className="mt-4 space-y-4">
          {loading ? (
            <TableSkeleton />
          ) : substitutions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد اقتراحات بدائل حالياً</p>
                <p className="text-sm">
                  سيتم اقتراح بدائل عند نفاد منتجات مطلوبة
                </p>
              </CardContent>
            </Card>
          ) : (
            substitutions.map((item, index) => (
              <Card key={`${item.productId || "substitute"}-${index}`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-orange-500" />
                    {item.productName}
                  </CardTitle>
                  <CardDescription>{item.reason}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">
                          البديل المقترح
                        </TableHead>
                        <TableHead className="text-center">
                          نسبة التطابق
                        </TableHead>
                        <TableHead className="text-center">
                          نطاق السعر
                        </TableHead>
                        <TableHead className="text-center">المورد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.substitutes.map((sub, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            {sub.name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                sub.similarity >= 0.9 ? "default" : "secondary"
                              }
                            >
                              {Math.round(sub.similarity * 100)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {sub.priceRange}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {sub.supplier || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="movement-trace" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  تتبع كل حركات المخزون
                </CardTitle>
                <CardDescription>
                  يشمل كل المصادر: الطلبات، الشراء، التحويلات، المرتجعات،
                  والتعديلات. الفترة: {selectedPeriodSummary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        إجمالي الحركات
                      </p>
                      <p className="text-xl font-bold">
                        {movementTrace.summary?.totalMovements || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">SKU متأثر</p>
                      <p className="text-xl font-bold">
                        {movementTrace.summary?.affectedSkus || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        إجمالي الداخل
                      </p>
                      <p className="text-xl font-bold text-green-600">
                        {formatQty(movementTrace.summary?.totalInbound || 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        إجمالي الخارج
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {formatQty(movementTrace.summary?.totalOutbound || 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        صافي التأثير
                      </p>
                      <p
                        className={`text-xl font-bold ${(movementTrace.summary?.netOnHandImpact || 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatQty(movementTrace.summary?.netOnHandImpact || 0)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {!!movementTrace.bySource?.length && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المصدر</TableHead>
                        <TableHead className="text-center">
                          عدد الحركات
                        </TableHead>
                        <TableHead className="text-center">داخل</TableHead>
                        <TableHead className="text-center">خارج</TableHead>
                        <TableHead className="text-center">صافي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movementTrace.bySource.map((row) => (
                        <TableRow key={row.source}>
                          <TableCell className="font-medium">
                            {toArabicLabel(row.source, sourceLabelMap)}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.count}
                          </TableCell>
                          <TableCell className="text-center text-green-600">
                            {formatQty(row.inbound)}
                          </TableCell>
                          <TableCell className="text-center text-red-600">
                            {formatQty(row.outbound)}
                          </TableCell>
                          <TableCell
                            className={`text-center font-medium ${row.net >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatQty(row.net)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {!movementTrace.movements ||
                movementTrace.movements.length === 0 ? (
                  <div className="rounded-md border p-8 text-center text-muted-foreground">
                    لا توجد حركات مخزون في الفترة الحالية
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الوقت</TableHead>
                        <TableHead className="text-right">المصدر</TableHead>
                        <TableHead className="text-right">
                          من/إلى موقع
                        </TableHead>
                        <TableHead className="text-right">الصنف</TableHead>
                        <TableHead className="text-center">الحركة</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">
                          تأثير المخزون
                        </TableHead>
                        <TableHead className="text-center">قبل/بعد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movementTrace.movements.slice(0, 40).map((m, index) => (
                        <TableRow
                          key={`${m.movementId || "movement"}-${index}`}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(m.createdAt).toLocaleString("ar-EG")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {toArabicLabel(m.source, sourceLabelMap)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {renderTransferPath(m)}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p>{m.productName}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.sku}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {toArabicLabel(
                              m.movementType,
                              movementTypeLabelMap,
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatQty(m.quantity)}
                          </TableCell>
                          <TableCell
                            className={`text-center font-medium ${m.onHandImpact >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {formatQty(m.onHandImpact)}
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {formatQty(m.quantityBefore)} /{" "}
                            {formatQty(m.quantityAfter)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="location-balance" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  رصيد المخزون لكل موقع
                </CardTitle>
                <CardDescription>
                  يوضح المتاح بكل موقع، ويقترح تلقائياً هل الأفضل نقل داخلي أو
                  شراء جديد حسب الطلب خلال الفترة: {selectedPeriodSummary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        عدد المواقع
                      </p>
                      <p className="text-xl font-bold">
                        {locationBalance.summary?.totalLocations || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        مواقع تحتاج نقل
                      </p>
                      <p className="text-xl font-bold text-orange-600">
                        {locationBalance.summary?.locationsNeedTransfer || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        مواقع تحتاج شراء
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {locationBalance.summary?.locationsNeedPurchase || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        فرص نقل داخلي
                      </p>
                      <p className="text-xl font-bold text-blue-600">
                        {locationBalance.summary?.transferRecommendations || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        طلبات شراء مقترحة
                      </p>
                      <p className="text-xl font-bold text-purple-600">
                        {locationBalance.summary?.purchaseRecommendations || 0}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {!locationBalance.locations ||
                locationBalance.locations.length === 0 ? (
                  <div className="rounded-md border p-8 text-center text-muted-foreground">
                    لا توجد بيانات مواقع متاحة حالياً
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الموقع</TableHead>
                        <TableHead className="text-center">المتاح</TableHead>
                        <TableHead className="text-center">المحجوز</TableHead>
                        <TableHead className="text-center">
                          طلب الفترة
                        </TableHead>
                        <TableHead className="text-center">
                          تغطية الطلب
                        </TableHead>
                        <TableHead className="text-center">
                          مؤشر المخاطر
                        </TableHead>
                        <TableHead className="text-center">
                          الإجراء المقترح
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locationBalance.locations.map((location) => (
                        <TableRow key={location.locationId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {location.locationName}
                                {location.isDefault ? " (افتراضي)" : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {location.productsCount} منتج •{" "}
                                {location.variantsCount} SKU
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {formatQty(location.totalAvailable)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatQty(location.totalReserved)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatQty(location.recentDemandUnits)}
                            <p className="text-xs text-muted-foreground">
                              {location.recentDemandOrders} طلب
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            {location.coverageDays === null
                              ? "—"
                              : `${formatQty(location.coverageDays)} يوم`}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                location.riskLevel === "حرج"
                                  ? "destructive"
                                  : location.riskLevel === "يحتاج متابعة"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {location.riskLevel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div>
                              <p className="font-medium">
                                {location.actionRecommendation}
                              </p>
                              {(location.transferInQty > 0 ||
                                location.purchaseQty > 0) && (
                                <p className="text-xs text-muted-foreground">
                                  نقل {formatQty(location.transferInQty)} • شراء{" "}
                                  {formatQty(location.purchaseQty)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ArrowRightLeft className="h-4 w-4" />
                        أهم توصيات النقل الداخلي
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {!locationBalance.transferRecommendations ||
                      locationBalance.transferRecommendations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          لا توجد توصيات نقل حالياً
                        </p>
                      ) : (
                        locationBalance.transferRecommendations
                          .slice(0, 8)
                          .map((rec, index) => (
                            <div
                              key={`${rec.variantId}-${rec.fromLocationId}-${rec.toLocationId}-${index}`}
                              className="rounded border p-2 text-sm"
                            >
                              <p className="font-medium">
                                {rec.productName} ({rec.sku})
                              </p>
                              <p className="text-muted-foreground">
                                {rec.fromLocationName} → {rec.toLocationName} •
                                كمية: {formatQty(rec.quantity)}
                              </p>
                            </div>
                          ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        أهم توصيات الشراء
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {!locationBalance.purchaseRecommendations ||
                      locationBalance.purchaseRecommendations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          لا توجد توصيات شراء حالياً
                        </p>
                      ) : (
                        locationBalance.purchaseRecommendations
                          .slice(0, 8)
                          .map((rec, index) => (
                            <div
                              key={`${rec.variantId}-${rec.locationId}-${index}`}
                              className="rounded border p-2 text-sm"
                            >
                              <p className="font-medium">
                                {rec.productName} ({rec.sku})
                              </p>
                              <p className="text-muted-foreground">
                                الموقع: {rec.locationName} • كمية مقترحة:{" "}
                                {formatQty(rec.suggestedQty)}
                              </p>
                            </div>
                          ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="order-usage" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  تتبع استهلاك المخزون لكل طلب
                </CardTitle>
                <CardDescription>
                  يوضح الكمية التي خرجت من المخزون لكل طلب خلال الفترة:{" "}
                  {selectedPeriodSummary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        عدد الطلبات المرتبطة بحركات مخزون
                      </p>
                      <p className="text-xl font-bold">
                        {orderConsumption.summary?.orderCount || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        إجمالي الوحدات المستهلكة
                      </p>
                      <p className="text-xl font-bold">
                        {formatQty(
                          orderConsumption.summary?.totalConsumedUnits || 0,
                        )}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        تكلفة تقديرية للاستهلاك
                      </p>
                      <p className="text-xl font-bold">
                        {formatCurrency(
                          orderConsumption.summary?.totalEstimatedCost || 0,
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {!orderConsumption.orders ||
                orderConsumption.orders.length === 0 ? (
                  <div className="rounded-md border p-8 text-center text-muted-foreground">
                    لا توجد حركات استهلاك مرتبطة بطلبات في الفترة الحالية
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الطلب</TableHead>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                        <TableHead className="text-center">
                          الوحدات المستهلكة
                        </TableHead>
                        <TableHead className="text-center">
                          التكلفة التقديرية
                        </TableHead>
                        <TableHead className="text-right">
                          تفاصيل الأصناف
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderConsumption.orders
                        .slice(0, 30)
                        .map((order, index) => (
                          <TableRow
                            key={`${order.orderId || "no-id"}-${order.orderNumber || "no-order"}-${index}`}
                          >
                            <TableCell className="font-medium">
                              {order.orderNumber}
                            </TableCell>
                            <TableCell>{order.customerName || "—"}</TableCell>
                            <TableCell className="text-center">
                              {toArabicLabel(order.status, orderStatusLabelMap)}
                            </TableCell>
                            <TableCell className="text-center">
                              {formatQty(order.totalConsumedUnits)}
                            </TableCell>
                            <TableCell className="text-center">
                              {formatCurrency(order.estimatedCost)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {order.items
                                .slice(0, 3)
                                .map(
                                  (item) =>
                                    `${item.productName} (${formatQty(item.consumedQty)})`,
                                )
                                .join(" • ") || "—"}
                              {order.items.length > 3
                                ? ` +${order.items.length - 3}`
                                : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cost-control" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  لوحة تحكم التكلفة (Target / Actual / Variance)
                </CardTitle>
                <CardDescription>
                  تحكم كامل في التكلفة: مستهدفات، حدود إنذار، الفعلي، الفروقات،
                  الهدر، والعائد التشغيلي خلال الفترة: {selectedPeriodSummary}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        المستهدف العام للتكلفة %
                      </p>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={costSettings.overallTargetPct}
                        onChange={(event) =>
                          updateBaseCostSetting(
                            "overallTargetPct",
                            event.target.value,
                          )
                        }
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        حد التحذير (+%)
                      </p>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={costSettings.warningDeltaPct}
                        onChange={(event) =>
                          updateBaseCostSetting(
                            "warningDeltaPct",
                            event.target.value,
                          )
                        }
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        حد الحرج (+%)
                      </p>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={costSettings.criticalDeltaPct}
                        onChange={(event) =>
                          updateBaseCostSetting(
                            "criticalDeltaPct",
                            event.target.value,
                          )
                        }
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        الهدر المسموح %
                      </p>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={costSettings.allowedWastePct}
                        onChange={(event) =>
                          updateBaseCostSetting(
                            "allowedWastePct",
                            event.target.value,
                          )
                        }
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        العائد المستهدف %
                      </p>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={costSettings.targetYieldPct}
                        onChange={(event) =>
                          updateBaseCostSetting(
                            "targetYieldPct",
                            event.target.value,
                          )
                        }
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        صافي المبيعات
                      </p>
                      <p className="text-xl font-bold">
                        {formatCurrency(costControl.sales.netSales)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {costControl.sales.paidOrdersCount} طلب مدفوع
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        COGS (تكلفة البضاعة)
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {formatCurrency(costControl.outboundCost)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        Actual Cost %
                      </p>
                      <p className="text-xl font-bold">
                        {formatQty(costControl.overall.actualCostPct)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        Target Cost %
                      </p>
                      <p className="text-xl font-bold">
                        {formatQty(costControl.overall.targetCostPct)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        Variance %
                      </p>
                      <p
                        className={cn(
                          "text-xl font-bold",
                          costControl.overall.variancePct >=
                            costSettings.criticalDeltaPct
                            ? "text-red-600"
                            : costControl.overall.variancePct >=
                                costSettings.warningDeltaPct
                              ? "text-yellow-600"
                              : "text-green-600",
                        )}
                      >
                        {formatQty(costControl.overall.variancePct)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        Variance (EGP)
                      </p>
                      <p
                        className={cn(
                          "text-xl font-bold",
                          costControl.overall.varianceAmount > 0
                            ? "text-red-600"
                            : "text-green-600",
                        )}
                      >
                        {formatCurrency(costControl.overall.varianceAmount)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <p className="text-xs text-muted-foreground">
                          الهدر الفعلي
                        </p>
                      </div>
                      <p className="text-xl font-bold text-orange-600">
                        {formatQty(costControl.wasteYield.actualWastePct)}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        المسموح:{" "}
                        {formatQty(costControl.wasteYield.allowedWastePct)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <Factory className="h-4 w-4 text-blue-500" />
                        <p className="text-xs text-muted-foreground">
                          العائد التشغيلي
                        </p>
                      </div>
                      <p className="text-xl font-bold">
                        {formatQty(costControl.wasteYield.actualYieldPct)}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        الهدف:{" "}
                        {formatQty(costControl.wasteYield.targetYieldPct)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        إجمالي الفاقد (وحدة)
                      </p>
                      <p className="text-xl font-bold">
                        {formatQty(costControl.wasteYield.totalWasteQty)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        تكلفة الفاقد
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {formatCurrency(costControl.wasteYield.totalWasteCost)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-blue-200 bg-blue-50/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      تنبيهات وإجراءات تلقائية مقترحة
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {costControl.alerts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        لا توجد تنبيهات حالياً. الأداء ضمن الحدود.
                      </p>
                    ) : (
                      costControl.alerts.map((alert, index) => (
                        <div
                          key={`${alert.title}-${index}`}
                          className={cn(
                            "rounded-md border p-3 text-sm",
                            alert.level === "critical"
                              ? "border-red-300 bg-red-50"
                              : alert.level === "warning"
                                ? "border-yellow-300 bg-yellow-50"
                                : "border-blue-300 bg-blue-50",
                          )}
                        >
                          <p className="font-semibold">{alert.title}</p>
                          <p className="text-muted-foreground mt-1">
                            {alert.action}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {!!costControl.recommendations.length && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        أهم الأصناف التي تحتاج تدخل
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {costControl.recommendations.map((item) => (
                        <div
                          key={item.sku}
                          className="rounded border p-2 text-sm"
                        >
                          <p className="font-medium">
                            {item.productName} ({item.sku})
                          </p>
                          <p className="text-muted-foreground">
                            {item.message} • فرق {formatQty(item.variancePct)}%
                            • هدر {formatQty(item.wastePct)}% • عائد{" "}
                            {formatQty(item.yieldPct)}%
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        مستهدفات حسب الفئة
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {costControl.rows.byCategory.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          لا توجد بيانات فئات كافية.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">
                                الفئة
                              </TableHead>
                              <TableHead className="text-center">
                                Actual%
                              </TableHead>
                              <TableHead className="text-center">
                                Target%
                              </TableHead>
                              <TableHead className="text-center">
                                إعداد
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {costControl.rows.byCategory
                              .slice(0, 12)
                              .map((row) => (
                                <TableRow key={row.category}>
                                  <TableCell className="font-medium">
                                    {row.category}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {formatQty(row.actualCostPct)}%
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {formatQty(row.targetCostPct)}%
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.1"
                                      value={
                                        costSettings.categoryTargets[
                                          row.category
                                        ] ?? ""
                                      }
                                      onChange={(event) =>
                                        updateMapCostSetting(
                                          "categoryTargets",
                                          row.category,
                                          event.target.value,
                                        )
                                      }
                                      className="h-8 w-24 mx-auto"
                                      placeholder={String(
                                        costSettings.overallTargetPct,
                                      )}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        مستهدفات حسب الموقع
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {costControl.rows.byLocation.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          لا توجد بيانات مواقع كافية.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">
                                الموقع
                              </TableHead>
                              <TableHead className="text-center">
                                Actual%
                              </TableHead>
                              <TableHead className="text-center">
                                Target%
                              </TableHead>
                              <TableHead className="text-center">
                                إعداد
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {costControl.rows.byLocation
                              .slice(0, 12)
                              .map((row) => (
                                <TableRow key={row.locationId}>
                                  <TableCell className="font-medium">
                                    {row.locationName}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {formatQty(row.actualCostPct)}%
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {formatQty(row.targetCostPct)}%
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.1"
                                      value={
                                        costSettings.locationTargets[
                                          row.locationId
                                        ] ?? ""
                                      }
                                      onChange={(event) =>
                                        updateMapCostSetting(
                                          "locationTargets",
                                          row.locationId,
                                          event.target.value,
                                        )
                                      }
                                      className="h-8 w-24 mx-auto"
                                      placeholder={String(
                                        costSettings.overallTargetPct,
                                      )}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {costControl.rows.bySku.length === 0 ? (
                  <div className="rounded-md border p-8 text-center text-muted-foreground">
                    لا توجد بيانات كافية لحساب Cost Control في الفترة الحالية
                  </div>
                ) : (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        تفاصيل حسب SKU
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">SKU</TableHead>
                            <TableHead className="text-right">الصنف</TableHead>
                            <TableHead className="text-right">الفئة</TableHead>
                            <TableHead className="text-center">
                              صافي المبيعات
                            </TableHead>
                            <TableHead className="text-center">COGS</TableHead>
                            <TableHead className="text-center">
                              Actual%
                            </TableHead>
                            <TableHead className="text-center">
                              Target%
                            </TableHead>
                            <TableHead className="text-center">
                              Variance%
                            </TableHead>
                            <TableHead className="text-center">
                              Variance EGP
                            </TableHead>
                            <TableHead className="text-center">
                              الهدر%
                            </TableHead>
                            <TableHead className="text-center">
                              العائد%
                            </TableHead>
                            <TableHead className="text-center">
                              الحالة
                            </TableHead>
                            <TableHead className="text-center">
                              هدف SKU
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {costControl.rows.bySku.slice(0, 30).map((row) => (
                            <TableRow key={row.sku}>
                              <TableCell className="font-medium">
                                {row.sku}
                              </TableCell>
                              <TableCell>{row.productName}</TableCell>
                              <TableCell>{row.category}</TableCell>
                              <TableCell className="text-center">
                                {formatCurrency(row.salesAmount)}
                              </TableCell>
                              <TableCell className="text-center text-red-600">
                                {formatCurrency(row.cogs)}
                              </TableCell>
                              <TableCell className="text-center">
                                {formatQty(row.actualCostPct)}%
                              </TableCell>
                              <TableCell className="text-center">
                                {formatQty(row.targetCostPct)}%
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-center font-medium",
                                  row.variancePct >=
                                    costSettings.criticalDeltaPct
                                    ? "text-red-600"
                                    : row.variancePct >=
                                        costSettings.warningDeltaPct
                                      ? "text-yellow-600"
                                      : "text-green-600",
                                )}
                              >
                                {formatQty(row.variancePct)}%
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-center font-medium",
                                  row.varianceAmount > 0
                                    ? "text-red-600"
                                    : "text-green-600",
                                )}
                              >
                                {formatCurrency(row.varianceAmount)}
                              </TableCell>
                              <TableCell className="text-center">
                                {formatQty(row.wastePct)}%
                              </TableCell>
                              <TableCell className="text-center">
                                {formatQty(row.yieldPct)}%
                              </TableCell>
                              <TableCell className="text-center">
                                {costStatusBadge(row.status)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  value={costSettings.skuTargets[row.sku] ?? ""}
                                  onChange={(event) =>
                                    updateMapCostSetting(
                                      "skuTargets",
                                      row.sku,
                                      event.target.value,
                                    )
                                  }
                                  className="h-8 w-24 mx-auto"
                                  placeholder={String(row.targetCostPct)}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {costControl.topCostDrains.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الوقت</TableHead>
                        <TableHead className="text-right">الصنف</TableHead>
                        <TableHead className="text-center">
                          نوع الحركة
                        </TableHead>
                        <TableHead className="text-center">
                          كمية خارجة
                        </TableHead>
                        <TableHead className="text-center">
                          تكلفة تقديرية
                        </TableHead>
                        <TableHead className="text-right">السبب</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costControl.topCostDrains
                        .slice(0, 20)
                        .map((movement, index) => (
                          <TableRow
                            key={`${movement.movementId || "cost-drain"}-${index}`}
                          >
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(movement.createdAt).toLocaleString(
                                "ar-EG",
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p>{movement.productName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {movement.sku}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {toArabicLabel(
                                movement.movementType,
                                movementTypeLabelMap,
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {formatQty(Math.abs(movement.onHandImpact || 0))}
                            </TableCell>
                            <TableCell className="text-center font-medium text-red-600">
                              {formatCurrency(
                                movement.estimatedCostImpact || 0,
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {movement.reason || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cost-trend" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  متوسط تكلفة الشراء الشهري لكل SKU
                </CardTitle>
                <CardDescription>
                  مصدر البيانات:{" "}
                  {monthlyCostTrend.source === "LOTS"
                    ? "دفعات الاستلام (الأدق)"
                    : "حركات المخزون"}
                  . هذه تكلفة شراء التاجر من المورد، وليست مبيعات العملاء.
                  الفترة: {selectedPeriodSummary}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        عدد الأصناف
                      </p>
                      <p className="text-xl font-bold">
                        {monthlyCostTrend.summary?.totalSkus || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        إجمالي كميات الشراء
                      </p>
                      <p className="text-xl font-bold">
                        {formatQty(
                          monthlyCostTrend.summary?.totalPurchasedUnits || 0,
                        )}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">
                        إجمالي تكلفة الشراء
                      </p>
                      <p className="text-xl font-bold">
                        {formatCurrency(
                          monthlyCostTrend.summary?.totalPurchasedCost || 0,
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {!monthlyCostTrend.items ||
                monthlyCostTrend.items.length === 0 ? (
                  <div className="rounded-md border p-8 text-center text-muted-foreground">
                    لا توجد بيانات شراء كافية لحساب متوسط تكلفة شهري
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">SKU</TableHead>
                        <TableHead className="text-right">الصنف</TableHead>
                        <TableHead className="text-center">
                          إجمالي الكمية
                        </TableHead>
                        <TableHead className="text-center">
                          متوسط التكلفة
                        </TableHead>
                        <TableHead className="text-center">
                          إجمالي تكلفة الشراء
                        </TableHead>
                        <TableHead className="text-right">
                          آخر متوسطات شهرية
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyCostTrend.items.slice(0, 30).map((item) => (
                        <TableRow key={item.sku}>
                          <TableCell className="font-medium">
                            {item.sku}
                          </TableCell>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell className="text-center">
                            {formatQty(item.totalPurchasedUnits)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatCurrency(item.overallAvgUnitCost)}
                          </TableCell>
                          <TableCell className="text-center">
                            {formatCurrency(item.totalPurchasedCost)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.months
                              .slice(-3)
                              .map(
                                (m) =>
                                  `${m.month}: ${formatCurrency(m.avgUnitCost)}`,
                              )
                              .join(" • ")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
