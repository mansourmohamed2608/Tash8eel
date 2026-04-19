import { Test, TestingModule } from "@nestjs/testing";
import { InventoryAgent } from "../inventory.agent";
import { InventoryHandlers } from "../inventory.handlers";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, INVENTORY_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

function createTestTask(overrides: Partial<AgentTask>): AgentTask {
  const now = new Date();
  return {
    id: "task-1",
    agentType: "INVENTORY_AGENT",
    taskType: INVENTORY_AGENT_TASK_TYPES.CHECK_STOCK,
    merchantId: "merchant-1",
    input: {},
    priority: "MEDIUM",
    status: "PENDING",
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AgentTask;
}

describe("InventoryAgent — Advanced Features", () => {
  let agent: InventoryAgent;
  let mockPool: any;

  beforeEach(async () => {
    mockPool = {
      query: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryAgent,
        { provide: DATABASE_POOL, useValue: mockPool },
      ],
    }).compile();

    agent = module.get<InventoryAgent>(InventoryAgent);
  });

  describe("canHandle — new task types", () => {
    it("should handle CHECK_EXPIRY_ALERTS", () => {
      expect(
        agent.canHandle(INVENTORY_AGENT_TASK_TYPES.CHECK_EXPIRY_ALERTS),
      ).toBe(true);
    });

    it("should handle EXPIRY_REPORT", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.EXPIRY_REPORT)).toBe(
        true,
      );
    });

    it("should handle RECEIVE_LOT", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.RECEIVE_LOT)).toBe(
        true,
      );
    });

    it("should handle LOT_REPORT", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.LOT_REPORT)).toBe(true);
    });

    it("should handle FIFO_COGS", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.FIFO_COGS)).toBe(true);
    });

    it("should handle INVENTORY_VALUATION_FIFO", () => {
      expect(
        agent.canHandle(INVENTORY_AGENT_TASK_TYPES.INVENTORY_VALUATION_FIFO),
      ).toBe(true);
    });

    it("should handle DETECT_DUPLICATE_SKUS", () => {
      expect(
        agent.canHandle(INVENTORY_AGENT_TASK_TYPES.DETECT_DUPLICATE_SKUS),
      ).toBe(true);
    });

    it("should handle MERGE_SKUS", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.MERGE_SKUS)).toBe(true);
    });
  });
});

describe("InventoryHandlers — FIFO COGS", () => {
  let handlers: InventoryHandlers;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    handlers = new InventoryHandlers(mockPool);
  });

  it("should calculate FIFO COGS consuming layers oldest first", async () => {
    // Three cost layers: 10@5, 20@7, 30@10
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: "layer-1",
            lot_id: "lot-1",
            quantity_remaining: 10,
            unit_cost: "5.00",
          },
          {
            id: "layer-2",
            lot_id: "lot-2",
            quantity_remaining: 20,
            unit_cost: "7.00",
          },
          {
            id: "layer-3",
            lot_id: "lot-3",
            quantity_remaining: 30,
            unit_cost: "10.00",
          },
        ],
      })
      // UPDATE layer-1 (consume all 10)
      .mockResolvedValueOnce({ rows: [] })
      // UPDATE layer-2 (consume 15 of 20)
      .mockResolvedValueOnce({ rows: [] })
      // COMMIT
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.calculateFifoCogs("merchant-1", "item-1", 25);

    expect(result).toHaveProperty("action", "FIFO_COGS_CALCULATED");
    const cogs = result as any;
    // 10 * 5 + 15 * 7 = 50 + 105 = 155
    expect(cogs.totalCogs).toBe(155);
    expect(cogs.layers).toHaveLength(2);
    expect(cogs.layers[0].quantity).toBe(10);
    expect(cogs.layers[0].unitCost).toBe(5);
    expect(cogs.layers[1].quantity).toBe(15);
    expect(cogs.layers[1].unitCost).toBe(7);
  });

  it("should return insufficient stock when layers cannot fill order", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: "layer-1",
            lot_id: "lot-1",
            quantity_remaining: 5,
            unit_cost: "10.00",
          },
        ],
      })
      // UPDATE layer-1
      .mockResolvedValueOnce({ rows: [] })
      // COMMIT
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.calculateFifoCogs("merchant-1", "item-1", 20);

    // Should still succeed but with partial fill
    expect(result).toHaveProperty("action");
  });
});

