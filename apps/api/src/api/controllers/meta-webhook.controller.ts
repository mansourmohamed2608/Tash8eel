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
import {
  IMetaWhatsAppAdapter,
  META_WHATSAPP_ADAPTER,
  MetaWebhookPayload,
  ParsedWhatsAppMessage,
} from "../../application/adapters/meta-whatsapp.adapter";
import { TranscriptionAdapterFactory } from "../../application/adapters/transcription.adapter";
import { CopilotAiService } from "../../application/llm/copilot-ai.service";
import { CopilotDispatcherService } from "../../application/llm/copilot-dispatcher.service";
import { MessageRouterService } from "../../application/llm/message-router.service";
import { DriverStatusService } from "../../application/services/driver-status.service";
import { UsageGuardService } from "../../application/services/usage-guard.service";

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
    private readonly copilotAiService: CopilotAiService,
    private readonly copilotDispatcher: CopilotDispatcherService,
    private readonly messageRouter: MessageRouterService,
    private readonly usageGuard: UsageGuardService,
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

    const configuredVerifyToken =
      this.configService.get<string>("WEBHOOK_VERIFY_TOKEN") || "";
    if (!configuredVerifyToken) {
      this.logger.error(
        "WEBHOOK_VERIFY_TOKEN is not configured. Rejecting Meta webhook verification.",
      );
      res.status(403).send("Verification failed");
      return;
    }

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
      if (!rawBody) {
        this.logger.error({
          msg: "Meta webhook request missing raw body",
          correlationId,
        });
        res
          .status(401)
          .json({ error: "Missing raw body for signature validation" });
        return;
      }

      if (!this.metaAdapter.validateSignature(signature, rawBody)) {
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

      const merchantPlan =
        await this.inboxService.getMerchantPlanCached(merchantId);

      // BL-008: Deduplicate inbound webhook — Meta may retry the same message
      if (parsed.messageId) {
        try {
          const dedup = await this.pool.query(
            `INSERT INTO inbound_webhook_events (provider, message_id, merchant_id)
             VALUES ('META', $1, $2)
             ON CONFLICT (provider, message_id) DO NOTHING
             RETURNING id`,
            [parsed.messageId, merchantId],
          );
          if ((dedup.rowCount ?? 0) === 0) {
            this.logger.warn({
              msg: "Duplicate Meta webhook; skipping",
              messageId: parsed.messageId,
              correlationId,
            });
            return;
          }
        } catch {
          /* proceed if table not yet migrated */
        }
      }

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
        if (merchantPlan.name === "starter") {
          const redirectReply =
            this.messageRouter.getMediaRedirectReply("voice");
          const sendResult = await this.metaAdapter.sendTextMessage(
            parsed.fromNumber,
            redirectReply,
            parsed.phoneNumberId,
          );
          try {
            await this.pool.query(
              `INSERT INTO ai_routing_log (
                 merchant_id,
                 plan_name,
                 message_type,
                 routing_decision,
                 model_used,
                 estimated_cost_usd
               ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                merchantId,
                merchantPlan.name,
                "audio",
                "media_redirect",
                null,
                0,
              ],
            );
          } catch {
            // Analytics table may not exist until migration is applied.
          }
          if (!sendResult.success) {
            this.logger.warn({
              msg: "Failed to send starter voice redirect reply",
              correlationId,
              merchantId,
              errorCode: sendResult.errorCode,
              errorMessage: sendResult.errorMessage,
            });
          }
          return;
        }
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
        const mapLimit = await this.usageGuard.consume(
          merchantId,
          "MAP_LOOKUPS",
          1,
          {
            metadata: {
              source: "WHATSAPP_LOCATION",
              correlationId,
            },
          },
        );
        if (!mapLimit.allowed) {
          this.logger.warn({
            msg: "Map lookup limit exceeded; skipping location enrichment",
            correlationId,
            merchantId,
            used: mapLimit.used,
            limit: mapLimit.limit,
          });
        } else {
          locationData = this.extractLocationData(parsed);
          if (!effectiveText || effectiveText.trim() === "") {
            effectiveText = `📍 موقعي: ${locationData?.lat}, ${locationData?.lng}`;
          }
        }
      }

      // Product OCR flow is removed. OCR is reserved for payment proof verification only.

      // Log inbound message
      await this.metaAdapter.logInboundMessage(parsed);

      // Process via inbox service
      const inboxResponse = await this.inboxService.processMessage({
        merchantId,
        senderId: parsed.fromNumber,
        text: effectiveText,
        messageType: parsed.messageType,
        providerMessageId: parsed.messageId,
        correlationId,
        // Pass the WA business number that received the message so the
        // conversation can be routed to the correct branch.
        destinationPhone: parsed.toNumber || undefined,
      });

      this.logger.log({
        msg: "Inbox response generated",
        correlationId,
        conversationId: inboxResponse.conversationId,
        action: inboxResponse.action,
        replyLength: inboxResponse.replyText.length,
        duration: Date.now() - startTime,
      });

      // Send reply via Meta (skip if empty — e.g. inactive/expired merchant)
      if (!inboxResponse.replyText) {
        if (inboxResponse.markAsRead && parsed.messageId) {
          await this.metaAdapter.markMessageRead(
            parsed.messageId,
            parsed.phoneNumberId,
          );
        }
        this.logger.debug({
          msg: "No reply to send (suppressed)",
          correlationId,
        });
        return;
      }

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

    const voiceLimit = await this.usageGuard.checkLimit(
      merchantId,
      "VOICE_MINUTES",
    );
    if (!voiceLimit.allowed) {
      throw new BadRequestException(
        `Voice minute limit exceeded (${voiceLimit.used.toFixed(1)}/${voiceLimit.limit})`,
      );
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

    const consumed = await this.usageGuard.consume(
      merchantId,
      "VOICE_MINUTES",
      Math.max(0.01, Number(result.duration || 0) / 60),
      {
        metadata: {
          source: "WHATSAPP_VOICE_NOTE",
          correlationId,
          provider: "whisper",
        },
      },
    );
    if (!consumed.allowed) {
      throw new BadRequestException(
        `Voice minute limit exceeded (${consumed.used.toFixed(1)}/${consumed.limit})`,
      );
    }

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
}
