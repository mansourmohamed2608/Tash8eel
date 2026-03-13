import { Pool } from "pg";
import { IEventRepository } from "../../domain/ports/event.repository";
import { OutboxEvent, CreateOutboxEventInput, DlqEvent, CreateDlqEventInput, MerchantReport, MerchantReportSummary } from "../../domain/entities/event.entity";
import { EventStatus, DlqStatus } from "../../shared/constants/enums";
export declare class EventRepository implements IEventRepository {
    private pool;
    constructor(pool: Pool);
    createOutboxEvent(input: CreateOutboxEventInput): Promise<OutboxEvent>;
    findPendingOutboxEvents(limit: number): Promise<OutboxEvent[]>;
    updateOutboxEventStatus(id: string, status: EventStatus, error?: string): Promise<OutboxEvent | null>;
    markOutboxEventProcessed(id: string): Promise<OutboxEvent | null>;
    incrementOutboxRetryCount(id: string): Promise<OutboxEvent | null>;
    createDlqEvent(input: CreateDlqEventInput): Promise<DlqEvent>;
    findDlqEventById(id: string): Promise<DlqEvent | null>;
    findPendingDlqEvents(limit: number): Promise<DlqEvent[]>;
    findDlqEventsForRetry(before: Date, limit: number): Promise<DlqEvent[]>;
    updateDlqEventStatus(id: string, status: DlqStatus): Promise<DlqEvent | null>;
    incrementDlqRetryCount(id: string, nextRetryAt: Date): Promise<DlqEvent | null>;
    resolveDlqEvent(id: string): Promise<DlqEvent | null>;
    countDlqEvents(): Promise<number>;
    createOrUpdateReport(merchantId: string, reportDate: string, summary: MerchantReportSummary): Promise<MerchantReport>;
    findReportByDate(merchantId: string, reportDate: string): Promise<MerchantReport | null>;
    private mapOutboxEvent;
    private mapDlqEvent;
    private mapReport;
}
