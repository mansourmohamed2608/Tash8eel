"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, AlertBanner } from "@/components/ui/alerts";

import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  RefreshCw,
  ArrowUp,
  TrendingDown,
  Warehouse,
  Store,
} from "lucide-react";

import {
  InventoryQuickActions,
  BulkImportDialog,
  StockTransferDialog,
} from "@/components/inventory/enhanced-features";
import { LocationsTab } from "@/components/inventory/locations-tab";
import { ShrinkageTab } from "@/components/inventory/shrinkage-tab";
import { InventoryTable } from "@/components/inventory/inventory-table";
import {
  DeleteLocationDialog,
  StockUpdateDialog,
  DeleteProductDialog,
  ProductDialog,
  BarcodeScannerDialog,
  VariantDialog,
  DeleteVariantDialog,
} from "@/components/inventory/inventory-dialogs";
import type {
  InventoryItem,
  InventoryVariant,
  InventorySummary,
  Alert,
  ProductFormData,
  VariantFormData,
  WarehouseLocation,
  StockByLocationItem,
  LocationSummaryItem,
  ShrinkageData,
} from "@/components/inventory/types";
import {
  initialFormData,
  initialVariantFormData,
} from "@/components/inventory/types";
import { cn, formatCurrency, getStatusLabel } from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import portalApi from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useWebSocket, RealTimeEvent } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/use-role-access";
import {
  AiInsightsCard,
  generateInventoryInsights,
} from "@/components/ai/ai-insights-card";
import { SmartAnalysisButton } from "@/components/ai/smart-analysis-button";

