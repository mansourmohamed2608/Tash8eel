/**
 * Advanced Reports API Integration Tests
 *
 * Tests for the new finance reports, advanced inventory, and
 * customer intelligence controller endpoints.
 */

import {
  FinanceReportsController,
  AdvancedInventoryController,
  CustomerIntelligenceController,
} from "../../src/api/controllers/advanced-reports.controller";
import { Pool } from "pg";

// ============================================================================
// MOCK POOL FACTORY
// ============================================================================

function createMockPool() {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  return {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue(mockClient),
    _client: mockClient,
  };
}

// ============================================================================
// FINANCE REPORTS CONTROLLER
// ============================================================================

describe("FinanceReportsController", () => {
  let controller: FinanceReportsController;
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
    controller = new FinanceReportsController(pool as any);
  });

  describe("POST /:merchantId/tax-report", () => {
    it("should generate a tax report with VAT 14%", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ vat_rate: "14", tax_registration_no: "EG-1234" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              total_orders: "200",
              gross_revenue: "100000.00",
              total_discounts: "5000.00",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total_expenses: "30000.00" }] })
        .mockResolvedValueOnce({
          rows: [{ total_refunds: "10", refund_total: "3000.00" }],
        })
        .mockResolvedValueOnce({ rows: [] }); // persist

      const result = await controller.generateTaxReport("merchant-1", {
        periodStart: "2024-01-01",
        periodEnd: "2024-02-01",
      });

      expect(result.vatRate).toBe("14%");
      expect(result.grossRevenue).toBe(100000);
      expect(result.netRevenue).toBe(95000); // 100000 - 5000
      expect(result.vatOnSales).toBe(13300); // 95000 * 0.14 = 13300
      expect(result.vatOnPurchases).toBe(4200); // 30000 * 0.14!
      expect(result.vatOnRefunds).toBe(420); // 3000 * 0.14
      expect(result.netVatPayable).toBe(8680); // 13300 - 4200 - 420
      expect(result.taxRegistrationNo).toBe("EG-1234");
    });

    it("should persist the report via upsert", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { total_orders: "0", gross_revenue: "0", total_discounts: "0" },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total_expenses: "0" }] })
        .mockResolvedValueOnce({
          rows: [{ total_refunds: "0", refund_total: "0" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await controller.generateTaxReport("merchant-1", {
        periodStart: "2024-06-01",
        periodEnd: "2024-07-01",
      });

      // 5th call should be the INSERT into tax_reports
      const persistCall = pool.query.mock.calls[4];
      expect(persistCall[0]).toContain("INSERT INTO tax_reports");
      expect(persistCall[0]).toContain("ON CONFLICT");
    });
  });

  describe("GET /:merchantId/cash-flow-forecast", () => {
    it("should forecast cash flow for 30 days", async () => {
      const revenueRows = Array.from({ length: 30 }, (_, i) => ({
        day: new Date(Date.now() - (i + 1) * 86400000)
          .toISOString()
          .split("T")[0],
        revenue: "5000.00",
        order_count: "10",
      }));
      pool.query
        .mockResolvedValueOnce({ rows: revenueRows })
        .mockResolvedValueOnce({
          rows: revenueRows.map((r) => ({ day: r.day, expenses: "2000.00" })),
        });

      const result = await controller.forecastCashFlow("merchant-1", "30");

      expect(result.forecastDays).toBe(30);
      expect(result.forecast).toHaveLength(30);
      expect(result.summary.projectedMonthlyRevenue).toBeGreaterThan(0);
      expect(result.summary.projectedNetCashFlow).toBeGreaterThan(0);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(
        result.summary.confidenceLevel,
      );
    });

    it("should clamp forecastDays between 7 and 90", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await controller.forecastCashFlow("merchant-1", "200");
      expect(result.forecastDays).toBe(90);

      const result2 = await controller.forecastCashFlow("merchant-1", "2");
      expect(result2.forecastDays).toBe(7);
    });
  });

  describe("GET /:merchantId/discount-impact", () => {
    it("should compare discounted vs full price orders", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              category: "DISCOUNTED",
              order_count: "30",
              revenue: "15000",
              avg_order_value: "500",
              total_discount: "3000",
            },
            {
              category: "FULL_PRICE",
              order_count: "70",
              revenue: "35000",
              avg_order_value: "500",
              total_discount: "0",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              discount_code: "SAVE20",
              order_count: "20",
              revenue: "10000",
              total_discount: "2000",
              unique_customers: "15",
            },
          ],
        });

      const result = await controller.analyzeDiscountImpact("merchant-1", "30");

      expect(result.overview.discountedOrders).toBe(30);
      expect(result.overview.fullPriceOrders).toBe(70);
      expect(result.overview.totalDiscount).toBe(3000);
      expect(result.byCode).toHaveLength(1);
      expect(result.byCode[0].code).toBe("SAVE20");
    });
  });

  describe("GET /:merchantId/revenue-by-channel", () => {
    it("should break down revenue by channel with percentages", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            channel: "WHATSAPP",
            order_count: "80",
            revenue: "40000",
            avg_order_value: "500",
            unique_customers: "50",
            collected_revenue: "38000",
          },
          {
            channel: "PORTAL",
            order_count: "20",
            revenue: "10000",
            avg_order_value: "500",
            unique_customers: "15",
            collected_revenue: "9000",
          },
        ],
      });

      const result = await controller.getRevenueByChannel("merchant-1", "30");

      expect(result.totalRevenue).toBe(50000);
      expect(result.channels[0].channel).toBe("WHATSAPP");
      expect(result.channels[0].revenuePct).toBe(80);
      expect(result.channels[1].revenuePct).toBe(20);
    });
  });

  describe("GET /:merchantId/refund-analysis", () => {
    it("should compute refund rate relative to orders", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              approved_refunds: "10",
              pending_refunds: "2",
              total_refunded: "5000",
              avg_refund: "500",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ reason: "DAMAGED", count: "7", total_amount: "3500" }],
        })
        .mockResolvedValueOnce({
          rows: [{ total_orders: "200", total_revenue: "100000" }],
        });

      const result = await controller.getRefundAnalysis("merchant-1", "30");

      expect(result.summary.approvedRefunds).toBe(10);
      expect(result.summary.refundRate).toBe(5); // 10/200 = 5%
      expect(result.byReason).toHaveLength(1);
      expect(result.byReason[0].reason).toBe("DAMAGED");
    });
  });
});

