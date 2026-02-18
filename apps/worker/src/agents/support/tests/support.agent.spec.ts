import { Test, TestingModule } from "@nestjs/testing";
import { SupportAgent } from "../support.agent";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, SUPPORT_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

// Helper to create a valid test task
function createTestTask(overrides: Partial<AgentTask>): AgentTask {
  const now = new Date();
  return {
    id: "task-1",
    agentType: "SUPPORT_AGENT",
    taskType: SUPPORT_AGENT_TASK_TYPES.FAQ_RESPONSE,
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

describe("SupportAgent", () => {
  let agent: SupportAgent;
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
      providers: [SupportAgent, { provide: DATABASE_POOL, useValue: mockPool }],
    }).compile();

    agent = module.get<SupportAgent>(SupportAgent);
  });

  describe("canHandle", () => {
    it("should handle ESCALATION_RESPONSE task", () => {
      expect(
        agent.canHandle(SUPPORT_AGENT_TASK_TYPES.ESCALATION_RESPONSE),
      ).toBe(true);
    });

    it("should handle FAQ_RESPONSE task", () => {
      expect(agent.canHandle(SUPPORT_AGENT_TASK_TYPES.FAQ_RESPONSE)).toBe(true);
    });

    it("should not handle unknown task types", () => {
      expect(agent.canHandle("UNKNOWN_TASK")).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute ESCALATION_RESPONSE task successfully", async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: "ticket-1", status: "ESCALATED" }],
      });

      const task = createTestTask({
        id: "task-1",
        taskType: SUPPORT_AGENT_TASK_TYPES.ESCALATION_RESPONSE,
        input: {
          ticketId: "ticket-1",
          escalationReason: "Customer requested manager callback",
          suggestedResolution: "Offer refund or replacement",
        },
        priority: "HIGH",
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentType).toBe("SUPPORT_AGENT");
    });

    it("should execute FAQ_RESPONSE task successfully", async () => {
      const task = createTestTask({
        id: "task-2",
        taskType: SUPPORT_AGENT_TASK_TYPES.FAQ_RESPONSE,
        input: {
          question: "What is your return policy?",
          language: "ar",
        },
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
    });

    it("should handle unknown task types (stub returns success)", async () => {
      const task = createTestTask({
        id: "task-3",
        taskType: "UNKNOWN_TASK_TYPE" as any,
        input: {
          ticketId: "ticket-1",
          reason: "Test error handling",
        },
        priority: "CRITICAL",
      });

      // "Coming soon" agents pass through unknown tasks with success
      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.output?.action).toBe("COMING_SOON");
    });
  });
});
