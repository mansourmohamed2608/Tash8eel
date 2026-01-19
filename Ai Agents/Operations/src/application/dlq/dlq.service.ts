import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../infrastructure/database/database.module';
import { OutboxService } from '../events/outbox.service';
import { DlqEvent } from '../../domain/entities/event.entity';

export interface DlqEventWithDetails extends DlqEvent {
  canReplay: boolean;
  ageInHours: number;
}

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Get all DLQ events with pagination
   */
  async listEvents(
    limit: number = 50,
    offset: number = 0,
    merchantId?: string,
  ): Promise<{ events: DlqEventWithDetails[]; total: number }> {
    let query = `
      SELECT *, COUNT(*) OVER() as total_count
      FROM dlq_events
      WHERE replayed_at IS NULL
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (merchantId) {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(merchantId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    const events = result.rows.map(row => this.mapToEventWithDetails(row));
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;

    return { events, total };
  }

  /**
   * Get single DLQ event by ID
   */
  async getEventById(eventId: string): Promise<DlqEventWithDetails | null> {
    const query = `SELECT * FROM dlq_events WHERE id = $1`;
    const result = await this.pool.query(query, [eventId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToEventWithDetails(result.rows[0]);
  }

  /**
   * Replay a single DLQ event
   */
  async replayEvent(eventId: string): Promise<{ success: boolean; newEventId?: string; error?: string }> {
    const event = await this.getEventById(eventId);

    if (!event) {
      throw new NotFoundException(`DLQ event ${eventId} not found`);
    }

    if (event.replayedAt) {
      return {
        success: false,
        error: 'Event has already been replayed',
      };
    }

    this.logger.log({
      msg: 'Replaying DLQ event',
      dlqEventId: eventId,
      eventType: event.eventType,
      originalEventId: event.originalEventId,
    });

    try {
      // Re-publish to outbox
      const newEvent = await this.outboxService.publishEvent({
        eventType: event.eventType as any,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        merchantId: event.merchantId,
        correlationId: event.correlationId,
      });

      // Mark as replayed
      await this.markAsReplayed(eventId);

      this.logger.log({
        msg: 'DLQ event replayed successfully',
        dlqEventId: eventId,
        newEventId: newEvent.id,
      });

      return {
        success: true,
        newEventId: newEvent.id,
      };
    } catch (error: any) {
      this.logger.error({
        msg: 'Failed to replay DLQ event',
        dlqEventId: eventId,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Replay multiple DLQ events
   */
  async replayBatch(eventIds: string[]): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: Array<{ eventId: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{ eventId: string; success: boolean; error?: string }> = [];

    for (const eventId of eventIds) {
      try {
        const result = await this.replayEvent(eventId);
        results.push({
          eventId,
          success: result.success,
          error: result.error,
        });
      } catch (error: any) {
        results.push({
          eventId,
          success: false,
          error: error.message,
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      total: eventIds.length,
      succeeded,
      failed,
      results,
    };
  }

  /**
   * Replay all pending DLQ events for a merchant
   */
  async replayAllForMerchant(merchantId: string): Promise<{
    total: number;
    succeeded: number;
    failed: number;
  }> {
    const { events } = await this.listEvents(1000, 0, merchantId);
    const eventIds = events.map(e => e.id);

    if (eventIds.length === 0) {
      return { total: 0, succeeded: 0, failed: 0 };
    }

    const result = await this.replayBatch(eventIds);
    return {
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
    };
  }

  /**
   * Delete a DLQ event (after investigation)
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    const query = `DELETE FROM dlq_events WHERE id = $1 RETURNING id`;
    const result = await this.pool.query(query, [eventId]);

    if (result.rowCount === 0) {
      throw new NotFoundException(`DLQ event ${eventId} not found`);
    }

    this.logger.log({
      msg: 'DLQ event deleted',
      dlqEventId: eventId,
    });

    return true;
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<{
    totalPending: number;
    byEventType: Record<string, number>;
    byMerchant: Record<string, number>;
    oldest?: Date;
    newest?: Date;
  }> {
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM dlq_events
      WHERE replayed_at IS NULL
    `;

    const byTypeQuery = `
      SELECT event_type, COUNT(*) as count
      FROM dlq_events
      WHERE replayed_at IS NULL
      GROUP BY event_type
    `;

    const byMerchantQuery = `
      SELECT merchant_id, COUNT(*) as count
      FROM dlq_events
      WHERE replayed_at IS NULL
      GROUP BY merchant_id
    `;

    const [statsResult, typeResult, merchantResult] = await Promise.all([
      this.pool.query(statsQuery),
      this.pool.query(byTypeQuery),
      this.pool.query(byMerchantQuery),
    ]);

    const stats = statsResult.rows[0];
    const byEventType: Record<string, number> = {};
    const byMerchant: Record<string, number> = {};

    for (const row of typeResult.rows) {
      byEventType[row.event_type] = parseInt(row.count, 10);
    }

    for (const row of merchantResult.rows) {
      byMerchant[row.merchant_id] = parseInt(row.count, 10);
    }

    return {
      totalPending: parseInt(stats.total, 10),
      byEventType,
      byMerchant,
      oldest: stats.oldest,
      newest: stats.newest,
    };
  }

  /**
   * Mark event as replayed
   */
  private async markAsReplayed(eventId: string): Promise<void> {
    const query = `
      UPDATE dlq_events
      SET replayed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
    await this.pool.query(query, [eventId]);
  }

  private mapToEventWithDetails(row: any): DlqEventWithDetails {
    const createdAt = new Date(row.created_at);
    const ageInHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    return {
      id: row.id,
      originalEventId: row.original_event_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      error: row.error_message || row.error,
      retryCount: row.retry_count,
      merchantId: row.merchant_id,
      correlationId: row.correlation_id,
      status: row.status || 'pending',
      maxRetries: row.max_retries || 3,
      replayedAt: row.replayed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } as DlqEventWithDetails;
  }
}
