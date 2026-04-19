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
    DRAFT:
      "border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
    CONFIRMED:
      "border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    BOOKED:
      "border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    SHIPPED:
      "border-[var(--accent-gold)]/25 bg-[var(--accent-gold)]/12 text-[var(--accent-gold)]",
    OUT_FOR_DELIVERY:
      "border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    DELIVERED:
      "border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
    CANCELLED:
      "border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]",
    // Conversation states
    GREETING: "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
    COLLECTING_ITEMS: "bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    COLLECTING_VARIANTS: "bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    COLLECTING_CUSTOMER_INFO:
      "bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    COLLECTING_ADDRESS: "bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    NEGOTIATING: "bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    CONFIRMING_ORDER: "bg-[var(--accent-gold)]/12 text-[var(--accent-gold)]",
    TRACKING: "bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
    FOLLOWUP: "bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    ORDER_PLACED: "bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
    HUMAN_TAKEOVER: "bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]",
    CLOSED: "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
    // Delivery statuses
    PENDING: "bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    SENT: "bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
    FAILED: "bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]",
    // Stock
    LOW_STOCK: "bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
    OUT_OF_STOCK: "bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]",
    IN_STOCK: "bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
  };
  return (
    colors[status] || "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]"
  );
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
