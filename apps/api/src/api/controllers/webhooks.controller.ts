import {
  Controller,
  Post,
  Body,
  Query,
  Headers,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  UseGuards,
  RawBodyRequest,
  Inject,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";
import {
  MessageDeliveryService,
  MessageDeliveryStatus,
} from "../../application/services/message-delivery.service";
import { ConfigService } from "@nestjs/config";
import {
  IMetaWhatsAppAdapter,
  META_WHATSAPP_ADAPTER,
} from "../../application/adapters/meta-whatsapp.adapter";

interface DeliveryReceiptDto {
  messageId: string;
  providerMessageId?: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
  timestamp?: string;
}

interface WhatsAppWebhookVerification {
  "hub.mode": string;
  "hub.verify_token": string;
  "hub.challenge": string;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
      field: string;
    }>;
  }>;
}

@ApiTags("Webhooks")
@Controller("v1/webhooks")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly whatsappVerifyToken: string;

  constructor(
    private readonly messageDeliveryService: MessageDeliveryService,
    private readonly configService: ConfigService,
    @Inject(META_WHATSAPP_ADAPTER)
    private readonly metaAdapter: IMetaWhatsAppAdapter,
  ) {
    this.whatsappVerifyToken = this.configService.get<string>(
      "WHATSAPP_VERIFY_TOKEN",
      "tash8eel-verify-token",
    );
  }

  private assertDevelopmentWebhookAccess(devWebhookSecret?: string): void {
    if (process.env.NODE_ENV !== "development") {
      throw new NotFoundException();
    }

    const configuredSecret =
      this.configService.get<string>("DEV_WEBHOOK_SECRET") || "";
    if (!configuredSecret) {
      this.logger.error(
        "DEV_WEBHOOK_SECRET is not configured. Rejecting legacy webhook request.",
      );
      throw new UnauthorizedException("Invalid webhook secret");
    }

    if (!devWebhookSecret || devWebhookSecret !== configuredSecret) {
      this.logger.warn(
        "Legacy webhook request rejected due to invalid dev secret",
      );
      throw new UnauthorizedException("Invalid webhook secret");
    }
  }

  private assertLegacyWebhookEnabled(): void {
    if (this.configService.get<string>("LEGACY_WEBHOOK_ENABLED") !== "true") {
      throw new NotFoundException();
    }
  }

  /**
   * Mock delivery receipt endpoint for testing
   * Can be called by Postman to simulate WhatsApp delivery receipts
   */
  @Post("delivery-receipt")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Receive delivery receipt (mock/test)",
    description:
      "Endpoint to simulate delivery status updates. Use for testing before WhatsApp integration.",
  })
  @ApiResponse({ status: 200, description: "Receipt processed" })
  @ApiResponse({ status: 400, description: "Invalid receipt data" })
  async receiveDeliveryReceipt(
    @Body() dto: DeliveryReceiptDto,
    @Headers("x-dev-webhook-secret") devWebhookSecret?: string,
  ): Promise<{ success: boolean }> {
    this.assertDevelopmentWebhookAccess(devWebhookSecret);

    if (!dto.messageId || !dto.status) {
      throw new BadRequestException("messageId and status are required");
    }

    const statusMap: Record<string, MessageDeliveryStatus> = {
      sent: "SENT",
      delivered: "DELIVERED",
      read: "READ",
      failed: "FAILED",
    };

    const status = statusMap[dto.status];
    if (!status) {
      throw new BadRequestException(
        "Invalid status. Must be: sent, delivered, read, or failed",
      );
    }

    this.logger.log({
      msg: "Received delivery receipt",
      messageId: dto.messageId,
      status: dto.status,
      providerMessageId: dto.providerMessageId,
    });

    await this.messageDeliveryService.updateDeliveryStatus({
      messageId: dto.messageId,
      status,
      providerMessageId: dto.providerMessageId,
      error: dto.error,
      provider: "mock",
    });

    return { success: true };
  }

  /**
   * WhatsApp webhook verification (GET request from Meta)
   * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
   */
  @Post("whatsapp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "WhatsApp webhook endpoint",
    description:
      "Receives delivery status updates and incoming messages from WhatsApp Business API",
  })
  async handleWhatsAppWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: WhatsAppWebhookPayload,
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") verifyToken?: string,
    @Query("hub.challenge") challenge?: string,
    @Headers("x-hub-signature-256") signature?: string,
    @Headers("x-dev-webhook-secret") devWebhookSecret?: string,
  ): Promise<string | { success: boolean }> {
    this.assertLegacyWebhookEnabled();
    this.assertDevelopmentWebhookAccess(devWebhookSecret);

    // Handle webhook verification (GET converted to POST with query params)
    if (mode === "subscribe" && verifyToken) {
      if (verifyToken !== this.whatsappVerifyToken) {
        this.logger.warn(
          "WhatsApp webhook verification failed - invalid token",
        );
        throw new UnauthorizedException("Invalid verify token");
      }
      this.logger.log("WhatsApp webhook verified");
      return challenge || "verified";
    }

    const rawBody = req.rawBody;
    if (
      !rawBody ||
      !signature ||
      !this.metaAdapter.validateSignature(signature, rawBody)
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    // Handle actual webhook payload
    if (!payload.object || payload.object !== "whatsapp_business_account") {
      throw new BadRequestException("Invalid webhook payload");
    }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // Process status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await this.processWhatsAppStatus(status);
          }
        }

        // Process incoming messages (will be handled by inbox service)
        if (value.messages) {
          for (const message of value.messages) {
            this.logger.log({
              msg: "Received WhatsApp message (not yet processed)",
              from: message.from,
              type: message.type,
              messageId: message.id,
            });
            // TODO: Route to inbox service when WhatsApp integration is complete
          }
        }
      }
    }

    return { success: true };
  }

  private async processWhatsAppStatus(status: {
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
    errors?: Array<{ code: number; title: string }>;
  }): Promise<void> {
    const statusMap: Record<string, MessageDeliveryStatus> = {
      sent: "SENT",
      delivered: "DELIVERED",
      read: "READ",
      failed: "FAILED",
    };

    const deliveryStatus = statusMap[status.status];
    if (!deliveryStatus) {
      this.logger.warn({
        msg: "Unknown WhatsApp status",
        status: status.status,
        providerMessageId: status.id,
      });
      return;
    }

    // For WhatsApp, provider_message_id is our lookup key
    // We need to find the message by provider_message_id_outbound
    // For now, log it - full implementation when WhatsApp is integrated

    this.logger.log({
      msg: "WhatsApp status update received",
      providerMessageId: status.id,
      status: status.status,
      recipientId: status.recipient_id,
      errors: status.errors,
    });

    // TODO: Look up message by provider_message_id_outbound and update status
    // This requires storing the WhatsApp message ID when we send messages
  }
}