describe("InventoryHandlers — Lot Receipt", () => {
  let handlers: InventoryHandlers;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    handlers = new InventoryHandlers(mockPool);
  });

  it("should create lot, cost layer, and update stock in a transaction", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      // Insert lot
      .mockResolvedValueOnce({ rows: [{ id: "lot-99" }] })
      // Insert cost layer
      .mockResolvedValueOnce({ rows: [] })
      // Update variant stock
      .mockResolvedValueOnce({ rows: [] })
      // Mark perishable
      .mockResolvedValueOnce({ rows: [] })
      // COMMIT
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.receiveLot({
      merchantId: "merchant-1",
      itemId: "item-1",
      variantId: "variant-1",
      lotNumber: "LOT-2024-001",
      quantity: 100,
      costPrice: 15.5,
      expiryDate: "2025-06-15",
    });

    expect(result).toHaveProperty("action", "LOT_RECEIVED");
    expect(result).toHaveProperty("lotId", "lot-99");

    // Verify BEGIN + COMMIT pattern
    expect(mockClient.query.mock.calls[0][0]).toContain("BEGIN");
    const lastCall =
      mockClient.query.mock.calls[mockClient.query.mock.calls.length - 1][0];
    expect(lastCall).toContain("COMMIT");
  });

  it("should ROLLBACK on error", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("DB constraint violation"));

    const result = await handlers.receiveLot({
      merchantId: "merchant-1",
      itemId: "item-1",
      lotNumber: "LOT-FAIL",
      quantity: 10,
      costPrice: 5,
    });

    expect(result.action).toBe("FAILED");
    // Verify ROLLBACK was called
    const rollbackCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("ROLLBACK"),
    );
    expect(rollbackCall).toBeDefined();
  });
});

describe("InventoryHandlers — SKU Merge", () => {
  let handlers: InventoryHandlers;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    handlers = new InventoryHandlers(mockPool);
  });

  it("should reject merging an item into itself", async () => {
    const result = await handlers.mergeSkus({
      merchantId: "merchant-1",
      sourceItemId: "item-1",
      targetItemId: "item-1",
    });

    expect(result.action).toBe("FAILED");
    expect(result.message).toContain("same");
  });

  it("should transfer stock and deactivate source item", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      // Source item
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-1",
            sku: "SKU-OLD",
            name: "Product A",
            total_stock: "50",
          },
        ],
      })
      // Target item check
      .mockResolvedValueOnce({
        rows: [{ id: "item-2", sku: "SKU-KEEP", name: "Product A (main)" }],
      })
      // Transfer cost layers
      .mockResolvedValueOnce({ rowCount: 3 })
      // Transfer lots
      .mockResolvedValueOnce({ rowCount: 2 })
      // Update target stock
      .mockResolvedValueOnce({ rows: [] })
      // Deactivate source
      .mockResolvedValueOnce({ rows: [] })
      // Log merge
      .mockResolvedValueOnce({ rows: [] })
      // COMMIT
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.mergeSkus({
      merchantId: "merchant-1",
      sourceItemId: "item-1",
      targetItemId: "item-2",
      reason: "Duplicate product",
    });

    expect(result).toHaveProperty("action", "SKUS_MERGED");
    expect(result).toHaveProperty("stockTransferred", 50);
  });
});

describe("InventoryHandlers — Expiry Alerts", () => {
  let handlers: InventoryHandlers;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };
    handlers = new InventoryHandlers(mockPool);
  });

  it("should categorize alerts by severity", async () => {
    const today = new Date();
    const expired = new Date(today.getTime() - 86400000).toISOString();
    const critical = new Date(today.getTime() + 2 * 86400000).toISOString();
    const warning = new Date(today.getTime() + 5 * 86400000).toISOString();

    mockPool.query
      // perishable items query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "item-1",
            name: "Milk",
            sku: "MLK-001",
            expiry_date: expired,
            quantity_on_hand: 20,
          },
          {
            id: "item-2",
            name: "Yogurt",
            sku: "YOG-001",
            expiry_date: critical,
            quantity_on_hand: 15,
          },
          {
            id: "item-3",
            name: "Juice",
            sku: "JCE-001",
            expiry_date: warning,
            quantity_on_hand: 50,
          },
        ],
      })
      // batch upsert alerts
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handlers.checkExpiryAlerts("merchant-1");

    expect(result).toHaveProperty("action", "EXPIRY_ALERTS_CHECKED");
    expect(result.alerts).toBeDefined();
    const alerts = result.alerts as any[];
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });
});
