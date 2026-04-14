import { ConnectorRuntimeWorkerScheduler } from "./connector-runtime-worker.scheduler";

describe("ConnectorRuntimeWorkerScheduler", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it("skips cycle execution when worker is disabled", async () => {
    process.env.CONNECTOR_RUNTIME_WORKER_ENABLED = "false";

    const connectorRuntimeService = {
      runDeterministicWorkerCycle: jest.fn(),
      recordWorkerCycleRun: jest.fn(),
    } as any;

    const scheduler = new ConnectorRuntimeWorkerScheduler(
      connectorRuntimeService,
    );
    await scheduler.runConnectorRuntimeCycle();

    expect(
      connectorRuntimeService.runDeterministicWorkerCycle,
    ).not.toHaveBeenCalled();
    expect(connectorRuntimeService.recordWorkerCycleRun).not.toHaveBeenCalled();
  });

  it("executes deterministic cycle with bounded env configuration", async () => {
    process.env.CONNECTOR_RUNTIME_WORKER_ENABLED = "true";
    process.env.CONNECTOR_RUNTIME_WORKER_MERCHANT_LIMIT = "999";
    process.env.CONNECTOR_RUNTIME_WORKER_QUEUE_LIMIT = "120";
    process.env.CONNECTOR_RUNTIME_WORKER_RECOVER_LIMIT = "130";
    process.env.CONNECTOR_RUNTIME_WORKER_STUCK_MINUTES = "500";
    process.env.CONNECTOR_RUNTIME_WORKER_RECONCILIATION_LIMIT = "7";
    process.env.CONNECTOR_RUNTIME_WORKER_RECONCILIATION_SCOPE = "payments";
    process.env.CONNECTOR_RUNTIME_WORKER_RECONCILIATION_ENABLED = "true";

    const connectorRuntimeService = {
      runDeterministicWorkerCycle: jest.fn().mockResolvedValue({
        scannedMerchants: 0,
        processedMerchants: 0,
        skippedLockedMerchants: 0,
        failedMerchants: 0,
        queueTotals: {
          totalPicked: 0,
          processed: 0,
          retried: 0,
          movedToDlq: 0,
        },
        recoveredStuckTotal: 0,
        reconciliation: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
          skippedByDepth: 0,
        },
        merchants: [],
      }),
      recordWorkerCycleRun: jest.fn().mockResolvedValue(null),
    } as any;

    const scheduler = new ConnectorRuntimeWorkerScheduler(
      connectorRuntimeService,
    );
    await scheduler.runConnectorRuntimeCycle();

    expect(
      connectorRuntimeService.runDeterministicWorkerCycle,
    ).toHaveBeenCalledWith({
      merchantLimit: 200,
      perMerchantQueueLimit: 100,
      perMerchantRecoverLimit: 100,
      stuckOlderThanMinutes: 240,
      runReconciliation: true,
      reconciliationScope: "payments",
      reconciliationMerchantLimit: 7,
    });
    expect(connectorRuntimeService.recordWorkerCycleRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "COMPLETED",
        triggerSource: "scheduler",
        options: {
          merchantLimit: 200,
          perMerchantQueueLimit: 100,
          perMerchantRecoverLimit: 100,
          stuckOlderThanMinutes: 240,
          runReconciliation: true,
          reconciliationScope: "payments",
          reconciliationMerchantLimit: 7,
        },
      }),
    );
  });

  it("records skipped status when previous cycle is still running", async () => {
    process.env.CONNECTOR_RUNTIME_WORKER_ENABLED = "true";

    let releaseFirstCycle: ((value: any) => void) | null = null;
    const connectorRuntimeService = {
      runDeterministicWorkerCycle: jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseFirstCycle = resolve;
          }),
      ),
      recordWorkerCycleRun: jest.fn().mockResolvedValue(null),
    } as any;

    const scheduler = new ConnectorRuntimeWorkerScheduler(
      connectorRuntimeService,
    );
    const firstCycle = scheduler.runConnectorRuntimeCycle();
    const skippedCycle = scheduler.runConnectorRuntimeCycle();
    await skippedCycle;

    expect(connectorRuntimeService.recordWorkerCycleRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SKIPPED",
        triggerSource: "scheduler",
      }),
    );

    (releaseFirstCycle as any)?.({
      scannedMerchants: 0,
      processedMerchants: 0,
      skippedLockedMerchants: 0,
      failedMerchants: 0,
      queueTotals: {
        totalPicked: 0,
        processed: 0,
        retried: 0,
        movedToDlq: 0,
      },
      recoveredStuckTotal: 0,
      reconciliation: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skippedByDepth: 0,
      },
      merchants: [],
    });
    await firstCycle;
  });
});
