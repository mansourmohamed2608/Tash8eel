import { PlannerOrchestrationService } from "./planner-orchestration.service";

describe("PlannerOrchestrationService", () => {
  const baseContext = {
    merchantId: "m-1",
    generatedAt: new Date().toISOString(),
    operational: {
      todayOrders: 10,
      todayRevenue: 1000,
      openConversations: 2,
      pendingApprovals: 0,
    },
    pos: {
      openRegisters: 1,
      activeDrafts: 2,
      todayCashierOrders: 4,
      todayCashierRevenue: 600,
      openRegistersByBranch: [],
      activeDraftsByBranch: [],
    },
    forecast: {
      enabled: true,
      latestRuns: [],
      riskSignals: {
        lowConfidencePredictions: 0,
        staleRuns: 0,
        highUrgencyReplenishments: 0,
      },
    },
    actionRegistry: [],
  };

  it("blocks critical actions when approval backlog exceeds threshold", async () => {
    const plannerContextAssembler = {
      assemble: jest.fn().mockResolvedValue({
        ...baseContext,
        operational: {
          ...baseContext.operational,
          pendingApprovals: 6,
        },
      }),
    } as any;

    const actionRegistry = {
      evaluatePreconditions: jest.fn().mockResolvedValue({
        ok: true,
        failures: [],
        advisories: [],
        action: {
          intent: "APPROVE_PAYMENT_PROOF",
          destructive: true,
          riskTier: "critical",
          preconditions: [],
          compensationHints: [],
          compensation: {
            strategy: "manual_followup",
            requiresManagerReview: true,
            runbookHints: [],
          },
        },
      }),
    } as any;

    const service = new PlannerOrchestrationService(
      plannerContextAssembler,
      actionRegistry,
    );

    const decision = await service.evaluatePendingAction("m-1", {
      id: "a-1",
      merchantId: "m-1",
      intent: "APPROVE_PAYMENT_PROOF",
      command: { intent: "APPROVE_PAYMENT_PROOF", entities: {} },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      status: "confirmed",
      source: "portal",
    } as any);

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(
      "Critical action blocked because approval backlog is above safety threshold",
    );
    expect(decision.escalationRequired).toBe(true);
  });

  it("adds advisory when create-order runs without an open register", async () => {
    const plannerContextAssembler = {
      assemble: jest.fn().mockResolvedValue({
        ...baseContext,
        pos: {
          ...baseContext.pos,
          openRegisters: 0,
        },
      }),
    } as any;

    const actionRegistry = {
      evaluatePreconditions: jest.fn().mockResolvedValue({
        ok: true,
        failures: [],
        advisories: [],
        action: {
          intent: "CREATE_ORDER",
          destructive: true,
          riskTier: "high",
          preconditions: [],
          compensationHints: ["cancel_created_order"],
          compensation: {
            strategy: "reverse_operation",
            requiresManagerReview: false,
            runbookHints: [],
          },
        },
      }),
    } as any;

    const service = new PlannerOrchestrationService(
      plannerContextAssembler,
      actionRegistry,
    );

    const decision = await service.evaluatePendingAction("m-1", {
      id: "a-2",
      merchantId: "m-1",
      intent: "CREATE_ORDER",
      command: { intent: "CREATE_ORDER", entities: { order: { items: [] } } },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      status: "confirmed",
      source: "portal",
    } as any);

    expect(decision.allowed).toBe(true);
    expect(decision.advisories).toContain(
      "No open register session detected; order execution should be reconciled manually",
    );
  });

  it("evaluates direct command execution through canonical planner gate", async () => {
    const plannerContextAssembler = {
      assemble: jest.fn().mockResolvedValue({
        ...baseContext,
      }),
    } as any;

    const actionRegistry = {
      evaluatePreconditions: jest.fn().mockResolvedValue({
        ok: true,
        failures: [],
        advisories: [],
        action: {
          intent: "ASK_REVENUE",
          destructive: false,
          riskTier: "low",
          preconditions: [],
          compensationHints: [],
          compensation: {
            strategy: "manual_followup",
            requiresManagerReview: false,
            runbookHints: [],
          },
        },
      }),
    } as any;

    const service = new PlannerOrchestrationService(
      plannerContextAssembler,
      actionRegistry,
    );

    const decision = await service.evaluateCommand(
      "m-1",
      {
        intent: "ASK_REVENUE",
        confidence: 0.9,
        entities: {
          expense: null,
          stockUpdate: null,
          paymentLink: null,
          vipTag: null,
          dateRange: null,
          order: null,
        },
        requires_confirmation: false,
        preview: null,
        missing_fields: [],
        reply_ar: "إيراد اليوم 1200 جنيه",
        reasoning: null,
      } as any,
      "whatsapp",
    );

    expect(decision.allowed).toBe(true);
    expect(actionRegistry.evaluatePreconditions).toHaveBeenCalled();
  });

  it("blocks execution when control-plane trigger budget denies request", async () => {
    const plannerContextAssembler = {
      assemble: jest.fn().mockResolvedValue({
        ...baseContext,
      }),
    } as any;

    const actionRegistry = {
      evaluatePreconditions: jest.fn().mockResolvedValue({
        ok: true,
        failures: [],
        advisories: [],
        action: {
          intent: "ASK_REVENUE",
          destructive: false,
          riskTier: "low",
          preconditions: [],
          compensationHints: [],
          compensation: {
            strategy: "manual_followup",
            requiresManagerReview: false,
            runbookHints: [],
          },
        },
      }),
    } as any;

    const controlPlaneGovernance = {
      checkTriggerBudget: jest.fn().mockResolvedValue({
        allowed: false,
        reason: "AI calls daily budget exceeded",
      }),
      recordPlannerRun: jest.fn().mockResolvedValue({ runId: "run-1" }),
    } as any;

    const service = new PlannerOrchestrationService(
      plannerContextAssembler,
      actionRegistry,
      controlPlaneGovernance,
    );

    const decision = await service.evaluatePendingAction("m-1", {
      id: "a-3",
      merchantId: "m-1",
      intent: "ASK_REVENUE",
      command: { intent: "ASK_REVENUE", entities: {} },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      status: "pending",
      source: "portal",
    } as any);

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("AI calls daily budget exceeded");
    expect(controlPlaneGovernance.checkTriggerBudget).toHaveBeenCalled();
    expect(controlPlaneGovernance.recordPlannerRun).toHaveBeenCalled();
  });
});
