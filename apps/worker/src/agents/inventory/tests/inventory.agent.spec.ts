import { Test, TestingModule } from "@nestjs/testing";
import { InventoryAgent } from "../inventory.agent";
import { InventoryHandlers } from "../inventory.handlers";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, INVENTORY_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

// Helper to create a valid AgentTask with all required fields
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

describe("InventoryAgent", () => {
  let agent: InventoryAgent;
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
      providers: [
        InventoryAgent,
        { provide: DATABASE_POOL, useValue: mockPool },
      ],
    }).compile();

    agent = module.get<InventoryAgent>(InventoryAgent);
  });

  describe("canHandle", () => {
    it("should handle CHECK_STOCK task", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.CHECK_STOCK)).toBe(
        true,
      );
    });

    it("should handle RESERVE_STOCK task", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.RESERVE_STOCK)).toBe(
        true,
      );
    });

    it("should handle DEDUCT_STOCK task", () => {
      expect(agent.canHandle(INVENTORY_AGENT_TASK_TYPES.DEDUCT_STOCK)).toBe(
        true,
      );
    });

    it("should handle premium SUBSTITUTION_SUGGESTIONS task", () => {
      expect(
        agent.canHandle(INVENTORY_AGENT_TASK_TYPES.SUBSTITUTION_SUGGESTIONS),
      ).toBe(true);
    });

    it("should handle premium RESTOCK_RECOMMENDATIONS task", () => {
      expect(
        agent.canHandle(INVENTORY_AGENT_TASK_TYPES.RESTOCK_RECOMMENDATIONS),
      ).toBe(true);
    });

    it("should not handle unknown task types", () => {
      expect(agent.canHandle("UNKNOWN_TASK")).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute CHECK_STOCK task successfully", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: "variant-1",
            sku: "SKU-001",
            name: "Test Product",
            quantity_on_hand: 100,
            quantity_reserved: 10,
            quantity_available: 90,
            low_stock_threshold: 20,
          },
        ],
      });

      const task = createTestTask({
        taskType: INVENTORY_AGENT_TASK_TYPES.CHECK_STOCK,
        input: {
          merchantId: "merchant-1",
          variantId: "variant-1",
        },
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("found", true);
    });
  });
});

describe("InventoryHandlers", () => {
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

  describe("reserveStock", () => {
    it("should reserve stock when available", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ quantity_available: 100, quantity_reserved: 0 }],
        })
        .mockResolvedValueOnce({ rows: [{ id: "reservation-1" }] })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handlers.reserveStock({
        merchantId: "merchant-1",
        variantId: "variant-1",
        quantity: 5,
        conversationId: "conv-1",
      });

      expect(result.action).toBe("STOCK_RESERVED");
      expect(result.reservationId).toBe("reservation-1");
    });

    it("should fail reservation when insufficient stock", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ quantity_available: 2, quantity_reserved: 8 }],
        })
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await handlers.reserveStock({
        merchantId: "merchant-1",
        variantId: "variant-1",
        quantity: 5,
        conversationId: "conv-1",
      });

      expect(result.action).toBe("RESERVATION_FAILED");
      expect(result.reason).toBe("insufficient_stock");
    });
  });

  describe("deductStock - idempotency", () => {
    it("should not double-deduct for same orderId", async () => {
      // First call - finds existing deduction
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "movement-1", quantity_after: 95 }],
      }); // Check existing

      const result = await handlers.deductStock({
        merchantId: "merchant-1",
        variantId: "variant-1",
        quantity: 5,
        orderId: "order-1",
      });

      expect(result.action).toBe("ALREADY_DEDUCTED");
      expect(result.idempotent).toBe(true);
    });

    it("should deduct stock when no prior deduction exists", async () => {
      // No existing deduction
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No existing movement

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ quantity_on_hand: 100 }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE variant
        .mockResolvedValueOnce({ rows: [] }) // INSERT movement
        .mockResolvedValueOnce({ rows: [{ threshold: 5 }] }) // SELECT threshold
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handlers.deductStock({
        merchantId: "merchant-1",
        variantId: "variant-1",
        quantity: 5,
        orderId: "order-2",
      });

      expect(result.action).toBe("STOCK_UPDATED");
    });
  });

  describe("cleanupExpiredReservations", () => {
    it("should release expired reservations", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            { id: "res-1", merchant_id: "m1", variant_id: "v1", quantity: 3 },
            { id: "res-2", merchant_id: "m1", variant_id: "v2", quantity: 5 },
          ],
        }) // SELECT expired
        .mockResolvedValueOnce({ rows: [] }) // UPDATE variant 1
        .mockResolvedValueOnce({ rows: [] }) // UPDATE reservation 1
        .mockResolvedValueOnce({ rows: [] }) // UPDATE variant 2
        .mockResolvedValueOnce({ rows: [] }) // UPDATE reservation 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handlers.cleanupExpiredReservations();

      expect(result.action).toBe("RESERVATIONS_EXPIRED");
      expect(result.releasedCount).toBe(2);
    });
  });

  describe("getSubstitutionSuggestions", () => {
    it("should return substitutes from same category", async () => {
      // Original item query
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "v1",
              sku: "SKU-001",
              name: "Blue T-Shirt L",
              category: "shirts",
              price: 150,
              quantity_available: 0,
            },
          ],
        })
        // Candidates query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "v2",
              sku: "SKU-002",
              name: "Red T-Shirt L",
              category: "shirts",
              price: 145,
              quantity_available: 10,
            },
            {
              id: "v3",
              sku: "SKU-003",
              name: "Green T-Shirt M",
              category: "shirts",
              price: 140,
              quantity_available: 5,
            },
          ],
        });

      const result = await handlers.getSubstitutionSuggestions({
        merchantId: "merchant-1",
        variantId: "v1",
        maxSuggestions: 5,
      });

      expect(result.action).toBe("SUBSTITUTIONS_FOUND");
      expect(result.substitutes).toHaveLength(2);
      expect((result.substitutes as any[])[0].category).toBe("shirts");
    });
  });

  describe("getRestockRecommendations", () => {
    it("should return items needing restock with urgency", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "v1",
            sku: "SKU-001",
            name: "Product A",
            quantity_on_hand: 0,
            quantity_available: 0,
            threshold: 5,
            reorder_point: 10,
            reorder_quantity: 20,
            monthly_sales: 30,
            avg_daily_sales: 1,
          },
          {
            id: "v2",
            sku: "SKU-002",
            name: "Product B",
            quantity_on_hand: 3,
            quantity_available: 3,
            threshold: 5,
            reorder_point: 10,
            reorder_quantity: 15,
            monthly_sales: 15,
            avg_daily_sales: 0.5,
          },
        ],
      });

      const result = await handlers.getRestockRecommendations({
        merchantId: "merchant-1",
        maxItems: 10,
      });

      expect(result.action).toBe("RESTOCK_RECOMMENDATIONS");
      expect(result.totalItems).toBe(2);
      expect(result.criticalCount).toBe(1); // Out of stock item
    });
  });
});
