import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { Pool, PoolClient } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  INTEGRATION_EVENT_TAXONOMY,
  IntegrationEventType,
  IntegrationService,
} from "./integration.service";

const MAX_CONNECTOR_PAYLOAD_BYTES = 128 * 1024;
const CONNECTOR_PAYLOAD_SIZE_ERROR = "Connector payload exceeds allowed size";
const MAX_RECONCILIATION_EVENT_SCAN = 500;
const RECONCILIATION_WINDOW_DAYS = 7;
const CONNECTOR_RUNTIME_EVENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "RETRY",
  "DEAD_LETTER",
] as const;
const RECONCILIATION_ITEM_STATUSES = ["OPEN", "RESOLVED", "IGNORED"] as const;
const CONNECTOR_RUNTIME_WORKER_LOCK_NAMESPACE = "connector-runtime-worker";
const CONNECTOR_RUNTIME_WORKER_RUN_STATUSES = [
  "COMPLETED",
  "FAILED",
  "SKIPPED",
] as const;

type ConnectorReconciliationScope =
  | "orders"
  | "payments"
  | "inventory"
  | "catalog"
  | "all";

type ConnectorReconciliationItemStatus = "OPEN" | "RESOLVED" | "IGNORED";
type ConnectorRuntimeEventStatus =
  (typeof CONNECTOR_RUNTIME_EVENT_STATUSES)[number];

export interface ConnectorRuntimeWorkerCycleOptions {
  merchantLimit?: number;
  perMerchantQueueLimit?: number;
  perMerchantRecoverLimit?: number;
  stuckOlderThanMinutes?: number;
  runReconciliation?: boolean;
  reconciliationScope?: ConnectorReconciliationScope;
  reconciliationMerchantLimit?: number;
}

export interface ConnectorRuntimeWorkerCycleMerchantResult {
  merchantId: string;
  lockAcquired: boolean;
  queue: {
    totalPicked: number;
    processed: number;
    retried: number;
    movedToDlq: number;
  };
  recover: {
    recoveredCount: number;
  };
  reconciliation: {
    attempted: boolean;
    succeeded: boolean;
    skippedByDepth: boolean;
    runId: string | null;
    error: string | null;
  };
  error: string | null;
}

export interface ConnectorRuntimeWorkerCycleResult {
  scannedMerchants: number;
  processedMerchants: number;
  skippedLockedMerchants: number;
  failedMerchants: number;
  queueTotals: {
    totalPicked: number;
    processed: number;
    retried: number;
    movedToDlq: number;
  };
  recoveredStuckTotal: number;
  reconciliation: {
    attempted: number;
    succeeded: number;
    failed: number;
    skippedByDepth: number;
  };
  merchants: ConnectorRuntimeWorkerCycleMerchantResult[];
}

type ConnectorRuntimeWorkerRunStatus =
  (typeof CONNECTOR_RUNTIME_WORKER_RUN_STATUSES)[number];

