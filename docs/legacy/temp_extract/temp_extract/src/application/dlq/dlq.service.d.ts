import { Pool } from "pg";
import { OutboxService } from "../events/outbox.service";
import { DlqEvent } from "../../domain/entities/event.entity";
export interface DlqEventWithDetails extends DlqEvent {
    canReplay: boolean;
    ageInHours: number;
}
export declare class DlqService {
    private readonly pool;
    private readonly outboxService;
    private readonly logger;
    constructor(pool: Pool, outboxService: OutboxService);
    /**
     * Get all DLQ events with pagination
     */
    listEvents(limit?: number, offset?: number, merchantId?: string): Promise<{
        events: DlqEventWithDetails[];
        total: number;
    }>;
    /**
     * Get single DLQ event by ID
     */
    getEventById(eventId: string): Promise<DlqEventWithDetails | null>;
    /**
     * Replay a single DLQ event
     */
    replayEvent(eventId: string): Promise<{
        success: boolean;
        newEventId?: string;
        error?: string;
    }>;
    /**
     * Replay multiple DLQ events
     */
    replayBatch(eventIds: string[]): Promise<{
        total: number;
        succeeded: number;
        failed: number;
        results: Array<{
            eventId: string;
            success: boolean;
            error?: string;
        }>;
    }>;
    /**
     * Replay all pending DLQ events for a merchant
     */
    replayAllForMerchant(merchantId: string): Promise<{
        total: number;
        succeeded: number;
        failed: number;
    }>;
    /**
     * Delete a DLQ event (after investigation)
     */
    deleteEvent(eventId: string): Promise<boolean>;
    /**
     * Get DLQ statistics
     */
    getStats(): Promise<{
        totalPending: number;
        byEventType: Record<string, number>;
        byMerchant: Record<string, number>;
        oldest?: Date;
        newest?: Date;
    }>;
    /**
     * Mark event as replayed
     */
    private markAsReplayed;
    private mapToEventWithDetails;
}
