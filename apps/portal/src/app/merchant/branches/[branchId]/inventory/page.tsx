"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Settings,
  RefreshCw,
  Search,
  Package,
  AlertTriangle,
  Bell,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { branchesApi } from "@/lib/client";

function formatQty(n: number | null | undefined) {
  return typeof n === "number" ? n.toLocaleString("ar-SA") : "-";
}

export default function BranchInventoryPage() {
  const params = useParams<{ branchId: string }>();
  const branchId = params.branchId;
  const router = useRouter();
  const { apiKey } = useMerchant();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [inventory, setInventory] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const fetchData = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const data = await branchesApi.getBranchInventory(apiKey, branchId, {
        search: search || undefined,
        lowStock: lowStockOnly || undefined,
      });
      setInventory(data);
    } catch {
      toast({ title: "فشل تحميل المخزون", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, branchId, search, lowStockOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = inventory?.summary;
  const items: any[] = inventory?.items ?? [];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Tab nav */}
      <div className="grid grid-cols-2 gap-2 border-b pb-0 sm:grid-cols-3 xl:grid-cols-6">
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
          className="flex items-center justify-center gap-1.5 border-b-2 border-primary px-4 py-2 text-center text-sm font-medium text-primary"
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
          className="flex items-center justify-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-4 w-4" />
          تقرير الأرباح
        </Link>
      </div>

      <PageHeader
        title="مخزون الفرع"
        description="مستويات المخزون في مواقع تخزين هذا الفرع"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/merchant/branches")}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 ml-1" />
              الفروع
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        }
      />

      {/* KPI summary */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
              <p className="text-2xl font-bold mt-1">{summary.totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">الكمية الفعلية</p>
              <p className="text-2xl font-bold mt-1">
                {formatQty(summary.totalOnHand)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">الكمية المتاحة</p>
              <p className="text-2xl font-bold mt-1">
                {formatQty(summary.totalAvailable)}
              </p>
            </CardContent>
          </Card>
          <Card className={summary.lowStockItems > 0 ? "border-amber-300" : ""}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {summary.lowStockItems > 0 && (
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                )}
                مخزون منخفض
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${summary.lowStockItems > 0 ? "text-amber-600" : ""}`}
              >
                {summary.lowStockItems}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث باسم المنتج أو الكود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="low-stock"
                checked={lowStockOnly}
                onCheckedChange={setLowStockOnly}
              />
              <Label htmlFor="low-stock" className="text-sm cursor-pointer">
                مخزون منخفض فقط
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            قائمة المخزون
            {items.length > 0 && (
              <Badge variant="secondary" className="mr-2">
                {items.length} صنف
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-12 text-muted-foreground">
              جارٍ التحميل...
            </p>
          ) : items.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">
              {lowStockOnly
                ? "لا توجد أصناف بمخزون منخفض"
                : "لا توجد بيانات مخزون للفرع"}
            </p>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {items.map((item) => (
                  <Card key={`${item.variantId}-${item.locationId}`}>
                    <CardContent className="space-y-3 p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.itemName}</p>
                          {item.variantName &&
                            item.variantName !== item.itemName && (
                              <p className="text-xs text-muted-foreground">
                                {item.variantName}
                              </p>
                            )}
                          {item.category && (
                            <p className="text-xs text-muted-foreground">
                              {item.category}
                            </p>
                          )}
                        </div>
                        {item.isLowStock ? (
                          <Badge
                            variant="destructive"
                            className="text-xs gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            منخفض
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            طبيعي
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">SKU</p>
                          <p className="font-mono">{item.sku || "-"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">الموقع</p>
                          <p className="font-medium">
                            {item.locationName || "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">فعلي</p>
                          <p className="font-medium">
                            {formatQty(item.quantityOnHand)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">محجوز</p>
                          <p className="font-medium">
                            {formatQty(item.quantityReserved)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">متاح</p>
                          <p className="font-semibold">
                            {formatQty(item.quantityAvailable)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الكود (SKU)</TableHead>
                      <TableHead>الموقع</TableHead>
                      <TableHead className="text-right">فعلي</TableHead>
                      <TableHead className="text-right">محجوز</TableHead>
                      <TableHead className="text-right">متاح</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={`${item.variantId}-${item.locationId}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.itemName}</p>
                            {item.variantName &&
                              item.variantName !== item.itemName && (
                                <p className="text-xs text-muted-foreground">
                                  {item.variantName}
                                </p>
                              )}
                            {item.category && (
                              <p className="text-xs text-muted-foreground">
                                {item.category}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.sku || "-"}
                        </TableCell>
                        <TableCell>{item.locationName || "-"}</TableCell>
                        <TableCell className="text-right">
                          {formatQty(item.quantityOnHand)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatQty(item.quantityReserved)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatQty(item.quantityAvailable)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.isLowStock ? (
                            <Badge
                              variant="destructive"
                              className="text-xs gap-1"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              منخفض
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              طبيعي
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
