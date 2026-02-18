export interface InventoryItem {
  id: string;
  variantId?: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  category: string;
  expiryDate?: string | null;
  isPerishable?: boolean;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  variant_count?: number;
  total_on_hand?: number;
  total_available?: number;
  variants?: InventoryVariant[];
}

export interface InventoryVariant {
  id: string;
  inventory_item_id: string;
  sku: string;
  name: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  cost_price: number;
  price_modifier: number;
  low_stock_threshold: number;
  attributes?: Record<string, string>;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
}

export interface InventorySummary {
  total_items: string;
  total_variants: string;
  total_on_hand: string;
  total_reserved: string;
  total_available: string;
  inventory_value: string;
  low_stock_count: string;
  out_of_stock_count: string;
}

export interface Alert {
  id: string;
  variant_name: string;
  sku: string;
  alert_type: string;
  severity: string;
  message: string;
  status: string;
}

export interface ProductFormData {
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  category: string;
  expiryDate: string;
  isPerishable: boolean;
}

export interface VariantFormData {
  sku: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  lowStockThreshold: number;
  attributes: { color?: string; size?: string };
}

export interface WarehouseLocation {
  id: string;
  name: string;
  name_ar: string;
  address?: string;
  city?: string;
  is_default: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface StockByLocationItem {
  location_id: string;
  location_name: string;
  inventory_item_id?: string;
  item_name?: string;
  item_sku?: string;
  variant_id: string;
  variant_name: string;
  sku: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  bin_location?: string;
}

export interface LocationSummaryItem {
  location_id: string;
  location_name: string;
  location_name_ar: string;
  total_on_hand: number;
  total_reserved: number;
  total_available: number;
  variant_count: number;
  product_count?: number;
}

export interface ShrinkageData {
  totalShrinkage: number;
  shrinkageValue: number;
  shrinkageRate: number;
  items: Array<{
    sku: string;
    name: string;
    expected: number;
    actual: number;
    shrinkage: number;
    value: number;
    rate: number;
    recordedAt: string;
    reason?: string;
  }>;
}

export const initialFormData: ProductFormData = {
  sku: "",
  name: "",
  price: 0,
  costPrice: 0,
  stock: 0,
  lowStockThreshold: 5,
  category: "ملابس",
  expiryDate: "",
  isPerishable: false,
};

export const initialVariantFormData: VariantFormData = {
  sku: "",
  name: "",
  costPrice: 0,
  sellingPrice: 0,
  stock: 0,
  lowStockThreshold: 5,
  attributes: {},
};
