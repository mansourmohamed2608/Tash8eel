import { OutboxService } from "./outbox.service";
import { EventHandlerRegistry } from "./event-handler.registry";
import { RedisService } from "../../infrastructure/redis/redis.service";
export declare class OutboxWorker {
    private readonly outboxService;
    private readonly eventHandlerRegistry;
    private readonly redisService;
    private readonly logger;
    private isProcessing;
    private readonly lockKey;
    private readonly lockTtl;
    constructor(outboxService: OutboxService, eventHandlerRegistry: EventHandlerRegistry, redisService: RedisService);
    /**
     * Process outbox events every 5 seconds
     */
    processOutbox(): Promise<void>;
    /**
     * Get processing status
     */
    isCurrentlyProcessing(): boolean;
}
