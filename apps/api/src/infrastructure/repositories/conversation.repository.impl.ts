import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module";
import { IConversationRepository } from "../../domain/ports/conversation.repository";
import {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
} from "../../domain/entities/conversation.entity";
import { ConversationState } from "../../shared/constants/enums";
import { generateId } from "../../shared/utils/helpers";

@Injectable()
export class ConversationRepository implements IConversationRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  async findById(id: string): Promise<Conversation | null> {
    const result = await this.pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByMerchant(merchantId: string): Promise<Conversation[]> {
    const result = await this.pool.query(
      `SELECT * FROM conversations 
       WHERE merchant_id = $1
       ORDER BY COALESCE(last_message_at, updated_at) DESC`,
      [merchantId],
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  async findByMerchantAndSender(
    merchantId: string,
    senderId: string,
    channel?: "whatsapp" | "messenger" | "instagram",
  ): Promise<Conversation | null> {
    if (!channel) {
      const result = await this.pool.query(
        `SELECT * FROM conversations 
         WHERE merchant_id = $1 AND sender_id = $2 
         AND state NOT IN ('CLOSED')
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, senderId],
      );
      return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    try {
      const result = await this.pool.query(
        `SELECT * FROM conversations 
         WHERE merchant_id = $1 AND sender_id = $2 AND channel = $3
         AND state NOT IN ('CLOSED')
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, senderId, channel],
      );
      return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    } catch {
      // Legacy schema fallback (channel column absent).
      const result = await this.pool.query(
        `SELECT * FROM conversations 
         WHERE merchant_id = $1 AND sender_id = $2 
         AND state NOT IN ('CLOSED')
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, senderId],
      );
      return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }
  }

  async findPendingFollowups(before: Date): Promise<Conversation[]> {
    const result = await this.pool.query(
      `SELECT * FROM conversations 
       WHERE next_followup_at IS NOT NULL 
       AND next_followup_at <= $1
       AND state NOT IN ('CLOSED', 'ORDER_PLACED')
       ORDER BY next_followup_at ASC`,
      [before.toISOString()],
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  async create(input: CreateConversationInput): Promise<Conversation> {
    const id = input.id || generateId();
    const channel = input.channel || "whatsapp";

    try {
      const result = await this.pool.query(
        `INSERT INTO conversations (id, merchant_id, sender_id, customer_id, channel, state, context, cart, collected_info, missing_slots)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          input.merchantId,
          input.senderId,
          input.customerId || null,
          channel,
          ConversationState.GREETING,
          JSON.stringify({}),
          JSON.stringify({ items: [], subtotal: 0, discount: 0, total: 0 }),
          JSON.stringify({}),
          [],
        ],
      );
      return this.mapToEntity(result.rows[0]);
    } catch {
      const result = await this.pool.query(
        `INSERT INTO conversations (id, merchant_id, sender_id, customer_id, state, context, cart, collected_info, missing_slots)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          id,
          input.merchantId,
          input.senderId,
          input.customerId || null,
          ConversationState.GREETING,
          JSON.stringify({}),
          JSON.stringify({ items: [], subtotal: 0, discount: 0, total: 0 }),
          JSON.stringify({}),
          [],
        ],
      );
      return this.mapToEntity(result.rows[0]);
    }
  }

  async update(
    id: string,
    input: UpdateConversationInput,
  ): Promise<Conversation | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(input.state);
    }
    if (input.context !== undefined) {
      updates.push(`context = $${paramIndex++}`);
      values.push(JSON.stringify({ ...existing.context, ...input.context }));
    }
    if (input.cart !== undefined) {
      updates.push(`cart = $${paramIndex++}`);
      const mergedCart = { ...existing.cart, ...input.cart };
      values.push(JSON.stringify(mergedCart));
    }
    if (input.collectedInfo !== undefined) {
      updates.push(`collected_info = $${paramIndex++}`);
      values.push(
        JSON.stringify({ ...existing.collectedInfo, ...input.collectedInfo }),
      );
    }
    if (input.missingSlots !== undefined) {
      updates.push(`missing_slots = $${paramIndex++}`);
      values.push(input.missingSlots);
    }
    if (input.lastMessageAt !== undefined) {
      updates.push(`last_message_at = $${paramIndex++}`);
      values.push(input.lastMessageAt.toISOString());
    }
    if (input.followupCount !== undefined) {
      updates.push(`followup_count = $${paramIndex++}`);
      values.push(input.followupCount);
    }
    if (input.nextFollowupAt !== undefined) {
      updates.push(`next_followup_at = $${paramIndex++}`);
      values.push(input.nextFollowupAt?.toISOString() || null);
    }
    if (input.customerId !== undefined) {
      updates.push(`customer_id = $${paramIndex++}`);
      values.push(input.customerId);
    }
    if (input.isHumanTakeover !== undefined) {
      updates.push(`human_takeover = $${paramIndex++}`);
      values.push(input.isHumanTakeover);
    }
    if (input.takenOverBy !== undefined) {
      updates.push(`human_operator_id = $${paramIndex++}`);
      values.push(input.takenOverBy);
    }
    if (input.takenOverAt !== undefined) {
      updates.push(`human_takeover_at = $${paramIndex++}`);
      values.push(input.takenOverAt ? input.takenOverAt.toISOString() : null);
    }

    if (updates.length === 0) return existing;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE conversations SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return this.mapToEntity(result.rows[0]);
  }

  async countByMerchantAndDate(
    merchantId: string,
    date: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM conversations 
       WHERE merchant_id = $1 AND DATE(created_at) = $2`,
      [merchantId, date],
    );
    return parseInt(result.rows[0].count, 10);
  }

  private mapToEntity(row: Record<string, unknown>): Conversation {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      customerId: row.customer_id as string | undefined,
      channel:
        (row.channel as "whatsapp" | "messenger" | "instagram" | undefined) ||
        "whatsapp",
      senderId: row.sender_id as string,
      state: row.state as ConversationState,
      context: row.context as Conversation["context"],
      cart: row.cart as Conversation["cart"],
      collectedInfo: row.collected_info as Conversation["collectedInfo"],
      missingSlots: row.missing_slots as string[],
      lastMessageAt: row.last_message_at
        ? new Date(row.last_message_at as string)
        : undefined,
      followupCount: row.followup_count as number,
      nextFollowupAt: row.next_followup_at
        ? new Date(row.next_followup_at as string)
        : undefined,
      isHumanTakeover: row.human_takeover as boolean,
      takenOverBy: row.human_operator_id as string | null,
      takenOverAt: row.human_takeover_at
        ? new Date(row.human_takeover_at as string)
        : null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
