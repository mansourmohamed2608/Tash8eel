"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, AlertBanner } from "@/components/ui/alerts";
import { TrendingDown, AlertTriangle, Package } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { ShrinkageData } from "./types";

interface ShrinkageTabProps {
  shrinkageData: ShrinkageData | null;
  loadingShrinkage: boolean;
  loadError?: string | null;
}

export function ShrinkageTab({
  shrinkageData,
  loadingShrinkage,
  loadError,
}: ShrinkageTabProps) {
  return (
    <div className="space-y-6">
      {/* Shrinkage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-[var(--danger-muted)] rounded-lg">
              <TrendingDown className="h-5 w-5 text-[var(--accent-danger)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {shrinkageData?.totalShrinkage || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                إجمالي الفاقد (وحدة)
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-[var(--warning-muted)] rounded-lg">
              <AlertTriangle className="h-5 w-5 text-[var(--accent-warning)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(shrinkageData?.shrinkageValue || 0)}
              </p>
              <p className="text-xs text-muted-foreground">قيمة الفاقد</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-[var(--accent-blue-dim)] p-2">
              <Package className="h-5 w-5 text-[var(--accent-blue)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {(shrinkageData?.shrinkageRate || 0).toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">نسبة الفاقد</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shrinkage Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            سجل الفاقد
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadError && (
            <div className="mb-4">
              <AlertBanner
                type="error"
                title="تعذر تحميل بيانات الفاقد"
                message={loadError}
              />
            </div>
          )}
          {loadingShrinkage ? (
            <TableSkeleton rows={5} columns={6} />
          ) : shrinkageData?.items && shrinkageData.items.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-right text-sm font-medium">
                      المنتج
                    </th>
                    <th className="p-3 text-right text-sm font-medium">SKU</th>
                    <th className="p-3 text-right text-sm font-medium">
                      المتوقع
                    </th>
                    <th className="p-3 text-right text-sm font-medium">
                      الفعلي
                    </th>
                    <th className="p-3 text-right text-sm font-medium">
                      الفاقد
                    </th>
                    <th className="p-3 text-right text-sm font-medium">
                      القيمة
                    </th>
                    <th className="p-3 text-right text-sm font-medium">
                      النسبة
                    </th>
                    <th className="p-3 text-right text-sm font-medium">
                      التاريخ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shrinkageData.items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-3 text-sm font-medium">{item.name}</td>
                      <td className="p-3 text-sm font-mono text-muted-foreground">
                        {item.sku}
                      </td>
                      <td className="p-3 text-sm">{item.expected}</td>
                      <td className="p-3 text-sm">{item.actual}</td>
                      <td className="p-3 text-sm">
                        <Badge variant="destructive">{item.shrinkage}</Badge>
                      </td>
                      <td className="p-3 text-sm text-red-600">
                        {formatCurrency(item.value)}
                      </td>
                      <td className="p-3 text-sm">
                        <span
                          className={cn(
                            item.rate >= 10
                              ? "text-red-600 font-bold"
                              : item.rate >= 5
                                ? "text-amber-600"
                                : "text-muted-foreground",
                          )}
                        >
                          {item.rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(item.recordedAt).toLocaleDateString("ar-EG")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingDown className="h-16 w-16" />}
              title="لا توجد سجلات فاقد"
              description="لم يتم تسجيل أي فاقد في المخزون بعد. سيظهر هنا أي فرق بين الكميات المتوقعة والفعلية."
            />
          )}
        </CardContent>
      </Card>

      {/* Anomaly Alert */}
      {shrinkageData?.items.some((i) => i.rate >= 10) && (
        <AlertBanner
          type="warning"
          title="تنبيه: نسبة فاقد مرتفعة"
          message={`يوجد ${shrinkageData.items.filter((i) => i.rate >= 10).length} منتجات بنسبة فاقد 10% أو أكثر - يُنصح بالتحقق`}
        />
      )}
    </div>
  );
}
