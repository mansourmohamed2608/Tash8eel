import { OutboxEvent } from "../../domain/entities/event.entity";
/**
 * Interface for event handlers
 */
export interface IEventHandler {
    eventType: string;
    handle(event: OutboxEvent): Promise<void>;
}
/**
 * Registry for event handlers - allows dynamic registration
 */
export declare class EventHandlerRegistry {
    private readonly logger;
    private readonly handlers;
    /**
     * Register an event handler
     */
    registerHandler(handler: IEventHandler): void;
    /**
     * Get handler for event type
     */
    getHandler(eventType: string): IEventHandler | undefined;
    /**
     * Check if handler exists for event type
     */
    hasHandler(eventType: string): boolean;
    /**
     * Get all registered event types
     */
    getRegisteredEventTypes(): string[];
    /**
     * Unregister handler
     */
    unregisterHandler(eventType: string): boolean;
}
