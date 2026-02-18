import { Test, TestingModule } from "@nestjs/testing";
import { MarketingAgent } from "../marketing.agent";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, MARKETING_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

// Helper to create a valid test task
function createTestTask(overrides: Partial<AgentTask>): AgentTask {
  const now = new Date();
  return {
    id: "task-1",
    agentType: "MARKETING_AGENT",
    taskType: MARKETING_AGENT_TASK_TYPES.GENERATE_PROMO,
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

describe("MarketingAgent", () => {
  let agent: MarketingAgent;
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
        MarketingAgent,
        { provide: DATABASE_POOL, useValue: mockPool },
      ],
    }).compile();

    agent = module.get<MarketingAgent>(MarketingAgent);
  });

  describe("canHandle", () => {
    it("should handle GENERATE_PROMO task", () => {
      expect(agent.canHandle(MARKETING_AGENT_TASK_TYPES.GENERATE_PROMO)).toBe(
        true,
      );
    });

    it("should handle CUSTOMER_SEGMENT task", () => {
      expect(agent.canHandle(MARKETING_AGENT_TASK_TYPES.CUSTOMER_SEGMENT)).toBe(
        true,
      );
    });

    it("should not handle unknown task types", () => {
      expect(agent.canHandle("UNKNOWN_TASK")).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute GENERATE_PROMO task successfully", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { phone: "+201234567890", name: "Customer 1" },
          { phone: "+201234567891", name: "Customer 2" },
        ],
      });

      const task = createTestTask({
        id: "task-1",
        taskType: MARKETING_AGENT_TASK_TYPES.GENERATE_PROMO,
        input: {
          merchantId: "merchant-1",
          productName: "Summer Collection",
          discount: 20,
          validUntil: "2024-08-31",
        },
        priority: "LOW",
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentType).toBe("MARKETING_AGENT");
    });

    it("should execute CUSTOMER_SEGMENT task successfully", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { customer_id: "c1", order_count: 10, total_spent: 5000 },
          { customer_id: "c2", order_count: 5, total_spent: 2500 },
        ],
      });

      const task = createTestTask({
        id: "task-2",
        taskType: MARKETING_AGENT_TASK_TYPES.CUSTOMER_SEGMENT,
        input: {
          merchantId: "merchant-1",
          criteria: {
            minOrders: 3,
            minSpent: 1000,
          },
        },
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
    });
  });
});
