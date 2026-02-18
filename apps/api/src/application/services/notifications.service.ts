import { Injectable, Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  IMetaWhatsAppAdapter,
  META_WHATSAPP_ADAPTER,
} from "../adapters/meta-whatsapp.adapter";

export type NotificationType =
  | "ORDER_PLACED"
  | "ORDER_CONFIRMED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "NEW_CONVERSATION"
  | "ESCALATED_CONVERSATION"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_FAILED"
  | "NEW_REVIEW"
  | "NEW_CUSTOMER"
  | "DAILY_SUMMARY"
  | "WEEKLY_REPORT"
  | "PROMOTION_ENDING"
  | "MILESTONE_REACHED"
  | "SYSTEM_ALERT"
  | "SECURITY_ALERT"
  | "ANOMALY_ALERT";

export type NotificationChannel = "IN_APP" | "EMAIL" | "WHATSAPP" | "PUSH";
export type PushProvider = "FCM" | "APNS" | "WEB_PUSH";

export interface Notification {
  id: string;
  merchantId: string;
  staffId?: string;
  type: NotificationType;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  data?: Record<string, any>;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  channels: NotificationChannel[];
  isRead: boolean;
  readAt?: Date;
  actionUrl?: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface CreateNotificationDto {
  merchantId: string;
  staffId?: string;
  type: NotificationType;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  data?: Record<string, any>;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  channels?: NotificationChannel[];
  actionUrl?: string;
  expiresInHours?: number;
}

export interface NotificationPreferences {
  merchantId: string;
  staffId?: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  enabledTypes: NotificationType[];
  emailAddress?: string;
  whatsappNumber?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmApp: any | null | undefined;
  private apnsProvider: any | null | undefined;
  private apnsTopic: string | null = null;
  private legacyReadMode: "is_read" | "read_at" | null | undefined;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
    @Inject(META_WHATSAPP_ADAPTER)
    private readonly whatsappAdapter: IMetaWhatsAppAdapter,
  ) {}

  // ==================== DELIVERY CONFIG ====================

  getDeliveryConfigStatus() {
    const helpPath = "/merchant/onboarding#notifications-setup";
    const envDescriptions: Record<string, string> = {
      SMTP_HOST: "عنوان خادم البريد (SMTP server)",
      SMTP_PORT: "منفذ SMTP (مثال: 587)",
      SMTP_USER: "اسم المستخدم لحساب SMTP",
      SMTP_PASS: "كلمة مرور حساب SMTP",
      SMTP_FROM: "عنوان البريد المُرسل (From)",
      META_ACCESS_TOKEN: "رمز الوصول لـ Meta Cloud API (System User Token)",
      META_PHONE_NUMBER_ID: "معرف رقم الهاتف في Meta (Phone Number ID)",
      META_WABA_ID: "معرف حساب واتساب الأعمال (WABA ID)",
      FCM_SERVICE_ACCOUNT:
        "محتوى Service Account (JSON أو Base64) لإرسال إشعارات FCM",
      GOOGLE_APPLICATION_CREDENTIALS:
        "مسار ملف Service Account لإرسال إشعارات FCM",
      APNS_TEAM_ID: "Apple Team ID",
      APNS_KEY_ID: "APNs Key ID",
      APNS_BUNDLE_ID: "معرف الحزمة (Bundle ID) للتطبيق",
      APNS_PRIVATE_KEY: "محتوى مفتاح APNs الخاص (p8)",
      APNS_PRIVATE_KEY_PATH: "مسار ملف مفتاح APNs (p8)",
    };

    const smtpHost = this.configService.get<string>("SMTP_HOST");
    const smtpFrom = this.configService.get<string>("SMTP_FROM");
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPass = this.configService.get<string>("SMTP_PASS");
    const smtpPort = this.configService.get<string>("SMTP_PORT");

    const metaToken = this.configService.get<string>("META_ACCESS_TOKEN");
    const metaPhoneNumberId = this.configService.get<string>(
      "META_PHONE_NUMBER_ID",
    );
    const metaWabaId = this.configService.get<string>("META_WABA_ID");

    const fcmServiceAccount = this.configService.get<string>(
      "FCM_SERVICE_ACCOUNT",
    );
    const googleCredentialsPath = this.configService.get<string>(
      "GOOGLE_APPLICATION_CREDENTIALS",
    );
    const apnsTeamId = this.configService.get<string>("APNS_TEAM_ID");
    const apnsKeyId = this.configService.get<string>("APNS_KEY_ID");
    const apnsBundleId = this.configService.get<string>("APNS_BUNDLE_ID");
    const apnsKey = this.configService.get<string>("APNS_PRIVATE_KEY");
    const apnsKeyPath = this.configService.get<string>("APNS_PRIVATE_KEY_PATH");

    const smtpMissing: string[] = [];
    if (!smtpHost) smtpMissing.push("SMTP_HOST");
    if (!smtpFrom) smtpMissing.push("SMTP_FROM");
    if (!smtpUser) smtpMissing.push("SMTP_USER");
    if (!smtpPass) smtpMissing.push("SMTP_PASS");
    if (!smtpPort) smtpMissing.push("SMTP_PORT");

    const whatsappMissing: string[] = [];
    if (!metaToken) whatsappMissing.push("META_ACCESS_TOKEN");
    if (!metaPhoneNumberId) whatsappMissing.push("META_PHONE_NUMBER_ID");
    if (!metaWabaId) whatsappMissing.push("META_WABA_ID");

    const fcmMissing: string[] = [];
    if (!fcmServiceAccount && !googleCredentialsPath) {
      fcmMissing.push("FCM_SERVICE_ACCOUNT");
      fcmMissing.push("GOOGLE_APPLICATION_CREDENTIALS");
    }

    const apnsMissing: string[] = [];
    if (!apnsTeamId) apnsMissing.push("APNS_TEAM_ID");
    if (!apnsKeyId) apnsMissing.push("APNS_KEY_ID");
    if (!apnsBundleId) apnsMissing.push("APNS_BUNDLE_ID");
    if (!apnsKey && !apnsKeyPath) {
      apnsMissing.push("APNS_PRIVATE_KEY");
      apnsMissing.push("APNS_PRIVATE_KEY_PATH");
    }

    return {
      smtp: {
        configured: smtpMissing.length === 0,
        missing: smtpMissing,
        missingDetails: smtpMissing.map((key) => ({
          key,
          description: envDescriptions[key] || "",
          helpPath,
        })),
        host: smtpHost || null,
        from: smtpFrom || null,
      },
      whatsapp: {
        configured: whatsappMissing.length === 0,
        missing: whatsappMissing,
        missingDetails: whatsappMissing.map((key) => ({
          key,
          description: envDescriptions[key] || "",
          helpPath,
        })),
        phoneNumberId: metaPhoneNumberId || null,
      },
      push: {
        fcm: {
          configured: fcmMissing.length === 0,
          missing: fcmMissing,
          missingDetails: fcmMissing.map((key) => ({
            key,
            description: envDescriptions[key] || "",
            helpPath,
          })),
        },
        apns: {
          configured: apnsMissing.length === 0,
          missing: apnsMissing,
          missingDetails: apnsMissing.map((key) => ({
            key,
            description: envDescriptions[key] || "",
            helpPath,
          })),
          topic: apnsBundleId || null,
        },
      },
    };
  }

