import { CashierCopilotService } from "./cashier-copilot.service";

describe("CashierCopilotService", () => {
  it("returns approval-gated review action when pending approvals exist", async () => {
    const pool = {
      query: jest.fn(),
    } as any;

    const plannerContextAssembler = {
      assemble: jest.fn().mockResolvedValue({
        merchantId: "m-1",
        generatedAt: new Date().toISOString(),
        operational: {
          todayOrders: 7,
          todayRevenue: 1200,
          openConversations: 1,
          pendingApprovals: 3,
        },
        pos: {
          openRegisters: 0,
          activeDrafts: 2,
          todayCashierOrders: 4,
          todayCashierRevenue: 500,
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
      }),
    } as any;

    const service = new CashierCopilotService(pool, plannerContextAssembler);
    const response = await service.buildSuggestions({ merchantId: "m-1" });

    const reviewApprovals = response.suggestions.find(
      (item) => item.action?.kind === "review_approvals",
    );
    expect(reviewApprovals).toBeDefined();
    expect(reviewApprovals?.action?.requiresApproval).toBe(true);
  });
});
