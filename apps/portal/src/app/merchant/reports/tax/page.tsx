"use client";

import { useState, useEffect, useCallback } from "react";
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
import { StatCard, KPIGrid } from "@/components/ui/stat-card";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { formatCurrency } from "@/lib/utils";
import { FileText, Calculator, TrendingUp, RefreshCw } from "lucide-react";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMoney(value: unknown): number {
  const amount = toNumber(value);
  return Object.is(amount, -0) || Math.abs(amount) < 1e-9 ? 0 : amount;
}

function formatVatRateLabel(raw: unknown): string {
  if (typeof raw === "number") {
    const rounded = Math.round(raw * 100) / 100;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)}%`;
  }
  const text = String(raw ?? "").trim();
  if (!text) return "0%";
  const numeric = Number(text.replace("%", ""));
  if (!Number.isFinite(numeric)) return text;
  const rounded = Math.round(numeric * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)}%`;
}

const TAX_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  FINAL: "نهائي",
  GENERATED: "نهائي",
  SUBMITTED: "تم التقديم",
};

export default function TaxReportPage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<any | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().split("T")[0];
  });

  const fetchReports = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    try {
      const data = await merchantApi.listTaxReports(merchantId, apiKey);
      setReports(data.reports || []);
    } catch {}
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const generateReport = async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const data = await merchantApi.generateTaxReport(
        merchantId,
        apiKey,
        periodStart,
        periodEnd,
      );
      setReport(data);
      fetchReports();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "فشل في إنشاء تقرير الضريبة",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="تقرير ضريبة القيمة المضافة"
        description="احسب ضريبة المبيعات والمشتريات والاسترجاعات"
        actions={
          <Button
            variant="outline"
            onClick={fetchReports}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="ml-2 h-4 w-4" /> تحديث
          </Button>
        }
      />

      {/* Period Selection */}
      <Card>
        <CardHeader>
          <CardTitle>إنشاء تقرير جديد</CardTitle>
          <CardDescription>
            اختر فترة التقرير وسيتم احتساب الضريبة تلقائياً
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(2,minmax(0,1fr))_auto]">
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            <Button
              onClick={generateReport}
              disabled={loading}
              className="w-full lg:w-auto"
            >
              <Calculator className="ml-2 h-4 w-4" />
              {loading ? "جاري الحساب..." : "احسب الضريبة"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700">{error}</CardContent>
        </Card>
      )}

      {/* Generated Report */}
      {report && (
        <>
          {(() => {
            const grossRevenue = normalizeMoney(report.grossRevenue);
            const netRevenue = normalizeMoney(report.netRevenue);
            const vatOnSales = normalizeMoney(report.vatOnSales);
            const vatOnPurchases = Math.abs(
              normalizeMoney(report.vatOnPurchases),
            );
            const vatOnRefunds = Math.abs(normalizeMoney(report.vatOnRefunds));
            const netVatPayable = normalizeMoney(report.netVatPayable);
            const totalDiscounts = normalizeMoney(report.totalDiscounts);
            const totalDeliveryFees = normalizeMoney(report.totalDeliveryFees);
            const taxableSalesBase = normalizeMoney(
              report.taxableSalesBase || report.netRevenue,
            );
            const totalExpenses = normalizeMoney(report.totalExpenses);
            const deductibleExpenses = normalizeMoney(
              report.deductibleExpenses,
            );
            const nonDeductibleExpenses = normalizeMoney(
              report.nonDeductibleExpenses,
            );
            const refundTotal = normalizeMoney(report.refundTotal);
            const totalOrders = Math.trunc(toNumber(report.totalOrders));
            const totalExpenseCount = Math.trunc(
              toNumber(report.totalExpenseCount),
            );
            const deductibleExpenseCount = Math.trunc(
              toNumber(report.deductibleExpenseCount),
            );
            const vatRateLabel = formatVatRateLabel(
              report.vatRate ?? report.vatRatePct,
            );
            const includeVatInPrice = report.includeVatInPrice !== false;
            const includeDeliveryInTax = report.includeDeliveryInTax !== false;

            return (
              <>
                <KPIGrid>
                  <StatCard
                    title="إجمالي الإيرادات"
                    value={formatCurrency(grossRevenue)}
                    icon={<TrendingUp className="h-5 w-5" />}
                  />
                  <StatCard
                    title="صافي الإيرادات"
                    value={formatCurrency(netRevenue)}
                    icon={<TrendingUp className="h-5 w-5" />}
                  />
                  <StatCard
                    title="ضريبة المبيعات"
                    value={formatCurrency(vatOnSales)}
                    icon={<FileText className="h-5 w-5" />}
                  />
                  <StatCard
                    title="صافي الضريبة المستحقة"
                    value={formatCurrency(netVatPayable)}
                    icon={<Calculator className="h-5 w-5" />}
                  />
                </KPIGrid>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>تفاصيل الضريبة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>نسبة الضريبة</span>
                        <Badge variant="outline">{vatRateLabel}</Badge>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>إجمالي الخصومات</span>
                        <span>{formatCurrency(totalDiscounts)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>رسوم التوصيل</span>
                        <span>{formatCurrency(totalDeliveryFees)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>الوعاء الضريبي للمبيعات</span>
                        <span>{formatCurrency(taxableSalesBase)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>إجمالي المصروفات (كل البنود)</span>
                        <span>{formatCurrency(totalExpenses)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>المصروفات المحتسبة ضريبياً</span>
                        <span>{formatCurrency(deductibleExpenses)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>مصروفات غير محتسبة ضريبياً</span>
                        <span>{formatCurrency(nonDeductibleExpenses)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>ضريبة المبيعات</span>
                        <span className="text-red-600">
                          {formatCurrency(vatOnSales)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>ضريبة المشتريات</span>
                        <span className="text-green-600">
                          {formatCurrency(-vatOnPurchases)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>ضريبة الاسترجاعات</span>
                        <span className="text-green-600">
                          {formatCurrency(-vatOnRefunds)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>أسلوب الحساب</span>
                        <Badge variant="secondary">
                          {includeVatInPrice
                            ? "السعر شامل الضريبة"
                            : "الضريبة تضاف على السعر"}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>حساب ضريبة التوصيل</span>
                        <Badge variant="secondary">
                          {includeDeliveryInTax ? "مشمولة" : "غير مشمولة"}
                        </Badge>
                      </div>
                      <hr />
                      <div className="flex flex-col gap-1 text-lg font-bold sm:flex-row sm:items-center sm:justify-between">
                        <span>صافي الضريبة المستحقة</span>
                        <span
                          className={
                            netVatPayable >= 0
                              ? "text-red-600"
                              : "text-green-600"
                          }
                        >
                          {formatCurrency(netVatPayable)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>ملخص الفترة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>عدد الطلبات الخاضعة للضريبة</span>
                        <span>{totalOrders}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>إجمالي المصروفات</span>
                        <span>{formatCurrency(totalExpenses)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>عدد المصروفات المحتسبة ضريبياً</span>
                        <span>
                          {deductibleExpenseCount} من {totalExpenseCount}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span>إجمالي الاسترجاعات</span>
                        <span>{formatCurrency(refundTotal)}</span>
                      </div>
                      {report.taxRegistrationNo && (
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span>رقم التسجيل الضريبي</span>
                          <Badge>{report.taxRegistrationNo}</Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* History */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>سجل التقارير</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reports.map((r: any) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-2">
                    <span className="font-medium">
                      {r.period_start} → {r.period_end}
                    </span>
                    <Badge
                      className="mr-0 sm:mr-2"
                      variant={
                        String(r.status || "").toUpperCase() === "FINAL" ||
                        String(r.status || "").toUpperCase() === "GENERATED"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {TAX_STATUS_LABELS[
                        String(r.status || "").toUpperCase()
                      ] || String(r.status || "")}
                    </Badge>
                  </div>
                  <span className="font-bold">
                    {formatCurrency(parseFloat(r.net_vat_payable))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
