/**
 * Inventory Agent Task Type Definitions
 */

export interface StockCheckInput {
  merchantId: string;
  variantId?: string;
  sku?: string;
}

export interface StockUpdateInput {
  merchantId: string;
  variantId: string;
  quantity: number;
  movementType: "purchase" | "adjustment" | "return" | "transfer";
  reason?: string;
  referenceId?: string;
  createdBy?: string;
}

export interface ReserveStockInput {
  merchantId: string;
  variantId: string;
  quantity: number;
  orderId?: string;
  conversationId?: string;
  expiresInMinutes?: number;
}

export interface ConfirmReservationInput {
  merchantId: string;
  reservationId: string;
}

export interface ReleaseReservationInput {
  merchantId: string;
  reservationId: string;
  reason?: string;
}

export interface DeductStockInput {
  merchantId: string;
  variantId: string;
  quantity: number;
  orderId: string;
  reservationId?: string;
}

export interface InventoryReportInput {
  merchantId: string;
  reportType: "low_stock" | "movements" | "summary" | "alerts";
  dateRange?: { start: Date; end: Date };
}

// ============================================================================
// PREMIUM AI FEATURE INPUTS
// ============================================================================

export interface SubstitutionSuggestionInput {
  merchantId: string;
  variantId: string;
  maxSuggestions?: number;
  priceCapMultiplier?: number; // e.g., 1.5 = up to 150% of original price
}

export interface RestockRecommendationInput {
  merchantId: string;
  maxItems?: number;
  urgencyFilter?: "all" | "critical" | "high" | "medium";
}

export interface SupplierOrderDraftInput {
  merchantId: string;
  variantIds: string[];
  quantities?: Record<string, number>; // variantId -> quantity override
  supplierId?: string; // Filter to specific supplier
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface StockCheckOutput {
  found: boolean;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    itemName: string;
    quantityOnHand: number;
    quantityReserved: number;
    quantityAvailable: number;
    lowStockThreshold: number;
    isLowStock: boolean;
    attributes?: Record<string, string>;
  }>;
  lowStockCount?: number;
}

export interface StockUpdateOutput {
  action: string;
  variantId: string;
  quantityBefore: number;
  quantityAfter: number;
  change: number;
  movementType: string;
  isLowStock: boolean;
  lowStockThreshold: number;
}

export interface ReservationOutput {
  action: string;
  reservationId?: string;
  variantId: string;
  quantity: number;
  expiresAt?: string;
  reason?: string;
  requested?: number;
  available?: number;
}

export interface SubstitutionOutput {
  action: string;
  original: {
    id: string;
    sku: string;
    name: string;
    category: string;
    price: number;
    quantityAvailable: number;
  };
  substitutes: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    price: number;
    quantityAvailable: number;
    attributes?: Record<string, string>;
    // AI-enhanced fields
    rank?: number;
    similarityScore?: number;
    aiReasonAr?: string;
    aiReasonEn?: string;
  }>;
  totalFound: number;
  // AI-generated messages
  ai?: {
    customerMessageAr: string;
    merchantMessageAr: string;
    tokensUsed: number;
  };
}

export interface RestockOutput {
  action: string;
  totalItems: number;
  criticalCount: number;
  highCount: number;
  recommendations: Array<{
    variantId: string;
    sku: string;
    name: string;
    currentQuantity: number;
    recommendedQuantity: number;
    urgency: "low" | "medium" | "high" | "critical";
    reasoning: string;
    estimatedDaysUntilStockout?: number;
    averageDailySales?: number;
    supplierId?: string;
    supplierSku?: string;
    // AI-enhanced fields
    ai?: {
      explanationAr: string;
      explanationEn: string;
      suggestedActions: Array<{
        actionType: string;
        descriptionAr: string;
        descriptionEn: string;
      }>;
      supplierMessageDraftAr?: string;
    };
  }>;
  aiSummary?: string;
}

export interface SupplierOrderDraftOutput {
  action: string;
  totalItems: number;
  totalValue: number;
  supplierCount: number;
  orderDrafts: Array<{
    supplierId: string;
    items: Array<{
      variantId: string;
      sku: string;
      supplierSku: string;
      name: string;
      quantity: number;
      unitCost: number;
      totalCost: number;
    }>;
    subtotal: number;
    draftText: string;
  }>;
  // AI-generated message
  aiSupplierMessageAr?: string;
}
