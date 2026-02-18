import { Injectable, Logger } from "@nestjs/common";
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
@Injectable()
export class EventHandlerRegistry {
  private readonly logger = new Logger(EventHandlerRegistry.name);
  private readonly handlers = new Map<string, IEventHandler>();

  /**
   * Register an event handler
   */
  registerHandler(handler: IEventHandler): void {
    if (this.handlers.has(handler.eventType)) {
      this.logger.warn({
        msg: "Handler already registered for event type, overwriting",
        eventType: handler.eventType,
      });
    }

    this.handlers.set(handler.eventType, handler);
    this.logger.log({
      msg: "Event handler registered",
      eventType: handler.eventType,
    });
  }

  /**
   * Get handler for event type
   */
  getHandler(eventType: string): IEventHandler | undefined {
    return this.handlers.get(eventType);
  }

  /**
   * Check if handler exists for event type
   */
  hasHandler(eventType: string): boolean {
    return this.handlers.has(eventType);
  }

  /**
   * Get all registered event types
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Unregister handler
   */
  unregisterHandler(eventType: string): boolean {
    return this.handlers.delete(eventType);
  }
}
