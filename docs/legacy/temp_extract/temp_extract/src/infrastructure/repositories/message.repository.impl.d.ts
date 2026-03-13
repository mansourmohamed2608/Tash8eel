import { Pool } from "pg";
import { IMessageRepository } from "../../domain/ports/message.repository";
import { Message, CreateMessageInput } from "../../domain/entities/message.entity";
export declare class MessageRepository implements IMessageRepository {
    private pool;
    constructor(pool: Pool);
    findById(id: string): Promise<Message | null>;
    findByConversation(conversationId: string): Promise<Message[]>;
    findByProviderMessageId(merchantId: string, providerMessageId: string): Promise<Message | null>;
    create(input: CreateMessageInput): Promise<Message>;
    countByMerchantAndDate(merchantId: string, date: string): Promise<number>;
    private mapToEntity;
}
