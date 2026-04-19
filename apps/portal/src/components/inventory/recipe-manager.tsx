"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  ChefHat,
  Package,
  AlertTriangle,
  Loader2,
  Save,
  X,
  Search,
  Check,
} from "lucide-react";
import { portalApi } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";

interface InventoryOption {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  unit?: string;
}

interface RecipeIngredient {
  id: string;
  ingredient_inventory_item_id: string;
  ingredient_name: string;
  quantity_required: number;
  unit: string;
  is_optional: boolean;
  waste_factor: number;
  notes: string;
  ingredient_sku: string;
  ingredient_cost: number;
}

interface RecipeAvailability {
  itemId: string;
  name: string;
  mode: "simple" | "recipe";
  availableQuantity: number;
  limitingIngredient: string | null;
  ingredients?: Array<{
    name: string;
    required: number;
    unit: string;
    stockOnHand: number;
    canMake: number;
  }>;
}

interface RecipeManagerProps {
  catalogItemId: string;
  catalogItemName: string;
  onClose?: () => void;
}

const UNITS = [
  { value: "piece", label: "قطعة" },
  { value: "gram", label: "جرام" },
  { value: "kg", label: "كيلو" },
  { value: "ml", label: "مل" },
  { value: "liter", label: "لتر" },
  { value: "cup", label: "كوب" },
  { value: "tbsp", label: "ملعقة كبيرة" },
  { value: "tsp", label: "ملعقة صغيرة" },
  { value: "slice", label: "شريحة" },
  { value: "portion", label: "حصة" },
];