@Injectable()
export class ConnectorRuntimeService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly integrationService: IntegrationService,
  ) {}

  getEventTaxonomy() {
    return {
      events: INTEGRATION_EVENT_TAXONOMY,
      runtimeStates: [...CONNECTOR_RUNTIME_EVENT_STATUSES],
    };
  }

  async enqueueEvent(input: {
    merchantId: string;
    endpointId: string;
    eventType: IntegrationEventType;
    payload: Record<string, any>;
    maxAttempts?: number;
  }) {
    if (!INTEGRATION_EVENT_TAXONOMY.includes(input.eventType)) {
      throw new BadRequestException(
        "Unsupported eventType for connector runtime",
      );
    }

    this.assertPayloadWithinLimit(input.payload);

    const endpoint = await this.pool.query<{ status: string }>(
      `SELECT status
       FROM integration_endpoints
       WHERE id::text = $1
         AND merchant_id = $2
       LIMIT 1`,
      [input.endpointId, input.merchantId],
    );

    if (!endpoint.rows.length) {
      throw new NotFoundException("Integration endpoint not found");
    }

    if (String(endpoint.rows[0].status || "").toUpperCase() !== "ACTIVE") {
      throw new BadRequestException("Integration endpoint is not active");
    }

    const maxAttempts = Math.max(1, Math.min(input.maxAttempts || 3, 10));

    const result = await this.pool.query<{
      id: string;
      status: string;
      attempt_count: number;
      max_attempts: number;
      created_at: Date;
    }>(
      `INSERT INTO connector_runtime_events (
         endpoint_id,
         merchant_id,
         event_type,
         payload,
         status,
         attempt_count,
         max_attempts,
         next_retry_at
       ) VALUES ($1::uuid, $2, $3, $4::jsonb, 'PENDING', 0, $5, NOW())
       RETURNING
         id::text as id,
         status,
         attempt_count,
         max_attempts,
         created_at`,
      [
        input.endpointId,
        input.merchantId,
        input.eventType,
        JSON.stringify(input.payload || {}),
        maxAttempts,
      ],
    );

    return {
      queued: true,
      runtimeEventId: result.rows[0].id,
      status: result.rows[0].status,
      attemptCount: result.rows[0].attempt_count,
      maxAttempts: result.rows[0].max_attempts,
      createdAt: result.rows[0].created_at,
    };
  }

  async processQueue(input: {
    merchantId: string;
    limit?: number;
    endpointId?: string;
  }) {
    const limit = Math.max(1, Math.min(input.limit || 25, 200));

    const picked = await this.claimQueueEvents({
      merchantId: input.merchantId,
      limit,
      endpointId: input.endpointId,
    });

    if (!picked.rows.length) {
      return {
        totalPicked: 0,
        processed: 0,
        retried: 0,
        movedToDlq: 0,
      };
    }

    let processed = 0;
    let retried = 0;
    let movedToDlq = 0;

    for (const row of picked.rows) {
      if (!row.endpoint_id) {
        const missingEndpointError =
          "Connector runtime event has no endpoint_id";
        await this.pool.query(
          `UPDATE connector_runtime_events
           SET status = 'DEAD_LETTER',
               attempt_count = max_attempts,
               last_error = $2,
               updated_at = NOW()
           WHERE id::text = $1`,
          [row.id, missingEndpointError],
        );

        await this.pool.query(
          `INSERT INTO connector_runtime_dlq (
             runtime_event_id,
             endpoint_id,
             merchant_id,
             event_type,
             payload,
             last_error,
             attempt_count,
             first_failed_at,
             moved_to_dlq_at,
             status
           ) VALUES (
             $1::uuid,
             NULL,
             $2,
             $3,
             $4::jsonb,
             $5,
             $6,
             NOW(),
             NOW(),
             'OPEN'
           )
           ON CONFLICT (runtime_event_id)
           DO UPDATE SET
             last_error = EXCLUDED.last_error,
             attempt_count = EXCLUDED.attempt_count,
             updated_at = NOW()`,
          [
            row.id,
            input.merchantId,
            row.event_type,
            JSON.stringify(row.payload || {}),
            missingEndpointError,
            Number(row.max_attempts || 1),
          ],
        );

        movedToDlq += 1;
        continue;
      }

      try {
        this.assertPayloadWithinLimit(row.payload || {});

        const outcome = await this.integrationService.processErpEvent(
          input.merchantId,
          row.endpoint_id,
          row.event_type,
          row.payload || {},
        );

        if (outcome.success) {
          await this.pool.query(
            `UPDATE connector_runtime_events
             SET status = 'PROCESSED',
                 processed_at = NOW(),
                 updated_at = NOW(),
                 last_error = NULL
             WHERE id::text = $1`,
            [row.id],
          );
          processed += 1;
          continue;
        }

        throw new Error(outcome.message || "Integration processing failed");
      } catch (error: any) {
        const nextAttempt = Number(row.attempt_count || 0) + 1;
        const maxAttempts = Number(row.max_attempts || 3);
        const errMsg = String(
          error?.message || "Unknown connector runtime error",
        );
        const isNonRetryable = this.isNonRetryableRuntimeError(error);
        const shouldDeadLetter = isNonRetryable || nextAttempt >= maxAttempts;
        const finalAttemptCount = isNonRetryable ? maxAttempts : nextAttempt;

        if (shouldDeadLetter) {
          await this.pool.query(
            `UPDATE connector_runtime_events
             SET status = 'DEAD_LETTER',
                 attempt_count = $2,
                 last_error = $3,
                 updated_at = NOW()
             WHERE id::text = $1`,
            [row.id, finalAttemptCount, errMsg],
          );

          await this.pool.query(
            `INSERT INTO connector_runtime_dlq (
               runtime_event_id,
               endpoint_id,
               merchant_id,
               event_type,
               payload,
               last_error,
               attempt_count,
               first_failed_at,
               moved_to_dlq_at,
               status
             ) VALUES (
               $1::uuid,
               $2::uuid,
               $3,
               $4,
               $5::jsonb,
               $6,
               $7,
               NOW(),
               NOW(),
               'OPEN'
             )
             ON CONFLICT (runtime_event_id)
             DO UPDATE SET
               last_error = EXCLUDED.last_error,
               attempt_count = EXCLUDED.attempt_count,
               updated_at = NOW()`,
            [
              row.id,
              row.endpoint_id,
              input.merchantId,
              row.event_type,
              JSON.stringify(row.payload || {}),
              errMsg,
              finalAttemptCount,
            ],
          );

          movedToDlq += 1;
          continue;
        }

        const retryDelaySeconds = this.getRetryDelaySeconds(nextAttempt);

        await this.pool.query(
          `UPDATE connector_runtime_events
           SET status = 'RETRY',
               attempt_count = $2,
               last_error = $3,
               next_retry_at = NOW() + ($4 * INTERVAL '1 second'),
               updated_at = NOW()
           WHERE id::text = $1`,
          [row.id, nextAttempt, errMsg, retryDelaySeconds],
        );

        retried += 1;
      }
    }

    return {
      totalPicked: picked.rows.length,
      processed,
      retried,
      movedToDlq,
    };
  }

  async runDeterministicWorkerCycle(
    options: ConnectorRuntimeWorkerCycleOptions = {},
  ): Promise<ConnectorRuntimeWorkerCycleResult> {
    const normalized = this.normalizeWorkerCycleOptions(options);
    const merchantIds = await this.loadRuntimeCandidateMerchants(
      normalized.merchantLimit,
    );

    const result: ConnectorRuntimeWorkerCycleResult = {
      scannedMerchants: merchantIds.length,
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
    };

    if (!merchantIds.length) {
      return result;
    }

    for (const merchantId of merchantIds) {
      let merchantEntry: ConnectorRuntimeWorkerCycleMerchantResult = {
        merchantId,
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
          skippedByDepth: false,
          runId: null,
          error: null,
        },
        error: null,
      };

      try {
        const canAttemptReconciliation =
          normalized.runReconciliation &&
          result.reconciliation.attempted <
            normalized.reconciliationMerchantLimit;

        const lockResult = await this.withMerchantPartitionLock(
          merchantId,
          async () => {
            const queue = await this.processQueue({
              merchantId,
              limit: normalized.perMerchantQueueLimit,
            });

            const recover = await this.recoverStuckProcessing({
              merchantId,
              olderThanMinutes: normalized.stuckOlderThanMinutes,
              limit: normalized.perMerchantRecoverLimit,
            });

            let reconciliation: ConnectorRuntimeWorkerCycleMerchantResult["reconciliation"] =
              {
                attempted: false,
                succeeded: false,
                skippedByDepth: false,
                runId: null,
                error: null,
              };

            const shouldReconcile =
              queue.movedToDlq > 0 || recover.recoveredCount > 0;
            if (shouldReconcile && normalized.runReconciliation) {
              if (!canAttemptReconciliation) {
                reconciliation = {
                  attempted: false,
                  succeeded: false,
                  skippedByDepth: true,
                  runId: null,
                  error: null,
                };
              } else {
                reconciliation = {
                  attempted: true,
                  succeeded: false,
                  skippedByDepth: false,
                  runId: null,
                  error: null,
                };

                try {
                  const started = await this.startReconciliation({
                    merchantId,
                    scope: normalized.reconciliationScope,
                    createdBy: "system:connector-runtime-worker",
                  });

                  reconciliation = {
                    ...reconciliation,
                    succeeded: true,
                    runId: String(started?.runId || ""),
                  };
                } catch (error: any) {
                  reconciliation = {
                    ...reconciliation,
                    error: String(
                      error?.message || "Connector reconciliation start failed",
                    ),
                  };
                }
              }
            }

            return {
              queue,
              recover,
              reconciliation,
            };
          },
        );

        if (!lockResult.acquired || !lockResult.result) {
          result.skippedLockedMerchants += 1;
          merchantEntry = {
            ...merchantEntry,
            lockAcquired: false,
          };
          result.merchants.push(merchantEntry);
          continue;
        }

        merchantEntry = {
          ...merchantEntry,
          lockAcquired: true,
          queue: {
            totalPicked: Number(lockResult.result.queue.totalPicked || 0),
            processed: Number(lockResult.result.queue.processed || 0),
            retried: Number(lockResult.result.queue.retried || 0),
            movedToDlq: Number(lockResult.result.queue.movedToDlq || 0),
          },
          recover: {
            recoveredCount: Number(
              lockResult.result.recover.recoveredCount || 0,
            ),
          },
          reconciliation: lockResult.result.reconciliation,
        };

        result.processedMerchants += 1;
        result.queueTotals.totalPicked += merchantEntry.queue.totalPicked;
        result.queueTotals.processed += merchantEntry.queue.processed;
        result.queueTotals.retried += merchantEntry.queue.retried;
        result.queueTotals.movedToDlq += merchantEntry.queue.movedToDlq;
        result.recoveredStuckTotal += merchantEntry.recover.recoveredCount;

        if (merchantEntry.reconciliation.skippedByDepth) {
          result.reconciliation.skippedByDepth += 1;
        }

        if (merchantEntry.reconciliation.attempted) {
          result.reconciliation.attempted += 1;
          if (merchantEntry.reconciliation.succeeded) {
            result.reconciliation.succeeded += 1;
          } else {
            result.reconciliation.failed += 1;
          }
        }

        result.merchants.push(merchantEntry);
      } catch (error: any) {
        result.failedMerchants += 1;
        result.merchants.push({
          ...merchantEntry,
          error: String(
            error?.message || "Connector runtime worker cycle failed",
          ),
        });
      }
    }

    return result;
  }

  async recordWorkerCycleRun(input: {
    status: ConnectorRuntimeWorkerRunStatus;
    triggerSource?: string;
    workerInstance?: string | null;
    startedAt: Date;
    finishedAt: Date;
    options?: ConnectorRuntimeWorkerCycleOptions;
    result?: ConnectorRuntimeWorkerCycleResult | null;
    error?: string | null;
  }) {
    const startedAt =
      input.startedAt instanceof Date
        ? input.startedAt
        : new Date(input.startedAt || Date.now());
    const finishedAt =
      input.finishedAt instanceof Date
        ? input.finishedAt
        : new Date(input.finishedAt || Date.now());
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

    const cycleSummary = input.result
      ? {
          scannedMerchants: Number(input.result.scannedMerchants || 0),
          processedMerchants: Number(input.result.processedMerchants || 0),
          skippedLockedMerchants: Number(
            input.result.skippedLockedMerchants || 0,
          ),
          failedMerchants: Number(input.result.failedMerchants || 0),
          queueTotals: {
            totalPicked: Number(input.result.queueTotals?.totalPicked || 0),
            processed: Number(input.result.queueTotals?.processed || 0),
            retried: Number(input.result.queueTotals?.retried || 0),
            movedToDlq: Number(input.result.queueTotals?.movedToDlq || 0),
          },
          recoveredStuckTotal: Number(input.result.recoveredStuckTotal || 0),
          reconciliation: {
            attempted: Number(input.result.reconciliation?.attempted || 0),
            succeeded: Number(input.result.reconciliation?.succeeded || 0),
            failed: Number(input.result.reconciliation?.failed || 0),
            skippedByDepth: Number(
              input.result.reconciliation?.skippedByDepth || 0,
            ),
          },
        }
      : {
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
        };

    try {
      const cycleInsert = await this.pool.query<{ id: string }>(
        `INSERT INTO connector_runtime_worker_cycles (
           trigger_source,
           worker_instance,
           run_status,
           cycle_options,
           cycle_summary,
           error,
           started_at,
           finished_at,
           duration_ms
         ) VALUES (
           $1,
           $2,
           $3,
           $4::jsonb,
           $5::jsonb,
           $6,
           $7,
           $8,
           $9
         )
         RETURNING id::text as id`,
        [
          String(input.triggerSource || "scheduler"),
          input.workerInstance || null,
          input.status,
          JSON.stringify(input.options || {}),
          JSON.stringify(cycleSummary),
          input.error ? String(input.error).slice(0, 4000) : null,
          startedAt,
          finishedAt,
          durationMs,
        ],
      );

      const cycleId = String(cycleInsert.rows[0]?.id || "");
      if (!cycleId) {
        return null;
      }

      const merchants = (input.result?.merchants || []).slice(0, 500);
      let recordedOutcomes = 0;

      for (const merchantEntry of merchants) {
        const merchantId = String(merchantEntry?.merchantId || "").trim();
        if (!merchantId) {
          continue;
        }

        await this.pool.query(
          `INSERT INTO connector_runtime_worker_cycle_outcomes (
             cycle_id,
             merchant_id,
             lock_acquired,
             queue_total_picked,
             queue_processed,
             queue_retried,
             queue_moved_to_dlq,
             recovered_stuck_count,
             reconciliation_attempted,
             reconciliation_succeeded,
             reconciliation_skipped_by_depth,
             reconciliation_run_id,
             reconciliation_error,
             outcome_error
           ) VALUES (
             $1::uuid,
             $2,
             $3,
             $4,
             $5,
             $6,
             $7,
             $8,
             $9,
             $10,
             $11,
             $12,
             $13,
             $14
           )
           ON CONFLICT (cycle_id, merchant_id)
           DO UPDATE SET
             lock_acquired = EXCLUDED.lock_acquired,
             queue_total_picked = EXCLUDED.queue_total_picked,
             queue_processed = EXCLUDED.queue_processed,
             queue_retried = EXCLUDED.queue_retried,
             queue_moved_to_dlq = EXCLUDED.queue_moved_to_dlq,
             recovered_stuck_count = EXCLUDED.recovered_stuck_count,
             reconciliation_attempted = EXCLUDED.reconciliation_attempted,
             reconciliation_succeeded = EXCLUDED.reconciliation_succeeded,
             reconciliation_skipped_by_depth = EXCLUDED.reconciliation_skipped_by_depth,
             reconciliation_run_id = EXCLUDED.reconciliation_run_id,
             reconciliation_error = EXCLUDED.reconciliation_error,
             outcome_error = EXCLUDED.outcome_error,
             created_at = NOW()`,
          [
            cycleId,
            merchantId,
            merchantEntry.lockAcquired === true,
            Number(merchantEntry.queue?.totalPicked || 0),
            Number(merchantEntry.queue?.processed || 0),
            Number(merchantEntry.queue?.retried || 0),
            Number(merchantEntry.queue?.movedToDlq || 0),
            Number(merchantEntry.recover?.recoveredCount || 0),
            merchantEntry.reconciliation?.attempted === true,
            merchantEntry.reconciliation?.succeeded === true,
            merchantEntry.reconciliation?.skippedByDepth === true,
            merchantEntry.reconciliation?.runId || null,
            merchantEntry.reconciliation?.error || null,
            merchantEntry.error || null,
          ],
        );

        recordedOutcomes += 1;
      }

      return {
        cycleId,
        status: input.status,
        outcomesRecorded: recordedOutcomes,
      };
    } catch (error: any) {
      if (this.isRuntimeWorkerLedgerSchemaMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async listWorkerCycleOutcomes(input: {
    merchantId: string;
    status?: ConnectorRuntimeWorkerRunStatus;
    limit?: number;
    offset?: number;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const safeOffset = Math.max(0, Number(input.offset || 0));
    const normalizedStatus = input.status
      ? String(input.status).toUpperCase()
      : null;

    if (
      normalizedStatus &&
      !CONNECTOR_RUNTIME_WORKER_RUN_STATUSES.includes(
        normalizedStatus as ConnectorRuntimeWorkerRunStatus,
      )
    ) {
      throw new BadRequestException("Invalid worker cycle status filter");
    }

    const params: any[] = [input.merchantId];
    let statusFilter = "";

    if (normalizedStatus) {
      params.push(normalizedStatus);
      statusFilter = ` AND c.run_status = $${params.length}`;
    }

    try {
      const countQuery = this.pool.query<{ total: string }>(
        `SELECT COUNT(*)::text as total
         FROM connector_runtime_worker_cycle_outcomes o
         INNER JOIN connector_runtime_worker_cycles c
                 ON c.id = o.cycle_id
         WHERE o.merchant_id = $1
           ${statusFilter}`,
        params,
      );

      const listParams = [...params, safeLimit, safeOffset];
      const rowsQuery = this.pool.query(
        `SELECT
           o.id::text as id,
           o.cycle_id::text as cycle_id,
           o.merchant_id,
           o.lock_acquired,
           o.queue_total_picked,
           o.queue_processed,
           o.queue_retried,
           o.queue_moved_to_dlq,
           o.recovered_stuck_count,
           o.reconciliation_attempted,
           o.reconciliation_succeeded,
           o.reconciliation_skipped_by_depth,
           o.reconciliation_run_id,
           o.reconciliation_error,
           o.outcome_error,
           o.created_at,
           c.trigger_source,
           c.worker_instance,
           c.run_status,
           c.cycle_options,
           c.cycle_summary,
           c.error as cycle_error,
           c.started_at,
           c.finished_at,
           c.duration_ms,
           COALESCE((c.cycle_options ->> 'reconciliationMerchantLimit')::integer, 0)
             as reconciliation_depth_limit
         FROM connector_runtime_worker_cycle_outcomes o
         INNER JOIN connector_runtime_worker_cycles c
                 ON c.id = o.cycle_id
         WHERE o.merchant_id = $1
           ${statusFilter}
         ORDER BY c.started_at DESC
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
        listParams,
      );

      const [count, rows] = await Promise.all([countQuery, rowsQuery]);
      const outcomeRows = rows.rows;

      return {
        total: Number(count.rows[0]?.total || 0),
        rows: outcomeRows,
        items: outcomeRows,
        limit: safeLimit,
        offset: safeOffset,
        filters: {
          status: normalizedStatus,
        },
      };
    } catch (error: any) {
      if (this.isRuntimeWorkerLedgerSchemaMissing(error)) {
        return {
          total: 0,
          rows: [],
          items: [],
          limit: safeLimit,
          offset: safeOffset,
          filters: {
            status: normalizedStatus,
          },
        };
      }
      throw error;
    }
  }

  async getLatestWorkerCycleSummary(merchantId: string) {
    try {
      const latest = await this.pool.query(
        `SELECT
           o.id::text as id,
           o.cycle_id::text as cycle_id,
           o.merchant_id,
           o.lock_acquired,
           o.queue_total_picked,
           o.queue_processed,
           o.queue_retried,
           o.queue_moved_to_dlq,
           o.recovered_stuck_count,
           o.reconciliation_attempted,
           o.reconciliation_succeeded,
           o.reconciliation_skipped_by_depth,
           o.reconciliation_run_id,
           o.reconciliation_error,
           o.outcome_error,
           o.created_at,
           c.trigger_source,
           c.worker_instance,
           c.run_status,
           c.cycle_options,
           c.cycle_summary,
           c.error as cycle_error,
           c.started_at,
           c.finished_at,
           c.duration_ms,
           COALESCE((c.cycle_options ->> 'reconciliationMerchantLimit')::integer, 0)
             as reconciliation_depth_limit
         FROM connector_runtime_worker_cycle_outcomes o
         INNER JOIN connector_runtime_worker_cycles c
                 ON c.id = o.cycle_id
         WHERE o.merchant_id = $1
         ORDER BY c.started_at DESC
         LIMIT 1`,
        [merchantId],
      );

      return latest.rows[0] || null;
    } catch (error: any) {
      if (this.isRuntimeWorkerLedgerSchemaMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  private async claimQueueEvents(input: {
    merchantId: string;
    limit: number;
    endpointId?: string;
  }) {
    const params: any[] = [input.merchantId];
    let endpointFilter = "";

    if (input.endpointId) {
      params.push(input.endpointId);
      endpointFilter = ` AND endpoint_id::text = $${params.length}`;
    }

    params.push(input.limit);

    return this.pool.query<{
      id: string;
      endpoint_id: string;
      event_type: IntegrationEventType;
      payload: Record<string, any>;
      attempt_count: number;
      max_attempts: number;
    }>(
      `WITH candidates AS (
         SELECT id
         FROM connector_runtime_events
         WHERE merchant_id = $1
           ${endpointFilter}
           AND status IN ('PENDING', 'RETRY')
           AND next_retry_at <= NOW()
         ORDER BY created_at ASC
         LIMIT $${params.length}
         FOR UPDATE SKIP LOCKED
       ),
       claimed AS (
         UPDATE connector_runtime_events r
         SET status = 'PROCESSING',
             updated_at = NOW()
         FROM candidates c
         WHERE r.id = c.id
         RETURNING
           r.id::text as id,
           r.endpoint_id::text as endpoint_id,
           r.event_type,
           r.payload,
           r.attempt_count,
           r.max_attempts
       )
       SELECT *
       FROM claimed`,
      params,
    );
  }

  private normalizeWorkerCycleOptions(
    options: ConnectorRuntimeWorkerCycleOptions,
  ) {
    const merchantLimit = Math.max(
      1,
      Math.min(Number(options.merchantLimit || 25), 200),
    );
    const perMerchantQueueLimit = Math.max(
      1,
      Math.min(Number(options.perMerchantQueueLimit || 25), 100),
    );
    const perMerchantRecoverLimit = Math.max(
      1,
      Math.min(Number(options.perMerchantRecoverLimit || 25), 100),
    );
    const stuckOlderThanMinutes = Math.max(
      5,
      Math.min(Number(options.stuckOlderThanMinutes || 30), 240),
    );
    const reconciliationMerchantLimit = Math.max(
      0,
      Math.min(Number(options.reconciliationMerchantLimit || 5), 50),
    );
    const runReconciliation = options.runReconciliation !== false;
    const reconciliationScope =
      options.reconciliationScope &&
      ["orders", "payments", "inventory", "catalog", "all"].includes(
        options.reconciliationScope,
      )
        ? options.reconciliationScope
        : "payments";

    return {
      merchantLimit,
      perMerchantQueueLimit,
      perMerchantRecoverLimit,
      stuckOlderThanMinutes,
      reconciliationMerchantLimit,
      runReconciliation,
      reconciliationScope,
    };
  }

  private async loadRuntimeCandidateMerchants(
    limit: number,
  ): Promise<string[]> {
    try {
      const result = await this.pool.query<{ merchant_id: string }>(
        `WITH runtime_candidates AS (
           SELECT
             merchant_id,
             MIN(created_at) as priority_at
           FROM connector_runtime_events
           WHERE status IN ('PENDING', 'RETRY', 'PROCESSING')
           GROUP BY merchant_id
           UNION ALL
           SELECT
             merchant_id,
             MIN(moved_to_dlq_at) as priority_at
           FROM connector_runtime_dlq
           WHERE status = 'OPEN'
           GROUP BY merchant_id
         )
         SELECT merchant_id
         FROM runtime_candidates
         GROUP BY merchant_id
         ORDER BY MIN(priority_at) ASC
         LIMIT $1`,
        [limit],
      );

      return result.rows
        .map((row) => String(row.merchant_id || "").trim())
        .filter(Boolean);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "42P01" || code === "42703") {
        return [];
      }
      throw error;
    }
  }

  private async withMerchantPartitionLock<T>(
    merchantId: string,
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    const lockClient = await this.pool.connect();
    let lockAcquired = false;

    try {
      const lock = await lockClient.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) as locked`,
        [CONNECTOR_RUNTIME_WORKER_LOCK_NAMESPACE, merchantId],
      );

      lockAcquired = lock.rows[0]?.locked === true;
      if (!lockAcquired) {
        return { acquired: false };
      }

      const result = await fn();
      return {
        acquired: true,
        result,
      };
    } finally {
      if (lockAcquired) {
        await lockClient
          .query(`SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`, [
            CONNECTOR_RUNTIME_WORKER_LOCK_NAMESPACE,
            merchantId,
          ])
          .catch(() => undefined);
      }
      lockClient.release();
    }
  }

  private isRuntimeWorkerLedgerSchemaMissing(error: any): boolean {
    const code = String(error?.code || "");
    return code === "42P01" || code === "42703";
  }

  async getHealth(merchantId: string) {
    const [runtime, dlq, processedLatest, pendingLag] = await Promise.all([
      this.pool.query<{
        status: string;
        count: string;
      }>(
        `SELECT status, COUNT(*)::text as count
         FROM connector_runtime_events
         WHERE merchant_id = $1
         GROUP BY status`,
        [merchantId],
      ),
      this.pool.query<{ open_dlq: string }>(
        `SELECT COUNT(*)::text as open_dlq
         FROM connector_runtime_dlq
         WHERE merchant_id = $1 AND status = 'OPEN'`,
        [merchantId],
      ),
      this.pool.query<{ processed_at: Date | null }>(
        `SELECT processed_at
         FROM connector_runtime_events
         WHERE merchant_id = $1
           AND status = 'PROCESSED'
           AND processed_at IS NOT NULL
         ORDER BY processed_at DESC
         LIMIT 1`,
        [merchantId],
      ),
      this.pool.query<{
        oldest_pending_at: Date | null;
        processing_lag_seconds: string;
      }>(
        `SELECT
           MIN(created_at) as oldest_pending_at,
           COALESCE(
             EXTRACT(EPOCH FROM NOW() - MIN(created_at))::bigint,
             0
           )::text as processing_lag_seconds
         FROM connector_runtime_events
         WHERE merchant_id = $1
           AND status IN ('PENDING', 'RETRY')`,
        [merchantId],
      ),
    ]);

    const byStatus = runtime.rows.reduce(
      (acc, row) => {
        acc[row.status] = Number(row.count || 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      byStatus,
      openDlq: Number(dlq.rows[0]?.open_dlq || 0),
      lastProcessedAt: processedLatest.rows[0]?.processed_at || null,
      oldestPendingAt: pendingLag.rows[0]?.oldest_pending_at || null,
      processingLagSeconds: Number(
        pendingLag.rows[0]?.processing_lag_seconds || 0,
      ),
    };
  }

  async recoverStuckProcessing(input: {
    merchantId: string;
    endpointId?: string;
    olderThanMinutes?: number;
    limit?: number;
  }) {
    const safeOlderThanMinutes = Math.max(
      5,
      Math.min(Number(input.olderThanMinutes || 15), 240),
    );
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 25), 200));
    const recoveryMarker = this.buildAuditTrailEntry(
      "SYSTEM_RECOVER_STUCK_PROCESSING",
      `Requeued PROCESSING event older than ${safeOlderThanMinutes}m`,
    );

    const params: any[] = [input.merchantId];
    let endpointFilter = "";

    if (input.endpointId) {
      params.push(input.endpointId);
      endpointFilter = ` AND endpoint_id::text = $${params.length}`;
    }

    params.push(safeOlderThanMinutes);
    const thresholdParam = params.length;

    params.push(safeLimit);
    const limitParam = params.length;

    params.push(recoveryMarker);
    const markerParam = params.length;

    const recovered = await this.pool.query<{ id: string }>(
      `WITH picked AS (
         SELECT id
         FROM connector_runtime_events
         WHERE merchant_id = $1
           ${endpointFilter}
           AND status = 'PROCESSING'
           AND updated_at <= NOW() - ($${thresholdParam} * INTERVAL '1 minute')
         ORDER BY updated_at ASC
         LIMIT $${limitParam}
         FOR UPDATE SKIP LOCKED
       ),
       updated_events AS (
         UPDATE connector_runtime_events r
         SET status = 'RETRY',
             next_retry_at = NOW(),
             updated_at = NOW(),
             last_error = CASE
               WHEN COALESCE(r.last_error, '') = '' THEN $${markerParam}
               ELSE LEFT(r.last_error || E'\\n' || $${markerParam}, 4000)
             END
         FROM picked p
         WHERE r.id = p.id
         RETURNING r.id::text as id
       )
       SELECT id
       FROM updated_events`,
      params,
    );

    const runtimeEventIds = recovered.rows.map((row) => row.id);

    return {
      recoveredCount: runtimeEventIds.length,
      runtimeEventIds,
      items: runtimeEventIds,
      effectiveOlderThanMinutes: safeOlderThanMinutes,
      effectiveLimit: safeLimit,
      filters: {
        endpointId: input.endpointId || null,
        olderThanMinutes: safeOlderThanMinutes,
        limit: safeLimit,
      },
    };
  }

  async listRuntimeEvents(input: {
    merchantId: string;
    status?: ConnectorRuntimeEventStatus;
    endpointId?: string;
    limit?: number;
    offset?: number;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const safeOffset = Math.max(0, Number(input.offset || 0));
    const normalizedStatus = input.status
      ? String(input.status).toUpperCase()
      : null;

    if (
      normalizedStatus &&
      !CONNECTOR_RUNTIME_EVENT_STATUSES.includes(
        normalizedStatus as ConnectorRuntimeEventStatus,
      )
    ) {
      throw new BadRequestException("Invalid connector runtime status filter");
    }

    const params: any[] = [input.merchantId];
    let statusFilter = "";
    let endpointFilter = "";

    if (normalizedStatus) {
      params.push(normalizedStatus);
      statusFilter = ` AND status = $${params.length}`;
    }

    if (input.endpointId) {
      params.push(input.endpointId);
      endpointFilter = ` AND endpoint_id::text = $${params.length}`;
    }

    const countQuery = this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text as total
       FROM connector_runtime_events
       WHERE merchant_id = $1
         ${statusFilter}
         ${endpointFilter}`,
      params,
    );

    const listParams = [...params, safeLimit, safeOffset];
    const rowsQuery = this.pool.query(
      `SELECT
         id::text as id,
         endpoint_id::text as endpoint_id,
         merchant_id,
         event_type,
         payload,
         status,
         attempt_count,
         max_attempts,
         last_error,
         next_retry_at,
         processed_at,
         created_at,
         updated_at
       FROM connector_runtime_events
       WHERE merchant_id = $1
         ${statusFilter}
         ${endpointFilter}
       ORDER BY created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    const [count, rows] = await Promise.all([countQuery, rowsQuery]);
    const runtimeRows = rows.rows;

    return {
      total: Number(count.rows[0]?.total || 0),
      rows: runtimeRows,
      items: runtimeRows,
      limit: safeLimit,
      offset: safeOffset,
      filters: {
        status: normalizedStatus,
        endpointId: input.endpointId || null,
      },
    };
  }

  async listDlq(merchantId: string, limit = 50, offset = 0) {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const safeOffset = Math.max(0, offset);

    const rows = await this.pool.query(
      `SELECT
         id::text as id,
         runtime_event_id::text as runtime_event_id,
         endpoint_id::text as endpoint_id,
         event_type,
         payload,
         last_error,
         attempt_count,
         first_failed_at,
         moved_to_dlq_at,
         replayed_at,
         replay_count,
         status,
         created_at,
         updated_at
       FROM connector_runtime_dlq
       WHERE merchant_id = $1
       ORDER BY moved_to_dlq_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, safeLimit, safeOffset],
    );

    return {
      items: rows.rows,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async retryDlq(merchantId: string, dlqId: string) {
    const row = await this.pool.query<{
      id: string;
      runtime_event_id: string;
      status: string;
      replay_count: number;
    }>(
      `SELECT
         id::text as id,
         runtime_event_id::text as runtime_event_id,
         status,
         replay_count
       FROM connector_runtime_dlq
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, dlqId],
    );

    if (!row.rows.length) {
      throw new NotFoundException("DLQ item not found");
    }

    if (row.rows[0].status !== "OPEN") {
      throw new BadRequestException("Only OPEN DLQ items can be retried");
    }

    await this.pool.query(
      `UPDATE connector_runtime_events
       SET status = 'RETRY',
           next_retry_at = NOW(),
           updated_at = NOW()
       WHERE id::text = $1`,
      [row.rows[0].runtime_event_id],
    );

    await this.pool.query(
      `UPDATE connector_runtime_dlq
       SET status = 'REPLAYED',
           replay_count = replay_count + 1,
           replayed_at = NOW(),
           updated_at = NOW()
       WHERE id::text = $1`,
      [dlqId],
    );

    return {
      retried: true,
      runtimeEventId: row.rows[0].runtime_event_id,
    };
  }

  async discardDlq(merchantId: string, dlqId: string, reason?: string) {
    const row = await this.pool.query<{
      id: string;
      runtime_event_id: string;
      status: string;
    }>(
      `SELECT
         id::text as id,
         runtime_event_id::text as runtime_event_id,
         status
       FROM connector_runtime_dlq
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, dlqId],
    );

    if (!row.rows.length) {
      throw new NotFoundException("DLQ item not found");
    }

    if (row.rows[0].status !== "OPEN") {
      throw new BadRequestException("Only OPEN DLQ items can be discarded");
    }

    const discardMarker = this.buildAuditTrailEntry("DISCARDED", reason);
    const discarded = await this.pool.query<{
      id: string;
      runtime_event_id: string;
      status: string;
      updated_at: Date;
    }>(
      `UPDATE connector_runtime_dlq
       SET status = 'DISCARDED',
           last_error = CASE
             WHEN COALESCE(last_error, '') = '' THEN $3
             ELSE LEFT(last_error || E'\\n' || $3, 4000)
           END,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND id::text = $2
         AND status = 'OPEN'
       RETURNING
         id::text as id,
         runtime_event_id::text as runtime_event_id,
         status,
         updated_at`,
      [merchantId, dlqId, discardMarker],
    );

    if (!discarded.rows.length) {
      throw new BadRequestException("Only OPEN DLQ items can be discarded");
    }

    return {
      discarded: true,
      dlqId: discarded.rows[0].id,
      runtimeEventId: discarded.rows[0].runtime_event_id,
      status: discarded.rows[0].status,
      updatedAt: discarded.rows[0].updated_at,
    };
  }

  async discardDlqBatch(input: {
    merchantId: string;
    limit?: number;
    endpointId?: string;
    reason?: string;
  }) {
    const safeLimit = Math.max(1, Math.min(input.limit || 25, 200));
    const params: any[] = [input.merchantId];
    let endpointFilter = "";

    if (input.endpointId) {
      params.push(input.endpointId);
      endpointFilter = ` AND endpoint_id::text = $${params.length}`;
    }

    params.push(safeLimit);
    const limitParam = params.length;

    params.push(this.buildAuditTrailEntry("DISCARDED", input.reason));
    const markerParam = params.length;

    const discarded = await this.pool.query<{
      id: string;
      runtime_event_id: string;
    }>(
      `WITH picked AS (
         SELECT
           id,
           runtime_event_id
         FROM connector_runtime_dlq
         WHERE merchant_id = $1
           AND status = 'OPEN'
           ${endpointFilter}
         ORDER BY moved_to_dlq_at ASC
         LIMIT $${limitParam}
         FOR UPDATE SKIP LOCKED
       ),
       updated_dlq AS (
         UPDATE connector_runtime_dlq d
         SET status = 'DISCARDED',
             last_error = CASE
               WHEN COALESCE(d.last_error, '') = '' THEN $${markerParam}
               ELSE LEFT(d.last_error || E'\\n' || $${markerParam}, 4000)
             END,
             updated_at = NOW()
         FROM picked p
         WHERE d.id = p.id
         RETURNING d.id::text as id, d.runtime_event_id::text as runtime_event_id
       )
       SELECT id, runtime_event_id
       FROM updated_dlq`,
      params,
    );

    return {
      discardedCount: discarded.rows.length,
      items: discarded.rows,
      limit: safeLimit,
    };
  }

  async retryDlqBatch(input: {
    merchantId: string;
    limit?: number;
    endpointId?: string;
  }) {
    const safeLimit = Math.max(1, Math.min(input.limit || 25, 200));
    const params: any[] = [input.merchantId];
    let endpointFilter = "";

    if (input.endpointId) {
      params.push(input.endpointId);
      endpointFilter = ` AND endpoint_id::text = $${params.length}`;
    }

    params.push(safeLimit);

    const retried = await this.pool.query<{
      id: string;
      runtime_event_id: string;
    }>(
      `WITH picked AS (
         SELECT
           id,
           runtime_event_id
         FROM connector_runtime_dlq
         WHERE merchant_id = $1
           AND status = 'OPEN'
           ${endpointFilter}
         ORDER BY moved_to_dlq_at ASC
         LIMIT $${params.length}
         FOR UPDATE SKIP LOCKED
       ),
       updated_events AS (
         UPDATE connector_runtime_events e
         SET status = 'RETRY',
             next_retry_at = NOW(),
             updated_at = NOW()
         FROM picked p
         WHERE e.id = p.runtime_event_id
         RETURNING e.id
       ),
       updated_dlq AS (
         UPDATE connector_runtime_dlq d
         SET status = 'REPLAYED',
             replay_count = replay_count + 1,
             replayed_at = NOW(),
             updated_at = NOW()
         FROM picked p
         WHERE d.id = p.id
         RETURNING d.id::text as id, d.runtime_event_id::text as runtime_event_id
       )
       SELECT id, runtime_event_id
       FROM updated_dlq`,
      params,
    );

    return {
      retriedCount: retried.rows.length,
      items: retried.rows,
      limit: safeLimit,
    };
  }

  async startReconciliation(input: {
    merchantId: string;
    endpointId?: string;
    scope: ConnectorReconciliationScope;
    createdBy?: string;
  }) {
    const duplicate = await this.pool.query<{ id: string }>(
      `SELECT id::text as id
       FROM connector_reconciliation_runs
       WHERE merchant_id = $1
         AND scope = $2
         AND COALESCE(endpoint_id::text, '') = COALESCE($3, '')
         AND created_at >= NOW() - INTERVAL '5 minutes'
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.merchantId, input.scope, input.endpointId || null],
    );

    if (duplicate.rows.length > 0) {
      throw new BadRequestException(
        "A reconciliation run for this scope was created recently. Wait before starting another run.",
      );
    }

    const row = await this.pool.query<{
      id: string;
      status: string;
      scope: string;
      created_at: Date;
    }>(
      `INSERT INTO connector_reconciliation_runs (
         merchant_id,
         endpoint_id,
         scope,
         status,
         drift_count,
         summary,
         started_at,
         created_by
       ) VALUES ($1, $2::uuid, $3, 'RUNNING', 0, $4::jsonb, NOW(), $5)
       RETURNING id::text as id, status, scope, created_at`,
      [
        input.merchantId,
        input.endpointId || null,
        input.scope,
        JSON.stringify({
          mode: "runtime_analysis",
          stage: "started",
          windowDays: RECONCILIATION_WINDOW_DAYS,
          maxEvents: MAX_RECONCILIATION_EVENT_SCAN,
        }),
        input.createdBy || null,
      ],
    );

    const runId = row.rows[0].id;

    try {
      const eventTypes = this.getEventTypesForScope(input.scope);
      const events = await this.pool.query<{
        id: string;
        endpoint_id: string;
        event_type: string;
        payload: Record<string, any>;
        status: string;
        error: string | null;
        created_at: Date;
      }>(
        `SELECT
           ie.id::text as id,
           ie.endpoint_id::text as endpoint_id,
           ie.event_type,
           ie.payload,
           ie.status,
           ie.error,
           ie.created_at
         FROM integration_events ie
         WHERE ie.merchant_id = $1
           AND ($2::uuid IS NULL OR ie.endpoint_id = $2::uuid)
           AND ie.event_type = ANY($3::text[])
           AND ie.created_at >= NOW() - ($4 * INTERVAL '1 day')
         ORDER BY ie.created_at DESC
         LIMIT $5`,
        [
          input.merchantId,
          input.endpointId || null,
          eventTypes,
          RECONCILIATION_WINDOW_DAYS,
          MAX_RECONCILIATION_EVENT_SCAN,
        ],
      );

      const orderNumbers = new Set<string>();
      for (const event of events.rows) {
        if (
          event.event_type === "order.created" ||
          event.event_type === "payment.received"
        ) {
          const orderNumber = this.extractOrderNumber(event.payload || {});
          if (orderNumber) {
            orderNumbers.add(orderNumber);
          }
        }
      }

      const orderByNumber = new Map<
        string,
        { id: string; paymentStatus: string | null }
      >();

      if (orderNumbers.size > 0) {
        const orderLookup = await this.pool.query<{
          id: string;
          order_number: string;
          payment_status: string | null;
        }>(
          `SELECT
             id::text as id,
             order_number,
             payment_status::text as payment_status
           FROM orders
           WHERE merchant_id = $1
             AND order_number = ANY($2::text[])`,
          [input.merchantId, Array.from(orderNumbers)],
        );

        for (const row of orderLookup.rows) {
          orderByNumber.set(String(row.order_number), {
            id: row.id,
            paymentStatus: row.payment_status,
          });
        }
      }

      const reconciliationItems: Array<{
        entityType: string;
        entityKey: string;
        sourceHash: string | null;
        targetHash: string | null;
        driftType: string;
      }> = [];

      const driftByType: Record<string, number> = {};
      for (const event of events.rows) {
        const payload =
          event.payload && typeof event.payload === "object"
            ? event.payload
            : {};
        const eventType = String(event.event_type || "");
        const normalizedStatus = String(event.status || "").toUpperCase();
        const entityType = this.mapEntityTypeFromEvent(eventType);
        const entityKey = this.extractEntityKey(eventType, payload, event.id);

        if (normalizedStatus !== "PROCESSED") {
          reconciliationItems.push({
            entityType,
            entityKey,
            sourceHash: this.hashJson({
              eventType,
              status: normalizedStatus,
              payload,
              error: event.error,
            }),
            targetHash: null,
            driftType: "EVENT_FAILED",
          });
          continue;
        }

        if (eventType === "order.created") {
          const orderNumber = this.extractOrderNumber(payload);
          if (!orderNumber) {
            reconciliationItems.push({
              entityType: "order",
              entityKey,
              sourceHash: this.hashJson(payload),
              targetHash: null,
              driftType: "PAYLOAD_MISSING_ORDER_NUMBER",
            });
            continue;
          }

          const targetOrder = orderByNumber.get(orderNumber);
          if (!targetOrder) {
            reconciliationItems.push({
              entityType: "order",
              entityKey: orderNumber,
              sourceHash: this.hashJson(payload),
              targetHash: null,
              driftType: "MISSING_TARGET_ORDER",
            });
          }

          continue;
        }

        if (eventType === "payment.received") {
          const orderNumber = this.extractOrderNumber(payload);
          if (!orderNumber) {
            reconciliationItems.push({
              entityType: "payment",
              entityKey,
              sourceHash: this.hashJson(payload),
              targetHash: null,
              driftType: "PAYLOAD_MISSING_ORDER_NUMBER",
            });
            continue;
          }

          const targetOrder = orderByNumber.get(orderNumber);
          if (!targetOrder) {
            reconciliationItems.push({
              entityType: "payment",
              entityKey: orderNumber,
              sourceHash: this.hashJson(payload),
              targetHash: null,
              driftType: "MISSING_TARGET_ORDER",
            });
            continue;
          }

          const paymentStatus = String(
            targetOrder.paymentStatus || "",
          ).toUpperCase();
          if (!["PAID", "PARTIALLY_PAID"].includes(paymentStatus)) {
            reconciliationItems.push({
              entityType: "payment",
              entityKey: orderNumber,
              sourceHash: this.hashJson(payload),
              targetHash: this.hashJson({
                orderId: targetOrder.id,
                paymentStatus: targetOrder.paymentStatus || null,
              }),
              driftType: "PAYMENT_NOT_APPLIED",
            });
          }
        }
      }

      for (const item of reconciliationItems) {
        driftByType[item.driftType] = (driftByType[item.driftType] || 0) + 1;

        await this.pool.query(
          `INSERT INTO connector_reconciliation_items (
             run_id,
             merchant_id,
             entity_type,
             entity_key,
             source_hash,
             target_hash,
             drift_type,
             status
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'OPEN')`,
          [
            runId,
            input.merchantId,
            item.entityType,
            item.entityKey,
            item.sourceHash,
            item.targetHash,
            item.driftType,
          ],
        );
      }

      const summary = {
        mode: "runtime_analysis",
        stage: "completed",
        scope: input.scope,
        endpointId: input.endpointId || null,
        eventsScanned: events.rows.length,
        driftCount: reconciliationItems.length,
        driftByType,
        generatedAt: new Date().toISOString(),
      };

      await this.pool.query(
        `UPDATE connector_reconciliation_runs
         SET status = 'COMPLETED',
             drift_count = $2,
             summary = $3::jsonb,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id::text = $1`,
        [runId, reconciliationItems.length, JSON.stringify(summary)],
      );

      return {
        runId,
        status: "COMPLETED",
        scope: input.scope,
        driftCount: reconciliationItems.length,
        eventsScanned: events.rows.length,
        driftByType,
        mode: "runtime_analysis",
        createdAt: row.rows[0].created_at,
      };
    } catch (error: any) {
      await this.pool
        .query(
          `UPDATE connector_reconciliation_runs
           SET status = 'FAILED',
               summary = COALESCE(summary, '{}'::jsonb) || $2::jsonb,
               completed_at = NOW(),
               updated_at = NOW()
           WHERE id::text = $1`,
          [
            runId,
            JSON.stringify({
              stage: "failed",
              error: String(error?.message || "Reconciliation failed"),
              failedAt: new Date().toISOString(),
            }),
          ],
        )
        .catch(() => undefined);

      throw error;
    }
  }

  async listReconciliationRuns(merchantId: string, limit = 30, offset = 0) {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const safeOffset = Math.max(0, offset);

    const rows = await this.pool.query(
      `SELECT
         id::text as id,
         endpoint_id::text as endpoint_id,
         scope,
         status,
         drift_count,
         summary,
         started_at,
         completed_at,
         created_by,
         created_at,
         updated_at
       FROM connector_reconciliation_runs
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, safeLimit, safeOffset],
    );

    return {
      runs: rows.rows,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async getReconciliationRunDetails(input: {
    merchantId: string;
    runId: string;
    limit?: number;
    offset?: number;
    status?: ConnectorReconciliationItemStatus;
  }) {
    const safeLimit = Math.max(1, Math.min(input.limit || 50, 200));
    const safeOffset = Math.max(0, input.offset || 0);
    const normalizedStatus = input.status
      ? String(input.status).toUpperCase()
      : null;

    if (
      normalizedStatus &&
      !["OPEN", "RESOLVED", "IGNORED"].includes(normalizedStatus)
    ) {
      throw new BadRequestException(
        "Invalid reconciliation item status filter",
      );
    }

    const run = await this.pool.query(
      `SELECT
         id::text as id,
         endpoint_id::text as endpoint_id,
         scope,
         status,
         drift_count,
         summary,
         started_at,
         completed_at,
         created_by,
         created_at,
         updated_at
       FROM connector_reconciliation_runs
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [input.merchantId, input.runId],
    );

    if (!run.rows.length) {
      throw new NotFoundException("Reconciliation run not found");
    }

    const params: any[] = [input.merchantId, input.runId];
    let statusFilter = "";
    if (normalizedStatus) {
      params.push(normalizedStatus);
      statusFilter = ` AND status = $${params.length}`;
    }

    params.push(safeLimit);
    params.push(safeOffset);

    const rows = await this.pool.query(
      `SELECT
         id::text as id,
         run_id::text as run_id,
         entity_type,
         entity_key,
         source_hash,
         target_hash,
         drift_type,
         status,
         resolution_note,
         resolved_at,
         created_at,
         updated_at
       FROM connector_reconciliation_items
       WHERE merchant_id = $1
         AND run_id::text = $2
         ${statusFilter}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = params.slice(0, params.length - 2);
    const total = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text as total
       FROM connector_reconciliation_items
       WHERE merchant_id = $1
         AND run_id::text = $2
         ${statusFilter}`,
      countParams,
    );

    const countsByStatus = await this.pool.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*)::text as count
       FROM connector_reconciliation_items
       WHERE merchant_id = $1
         AND run_id::text = $2
       GROUP BY status`,
      [input.merchantId, input.runId],
    );
    const byStatus = this.buildReconciliationStatusCounts(countsByStatus.rows);

    return {
      run: run.rows[0],
      limit: safeLimit,
      offset: safeOffset,
      statusFilter: normalizedStatus,
      totalItems: Number(total.rows[0]?.total || 0),
      byStatus,
      items: rows.rows,
    };
  }

  async getReconciliationRunSummary(input: {
    merchantId: string;
    runId: string;
  }) {
    const run = await this.pool.query<{
      id: string;
      endpoint_id: string | null;
      scope: string;
      status: string;
      drift_count: number;
      summary: Record<string, any> | null;
      started_at: Date | null;
      completed_at: Date | null;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
         id::text as id,
         endpoint_id::text as endpoint_id,
         scope,
         status,
         drift_count,
         summary,
         started_at,
         completed_at,
         created_by,
         created_at,
         updated_at
       FROM connector_reconciliation_runs
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [input.merchantId, input.runId],
    );

    if (!run.rows.length) {
      throw new NotFoundException("Reconciliation run not found");
    }

    const [statusCounts, driftTypeCounts] = await Promise.all([
      this.pool.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text as count
         FROM connector_reconciliation_items
         WHERE merchant_id = $1
           AND run_id::text = $2
         GROUP BY status`,
        [input.merchantId, input.runId],
      ),
      this.pool.query<{ drift_type: string; count: string }>(
        `SELECT drift_type, COUNT(*)::text as count
         FROM connector_reconciliation_items
         WHERE merchant_id = $1
           AND run_id::text = $2
         GROUP BY drift_type`,
        [input.merchantId, input.runId],
      ),
    ]);

    const statusCount = this.buildReconciliationStatusCounts(statusCounts.rows);
    const driftTypeCount = driftTypeCounts.rows.reduce(
      (acc, row) => {
        const driftType =
          String(row.drift_type || "UNKNOWN").trim() || "UNKNOWN";
        acc[driftType] = Number(row.count || 0);
        return acc;
      },
      {} as Record<string, number>,
    );

    const totalItems = Object.values(statusCount).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      run: run.rows[0],
      statusCount,
      driftTypeCount,
      totals: {
        totalItems,
        openItems: statusCount.OPEN,
        resolvedItems: statusCount.RESOLVED,
        ignoredItems: statusCount.IGNORED,
        driftCount: Number(run.rows[0]?.drift_count || 0),
      },
    };
  }

  async resolveReconciliationItem(input: {
    merchantId: string;
    runId: string;
    itemId: string;
    action: "RESOLVED" | "IGNORED";
    note?: string;
  }) {
    const action = String(input.action || "").toUpperCase();
    if (!["RESOLVED", "IGNORED"].includes(action)) {
      throw new BadRequestException("action must be RESOLVED or IGNORED");
    }

    const note = String(input.note || "").trim() || null;
    const updated = await this.pool.query<{
      id: string;
      status: string;
      resolution_note: string | null;
      resolved_at: Date | null;
      updated_at: Date;
    }>(
      `UPDATE connector_reconciliation_items
       SET status = $4,
           resolution_note = $5,
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE merchant_id = $1
         AND run_id::text = $2
         AND id::text = $3
         AND status = 'OPEN'
       RETURNING
         id::text as id,
         status,
         resolution_note,
         resolved_at,
         updated_at`,
      [input.merchantId, input.runId, input.itemId, action, note],
    );

    if (!updated.rows.length) {
      const existing = await this.pool.query<{ status: string }>(
        `SELECT status
         FROM connector_reconciliation_items
         WHERE merchant_id = $1
           AND run_id::text = $2
           AND id::text = $3
         LIMIT 1`,
        [input.merchantId, input.runId, input.itemId],
      );

      if (!existing.rows.length) {
        throw new NotFoundException("Reconciliation item not found");
      }

      throw new BadRequestException(
        "Only OPEN reconciliation items can be updated",
      );
    }

    const statusCounts = await this.pool.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*)::text as count
       FROM connector_reconciliation_items
       WHERE merchant_id = $1
         AND run_id::text = $2
       GROUP BY status`,
      [input.merchantId, input.runId],
    );
    const totals = this.buildReconciliationStatusCounts(statusCounts.rows);

    const openCount = totals.OPEN || 0;
    const totalItems = Object.values(totals).reduce(
      (sum, count) => sum + count,
      0,
    );

    const runSummary = await this.pool.query<{ summary: Record<string, any> }>(
      `SELECT summary
       FROM connector_reconciliation_runs
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [input.merchantId, input.runId],
    );

    const summary = {
      ...(runSummary.rows[0]?.summary || {}),
      resolution: {
        lastAction: action,
        lastItemId: input.itemId,
        lastActionAt: new Date().toISOString(),
      },
    };

    await this.pool.query(
      `UPDATE connector_reconciliation_runs
       SET drift_count = $3,
           summary = $4::jsonb,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND id::text = $2`,
      [input.merchantId, input.runId, openCount, JSON.stringify(summary)],
    );

    return {
      item: updated.rows[0],
      run: {
        id: input.runId,
        openItems: openCount,
        resolvedItems: totals.RESOLVED,
        ignoredItems: totals.IGNORED,
        totalItems,
      },
    };
  }

  async reopenReconciliationItem(input: {
    merchantId: string;
    runId: string;
    itemId: string;
    note?: string;
  }) {
    const reopenMarker = this.buildAuditTrailEntry("REOPENED", input.note);
    const updated = await this.pool.query<{
      id: string;
      status: string;
      resolution_note: string | null;
      resolved_at: Date | null;
      updated_at: Date;
    }>(
      `UPDATE connector_reconciliation_items
       SET status = 'OPEN',
           resolution_note = CASE
             WHEN COALESCE(resolution_note, '') = '' THEN $4
             ELSE LEFT(resolution_note || E'\\n' || $4, 4000)
           END,
           resolved_at = NULL,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND run_id::text = $2
         AND id::text = $3
         AND status IN ('RESOLVED', 'IGNORED')
       RETURNING
         id::text as id,
         status,
         resolution_note,
         resolved_at,
         updated_at`,
      [input.merchantId, input.runId, input.itemId, reopenMarker],
    );

    if (!updated.rows.length) {
      const existing = await this.pool.query<{ status: string }>(
        `SELECT status
         FROM connector_reconciliation_items
         WHERE merchant_id = $1
           AND run_id::text = $2
           AND id::text = $3
         LIMIT 1`,
        [input.merchantId, input.runId, input.itemId],
      );

      if (!existing.rows.length) {
        throw new NotFoundException("Reconciliation item not found");
      }

      throw new BadRequestException(
        "Only RESOLVED or IGNORED reconciliation items can be reopened",
      );
    }

    const statusCounts = await this.pool.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*)::text as count
       FROM connector_reconciliation_items
       WHERE merchant_id = $1
         AND run_id::text = $2
       GROUP BY status`,
      [input.merchantId, input.runId],
    );
    const totals = this.buildReconciliationStatusCounts(statusCounts.rows);

    const openCount = totals.OPEN || 0;
    const totalItems = Object.values(totals).reduce(
      (sum, count) => sum + count,
      0,
    );

    await this.pool.query(
      `UPDATE connector_reconciliation_runs
       SET drift_count = $3,
           summary = jsonb_set(
             COALESCE(summary, '{}'::jsonb),
             '{resolution}',
             $4::jsonb,
             true
           ),
           updated_at = NOW()
       WHERE merchant_id = $1
         AND id::text = $2`,
      [
        input.merchantId,
        input.runId,
        openCount,
        JSON.stringify({
          lastAction: "REOPENED",
          lastItemId: input.itemId,
          lastActionAt: new Date().toISOString(),
        }),
      ],
    );

    return {
      item: updated.rows[0],
      run: {
        id: input.runId,
        openItems: openCount,
        resolvedItems: totals.RESOLVED,
        ignoredItems: totals.IGNORED,
        totalItems,
      },
    };
  }

  private buildReconciliationStatusCounts(
    rows: Array<{ status: string; count: string }>,
  ): Record<ConnectorReconciliationItemStatus, number> {
    const counts: Record<ConnectorReconciliationItemStatus, number> = {
      OPEN: 0,
      RESOLVED: 0,
      IGNORED: 0,
    };

    for (const row of rows) {
      const key = String(
        row.status || "",
      ).toUpperCase() as ConnectorReconciliationItemStatus;
      if (RECONCILIATION_ITEM_STATUSES.includes(key)) {
        counts[key] = Number(row.count || 0);
      }
    }

    return counts;
  }

  private getEventTypesForScope(scope: ConnectorReconciliationScope): string[] {
    if (scope === "all") {
      return [...INTEGRATION_EVENT_TAXONOMY];
    }

    const map: Record<
      Exclude<ConnectorReconciliationScope, "all">,
      string[]
    > = {
      orders: [
        "order.created",
        "order.updated",
        "order.cancelled",
        "order.status_changed",
        "shipment.status_changed",
      ],
      payments: ["payment.received", "refund.created"],
      inventory: ["inventory.adjusted"],
      catalog: ["catalog.updated"],
    };

    return map[scope] || [...INTEGRATION_EVENT_TAXONOMY];
  }

  private mapEntityTypeFromEvent(eventType: string): string {
    if (eventType.startsWith("order.") || eventType.startsWith("shipment.")) {
      return "order";
    }
    if (eventType.startsWith("payment.") || eventType.startsWith("refund.")) {
      return "payment";
    }
    if (eventType.startsWith("inventory.")) {
      return "inventory";
    }
    if (eventType.startsWith("catalog.")) {
      return "catalog";
    }
    if (eventType.startsWith("customer.")) {
      return "customer";
    }
    return "event";
  }

  private extractOrderNumber(payload: Record<string, any>): string | null {
    const direct = String(
      payload?.orderNumber || payload?.order_number || payload?.reference || "",
    ).trim();
    if (direct) {
      return direct;
    }

    const nested = String(
      payload?.order?.orderNumber || payload?.order?.order_number || "",
    ).trim();
    return nested || null;
  }

  private extractEntityKey(
    eventType: string,
    payload: Record<string, any>,
    fallback: string,
  ): string {
    if (eventType === "order.created" || eventType === "payment.received") {
      return this.extractOrderNumber(payload) || fallback;
    }

    const keys = [
      payload?.id,
      payload?.eventId,
      payload?.externalId,
      payload?.sku,
      payload?.customerId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return keys[0] || fallback;
  }

  private hashJson(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private buildAuditTrailEntry(action: string, note?: string): string {
    const normalizedNote = String(note || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    const timestamp = new Date().toISOString();
    return normalizedNote
      ? `[${action} ${timestamp}] ${normalizedNote}`
      : `[${action} ${timestamp}]`;
  }

  private assertPayloadWithinLimit(payload: Record<string, any>): void {
    const serialized = JSON.stringify(payload || {});
    if (Buffer.byteLength(serialized, "utf8") > MAX_CONNECTOR_PAYLOAD_BYTES) {
      throw new BadRequestException(CONNECTOR_PAYLOAD_SIZE_ERROR);
    }
  }

  private isNonRetryableRuntimeError(error: any): boolean {
    const rawMessage = error?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(" | ")
      : String(rawMessage || "");

    return message.includes(CONNECTOR_PAYLOAD_SIZE_ERROR);
  }

  private getRetryDelaySeconds(attempt: number): number {
    const safeAttempt = Math.max(1, Math.min(Number(attempt || 1), 8));
    const baseSeconds = 30;
    const maxDelaySeconds = 30 * 60;
    return Math.min(baseSeconds * 2 ** (safeAttempt - 1), maxDelaySeconds);
  }
}
