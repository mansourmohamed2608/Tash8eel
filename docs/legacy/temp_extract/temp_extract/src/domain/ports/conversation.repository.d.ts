import { Conversation, CreateConversationInput, UpdateConversationInput } from "../entities/conversation.entity";
export interface IConversationRepository {
    findById(id: string): Promise<Conversation | null>;
    findByMerchantAndSender(merchantId: string, senderId: string): Promise<Conversation | null>;
    findPendingFollowups(before: Date): Promise<Conversation[]>;
    create(input: CreateConversationInput): Promise<Conversation>;
    update(id: string, input: UpdateConversationInput): Promise<Conversation | null>;
    countByMerchantAndDate(merchantId: string, date: string): Promise<number>;
}
export declare const CONVERSATION_REPOSITORY: unique symbol;
