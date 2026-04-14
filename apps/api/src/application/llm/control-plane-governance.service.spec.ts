import { ControlPlaneGovernanceService } from "./control-plane-governance.service";

describe("ControlPlaneGovernanceService", () => {
  it("supports filtered planner run listing with total", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-1",
              trigger_type: "EVENT",
              trigger_key: "order.created",
              run_status: "FAILED",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: "1" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.listPlannerRuns("m-1", {
      limit: 10,
      offset: 0,
      status: "FAILED",
      triggerType: "EVENT",
      triggerKey: "order.created",
    });

    expect(result.total).toBe(1);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].id).toBe("run-1");

    const firstQuery = String(pool.query.mock.calls[0][0]);
    expect(firstQuery).toContain("run_status =");
    expect(firstQuery).toContain("trigger_type =");
    expect(firstQuery).toContain("trigger_key =");
  });

  it("supports dry-run planner replay with budget check", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-2",
              trigger_type: "ON_DEMAND",
              trigger_key: "ASK_REVENUE",
              run_status: "FAILED",
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "0" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.replayPlannerRun({
      merchantId: "m-1",
      runId: "run-2",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.sourceRunId).toBe("run-2");
    expect(pool.query).toHaveBeenCalledTimes(5);
  });

  it("builds replay preview safety summary for operator confirmation", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-preview-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting approval",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              budget_ai_calls_daily: 100,
              budget_tokens_daily: 2000,
              enabled: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ used_ai_calls: "2", used_tokens: "100" }],
        })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "2", latest_replay_at: new Date() }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "3" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.getPlannerRunReplayPreview({
      merchantId: "m-1",
      runId: "run-preview-1",
    });

    expect(result.sourceRun).toMatchObject({
      id: "run-preview-1",
      triggerType: "EVENT",
      triggerKey: "APPROVE_PAYMENT_PROOF",
      runStatus: "FAILED",
    });
    expect(result.allowedToReplayNow).toBe(true);
    expect(result.confirmationRequired).toBe(true);
    expect(result.predictedReplayRunStatus).toBe("STARTED");
    expect(result.safetySummary).toMatchObject({
      pendingApprovalsForTrigger: 1,
      replayAttemptsForSource: 2,
      connectorDlqOpenForTrigger: 3,
    });
    expect(result.binding).toEqual(
      expect.objectContaining({
        previewToken: expect.any(String),
        previewTokenExpiresAt: expect.any(String),
        previewContextHash: expect.any(String),
      }),
    );
    expect(result.operatorNotePolicy).toEqual({
      required: true,
      minLength: 8,
      maxLength: 240,
    });
  });

  it("requires explicit confirmation for non-dry replay execution", async () => {
    const pool = {
      query: jest.fn(),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    await expect(
      service.replayPlannerRun({
        merchantId: "m-1",
        runId: "run-confirm-1",
      }),
    ).rejects.toThrow("Explicit operator confirmation required");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("requires preview token when replay confirmation is provided", async () => {
    const pool = {
      query: jest.fn(),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    await expect(
      service.replayPlannerRun({
        merchantId: "m-1",
        runId: "run-confirm-2",
        confirmReplay: true,
      }),
    ).rejects.toThrow("Replay preview token is required");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects stale replay preview token", async () => {
    const baseTime = new Date("2026-04-14T10:00:00.000Z").getTime();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(baseTime);

    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-stale-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(baseTime - 60_000),
              completed_at: null,
              created_at: new Date(baseTime - 60_000),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const preview = await service.getPlannerRunReplayPreview({
      merchantId: "m-1",
      runId: "run-stale-1",
    });

    nowSpy.mockReturnValue(baseTime + 10 * 60 * 1000);

    await expect(
      service.replayPlannerRun({
        merchantId: "m-1",
        runId: "run-stale-1",
        confirmReplay: true,
        previewToken: preview.binding.previewToken,
      }),
    ).rejects.toThrow("Replay preview token expired");

    nowSpy.mockRestore();
  });

  it("requires a bounded operator replay note for confirmed replay execution", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-note-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-note-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const preview = await service.getPlannerRunReplayPreview({
      merchantId: "m-1",
      runId: "run-note-1",
    });

    await expect(
      service.replayPlannerRun({
        merchantId: "m-1",
        runId: "run-note-1",
        confirmReplay: true,
        previewToken: preview.binding.previewToken,
        reason: "short",
      }),
    ).rejects.toThrow("Operator replay note must be at least 8 characters");
  });

  it("rejects replay when preview token context no longer matches", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-mismatch-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-mismatch-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "2" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] })
        .mockResolvedValueOnce({ rows: [{ consumed_count: "0" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const preview = await service.getPlannerRunReplayPreview({
      merchantId: "m-1",
      runId: "run-mismatch-1",
    });

    await expect(
      service.replayPlannerRun({
        merchantId: "m-1",
        runId: "run-mismatch-1",
        confirmReplay: true,
        previewToken: preview.binding.previewToken,
        reason: "operator verified mismatch",
      }),
    ).rejects.toThrow(
      "Replay preview token does not match current replay context",
    );
  });

  it("rejects replay when preview token was already consumed", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-consumed-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-consumed-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] })
        .mockResolvedValueOnce({ rows: [{ consumed_count: "1" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const preview = await service.getPlannerRunReplayPreview({
      merchantId: "m-1",
      runId: "run-consumed-1",
    });

    await expect(
      service.replayPlannerRun({
        merchantId: "m-1",
        runId: "run-consumed-1",
        confirmReplay: true,
        previewToken: preview.binding.previewToken,
        reason: "operator confirmed replay once",
      }),
    ).rejects.toThrow("Replay preview token already consumed");
  });

  it("executes replay when preview token matches current context", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-match-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-match-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              run_status: "FAILED",
              reason: "awaiting",
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ replay_count: "0", latest_replay_at: null }],
        })
        .mockResolvedValueOnce({ rows: [{ open_dlq: "0" }] })
        .mockResolvedValueOnce({ rows: [{ consumed_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "claim-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "replay-run-1" }] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const preview = await service.getPlannerRunReplayPreview({
      merchantId: "m-1",
      runId: "run-match-1",
    });

    const replay = await service.replayPlannerRun({
      merchantId: "m-1",
      runId: "run-match-1",
      confirmReplay: true,
      previewToken: preview.binding.previewToken,
      reason: "operator confirmed replay",
    });

    expect(replay).toMatchObject({
      sourceRunId: "run-match-1",
      replayRunId: "replay-run-1",
      allowed: true,
      runStatus: "STARTED",
    });
  });

  it("builds command-center feed entries from multiple domains", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-feed-1",
              run_status: "FAILED",
              trigger_type: "EVENT",
              trigger_key: "order.created",
              reason: "failed",
              started_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              action_id: "approval-1",
              intent: "APPROVE_PAYMENT_PROOF",
              status: "pending",
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "dlq-1",
              event_type: "payment.received",
              last_error: "missing orderNumber",
              moved_to_dlq_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "sla-1",
              sla_type: "eta",
              reason: "traffic",
              observed_at: new Date(),
            },
          ],
        }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.getCommandCenterFeed("m-1", 10);

    expect(result.items.length).toBeGreaterThanOrEqual(4);
    expect(result.items.some((item: any) => item.category === "planner")).toBe(
      true,
    );
    expect(result.items.some((item: any) => item.category === "approval")).toBe(
      true,
    );
    expect(
      result.items.some((item: any) => item.category === "connector"),
    ).toBe(true);
    expect(result.items.some((item: any) => item.category === "delivery")).toBe(
      true,
    );
  });

  it("builds cross-domain execution visibility with replay safety hints", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-visibility-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              requested_by: null,
              run_status: "FAILED",
              reason: "connector timeout",
              context_digest: {},
              cost_tokens: 0,
              cost_ai_calls: 0,
              correlation_id: null,
              error: null,
              started_at: new Date(),
              completed_at: new Date(),
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({
          rows: [{ intent_key: "APPROVE_PAYMENT_PROOF", pending_count: "2" }],
        })
        .mockResolvedValueOnce({
          rows: [{ dlq_open: "3", runtime_pending: "4" }],
        })
        .mockResolvedValueOnce({ rows: [{ breached_24h: "1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              run_id: "run-visibility-1",
              ack_status: "acknowledged",
              ack_note: "operator already reviewed",
              acked_by: "manager-1",
              acked_at: new Date(),
              recommended_action: "REVIEW_PENDING_APPROVALS",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              budget_ai_calls_daily: 0,
              budget_tokens_daily: 0,
              enabled: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ used_ai_calls: "0", used_tokens: "0" }],
        }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.getExecutionVisibility("m-1", {
      limit: 10,
      offset: 0,
      status: "FAILED",
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      runId: "run-visibility-1",
      runStatus: "FAILED",
      replaySafeNow: true,
      recommendedAction: "REVIEW_PENDING_APPROVALS",
    });
    expect(result.items[0].domainTruth).toMatchObject({
      pendingApprovalsForTrigger: 2,
      connectorDlqOpen: 3,
      connectorRuntimePending: 4,
      deliveryBreaches24h: 1,
    });
    expect(result.items[0].triage).toMatchObject({
      ackStatus: "acknowledged",
      recommendedAction: "REVIEW_PENDING_APPROVALS",
    });
  });

  it("builds planner run drilldown with correlated evidence", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-drill-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              requested_by: "operator-1",
              run_status: "FAILED",
              reason: "awaiting approval",
              context_digest: { replayOfRunId: null },
              cost_tokens: 0,
              cost_ai_calls: 0,
              correlation_id: "corr-1",
              error: null,
              started_at: new Date(),
              completed_at: null,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              action_id: "approval-1",
              intent: "APPROVE_PAYMENT_PROOF",
              source: "copilot",
              status: "pending",
              actor_role: null,
              actor_id: null,
              details: {},
              execution_result: null,
              pending_at: new Date(),
              confirmed_at: null,
              denied_at: null,
              cancelled_at: null,
              expired_at: null,
              executing_at: null,
              executed_at: null,
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-drill-1",
              run_status: "FAILED",
              reason: "awaiting approval",
              started_at: new Date(),
              correlation_id: "corr-1",
              replay_of_run_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "runtime-1",
              endpoint_id: "ep-1",
              event_type: "APPROVE_PAYMENT_PROOF",
              status: "RETRY",
              attempt_count: 2,
              max_attempts: 5,
              last_error: "retry",
              next_retry_at: new Date(),
              processed_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "dlq-1",
              runtime_event_id: "runtime-1",
              endpoint_id: "ep-1",
              event_type: "APPROVE_PAYMENT_PROOF",
              status: "OPEN",
              last_error: "timeout",
              moved_to_dlq_at: new Date(),
              replayed_at: null,
              replay_count: 0,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "sla-1",
              order_id: "order-1",
              order_number: "ORD-1",
              sla_type: "APPROVE_PAYMENT_PROOF",
              status: "BREACHED",
              observed_at: new Date(),
              minutes_delta: 18,
              reason: "delay",
              metadata: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "consume-1",
              source_run_id: "run-drill-1",
              replay_run_id: "run-replay-1",
              preview_token_hash: "hash-abc",
              preview_context_hash: "ctx-abc",
              operator_note: "verified preconditions",
              consumed_by: "operator-1",
              consumed_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "triage-1",
              run_id: "run-drill-1",
              recommended_action: "REVIEW_PENDING_APPROVALS",
              ack_status: "acknowledged",
              ack_note: "reviewed pending approval queue",
              acked_by: "operator-1",
              acked_at: new Date(),
              metadata: {},
              created_at: new Date(),
            },
          ],
        }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.getPlannerRunDrilldown({
      merchantId: "m-1",
      runId: "run-drill-1",
    });

    expect(result.run).toMatchObject({
      id: "run-drill-1",
      triggerType: "EVENT",
      triggerKey: "APPROVE_PAYMENT_PROOF",
      runStatus: "FAILED",
    });
    expect(result.replaySafety.replaySafeNow).toBe(true);
    expect(result.recommendedNextAction).toBe("REVIEW_PENDING_APPROVALS");
    expect(result.correlatedEvidence.approvals).toHaveLength(1);
    expect(result.correlatedEvidence.connectorDlq).toHaveLength(1);
    expect(result.correlatedEvidence.replayConsumptions).toHaveLength(1);
    expect(result.correlatedEvidence.triageAcks).toHaveLength(1);
    expect(result.stats).toMatchObject({
      pendingApprovals: 1,
      connectorDlqOpen: 1,
      deliveryActiveBreaches: 1,
      replayTokenConsumptions: 1,
      triageAcknowledgements: 1,
    });
  });

  it("persists operator triage acknowledgement with bounded note", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "triage-ack-1",
              run_id: "run-ack-1",
              trigger_type: "EVENT",
              trigger_key: "APPROVE_PAYMENT_PROOF",
              recommended_action: "REVIEW_PENDING_APPROVALS",
              ack_status: "acknowledged",
              ack_note: "operator reviewed and assigned pending approvals",
              acked_by: "manager-1",
              acked_at: new Date(),
              metadata: { source: "test" },
            },
          ],
        }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.acknowledgePlannerRunTriage({
      merchantId: "m-1",
      runId: "run-ack-1",
      recommendedAction: "REVIEW_PENDING_APPROVALS",
      ackStatus: "acknowledged",
      note: "operator reviewed and assigned pending approvals",
      acknowledgedBy: "manager-1",
      metadata: { source: "test" },
    });

    expect(result.acknowledgement).toMatchObject({
      run_id: "run-ack-1",
      recommended_action: "REVIEW_PENDING_APPROVALS",
      ack_status: "acknowledged",
    });
  });
});
