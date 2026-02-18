import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
  BadRequestException,
  RawBodyRequest,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeEndpoint,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { ConfigService } from "@nestjs/config";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { InboxService } from "../../application/services/inbox.service";
import { ProductOcrService } from "../../application/services/product-ocr.service";
import {
  IMetaWhatsAppAdapter,
  META_WHATSAPP_ADAPTER,
  MetaWebhookPayload,
  ParsedWhatsAppMessage,
} from "../../application/adapters/meta-whatsapp.adapter";
import { TranscriptionAdapterFactory } from "../../application/adapters/transcription.adapter";
import { CopilotAiService } from "../../application/llm/copilot-ai.service";
import { CopilotDispatcherService } from "../../application/llm/copilot-dispatcher.service";
import { DriverStatusService } from "../../application/services/driver-status.service";

@ApiTags("Webhooks")
@Controller("v1/webhooks/meta")
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(META_WHATSAPP_ADAPTER)
    private readonly metaAdapter: IMetaWhatsAppAdapter,
    private readonly inboxService: InboxService,
    private readonly driverStatusService: DriverStatusService,
    private readonly transcriptionFactory: TranscriptionAdapterFactory,
    private readonly productOcrService: ProductOcrService,
    private readonly copilotAiService: CopilotAiService,
    private readonly copilotDispatcher: CopilotDispatcherService,
  ) {}

  // ============================================================================
  // WEBHOOK VERIFICATION (GET)
  // Meta sends: hub.mode, hub.verify_token, hub.challenge
  // We must respond with the challenge integer to verify
  // ============================================================================

  @Get("whatsapp")
  @ApiOperation({
    summary: "Meta WhatsApp webhook verification",
    description:
      "Responds to Meta webhook verification challenge (subscribe handshake)",
  })
  @ApiResponse({ status: 200, description: "Challenge accepted" })
  @ApiResponse({ status: 403, description: "Verification failed" })
  handleWebhookVerification(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") verifyToken: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ): void {
    this.logger.log({ msg: "Meta webhook verification request", mode });

    const result = this.metaAdapter.verifyWebhook(mode, verifyToken, challenge);

    if (result !== null) {
      res.status(200).send(result);
    } else {
      res.status(403).send("Verification failed");
    }
  }

  // ============================================================================
  // INBOUND MESSAGES (POST)
  // Meta POSTs JSON with X-Hub-Signature-256 header
  // ============================================================================

  @Post("whatsapp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Meta WhatsApp webhook endpoint",
    description:
      "Receives incoming WhatsApp messages and status updates from Meta Cloud API.",
  })
  @ApiResponse({ status: 200, description: "Webhook processed" })
  @ApiResponse({ status: 401, description: "Invalid webhook signature" })
  async handleWhatsAppWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers("x-hub-signature-256") signature: string,
  ): Promise<void> {
    const correlationId = uuidv4();
    const startTime = Date.now();

    this.logger.log({
      msg: "Meta WhatsApp webhook received",
      correlationId,
      contentType: req.headers["content-type"],
    });

    try {
      // Validate signature using raw body
      const rawBody = req.rawBody;
      if (rawBody && !this.metaAdapter.validateSignature(signature, rawBody)) {
        this.logger.warn({
          msg: "Invalid Meta webhook signature",
          correlationId,
        });
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      const payload = req.body as MetaWebhookPayload;

      // Meta requires immediate 200 to avoid retries
      // We acknowledge first, then process asynchronously
      res.status(200).json({ status: "ok" });

      // Check for status updates
      const statuses = this.metaAdapter.parseStatusUpdates(payload);
      for (const status of statuses) {
        await this.processStatusUpdate(status, correlationId);
      }

      // Parse inbound message
      const parsed = this.metaAdapter.parseWebhook(payload);
      if (!parsed) {
        this.logger.debug({
          msg: "No inbound message in webhook (status-only or unsupported)",
          correlationId,
        });
        return;
      }

      this.logger.log({
        msg: "Parsed Meta message",
        correlationId,
        messageId: parsed.messageId,
        from: parsed.fromNumber,
        to: parsed.toNumber,
        phoneNumberId: parsed.phoneNumberId,
        hasMedia: parsed.hasMedia,
        isVoiceNote: parsed.isVoiceNote,
        hasLocation: parsed.hasLocation,
        bodyLength: parsed.body.length,
      });

      // Look up merchant by phone_number_id first, then by phone number
      let merchantMapping = await this.metaAdapter.getMerchantByPhoneNumberId(
        parsed.phoneNumberId,
      );
      if (!merchantMapping) {
        merchantMapping = await this.metaAdapter.getMerchantByWhatsAppNumber(
          parsed.toNumber,
        );
      }

      if (!merchantMapping) {
        this.logger.warn({
          msg: "No merchant found for phone number",
          correlationId,
          phoneNumberId: parsed.phoneNumberId,
          toNumber: parsed.toNumber,
        });
        await this.metaAdapter.logInboundMessage(parsed);
        return;
      }

      const merchantId = merchantMapping.merchantId;
      this.logger.log({
        msg: "Merchant found",
        correlationId,
        merchantId,
        displayName: merchantMapping.displayName,
      });

      const driverStatus = await this.driverStatusService.processDriverMessage({
        merchantId,
        senderId: parsed.fromNumber,
        text: parsed.body,
      });

      if (driverStatus.handled) {
        if (
          driverStatus.customerNotification?.phone &&
          driverStatus.customerNotification?.message
        ) {
          const customerSend = await this.metaAdapter.sendTextMessage(
            driverStatus.customerNotification.phone,
            driverStatus.customerNotification.message,
            parsed.phoneNumberId,
          );

          if (!customerSend.success) {
            this.logger.warn({
              msg: "Failed to send customer confirmation from driver update",
              correlationId,
              orderId: driverStatus.orderId,
              customerPhone: driverStatus.customerNotification.phone,
              errorCode: customerSend.errorCode,
              errorMessage: customerSend.errorMessage,
            });
          }
        }

        const driverReply =
          driverStatus.driverReply || "تم استلام تحديث الحالة.";
        const replySend = await this.metaAdapter.sendTextMessage(
          parsed.fromNumber,
          driverReply,
          parsed.phoneNumberId,
        );

        if (!replySend.success) {
          this.logger.warn({
            msg: "Failed to send driver status reply",
            correlationId,
            orderId: driverStatus.orderId,
            errorCode: replySend.errorCode,
            errorMessage: replySend.errorMessage,
          });
        }

        return;
      }

      // Process the message
      let effectiveText = parsed.body;
      let transcriptionResult: any;

      // Handle voice note transcription
      if (parsed.isVoiceNote && parsed.audioMediaId) {
        try {
          transcriptionResult = await this.processVoiceNote(
            parsed,
            merchantId,
            correlationId,
          );
          effectiveText = transcriptionResult.text;
          this.logger.log({
            msg: "Voice note transcribed",
            correlationId,
            transcribedText: effectiveText.substring(0, 100),
            confidence: transcriptionResult.confidence,
          });
        } catch (error) {
          this.logger.error({
            msg: "Voice note transcription failed",
            correlationId,
            error: (error as Error).message,
          });
          effectiveText = "[صوتية]";
        }
      }

      // Handle location messages
      let locationData: any;
      if (parsed.hasLocation) {
        locationData = this.extractLocationData(parsed);
        if (!effectiveText || effectiveText.trim() === "") {
          effectiveText = `📍 موقعي: ${locationData?.lat}, ${locationData?.lng}`;
        }
      }

      // Handle product image OCR
      let productOcrHandled = false;
      if (parsed.hasMedia && !parsed.isVoiceNote) {
        const imageIndex = parsed.mediaContentTypes.findIndex((type) =>
          this.productOcrService.isProcessableImage(type),
        );

        if (imageIndex !== -1) {
          const imageMediaId = parsed.mediaIds[imageIndex];
          this.logger.log({
            msg: "Processing product image from WhatsApp",
            correlationId,
            imageContentType: parsed.mediaContentTypes[imageIndex],
          });

          try {
            // Download image first (Meta requires media ID download)
            const { buffer } =
              await this.metaAdapter.downloadMedia(imageMediaId);
            // Convert to data URL for OCR service
            const base64 = buffer.toString("base64");
            const dataUrl = `data:${parsed.mediaContentTypes[imageIndex]};base64,${base64}`;

            const conversation = await this.getOrCreateConversation(
              merchantId,
              parsed.fromNumber,
            );
            const ocrResult = await this.productOcrService.processProductImage(
              dataUrl,
              merchantId,
              parsed.fromNumber,
              conversation?.id,
              merchantMapping.displayName,
            );

            if (ocrResult.success && ocrResult.confirmationMessage) {
              await this.metaAdapter.sendTextMessage(
                parsed.fromNumber,
                ocrResult.confirmationMessage,
                parsed.phoneNumberId,
              );
              productOcrHandled = true;
              return;
            } else if (!ocrResult.success) {
              effectiveText = effectiveText || "";
              if (effectiveText) effectiveText += "\n\n";
              effectiveText += "[📷 صورة - لم نتمكن من التعرف على المنتج]";
            }
          } catch (error) {
            this.logger.error({
              msg: "Product OCR processing failed",
              correlationId,
              error: (error as Error).message,
            });
          }
        }
      }

      // Check for pending OCR confirmation response
      if (!productOcrHandled && effectiveText) {
        const confirmationResponse =
          await this.productOcrService.handleConfirmationResponse(
            merchantId,
            parsed.fromNumber,
            effectiveText,
          );

        if (confirmationResponse.handled) {
          if (confirmationResponse.selectedItem) {
            effectiveText = `أريد ${confirmationResponse.selectedItem.name || confirmationResponse.selectedItem.nameAr}`;
          } else if (confirmationResponse.message) {
            await this.metaAdapter.sendTextMessage(
              parsed.fromNumber,
              confirmationResponse.message,
              parsed.phoneNumberId,
            );
            return;
          }
        }
      }

      // Log inbound message
      await this.metaAdapter.logInboundMessage(parsed);

      // Process via inbox service
      const inboxResponse = await this.inboxService.processMessage({
        merchantId,
        senderId: parsed.fromNumber,
        text: effectiveText,
        correlationId,
      });

      this.logger.log({
        msg: "Inbox response generated",
        correlationId,
        conversationId: inboxResponse.conversationId,
        action: inboxResponse.action,
        replyLength: inboxResponse.replyText.length,
        duration: Date.now() - startTime,
      });

      // Send reply via Meta
      const sendResult = await this.metaAdapter.sendTextMessage(
        parsed.fromNumber,
        inboxResponse.replyText,
        parsed.phoneNumberId,
      );

      if (!sendResult.success) {
        this.logger.error({
          msg: "Failed to send reply via Meta",
          correlationId,
          errorCode: sendResult.errorCode,
          errorMessage: sendResult.errorMessage,
        });
      } else {
        this.logger.log({
          msg: "Reply sent successfully",
          correlationId,
          messageId: sendResult.messageId,
        });
      }
    } catch (error) {
      this.logger.error({
        msg: "Error processing Meta webhook",
        correlationId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      // Already sent 200 above, so just log
    }
  }

  // ============================================================================
  // STATUS UPDATE PROCESSOR
  // ============================================================================

  private async processStatusUpdate(
    status: {
      id: string;
      status: string;
      errors?: any[];
      recipient_id?: string;
    },
    correlationId: string,
  ): Promise<void> {
    this.logger.log({
      msg: "Meta status update",
      correlationId,
      waMessageId: status.id,
      status: status.status,
    });

    const errorCode = status.errors?.[0]?.code?.toString();
    const errorMsg = status.errors?.[0]?.title;

    await this.metaAdapter.updateMessageStatus(
      status.id,
      status.status,
      errorCode,
      errorMsg,
      status,
    );

    // Update messages table delivery status
    if (status.status === "delivered" || status.status === "read") {
      await this.updateMessageDeliveryStatus(
        status.id,
        status.status.toUpperCase(),
      );
    } else if (status.status === "failed") {
      await this.updateMessageDeliveryStatus(status.id, "FAILED");
    }
  }

  // ============================================================================
  // VOICE NOTE PROCESSING
  // ============================================================================

  private async processVoiceNote(
    parsed: ParsedWhatsAppMessage,
    merchantId: string,
    correlationId: string,
  ): Promise<{ text: string; confidence: number; duration: number }> {
    if (!parsed.audioMediaId) {
      throw new BadRequestException("No audio media ID provided");
    }

    // Download audio from Meta
    const { buffer, contentType } = await this.metaAdapter.downloadMedia(
      parsed.audioMediaId,
    );

    this.logger.debug({
      msg: "Audio downloaded for transcription",
      correlationId,
      size: buffer.length,
      contentType,
    });

    const adapter = this.transcriptionFactory.getAdapter();
    const startTranscription = Date.now();
    const result = await adapter.transcribe(buffer, { language: "ar" });
    const processingTime = Date.now() - startTranscription;

    // Store transcription
    await this.storeTranscription({
      conversationId: "",
      merchantId,
      provider: "whisper",
      mediaId: parsed.audioMediaId,
      contentType,
      duration: result.duration,
      transcript: result.text,
      confidence: result.confidence,
      language: result.language,
      segments: result.segments,
      processingTime,
    });

    return {
      text: result.text,
      confidence: result.confidence,
      duration: result.duration,
    };
  }

  private async storeTranscription(data: {
    conversationId: string;
    merchantId: string;
    provider: string;
    mediaId: string;
    contentType: string;
    duration: number;
    transcript: string;
    confidence: number;
    language: string;
    segments?: any[];
    processingTime: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO voice_transcriptions (
        conversation_id, merchant_id, provider, original_media_url,
        media_content_type, duration_seconds, transcript, confidence,
        language, segments, processing_time_ms, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed')`,
      [
        data.conversationId || "pending",
        data.merchantId,
        data.provider,
        `meta://media/${data.mediaId}`,
        data.contentType,
        data.duration,
        data.transcript,
        data.confidence,
        data.language,
        data.segments ? JSON.stringify(data.segments) : null,
        data.processingTime,
      ],
    );
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private extractLocationData(
    parsed: ParsedWhatsAppMessage,
  ): { lat: number; lng: number; mapUrl?: string } | null {
    if (parsed.latitude && parsed.longitude) {
      return { lat: parsed.latitude, lng: parsed.longitude };
    }
    if (parsed.locationFromBody?.coordinates) {
      return {
        lat: parsed.locationFromBody.coordinates.lat,
        lng: parsed.locationFromBody.coordinates.lng,
        mapUrl: parsed.locationFromBody.url,
      };
    }
    return null;
  }

  private async updateMessageDeliveryStatus(
    waMessageId: string,
    status: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE messages m
       SET delivery_status = $1, delivery_status_updated_at = NOW()
       FROM whatsapp_message_log w
       WHERE w.message_id = m.id AND w.wa_message_id = $2`,
      [status, waMessageId],
    );
  }

  private async getOrCreateConversation(
    merchantId: string,
    customerPhone: string,
  ): Promise<{ id: string } | null> {
    try {
      const result = await this.pool.query(
        `SELECT id FROM conversations 
         WHERE merchant_id = $1 AND customer_phone = $2 AND status != 'CLOSED'
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, customerPhone],
      );
      return result.rows.length > 0 ? { id: result.rows[0].id } : null;
    } catch (error) {
      this.logger.warn({
        msg: "Could not lookup conversation",
        error: (error as Error).message,
      });
      return null;
    }
  }
}
