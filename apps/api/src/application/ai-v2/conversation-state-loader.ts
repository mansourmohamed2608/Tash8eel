import { Conversation } from "../../domain/entities/conversation.entity";
import { Message } from "../../domain/entities/message.entity";
import { MessageDirection } from "../../shared/constants/enums";
import { LoadedConversationStateV2, AiV2PersistedState } from "./ai-v2.types";

export interface ConversationStateLoaderInputV2 {
  conversation: Conversation;
  recentMessages: Message[];
  customerMessage: string;
  channel?: "whatsapp" | "messenger" | "instagram";
}

/**
 * Loads conversation-scoped inputs for the v2 pipeline without mutating entities.
 */
export class ConversationStateLoaderV2 {
  static load(
    input: ConversationStateLoaderInputV2,
  ): LoadedConversationStateV2 {
    const ctx = (input.conversation.context || {}) as Record<string, unknown>;
    const rawAiV2 = ctx.aiV2;
    const priorAiV2 =
      rawAiV2 && typeof rawAiV2 === "object" && !Array.isArray(rawAiV2)
        ? (rawAiV2 as Partial<AiV2PersistedState>)
        : null;

    const cartItems = input.conversation.cart?.items || [];
    const recent = [...input.recentMessages].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const lastInbound = recent
      .filter((m) => m.direction === MessageDirection.INBOUND)
      .slice(-8);
    const recentTurnsText = lastInbound
      .map((m) => String(m.text || "").trim())
      .filter(Boolean);

    return {
      merchantId: input.conversation.merchantId,
      conversationId: input.conversation.id,
      customerMessage: input.customerMessage,
      channel: input.channel || input.conversation.channel || "whatsapp",
      conversationSummary:
        typeof input.conversation.conversationSummary === "string"
          ? input.conversation.conversationSummary
          : undefined,
      priorAiV2,
      cartItemCount: cartItems.length,
      recentTurnsText,
    };
  }
}
