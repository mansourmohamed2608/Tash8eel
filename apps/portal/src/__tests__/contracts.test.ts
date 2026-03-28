/**
 * Contract tests: Portal ↔ API response shape validation
 *
 * These tests act as a "schema contract" between the portal (consumer) and
 * the NestJS API (provider). They:
 *
 *   1. Define Zod schemas that mirror what the portal's pages and hooks
 *      ACTUALLY consume from API JSON responses.
 *   2. Assert that the MSW fixture data satisfies each schema.
 *   3. Catch breaking API changes at test time, before they reach production.
 *
 * When the API changes a response shape:
 *   - If the change is additive (new optional field), tests pass - update
 *     the schema at your convenience.
 *   - If the change removes or renames a required field, tests FAIL here -
 *     you must update both the schema and the portal consumer before merging.
 *
 * How to add a new contract:
 *   1. Define a Zod schema for the API endpoint's response shape.
 *   2. Add a test that parses the corresponding MSW fixture with that schema.
 *   3. Ensure the schema matches what the portal page/hook actually reads.
 */

import { z } from "zod";
import { describe, test, expect } from "vitest";
import { fixtures } from "../test/msw/handlers";

// ============================================================================
// Shared sub-schemas
// ============================================================================

const OrderStatusSchema = z.enum([
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "FAILED",
]);

const CartItemSchema = z.object({
  sku: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative().optional(),
});

const AddressSchema = z.object({
  street: z.string().optional(),
  area: z.string().optional(),
  city: z.string().optional(),
  building: z.string().optional(),
  landmark: z.string().optional(),
  postalCode: z.string().optional(),
});

const ShipmentSchema = z.object({
  id: z.string(),
  trackingId: z.string().optional(),
  courier: z.string().optional(),
  status: z.string(),
  estimatedDelivery: z.union([z.string(), z.date()]).optional(),
  statusHistory: z.array(z.unknown()),
});

// ============================================================================
// Contract: GET /api/v1/merchants/:id/orders → OrderListResponseSchema
// ============================================================================

/**
 * Single order object as returned by the API and consumed by:
 *   - apps/portal/src/app/merchant/orders/page.tsx (transformOrder())
 *   - apps/portal/src/components/orders/enhanced-features.tsx
 */
const OrderApiResponseSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  merchantId: z.string().optional(),
  conversationId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  deliveryAddress: AddressSchema.optional(),
  deliveryNotes: z.string().optional(),
  items: z.array(CartItemSchema).or(z.array(z.unknown())),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative(),
  deliveryFee: z.number().nonnegative(),
  total: z.number().nonnegative(),
  status: OrderStatusSchema,
  shipment: ShipmentSchema.optional(),
  createdAt: z.union([z.string().datetime(), z.date()]),
  updatedAt: z.union([z.string().datetime(), z.date()]).optional(),
});

const OrderListResponseSchema = z.object({
  orders: z.array(OrderApiResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

// ============================================================================
// Contract: GET /api/v1/merchants/:id/customers → CustomerListResponseSchema
// ============================================================================

const CustomerApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  totalOrders: z.number().int().nonnegative().optional(),
  totalSpent: z.number().nonnegative().optional(),
  segment: z.string().optional(),
});

const CustomerListResponseSchema = z.object({
  customers: z.array(CustomerApiSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

// ============================================================================
// Contract: GET /api/v1/merchants/:id/dashboard/stats → DashboardStatsSchema
// ============================================================================

/**
 * Consumed by the KPI cards on the merchant dashboard page.
 */
const DashboardStatsSchema = z.object({
  totalOrders: z.number().int().nonnegative(),
  totalRevenue: z.number().nonnegative(),
  totalCustomers: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  revenueGrowth: z.number(), // can be negative (decline)
  ordersGrowth: z.number(), // can be negative (decline)
});

// ============================================================================
// Contract: GET /api/v1/merchants/:id → MerchantSchema
// ============================================================================

const PlanSchema = z.enum([
  "TRIAL",
  "STARTER",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
  "CUSTOM",
]);

const MerchantApiSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  plan: PlanSchema,
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "TRIAL"]),
  currency: z.string().length(3), // ISO 4217: EGP, USD, etc.
});

// ============================================================================
// Tests
// ============================================================================

describe("API contract: orders", () => {
  test("order list fixture satisfies OrderListResponseSchema", () => {
    const payload = {
      orders: fixtures.orders,
      total: fixtures.orders.length,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    const result = OrderListResponseSchema.safeParse(payload);
    if (!result.success) {
      // Pretty-print Zod validation errors for easier debugging
      console.error(
        "Contract violation:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });

  test("order total invariant: total = subtotal - discount + deliveryFee", () => {
    fixtures.orders.forEach((order) => {
      const expected = order.subtotal - order.discount + order.deliveryFee;
      // Allow 1 cent floating-point tolerance
      expect(Math.abs(order.total - expected)).toBeLessThanOrEqual(0.01);
    });
  });

  test("all order statuses in fixture are valid OrderStatus values", () => {
    fixtures.orders.forEach((order) => {
      const result = OrderStatusSchema.safeParse(order.status);
      expect(result.success).toBe(true);
    });
  });
});

describe("API contract: dashboard stats", () => {
  test("dashboard stats fixture satisfies DashboardStatsSchema", () => {
    const result = DashboardStatsSchema.safeParse(fixtures.dashboardStats);
    if (!result.success) {
      console.error(
        "Contract violation:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });

  test("conversionRate is a percentage (0–100)", () => {
    expect(fixtures.dashboardStats.conversionRate).toBeGreaterThanOrEqual(0);
    expect(fixtures.dashboardStats.conversionRate).toBeLessThanOrEqual(100);
  });
});

describe("API contract: customers", () => {
  test("customer list fixture satisfies CustomerListResponseSchema", () => {
    const payload = {
      customers: fixtures.customers,
      total: fixtures.customers.length,
      page: 1,
      totalPages: 1,
    };

    const result = CustomerListResponseSchema.safeParse(payload);
    if (!result.success) {
      console.error(
        "Contract violation:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });
});

describe("API contract: merchant", () => {
  test("merchant fixture satisfies MerchantApiSchema", () => {
    const result = MerchantApiSchema.safeParse(fixtures.merchant);
    if (!result.success) {
      console.error(
        "Contract violation:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });

  test("merchant plan code is canonical (no legacy aliases)", () => {
    const CANONICAL_PLANS = [
      "TRIAL",
      "STARTER",
      "GROWTH",
      "PRO",
      "ENTERPRISE",
      "CUSTOM",
    ];
    const LEGACY_PLANS = ["BASIC", "GROW", "PROFESSIONAL", "ENTERPRISES"];

    expect(LEGACY_PLANS).not.toContain(fixtures.merchant.plan);
    expect(CANONICAL_PLANS).toContain(fixtures.merchant.plan);
  });
});

describe("API contract: schema shape regression", () => {
  test("order has all fields consumed by portal orders page", () => {
    // Verify the fields that portal/src/app/merchant/orders/page.tsx reads
    // are present in the fixture (catches field renames/removals).
    const portalRequiredFields: (keyof (typeof fixtures.orders)[0])[] = [
      "id",
      "orderNumber",
      "status",
      "total",
      "customerName",
      "customerPhone",
      "createdAt",
    ];

    fixtures.orders.forEach((order) => {
      portalRequiredFields.forEach((field) => {
        expect(order).toHaveProperty(field);
        expect(order[field]).not.toBeUndefined();
      });
    });
  });
});
