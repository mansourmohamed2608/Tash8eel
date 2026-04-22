"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Trash2, ChevronDown, Warehouse, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  WarehouseLocation,
  StockByLocationItem,
  LocationSummaryItem,
} from "./types";

interface LocationsTabProps {
  warehouseLocations: WarehouseLocation[];
  stockByLocation: StockByLocationItem[];
  locationSummary: LocationSummaryItem[];
  newLocationName: string;
  onNewLocationNameChange: (name: string) => void;
  onAddLocation: () => void;
  onDeleteLocation: (location: WarehouseLocation) => void;
  canCreate: boolean;
  canDelete: boolean;
  coerceNumber: (value: any) => number | null;
}

export function LocationsTab({
  warehouseLocations,
  stockByLocation,
  locationSummary,
  newLocationName,
  onNewLocationNameChange,
  onAddLocation,
  onDeleteLocation,
  canCreate,
  canDelete,
  coerceNumber,
}: LocationsTabProps) {
  return (
    <div className="space-y-6">
      {/* Add Location Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            إضافة موقع جديد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="اسم الموقع (مثل: المخزن الرئيسي، فرع الرياض)"
              value={newLocationName}
              onChange={(e) => onNewLocationNameChange(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={onAddLocation}
              disabled={!canCreate || !newLocationName.trim()}
            >
              <Plus className="h-4 w-4 ml-2" />
              إضافة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {warehouseLocations.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center">
              <Warehouse className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">لا توجد مواقع مخزون بعد</p>
              <p className="text-sm text-muted-foreground mt-1">
                أضف مواقع لتتبع المخزون في كل موقع
              </p>
            </CardContent>
          </Card>
        ) : (
          warehouseLocations.map((location) => {
            const locationStock = stockByLocation.filter(
              (s) => s.location_id === location.id,
            );
            const summary = locationSummary.find(
              (s) => s.location_id === location.id,
            );
            const productCount = coerceNumber(summary?.product_count);
            const variantCount = coerceNumber(summary?.variant_count);
            const totalItems =
              productCount ?? variantCount ?? locationStock.length;
            const itemLabel =
              productCount !== null
                ? "منتج"
                : variantCount !== null
                  ? "متغير"
                  : "عنصر";
            const totalQuantity =
              summary?.total_available ??
              locationStock.reduce(
                (sum, s) => sum + (s.quantity_available || 0),
                0,
              );
            const totalReserved = coerceNumber(summary?.total_reserved);
            const activeCount = warehouseLocations.filter(
              (l) => l.is_active !== false,
            ).length;
            const disableDelete = location.is_default && activeCount <= 1;
            const groupedByItem = new Map<
              string,
              {
                itemId: string;
                itemName: string;
                itemSku: string;
                totalAvailable: number;
                variants: typeof locationStock;
              }
            >();
            locationStock.forEach((stock) => {
              const key = stock.inventory_item_id || stock.variant_id;
              const itemName = stock.item_name || stock.variant_name;
              const itemSku = stock.item_sku || stock.sku;
              const existing = groupedByItem.get(key);
              if (existing) {
                existing.totalAvailable += stock.quantity_available || 0;
                existing.variants.push(stock);
              } else {
                groupedByItem.set(key, {
                  itemId: key,
                  itemName,
                  itemSku,
                  totalAvailable: stock.quantity_available || 0,
                  variants: [stock],
                });
              }
            });
            const groupedStock = Array.from(groupedByItem.values()).sort(
              (a, b) =>
                (a.itemName || "").localeCompare(b.itemName || "", "ar"),
            );

            return (
              <Card
                key={location.id}
                className={cn(
                  "self-start min-h-[240px] flex flex-col",
                  location.is_default && "border-primary",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Warehouse className="h-5 w-5" />
                        {location.name_ar || location.name}
                        {location.is_default && (
                          <Badge variant="outline" className="text-xs">
                            افتراضي
                          </Badge>
                        )}
                      </CardTitle>
                      {location.city && (
                        <p className="text-sm text-muted-foreground mt-1">
                          <MapPin className="h-3 w-3 inline ml-1" />
                          {location.city}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDeleteLocation(location)}
                      disabled={!canDelete || disableDelete}
                      title={
                        !canDelete
                          ? "ليس لديك صلاحية"
                          : disableDelete
                            ? "لا يمكن حذف الموقع الافتراضي الوحيد"
                            : "حذف الموقع"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">
                        {totalItems}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {itemLabel}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        {totalQuantity}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        وحدة متاحة
                      </p>
                      {totalReserved !== null && totalReserved > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {`محجوز ${totalReserved}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stock details for this location */}
                  {locationStock.length > 0 ? (
                    <Collapsible className="mt-4">
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full">
                          <ChevronDown className="h-4 w-4 ml-2" />
                          عرض المنتجات
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent
                        className={cn(
                          "mt-3 overflow-hidden transition-all duration-300 ease-out",
                          "data-[state=closed]:max-h-0 data-[state=closed]:opacity-0",
                          "data-[state=open]:max-h-64 data-[state=open]:opacity-100",
                        )}
                      >
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {groupedStock.map((item) => (
                            <div
                              key={`${item.itemId}`}
                              className="flex items-start justify-between gap-3 p-2 bg-muted/50 rounded text-sm"
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">
                                  {item.itemName}
                                  <span className="text-muted-foreground mr-2">
                                    ({item.itemSku})
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  المتغيرات:{" "}
                                  {item.variants.map((v) => v.sku).join("، ")}
                                </div>
                              </div>
                              <Badge
                                variant={
                                  item.totalAvailable > 0
                                    ? "default"
                                    : "destructive"
                                }
                              >
                                {item.totalAvailable}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4"
                      disabled
                    >
                      لا توجد منتجات
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
