import { OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { IShipmentRepository } from "../../../domain/ports/shipment.repository";
import { IOrderRepository } from "../../../domain/ports/order.repository";
import { IConversationRepository } from "../../../domain/ports/conversation.repository";
import { OutboxService } from "../outbox.service";
/**
 * Handles DeliveryStatusUpdated events - updates shipment and order status
 */
export declare class DeliveryStatusHandler implements IEventHandler, OnModuleInit {
    private readonly eventHandlerRegistry;
    private readonly shipmentRepository;
    private readonly orderRepository;
    private readonly conversationRepository;
    private readonly outboxService;
    readonly eventType: "DeliveryStatusUpdated";
    private readonly logger;
    constructor(eventHandlerRegistry: EventHandlerRegistry, shipmentRepository: IShipmentRepository, orderRepository: IOrderRepository, conversationRepository: IConversationRepository, outboxService: OutboxService);
    onModuleInit(): void;
    handle(event: OutboxEvent): Promise<void>;
}
