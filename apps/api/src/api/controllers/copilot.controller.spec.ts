import { CopilotController } from "./copilot.controller";

describe("CopilotController", () => {
  function makeController() {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ ready: true }] }),
    } as any;

    const copilotAiService = {
      getPendingAction: jest.fn(),
      confirmAction: jest.fn(),
      recordApprovalState: jest.fn(),
      getHistory: jest.fn(),
      isAiConnected: jest.fn().mockReturnValue(true),
      isStrictModeEnabled: jest.fn().mockReturnValue(false),
      parseCommand: jest.fn(),
    } as any;

    const dispatcherService = {
      execute: jest.fn(),
      executeQuery: jest.fn(),
    } as any;

    const actionRegistry = {
      getDefinition: jest.fn(),
      evaluatePreconditions: jest.fn(),
    } as any;

    const plannerOrchestration = {
      evaluatePendingAction: jest.fn(),
      evaluateCommand: jest.fn(),
    } as any;

    const transcriptionFactory = {} as any;

    const auditService = {
      log: jest.fn(),
    } as any;

    const aiCache = {
      invalidateMerchant: jest.fn(),
      getCopilotCacheKey: jest.fn().mockReturnValue(null),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      getCopilotTTL: jest.fn().mockReturnValue(30),
      getStats: jest.fn().mockReturnValue({
        hits: 0,
        misses: 0,
        hitRate: 0,
        memoryEntries: 0,
      }),
    } as any;

    const usageGuard = {
      checkLimit: jest.fn().mockResolvedValue({
        allowed: true,
        used: 0,
        limit: 100,
      }),
      consume: jest.fn().mockResolvedValue({
        allowed: true,
        used: 1,
        limit: 100,
      }),
    } as any;

    const controller = new CopilotController(
      pool,
      copilotAiService,
      dispatcherService,
      actionRegistry,
      plannerOrchestration,
      transcriptionFactory,
      auditService,
      aiCache,
      usageGuard,
    );

    return {
      controller,
      pool,
      copilotAiService,
      dispatcherService,
      actionRegistry,
      plannerOrchestration,
    };
  }

  it("lists approval records with pagination", async () => {
    const { controller, pool } = makeController();

    pool.query
      .mockResolvedValueOnce({ rows: [{ ready: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            action_id: "a-1",
            intent: "CREATE_ORDER",
            source: "portal",
            status: "pending",
            actor_role: null,
            actor_id: null,
            details: {},
            execution_result: null,
            pending_at: new Date().toISOString(),
            confirmed_at: null,
            denied_at: null,
            cancelled_at: null,
            expired_at: null,
            executing_at: null,
            executed_at: null,
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 60000).toISOString(),
            command: {
              reply_ar: "تنفيذ طلب",
              preview: { summary_ar: "إنشاء طلب جديد" },
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    const result = await controller.listApprovals(
      "pending",
      undefined,
      "10",
      "0",
      { merchantId: "m-1" },
    );

    expect(result.success).toBe(true);
    expect(result.pagination.total).toBe(1);
    expect(result.approvals[0]).toMatchObject({
      actionId: "a-1",
      intent: "CREATE_ORDER",
      status: "pending",
      previewSummary: "إنشاء طلب جديد",
    });
  });

  it("blocks immediate query execution when planner disallows command", async () => {
    const {
      controller,
      copilotAiService,
      dispatcherService,
      plannerOrchestration,
    } = makeController();

    copilotAiService.parseCommand.mockResolvedValue({
      success: true,
      command: {
        intent: "ASK_REVENUE",
        confidence: 0.9,
        entities: {},
        missing_fields: [],
        reply_ar: "إيراد اليوم",
      },
      featureBlocked: false,
    });

    plannerOrchestration.evaluateCommand.mockResolvedValue({
      allowed: false,
      escalationRequired: false,
      reasons: ["Planner policy blocked query execution"],
      advisories: [],
      contextDigest: {
        generatedAt: new Date().toISOString(),
        pendingApprovals: 2,
        openRegisters: 1,
        forecastRiskSignals: {
          lowConfidencePredictions: 0,
          staleRuns: 0,
          highUrgencyReplenishments: 0,
        },
      },
    });

    const result: any = await controller.processMessage(
      { message: "كم الإيراد؟", history: [] },
      {
        merchantId: "m-1",
        staffRole: "OWNER",
      },
    );

    expect(result.success).toBe(false);
    expect(result.action?.type).toBe("planner_blocked");
    expect(dispatcherService.executeQuery).not.toHaveBeenCalled();
  });

  it("blocks execution when planner orchestration disallows action", async () => {
    const {
      controller,
      copilotAiService,
      dispatcherService,
      actionRegistry,
      plannerOrchestration,
    } = makeController();

    const pendingAction = {
      id: "a-2",
      merchantId: "m-1",
      intent: "CREATE_ORDER",
      command: {
        intent: "CREATE_ORDER",
        entities: {
          expense: null,
          stockUpdate: null,
          paymentLink: null,
          vipTag: null,
          dateRange: null,
          order: { items: [{ name: "منتج", quantity: 1 }] },
        },
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 120000),
      status: "pending",
      source: "portal",
    };

    copilotAiService.getPendingAction.mockResolvedValue(pendingAction);
    copilotAiService.confirmAction.mockResolvedValue({
      success: true,
      message: "ok",
      action: "confirmed",
    });

    actionRegistry.getDefinition.mockReturnValue({
      intent: "CREATE_ORDER",
      destructive: true,
      riskTier: "high",
      preconditions: ["order has at least one item"],
      compensationHints: ["cancel_created_order"],
      compensation: {
        strategy: "reverse_operation",
        requiresManagerReview: false,
        runbookHints: ["audit_before_reverse"],
      },
    });

    actionRegistry.evaluatePreconditions.mockResolvedValue({
      ok: true,
      failures: [],
      advisories: [],
      action: actionRegistry.getDefinition(),
    });

    plannerOrchestration.evaluatePendingAction.mockResolvedValue({
      allowed: false,
      escalationRequired: true,
      reasons: ["Planner policy blocked this execution"],
      advisories: [],
      contextDigest: {
        generatedAt: new Date().toISOString(),
        pendingApprovals: 9,
        openRegisters: 0,
        forecastRiskSignals: {
          lowConfidencePredictions: 0,
          staleRuns: 0,
          highUrgencyReplenishments: 0,
        },
      },
    });

    const result = await controller.confirmAction(
      { actionId: "a-2", confirm: true },
      {
        merchantId: "m-1",
        staffRole: "OWNER",
        staffId: "c36f56a2-29f3-4e2a-b4ee-d95f2fc4ad49",
      },
    );

    expect(result.success).toBe(false);
    expect(result.action?.type).toBe("planner_blocked");
    expect(result.planner_decision?.allowed).toBe(false);
    expect(dispatcherService.execute).not.toHaveBeenCalled();
    expect(copilotAiService.recordApprovalState).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "a-2",
        state: "denied",
      }),
    );
  });

  it("fails with service unavailable when approvals table is missing", async () => {
    const { controller, pool } = makeController();

    pool.query.mockResolvedValue({ rows: [{ ready: false }] });

    await expect(
      controller.listApprovals("pending", undefined, "10", "0", {
        merchantId: "m-1",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("fails confirmAction with service unavailable when approvals table is missing", async () => {
    const { controller, pool, copilotAiService, actionRegistry } =
      makeController();

    copilotAiService.getPendingAction.mockResolvedValue({
      id: "a-503",
      merchantId: "m-1",
      intent: "CREATE_ORDER",
      command: {
        intent: "CREATE_ORDER",
        entities: {
          expense: null,
          stockUpdate: null,
          paymentLink: null,
          vipTag: null,
          dateRange: null,
          order: { items: [{ name: "منتج", quantity: 1 }] },
        },
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      status: "pending",
      source: "portal",
    });

    actionRegistry.getDefinition.mockReturnValue({
      intent: "CREATE_ORDER",
      destructive: true,
      riskTier: "high",
      preconditions: [],
      compensationHints: [],
      compensation: {
        strategy: "reverse_operation",
        requiresManagerReview: false,
        runbookHints: [],
      },
    });

    pool.query.mockResolvedValue({ rows: [{ ready: false }] });

    await expect(
      controller.confirmAction(
        { actionId: "a-503", confirm: true },
        { merchantId: "m-1", staffRole: "OWNER" },
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
