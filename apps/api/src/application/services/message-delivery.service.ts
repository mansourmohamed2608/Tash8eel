import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES, EventType } from "../events/event-types";

export type MessageDeliveryStatus =
  | "QUEUED"
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export interface MessageDeliveryUpdate {
  messageId: string;
  status: MessageDeliveryStatus;
  providerMessageId?: string;
  error?: string;
  provider?: string;
}

export interface MessageForDelivery {
  id: string;
  conversationId: string;
  merchantId: string;
  recipientId: string;
  text: string;
  retryCount: number;
  maxRetries: number;
}

@Injectable()
export class MessageDeliveryService {
  private readonly logger = new Logger(MessageDeliveryService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Queue a message for delivery
   */
  async queueMessage(
    messageId: string,
    merchantId: string,
    conversationId: string,
    recipientId: string,
    text: string,
    provider: string = "twilio",
  ): Promise<void> {
    await this.pool.query(
      `UPDATE messages 
       SET delivery_status = 'QUEUED', 
           next_retry_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [messageId],
    );

    // Record event
    await this.recordMessageEvent(messageId, merchantId, "QUEUED", provider);

    // Publish event for delivery worker
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.MESSAGE_QUEUED,
      aggregateType: "Message",
      aggregateId: messageId,
      merchantId,
      payload: {
        messageId,
        conversationId,
        merchantId,
        recipientId,
        text,
        provider,
      },
    });

    this.logger.log({
      msg: "Message queued for delivery",
      messageId,
      merchantId,
      provider,
    });
  }

  /**
   * Update message delivery status
   */
  async updateDeliveryStatus(update: MessageDeliveryUpdate): Promise<void> {
    const { messageId, status, providerMessageId, error } = update;

    const timestampField = this.getTimestampField(status);

    await this.pool.query(
      `UPDATE messages 
       SET delivery_status = $1,
           provider_message_id_outbound = COALESCE($2, provider_message_id_outbound),
           last_error = $3,
           ${timestampField ? `${timestampField} = NOW(),` : ""}
           delivery_status_updated_at = NOW()
       WHERE id = $4`,
      [status, providerMessageId, error, messageId],
    );

    // Get merchant ID for event
    const result = await this.pool.query<{ merchant_id: string }>(
      "SELECT merchant_id FROM messages WHERE id = $1",
      [messageId],
    );

    if (result.rows.length > 0) {
      const merchantId = result.rows[0].merchant_id;
      await this.recordMessageEvent(
        messageId,
        merchantId,
        status,
        update.provider,
        error,
      );
      await this.publishStatusEvent(
        messageId,
        merchantId,
        status,
        providerMessageId,
        error,
      );
    }

    this.logger.log({
      msg: "Message delivery status updated",
      messageId,
      status,
      providerMessageId,
    });
  }

  /**
   * Get messages pending delivery or retry
   */
  async getMessagesForDelivery(
    limit: number = 50,
  ): Promise<MessageForDelivery[]> {
    const result = await this.pool.query<{
      id: string;
      conversation_id: string;
      merchant_id: string;
      sender_id: string;
      text: string;
      retry_count: number;
      max_retries: number;
    }>(
      `SELECT m.id, m.conversation_id, m.merchant_id, c.sender_id, m.text, 
              m.retry_count, m.max_retries
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.delivery_status IN ('QUEUED', 'PENDING')
         AND m.direction = 'outbound'
         AND (m.next_retry_at IS NULL OR m.next_retry_at <= NOW())
         AND m.retry_count < m.max_retries
       ORDER BY m.created_at ASC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      merchantId: row.merchant_id,
      recipientId: row.sender_id,
      text: row.text || "",
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
    }));
  }

  /**
   * Mark message for retry with exponential backoff
   */
  async scheduleRetry(messageId: string, error: string): Promise<boolean> {
    const result = await this.pool.query<{
      retry_count: number;
      max_retries: number;
    }>(`SELECT retry_count, max_retries FROM messages WHERE id = $1`, [
      messageId,
    ]);

    if (result.rows.length === 0) {
      return false;
    }

    const { retry_count, max_retries } = result.rows[0];
    const nextRetryCount = retry_count + 1;

    if (nextRetryCount >= max_retries) {
      // Max retries exceeded, mark as failed
      await this.updateDeliveryStatus({
        messageId,
        status: "FAILED",
        error: `Max retries exceeded. Last error: ${error}`,
      });
      return false;
    }

    // Calculate exponential backoff: 30s, 2m, 8m, 32m
    const backoffSeconds = Math.pow(4, nextRetryCount) * 30;

    await this.pool.query(
      `UPDATE messages 
       SET retry_count = $1,
           next_retry_at = NOW() + INTERVAL '${backoffSeconds} seconds',
           last_error = $2,
           delivery_status = 'PENDING'
       WHERE id = $3`,
      [nextRetryCount, error, messageId],
    );

    this.logger.log({
      msg: "Message scheduled for retry",
      messageId,
      retryCount: nextRetryCount,
      backoffSeconds,
    });

    return true;
  }

  /**
   * Get failed messages for a merchant (for portal display)
   */
  async getFailedMessages(
    merchantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ messages: any[]; total: number }> {
    const [messages, countResult] = await Promise.all([
      this.pool.query(
        `SELECT m.id, m.conversation_id, m.text, m.last_error, m.retry_count,
                m.created_at, m.failed_at, c.sender_id as recipient
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.merchant_id = $1 
           AND m.delivery_status = 'FAILED'
           AND m.direction = 'outbound'
         ORDER BY m.failed_at DESC
         LIMIT $2 OFFSET $3`,
        [merchantId, limit, offset],
      ),
      this.pool.query(
        `SELECT COUNT(*) FROM messages 
         WHERE merchant_id = $1 AND delivery_status = 'FAILED' AND direction = 'outbound'`,
        [merchantId],
      ),
    ]);

    return {
      messages: messages.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /**
   * Retry a specific failed message
   */
  async retryFailedMessage(
    messageId: string,
    merchantId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE messages 
       SET delivery_status = 'QUEUED',
           retry_count = 0,
           next_retry_at = NOW(),
           last_error = NULL
       WHERE id = $1 AND merchant_id = $2 AND delivery_status = 'FAILED'
       RETURNING id`,
      [messageId, merchantId],
    );

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get delivery statistics for a merchant
   */
  async getDeliveryStats(
    merchantId: string,
    date?: string,
  ): Promise<{
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    pending: number;
    deliveryRate: number;
    readRate: number;
  }> {
    const dateFilter = date
      ? `AND DATE(created_at) = $2`
      : `AND created_at >= NOW() - INTERVAL '24 hours'`;

    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE delivery_status = 'SENT') as sent,
        COUNT(*) FILTER (WHERE delivery_status = 'DELIVERED') as delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'READ') as read,
        COUNT(*) FILTER (WHERE delivery_status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE delivery_status IN ('QUEUED', 'PENDING')) as pending
       FROM messages 
       WHERE merchant_id = $1 
         AND direction = 'outbound'
         ${dateFilter}`,
      date ? [merchantId, date] : [merchantId],
    );

    const stats = result.rows[0];
    const total = parseInt(stats.total, 10) || 1;
    const delivered = parseInt(stats.delivered, 10) + parseInt(stats.read, 10);
    const read = parseInt(stats.read, 10);

    return {
      total: parseInt(stats.total, 10),
      sent: parseInt(stats.sent, 10),
      delivered: parseInt(stats.delivered, 10),
      read: parseInt(stats.read, 10),
      failed: parseInt(stats.failed, 10),
      pending: parseInt(stats.pending, 10),
      deliveryRate: Math.round((delivered / total) * 100),
      readRate: Math.round((read / total) * 100),
    };
  }

  // Private helper methods

  private getTimestampField(status: MessageDeliveryStatus): string | null {
    switch (status) {
      case "SENT":
        return "sent_at";
      case "DELIVERED":
        return "delivered_at";
      case "READ":
        return "read_at";
      case "FAILED":
        return "failed_at";
      default:
        return null;
    }
  }

  private async recordMessageEvent(
    messageId: string,
    merchantId: string,
    eventType: string,
    provider?: string,
    error?: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO message_events (message_id, merchant_id, event_type, provider, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [messageId, merchantId, eventType, provider, error],
    );
  }

  private async publishStatusEvent(
    messageId: string,
    merchantId: string,
    status: MessageDeliveryStatus,
    providerMessageId?: string,
    error?: string,
  ): Promise<void> {
    const eventTypeMap: Record<MessageDeliveryStatus, EventType | null> = {
      QUEUED: null, // Already published on queue
      PENDING: null,
      SENT: EVENT_TYPES.MESSAGE_SENT,
      DELIVERED: EVENT_TYPES.MESSAGE_DELIVERED,
      READ: EVENT_TYPES.MESSAGE_READ,
      FAILED: EVENT_TYPES.MESSAGE_FAILED,
    };

    const eventType = eventTypeMap[status];
    if (!eventType) return;

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      messageId,
      merchantId,
      providerMessageId,
      provider: "mock", // Will be updated when WhatsApp is integrated
    };

    if (status === "SENT") {
      payload.sentAt = now;
    } else if (status === "DELIVERED") {
      payload.deliveredAt = now;
    } else if (status === "READ") {
      payload.readAt = now;
    } else if (status === "FAILED") {
      payload.error = error;
      payload.failedAt = now;
    }

    await this.outboxService.publishEvent({
      eventType,
      aggregateType: "Message",
      aggregateId: messageId,
      merchantId,
      payload,
    });
  }
}
