import { OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { IMerchantRepository } from "../../../domain/ports/merchant.repository";
/**
 * Handles MerchantAlerted events - sends alerts to merchants
 */
export declare class MerchantAlertHandler implements IEventHandler, OnModuleInit {
    private readonly eventHandlerRegistry;
    private readonly merchantRepository;
    readonly eventType: "MerchantAlerted";
    private readonly logger;
    constructor(eventHandlerRegistry: EventHandlerRegistry, merchantRepository: IMerchantRepository);
    onModuleInit(): void;
    handle(event: OutboxEvent): Promise<void>;
    private handleNewOrderAlert;
    private handleEscalationAlert;
    private handleDailyReportAlert;
    private handleBudgetWarningAlert;
    private handleDeliveryIssueAlert;
}
