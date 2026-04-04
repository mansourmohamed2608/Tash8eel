import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  ChannelAdapterInterface,
  InboundMessage,
} from "./channel.adapter.interface";

// ============================================================================
// Meta Cloud API Types
// https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
// ============================================================================

/**
 * Meta Cloud API inbound webhook — Notification payload
 * POST from Meta servers to our webhook endpoint
 */
export interface MetaWebhookPayload {
  object: "whatsapp_business_account";
  entry: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id: string; // WABA ID
  changes: MetaWebhookChange[];
}

export interface MetaWebhookChange {
  value: MetaWebhookValue;
  field: "messages";
}

export interface MetaWebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaContact[];
  messages?: MetaInboundMessage[];
  statuses?: MetaStatusUpdate[];
  errors?: MetaError[];
}

export interface MetaContact {
  profile: { name: string };
  wa_id: string; // WhatsApp ID (phone number)
}

export interface MetaInboundMessage {
  from: string; // sender WhatsApp ID (phone number)
  id: string; // wamid.xxx
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "location"
    | "contacts"
    | "interactive"
    | "button"
    | "reaction"
    | "sticker"
    | "order";
  text?: { body: string };
  image?: MetaMediaObject;
  audio?: MetaMediaObject;
  video?: MetaMediaObject;
  document?: MetaMediaObject & { filename?: string };
  sticker?: MetaMediaObject;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
  contacts?: any[];
  context?: { from: string; id: string }; // reply context
  errors?: MetaError[];
}

export interface MetaMediaObject {
  id: string; // media ID — use to download
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface MetaStatusUpdate {
  id: string; // wamid
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; origin: { type: string } };
  pricing?: { billable: boolean; pricing_model: string; category: string };
  errors?: MetaError[];
}

export interface MetaError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

// ============================================================================
// Normalized types (compatible with the rest of our codebase)
// Same interface as old Twilio adapter so downstream code doesn't change
// ============================================================================

export interface ParsedWhatsAppMessage {
  messageId: string; // wamid.xxx
  messageType: string;
  wabaId: string; // WhatsApp Business Account ID
  phoneNumberId: string; // Business phone number ID
  fromNumber: string; // Sender phone: +201234567890
  toNumber: string; // Business phone: +201234567890
  body: string;
  profileName?: string;
  waId?: string; // sender WhatsApp ID

  // Media
  hasMedia: boolean;
  mediaCount: number;
  mediaIds: string[];
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
  audioMediaId?: string;
  audioContentType?: string;

  // Button / Interactive response
  isButtonResponse: boolean;
  buttonText?: string;
  buttonPayload?: string;

  // Raw payload for logging
  rawPayload: MetaWebhookPayload;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface MerchantPhoneMapping {
  merchantId: string;
  phoneNumber: string;
  whatsappNumber: string;
  phoneNumberId?: string;
  displayName?: string;
  isSandbox: boolean;
}

// ============================================================================
// DI Token + Interface
// ============================================================================

export const META_WHATSAPP_ADAPTER = Symbol("META_WHATSAPP_ADAPTER");

export interface IMetaWhatsAppAdapter extends ChannelAdapterInterface {
  // Webhook verification (GET challenge-response)
  verifyWebhook(mode: string, token: string, challenge: string): string | null;

  // Signature validation (X-Hub-Signature-256)
  validateSignature(signature: string, rawBody: Buffer): boolean;
  validateSignature(rawBody: Buffer, signature: string): boolean;

  // Parsing
  parseWebhook(payload: MetaWebhookPayload): ParsedWhatsAppMessage | null;
  parseInboundMessage(webhookPayload: unknown): InboundMessage | null;
  parseStatusUpdates(payload: MetaWebhookPayload): MetaStatusUpdate[];

  // Generic channel interface wrappers
  sendMessage(recipientId: string, message: string): Promise<void>;
  sendTypingIndicator(recipientId: string): Promise<void>;

  // Merchant lookup
  getMerchantByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<MerchantPhoneMapping | null>;
  getMerchantByWhatsAppNumber(
    whatsappNumber: string,
  ): Promise<MerchantPhoneMapping | null>;

  // Media download (via Graph API)
  downloadMedia(
    mediaId: string,
  ): Promise<{ buffer: Buffer; contentType: string }>;

