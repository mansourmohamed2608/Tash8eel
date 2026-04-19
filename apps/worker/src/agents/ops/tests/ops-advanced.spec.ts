import { Test, TestingModule } from "@nestjs/testing";
import { OpsAgent } from "../ops.agent";
import { DATABASE_POOL } from "../../../infrastructure/database.module";
import { AgentTask, OPS_AGENT_TASK_TYPES } from "@tash8eel/agent-sdk";

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

describe("OpsAgent — Advanced Features", () => {
  let agent: OpsAgent;
  let mockPool: any;

  beforeEach(async () => {
    mockPool = {
      query: jest.fn(),
      connect: jest
        .fn()
        .mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpsAgent, { provide: DATABASE_POOL, useValue: mockPool }],
    }).compile();

    agent = module.get<OpsAgent>(OpsAgent);
  });

  describe("canHandle — new task types", () => {
    const newTaskTypes = [
      "UPSELL_SUGGESTIONS",
      "RECORD_UPSELL_CONVERSION",
      "CALCULATE_DELIVERY_ETA",
      "HANDLE_COMPLAINT",
      "ADVANCE_COMPLAINT",
      "SAVE_CUSTOMER_MEMORY",
      "GET_CUSTOMER_MEMORY",
      "LOG_AI_DECISION",
      "GET_AI_DECISION_LOG",
      "CUSTOMER_INSIGHTS",
      "SEGMENT_CUSTOMERS",
      "DAILY_REPORT",
      "CUSTOMER_RISK_SCORE",
      "REORDER_ITEMS",
    ];

    for (const taskType of newTaskTypes) {
      it(`should handle ${taskType}`, () => {
        expect(
          agent.canHandle(
            OPS_AGENT_TASK_TYPES[taskType as keyof typeof OPS_AGENT_TASK_TYPES],
          ),
        ).toBe(true);
      });
    }
  });

  describe("execute — upsell suggestions", () => {
    it("should route UPSELL_SUGGESTIONS to handler", async () => {
      // Mock the handler to return upsell data
      mockPool.query
        // Get order items
        .mockResolvedValueOnce({
          rows: [
            { id: "item-1", name: "Cola", category: "BEVERAGES", price: 15 },
          ],
        })
        // Get frequently bought together
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-2",
              name: "Chips",
              category: "SNACKS",
              price: 25,
              co_occurrence: 15,
            },
          ],
        })
        // Get upsell rules
        .mockResolvedValueOnce({ rows: [] });

      const task = createTestTask({
        taskType: OPS_AGENT_TASK_TYPES.UPSELL_SUGGESTIONS,
        input: { merchantId: "merchant-1", orderId: "order-1" },
      });

      const result = await agent.execute(task);
      expect(result.success).toBe(true);
    });
  });

  describe("execute — customer memory", () => {
    it("should save and retrieve customer memory", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // upsert

      const saveTask = createTestTask({
        taskType: OPS_AGENT_TASK_TYPES.SAVE_CUSTOMER_MEMORY,
        input: {
          merchantId: "merchant-1",
          customerId: "cust-1",
          memoryType: "PREFERENCE",
          key: "favorite_flavor",
          value: "strawberry",
        },
      });

      const saveResult = await agent.execute(saveTask);
      expect(saveResult.success).toBe(true);
    });

    it("should retrieve customer memory with type filter", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "m1",
            memory_type: "PREFERENCE",
            key: "favorite_flavor",
            value: "strawberry",
            confidence: 0.9,
            access_count: 5,
          },
          {
            id: "m2",
            memory_type: "PREFERENCE",
            key: "delivery_time",
            value: "evening",
            confidence: 0.85,
            access_count: 3,
          },
        ],
      });

      const getTask = createTestTask({
        taskType: OPS_AGENT_TASK_TYPES.GET_CUSTOMER_MEMORY,
        input: {
          merchantId: "merchant-1",
          customerId: "cust-1",
          memoryType: "PREFERENCE",
        },
      });

      const result = await agent.execute(getTask);
      expect(result.success).toBe(true);
    });
  });

  describe("execute — AI decision audit trail", () => {
    it("should log an AI decision with full context", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: "log-1" }] });

      const task = createTestTask({
        taskType: OPS_AGENT_TASK_TYPES.LOG_AI_DECISION,
        input: {
          merchantId: "merchant-1",
          agentType: "OPS_AGENT",
          decisionType: "UPSELL",
          inputSummary: JSON.stringify({ orderId: "order-1", items: ["Cola"] }),
          decision: JSON.stringify({
            suggestions: [
              { item: "Chips", reason: "frequently_bought_together" },
            ],
          }),
          reasoning:
            "Customer ordered Cola; Chips co-purchased 80% of the time",
          entityType: "ORDER",
          entityId: "order-1",
          confidence: 0.85,
        },
      });

      const result = await agent.execute(task);
      expect(result.success).toBe(true);
    });

    it("should retrieve decision log filtered by agent type", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            agent_type: "OPS_AGENT",
            decision_type: "UPSELL",
            confidence: 0.85,
          },
          {
            id: "log-2",
            agent_type: "OPS_AGENT",
            decision_type: "COMPLAINT",
            confidence: 0.9,
          },
        ],
      });

      const task = createTestTask({
        taskType: OPS_AGENT_TASK_TYPES.GET_AI_DECISION_LOG,
        input: { merchantId: "merchant-1", agentType: "OPS_AGENT", limit: 50 },
      });

      const result = await agent.execute(task);
      expect(result.success).toBe(true);
    });
  });

  describe("execute — complaint handling", () => {
    it("should create a complaint with escalation logic", async () => {
      mockPool.query
        // Fetch playbook
        .mockResolvedValueOnce({
          rows: [
            {
              id: "pb-1",
              category: "DELIVERY",
              steps: JSON.stringify([
                { step: 1, action: "APOLOGIZE", template: "نعتذر عن التأخير" },
                {
                  step: 2,
                  action: "OFFER_DISCOUNT",
                  template: "خصم 10% على طلبك القادم",
                },
              ]),
              auto_escalate_after_hours: 24,
            },
          ],
        })
        // Create complaint record
        .mockResolvedValueOnce({ rows: [{ id: "complaint-1" }] })
        // Log AI decision
        .mockResolvedValueOnce({ rows: [] });

      const task = createTestTask({
        taskType: OPS_AGENT_TASK_TYPES.HANDLE_COMPLAINT,
        input: {
          merchantId: "merchant-1",
          customerId: "cust-1",
          orderId: "order-1",
          category: "DELIVERY",
          description: "Order arrived 3 hours late",
        },
      });

      const result = await agent.execute(task);
      expect(result.success).toBe(true);
    });
  });
});
