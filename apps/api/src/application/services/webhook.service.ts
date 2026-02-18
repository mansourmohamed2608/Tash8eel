import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { Cron, CronExpression } from "@nestjs/schedule";
import * as crypto from "crypto";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

export type WebhookEvent =
  | "order.created"
  | "order.confirmed"
  | "order.shipped"
  | "order.delivered"
  | "order.cancelled"
  | "conversation.started"
  | "conversation.order_placed"
  | "conversation.closed"
  | "conversation.takeover"
  | "customer.created"
  | "customer.updated"
  | "inventory.low_stock"
  | "inventory.out_of_stock"
  | "message.received"
  | "message.sent";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  merchantId: string;
  data: Record<string, any>;
}

export interface CreateWebhookDto {
  merchantId: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  headers?: Record<string, string>;
  retryCount?: number;
  timeoutMs?: number;
  createdBy?: string;
  secret?: string;
}

export interface Webhook {
  id: string;
  merchantId: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  headers: Record<string, string>;
  status: "ACTIVE" | "PAUSED" | "DISABLED" | "FAILING";
  retryCount: number;
  timeoutMs: number;
  consecutiveFailures: number;
  lastTriggeredAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  createdAt: Date;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Create a new webhook
   */
  async create(dto: CreateWebhookDto): Promise<Webhook> {
    const secret = dto.secret || this.generateSecret();

    const result = await this.pool.query(
      `INSERT INTO webhooks (
        merchant_id, name, url, secret, events, headers, 
        retry_count, timeout_ms, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        dto.merchantId,
        dto.name,
        dto.url,
        secret,
        dto.events,
        JSON.stringify(dto.headers || {}),
        dto.retryCount || 3,
        dto.timeoutMs || 10000,
        dto.createdBy || null,
      ],
    );

    return this.mapWebhook(result.rows[0]);
  }

  /**
   * Get all webhooks for a merchant
   */
  async findByMerchant(merchantId: string): Promise<Webhook[]> {
    const result = await this.pool.query(
      `SELECT * FROM webhooks WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId],
    );
    return result.rows.map((row) => this.mapWebhook(row));
  }

  /**
   * Get webhook by ID
   */
  async findById(id: string, merchantId: string): Promise<Webhook | null> {
    const result = await this.pool.query(
      `SELECT * FROM webhooks WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );
    return result.rows.length > 0 ? this.mapWebhook(result.rows[0]) : null;
  }

  /**
   * Update webhook
   */
  async update(
    id: string,
    merchantId: string,
    updates: Partial<
      Pick<
        CreateWebhookDto,
        "name" | "url" | "events" | "headers" | "retryCount" | "timeoutMs"
      >
    >,
  ): Promise<Webhook | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      setClauses.push(`url = $${paramIndex++}`);
      values.push(updates.url);
    }
    if (updates.events !== undefined) {
      setClauses.push(`events = $${paramIndex++}`);
      values.push(updates.events);
    }
    if (updates.headers !== undefined) {
      setClauses.push(`headers = $${paramIndex++}`);
      values.push(JSON.stringify(updates.headers));
    }
    if (updates.retryCount !== undefined) {
      setClauses.push(`retry_count = $${paramIndex++}`);
      values.push(updates.retryCount);
    }
    if (updates.timeoutMs !== undefined) {
      setClauses.push(`timeout_ms = $${paramIndex++}`);
      values.push(updates.timeoutMs);
    }

    if (setClauses.length === 0) return this.findById(id, merchantId);

    values.push(id, merchantId);
    const result = await this.pool.query(
      `UPDATE webhooks SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND merchant_id = $${paramIndex}
       RETURNING *`,
      values,
    );

    return result.rows.length > 0 ? this.mapWebhook(result.rows[0]) : null;
  }

  /**
   * Update webhook status
   */
  async updateStatus(
    id: string,
    merchantId: string,
    status: Webhook["status"],
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhooks SET status = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3`,
      [status, id, merchantId],
    );
  }

  /**
   * Delete webhook
   */
  async delete(id: string, merchantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM webhooks WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );
    return result.rowCount! > 0;
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(
    id: string,
    merchantId: string,
  ): Promise<string | null> {
    const secret = this.generateSecret();
    const result = await this.pool.query(
      `UPDATE webhooks SET secret = $1, updated_at = NOW() 
       WHERE id = $2 AND merchant_id = $3 RETURNING id`,
      [secret, id, merchantId],
    );
    return result.rows.length > 0 ? secret : null;
  }

  /**
   * Trigger webhooks for an event
   */
  async trigger(
    merchantId: string,
    event: WebhookEvent,
    data: Record<string, any>,
  ): Promise<void> {
    // Find active webhooks subscribed to this event
    const result = await this.pool.query(
      `SELECT * FROM webhooks 
       WHERE merchant_id = $1 AND status = 'ACTIVE' AND $2 = ANY(events)`,
      [merchantId, event],
    );

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      merchantId,
      data,
    };

    // Queue deliveries for each webhook
    for (const webhook of result.rows) {
      await this.queueDelivery(webhook, payload);
    }
  }

  /**
   * Queue a webhook delivery
   */
  private async queueDelivery(
    webhook: any,
    payload: WebhookPayload,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_deliveries (
        webhook_id, merchant_id, event_type, payload, max_attempts
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        webhook.id,
        webhook.merchant_id,
        payload.event,
        JSON.stringify(payload),
        webhook.retry_count,
      ],
    );
  }

  /**
   * Process pending webhook deliveries
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingDeliveries(): Promise<void> {
    const deliveries = await this.pool.query(
      `SELECT wd.*, w.url, w.secret, w.headers, w.timeout_ms
       FROM webhook_deliveries wd
       JOIN webhooks w ON wd.webhook_id = w.id
       WHERE wd.status IN ('PENDING', 'RETRYING')
         AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
       LIMIT 50
       FOR UPDATE SKIP LOCKED`,
    );

    for (const delivery of deliveries.rows) {
      await this.executeDelivery(delivery);
    }
  }

  /**
   * Execute a single webhook delivery
   */
  private async executeDelivery(delivery: any): Promise<void> {
    const startTime = Date.now();
    const signature = this.signPayload(delivery.payload, delivery.secret);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": new Date().toISOString(),
        "X-Webhook-Id": delivery.id,
        ...(delivery.headers || {}),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), delivery.timeout_ms);

      const response = await fetch(delivery.url, {
        method: "POST",
        headers,
        body: JSON.stringify(delivery.payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;
      const responseBody = await response.text().catch(() => "");

      if (response.ok) {
        // Success
        await this.markDeliverySuccess(
          delivery,
          response.status,
          responseBody,
          responseTime,
        );
        await this.resetWebhookFailures(delivery.webhook_id);
      } else {
        // HTTP error
        await this.handleDeliveryFailure(
          delivery,
          `HTTP ${response.status}: ${responseBody.substring(0, 500)}`,
          response.status,
          responseBody,
          responseTime,
        );
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      await this.handleDeliveryFailure(
        delivery,
        error.name === "AbortError" ? "Request timeout" : error.message,
        null,
        null,
        responseTime,
      );
    }
  }

  /**
   * Mark delivery as successful
   */
  private async markDeliverySuccess(
    delivery: any,
    statusCode: number,
    responseBody: string,
    responseTime: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_deliveries SET 
        status = 'SUCCESS',
        attempt_count = attempt_count + 1,
        response_status = $1,
        response_body = $2,
        response_time_ms = $3,
        completed_at = NOW()
       WHERE id = $4`,
      [statusCode, responseBody.substring(0, 10000), responseTime, delivery.id],
    );

    await this.pool.query(
      `UPDATE webhooks SET last_triggered_at = NOW(), last_success_at = NOW() WHERE id = $1`,
      [delivery.webhook_id],
    );
  }

  /**
   * Handle delivery failure
   */
  private async handleDeliveryFailure(
    delivery: any,
    error: string,
    statusCode: number | null,
    responseBody: string | null,
    responseTime: number,
  ): Promise<void> {
    const newAttemptCount = delivery.attempt_count + 1;
    const shouldRetry = newAttemptCount < delivery.max_attempts;

    if (shouldRetry) {
      // Calculate exponential backoff: 10s, 30s, 90s, 270s...
      const backoffSeconds = Math.pow(3, newAttemptCount) * 10;
      const nextRetry = new Date(Date.now() + backoffSeconds * 1000);

      await this.pool.query(
        `UPDATE webhook_deliveries SET 
          status = 'RETRYING',
          attempt_count = $1,
          response_status = $2,
          response_body = $3,
          response_time_ms = $4,
          error = $5,
          next_retry_at = $6
         WHERE id = $7`,
        [
          newAttemptCount,
          statusCode,
          responseBody?.substring(0, 10000),
          responseTime,
          error,
          nextRetry,
          delivery.id,
        ],
      );
    } else {
      // Max retries exceeded
      await this.pool.query(
        `UPDATE webhook_deliveries SET 
          status = 'FAILED',
          attempt_count = $1,
          response_status = $2,
          response_body = $3,
          response_time_ms = $4,
          error = $5,
          completed_at = NOW()
         WHERE id = $6`,
        [
          newAttemptCount,
          statusCode,
          responseBody?.substring(0, 10000),
          responseTime,
          error,
          delivery.id,
        ],
      );

      await this.incrementWebhookFailures(delivery.webhook_id);
    }

    await this.pool.query(
      `UPDATE webhooks SET last_triggered_at = NOW(), last_failure_at = NOW() WHERE id = $1`,
      [delivery.webhook_id],
    );
  }

  /**
   * Reset webhook consecutive failures
   */
  private async resetWebhookFailures(webhookId: string): Promise<void> {
    await this.pool.query(
      `UPDATE webhooks SET consecutive_failures = 0 WHERE id = $1`,
      [webhookId],
    );
  }

  /**
   * Increment webhook consecutive failures and disable if too many
   */
  private async incrementWebhookFailures(webhookId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE webhooks SET 
        consecutive_failures = consecutive_failures + 1,
        status = CASE WHEN consecutive_failures + 1 >= 10 THEN 'FAILING'::webhook_status ELSE status END
       WHERE id = $1
       RETURNING consecutive_failures, status`,
      [webhookId],
    );

    if (result.rows[0]?.status === "FAILING") {
      this.logger.warn(
        `Webhook ${webhookId} marked as FAILING after ${result.rows[0].consecutive_failures} consecutive failures`,
      );
    }
  }

  /**
   * Test a webhook by sending a test payload
   */
  async test(
    id: string,
    merchantId: string,
  ): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime: number;
    error?: string;
  }> {
    const webhook = await this.findById(id, merchantId);
    if (!webhook) {
      return { success: false, responseTime: 0, error: "Webhook not found" };
    }

    const testPayload: WebhookPayload = {
      event: "order.created" as WebhookEvent,
      timestamp: new Date().toISOString(),
      merchantId,
      data: {
        test: true,
        message: "This is a test webhook delivery",
        webhookId: id,
      },
    };

    const startTime = Date.now();
    const signature = this.signPayload(testPayload, webhook.secret);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": new Date().toISOString(),
        "X-Webhook-Id": `test-${Date.now()}`,
        ...webhook.headers,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs);

      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error.name === "AbortError" ? "Request timeout" : error.message,
      };
    }
  }

  /**
   * Get delivery history for a webhook
   */
  async getDeliveryHistory(
    webhookId: string,
    merchantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ deliveries: any[]; total: number }> {
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = $1 AND merchant_id = $2`,
      [webhookId, merchantId],
    );

    const result = await this.pool.query(
      `SELECT * FROM webhook_deliveries 
       WHERE webhook_id = $1 AND merchant_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [webhookId, merchantId, limit, offset],
    );

    return {
      deliveries: result.rows.map((row) => this.mapDeliveryRow(row)),
      total: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Test a raw webhook URL before saving
   */
  async testUrl(input: {
    merchantId: string;
    url: string;
    secret: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime: number;
    error?: string;
  }> {
    const testPayload: WebhookPayload = {
      event: "order.created" as WebhookEvent,
      timestamp: new Date().toISOString(),
      merchantId: input.merchantId,
      data: {
        test: true,
        message: "This is a test webhook delivery",
      },
    };

    const startTime = Date.now();
    const signature = this.signPayload(testPayload, input.secret);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": new Date().toISOString(),
        "X-Webhook-Id": `test-${Date.now()}`,
        ...(input.headers || {}),
      };

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        input.timeoutMs || 10000,
      );

      const response = await fetch(input.url, {
        method: "POST",
        headers,
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error.name === "AbortError" ? "Request timeout" : error.message,
      };
    }
  }

  /**
   * Get recent deliveries across all webhooks for a merchant
   */
  async getRecentDeliveries(
    merchantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ deliveries: any[]; total: number }> {
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM webhook_deliveries WHERE merchant_id = $1`,
      [merchantId],
    );

    const result = await this.pool.query(
      `SELECT * FROM webhook_deliveries 
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset],
    );

    return {
      deliveries: result.rows.map((row) => this.mapDeliveryRow(row)),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /**
   * Delivery summary per webhook (counts + last status)
   */
  async getDeliverySummaryByWebhook(merchantId: string): Promise<
    Record<
      string,
      {
        successCount: number;
        failureCount: number;
        lastDeliveryAt?: Date;
        lastDeliveryStatus?: string;
      }
    >
  > {
    const result = await this.pool.query(
      `SELECT 
         webhook_id,
         COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_count,
         COUNT(*) FILTER (WHERE status = 'FAILED') as failure_count,
         MAX(created_at) as last_delivery_at,
         (ARRAY_AGG(status ORDER BY created_at DESC))[1] as last_delivery_status
       FROM webhook_deliveries
       WHERE merchant_id = $1
       GROUP BY webhook_id`,
      [merchantId],
    );

    return result.rows.reduce(
      (acc, row) => {
        acc[row.webhook_id] = {
          successCount: parseInt(row.success_count, 10),
          failureCount: parseInt(row.failure_count, 10),
          lastDeliveryAt: row.last_delivery_at,
          lastDeliveryStatus: row.last_delivery_status,
        };
        return acc;
      },
      {} as Record<
        string,
        {
          successCount: number;
          failureCount: number;
          lastDeliveryAt?: Date;
          lastDeliveryStatus?: string;
        }
      >,
    );
  }

  /**
   * Get webhook stats
   */
  async getStats(
    merchantId: string,
    days: number = 7,
  ): Promise<{
    total: number;
    active: number;
    failing: number;
    deliveryStats: {
      total: number;
      success: number;
      failed: number;
      pending: number;
      successRate: number;
    };
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const webhookStats = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
        COUNT(*) FILTER (WHERE status = 'FAILING') as failing
       FROM webhooks WHERE merchant_id = $1`,
      [merchantId],
    );

    const deliveryStats = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as success,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'RETRYING')) as pending
       FROM webhook_deliveries 
       WHERE merchant_id = $1 AND created_at >= $2`,
      [merchantId, startDate],
    );

    const wStats = webhookStats.rows[0];
    const dStats = deliveryStats.rows[0];
    const total = parseInt(dStats.total);
    const success = parseInt(dStats.success);

    return {
      total: parseInt(wStats.total),
      active: parseInt(wStats.active),
      failing: parseInt(wStats.failing),
      deliveryStats: {
        total,
        success,
        failed: parseInt(dStats.failed),
        pending: parseInt(dStats.pending),
        successRate: total > 0 ? Math.round((success / total) * 100) : 100,
      },
    };
  }

  /**
   * Clean up old deliveries
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldDeliveries(): Promise<void> {
    const result = await this.pool.query(
      `SELECT cleanup_old_webhook_deliveries(30) as deleted`,
    );
    this.logger.log(
      `Cleaned up ${result.rows[0].deleted} old webhook deliveries`,
    );
  }

  generateSecret(): string {
    return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
  }

  private signPayload(payload: any, secret: string): string {
    const payloadString =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    return crypto
      .createHmac("sha256", secret)
      .update(payloadString)
      .digest("hex");
  }

  private mapDeliveryRow(row: any) {
    return {
      id: row.id,
      webhookId: row.webhook_id,
      event: row.event_type,
      status: row.status,
      statusCode: row.response_status,
      requestBody: row.payload ? JSON.stringify(row.payload) : null,
      responseBody: row.response_body,
      attemptNumber: row.attempt_count,
      maxAttempts: row.max_attempts,
      deliveredAt: row.completed_at,
      nextRetryAt: row.next_retry_at,
      error: row.error,
      duration: row.response_time_ms,
      createdAt: row.created_at,
    };
  }

  private mapWebhook(row: any): Webhook {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      name: row.name,
      url: row.url,
      secret: row.secret,
      events: row.events,
      headers: row.headers || {},
      status: row.status,
      retryCount: row.retry_count,
      timeoutMs: row.timeout_ms,
      consecutiveFailures: row.consecutive_failures,
      lastTriggeredAt: row.last_triggered_at,
      lastSuccessAt: row.last_success_at,
      lastFailureAt: row.last_failure_at,
      createdAt: row.created_at,
    };
  }
}
