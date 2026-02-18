import { Injectable, Logger, Inject, OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { EVENT_TYPES, MerchantAlertedPayload } from "../event-types";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../../domain/ports/merchant.repository";
import {
  NotificationsService,
  NotificationChannel,
} from "../../services/notifications.service";

/**
 * Handles MerchantAlerted events - sends alerts to merchants
 * via in-app notification + WhatsApp (when configured).
 */
@Injectable()
export class MerchantAlertHandler implements IEventHandler, OnModuleInit {
  readonly eventType = EVENT_TYPES.MERCHANT_ALERTED;
  private readonly logger = new Logger(MerchantAlertHandler.name);

  constructor(
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepository: IMerchantRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.eventHandlerRegistry.registerHandler(this);
  }

  async handle(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as MerchantAlertedPayload;

    this.logger.log({
      msg: "Processing MerchantAlerted event",
      eventId: event.id,
      merchantId: payload.merchantId,
      alertType: payload.alertType,
    });

    // Get merchant
    const merchant = await this.merchantRepository.findById(payload.merchantId);

    if (!merchant) {
      this.logger.warn({
        message: "Merchant not found for alert",
        merchantId: payload.merchantId,
      });
      return;
    }

    // Determine priority & channels based on alert type
    const { priority, channels, titleAr, messageAr } =
      this.resolveAlertConfig(payload);

    // Send via notifications service (in-app + WhatsApp + email as configured)
    try {
      await this.notificationsService.create({
        merchantId: payload.merchantId,
        type: this.mapAlertTypeToNotificationType(payload.alertType),
        title: `[${payload.alertType}] ${payload.message.substring(0, 80)}`,
        titleAr,
        message: payload.message,
        messageAr,
        data: { alertType: payload.alertType, ...(payload.metadata || {}) },
        priority,
        channels,
        actionUrl: this.getActionUrl(payload),
      });

      this.logger.log({
        msg: "Merchant alert delivered",
        merchantId: payload.merchantId,
        alertType: payload.alertType,
        channels,
      });
    } catch (err) {
      this.logger.error({
        msg: "Failed to deliver merchant alert",
        merchantId: payload.merchantId,
        alertType: payload.alertType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private resolveAlertConfig(payload: MerchantAlertedPayload): {
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    channels: NotificationChannel[];
    titleAr: string;
    messageAr: string;
  } {
    switch (payload.alertType) {
      case "new_order":
        return {
          priority: "MEDIUM",
          channels: ["IN_APP", "WHATSAPP"],
          titleAr: `🛒 طلب جديد #${payload.metadata?.orderNumber || ""}`,
          messageAr: `تم استلام طلب جديد بقيمة ${payload.metadata?.total || 0} ج.م`,
        };
      case "escalation_needed":
        return {
          priority: "URGENT",
          channels: ["IN_APP", "WHATSAPP"],
          titleAr: "🔴 محادثة تحتاج تدخلك فوراً",
          messageAr:
            payload.message || "عميل محتاج مساعدة عاجلة — ادخل شوف المحادثة",
        };
      case "daily_report":
        return {
          priority: "LOW",
          channels: ["IN_APP", "EMAIL"],
          titleAr: "📊 التقرير اليومي جاهز",
          messageAr: payload.message || "ملخص أداء اليوم جاهز للمراجعة",
        };
      case "token_budget_warning":
        return {
          priority: "HIGH",
          channels: ["IN_APP"],
          titleAr: "⚠️ تحذير استهلاك AI",
          messageAr: `تم استخدام ${payload.metadata?.percentage || 0}% من حصة AI اليومية`,
        };
      case "delivery_issue":
        return {
          priority: "HIGH",
          channels: ["IN_APP", "WHATSAPP"],
          titleAr: "🚚 مشكلة في التوصيل",
          messageAr: payload.message || "فيه مشكلة في توصيل أحد الطلبات",
        };
      default:
        return {
          priority: "MEDIUM",
          channels: ["IN_APP"],
          titleAr: `تنبيه: ${payload.alertType}`,
          messageAr: payload.message || "تنبيه من النظام",
        };
    }
  }

  private mapAlertTypeToNotificationType(alertType: string): any {
    const map: Record<string, string> = {
      new_order: "ORDER_PLACED",
      escalation_needed: "ESCALATED_CONVERSATION",
      daily_report: "DAILY_SUMMARY",
      token_budget_warning: "SYSTEM_ALERT",
      delivery_issue: "SYSTEM_ALERT",
    };
    return map[alertType] || "SYSTEM_ALERT";
  }

  private getActionUrl(payload: MerchantAlertedPayload): string | undefined {
    switch (payload.alertType) {
      case "new_order":
        return payload.metadata?.orderId
          ? `/merchant/orders?id=${payload.metadata.orderId}`
          : "/merchant/orders";
      case "escalation_needed":
        return payload.metadata?.conversationId
          ? `/merchant/conversations?id=${payload.metadata.conversationId}`
          : "/merchant/conversations";
      case "daily_report":
        return "/merchant/dashboard";
      case "delivery_issue":
        return "/merchant/delivery-drivers";
      default:
        return undefined;
    }
  }
}
