import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module";
import { IMessageRepository } from "../../domain/ports/message.repository";
import {
  Message,
  CreateMessageInput,
} from "../../domain/entities/message.entity";
import { MessageDirection } from "../../shared/constants/enums";
import { generateId } from "../../shared/utils/helpers";

@Injectable()
export class MessageRepository implements IMessageRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  private sanitizeInboundText(value?: string): string | null {
    if (!value) return null;
    return value.replace(/<[^>]*>/g, "");
  }

  async findById(id: string): Promise<Message | null> {
    const result = await this.pool.query(
      `SELECT * FROM messages WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByConversation(conversationId: string): Promise<Message[]> {
    const result = await this.pool.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  async findByProviderMessageId(
    merchantId: string,
    providerMessageId: string,
  ): Promise<Message | null> {
    const result = await this.pool.query(
      `SELECT * FROM messages WHERE merchant_id = $1 AND provider_message_id = $2`,
      [merchantId, providerMessageId],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async create(input: CreateMessageInput): Promise<Message> {
    const id = generateId();
    const storedText =
      input.direction === MessageDirection.INBOUND
        ? this.sanitizeInboundText(input.text)
        : input.text || null;

    try {
      const result = await this.pool.query(
        `INSERT INTO messages (id, conversation_id, merchant_id, channel, provider_message_id, direction, sender_id, text, attachments, metadata, llm_used, tokens_used)
         VALUES ($1, $2, $3, COALESCE($4, (SELECT channel FROM conversations WHERE id = $2), 'whatsapp'), $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          id,
          input.conversationId,
          input.merchantId,
          input.channel || null,
          input.providerMessageId || null,
          input.direction,
          input.senderId,
          storedText,
          JSON.stringify(input.attachments || []),
          JSON.stringify(input.metadata || {}),
          input.llmUsed || false,
          input.tokensUsed || 0,
        ],
      );
      return this.mapToEntity(result.rows[0]);
    } catch {
      const result = await this.pool.query(
        `INSERT INTO messages (id, conversation_id, merchant_id, provider_message_id, direction, sender_id, text, attachments, metadata, llm_used, tokens_used)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          id,
          input.conversationId,
          input.merchantId,
          input.providerMessageId || null,
          input.direction,
          input.senderId,
          storedText,
          JSON.stringify(input.attachments || []),
          JSON.stringify(input.metadata || {}),
          input.llmUsed || false,
          input.tokensUsed || 0,
        ],
      );
      return this.mapToEntity(result.rows[0]);
    }
  }

  async countByMerchantAndDate(
    merchantId: string,
    date: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM messages WHERE merchant_id = $1 AND DATE(created_at) = $2`,
      [merchantId, date],
    );
    return parseInt(result.rows[0].count, 10);
  }

  private mapToEntity(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      conversationId: row.conversation_id as string,
      merchantId: row.merchant_id as string,
      channel:
        (row.channel as "whatsapp" | "messenger" | "instagram" | undefined) ||
        "whatsapp",
      providerMessageId: row.provider_message_id as string | undefined,
      direction: row.direction as MessageDirection,
      senderId: row.sender_id as string,
      text:
        (row.text as string | undefined) || (row.content as string | undefined),
      attachments: row.attachments as Message["attachments"],
      metadata: row.metadata as Message["metadata"],
      llmUsed: row.llm_used as boolean,
      tokensUsed: row.tokens_used as number,
      createdAt: new Date(row.created_at as string),
    };
  }
}
