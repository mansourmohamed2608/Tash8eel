import { DlqService } from "../../application/dlq/dlq.service";
import { OutboxService } from "../../application/events/outbox.service";
import { Pool } from "pg";
import { IMerchantRepository } from "../../domain/ports/merchant.repository";
export declare class AdminController {
    private readonly pool;
    private readonly merchantRepo;
    private readonly dlqService;
    private readonly outboxService;
    private readonly logger;
    constructor(pool: Pool, merchantRepo: IMerchantRepository, dlqService: DlqService, outboxService: OutboxService);
    getMetrics(): Promise<any>;
    replayDlqEvent(dlqEventId: string): Promise<any>;
    listDlqEvents(limit?: number, offset?: number, merchantId?: string): Promise<any>;
    seedDemoData(): Promise<any>;
    togglePromotion(merchantId: string, body: {
        enabled: boolean;
        discountPercent?: number;
        description?: string;
    }): Promise<any>;
    private seedCatalogItems;
    private getMerchantStats;
    private getOrderStats;
    private getConversationStats;
    private getMessageStats;
}
