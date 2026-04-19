import { BadRequestException } from "@nestjs/common";
import { PortalCallsController } from "./portal-calls.controller";

describe("PortalCallsController advanced call-center ops", () => {
  function makeController(
    impl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
  ) {
    const query = jest.fn(impl);
    const notificationsService = {
      getDeliveryConfigStatus: jest
        .fn()
        .mockReturnValue({ whatsapp: { configured: true } }),
      sendBroadcastWhatsApp: jest.fn().mockResolvedValue(undefined),
    };
    const auditService = {
      logFromRequest: jest.fn().mockResolvedValue(undefined),
    };
    const pool = {
      query,
      connect: jest.fn().mockResolvedValue({
        query,
        release: jest.fn(),
      }),
    } as any;

    return {
      controller: new PortalCallsController(
        pool,
        notificationsService as any,
        auditService as any,
      ),
      queryMock: query as jest.Mock,
      notificationsServiceMock: notificationsService,
      auditServiceMock: auditService,
    };
  }

  const req = { merchantId: "m-1" } as any;

  it("returns follow-up queue with bounded pagination and deterministic priority", async () => {
    const now = Date.now();
    const { controller, queryMock } = makeController(async (sql: string) => {
      if (sql.includes("COUNT(*)::text as total")) {
        return { rows: [{ total: "2" }] };
      }

      if (
        sql.includes(
          "COALESCE(attempts.missed_attempts, 0)::text as missed_attempts",
        )
      ) {
        return {
          rows: [
            {
              id: "call-1",
              call_sid: "CA100",
              customer_phone: "+201000000001",
              started_at: new Date(now - 25 * 60000),
              ended_at: new Date(now - 23 * 60000),
              duration_seconds: 120,
              handled_by: "staff",
              status: "missed",
              order_id: null,
              recording_url: "https://example.com/rec-1",
              missed_attempts: "3",
              last_attempt_at: new Date(now - 25 * 60000),
            },
            {
              id: "call-2",
              call_sid: "CA101",
              customer_phone: "+201000000002",
              started_at: new Date(now - 20 * 60000),
              ended_at: new Date(now - 19 * 60000),
              duration_seconds: 45,
              handled_by: "ai",
              status: "missed",
              order_id: "ord-2",
              recording_url: null,
              missed_attempts: "1",
              last_attempt_at: new Date(now - 20 * 60000),
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await controller.getFollowUpQueue(
      req,
      "999",
      "0",
      "48",
      "false",
      "all",
    );

    expect(queryMock).toHaveBeenCalledTimes(2);
    const listParams = queryMock.mock.calls[1][1] as unknown[];
    expect(listParams[listParams.length - 2]).toBe(100);

    expect(result.total).toBe(2);
    expect(result.queue).toHaveLength(2);
    expect(result.queue[0]).toMatchObject({
      callId: "call-1",
      missedAttempts: 3,
      priority: "high",
      requiresRecovery: true,
    });
    expect(result.queue[1]).toMatchObject({
      callId: "call-2",
      missedAttempts: 1,
      priority: "low",
      requiresRecovery: false,
      workflowState: "OPEN",
    });
  });

  it("falls back to queue query without workflow join if workflow table is not migrated", async () => {
    let firstWorkflowTotalAttempt = true;

    const { controller } = makeController(async (sql: string) => {
      if (
        sql.includes("COUNT(*)::text as total") &&
        sql.includes("call_followup_workflows") &&
        firstWorkflowTotalAttempt
      ) {
        firstWorkflowTotalAttempt = false;
        throw new Error('relation "call_followup_workflows" does not exist');
      }

      if (sql.includes("COUNT(*)::text as total")) {
        return { rows: [{ total: "1" }] };
      }

      if (
        sql.includes(
          "COALESCE(attempts.missed_attempts, 0)::text as missed_attempts",
        )
      ) {
        return {
          rows: [
            {
              id: "call-legacy-1",
              call_sid: "CALEGACY",
              customer_phone: "+201011111111",
              started_at: new Date(Date.now() - 60 * 60000),
              ended_at: null,
              duration_seconds: null,
              handled_by: "ai",
              status: "missed",
              order_id: null,
              recording_url: null,
              missed_attempts: "2",
              last_attempt_at: new Date(Date.now() - 60 * 60000),
              workflow_state: "OPEN",
              claimed_by: null,
              assigned_to: null,
              disposition: null,
              callback_due_at: null,
              workflow_updated_at: null,
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await controller.getFollowUpQueue(
      req,
      "10",
      "0",
      "24",
      "false",
      "all",
    );

    expect(result.total).toBe(1);
    expect(result.queue[0]).toMatchObject({
      callId: "call-legacy-1",
      workflowState: "OPEN",
      disposition: null,
    });
  });

  it("returns aggregated agent performance rates", async () => {
    const { controller } = makeController(async (sql: string) => {
      if (sql.includes("GROUP BY LOWER(COALESCE(handled_by, 'ai'))")) {
        return {
          rows: [
            {
              handled_by: "staff",
              total_calls: "6",
              completed_calls: "4",
              missed_calls: "1",
              active_calls: "1",
              orders_from_calls: "3",
              avg_duration_seconds: "75",
            },
            {
              handled_by: "ai",
              total_calls: "4",
              completed_calls: "3",
              missed_calls: "1",
              active_calls: "0",
              orders_from_calls: "1",
              avg_duration_seconds: "45",
            },
          ],
        };
      }

      if (sql.includes("COUNT(*)::text as total_calls")) {
        return {
          rows: [
            {
              total_calls: "10",
              completed_calls: "7",
              missed_calls: "2",
              orders_from_calls: "4",
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await controller.getAgentPerformance(req, "7", "10", "all");

    expect(result.totalCalls).toBe(10);
    expect(result.completedCalls).toBe(7);
    expect(result.missedCalls).toBe(2);
    expect(result.conversionRatePct).toBe(40);
    expect(result.agents).toHaveLength(2);
    expect(result.agents[0]).toMatchObject({
      handledBy: "staff",
      totalCalls: 6,
      completedCalls: 4,
      ordersFromCalls: 3,
      avgDurationSeconds: 75,
    });
    expect(result.agents[0].completionRatePct).toBeCloseTo(66.67, 2);
  });

  it("returns queue-health pressure metrics", async () => {
    const { controller } = makeController(async (sql: string) => {
      if (sql.includes("calls_previous_window")) {
        return {
          rows: [
            {
              calls_window: "20",
              calls_previous_window: "10",
              completed_window: "13",
              missed_window: "5",
              ai_window: "8",
              staff_window: "12",
              avg_duration_window: "95",
              active_live: "6",
              oldest_live_seconds: "1100",
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await controller.getQueueHealth(req, "60", "15");

    expect(result.callsInWindow).toBe(20);
    expect(result.callsInPreviousWindow).toBe(10);
    expect(result.callVolumeTrendPct).toBe(100);
    expect(result.serviceLevelPct).toBe(75);
    expect(result.missedRatePct).toBe(25);
    expect(result.staffCoveragePct).toBe(60);
    expect(result.pressureScore).toBe(59);
    expect(result.healthState).toBe("elevated");
  });

  it("returns safe queue-health fallback when voice_calls table is unavailable", async () => {
    const { controller } = makeController(async () => {
      throw new Error('relation "voice_calls" does not exist');
    });

    const result = await controller.getQueueHealth(req, "60", "15");

    expect(result).toMatchObject({
      callsInWindow: 0,
      missedInWindow: 0,
      pressureScore: 0,
      healthState: "stable",
    });
  });

  it("rejects invalid handledBy values", async () => {
    const { controller, queryMock } = makeController(async () => ({
      rows: [],
    }));

    await expect(
      controller.getAgentPerformance(req, "7", "10", "operator"),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryMock).not.toHaveBeenCalled();
  });

  it("claims follow-up workflow and records deterministic operator action", async () => {
    const callId = "11111111-1111-4111-8111-111111111111";

    const { controller, queryMock } = makeController(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }

      if (sql.includes("pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: true }] as any[] };
      }

      if (
        sql.includes("FROM voice_calls vc") &&
        sql.includes("call_followup_workflows")
      ) {
        return {
          rows: [
            {
              call_id: callId,
              call_status: "missed",
              customer_phone: "+201000000010",
              order_id: null,
              workflow_state: "OPEN",
              claimed_by: null,
              assigned_to: null,
              disposition: null,
              callback_due_at: null,
              workflow_metadata: {},
              workflow_updated_at: null,
            },
          ],
        };
      }

      if (sql.includes("INSERT INTO call_followup_workflows")) {
        return {
          rows: [
            {
              state: "CLAIMED",
              claimed_by: "ops-supervisor-1",
              assigned_to: null,
              disposition: null,
              callback_due_at: null,
              resolved_at: null,
              updated_at: new Date(),
            },
          ],
        };
      }

      if (sql.includes("INSERT INTO call_followup_workflow_events")) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await controller.claimFollowUpQueueItem(req, callId, {
      actorId: "ops-supervisor-1",
      note: "Taking ownership",
    });

    expect(result.workflowState).toBe("CLAIMED");
    expect(result.claimedBy).toBe("ops-supervisor-1");
    expect(result.action).toBe("CLAIM");
    expect(
      queryMock.mock.calls.some((entry) =>
        String(entry[0]).includes("INSERT INTO call_followup_workflow_events"),
      ),
    ).toBe(true);
  });

  it("resolves follow-up with callback disposition and marks callback candidate", async () => {
    const callId = "22222222-2222-4222-8222-222222222222";
    const callbackDueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const { controller } = makeController(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }

      if (sql.includes("pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: true }] as any[] };
      }

      if (
        sql.includes("FROM voice_calls vc") &&
        sql.includes("call_followup_workflows")
      ) {
        return {
          rows: [
            {
              call_id: callId,
              call_status: "missed",
              customer_phone: "+201000000020",
              order_id: null,
              workflow_state: "ASSIGNED",
              claimed_by: "ops-supervisor-2",
              assigned_to: "agent-4",
              disposition: null,
              callback_due_at: null,
              workflow_metadata: {},
              workflow_updated_at: null,
            },
          ],
        };
      }

      if (sql.includes("INSERT INTO call_followup_workflows")) {
        return {
          rows: [
            {
              state: "RESOLVED",
              claimed_by: "ops-supervisor-2",
              assigned_to: "agent-4",
              disposition: "CALLBACK_REQUESTED",
              callback_due_at: callbackDueAt,
              resolved_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }

      if (sql.includes("INSERT INTO call_followup_workflow_events")) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await controller.resolveFollowUpQueueItem(req, callId, {
      actorId: "ops-supervisor-2",
      disposition: "CALLBACK_REQUESTED",
      note: "Customer asked for evening callback",
      callbackDelayMinutes: 120,
    });

    expect(result.workflowState).toBe("RESOLVED");
    expect(result.disposition).toBe("CALLBACK_REQUESTED");
    expect(result.campaignCallbackCandidate).toBe(true);
    expect(result.callbackDueAt).toEqual(callbackDueAt);
  });

  it("creates callback bridge draft from resolved callback cohort with workflow-event linkage", async () => {
    const { controller, queryMock, auditServiceMock } = makeController(
      async (sql: string) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }

        if (sql.includes("pg_advisory_xact_lock")) {
          return { rows: [{ pg_advisory_xact_lock: true }] as any[] };
        }

        if (sql.includes("WITH eligible AS (")) {
          return {
            rows: [
              {
                call_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                workflow_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                customer_phone: "+201011111111",
                customer_name: "Customer One",
                callback_due_at: new Date(Date.now() + 30 * 60 * 1000),
              },
              {
                call_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                workflow_event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                customer_phone: "+201022222222",
                customer_name: "Customer Two",
                callback_due_at: new Date(Date.now() + 45 * 60 * 1000),
              },
            ],
          };
        }

        if (sql.includes("INSERT INTO callback_campaign_bridges")) {
          return {
            rows: [
              {
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                status: "DRAFT",
                created_at: new Date(),
              },
            ],
          };
        }

        if (sql.includes("INSERT INTO callback_campaign_bridge_items")) {
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await controller.createCallbackCampaignBridgeDraft(req, {
      actorId: "ops-bridge-1",
      maxRecipients: 100,
      dueWithinHours: 24,
    });

    expect(result.created).toBe(true);
    expect(result.bridge).toBeDefined();
    expect(result.recipients).toBeDefined();

    const bridge = result.bridge as NonNullable<typeof result.bridge>;
    const recipients = result.recipients as NonNullable<
      typeof result.recipients
    >;

    expect(bridge.targetCount).toBe(2);
    expect(recipients).toHaveLength(2);
    expect(recipients[0].workflowEventId).toBe(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(
      queryMock.mock.calls.some((entry) =>
        String(entry[0]).includes("INSERT INTO callback_campaign_bridge_items"),
      ),
    ).toBe(true);
    expect(auditServiceMock.logFromRequest).toHaveBeenCalled();
  });

  it("approves callback bridge draft explicitly before execution", async () => {
    const { controller, auditServiceMock } = makeController(
      async (sql: string) => {
        if (
          sql.includes("UPDATE callback_campaign_bridges") &&
          sql.includes("status = 'APPROVED'")
        ) {
          return {
            rows: [
              {
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                status: "APPROVED",
                approved_at: new Date(),
                target_count: 5,
                message_template: "مرحبا {name}",
                discount_code: "CALLBACK10",
                inactive_days: 30,
                callback_due_before: new Date(),
              },
            ],
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const result = await controller.approveCallbackCampaignBridgeDraft(
      req,
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      {
        actorId: "ops-approver-1",
        note: "Verified callback cohort",
      },
    );

    expect(result.approved).toBe(true);
    expect(result.bridge.status).toBe("APPROVED");
    expect(auditServiceMock.logFromRequest).toHaveBeenCalled();
  });

  it("rejects callback bridge execution when draft is not approved", async () => {
    const { controller, notificationsServiceMock } = makeController(
      async (sql: string) => {
        if (
          sql.includes("UPDATE callback_campaign_bridges") &&
          sql.includes("status = 'EXECUTING'")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("SELECT status") &&
          sql.includes("callback_campaign_bridges")
        ) {
          return {
            rows: [{ status: "DRAFT" }],
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    await expect(
      controller.executeCallbackCampaignBridgeDraft(
        req,
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        { actorId: "ops-exec-1" },
      ),
    ).rejects.toThrow("must be approved");

    expect(
      notificationsServiceMock.sendBroadcastWhatsApp,
    ).not.toHaveBeenCalled();
  });
});
