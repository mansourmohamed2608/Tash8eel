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
import { branchesApi } from "@/lib/api";

function formatCurrency(v: number | undefined | null, currency = "SAR") {
  const n = typeof v === "number" ? v : 0;
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const date = new Date(Number(y), Number(mo) - 1, 1);
  return date.toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
}

function ChangeChip({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  const positive = value >= 0;
  return (
    <span className={`text-xs font-semibold ${positive ? "text-green-600" : "text-red-500"}`}>
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
    <div className="space-y-6 print:space-y-4">
      {/* Tab nav — hidden when printing */}
      <div className="flex gap-1 border-b pb-0 print:hidden">
        <Link
          href={`/merchant/branches/${branchId}`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <BarChart3 className="h-4 w-4" />
          التحليلات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/settings`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          الإعدادات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/shifts`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Clock className="h-4 w-4" />
          الجلسات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/inventory`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Package className="h-4 w-4" />
          المخزون
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/alerts`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          التنبيهات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/pl-report`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
        >
          <FileText className="h-4 w-4" />
          تقرير الأرباح
        </Link>
      </div>

      <PageHeader
        title={`تقرير الأرباح والخسائر — ${branch?.name ?? "..."}`}
        description={`شهر: ${formatMonth(month)}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => router.push("/merchant/branches")}>
              <ArrowLeft className="h-4 w-4 ml-1" />
              الفروع
            </Button>
            <div className="flex items-center gap-2">
              <Label htmlFor="month" className="text-sm whitespace-nowrap">الشهر:</Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-36"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={handlePrint} disabled={!report}>
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
          {report?.meta?.startDate} — {report?.meta?.endDate}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">جارٍ تحميل التقرير...</div>
      ) : !report ? (
        <div className="text-center py-20 text-muted-foreground">لا توجد بيانات للشهر المحدد</div>
      ) : (
        <div ref={printRef} className="space-y-6 print:space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(rev?.grossRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">{rev?.totalOrders} طلب</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">صافي الإيرادات</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(rev?.netRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">بعد الخصومات</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">إجمالي المصاريف</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(exp?.totalExpenses)}</p>
              </CardContent>
            </Card>
            <Card className={prof?.netProfit >= 0 ? "border-green-200" : "border-red-200"}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">صافي الربح</p>
                <p className={`text-2xl font-bold mt-1 ${prof?.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(prof?.netProfit)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant={prof?.margin >= 0 ? "default" : "destructive"} className="text-xs">
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
                <TrendingUp className="h-4 w-4 text-green-600" />
                الإيرادات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">إجمالي الإيرادات</TableCell>
                    <TableCell className="text-right">{rev?.totalOrders} طلب</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(rev?.grossRevenue)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground pr-8">الخصومات</TableCell>
                    <TableCell />
                    <TableCell className="text-right text-red-500">({formatCurrency(rev?.discounts)})</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground pr-8">رسوم التوصيل</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{formatCurrency(rev?.deliveryFees)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>صافي الإيرادات</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{formatCurrency(rev?.netRevenue)}</TableCell>
                  </TableRow>
                  {rev?.cancelledOrders > 0 && (
                    <TableRow className="text-muted-foreground text-sm">
                      <TableCell className="pr-8">ملاحظة: {rev.cancelledOrders} طلب ملغى</TableCell>
                      <TableCell />
                      <TableCell className="text-right">({formatCurrency(rev?.cancelledRevenue)})</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Expenses Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                المصاريف
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {exp?.byCategory?.length > 0 ? (
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
                        <TableCell className="text-right">{formatCurrency(cat.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>الإجمالي</TableCell>
                      <TableCell className="text-right">{formatCurrency(exp?.totalExpenses)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-6">لا توجد مصاريف مسجّلة</p>
              )}
            </CardContent>
          </Card>

          {/* Profitability Summary */}
          <Card className={prof?.netProfit >= 0 ? "border-green-200" : "border-red-200"}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                ملخص الربحية
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">صافي الإيرادات</TableCell>
                    <TableCell className="text-right">{formatCurrency(rev?.netRevenue)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">إجمالي المصاريف</TableCell>
                    <TableCell className="text-right text-red-500">({formatCurrency(exp?.totalExpenses)})</TableCell>
                  </TableRow>
                  <Separator />
                  <TableRow className="bg-muted/40 font-bold text-base">
                    <TableCell>صافي الربح</TableCell>
                    <TableCell className={`text-right ${prof?.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(prof?.netProfit)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">هامش الربح</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={prof?.margin >= 0 ? "default" : "destructive"}>
                        {prof?.margin?.toFixed(2)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {prof?.prevNetProfit != null && (
                    <TableRow>
                      <TableCell className="text-muted-foreground">الشهر السابق</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(prof.prevNetProfit)}
                        {" "}
                        <ChangeChip value={prof?.change} />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
          header, nav, aside, .print\\:hidden { display: none !important; }
          body { background: white !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>
    </div>
  );
}
