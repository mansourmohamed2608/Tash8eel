import { Message, CreateMessageInput } from "../entities/message.entity";

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(conversationId: string): Promise<Message[]>;
  findByProviderMessageId(
    merchantId: string,
    providerMessageId: string,
  ): Promise<Message | null>;
  create(input: CreateMessageInput): Promise<Message>;
  countByMerchantAndDate(merchantId: string, date: string): Promise<number>;
}

export const MESSAGE_REPOSITORY = Symbol("IMessageRepository");