// ============================================================================
// ADVANCED INVENTORY CONTROLLER
// ============================================================================

describe("AdvancedInventoryController", () => {
  let controller: AdvancedInventoryController;
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
    controller = new AdvancedInventoryController(pool as any);
  });

  describe("GET /:merchantId/expiry-alerts", () => {
    it("should return alerts categorized by severity", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "1",
            item_name: "Milk",
            sku: "MLK",
            expiry_date: "2024-01-01",
            days_until_expiry: -5,
            alert_type: "EXPIRED",
            quantity_at_risk: 20,
            acknowledged: false,
          },
          {
            id: "2",
            item_name: "Yogurt",
            sku: "YOG",
            expiry_date: "2024-02-01",
            days_until_expiry: 2,
            alert_type: "CRITICAL",
            quantity_at_risk: 15,
            acknowledged: false,
          },
          {
            id: "3",
            item_name: "Juice",
            sku: "JCE",
            expiry_date: "2024-03-01",
            days_until_expiry: 6,
            alert_type: "WARNING",
            quantity_at_risk: 50,
            acknowledged: false,
          },
        ],
      });

      const result = await controller.getExpiryAlerts("merchant-1");

      expect(result.alerts).toHaveLength(3);
      expect(result.summary.expired).toBe(1);
      expect(result.summary.critical).toBe(1);
      expect(result.summary.warning).toBe(1);
      expect(result.alerts[0].daysLeft).toBe(-5); // ordered by days ascending
    });
  });

  describe("POST /:merchantId/lots", () => {
    it("should create a lot with cost layer in a transaction", async () => {
      const client = pool._client;
      client.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "lot-1" }] }) // Insert lot
        .mockResolvedValueOnce({}) // Insert cost layer
        .mockResolvedValueOnce({}) // Update variant stock
        .mockResolvedValueOnce({}) // Mark perishable
        .mockResolvedValueOnce({}); // COMMIT

      const result = await controller.receiveLot("merchant-1", {
        itemId: "item-1",
        lotNumber: "LOT-2024-001",
        quantity: 100,
        costPrice: 15.5,
        expiryDate: "2025-06-15",
      });

      expect(result.lotId).toBe("lot-1");
      expect(result.quantity).toBe(100);
      expect(client.query).toHaveBeenCalledTimes(6);
    });

    it("should rollback on error", async () => {
      const client = pool._client;
      client.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("constraint violation"));

      await expect(
        controller.receiveLot("merchant-1", {
          itemId: "item-1",
          lotNumber: "LOT-FAIL",
          quantity: 10,
          costPrice: 5,
        }),
      ).rejects.toThrow("constraint violation");

      // Verify ROLLBACK was called
      const rollbackCalls = client.query.mock.calls.filter(
        (c: any[]) => typeof c[0] === "string" && c[0].includes("ROLLBACK"),
      );
      expect(rollbackCalls.length).toBe(1);
    });
  });

  describe("GET /:merchantId/valuation-fifo", () => {
    it("should return FIFO valuation with margin", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "item-1",
            name: "Widget",
            sku: "WDG-001",
            category: "PARTS",
            total_qty: "100",
            total_cost: "1500.00",
            weighted_avg_cost: "15.00",
            retail_price: "25.00",
          },
          {
            id: "item-2",
            name: "Gizmo",
            sku: "GZM-001",
            category: "PARTS",
            total_qty: "50",
            total_cost: "500.00",
            weighted_avg_cost: "10.00",
            retail_price: "20.00",
          },
        ],
      });

      const result = await controller.getInventoryValuationFifo("merchant-1");

      expect(result.method).toBe("FIFO");
      expect(result.items).toHaveLength(2);
      expect(result.summary.totalCostValue).toBe(2000); // 1500 + 500
      expect(result.summary.totalRetailValue).toBe(3500); // 100*25 + 50*20
      expect(result.summary.overallMarginPct).toBeCloseTo(42.86, 1); // (3500-2000)/3500 * 100
    });
  });

  describe("POST /:merchantId/fifo-cogs", () => {
    it("should consume layers oldest-first", async () => {
      const client = pool._client;
      client.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: "l1",
              lot_id: "lot-1",
              quantity_remaining: 10,
              unit_cost: "5.00",
            },
            {
              id: "l2",
              lot_id: "lot-2",
              quantity_remaining: 20,
              unit_cost: "7.00",
            },
          ],
        })
        .mockResolvedValueOnce({}) // update l1
        .mockResolvedValueOnce({}) // update l2
        .mockResolvedValueOnce({}); // COMMIT

      const result = await controller.calculateFifoCogs("merchant-1", {
        itemId: "item-1",
        quantitySold: 25,
      });

      // 10 * 5 + 15 * 7 = 50 + 105 = 155
      expect(result.totalCogs).toBe(155);
      expect(result.layersUsed).toHaveLength(2);
    });
  });

  describe("POST /:merchantId/merge-skus", () => {
    it("should reject same source and target", async () => {
      await expect(
        controller.mergeSkus("merchant-1", {
          sourceItemId: "item-1",
          targetItemId: "item-1",
        }),
      ).rejects.toThrow("different");
    });
  });
});

