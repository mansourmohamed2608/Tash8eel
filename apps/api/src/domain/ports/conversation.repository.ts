import {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
} from "../entities/conversation.entity";

export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByMerchant(merchantId: string): Promise<Conversation[]>;
  findByMerchantAndSender(
    merchantId: string,
    senderId: string,
    channel?: "whatsapp" | "messenger" | "instagram",
  ): Promise<Conversation | null>;
  findPendingFollowups(before: Date): Promise<Conversation[]>;
  create(input: CreateConversationInput): Promise<Conversation>;
  update(
    id: string,
    input: UpdateConversationInput,
  ): Promise<Conversation | null>;
  countByMerchantAndDate(merchantId: string, date: string): Promise<number>;
}

export const CONVERSATION_REPOSITORY = Symbol("IConversationRepository");
