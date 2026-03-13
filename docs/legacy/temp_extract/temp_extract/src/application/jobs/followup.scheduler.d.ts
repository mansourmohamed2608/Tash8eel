import { Pool } from "pg";
import { OutboxService } from "../events/outbox.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
/**
 * Schedules follow-up messages for abandoned carts
 */
export declare class FollowupScheduler {
    private readonly pool;
    private readonly outboxService;
    private readonly redisService;
    private readonly logger;
    private readonly lockKey;
    private readonly lockTtl;
    constructor(pool: Pool, outboxService: OutboxService, redisService: RedisService);
    /**
     * Check for abandoned carts every 10 minutes
     */
    scheduleFollowups(): Promise<void>;
    private processAbandonedCarts;
}
