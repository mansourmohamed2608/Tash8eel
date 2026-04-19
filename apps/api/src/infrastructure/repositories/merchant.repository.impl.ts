import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module";
import { IMerchantRepository } from "../../domain/ports/merchant.repository";
import {
  Merchant,
  CreateMerchantInput,
  UpdateMerchantInput,
  MerchantTokenUsage,
} from "../../domain/entities/merchant.entity";
import { MerchantCategory } from "../../shared/constants/enums";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("MerchantRepository");

@Injectable()
export class MerchantRepository implements IMerchantRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  async findById(id: string): Promise<Merchant | null> {
    const result = await this.pool.query(
      `SELECT * FROM merchants WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findAll(): Promise<Merchant[]> {
    const result = await this.pool.query(
      `SELECT * FROM merchants ORDER BY created_at DESC`,
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  async findActive(): Promise<Merchant[]> {
    const result = await this.pool.query(
      `SELECT * FROM merchants WHERE is_active = true ORDER BY created_at DESC`,
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  async create(input: CreateMerchantInput): Promise<Merchant> {
    const result = await this.pool.query(
      `INSERT INTO merchants (id, name, category, config, branding, negotiation_rules, delivery_rules, daily_token_budget)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.id,
        input.name,
        input.category || MerchantCategory.GENERIC,
        JSON.stringify(input.config || {}),
        JSON.stringify(input.branding || {}),
        JSON.stringify(input.negotiationRules || {}),
        JSON.stringify(input.deliveryRules || {}),
        input.dailyTokenBudget || 100000,
      ],
    );
    return this.mapToEntity(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateMerchantInput,
  ): Promise<Merchant | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(input.category);
    }
    if (input.config !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify({ ...existing.config, ...input.config }));
    }
    if (input.branding !== undefined) {
      updates.push(`branding = $${paramIndex++}`);
      values.push(JSON.stringify({ ...existing.branding, ...input.branding }));
    }
    if (input.negotiationRules !== undefined) {
      updates.push(`negotiation_rules = $${paramIndex++}`);
      values.push(
        JSON.stringify({
          ...existing.negotiationRules,
          ...input.negotiationRules,
        }),
      );
    }
    if (input.deliveryRules !== undefined) {
      updates.push(`delivery_rules = $${paramIndex++}`);
      values.push(
        JSON.stringify({ ...existing.deliveryRules, ...input.deliveryRules }),
      );
    }
    if (input.dailyTokenBudget !== undefined) {
      updates.push(`daily_token_budget = $${paramIndex++}`);
      values.push(input.dailyTokenBudget);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }

    if (updates.length === 0) return existing;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE merchants SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return this.mapToEntity(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM merchants WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getTokenUsage(
    merchantId: string,
    date: string,
  ): Promise<MerchantTokenUsage | null> {
    const result = await this.pool.query(
      `SELECT * FROM merchant_token_usage WHERE merchant_id = $1 AND usage_date = $2`,
      [merchantId, date],
    );
    return result.rows[0] ? this.mapTokenUsage(result.rows[0]) : null;
  }

  async incrementTokenUsage(
    merchantId: string,
    date: string,
    tokens: number,
  ): Promise<MerchantTokenUsage> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2::text))`,
        [merchantId, date],
      );

      const existing = await client.query(
        `SELECT *
         FROM merchant_token_usage
         WHERE merchant_id = $1
           AND usage_date = $2::date
         ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         LIMIT 1
         FOR UPDATE`,
        [merchantId, date],
      );

      let row: Record<string, unknown>;
      if (existing.rows.length > 0) {
        const updated = await client.query(
          `UPDATE merchant_token_usage
           SET tokens_used = COALESCE(tokens_used, 0) + $2,
               llm_calls = COALESCE(llm_calls, 0) + 1,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [existing.rows[0].id, tokens],
        );
        row = updated.rows[0];
      } else {
        const inserted = await client.query(
          `INSERT INTO merchant_token_usage (merchant_id, usage_date, tokens_used, llm_calls)
           VALUES ($1, $2::date, $3, 1)
           RETURNING *`,
          [merchantId, date, tokens],
        );
        row = inserted.rows[0];
      }

      await client.query("COMMIT");
      return this.mapTokenUsage(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private mapToEntity(row: Record<string, unknown>): Merchant {
    return {
      id: row.id as string,
      name: row.name as string,
      category: row.category as MerchantCategory,
      config: row.config as Merchant["config"],
      branding: row.branding as Merchant["branding"],
      negotiationRules: row.negotiation_rules as Merchant["negotiationRules"],
      deliveryRules: row.delivery_rules as Merchant["deliveryRules"],
      dailyTokenBudget: row.daily_token_budget as number,
      isActive: row.is_active as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      city: (row as any).city || undefined,
      currency: (row as any).currency || undefined,
      language: (row as any).language || undefined,
      timezone: (row as any).timezone || undefined,
      notificationPhone: (row as any).notification_phone || undefined,
      notificationEmail: (row as any).notification_email || undefined,
      whatsappNumber: (row as any).whatsapp_number || undefined,
      whatsappReportsEnabled:
        (row as any).whatsapp_reports_enabled ?? undefined,
      reportPeriodsEnabled: (row as any).report_periods_enabled || undefined,
      autoResponseEnabled: (row as any).auto_response_enabled ?? undefined,
      followupDelayMinutes: (row as any).followup_delay_minutes ?? undefined,
      paymentRemindersEnabled:
        (row as any).payment_reminders_enabled ?? undefined,
      lowStockAlertsEnabled: (row as any).low_stock_alerts_enabled ?? undefined,
      autoPaymentLinkOnConfirm:
        (row as any).auto_payment_link_on_confirm ?? undefined,
      requireCustomerContactForPaymentLink:
        (row as any).require_customer_contact_for_payment_link ?? undefined,
      paymentLinkChannel: (row as any).payment_link_channel ?? undefined,
      quietHoursStart: (row as any).quiet_hours_start || undefined,
      quietHoursEnd: (row as any).quiet_hours_end || undefined,
      enabledNotificationTypes: (row as any).enabled_notification_types
        ? JSON.parse((row as any).enabled_notification_types)
        : undefined,
      workingHours: (row as any).working_hours || undefined,
      knowledgeBase: (row as any).knowledge_base || undefined,
    };
  }

  private mapTokenUsage(row: Record<string, unknown>): MerchantTokenUsage {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      usageDate: row.usage_date as string,
      tokensUsed: row.tokens_used as number,
      llmCalls: row.llm_calls as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  // Alias for getTokenUsage - used by controller
  async getUsage(
    merchantId: string,
    date: string,
  ): Promise<{ tokensUsed: number; llmCalls: number } | null> {
    const usage = await this.getTokenUsage(merchantId, date);
    if (!usage) return null;
    return { tokensUsed: usage.tokensUsed, llmCalls: usage.llmCalls };
  }

  async getDailyReports(
    merchantId: string,
    options: { startDate?: string; endDate?: string; limit?: number },
  ): Promise<any[]> {
    // This is a placeholder - actual implementation would query an analytics table
    logger.info("getDailyReports called", { merchantId, options });
    return [];
  }

  async getNotifications(
    merchantId: string,
    unreadOnly?: boolean,
  ): Promise<any[]> {
    const query = unreadOnly
      ? `SELECT * FROM merchant_notifications WHERE merchant_id = $1 AND read_at IS NULL ORDER BY created_at DESC`
      : `SELECT * FROM merchant_notifications WHERE merchant_id = $1 ORDER BY created_at DESC`;

    try {
      const result = await this.pool.query(query, [merchantId]);
      return result.rows;
    } catch (error) {
      // Table may not exist yet
      logger.warn("getNotifications failed", {
        merchantId,
        error: (error as Error).message,
      });
      return [];
    }
  }

  async markNotificationRead(
    merchantId: string,
    notificationId: string,
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE merchant_notifications SET read_at = NOW() WHERE id = $1 AND merchant_id = $2`,
        [notificationId, merchantId],
      );
    } catch (error) {
      logger.warn("markNotificationRead failed", {
        merchantId,
        notificationId,
        error: (error as Error).message,
      });
    }
  }
}
