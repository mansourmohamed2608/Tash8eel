import { IConversationRepository } from "../../domain/ports/conversation.repository";
import { IMessageRepository } from "../../domain/ports/message.repository";
interface ConversationResponseDto {
    id: string;
    merchantId: string;
    customerId?: string;
    senderId: string;
    state: string;
    cart: unknown;
    collectedInfo: unknown;
    missingSlots: string[];
    followupCount: number;
    createdAt: Date;
    updatedAt: Date;
    lastMessageAt?: Date;
    messages?: MessageDto[];
}
interface MessageDto {
    id: string;
    direction: string;
    senderId: string;
    text?: string;
    tokensUsed: number;
    createdAt: Date;
}
export declare class ConversationsController {
    private readonly conversationRepo;
    private readonly messageRepo;
    private readonly logger;
    constructor(conversationRepo: IConversationRepository, messageRepo: IMessageRepository);
    getConversation(id: string, merchantId: string, includeMessages?: string): Promise<ConversationResponseDto>;
    listConversations(merchantId: string, state?: string, limit?: number, offset?: number): Promise<{
        conversations: ConversationResponseDto[];
        total: number;
    }>;
    private mapConversationToDto;
}
export {};
