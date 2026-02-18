import { Injectable, Logger, Inject, OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { EVENT_TYPES, MerchantAlertedPayload } from "../event-types";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../../domain/ports/merchant.repository";

/**
 * Handles MerchantAlerted events - sends alerts to merchants
 */
@Injectable()
export class MerchantAlertHandler implements IEventHandler, OnModuleInit {
  readonly eventType = EVENT_TYPES.MERCHANT_ALERTED;
  private readonly logger = new Logger(MerchantAlertHandler.name);

  constructor(
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepository: IMerchantRepository,
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

    // Log alert details
    this.logger.log({
      message: "Merchant alert triggered",
      merchantId: payload.merchantId,
      merchantName: merchant.name,
      alertType: payload.alertType,
      alertMessage: payload.message,
      metadata: payload.metadata,
    });

    // TODO: Send actual alert via configured channel
    // Options:
    // - WhatsApp Business API notification
    // - SMS via Twilio/similar
    // - Email notification
    // - Webhook to merchant's system
    // - Push notification to merchant app

    switch (payload.alertType) {
      case "new_order":
        await this.handleNewOrderAlert(merchant, payload);
        break;
      case "escalation_needed":
        await this.handleEscalationAlert(merchant, payload);
        break;
      case "daily_report":
        await this.handleDailyReportAlert(merchant, payload);
        break;
      case "token_budget_warning":
        await this.handleBudgetWarningAlert(merchant, payload);
        break;
      case "delivery_issue":
        await this.handleDeliveryIssueAlert(merchant, payload);
        break;
      default:
        this.logger.warn({
          msg: "Unknown alert type",
          alertType: payload.alertType,
        });
    }
  }

  private async handleNewOrderAlert(
    merchant: any,
    payload: MerchantAlertedPayload,
  ): Promise<void> {
    this.logger.log({
      msg: "New order alert for merchant",
      merchantId: merchant.id,
      orderNumber: payload.metadata?.orderNumber,
      total: payload.metadata?.total,
    });
    // In production: Send notification via merchant's preferred channel
  }

  private async handleEscalationAlert(
    merchant: any,
    payload: MerchantAlertedPayload,
  ): Promise<void> {
    this.logger.warn({
      msg: "Escalation needed alert for merchant",
      merchantId: merchant.id,
      conversationId: payload.metadata?.conversationId,
      reason: payload.message,
    });
    // In production: Send urgent notification to merchant
  }

  private async handleDailyReportAlert(
    merchant: any,
    payload: MerchantAlertedPayload,
  ): Promise<void> {
    this.logger.log({
      msg: "Daily report alert for merchant",
      merchantId: merchant.id,
      stats: payload.metadata,
    });
    // In production: Send daily summary email/message
  }

  private async handleBudgetWarningAlert(
    merchant: any,
    payload: MerchantAlertedPayload,
  ): Promise<void> {
    this.logger.warn({
      msg: "Token budget warning for merchant",
      merchantId: merchant.id,
      usage: payload.metadata?.usage,
      limit: payload.metadata?.limit,
      percentage: payload.metadata?.percentage,
    });
    // In production: Notify merchant about high token usage
  }

  private async handleDeliveryIssueAlert(
    merchant: any,
    payload: MerchantAlertedPayload,
  ): Promise<void> {
    this.logger.warn({
      msg: "Delivery issue alert for merchant",
      merchantId: merchant.id,
      orderId: payload.metadata?.orderId,
      issue: payload.message,
    });
    // In production: Notify merchant about delivery problem
  }
}
