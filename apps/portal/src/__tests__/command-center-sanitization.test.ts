import { describe, expect, test } from "vitest";
import { sanitizeCommandCenterPayload } from "@/app/merchant/command-center/page";

describe("command center payload sanitization", () => {
  test("normalizes malformed payloads into safe view data", () => {
    const snapshot = sanitizeCommandCenterPayload({
      overviewResp: {
        planner: {
          totalRuns24h: "11",
          failedRuns24h: "bad",
          skippedRuns24h: "2",
        },
        approvals: {
          pending: "3",
        },
        connectors: {
          runtimePending: null,
          dlqOpen: "5",
        },
        policy: {
          simulations7d: "n/a",
        },
      },
      feedResp: {
        items: [
          {
            id: 1,
            severity: "critical",
            title: "",
            message: null,
            referenceId: "",
            createdAt: "not-a-date",
          },
        ],
      },
      runsResp: {
        runs: [
          {
            id: 7,
            trigger_type: null,
            trigger_key: "",
            run_status: "BROKEN",
            reason: 12,
            started_at: "invalid",
          },
        ],
      },
      runtimeResp: {
        pendingQueue: "4",
        retryQueue: "1",
        dlqOpen: "2",
        processingLagSeconds: "61",
        oldestPendingAt: 100,
      },
      breachesResp: {
        items: [
          {
            breachEventId: 7,
            orderId: null,
            orderNumber: "",
            branchId: 123,
            slaType: null,
            minutesDelta: "45",
            reason: null,
            observedAt: "invalid",
            remediation: {
              state: "INVALID_STATE",
              escalationLevel: "L9",
              escalationRequired: "yes",
              recommendedAction: null,
              acknowledgedAt: 200,
              acknowledgedBy: null,
              alreadyEscalated: "true",
            },
          },
        ],
      },
      executionResp: {
        items: [
          {
            runId: 13,
            runStatus: "BROKEN",
            triggerType: "WRONG",
            triggerKey: "",
            startedAt: "invalid",
            completedAt: 100,
            reason: 15,
            replaySafeNow: "yes",
            recommendedAction: "DO_ANYTHING",
            replayGate: {
              allowed: "true",
              reason: 25,
              gateType: null,
              usedAiCallsToday: "7",
              usedTokensToday: "100",
              budgetAiCallsDaily: "20",
              budgetTokensDaily: "500",
            },
            domainTruth: {
              pendingApprovalsForTrigger: "2",
              pendingApprovalsGlobal: "4",
              connectorDlqOpen: "3",
              connectorRuntimePending: "5",
              deliveryBreaches24h: "1",
            },
          },
        ],
        total: "1",
        limit: "12",
        offset: "0",
        domainTruthSummary: {
          pendingApprovalsGlobal: "4",
          connectorDlqOpen: "3",
          connectorRuntimePending: "5",
          deliveryBreaches24h: "1",
        },
      },
    });

    expect(snapshot.overview.planner.totalRuns24h).toBe(11);
    expect(snapshot.overview.planner.failedRuns24h).toBe(0);
    expect(snapshot.overview.approvals.pending).toBe(3);
    expect(snapshot.runtimeHealth.processingLagSeconds).toBe(61);

    expect(snapshot.feed).toHaveLength(1);
    expect(snapshot.feed[0].severity).toBe("low");
    expect(snapshot.feed[0].title).toBe("تنبيه تشغيلي");
    expect(snapshot.feed[0].message).toBe("لا يوجد وصف إضافي.");

    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.runs[0].run_status).toBe("FAILED");
    expect(snapshot.runs[0].trigger_type).toBe("UNKNOWN");
    expect(snapshot.runs[0].trigger_key).toBe("-");

    expect(snapshot.breaches).toHaveLength(1);
    expect(snapshot.breaches[0].breachEventId).toBe("breach-1");
    expect(snapshot.breaches[0].orderNumber).toBe("-");
    expect(snapshot.breaches[0].slaType).toBe("unknown");
    expect(snapshot.breaches[0].minutesDelta).toBe(45);
    expect(snapshot.breaches[0].remediation.state).toBe("PENDING_ACK");
    expect(snapshot.breaches[0].remediation.escalationLevel).toBe("L0");
    expect(snapshot.breaches[0].remediation.escalationRequired).toBe(false);
    expect(snapshot.breaches[0].remediation.alreadyEscalated).toBe(false);

    expect(snapshot.executionVisibility.items).toHaveLength(1);
    expect(snapshot.executionVisibility.items[0].runStatus).toBe("FAILED");
    expect(snapshot.executionVisibility.items[0].triggerType).toBe("ON_DEMAND");
    expect(snapshot.executionVisibility.items[0].recommendedAction).toBe(
      "MONITOR",
    );
    expect(
      snapshot.executionVisibility.items[0].domainTruth
        .pendingApprovalsForTrigger,
    ).toBe(2);
    expect(
      snapshot.executionVisibility.domainTruthSummary.connectorDlqOpen,
    ).toBe(3);
  });

  test("returns empty feed and runs when list payloads are missing", () => {
    const snapshot = sanitizeCommandCenterPayload({
      overviewResp: {},
      feedResp: { items: null },
      runsResp: { runs: undefined },
      runtimeResp: {},
      breachesResp: { items: null },
      executionResp: null,
    });

    expect(snapshot.feed).toEqual([]);
    expect(snapshot.runs).toEqual([]);
    expect(snapshot.breaches).toEqual([]);
    expect(snapshot.executionVisibility.items).toEqual([]);
    expect(snapshot.runtimeHealth.pendingQueue).toBe(0);
  });
});
