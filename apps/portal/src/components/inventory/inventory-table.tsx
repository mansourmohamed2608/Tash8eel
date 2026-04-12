"use client";

import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/alerts";
import { Pagination } from "@/components/ui/data-table";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  ArrowUp,
  Sparkles,
} from "lucide-react";
import {
  cn,
  formatCurrency,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import type { InventoryItem, InventoryVariant } from "./types";

interface InventoryTableProps {
  inventory: InventoryItem[];
  expandedItems: Set<string>;
  currentPage: number;
  totalPages: number;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggleExpanded: (itemId: string) => void;
  onAddProduct: () => void;
  onEditProduct: (item: InventoryItem) => void;
  onDeleteProduct: (item: InventoryItem) => void;
  onStockUpdate: (item: InventoryItem) => void;
  onAddVariant: (item: InventoryItem) => void;
  onEditVariant: (variant: InventoryVariant, parentItem: InventoryItem) => void;
  onVariantStockUpdate: (
    variant: InventoryVariant,
    parentItem: InventoryItem,
  ) => void;
  onDeleteVariant: (variant: InventoryVariant) => void;
  onPageChange: (page: number) => void;
  onGenerateAiDesc?: (item: InventoryItem) => void;
}

export function InventoryTable({
  inventory,
  expandedItems,
  currentPage,
  totalPages,
  canCreate,
  canEdit,
  canDelete,
  onToggleExpanded,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onStockUpdate,
  onAddVariant,
  onEditVariant,
  onVariantStockUpdate,
  onDeleteVariant,
  onPageChange,
  onGenerateAiDesc,
}: InventoryTableProps) {
  if (inventory.length === 0) {
    return (
      <Card>
        <CardContent className="p-12">
          <EmptyState
            icon={<Package className="h-16 w-16" />}
            title="لا توجد منتجات"
            description="لم يتم العثور على منتجات مطابقة للبحث"
            action={
              canCreate ? (
                <Button onClick={onAddProduct}>
                  <Plus className="h-4 w-4" />
                  إضافة منتج
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="space-y-3 p-3 md:hidden">
            {inventory.map((item) => (
              <Card key={item.id} className="border shadow-none">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {item.sku}
                      </p>
                    </div>
                    <Badge className={getStatusColor(item.status)}>
                      {getStatusLabel(item.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">الفئة</p>
                      <p>{item.category || "عام"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">المتغيرات</p>
                      <p>{item.variant_count || 1}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">سعر التكلفة</p>
                      <p>{formatCurrency(item.costPrice)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">سعر البيع</p>
                      <p>{formatCurrency(item.price)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">الكمية</p>
                      <p
                        className={cn(
                          "font-medium",
                          item.status === "OUT_OF_STOCK" && "text-red-600",
                          item.status === "LOW_STOCK" && "text-yellow-600",
                        )}
                      >
                        {item.stock}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canEdit && (item.variant_count || 0) <= 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStockUpdate(item)}
                      >
                        <ArrowUp className="h-4 w-4 text-green-600" />
                        تعديل المخزون
                      </Button>
                    )}
                    {canCreate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAddVariant(item)}
                      >
                        <Plus className="h-4 w-4 text-blue-600" />
                        إضافة متغير
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEditProduct(item)}
                      >
                        <Edit className="h-4 w-4" />
                        تعديل
                      </Button>
                    )}
                    {onGenerateAiDesc && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onGenerateAiDesc(item)}
                      >
                        <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
                        وصف ذكي
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        onClick={() => onDeleteProduct(item)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                        حذف
                      </Button>
                    )}
                  </div>

                  {(item.variant_count || 0) > 1 ? (
                    <div className="space-y-3 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => onToggleExpanded(item.id)}
                      >
                        <span>المتغيرات ({item.variants?.length || 0})</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            expandedItems.has(item.id) && "rotate-180",
                          )}
                        />
                      </Button>

                      {expandedItems.has(item.id) &&
                        item.variants &&
                        item.variants.length > 0 && (
                          <div className="space-y-2">
                            {item.variants.map((variant) => (
                              <div
                                key={variant.id}
                                className="rounded-lg border bg-muted/10 p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">
                                      {variant.name}
                                    </p>
                                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                                      {variant.sku}
                                    </p>
                                  </div>
                                  <Badge
                                    className={cn(
                                      "text-xs",
                                      getStatusColor(variant.status),
                                    )}
                                  >
                                    {getStatusLabel(variant.status)}
                                  </Badge>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">
                                      سعر التكلفة
                                    </p>
                                    <p>{formatCurrency(variant.cost_price)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      سعر البيع
                                    </p>
                                    <p>
                                      {formatCurrency(
                                        (Number(item.price) || 0) +
                                          (Number(variant.price_modifier) || 0),
                                      )}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      الكمية
                                    </p>
                                    <p>{variant.quantity_on_hand}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      الخصائص
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {variant.attributes &&
                                      Object.keys(variant.attributes).length > 0
                                        ? Object.entries(
                                            variant.attributes,
                                          ).map(([key, val]) => (
                                            <Badge
                                              key={key}
                                              variant="secondary"
                                              className="text-[10px]"
                                            >
                                              {key}: {val}
                                            </Badge>
                                          ))
                                        : "-"}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {canEdit && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        onEditVariant(variant, item)
                                      }
                                    >
                                      <Edit className="h-3.5 w-3.5 text-blue-600" />
                                      تعديل
                                    </Button>
                                  )}
                                  {canEdit && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        onVariantStockUpdate(variant, item)
                                      }
                                    >
                                      <ArrowUp className="h-3.5 w-3.5 text-green-600" />
                                      مخزون
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-red-600"
                                      onClick={() => onDeleteVariant(variant)}
                                      disabled={
                                        (item.variants?.length || 0) <= 1
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                      حذف
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="w-8 p-3 text-right text-sm font-medium"></th>
                  <th className="p-3 text-right text-sm font-medium">الرمز</th>
                  <th className="p-3 text-right text-sm font-medium">الاسم</th>
                  <th className="p-3 text-right text-sm font-medium">الفئة</th>
                  <th className="p-3 text-right text-sm font-medium">
                    المتغيرات
                  </th>
                  <th className="p-3 text-right text-sm font-medium">
                    سعر التكلفة
                  </th>
                  <th className="p-3 text-right text-sm font-medium">
                    سعر البيع
                  </th>
                  <th className="p-3 text-right text-sm font-medium">الكمية</th>
                  <th className="p-3 text-right text-sm font-medium">الحالة</th>
                  <th className="p-3 text-right text-sm font-medium">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <Fragment key={item.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b transition-colors hover:bg-muted/30",
                        expandedItems.has(item.id) && "bg-muted/20",
                      )}
                      onClick={() =>
                        (item.variant_count || 0) > 1 &&
                        onToggleExpanded(item.id)
                      }
                    >
                      <td className="p-3">
                        {(item.variant_count || 0) > 1 && (
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              expandedItems.has(item.id) && "rotate-180",
                            )}
                          />
                        )}
                      </td>
                      <td className="p-3 font-mono text-sm">{item.sku}</td>
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {item.category || "عام"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            (item.variant_count || 0) > 1 &&
                              "border-[var(--accent-blue)]/20 bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]",
                          )}
                        >
                          {item.variant_count || 1}{" "}
                          {(item.variant_count || 0) > 1 ? "متغيرات" : "متغير"}
                        </Badge>
                      </td>
                      <td className="p-3">{formatCurrency(item.costPrice)}</td>
                      <td className="p-3">{formatCurrency(item.price)}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "font-medium",
                            item.status === "OUT_OF_STOCK" && "text-red-600",
                            item.status === "LOW_STOCK" && "text-yellow-600",
                          )}
                        >
                          {item.stock}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge className={getStatusColor(item.status)}>
                          {getStatusLabel(item.status)}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {canEdit && (item.variant_count || 0) <= 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="تعديل المخزون"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStockUpdate(item);
                              }}
                            >
                              <ArrowUp className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {canCreate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="إضافة متغير"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddVariant(item);
                              }}
                            >
                              <Plus className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditProduct(item);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {onGenerateAiDesc && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="توليد وصف ذكي"
                              onClick={(e) => {
                                e.stopPropagation();
                                onGenerateAiDesc(item);
                              }}
                            >
                              <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteProduct(item);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedItems.has(item.id) &&
                      item.variants &&
                      item.variants.length > 0 && (
                        <tr key={`${item.id}-variants`}>
                          <td colSpan={10} className="bg-muted/10 p-0">
                            <div className="p-4 pr-12">
                              <div className="mb-3 flex items-center justify-between">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  المتغيرات ({item.variants.length})
                                </h4>
                              </div>
                              <table className="w-full overflow-hidden rounded-lg border">
                                <thead className="bg-muted/30">
                                  <tr>
                                    <th className="p-2 text-right text-xs font-medium">
                                      الرمز
                                    </th>
                                    <th className="p-2 text-right text-xs font-medium">
                                      الاسم
                                    </th>
                                    <th className="p-2 text-right text-xs font-medium">
                                      الخصائص
                                    </th>
                                    <th className="p-2 text-right text-xs font-medium">
                                      سعر التكلفة
                                    </th>
                                    <th className="p-2 text-right text-xs font-medium">
                                      سعر البيع
                                    </th>
                                    <th className="p-2 text-right text-xs font-medium">
                                      الكمية
                                    </th>
                                    <th className="p-2 text-right text-xs font-medium">
                                      الحالة
                                    </th>
                                    <th className="p-2 text-right text-xs font-medium">
                                      إجراءات
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.variants.map((variant) => (
                                    <tr
                                      key={variant.id}
                                      className="border-t hover:bg-muted/20"
                                    >
                                      <td className="p-2 font-mono text-xs">
                                        {variant.sku}
                                      </td>
                                      <td className="p-2 text-sm">
                                        {variant.name}
                                      </td>
                                      <td className="p-2">
                                        {variant.attributes &&
                                        Object.keys(variant.attributes).length >
                                          0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {Object.entries(
                                              variant.attributes,
                                            ).map(([key, val]) => (
                                              <Badge
                                                key={key}
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                {key}: {val}
                                              </Badge>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-2 text-sm">
                                        {formatCurrency(variant.cost_price)}
                                      </td>
                                      <td className="p-2 text-sm text-green-600">
                                        {formatCurrency(
                                          (Number(item.price) || 0) +
                                            (Number(variant.price_modifier) ||
                                              0),
                                        )}
                                      </td>
                                      <td className="p-2">
                                        <span
                                          className={cn(
                                            "text-sm font-medium",
                                            variant.status === "OUT_OF_STOCK" &&
                                              "text-red-600",
                                            variant.status === "LOW_STOCK" &&
                                              "text-yellow-600",
                                          )}
                                        >
                                          {variant.quantity_on_hand}
                                        </span>
                                      </td>
                                      <td className="p-2">
                                        <Badge
                                          className={cn(
                                            "text-xs",
                                            getStatusColor(variant.status),
                                          )}
                                        >
                                          {getStatusLabel(variant.status)}
                                        </Badge>
                                      </td>
                                      <td className="p-2">
                                        <div className="flex items-center gap-1">
                                          {canEdit && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              title="تعديل المتغير"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onEditVariant(variant, item);
                                              }}
                                            >
                                              <Edit className="h-3 w-3 text-blue-600" />
                                            </Button>
                                          )}
                                          {canEdit && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              title="تعديل مخزون المتغير"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onVariantStockUpdate(
                                                  variant,
                                                  item,
                                                );
                                              }}
                                            >
                                              <ArrowUp className="h-3 w-3 text-green-600" />
                                            </Button>
                                          )}
                                          {canDelete && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              title="حذف المتغير"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteVariant(variant);
                                              }}
                                              disabled={
                                                (item.variants?.length || 0) <=
                                                1
                                              }
                                            >
                                              <Trash2 className="h-3 w-3 text-red-600" />
                                            </Button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}
