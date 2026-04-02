"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { branchesApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";

const PERIOD_OPTIONS = [
  { label: "7 أيام", value: "7" },
  { label: "30 يوم", value: "30" },
  { label: "60 يوم", value: "60" },
  { label: "90 يوم", value: "90" },
];

export default function BranchComparisonPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);

  const fetchComparison = async (showError = true) => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const res = await branchesApi.getComparison(apiKey, parseInt(days, 10));
      const normalized = Array.isArray((res as any)?.branches)
        ? (res as any).branches.map((b: any) => ({
            branchId: b.branchId ?? null,
            name: b.name ?? b.branchName ?? "غير محدد",
            isActive: b.isActive ?? b.is_active ?? true,
            revenue: Number(b.revenue ?? 0),
            orders: Number(b.orders ?? b.totalOrders ?? 0),
            aov: Number(b.aov ?? b.avgOrderValue ?? 0),
            expenses: Number(b.expenses ?? b.totalExpenses ?? 0),
            netProfit: Number(b.netProfit ?? 0),
            margin: Number(b.margin ?? 0),
            revenuePct: Number(b.revenuePct ?? 0),
          }))
        : [];
      setBranches(normalized);
    } catch {
      if (showError) {
        toast({ title: "فشل في تحميل المقارنة", variant: "destructive" });
      }
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchComparison(false);
  }, [apiKey, days]);

  const maxRevenue = Math.max(...branches.map((b) => b.revenue ?? 0), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مقارنة الفروع"
        description="مقارنة الأداء المالي بين جميع الفروع"
        actions={
          <div className="flex gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void fetchComparison(true);
              }}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* Visual Bar Comparison */}
      {branches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              الإيراد النسبي للفروع
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...branches]
              .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
              .map((b, i) => (
                <div key={b.branchId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="font-semibold">
                      {formatCurrency(b.revenue ?? 0)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.round(((b.revenue ?? 0) / maxRevenue) * 100)}%`,
                        opacity: 1 - i * 0.1,
                      }}
                    />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تفاصيل المقارنة</CardTitle>
          <CardDescription>آخر {days} يوم - كل الفروع</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : branches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              لا توجد بيانات للمقارنة بعد
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفرع</TableHead>
                  <TableHead className="text-left">الإيراد</TableHead>
                  <TableHead className="text-left">الطلبات</TableHead>
                  <TableHead className="text-left">متوسط الطلب</TableHead>
                  <TableHead className="text-left">المصاريف</TableHead>
                  <TableHead className="text-left">صافي الربح</TableHead>
                  <TableHead className="text-left">هامش الربح</TableHead>
                  <TableHead className="text-left">% من الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...branches]
                  .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
                  .map((b) => (
                    <TableRow key={b.branchId}>
                      <TableCell className="font-medium">
                        {b.name}
                        {!b.isActive && (
                          <Badge variant="secondary" className="mr-1 text-xs">
                            غير نشط
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(b.revenue ?? 0)}</TableCell>
                      <TableCell>{formatNumber(b.orders ?? 0)}</TableCell>
                      <TableCell>{formatCurrency(b.aov ?? 0)}</TableCell>
                      <TableCell>{formatCurrency(b.expenses ?? 0)}</TableCell>
                      <TableCell
                        className={cn(
                          "font-semibold",
                          (b.netProfit ?? 0) >= 0
                            ? "text-green-600"
                            : "text-red-500",
                        )}
                      >
                        {(b.netProfit ?? 0) >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 inline ml-1 text-green-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 inline ml-1 text-red-500" />
                        )}
                        {formatCurrency(b.netProfit ?? 0)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            (b.margin ?? 0) >= 20
                              ? "default"
                              : (b.margin ?? 0) >= 0
                                ? "secondary"
                                : "destructive"
                          }
                          className="text-xs"
                        >
                          {(b.margin ?? 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${b.revenuePct ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {(b.revenuePct ?? 0).toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
