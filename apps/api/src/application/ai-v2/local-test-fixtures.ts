import { Merchant } from "../../domain/entities/merchant.entity";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { Conversation } from "../../domain/entities/conversation.entity";
import { Message } from "../../domain/entities/message.entity";
import { ConversationState } from "../../shared/constants/enums";
import { MessageDirection } from "../../shared/constants/enums";

/**
 * Local test fixtures for AI v2 (no DB, no Meta, no secrets).
 * These fixtures must stay generic (no hardcoded vertical/business behavior).
 */

export function fixtureMerchant(params?: {
  withPhone?: boolean;
  withAddress?: boolean;
  withWorkingHours?: boolean;
}): Merchant {
  const withPhone = params?.withPhone ?? true;
  const withAddress = params?.withAddress ?? true;
  const withWorkingHours = params?.withWorkingHours ?? true;
  return {
    id: "m_local_fixture",
    name: "Tash8eel Store",
    whatsappNumber: withPhone ? "+201000000000" : undefined,
    address: withAddress ? "Store address (available in chat only)" : undefined,
    workingHours: withWorkingHours ? "Daily 10:00-22:00" : undefined,
    config: {},
  } as unknown as Merchant;
}

export function fixtureCatalog(): CatalogItem[] {
  const base = (id: string, nameAr: string, basePrice?: number): CatalogItem =>
    ({
      id,
      name: nameAr,
      nameAr,
      nameEn: undefined,
      basePrice,
      isActive: true,
      isAvailable: true,
    }) as unknown as CatalogItem;

  return [
    base("c1", "منتج عام A", 120),
    base("c2", "منتج عام B", 180),
    base("c3", "منتج عام C"), // price missing on purpose
    base("c4", "منتج عام D", 250),
    base("c5", "منتج عام E", 99),
  ];
}

export function fixtureConversation(params?: {
  olderSummary?: string | null;
  aiV2State?: Record<string, unknown>;
}): Conversation {
  return {
    id: "conv_local_fixture",
    merchantId: "m_local_fixture",
    senderId: "cust_local",
    state: ConversationState.GREETING,
    context: {
      ...(params?.aiV2State ? { aiV2: params.aiV2State } : {}),
    },
    conversationSummary: params?.olderSummary ?? undefined,
    cart: { items: [], total: 0, subtotal: 0, discount: 0, deliveryFee: 0 },
    collectedInfo: {},
    missingSlots: [],
    followupCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Conversation;
}

export function fixtureRecentMessages(
  turns: Array<{ role: "customer" | "assistant"; text: string }>,
): Message[] {
  const start = Date.now() - turns.length * 60_000;
  return turns.map((t, idx) => {
    const createdAt = new Date(start + idx * 60_000);
    const direction =
      t.role === "customer"
        ? MessageDirection.INBOUND
        : MessageDirection.OUTBOUND;
    return {
      id: `msg_${idx + 1}`,
      merchantId: "m_local_fixture",
      conversationId: "conv_local_fixture",
      senderId: t.role === "customer" ? "cust_local" : "bot",
      direction,
      text: t.text,
      createdAt,
      updatedAt: createdAt,
    } as unknown as Message;
  });
}
