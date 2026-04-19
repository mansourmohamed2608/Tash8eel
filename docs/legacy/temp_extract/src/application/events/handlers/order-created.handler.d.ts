import { OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { IMerchantRepository } from "../../../domain/ports/merchant.repository";
import { ICustomerRepository } from "../../../domain/ports/customer.repository";
import { OutboxService } from "../outbox.service";
/**
 * Handles OrderCreated events - sends merchant alerts, updates customer stats
 */
export declare class OrderCreatedHandler implements IEventHandler, OnModuleInit {
    private readonly eventHandlerRegistry;
    private readonly merchantRepository;
    private readonly customerRepository;
    private readonly outboxService;
    readonly eventType: "OrderCreated";
    private readonly logger;
    constructor(eventHandlerRegistry: EventHandlerRegistry, merchantRepository: IMerchantRepository, customerRepository: ICustomerRepository, outboxService: OutboxService);
    onModuleInit(): void;
    handle(event: OutboxEvent): Promise<void>;
    private updateCustomerStats;
    private alertMerchant;
}
