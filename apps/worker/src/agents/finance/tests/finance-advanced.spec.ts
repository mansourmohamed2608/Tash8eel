import { Test, TestingModule } from "@nestjs/testing";
import { FinanceAgent } from "../finance.agent";
import { FinanceHandlers } from "../finance.handlers";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, FINANCE_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

function createTestTask(overrides: Partial<AgentTask>): AgentTask {
  const now = new Date();
  return {
    id: "task-1",
    agentType: "FINANCE_AGENT",
    taskType: FINANCE_AGENT_TASK_TYPES.TAX_REPORT,
    merchantId: "merchant-1",
    input: {},
    priority: "MEDIUM",
    status: "PENDING",
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("FinanceAgent — Advanced Features", () => {
  let agent: FinanceAgent;
  let mockPool: any;

  beforeEach(async () => {
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FinanceAgent, { provide: DATABASE_POOL, useValue: mockPool }],
    }).compile();

    agent = module.get<FinanceAgent>(FinanceAgent);
  });

  describe("canHandle — new task types", () => {
    it("should handle TAX_REPORT", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.TAX_REPORT)).toBe(true);
    });

    it("should handle CASH_FLOW_FORECAST", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.CASH_FLOW_FORECAST)).toBe(
        true,
      );
    });

    it("should handle DISCOUNT_IMPACT", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.DISCOUNT_IMPACT)).toBe(
        true,
      );
    });

    it("should handle REVENUE_BY_CHANNEL", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.REVENUE_BY_CHANNEL)).toBe(
        true,
      );
    });

    it("should handle REFUND_ANALYSIS", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.REFUND_ANALYSIS)).toBe(
        true,
      );
    });

    it("should handle RECONCILE_TRANSACTIONS", () => {
      expect(
        agent.canHandle(FINANCE_AGENT_TASK_TYPES.RECONCILE_TRANSACTIONS),
      ).toBe(true);
    });

    it("should handle EXPENSE_SUMMARY", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.EXPENSE_SUMMARY)).toBe(
        true,
      );
    });

    it("should handle MONTHLY_CLOSE", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.MONTHLY_CLOSE)).toBe(
        true,
      );
    });
  });
});

describe("FinanceHandlers — Tax Report", () => {
  let handlers: FinanceHandlers;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };
    handlers = new FinanceHandlers(mockPool);
  });

  it("should generate a VAT 14% tax report for a period", async () => {
    // merchant config
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ vat_rate: "14", tax_registration_no: "123456789" }],
      })
      // orders
      .mockResolvedValueOnce({
        rows: [
          {
            total_orders: "100",
            gross_revenue: "50000.00",
            total_discounts: "2000.00",
          },
        ],
      })
      // expenses
      .mockResolvedValueOnce({ rows: [{ total_expenses: "15000.00" }] })
      // refunds
      .mockResolvedValueOnce({
        rows: [{ total_refunds: "5", refund_total: "1500.00" }],
      })
      // persist upsert
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.generateTaxReport({
      merchantId: "merchant-1",
      periodStart: "2024-01-01",
      periodEnd: "2024-02-01",
    });

    expect(result).toHaveProperty("action", "TAX_REPORT_GENERATED");
    expect(result).toHaveProperty("report");
    const report = result.report as any;
    expect(report.vatRate).toBe(14);
    expect(report.grossRevenue).toBe(50000);
    expect(report.netRevenue).toBe(48000); // 50000 - 2000
    // VAT on sales: 48000 * 0.14 = 6720
    expect(report.vatOnSales).toBe(6720);
    // VAT on purchases: 15000 * 0.14 = 2100
    expect(report.vatOnPurchases).toBe(2100);
    // VAT on refunds: 1500 * 0.14 = 210
    expect(report.vatOnRefunds).toBe(210);
    // Net VAT: 6720 - 2100 - 210 = 4410
    expect(report.netVatPayable).toBe(4410);
  });

  it("should default to 14% VAT when no config exists", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // no config
      .mockResolvedValueOnce({
        rows: [
          {
            total_orders: "10",
            gross_revenue: "1000.00",
            total_discounts: "0.00",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_expenses: "0.00" }] })
      .mockResolvedValueOnce({
        rows: [{ total_refunds: "0", refund_total: "0.00" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.generateTaxReport({
      merchantId: "merchant-1",
      periodStart: "2024-01-01",
      periodEnd: "2024-02-01",
    });

    const report = result.report as any;
    expect(report.vatRate).toBe(14);
    expect(report.vatOnSales).toBe(140); // 1000 * 0.14
  });

  it("should return FAILED when merchantId is missing", async () => {
    const result = await handlers.generateTaxReport({
      merchantId: "",
      periodStart: "2024-01-01",
      periodEnd: "2024-02-01",
    });
    expect(result.action).toBe("FAILED");
  });
});

describe("FinanceHandlers — Discount Impact", () => {
  let handlers: FinanceHandlers;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };
    handlers = new FinanceHandlers(mockPool);
  });

  it("should analyze discount impact with proper period parameterization", async () => {
    mockPool.query
      // comparison query
      .mockResolvedValueOnce({
        rows: [
          {
            category: "DISCOUNTED",
            order_count: "25",
            revenue: "12500.00",
            avg_order_value: "500.00",
            total_discount: "2500.00",
          },
          {
            category: "FULL_PRICE",
            order_count: "75",
            revenue: "37500.00",
            avg_order_value: "500.00",
            total_discount: "0.00",
          },
        ],
      })
      // byType
      .mockResolvedValueOnce({
        rows: [
          {
            discount_type: "PERCENTAGE",
            order_count: "20",
            revenue: "10000",
            total_discount: "2000",
            avg_order_value: "500",
          },
        ],
      })
      // byCode
      .mockResolvedValueOnce({
        rows: [
          {
            discount_code: "SUMMER20",
            order_count: "15",
            revenue: "7500",
            total_discount: "1500",
            avg_order_value: "500",
            unique_customers: "12",
          },
        ],
      });

    const result = await handlers.analyzeDiscountImpact({
      merchantId: "merchant-1",
      periodDays: 30,
    });

    expect(result).toHaveProperty("action", "DISCOUNT_IMPACT_ANALYZED");
    // Verify parameters used make_interval (parameterized) not string interpolation
    const calls = mockPool.query.mock.calls;
    // Each call's second arg should be an array with days param
    expect(calls[0][1]).toContain(30); // days passed as parameter
    expect(calls[0][0]).toContain("make_interval"); // safe function used
  });
});

