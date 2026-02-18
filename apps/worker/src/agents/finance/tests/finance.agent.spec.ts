import { Test, TestingModule } from "@nestjs/testing";
import { FinanceAgent } from "../finance.agent";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, FINANCE_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

// Helper to create a valid test task
function createTestTask(overrides: Partial<AgentTask>): AgentTask {
  const now = new Date();
  return {
    id: "task-1",
    agentType: "FINANCE_AGENT",
    taskType: FINANCE_AGENT_TASK_TYPES.GENERATE_INVOICE,
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

describe("FinanceAgent", () => {
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

  describe("canHandle", () => {
    it("should handle GENERATE_INVOICE task", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.GENERATE_INVOICE)).toBe(
        true,
      );
    });

    it("should handle PROCESS_PAYMENT task", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.PROCESS_PAYMENT)).toBe(
        true,
      );
    });

    it("should handle CALCULATE_FEES task", () => {
      expect(agent.canHandle(FINANCE_AGENT_TASK_TYPES.CALCULATE_FEES)).toBe(
        true,
      );
    });

    it("should not handle unknown task types", () => {
      expect(agent.canHandle("UNKNOWN_TASK")).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute GENERATE_INVOICE task successfully", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: "order-1",
            total: 500,
            items: [{ name: "Product", quantity: 2, price: 250 }],
          },
        ],
      });

      const task = createTestTask({
        id: "task-1",
        taskType: FINANCE_AGENT_TASK_TYPES.GENERATE_INVOICE,
        input: {
          orderId: "order-1",
          merchantId: "merchant-1",
        },
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentType).toBe("FINANCE_AGENT");
    });

    it("should execute CALCULATE_FEES task successfully", async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ total: 1000 }],
      });

      const task = createTestTask({
        id: "task-2",
        taskType: FINANCE_AGENT_TASK_TYPES.CALCULATE_FEES,
        input: {
          merchantId: "merchant-1",
          orderAmount: 1000,
        },
        priority: "LOW",
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
    });
  });
});