  // ==================== BROADCAST SEND (uses platform infra + merchant display name) ====================

  /**
   * Send a broadcast WhatsApp message via Meta Cloud API.
   * Each merchant can have their own WhatsApp sender number configured.
   */
  async sendBroadcastWhatsApp(
    phone: string,
    message: string,
    fromNumber?: string,
  ): Promise<void> {
    const result = await this.whatsappAdapter.sendTextMessage(
      phone,
      message,
      fromNumber,
    );
    if (!result.success) {
      throw new Error(
        `WhatsApp send failed: ${result.errorMessage || result.errorCode}`,
      );
    }
    this.logger.log(
      `[BROADCAST-WA] Sent to ${phone} from ${fromNumber || "default"}`,
    );
  }

  async sendTest(
    channel: "EMAIL" | "WHATSAPP" | "PUSH",
    target?: string,
    merchantId?: string,
  ): Promise<void> {
    const effectiveMerchantId = merchantId || "test";
    const testNotification: Notification = {
      id: "test",
      merchantId: effectiveMerchantId,
      type: "SYSTEM_ALERT",
      title: "Test Notification",
      titleAr: "إشعار تجريبي",
      message: "This is a test notification to verify your setup.",
      messageAr: "هذا إشعار تجريبي للتأكد من أن الإعدادات تعمل.",
      priority: "LOW",
      channels: [channel],
      isRead: false,
      createdAt: new Date(),
    };

    if (channel === "EMAIL") {
      await this.sendEmail(target || "", testNotification);
      return;
    }
    if (channel === "WHATSAPP") {
      await this.sendWhatsApp(target || "", testNotification);
      return;
    }
    if (channel === "PUSH") {
      await this.sendPush(testNotification);
      return;
    }
  }

