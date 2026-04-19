import { Pool } from "pg";
import { EventType } from "./event-types";
import { OutboxEvent } from "../../domain/entities/event.entity";
export interface PublishEventParams {
    eventType: EventType;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    merchantId: string;
    correlationId?: string;
}
export declare class OutboxService {
    private readonly pool;
    private readonly logger;
    constructor(pool: Pool);
    /**
     * Publish event to outbox (transactionally with other DB operations)
     * This should be called within a transaction for consistency
     */
    publishEvent(params: PublishEventParams): Promise<OutboxEvent>;
    /**
     * Publish event within existing transaction
     */
    publishEventInTransaction(client: import("pg").PoolClient, params: PublishEventParams): Promise<OutboxEvent>;
    /**
     * Fetch pending events for processing (with locking)
     */
    fetchPendingEvents(limit?: number): Promise<OutboxEvent[]>;
    /**
     * Mark event as processed
     */
    markProcessed(eventId: string): Promise<void>;
    /**
     * Mark event as failed and potentially move to DLQ
     */
    markFailed(eventId: string, error: string, moveToDlq?: boolean): Promise<void>;
    /**
     * Move event to Dead Letter Queue
     */
    private moveToDlq;
    /**
     * Retry processing a pending event
     */
    retryEvent(eventId: string): Promise<void>;
    /**
     * Get event by ID
     */
    getEventById(eventId: string): Promise<OutboxEvent | null>;
    /**
     * Get events by aggregate
     */
    getEventsByAggregate(aggregateType: string, aggregateId: string, merchantId: string): Promise<OutboxEvent[]>;
    /**
     * Get event statistics
     */
    getEventStats(): Promise<{
        pending: number;
        processed: number;
        failed: number;
        dlq: number;
    }>;
    /**
     * Cleanup old processed events
     */
    cleanupOldEvents(daysToKeep?: number): Promise<number>;
    private mapToEntity;
}
