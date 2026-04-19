import { Pool } from "pg";
import { IConversationRepository } from "../../domain/ports/conversation.repository";
import { Conversation, CreateConversationInput, UpdateConversationInput } from "../../domain/entities/conversation.entity";
export declare class ConversationRepository implements IConversationRepository {
    private pool;
    constructor(pool: Pool);
    findById(id: string): Promise<Conversation | null>;
    findByMerchantAndSender(merchantId: string, senderId: string): Promise<Conversation | null>;
    findPendingFollowups(before: Date): Promise<Conversation[]>;
    create(input: CreateConversationInput): Promise<Conversation>;
    update(id: string, input: UpdateConversationInput): Promise<Conversation | null>;
    countByMerchantAndDate(merchantId: string, date: string): Promise<number>;
    private mapToEntity;
}
