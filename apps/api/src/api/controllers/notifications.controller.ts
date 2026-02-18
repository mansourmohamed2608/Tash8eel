import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { Pool } from "pg";
import {
  NotificationsService,
  NotificationType,
  NotificationPreferences,
} from "../../application/services/notifications.service";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantId } from "../../shared/decorators/merchant-id.decorator";
import { MerchantAuth } from "../../shared/guards/merchant-auth.guard";

type RecipientFilter = "all" | "vip" | "loyal" | "regular" | "new" | "at_risk";

interface BroadcastPayload {
  title?: string;
  message?: string;
  type?: string;
  recipientFilter?: RecipientFilter;
  customSegmentId?: string;
}

interface SegmentRule {
  field: string;
  operator: "gte" | "lte" | "gt" | "lt" | "eq" | string;
  value: string | number;
}

interface RecipientProfile {
  customerId?: string | null;
  name: string;
  phone: string;
  phoneKey: string;
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: Date | null;
}

@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  // ==================== NOTIFICATIONS ====================

  @Get("merchants/:merchantId/notifications")
  @MerchantAuth()
  async getNotifications(
    @Param("merchantId") merchantId: string,
    @Query("staffId") staffId?: string,
    @Query("unreadOnly") unreadOnly?: string,
    @Query("types") types?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const result = await this.notificationsService.getForMerchant(
      merchantId,
      staffId,
      {
        unreadOnly: unreadOnly === "true",
        types: types ? (types.split(",") as NotificationType[]) : undefined,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    );

    return result;
  }

  @Put("merchants/:merchantId/notifications/:notificationId/read")
  @MerchantAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAsRead(
    @Param("merchantId") merchantId: string,
    @Param("notificationId") notificationId: string,
    @Query("staffId") staffId?: string,
  ) {
    await this.notificationsService.markAsRead(
      merchantId,
      notificationId,
      staffId,
    );
  }

  @Put("merchants/:merchantId/notifications/read-all")
  @MerchantAuth()
  async markAllAsRead(
    @Param("merchantId") merchantId: string,
    @Query("staffId") staffId?: string,
  ) {
    const count = await this.notificationsService.markAllAsRead(
      merchantId,
      staffId,
    );
    return { markedAsRead: count };
  }

  @Delete("merchants/:merchantId/notifications/:notificationId")
  @MerchantAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNotification(
    @Param("merchantId") merchantId: string,
    @Param("notificationId") notificationId: string,
  ) {
    await this.notificationsService.delete(merchantId, notificationId);
  }

  // ==================== PREFERENCES ====================

  @Get("merchants/:merchantId/notification-preferences")
  @MerchantAuth()
  async getPreferences(
    @Param("merchantId") merchantId: string,
    @Query("staffId") staffId?: string,
  ) {
    let prefs = await this.notificationsService.getPreferences(
      merchantId,
      staffId,
    );

    // Return defaults if no preferences exist
    if (!prefs) {
      prefs = {
        merchantId,
        staffId,
        emailEnabled: true,
        pushEnabled: true,
        whatsappEnabled: false,
        enabledTypes: [
          "ORDER_PLACED",
          "ORDER_CONFIRMED",
          "ORDER_SHIPPED",
          "ORDER_DELIVERED",
          "LOW_STOCK",
          "ESCALATED_CONVERSATION",
          "PAYMENT_RECEIVED",
          "DAILY_SUMMARY",
          "SECURITY_ALERT",
        ],
      };
    }

    return prefs;
  }

  @Put("merchants/:merchantId/notification-preferences")
  @MerchantAuth()
  async updatePreferences(
    @Param("merchantId") merchantId: string,
    @Body() body: Partial<NotificationPreferences>,
    @Query("staffId") staffId?: string,
  ) {
    const prefs = await this.notificationsService.updatePreferences(
      merchantId,
      staffId,
      body,
    );
    return prefs;
  }

  // ==================== TEST ENDPOINT (DEV ONLY) ====================

  @Post("merchants/:merchantId/notifications/test")
  @MerchantAuth()
  async sendTestNotification(
    @Param("merchantId") merchantId: string,
    @Body() body: { type?: string; staffId?: string },
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new BadRequestException(
        "Test notifications not available in production",
      );
    }

    const notification = await this.notificationsService.create({
      merchantId,
      staffId: body.staffId,
      type: "SYSTEM_ALERT",
      title: "Test Notification",
      titleAr: "إشعار تجريبي",
      message:
        "This is a test notification to verify your setup is working correctly.",
      messageAr: "هذا إشعار تجريبي للتأكد من أن الإعدادات تعمل بشكل صحيح.",
      priority: "MEDIUM",
      channels: ["IN_APP"],
    });

    return notification;
  }

  // ==================== PORTAL-COMPAT ROUTES ====================

  @Get("v1/portal/notifications")
  @MerchantAuth()
  async getPortalNotifications(
    @MerchantId() merchantId: string,
    @Req() req: Request,
    @Query("staffId") staffId?: string,
    @Query("unreadOnly") unreadOnly?: string,
    @Query("types") types?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const result = await this.notificationsService.getForMerchant(
      merchantId,
      this.resolveStaffId(req, staffId),
      {
        unreadOnly: unreadOnly === "true",
        types: types ? (types.split(",") as NotificationType[]) : undefined,
        limit: this.parsePositiveInt(limit, 50, 1, 200),
        offset: this.parsePositiveInt(offset, 0, 0, 10000),
      },
    );

    return result;
  }

  @Put("v1/portal/notifications/:notificationId/read")
  @MerchantAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async markPortalAsRead(
    @MerchantId() merchantId: string,
    @Req() req: Request,
    @Param("notificationId") notificationId: string,
  ) {
    await this.notificationsService.markAsRead(
      merchantId,
      notificationId,
      this.resolveStaffId(req),
    );
  }

  @Put("v1/portal/notifications/read-all")
  @MerchantAuth()
  async markAllPortalAsRead(
    @MerchantId() merchantId: string,
    @Req() req: Request,
  ) {
    const count = await this.notificationsService.markAllAsRead(
      merchantId,
      this.resolveStaffId(req),
    );
    return { markedAsRead: count };
  }

  @Delete("v1/portal/notifications/:notificationId")
  @MerchantAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePortalNotification(
    @MerchantId() merchantId: string,
    @Param("notificationId") notificationId: string,
  ) {
    await this.notificationsService.delete(merchantId, notificationId);
  }

  @Get("v1/portal/notifications/status")
  @MerchantAuth()
  async getPortalNotificationStatus(@MerchantId() merchantId: string) {
    const delivery = this.notificationsService.getDeliveryConfigStatus();
    const merchantContact =
      await this.getMerchantNotificationContact(merchantId);

    const configuredNumber =
      merchantContact.whatsappNumber ||
      merchantContact.notificationPhone ||
      null;
    const metaReady = Boolean(delivery?.whatsapp?.configured);
    const numberRegistered = Boolean(configuredNumber);

    return {
      whatsapp: {
        configured: metaReady && numberRegistered,
        metaReady,
        numberRegistered,
        number: configuredNumber,
      },
      email: {
        configured: Boolean(delivery?.smtp?.configured),
        numberRegistered: Boolean(merchantContact.notificationEmail),
        address: merchantContact.notificationEmail,
      },
      push: delivery?.push || {
        fcm: { configured: false },
        apns: { configured: false },
      },
      delivery,
    };
  }

  @Post("v1/portal/notifications/test")
  @MerchantAuth()
  async sendPortalNotificationTest(
    @MerchantId() merchantId: string,
    @Body() body: { channel?: "EMAIL" | "WHATSAPP" | "PUSH"; target?: string },
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new BadRequestException(
        "Test notifications not available in production",
      );
    }

    const channel = (body?.channel || "").toUpperCase() as
      | "EMAIL"
      | "WHATSAPP"
      | "PUSH";
    if (!["EMAIL", "WHATSAPP", "PUSH"].includes(channel)) {
      throw new BadRequestException("channel must be EMAIL, WHATSAPP, or PUSH");
    }

    const merchantContact =
      await this.getMerchantNotificationContact(merchantId);
    const fallbackTarget =
      channel === "EMAIL"
        ? merchantContact.notificationEmail
        : channel === "WHATSAPP"
          ? merchantContact.whatsappNumber || merchantContact.notificationPhone
          : undefined;
    const target = body?.target || fallbackTarget || undefined;

    if ((channel === "EMAIL" || channel === "WHATSAPP") && !target) {
      throw new BadRequestException(
        channel === "EMAIL"
          ? "No email target available for test notification"
          : "No WhatsApp number available for test notification",
      );
    }

    await this.notificationsService.sendTest(channel, target, merchantId);

    await this.notificationsService.create({
      merchantId,
      type: "SYSTEM_ALERT",
      title: "Notification Test Sent",
      titleAr: "تم إرسال إشعار تجريبي",
      message: `Test notification sent via ${channel}`,
      messageAr: `تم إرسال إشعار تجريبي عبر ${channel}`,
      priority: "LOW",
      channels: ["IN_APP"],
      data: { test: true, channel, target: target || null },
    });

    return { success: true, channel, target: target || null };
  }

  @Post("v1/portal/notifications/broadcast")
  @MerchantAuth()
  async sendPortalBroadcast(
    @MerchantId() merchantId: string,
    @Body() body: BroadcastPayload,
  ) {
    const title = (body?.title || "").trim();
    const message = (body?.message || "").trim();
    const type = (body?.type || "promotional").trim() || "promotional";
    const recipientFilter = (body?.recipientFilter || "all") as RecipientFilter;
    const customSegmentId = (body?.customSegmentId || "").trim() || null;

    if (!title || !message) {
      throw new BadRequestException("title and message are required");
    }

    const delivery = this.notificationsService.getDeliveryConfigStatus();
    if (!delivery?.whatsapp?.configured) {
      throw new BadRequestException(
        "WhatsApp broadcast is not configured for this environment",
      );
    }

    const recipients = await this.getBroadcastRecipients(merchantId);
    let filteredRecipients = this.filterRecipientsByPreset(
      recipients,
      recipientFilter,
    );
    if (customSegmentId) {
      filteredRecipients = await this.filterRecipientsByCustomSegment(
        merchantId,
        customSegmentId,
        recipients,
      );
    }

    if (filteredRecipients.length === 0) {
      return {
        success: true,
        sentCount: 0,
        failCount: 0,
        recipientCount: 0,
        message: "لا يوجد مستلمون مطابقون للفئة المحددة",
      };
    }

    let sentCount = 0;
    let failCount = 0;
    const sampleErrors: string[] = [];

    for (const recipient of filteredRecipients) {
      const targetPhone = this.formatPhoneForSend(
        recipient.phone,
        recipient.phoneKey,
      );
      if (!targetPhone) {
        failCount++;
        continue;
      }
      try {
        const messageBody = `${title}\n\n${message}`;
        await this.notificationsService.sendBroadcastWhatsApp(
          targetPhone,
          messageBody,
        );
        sentCount++;
      } catch (error: any) {
        failCount++;
        if (sampleErrors.length < 3) {
          sampleErrors.push(error?.message || "Unknown send failure");
        }
      }
    }

    const summaryNotification = await this.notificationsService.create({
      merchantId,
      type: "SYSTEM_ALERT",
      title,
      titleAr: title,
      message,
      messageAr: message,
      priority: failCount > 0 ? "HIGH" : "MEDIUM",
      channels: ["IN_APP"],
      data: {
        broadcast: true,
        type,
        filter: customSegmentId ? "custom" : recipientFilter,
        customSegmentId,
        recipientCount: filteredRecipients.length,
        sentCount,
        failCount,
        sampleErrors,
      },
      actionUrl: "/merchant/push-notifications",
    });

    const resultMessage =
      failCount > 0
        ? `تم الإرسال إلى ${sentCount} من ${filteredRecipients.length} مستلم`
        : `تم الإرسال إلى ${sentCount} مستلم`;

    return {
      success: true,
      message: resultMessage,
      sentCount,
      failCount,
      recipientCount: filteredRecipients.length,
      notificationId: summaryNotification.id,
    };
  }

  private resolveStaffId(
    request: Request,
    fallback?: string,
  ): string | undefined {
    return fallback || ((request as any)?.staffId ?? undefined);
  }

  private parsePositiveInt(
    rawValue: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number.parseInt(String(rawValue ?? ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  }

  private normalizePhone(value?: string | null): string | null {
    if (!value) return null;
    const digits = String(value).replace(/\D/g, "");
    if (!digits) return null;
    return digits.length > 11 ? digits.slice(-11) : digits;
  }

  private formatPhoneForSend(
    rawPhone: string,
    phoneKey: string,
  ): string | null {
    const trimmed = String(rawPhone || "").trim();
    if (trimmed) {
      const cleaned = trimmed.replace(/^whatsapp:/i, "").trim();
      if (cleaned.startsWith("+")) return cleaned;
      const digits = cleaned.replace(/\D/g, "");
      if (!digits) return null;
      if (digits.length === 11 && digits.startsWith("01")) return `+2${digits}`;
      if (digits.length === 12 && digits.startsWith("20")) return `+${digits}`;
      return `+${digits}`;
    }

    if (!phoneKey) return null;
    if (phoneKey.length === 11 && phoneKey.startsWith("01"))
      return `+2${phoneKey}`;
    if (phoneKey.length === 12 && phoneKey.startsWith("20"))
      return `+${phoneKey}`;
    return `+${phoneKey}`;
  }

  private toNumber(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private daysSince(date: Date | null): number {
    if (!date) return Number.POSITIVE_INFINITY;
    const diff = Date.now() - date.getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
  }

  private filterRecipientsByPreset(
    recipients: RecipientProfile[],
    recipientFilter: RecipientFilter,
  ): RecipientProfile[] {
    switch (recipientFilter) {
      case "vip":
        return recipients.filter(
          (r) => r.orderCount >= 5 && r.lifetimeValue >= 1000,
        );
      case "loyal":
        return recipients.filter(
          (r) => r.orderCount >= 3 && this.daysSince(r.lastOrderAt) <= 60,
        );
      case "regular":
        return recipients.filter(
          (r) => r.orderCount >= 1 && this.daysSince(r.lastOrderAt) <= 90,
        );
      case "new":
        return recipients.filter((r) => r.orderCount === 0);
      case "at_risk":
        return recipients.filter(
          (r) => r.orderCount > 0 && this.daysSince(r.lastOrderAt) > 90,
        );
      case "all":
      default:
        return recipients;
    }
  }

  private async getMerchantNotificationContact(merchantId: string): Promise<{
    whatsappNumber: string | null;
    notificationPhone: string | null;
    notificationEmail: string | null;
  }> {
    const result = await this.pool.query<{
      whatsapp_number: string | null;
      notification_phone: string | null;
      notification_email: string | null;
    }>(
      `
        SELECT
          COALESCE(
            NULLIF(to_jsonb(m)->>'whatsapp_number', ''),
            NULLIF(to_jsonb(m)->>'whatsappNumber', '')
          ) AS whatsapp_number,
          COALESCE(
            NULLIF(to_jsonb(m)->>'notification_phone', ''),
            NULLIF(to_jsonb(m)->>'notificationPhone', '')
          ) AS notification_phone,
          COALESCE(
            NULLIF(to_jsonb(m)->>'notification_email', ''),
            NULLIF(to_jsonb(m)->>'notificationEmail', ''),
            NULLIF(to_jsonb(m)->>'email', '')
          ) AS notification_email
        FROM merchants m
        WHERE m.id = $1
        LIMIT 1
      `,
      [merchantId],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException("Merchant not found");
    }

    return {
      whatsappNumber: result.rows[0].whatsapp_number || null,
      notificationPhone: result.rows[0].notification_phone || null,
      notificationEmail: result.rows[0].notification_email || null,
    };
  }

  private async getBroadcastRecipients(
    merchantId: string,
  ): Promise<RecipientProfile[]> {
    const customerRows = await this.pool.query<{
      customer_id: string | null;
      phone: string | null;
      customer_name: string | null;
    }>(
      `
        SELECT
          c.id::text AS customer_id,
          COALESCE(
            NULLIF(to_jsonb(c)->>'phone', ''),
            NULLIF(to_jsonb(c)->>'whatsapp_id', ''),
            NULLIF(to_jsonb(c)->>'sender_id', '')
          ) AS phone,
          COALESCE(NULLIF(to_jsonb(c)->>'name', ''), 'عميل') AS customer_name
        FROM customers c
        WHERE c.merchant_id = $1
      `,
      [merchantId],
    );

    const phoneExpr = `NULLIF(regexp_replace(COALESCE(NULLIF(to_jsonb(o)->>'customer_phone', ''), NULLIF(to_jsonb(o)->>'phone', '')), '\\D', '', 'g'), '')`;
    const statusExpr = `COALESCE(NULLIF(to_jsonb(o)->>'status', ''), '')`;
    const totalExpr = `COALESCE(NULLIF(regexp_replace(COALESCE(to_jsonb(o)->>'total', ''), '[^0-9.-]', '', 'g'), '')::numeric, 0)`;

    const orderRows = await this.pool.query<{
      phone_key: string | null;
      raw_phone: string | null;
      customer_name: string | null;
      order_count: string;
      lifetime_value: string;
      last_order_at: string | null;
    }>(
      `
        SELECT
          ${phoneExpr} AS phone_key,
          MAX(COALESCE(NULLIF(to_jsonb(o)->>'customer_phone', ''), NULLIF(to_jsonb(o)->>'phone', ''))::text) AS raw_phone,
          MAX(COALESCE(NULLIF(to_jsonb(o)->>'customer_name', ''), NULLIF(to_jsonb(o)->>'customerName', ''), 'عميل')::text) AS customer_name,
          COUNT(*) FILTER (WHERE ${statusExpr} <> 'DRAFT')::int::text AS order_count,
          COALESCE(SUM(${totalExpr}) FILTER (WHERE ${statusExpr} <> 'DRAFT'), 0)::text AS lifetime_value,
          MAX(o.created_at)::text AS last_order_at
        FROM orders o
        WHERE o.merchant_id = $1
          AND ${phoneExpr} IS NOT NULL
        GROUP BY 1
      `,
      [merchantId],
    );

    const recipients = new Map<string, RecipientProfile>();

    for (const row of customerRows.rows) {
      const phone = row.phone || null;
      const phoneKey = this.normalizePhone(phone);
      if (!phoneKey || !phone) continue;
      recipients.set(phoneKey, {
        customerId: row.customer_id,
        name: row.customer_name || "عميل",
        phone,
        phoneKey,
        orderCount: 0,
        lifetimeValue: 0,
        lastOrderAt: null,
      });
    }

    for (const row of orderRows.rows) {
      const phoneKey = this.normalizePhone(row.phone_key || row.raw_phone);
      if (!phoneKey) continue;

      const existing = recipients.get(phoneKey);
      const next: RecipientProfile = {
        customerId: existing?.customerId || null,
        name: existing?.name || row.customer_name || "عميل",
        phone: existing?.phone || row.raw_phone || row.phone_key || "",
        phoneKey,
        orderCount: this.toNumber(row.order_count),
        lifetimeValue: this.toNumber(row.lifetime_value),
        lastOrderAt: row.last_order_at ? new Date(row.last_order_at) : null,
      };

      if (!next.phone) continue;
      recipients.set(phoneKey, next);
    }

    return Array.from(recipients.values());
  }

  private async filterRecipientsByCustomSegment(
    merchantId: string,
    segmentId: string,
    recipients: RecipientProfile[],
  ): Promise<RecipientProfile[]> {
    let result;
    try {
      result = await this.pool.query<{ rules: any; match_type: string }>(
        `
          SELECT rules, match_type
          FROM custom_segments
          WHERE id = $1 AND merchant_id = $2
          LIMIT 1
        `,
        [segmentId, merchantId],
      );
    } catch (error: any) {
      if (error?.code === "22P02") {
        throw new BadRequestException("Custom segment id is invalid");
      }
      if (error?.code === "42P01") {
        throw new BadRequestException("Custom segments are not available yet");
      }
      throw error;
    }

    if (result.rows.length === 0) {
      throw new BadRequestException("Custom segment not found");
    }

    const rules = Array.isArray(result.rows[0].rules)
      ? (result.rows[0].rules as SegmentRule[])
      : [];
    if (rules.length === 0) {
      return [];
    }

    const matchType = result.rows[0].match_type === "any" ? "any" : "all";
    return recipients.filter((recipient) =>
      this.matchesSegmentRules(recipient, rules, matchType),
    );
  }

  private matchesSegmentRules(
    recipient: RecipientProfile,
    rules: SegmentRule[],
    matchType: "all" | "any",
  ): boolean {
    const daysSinceLastOrder = this.daysSince(recipient.lastOrderAt);
    const avgOrderValue =
      recipient.orderCount > 0
        ? recipient.lifetimeValue / recipient.orderCount
        : 0;

    const evaluateRule = (rule: SegmentRule): boolean => {
      const value = Number(rule.value ?? 0);
      if (!Number.isFinite(value)) return false;

      let fieldValue = 0;
      switch (rule.field) {
        case "order_count":
          fieldValue = recipient.orderCount;
          break;
        case "total_spent":
          fieldValue = recipient.lifetimeValue;
          break;
        case "days_since_last_order":
          fieldValue = daysSinceLastOrder;
          break;
        case "avg_order_value":
          fieldValue = avgOrderValue;
          break;
        default:
          return false;
      }

      switch (rule.operator) {
        case "gte":
          return fieldValue >= value;
        case "lte":
          return fieldValue <= value;
        case "gt":
          return fieldValue > value;
        case "lt":
          return fieldValue < value;
        case "eq":
          return fieldValue === value;
        default:
          return false;
      }
    };

    if (matchType === "any") {
      return rules.some(evaluateRule);
    }
    return rules.every(evaluateRule);
  }
}