// ============================================================================
// CUSTOMER INTELLIGENCE CONTROLLER
// ============================================================================

describe("CustomerIntelligenceController", () => {
  let controller: CustomerIntelligenceController;
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
    controller = new CustomerIntelligenceController(pool as any);
  });

  describe("GET /:merchantId/customer-memory/:customerId", () => {
    it("should return all memories for a customer", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "m1",
            memory_type: "PREFERENCE",
            key: "favorite_brand",
            value: "Samsung",
            source: "WHATSAPP",
            confidence: 0.9,
            access_count: 5,
            created_at: new Date(),
          },
          {
            id: "m2",
            memory_type: "BEHAVIOR",
            key: "avg_order_size",
            value: "3",
            source: "SYSTEM",
            confidence: 0.95,
            access_count: 1,
            created_at: new Date(),
          },
        ],
      });

      const result = await controller.getCustomerMemory("merchant-1", "cust-1");
      expect(result.totalMemories).toBe(2);
      expect(result.memories[0].key).toBe("favorite_brand");
    });

    it("should filter by memory type when provided", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await controller.getCustomerMemory("merchant-1", "cust-1", "PREFERENCE");

      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain("memory_type = $3");
      expect(pool.query.mock.calls[0][1]).toEqual([
        "merchant-1",
        "cust-1",
        "PREFERENCE",
      ]);
    });
  });

  describe("POST /:merchantId/customer-memory", () => {
    it("should upsert a memory with ON CONFLICT", async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await controller.saveCustomerMemory("merchant-1", {
        customerId: "cust-1",
        memoryType: "PREFERENCE",
        key: "delivery_time",
        value: "evening",
        confidence: 0.85,
      });

      expect(result.saved).toBe(true);
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("access_count");
    });
  });

  describe("GET /:merchantId/ai-decisions", () => {
    it("should filter by agent and decision type", async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "log-1",
              agent_type: "OPS_AGENT",
              decision_type: "UPSELL",
              confidence: 0.85,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { agent_type: "OPS_AGENT", decision_type: "UPSELL", count: "15" },
          ],
        });

      const result = await controller.getAiDecisionLog(
        "merchant-1",
        "OPS_AGENT",
        "UPSELL",
      );

      expect(result.count).toBe(1);
      expect(result.decisions[0].agent_type).toBe("OPS_AGENT");
      // Verify parameterized filtering
      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain("agent_type = $2");
      expect(sql).toContain("decision_type = $3");
    });

    it("should limit results to 200 max", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await controller.getAiDecisionLog(
        "merchant-1",
        undefined,
        undefined,
        undefined,
        undefined,
        "500",
      );

      const params = pool.query.mock.calls[0][1];
      expect(params[params.length - 1]).toBe(200); // clamped
    });
  });
});
