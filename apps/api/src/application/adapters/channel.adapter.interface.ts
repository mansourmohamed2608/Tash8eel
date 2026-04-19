export type MetaChannel = "whatsapp" | "messenger" | "instagram";

export interface InboundMessage {
  channel: MetaChannel;
  messageId: string;
  senderId: string;
  recipientId: string;
  text: string;
  messageType: string;
  hasMedia: boolean;
  mediaId?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  timestamp?: string;
  profileName?: string;
  rawPayload: unknown;
}

export interface OutboundMediaAttachment {
  url: string;
  caption?: string;
  fallbackText?: string;
}

export interface OutboundMediaMessage {
  text?: string;
  media: OutboundMediaAttachment[];
}

export interface ChannelAdapterInterface {
  sendMessage(recipientId: string, message: string): Promise<void>;
  sendMedia(recipientId: string, message: OutboundMediaMessage): Promise<void>;
  sendTypingIndicator(recipientId: string): Promise<void>;
  parseInboundMessage(webhookPayload: unknown): InboundMessage | null;
  validateSignature(payload: Buffer, signature: string): boolean;
  validateSignature(signature: string, payload: Buffer): boolean;
}
