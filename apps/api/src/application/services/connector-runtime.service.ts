import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  INTEGRATION_EVENT_TAXONOMY,
  IntegrationEventType,
  IntegrationService,
} from "./integration.service";

const MAX_CONNECTOR_PAYLOAD_BYTES = 128 * 1024;

@Injectable()
export class ConnectorRuntimeService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly integrationService: IntegrationService,
  ) {}

  getEventTaxonomy() {
    return {
      events: INTEGRATION_EVENT_TAXONOMY,
      runtimeStates: [
        "PENDING",
        "PROCESSING",
        "PROCESSED",
        "RETRY",
        "DEAD_LETTER",
      ],
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

      this.assertPayloadWithinLimit(row.payload || {});

      try {
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

        if (nextAttempt >= maxAttempts) {
          await this.pool.query(
            `UPDATE connector_runtime_events
             SET status = 'DEAD_LETTER',
                 attempt_count = $2,
                 last_error = $3,
                 updated_at = NOW()
             WHERE id::text = $1`,
            [row.id, nextAttempt, errMsg],
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
              nextAttempt,
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
    scope: "orders" | "payments" | "inventory" | "catalog" | "all";
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
         completed_at,
         created_by
       ) VALUES ($1, $2::uuid, $3, 'COMPLETED', 0, $4::jsonb, NOW(), NOW(), $5)
       RETURNING id::text as id, status, scope, created_at`,
      [
        input.merchantId,
        input.endpointId || null,
        input.scope,
        JSON.stringify({
          mode: "foundation_scaffold",
          note: "Reconciliation run scaffolded. Entity-level comparators to be added in next pass.",
        }),
        input.createdBy || null,
      ],
    );

    return {
      runId: row.rows[0].id,
      status: row.rows[0].status,
      scope: row.rows[0].scope,
      driftCount: 0,
      mode: "foundation_scaffold",
      createdAt: row.rows[0].created_at,
    };
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

  private assertPayloadWithinLimit(payload: Record<string, any>): void {
    const serialized = JSON.stringify(payload || {});
    if (Buffer.byteLength(serialized, "utf8") > MAX_CONNECTOR_PAYLOAD_BYTES) {
      throw new BadRequestException("Connector payload exceeds allowed size");
    }
  }

  private getRetryDelaySeconds(attempt: number): number {
    const safeAttempt = Math.max(1, Math.min(Number(attempt || 1), 8));
    const baseSeconds = 30;
    const maxDelaySeconds = 30 * 60;
    return Math.min(baseSeconds * 2 ** (safeAttempt - 1), maxDelaySeconds);
  }
}
