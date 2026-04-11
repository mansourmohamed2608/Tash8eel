"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/alerts";
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
} from "@/components/ui/dialog";
import {
  ShoppingCart,
  Search,
  Filter,
  Eye,
  Package,
  MapPin,
  Phone,
  Calendar,
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  Loader2,
  Plus,
  Minus,
  Trash2,
  LayoutGrid,
  Rows3,
} from "lucide-react";
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import { merchantApi, branchesApi } from "@/lib/client";
import portalApi from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  AiInsightsCard,
  generateOrderInsights,
} from "@/components/ai/ai-insights-card";

interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
}

interface Order {
  id: string;
  orderNumber: string;
  merchantId?: string;
  conversationId?: string;
  customerName: string;
  customerPhone: string;
  address: string;
  items: OrderItem[];
  total: number;
  status: string;
  sourceChannel?: string;
  deliveryType?: "delivery" | "pickup" | "dine_in";
  paymentStatus?: string;
  createdAt: string;
  updatedAt: string;
  deliveryStatus?: string;
  trackingNumber?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku?: string;
  unitPrice: number;
}

interface ManualOrderItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  DRAFT: <ShoppingCart className="h-4 w-4" />,
  CONFIRMED: <CheckCircle className="h-4 w-4" />,
  BOOKED: <Package className="h-4 w-4" />,
  SHIPPED: <Truck className="h-4 w-4" />,
  OUT_FOR_DELIVERY: <Truck className="h-4 w-4" />,
  DELIVERED: <CheckCircle className="h-4 w-4" />,
  CANCELLED: <XCircle className="h-4 w-4" />,
};

const DRIVER_ASSIGNABLE_STATUSES = new Set(["CONFIRMED"]);
const STATUS_TABS = [
  { key: "all", label: "الكل" },
  { key: "pending", label: "قيد الانتظار" },
  { key: "processing", label: "قيد التنفيذ" },
  { key: "completed", label: "مكتملة" },
  { key: "cancelled", label: "ملغية" },
] as const;

const KANBAN_COLUMNS = [
  {
    key: "pending",
    label: "قيد الانتظار",
    border: "border-t-[var(--accent-warning)]",
  },
  {
    key: "processing",
    label: "قيد التنفيذ",
    border: "border-t-[var(--accent-blue)]",
  },
  { key: "shipped", label: "تم الشحن", border: "border-t-[color:#8b5cf6]" },
  {
    key: "completed",
    label: "مكتملة",
    border: "border-t-[var(--accent-success)]",
  },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  manual_button: "زر يدوي",
  cashier: "الكاشير",
  calls: "المكالمات",
  whatsapp: "واتساب",
  voice_ai: "مكالمة AI",
  manual: "يدوي (قديم)",
};

function normalizeSourceChannel(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "whatsapp";
  if (normalized === "manual") return "manual_button";
  return normalized;
}

function getSourceLabel(value: unknown): string {
  const normalized = normalizeSourceChannel(value);
  return SOURCE_LABELS[normalized] || normalized || "غير معروف";
}

function getSourceBadgeClass(value: unknown): string {
  const normalized = normalizeSourceChannel(value);
  if (normalized === "cashier")
    return "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]";
  if (normalized === "calls")
    return "border-[color:rgba(245,158,11,0.26)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]";
  if (normalized === "manual_button")
    return "border-[color:var(--border-default)] bg-[color:var(--bg-surface-2)] text-[color:var(--text-secondary)]";
  if (normalized === "voice_ai")
    return "border-[color:rgba(232,197,71,0.24)] bg-[color:var(--accent-gold-dim)] text-[color:var(--accent-gold)]";
  if (normalized === "whatsapp")
    return "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.12)] text-[color:#86efac]";
  return "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] text-[color:var(--text-secondary)]";
}

function getOrderDisplayStatus(order: Order): string {
  const status = String(order.status || "")
    .trim()
    .toUpperCase();
  const source = normalizeSourceChannel(order.sourceChannel);
  const deliveryType = String(order.deliveryType || "")
    .trim()
    .toLowerCase();
  const paymentStatus = String(order.paymentStatus || "")
    .trim()
    .toUpperCase();

  if (source === "cashier") {
    if (deliveryType === "pickup") {
      if (status === "DELIVERED") {
        return paymentStatus === "PAID" ? "تم الدفع والاستلام" : "تم الاستلام";
      }
      if (status === "CONFIRMED") return "جاهز للاستلام";
    }

    if (deliveryType === "dine_in") {
      if (status === "DELIVERED") {
        return paymentStatus === "PAID" ? "تم الدفع" : "مكتمل";
      }
      if (status === "CONFIRMED") return "قيد التجهيز";
    }
  }

  return getStatusLabel(order.status);
}

// Heuristic cancellation-risk score based on order age + status
function getCancelRisk(
  order: Order,
): { label: string; className: string } | null {
  const statusesDone = new Set(["DELIVERED", "CANCELLED"]);
  if (statusesDone.has(order.status)) return null;

  const ageHours = (Date.now() - new Date(order.createdAt).getTime()) / 36e5;

  if (order.status === "DRAFT" && ageHours > 24) {
    return {
      label: "خطر إلغاء ↑",
      className:
        "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
    };
  }
  if (order.status === "CONFIRMED" && ageHours > 48) {
    return {
      label: "تأخر التسليم",
      className:
        "border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]",
    };
  }
  if (
    (order.status === "SHIPPED" || order.status === "BOOKED") &&
    ageHours > 72
  ) {
    return {
      label: "لم يُسلَّم بعد",
      className:
        "border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.08)] text-[color:#fdba74]",
    };
  }
  return null;
}

function getBoardStatus(order: Order) {
  const status = String(order.status || "").toUpperCase();
  if (["CANCELLED", "RETURNED", "FAILED"].includes(status)) return "cancelled";
  if (["DELIVERED", "COMPLETED"].includes(status)) return "completed";
  if (["BOOKED", "SHIPPED", "OUT_FOR_DELIVERY"].includes(status))
    return "shipped";
  if (["CONFIRMED"].includes(status)) return "processing";
  return "pending";
}

function getElapsedState(order: Order) {
  const ageMinutes =
    (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60);
  if (ageMinutes > 60) return "critical";
  if (ageMinutes > 30) return "warning";
  return "default";
}

