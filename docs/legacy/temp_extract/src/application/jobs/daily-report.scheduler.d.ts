import { Pool } from "pg";
import { OutboxService } from "../events/outbox.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
interface DailyStats {
    merchantId: string;
    merchantName: string;
    date: string;
    totalConversations: number;
    newConversations: number;
    ordersCreated: number;
    ordersConfirmed: number;
    totalRevenue: number;
    averageOrderValue: number;
    tokenUsage: number;
    conversionRate: number;
}
/**
 * Generates daily reports for merchants
 */
export declare class DailyReportScheduler {
    private readonly pool;
    private readonly outboxService;
    private readonly redisService;
    private readonly logger;
    private readonly lockKey;
    private readonly lockTtl;
    constructor(pool: Pool, outboxService: OutboxService, redisService: RedisService);
    /**
     * Run daily report at 8 AM Egypt time (6 AM UTC)
     */
    generateDailyReports(): Promise<void>;
    /**
     * Manual trigger for testing
     */
    generateReportForMerchant(merchantId: string): Promise<DailyStats>;
    private calculateMerchantStats;
    private sendDailyReport;
    private formatReportMessage;
}
export {};
