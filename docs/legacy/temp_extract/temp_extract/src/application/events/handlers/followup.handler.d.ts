import { OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { IConversationRepository } from "../../../domain/ports/conversation.repository";
import { IMessageRepository } from "../../../domain/ports/message.repository";
/**
 * Handles FollowupScheduled events - sends follow-up messages
 */
export declare class FollowupHandler implements IEventHandler, OnModuleInit {
    private readonly eventHandlerRegistry;
    private readonly conversationRepository;
    private readonly messageRepository;
    readonly eventType: "FollowupScheduled";
    private readonly logger;
    constructor(eventHandlerRegistry: EventHandlerRegistry, conversationRepository: IConversationRepository, messageRepository: IMessageRepository);
    onModuleInit(): void;
    handle(event: OutboxEvent): Promise<void>;
    private formatCartItems;
}
