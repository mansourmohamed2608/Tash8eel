/**
 * Inventory Agent Policies
 *
 * Business logic for inventory management decisions.
 * AI is used ONLY for recommendations/ranking/text - never for stock math.
 */

export interface LowStockPolicy {
  threshold: number;
  autoReorder: boolean;
  reorderQuantity?: number;
  notifyMerchant: boolean;
}

export interface ReservationPolicy {
  defaultExpirationMinutes: number;
  maxReservationsPerVariant: number;
  allowOversell: boolean;
}

export const DEFAULT_LOW_STOCK_POLICY: LowStockPolicy = {
  threshold: 5,
  autoReorder: false,
  notifyMerchant: true,
};

export const DEFAULT_RESERVATION_POLICY: ReservationPolicy = {
  defaultExpirationMinutes: 30,
  maxReservationsPerVariant: 10,
  allowOversell: false,
};

/**
 * Check if a variant should trigger a low stock alert
 */
export function shouldTriggerLowStockAlert(
  quantityAvailable: number,
  threshold: number,
  policy: LowStockPolicy = DEFAULT_LOW_STOCK_POLICY,
): boolean {
  return quantityAvailable <= (policy.threshold || threshold);
}

/**
 * Calculate reorder quantity based on policy
 */
export function calculateReorderQuantity(
  currentQuantity: number,
  reorderPoint: number,
  reorderQuantity: number | undefined,
  policy: LowStockPolicy = DEFAULT_LOW_STOCK_POLICY,
): number {
  if (!policy.autoReorder) {
    return 0;
  }
  return reorderQuantity || Math.max(reorderPoint * 2 - currentQuantity, 0);
}

/**
 * Validate if a reservation can be made
 */
export function canMakeReservation(
  quantityAvailable: number,
  requestedQuantity: number,
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): { allowed: boolean; reason?: string } {
  if (policy.allowOversell) {
    return { allowed: true };
  }

  if (requestedQuantity > quantityAvailable) {
    return {
      allowed: false,
      reason: `Insufficient stock. Available: ${quantityAvailable}, Requested: ${requestedQuantity}`,
    };
  }

  return { allowed: true };
}

/**
 * Calculate reservation expiration time
 */
export function calculateReservationExpiration(
  expiresInMinutes?: number,
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): Date {
  const minutes = expiresInMinutes || policy.defaultExpirationMinutes;
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ============================================================================
// PREMIUM AI FEATURE POLICIES
// ============================================================================

export interface SubstitutionCandidate {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  quantityAvailable: number;
  attributes?: Record<string, string>;
  similarityScore?: number;
  aiRecommendation?: string;
}

export interface RestockRecommendation {
  variantId: string;
  sku: string;
  name: string;
  currentQuantity: number;
  recommendedQuantity: number;
  urgency: "low" | "medium" | "high" | "critical";
  reasoning: string;
  estimatedDaysUntilStockout?: number;
  averageDailySales?: number;
}

/**
 * InventoryPolicies - Static helper class for deterministic inventory decisions
 */
export class InventoryPolicies {
  /**
   * Check if stock is at or below threshold
   */
  static isLowStock(quantity: number, threshold = 5): boolean {
    return quantity <= threshold;
  }

  /**
   * Check if completely out of stock
   */
  static isOutOfStock(quantity: number): boolean {
    return quantity <= 0;
  }

  /**
   * Check if reservation is possible
   */
  static canReserve(available: number, requested: number): boolean {
    return available >= requested;
  }

  /**
   * Check if reservation has expired
   */
  static isReservationExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() < Date.now();
  }

  /**
   * Calculate reorder quantity using EOQ-like formula
   *
   * @param averageDailySales - Average units sold per day
   * @param leadTimeDays - Days to receive new stock
   * @param safetyStockDays - Extra days of buffer stock
   */
  static calculateReorderQuantity(
    averageDailySales: number,
    leadTimeDays: number,
    safetyStockDays: number = 3,
  ): number {
    return Math.ceil((leadTimeDays + safetyStockDays) * averageDailySales);
  }

  /**
   * Get substitution candidates (DETERMINISTIC)
   *
   * Filters catalog to find suitable substitutes based on:
   * - Same category
   * - In stock
   * - Within price cap (e.g., 1.2x = 120% of original)
   * - Not the original item
   *
   * AI can later RANK these but never adds stock-changing logic.
   */
  static getSubstitutionCandidates<
    T extends {
      id: string;
      category: string;
      price: number;
      stock?: number;
      quantityAvailable?: number;
    },
  >(
    original: { id: string; category: string; price: number },
    catalog: T[],
    priceCapMultiplier: number = 1.5,
  ): T[] {
    const maxPrice = original.price * priceCapMultiplier;

    return catalog.filter((item) => {
      // Not the same item
      if (item.id === original.id) return false;

      // Same category
      if (item.category !== original.category) return false;

      // In stock
      const stock = item.stock ?? item.quantityAvailable ?? 0;
      if (stock <= 0) return false;

      // Within price cap
      if (item.price > maxPrice) return false;

      return true;
    });
  }

  /**
   * Calculate urgency level for restock
   */
  static calculateRestockUrgency(
    quantityAvailable: number,
    threshold: number,
    averageDailySales: number = 1,
  ): "low" | "medium" | "high" | "critical" {
    if (quantityAvailable <= 0) return "critical";

    const daysOfStock = quantityAvailable / Math.max(averageDailySales, 0.1);

    if (daysOfStock <= 1) return "critical";
    if (daysOfStock <= 3) return "high";
    if (quantityAvailable <= threshold) return "medium";
    return "low";
  }

  /**
   * Estimate days until stockout
   */
  static estimateDaysUntilStockout(
    quantityAvailable: number,
    averageDailySales: number,
  ): number | null {
    if (averageDailySales <= 0) return null;
    return Math.floor(quantityAvailable / averageDailySales);
  }
}
