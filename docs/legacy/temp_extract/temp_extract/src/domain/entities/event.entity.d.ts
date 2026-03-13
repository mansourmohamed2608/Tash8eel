import { EventStatus, DlqStatus } from "../../shared/constants/enums";
export { EventStatus, DlqStatus };
export interface OutboxEvent {
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    merchantId?: string;
    payload: Record<string, unknown>;
    correlationId?: string;
    status: EventStatus;
    processedAt?: Date;
    error?: string;
    errorMessage?: string;
    retryCount: number;
    createdAt: Date;
    updatedAt?: Date;
}
export interface CreateOutboxEventInput {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    merchantId?: string;
    payload: Record<string, unknown>;
    correlationId?: string;
}
export interface DlqEvent {
    id: string;
    originalEventId?: string;
    eventType: string;
    payload: Record<string, unknown>;
    error: string;
    stack?: string;
    correlationId?: string;
    merchantId?: string;
    status: DlqStatus;
    retryCount: number;
    maxRetries: number;
    nextRetryAt?: Date;
    resolvedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    aggregateType?: string;
    aggregateId?: string;
    replayedAt?: Date;
}
export type DlqEventWithDetails = DlqEvent;
export interface CreateDlqEventInput {
    originalEventId?: string;
    eventType: string;
    payload: Record<string, unknown>;
    error: string;
    stack?: string;
    correlationId?: string;
    merchantId?: string;
    maxRetries?: number;
}
export interface MerchantReport {
    id: string;
    merchantId: string;
    reportDate: string;
    summary: MerchantReportSummary;
    createdAt: Date;
}
export interface MerchantReportSummary {
    totalOrders: number;
    totalRevenue: number;
    totalConversations: number;
    completedOrders: number;
    cancelledOrders: number;
    averageOrderValue: number;
    tokensUsed: number;
    llmCalls: number;
}
