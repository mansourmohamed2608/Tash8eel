import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, PoolClient } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

type DeletionRequestStatus = "PENDING" | "CANCELLED" | "COMPLETED";

interface DeletionRequestRow {
  id: string;
  merchant_id: string;
  requested_by_staff_id: string;
  requested_at: Date;
  scheduled_for: Date;
  processed_at: Date | null;
  status: DeletionRequestStatus;
  cancellation_reason: string | null;
}

interface MerchantOwnerRow {
  email: string | null;
  name: string | null;
  merchant_name: string | null;
}

@Injectable()
export class MerchantDeletionService {
  private readonly logger = new Logger(MerchantDeletionService.name);
  private readonly portalBaseUrl: string;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {
    this.portalBaseUrl =
      this.configService.get<string>("PORTAL_BASE_URL") ||
      "http://localhost:3000";
  }

  async getPendingRequest(merchantId: string): Promise<{
    id: string;
    merchantId: string;
    requestedByStaffId: string;
    requestedAt: string;
    scheduledFor: string;
    status: DeletionRequestStatus;
  } | null> {
    const result = await this.pool.query<DeletionRequestRow>(
      `SELECT id, merchant_id, requested_by_staff_id, requested_at, scheduled_for, processed_at, status, cancellation_reason
       FROM merchant_deletion_requests
       WHERE merchant_id = $1 AND status = 'PENDING'
       ORDER BY requested_at DESC
       LIMIT 1`,
      [merchantId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      merchantId: row.merchant_id,
      requestedByStaffId: row.requested_by_staff_id,
      requestedAt: row.requested_at.toISOString(),
      scheduledFor: row.scheduled_for.toISOString(),
      status: row.status,
    };
  }

  async createDeletionRequest(
    merchantId: string,
    requestedByStaffId: string,
  ): Promise<{
    requestId: string;
    scheduledFor: string;
    message: string;
  }> {
    const existing = await this.getPendingRequest(merchantId);
    if (existing) {
      throw new ConflictException("A pending deletion request already exists");
    }

    const result = await this.pool.query<DeletionRequestRow>(
      `INSERT INTO merchant_deletion_requests (merchant_id, requested_by_staff_id)
       VALUES ($1, $2)
       RETURNING id, merchant_id, requested_by_staff_id, requested_at, scheduled_for, processed_at, status, cancellation_reason`,
      [merchantId, requestedByStaffId],
    );

    const row = result.rows[0];
    await this.sendDeletionEmail(merchantId, row.scheduled_for, "requested");

    return {
      requestId: row.id,
      scheduledFor: row.scheduled_for.toISOString(),
      message:
        "Deletion request received. Your account will be deleted after the 30-day waiting period.",
    };
  }

  async cancelDeletionRequest(
    merchantId: string,
    requestId: string,
  ): Promise<{ message: string }> {
    const result = await this.pool.query<DeletionRequestRow>(
      `UPDATE merchant_deletion_requests
       SET status = 'CANCELLED'
       WHERE id = $1
         AND merchant_id = $2
         AND status = 'PENDING'
       RETURNING id, merchant_id, requested_by_staff_id, requested_at, scheduled_for, processed_at, status, cancellation_reason`,
      [requestId, merchantId],
    );

    const row = result.rows[0];
    if (!row) {
      const existing = await this.pool.query<{ status: DeletionRequestStatus }>(
        `SELECT status FROM merchant_deletion_requests WHERE id = $1 AND merchant_id = $2 LIMIT 1`,
        [requestId, merchantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException("Deletion request not found");
      }
      throw new ConflictException("Deletion request is no longer pending");
    }

    await this.sendDeletionEmail(merchantId, row.scheduled_for, "cancelled");
    return { message: "Deletion request cancelled" };
  }

  async processDueRequests(): Promise<number> {
    const result = await this.pool.query<DeletionRequestRow>(
      `SELECT id, merchant_id, requested_by_staff_id, requested_at, scheduled_for, processed_at, status, cancellation_reason
       FROM merchant_deletion_requests
       WHERE status = 'PENDING'
         AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC`,
      [],
    );

    let processed = 0;
    for (const row of result.rows) {
      try {
        await this.deleteMerchantData(row.id, row.merchant_id);
        processed += 1;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Merchant deletion failed for merchantId=${row.merchant_id}: ${err.message}`,
          err.stack,
        );
      }
    }

    return processed;
  }

  private async deleteMerchantData(
    requestId: string,
    merchantId: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await this.deleteIfTableExists(
        client,
        "staff_sessions",
        `DELETE FROM staff_sessions ss
         USING merchant_staff ms
         WHERE ss.staff_id = ms.id
           AND ms.merchant_id = $1`,
        [merchantId],
      );

      await this.deleteIfTableExists(
        client,
        "outbox_events",
        `DELETE FROM outbox_events WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "dlq_events",
        `DELETE FROM dlq_events WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "notifications",
        `DELETE FROM notifications WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "merchant_notifications",
        `DELETE FROM merchant_notifications WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "push_subscriptions",
        `DELETE FROM push_subscriptions WHERE merchant_id = $1`,
        [merchantId],
      );

      await this.deleteIfTableExists(
        client,
        "messages",
        `DELETE FROM messages WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "conversations",
        `DELETE FROM conversations WHERE merchant_id = $1`,
        [merchantId],
      );

      await this.deleteIfTableExists(
        client,
        "order_items",
        `DELETE FROM order_items
         WHERE order_id IN (SELECT id FROM orders WHERE merchant_id = $1)`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "orders",
        `DELETE FROM orders WHERE merchant_id = $1`,
        [merchantId],
      );

      await this.deleteIfTableExists(
        client,
        "inventory_stock_by_location",
        `DELETE FROM inventory_stock_by_location
         WHERE variant_id IN (
           SELECT iv.id
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           WHERE ii.merchant_id = $1
         )`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "inventory_movements",
        `DELETE FROM inventory_movements WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "inventory_alerts",
        `DELETE FROM inventory_alerts WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "inventory_top_movers",
        `DELETE FROM inventory_top_movers WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "inventory_cost_layers",
        `DELETE FROM inventory_cost_layers
         WHERE lot_id IN (
           SELECT il.id
           FROM inventory_lots il
           JOIN inventory_variants iv ON iv.id = il.variant_id
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           WHERE ii.merchant_id = $1
         )`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "inventory_lots",
        `DELETE FROM inventory_lots
         WHERE variant_id IN (
           SELECT iv.id
           FROM inventory_variants iv
           JOIN inventory_items ii ON ii.id = iv.inventory_item_id
           WHERE ii.merchant_id = $1
         )`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "inventory_variants",
        `DELETE FROM inventory_variants
         WHERE inventory_item_id IN (
           SELECT id FROM inventory_items WHERE merchant_id = $1
         )`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "inventory_items",
        `DELETE FROM inventory_items WHERE merchant_id = $1`,
        [merchantId],
      );

      await this.deleteIfTableExists(
        client,
        "customers",
        `DELETE FROM customers WHERE merchant_id = $1`,
        [merchantId],
      );

      await this.deleteIfTableExists(
        client,
        "merchant_agent_subscriptions",
        `DELETE FROM merchant_agent_subscriptions WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "subscriptions",
        `DELETE FROM subscriptions WHERE merchant_id = $1`,
        [merchantId],
      );
      await this.deleteIfTableExists(
        client,
        "merchant_subscriptions",
        `DELETE FROM merchant_subscriptions WHERE merchant_id = $1`,
        [merchantId],
      );

      await this.deleteIfTableExists(
        client,
        "merchant_staff",
        `DELETE FROM merchant_staff WHERE merchant_id = $1`,
        [merchantId],
      );

      await client.query(
        `UPDATE merchant_deletion_requests
         SET status = 'COMPLETED', processed_at = NOW()
         WHERE id = $1`,
        [requestId],
      );
      await client.query(`DELETE FROM merchants WHERE id = $1`, [merchantId]);

      await client.query("COMMIT");
      this.logger.log(
        `Merchant deletion completed for merchantId=${merchantId} at ${new Date().toISOString()}`,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async deleteIfTableExists(
    client: PoolClient,
    tableName: string,
    sql: string,
    params: unknown[],
  ): Promise<void> {
    const regclass = await client.query<{ exists: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [tableName],
    );
    if (!regclass.rows[0]?.exists) {
      return;
    }
    await client.query(sql, params);
  }

  private async sendDeletionEmail(
    merchantId: string,
    scheduledFor: Date,
    mode: "requested" | "cancelled",
  ): Promise<void> {
    const owner = await this.getMerchantOwner(merchantId);
    if (!owner?.email) {
      return;
    }

    const host = this.configService.get<string>("SMTP_HOST");
    const port = parseInt(
      this.configService.get<string>("SMTP_PORT", "587"),
      10,
    );
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const from = this.configService.get<string>("SMTP_FROM");
    const secure =
      this.configService.get<string>("SMTP_SECURE", "false") === "true";

    if (!host || !from) {
      this.logger.warn(
        `[EMAIL] SMTP not configured - skipping deletion ${mode} email for merchantId=${merchantId}`,
      );
      return;
    }

    let nodemailer: any;
    try {
      nodemailer = await import("nodemailer");
    } catch {
      this.logger.warn(
        `[EMAIL] nodemailer not installed - skipping deletion ${mode} email for merchantId=${merchantId}`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    const settingsUrl = `${this.portalBaseUrl}/merchant/settings/delete-account`;
    const formattedDate = scheduledFor.toISOString();
    const subject =
      mode === "requested" ? "تأكيد طلب حذف الحساب" : "تم إلغاء طلب حذف الحساب";
    const html =
      mode === "requested"
        ? `
          <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">
            <h2>تم استلام طلب حذف حساب المتجر</h2>
            <p>المتجر: <strong>${owner.merchant_name ?? "متجرك"}</strong></p>
            <p>سيتم حذف جميع بيانات المتجر نهائياً في: <strong>${formattedDate}</strong></p>
            <p>إذا غيّرت رأيك، يمكنك إلغاء الطلب من صفحة الإعدادات قبل هذا التاريخ.</p>
            <p><a href="${settingsUrl}">${settingsUrl}</a></p>
          </div>
        `
        : `
          <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">
            <h2>تم إلغاء طلب حذف حساب المتجر</h2>
            <p>المتجر: <strong>${owner.merchant_name ?? "متجرك"}</strong></p>
            <p>لن يتم حذف بيانات المتجر، وتم إيقاف الطلب المعلق بنجاح.</p>
            <p><a href="${settingsUrl}">${settingsUrl}</a></p>
          </div>
        `;

    await transporter.sendMail({
      from,
      to: owner.email,
      subject,
      html,
    });
  }

  private async getMerchantOwner(
    merchantId: string,
  ): Promise<MerchantOwnerRow | null> {
    const result = await this.pool.query<MerchantOwnerRow>(
      `SELECT ms.email, ms.name, m.name AS merchant_name
       FROM merchant_staff ms
       JOIN merchants m ON m.id = ms.merchant_id
       WHERE ms.merchant_id = $1
         AND ms.role = 'OWNER'
       ORDER BY ms.created_at ASC
       LIMIT 1`,
      [merchantId],
    );
    return result.rows[0] ?? null;
  }
}