export default function InventoryPage() {
  const { merchantId, apiKey, isDemo } = useMerchant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { canCreate, canEdit, canDelete, canImport, canExport, isReadOnly } =
    useRoleAccess("inventory");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [stockChange, setStockChange] = useState<{
    quantity: number;
    type: string;
    reason: string;
  }>({ quantity: 0, type: "adjustment", reason: "" });
  const [error, setError] = useState<string | null>(null);

  // Enhanced features states
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showStockTransfer, setShowStockTransfer] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [skuError, setSkuError] = useState<string>("");
  // Variant management states
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showAddVariantDialog, setShowAddVariantDialog] = useState(false);
  const [variantParentItem, setVariantParentItem] =
    useState<InventoryItem | null>(null);
  const [variantFormData, setVariantFormData] = useState<VariantFormData>(
    initialVariantFormData,
  );
  const [selectedVariant, setSelectedVariant] =
    useState<InventoryVariant | null>(null);
  const [deleteVariant, setDeleteVariant] = useState<InventoryVariant | null>(
    null,
  );
  const [editVariant, setEditVariant] = useState<InventoryVariant | null>(null);
  // Barcode scanner state
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  // Transfer dialog state
  const [transferVariant, setTransferVariant] =
    useState<InventoryVariant | null>(null);
  const [variantOptions, setVariantOptions] = useState<
    Array<{ id: string; name: string; sku: string; quantity_on_hand: number }>
  >([]);
  // Warehouse Locations
  const [warehouseLocations, setWarehouseLocations] = useState<
    WarehouseLocation[]
  >([]);
  const [stockByLocation, setStockByLocation] = useState<StockByLocationItem[]>(
    [],
  );
  const [locationSummary, setLocationSummary] = useState<LocationSummaryItem[]>(
    [],
  );
  const [newLocationName, setNewLocationName] = useState("");
  const [locationToDelete, setLocationToDelete] = useState<{
    id: string;
    name: string;
    isDefault?: boolean;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<
    "inventory" | "locations" | "shrinkage"
  >("inventory");
  // Shrinkage report state
  const [shrinkageData, setShrinkageData] = useState<ShrinkageData | null>(
    null,
  );
  const [loadingShrinkage, setLoadingShrinkage] = useState(false);
  const [shrinkageLoadError, setShrinkageLoadError] = useState<string | null>(
    null,
  );
  const itemsPerPage = 10;
  const { toast } = useToast();
  const { isConnected, on } = useWebSocket({
    autoConnect: true,
    subscribeToEvents: [
      RealTimeEvent.ORDER_CREATED,
      RealTimeEvent.ORDER_UPDATED,
      RealTimeEvent.ORDER_STATUS_CHANGED,
      RealTimeEvent.STOCK_UPDATED,
      RealTimeEvent.STOCK_LOW,
      RealTimeEvent.STOCK_OUT,
      RealTimeEvent.STATS_UPDATED,
    ],
  });

  const coerceNumber = (value: any): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const showError = (description: string) => {
    toast({ title: "خطأ", description, variant: "destructive" });
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return fallback;
  };

  const handleGenerateAiDesc = async (item: InventoryItem) => {
    toast({
      title: "جارٍ التوليد...",
      description: `يعمل الذكاء على وصف «${item.name}»`,
    });
    try {
      const result = await portalApi.generateProductDescription(item.id);
      if (result?.description) {
        await navigator.clipboard
          .writeText(result.description)
          .catch(() => null);
        toast({
          title: "✨ تم توليد الوصف",
          description:
            result.description.slice(0, 120) +
            (result.description.length > 120 ? "..." : ""),
        });
      }
    } catch {
      showError("تعذر توليد وصف لهذا المنتج");
    }
  };

  // Load data from API
  const loadData = useCallback(
    async (page = 1, search?: string) => {
      if (!merchantId || !apiKey) return;

      setError(null);
      try {
        // Load items, summary, alerts, and variants in parallel
        const [
          itemsResponse,
          summaryResponse,
          alertsResponse,
          variantsResponse,
        ] = await Promise.all([
          merchantApi.getInventoryItems(
            merchantId,
            apiKey,
            page,
            itemsPerPage,
            search,
          ),
          merchantApi.getInventorySummary(merchantId, apiKey),
          merchantApi.getInventoryAlerts(merchantId, apiKey),
          merchantApi.getVariants(merchantId, apiKey), // Get all variants to map variant IDs
        ]);

        // Group variants by inventory_item_id
        const variantsByItem = new Map<string, InventoryVariant[]>();
        const transferVariantMap = new Map<
          string,
          { id: string; name: string; sku: string; quantity_on_hand: number }
        >();
        (variantsResponse || []).forEach((v: any) => {
          const available = v.quantity_on_hand - (v.quantity_reserved || 0);
          const threshold = v.low_stock_threshold || v.effective_threshold || 5;
          let status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" = "IN_STOCK";
          if (available === 0) status = "OUT_OF_STOCK";
          else if (available <= threshold) status = "LOW_STOCK";

          const variant: InventoryVariant = {
            id: v.id,
            inventory_item_id: v.inventory_item_id,
            sku: v.sku,
            name: v.name,
            quantity_on_hand: v.quantity_on_hand,
            quantity_reserved: v.quantity_reserved || 0,
            quantity_available: available,
            cost_price: parseFloat(v.cost_price || "0"),
            price_modifier: parseFloat(v.price_modifier || "0"),
            low_stock_threshold: threshold,
            attributes: v.attributes,
            status,
          };

          if (!variantsByItem.has(v.inventory_item_id)) {
            variantsByItem.set(v.inventory_item_id, []);
          }
          variantsByItem.get(v.inventory_item_id)!.push(variant);

          transferVariantMap.set(v.id, {
            id: v.id,
            name: v.name || v.sku,
            sku: v.sku || "",
            quantity_on_hand: Number(v.quantity_on_hand || 0),
          });
        });
        setVariantOptions(Array.from(transferVariantMap.values()));

        const normalizedSearch = search?.trim().toLowerCase();

        // Transform API response to UI format
        const transformedItems: InventoryItem[] = itemsResponse.items.map(
          (item: any) => {
            const available = parseInt(item.total_available || "0");
            const threshold = item.low_stock_threshold || 5;
            const isPerishable =
              item.is_perishable === true || item.is_perishable === "true";
            let status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" = "IN_STOCK";
            if (available === 0) status = "OUT_OF_STOCK";
            else if (available <= threshold) status = "LOW_STOCK";

            const itemVariants = variantsByItem.get(item.id) || [];
            const firstVariant = itemVariants[0];
            const matchesItem = normalizedSearch
              ? [item.sku, item.name, item.description, item.category]
                  .filter(Boolean)
                  .some((value: string) =>
                    value.toLowerCase().includes(normalizedSearch),
                  )
              : true;

            const matchingVariants = normalizedSearch
              ? itemVariants.filter((variant) => {
                  const attributeText = variant.attributes
                    ? JSON.stringify(variant.attributes)
                    : "";
                  return [variant.sku, variant.name, attributeText]
                    .filter(Boolean)
                    .some((value) =>
                      value.toLowerCase().includes(normalizedSearch),
                    );
                })
              : itemVariants;

            const variantsForDisplay = normalizedSearch
              ? matchesItem
                ? matchingVariants.length > 0
                  ? matchingVariants
                  : itemVariants
                : matchingVariants
              : itemVariants;

            const firstVariantCost = coerceNumber(firstVariant?.cost_price);
            const firstVariantPriceModifier = coerceNumber(
              firstVariant?.price_modifier,
            );
            const itemCost = coerceNumber(item.cost_price);
            const effectiveCost = coerceNumber(item.effective_cost_price);
            const effectivePrice = coerceNumber(item.effective_price);
            let itemPrice = effectivePrice ?? coerceNumber(item.price) ?? 0;
            if (
              itemVariants.length === 1 &&
              itemPrice <= 0 &&
              (firstVariantPriceModifier ?? 0) > 0
            ) {
              // Some records store the final sale price directly in variant price_modifier.
              itemPrice = firstVariantPriceModifier as number;
            }

            return {
              id: item.id,
              variantId: firstVariant?.id, // Store the first variant ID for simple stock operations
              sku: item.sku,
              name: item.display_name || item.name || item.sku,
              description: item.display_description || item.description || "",
              price: itemPrice,
              costPrice: firstVariantCost ?? itemCost ?? effectiveCost ?? 0,
              stock: parseInt(item.total_on_hand || "0"),
              lowStockThreshold: threshold,
              category: item.category || "عام",
              expiryDate: item.expiry_date || null,
              isPerishable: isPerishable || !!item.expiry_date,
              status,
              variant_count: parseInt(item.variant_count || "0"),
              total_on_hand: parseInt(item.total_on_hand || "0"),
              total_available: available,
              variants: variantsForDisplay, // Include matching variants when searching
            };
          },
        );

        setInventory(transformedItems);
        setSummary(summaryResponse);
        setAlerts(alertsResponse || []);
        setTotalPages(itemsResponse.pagination.totalPages);
      } catch (err) {
        console.error("Failed to load inventory data:", err);
        setError(
          err instanceof Error ? err.message : "فشل في تحميل بيانات المخزون",
        );
      }
      setLoading(false);
      setRefreshing(false);
    },
    [merchantId, apiKey],
  );

  // Load warehouse locations
  const loadWarehouseLocations = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    try {
      const response = await merchantApi.getWarehouseLocations(
        merchantId,
        apiKey,
      );
      setWarehouseLocations(response?.locations || []);
    } catch (err) {
      console.error("Failed to load warehouse locations:", err);
    }
  }, [merchantId, apiKey]);

  // Load stock by location
  const loadStockByLocation = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    try {
      const response = await merchantApi.getStockByLocation(merchantId, apiKey);
      setStockByLocation(response?.stockByLocation || []);
      setLocationSummary(response?.locationSummary || []);
    } catch (err) {
      console.error("Failed to load stock by location:", err);
    }
  }, [merchantId, apiKey]);

  // Load shrinkage report from stock movements (last 30 days)
  const loadShrinkageData = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    setLoadingShrinkage(true);
    setShrinkageLoadError(null);
    try {
      const movements = await merchantApi.getStockMovements(
        merchantId,
        apiKey,
        30,
      );
      const parsed = (movements || [])
        .map((movement: any) => {
          const movementType = String(
            movement.movement_type || movement.movementType || "",
          ).toLowerCase();
          const quantity = Number(movement.quantity || 0);
          const isShrinkageType = [
            "shrinkage",
            "adjustment_out",
            "damage",
            "waste",
            "loss",
          ].includes(movementType);
          const isNegativeAdjustment =
            movementType === "adjustment" && quantity < 0;

          if (
            (!isShrinkageType && !isNegativeAdjustment) ||
            !Number.isFinite(quantity) ||
            quantity === 0
          ) {
            return null;
          }

          const metadata =
            typeof movement.metadata === "string"
              ? (() => {
                  try {
                    return JSON.parse(movement.metadata);
                  } catch {
                    return null;
                  }
                })()
              : movement.metadata;

          const quantityBeforeRaw = Number(
            movement.quantity_before ?? movement.quantityBefore ?? NaN,
          );
          const quantityAfterRaw = Number(
            movement.quantity_after ?? movement.quantityAfter ?? NaN,
          );
          const rawShrinkage = Math.abs(quantity);
          const expected = Number.isFinite(quantityBeforeRaw)
            ? quantityBeforeRaw
            : Number.isFinite(quantityAfterRaw)
              ? quantityAfterRaw + rawShrinkage
              : rawShrinkage;
          const actual = Number.isFinite(quantityAfterRaw)
            ? quantityAfterRaw
            : Math.max(expected - rawShrinkage, 0);
          const shrinkage = Math.max(expected - actual, rawShrinkage);
          const unitCost = Number(
            metadata?.unitCost ??
              metadata?.costPrice ??
              movement.unit_cost ??
              movement.cost_price ??
              0,
          );
          const safeUnitCost = Number.isFinite(unitCost) ? unitCost : 0;
          const value = shrinkage * safeUnitCost;
          const rate = expected > 0 ? (shrinkage / expected) * 100 : 0;

          return {
            sku: movement.sku || metadata?.sku || "N/A",
            name:
              movement.variant_name ||
              movement.name ||
              metadata?.name ||
              movement.sku ||
              "منتج",
            expected,
            actual,
            shrinkage,
            value,
            rate,
            recordedAt:
              movement.created_at ||
              movement.createdAt ||
              new Date().toISOString(),
            reason: movement.reason || metadata?.reason || undefined,
          };
        })
        .filter(Boolean) as ShrinkageData["items"];

      const totalShrinkage = parsed.reduce(
        (sum, item) => sum + item.shrinkage,
        0,
      );
      const totalExpected = parsed.reduce(
        (sum, item) => sum + item.expected,
        0,
      );
      const shrinkageValue = parsed.reduce((sum, item) => sum + item.value, 0);
      const shrinkageRate =
        totalExpected > 0 ? (totalShrinkage / totalExpected) * 100 : 0;

      setShrinkageData({
        totalShrinkage,
        shrinkageValue,
        shrinkageRate,
        items: parsed
          .sort((a, b) => b.value - a.value || b.shrinkage - a.shrinkage)
          .slice(0, 200),
      });
      setShrinkageLoadError(null);
    } catch (err) {
      console.error("Failed to load shrinkage report:", err);
      const message =
        err instanceof Error
          ? err.message
          : "تعذر جلب الحركات من قاعدة البيانات";
      setShrinkageLoadError(message);
      setShrinkageData({
        totalShrinkage: 0,
        shrinkageValue: 0,
        shrinkageRate: 0,
        items: [],
      });
    } finally {
      setLoadingShrinkage(false);
    }
  }, [merchantId, apiKey]);

  // Add new warehouse location
  const handleAddLocation = async () => {
    if (!merchantId || !apiKey || !newLocationName.trim()) return;
    try {
      await merchantApi.createWarehouseLocation(merchantId, apiKey, {
        name: newLocationName.trim(),
        nameAr: newLocationName.trim(),
        isDefault: warehouseLocations.length === 0,
      });
      setNewLocationName("");
      await loadWarehouseLocations();
      await loadStockByLocation();
      toast({ title: "تم", description: "تمت إضافة الموقع بنجاح" });
    } catch (err) {
      console.error("Failed to create warehouse location:", err);
      showError("فشل في إضافة الموقع");
    }
  };

  const handleRequestDeleteLocation = (location: {
    id: string;
    name?: string;
    name_ar?: string;
    is_default: boolean;
  }) => {
    const activeCount = warehouseLocations.filter(
      (l) => l.is_active !== false,
    ).length;
    if (location.is_default && activeCount <= 1) {
      showError("لا يمكن حذف الموقع الافتراضي الوحيد");
      return;
    }
    setLocationToDelete({
      id: location.id,
      name: location.name_ar || location.name || "الموقع",
      isDefault: location.is_default,
    });
  };

  const handleDeleteLocation = async () => {
    if (!merchantId || !apiKey || !locationToDelete) return;
    try {
      await merchantApi.deleteWarehouseLocation(
        merchantId,
        locationToDelete.id,
        apiKey,
      );
      setLocationToDelete(null);
      await loadWarehouseLocations();
      await loadStockByLocation();
      toast({ title: "تم", description: "تم حذف الموقع بنجاح" });
    } catch (err) {
      console.error("Failed to delete warehouse location:", err);
      showError("فشل في حذف الموقع");
    }
  };

  const handleTabChange = useCallback(
    (tab: "inventory" | "locations" | "shrinkage") => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "inventory") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    loadData();
    loadWarehouseLocations();
    loadStockByLocation();
  }, [loadData, loadWarehouseLocations, loadStockByLocation]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "locations" || tab === "shrinkage") {
      setActiveTab(tab);
      return;
    }
    setActiveTab("inventory");
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === "locations") {
      loadStockByLocation();
    }
    if (activeTab === "shrinkage") {
      loadShrinkageData();
    }
  }, [activeTab, loadShrinkageData, loadStockByLocation]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      loadData(1, searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadData(currentPage, searchQuery),
      loadStockByLocation(),
      activeTab === "shrinkage" ? loadShrinkageData() : Promise.resolve(),
    ]);
  };

  const triggerLiveRefresh = useCallback(() => {
    Promise.all([
      loadData(currentPage, searchQuery),
      loadStockByLocation(),
      activeTab === "shrinkage" ? loadShrinkageData() : Promise.resolve(),
    ]).catch((refreshError) => {
      console.error("Realtime inventory refresh failed:", refreshError);
    });
  }, [
    activeTab,
    currentPage,
    loadData,
    loadShrinkageData,
    loadStockByLocation,
    searchQuery,
  ]);

  const scheduleLiveRefresh = useCallback(() => {
    if (liveRefreshTimerRef.current) return;
    // Debounce websocket bursts to avoid UI thrashing.
    liveRefreshTimerRef.current = setTimeout(() => {
      liveRefreshTimerRef.current = null;
      triggerLiveRefresh();
    }, 1000);
  }, [triggerLiveRefresh]);

  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      on(RealTimeEvent.ORDER_CREATED, () => scheduleLiveRefresh()),
      on(RealTimeEvent.ORDER_UPDATED, () => scheduleLiveRefresh()),
      on(RealTimeEvent.ORDER_STATUS_CHANGED, () => scheduleLiveRefresh()),
      on(RealTimeEvent.STOCK_UPDATED, () => scheduleLiveRefresh()),
      on(RealTimeEvent.STOCK_LOW, () => scheduleLiveRefresh()),
      on(RealTimeEvent.STOCK_OUT, () => scheduleLiveRefresh()),
      on(RealTimeEvent.STATS_UPDATED, () => scheduleLiveRefresh()),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [isConnected, on, scheduleLiveRefresh]);

  useEffect(() => {
    if (isConnected) return;

    const interval = setInterval(() => {
      triggerLiveRefresh();
    }, 45000);

    return () => clearInterval(interval);
  }, [isConnected, triggerLiveRefresh]);

  useEffect(() => {
    return () => {
      if (liveRefreshTimerRef.current) {
        clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, []);

  // Barcode search function
  const handleBarcodeSearch = async () => {
    if (!barcodeInput.trim() || !merchantId || !apiKey) return;

    setBarcodeSearching(true);
    try {
      const result = await merchantApi.findByBarcode(
        merchantId,
        apiKey,
        barcodeInput.trim(),
      );

      if (result.found && result.data) {
        // Found the item - scroll to it or open edit dialog
        const foundSku = result.data.sku || result.data.item_sku;
        setSearchQuery(foundSku);
        setShowBarcodeDialog(false);
        setBarcodeInput("");
        // Refresh with the search
        await loadData(1, foundSku);
      } else {
        showError(
          "لم يتم العثور على منتج بهذا الرمز. جرّب البحث بالرمز أو الاسم في المخزون.",
        );
      }
    } catch (error) {
      console.error("Barcode search failed:", error);
      showError("فشل في البحث عن الباركود");
    } finally {
      setBarcodeSearching(false);
    }
  };

  // Stock transfer function
  const handleStockTransfer = async (data: {
    variantId?: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    reason: string;
  }) => {
    if (!merchantId || !apiKey) return;
    if (warehouseLocations.length === 0) {
      showError("يرجى إضافة موقع مخزني أولاً");
      return;
    }

    // Use variantId from data (selected in dialog) or from transferVariant
    const variantId = data.variantId || transferVariant?.id;
    if (!variantId) {
      showError("يرجى اختيار المنتج للنقل");
      return;
    }

    try {
      await merchantApi.transferStockBetweenLocations(merchantId, apiKey, {
        variantId,
        fromLocationId: data.fromLocationId,
        toLocationId: data.toLocationId,
        quantity: data.quantity,
        reason: data.reason,
      });

      setShowStockTransfer(false);
      setTransferVariant(null);
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
      toast({ title: "تم", description: "تم نقل المخزون بنجاح" });
    } catch (error) {
      console.error("Stock transfer failed:", error);
      showError(
        `فشل في نقل المخزون: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
      );
    }
  };

  // Get all variants for transfer dialog (deduplicated by ID)
  const allVariants =
    variantOptions.length > 0
      ? variantOptions
      : Array.from(
          inventory
            .reduce((acc, item) => {
              if (item.variants && item.variants.length > 0) {
                item.variants.forEach((variant) => {
                  acc.set(variant.id, {
                    id: variant.id,
                    name: variant.name,
                    sku: variant.sku,
                    quantity_on_hand: variant.quantity_on_hand,
                  });
                });
              } else if (item.variantId) {
                acc.set(item.variantId, {
                  id: item.variantId,
                  name: item.name,
                  sku: item.sku,
                  quantity_on_hand: item.stock,
                });
              }
              return acc;
            }, new Map<string, { id: string; name: string; sku: string; quantity_on_hand: number }>())
            .values(),
        );

  // Bulk import function (from CSV file)
  const handleBulkImport = async (file: File) => {
    if (!merchantId || !apiKey) return;

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        showError("الملف فارغ أو لا يحتوي على بيانات");
        return;
      }

      // Parse CSV - expecting: SKU, Name, Quantity, CostPrice, LowStockThreshold, Barcode, Location
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const skuIdx = headers.findIndex((h) => h === "رمز");
      const nameIdx = headers.findIndex(
        (h) => h === "name" || h === "اسم" || h === "الاسم",
      );
      const qtyIdx = headers.findIndex(
        (h) => h === "quantity" || h === "كمية" || h === "الكمية",
      );
      const priceIdx = headers.findIndex(
        (h) =>
          h === "cost" || h === "costprice" || h === "السعر" || h === "التكلفة",
      );
      const thresholdIdx = headers.findIndex(
        (h) => h === "threshold" || h === "lowstock" || h === "الحد",
      );
      const barcodeIdx = headers.findIndex(
        (h) => h === "barcode" || h === "باركود",
      );
      const locationIdx = headers.findIndex(
        (h) => h === "location" || h === "الموقع",
      );

      if (skuIdx === -1) {
        showError("يجب أن يحتوي الملف على عمود SKU أو رمز");
        return;
      }

      const items = lines
        .slice(1)
        .map((line) => {
          const cols = line
            .split(",")
            .map((c) => c.trim().replace(/^"|"$/g, ""));
          return {
            sku: cols[skuIdx] || "",
            name: nameIdx >= 0 ? cols[nameIdx] : undefined,
            quantity: qtyIdx >= 0 ? parseInt(cols[qtyIdx]) || 0 : undefined,
            costPrice:
              priceIdx >= 0
                ? parseFloat(cols[priceIdx]) || undefined
                : undefined,
            lowStockThreshold:
              thresholdIdx >= 0
                ? parseInt(cols[thresholdIdx]) || undefined
                : undefined,
            barcode: barcodeIdx >= 0 ? cols[barcodeIdx] : undefined,
            location: locationIdx >= 0 ? cols[locationIdx] : undefined,
          };
        })
        .filter((item) => item.sku);

      if (items.length === 0) {
        showError("لم يتم العثور على منتجات صالحة في الملف");
        return;
      }

      const result = await merchantApi.bulkImportInventory(
        merchantId,
        apiKey,
        items,
        true,
      );

      toast({
        title: "تم الاستيراد",
        description: `تم إنشاء: ${result.summary.created} | تم تحديث: ${result.summary.updated} | أخطاء: ${result.summary.errors}`,
      });

      setShowBulkImport(false);
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Bulk import failed:", error);
      showError(
        `فشل في استيراد الملف: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
      );
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadData(page, searchQuery);
  };

  const handleStockUpdate = async () => {
    if (!selectedItem || stockChange.quantity === 0) return;

    // Need variant ID for stock operations, not item ID
    if (!selectedItem.variantId) {
      showError("لا يوجد متغير لهذا المنتج. يرجى إعادة إضافة المنتج.");
      return;
    }

    try {
      await merchantApi.updateStock(
        merchantId,
        selectedItem.variantId, // Use variant ID, not item ID!
        apiKey,
        {
          quantity: stockChange.quantity,
          movementType: stockChange.type as any,
          reason: stockChange.reason,
        },
      );
      setShowStockDialog(false);
      setSelectedItem(null);
      setStockChange({ quantity: 0, type: "adjustment", reason: "" });
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Failed to update stock:", error);
      showError("فشل في تحديث المخزون");
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await merchantApi.deleteInventoryItem(merchantId, deleteItem.id, apiKey);
      setDeleteItem(null); // Close popup first
      await loadData(currentPage, searchQuery); // Then refresh data
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Failed to delete item:", error);
      showError("فشل في حذف المنتج");
    }
  };

  // Handle save product (add or edit)
  const handleSaveProduct = async () => {
    if (!formData.sku || !formData.name) {
      showError("الرجاء إدخال الرمز والاسم");
      return;
    }

    // Check for duplicate SKU (only for new items or if SKU changed during edit)
    const isDuplicateSku = inventory.some(
      (item) =>
        item.sku.toLowerCase() === formData.sku.toLowerCase() &&
        (!editItem || item.id !== editItem.id),
    );

    if (isDuplicateSku) {
      setSkuError("رمز المنتج (SKU) موجود مسبقاً");
      return;
    }

    setSkuError(""); // Clear any previous error
    setSaving(true);
    try {
      if (editItem) {
        // Update both item AND variant
        // First update the inventory item
        await merchantApi.updateInventoryItem(merchantId, editItem.id, apiKey, {
          sku: formData.sku,
          name: formData.name,
          lowStockThreshold: formData.lowStockThreshold,
          costPrice: formData.costPrice,
          price: formData.price,
          category: formData.category,
          expiryDate: formData.expiryDate || null,
          isPerishable: !!formData.isPerishable || !!formData.expiryDate,
        });

        // Then update the variant if it exists
        if (editItem.variantId) {
          await merchantApi.updateVariant(
            merchantId,
            editItem.variantId,
            apiKey,
            {
              sku: formData.sku,
              name: formData.name,
              costPrice: formData.costPrice,
              priceModifier: formData.price,
              lowStockThreshold: formData.lowStockThreshold,
            },
          );
        }
      } else {
        // Create item with all fields
        const item = await merchantApi.createInventoryItem(merchantId, apiKey, {
          sku: formData.sku,
          name: formData.name, // Include name in item creation
          lowStockThreshold: formData.lowStockThreshold,
          costPrice: formData.costPrice,
          price: formData.price,
          category: formData.category,
          expiryDate: formData.expiryDate || null,
          isPerishable: !!formData.isPerishable || !!formData.expiryDate,
        });
        // Then create variant with stock
        await merchantApi.createVariant(merchantId, apiKey, {
          inventoryItemId: item.id,
          sku: formData.sku,
          name: formData.name,
          quantityOnHand: formData.stock,
          costPrice: formData.costPrice,
          priceModifier: formData.price,
          lowStockThreshold: formData.lowStockThreshold,
        });
      }

      setShowAddDialog(false);
      setEditItem(null);
      setFormData(initialFormData);
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Failed to save product:", error);
      showError(
        error instanceof Error
          ? error.message
          : "فشل في حفظ المنتج. تأكد من تشغيل الخادم.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Reset form when opening add dialog
  const openAddDialog = () => {
    setFormData(initialFormData);
    setSkuError("");
    setShowAddDialog(true);
  };

  // Populate form when editing
  const openEditDialog = (item: InventoryItem) => {
    setFormData({
      sku: item.sku,
      name: item.name,
      price: item.price, // Selling price
      costPrice: item.costPrice, // Cost price
      stock: item.stock,
      lowStockThreshold: item.lowStockThreshold,
      category: item.category || "ملابس",
      expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : "",
      isPerishable: !!item.isPerishable || !!item.expiryDate,
    });
    setSkuError("");
    setEditItem(item);
  };

  // Toggle expanded state for showing variants
  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Open add variant dialog
  const openAddVariantDialog = (item: InventoryItem) => {
    setVariantParentItem(item);
    setVariantFormData({
      ...initialVariantFormData,
      sku: `${item.sku}-`, // Pre-fill with parent SKU prefix
    });
    setShowAddVariantDialog(true);
  };

  // Handle save variant
  const handleSaveVariant = async () => {
    if (!variantParentItem || !variantFormData.sku || !variantFormData.name) {
      showError("الرجاء إدخال الرمز والاسم للمتغير");
      return;
    }

    setSaving(true);
    try {
      await merchantApi.createVariant(merchantId, apiKey, {
        inventoryItemId: variantParentItem.id,
        sku: variantFormData.sku,
        name: variantFormData.name,
        quantityOnHand: variantFormData.stock,
        costPrice: variantFormData.costPrice,
        priceModifier: variantFormData.sellingPrice,
        lowStockThreshold: variantFormData.lowStockThreshold,
        attributes: variantFormData.attributes,
      });

      setShowAddVariantDialog(false);
      setVariantParentItem(null);
      setVariantFormData(initialVariantFormData);
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Failed to save variant:", error);
      showError(
        error instanceof Error
          ? error.message
          : "فشل في حفظ المتغير. تأكد من أن الرمز فريد.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Open edit variant dialog
  const openEditVariantDialog = (
    variant: InventoryVariant,
    parentItem: InventoryItem,
  ) => {
    setEditVariant(variant);
    setVariantParentItem(parentItem);
    setVariantFormData({
      sku: variant.sku,
      name: variant.name,
      costPrice: variant.cost_price,
      sellingPrice: variant.price_modifier || 0,
      stock: variant.quantity_on_hand,
      lowStockThreshold: variant.low_stock_threshold,
      attributes: variant.attributes || {},
    });
  };

  // Handle edit variant save
  const handleEditVariant = async () => {
    if (!editVariant) return;

    setSaving(true);
    try {
      await merchantApi.updateVariant(merchantId, editVariant.id, apiKey, {
        sku: variantFormData.sku,
        name: variantFormData.name,
        costPrice: variantFormData.costPrice,
        priceModifier: variantFormData.sellingPrice,
        lowStockThreshold: variantFormData.lowStockThreshold,
        attributes: variantFormData.attributes,
      });

      setEditVariant(null);
      setVariantParentItem(null);
      setVariantFormData(initialVariantFormData);
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Failed to update variant:", error);
      showError(
        error instanceof Error ? error.message : "فشل في تحديث المتغير",
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle variant stock update
  const handleVariantStockUpdate = async () => {
    if (!selectedVariant || stockChange.quantity === 0) return;

    try {
      await merchantApi.updateStock(merchantId, selectedVariant.id, apiKey, {
        quantity: stockChange.quantity,
        movementType: stockChange.type as any,
        reason: stockChange.reason,
      });
      setShowStockDialog(false);
      setSelectedVariant(null);
      setSelectedItem(null);
      setStockChange({ quantity: 0, type: "adjustment", reason: "" });
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Failed to update variant stock:", error);
      showError(
        error instanceof Error ? error.message : "فشل في تحديث مخزون المتغير",
      );
    }
  };

  // Handle delete variant
  const handleDeleteVariant = async () => {
    if (!deleteVariant) return;

    try {
      await merchantApi.deleteVariant(merchantId, deleteVariant.id, apiKey);
      setDeleteVariant(null);
      await loadData(currentPage, searchQuery);
      await loadStockByLocation();
      if (activeTab === "shrinkage") {
        await loadShrinkageData();
      }
    } catch (error) {
      console.error("Failed to delete variant:", error);
      showError("فشل في حذف المتغير");
    }
  };

  // Check both products AND variants for stock status
  const lowStockItems = inventory.filter((item) => item.status === "LOW_STOCK");
  const outOfStockItems = inventory.filter(
    (item) => item.status === "OUT_OF_STOCK",
  );

  // Also check variants for low/out of stock
  const lowStockVariants: Array<{
    name: string;
    sku: string;
    parentName: string;
  }> = [];
  const outOfStockVariants: Array<{
    name: string;
    sku: string;
    parentName: string;
  }> = [];

  inventory.forEach((item) => {
    if (item.variants && item.variants.length > 0) {
      item.variants.forEach((variant) => {
        if (variant.status === "LOW_STOCK") {
          lowStockVariants.push({
            name: variant.name,
            sku: variant.sku,
            parentName: item.name,
          });
        } else if (variant.status === "OUT_OF_STOCK") {
          outOfStockVariants.push({
            name: variant.name,
            sku: variant.sku,
            parentName: item.name,
          });
        }
      });
    }
  });

  // Get unique categories from inventory with counts
  const categoryData = inventory.reduce(
    (acc, item) => {
      const cat = item.category || "عام";
      if (!acc[cat]) acc[cat] = 0;
      acc[cat]++;
      return acc;
    },
    {} as Record<string, number>,
  );

  const categories = Object.entries(categoryData).map(([name, count]) => ({
    name,
    count,
  }));

  const safeInventoryValue = Math.max(
    0,
    Number(summary?.inventory_value ?? 0) || 0,
  );

  const toStockStatus = useCallback(
    (available: number, threshold: number): InventoryItem["status"] => {
      if (available <= 0) return "OUT_OF_STOCK";
      if (available <= threshold) return "LOW_STOCK";
      return "IN_STOCK";
    },
    [],
  );

  const locationOptions = useMemo(() => {
    const unique = new Map<string, string>();

    warehouseLocations.forEach((location) => {
      if (!location?.id || location.is_active === false) return;
      unique.set(location.id, location.name_ar || location.name || "موقع");
    });

    stockByLocation.forEach((stock) => {
      if (!stock?.location_id || unique.has(stock.location_id)) return;
      unique.set(stock.location_id, stock.location_name || "موقع");
    });

    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [warehouseLocations, stockByLocation]);

  const filteredInventory = useMemo(() => {
    const categoryScoped =
      categoryFilter === "all" || categoryFilter === null
        ? inventory
        : inventory.filter(
            (item) => (item.category || "عام") === categoryFilter,
          );

    if (locationFilter === "all") {
      return categoryScoped;
    }

    const variantStockAtLocation = new Map<
      string,
      { onHand: number; reserved: number; available: number }
    >();
    stockByLocation.forEach((stock) => {
      if (stock.location_id !== locationFilter || !stock.variant_id) return;
      const prev = variantStockAtLocation.get(stock.variant_id) || {
        onHand: 0,
        reserved: 0,
        available: 0,
      };
      prev.onHand += Number(stock.quantity_on_hand || 0);
      prev.reserved += Number(stock.quantity_reserved || 0);
      prev.available += Number(stock.quantity_available || 0);
      variantStockAtLocation.set(stock.variant_id, prev);
    });

    return categoryScoped
      .map((item) => {
        if (item.variants && item.variants.length > 0) {
          const variantsForLocation = item.variants
            .filter((variant) => variantStockAtLocation.has(variant.id))
            .map((variant) => {
              const stock = variantStockAtLocation.get(variant.id)!;
              const threshold = Number(
                variant.low_stock_threshold || item.lowStockThreshold || 5,
              );
              return {
                ...variant,
                quantity_on_hand: stock.onHand,
                quantity_reserved: stock.reserved,
                quantity_available: stock.available,
                status: toStockStatus(stock.available, threshold),
              };
            });

          if (variantsForLocation.length === 0) return null;

          const totalOnHand = variantsForLocation.reduce(
            (sum, variant) => sum + (Number(variant.quantity_on_hand) || 0),
            0,
          );
          const totalAvailable = variantsForLocation.reduce(
            (sum, variant) => sum + (Number(variant.quantity_available) || 0),
            0,
          );
          const threshold = Number(item.lowStockThreshold || 5);

          return {
            ...item,
            stock: totalOnHand,
            total_on_hand: totalOnHand,
            total_available: totalAvailable,
            variant_count: variantsForLocation.length,
            variants: variantsForLocation,
            status: toStockStatus(totalAvailable, threshold),
          };
        }

        if (!item.variantId || !variantStockAtLocation.has(item.variantId)) {
          return null;
        }

        const stock = variantStockAtLocation.get(item.variantId)!;
        const threshold = Number(item.lowStockThreshold || 5);

        return {
          ...item,
          stock: stock.onHand,
          total_on_hand: stock.onHand,
          total_available: stock.available,
          status: toStockStatus(stock.available, threshold),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [
    categoryFilter,
    inventory,
    locationFilter,
    stockByLocation,
    toStockStatus,
  ]);

  if (loading) {
    return (
      <div>
        <PageHeader title="المخزون" />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="المخزون"
        description="إدارة منتجات وكميات المخزون"
        actions={
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={async () => {
                  if (!merchantId || !apiKey) return;
                  try {
                    const result = await merchantApi.pushInventoryToCatalog(
                      merchantId,
                      apiKey,
                    );
                    toast({
                      title: "تم",
                      description:
                        result.created > 0
                          ? `تم إرسال ${result.created} منتج للقائمة`
                          : result.updated > 0
                            ? `تم تحديث ${result.updated} منتج`
                            : "جميع المنتجات موجودة في القائمة",
                    });
                  } catch (err) {
                    toast({
                      title: "خطأ",
                      description: getErrorMessage(
                        err,
                        "فشل إرسال المنتجات للقائمة",
                      ),
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Store className="h-4 w-4" />
                إرسال للقائمة
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={async () => {
                  if (!merchantId || !apiKey) return;
                  try {
                    const result = await merchantApi.pullCatalogToInventory(
                      merchantId,
                      apiKey,
                    );
                    const parts: string[] = [];
                    if (result.created > 0)
                      parts.push(
                        `تم استيراد ${result.created} منتج من القائمة`,
                      );
                    if ((result as any).variantsCreated > 0)
                      parts.push(`${(result as any).variantsCreated} متغير`);
                    if (result.linked > 0)
                      parts.push(`تم ربط ${result.linked}`);
                    toast({
                      title: "تم",
                      description:
                        parts.length > 0
                          ? parts.join(" + ")
                          : "جميع منتجات القائمة موجودة بالفعل",
                    });
                    handleRefresh();
                  } catch (err) {
                    toast({
                      title: "خطأ",
                      description: getErrorMessage(
                        err,
                        "فشل استيراد المنتجات من القائمة",
                      ),
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Package className="h-4 w-4" />
                استيراد من القائمة
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
              تحديث
            </Button>
            {canCreate && (
              <Button size="sm" onClick={openAddDialog}>
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Button>
            )}
          </div>
        }
      />
      <AiInsightsCard
        title="تنبيهات المخزون"
        insights={generateInventoryInsights({
          totalProducts: parseInt(summary?.total_items ?? "0"),
          lowStockCount: parseInt(summary?.low_stock_count ?? "0"),
          outOfStockCount: parseInt(summary?.out_of_stock_count ?? "0"),
          totalValue: safeInventoryValue,
        })}
      />
      {/* Tab Navigation */}
      <div className="flex border-b">
        <button
          onClick={() => handleTabChange("inventory")}
          className={cn(
            "px-4 py-2 font-medium text-sm border-b-2 -mb-px",
            activeTab === "inventory"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Package className="h-4 w-4 inline-block ml-2" />
          المنتجات
        </button>
        <button
          onClick={() => handleTabChange("locations")}
          className={cn(
            "px-4 py-2 font-medium text-sm border-b-2 -mb-px",
            activeTab === "locations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Warehouse className="h-4 w-4 inline-block ml-2" />
          المواقع ({warehouseLocations.length})
        </button>
        <button
          onClick={() => handleTabChange("shrinkage")}
          className={cn(
            "px-4 py-2 font-medium text-sm border-b-2 -mb-px",
            activeTab === "shrinkage"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <TrendingDown className="h-4 w-4 inline-block ml-2" />
          تقرير الفاقد
        </button>
      </div>
      {/* Locations Tab */}
      {activeTab === "locations" && (
        <LocationsTab
          warehouseLocations={warehouseLocations}
          stockByLocation={stockByLocation}
          locationSummary={locationSummary}
          newLocationName={newLocationName}
          onNewLocationNameChange={setNewLocationName}
          onAddLocation={handleAddLocation}
          onDeleteLocation={handleRequestDeleteLocation}
          canCreate={canCreate}
          canDelete={canDelete}
          coerceNumber={coerceNumber}
        />
      )}
      {/* Shrinkage Report Tab */}
      {activeTab === "shrinkage" && (
        <ShrinkageTab
          shrinkageData={shrinkageData}
          loadingShrinkage={loadingShrinkage}
          loadError={shrinkageLoadError}
        />
      )}
      {/* Inventory Tab */}
      {activeTab === "inventory" && (
        <>
          {/* Quick Actions */}
          <InventoryQuickActions
            onAddProduct={openAddDialog}
            onBulkImport={() => setShowBulkImport(true)}
            onExport={async () => {
              // Export with variants functionality
              const headers = [
                "الرمز",
                "الاسم",
                "نوع",
                "سعر التكلفة",
                "سعر البيع",
                "الكمية",
                "الموقع",
                "الحالة",
                "الخصائص",
              ];
              const rows: (string | number)[][] = [];

              inventory.forEach((item) => {
                // If item has multiple variants, export each variant
                if (item.variants && item.variants.length > 0) {
                  item.variants.forEach((variant) => {
                    const attrs = variant.attributes
                      ? Object.entries(variant.attributes)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")
                      : "";
                    rows.push([
                      variant.sku,
                      variant.name,
                      "متغير",
                      variant.cost_price || 0,
                      variant.price_modifier || 0,
                      variant.quantity_on_hand,
                      item.category || "عام",
                      getStatusLabel(variant.status),
                      attrs,
                    ]);
                  });
                } else {
                  // Single variant item
                  rows.push([
                    item.sku,
                    item.name,
                    "منتج",
                    item.costPrice || 0,
                    item.price || 0,
                    item.stock,
                    item.category || "عام",
                    getStatusLabel(item.status),
                    "",
                  ]);
                }
              });

              const csvContent = [
                headers.join(","),
                ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
              ].join("\n");
              const blob = new Blob(["\ufeff" + csvContent], {
                type: "text/csv;charset=utf-8;",
              });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`;
              link.click();
            }}
            onScanBarcode={() => setShowBarcodeDialog(true)}
            onStockCount={() => {
              handleTabChange("shrinkage");
            }}
            canCreate={canCreate}
            canImport={canImport}
            canExport={canExport}
          />

          {/* Error Banner */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="flex items-center gap-3 p-6">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <div>
                  <p className="font-medium text-red-800">
                    خطأ في تحميل البيانات
                  </p>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  className="mr-auto"
                >
                  إعادة المحاولة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Alerts */}
          {(lowStockItems.length > 0 ||
            outOfStockItems.length > 0 ||
            lowStockVariants.length > 0 ||
            outOfStockVariants.length > 0 ||
            alerts.length > 0) && (
            <div className="space-y-3">
              {/* Out of stock products */}
              {outOfStockItems.length > 0 && (
                <AlertBanner
                  type="error"
                  title="منتجات نفدت"
                  message={`${outOfStockItems.length} منتج نفد من المخزون: ${outOfStockItems.map((i) => i.name).join("، ")}`}
                />
              )}
              {/* Out of stock variants */}
              {outOfStockVariants.length > 0 && (
                <AlertBanner
                  type="error"
                  title="متغيرات نفدت"
                  message={`${outOfStockVariants.length} متغير نفد من المخزون: ${outOfStockVariants.map((v) => `${v.name} (${v.parentName})`).join("، ")}`}
                />
              )}
              {/* Low stock products */}
              {lowStockItems.length > 0 && (
                <AlertBanner
                  type="warning"
                  title="مخزون منخفض"
                  message={`${lowStockItems.length} منتج على وشك النفاد: ${lowStockItems.map((i) => i.name).join("، ")}`}
                />
              )}
              {/* Low stock variants */}
              {lowStockVariants.length > 0 && (
                <AlertBanner
                  type="warning"
                  title="متغيرات على وشك النفاد"
                  message={`${lowStockVariants.length} متغير على وشك النفاد: ${lowStockVariants.map((v) => `${v.name} (${v.parentName})`).join("، ")}`}
                />
              )}
              {alerts.filter((a) => a.severity === "critical").length > 0 && (
                <AlertBanner
                  type="error"
                  title="تنبيهات حرجة"
                  message={alerts
                    .filter((a) => a.severity === "critical")
                    .map((a) => a.message)
                    .join(" â€¢ ")}
                />
              )}
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      إجمالي المنتجات
                    </p>
                    <p className="text-2xl font-bold">
                      {summary?.total_items || inventory.length}
                    </p>
                  </div>
                  <Package className="h-8 w-8 text-primary-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      الكمية المتاحة
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {summary?.total_available || "-"}
                    </p>
                  </div>
                  <ArrowUp className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">مخزون منخفض</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {summary?.low_stock_count || lowStockItems.length}
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">نفد المخزون</p>
                    <p className="text-2xl font-bold text-red-600">
                      {summary?.out_of_stock_count || outOfStockItems.length}
                    </p>
                  </div>
                  <TrendingDown className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Inventory Value Card */}
          {summary && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      قيمة المخزون الإجمالية
                    </p>
                    <p className="text-3xl font-bold">
                      {formatCurrency(safeInventoryValue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      محجوز: {summary.total_reserved || "0"} وحدة
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {summary.total_variants || "0"} متغير
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Inventory Agent - GPT Deep Analysis */}
          <SmartAnalysisButton context="inventory" />

          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs text-muted-foreground">بحث</p>
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="بحث بالرمز أو الاسم (يشمل المتغيرات)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pr-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">حسب الموقع</p>
                    <Select
                      value={locationFilter}
                      onValueChange={setLocationFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="كل المواقع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل المواقع</SelectItem>
                        {locationOptions.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    تصفية حسب الفئة
                  </p>
                  <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
                    <Button
                      type="button"
                      variant={categoryFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCategoryFilter("all")}
                      className={cn(
                        "rounded-full whitespace-nowrap",
                        categoryFilter === "all" && "shadow-sm",
                      )}
                    >
                      الكل
                    </Button>
                    {categories.map((category) => (
                      <Button
                        type="button"
                        key={category.name}
                        variant={
                          categoryFilter === category.name
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => setCategoryFilter(category.name)}
                        className={cn(
                          "rounded-full whitespace-nowrap",
                          categoryFilter === category.name && "shadow-sm",
                        )}
                      >
                        {category.name} ({category.count})
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  النتائج: {filteredInventory.length} منتج
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Table */}
          <InventoryTable
            inventory={filteredInventory}
            expandedItems={expandedItems}
            currentPage={currentPage}
            totalPages={totalPages}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            onToggleExpanded={toggleExpanded}
            onAddProduct={openAddDialog}
            onEditProduct={openEditDialog}
            onDeleteProduct={setDeleteItem}
            onStockUpdate={(item) => {
              setSelectedItem(item);
              setShowStockDialog(true);
            }}
            onAddVariant={openAddVariantDialog}
            onEditVariant={openEditVariantDialog}
            onVariantStockUpdate={(variant, item) => {
              setSelectedVariant(variant);
              setSelectedItem(item);
              setShowStockDialog(true);
            }}
            onDeleteVariant={setDeleteVariant}
            onPageChange={handlePageChange}
            onGenerateAiDesc={handleGenerateAiDesc}
          />
        </>
      )}{" "}
      {/* End of Inventory Tab */}
      {/*  Dialogs  */}
      <DeleteLocationDialog
        locationToDelete={locationToDelete}
        onClose={() => setLocationToDelete(null)}
        onConfirm={handleDeleteLocation}
      />
      <StockTransferDialog
        open={showStockTransfer}
        onOpenChange={(open) => {
          setShowStockTransfer(open);
          if (!open) {
            setTransferVariant(null);
          }
        }}
        onTransfer={handleStockTransfer}
        itemName={transferVariant?.name}
        currentStock={transferVariant?.quantity_on_hand}
        locations={warehouseLocations.map((location) => ({
          id: location.id,
          name: location.name,
          name_ar: location.name_ar,
        }))}
        variants={allVariants}
        selectedVariantId={transferVariant?.id}
      />
      <StockUpdateDialog
        open={showStockDialog}
        onClose={() => {
          setShowStockDialog(false);
          setSelectedVariant(null);
        }}
        selectedItem={selectedItem}
        selectedVariant={selectedVariant}
        stockChange={stockChange}
        onStockChangeUpdate={(change) =>
          setStockChange((prev) => ({ ...prev, ...change }))
        }
        onConfirm={
          selectedVariant ? handleVariantStockUpdate : handleStockUpdate
        }
        canEdit={canEdit}
      />
      <DeleteProductDialog
        deleteItem={deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
      />
      <ProductDialog
        open={showAddDialog || !!editItem}
        editItem={editItem}
        formData={formData}
        skuError={skuError}
        saving={saving}
        canCreate={canCreate}
        canEdit={canEdit}
        onFormChange={(data) => setFormData((prev) => ({ ...prev, ...data }))}
        onSkuErrorClear={() => setSkuError("")}
        onClose={() => {
          setShowAddDialog(false);
          setEditItem(null);
          setFormData(initialFormData);
          setSkuError("");
        }}
        onSave={handleSaveProduct}
      />
      <BarcodeScannerDialog
        open={showBarcodeDialog}
        onClose={() => setShowBarcodeDialog(false)}
        barcodeInput={barcodeInput}
        onBarcodeInputChange={setBarcodeInput}
        onSearch={handleBarcodeSearch}
        searching={barcodeSearching}
      />
      <VariantDialog
        open={showAddVariantDialog}
        isEdit={false}
        parentItem={variantParentItem}
        formData={variantFormData}
        editVariant={null}
        saving={saving}
        canCreate={canCreate}
        canEdit={canEdit}
        onFormChange={(data) =>
          setVariantFormData((prev) => ({ ...prev, ...data }))
        }
        onAttributeChange={(key, value) =>
          setVariantFormData((prev) => ({
            ...prev,
            attributes: { ...prev.attributes, [key]: value },
          }))
        }
        onClose={() => {
          setShowAddVariantDialog(false);
          setVariantParentItem(null);
          setVariantFormData(initialVariantFormData);
        }}
        onSave={handleSaveVariant}
      />
      <VariantDialog
        open={!!editVariant}
        isEdit={true}
        parentItem={variantParentItem}
        formData={variantFormData}
        editVariant={editVariant}
        saving={saving}
        canCreate={canCreate}
        canEdit={canEdit}
        onFormChange={(data) =>
          setVariantFormData((prev) => ({ ...prev, ...data }))
        }
        onAttributeChange={(key, value) =>
          setVariantFormData((prev) => ({
            ...prev,
            attributes: { ...prev.attributes, [key]: value },
          }))
        }
        onClose={() => {
          setEditVariant(null);
          setVariantParentItem(null);
          setVariantFormData(initialVariantFormData);
        }}
        onSave={handleEditVariant}
      />
      <DeleteVariantDialog
        deleteVariant={deleteVariant}
        onClose={() => setDeleteVariant(null)}
        onConfirm={handleDeleteVariant}
      />
    </div>
  );
}
