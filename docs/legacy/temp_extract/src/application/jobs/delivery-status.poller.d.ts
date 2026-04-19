import { Pool } from "pg";
import { IDeliveryAdapter } from "../adapters/delivery-adapter.interface";
import { OutboxService } from "../events/outbox.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
/**
 * Polls delivery status updates from courier APIs
 */
export declare class DeliveryStatusPoller {
    private readonly pool;
    private readonly deliveryAdapter;
    private readonly outboxService;
    private readonly redisService;
    private readonly logger;
    private readonly lockKey;
    private readonly lockTtl;
    constructor(pool: Pool, deliveryAdapter: IDeliveryAdapter, outboxService: OutboxService, redisService: RedisService);
    /**
     * Poll for delivery status updates every 5 minutes
     */
    pollDeliveryStatus(): Promise<void>;
    private processActiveShipments;
    private updateShipmentStatus;
}
