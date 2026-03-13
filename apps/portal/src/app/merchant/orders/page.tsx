"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import { merchantApi, branchesApi } from "@/lib/api";
import portalApi from "@/lib/authenticated-api";
import { useToast } from "@/hooks/use-toast";
import {
  OrderQuickStats,
  OrderStatusFilter,
} from "@/components/orders/enhanced-features";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  AiInsightsCard,
  generateOrderInsights,
} from "@/components/ai/ai-insights-card";
import { SmartAnalysisButton } from "@/components/ai/smart-analysis-button";

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
  createdAt: string;
  updatedAt: string;
  deliveryStatus?: string;
  trackingNumber?: string;
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

const DRIVER_ASSIGNABLE_STATUSES = new Set([
  "CONFIRMED",
]);

// Heuristic cancellation-risk score based on order age + status
function getCancelRisk(order: Order): { label: string; className: string } | null {
  const statusesDone = new Set(["DELIVERED", "CANCELLED"]);
  if (statusesDone.has(order.status)) return null;

  const ageHours = (Date.now() - new Date(order.createdAt).getTime()) / 36e5;

  if (order.status === "DRAFT" && ageHours > 24) {
    return { label: "خطر إلغاء ↑", className: "bg-red-100 text-red-700 border-red-200" };
  }
  if (order.status === "CONFIRMED" && ageHours > 48) {
    return { label: "تأخر التسليم", className: "bg-amber-100 text-amber-700 border-amber-200" };
  }
  if ((order.status === "SHIPPED" || order.status === "BOOKED") && ageHours > 72) {
    return { label: "لم يُسلَّم بعد", className: "bg-orange-100 text-orange-700 border-orange-200" };
  }
  return null;
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
  const [branchFilter, setBranchFilter] = useState<string>("all");
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
      .filter((item) => item.quantity > 0);

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
      const hasFilter = statusFilter !== "all" || branchFilter !== "all";
      if (hasFilter) {
        const filteredResponse = await merchantApi.getOrders(
          merchantId,
          apiKey,
          statusFilter !== "all" ? statusFilter : undefined,
          branchFilter !== "all" ? branchFilter : undefined,
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
  }, [merchantId, apiKey, statusFilter, branchFilter, transformOrder]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Load delivery drivers for assignment
  useEffect(() => {
    portalApi
      .getDeliveryDrivers()
      .then((data: any) => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => {
        /* drivers optional — non-blocking */
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
    return matchesSearch;
  });

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
            .join(" | ")
        : "لا توجد منتجات",
      order.total?.toString() || "0",
      getStatusLabel(order.status) || order.status || "",
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="الطلبات"
        description={
          countedOrders.length !== ordersForStats.length
            ? `إدارة ومتابعة الطلبات (${countedOrders.length} طلب فعّال من أصل ${ordersForStats.length})`
            : `إدارة ومتابعة الطلبات (${countedOrders.length} طلب)`
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchOrders}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canExport && (
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={filteredOrders.length === 0}
              >
                <FileSpreadsheet className="h-4 w-4 ml-2" />
                تصدير CSV
              </Button>
            )}
          </div>
        }
      />

      {/* Order Quick Stats */}
      <OrderQuickStats
        stats={{
          total: stats.total,
          pending: stats.pending,
          processing: stats.inProgress,
          completed: stats.completed,
          cancelled: stats.cancelled,
          todayRevenue,
          averageOrderValue,
        }}
      />

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

      <SmartAnalysisButton context="operations" />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الطلب، اسم العميل، أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="حالة الطلب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="DRAFT">مسودة</SelectItem>
                <SelectItem value="CONFIRMED">مؤكد</SelectItem>
                <SelectItem value="BOOKED">محجوز</SelectItem>
                <SelectItem value="SHIPPED">تم الشحن</SelectItem>
                <SelectItem value="OUT_FOR_DELIVERY">قيد التوصيل</SelectItem>
                <SelectItem value="DELIVERED">تم التوصيل</SelectItem>
                <SelectItem value="CANCELLED">ملغي</SelectItem>
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
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold">شرح الحالات</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">مسودة:</span> طلب
              غير مكتمل ولم يبدأ تنفيذه.
            </div>
            <div>
              <span className="font-medium text-foreground">مؤكد:</span> تم
              تأكيد الطلب وجاهز للتجهيز.
            </div>
            <div>
              <span className="font-medium text-foreground">محجوز:</span> تم حجز
              الشحنة مع شركة التوصيل.
            </div>
            <div>
              <span className="font-medium text-foreground">تم الشحن:</span>{" "}
              الطلب خرج مع شركة الشحن.
            </div>
            <div>
              <span className="font-medium text-foreground">قيد التوصيل:</span>{" "}
              الطلب في الطريق للعميل.
            </div>
            <div>
              <span className="font-medium text-foreground">تم التوصيل:</span>{" "}
              طلب مكتمل ومُحقق للإيراد.
            </div>
            <div>
              <span className="font-medium text-foreground">ملغي:</span> طلب غير
              محسوب ضمن الإيراد.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <EmptyState
              icon={<ShoppingCart className="h-16 w-16" />}
              title="لا توجد طلبات"
              description={
                searchQuery || statusFilter !== "all" || branchFilter !== "all"
                  ? "لم يتم العثور على طلبات مطابقة للبحث"
                  : "لم يتم إنشاء أي طلبات بعد. ابدأ بالتحدث مع العملاء عبر WhatsApp!"
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <DataTable
            data={paginatedOrders}
            columns={[
              {
                key: "orderNumber",
                header: "رقم الطلب",
                render: (order) => (
                  <span className="font-mono text-sm">{order.orderNumber}</span>
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
                    <span className="text-muted-foreground">غير محدد</span>
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
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", getStatusColor(order.status))}>
                        {statusIcons[order.status]}
                        {getStatusLabel(order.status)}
                      </span>
                      {risk && (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", risk.className)}>
                          {risk.label}
                        </span>
                      )}
                    </div>
                  );
                },
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

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {/* Order Detail Dialog */}
      <Dialog
        open={!!selectedOrder}
        onOpenChange={() => setSelectedOrder(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-full border text-sm px-3 py-1 font-semibold", getStatusColor(selectedOrder.status))}>
                    {statusIcons[selectedOrder.status]}
                    {getStatusLabel(selectedOrder.status)}
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
                      <SelectTrigger className="w-[180px]">
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
                    <span className="font-mono">
                      {selectedOrder.trackingNumber}
                    </span>
                  </div>
                )}
              </div>

              {/* Assign Delivery Driver */}
              {DRIVER_ASSIGNABLE_STATUSES.has(selectedOrder.status) && (
                <div className="p-4 border rounded-lg bg-orange-50/50">
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <Truck className="h-4 w-4 text-orange-600" />
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
                            : "اختر سائق — سيتلقى إشعار واتساب فوري"
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
                          لا يوجد سائقين — أضف من صفحة سائقي التوصيل
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
                  <p className="text-sm">
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
                    <table className="w-full">
                      <thead className="bg-muted/50">
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
                      <tfoot className="bg-muted/50">
                        <tr>
                          <td colSpan={3} className="p-3 text-end font-medium">
                            الإجمالي
                          </td>
                          <td className="p-3 font-bold text-primary">
                            {formatCurrency(selectedOrder.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
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
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm">تم الإنشاء</span>
                    <span className="text-sm text-muted-foreground mr-auto">
                      {formatDate(selectedOrder.createdAt, "long")}
                    </span>
                  </div>
                  {selectedOrder.updatedAt !== selectedOrder.createdAt && (
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
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
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-800",
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
              <div className="flex gap-3 pt-4 border-t">
                {canCreate && (
                  <Button
                    onClick={() => handleReorder(selectedOrder.id)}
                    disabled={reordering}
                    className="flex-1"
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