  // ==================== NOTIFICATIONS CRUD ====================

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const expiresAt = dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000)
      : null;
    const normalizedData = { ...(dto.data || {}) };
    const normalizedType: NotificationType =
      dto.type === "ANOMALY_ALERT" ? "SYSTEM_ALERT" : dto.type;

    if (dto.type === "ANOMALY_ALERT" && !normalizedData.alertKind) {
      normalizedData.alertKind = "ANOMALY_ALERT";
    }

    const result = await this.pool.query(
      `INSERT INTO notifications (
        merchant_id, staff_id, type, title, title_ar, message, message_ar,
        data, priority, channels, action_url, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        dto.merchantId,
        dto.staffId || null,
        normalizedType,
        dto.title,
        dto.titleAr,
        dto.message,
        dto.messageAr,
        JSON.stringify(normalizedData),
        dto.priority || "MEDIUM",
        dto.channels || ["IN_APP"],
        dto.actionUrl || null,
        expiresAt,
      ],
    );

    const notification = this.mapNotification(result.rows[0]);

    // Trigger async delivery to other channels
    this.deliverToChannels(notification).catch((err) =>
      this.logger.error("Failed to deliver notification:", err),
    );

    return notification;
  }

  async getForMerchant(
    merchantId: string,
    staffId?: string,
    options?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
      types?: NotificationType[];
    },
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const conditions = [
      "merchant_id = $1",
      "(expires_at IS NULL OR expires_at > NOW())",
    ];
    const params: any[] = [merchantId];
    let paramIndex = 2;

    if (staffId) {
      conditions.push(`(staff_id IS NULL OR staff_id = $${paramIndex})`);
      params.push(staffId);
      paramIndex++;
    }

    if (options?.unreadOnly) {
      conditions.push("is_read = false");
    }

    if (options?.types && options.types.length > 0) {
      const includesAnomaly = options.types.includes("ANOMALY_ALERT");
      const standardTypes = options.types.filter((t) => t !== "ANOMALY_ALERT");

      if (includesAnomaly && standardTypes.length > 0) {
        conditions.push(
          `(
             type = ANY($${paramIndex})
             OR (type = 'SYSTEM_ALERT' AND data->>'alertKind' = 'ANOMALY_ALERT')
           )`,
        );
        params.push(standardTypes);
        paramIndex++;
      } else if (includesAnomaly) {
        conditions.push(
          `(type = 'SYSTEM_ALERT' AND data->>'alertKind' = 'ANOMALY_ALERT')`,
        );
      } else {
        conditions.push(`type = ANY($${paramIndex})`);
        params.push(standardTypes);
        paramIndex++;
      }
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_read = false) as unread
       FROM notifications WHERE ${whereClause}`,
      params,
    );

    // Get notifications
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const result = await this.pool.query(
      `SELECT * FROM notifications 
       WHERE ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    const primaryTotal = parseInt(countResult.rows[0]?.total || "0", 10) || 0;
    const primaryUnread = parseInt(countResult.rows[0]?.unread || "0", 10) || 0;

    // Some auth contexts pass a staff identifier that does not match historical notifications.
    // Retry once without staff scoping before falling back to the legacy table.
    if (primaryTotal === 0 && staffId) {
      const merchantWide = await this.getForMerchant(
        merchantId,
        undefined,
        options,
      );
      if (merchantWide.total > 0) {
        return merchantWide;
      }
    }

    if (primaryTotal === 0) {
      const historicalConditions = conditions.filter(
        (condition) => !condition.includes("expires_at"),
      );
      const historicalWhereClause = historicalConditions.join(" AND ");
      const historicalCountResult = await this.pool.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_read = false) as unread
         FROM notifications
         WHERE ${historicalWhereClause}`,
        params,
      );
      const historicalTotal =
        parseInt(historicalCountResult.rows[0]?.total || "0", 10) || 0;
      if (historicalTotal > 0) {
        const historicalRows = await this.pool.query(
          `SELECT *
           FROM notifications
           WHERE ${historicalWhereClause}
           ORDER BY created_at DESC, id DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset],
        );
        const historicalUnread =
          parseInt(historicalCountResult.rows[0]?.unread || "0", 10) || 0;
        return {
          notifications: historicalRows.rows.map(this.mapNotification),
          total: historicalTotal,
          unreadCount: historicalUnread,
        };
      }
    }

    // Backward compatibility: some environments still write to legacy merchant_notifications.
    // If the main notifications table is empty, fall back to legacy rows so the bell/tab are not blank.
    if (primaryTotal === 0) {
      return this.getLegacyForMerchant(merchantId, options);
    }

    return {
      notifications: result.rows.map(this.mapNotification),
      total: primaryTotal,
      unreadCount: primaryUnread,
    };
  }

  async markAsRead(
    merchantId: string,
    notificationId: string,
    staffId?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND merchant_id = $2 ${staffId ? "AND (staff_id IS NULL OR staff_id = $3)" : ""}`,
      staffId
        ? [notificationId, merchantId, staffId]
        : [notificationId, merchantId],
    );

    // Best-effort legacy compatibility.
    try {
      const readMode = await this.getLegacyReadMode();
      if (readMode === "is_read") {
        await this.pool.query(
          `UPDATE merchant_notifications
           SET is_read = true
           WHERE id::text = $1 AND merchant_id = $2`,
          [notificationId, merchantId],
        );
      } else if (readMode === "read_at") {
        await this.pool.query(
          `UPDATE merchant_notifications
           SET read_at = NOW()
           WHERE id::text = $1 AND merchant_id = $2`,
          [notificationId, merchantId],
        );
      }
    } catch (error) {
      this.logger.debug(
        `Legacy markAsRead skipped: ${(error as Error).message}`,
      );
    }
  }

  async markAllAsRead(merchantId: string, staffId?: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE merchant_id = $1 AND is_read = false
      ${staffId ? "AND (staff_id IS NULL OR staff_id = $2)" : ""}
       RETURNING id`,
      staffId ? [merchantId, staffId] : [merchantId],
    );

    let legacyCount = 0;
    try {
      const readMode = await this.getLegacyReadMode();
      if (readMode === "is_read") {
        const legacyResult = await this.pool.query(
          `UPDATE merchant_notifications
           SET is_read = true
           WHERE merchant_id = $1 AND COALESCE(is_read, false) = false
           RETURNING id`,
          [merchantId],
        );
        legacyCount = legacyResult.rowCount || 0;
      } else if (readMode === "read_at") {
        const legacyResult = await this.pool.query(
          `UPDATE merchant_notifications
           SET read_at = NOW()
           WHERE merchant_id = $1 AND read_at IS NULL
           RETURNING id`,
          [merchantId],
        );
        legacyCount = legacyResult.rowCount || 0;
      }
    } catch (error) {
      this.logger.debug(
        `Legacy markAllAsRead skipped: ${(error as Error).message}`,
      );
    }

    return (result.rowCount || 0) + legacyCount;
  }

  async delete(merchantId: string, notificationId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM notifications WHERE id = $1 AND merchant_id = $2`,
      [notificationId, merchantId],
    );

    // Best-effort legacy compatibility.
    try {
      await this.pool.query(
        `DELETE FROM merchant_notifications WHERE id::text = $1 AND merchant_id = $2`,
        [notificationId, merchantId],
      );
    } catch (error) {
      this.logger.debug(`Legacy delete skipped: ${(error as Error).message}`);
    }
  }

  async deleteOld(olderThanDays = 30): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM notifications 
       WHERE created_at < NOW() - INTERVAL '${olderThanDays} days'
       RETURNING id`,
    );

    return result.rowCount || 0;
  }

  // ==================== NOTIFICATION TEMPLATES ====================

  async notifyOrderPlaced(
    merchantId: string,
    orderId: string,
    customerName: string,
    total: number,
  ): Promise<Notification> {
    return this.create({
      merchantId,
      type: "ORDER_PLACED",
      title: `New Order #${orderId.substring(0, 8)}`,
      titleAr: `طلب جديد #${orderId.substring(0, 8)}`,
      message: `${customerName} placed an order for ${total.toFixed(2)} EGP`,
      messageAr: `${customerName} قدم طلباً بقيمة ${total.toFixed(2)} جنيه`,
      data: { orderId, customerName, total },
      priority: "HIGH",
      channels: ["IN_APP", "PUSH"],
      actionUrl: `/merchant/orders/${orderId}`,
    });
  }

  async notifyLowStock(
    merchantId: string,
    productId: string,
    productName: string,
    currentStock: number,
    threshold: number,
  ): Promise<Notification> {
    return this.create({
      merchantId,
      type: "LOW_STOCK",
      title: `Low Stock Alert: ${productName}`,
      titleAr: `تنبيه انخفاض المخزون: ${productName}`,
      message: `Only ${currentStock} units left (threshold: ${threshold})`,
      messageAr: `بقي ${currentStock} وحدة فقط (الحد الأدنى: ${threshold})`,
      data: { productId, productName, currentStock, threshold },
      priority: currentStock === 0 ? "URGENT" : "HIGH",
      channels: ["IN_APP", "EMAIL"],
      actionUrl: `/merchant/inventory?search=${encodeURIComponent(productName)}`,
    });
  }

  async notifyEscalation(
    merchantId: string,
    conversationId: string,
    customerPhone: string,
    reason: string,
  ): Promise<Notification> {
    return this.create({
      merchantId,
      type: "ESCALATED_CONVERSATION",
      title: "Conversation Needs Attention",
      titleAr: "محادثة تحتاج انتباهك",
      message: `Customer ${customerPhone} conversation escalated: ${reason}`,
      messageAr: `تم تصعيد محادثة العميل ${customerPhone}: ${reason}`,
      data: { conversationId, customerPhone, reason },
      priority: "URGENT",
      channels: ["IN_APP", "PUSH", "WHATSAPP"],
      actionUrl: `/merchant/conversations/${conversationId}`,
    });
  }

  async notifyDailySummary(
    merchantId: string,
    summary: {
      ordersCount: number;
      revenue: number;
      conversations: number;
      newCustomers: number;
    },
  ): Promise<Notification> {
    return this.create({
      merchantId,
      type: "DAILY_SUMMARY",
      title: "Today's Summary",
      titleAr: "ملخص اليوم",
      message: `${summary.ordersCount} orders, ${summary.revenue.toFixed(0)} EGP revenue, ${summary.newCustomers} new customers`,
      messageAr: `${summary.ordersCount} طلبات، ${summary.revenue.toFixed(0)} جنيه إيرادات، ${summary.newCustomers} عملاء جدد`,
      data: summary,
      priority: "LOW",
      channels: ["IN_APP", "EMAIL"],
      actionUrl: "/merchant/dashboard",
      expiresInHours: 24,
    });
  }

  async notifySecurityAlert(
    merchantId: string,
    staffId: string | undefined,
    alertType: string,
    details: string,
  ): Promise<Notification> {
    return this.create({
      merchantId,
      staffId,
      type: "SECURITY_ALERT",
      title: `Security Alert: ${alertType}`,
      titleAr: `تنبيه أمني: ${alertType}`,
      message: details,
      messageAr: details,
      data: { alertType },
      priority: "URGENT",
      channels: ["IN_APP", "EMAIL", "PUSH"],
    });
  }

  /**
   * Create an anomaly detection alert notification.
   * Used by the anomaly detection cron job when unusual patterns are detected.
   */
  async notifyAnomalyDetected(
    merchantId: string,
    anomalyType: string,
    titleAr: string,
    messageAr: string,
    data?: Record<string, any>,
  ): Promise<Notification> {
    return this.create({
      merchantId,
      type: "ANOMALY_ALERT",
      title: `Anomaly Detected: ${anomalyType}`,
      titleAr,
      message: messageAr,
      messageAr,
      data: { anomalyType, ...data },
      priority: "HIGH",
      channels: ["IN_APP", "PUSH"],
      actionUrl: "/merchant/dashboard",
      expiresInHours: 48,
    });
  }

  // ==================== PREFERENCES ====================

  async getPreferences(
    merchantId: string,
    staffId?: string,
  ): Promise<NotificationPreferences | null> {
    const result = await this.pool.query(
      `SELECT * FROM notification_preferences 
       WHERE merchant_id = $1 AND (staff_id = $2 OR (staff_id IS NULL AND $2 IS NULL))`,
      [merchantId, staffId || null],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      merchantId: row.merchant_id,
      staffId: row.staff_id,
      emailEnabled: row.email_enabled,
      pushEnabled: row.push_enabled,
      whatsappEnabled: row.whatsapp_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      enabledTypes: row.enabled_types || [],
      emailAddress: row.email_address,
      whatsappNumber: row.whatsapp_number,
    };
  }

  async updatePreferences(
    merchantId: string,
    staffId: string | undefined,
    prefs: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const result = await this.pool.query(
      `INSERT INTO notification_preferences (
        merchant_id, staff_id, email_enabled, push_enabled, whatsapp_enabled,
        quiet_hours_start, quiet_hours_end, enabled_types, email_address, whatsapp_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (merchant_id, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'))
      DO UPDATE SET
        email_enabled = COALESCE($3, notification_preferences.email_enabled),
        push_enabled = COALESCE($4, notification_preferences.push_enabled),
        whatsapp_enabled = COALESCE($5, notification_preferences.whatsapp_enabled),
        quiet_hours_start = COALESCE($6, notification_preferences.quiet_hours_start),
        quiet_hours_end = COALESCE($7, notification_preferences.quiet_hours_end),
        enabled_types = COALESCE($8, notification_preferences.enabled_types),
        email_address = COALESCE($9, notification_preferences.email_address),
        whatsapp_number = COALESCE($10, notification_preferences.whatsapp_number),
        updated_at = NOW()
      RETURNING *`,
      [
        merchantId,
        staffId || null,
        prefs.emailEnabled,
        prefs.pushEnabled,
        prefs.whatsappEnabled,
        prefs.quietHoursStart,
        prefs.quietHoursEnd,
        prefs.enabledTypes,
        prefs.emailAddress,
        prefs.whatsappNumber,
      ],
    );

    const row = result.rows[0];
    return {
      merchantId: row.merchant_id,
      staffId: row.staff_id,
      emailEnabled: row.email_enabled,
      pushEnabled: row.push_enabled,
      whatsappEnabled: row.whatsapp_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      enabledTypes: row.enabled_types || [],
      emailAddress: row.email_address,
      whatsappNumber: row.whatsapp_number,
    };
  }

  // ==================== DELIVERY ====================

  private async deliverToChannels(notification: Notification): Promise<void> {
    // Check quiet hours and preferences
    const prefs = await this.getPreferences(
      notification.merchantId,
      notification.staffId,
    );

    if (prefs && this.isQuietHours(prefs)) {
      // During quiet hours, only deliver urgent notifications
      if (notification.priority !== "URGENT") {
        return;
      }
    }

    for (const channel of notification.channels) {
      if (channel === "IN_APP") continue; // Already stored in DB

      try {
        switch (channel) {
          case "EMAIL":
            if (prefs?.emailEnabled && prefs?.emailAddress) {
              await this.sendEmail(prefs.emailAddress, notification);
            }
            break;
          case "WHATSAPP":
            if (prefs?.whatsappEnabled && prefs?.whatsappNumber) {
              await this.sendWhatsApp(prefs.whatsappNumber, notification);
            }
            break;
          case "PUSH":
            if (prefs?.pushEnabled) {
              await this.sendPush(notification);
            }
            break;
        }
      } catch (error) {
        this.logger.error(
          `Failed to deliver notification via ${channel}:`,
          error,
        );
      }
    }
  }

  private isQuietHours(prefs: NotificationPreferences): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = prefs.quietHoursStart.split(":").map(Number);
    const [endHour, endMin] = prefs.quietHoursEnd.split(":").map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime < endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      // Spans midnight
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  private async sendEmail(
    email: string,
    notification: Notification,
  ): Promise<void> {
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
      this.logger.warn("[EMAIL] SMTP not configured - skipping email delivery");
      return;
    }

    let nodemailer: any;
    try {
      nodemailer = await import("nodemailer");
    } catch (error) {
      this.logger.warn(
        "[EMAIL] nodemailer not installed - skipping email delivery",
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    const portalUrl =
      this.configService.get<string>("PORTAL_BASE_URL") ||
      "http://localhost:3001";

    const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${notification.titleAr || notification.title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f6f9; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); padding:32px; text-align:center;">
              <h1 style="color:#ffffff; font-size:22px; font-weight:700; margin:0; letter-spacing:-0.5px;">
                🔔 ${notification.titleAr || notification.title}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="color:#1e293b; font-size:15px; margin:0 0 24px 0; line-height:1.8;">
                ${notification.messageAr || notification.message}
              </p>

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}/merchant/notifications"
                       style="display:inline-block; background:#6366f1; color:#ffffff; text-decoration:none; padding:12px 36px; border-radius:10px; font-size:14px; font-weight:600;">
                      عرض الإشعارات
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="color:#94a3b8; font-size:12px; margin:0;">
                رسالة آلية من منصة <strong style="color:#6366f1;">تشغيل</strong>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from,
      to: email,
      subject: `🔔 ${notification.titleAr || notification.title} | تشغيل`,
      text: `${notification.title}\n\n${notification.message}\n\n${notification.titleAr}\n${notification.messageAr}`,
      html: htmlContent,
    });
  }

  private async sendWhatsApp(
    phone: string,
    notification: Notification,
  ): Promise<void> {
    const body = `${notification.titleAr}\n${notification.messageAr}`;
    const result = await this.whatsappAdapter.sendTextMessage(phone, body);
    if (!result.success) {
      this.logger.error(
        `[WHATSAPP] Failed to send: ${result.errorMessage || result.errorCode}`,
      );
    }
  }

  private async sendPush(notification: Notification): Promise<void> {
    const subscriptions = await this.pool.query(
      `SELECT id, endpoint, keys, provider, platform, device_token, staff_id
       FROM push_subscriptions
       WHERE merchant_id = $1 AND is_active = true
         AND ($2::uuid IS NULL OR staff_id IS NULL OR staff_id = $2)`,
      [notification.merchantId, notification.staffId || null],
    );

    if (subscriptions.rows.length === 0) {
      return;
    }

    for (const sub of subscriptions.rows) {
      const provider = (sub.provider || "WEB_PUSH") as PushProvider;
      try {
        if (provider === "FCM") {
          await this.sendFcmPush(
            sub.endpoint || sub.device_token,
            notification,
          );
        } else if (provider === "APNS") {
          await this.sendApnsPush(
            sub.endpoint || sub.device_token,
            notification,
          );
        } else {
          this.logger.warn(
            `[PUSH] Unsupported provider ${provider}, skipping.`,
          );
          continue;
        }

        await this.pool.query(
          `UPDATE push_subscriptions 
           SET last_used_at = NOW(), failed_attempts = 0
           WHERE id = $1`,
          [sub.id],
        );
      } catch (error) {
        this.logger.error(`[PUSH] Failed to send (${provider})`, error);
        await this.pool.query(
          `UPDATE push_subscriptions
           SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
               is_active = CASE WHEN COALESCE(failed_attempts, 0) + 1 >= 3 THEN false ELSE is_active END
           WHERE id = $1`,
          [sub.id],
        );
      }
    }
  }

  private async sendFcmPush(
    token: string,
    notification: Notification,
  ): Promise<void> {
    if (!token) return;
    const admin = await this.getFirebaseAdmin();
    if (!admin) {
      this.logger.warn("[PUSH] FCM not configured - skipping");
      return;
    }

    const message = {
      token,
      notification: {
        title: notification.titleAr || notification.title,
        body: notification.messageAr || notification.message,
      },
      data: {
        notificationId: notification.id,
        actionUrl: notification.actionUrl || "",
        type: notification.type,
      },
    };

    await admin.messaging().send(message);
  }

  private async sendApnsPush(
    token: string,
    notification: Notification,
  ): Promise<void> {
    if (!token) return;
    const apnProvider = await this.getApnsProvider();
    const topic = this.apnsTopic;
    if (!apnProvider || !topic) {
      this.logger.warn("[PUSH] APNS not configured - skipping");
      return;
    }

    const apnModule = await import("@parse/node-apn");
    const Apn = (apnModule as any).default || apnModule;
    const note = new Apn.Notification();
    note.topic = topic;
    note.alert = {
      title: notification.titleAr || notification.title,
      body: notification.messageAr || notification.message,
    };
    note.payload = {
      notificationId: notification.id,
      actionUrl: notification.actionUrl || "",
      type: notification.type,
    };

    const result = await apnProvider.send(note, token);
    if (result.failed && result.failed.length > 0) {
      const first = result.failed[0];
      const reason =
        first?.response?.reason || first?.error?.message || "APNS failed";
      throw new Error(reason);
    }
  }

  private async getFirebaseAdmin(): Promise<any | null> {
    if (this.fcmApp !== undefined) {
      return this.fcmApp;
    }

    const serviceAccountRaw = this.configService.get<string>(
      "FCM_SERVICE_ACCOUNT",
    );
    const credentialsPath = this.configService.get<string>(
      "GOOGLE_APPLICATION_CREDENTIALS",
    );

    if (!serviceAccountRaw && !credentialsPath) {
      this.fcmApp = null;
      return null;
    }

    try {
      const module = await import("firebase-admin");
      const admin = (module as any).default || module;
      if (admin.apps?.length) {
        this.fcmApp = admin.app();
        return this.fcmApp;
      }

      let credential;
      if (serviceAccountRaw) {
        const parsed = this.parseJsonOrBase64(serviceAccountRaw);
        credential = admin.credential.cert(parsed);
      } else {
        credential = admin.credential.applicationDefault();
      }

      this.fcmApp = admin.initializeApp({ credential });
      return this.fcmApp;
    } catch (error) {
      this.logger.error("[PUSH] Failed to initialize FCM", error);
      this.fcmApp = null;
      return null;
    }
  }

  private async getApnsProvider(): Promise<any | null> {
    if (this.apnsProvider !== undefined) {
      return this.apnsProvider;
    }

    const teamId = this.configService.get<string>("APNS_TEAM_ID");
    const keyId = this.configService.get<string>("APNS_KEY_ID");
    const bundleId = this.configService.get<string>("APNS_BUNDLE_ID");
    const keyInline = this.configService.get<string>("APNS_PRIVATE_KEY");
    const keyPath = this.configService.get<string>("APNS_PRIVATE_KEY_PATH");
    const production =
      this.configService.get<string>("APNS_PRODUCTION", "false") === "true";

    if (!teamId || !keyId || !bundleId || (!keyInline && !keyPath)) {
      this.apnsProvider = null;
      this.apnsTopic = null;
      return null;
    }

    try {
      const apnModule = await import("@parse/node-apn");
      const Apn = (apnModule as any).default || apnModule;
      const key = keyInline
        ? this.normalizePrivateKey(keyInline)
        : readFileSync(keyPath!, "utf8");

      this.apnsProvider = new Apn.Provider({
        token: { key, keyId, teamId },
        production,
      });
      this.apnsTopic = bundleId;
      return this.apnsProvider;
    } catch (error) {
      this.logger.error("[PUSH] Failed to initialize APNS", error);
      this.apnsProvider = null;
      this.apnsTopic = null;
      return null;
    }
  }

  private parseJsonOrBase64(raw: string): Record<string, any> {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      return JSON.parse(trimmed);
    }
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return JSON.parse(decoded);
  }

  private normalizePrivateKey(raw: string): string {
    if (raw.includes("BEGIN PRIVATE KEY")) return raw;
    return raw.replace(/\\n/g, "\n");
  }

  private async getLegacyReadMode(): Promise<"is_read" | "read_at" | null> {
    if (this.legacyReadMode !== undefined) {
      return this.legacyReadMode;
    }

    try {
      const columnsResult = await this.pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'merchant_notifications'
           AND column_name IN ('is_read', 'read_at')`,
      );
      const columns = new Set(columnsResult.rows.map((row) => row.column_name));

      if (columns.has("is_read")) {
        this.legacyReadMode = "is_read";
      } else if (columns.has("read_at")) {
        this.legacyReadMode = "read_at";
      } else {
        this.legacyReadMode = null;
      }
    } catch (error) {
      this.logger.debug(
        `Legacy read mode lookup failed: ${(error as Error).message}`,
      );
      this.legacyReadMode = null;
    }

    return this.legacyReadMode;
  }

  private async getLegacyForMerchant(
    merchantId: string,
    options?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
      types?: NotificationType[];
    },
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    try {
      const readMode = await this.getLegacyReadMode();
      if (!readMode) {
        return { notifications: [], total: 0, unreadCount: 0 };
      }

      const unreadPredicate =
        readMode === "is_read"
          ? "COALESCE(is_read, false) = false"
          : "read_at IS NULL";
      const readSelect =
        readMode === "is_read"
          ? "COALESCE(is_read, false) as is_read"
          : "(read_at IS NOT NULL) as is_read";
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;
      const whereConditions = ["merchant_id = $1"];
      const whereParams: any[] = [merchantId];
      const whereIndex = 2;

      if (options?.unreadOnly) {
        whereConditions.push(unreadPredicate);
      }

      const whereClause = whereConditions.join(" AND ");

      if (options?.types && options.types.length > 0) {
        const allRows = await this.pool.query(
          `SELECT id::text as id, merchant_id, type, title, message, metadata, ${readSelect}, created_at
           FROM merchant_notifications
           WHERE ${whereClause}
           ORDER BY created_at DESC, id DESC`,
          whereParams,
        );

        const typed = allRows.rows
          .map((row) => this.mapLegacyNotification(row))
          .filter((notification) => options.types!.includes(notification.type));

        return {
          notifications: typed.slice(offset, offset + limit),
          total: typed.length,
          unreadCount: typed.filter((notification) => !notification.isRead)
            .length,
        };
      }

      const countResult = await this.pool.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE ${unreadPredicate}) as unread
         FROM merchant_notifications
         WHERE ${whereClause}`,
        whereParams,
      );

      const rowsResult = await this.pool.query(
        `SELECT id::text as id, merchant_id, type, title, message, metadata, ${readSelect}, created_at
         FROM merchant_notifications
         WHERE ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT $${whereIndex} OFFSET $${whereIndex + 1}`,
        [...whereParams, limit, offset],
      );

      return {
        notifications: rowsResult.rows.map((row) =>
          this.mapLegacyNotification(row),
        ),
        total: parseInt(countResult.rows[0]?.total || "0", 10) || 0,
        unreadCount: parseInt(countResult.rows[0]?.unread || "0", 10) || 0,
      };
    } catch (error) {
      // Legacy table may not exist in newer schemas.
      this.logger.debug(
        `Legacy notifications fallback unavailable: ${(error as Error).message}`,
      );
      return { notifications: [], total: 0, unreadCount: 0 };
    }
  }

  private normalizeLegacyType(rawType: unknown): NotificationType {
    const normalized = String(rawType || "")
      .trim()
      .toUpperCase();
    const directTypes: NotificationType[] = [
      "ORDER_PLACED",
      "ORDER_CONFIRMED",
      "ORDER_SHIPPED",
      "ORDER_DELIVERED",
      "LOW_STOCK",
      "OUT_OF_STOCK",
      "NEW_CONVERSATION",
      "ESCALATED_CONVERSATION",
      "PAYMENT_RECEIVED",
      "PAYMENT_FAILED",
      "NEW_REVIEW",
      "NEW_CUSTOMER",
      "DAILY_SUMMARY",
      "WEEKLY_REPORT",
      "PROMOTION_ENDING",
      "MILESTONE_REACHED",
      "SYSTEM_ALERT",
      "SECURITY_ALERT",
      "ANOMALY_ALERT",
    ];
    if ((directTypes as string[]).includes(normalized)) {
      return normalized as NotificationType;
    }

    if (normalized === "ORDER" || normalized === "NEW_ORDER")
      return "ORDER_PLACED";
    if (normalized === "INVENTORY") return "LOW_STOCK";
    if (normalized === "PAYMENT") return "PAYMENT_RECEIVED";
    if (normalized === "DAILY_REPORT") return "DAILY_SUMMARY";

    return "SYSTEM_ALERT";
  }

  private mapLegacyNotification(row: any): Notification {
    const type = this.normalizeLegacyType(row.type);
    const metadata =
      typeof row.metadata === "string"
        ? (() => {
            try {
              return JSON.parse(row.metadata);
            } catch {
              return {};
            }
          })()
        : row.metadata || {};

    const priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" =
      type === "SECURITY_ALERT"
        ? "URGENT"
        : type === "ORDER_PLACED"
          ? "HIGH"
          : type === "LOW_STOCK" || type === "PAYMENT_RECEIVED"
            ? "MEDIUM"
            : "LOW";

    return {
      id: row.id,
      merchantId: row.merchant_id,
      staffId: undefined,
      type,
      title: row.title || "Notification",
      titleAr: row.title || "إشعار",
      message: row.message || "",
      messageAr: row.message || "",
      data: metadata,
      priority,
      channels: ["IN_APP"],
      isRead: !!row.is_read,
      readAt: row.is_read ? row.created_at : undefined,
      actionUrl: metadata?.actionUrl || metadata?.url || undefined,
      expiresAt: undefined,
      createdAt: row.created_at,
    };
  }

  // ==================== HELPERS ====================

  private mapNotification(row: any): Notification {
    const mappedType: NotificationType =
      row.type === "SYSTEM_ALERT" && row.data?.alertKind === "ANOMALY_ALERT"
        ? "ANOMALY_ALERT"
        : row.type;

    return {
      id: row.id,
      merchantId: row.merchant_id,
      staffId: row.staff_id,
      type: mappedType,
      title: row.title,
      titleAr: row.title_ar,
      message: row.message,
      messageAr: row.message_ar,
      data: row.data || {},
      priority: row.priority,
      channels: row.channels,
      isRead: row.is_read,
      readAt: row.read_at,
      actionUrl: row.action_url,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}
