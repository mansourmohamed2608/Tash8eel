"use client";

import { useState, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Package,
  Receipt,
  Truck,
  Warehouse,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import portalApi from "@/lib/client";
import {
  getReportingDateRange,
  REPORTING_PERIOD_OPTIONS,
  getStoredReportingDays,
  setStoredReportingDays,
} from "@/lib/reporting-period";

const INCLUDE_OPTIONS = [
  {
    id: "orders",
    labelAr: "الطلبات",
    labelEn: "Orders",
    icon: Package,
    description: "رقم الطلب، التاريخ، العميل، المبلغ، طريقة الدفع، الحالة",
  },
  {
    id: "expenses",
    labelAr: "المصروفات",
    labelEn: "Expenses",
    icon: Receipt,
    description: "التاريخ، الفئة، الوصف، المبلغ، الإيصال",
  },
  {
    id: "cod_reconciliation",
    labelAr: "تسوية COD",
    labelEn: "COD Reconciliation",
    icon: Truck,
    description: "شركة الشحن، التاريخ، المحصّل، الرسوم، صافي المبلغ",
  },
  {
    id: "inventory_movements",
    labelAr: "حركة المخزون",
    labelEn: "Inventory Movements",
    icon: Warehouse,
    description: "التاريخ، المنتج، نوع الحركة، الكمية",
  },
];

function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

function downloadCSV(
  data: any[],
  filename: string,
  totalsRow?: Record<string, unknown>,
) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => formatCsvCell(row[h])).join(","),
  );

  if (totalsRow && Object.keys(totalsRow).length > 0) {
    const totalsCsvRow = headers
      .map((header, index) => {
        const hasValue = Object.prototype.hasOwnProperty.call(
          totalsRow,
          header,
        );
        if (hasValue) return formatCsvCell(totalsRow[header]);
        return index === 0 ? formatCsvCell("الإجمالي") : "";
      })
      .join(",");
    rows.push("");
    rows.push(totalsCsvRow);
  }

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatQuantity(value: unknown): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function getSectionSummaryText(
  sectionKey: string,
  section: any,
): string | null {
  const summary = section?.summary;
  if (!summary) return null;

  if (sectionKey === "orders") {
    return `إجمالي المبلغ: ${formatCurrency(Number(summary.totalAmount || 0))}`;
  }

  if (sectionKey === "expenses") {
    return `إجمالي المصروفات: ${formatCurrency(Number(summary.totalAmount || 0))}`;
  }

  if (sectionKey === "cod_reconciliation") {
    return `صافي التسوية: ${formatCurrency(Number(summary.totalNet || 0))}`;
  }

  if (sectionKey === "inventory_movements") {
    return `قبل: ${formatQuantity(summary.openingQuantity)} | بعد: ${formatQuantity(summary.closingQuantity)} | دخول: ${formatQuantity(summary.totalIn)} | خروج: ${formatQuantity(summary.totalOut)} | صافي: ${formatQuantity(summary.netChange)}`;
  }

  return null;
}

function toInputDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDateRangeFromDays(days: number): {
  startDate: string;
  endDate: string;
} {
  const { startDate, endDate } = getReportingDateRange(days);
  return {
    startDate: toInputDate(startDate),
    endDate: toInputDate(endDate),
  };
}