  // Outbound messaging (Graph API)
  sendTextMessage(
    to: string,
    body: string,
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult>;
  markMessageRead(
    messageId: string,
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult>;
  sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult>;
  sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components?: any[],
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult>;

  // Logging
  logInboundMessage(
    parsed: ParsedWhatsAppMessage,
    messageId?: string,
  ): Promise<string>;
  updateMessageStatus(
    waMessageId: string,
    status: string,
    errorCode?: string,
    errorMessage?: string,
    rawPayload?: any,
  ): Promise<void>;
}

// ============================================================================
// IMPLEMENTATION — Meta Cloud API v21.0
// ============================================================================

@Injectable()
export class MetaWhatsAppAdapter implements IMetaWhatsAppAdapter {
  private readonly logger = new Logger(MetaWhatsAppAdapter.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly wabaId: string;
  private readonly webhookVerifyToken: string;
  private readonly appSecret: string;
  private readonly apiVersion = "v21.0";
  private readonly graphBaseUrl = "https://graph.facebook.com";

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {
    this.accessToken =
      this.configService.get<string>("META_ACCESS_TOKEN") || "";
    this.phoneNumberId =
      this.configService.get<string>("META_PHONE_NUMBER_ID") || "";
    this.wabaId = this.configService.get<string>("META_WABA_ID") || "";
    this.webhookVerifyToken =
      this.configService.get<string>("WEBHOOK_VERIFY_TOKEN") || "";
    this.appSecret = this.configService.get<string>("META_APP_SECRET") || "";

    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn(
        "Meta Cloud API credentials not configured. Adapter will operate in mock mode.",
      );
    }
  }

  // ============================================================================
  // WEBHOOK VERIFICATION (GET /webhooks/meta/whatsapp)
  // Meta sends: hub.mode=subscribe, hub.verify_token=<your_token>, hub.challenge=<int>
  // ============================================================================

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (!this.webhookVerifyToken) {
      this.logger.error(
        "WEBHOOK_VERIFY_TOKEN is not configured. Rejecting Meta webhook verification.",
      );
      return null;
    }

    if (mode === "subscribe" && token === this.webhookVerifyToken) {
      this.logger.log("Webhook verification successful");
      return challenge;
    }
    this.logger.warn({
      msg: "Webhook verification failed",
      mode,
      tokenMatch: token === this.webhookVerifyToken,
    });
    return null;
  }

  private sanitizeInboundText(value?: string): string {
    if (!value) return "";
    return value.replace(/<[^>]*>/g, "");
  }

  // ============================================================================
  // SIGNATURE VALIDATION (X-Hub-Signature-256 header)
  // HMAC-SHA256 of raw body using App Secret
  // ============================================================================

  validateSignature(rawBody: Buffer, signature: string): boolean;
  validateSignature(signature: string, rawBody: Buffer): boolean;
  validateSignature(arg1: string | Buffer, arg2: string | Buffer): boolean {
    const signature = typeof arg1 === "string" ? arg1 : String(arg2 || "");
    const rawBody = Buffer.isBuffer(arg1)
      ? arg1
      : Buffer.isBuffer(arg2)
        ? arg2
        : Buffer.from(String(arg2 || ""));

    if (!this.appSecret) {
      this.logger.error(
        "META_APP_SECRET is not configured. Rejecting all webhook requests.",
      );
      return false;
    }

    if (!signature) {
      this.logger.warn("Missing X-Hub-Signature-256 header");
      return false;
    }

    const expectedSig =
      "sha256=" +
      crypto.createHmac("sha256", this.appSecret).update(rawBody).digest("hex");

    if (signature.length !== expectedSig.length) {
      this.logger.warn({ msg: "Invalid Meta webhook signature length" });
      return false;
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig),
    );

    if (!isValid) {
      this.logger.warn({ msg: "Invalid Meta webhook signature" });
    }

    return isValid;
  }

  // ============================================================================
  // PARSE INBOUND MESSAGE from Meta webhook
  // ============================================================================

