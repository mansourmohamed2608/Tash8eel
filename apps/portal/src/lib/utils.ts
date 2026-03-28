import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[٬,]/g, "")
      .replace(/[٫]/g, ".")
      .replace(/[^\d.-]/g, "");

    if (
      !normalized ||
      normalized === "-" ||
      normalized === "." ||
      normalized === "-."
    ) {
      return 0;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function formatCurrency(
  amount: number | string | null | undefined,
  currency = "EGP",
): string {
  const safeAmount = toFiniteNumber(amount);
  const normalizedAmount =
    Object.is(safeAmount, -0) || Math.abs(safeAmount) < 1e-9 ? 0 : safeAmount;
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(normalizedAmount);
}

export function formatNumber(
  num: number | string | null | undefined,
  options: Intl.NumberFormatOptions = {},
  locale = "ar-EG",
): string {
  const safeNum = toFiniteNumber(num);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  }).format(safeNum);
}

export function formatDate(
  date: string | Date,
  format: "short" | "long" | "time" = "short",
): string {
  const d = new Date(date);
  const options: Intl.DateTimeFormatOptions =
    format === "short"
      ? { day: "numeric", month: "short" }
      : format === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { hour: "2-digit", minute: "2-digit" };
  return d.toLocaleDateString("ar-EG", options);
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();

  if (diffMs > 0) {
    const diffMinsFuture = Math.floor(diffMs / 60000);
    const diffHoursFuture = Math.floor(diffMs / 3600000);
    const diffDaysFuture = Math.floor(diffMs / 86400000);

    if (diffMinsFuture < 1) return "خلال أقل من دقيقة";
    if (diffMinsFuture < 60) return `بعد ${diffMinsFuture} دقيقة`;
    if (diffHoursFuture < 24) return `بعد ${diffHoursFuture} ساعة`;
    if (diffDaysFuture < 7) return `بعد ${diffDaysFuture} يوم`;
    return formatDate(date);
  }

  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
  const diffHours = Math.floor((now.getTime() - d.getTime()) / 3600000);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  return formatDate(date);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Order statuses
    DRAFT: "bg-gray-100 text-gray-600 border-gray-300",
    CONFIRMED: "bg-blue-100 text-blue-800 border-blue-300",
    BOOKED: "bg-yellow-100 text-yellow-800 border-yellow-300",
    SHIPPED: "bg-purple-100 text-purple-800 border-purple-300",
    OUT_FOR_DELIVERY: "bg-orange-100 text-orange-800 border-orange-300",
    DELIVERED: "bg-green-100 text-green-800 border-green-300",
    CANCELLED: "bg-red-100 text-red-800 border-red-300",
    // Conversation states
    GREETING: "bg-gray-100 text-gray-800",
    COLLECTING_ITEMS: "bg-blue-100 text-blue-800",
    COLLECTING_VARIANTS: "bg-indigo-100 text-indigo-800",
    COLLECTING_CUSTOMER_INFO: "bg-sky-100 text-sky-800",
    COLLECTING_ADDRESS: "bg-cyan-100 text-cyan-800",
    NEGOTIATING: "bg-yellow-100 text-yellow-800",
    CONFIRMING_ORDER: "bg-purple-100 text-purple-800",
    TRACKING: "bg-emerald-100 text-emerald-800",
    FOLLOWUP: "bg-amber-100 text-amber-800",
    ORDER_PLACED: "bg-green-100 text-green-800",
    HUMAN_TAKEOVER: "bg-red-100 text-red-800",
    CLOSED: "bg-gray-100 text-gray-800",
    // Delivery statuses
    PENDING: "bg-yellow-100 text-yellow-800",
    SENT: "bg-blue-100 text-blue-800",
    FAILED: "bg-red-100 text-red-800",
    // Stock
    LOW_STOCK: "bg-orange-100 text-orange-800",
    OUT_OF_STOCK: "bg-red-100 text-red-800",
    IN_STOCK: "bg-green-100 text-green-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "مسودة",
    CONFIRMED: "مؤكد",
    BOOKED: "محجوز",
    SHIPPED: "تم الشحن",
    OUT_FOR_DELIVERY: "قيد التوصيل",
    DELIVERED: "تم التوصيل",
    CANCELLED: "ملغي",
    GREETING: "ترحيب",
    COLLECTING_ITEMS: "جمع المنتجات",
    COLLECTING_VARIANTS: "اختيار المتغيرات",
    COLLECTING_CUSTOMER_INFO: "بيانات العميل",
    COLLECTING_ADDRESS: "العنوان",
    NEGOTIATING: "تفاوض",
    CONFIRMING_ORDER: "تأكيد الطلب",
    TRACKING: "تتبع الطلب",
    FOLLOWUP: "متابعة",
    ORDER_PLACED: "تم الطلب",
    HUMAN_TAKEOVER: "تدخل بشري",
    CLOSED: "مغلقة",
    PENDING: "قيد الانتظار",
    SENT: "تم الإرسال",
    FAILED: "فشل",
    LOW_STOCK: "مخزون منخفض",
    OUT_OF_STOCK: "نفد المخزون",
    IN_STOCK: "متوفر",
  };
  return labels[status] || status;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function generateChartData(
  days: number,
  baseValue: number,
  variance: number,
) {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split("T")[0],
      value: Math.floor(baseValue + (Math.random() - 0.5) * variance),
    });
  }
  return data;
}
