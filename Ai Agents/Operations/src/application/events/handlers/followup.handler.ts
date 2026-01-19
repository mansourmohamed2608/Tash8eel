import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { IEventHandler, EventHandlerRegistry } from '../event-handler.registry';
import { OutboxEvent } from '../../../domain/entities/event.entity';
import { EVENT_TYPES, FollowupScheduledPayload } from '../event-types';
import { IConversationRepository, CONVERSATION_REPOSITORY } from '../../../domain/ports/conversation.repository';
import { IMessageRepository, MESSAGE_REPOSITORY } from '../../../domain/ports/message.repository';
import { ARABIC_TEMPLATES } from '../../../shared/constants/templates';
import { ConversationState, MessageDirection } from '../../../shared/constants/enums';

/**
 * Handles FollowupScheduled events - sends follow-up messages
 */
@Injectable()
export class FollowupHandler implements IEventHandler, OnModuleInit {
  readonly eventType = EVENT_TYPES.FOLLOWUP_SCHEDULED;
  private readonly logger = new Logger(FollowupHandler.name);

  constructor(
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
  ) {}

  onModuleInit(): void {
    this.eventHandlerRegistry.registerHandler(this);
  }

  async handle(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as FollowupScheduledPayload;

    this.logger.log({
      message: 'Processing FollowupScheduled event',
      eventId: event.id,
      conversationId: payload.conversationId,
      followupCount: payload.followupCount,
    });

    // Get conversation
    const conversation = await this.conversationRepository.findById(payload.conversationId);

    if (!conversation) {
      this.logger.warn({
        message: 'Conversation not found for followup',
        conversationId: payload.conversationId,
      });
      return;
    }

    // Check if conversation is still active and needs follow-up
    if (conversation.state === ConversationState.CLOSED || conversation.state === ConversationState.ORDER_PLACED) {
      this.logger.debug({
        message: 'Conversation already closed/confirmed, skipping followup',
        conversationId: payload.conversationId,
        state: conversation.state,
      });
      return;
    }

    // Select appropriate follow-up message based on count
    let followupMessage: string;
    const cartItems = this.formatCartItems(conversation.cart);
    
    if (payload.followupCount === 1) {
      followupMessage = ARABIC_TEMPLATES.FOLLOWUP_FIRST.replace('{items}', cartItems);
    } else if (payload.followupCount === 2) {
      followupMessage = ARABIC_TEMPLATES.FOLLOWUP_SECOND.replace('{items}', cartItems);
    } else {
      followupMessage = ARABIC_TEMPLATES.FOLLOWUP_FINAL;
    }

    // Store the follow-up message
    await this.messageRepository.create({
      conversationId: conversation.id,
      merchantId: event.merchantId || conversation.merchantId,
      senderId: 'bot',
      direction: MessageDirection.OUTBOUND,
      text: followupMessage,
    });

    // Update conversation with followup count
    await this.conversationRepository.update(conversation.id, {
      followupCount: payload.followupCount,
      lastMessageAt: new Date(),
    });

    this.logger.log({
      message: 'Followup message sent',
      conversationId: payload.conversationId,
      followupCount: payload.followupCount,
    });
  }

  private formatCartItems(cart: any): string {
    if (!cart || !cart.items || cart.items.length === 0) {
      return 'السلة فارغة';
    }

    return cart.items.map((item: any) => `${item.name} × ${item.quantity}`).join(', ');
  }
}
