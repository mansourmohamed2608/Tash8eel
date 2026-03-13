import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MessageDeliveryService } from "../services/message-delivery.service";
import {
  IMetaWhatsAppAdapter,
  META_WHATSAPP_ADAPTER,
} from "../adapters/meta-whatsapp.adapter";

/**
 * Message Delivery Retry Worker
 *
 * Processes queued messages and retries failed deliveries with exponential backoff.
 * Uses Meta WhatsApp Cloud API delivery and retries failed attempts.
 */
@Injectable()
export class MessageDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageDeliveryWorker.name);
  private isProcessing = false;
  private isShuttingDown = false;

  constructor(
    private readonly messageDeliveryService: MessageDeliveryService,
    @Inject(META_WHATSAPP_ADAPTER)
    private readonly whatsappAdapter: IMetaWhatsAppAdapter,
  ) {}

  onModuleInit() {
    this.logger.log("Message delivery worker initialized");
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
    this.logger.log("Message delivery worker shutting down");
  }

  /**
   * Process pending messages every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processMessageQueue(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }

    this.isProcessing = true;

    try {
      const messages =
        await this.messageDeliveryService.getMessagesForDelivery(20);

      if (messages.length === 0) {
        return;
      }

      this.logger.log({
        msg: "Processing message queue",
        count: messages.length,
      });

      for (const message of messages) {
        if (this.isShuttingDown) break;

        try {
          await this.deliverMessage(message);
        } catch (error) {
          this.logger.error({
            msg: "Failed to deliver message",
            messageId: message.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          await this.messageDeliveryService.scheduleRetry(
            message.id,
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }
    } catch (error) {
      this.logger.error({
        msg: "Error processing message queue",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Deliver a single message
   * Sends via Meta WhatsApp Cloud API adapter
   */
  private async deliverMessage(message: {
    id: string;
    merchantId: string;
    recipientId: string;
    text: string;
    retryCount: number;
  }): Promise<void> {
    const sendResult = await this.whatsappAdapter.sendTextMessage(
      message.recipientId,
      message.text,
    );

    if (!sendResult.success) {
      const hardFail = sendResult.errorCode === "NO_CREDENTIALS";
      await this.messageDeliveryService.updateDeliveryStatus({
        messageId: message.id,
        status: "FAILED",
        providerMessageId: sendResult.messageId,
        provider: "meta",
        error: sendResult.errorMessage || "Failed to send message",
      });
      if (!hardFail) {
        throw new Error(sendResult.errorMessage || "Failed to send message");
      }
      return;
    }

    await this.messageDeliveryService.updateDeliveryStatus({
      messageId: message.id,
      status: "SENT",
      providerMessageId: sendResult.messageId,
      provider: "meta",
    });

    this.logger.debug({
      msg: "Message sent via Meta Cloud API",
      messageId: message.id,
      recipient: message.recipientId,
      providerMessageId: sendResult.messageId,
    });
  }
}
