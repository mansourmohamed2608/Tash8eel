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

export interface ChannelAdapterInterface {
  sendMessage(recipientId: string, message: string): Promise<void>;
  sendTypingIndicator(recipientId: string): Promise<void>;
  parseInboundMessage(webhookPayload: unknown): InboundMessage | null;
  validateSignature(payload: Buffer, signature: string): boolean;
  validateSignature(signature: string, payload: Buffer): boolean;
}
