export interface CatalogVariant {
  name: string;
  values: string[];
  priceModifier?: number;
}

export interface CatalogOption {
  name: string;
  price?: number;
}

export interface CatalogItem {
  id: string;
  merchantId: string;
  sku?: string;
  nameAr: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  category?: string;
  basePrice: number;
  minPrice?: number;
  variants: CatalogVariant[];
  options: CatalogOption[];
  tags: string[];
  isAvailable: boolean;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Aliases for convenience
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  imageUrl?: string;
  hasRecipe?: boolean;
  customerVisibleSku?: boolean;
  sourceLabel?: string;
}

export interface CreateCatalogItemInput {
  merchantId: string;
  sku?: string;
  nameAr: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  category?: string;
  basePrice: number;
  minPrice?: number;
  variants?: CatalogVariant[];
  options?: CatalogOption[];
  tags?: string[];
  isAvailable?: boolean;
}

export interface UpdateCatalogItemInput {
  sku?: string;
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  category?: string;
  basePrice?: number;
  minPrice?: number;
  variants?: CatalogVariant[];
  options?: CatalogOption[];
  tags?: string[];
  isAvailable?: boolean;
}
