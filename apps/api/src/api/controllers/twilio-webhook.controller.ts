import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
  BadRequestException,
  UnauthorizedException,
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
  ITwilioWhatsAppAdapter,
  TWILIO_ADAPTER,
  TwilioWebhookPayload,
  TwilioStatusPayload,
  ParsedTwilioMessage,
} from "../../application/adapters/twilio-whatsapp.adapter";
import { TranscriptionAdapterFactory } from "../../application/adapters/transcription.adapter";
import { CopilotAiService } from "../../application/llm/copilot-ai.service";
import { CopilotDispatcherService } from "../../application/llm/copilot-dispatcher.service";
import { DriverStatusService } from "../../application/services/driver-status.service";

@ApiTags("Webhooks")
@Controller("v1/webhooks/twilio")
export class TwilioWebhookController {
  private readonly logger = new Logger(TwilioWebhookController.name);
  private readonly validateSignature: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(TWILIO_ADAPTER)
    private readonly twilioAdapter: ITwilioWhatsAppAdapter,
    private readonly inboxService: InboxService,
    private readonly driverStatusService: DriverStatusService,
    private readonly transcriptionFactory: TranscriptionAdapterFactory,
    private readonly productOcrService: ProductOcrService,
    private readonly copilotAiService: CopilotAiService,
    private readonly copilotDispatcher: CopilotDispatcherService,
  ) {
    this.validateSignature =
      this.configService.get<string>("TWILIO_VALIDATE_SIGNATURE") !== "false";
  }

  /**
   * Handle incoming WhatsApp messages from Twilio
   * POST /v1/webhooks/twilio/whatsapp
   */
  @Post("whatsapp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Twilio WhatsApp webhook endpoint",
    description:
      "Receives incoming WhatsApp messages from Twilio. Supports text, voice notes, and location messages.",
  })
  @ApiResponse({ status: 200, description: "Message processed successfully" })
  @ApiResponse({ status: 400, description: "Invalid payload" })
  @ApiResponse({ status: 401, description: "Invalid webhook signature" })
  async handleWhatsAppWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers("x-twilio-signature") twilioSignature: string,
  ): Promise<void> {
    const correlationId = uuidv4();
    const startTime = Date.now();

    this.logger.log({
      msg: "Twilio WhatsApp webhook received",
      correlationId,
      contentType: req.headers["content-type"],
    });

    try {
      // Parse form data from Twilio
      const payload = req.body as TwilioWebhookPayload;

      // Validate required fields
      if (!payload.MessageSid || !payload.From || !payload.To) {
        this.logger.warn({
          msg: "Invalid webhook payload - missing required fields",
          correlationId,
        });
        res.status(400).send("Missing required fields");
        return;
      }

      // Validate signature if enabled
      if (this.validateSignature) {
        if (!twilioSignature) {
          this.logger.warn({
            msg: "Missing Twilio signature",
            correlationId,
            messageSid: payload.MessageSid,
          });
          res.status(401).send("Missing signature");
          return;
        }

        const fullUrl = this.getFullUrl(req);
        const isValid = this.twilioAdapter.validateSignature(
          twilioSignature,
          fullUrl,
          payload as unknown as Record<string, string>,
        );

        if (!isValid) {
          this.logger.warn({
            msg: "Invalid Twilio signature",
            correlationId,
            messageSid: payload.MessageSid,
          });
          res.status(401).send("Invalid signature");
          return;
        }
      }

      // Parse the webhook payload
      const parsed = this.twilioAdapter.parseWebhook(payload);

      // BL-008: Deduplicate inbound webhook — Twilio may retry the same message
      try {
        const dedup = await this.pool.query(
          `INSERT INTO inbound_webhook_events (provider, message_id)
           VALUES ('TWILIO', $1)
           ON CONFLICT (provider, message_id) DO NOTHING
           RETURNING id`,
          [parsed.messageSid],
        );
        if ((dedup.rowCount ?? 0) === 0) {
          this.logger.warn({
            msg: "Duplicate Twilio webhook; skipping",
            messageSid: parsed.messageSid,
            correlationId,
          });
          res.status(200).send("OK");
          return;
        }
      } catch {
        /* proceed if table not yet migrated */
      }

      this.logger.log({
        msg: "Parsed Twilio message",
        correlationId,
        messageSid: parsed.messageSid,
        from: parsed.fromNumber,
        to: parsed.toNumber,
        hasMedia: parsed.hasMedia,
        isVoiceNote: parsed.isVoiceNote,
        hasLocation: parsed.hasLocation,
        bodyLength: parsed.body.length,
        // Debug: Log location-related raw fields
        rawLatitude: payload.Latitude,
        rawLongitude: payload.Longitude,
        bodyPreview: parsed.body.substring(0, 200),
        locationFromBody: parsed.locationFromBody,
      });

      // Look up merchant by the "To" WhatsApp number
      const merchantMapping =
        await this.twilioAdapter.getMerchantByWhatsAppNumber(parsed.toWhatsApp);

      if (!merchantMapping) {
        this.logger.warn({
          msg: "No merchant found for WhatsApp number",
          correlationId,
          toNumber: parsed.toWhatsApp,
        });

        // Log the message anyway for debugging
        await this.twilioAdapter.logInboundMessage(parsed);

        // Send TwiML empty response (don't reply)
        res.type("text/xml").send("<Response></Response>");
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
          const customerSend = await this.twilioAdapter.sendTextMessage(
            driverStatus.customerNotification.phone,
            driverStatus.customerNotification.message,
            merchantMapping.whatsappNumber || parsed.toWhatsApp,
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
        const replySend = await this.twilioAdapter.sendTextMessage(
          parsed.fromWhatsApp,
          driverReply,
          merchantMapping.whatsappNumber || parsed.toWhatsApp,
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

        res.type("text/xml").send("<Response></Response>");
        return;
      }

      // ========================================================================
      // MERCHANT COPILOT VIA WHATSAPP - DISABLED
      // ========================================================================
      // SECURITY: Merchant control via WhatsApp is DISABLED for security reasons.
      // Merchants MUST use the Portal (authenticated staff accounts) to issue commands.
      // WhatsApp is customer-facing only: order taking, payment instructions, proof submission.
      // The merchant_command_channels feature has been deprecated.
      // If you need to re-enable this, you must implement proper authentication.
      // ========================================================================
      // const commandChannel = await this.checkMerchantCommandChannel(parsed.fromNumber, merchantId);
      // if (commandChannel) { ... } - REMOVED FOR SECURITY
      // ========================================================================

      // Process the message
      let effectiveText = parsed.body;
      let transcriptionResult: any;

      // Handle voice note transcription
      if (parsed.isVoiceNote && parsed.audioUrl) {
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
          // Continue with empty text - will ask user to type
          effectiveText = "[صوتية]";
        }
      }

      // Handle location messages
      let locationData: any;
      if (parsed.hasLocation) {
        locationData = this.extractLocationData(parsed);

        // If only location shared (no text), create descriptive text
        if (!effectiveText || effectiveText.trim() === "") {
          effectiveText = `📍 موقعي: ${locationData.lat}, ${locationData.lng}`;
          if (locationData.mapUrl) {
            effectiveText += `\n${locationData.mapUrl}`;
          }
        }
      }

      // Handle product image OCR
      // Detect image media (not voice notes) and process for product recognition
      let productOcrHandled = false;
      if (parsed.hasMedia && !parsed.isVoiceNote) {
        const imageIndex = parsed.mediaContentTypes.findIndex((type) =>
          this.productOcrService.isProcessableImage(type),
        );

        if (imageIndex !== -1) {
          const imageUrl = parsed.mediaUrls[imageIndex];

          this.logger.log({
            msg: "Processing product image from WhatsApp",
            correlationId,
            imageContentType: parsed.mediaContentTypes[imageIndex],
          });

          try {
            // Get conversation ID for context (create if needed)
            const conversation = await this.getOrCreateConversation(
              merchantId,
              parsed.fromNumber,
            );

            const ocrResult = await this.productOcrService.processProductImage(
              imageUrl,
              merchantId,
              parsed.fromNumber,
              conversation?.id ?? "",
              merchantMapping.displayName, // Use as category hint
            );

            if (ocrResult.success && ocrResult.confirmationMessage) {
              // Send the product match confirmation directly
              const sendResult = await this.twilioAdapter.sendTextMessage(
                parsed.fromWhatsApp,
                ocrResult.confirmationMessage,
              );

              this.logger.log({
                msg: "Product OCR response sent",
                correlationId,
                success: sendResult.success,
                catalogMatchesCount: ocrResult.catalogMatches?.length || 0,
              });

              productOcrHandled = true;
              // Return early - don't send to inbox
              res.type("text/xml").send("<Response></Response>");
              return;
            } else if (!ocrResult.success) {
              // OCR failed - append info to message and continue
              effectiveText = effectiveText || "";
              if (effectiveText) {
                effectiveText += "\n\n";
              }
              effectiveText += "[📷 صورة - لم نتمكن من التعرف على المنتج]";
            }
          } catch (error) {
            this.logger.error({
              msg: "Product OCR processing failed",
              correlationId,
              error: (error as Error).message,
            });
            // Continue with normal flow
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
            // Customer selected a product - add to order flow
            effectiveText = `أريد ${confirmationResponse.selectedItem.name || confirmationResponse.selectedItem.nameAr}`;
          } else if (confirmationResponse.message) {
            // Send the response message
            await this.twilioAdapter.sendTextMessage(
              parsed.fromWhatsApp,
              confirmationResponse.message,
            );
            res.type("text/xml").send("<Response></Response>");
            return;
          }
        }
      }

      // Log the inbound message to Twilio log
      await this.twilioAdapter.logInboundMessage(parsed);

      // Call the existing inbox service to process the message
      // Note: Don't pass voiceNote if we've already transcribed it above
      // The transcribed text is already in effectiveText
      const inboxResponse = await this.inboxService.processMessage({
        merchantId,
        senderId: parsed.fromNumber,
        text: effectiveText,
        providerMessageId: parsed.messageSid,
        // Only pass voiceNote if transcription wasn't attempted in this controller
        // This prevents double transcription attempts
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

      if (!inboxResponse.replyText) {
        this.logger.debug({
          msg: "No reply to send (suppressed)",
          correlationId,
          conversationId: inboxResponse.conversationId,
          action: inboxResponse.action,
          routingDecision: inboxResponse.routingDecision,
          markAsRead: !!inboxResponse.markAsRead,
        });
        res.type("text/xml").send("<Response></Response>");
        return;
      }

      // Send the reply back via Twilio
      const sendResult = await this.twilioAdapter.sendTextMessage(
        parsed.fromWhatsApp,
        inboxResponse.replyText,
      );

      if (!sendResult.success) {
        this.logger.error({
          msg: "Failed to send reply via Twilio",
          correlationId,
          errorCode: sendResult.errorCode,
          errorMessage: sendResult.errorMessage,
        });
      } else {
        await this.markConversationReplyAsSent(
          inboxResponse.conversationId,
          sendResult.messageSid,
        );

        this.logger.log({
          msg: "Reply sent successfully",
          correlationId,
          messageSid: sendResult.messageSid,
        });
      }

      // Return TwiML empty response (we send messages via API, not TwiML)
      res.type("text/xml").send("<Response></Response>");
    } catch (error) {
      this.logger.error({
        msg: "Error processing Twilio webhook",
        correlationId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Return 200 to prevent Twilio retries (we'll handle errors internally)
      res.type("text/xml").send("<Response></Response>");
    }
  }

  /**
   * Handle Twilio status callbacks (message delivery status updates)
   * POST /v1/webhooks/twilio/status
   */
  @Post("status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Twilio message status callback",
    description: "Receives message status updates (delivered, failed, etc.)",
  })
  @ApiResponse({ status: 200, description: "Status processed" })
  async handleStatusCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Headers("x-twilio-signature") twilioSignature: string,
  ): Promise<void> {
    const correlationId = uuidv4();

    try {
      const payload = req.body as TwilioStatusPayload;

      this.logger.log({
        msg: "Twilio status callback received",
        correlationId,
        messageSid: payload.MessageSid,
        status: payload.MessageStatus,
      });

      // Validate signature if enabled
      if (this.validateSignature) {
        if (!twilioSignature) {
          this.logger.warn({
            msg: "Missing status callback signature",
            correlationId,
          });
          res.status(401).send("Missing signature");
          return;
        }

        const fullUrl = this.getFullUrl(req);
        const isValid = this.twilioAdapter.validateSignature(
          twilioSignature,
          fullUrl,
          payload as unknown as Record<string, string>,
        );

        if (!isValid) {
          this.logger.warn({
            msg: "Invalid status callback signature",
            correlationId,
          });
          res.status(401).send("Invalid signature");
          return;
        }
      }

      // Parse and update status
      const status = this.twilioAdapter.parseStatusCallback(payload);

      await this.twilioAdapter.updateMessageStatus(
        status.messageSid,
        status.status,
        status.errorCode,
        status.errorMessage,
        payload,
      );

      // Update message delivery status in messages table if we can find it
      if (status.status === "delivered" || status.status === "read") {
        await this.updateMessageDeliveryStatus(
          status.messageSid,
          status.status,
        );
      } else if (
        status.status === "failed" ||
        status.status === "undelivered"
      ) {
        await this.updateMessageDeliveryStatus(status.messageSid, "FAILED");
      }

      res.status(200).send("OK");
    } catch (error) {
      this.logger.error({
        msg: "Error processing status callback",
        correlationId,
        error: (error as Error).message,
      });
      res.status(200).send("OK"); // Return 200 to prevent retries
    }
  }

  /**
   * Process voice note - download and transcribe
   */
  private async processVoiceNote(
    parsed: ParsedTwilioMessage,
    merchantId: string,
    correlationId: string,
  ): Promise<{ text: string; confidence: number; duration: number }> {
    if (!parsed.audioUrl) {
      throw new BadRequestException("No audio URL provided");
    }

    // Download the audio file from Twilio
    const { buffer, contentType } = await this.twilioAdapter.downloadMedia(
      parsed.audioUrl,
    );

    this.logger.debug({
      msg: "Audio downloaded for transcription",
      correlationId,
      size: buffer.length,
      contentType,
    });

    // Get transcription adapter
    const adapter = this.transcriptionFactory.getAdapter();

    // Transcribe the audio
    const startTranscription = Date.now();
    const result = await adapter.transcribe(buffer, {
      language: "ar", // Default to Arabic
    });
    const processingTime = Date.now() - startTranscription;

    // Store transcription result
    await this.storeTranscription({
      conversationId: "", // Will be set by inbox service
      merchantId,
      provider: "whisper",
      mediaUrl: parsed.audioUrl,
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

  /**
   * Store transcription result in database
   */
  private async storeTranscription(data: {
    conversationId: string;
    merchantId: string;
    provider: string;
    mediaUrl: string;
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
        data.mediaUrl,
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

  /**
   * Extract location data from parsed message
   */
  private extractLocationData(parsed: ParsedTwilioMessage): {
    lat: number;
    lng: number;
    mapUrl?: string;
  } | null {
    // Priority 1: Direct coordinates from Twilio
    if (parsed.latitude && parsed.longitude) {
      return {
        lat: parsed.latitude,
        lng: parsed.longitude,
      };
    }

    // Priority 2: Coordinates extracted from body
    if (parsed.locationFromBody?.coordinates) {
      return {
        lat: parsed.locationFromBody.coordinates.lat,
        lng: parsed.locationFromBody.coordinates.lng,
        mapUrl: parsed.locationFromBody.url,
      };
    }

    // Priority 3: Just URL (couldn't parse coordinates)
    if (parsed.locationFromBody?.url) {
      // Return null coordinates but log the URL
      this.logger.debug({
        msg: "Location URL found but coordinates not parsed",
        url: parsed.locationFromBody.url,
      });
      return null;
    }

    return null;
  }

  /**
   * Update message delivery status in messages table
   */
  private async updateMessageDeliveryStatus(
    messageSid: string,
    status: string,
  ): Promise<void> {
    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      delivered: "DELIVERED",
      read: "READ",
      failed: "FAILED",
      undelivered: "FAILED",
    };

    const mappedStatus = statusMap[status] || status.toUpperCase();

    // Update via twilio_message_log -> messages join
    await this.pool.query(
      `UPDATE messages m
       SET delivery_status = $1, delivery_status_updated_at = NOW()
       FROM twilio_message_log t
       WHERE t.message_id = m.id AND t.message_sid = $2`,
      [mappedStatus, messageSid],
    );
  }

  private async markConversationReplyAsSent(
    conversationId: string,
    providerMessageId?: string,
  ): Promise<void> {
    if (!conversationId) {
      return;
    }

    const updated = await this.pool.query<{ id: string }>(
      `WITH target AS (
         SELECT id
         FROM messages
         WHERE conversation_id = $1
           AND direction = 'outbound'
           AND sender_id = 'bot'
           AND delivery_status IN ('PENDING', 'QUEUED')
           AND created_at >= NOW() - INTERVAL '10 minutes'
         ORDER BY created_at DESC
         LIMIT 1
       )
       UPDATE messages m
       SET delivery_status = 'SENT',
           provider_message_id_outbound = COALESCE($2, m.provider_message_id_outbound),
           sent_at = COALESCE(m.sent_at, NOW()),
           delivery_status_updated_at = NOW(),
           next_retry_at = NULL
       FROM target t
       WHERE m.id = t.id
       RETURNING m.id`,
      [conversationId, providerMessageId || null],
    );

    if ((updated.rowCount ?? 0) === 0) {
      this.logger.warn({
        msg: "No pending outbound message found to mark as sent",
        conversationId,
        providerMessageId,
      });
    }
  }

  /**
   * Get full URL for signature validation
   */
  private getFullUrl(req: Request): string {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return `${protocol}://${host}${req.originalUrl}`;
  }

  /**
   * Get or create a conversation for the customer
   */
  private async getOrCreateConversation(
    merchantId: string,
    customerPhone: string,
  ): Promise<{ id: string } | null> {
    try {
      // Try to find existing active conversation
      const result = await this.pool.query(
        `SELECT id FROM conversations 
         WHERE merchant_id = $1 AND customer_phone = $2 AND status != 'CLOSED'
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, customerPhone],
      );

      if (result.rows.length > 0) {
        return { id: result.rows[0].id };
      }

      // No active conversation - return null (will be created by inbox service)
      return null;
    } catch (error) {
      this.logger.warn({
        msg: "Could not lookup conversation",
        error: (error as Error).message,
      });
      return null;
    }
  }

  // ============================================================================
  // MERCHANT COPILOT ROUTING HELPERS
  // ============================================================================

  /**
   * Check if the sender is a registered merchant command channel
   */
  private async checkMerchantCommandChannel(
    fromNumber: string,
    merchantId: string,
  ): Promise<{ merchantId: string; phoneNumber: string } | null> {
    try {
      // Normalize phone number (remove whatsapp: prefix if present)
      const normalizedPhone = fromNumber
        .replace(/^whatsapp:/, "")
        .replace(/\+/g, "");

      const result = await this.pool.query(
        `SELECT merchant_id, phone_number 
         FROM merchant_command_channels 
         WHERE merchant_id = $1 
           AND is_active = TRUE
           AND (
             phone_number = $2 
             OR phone_number = $3
             OR REPLACE(REPLACE(phone_number, 'whatsapp:', ''), '+', '') = $4
           )`,
        [merchantId, fromNumber, `+${normalizedPhone}`, normalizedPhone],
      );

      if (result.rows.length > 0) {
        return {
          merchantId: result.rows[0].merchant_id,
          phoneNumber: result.rows[0].phone_number,
        };
      }
      return null;
    } catch (error) {
      this.logger.error({
        msg: "Error checking merchant command channel",
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Handle a message from a merchant command channel via Copilot
   */
  private async handleMerchantCopilotMessage(
    parsed: ParsedTwilioMessage,
    merchantId: string,
    correlationId: string,
  ): Promise<string> {
    try {
      let inputText = parsed.body;
      const inputType = parsed.isVoiceNote ? "voice" : "text";

      // Handle voice note transcription
      if (parsed.isVoiceNote && parsed.audioUrl) {
        try {
          const transcription = await this.processVoiceNote(
            parsed,
            merchantId,
            correlationId,
          );
          inputText = transcription.text;

          this.logger.log({
            msg: "Copilot voice note transcribed",
            correlationId,
            transcribedText: inputText.substring(0, 100),
          });
        } catch (error) {
          this.logger.error({
            msg: "Copilot voice transcription failed",
            correlationId,
            error: (error as Error).message,
          });
          return "⚠️ عذراً، لم أتمكن من سماع الرسالة الصوتية. يرجى المحاولة مجدداً أو كتابة الأمر.";
        }
      }

      if (!inputText || inputText.trim() === "") {
        return "🤖 مرحباً! أنا مساعدك الذكي. كيف يمكنني مساعدتك؟";
      }

      // Check for pending action confirmation keywords
      const confirmKeywords = [
        "نعم",
        "أكد",
        "موافق",
        "تمام",
        "yes",
        "confirm",
        "ok",
      ];
      const cancelKeywords = ["لا", "إلغاء", "cancel", "no"];
      const lowerInput = inputText.toLowerCase().trim();

      // Check if user is responding to pending action
      const pendingActions = await this.pool.query(
        `SELECT id, intent, command FROM copilot_pending_actions 
         WHERE merchant_id = $1 AND status = 'pending' AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId],
      );

      if (pendingActions.rows.length > 0) {
        const pendingAction = pendingActions.rows[0];

        if (confirmKeywords.some((kw) => lowerInput.includes(kw))) {
          // Confirm the action
          const result = await this.copilotAiService.confirmAction(
            merchantId,
            pendingAction.id,
            true,
          );
          return result.message;
        }

        if (cancelKeywords.some((kw) => lowerInput.includes(kw))) {
          // Cancel the action
          const result = await this.copilotAiService.confirmAction(
            merchantId,
            pendingAction.id,
            false,
          );
          return result.message;
        }
      }

      // Parse the command using AI
      const parseResult = await this.copilotAiService.parseCommand(
        merchantId,
        inputText,
        "whatsapp",
        inputType,
      );

      if (!parseResult.success) {
        return parseResult.message;
      }

      // If action requires confirmation, return the confirmation request
      if (parseResult.requiresConfirmation && parseResult.pendingActionId) {
        return parseResult.message;
      }

      // For query intents, execute immediately
      if (parseResult.command && !parseResult.requiresConfirmation) {
        const queryResult = await this.copilotDispatcher.executeQuery(
          merchantId,
          parseResult.command,
        );
        return queryResult.message ?? "";
      }

      return parseResult.message;
    } catch (error) {
      this.logger.error({
        msg: "Error processing merchant copilot message",
        correlationId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      return "⚠️ حدث خطأ أثناء معالجة طلبك. يرجى المحاولة لاحقاً.";
    }
  }
}