export default function OrdersPage() {
  const { merchantId, apiKey } = useMerchant();
  const { canCreate, canExport, isReadOnly } = useRoleAccess("orders");
  const { toast: toastFn } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]); // Keep unfiltered orders for stats
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statusTab, setStatusTab] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [reordering, setReordering] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [drivers, setDrivers] = useState<
    {
      id: string;
      name: string;
      phone: string;
      vehicle_type: string;
      status: string;
    }[]
  >([]);
  const [assigningDriver, setAssigningDriver] = useState(false);
  const [reorderResult, setReorderResult] = useState<{
    success: boolean;
    message: string;
    orderNumber?: string;
    unavailableItems?: any[];
  } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualCustomerPhone, setManualCustomerPhone] = useState("");
  const [manualItems, setManualItems] = useState<ManualOrderItem[]>([]);
  const [manualDeliveryType, setManualDeliveryType] = useState<
    "delivery" | "pickup" | "dine_in"
  >("delivery");
  const [manualDeliveryAddress, setManualDeliveryAddress] = useState("");
  const [manualPaymentMethod, setManualPaymentMethod] = useState<
    "cash" | "card" | "transfer"
  >("cash");
  const [manualNotes, setManualNotes] = useState("");
  const itemsPerPage = 10;

  // Transform order data from API
  const transformOrder = useCallback((order: any): Order => {
    const parseOrderItems = (rawItems: unknown): any[] => {
      if (Array.isArray(rawItems)) return rawItems;
      if (rawItems && typeof rawItems === "object") {
        const nestedItems = (rawItems as { items?: unknown }).items;
        if (Array.isArray(nestedItems)) return nestedItems;
      }
      if (typeof rawItems === "string" && rawItems.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawItems);
          if (Array.isArray(parsed)) return parsed;
          if (
            parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { items?: unknown }).items)
          ) {
            return (parsed as { items: any[] }).items;
          }
          return [];
        } catch {
          return [];
        }
      }
      return [];
    };

    // Handle address - API returns deliveryAddress as object or string
    let addressStr = "";
    if (order.deliveryAddress) {
      if (typeof order.deliveryAddress === "string") {
        addressStr = order.deliveryAddress;
      } else if (typeof order.deliveryAddress === "object") {
        // Format address object: street, city, etc.
        const addr = order.deliveryAddress;
        addressStr =
          [addr.street, addr.district, addr.city, addr.governorate]
            .filter(Boolean)
            .join(", ") || "";
      }
    } else if (order.address) {
      addressStr = order.address;
    } else if (order.shippingAddress) {
      addressStr = order.shippingAddress;
    }

    const orderTotal = Number(order.totalPrice ?? order.total ?? 0) || 0;
    const parsedItems = parseOrderItems(order.items);
    const rawItems =
      parsedItems.length > 0
        ? parsedItems
        : Array.isArray(order.orderItems)
          ? order.orderItems
          : Array.isArray(order.itemsDetails)
            ? order.itemsDetails
            : [];

    // Transform items - API variants use mixed naming conventions
    const transformedItems: OrderItem[] = rawItems
      .map((item: any) => {
        const explicitOrderQuantity = Number(
          item.orderQuantity ??
            item.orderedQuantity ??
            item.requestedQty ??
            item.requestedQuantity ??
            item.quantityOrdered ??
            item.qtyOrdered ??
            item.order_qty ??
            item.quantity_ordered ??
            NaN,
        );
        const genericQuantity = Number(
          item.qty ?? item.count ?? item.quantity ?? 0,
        );
        let quantity =
          Number.isFinite(explicitOrderQuantity) && explicitOrderQuantity > 0
            ? explicitOrderQuantity
            : Number.isFinite(genericQuantity)
              ? genericQuantity
              : 0;
        const unitPrice =
          Number(
            item.unitPrice ??
              item.unit_price ??
              item.price ??
              item.basePrice ??
              item.base_price,
          ) || 0;
        const rawLineTotal = Number(
          item.lineTotal ??
            item.total ??
            item.total_price ??
            item.subtotal ??
            item.rowTotal ??
            NaN,
        );
        let lineTotal =
          Number.isFinite(rawLineTotal) && rawLineTotal > 0
            ? rawLineTotal
            : undefined;
        if (lineTotal !== undefined && unitPrice > 0 && quantity > 0) {
          const impliedQuantity = lineTotal / unitPrice;
          if (
            Math.abs(impliedQuantity - Math.round(impliedQuantity)) < 0.01 &&
            Math.abs(lineTotal - quantity * unitPrice) > 0.01
          ) {
            quantity = Math.max(1, Math.round(impliedQuantity));
          }
        }
        const name =
          item.name ||
          item.productName ||
          item.product_name ||
          item.title ||
          item.sku ||
          "منتج غير معروف";
        const sku =
          item.sku ||
          item.productSku ||
          item.product_sku ||
          item.productId ||
          item.catalogItemId ||
          "";

        return {
          sku,
          name,
          quantity,
          unitPrice,
          lineTotal,
        };
      })
      .filter((item: OrderItem) => item.quantity > 0);

    const consolidatedItems = Array.from(
      transformedItems.reduce((acc, item) => {
        const key = `${(item.sku || "").toLowerCase()}::${item.name.toLowerCase()}::${item.unitPrice.toFixed(4)}`;
        const existing = acc.get(key);
        if (existing) {
          const existingLine =
            existing.lineTotal ?? existing.quantity * existing.unitPrice;
          const itemLine = item.lineTotal ?? item.quantity * item.unitPrice;
          existing.quantity += item.quantity;
          existing.lineTotal = Number((existingLine + itemLine).toFixed(2));
        } else {
          acc.set(key, { ...item });
        }
        return acc;
      }, new Map<string, OrderItem>()),
    ).map(([, value]) => value);

    const computeItemsTotal = (items: OrderItem[]) =>
      Number(
        items
          .reduce(
            (sum, item) =>
              sum + (item.lineTotal ?? item.quantity * item.unitPrice),
            0,
          )
          .toFixed(2),
      );

    let normalizedItems = consolidatedItems;
    const consolidatedTotal = computeItemsTotal(consolidatedItems);
    const mismatchRatio =
      orderTotal > 0
        ? Math.abs(consolidatedTotal - orderTotal) / orderTotal
        : 0;

    // Repair obvious quantity corruption cases (e.g. stock quantity shown as order quantity).
    if (orderTotal > 0 && normalizedItems.length === 1 && mismatchRatio > 0.5) {
      const [single] = normalizedItems;
      let repaired = { ...single };
      if (single.unitPrice > 0) {
        const inferredQuantity = Math.max(
          1,
          Math.round(orderTotal / single.unitPrice),
        );
        repaired = {
          ...single,
          quantity: inferredQuantity,
          lineTotal: Number((single.unitPrice * inferredQuantity).toFixed(2)),
        };
      }
      normalizedItems = [repaired];
    }

    return {
      id: order.id,
      orderNumber:
        order.orderNumber || `ORD-${order.id.slice(0, 8).toUpperCase()}`,
      merchantId: order.merchantId,
      conversationId: order.conversationId,
      customerName: order.customerName || "عميل",
      customerPhone: order.customerPhone || "",
      address: addressStr,
      items: normalizedItems,
      total: orderTotal,
      status: order.status,
      sourceChannel: normalizeSourceChannel(
        order.sourceChannel || order.source_channel,
      ),
      deliveryType: (
        order.deliveryPreference ||
        order.delivery_preference ||
        ""
      )
        .toString()
        .trim()
        .toLowerCase() as "delivery" | "pickup" | "dine_in",
      paymentStatus: String(
        order.paymentStatus || order.payment_status || "",
      ).trim(),
      trackingNumber: order.trackingNumber,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch ALL orders for stats (no branch filter for stats)
      const allResponse = await merchantApi.getOrders(merchantId, apiKey);
      const allTransformed = allResponse.orders.map(transformOrder);
      setAllOrders(allTransformed);

      // If any filter applied, fetch filtered data for table
      const hasFilter =
        statusFilter !== "all" ||
        branchFilter !== "all" ||
        sourceFilter !== "all";
      if (hasFilter) {
        const filteredResponse = await merchantApi.getOrders(
          merchantId,
          apiKey,
          {
            status: statusFilter !== "all" ? statusFilter : undefined,
            branchId: branchFilter !== "all" ? branchFilter : undefined,
            source: sourceFilter !== "all" ? sourceFilter : undefined,
          },
        );
        const filteredTransformed = filteredResponse.orders.map(transformOrder);
        setOrders(filteredTransformed);
      } else {
        setOrders(allTransformed);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      setError(err instanceof Error ? err.message : "فشل في تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  }, [
    merchantId,
    apiKey,
    statusFilter,
    branchFilter,
    sourceFilter,
    transformOrder,
  ]);

  const resetManualOrderForm = useCallback(() => {
    setProductSearch("");
    setManualCustomerName("");
    setManualCustomerPhone("");
    setManualItems([]);
    setManualDeliveryType("delivery");
    setManualDeliveryAddress("");
    setManualPaymentMethod("cash");
    setManualNotes("");
  }, []);

  const openCreateOrderDialog = useCallback(async () => {
    if (!apiKey) {
      toastFn({
        title: "تعذر المتابعة",
        description: "مفتاح التاجر غير متوفر حالياً",
        variant: "destructive",
      });
      return;
    }

    setCreateDialogOpen(true);
    if (catalogProducts.length > 0) return;

    setCatalogLoading(true);
    try {
      const response = await merchantApi.getCatalogItems(
        merchantId,
        apiKey,
        1,
        500,
      );
      const mapped: CatalogProduct[] = (response.items || [])
        .map((item: any) => {
          const name =
            String(
              item?.name_ar ||
                item?.nameAr ||
                item?.name ||
                item?.title ||
                item?.sku ||
                "",
            ).trim() || "منتج";
          const unitPrice = Number(
            item?.base_price ?? item?.price ?? item?.unit_price ?? 0,
          );

          return {
            id: String(item?.id || "").trim(),
            name,
            sku: String(item?.sku || "").trim() || undefined,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          };
        })
        .filter((item: CatalogProduct) => item.id.length > 0);

      setCatalogProducts(mapped);
    } catch (err) {
      toastFn({
        title: "تعذر تحميل المنتجات",
        description:
          err instanceof Error ? err.message : "حدث خطأ أثناء تحميل الكتالوج",
        variant: "destructive",
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogProducts.length, merchantId, apiKey, toastFn]);

  const addCatalogItemToManualOrder = useCallback((product: CatalogProduct) => {
    setManualItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.catalogItemId === product.id ||
          (!item.catalogItemId && item.name === product.name),
      );

      if (existingIndex >= 0) {
        return prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...prev,
        {
          catalogItemId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.unitPrice,
        },
      ];
    });
    setProductSearch("");
  }, []);

  const updateManualItem = useCallback(
    (
      index: number,
      patch: Partial<{
        quantity: number;
        unitPrice: number;
        notes: string;
      }>,
    ) => {
      setManualItems((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...patch,
                quantity:
                  patch.quantity !== undefined
                    ? Math.max(1, Number(patch.quantity) || 1)
                    : item.quantity,
                unitPrice:
                  patch.unitPrice !== undefined
                    ? Math.max(0, Number(patch.unitPrice) || 0)
                    : item.unitPrice,
              }
            : item,
        ),
      );
    },
    [],
  );

  const removeManualItem = useCallback((index: number) => {
    setManualItems((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index),
    );
  }, []);

  const handleCreateManualOrder = useCallback(async () => {
    if (!apiKey) {
      toastFn({
        title: "تعذر إنشاء الطلب",
        description: "مفتاح التاجر غير متوفر حالياً",
        variant: "destructive",
      });
      return;
    }

    const customerName = manualCustomerName.trim();
    const customerPhone = manualCustomerPhone.trim();
    const deliveryAddress = manualDeliveryAddress.trim();
    const notes = manualNotes.trim();

    if (!customerName) {
      toastFn({
        title: "بيانات ناقصة",
        description: "يرجى إدخال اسم العميل",
        variant: "destructive",
      });
      return;
    }

    if (!customerPhone) {
      toastFn({
        title: "بيانات ناقصة",
        description: "يرجى إدخال رقم هاتف العميل",
        variant: "destructive",
      });
      return;
    }

    if (manualItems.length === 0) {
      toastFn({
        title: "بيانات ناقصة",
        description: "أضف منتجاً واحداً على الأقل للطلب",
        variant: "destructive",
      });
      return;
    }

    if (manualDeliveryType === "delivery" && !deliveryAddress) {
      toastFn({
        title: "بيانات ناقصة",
        description: "يرجى إدخال عنوان التوصيل",
        variant: "destructive",
      });
      return;
    }

    const invalidItem = manualItems.find(
      (item) =>
        !item.name ||
        !Number.isFinite(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        !Number.isFinite(Number(item.unitPrice)) ||
        Number(item.unitPrice) < 0,
    );
    if (invalidItem) {
      toastFn({
        title: "عناصر الطلب غير صالحة",
        description: "تأكد من أن كل عنصر يحتوي على اسم وكمية وسعر وحدة صحيح",
        variant: "destructive",
      });
      return;
    }

    setCreatingOrder(true);
    try {
      const created = await merchantApi.createManualOrder(merchantId, apiKey, {
        customerName,
        customerPhone,
        items: manualItems.map((item) => ({
          catalogItemId: item.catalogItemId,
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          notes: item.notes?.trim() || undefined,
        })),
        deliveryType: manualDeliveryType,
        deliveryAddress:
          manualDeliveryType === "delivery" ? deliveryAddress : undefined,
        paymentMethod: manualPaymentMethod,
        notes: notes || undefined,
        source: "manual_button",
      });

      toastFn({
        title: "تم إنشاء الطلب بنجاح",
        description: `رقم الطلب: ${created.orderNumber}`,
      });

      setCreateDialogOpen(false);
      resetManualOrderForm();
      await fetchOrders();
    } catch (err) {
      toastFn({
        title: "فشل إنشاء الطلب",
        description:
          err instanceof Error ? err.message : "تعذر إنشاء الطلب حالياً",
        variant: "destructive",
      });
    } finally {
      setCreatingOrder(false);
    }
  }, [
    manualCustomerName,
    manualCustomerPhone,
    manualDeliveryAddress,
    manualNotes,
    manualItems,
    manualDeliveryType,
    manualPaymentMethod,
    merchantId,
    apiKey,
    toastFn,
    resetManualOrderForm,
    fetchOrders,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Load delivery drivers for assignment
  useEffect(() => {
    portalApi
      .getDeliveryDrivers()
      .then((data: any) => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => {
        /* drivers optional - non-blocking */
      });
  }, []);

  // Load branches for filter
  useEffect(() => {
    if (apiKey) {
      branchesApi
        .list(apiKey)
        .then((res: any) => setBranches(res.branches ?? res.data ?? []))
        .catch(() => {
          /* branches filter is optional */
        });
    }
  }, [apiKey]);

  // Client-side search filtering (API already filtered by status)
  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerPhone.includes(searchQuery);
    const boardStatus = getBoardStatus(order);
    const matchesTab =
      statusTab === "all" ||
      (statusTab === "pending" && boardStatus === "pending") ||
      (statusTab === "processing" &&
        (boardStatus === "processing" || boardStatus === "shipped")) ||
      (statusTab === "completed" && boardStatus === "completed") ||
      (statusTab === "cancelled" && boardStatus === "cancelled");
    return matchesSearch && matchesTab;
  });

  const filteredCatalogProducts =
    productSearch.trim().length === 0
      ? []
      : catalogProducts
          .filter((product) => {
            const query = productSearch.trim().toLowerCase();
            return (
              product.name.toLowerCase().includes(query) ||
              String(product.sku || "")
                .toLowerCase()
                .includes(query)
            );
          })
          .slice(0, 8);

  const manualOrderTotal = Number(
    manualItems
      .reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
        0,
      )
      .toFixed(2),
  );

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleExportCSV = () => {
    const headers = [
      "رقم الطلب",
      "العميل",
      "رقم الهاتف",
      "العنوان",
      "المنتجات",
      "الإجمالي",
      "الحالة",
      "تاريخ الإنشاء",
    ];
    const rows = filteredOrders.map((order) => [
      order.orderNumber || "",
      order.customerName || "",
      order.customerPhone || "",
      order.address || "لا يوجد عنوان",
      order.items && order.items.length > 0
        ? order.items
            .map((i) => `${i.name || "منتج"} x${i.quantity || 1}`)
            .join(", ")
        : "لا توجد منتجات",
      order.total?.toString() || "0",
      getOrderDisplayStatus(order) || order.status || "",
      new Date(order.createdAt).toLocaleDateString("ar-EG"),
    ]);

    // Escape CSV values properly - handle commas, quotes, and newlines
    const escapeCSV = (value: string) => {
      if (value === null || value === undefined) return '""';
      const str = String(value);
      // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
      if (
        str.includes(",") ||
        str.includes('"') ||
        str.includes("\n") ||
        str.includes("\r")
      ) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const csvContent = [
      headers.map((h) => escapeCSV(h)).join(","),
      ...rows.map((row) =>
        row.map((cell) => escapeCSV(String(cell))).join(","),
      ),
    ].join("\r\n");

    // Use BOM for UTF-8 to ensure Excel opens with correct encoding
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Handle reorder - create new order from existing order
  const handleReorder = async (orderId: string) => {
    if (!apiKey) return;

    setReordering(true);
    setReorderResult(null);

    try {
      const response = await fetch(`/api/v1/portal/orders/${orderId}/reorder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      });

      const result = await response.json();
      setReorderResult(result);

      if (result.success) {
        // Refresh orders list
        fetchOrders();
      }
    } catch (err) {
      setReorderResult({
        success: false,
        message: err instanceof Error ? err.message : "فشل في إعادة الطلب",
      });
    } finally {
      setReordering(false);
    }
  };

  // Calculate stats from ALL orders (not filtered), aligned with dashboard rules.
  const ordersForStats = allOrders.length > 0 ? allOrders : orders;
  const normalizeStatus = (status: string) =>
    String(status || "").toUpperCase();
  const isDraftStatus = (status: string) => normalizeStatus(status) === "DRAFT";
  const isCancelledStatus = (status: string) =>
    ["CANCELLED", "RETURNED", "FAILED"].includes(normalizeStatus(status));
  const isCompletedStatus = (status: string) =>
    ["DELIVERED", "COMPLETED"].includes(normalizeStatus(status));
  const isInProgressStatus = (status: string) =>
    ["BOOKED", "SHIPPED", "OUT_FOR_DELIVERY"].includes(normalizeStatus(status));

  const countedOrders = ordersForStats.filter((o) => !isDraftStatus(o.status));
  const stats = {
    total: countedOrders.length,
    pending: countedOrders.filter(
      (o) =>
        !isCancelledStatus(o.status) &&
        !isCompletedStatus(o.status) &&
        !isInProgressStatus(o.status),
    ).length,
    inProgress: countedOrders.filter((o) => isInProgressStatus(o.status))
      .length,
    completed: countedOrders.filter((o) => isCompletedStatus(o.status)).length,
    cancelled: countedOrders.filter((o) => isCancelledStatus(o.status)).length,
  };

  // AOV for merchants: realized (completed) orders only.
  const completedOrdersForAov = countedOrders.filter((o) =>
    isCompletedStatus(o.status),
  );
  const completedRevenueTotal = completedOrdersForAov.reduce(
    (sum, o) => sum + (o.total || 0),
    0,
  );
  const averageOrderValue =
    completedOrdersForAov.length > 0
      ? completedRevenueTotal / completedOrdersForAov.length
      : 0;

  // Calculate revenue (today only, realized orders only: DELIVERED/COMPLETED).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isRevenueOrder = (status: string) => isCompletedStatus(status);
  const todayRevenue = ordersForStats
    .filter((o) => {
      if (!isRevenueOrder(o.status)) return false;
      const createdAt = new Date(o.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= startOfToday;
    })
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const tabCounts = {
    all: countedOrders.length,
    pending: countedOrders.filter((o) => getBoardStatus(o) === "pending")
      .length,
    processing: countedOrders.filter((o) => {
      const stage = getBoardStatus(o);
      return stage === "processing" || stage === "shipped";
    }).length,
    completed: countedOrders.filter((o) => getBoardStatus(o) === "completed")
      .length,
    cancelled: countedOrders.filter((o) => getBoardStatus(o) === "cancelled")
      .length,
  };
  const summaryColumns = [
    {
      label: "إجمالي الطلبات",
      value: stats.total,
      icon: <ShoppingCart className="h-4 w-4" />,
      tone: "",
    },
    {
      label: "قيد الانتظار",
      value: tabCounts.pending,
      icon: <Clock className="h-4 w-4" />,
      tone: tabCounts.pending > 0 ? "bg-[color:rgba(245,158,11,0.10)]" : "",
    },
    {
      label: "قيد التنفيذ",
      value: stats.inProgress,
      icon: <Package className="h-4 w-4" />,
      tone: "",
    },
    {
      label: "مكتملة",
      value: stats.completed,
      icon: <CheckCircle className="h-4 w-4" />,
      tone: "",
    },
    {
      label: "ملغية",
      value: stats.cancelled,
      icon: <XCircle className="h-4 w-4" />,
      tone: "",
    },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="الطلبات" />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="الطلبات" />
        <Card>
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">خطأ في تحميل الطلبات</h3>
              <p className="text-muted-foreground mt-2">{error}</p>
              <Button onClick={fetchOrders} variant="outline" className="mt-4">
                <RefreshCw className="h-4 w-4 ml-2" />
                إعادة المحاولة
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader
        title="الطلبات"
        description="تشغيل ومتابعة الطلبات الحالية بسرعة، مع قراءة فورية للحالات الحرجة."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canCreate && (
              <Button
                onClick={openCreateOrderDialog}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 ml-2" />
                إنشاء طلب جديد
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrders}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canExport && (
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={filteredOrders.length === 0}
                className="w-full sm:w-auto"
              >
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير CSV
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatusTab(tab.key);
              setCurrentPage(1);
            }}
            className={cn(
              "inline-flex h-9 items-center rounded-[var(--radius-sm)] border px-3 text-xs font-semibold transition-colors",
              statusTab === tab.key
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[#0A0A0B]"
                : "border-[var(--border-default)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]",
            )}
          >
            {tab.label} ({tabCounts[tab.key as keyof typeof tabCounts]})
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
        <div className="grid gap-0 lg:grid-cols-5">
          {summaryColumns.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                "flex h-16 items-center justify-between gap-3 px-4",
                item.tone,
                index !== summaryColumns.length - 1 &&
                  "border-b border-[var(--border-subtle)] lg:border-b-0 lg:border-l",
              )}
            >
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                {item.icon}
                <span className="text-[11px]">{item.label}</span>
              </div>
              <strong className="font-mono text-[24px] font-bold text-[var(--text-primary)]">
                {item.value}
              </strong>
            </div>
          ))}
        </div>
      </section>

      {/* AI Order Insights */}
      <AiInsightsCard
        title="تنبيهات الطلبات"
        insights={generateOrderInsights({
          totalOrders: stats.total,
          cancelledOrders: stats.cancelled,
          averageOrderValue,
          deliveredOrders: stats.completed,
          pendingOrders: stats.pending + stats.inProgress,
        })}
      />

      {/* Filters */}
      <Card className="app-data-card">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الطلب، اسم العميل، أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                value={sourceFilter}
                onValueChange={(value) => {
                  setSourceFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <Filter className="ml-2 h-4 w-4" />
                  <SelectValue placeholder="المصدر" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المصادر</SelectItem>
                  <SelectItem value="manual_button">زر يدوي</SelectItem>
                  <SelectItem value="cashier">الكاشير</SelectItem>
                  <SelectItem value="calls">المكالمات</SelectItem>
                  <SelectItem value="whatsapp">واتساب</SelectItem>
                  <SelectItem value="voice_ai">مكالمة AI</SelectItem>
                </SelectContent>
              </Select>
              {branches.length > 1 && (
                <Select
                  value={branchFilter}
                  onValueChange={(value) => {
                    setBranchFilter(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-1)]">
                <button
                  type="button"
                  onClick={() => setViewMode("kanban")}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 px-3 text-xs font-semibold transition-colors",
                    viewMode === "kanban"
                      ? "bg-[var(--bg-surface-3)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                  كانبان
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 px-3 text-xs font-semibold transition-colors",
                    viewMode === "table"
                      ? "bg-[var(--bg-surface-3)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <Rows3 className="h-4 w-4" />
                  جدول
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <Card className="app-data-card">
          <CardContent className="p-12">
            <EmptyState
              icon={<ShoppingCart className="h-16 w-16" />}
              title="لا توجد طلبات"
              description={
                searchQuery ||
                statusFilter !== "all" ||
                branchFilter !== "all" ||
                sourceFilter !== "all"
                  ? "لم يتم العثور على طلبات مطابقة للبحث"
                  : "لم يتم إنشاء أي طلبات بعد. يمكنك إنشاء طلب جديد يدوياً من الزر بالأعلى."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {viewMode === "kanban" ? (
            <div className="grid gap-4 xl:grid-cols-4">
              {KANBAN_COLUMNS.map((column) => {
                const columnOrders = filteredOrders.filter(
                  (order) => getBoardStatus(order) === column.key,
                );

                return (
                  <Card
                    key={column.key}
                    className={cn(
                      "app-data-card max-h-[70vh] overflow-hidden border-t-2",
                      column.border,
                    )}
                  >
                    <CardContent className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold">{column.label}</h3>
                        <span className="rounded-[4px] bg-[var(--bg-surface-3)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
                          {columnOrders.length}
                        </span>
                      </div>
                      <div className="space-y-3 overflow-y-auto">
                        {columnOrders.length === 0 ? (
                          <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-default)] px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                            لا توجد طلبات في هذه المرحلة
                          </div>
                        ) : (
                          columnOrders.map((order) => {
                            const elapsedState = getElapsedState(order);
                            return (
                              <button
                                key={order.id}
                                type="button"
                                onClick={() => setSelectedOrder(order)}
                                className={cn(
                                  "w-full rounded-[8px] border border-[var(--border-default)] border-r-[3px] bg-[var(--bg-surface-2)] p-3 text-right transition-colors hover:bg-[var(--bg-surface-3)]",
                                  column.key === "pending" &&
                                    "border-r-[var(--accent-warning)]",
                                  column.key === "processing" &&
                                    "border-r-[var(--accent-blue)]",
                                  column.key === "shipped" &&
                                    "border-r-[color:#8b5cf6]",
                                  column.key === "completed" &&
                                    "border-r-[var(--accent-success)]",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-xs text-[var(--accent-gold)]">
                                    {order.orderNumber}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "text-[11px] font-mono",
                                        elapsedState === "critical" &&
                                          "text-[var(--accent-danger)]",
                                        elapsedState === "warning" &&
                                          "text-[var(--accent-warning)]",
                                        elapsedState === "default" &&
                                          "text-[var(--text-muted)]",
                                      )}
                                    >
                                      {formatRelativeTime(order.createdAt)}
                                    </span>
                                    <span
                                      className={cn(
                                        "inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold",
                                        getSourceBadgeClass(
                                          order.sourceChannel,
                                        ),
                                      )}
                                    >
                                      {getSourceLabel(order.sourceChannel)}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                                    {order.customerName}
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                                    {order.items.length > 0
                                      ? order.items
                                          .slice(0, 2)
                                          .map((item) => item.name)
                                          .join("، ")
                                      : "بدون منتجات واضحة"}
                                  </p>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                  <strong className="font-mono text-sm text-[var(--text-primary)]">
                                    {formatCurrency(order.total)}
                                  </strong>
                                  <span className="text-xs text-[var(--text-secondary)]">
                                    {getOrderDisplayStatus(order)}
                                  </span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {paginatedOrders.map((order) => {
                  const risk = getCancelRisk(order);
                  return (
                    <Card
                      key={order.id}
                      className="app-data-card cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <CardContent className="space-y-3 p-4 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-sm">
                              {order.orderNumber}
                            </p>
                            <p className="font-medium">{order.customerName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(order.createdAt)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrder(order);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-0.5 text-xs font-semibold",
                              getStatusColor(order.status),
                            )}
                          >
                            {statusIcons[order.status]}
                            {getOrderDisplayStatus(order)}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-[var(--radius-sm)] border px-2.5 py-0.5 text-xs font-semibold",
                              getSourceBadgeClass(order.sourceChannel),
                            )}
                          >
                            {getSourceLabel(order.sourceChannel)}
                          </span>
                          {risk && (
                            <span
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                                risk.className,
                              )}
                            >
                              {risk.label}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            المنتجات
                          </p>
                          <p className="text-sm">
                            {order.items.length > 0
                              ? `${order.items
                                  .slice(0, 2)
                                  .map((i) => i.name)
                                  .join(
                                    "، ",
                                  )}${order.items.length > 2 ? ` +${order.items.length - 2}` : ""}`
                              : "غير محدد"}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                          <div>
                            <p className="text-muted-foreground">الإجمالي</p>
                            <p className="font-semibold">
                              {formatCurrency(order.total)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">عدد القطع</p>
                            <p className="font-medium">
                              {order.items.reduce(
                                (sum, item) => sum + (item.quantity || 0),
                                0,
                              )}{" "}
                              قطعة
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="hidden md:block">
                <DataTable
                  data={paginatedOrders}
                  columns={[
                    {
                      key: "orderNumber",
                      header: "رقم الطلب",
                      render: (order) => (
                        <span className="font-mono text-sm">
                          {order.orderNumber}
                        </span>
                      ),
                    },
                    { key: "customerName", header: "العميل" },
                    {
                      key: "items",
                      header: "المنتجات",
                      render: (order) =>
                        order.items.length > 0 ? (
                          <div className="max-w-[220px]">
                            <div
                              className="truncate text-sm"
                              title={order.items.map((i) => i.name).join("، ")}
                            >
                              {order.items
                                .slice(0, 2)
                                .map((i) => i.name)
                                .join("، ")}
                              {order.items.length > 2
                                ? ` +${order.items.length - 2}`
                                : ""}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {order.items.reduce(
                                (sum, item) => sum + (item.quantity || 0),
                                0,
                              )}{" "}
                              قطعة
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            غير محدد
                          </span>
                        ),
                    },
                    {
                      key: "total",
                      header: "الإجمالي",
                      render: (order) => (
                        <span className="font-semibold">
                          {formatCurrency(order.total)}
                        </span>
                      ),
                    },
                    {
                      key: "status",
                      header: "الحالة",
                      render: (order) => {
                        const risk = getCancelRisk(order);
                        return (
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-0.5 text-xs font-semibold",
                                getStatusColor(order.status),
                              )}
                            >
                              {statusIcons[order.status]}
                              {getOrderDisplayStatus(order)}
                            </span>
                            {risk && (
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                                  risk.className,
                                )}
                              >
                                {risk.label}
                              </span>
                            )}
                          </div>
                        );
                      },
                    },
                    {
                      key: "source",
                      header: "المصدر",
                      render: (order) => (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-[var(--radius-sm)] border px-2.5 py-0.5 text-xs font-semibold",
                            getSourceBadgeClass(order.sourceChannel),
                          )}
                        >
                          {getSourceLabel(order.sourceChannel)}
                        </span>
                      ),
                    },
                    {
                      key: "createdAt",
                      header: "التاريخ",
                      render: (order) => (
                        <span className="text-muted-foreground text-sm">
                          {formatRelativeTime(order.createdAt)}
                        </span>
                      ),
                    },
                    {
                      key: "actions",
                      header: "",
                      render: (order) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(order);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      ),
                    },
                  ]}
                  onRowClick={setSelectedOrder}
                />
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Manual Order Creation Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (creatingOrder) return;
          setCreateDialogOpen(open);
          if (!open) {
            resetManualOrderForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              إنشاء طلب جديد
            </DialogTitle>
            <DialogDescription>
              أنشئ طلباً يدوياً من داخل البوابة بدون محادثة واتساب.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5" dir="rtl">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">اسم العميل</p>
                <Input
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  placeholder="مثال: محمد أحمد"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">رقم هاتف العميل</p>
                <Input
                  value={manualCustomerPhone}
                  onChange={(e) => setManualCustomerPhone(e.target.value)}
                  placeholder="01000000000"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">بحث المنتجات وإضافتها</p>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="اكتب اسم المنتج أو SKU..."
                  className="pr-9"
                />

                {productSearch.trim().length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)]">
                    {catalogLoading ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري تحميل المنتجات...
                      </div>
                    ) : filteredCatalogProducts.length > 0 ? (
                      filteredCatalogProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="w-full px-3 py-2 text-right transition-colors hover:bg-[color:var(--bg-surface-3)]"
                          onClick={() => addCatalogItemToManualOrder(product)}
                        >
                          <div className="font-medium text-sm">
                            {product.name}
                          </div>
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <span dir="ltr" className="truncate">
                              {product.sku || "-"}
                            </span>
                            <span>{formatCurrency(product.unitPrice)}</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        لا توجد منتجات مطابقة
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border">
                <div className="px-3 py-2 border-b bg-muted/40 text-sm font-medium">
                  عناصر الطلب
                </div>
                {manualItems.length === 0 ? (
                  <div className="px-3 py-5 text-sm text-muted-foreground text-center">
                    لم تتم إضافة منتجات بعد
                  </div>
                ) : (
                  <div className="divide-y">
                    {manualItems.map((item, index) => (
                      <div
                        key={`${item.catalogItemId || item.name}-${index}`}
                        className="p-3 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.name}
                            </p>
                            <p
                              className="text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              {item.catalogItemId || "Custom Item"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeManualItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              الكمية
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  updateManualItem(index, {
                                    quantity: Math.max(1, item.quantity - 1),
                                  })
                                }
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) =>
                                  updateManualItem(index, {
                                    quantity: Number(e.target.value || 1),
                                  })
                                }
                                className="h-8 text-center"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  updateManualItem(index, {
                                    quantity: item.quantity + 1,
                                  })
                                }
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              سعر الوحدة
                            </p>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateManualItem(index, {
                                  unitPrice: Number(e.target.value || 0),
                                })
                              }
                              className="h-8"
                            />
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              إجمالي السطر
                            </p>
                            <div className="h-8 px-3 rounded-md border bg-muted/40 flex items-center text-sm font-medium">
                              {formatCurrency(item.quantity * item.unitPrice)}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            ملاحظات العنصر (اختياري)
                          </p>
                          <Input
                            value={item.notes || ""}
                            onChange={(e) =>
                              updateManualItem(index, { notes: e.target.value })
                            }
                            placeholder="مثال: بدون بصل"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[color:rgba(232,197,71,0.2)] bg-[color:var(--accent-gold-dim)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">الإجمالي الحالي</span>
                <span className="text-sm font-bold text-[color:var(--accent-gold)]">
                  {formatCurrency(manualOrderTotal)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">نوع الطلب</p>
                <Select
                  value={manualDeliveryType}
                  onValueChange={(value: "delivery" | "pickup" | "dine_in") =>
                    setManualDeliveryType(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر نوع الطلب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">توصيل</SelectItem>
                    <SelectItem value="pickup">استلام</SelectItem>
                    <SelectItem value="dine_in">تناول هنا</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">طريقة الدفع</p>
                <Select
                  value={manualPaymentMethod}
                  onValueChange={(value: "cash" | "card" | "transfer") =>
                    setManualPaymentMethod(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر طريقة الدفع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">كاش</SelectItem>
                    <SelectItem value="card">كارت</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {manualDeliveryType === "delivery" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">عنوان التوصيل</p>
                <Input
                  value={manualDeliveryAddress}
                  onChange={(e) => setManualDeliveryAddress(e.target.value)}
                  placeholder="المدينة، المنطقة، الشارع..."
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">ملاحظات الطلب (اختياري)</p>
              <Textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="أي تفاصيل إضافية للطلب"
                rows={3}
              />
            </div>

            <div className="flex flex-col-reverse justify-end gap-3 border-t pt-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  if (creatingOrder) return;
                  setCreateDialogOpen(false);
                  resetManualOrderForm();
                }}
                disabled={creatingOrder}
                className="w-full sm:w-auto"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleCreateManualOrder}
                disabled={creatingOrder}
                className="w-full sm:w-auto"
              >
                {creatingOrder ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الإنشاء...
                  </>
                ) : (
                  "إنشاء الطلب"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog
        open={!!selectedOrder}
        onOpenChange={() => setSelectedOrder(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              تفاصيل الطلب {selectedOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              تم الإنشاء:{" "}
              {selectedOrder && formatDate(selectedOrder.createdAt, "long")}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Status + Change */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-3 py-1 text-sm font-semibold",
                      getStatusColor(selectedOrder.status),
                    )}
                  >
                    {statusIcons[selectedOrder.status]}
                    {getOrderDisplayStatus(selectedOrder)}
                  </span>
                </div>
                {!isReadOnly &&
                  !["DELIVERED", "CANCELLED", "RETURNED"].includes(
                    selectedOrder.status,
                  ) && (
                    <Select
                      value=""
                      onValueChange={async (newStatus) => {
                        if (!newStatus) return;
                        setStatusUpdating(true);
                        try {
                          await portalApi.updateOrderStatus(
                            selectedOrder.id,
                            newStatus,
                          );
                          setOrders((prev) =>
                            prev.map((o) =>
                              o.id === selectedOrder.id
                                ? {
                                    ...o,
                                    status: newStatus,
                                    updatedAt: new Date().toISOString(),
                                  }
                                : o,
                            ),
                          );
                          setAllOrders((prev) =>
                            prev.map((o) =>
                              o.id === selectedOrder.id
                                ? {
                                    ...o,
                                    status: newStatus,
                                    updatedAt: new Date().toISOString(),
                                  }
                                : o,
                            ),
                          );
                          setSelectedOrder({
                            ...selectedOrder,
                            status: newStatus,
                            updatedAt: new Date().toISOString(),
                          });
                        } catch {
                          setError("فشل تحديث حالة الطلب");
                        } finally {
                          setStatusUpdating(false);
                        }
                      }}
                      disabled={statusUpdating}
                    >
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue
                          placeholder={
                            statusUpdating ? "جاري التحديث..." : "تغيير الحالة"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "CONFIRMED",
                          "BOOKED",
                          "SHIPPED",
                          "OUT_FOR_DELIVERY",
                          "DELIVERED",
                          "CANCELLED",
                        ]
                          .filter((s) => s !== selectedOrder.status)
                          .map((s) => (
                            <SelectItem key={s} value={s}>
                              {getStatusLabel(s)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                {selectedOrder.trackingNumber && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">رقم التتبع: </span>
                    <span className="break-all font-mono">
                      {selectedOrder.trackingNumber}
                    </span>
                  </div>
                )}
              </div>

              {/* Assign Delivery Driver */}
              {DRIVER_ASSIGNABLE_STATUSES.has(selectedOrder.status) && (
                <div className="rounded-[var(--radius-md)] border border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.08)] p-4">
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <Truck className="h-4 w-4 text-[color:var(--accent-warning)]" />
                    تعيين سائق توصيل
                  </h4>
                  <Select
                    value=""
                    onValueChange={async (driverId) => {
                      if (!driverId) return;
                      setAssigningDriver(true);
                      try {
                        await portalApi.assignDriverToOrder(
                          selectedOrder.id,
                          driverId,
                        );
                        const driverName = drivers.find(
                          (d) => d.id === driverId,
                        )?.name;
                        setError(null);
                        toastFn({
                          title: "تم تعيين السائق",
                          description: `تم تعيين ${driverName} وإرسال إشعار واتساب`,
                        });
                      } catch {
                        setError("فشل في تعيين السائق");
                      } finally {
                        setAssigningDriver(false);
                      }
                    }}
                    disabled={assigningDriver}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          assigningDriver
                            ? "جاري التعيين..."
                            : "اختر سائق - سيتلقى إشعار واتساب فوري"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers
                        .filter((d) => d.status === "ACTIVE")
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} (
                            {d.vehicle_type === "motorcycle"
                              ? "🏍️"
                              : d.vehicle_type === "car"
                                ? "🚗"
                                : "🚐"}{" "}
                            {d.phone})
                          </SelectItem>
                        ))}
                      {drivers.filter((d) => d.status === "ACTIVE").length ===
                        0 && (
                        <SelectItem value="_none" disabled>
                          لا يوجد سائقين - أضف من صفحة سائقي التوصيل
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 p-4 border rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" />
                    معلومات العميل
                  </h4>
                  <p className="text-sm font-medium">
                    {selectedOrder.customerName}
                  </p>
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    {selectedOrder.customerPhone || "غير متوفر"}
                  </p>
                </div>
                <div className="space-y-2 p-4 border rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    عنوان التوصيل
                  </h4>
                  <p className="break-words text-sm">
                    {selectedOrder.address || "لم يتم تحديد العنوان"}
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  المنتجات
                </h4>
                {selectedOrder.items.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="space-y-3 p-3 md:hidden">
                      {selectedOrder.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] p-3"
                        >
                          <div className="space-y-1">
                            <p className="break-words text-sm font-medium">
                              {item.name}
                            </p>
                            {item.sku && (
                              <p className="break-all text-xs font-mono text-muted-foreground">
                                {item.sku}
                              </p>
                            )}
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                الكمية
                              </p>
                              <p className="font-medium">{item.quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                السعر
                              </p>
                              <p>{formatCurrency(item.unitPrice)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                الإجمالي
                              </p>
                              <p className="font-medium">
                                {formatCurrency(
                                  item.lineTotal ??
                                    item.quantity * item.unitPrice,
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] px-3 py-2 text-sm">
                        <span className="font-medium">الإجمالي</span>
                        <span className="font-bold text-[color:var(--accent-gold)]">
                          {formatCurrency(selectedOrder.total)}
                        </span>
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <table className="w-full">
                        <thead className="bg-[color:var(--bg-surface-2)]">
                          <tr>
                            <th className="p-3 text-right text-sm font-medium">
                              المنتج
                            </th>
                            <th className="p-3 text-right text-sm font-medium">
                              الكمية
                            </th>
                            <th className="p-3 text-right text-sm font-medium">
                              السعر
                            </th>
                            <th className="p-3 text-right text-sm font-medium">
                              الإجمالي
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrder.items.map((item, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="p-3 text-sm">
                                <span className="font-medium">{item.name}</span>
                                {item.sku && (
                                  <span className="text-muted-foreground block text-xs font-mono">
                                    {item.sku}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-sm">{item.quantity}</td>
                              <td className="p-3 text-sm">
                                {formatCurrency(item.unitPrice)}
                              </td>
                              <td className="p-3 text-sm font-medium">
                                {formatCurrency(
                                  item.lineTotal ??
                                    item.quantity * item.unitPrice,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-[color:var(--bg-surface-2)]">
                          <tr>
                            <td
                              colSpan={3}
                              className="p-3 text-end font-medium"
                            >
                              الإجمالي
                            </td>
                            <td className="p-3 font-bold text-[color:var(--accent-gold)]">
                              {formatCurrency(selectedOrder.total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4 border rounded-lg">
                    لا توجد منتجات في هذا الطلب
                  </p>
                )}
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  الجدول الزمني
                </h4>
                <div className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-[color:var(--accent-success)]" />
                    <span className="text-sm">تم الإنشاء</span>
                    <span className="text-sm text-muted-foreground mr-auto">
                      {formatDate(selectedOrder.createdAt, "long")}
                    </span>
                  </div>
                  {selectedOrder.updatedAt !== selectedOrder.createdAt && (
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-[color:var(--accent-blue)]" />
                      <span className="text-sm">آخر تحديث</span>
                      <span className="text-sm text-muted-foreground mr-auto">
                        {formatDate(selectedOrder.updatedAt, "long")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reorder Result */}
              {reorderResult && (
                <div
                  className={cn(
                    "p-4 rounded-lg border",
                    reorderResult.success
                      ? "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]"
                      : "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {reorderResult.success ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <AlertCircle className="h-5 w-5" />
                    )}
                    <span className="font-medium">{reorderResult.message}</span>
                  </div>
                  {reorderResult.orderNumber && (
                    <p className="text-sm mt-1">
                      رقم الطلب الجديد: {reorderResult.orderNumber}
                    </p>
                  )}
                  {reorderResult.unavailableItems &&
                    reorderResult.unavailableItems.length > 0 && (
                      <div className="mt-2 text-sm">
                        <p className="font-medium">منتجات غير متوفرة:</p>
                        <ul className="list-disc list-inside">
                          {reorderResult.unavailableItems.map((item, i) => (
                            <li key={i}>
                              {item.name} (طلب: {item.requestedQty}، متوفر:{" "}
                              {item.availableQty})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row">
                {canCreate && (
                  <Button
                    onClick={() => handleReorder(selectedOrder.id)}
                    disabled={reordering}
                    className="w-full flex-1"
                  >
                    {reordering ? (
                      <>
                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                        جاري إعادة الطلب...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 ml-2" />
                        إعادة الطلب
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedOrder(null);
                    setReorderResult(null);
                  }}
                  className="w-full sm:w-auto"
                >
                  إغلاق
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