export function RecipeManager({
  catalogItemId,
  catalogItemName,
  onClose,
}: RecipeManagerProps) {
  const { toast } = useToast();
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [availability, setAvailability] = useState<RecipeAvailability | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);

  // Inventory items for ingredient picker
  const [inventoryItems, setInventoryItems] = useState<InventoryOption[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [showInventoryDropdown, setShowInventoryDropdown] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] =
    useState<InventoryOption | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // New ingredient form
  const [newIngredient, setNewIngredient] = useState({
    ingredientName: "",
    ingredientInventoryItemId: "",
    quantityRequired: 1,
    unit: "piece",
    isOptional: false,
    wasteFactor: 1.0,
    notes: "",
  });

  // Load inventory items for the dropdown
  useEffect(() => {
    const loadInventory = async () => {
      try {
        const data = await portalApi.getInventory({
          search: inventorySearch || undefined,
        });
        const items = (data?.items || data || []) as any[];
        setInventoryItems(
          items.map((it: any) => ({
            id: it.id,
            name: it.name || it.product_name || "",
            sku: it.sku || "",
            stock_quantity: it.stock_quantity ?? it.quantity ?? 0,
            unit: it.unit || "piece",
          })),
        );
      } catch {
        // silent - items won't be loaded
      }
    };
    loadInventory();
  }, [inventorySearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowInventoryDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadRecipe = useCallback(async () => {
    setLoading(true);
    try {
      const [recipeData, availData] = await Promise.all([
        portalApi.getRecipe(catalogItemId),
        portalApi.checkItemAvailability(catalogItemId),
      ]);
      setIngredients(recipeData.ingredients);
      setTotalCost(recipeData.totalCostPerUnit);
      setAvailability(availData);
    } catch {
      toast({ title: "خطأ في تحميل الوصفة", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [catalogItemId, toast]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  const handleAddIngredient = async () => {
    if (!newIngredient.ingredientName.trim()) {
      toast({ title: "اختر مكون من المخزون", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await portalApi.addRecipeIngredient(catalogItemId, {
        ingredientInventoryItemId:
          newIngredient.ingredientInventoryItemId || undefined,
        ingredientName: newIngredient.ingredientName,
        quantityRequired: newIngredient.quantityRequired,
        unit: newIngredient.unit,
        isOptional: newIngredient.isOptional,
        wasteFactor: newIngredient.wasteFactor,
        notes: newIngredient.notes,
      });
      setNewIngredient({
        ingredientName: "",
        ingredientInventoryItemId: "",
        quantityRequired: 1,
        unit: "piece",
        isOptional: false,
        wasteFactor: 1.0,
        notes: "",
      });
      setSelectedInventoryItem(null);
      setInventorySearch("");
      setShowAddForm(false);
      await loadRecipe();
      toast({ title: "تم اضافة المكون" });
    } catch {
      toast({ title: "خطأ في اضافة المكون", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIngredient = async (ingredientId: string, name: string) => {
    if (!confirm(`حذف "${name}" من الوصفة؟`)) return;
    try {
      await portalApi.deleteRecipeIngredient(catalogItemId, ingredientId);
      await loadRecipe();
      toast({ title: `تم حذف "${name}"` });
    } catch {
      toast({ title: "خطأ في الحذف", variant: "destructive" });
    }
  };

  const handleUpdateIngredient = async (
    ingredientId: string,
    field: string,
    value: any,
  ) => {
    try {
      await portalApi.updateRecipeIngredient(catalogItemId, ingredientId, {
        [field]: value,
      });
      await loadRecipe();
    } catch {
      toast({ title: "خطأ في التحديث", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="mr-2 text-gray-500">جاري التحميل...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--warning-muted)] rounded-lg">
            <ChefHat className="h-5 w-5 text-[var(--accent-warning)]" />
          </div>
          <div>
            <CardTitle className="text-lg">وصفة: {catalogItemName}</CardTitle>
            <p className="text-sm text-gray-500 mt-0.5">
              {ingredients.length} مكون
              {totalCost > 0 && ` - تكلفة الوحدة: ${totalCost.toFixed(2)} ج.م`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {availability && availability.mode === "recipe" && (
            <Badge
              variant={
                availability.availableQuantity > 5
                  ? "default"
                  : availability.availableQuantity > 0
                    ? "secondary"
                    : "destructive"
              }
            >
              يمكن تحضير: {availability.availableQuantity}
              {availability.limitingIngredient &&
                ` (محدود بـ ${availability.limitingIngredient})`}
            </Badge>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Ingredients list */}
        {ingredients.length > 0 ? (
          <div className="space-y-2">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-3 py-1">
              <div className="col-span-4">المكون</div>
              <div className="col-span-2">الكمية</div>
              <div className="col-span-2">الوحدة</div>
              <div className="col-span-2">الهدر</div>
              <div className="col-span-1">اختياري</div>
              <div className="col-span-1"></div>
            </div>

            {ingredients.map((ing) => (
              <div
                key={ing.id}
                className="grid grid-cols-12 gap-2 items-center bg-[var(--bg-surface-2)] rounded-lg px-3 py-2 text-sm"
              >
                <div className="col-span-4 flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate font-medium">
                    {ing.ingredient_name}
                  </span>
                  {ing.ingredient_sku && (
                    <Badge variant="outline" className="text-xs">
                      {ing.ingredient_sku}
                    </Badge>
                  )}
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    value={ing.quantity_required}
                    onChange={(e) =>
                      handleUpdateIngredient(
                        ing.id,
                        "quantityRequired",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className="h-7 text-xs"
                    step="0.001"
                    min="0"
                  />
                </div>
                <div className="col-span-2">
                  <select
                    value={ing.unit}
                    onChange={(e) =>
                      handleUpdateIngredient(ing.id, "unit", e.target.value)
                    }
                    className="h-7 w-full rounded border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-1 text-xs text-[var(--text-primary)]"
                  >
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    value={ing.waste_factor}
                    onChange={(e) =>
                      handleUpdateIngredient(
                        ing.id,
                        "wasteFactor",
                        parseFloat(e.target.value) || 1,
                      )
                    }
                    className="h-7 text-xs"
                    step="0.05"
                    min="1"
                    max="2"
                  />
                </div>
                <div className="col-span-1 text-center">
                  <input
                    type="checkbox"
                    checked={ing.is_optional}
                    onChange={(e) =>
                      handleUpdateIngredient(
                        ing.id,
                        "isOptional",
                        e.target.checked,
                      )
                    }
                    className="rounded"
                  />
                </div>
                <div className="col-span-1 text-left">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleDeleteIngredient(ing.id, ing.ingredient_name)
                    }
                    className="h-7 w-7 p-0 text-[var(--accent-danger)] hover:opacity-80"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <ChefHat className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد مكونات بعد</p>
            <p className="text-xs mt-1">اضف المكونات التي يحتاجها هذا الصنف</p>
          </div>
        )}

        {/* Availability details */}
        {availability?.ingredients && availability.ingredients.length > 0 && (
          <div className="rounded-lg border border-[var(--accent-blue)]/20 bg-[var(--accent-blue-dim)] p-3">
            <h4 className="mb-2 text-sm font-medium text-[var(--accent-blue)]">
              حالة المخزون للمكونات
            </h4>
            <div className="space-y-1">
              {availability.ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs"
                >
                  <span>{ing.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--text-secondary)]">
                      متوفر: {ing.stockOnHand}{" "}
                      {UNITS.find((u) => u.value === ing.unit)?.label ||
                        ing.unit}
                    </span>
                    <Badge
                      variant={
                        ing.canMake > 5
                          ? "default"
                          : ing.canMake > 0
                            ? "secondary"
                            : "destructive"
                      }
                      className="text-xs"
                    >
                      يكفي لـ {ing.canMake}
                    </Badge>
                    {ing.canMake === 0 && (
                      <AlertTriangle className="h-3 w-3 text-[var(--accent-danger)]" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add ingredient form */}
        {showAddForm ? (
          <div className="space-y-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-4">
            <h4 className="text-sm font-semibold">اضافة مكون جديد</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative" ref={dropdownRef}>
                <label className="text-xs text-gray-500 block mb-1">
                  اختر مكون من المخزون
                </label>
                {selectedInventoryItem ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--accent-success)]/20 bg-[color:rgba(34,197,94,0.10)] px-3 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-[var(--accent-success)]" />
                    <span className="truncate font-medium">
                      {selectedInventoryItem.name}
                    </span>
                    {selectedInventoryItem.sku && (
                      <Badge
                        variant="outline"
                        className="text-xs flex-shrink-0"
                      >
                        {selectedInventoryItem.sku}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 mr-auto"
                      onClick={() => {
                        setSelectedInventoryItem(null);
                        setNewIngredient({
                          ...newIngredient,
                          ingredientName: "",
                          ingredientInventoryItemId: "",
                        });
                        setInventorySearch("");
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <Input
                      value={inventorySearch}
                      onChange={(e) => {
                        setInventorySearch(e.target.value);
                        setShowInventoryDropdown(true);
                      }}
                      onFocus={() => setShowInventoryDropdown(true)}
                      placeholder="ابحث في المخزون..."
                      className="text-sm pr-8"
                    />
                  </div>
                )}
                {showInventoryDropdown && !selectedInventoryItem && (
                  <div className="absolute top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)]">
                    {inventoryItems.length > 0 ? (
                      inventoryItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="flex w-full items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2 text-right text-sm hover:bg-[var(--bg-surface-2)] last:border-b-0"
                          onClick={() => {
                            setSelectedInventoryItem(item);
                            setNewIngredient({
                              ...newIngredient,
                              ingredientName: item.name,
                              ingredientInventoryItemId: item.id,
                              unit: item.unit || newIngredient.unit,
                            });
                            setShowInventoryDropdown(false);
                            setInventorySearch("");
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                            <div>
                              <span className="font-medium">{item.name}</span>
                              {item.sku && (
                                <span className="text-xs text-gray-400 mr-2">
                                  ({item.sku})
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge
                            variant={
                              item.stock_quantity > 0
                                ? "secondary"
                                : "destructive"
                            }
                            className="text-xs"
                          >
                            {item.stock_quantity} متوفر
                          </Badge>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-center text-sm text-gray-400">
                        لا توجد نتائج
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  الكمية المطلوبة
                </label>
                <Input
                  type="number"
                  value={newIngredient.quantityRequired}
                  onChange={(e) =>
                    setNewIngredient({
                      ...newIngredient,
                      quantityRequired: parseFloat(e.target.value) || 0,
                    })
                  }
                  step="0.001"
                  min="0"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  الوحدة
                </label>
                <select
                  value={newIngredient.unit}
                  onChange={(e) =>
                    setNewIngredient({ ...newIngredient, unit: e.target.value })
                  }
                  className="h-9 w-full rounded border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-2 text-sm text-[var(--text-primary)]"
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  معامل الهدر (1 = بدون هدر)
                </label>
                <Input
                  type="number"
                  value={newIngredient.wasteFactor}
                  onChange={(e) =>
                    setNewIngredient({
                      ...newIngredient,
                      wasteFactor: parseFloat(e.target.value) || 1,
                    })
                  }
                  step="0.05"
                  min="1"
                  max="2"
                  className="text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                ملاحظات (اختياري)
              </label>
              <Input
                value={newIngredient.notes}
                onChange={(e) =>
                  setNewIngredient({ ...newIngredient, notes: e.target.value })
                }
                placeholder="مثال: حسب الموسم"
                className="text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newIngredient.isOptional}
                  onChange={(e) =>
                    setNewIngredient({
                      ...newIngredient,
                      isOptional: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                مكون اختياري (اضافة)
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddIngredient} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-1" />
                ) : (
                  <Save className="h-4 w-4 ml-1" />
                )}
                حفظ
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                الغاء
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-4 w-4 ml-1" />
            اضافة مكون
          </Button>
        )}

        {/* Info note */}
        <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-surface-2)] rounded p-3 space-y-1">
          <p className="font-medium text-gray-500">كيف تعمل الوصفات:</p>
          <p>- عند طلب هذا الصنف، يتم خصم المكونات تلقائيا من المخزون</p>
          <p>- عند الغاء الطلب، يتم ارجاع المكونات للمخزون</p>
          <p>- معامل الهدر 1.1 يعني خصم 10% اضافي كهدر متوقع</p>
          <p>- المكونات الاختيارية (اضافات) لا تخصم تلقائيا</p>
        </div>
      </CardContent>
    </Card>
  );
}
