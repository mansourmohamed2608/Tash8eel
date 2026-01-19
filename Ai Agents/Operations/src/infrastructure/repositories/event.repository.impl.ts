import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { IEventRepository } from '../../domain/ports/event.repository';
import {
  OutboxEvent,
  CreateOutboxEventInput,
  DlqEvent,
  CreateDlqEventInput,
  MerchantReport,
  MerchantReportSummary,
} from '../../domain/entities/event.entity';
import { EventStatus, DlqStatus } from '../../shared/constants/enums';
import { generateId } from '../../shared/utils/helpers';

@Injectable()
export class EventRepository implements IEventRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  // ============= Outbox Events =============
  async createOutboxEvent(input: CreateOutboxEventInput): Promise<OutboxEvent> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, merchant_id, payload, correlation_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        input.merchantId || null,
        JSON.stringify(input.payload),
        input.correlationId || null,
        EventStatus.PENDING,
      ],
    );
    return this.mapOutboxEvent(result.rows[0]);
  }

  async findPendingOutboxEvents(limit: number): Promise<OutboxEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM outbox_events 
       WHERE status = $1 
       ORDER BY created_at ASC 
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [EventStatus.PENDING, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapOutboxEvent(row));
  }

  async updateOutboxEventStatus(id: string, status: EventStatus, error?: string): Promise<OutboxEvent | null> {
    const result = await this.pool.query(
      `UPDATE outbox_events SET status = $1, error = $2 WHERE id = $3 RETURNING *`,
      [status, error || null, id],
    );
    return result.rows[0] ? this.mapOutboxEvent(result.rows[0]) : null;
  }

  async markOutboxEventProcessed(id: string): Promise<OutboxEvent | null> {
    const result = await this.pool.query(
      `UPDATE outbox_events SET status = $1, processed_at = NOW() WHERE id = $2 RETURNING *`,
      [EventStatus.COMPLETED, id],
    );
    return result.rows[0] ? this.mapOutboxEvent(result.rows[0]) : null;
  }

  async incrementOutboxRetryCount(id: string): Promise<OutboxEvent | null> {
    const result = await this.pool.query(
      `UPDATE outbox_events SET retry_count = retry_count + 1 WHERE id = $1 RETURNING *`,
      [id],
    );
    return result.rows[0] ? this.mapOutboxEvent(result.rows[0]) : null;
  }

  // ============= DLQ Events =============
  async createDlqEvent(input: CreateDlqEventInput): Promise<DlqEvent> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO dlq_events (id, original_event_id, event_type, payload, error, stack, correlation_id, merchant_id, status, max_retries, next_retry_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        input.originalEventId || null,
        input.eventType,
        JSON.stringify(input.payload),
        input.error,
        input.stack || null,
        input.correlationId || null,
        input.merchantId || null,
        DlqStatus.PENDING,
        input.maxRetries || 5,
        new Date(Date.now() + 60000).toISOString(), // First retry in 1 minute
      ],
    );
    return this.mapDlqEvent(result.rows[0]);
  }

  async findDlqEventById(id: string): Promise<DlqEvent | null> {
    const result = await this.pool.query(`SELECT * FROM dlq_events WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
  }

  async findPendingDlqEvents(limit: number): Promise<DlqEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM dlq_events WHERE status IN ($1, $2) ORDER BY created_at ASC LIMIT $3`,
      [DlqStatus.PENDING, DlqStatus.RETRYING, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapDlqEvent(row));
  }

  async findDlqEventsForRetry(before: Date, limit: number): Promise<DlqEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM dlq_events 
       WHERE status IN ($1, $2) 
       AND next_retry_at <= $3
       AND retry_count < max_retries
       ORDER BY next_retry_at ASC 
       LIMIT $4`,
      [DlqStatus.PENDING, DlqStatus.RETRYING, before.toISOString(), limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapDlqEvent(row));
  }

  async updateDlqEventStatus(id: string, status: DlqStatus): Promise<DlqEvent | null> {
    const result = await this.pool.query(
      `UPDATE dlq_events SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id],
    );
    return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
  }

  async incrementDlqRetryCount(id: string, nextRetryAt: Date): Promise<DlqEvent | null> {
    const result = await this.pool.query(
      `UPDATE dlq_events SET retry_count = retry_count + 1, next_retry_at = $1, status = $2 WHERE id = $3 RETURNING *`,
      [nextRetryAt.toISOString(), DlqStatus.RETRYING, id],
    );
    return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
  }

  async resolveDlqEvent(id: string): Promise<DlqEvent | null> {
    const result = await this.pool.query(
      `UPDATE dlq_events SET status = $1, resolved_at = NOW() WHERE id = $2 RETURNING *`,
      [DlqStatus.RESOLVED, id],
    );
    return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
  }

  async countDlqEvents(): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM dlq_events WHERE status IN ($1, $2)`,
      [DlqStatus.PENDING, DlqStatus.RETRYING],
    );
    return parseInt(result.rows[0].count, 10);
  }

  // ============= Reports =============
  async createOrUpdateReport(
    merchantId: string,
    reportDate: string,
    summary: MerchantReportSummary,
  ): Promise<MerchantReport> {
    const result = await this.pool.query(
      `INSERT INTO merchant_reports (id, merchant_id, report_date, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (merchant_id, report_date)
       DO UPDATE SET summary = $4
       RETURNING *`,
      [generateId(), merchantId, reportDate, JSON.stringify(summary)],
    );
    return this.mapReport(result.rows[0]);
  }

  async findReportByDate(merchantId: string, reportDate: string): Promise<MerchantReport | null> {
    const result = await this.pool.query(
      `SELECT * FROM merchant_reports WHERE merchant_id = $1 AND report_date = $2`,
      [merchantId, reportDate],
    );
    return result.rows[0] ? this.mapReport(result.rows[0]) : null;
  }

  // ============= Mappers =============
  private mapOutboxEvent(row: Record<string, unknown>): OutboxEvent {
    return {
      id: row.id as string,
      eventType: row.event_type as string,
      aggregateType: row.aggregate_type as string,
      aggregateId: row.aggregate_id as string,
      merchantId: row.merchant_id as string | undefined,
      payload: row.payload as Record<string, unknown>,
      correlationId: row.correlation_id as string | undefined,
      status: row.status as EventStatus,
      processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined,
      error: row.error as string | undefined,
      retryCount: row.retry_count as number,
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapDlqEvent(row: Record<string, unknown>): DlqEvent {
    return {
      id: row.id as string,
      originalEventId: row.original_event_id as string | undefined,
      eventType: row.event_type as string,
      payload: row.payload as Record<string, unknown>,
      error: row.error as string,
      stack: row.stack as string | undefined,
      correlationId: row.correlation_id as string | undefined,
      merchantId: row.merchant_id as string | undefined,
      status: row.status as DlqStatus,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at as string) : undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapReport(row: Record<string, unknown>): MerchantReport {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      reportDate: row.report_date as string,
      summary: row.summary as MerchantReportSummary,
      createdAt: new Date(row.created_at as string),
    };
  }
}
