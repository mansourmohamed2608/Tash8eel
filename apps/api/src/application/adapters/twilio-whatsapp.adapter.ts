import {
  Injectable,
  Logger,
  Inject,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

// Twilio types
export interface TwilioWebhookPayload {
  // Core message fields
  MessageSid: string;
  AccountSid: string;
  From: string; // whatsapp:+1234567890
  To: string; // whatsapp:+1234567890
  Body?: string;

  // Media fields
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  MediaUrl1?: string;
  MediaContentType1?: string;
  // ... up to MediaUrl9

  // Location fields (if message contains location)
  Latitude?: string;
  Longitude?: string;

  // Profile info
  ProfileName?: string;
  WaId?: string; // WhatsApp ID (phone number without prefix)

  // Additional metadata
  SmsMessageSid?: string;
  NumSegments?: string;
  ReferralNumMedia?: string;

  // Button response (for interactive messages)
  ButtonText?: string;
  ButtonPayload?: string;

  // Status callback fields (for status updates)
  SmsStatus?: string;
  MessageStatus?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface TwilioStatusPayload {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  MessageStatus: string; // queued, failed, sent, delivered, undelivered, read
  ErrorCode?: string;
  ErrorMessage?: string;
  ChannelToAddress?: string;
  ChannelPrefix?: string;
}

// Twilio API response types
interface TwilioApiResponse {
  sid?: string;
  status?: string;
  code?: number;
  message?: string;
}

export interface ParsedTwilioMessage {
  messageSid: string;
  accountSid: string;
  fromNumber: string; // Normalized: +1234567890
  fromWhatsApp: string; // Original: whatsapp:+1234567890
  toNumber: string;
  toWhatsApp: string;
  body: string;
  profileName?: string;
  waId?: string;

  // Media
  hasMedia: boolean;
  mediaCount: number;
  mediaUrls: string[];
  mediaContentTypes: string[];

  // Location
  hasLocation: boolean;
  latitude?: number;
  longitude?: number;
  locationFromBody?: {
    url?: string;
    coordinates?: { lat: number; lng: number };
  };

  // Audio detection
  isVoiceNote: boolean;
  audioUrl?: string;
  audioContentType?: string;

  // Button response
  isButtonResponse: boolean;
  buttonText?: string;
  buttonPayload?: string;

  // Raw payload for logging
  rawPayload: TwilioWebhookPayload;
}

export interface TwilioSendResult {
  success: boolean;
  messageSid?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface MerchantPhoneMapping {
  merchantId: string;
  phoneNumber: string;
  whatsappNumber: string;
  displayName?: string;
  isSandbox: boolean;
}

export const TWILIO_ADAPTER = Symbol("TWILIO_ADAPTER");

export interface ITwilioWhatsAppAdapter {
  // Signature validation
  validateSignature(
    signature: string,
    url: string,
    body: Record<string, string>,
  ): boolean;

  // Parsing
  parseWebhook(payload: TwilioWebhookPayload): ParsedTwilioMessage;
  parseStatusCallback(payload: TwilioStatusPayload): {
    messageSid: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
  };

  // Merchant lookup
  getMerchantByWhatsAppNumber(
    whatsappNumber: string,
  ): Promise<MerchantPhoneMapping | null>;

  // Media download
  downloadMedia(
    mediaUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string }>;

  // Outbound messaging
  sendTextMessage(
    to: string,
    body: string,
    fromNumber?: string,
  ): Promise<TwilioSendResult>;
  sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<TwilioSendResult>;

  // Logging
  logInboundMessage(
    parsed: ParsedTwilioMessage,
    messageId?: string,
  ): Promise<string>;
  updateMessageStatus(
    messageSid: string,
    status: string,
    errorCode?: string,
    errorMessage?: string,
    rawPayload?: any,
  ): Promise<void>;
}

@Injectable()
export class TwilioWhatsAppAdapter implements ITwilioWhatsAppAdapter {
  private readonly logger = new Logger(TwilioWhatsAppAdapter.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly validateSignatures: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {
    this.accountSid =
      this.configService.get<string>("TWILIO_ACCOUNT_SID") || "";
    this.authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN") || "";
    this.fromNumber =
      this.configService.get<string>("TWILIO_WHATSAPP_FROM") ||
      "whatsapp:+14155238886";
    this.validateSignatures =
      this.configService.get<string>("TWILIO_VALIDATE_SIGNATURE") !== "false";

    if (!this.accountSid || !this.authToken) {
      this.logger.warn(
        "Twilio credentials not configured. Twilio adapter will operate in mock mode.",
      );
    }
  }

  /**
   * Validate Twilio webhook signature using X-Twilio-Signature header
   * https://www.twilio.com/docs/usage/security#validating-requests
   */
  validateSignature(
    signature: string,
    url: string,
    body: Record<string, string>,
  ): boolean {
    if (!this.validateSignatures) {
      this.logger.debug("Signature validation disabled");
      return true;
    }

    if (!this.authToken) {
      this.logger.warn("Cannot validate signature without auth token");
      return false;
    }

    // Sort the POST parameters alphabetically by key
    const sortedKeys = Object.keys(body).sort();
    let data = url;

    for (const key of sortedKeys) {
      data += key + body[key];
    }

    // Calculate HMAC-SHA1
    const hmac = crypto.createHmac("sha1", this.authToken);
    hmac.update(data);
    const expectedSignature = hmac.digest("base64");

    const isValid = signature === expectedSignature;

    if (!isValid) {
      this.logger.warn({
        msg: "Invalid Twilio signature",
        expectedLength: expectedSignature.length,
        receivedLength: signature.length,
        url,
      });
    }

    return isValid;
  }

  /**
   * Parse Twilio webhook payload into normalized structure
   */
  parseWebhook(payload: TwilioWebhookPayload): ParsedTwilioMessage {
    const fromNumber = this.normalizePhoneNumber(payload.From);
    const toNumber = this.normalizePhoneNumber(payload.To);

    // Extract media
    const mediaUrls: string[] = [];
    const mediaContentTypes: string[] = [];
    const numMedia = parseInt(payload.NumMedia || "0", 10);

    for (let i = 0; i < numMedia; i++) {
      const urlKey = `MediaUrl${i}` as keyof TwilioWebhookPayload;
      const typeKey = `MediaContentType${i}` as keyof TwilioWebhookPayload;

      if (payload[urlKey]) {
        mediaUrls.push(payload[urlKey] as string);
        mediaContentTypes.push(
          (payload[typeKey] as string) || "application/octet-stream",
        );
      }
    }

    // Detect voice note (audio media)
    const audioIndex = mediaContentTypes.findIndex(
      (type) => type.startsWith("audio/") || type === "application/ogg",
    );
    const isVoiceNote = audioIndex !== -1;

    // Parse location from coordinates
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (payload.Latitude && payload.Longitude) {
      latitude = parseFloat(payload.Latitude);
      longitude = parseFloat(payload.Longitude);
    }

    // Try to extract location from message body if not in coordinates
    const locationFromBody = this.extractLocationFromBody(payload.Body || "");

    const result: ParsedTwilioMessage = {
      messageSid: payload.MessageSid,
      accountSid: payload.AccountSid,
      fromNumber,
      fromWhatsApp: payload.From,
      toNumber,
      toWhatsApp: payload.To,
      body: payload.Body || "",
      profileName: payload.ProfileName,
      waId: payload.WaId,

      hasMedia: numMedia > 0,
      mediaCount: numMedia,
      mediaUrls,
      mediaContentTypes,

      hasLocation: !!(latitude && longitude) || !!locationFromBody?.coordinates,
      latitude,
      longitude,
      locationFromBody,

      isVoiceNote,
      audioUrl: isVoiceNote ? mediaUrls[audioIndex] : undefined,
      audioContentType: isVoiceNote ? mediaContentTypes[audioIndex] : undefined,

      isButtonResponse: !!payload.ButtonText,
      buttonText: payload.ButtonText,
      buttonPayload: payload.ButtonPayload,

      rawPayload: payload,
    };

    this.logger.debug({
      msg: "Parsed Twilio webhook",
      messageSid: result.messageSid,
      from: fromNumber,
      hasMedia: result.hasMedia,
      isVoiceNote: result.isVoiceNote,
      hasLocation: result.hasLocation,
    });

    return result;
  }

  /**
   * Parse Twilio status callback
   */
  parseStatusCallback(payload: TwilioStatusPayload): {
    messageSid: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
  } {
    return {
      messageSid: payload.MessageSid,
      status: payload.MessageStatus,
      errorCode: payload.ErrorCode,
      errorMessage: payload.ErrorMessage,
    };
  }

  /**
   * Look up merchant by WhatsApp number (the "To" number in inbound messages)
   */
  async getMerchantByWhatsAppNumber(
    whatsappNumber: string,
  ): Promise<MerchantPhoneMapping | null> {
    const result = await this.pool.query(
      `SELECT merchant_id, phone_number, whatsapp_number, display_name, is_sandbox
       FROM merchant_phone_numbers
       WHERE whatsapp_number = $1 AND is_active = true`,
      [whatsappNumber],
    );

    if (result.rows.length === 0) {
      // Try normalized lookup
      const normalized = `whatsapp:${this.normalizePhoneNumber(whatsappNumber)}`;
      const normalizedResult = await this.pool.query(
        `SELECT merchant_id, phone_number, whatsapp_number, display_name, is_sandbox
         FROM merchant_phone_numbers
         WHERE whatsapp_number = $1 AND is_active = true`,
        [normalized],
      );

      if (normalizedResult.rows.length === 0) {
        return null;
      }

      const row = normalizedResult.rows[0];
      return {
        merchantId: row.merchant_id,
        phoneNumber: row.phone_number,
        whatsappNumber: row.whatsapp_number,
        displayName: row.display_name,
        isSandbox: row.is_sandbox,
      };
    }

    const row = result.rows[0];
    return {
      merchantId: row.merchant_id,
      phoneNumber: row.phone_number,
      whatsappNumber: row.whatsapp_number,
      displayName: row.display_name,
      isSandbox: row.is_sandbox,
    };
  }

  /**
   * Download media from Twilio using Basic Auth
   */
  async downloadMedia(
    mediaUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.accountSid || !this.authToken) {
      throw new BadRequestException(
        "Twilio credentials not configured for media download",
      );
    }

    this.logger.debug({ msg: "Downloading Twilio media", url: mediaUrl });

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      "base64",
    );

    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(
        `Failed to download media: ${response.status} ${response.statusText}`,
      );
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    this.logger.debug({
      msg: "Media downloaded successfully",
      size: buffer.length,
      contentType,
    });

    return { buffer, contentType };
  }

  /**
   * Send text message via Twilio WhatsApp
   */
  async sendTextMessage(
    to: string,
    body: string,
    fromNumber?: string,
  ): Promise<TwilioSendResult> {
    if (!this.accountSid || !this.authToken) {
      this.logger.warn("Twilio credentials not configured - message not sent");
      return {
        success: false,
        errorCode: "NO_CREDENTIALS",
        errorMessage: "Twilio credentials not configured",
      };
    }

    const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const senderNumber = fromNumber
      ? fromNumber.startsWith("whatsapp:")
        ? fromNumber
        : `whatsapp:${fromNumber}`
      : this.fromNumber;

    this.logger.log({
      msg: "Sending WhatsApp message",
      to: normalizedTo,
      from: senderNumber,
      bodyLength: body.length,
    });

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
        "base64",
      );

      const formData = new URLSearchParams();
      formData.append("From", senderNumber);
      formData.append("To", normalizedTo);
      formData.append("Body", body);

      // Add status callback URL if configured
      const statusCallbackPath = this.configService.get<string>(
        "TWILIO_STATUS_CALLBACK_PATH",
      );
      const baseUrl = this.configService.get<string>("PUBLIC_URL");
      if (statusCallbackPath && baseUrl) {
        formData.append("StatusCallback", `${baseUrl}${statusCallbackPath}`);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const result = (await response.json()) as TwilioApiResponse;

      if (!response.ok) {
        this.logger.error({
          msg: "Twilio send failed",
          status: response.status,
          errorCode: result.code,
          errorMessage: result.message,
        });

        return {
          success: false,
          errorCode: result.code?.toString(),
          errorMessage: result.message,
        };
      }

      this.logger.log({
        msg: "WhatsApp message sent successfully",
        messageSid: result.sid,
        status: result.status,
      });

      // Log outbound message
      await this.logOutboundMessage(
        result.sid ?? "",
        normalizedTo,
        body,
        result,
      );

      return {
        success: true,
        messageSid: result.sid,
        status: result.status,
      };
    } catch (error) {
      this.logger.error({
        msg: "Failed to send WhatsApp message",
        error: (error as Error).message,
      });

      return {
        success: false,
        errorCode: "SEND_ERROR",
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Send media message via Twilio WhatsApp
   */
  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<TwilioSendResult> {
    if (!this.accountSid || !this.authToken) {
      return {
        success: false,
        errorCode: "NO_CREDENTIALS",
        errorMessage: "Twilio credentials not configured",
      };
    }

    const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
        "base64",
      );

      const formData = new URLSearchParams();
      formData.append("From", this.fromNumber);
      formData.append("To", normalizedTo);
      formData.append("MediaUrl", mediaUrl);
      if (caption) {
        formData.append("Body", caption);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const result = (await response.json()) as TwilioApiResponse;

      if (!response.ok) {
        return {
          success: false,
          errorCode: result.code?.toString(),
          errorMessage: result.message,
        };
      }

      return {
        success: true,
        messageSid: result.sid,
        status: result.status,
      };
    } catch (error) {
      return {
        success: false,
        errorCode: "SEND_ERROR",
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Log inbound message to twilio_message_log
   */
  async logInboundMessage(
    parsed: ParsedTwilioMessage,
    messageId?: string,
  ): Promise<string> {
    const id = uuidv4();

    await this.pool.query(
      `INSERT INTO twilio_message_log (
        id, message_id, message_sid, account_sid, direction,
        from_number, to_number, body, num_media, media_urls, media_content_types,
        status, latitude, longitude, webhook_received_at, raw_webhook_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15)`,
      [
        id,
        messageId,
        parsed.messageSid,
        parsed.accountSid,
        "inbound",
        parsed.fromWhatsApp,
        parsed.toWhatsApp,
        parsed.body,
        parsed.mediaCount,
        JSON.stringify(parsed.mediaUrls),
        JSON.stringify(parsed.mediaContentTypes),
        "received",
        parsed.latitude,
        parsed.longitude,
        JSON.stringify(parsed.rawPayload),
      ],
    );

    return id;
  }

  /**
   * Log outbound message
   */
  private async logOutboundMessage(
    messageSid: string,
    to: string,
    body: string,
    rawResponse: any,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO twilio_message_log (
        id, message_sid, account_sid, direction,
        from_number, to_number, body, status, raw_webhook_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(),
        messageSid,
        this.accountSid,
        "outbound",
        this.fromNumber,
        to,
        body,
        rawResponse.status || "queued",
        JSON.stringify(rawResponse),
      ],
    );
  }

  /**
   * Update message status from callback
   */
  async updateMessageStatus(
    messageSid: string,
    status: string,
    errorCode?: string,
    errorMessage?: string,
    rawPayload?: any,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE twilio_message_log 
       SET status = $1, error_code = $2, error_message = $3, 
           status_callback_received_at = NOW(), raw_status_payload = $4,
           updated_at = NOW()
       WHERE message_sid = $5`,
      [
        status,
        errorCode,
        errorMessage,
        rawPayload ? JSON.stringify(rawPayload) : null,
        messageSid,
      ],
    );

    this.logger.debug({
      msg: "Message status updated",
      messageSid,
      status,
      errorCode,
    });
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(number: string): string {
    // Remove whatsapp: prefix
    let normalized = number.replace(/^whatsapp:/i, "");

    // Remove any non-digit characters except leading +
    const hasPlus = normalized.startsWith("+");
    normalized = normalized.replace(/\D/g, "");

    if (hasPlus || normalized.length > 10) {
      return "+" + normalized;
    }

    return normalized;
  }

  /**
   * Extract location from message body (Google Maps URLs, coordinates)
   */
  private extractLocationFromBody(
    body: string,
  ): ParsedTwilioMessage["locationFromBody"] | undefined {
    if (!body) return undefined;

    // Pattern 1: Google Maps URL with coordinates
    // https://maps.google.com/?q=30.0444,31.2357
    // https://www.google.com/maps?q=30.0444,31.2357
    // https://goo.gl/maps/xxxxx
    const googleMapsRegex =
      /https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com|goo\.gl\/maps)[^\s]*/i;
    const mapUrlMatch = body.match(googleMapsRegex);

    if (mapUrlMatch) {
      const url = mapUrlMatch[0];

      // Try to extract coordinates from URL
      const coordsRegex = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const coordsMatch = url.match(coordsRegex);

      if (coordsMatch) {
        return {
          url,
          coordinates: {
            lat: parseFloat(coordsMatch[1]),
            lng: parseFloat(coordsMatch[2]),
          },
        };
      }

      // URL found but no coordinates parsed
      return { url };
    }

    // Pattern 2: Apple Maps URL
    const appleMapsRegex = /https?:\/\/maps\.apple\.com[^\s]*/i;
    const appleMatch = body.match(appleMapsRegex);
    if (appleMatch) {
      const url = appleMatch[0];
      const llRegex = /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const llMatch = url.match(llRegex);

      if (llMatch) {
        return {
          url,
          coordinates: {
            lat: parseFloat(llMatch[1]),
            lng: parseFloat(llMatch[2]),
          },
        };
      }

      return { url };
    }

    // Pattern 3: Direct coordinates in text
    // Format: 30.0444, 31.2357 or 30.0444,31.2357
    const directCoordsRegex = /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;
    const directMatch = body.match(directCoordsRegex);

    if (directMatch) {
      const lat = parseFloat(directMatch[1]);
      const lng = parseFloat(directMatch[2]);

      // Validate coordinates are in valid range
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return {
          coordinates: { lat, lng },
        };
      }
    }

    return undefined;
  }
}

/**
 * Mock Twilio adapter for testing
 */
@Injectable()
export class MockTwilioWhatsAppAdapter implements ITwilioWhatsAppAdapter {
  private readonly logger = new Logger(MockTwilioWhatsAppAdapter.name);
  private sentMessages: Array<{ to: string; body: string; timestamp: Date }> =
    [];

  validateSignature(
    signature: string,
    url: string,
    body: Record<string, string>,
  ): boolean {
    this.logger.debug("Mock signature validation - always returns true");
    return true;
  }

  parseWebhook(payload: TwilioWebhookPayload): ParsedTwilioMessage {
    return {
      messageSid: payload.MessageSid || `mock_${Date.now()}`,
      accountSid: payload.AccountSid || "mock_account",
      fromNumber: payload.From?.replace("whatsapp:", "") || "+201234567890",
      fromWhatsApp: payload.From || "whatsapp:+201234567890",
      toNumber: payload.To?.replace("whatsapp:", "") || "+14155238886",
      toWhatsApp: payload.To || "whatsapp:+14155238886",
      body: payload.Body || "",
      hasMedia: parseInt(payload.NumMedia || "0", 10) > 0,
      mediaCount: parseInt(payload.NumMedia || "0", 10),
      mediaUrls: payload.MediaUrl0 ? [payload.MediaUrl0] : [],
      mediaContentTypes: payload.MediaContentType0
        ? [payload.MediaContentType0]
        : [],
      hasLocation: !!(payload.Latitude && payload.Longitude),
      latitude: payload.Latitude ? parseFloat(payload.Latitude) : undefined,
      longitude: payload.Longitude ? parseFloat(payload.Longitude) : undefined,
      isVoiceNote: payload.MediaContentType0?.startsWith("audio/") || false,
      audioUrl: payload.MediaContentType0?.startsWith("audio/")
        ? payload.MediaUrl0
        : undefined,
      audioContentType: payload.MediaContentType0?.startsWith("audio/")
        ? payload.MediaContentType0
        : undefined,
      isButtonResponse: false,
      rawPayload: payload,
    };
  }

  parseStatusCallback(payload: TwilioStatusPayload): {
    messageSid: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
  } {
    return {
      messageSid: payload.MessageSid,
      status: payload.MessageStatus,
      errorCode: payload.ErrorCode,
      errorMessage: payload.ErrorMessage,
    };
  }

  async getMerchantByWhatsAppNumber(
    whatsappNumber: string,
  ): Promise<MerchantPhoneMapping | null> {
    // Return mock merchant for testing
    return {
      merchantId: "merchant_001",
      phoneNumber: "+14155238886",
      whatsappNumber: "whatsapp:+14155238886",
      displayName: "Test Merchant",
      isSandbox: true,
    };
  }

  async downloadMedia(
    mediaUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    this.logger.debug("Mock media download");
    // Return mock audio buffer
    return {
      buffer: Buffer.from("mock audio data"),
      contentType: "audio/ogg",
    };
  }

  async sendTextMessage(to: string, body: string): Promise<TwilioSendResult> {
    this.logger.log({
      msg: "Mock send text message",
      to,
      bodyLength: body.length,
    });
    this.sentMessages.push({ to, body, timestamp: new Date() });

    return {
      success: true,
      messageSid: `SM_mock_${Date.now()}`,
      status: "queued",
    };
  }

  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<TwilioSendResult> {
    this.logger.log({ msg: "Mock send media message", to, mediaUrl, caption });
    return {
      success: true,
      messageSid: `SM_mock_${Date.now()}`,
      status: "queued",
    };
  }

  async logInboundMessage(
    parsed: ParsedTwilioMessage,
    messageId?: string,
  ): Promise<string> {
    this.logger.debug("Mock log inbound message");
    return `log_${Date.now()}`;
  }

  async updateMessageStatus(messageSid: string, status: string): Promise<void> {
    this.logger.debug({ msg: "Mock update status", messageSid, status });
  }

  // Test helper
  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
  }
}
