import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RequireRole, RolesGuard } from "../../shared/guards/roles.guard";
import {
  NotificationType,
  NotificationsService,
} from "../../application/services/notifications.service";
import { AuditService } from "../../application/services/audit.service";
import { getMerchantId } from "./portal-compat.helpers";

function getSafeStaffId(req: Request): string | undefined {
  const raw = String((req as any).staffId || "").trim();
  if (!raw) return undefined;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(raw) ? raw : undefined;
}

/**
 * Portal Notifications Controller
 *
 * Handles notification inbox (CRUD), notification config/delivery status,
 * broadcast/test sends, and push-subscription management (FCM/APNS/Web Push).
 *
 * All endpoints live under v1/portal and are protected by the same guards
 * as the main MerchantPortalController.
 */
@ApiTags("Merchant Portal")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalNotificationsController {
  private readonly logger = new Logger(PortalNotificationsController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  // ============== NOTIFICATION INBOX ==============

  @Get("notifications")
  @RequiresFeature("NOTIFICATIONS")
  @ApiOperation({ summary: "Get notifications for authenticated merchant" })
  @ApiQuery({
    name: "unreadOnly",
    description: "Only unread notifications",
    required: false,
  })
  @ApiQuery({
    name: "limit",
    description: "Max notifications",
    required: false,
  })
  @ApiQuery({
    name: "offset",
    description: "Pagination offset",
    required: false,
  })
  @ApiQuery({
    name: "types",
    description: "Comma-separated notification types",
    required: false,
  })
  async getNotifications(
    @Req() req: Request,
    @Query("unreadOnly") unreadOnly?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("types") types?: string,
  ): Promise<{ notifications: any[]; total: number; unreadCount: number }> {
    const merchantId = getMerchantId(req);
    const staffId = getSafeStaffId(req);
    const parsedLimit = Number.parseInt(String(limit || ""), 10);
    const parsedOffset = Number.parseInt(String(offset || ""), 10);
    const parsedTypes = String(types || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    return this.notificationsService.getForMerchant(merchantId, staffId, {
      unreadOnly: unreadOnly === "true",
      limit: Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 200)
        : 50,
      offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
      types:
        parsedTypes.length > 0
          ? (parsedTypes as NotificationType[])
          : undefined,
    });
  }

  @RequireRole("AGENT")
  @RequiresFeature("NOTIFICATIONS")
  @Put("notifications/:notificationId/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markNotificationRead(
    @Req() req: Request,
    @Param("notificationId") notificationId: string,
  ): Promise<{ success: boolean }> {
    const merchantId = getMerchantId(req);
    await this.notificationsService.markAsRead(
      merchantId,
      notificationId,
      getSafeStaffId(req),
    );
    return { success: true };
  }

  @RequireRole("AGENT")
  @RequiresFeature("NOTIFICATIONS")
  @Put("notifications/read-all")
  @ApiOperation({ summary: "Mark all notifications as read" })
  async markAllNotificationsRead(
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const merchantId = getMerchantId(req);
    await this.notificationsService.markAllAsRead(
      merchantId,
      getSafeStaffId(req),
    );
    return { success: true };
  }

  @RequireRole("AGENT")
  @RequiresFeature("NOTIFICATIONS")
  @Delete("notifications/:notificationId")
  @ApiOperation({ summary: "Delete a notification" })
  async deleteNotification(
    @Req() req: Request,
    @Param("notificationId") notificationId: string,
  ): Promise<{ success: boolean }> {
    const merchantId = getMerchantId(req);
    await this.notificationsService.delete(merchantId, notificationId);
    return { success: true };
  }

  // ============== NOTIFICATIONS CONFIG ==============

  @Get("notifications/status")
  @RequiresFeature("NOTIFICATIONS")
  @ApiOperation({
    summary: "Get notification delivery configuration status",
    description:
      "Returns SMTP/Meta Cloud API configuration availability for the merchant portal UI",
  })
  async getNotificationConfigStatus(@Req() req: Request): Promise<any> {
    const merchantId = getMerchantId(req);
    const status = this.notificationsService.getDeliveryConfigStatus();
    const metaReady = status.whatsapp?.configured ?? false;

    // Check if merchant has their own WhatsApp number + email registered
    let merchantWhatsApp: string | null = null;
    let merchantPhone: string | null = null;
    let merchantEmail: string | null = null;
    try {
      // Self-heal: ensure notification_email column exists
      await this.pool
        .query(
          `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255)`,
        )
        .catch(() => {});
      const res = await this.pool.query(
        `SELECT whatsapp_number, notification_phone, notification_email FROM merchants WHERE id = $1`,
        [merchantId],
      );
      merchantWhatsApp = res.rows?.[0]?.whatsapp_number || null;
      merchantPhone = res.rows?.[0]?.notification_phone || null;
      merchantEmail = res.rows?.[0]?.notification_email || null;
    } catch {
      /* column may not exist yet */
    }

    return {
      whatsapp: {
        configured: metaReady && !!merchantWhatsApp,
        metaReady,
        numberRegistered: !!merchantWhatsApp,
        number: merchantWhatsApp || null,
      },
      preferences: {
        notificationPhone: merchantPhone,
        notificationEmail: merchantEmail,
      },
    };
  }

  @Post("notifications/broadcast")
  @RequireRole("ADMIN")
  @ApiOperation({ summary: "Send broadcast notification to customers" })
  async sendBroadcastNotification(
    @Req() req: Request,
    @Body()
    body: {
      title: string;
      message: string;
      type: "promotional" | "transactional" | "reminder" | "update";
      recipientFilter?: "all" | "vip" | "loyal" | "regular" | "at_risk" | "new";
      recipientIds?: string[];
    },
  ): Promise<any> {
    const merchantId = getMerchantId(req);
    const { title, message, type, recipientFilter, recipientIds } = body;

    if (!title?.trim() || !message?.trim()) {
      throw new BadRequestException("العنوان والمحتوى مطلوبان");
    }

    // ── Load merchant info ──
    const mcResult = await this.pool.query(
      `SELECT name, config, whatsapp_number FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchantName = mcResult.rows?.[0]?.name || "التاجر";
    const merchantCfg = mcResult.rows?.[0]?.config || {};
    const senderName = merchantCfg.brandName || merchantName;
    const merchantWhatsApp: string | null =
      mcResult.rows?.[0]?.whatsapp_number || null;

    const status = this.notificationsService.getDeliveryConfigStatus();
    if (!status.whatsapp.configured) {
      throw new BadRequestException(
        "واتساب غير مهيأ — تواصل مع الدعم الفني لتفعيل خدمة الرسائل",
      );
    }
    if (!merchantWhatsApp) {
      throw new BadRequestException(
        "لم يتم تسجيل رقم واتساب لحسابك بعد — أضف رقمك في الإعدادات",
      );
    }

    // Get recipients — only those with phone numbers
    let recipientQuery = `SELECT id, name, phone FROM customers WHERE merchant_id = $1 AND phone IS NOT NULL AND phone != ''`;
    const params: any[] = [merchantId];

    if (recipientIds?.length) {
      recipientQuery += ` AND id = ANY($2)`;
      params.push(recipientIds);
    } else if (recipientFilter && recipientFilter !== "all") {
      recipientQuery = `
        WITH customer_stats AS (
          SELECT c.id, c.name, c.phone,
            COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(o.total), 0) as total_spent,
            EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) as days_since_last_order
          FROM customers c
          LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED')
          WHERE c.merchant_id = $1 AND c.phone IS NOT NULL AND c.phone != ''
          GROUP BY c.id, c.name, c.phone
        )
        SELECT id, name, phone FROM customer_stats WHERE
      `;
      const segmentMap: Record<string, string> = {
        vip: `total_orders >= 5 AND total_spent >= 1000 AND days_since_last_order < 30`,
        loyal: `total_orders >= 3 AND days_since_last_order < 60`,
        regular: `total_orders >= 1 AND days_since_last_order < 90`,
        new: `total_orders = 0 OR days_since_last_order IS NULL`,
        at_risk: `total_orders >= 1 AND days_since_last_order >= 90`,
      };
      recipientQuery += segmentMap[recipientFilter] || "1=1";
    }

    const recipientsResult = await this.pool.query(recipientQuery, params);
    const recipients = recipientsResult.rows;

    if (recipients.length === 0) {
      throw new BadRequestException("لا يوجد عملاء مطابقون للإرسال");
    }

    // Store the broadcast record
    const broadcastResult = await this.pool.query(
      `INSERT INTO notifications (merchant_id, type, title, title_ar, message, message_ar, priority, channels, data)
       VALUES ($1, $2, $3, $3, $4, $4, 'MEDIUM', '{WHATSAPP}', $5) RETURNING id`,
      [
        merchantId,
        "SYSTEM_ALERT",
        title,
        message,
        JSON.stringify({
          broadcast: true,
          type,
          recipientCount: recipients.length,
          filter: recipientFilter || "all",
        }),
      ],
    );

    // ── Send via WhatsApp ──
    let sentCount = 0;
    let failCount = 0;

    for (const recipient of recipients) {
      try {
        const waBody = `*${title}*\n\n${message}\n\n— ${senderName}`;
        await this.notificationsService.sendBroadcastWhatsApp(
          recipient.phone,
          waBody,
          merchantWhatsApp,
        );
        sentCount++;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        failCount++;
        this.logger.warn(`Failed to send to ${recipient.id}: ${error.message}`);
      }
    }

    // Audit
    await this.auditService.log({
      merchantId,
      action: "CREATE",
      resource: "SETTINGS",
      metadata: {
        broadcast: true,
        title,
        channel: "WHATSAPP",
        sentCount,
        failCount,
        recipientCount: recipients.length,
      },
      staffId: (req as any).staffId,
    });

    return {
      success: true,
      broadcastId: broadcastResult.rows[0].id,
      recipientCount: recipients.length,
      sentCount,
      failCount,
      message: `تم إرسال الرسالة إلى ${sentCount} مستلم`,
    };
  }

  @Post("notifications/test")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Send a test notification",
    description:
      "Sends a test email or WhatsApp message to verify configuration",
  })
  async sendTestNotification(
    @Req() req: Request,
    @Body() body: { channel: "EMAIL" | "WHATSAPP" | "PUSH"; target?: string },
  ): Promise<any> {
    const channel = body?.channel;
    const target = body?.target?.trim() ?? "";
    const merchantId = getMerchantId(req);

    if (!channel) {
      throw new BadRequestException("القناة مطلوبة");
    }
    if (channel !== "PUSH" && !target) {
      throw new BadRequestException("الوجهة مطلوبة");
    }

    const status = this.notificationsService.getDeliveryConfigStatus();
    if (channel === "EMAIL" && !status.smtp.configured) {
      throw new BadRequestException("SMTP غير مهيأ");
    }
    if (channel === "WHATSAPP" && !status.whatsapp.configured) {
      throw new BadRequestException("Meta WhatsApp Cloud API غير مهيأ");
    }
    if (
      channel === "PUSH" &&
      !status.push?.fcm?.configured &&
      !status.push?.apns?.configured
    ) {
      throw new BadRequestException("Push غير مهيأ");
    }

    if (channel === "EMAIL") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(target)) {
        throw new BadRequestException("البريد الإلكتروني غير صحيح");
      }
    }

    if (channel === "WHATSAPP") {
      const phoneRegex = /^\+?[1-9]\d{9,14}$/;
      if (!phoneRegex.test(target.replace(/\s/g, ""))) {
        throw new BadRequestException("رقم واتساب غير صحيح");
      }
    }

    const normalizedTarget =
      channel === "WHATSAPP" ? target?.replace(/\s/g, "") : target;
    await this.notificationsService.sendTest(
      channel,
      normalizedTarget,
      merchantId,
    );

    return { success: true, message: "تم إرسال رسالة اختبار" };
  }

  // ============== PUSH SUBSCRIPTIONS (FCM/APNS/WEB) ==============

  @Get("push-subscriptions")
  @ApiOperation({ summary: "List push subscriptions for merchant" })
  async listPushSubscriptions(@Req() req: Request): Promise<any> {
    const merchantId = getMerchantId(req);

    const result = await this.pool.query(
      `SELECT id, provider, platform, endpoint, device_token, is_active, created_at
       FROM push_subscriptions
       WHERE merchant_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [merchantId],
    );

    return { subscriptions: result.rows };
  }

  @RequireRole("AGENT")
  @Post("push-subscriptions")
  @ApiOperation({ summary: "Register a push subscription (FCM/APNS/Web Push)" })
  async registerPushSubscription(
    @Req() req: Request,
    @Body()
    body: {
      provider?: "FCM" | "APNS" | "WEB_PUSH";
      token?: string;
      platform?: string;
      userAgent?: string;
      subscription?: { endpoint: string; keys?: Record<string, string> };
      staffId?: string;
    },
  ): Promise<any> {
    const merchantId = getMerchantId(req);
    const provider = (body.provider || "FCM").toUpperCase() as
      | "FCM"
      | "APNS"
      | "WEB_PUSH";

    let endpoint = body.token?.trim() || "";
    let keys = {};
    if (provider === "WEB_PUSH") {
      if (!body.subscription?.endpoint) {
        throw new BadRequestException(
          "Web push subscription endpoint is required",
        );
      }
      endpoint = body.subscription.endpoint;
      keys = body.subscription.keys || {};
    }

    if (!endpoint) {
      throw new BadRequestException("Push token/endpoint is required");
    }

    const result = await this.pool.query(
      `INSERT INTO push_subscriptions
        (merchant_id, staff_id, endpoint, keys, user_agent, is_active, provider, platform, device_token)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)
       ON CONFLICT (endpoint) DO UPDATE SET
         merchant_id = EXCLUDED.merchant_id,
         staff_id = EXCLUDED.staff_id,
         keys = EXCLUDED.keys,
         user_agent = EXCLUDED.user_agent,
         is_active = true,
         provider = EXCLUDED.provider,
         platform = EXCLUDED.platform,
         device_token = EXCLUDED.device_token
       RETURNING id, provider, platform, endpoint, device_token, created_at`,
      [
        merchantId,
        body.staffId || null,
        endpoint,
        JSON.stringify(keys),
        body.userAgent || null,
        provider,
        body.platform || null,
        provider === "WEB_PUSH" ? null : endpoint,
      ],
    );

    return { subscription: result.rows[0] };
  }

  @RequireRole("AGENT")
  @Delete("push-subscriptions/:id")
  @ApiOperation({ summary: "Remove a push subscription" })
  async removePushSubscription(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<any> {
    const merchantId = getMerchantId(req);

    await this.pool.query(
      `UPDATE push_subscriptions SET is_active = false WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    return { success: true };
  }
}