export default function AccountantPackPage() {
  const initialDays = getStoredReportingDays(30);
  const initialRange = getDateRangeFromDays(initialDays);

  const [reportingDays, setReportingDays] = useState<number>(initialDays);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>(
    INCLUDE_OPTIONS.map((o) => o.id),
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await portalApi.getAccountantPack(
        startDate,
        endDate,
        selectedIncludes,
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل في إنشاء التقرير");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedIncludes]);

  const handleDownloadAll = useCallback(() => {
    if (!result?.sections) return;
    for (const [key, section] of Object.entries(result.sections) as [
      string,
      any,
    ][]) {
      if (section.data?.length > 0) {
        downloadCSV(
          section.data,
          `${key}_${startDate}_${endDate}.csv`,
          section.totalsRow,
        );
      }
    }
  }, [result, startDate, endDate]);

  const toggleInclude = (id: string) => {
    setSelectedIncludes((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const applyDayRange = (days: number) => {
    const range = getDateRangeFromDays(days);
    setReportingDays(days);
    setStoredReportingDays(days);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="حزمة المحاسب"
        description="صدّر بيانات الأعمال المالية لمحاسبك بصيغة CSV"
      />

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            إعدادات التصدير
          </CardTitle>
          <CardDescription>اختر الفترة والبيانات المطلوبة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>الفترة</Label>
            <Select
              value={String(reportingDays)}
              onValueChange={(value) => applyDayRange(Number(value))}
            >
              <SelectTrigger className="w-full sm:w-48">
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
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Quick period buttons */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "اليوم", apply: () => applyDayRange(1) },
              { label: "آخر 7 أيام", apply: () => applyDayRange(7) },
              { label: "آخر 30 يوم", apply: () => applyDayRange(30) },
              { label: "آخر 90 يوم", apply: () => applyDayRange(90) },
              {
                label: "هذا الشهر",
                apply: () => {
                  const d = new Date();
                  const s = new Date(d.getFullYear(), d.getMonth(), 1);
                  setStartDate(toInputDate(s));
                  setEndDate(toInputDate(d));
                },
              },
              {
                label: "الشهر الماضي",
                apply: () => {
                  const d = new Date();
                  const s = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                  const e = new Date(d.getFullYear(), d.getMonth(), 0);
                  setStartDate(toInputDate(s));
                  setEndDate(toInputDate(e));
                },
              },
              {
                label: "هذا العام",
                apply: () => {
                  const d = new Date();
                  const s = new Date(d.getFullYear(), 0, 1);
                  setStartDate(toInputDate(s));
                  setEndDate(toInputDate(d));
                },
              },
            ].map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                onClick={p.apply}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Include Selection */}
          <div className="space-y-3">
            <Label>البيانات المطلوبة</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {INCLUDE_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    selectedIncludes.includes(opt.id)
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30",
                  )}
                  onClick={() => toggleInclude(opt.id)}
                >
                  <Checkbox
                    checked={selectedIncludes.includes(opt.id)}
                    onCheckedChange={() => toggleInclude(opt.id)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <opt.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{opt.labelAr}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {opt.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || selectedIncludes.length === 0}
            className="w-full md:w-auto"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 ml-2" />
            )}
            {loading ? "جارِ الإنشاء..." : "إنشاء حزمة المحاسب"}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[var(--accent-success)]" />
                تم إنشاء الحزمة بنجاح
              </CardTitle>
              <Button
                onClick={handleDownloadAll}
                variant="default"
                size="sm"
                className="w-full sm:w-auto"
              >
                <Download className="h-4 w-4 ml-2" />
                تحميل الكل CSV
              </Button>
            </div>
            <CardDescription>
              الفترة: {result.period?.startDate} إلى {result.period?.endDate} |
              أُنشئ: {new Date(result.generatedAt).toLocaleString("ar-EG")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.entries(result.sections || {}).map(
                ([key, section]: [string, any]) => {
                  const opt = INCLUDE_OPTIONS.find(
                    (o) =>
                      o.id === key ||
                      o.id === key.replace(/([A-Z])/g, "_$1").toLowerCase(),
                  );
                  const summaryText = getSectionSummaryText(key, section);
                  return (
                    <div
                      key={key}
                      className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {opt?.icon && (
                          <opt.icon className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div className="space-y-1">
                          <p className="font-medium text-sm">
                            {opt?.labelAr || key}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {section.count || section.length || 0} سجل
                          </p>
                          {summaryText && (
                            <p className="text-xs text-foreground/80">
                              {summaryText}
                            </p>
                          )}
                          {section.totalsRow && (
                            <Badge variant="secondary" className="text-[10px]">
                              CSV يشمل صف إجمالي
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        disabled={!section.data?.length}
                        onClick={() =>
                          downloadCSV(
                            section.data,
                            `${key}_${startDate}_${endDate}.csv`,
                            section.totalsRow,
                          )
                        }
                      >
                        <Download className="h-4 w-4 ml-1" />
                        CSV
                      </Button>
                    </div>
                  );
                },
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
