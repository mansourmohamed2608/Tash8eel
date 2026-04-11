"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Settings,
  Printer,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Bell,
  Package,
} from "lucide-react";
import Link from "next/link";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { branchesApi } from "@/lib/client";

function formatCurrency(v: number | undefined | null, currency = "SAR") {
  const n = typeof v === "number" ? v : 0;
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const date = new Date(Number(y), Number(mo) - 1, 1);
  return date.toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
}

function ChangeChip({ value }: { value: number | null }) {
  if (value == null)
    return <span className="text-muted-foreground text-xs">-</span>;
  const positive = value >= 0;
  return (
    <span
      className={`text-xs font-semibold ${positive ? "text-[var(--accent-success)]" : "text-[var(--accent-danger)]"}`}
    >
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function BranchPLPage() {
  const params = useParams<{ branchId: string }>();
  const branchId = params.branchId;
  const router = useRouter();
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  // Default to current month
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth] = useState(defaultMonth);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const data = await branchesApi.getPLReport(apiKey, branchId, month);
      setReport(data);
    } catch {
      toast({ title: "فشل تحميل التقرير", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, branchId, month]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  function handlePrint() {
    window.print();
  }

  const branch = report?.meta?.branch;
  const rev = report?.revenue;
  const exp = report?.expenses;
  const prof = report?.profitability;

  return (
    <div className="space-y-6 p-4 print:space-y-4 sm:p-6">
      {/* Tab nav - hidden when printing */}
      <div className="grid grid-cols-2 gap-2 border-b pb-0 print:hidden sm:grid-cols-3 xl:grid-cols-6">
        <Link
          href={`/merchant/branches/${branchId}`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <BarChart3 className="h-4 w-4" />
          التحليلات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/settings`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          الإعدادات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/shifts`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Clock className="h-4 w-4" />
          الجلسات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/inventory`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Package className="h-4 w-4" />
          المخزون
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/alerts`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          التنبيهات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/pl-report`}
          className="flex items-center justify-center gap-1.5 border-b-2 border-primary px-4 py-2 text-center text-sm font-medium text-primary"
        >
          <FileText className="h-4 w-4" />
          تقرير الأرباح
        </Link>
      </div>

      <PageHeader
        title={`تقرير الأرباح والخسائر - ${branch?.name ?? "..."}`}
        description={`شهر: ${formatMonth(month)}`}
        actions={
          <div className="flex w-full flex-col gap-2 print:hidden sm:w-auto sm:flex-row">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/merchant/branches")}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 ml-1" />
              الفروع
            </Button>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Label htmlFor="month" className="text-sm whitespace-nowrap">
                الشهر:
              </Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full sm:w-36"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReport}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!report}
              className="w-full sm:w-auto"
            >
              <Printer className="h-4 w-4 ml-1" />
              طباعة
            </Button>
          </div>
        }
      />

      {/* Print header */}
      <div className="hidden print:block text-center mb-6">
        <h1 className="text-2xl font-bold">{branch?.name ?? ""}</h1>
        <h2 className="text-xl mt-1">تقرير الأرباح والخسائر</h2>
        <p className="text-muted-foreground mt-1">{formatMonth(month)}</p>
        <p className="text-xs text-muted-foreground">
          {report?.meta?.startDate} - {report?.meta?.endDate}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">
          جارٍ تحميل التقرير...
        </div>
      ) : !report ? (
        <div className="text-center py-20 text-muted-foreground">
          لا توجد بيانات للشهر المحدد
        </div>
      ) : (
        <div ref={printRef} className="space-y-6 print:space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">
                  إجمالي الإيرادات
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(rev?.grossRevenue)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {rev?.totalOrders} طلب
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">صافي الإيرادات</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(rev?.netRevenue)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  بعد الخصومات
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">إجمالي المصاريف</p>
                <p className="mt-1 text-2xl font-bold text-[var(--accent-danger)]">
                  {formatCurrency(exp?.totalExpenses)}
                </p>
              </CardContent>
            </Card>
            <Card
              className={
                prof?.netProfit >= 0 ? "border-green-200" : "border-red-200"
              }
            >
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">صافي الربح</p>
                <p
                  className={`mt-1 text-2xl font-bold ${prof?.netProfit >= 0 ? "text-[var(--accent-success)]" : "text-[var(--accent-danger)]"}`}
                >
                  {formatCurrency(prof?.netProfit)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge
                    variant={prof?.margin >= 0 ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {prof?.margin?.toFixed(1)}% هامش
                  </Badge>
                  <ChangeChip value={prof?.change} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--accent-success)]" />
                الإيرادات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-3 p-4 md:hidden">
                <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
                  <CardContent className="space-y-3 p-0 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium">إجمالي الإيرادات</span>
                      <span className="font-semibold">
                        {formatCurrency(rev?.grossRevenue)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>عدد الطلبات</span>
                      <span>{rev?.totalOrders} طلب</span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">الخصومات</span>
                      <span className="text-[var(--accent-danger)]">
                        ({formatCurrency(rev?.discounts)})
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">
                        رسوم التوصيل
                      </span>
                      <span>{formatCurrency(rev?.deliveryFees)}</span>
                    </div>
                    <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-3 py-2 font-semibold sm:flex-row sm:items-center sm:justify-between">
                      <span>صافي الإيرادات</span>
                      <span>{formatCurrency(rev?.netRevenue)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">
                        إجمالي الإيرادات
                      </TableCell>
                      <TableCell className="text-right">
                        {rev?.totalOrders} طلب
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(rev?.grossRevenue)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground pr-8">
                        الخصومات
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right text-[var(--accent-danger)]">
                        ({formatCurrency(rev?.discounts)})
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground pr-8">
                        رسوم التوصيل
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {formatCurrency(rev?.deliveryFees)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>صافي الإيرادات</TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {formatCurrency(rev?.netRevenue)}
                      </TableCell>
                    </TableRow>
                    {rev?.cancelledOrders > 0 && (
                      <TableRow className="text-muted-foreground text-sm">
                        <TableCell className="pr-8">
                          ملاحظة: {rev.cancelledOrders} طلب ملغى
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right">
                          ({formatCurrency(rev?.cancelledRevenue)})
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Expenses Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-[var(--accent-danger)]" />
                المصاريف
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {exp?.byCategory?.length > 0 ? (
                <>
                  <div className="space-y-3 p-4 md:hidden">
                    {exp.byCategory.map((cat: any) => (
                      <Card key={cat.category}>
                        <CardContent className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <span>{cat.category || "أخرى"}</span>
                          <span className="font-medium">
                            {formatCurrency(cat.total)}
                          </span>
                        </CardContent>
                      </Card>
                    ))}
                    <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-4 py-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between">
                      <span>الإجمالي</span>
                      <span>{formatCurrency(exp?.totalExpenses)}</span>
                    </div>
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الفئة</TableHead>
                          <TableHead className="text-right">المبلغ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exp.byCategory.map((cat: any) => (
                          <TableRow key={cat.category}>
                            <TableCell>{cat.category || "أخرى"}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(cat.total)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/40 font-semibold">
                          <TableCell>الإجمالي</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(exp?.totalExpenses)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-6">
                  لا توجد مصاريف مسجّلة
                </p>
              )}
            </CardContent>
          </Card>

          {/* Profitability Summary */}
          <Card
            className={
              prof?.netProfit >= 0 ? "border-green-200" : "border-red-200"
            }
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                ملخص الربحية
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-3 p-4 md:hidden">
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">صافي الإيرادات</span>
                  <span>{formatCurrency(rev?.netRevenue)}</span>
                </div>
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">إجمالي المصاريف</span>
                  <span className="text-[var(--accent-danger)]">
                    ({formatCurrency(exp?.totalExpenses)})
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-3 py-2 text-base font-bold sm:flex-row sm:items-center sm:justify-between">
                  <span>صافي الربح</span>
                  <span
                    className={
                      prof?.netProfit >= 0
                        ? "text-[var(--accent-success)]"
                        : "text-[var(--accent-danger)]"
                    }
                  >
                    {formatCurrency(prof?.netProfit)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-muted-foreground">هامش الربح</span>
                  <Badge
                    variant={prof?.margin >= 0 ? "default" : "destructive"}
                  >
                    {prof?.margin?.toFixed(2)}%
                  </Badge>
                </div>
                {prof?.prevNetProfit != null && (
                  <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground">الشهر السابق</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(prof.prevNetProfit)}{" "}
                      <ChangeChip value={prof?.change} />
                    </span>
                  </div>
                )}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">
                        صافي الإيرادات
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(rev?.netRevenue)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        إجمالي المصاريف
                      </TableCell>
                      <TableCell className="text-right text-[var(--accent-danger)]">
                        ({formatCurrency(exp?.totalExpenses)})
                      </TableCell>
                    </TableRow>
                    <Separator />
                    <TableRow className="bg-muted/40 font-bold text-base">
                      <TableCell>صافي الربح</TableCell>
                      <TableCell
                        className={`text-right ${prof?.netProfit >= 0 ? "text-[var(--accent-success)]" : "text-[var(--accent-danger)]"}`}
                      >
                        {formatCurrency(prof?.netProfit)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">
                        هامش الربح
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            prof?.margin >= 0 ? "default" : "destructive"
                          }
                        >
                          {prof?.margin?.toFixed(2)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {prof?.prevNetProfit != null && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">
                          الشهر السابق
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(prof.prevNetProfit)}{" "}
                          <ChangeChip value={prof?.change} />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Print footer */}
          <div className="hidden print:block text-center text-xs text-muted-foreground mt-8 border-t pt-4">
            تم إنشاء هذا التقرير في {new Date().toLocaleString("ar-SA")}
          </div>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          header,
          nav,
          aside,
          .print\\:hidden {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