  parseWebhook(payload: MetaWebhookPayload): ParsedWhatsAppMessage | null {
    if (!payload.entry?.length) return null;

    const entry = payload.entry[0];
    const change = entry.changes?.[0];
    if (!change?.value?.messages?.length) return null;

    const value = change.value;
    const msg = value.messages?.[0];
    if (!msg) return null;
    const contact = value.contacts?.[0];

    // Extract media
    const mediaIds: string[] = [];
    const mediaContentTypes: string[] = [];
    let hasMedia = false;
    let isVoiceNote = false;
    let audioMediaId: string | undefined;
    let audioContentType: string | undefined;

    if (msg.type === "image" && msg.image) {
      hasMedia = true;
      mediaIds.push(msg.image.id);
      mediaContentTypes.push(msg.image.mime_type);
    } else if (msg.type === "audio" && msg.audio) {
      hasMedia = true;
      isVoiceNote = true;
      mediaIds.push(msg.audio.id);
      mediaContentTypes.push(msg.audio.mime_type);
      audioMediaId = msg.audio.id;
      audioContentType = msg.audio.mime_type;
    } else if (msg.type === "video" && msg.video) {
      hasMedia = true;
      mediaIds.push(msg.video.id);
      mediaContentTypes.push(msg.video.mime_type);
    } else if (msg.type === "document" && msg.document) {
      hasMedia = true;
      mediaIds.push(msg.document.id);
      mediaContentTypes.push(msg.document.mime_type);
    } else if (msg.type === "sticker" && msg.sticker) {
      hasMedia = true;
      mediaIds.push(msg.sticker.id);
      mediaContentTypes.push(msg.sticker.mime_type);
    }

    // Extract text
    let body = "";
    if (msg.type === "text" && msg.text) {
      body = this.sanitizeInboundText(msg.text.body);
    } else if (msg.image?.caption) {
      body = msg.image.caption;
    } else if (msg.video?.caption) {
      body = msg.video.caption;
    } else if (msg.document?.caption) {
      body = msg.document.caption;
    }

    // Extract location
    let hasLocation = false;
    let latitude: number | undefined;
    let longitude: number | undefined;
    if (msg.type === "location" && msg.location) {
      hasLocation = true;
      latitude = msg.location.latitude;
      longitude = msg.location.longitude;
    }

    // Try to extract location from body (Google Maps URLs etc.)
    const locationFromBody = this.extractLocationFromBody(body);
    if (locationFromBody?.coordinates) {
      hasLocation = true;
      if (!latitude) latitude = locationFromBody.coordinates.lat;
      if (!longitude) longitude = locationFromBody.coordinates.lng;
    }

    // Button / interactive responses
    let isButtonResponse = false;
    let buttonText: string | undefined;
    let buttonPayload: string | undefined;
    if (msg.type === "interactive" && msg.interactive) {
      isButtonResponse = true;
      if (msg.interactive.button_reply) {
        buttonText = this.sanitizeInboundText(
          msg.interactive.button_reply.title,
        );
        buttonPayload = msg.interactive.button_reply.id;
      } else if (msg.interactive.list_reply) {
        buttonText = this.sanitizeInboundText(msg.interactive.list_reply.title);
        buttonPayload = msg.interactive.list_reply.id;
      }
    } else if (msg.type === "button" && msg.button) {
      isButtonResponse = true;
      buttonText = this.sanitizeInboundText(msg.button.text);
      buttonPayload = msg.button.payload;
    }

    const fromNumber = this.normalizePhoneNumber(msg.from);

    const result: ParsedWhatsAppMessage = {
      messageId: msg.id,
      messageType: msg.type,
      wabaId: entry.id,
      phoneNumberId: value.metadata.phone_number_id,
      fromNumber,
      toNumber: "+" + value.metadata.display_phone_number.replace(/\D/g, ""),
      body,
      profileName: contact?.profile?.name,
      waId: contact?.wa_id || msg.from,

      hasMedia,
      mediaCount: mediaIds.length,
      mediaIds,
      mediaContentTypes,

      hasLocation,
      latitude,
      longitude,
      locationFromBody,

      isVoiceNote,
      audioMediaId,
      audioContentType,

      isButtonResponse,
      buttonText,
      buttonPayload,

      rawPayload: payload,
    };

    this.logger.debug({
      msg: "Parsed Meta webhook",
      messageId: result.messageId,
      from: fromNumber,
      type: msg.type,
      hasMedia,
      isVoiceNote,
      hasLocation,
    });

    return result;
  }

  parseInboundMessage(webhookPayload: unknown): InboundMessage | null {
    const parsed = this.parseWebhook(webhookPayload as MetaWebhookPayload);
    if (!parsed) {
      return null;
    }

    return {
      channel: "whatsapp",
      messageId: parsed.messageId,
      senderId: parsed.fromNumber,
      recipientId: parsed.toNumber,
      text: parsed.body,
      messageType: parsed.messageType,
      hasMedia: parsed.hasMedia,
      mediaId: parsed.mediaIds[0],
      mediaMimeType: parsed.mediaContentTypes[0],
      rawPayload: parsed.rawPayload,
    };
  }

