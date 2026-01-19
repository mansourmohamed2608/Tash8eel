import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../infrastructure/database/database.module';
import { EventType } from './event-types';
import { OutboxEvent, EventStatus } from '../../domain/entities/event.entity';
import { v4 as uuidv4 } from 'uuid';

export interface PublishEventParams {
  eventType: EventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  merchantId: string;
  correlationId?: string;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Publish event to outbox (transactionally with other DB operations)
   * This should be called within a transaction for consistency
   */
  async publishEvent(params: PublishEventParams): Promise<OutboxEvent> {
    const id = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, 
        payload, status, merchant_id, correlation_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      id,
      params.eventType,
      params.aggregateType,
      params.aggregateId,
      JSON.stringify(params.payload),
      'PENDING',
      params.merchantId,
      params.correlationId || uuidv4(),
      now,
    ]);

    this.logger.log({
      msg: 'Event published to outbox',
      eventId: id,
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      merchantId: params.merchantId,
    });

    return this.mapToEntity(result.rows[0]);
  }

  /**
   * Publish event within existing transaction
   */
  async publishEventInTransaction(
    client: import('pg').PoolClient,
    params: PublishEventParams,
  ): Promise<OutboxEvent> {
    const id = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, 
        payload, status, merchant_id, correlation_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      RETURNING *
    `;

    const result = await client.query(query, [
      id,
      params.eventType,
      params.aggregateType,
      params.aggregateId,
      JSON.stringify(params.payload),
      'PENDING',
      params.merchantId,
      params.correlationId || uuidv4(),
      now,
    ]);

    return this.mapToEntity(result.rows[0]);
  }

  /**
   * Fetch pending events for processing (with locking)
   */
  async fetchPendingEvents(limit: number = 100): Promise<OutboxEvent[]> {
    const query = `
      SELECT * FROM outbox_events
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows.map((row) => this.mapToEntity(row));
  }

  /**
   * Mark event as processed
   */
  async markProcessed(eventId: string): Promise<void> {
    const query = `
      UPDATE outbox_events
      SET status = 'COMPLETED', processed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
    await this.pool.query(query, [eventId]);

    this.logger.debug({ msg: 'Event marked as processed', eventId });
  }

  /**
   * Mark event as failed and potentially move to DLQ
   */
  async markFailed(
    eventId: string,
    error: string,
    moveToDlq: boolean = false,
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Increment retry count
      const updateQuery = `
        UPDATE outbox_events
        SET status = 'FAILED', 
            error = $2, 
            retry_count = retry_count + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      const result = await client.query(updateQuery, [eventId, error]);
      const event = result.rows[0];

      // Move to DLQ if needed (retry count >= 5 or explicitly requested)
      if (moveToDlq || (event && event.retry_count >= 5)) {
        await this.moveToDlq(client, eventId, event, error);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Move event to Dead Letter Queue
   */
  private async moveToDlq(
    client: import('pg').PoolClient,
    eventId: string,
    event: any,
    error: string,
  ): Promise<void> {
    const dlqId = uuidv4();
    const now = new Date();

    // Insert into DLQ
    const insertQuery = `
      INSERT INTO dlq_events (
        id, original_event_id, event_type, aggregate_type, aggregate_id,
        payload, error_message, retry_count, merchant_id, correlation_id,
        original_created_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    `;

    await client.query(insertQuery, [
      dlqId,
      eventId,
      event.event_type,
      event.aggregate_type,
      event.aggregate_id,
      event.payload,
      error,
      event.retry_count,
      event.merchant_id,
      event.correlation_id,
      event.created_at,
      now,
    ]);

    // Mark original as moved to DLQ
    const updateQuery = `
      UPDATE outbox_events
      SET status = 'dlq', updated_at = NOW()
      WHERE id = $1
    `;
    await client.query(updateQuery, [eventId]);

    this.logger.warn({
      msg: 'Event moved to DLQ',
      eventId,
      dlqEventId: dlqId,
      eventType: event.event_type,
      retryCount: event.retry_count,
      error,
    });
  }

  /**
   * Retry processing a pending event
   */
  async retryEvent(eventId: string): Promise<void> {
    const query = `
      UPDATE outbox_events
      SET status = 'PENDING', updated_at = NOW()
      WHERE id = $1 AND status = 'FAILED'
    `;
    await this.pool.query(query, [eventId]);
  }

  /**
   * Get event by ID
   */
  async getEventById(eventId: string): Promise<OutboxEvent | null> {
    const query = `SELECT * FROM outbox_events WHERE id = $1`;
    const result = await this.pool.query(query, [eventId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapToEntity(result.rows[0]);
  }

  /**
   * Get events by aggregate
   */
  async getEventsByAggregate(
    aggregateType: string,
    aggregateId: string,
    merchantId: string,
  ): Promise<OutboxEvent[]> {
    const query = `
      SELECT * FROM outbox_events
      WHERE aggregate_type = $1 
        AND aggregate_id = $2 
        AND merchant_id = $3
      ORDER BY created_at ASC
    `;
    const result = await this.pool.query(query, [aggregateType, aggregateId, merchantId]);
    return result.rows.map((row) => this.mapToEntity(row));
  }

  /**
   * Get event statistics
   */
  async getEventStats(): Promise<{
    pending: number;
    processed: number;
    failed: number;
    dlq: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as processed,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status = 'FAILED' AND retry_count >= 5) as dlq
      FROM outbox_events
    `;
    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      pending: parseInt(row.pending, 10),
      processed: parseInt(row.processed, 10),
      failed: parseInt(row.failed, 10),
      dlq: parseInt(row.dlq, 10),
    };
  }

  /**
   * Cleanup old processed events
   */
  async cleanupOldEvents(daysToKeep: number = 30): Promise<number> {
    const query = `
      DELETE FROM outbox_events
      WHERE status = 'processed' 
        AND processed_at < NOW() - INTERVAL '1 day' * $1
    `;
    const result = await this.pool.query(query, [daysToKeep]);
    
    this.logger.log({
      msg: 'Cleaned up old processed events',
      deletedCount: result.rowCount,
      daysKept: daysToKeep,
    });

    return result.rowCount || 0;
  }

  private mapToEntity(row: any): OutboxEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status as EventStatus,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      merchantId: row.merchant_id,
      correlationId: row.correlation_id,
      processedAt: row.processed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
