export interface ReportingPeriodOption {
  value: number;
  label: string;
}

export const REPORTING_PERIOD_OPTIONS: ReportingPeriodOption[] = [
  { value: 1, label: "اليوم" },
  { value: 7, label: "آخر 7 أيام" },
  { value: 14, label: "آخر 14 يوم" },
  { value: 30, label: "آخر 30 يوم" },
  { value: 60, label: "آخر 60 يوم" },
  { value: 90, label: "آخر 90 يوم" },
  { value: 180, label: "آخر 6 شهور" },
  { value: 365, label: "هذا العام" },
];

const THIS_YEAR_OPTION_VALUE = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const REPORTING_DAYS_STORAGE_KEY = "tash8eel_reporting_days";
const REPORTING_OPTION_VALUES = new Set(
  REPORTING_PERIOD_OPTIONS.map((option) => option.value),
);

function normalizeToKnownOption(days: number, fallback = 30): number {
  const normalized = clampReportingDays(days);
  if (REPORTING_OPTION_VALUES.has(normalized)) return normalized;
  return REPORTING_OPTION_VALUES.has(fallback) ? fallback : 30;
}

export function getStoredReportingDays(defaultDays = 30): number {
  if (typeof window === "undefined") return defaultDays;
  const raw = window.localStorage.getItem(REPORTING_DAYS_STORAGE_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultDays;
  return normalizeToKnownOption(parsed, defaultDays);
}

export function setStoredReportingDays(days: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    REPORTING_DAYS_STORAGE_KEY,
    String(normalizeToKnownOption(days)),
  );
}

export function clampReportingDays(days: number): number {
  const value = Number(days);
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(365, Math.trunc(value)));
}

export function resolveReportingDays(days: number, now = new Date()): number {
  const normalized = clampReportingDays(days);
  if (normalized !== THIS_YEAR_OPTION_VALUE) return normalized;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yearStart = new Date(todayStart.getFullYear(), 0, 1);
  const ytdDays =
    Math.floor((todayStart.getTime() - yearStart.getTime()) / DAY_MS) + 1;
  return Math.max(1, Math.min(365, ytdDays));
}

export function getReportingDateRange(
  days: number,
  now = new Date(),
): { startDate: Date; endDate: Date; days: number } {
  const resolvedDays = resolveReportingDays(days, now);
  const endDate = new Date(now);
  const startDate = new Date(endDate);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (resolvedDays - 1));
  return { startDate, endDate, days: resolvedDays };
}

export function mapDaysToPdfPeriod(days: number): string {
  const d = clampReportingDays(days);
  if (d <= 1) return "today";
  if (d <= 7) return "7days";
  if (d <= 30) return "30days";
  if (d <= 90) return "90days";
  return "thisYear";
}

export function mapDaysToCfoPeriod(
  days: number,
): "today" | "week" | "month" | "quarter" | "year" {
  const d = clampReportingDays(days);
  if (d <= 1) return "today";
  if (d <= 7) return "week";
  if (d <= 31) return "month";
  if (d <= 120) return "quarter";
  return "year";
}
