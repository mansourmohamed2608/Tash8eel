import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConnectorRuntimeService } from "../services/connector-runtime.service";

@Injectable()
export class ConnectorRuntimeWorkerScheduler {
  private readonly logger = new Logger(ConnectorRuntimeWorkerScheduler.name);
  private isCycleRunning = false;

  constructor(
    private readonly connectorRuntimeService: ConnectorRuntimeService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runConnectorRuntimeCycle(): Promise<void> {
    if (!this.isWorkerEnabled()) {
      return;
    }

    const cycleOptions = {
      merchantLimit: this.readBoundedInt(
        "CONNECTOR_RUNTIME_WORKER_MERCHANT_LIMIT",
        25,
        1,
        200,
      ),
      perMerchantQueueLimit: this.readBoundedInt(
        "CONNECTOR_RUNTIME_WORKER_QUEUE_LIMIT",
        25,
        1,
        100,
      ),
      perMerchantRecoverLimit: this.readBoundedInt(
        "CONNECTOR_RUNTIME_WORKER_RECOVER_LIMIT",
        25,
        1,
        100,
      ),
      stuckOlderThanMinutes: this.readBoundedInt(
        "CONNECTOR_RUNTIME_WORKER_STUCK_MINUTES",
        30,
        5,
        240,
      ),
      runReconciliation: this.isReconciliationEnabled(),
      reconciliationScope: this.readReconciliationScope(),
      reconciliationMerchantLimit: this.readBoundedInt(
        "CONNECTOR_RUNTIME_WORKER_RECONCILIATION_LIMIT",
        5,
        0,
        50,
      ),
    } as const;

    if (this.isCycleRunning) {
      this.logger.warn({
        msg: "Connector runtime worker cycle skipped because previous cycle is still running",
      });

      const skippedAt = new Date();
      await this.connectorRuntimeService
        .recordWorkerCycleRun({
          status: "SKIPPED",
          triggerSource: "scheduler",
          workerInstance: this.resolveWorkerInstance(),
          startedAt: skippedAt,
          finishedAt: skippedAt,
          options: cycleOptions,
          error:
            "Skipped because previous connector runtime cycle is still running",
        })
        .catch(() => undefined);

      return;
    }

    this.isCycleRunning = true;
    const startedAt = new Date();
    let cycleResult: any = null;
    let cycleStatus: "COMPLETED" | "FAILED" = "COMPLETED";
    let cycleError: string | null = null;

    try {
      cycleResult =
        await this.connectorRuntimeService.runDeterministicWorkerCycle(
          cycleOptions,
        );

      this.logger.log({
        msg: "Connector runtime worker cycle completed",
        durationMs: Date.now() - startedAt.getTime(),
        scannedMerchants: cycleResult.scannedMerchants,
        processedMerchants: cycleResult.processedMerchants,
        skippedLockedMerchants: cycleResult.skippedLockedMerchants,
        failedMerchants: cycleResult.failedMerchants,
        queueTotals: cycleResult.queueTotals,
        recoveredStuckTotal: cycleResult.recoveredStuckTotal,
        reconciliation: cycleResult.reconciliation,
      });
    } catch (error: any) {
      cycleStatus = "FAILED";
      cycleError = String(
        error?.message || "Unknown connector runtime cycle error",
      );
      this.logger.error({
        msg: "Connector runtime worker cycle failed",
        durationMs: Date.now() - startedAt.getTime(),
        error: cycleError,
      });
    } finally {
      const finishedAt = new Date();
      await this.connectorRuntimeService
        .recordWorkerCycleRun({
          status: cycleStatus,
          triggerSource: "scheduler",
          workerInstance: this.resolveWorkerInstance(),
          startedAt,
          finishedAt,
          options: cycleOptions,
          result: cycleResult,
          error: cycleError,
        })
        .catch(() => undefined);

      this.isCycleRunning = false;
    }
  }

  private resolveWorkerInstance(): string {
    const hostname = String(
      process.env.HOSTNAME || process.env.COMPUTERNAME || "",
    )
      .trim()
      .slice(0, 80);
    const pid = process.pid;
    return hostname ? `${hostname}:${pid}` : `pid:${pid}`;
  }

  private isWorkerEnabled(): boolean {
    const raw = String(process.env.CONNECTOR_RUNTIME_WORKER_ENABLED || "true")
      .trim()
      .toLowerCase();
    return !["0", "false", "off", "no", "disabled"].includes(raw);
  }

  private isReconciliationEnabled(): boolean {
    const raw = String(
      process.env.CONNECTOR_RUNTIME_WORKER_RECONCILIATION_ENABLED || "true",
    )
      .trim()
      .toLowerCase();
    return !["0", "false", "off", "no", "disabled"].includes(raw);
  }

  private readReconciliationScope():
    | "orders"
    | "payments"
    | "inventory"
    | "catalog"
    | "all" {
    const raw = String(
      process.env.CONNECTOR_RUNTIME_WORKER_RECONCILIATION_SCOPE || "payments",
    )
      .trim()
      .toLowerCase();

    if (
      raw === "orders" ||
      raw === "payments" ||
      raw === "inventory" ||
      raw === "catalog" ||
      raw === "all"
    ) {
      return raw;
    }

    return "payments";
  }

  private readBoundedInt(
    envName: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(process.env[envName]);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.max(min, Math.min(Math.floor(parsed), max));
  }
}
