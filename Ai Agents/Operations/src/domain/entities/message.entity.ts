import { MessageDirection } from '../../shared/constants/enums';

export interface MessageAttachment {
  type: string;
  url: string;
  mimeType?: string;
}

export interface MessageMetadata {
  llmResponse?: unknown;
  tokensUsed?: number;
  confidence?: number;
  processingTimeMs?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  merchantId: string;
  providerMessageId?: string;
  direction: MessageDirection;
  senderId: string;
  text?: string;
  attachments: MessageAttachment[];
  metadata: MessageMetadata;
  llmUsed: boolean;
  tokensUsed: number;
  createdAt: Date;
}

export interface CreateMessageInput {
  conversationId: string;
  merchantId: string;
  providerMessageId?: string;
  direction: MessageDirection;
  senderId: string;
  text?: string;
  attachments?: MessageAttachment[];
  metadata?: MessageMetadata;
  llmUsed?: boolean;
  tokensUsed?: number;
}
