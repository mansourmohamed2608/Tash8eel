import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockToast, portalApiMock } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  portalApiMock: {
    getControlPlaneCommandCenterOverview: vi.fn(),
    getControlPlaneCommandCenterFeed: vi.fn(),
    getControlPlaneExecutionVisibility: vi.fn(),
    getControlPlanePlannerRuns: vi.fn(),
    getControlPlanePlannerRunDrilldown: vi.fn(),
    getControlPlanePlannerRunReplayPreview: vi.fn(),
    getControlPlaneCopilotApprovals: vi.fn(),
    acknowledgeControlPlanePlannerRunTriage: vi.fn(),
    getErpRuntimeHealth: vi.fn(),
    getDeliverySlaBreaches: vi.fn(),
    executeDeliverySlaEscalation: vi.fn(),
    executeOpenDeliverySlaEscalations: vi.fn(),
    acknowledgeDeliverySlaBreach: vi.fn(),
    retryOpenErpRuntimeDlq: vi.fn(),
    replayControlPlanePlannerRun: vi.fn(),
  } as any,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock("@/lib/client", () => ({
  portalApi: portalApiMock,
}));

import MerchantCommandCenterPage from "@/app/merchant/command-center/page";

describe("Command center delivery escalation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    portalApiMock.getControlPlaneCommandCenterOverview.mockResolvedValue({
      planner: {
        totalRuns24h: 10,
        failedRuns24h: 1,
        skippedRuns24h: 1,
      },
      approvals: { pending: 0 },
      connectors: { runtimePending: 0, dlqOpen: 0 },
      delivery: { recentEvents24h: 3 },
      policy: { simulations7d: 0 },
    });

    portalApiMock.getControlPlaneCommandCenterFeed.mockResolvedValue({
      items: [],
    });

    portalApiMock.getControlPlanePlannerRuns.mockResolvedValue({
      runs: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    portalApiMock.getControlPlaneExecutionVisibility.mockResolvedValue({
      items: [],
      total: 0,
      limit: 12,
      offset: 0,
      domainTruthSummary: {
        pendingApprovalsGlobal: 0,
        connectorDlqOpen: 0,
        connectorRuntimePending: 0,
        deliveryBreaches24h: 0,
      },
    });

    portalApiMock.getErpRuntimeHealth.mockResolvedValue({
      pendingQueue: 0,
      retryQueue: 0,
      dlqOpen: 0,
      processingLagSeconds: 0,
      oldestPendingAt: null,
    });

    portalApiMock.getDeliverySlaBreaches.mockResolvedValue({
      total: 1,
      items: [
        {
          breachEventId: "breach-101",
          orderId: "order-101",
          orderNumber: "ORD-101",
          branchId: "branch-1",
          slaType: "dispatch_eta",
          minutesDelta: 43,
          reason: "Driver delayed",
          observedAt: new Date().toISOString(),
          remediation: {
            state: "ESCALATION_REQUIRED",
            escalationLevel: "L2",
            escalationRequired: true,
            recommendedAction: "ESCALATE_TO_DISPATCH_LEAD",
            acknowledgedAt: null,
            acknowledgedBy: null,
            alreadyEscalated: false,
          },
        },
      ],
    });

    portalApiMock.executeDeliverySlaEscalation.mockResolvedValue({
      executed: true,
      alreadyEscalated: true,
      skippedReason: null,
    });

    portalApiMock.executeOpenDeliverySlaEscalations.mockResolvedValue({
      total: 1,
      escalatedCount: 1,
      alreadyEscalatedCount: 0,
      skippedCount: 0,
    });

    portalApiMock.acknowledgeDeliverySlaBreach.mockResolvedValue({
      breachEventId: "breach-101",
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: "portal:command-center",
    });

    portalApiMock.retryOpenErpRuntimeDlq.mockResolvedValue({ retriedCount: 0 });
    portalApiMock.replayControlPlanePlannerRun.mockResolvedValue({
      allowed: true,
    });
    portalApiMock.acknowledgeControlPlanePlannerRunTriage.mockResolvedValue({
      acknowledgement: {
        id: "triage-1",
        run_id: "run-1",
      },
    });
    portalApiMock.getControlPlaneCopilotApprovals.mockResolvedValue({
      success: true,
      approvals: [
        {
          actionId: "approval-1",
          intent: "APPROVE_PAYMENT_PROOF",
          source: "portal",
          status: "pending",
          actorRole: null,
          actorId: null,
          previewSummary: "manual confirmation required",
          riskTier: "medium",
          timeline: {
            updatedAt: new Date().toISOString(),
          },
        },
      ],
      pagination: {
        total: 1,
        limit: 30,
        offset: 0,
      },
    });
    portalApiMock.getControlPlanePlannerRunReplayPreview.mockResolvedValue({
      sourceRun: {
        id: "run-1",
        triggerType: "EVENT",
        triggerKey: "APPROVE_PAYMENT_PROOF",
        runStatus: "FAILED",
        reason: "awaiting approval",
        startedAt: new Date().toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
      },
      confirmationRequired: true,
      allowedToReplayNow: true,
      predictedReplayRunStatus: "STARTED",
      budgetGate: {
        allowed: true,
        reason: null,
        gateType: "no_policy",
        usedAiCallsToday: 0,
        usedTokensToday: 0,
        budgetAiCallsDaily: 0,
        budgetTokensDaily: 0,
      },
      safetySummary: {
        pendingApprovalsForTrigger: 1,
        replayAttemptsForSource: 1,
        latestReplayAt: null,
        connectorDlqOpenForTrigger: 0,
      },
      operatorNotePolicy: {
        required: true,
        minLength: 8,
        maxLength: 240,
      },
      binding: {
        previewToken: "preview-token-1",
        previewTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        previewContextHash: "hash-1",
      },
      blockingReasons: [],
      previewGeneratedAt: new Date().toISOString(),
    });
    portalApiMock.getControlPlanePlannerRunDrilldown.mockResolvedValue({
      run: {
        id: "run-1",
        triggerType: "EVENT",
        triggerKey: "APPROVE_PAYMENT_PROOF",
        requestedBy: "operator-1",
        runStatus: "FAILED",
        reason: "awaiting approval",
        contextDigest: {},
        costTokens: 0,
        costAiCalls: 0,
        correlationId: "corr-1",
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
      },
      replaySafety: {
        replaySafeNow: true,
        gate: {
          allowed: true,
          reason: null,
          gateType: "no_policy",
          usedAiCallsToday: 0,
          usedTokensToday: 0,
          budgetAiCallsDaily: 0,
          budgetTokensDaily: 0,
        },
      },
      recommendedNextAction: "REVIEW_PENDING_APPROVALS",
      correlatedEvidence: {
        approvals: [
          {
            action_id: "approval-1",
            intent: "APPROVE_PAYMENT_PROOF",
            source: "copilot",
            status: "pending",
            actor_role: null,
            actor_id: null,
            updated_at: new Date().toISOString(),
          },
        ],
        replayAttempts: [
          {
            id: "run-1",
            run_status: "FAILED",
            reason: "awaiting approval",
            started_at: new Date().toISOString(),
            correlation_id: "corr-1",
            replay_of_run_id: null,
          },
        ],
        connectorRuntime: [
          {
            id: "runtime-1",
            event_type: "APPROVE_PAYMENT_PROOF",
            status: "RETRY",
            attempt_count: 1,
            max_attempts: 5,
            last_error: "timeout",
            updated_at: new Date().toISOString(),
          },
        ],
        connectorDlq: [
          {
            id: "dlq-1",
            event_type: "APPROVE_PAYMENT_PROOF",
            status: "OPEN",
            last_error: "timeout",
            moved_to_dlq_at: new Date().toISOString(),
            replay_count: 0,
          },
        ],
        deliveryBreaches: [
          {
            id: "sla-1",
            order_number: "ORD-101",
            sla_type: "APPROVE_PAYMENT_PROOF",
            status: "BREACHED",
            observed_at: new Date().toISOString(),
            minutes_delta: 22,
            reason: "delay",
          },
        ],
        replayConsumptions: [
          {
            id: "consume-1",
            source_run_id: "run-1",
            replay_run_id: "run-replay-1",
            preview_token_hash: "hash-abc",
            preview_context_hash: "ctx-abc",
            operator_note: "verified preconditions",
            consumed_by: "operator-1",
            consumed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        triageAcks: [
          {
            id: "triage-1",
            run_id: "run-1",
            recommended_action: "REVIEW_PENDING_APPROVALS",
            ack_status: "acknowledged",
            ack_note: "reviewed pending approvals",
            acked_by: "operator-1",
            acked_at: new Date().toISOString(),
            metadata: {},
            created_at: new Date().toISOString(),
          },
        ],
      },
      stats: {
        pendingApprovals: 1,
        replayAttempts: 1,
        connectorRuntimeRows: 1,
        connectorDlqOpen: 1,
        deliveryActiveBreaches: 1,
        replayTokenConsumptions: 1,
        triageAcknowledgements: 1,
      },
    });
  });

  test("executes single and batch SLA escalations from operator UI", async () => {
    const user = userEvent.setup();
    render(<MerchantCommandCenterPage />);

    await screen.findByText(/ORD-101/);

    const singleEscalationButton = screen.getByRole("button", {
      name: "تصعيد الآن",
    });
    await user.click(singleEscalationButton);

    await waitFor(() => {
      expect(portalApiMock.executeDeliverySlaEscalation).toHaveBeenCalledWith(
        "breach-101",
        expect.objectContaining({ escalatedBy: "portal:command-center" }),
      );
    });

    const acknowledgeButton = screen.getByRole("button", { name: "إقرار" });
    await user.click(acknowledgeButton);

    await waitFor(() => {
      expect(portalApiMock.acknowledgeDeliverySlaBreach).toHaveBeenCalledWith(
        "breach-101",
        expect.objectContaining({ acknowledgedBy: "portal:command-center" }),
      );
    });

    const batchEscalationButton = screen.getByRole("button", {
      name: "تصعيد الكل المفتوح",
    });
    await user.click(batchEscalationButton);

    await waitFor(() => {
      expect(
        portalApiMock.executeOpenDeliverySlaEscalations,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 25,
          escalatedBy: "portal:command-center",
        }),
      );
    });
  });

  test("opens planner run drilldown drawer and loads correlated evidence", async () => {
    const user = userEvent.setup();

    portalApiMock.getControlPlanePlannerRuns.mockResolvedValueOnce({
      runs: [
        {
          id: "run-1",
          trigger_type: "EVENT",
          trigger_key: "APPROVE_PAYMENT_PROOF",
          run_status: "FAILED",
          reason: "awaiting approval",
          started_at: new Date().toISOString(),
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<MerchantCommandCenterPage />);

    await screen.findByText(/APPROVE_PAYMENT_PROOF/);
    const detailsButton = screen.getByRole("button", {
      name: "تفاصيل التشغيل",
    });
    await user.click(detailsButton);

    await waitFor(() => {
      expect(
        portalApiMock.getControlPlanePlannerRunDrilldown,
      ).toHaveBeenCalledWith("run-1");
    });

    await screen.findByText("تفاصيل تشغيل المشغل");
    expect(screen.getByText("الموافقات المرتبطة")).toBeInTheDocument();
    expect(screen.getByText("Connector DLQ")).toBeInTheDocument();
  });

  test("requires replay dry-run preview and explicit confirmation before replay", async () => {
    const user = userEvent.setup();

    portalApiMock.getControlPlanePlannerRuns.mockResolvedValueOnce({
      runs: [
        {
          id: "run-1",
          trigger_type: "EVENT",
          trigger_key: "APPROVE_PAYMENT_PROOF",
          run_status: "FAILED",
          reason: "awaiting approval",
          started_at: new Date().toISOString(),
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<MerchantCommandCenterPage />);

    await screen.findByText(/APPROVE_PAYMENT_PROOF/);
    const replayButton = screen.getByRole("button", { name: "إعادة تشغيل" });
    await user.click(replayButton);

    await waitFor(() => {
      expect(
        portalApiMock.getControlPlanePlannerRunReplayPreview,
      ).toHaveBeenCalledWith("run-1");
    });

    await screen.findByText("معاينة إعادة التشغيل قبل التنفيذ");
    await user.type(
      screen.getByPlaceholderText(
        "اشرح سبب إعادة التشغيل وما الذي تحققته قبل التنفيذ...",
      ),
      "operator validated budget and approvals",
    );

    const confirmReplayButton = screen.getByRole("button", {
      name: "تأكيد إعادة التشغيل الآن",
    });
    await user.click(confirmReplayButton);

    await waitFor(() => {
      expect(portalApiMock.replayControlPlanePlannerRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          reason: "operator validated budget and approvals",
          confirmReplay: true,
          previewToken: "preview-token-1",
        }),
      );
    });
  });

  test("opens filtered approvals handoff when recommended action is REVIEW_PENDING_APPROVALS", async () => {
    const user = userEvent.setup();

    portalApiMock.getControlPlanePlannerRuns.mockResolvedValueOnce({
      runs: [
        {
          id: "run-1",
          trigger_type: "EVENT",
          trigger_key: "APPROVE_PAYMENT_PROOF",
          run_status: "FAILED",
          reason: "awaiting approval",
          started_at: new Date().toISOString(),
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<MerchantCommandCenterPage />);

    await screen.findByText(/APPROVE_PAYMENT_PROOF/);
    await user.click(screen.getByRole("button", { name: "تفاصيل التشغيل" }));

    await screen.findByText("تفاصيل تشغيل المشغل");
    await user.click(screen.getByRole("button", { name: "مراجعة الموافقات" }));

    await waitFor(() => {
      expect(
        portalApiMock.getControlPlaneCopilotApprovals,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "pending",
          intent: "APPROVE_PAYMENT_PROOF",
        }),
      );
    });

    expect(screen.getByText("handoff الموافقات المعلقة")).toBeInTheDocument();
  });

  test("saves operator triage acknowledgement from drilldown", async () => {
    const user = userEvent.setup();

    portalApiMock.getControlPlanePlannerRuns.mockResolvedValueOnce({
      runs: [
        {
          id: "run-1",
          trigger_type: "EVENT",
          trigger_key: "APPROVE_PAYMENT_PROOF",
          run_status: "FAILED",
          reason: "awaiting approval",
          started_at: new Date().toISOString(),
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<MerchantCommandCenterPage />);

    await screen.findByText(/APPROVE_PAYMENT_PROOF/);
    await user.click(screen.getByRole("button", { name: "تفاصيل التشغيل" }));

    await screen.findByText("تفاصيل تشغيل المشغل");
    await user.type(
      screen.getByPlaceholderText(
        "دوّن قرارك التشغيلي وما الذي تم التحقق منه...",
      ),
      "operator reviewed queue and confirmed pending actions",
    );

    await user.click(screen.getByRole("button", { name: "تسجيل متابعة" }));

    await waitFor(() => {
      expect(
        portalApiMock.acknowledgeControlPlanePlannerRunTriage,
      ).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          recommendedAction: "REVIEW_PENDING_APPROVALS",
          ackStatus: "acknowledged",
        }),
      );
    });
  });
});