describe("FinanceHandlers — Revenue By Channel", () => {
  let handlers: FinanceHandlers;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };
    handlers = new FinanceHandlers(mockPool);
  });

  it("should break down revenue by channel", async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            channel: "WHATSAPP",
            order_count: "80",
            revenue: "40000.00",
            avg_order_value: "500.00",
            unique_customers: "50",
            cancelled: "2",
            collected_revenue: "38000.00",
          },
          {
            channel: "PORTAL",
            order_count: "20",
            revenue: "10000.00",
            avg_order_value: "500.00",
            unique_customers: "15",
            cancelled: "1",
            collected_revenue: "9500.00",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // daily trend

    const result = await handlers.getRevenueByChannel({
      merchantId: "merchant-1",
      periodDays: 30,
    });

    expect(result).toHaveProperty("action", "REVENUE_BY_CHANNEL");
    expect((result as any).channels).toHaveLength(2);
    expect((result as any).summary.totalRevenue).toBe(50000);
    // WhatsApp should be 80% of revenue
    const whatsappChannel = (result as any).channels.find(
      (c: any) => c.channel === "WHATSAPP",
    );
    expect(whatsappChannel.revenuePct).toBe(80);
  });
});

describe("FinanceHandlers — Refund Analysis", () => {
  let handlers: FinanceHandlers;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };
    handlers = new FinanceHandlers(mockPool);
  });

  it("should compute refund rate correctly", async () => {
    mockPool.query
      // summary
      .mockResolvedValueOnce({
        rows: [
          {
            approved_refunds: "10",
            pending_refunds: "3",
            rejected_refunds: "1",
            total_refunded: "5000.00",
            pending_amount: "1500.00",
            avg_refund: "500.00",
          },
        ],
      })
      // byReason
      .mockResolvedValueOnce({
        rows: [
          {
            reason: "DEFECTIVE",
            count: "7",
            total_amount: "3500.00",
            avg_amount: "500.00",
          },
        ],
      })
      // byMethod
      .mockResolvedValueOnce({
        rows: [
          { refund_method: "WALLET", count: "10", total_amount: "5000.00" },
        ],
      })
      // ordersCount
      .mockResolvedValueOnce({
        rows: [{ total_orders: "100", total_revenue: "50000.00" }],
      })
      // topRefunders
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.getRefundAnalysis({
      merchantId: "merchant-1",
      periodDays: 30,
    });

    expect(result).toHaveProperty("action", "REFUND_ANALYSIS");
    const analysis = (result as any).analysis;
    expect(analysis.summary.approvedRefunds).toBe(10);
    expect(analysis.summary.refundRate).toBe(10); // 10/100 = 10%
    expect(analysis.summary.refundToRevenuePct).toBe(10); // 5000/50000 = 10%
  });
});

describe("FinanceHandlers — SQL Parameterization", () => {
  let handlers: FinanceHandlers;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{}] }),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };
    handlers = new FinanceHandlers(mockPool);
  });

  it("should bound periodDays between 1 and 365", async () => {
    // Try to inject a very large number
    await handlers.analyzeDiscountImpact({
      merchantId: "merchant-1",
      periodDays: 9999,
    });
    const dayParam = mockPool.query.mock.calls[0][1][1]; // second param is days
    expect(dayParam).toBeLessThanOrEqual(365);

    mockPool.query.mockClear();

    // Try zero
    await handlers.analyzeDiscountImpact({
      merchantId: "merchant-1",
      periodDays: 0,
    });
    const dayParam2 = mockPool.query.mock.calls[0][1][1];
    expect(dayParam2).toBeGreaterThanOrEqual(1);
  });

  it("should never interpolate days into SQL strings", async () => {
    await handlers.getRevenueByChannel({
      merchantId: "merchant-1",
      periodDays: 30,
    });

    for (const call of mockPool.query.mock.calls) {
      const sql = call[0];
      if (typeof sql === "string") {
        // Should NOT contain ${days} or INTERVAL '30 days' literal
        expect(sql).not.toMatch(/INTERVAL '\d+ days'/);
        // Should contain make_interval
        if (sql.includes("INTERVAL") || sql.includes("make_interval")) {
          expect(sql).toContain("make_interval");
        }
      }
    }
  });
});
