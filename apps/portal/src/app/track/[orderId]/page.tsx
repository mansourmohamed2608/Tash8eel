"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Package,
  Truck,
  AlertCircle,
  Search,
  Loader2,
} from "lucide-react";

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  DELIVERED: CheckCircle2,
  COMPLETED: CheckCircle2,
  SHIPPED: Truck,
  OUT_FOR_DELIVERY: Truck,
  CONFIRMED: Package,
  BOOKED: Package,
  PENDING: Clock,
  DRAFT: Clock,
  CANCELLED: AlertCircle,
  FAILED: AlertCircle,
};

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface TrackingInfo {
  trackingId: string;
  courier: string | null;
  shipmentStatus: string | null;
  estimatedDelivery: string | null;
}

interface TimelineStep {
  status: string;
  label: string;
  completed: boolean;
  active: boolean;
}

interface OrderData {
  orderNumber: string;
  status: string;
  statusLabel: string;
  isCancelled: boolean;
  isDelivered: boolean;
  createdAt: string;
  updatedAt: string;
  totalPrice: number;
  currency: string;
  notes: string | null;
  tracking: TrackingInfo | null;
  items: OrderItem[];
  timeline: TimelineStep[];
}

export default function TrackOrderPage() {
  const params = useParams();
  const orderNumberFromUrl = (params?.orderId as string) || "";

  const [orderNumber, setOrderNumber] = useState(orderNumberFromUrl);
  const [searchInput, setSearchInput] = useState(orderNumberFromUrl);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fetchOrder = async (num: string) => {
    if (!num.trim()) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    setSubmitted(true);
    try {
      const res = await fetch(
        `/api/v1/public/orders/${encodeURIComponent(num.trim().toUpperCase())}`,
      );
      if (res.status === 404) {
        setError("لم يتم العثور على الطلب. تحقق من رقم الطلب وحاول مجدداً.");
        return;
      }
      if (!res.ok) {
        setError("حدث خطأ أثناء البحث. حاول مجدداً.");
        return;
      }
      const data: OrderData = await res.json();
      setOrder(data);
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderNumberFromUrl) {
      fetchOrder(orderNumberFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumberFromUrl]);

  const formatDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const formatPrice = (price: number, currency: string) =>
    `${new Intl.NumberFormat("ar-EG").format(price)} ${currency === "EGP" ? "ج.م" : currency}`;

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900"
      dir="rtl"
    >
      {/* Header */}
      <div className="bg-indigo-600 dark:bg-indigo-700 text-white py-8 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-90" />
          <h1 className="text-2xl font-bold mb-1">تتبع طلبك</h1>
          <p className="text-indigo-200 text-sm">أدخل رقم طلبك لمتابعة حالته</p>
        </div>
      </div>

      {/* Search Box */}
      <div className="max-w-2xl mx-auto px-4 -mt-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setOrderNumber(searchInput);
                  fetchOrder(searchInput);
                }
              }}
              placeholder="أدخل رقم الطلب..."
              className="flex-1 text-center text-lg font-mono border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-800 dark:text-gray-100 placeholder-gray-400"
              dir="ltr"
            />
            <button
              onClick={() => {
                setOrderNumber(searchInput);
                fetchOrder(searchInput);
              }}
              disabled={loading || !searchInput.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              بحث
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 mt-6 pb-16 space-y-5">
        {/* Error */}
        {error && submitted && !loading && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-5 flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-500 shrink-0" />
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4 animate-pulse">
            <div className="h-5 bg-gray-100 dark:bg-gray-700 rounded-full w-2/3 mx-auto" />
            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-1/2 mx-auto" />
            <div className="flex justify-center gap-2 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-6 w-16 bg-gray-100 dark:bg-gray-700 rounded-full"
                />
              ))}
            </div>
          </div>
        )}

        {/* Order Card */}
        {order && !loading && (
          <>
            {/* Status Card */}
            <div
              className={`rounded-2xl shadow p-6 text-center ${
                order.isCancelled
                  ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                  : order.isDelivered
                    ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
                    : "bg-white dark:bg-gray-800"
              }`}
            >
              {(() => {
                const Icon = STATUS_ICONS[order.status] || Clock;
                const iconColor = order.isCancelled
                  ? "text-red-500"
                  : order.isDelivered
                    ? "text-green-500"
                    : "text-indigo-500";
                return (
                  <Icon className={`h-14 w-14 mx-auto mb-3 ${iconColor}`} />
                );
              })()}
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                طلب رقم
              </p>
              <p
                className="text-xl font-bold font-mono text-gray-800 dark:text-gray-100 mb-2"
                dir="ltr"
              >
                {order.orderNumber}
              </p>
              <span
                className={`inline-block px-5 py-1.5 rounded-full text-sm font-semibold ${
                  order.isCancelled
                    ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    : order.isDelivered
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
                }`}
              >
                {order.statusLabel}
              </span>
              <p className="text-xs text-gray-400 mt-3">
                آخر تحديث: {formatDate(order.updatedAt)}
              </p>
            </div>

            {/* Timeline */}
            {!order.isCancelled && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
                <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-4 text-right">
                  رحلة طلبك
                </h2>
                <div className="relative">
                  {order.timeline.map((step, idx) => (
                    <div
                      key={step.status}
                      className="flex items-start gap-3 mb-4"
                    >
                      {/* Line */}
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            step.active
                              ? "bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900"
                              : step.completed
                                ? "bg-green-500 text-white"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                          }`}
                        >
                          {step.completed && !step.active ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <span className="text-xs font-bold">{idx + 1}</span>
                          )}
                        </div>
                        {idx < order.timeline.length - 1 && (
                          <div
                            className={`w-0.5 h-6 mt-1 ${
                              step.completed
                                ? "bg-green-400"
                                : "bg-gray-200 dark:bg-gray-700"
                            }`}
                          />
                        )}
                      </div>
                      {/* Label */}
                      <div className="pt-1.5">
                        <p
                          className={`text-sm font-medium ${
                            step.active
                              ? "text-indigo-600 dark:text-indigo-400"
                              : step.completed
                                ? "text-gray-700 dark:text-gray-300"
                                : "text-gray-400"
                          }`}
                        >
                          {step.label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shipment Tracking */}
            {order.tracking && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
                <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  معلومات الشحن
                </h2>
                <div className="space-y-2 text-sm">
                  {order.tracking.courier && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-gray-500">شركة الشحن</span>
                      <span className="font-medium">
                        {order.tracking.courier}
                      </span>
                    </div>
                  )}
                  {order.tracking.trackingId && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-gray-500">رقم التتبع</span>
                      <span
                        className="break-all font-mono font-medium text-indigo-600"
                        dir="ltr"
                      >
                        {order.tracking.trackingId}
                      </span>
                    </div>
                  )}
                  {order.tracking.estimatedDelivery && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-gray-500">التوصيل المتوقع</span>
                      <span className="font-medium">
                        {formatDate(order.tracking.estimatedDelivery)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            {order.items.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
                <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  محتويات الطلب
                </h2>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {order.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {item.quantity} ×{" "}
                          {formatPrice(item.unitPrice, order.currency)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 sm:shrink-0">
                        {formatPrice(
                          item.totalPrice || item.unitPrice * item.quantity,
                          order.currency,
                        )}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-col gap-1 border-t border-gray-200 pt-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    الإجمالي
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {formatPrice(order.totalPrice, order.currency)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            {order.notes && (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-700 dark:text-amber-300">
                <p className="font-medium mb-1">ملاحظة:</p>
                <p>{order.notes}</p>
              </div>
            )}

            {/* Footer info */}
            <p className="text-center text-xs text-gray-400 pt-2">
              تاريخ الطلب: {formatDate(order.createdAt)}
            </p>
          </>
        )}

        {/* Empty state */}
        {!loading && !order && !error && !submitted && (
          <div className="text-center py-12 text-gray-400">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-base">أدخل رقم طلبك في مربع البحث أعلاه</p>
            <p className="text-sm mt-1">
              رقم الطلب يظهر في رسالة تأكيد الطلب على واتساب
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
