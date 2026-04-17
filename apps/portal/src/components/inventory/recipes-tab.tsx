"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChefHat, Search, ChevronLeft, Package, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { RecipeManager } from "./recipe-manager";

interface CatalogItem {
  id: string;
  sku?: string;
  name: string;
  name_ar?: string;
  base_price?: number;
  price?: number;
  category?: string;
  is_available?: boolean;
  has_recipe?: boolean;
}

export function RecipesTab() {
  const { merchantId, apiKey } = useMerchant();
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    setLoading(true);
    try {
      const result = await merchantApi.getCatalogItems(
        merchantId,
        apiKey,
        1,
        500,
      );
      setCatalogItems(
        result.items.map((item: any) => ({
          id: item.id,
          sku: item.sku,
          name: item.name_ar || item.name || item.nameEn || "بدون اسم",
          name_ar: item.name_ar,
          base_price: item.base_price || item.price,
          price: item.price || item.base_price,
          category: item.category,
          is_available: item.is_available ?? item.isActive ?? true,
          has_recipe: item.has_recipe || item.hasRecipe || false,
        })),
      );
    } catch (err) {
      console.error("Failed to load catalog:", err);
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const filteredItems = catalogItems.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.name?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q)
    );
  });

  // If a specific item is selected, show its recipe manager
  if (selectedItem) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedItem(null);
            loadCatalog(); // refresh has_recipe flags
          }}
          className="flex items-center gap-1 text-gray-600"
        >
          <ChevronLeft className="h-4 w-4" />
          رجوع لقائمة الاصناف
        </Button>
        <RecipeManager
          catalogItemId={selectedItem.id}
          catalogItemName={selectedItem.name}
          onClose={() => {
            setSelectedItem(null);
            loadCatalog();
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="mr-2 text-gray-500">جاري تحميل الاصناف...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header + Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-orange-500" />
          <h3 className="font-semibold text-lg">وصفات الاصناف</h3>
          <Badge variant="outline" className="text-xs">
            {catalogItems.filter((i) => i.has_recipe).length} وصفة
          </Badge>
        </div>
        <div className="relative w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في الاصناف..."
            className="pr-9 text-sm"
          />
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-[var(--accent-warning)]/20 bg-[color:rgba(245,158,11,0.10)] p-3 text-sm text-[var(--text-primary)]">
        <p className="font-medium mb-1">نظام الوصفات (المطاعم)</p>
        <p className="text-[var(--text-secondary)]">
          اربط اصناف القائمة (مثل برجر، شاورما) بالمكونات الفعلية من المخزون.
          عند كل طلب، يتم خصم المكونات تلقائيا. عند الغاء الطلب، يتم ارجاعها.
        </p>
      </div>

      {/* Catalog items grid */}
      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>{search ? "لا توجد نتائج" : "لا توجد اصناف في القائمة"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer transition-colors hover:border-[var(--accent-warning)]/30"
              onClick={() => setSelectedItem(item)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">
                      {item.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      {item.sku && (
                        <span className="text-xs text-gray-400">
                          {item.sku}
                        </span>
                      )}
                      {item.category && (
                        <Badge variant="outline" className="text-xs">
                          {item.category}
                        </Badge>
                      )}
                    </div>
                    {item.price && (
                      <p className="text-xs text-gray-500 mt-1">
                        {formatCurrency(item.price)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 mr-2">
                    {item.has_recipe ? (
                      <Badge className="bg-[var(--warning-muted)] text-[var(--accent-warning)] text-xs">
                        <ChefHat className="h-3 w-3 ml-1" />
                        وصفة
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs text-gray-400"
                      >
                        بدون وصفة
                      </Badge>
                    )}
                    {!item.is_available && (
                      <Badge variant="destructive" className="text-xs">
                        غير متاح
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
