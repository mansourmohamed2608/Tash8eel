import { OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { IOrderRepository } from "../../../domain/ports/order.repository";
/**
 * Handles ShipmentBooked events - updates order with shipment info
 */
export declare class ShipmentBookedHandler implements IEventHandler, OnModuleInit {
    private readonly eventHandlerRegistry;
    private readonly orderRepository;
    readonly eventType: "ShipmentBooked";
    private readonly logger;
    constructor(eventHandlerRegistry: EventHandlerRegistry, orderRepository: IOrderRepository);
    onModuleInit(): void;
    handle(event: OutboxEvent): Promise<void>;
}
