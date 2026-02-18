import { Test, TestingModule } from "@nestjs/testing";
import { OpsAgent } from "../ops.agent";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, OPS_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

// Helper to create a valid test task
function createTestTask(overrides: Partial<AgentTask>): AgentTask {
  const now = new Date();
  return {
    id: "task-1",
    agentType: "OPS_AGENT",
    taskType: OPS_AGENT_TASK_TYPES.PROCESS_MESSAGE,
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

describe("OpsAgent", () => {
  let agent: OpsAgent;
  let mockPool: any;

  beforeEach(async () => {
    // Create a mock pool that properly handles async query calls
    mockPool = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        // Mock different query responses based on SQL pattern
        if (sql.includes("SELECT") && sql.includes("conversations")) {
          return {
            rows: [{ id: "conv-1", state: "BROWSING", created_at: new Date() }],
          };
        }
        if (
          sql.includes("SELECT") &&
          sql.includes("merchant_analytics_daily")
        ) {
          return { rows: [{ total_messages: 10 }] };
        }
        if (sql.includes("INSERT") || sql.includes("UPDATE")) {
          return { rows: [], rowCount: 1 };
        }
        // Default empty response
        return { rows: [] };
      }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
        release: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpsAgent, { provide: DATABASE_POOL, useValue: mockPool }],
    }).compile();

    agent = module.get<OpsAgent>(OpsAgent);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("canHandle", () => {
    it("should handle PROCESS_MESSAGE task", () => {
      expect(agent.canHandle(OPS_AGENT_TASK_TYPES.PROCESS_MESSAGE)).toBe(true);
    });

    it("should handle CREATE_ORDER task", () => {
      expect(agent.canHandle(OPS_AGENT_TASK_TYPES.CREATE_ORDER)).toBe(true);
    });

    it("should handle BOOK_DELIVERY task", () => {
      expect(agent.canHandle(OPS_AGENT_TASK_TYPES.BOOK_DELIVERY)).toBe(true);
    });

    it("should not handle unknown task types", () => {
      expect(agent.canHandle("UNKNOWN_TASK")).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute PROCESS_MESSAGE task successfully", async () => {
      const task = createTestTask({
        id: "task-1",
        taskType: OPS_AGENT_TASK_TYPES.PROCESS_MESSAGE,
        input: {
          conversationId: "conv-1",
          merchantId: "merchant-1",
          text: "test message",
        },
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentType).toBe("OPS_AGENT");
      expect(result.taskId).toBe("task-1");
    });

    it("should handle errors gracefully", async () => {
      const task = createTestTask({
        id: "task-2",
        taskType: "UNKNOWN_TYPE" as any,
        input: {},
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