  async sendMessage(recipientId: string, message: string): Promise<void> {
    const result = await this.sendTextMessage(recipientId, message);
    if (!result.success) {
      throw new Error(result.errorMessage || "Failed to send WhatsApp message");
    }
  }

  async sendTypingIndicator(recipientId: string): Promise<void> {
    this.logger.debug({
      msg: "Typing indicator is not available for WhatsApp Cloud API",
      recipientId,
    });
  }

  // ============================================================================
  // PARSE STATUS UPDATES
  // ============================================================================

  parseStatusUpdates(payload: MetaWebhookPayload): MetaStatusUpdate[] {
    const statuses: MetaStatusUpdate[] = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.value?.statuses) {
          statuses.push(...change.value.statuses);
        }
      }
    }
    return statuses;
  }

  // ============================================================================
  // MERCHANT LOOKUP — by phone_number_id (Meta unique) or by phone number
  // ============================================================================

  async getMerchantByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<MerchantPhoneMapping | null> {
    const result = await this.pool.query(
      `SELECT merchant_id, phone_number, whatsapp_number, display_name, is_sandbox,
              metadata->>'phone_number_id' AS phone_number_id
       FROM merchant_phone_numbers
       WHERE metadata->>'phone_number_id' = $1 AND is_active = true
       LIMIT 1`,
      [phoneNumberId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      merchantId: row.merchant_id,
      phoneNumber: row.phone_number,
      whatsappNumber: row.whatsapp_number,
      phoneNumberId: row.phone_number_id,
      displayName: row.display_name,
      isSandbox: row.is_sandbox,
    };
  }

  async getMerchantByWhatsAppNumber(
    whatsappNumber: string,
  ): Promise<MerchantPhoneMapping | null> {
    // Normalize: remove whatsapp: prefix if present, ensure +
    const normalized = this.normalizePhoneNumber(whatsappNumber);

    const result = await this.pool.query(
      `SELECT merchant_id, phone_number, whatsapp_number, display_name, is_sandbox,
              metadata->>'phone_number_id' AS phone_number_id
       FROM merchant_phone_numbers
       WHERE (phone_number = $1 OR whatsapp_number = $1 OR whatsapp_number = $2) AND is_active = true
       LIMIT 1`,
      [normalized, `whatsapp:${normalized}`],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      merchantId: row.merchant_id,
      phoneNumber: row.phone_number,
      whatsappNumber: row.whatsapp_number,
      phoneNumberId: row.phone_number_id,
      displayName: row.display_name,
      isSandbox: row.is_sandbox,
    };
  }

  // ============================================================================
  // MEDIA DOWNLOAD via Graph API
  // Step 1: GET /{media-id} → get download URL
  // Step 2: GET download URL with Bearer token → binary
  // ============================================================================

  async downloadMedia(
    mediaId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.accessToken) {
      throw new BadRequestException(
        "Meta access token not configured for media download",
      );
    }

    this.logger.debug({ msg: "Downloading Meta media", mediaId });

    // Step 1: Get media URL
    const metaUrl = `${this.graphBaseUrl}/${this.apiVersion}/${mediaId}`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!metaRes.ok) {
      const err = await metaRes.text();
      throw new BadRequestException(
        `Failed to get media URL: ${metaRes.status} — ${err}`,
      );
    }

    const mediaInfo = (await metaRes.json()) as {
      url: string;
      mime_type: string;
      sha256: string;
      file_size: number;
      id: string;
    };

    // Step 2: Download binary
    const downloadRes = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!downloadRes.ok) {
      throw new BadRequestException(
        `Failed to download media: ${downloadRes.status}`,
      );
    }

    const contentType =
      mediaInfo.mime_type ||
      downloadRes.headers.get("content-type") ||
      "application/octet-stream";
    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    this.logger.debug({
      msg: "Media downloaded successfully",
      size: buffer.length,
      contentType,
    });

    return { buffer, contentType };
  }

  // ============================================================================
  // SEND TEXT MESSAGE
  // POST /{phone-number-id}/messages
  // ============================================================================

  async sendTextMessage(
    to: string,
    body: string,
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult> {
    const pnId = phoneNumberId || this.phoneNumberId;
    if (!this.accessToken || !pnId) {
      this.logger.warn("Meta credentials not configured — message not sent");
      return {
        success: false,
        errorCode: "NO_CREDENTIALS",
        errorMessage: "Meta Cloud API credentials not configured",
      };
    }

    const normalizedTo = to.replace(/^whatsapp:/, "").replace(/^\+/, "");

    this.logger.log({
      msg: "Sending WhatsApp message via Meta",
      to: normalizedTo,
      bodyLength: body.length,
    });

    try {
      const url = `${this.graphBaseUrl}/${this.apiVersion}/${pnId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedTo,
          type: "text",
          text: { preview_url: false, body },
        }),
      });

      const result = (await response.json()) as any;

      if (!response.ok) {
        this.logger.error({
          msg: "Meta send failed",
          status: response.status,
          error: result.error,
        });
        return {
          success: false,
          errorCode: result.error?.code?.toString(),
          errorMessage:
            result.error?.message || result.error?.error_data?.details,
        };
      }

      const messageId = result.messages?.[0]?.id;
      this.logger.log({ msg: "WhatsApp message sent successfully", messageId });

      // Log outbound
      await this.logOutboundMessage(
        messageId,
        normalizedTo,
        body,
        pnId,
        result,
      );

      return { success: true, messageId, status: "sent" };
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

  async markMessageRead(
    messageId: string,
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult> {
    const pnId = phoneNumberId || this.phoneNumberId;
    if (!this.accessToken || !pnId) {
      return {
        success: false,
        errorCode: "NO_CREDENTIALS",
        errorMessage: "Meta Cloud API credentials not configured",
      };
    }

    try {
      const url = `${this.graphBaseUrl}/${this.apiVersion}/${pnId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      });

      const result = (await response.json()) as any;
      if (!response.ok) {
        return {
          success: false,
          errorCode: result.error?.code?.toString(),
          errorMessage:
            result.error?.message || result.error?.error_data?.details,
        };
      }

      return {
        success: true,
        messageId,
        status: "read",
      };
    } catch (error) {
      return {
        success: false,
        errorCode: "READ_ERROR",
        errorMessage: (error as Error).message,
      };
    }
  }

  // ============================================================================
  // SEND MEDIA MESSAGE (image/document/video by URL)
  // ============================================================================

  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult> {
    const pnId = phoneNumberId || this.phoneNumberId;
    if (!this.accessToken || !pnId) {
      return {
        success: false,
        errorCode: "NO_CREDENTIALS",
        errorMessage: "Meta credentials not configured",
      };
    }

    const normalizedTo = to.replace(/^whatsapp:/, "").replace(/^\+/, "");

    try {
      const url = `${this.graphBaseUrl}/${this.apiVersion}/${pnId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedTo,
          type: "image",
          image: { link: mediaUrl, caption: caption || undefined },
        }),
      });

      const result = (await response.json()) as any;

      if (!response.ok) {
        return {
          success: false,
          errorCode: result.error?.code?.toString(),
          errorMessage: result.error?.message,
        };
      }

      return {
        success: true,
        messageId: result.messages?.[0]?.id,
        status: "sent",
      };
    } catch (error) {
      return {
        success: false,
        errorCode: "SEND_ERROR",
        errorMessage: (error as Error).message,
      };
    }
  }

  // ============================================================================
  // SEND TEMPLATE MESSAGE (for first-contact / 24h window expired)
  // ============================================================================

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = "ar",
    components?: any[],
    phoneNumberId?: string,
  ): Promise<WhatsAppSendResult> {
    const pnId = phoneNumberId || this.phoneNumberId;
    if (!this.accessToken || !pnId) {
      return {
        success: false,
        errorCode: "NO_CREDENTIALS",
        errorMessage: "Meta credentials not configured",
      };
    }

    const normalizedTo = to.replace(/^whatsapp:/, "").replace(/^\+/, "");

    // Paid template quota enforcement (monthly)
    const merchantMapping = await this.getMerchantByPhoneNumberId(pnId);
    if (merchantMapping?.merchantId) {
      const limit = await this.getMerchantPaidTemplateLimit(
        merchantMapping.merchantId,
      );
      if (limit !== -1) {
        const used = await this.getPaidTemplatesUsedThisMonth(
          merchantMapping.merchantId,
        );
        if (used >= limit) {
          return {
            success: false,
            errorCode: "PAID_TEMPLATE_LIMIT_EXCEEDED",
            errorMessage: `Paid template monthly limit exceeded (${used}/${limit})`,
          };
        }
      }
    }

    try {
      const url = `${this.graphBaseUrl}/${this.apiVersion}/${pnId}/messages`;
      const payload: any = {
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      };
      if (components?.length) {
        payload.template.components = components;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as any;

      if (!response.ok) {
        return {
          success: false,
          errorCode: result.error?.code?.toString(),
          errorMessage: result.error?.message,
        };
      }

      const messageId = result.messages?.[0]?.id;
      if (messageId) {
        await this.logOutboundMessage(
          messageId,
          normalizedTo,
          templateName,
          pnId,
          {
            ...result,
            message_type: "template",
            template_name: templateName,
            language_code: languageCode,
          },
        );
      }

      if (merchantMapping?.merchantId) {
        await this.recordPaidTemplateUsage(
          merchantMapping.merchantId,
          templateName,
          pnId,
        );
      }

      return {
        success: true,
        messageId,
        status: "sent",
      };
    } catch (error) {
      return {
        success: false,
        errorCode: "SEND_ERROR",
        errorMessage: (error as Error).message,
      };
    }
  }

  // ============================================================================
  // LOG INBOUND MESSAGE to whatsapp_message_log
  // ============================================================================

  async logInboundMessage(
    parsed: ParsedWhatsAppMessage,
    messageId?: string,
  ): Promise<string> {
    const id = uuidv4();
    const sanitizedBody = this.sanitizeInboundText(parsed.body);

    try {
      await this.pool.query(
        `INSERT INTO whatsapp_message_log (
          id, message_id, wa_message_id, waba_id, phone_number_id, direction,
          from_number, to_number, body, num_media, media_ids, media_content_types,
          status, latitude, longitude, webhook_received_at, raw_webhook_payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16)`,
        [
          id,
          messageId,
          parsed.messageId,
          parsed.wabaId,
          parsed.phoneNumberId,
          "inbound",
          parsed.fromNumber,
          parsed.toNumber,
          sanitizedBody,
          parsed.mediaCount,
          JSON.stringify(parsed.mediaIds),
          JSON.stringify(parsed.mediaContentTypes),
          "received",
          parsed.latitude,
          parsed.longitude,
          JSON.stringify(parsed.rawPayload),
        ],
      );
    } catch (error: any) {
      if (error?.code === "23505") {
        const existing = await this.pool.query(
          `SELECT id FROM whatsapp_message_log
           WHERE wa_message_id = $1 AND direction = 'inbound'
           ORDER BY created_at DESC
           LIMIT 1`,
          [parsed.messageId],
        );
        if (existing.rows.length > 0) {
          this.logger.debug({
            msg: "Duplicate inbound webhook message ignored",
            waMessageId: parsed.messageId,
          });
          return existing.rows[0].id;
        }
      }
      throw error;
    }

    return id;
  }

  // ============================================================================
  // LOG OUTBOUND MESSAGE
  // ============================================================================

  private async logOutboundMessage(
    waMessageId: string,
    to: string,
    body: string,
    phoneNumberId: string,
    rawResponse: any,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO whatsapp_message_log (
        id, wa_message_id, waba_id, phone_number_id, direction,
        from_number, to_number, body, status, raw_webhook_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv4(),
        waMessageId,
        this.wabaId,
        phoneNumberId,
        "outbound",
        phoneNumberId, // we are the sender
        to,
        body,
        "sent",
        JSON.stringify(rawResponse),
      ],
    );
  }

  // ============================================================================
  // UPDATE MESSAGE STATUS
  // ============================================================================

  async updateMessageStatus(
    waMessageId: string,
    status: string,
    errorCode?: string,
    errorMessage?: string,
    rawPayload?: any,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE whatsapp_message_log 
       SET status = $1, error_code = $2, error_message = $3, 
           status_callback_received_at = NOW(), raw_status_payload = $4,
           updated_at = NOW()
       WHERE wa_message_id = $5`,
      [
        status,
        errorCode,
        errorMessage,
        rawPayload ? JSON.stringify(rawPayload) : null,
        waMessageId,
      ],
    );

    this.logger.debug({
      msg: "Message status updated",
      waMessageId,
      status,
      errorCode,
    });
  }

  private async getMerchantPaidTemplateLimit(
    merchantId: string,
  ): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT to_jsonb(m) as merchant_json
         FROM merchants m
         WHERE m.id = $1
         LIMIT 1`,
        [merchantId],
      );
      const merchantJson = result.rows[0]?.merchant_json || {};
      const limits = merchantJson.plan_limits || merchantJson.limits || {};
      const value =
        limits.paidTemplatesPerMonth ?? limits.paid_templates_per_month;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 15;
    } catch {
      return 15;
    }
  }

  private async getPaidTemplatesUsedThisMonth(
    merchantId: string,
  ): Promise<number> {
    const startOfMonth = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        1,
        0,
        0,
        0,
        0,
      ),
    );
    const endOfMonth = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
    const periodStart = startOfMonth.toISOString().slice(0, 10);

    try {
      const aggregate = await this.pool.query(
        `SELECT used_quantity
         FROM usage_period_aggregates
         WHERE merchant_id = $1
           AND metric_key = 'PAID_TEMPLATES'
           AND period_type = 'MONTHLY'
           AND period_start = $2::date
         LIMIT 1`,
        [merchantId, periodStart],
      );
      const used = Number(aggregate.rows[0]?.used_quantity || 0);
      if (Number.isFinite(used) && used > 0) {
        return used;
      }
    } catch {
      // fallback below
    }

    try {
      const fallback = await this.pool.query(
        `SELECT COUNT(*)::int as used
         FROM usage_ledger
         WHERE merchant_id = $1
           AND metric_key = 'PAID_TEMPLATES'
           AND period_type = 'MONTHLY'
           AND period_start = $2::date
           AND COALESCE(metadata->>'entryType', '') = 'CONSUME'`,
        [merchantId, periodStart],
      );
      return Number(fallback.rows[0]?.used || 0);
    } catch {
      return 0;
    }
  }

  private async recordPaidTemplateUsage(
    merchantId: string,
    templateName: string,
    phoneNumberId: string,
  ): Promise<void> {
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const endOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const periodStart = startOfMonth.toISOString().slice(0, 10);

    try {
      await this.pool.query(
        `INSERT INTO usage_ledger (
           merchant_id, metric_key, quantity, unit, period_type, period_start, period_end, metadata
         ) VALUES ($1, 'PAID_TEMPLATES', 1, 'count', 'MONTHLY', $2::date, $3::date, $4::jsonb)`,
        [
          merchantId,
          periodStart,
          endOfMonth.toISOString().slice(0, 10),
          JSON.stringify({
            entryType: "CONSUME",
            source: "META_TEMPLATE_SEND",
            templateName,
            phoneNumberId,
          }),
        ],
      );
    } catch {
      // optional in legacy environments
    }

    try {
      await this.pool.query(
        `INSERT INTO usage_period_aggregates (
           merchant_id, metric_key, period_type, period_start, period_end, used_quantity, metadata
         ) VALUES ($1, 'PAID_TEMPLATES', 'MONTHLY', $2::date, $3::date, 1, $4::jsonb)
         ON CONFLICT (merchant_id, metric_key, period_type, period_start)
         DO UPDATE SET
           used_quantity = usage_period_aggregates.used_quantity + 1,
           updated_at = NOW()`,
        [
          merchantId,
          periodStart,
          endOfMonth.toISOString().slice(0, 10),
          JSON.stringify({
            source: "META_TEMPLATE_SEND",
            templateName,
          }),
        ],
      );
    } catch {
      // optional in legacy environments
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private normalizePhoneNumber(number: string): string {
    let normalized = number.replace(/^whatsapp:/i, "");
    const hasPlus = normalized.startsWith("+");
    normalized = normalized.replace(/\D/g, "");
    if (hasPlus || normalized.length > 10) {
      return "+" + normalized;
    }
    return normalized;
  }

  private extractLocationFromBody(
    body: string,
  ): ParsedWhatsAppMessage["locationFromBody"] | undefined {
    if (!body) return undefined;

    // Google Maps URLs
    const googleMapsRegex =
      /https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com|goo\.gl\/maps)[^\s]*/i;
    const mapUrlMatch = body.match(googleMapsRegex);
    if (mapUrlMatch) {
      const url = mapUrlMatch[0];
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
      return { url };
    }

    // Apple Maps URLs
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

    // Direct coordinates
    const directCoordsRegex = /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;
    const directMatch = body.match(directCoordsRegex);
    if (directMatch) {
      const lat = parseFloat(directMatch[1]);
      const lng = parseFloat(directMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { coordinates: { lat, lng } };
      }
    }

    return undefined;
  }
}

// ============================================================================
// MOCK ADAPTER for testing
// ============================================================================

@Injectable()
export class MockMetaWhatsAppAdapter implements IMetaWhatsAppAdapter {
  private readonly logger = new Logger(MockMetaWhatsAppAdapter.name);
  private sentMessages: Array<{ to: string; body: string; timestamp: Date }> =
    [];

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    return challenge;
  }

  validateSignature(rawBody: Buffer, signature: string): boolean;
  validateSignature(signature: string, rawBody: Buffer): boolean;
  validateSignature(_arg1: string | Buffer, _arg2: string | Buffer): boolean {
    return true;
  }

  parseWebhook(payload: MetaWebhookPayload): ParsedWhatsAppMessage | null {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    if (!msg) return null;
    const contact = change?.value?.contacts?.[0];

    return {
      messageId: msg.id || `mock_${Date.now()}`,
      messageType: msg.type || "text",
      wabaId: entry?.id || "mock_waba",
      phoneNumberId: change?.value?.metadata?.phone_number_id || "mock_pn_id",
      fromNumber: "+" + (msg.from || "201234567890"),
      toNumber:
        "+" +
        (
          change?.value?.metadata?.display_phone_number || "201000000000"
        ).replace(/\D/g, ""),
      body: msg.text?.body || "",
      profileName: contact?.profile?.name,
      waId: contact?.wa_id || msg.from,
      hasMedia: false,
      mediaCount: 0,
      mediaIds: [],
      mediaContentTypes: [],
      hasLocation: false,
      isVoiceNote: false,
      isButtonResponse: false,
      rawPayload: payload,
    };
  }

  parseInboundMessage(webhookPayload: unknown): InboundMessage | null {
    const parsed = this.parseWebhook(webhookPayload as MetaWebhookPayload);
    if (!parsed) {
      return null;
    }

    return {
      channel: "whatsapp",
      messageId: parsed.messageId,
      senderId: parsed.fromNumber,
      recipientId: parsed.toNumber,
      text: parsed.body,
      messageType: parsed.messageType,
      hasMedia: parsed.hasMedia,
      mediaId: parsed.mediaIds[0],
      mediaMimeType: parsed.mediaContentTypes[0],
      rawPayload: parsed.rawPayload,
    };
  }

  parseStatusUpdates(payload: MetaWebhookPayload): MetaStatusUpdate[] {
    return [];
  }

  async getMerchantByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<MerchantPhoneMapping | null> {
    return {
      merchantId: "merchant_001",
      phoneNumber: "+201000000000",
      whatsappNumber: "+201000000000",
      displayName: "Test Merchant",
      isSandbox: true,
    };
  }

  async getMerchantByWhatsAppNumber(
    whatsappNumber: string,
  ): Promise<MerchantPhoneMapping | null> {
    return this.getMerchantByPhoneNumberId("mock");
  }

  async downloadMedia(
    mediaId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    return { buffer: Buffer.from("mock audio data"), contentType: "audio/ogg" };
  }

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    this.sentMessages.push({ to, body, timestamp: new Date() });
    return {
      success: true,
      messageId: `wamid_mock_${Date.now()}`,
      status: "sent",
    };
  }

  async sendMessage(recipientId: string, message: string): Promise<void> {
    await this.sendTextMessage(recipientId, message);
  }

  async sendTypingIndicator(recipientId: string): Promise<void> {
    return;
  }

  async markMessageRead(messageId: string): Promise<WhatsAppSendResult> {
    return {
      success: true,
      messageId,
      status: "read",
    };
  }

  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<WhatsAppSendResult> {
    return {
      success: true,
      messageId: `wamid_mock_${Date.now()}`,
      status: "sent",
    };
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
  ): Promise<WhatsAppSendResult> {
    return {
      success: true,
      messageId: `wamid_mock_${Date.now()}`,
      status: "sent",
    };
  }

  async logInboundMessage(
    parsed: ParsedWhatsAppMessage,
    messageId?: string,
  ): Promise<string> {
    return `log_${Date.now()}`;
  }

  async updateMessageStatus(
    waMessageId: string,
    status: string,
  ): Promise<void> {}

  getSentMessages() {
    return this.sentMessages;
  }
  clearSentMessages() {
    this.sentMessages = [];
  }
}
