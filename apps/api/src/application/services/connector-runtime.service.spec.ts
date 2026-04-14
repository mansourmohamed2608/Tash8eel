import { ConnectorRuntimeService } from "./connector-runtime.service";

describe("ConnectorRuntimeService retry backoff", () => {
  it("uses capped exponential retry delays", () => {
    const service = new ConnectorRuntimeService({} as any, {} as any);

    expect((service as any).getRetryDelaySeconds(1)).toBe(30);
    expect((service as any).getRetryDelaySeconds(2)).toBe(60);
    expect((service as any).getRetryDelaySeconds(3)).toBe(120);
    expect((service as any).getRetryDelaySeconds(4)).toBe(240);
  });

  it("caps retries at 30 minutes", () => {
    const service = new ConnectorRuntimeService({} as any, {} as any);

    expect((service as any).getRetryDelaySeconds(8)).toBe(1800);
    expect((service as any).getRetryDelaySeconds(9)).toBe(1800);
    expect((service as any).getRetryDelaySeconds(99)).toBe(1800);
  });

  it("retries open DLQ items in batch", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "dlq-1",
            runtime_event_id: "runtime-1",
          },
        ],
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.retryDlqBatch({
      merchantId: "m-1",
      limit: 10,
    });

    expect(result.retriedCount).toBe(1);
    expect(result.items[0].runtime_event_id).toBe("runtime-1");
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
  });

  it("discards a single OPEN DLQ item", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "dlq-1",
              runtime_event_id: "runtime-1",
              status: "OPEN",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "dlq-1",
              runtime_event_id: "runtime-1",
              status: "DISCARDED",
              updated_at: new Date(),
            },
          ],
        }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.discardDlq(
      "m-1",
      "dlq-1",
      "Operator confirmed duplicate event",
    );

    expect(result.discarded).toBe(true);
    expect(result.runtimeEventId).toBe("runtime-1");
    expect(result.status).toBe("DISCARDED");
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "SET status = 'DISCARDED'",
    );
  });

  it("rejects discard for non-OPEN DLQ items", async () => {
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: "dlq-1",
            runtime_event_id: "runtime-1",
            status: "REPLAYED",
          },
        ],
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);

    await expect(
      service.discardDlq("m-1", "dlq-1", "No longer needed"),
    ).rejects.toThrow("Only OPEN DLQ items can be discarded");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("discards OPEN DLQ items in batch", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "dlq-1",
            runtime_event_id: "runtime-1",
          },
          {
            id: "dlq-2",
            runtime_event_id: "runtime-2",
          },
        ],
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.discardDlqBatch({
      merchantId: "m-1",
      limit: 10,
      endpointId: "endpoint-1",
      reason: "Superseded by manual sync",
    });

    expect(result.discardedCount).toBe(2);
    expect(result.items[0].runtime_event_id).toBe("runtime-1");
    expect(result.limit).toBe(10);
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "SET status = 'DISCARDED'",
    );
  });

  it("processes claimed queue events and marks them processed", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "runtime-1",
              endpoint_id: "endpoint-1",
              event_type: "test.ping",
              payload: {},
              attempt_count: 0,
              max_attempts: 3,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const integrationService = {
      processErpEvent: jest.fn().mockResolvedValue({
        success: true,
        message: "ok",
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, integrationService);
    const result = await service.processQueue({
      merchantId: "m-1",
      limit: 5,
    });

    expect(result.totalPicked).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.movedToDlq).toBe(0);
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
  });

  it("dead-letters oversized payload events and continues processing remaining queue items", async () => {
    const oversizedPayload = { blob: "x".repeat(129 * 1024) };
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "runtime-oversized",
              endpoint_id: "endpoint-1",
              event_type: "test.ping",
              payload: oversizedPayload,
              attempt_count: 0,
              max_attempts: 5,
            },
            {
              id: "runtime-ok",
              endpoint_id: "endpoint-1",
              event_type: "test.ping",
              payload: { ok: true },
              attempt_count: 0,
              max_attempts: 3,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const integrationService = {
      processErpEvent: jest.fn().mockResolvedValue({
        success: true,
        message: "ok",
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, integrationService);
    const result = await service.processQueue({
      merchantId: "m-1",
      limit: 10,
    });

    expect(result.totalPicked).toBe(2);
    expect(result.processed).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.movedToDlq).toBe(1);
    expect(integrationService.processErpEvent).toHaveBeenCalledTimes(1);
    expect(integrationService.processErpEvent.mock.calls[0][3]).toEqual({
      ok: true,
    });
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "SET status = 'DEAD_LETTER'",
    );
    expect(pool.query.mock.calls[1][1][1]).toBe(5);
    expect(String(pool.query.mock.calls[1][1][2])).toContain(
      "Connector payload exceeds allowed size",
    );
    expect(
      pool.query.mock.calls.some((call: any[]) =>
        String(call[0]).includes("SET status = 'RETRY'"),
      ),
    ).toBe(false);
  });

  it("recovers stuck PROCESSING events with bounded threshold and limit", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: "runtime-1" }, { id: "runtime-2" }],
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.recoverStuckProcessing({
      merchantId: "m-1",
      endpointId: "endpoint-1",
      olderThanMinutes: 999,
      limit: 999,
    });

    expect(result.recoveredCount).toBe(2);
    expect(result.runtimeEventIds).toEqual(["runtime-1", "runtime-2"]);
    expect(result.items).toEqual(["runtime-1", "runtime-2"]);
    expect(result.effectiveOlderThanMinutes).toBe(240);
    expect(result.effectiveLimit).toBe(200);
    expect(result.filters).toEqual({
      endpointId: "endpoint-1",
      olderThanMinutes: 240,
      limit: 200,
    });
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "status = 'PROCESSING'",
    );
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "SET status = 'RETRY'",
    );
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
    expect(pool.query.mock.calls[0][1][2]).toBe(240);
    expect(pool.query.mock.calls[0][1][3]).toBe(200);
    expect(String(pool.query.mock.calls[0][1][4])).toContain(
      "SYSTEM_RECOVER_STUCK_PROCESSING",
    );
  });

  it("lists runtime events with status filter and total count", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: "2" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "runtime-2",
              endpoint_id: "endpoint-1",
              event_type: "order.created",
              status: "RETRY",
              created_at: new Date(),
            },
            {
              id: "runtime-1",
              endpoint_id: "endpoint-1",
              event_type: "payment.received",
              status: "RETRY",
              created_at: new Date(),
            },
          ],
        }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.listRuntimeEvents({
      merchantId: "m-1",
      status: "RETRY",
      endpointId: "endpoint-1",
      limit: 10,
      offset: 5,
    });

    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.items).toHaveLength(2);
    expect(result.filters).toEqual({
      status: "RETRY",
      endpointId: "endpoint-1",
    });
    expect(result.rows[0].id).toBe("runtime-2");
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "COUNT(*)::text as total",
    );
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "ORDER BY created_at DESC",
    );
    expect(pool.query.mock.calls[0][1]).toEqual(["m-1", "RETRY", "endpoint-1"]);
    expect(pool.query.mock.calls[1][1]).toEqual([
      "m-1",
      "RETRY",
      "endpoint-1",
      10,
      5,
    ]);
  });

  it("returns reconciliation run summary with status and drift type counts", async () => {
    const now = new Date();
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-1",
              endpoint_id: "endpoint-1",
              scope: "payments",
              status: "COMPLETED",
              drift_count: 3,
              summary: { mode: "runtime_analysis" },
              started_at: now,
              completed_at: now,
              created_by: "ops-1",
              created_at: now,
              updated_at: now,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { status: "OPEN", count: "1" },
            { status: "RESOLVED", count: "2" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { drift_type: "PAYMENT_NOT_APPLIED", count: "2" },
            { drift_type: "MISSING_TARGET_ORDER", count: "1" },
          ],
        }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.getReconciliationRunSummary({
      merchantId: "m-1",
      runId: "run-1",
    });

    expect(result.run.id).toBe("run-1");
    expect(result.statusCount).toEqual({
      OPEN: 1,
      RESOLVED: 2,
      IGNORED: 0,
    });
    expect(result.driftTypeCount).toEqual({
      PAYMENT_NOT_APPLIED: 2,
      MISSING_TARGET_ORDER: 1,
    });
    expect(result.totals.totalItems).toBe(3);
    expect(result.totals.openItems).toBe(1);
    expect(result.totals.resolvedItems).toBe(2);
    expect(result.totals.ignoredItems).toBe(0);
  });

  it("creates reconciliation drift items for unapplied processed payments", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-1",
              status: "RUNNING",
              scope: "payments",
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "evt-1",
              endpoint_id: "endpoint-1",
              event_type: "payment.received",
              payload: { orderNumber: "ORD-200" },
              status: "PROCESSED",
              error: null,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "order-1",
              order_number: "ORD-200",
              payment_status: "PENDING",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.startReconciliation({
      merchantId: "m-1",
      scope: "payments",
      createdBy: "ops-1",
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.driftCount).toBe(1);
    expect(result.driftByType.PAYMENT_NOT_APPLIED).toBe(1);
    expect(
      pool.query.mock.calls.some((call: any[]) =>
        String(call[0]).includes("INSERT INTO connector_reconciliation_items"),
      ),
    ).toBe(true);
  });

  it("resolves reconciliation items and updates open drift count", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-1",
              status: "RESOLVED",
              resolution_note: "Fixed manually",
              resolved_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { status: "OPEN", count: "2" },
            { status: "RESOLVED", count: "3" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ summary: { mode: "runtime_analysis" } }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.resolveReconciliationItem({
      merchantId: "m-1",
      runId: "run-1",
      itemId: "item-1",
      action: "RESOLVED",
      note: "Fixed manually",
    });

    expect(result.item.status).toBe("RESOLVED");
    expect(result.run.openItems).toBe(2);
    expect(result.run.resolvedItems).toBe(3);
  });

  it("reopens resolved reconciliation items and refreshes run open drift count", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-1",
              status: "OPEN",
              resolution_note: "Resolved by ops",
              resolved_at: null,
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { status: "OPEN", count: "4" },
            { status: "RESOLVED", count: "1" },
            { status: "IGNORED", count: "2" },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.reopenReconciliationItem({
      merchantId: "m-1",
      runId: "run-1",
      itemId: "item-1",
      note: "Re-triage after catalog correction",
    });

    expect(result.item.status).toBe("OPEN");
    expect(result.run.openItems).toBe(4);
    expect(result.run.resolvedItems).toBe(1);
    expect(result.run.ignoredItems).toBe(2);
    expect(String(pool.query.mock.calls[2][0])).toContain(
      "SET drift_count = $3",
    );
    expect(String(pool.query.mock.calls[2][0])).toContain(
      "summary = jsonb_set",
    );
    expect(pool.query.mock.calls[2][1][2]).toBe(4);
    expect(typeof pool.query.mock.calls[2][1][3]).toBe("string");
    expect(pool.query.mock.calls[2][1][3]).toContain("REOPENED");
  });

  it("runs deterministic worker cycle with per-merchant advisory lock and bounded limits", async () => {
    const lockClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockResolvedValueOnce({ rows: [{ unlocked: true }] }),
      release: jest.fn(),
    } as any;

    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ merchant_id: "m-1" }] }),
      connect: jest.fn().mockResolvedValue(lockClient),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const processSpy = jest.spyOn(service, "processQueue").mockResolvedValue({
      totalPicked: 3,
      processed: 2,
      retried: 1,
      movedToDlq: 1,
    } as any);
    const recoverSpy = jest
      .spyOn(service, "recoverStuckProcessing")
      .mockResolvedValue({ recoveredCount: 2 } as any);
    const reconcileSpy = jest
      .spyOn(service, "startReconciliation")
      .mockResolvedValue({ runId: "run-1" } as any);

    const result = await service.runDeterministicWorkerCycle({
      merchantLimit: 300,
      perMerchantQueueLimit: 999,
      perMerchantRecoverLimit: 888,
      stuckOlderThanMinutes: 999,
      reconciliationMerchantLimit: 5,
    });

    expect(processSpy).toHaveBeenCalledWith({ merchantId: "m-1", limit: 100 });
    expect(recoverSpy).toHaveBeenCalledWith({
      merchantId: "m-1",
      olderThanMinutes: 240,
      limit: 100,
    });
    expect(reconcileSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: "m-1",
        scope: "payments",
        createdBy: "system:connector-runtime-worker",
      }),
    );

    expect(result.scannedMerchants).toBe(1);
    expect(result.processedMerchants).toBe(1);
    expect(result.skippedLockedMerchants).toBe(0);
    expect(result.queueTotals).toEqual({
      totalPicked: 3,
      processed: 2,
      retried: 1,
      movedToDlq: 1,
    });
    expect(result.recoveredStuckTotal).toBe(2);
    expect(result.reconciliation).toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skippedByDepth: 0,
    });

    expect(String(lockClient.query.mock.calls[0][0])).toContain(
      "pg_try_advisory_lock",
    );
    expect(lockClient.release).toHaveBeenCalledTimes(1);
  });

  it("skips merchants when partition lock cannot be acquired", async () => {
    const lockClient = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ locked: false }] }),
      release: jest.fn(),
    } as any;

    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ merchant_id: "m-locked" }] }),
      connect: jest.fn().mockResolvedValue(lockClient),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const processSpy = jest.spyOn(service, "processQueue");

    const result = await service.runDeterministicWorkerCycle();

    expect(processSpy).not.toHaveBeenCalled();
    expect(result.scannedMerchants).toBe(1);
    expect(result.processedMerchants).toBe(0);
    expect(result.skippedLockedMerchants).toBe(1);
    expect(result.failedMerchants).toBe(0);
    expect(result.merchants[0]).toMatchObject({
      merchantId: "m-locked",
      lockAcquired: false,
    });
    expect(lockClient.release).toHaveBeenCalledTimes(1);
  });

  it("enforces reconciliation depth limit across merchant partitions", async () => {
    const lockClientA = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockResolvedValueOnce({ rows: [{ unlocked: true }] }),
      release: jest.fn(),
    } as any;

    const lockClientB = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockResolvedValueOnce({ rows: [{ unlocked: true }] }),
      release: jest.fn(),
    } as any;

    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ merchant_id: "m-1" }, { merchant_id: "m-2" }],
      }),
      connect: jest
        .fn()
        .mockResolvedValueOnce(lockClientA)
        .mockResolvedValueOnce(lockClientB),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    jest.spyOn(service, "processQueue").mockResolvedValue({
      totalPicked: 1,
      processed: 0,
      retried: 0,
      movedToDlq: 1,
    } as any);
    jest
      .spyOn(service, "recoverStuckProcessing")
      .mockResolvedValue({ recoveredCount: 0 } as any);
    const reconcileSpy = jest
      .spyOn(service, "startReconciliation")
      .mockResolvedValue({ runId: "run-only" } as any);

    const result = await service.runDeterministicWorkerCycle({
      reconciliationMerchantLimit: 1,
    });

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    expect(result.reconciliation).toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      skippedByDepth: 1,
    });
    expect(result.merchants[1].reconciliation.skippedByDepth).toBe(true);
  });

  it("records worker-cycle ledger summary and per-merchant outcomes", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "11111111-1111-4111-8111-111111111111" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const now = new Date();
    const result = await service.recordWorkerCycleRun({
      status: "COMPLETED",
      triggerSource: "scheduler",
      workerInstance: "worker-a:123",
      startedAt: now,
      finishedAt: new Date(now.getTime() + 1500),
      options: {
        reconciliationMerchantLimit: 3,
        runReconciliation: true,
      },
      result: {
        scannedMerchants: 2,
        processedMerchants: 1,
        skippedLockedMerchants: 1,
        failedMerchants: 0,
        queueTotals: {
          totalPicked: 5,
          processed: 3,
          retried: 1,
          movedToDlq: 1,
        },
        recoveredStuckTotal: 2,
        reconciliation: {
          attempted: 1,
          succeeded: 0,
          failed: 1,
          skippedByDepth: 1,
        },
        merchants: [
          {
            merchantId: "m-1",
            lockAcquired: true,
            queue: {
              totalPicked: 5,
              processed: 3,
              retried: 1,
              movedToDlq: 1,
            },
            recover: {
              recoveredCount: 2,
            },
            reconciliation: {
              attempted: true,
              succeeded: false,
              skippedByDepth: false,
              runId: "run-1",
              error: "reconcile failed",
            },
            error: null,
          },
          {
            merchantId: "m-2",
            lockAcquired: false,
            queue: {
              totalPicked: 0,
              processed: 0,
              retried: 0,
              movedToDlq: 0,
            },
            recover: {
              recoveredCount: 0,
            },
            reconciliation: {
              attempted: false,
              succeeded: false,
              skippedByDepth: true,
              runId: null,
              error: null,
            },
            error: "partition lock unavailable",
          },
        ],
      },
    });

    expect(result).toEqual({
      cycleId: "11111111-1111-4111-8111-111111111111",
      status: "COMPLETED",
      outcomesRecorded: 2,
    });
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "INSERT INTO connector_runtime_worker_cycles",
    );
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "INSERT INTO connector_runtime_worker_cycle_outcomes",
    );
    expect(pool.query.mock.calls[1][1][1]).toBe("m-1");
    expect(pool.query.mock.calls[2][1][1]).toBe("m-2");
  });

  it("lists worker-cycle outcomes with status filtering", async () => {
    const now = new Date();
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: "1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "outcome-1",
              cycle_id: "cycle-1",
              merchant_id: "m-1",
              lock_acquired: false,
              queue_total_picked: 0,
              queue_processed: 0,
              queue_retried: 0,
              queue_moved_to_dlq: 0,
              recovered_stuck_count: 0,
              reconciliation_attempted: false,
              reconciliation_succeeded: false,
              reconciliation_skipped_by_depth: true,
              reconciliation_run_id: null,
              reconciliation_error: null,
              outcome_error: "partition lock unavailable",
              created_at: now,
              trigger_source: "scheduler",
              worker_instance: "worker-a:123",
              run_status: "FAILED",
              cycle_options: { reconciliationMerchantLimit: 2 },
              cycle_summary: { scannedMerchants: 2 },
              cycle_error: "cycle failed",
              started_at: now,
              finished_at: now,
              duration_ms: 120,
              reconciliation_depth_limit: 2,
            },
          ],
        }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.listWorkerCycleOutcomes({
      merchantId: "m-1",
      status: "FAILED",
      limit: 10,
      offset: 5,
    });

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.filters.status).toBe("FAILED");
    expect(result.rows[0].reconciliation_depth_limit).toBe(2);
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "FROM connector_runtime_worker_cycle_outcomes",
    );
    expect(String(pool.query.mock.calls[0][0])).toContain("c.run_status = $2");
    expect(pool.query.mock.calls[0][1]).toEqual(["m-1", "FAILED"]);
    expect(pool.query.mock.calls[1][1]).toEqual(["m-1", "FAILED", 10, 5]);
  });

  it("returns latest worker-cycle summary for merchant", async () => {
    const now = new Date();
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: "outcome-1",
            cycle_id: "cycle-1",
            merchant_id: "m-1",
            lock_acquired: true,
            run_status: "COMPLETED",
            cycle_summary: {
              scannedMerchants: 4,
              processedMerchants: 3,
            },
            started_at: now,
            finished_at: now,
          },
        ],
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const latest = await service.getLatestWorkerCycleSummary("m-1");

    expect(latest).toBeTruthy();
    expect(latest.cycle_id).toBe("cycle-1");
    expect(latest.run_status).toBe("COMPLETED");
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "ORDER BY c.started_at DESC",
    );
  });
});
