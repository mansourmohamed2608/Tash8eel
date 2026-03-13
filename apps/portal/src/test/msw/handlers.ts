/**
 * MSW request handlers for portal integration tests.
 *
 * These handlers intercept HTTP calls made by portal components and return
 * deterministic fixture data, allowing tests to run without a real API server.
 *
 * Add new handlers here when testing components that call new API endpoints.
 * Use `server.use(handler)` inside individual test files to override specific
 * handlers for error/edge-case scenarios.
 */

import { http, HttpResponse } from "msw";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MERCHANT_ID = "merchant_test_001";
const API_KEY = "tash8eel_test_api_key";

export const fixtures = {
  merchantId: MERCHANT_ID,
  apiKey: API_KEY,

  dashboardStats: {
    totalOrders: 42,
    totalRevenue: 15750.5,
    totalCustomers: 18,
    conversionRate: 68.4,
    revenueGrowth: 12.5,
    ordersGrowth: 8.3,
  },

  orders: [
    {
      id: "order_001",
      orderNumber: "ORD-0001",
      status: "CONFIRMED",
      total: 450.0,
      subtotal: 400.0,
      discount: 0,
      deliveryFee: 50.0,
      customerName: "Ahmed Hassan",
      customerPhone: "+20100000001",
      createdAt: "2024-01-15T10:30:00Z",
    },
    {
      id: "order_002",
      orderNumber: "ORD-0002",
      status: "PENDING",
      total: 320.0,
      subtotal: 300.0,
      discount: 30.0,
      deliveryFee: 50.0,
      customerName: "Fatima Ali",
      customerPhone: "+20100000002",
      createdAt: "2024-01-15T11:00:00Z",
    },
  ],

  customers: [
    {
      id: "cust_001",
      name: "Ahmed Hassan",
      phone: "+20100000001",
      totalOrders: 5,
      totalSpent: 2250.0,
      segment: "VIP",
    },
  ],

  merchant: {
    id: MERCHANT_ID,
    businessName: "Test Store",
    plan: "GROWTH",
    status: "ACTIVE",
    currency: "EGP",
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  // --- Health ---
  http.get("/api/v1/health", () =>
    HttpResponse.json({ status: "ok", timestamp: new Date().toISOString() }),
  ),

  // --- Staff / Auth ---
  http.post("/api/v1/staff/login", async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    if (body.email === "staff@test.com" && body.password === "correct-pass") {
      return HttpResponse.json({
        accessToken: "mock_access_token",
        refreshToken: "mock_refresh_token",
        staff: { id: "staff_001", email: body.email, role: "OWNER" },
        merchant: fixtures.merchant,
      });
    }
    return HttpResponse.json(
      { message: "Invalid credentials" },
      { status: 401 },
    );
  }),

  // --- Dashboard ---
  http.get(
    `/api/v1/merchants/${MERCHANT_ID}/dashboard/stats`,
    () => HttpResponse.json(fixtures.dashboardStats),
  ),

  http.get(
    `/api/v1/merchants/${MERCHANT_ID}/dashboard/kpis`,
    () =>
      HttpResponse.json({
        revenue: fixtures.dashboardStats.totalRevenue,
        orders: fixtures.dashboardStats.totalOrders,
        customers: fixtures.dashboardStats.totalCustomers,
      }),
  ),

  // --- Orders ---
  http.get(
    `/api/v1/merchants/${MERCHANT_ID}/orders`,
    ({ request }) => {
      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get("page") ?? "1");
      const limit = parseInt(url.searchParams.get("limit") ?? "20");

      return HttpResponse.json({
        orders: fixtures.orders,
        total: fixtures.orders.length,
        page,
        limit,
        totalPages: 1,
      });
    },
  ),

  http.get(
    `/api/v1/merchants/${MERCHANT_ID}/orders/:orderId`,
    ({ params }) => {
      const order = fixtures.orders.find((o) => o.id === params.orderId);
      if (!order) {
        return HttpResponse.json({ message: "Order not found" }, { status: 404 });
      }
      return HttpResponse.json(order);
    },
  ),

  // --- Customers ---
  http.get(
    `/api/v1/merchants/${MERCHANT_ID}/customers`,
    () =>
      HttpResponse.json({
        customers: fixtures.customers,
        total: fixtures.customers.length,
        page: 1,
        totalPages: 1,
      }),
  ),

  // --- Analytics (fire-and-forget telemetry — always succeed) ---
  http.post(
    `/api/v1/merchants/${MERCHANT_ID}/analytics/events`,
    () => HttpResponse.json({ success: true }, { status: 202 }),
  ),
];
