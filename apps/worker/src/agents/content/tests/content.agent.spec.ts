import { Test, TestingModule } from "@nestjs/testing";
import { ContentAgent } from "../content.agent";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, CONTENT_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

// Helper to create a valid test task
function createTestTask(overrides: Partial<AgentTask>): AgentTask {
  const now = new Date();
  return {
    id: "task-1",
    agentType: "CONTENT_AGENT",
    taskType: CONTENT_AGENT_TASK_TYPES.GENERATE_DESCRIPTION,
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

describe("ContentAgent", () => {
  let agent: ContentAgent;
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
      providers: [ContentAgent, { provide: DATABASE_POOL, useValue: mockPool }],
    }).compile();

    agent = module.get<ContentAgent>(ContentAgent);
  });

  describe("canHandle", () => {
    it("should handle GENERATE_DESCRIPTION task", () => {
      expect(
        agent.canHandle(CONTENT_AGENT_TASK_TYPES.GENERATE_DESCRIPTION),
      ).toBe(true);
    });

    it("should handle TRANSLATE_CONTENT task", () => {
      expect(agent.canHandle(CONTENT_AGENT_TASK_TYPES.TRANSLATE_CONTENT)).toBe(
        true,
      );
    });

    it("should not handle unknown task types", () => {
      expect(agent.canHandle("UNKNOWN_TASK")).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute GENERATE_DESCRIPTION task successfully", async () => {
      const task = createTestTask({
        id: "task-1",
        taskType: CONTENT_AGENT_TASK_TYPES.GENERATE_DESCRIPTION,
        input: {
          productName: "Cotton T-Shirt",
          category: "Apparel",
          attributes: ["blue", "cotton", "men"],
          language: "ar",
        },
        priority: "LOW",
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
      expect(result.agentType).toBe("CONTENT_AGENT");
    });

    it("should execute TRANSLATE_CONTENT task successfully", async () => {
      const task = createTestTask({
        id: "task-2",
        taskType: CONTENT_AGENT_TASK_TYPES.TRANSLATE_CONTENT,
        input: {
          text: "High quality cotton shirt",
          sourceLanguage: "en",
          targetLanguage: "ar",
        },
        priority: "LOW",
      });

      const result = await agent.execute(task);

      expect(result.success).toBe(true);
    });
  });
});
