import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import * as crypto from "crypto";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  ChannelAdapterInterface,
  InboundMessage,
  OutboundMediaMessage,
} from "./channel.adapter.interface";

interface MessengerAttachment {
  type: string;
  payload?: {
    url?: string;
  };
}

interface MessengerWebhookPayload {
  object: string;
  entry?: Array<{
    id?: string;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        attachments?: MessengerAttachment[];
      };
    }>;
  }>;
}

export const META_MESSENGER_ADAPTER = Symbol("META_MESSENGER_ADAPTER");

export interface IMessengerAdapter extends ChannelAdapterInterface {
  sendTemplateMessage(
    recipientId: string,
    templatePayload: Record<string, unknown>,
  ): Promise<void>;
  sendReadReceipt(recipientId: string): Promise<void>;
  resolveMerchantIdFromPayload(
    webhookPayload: unknown,
    recipientId?: string,
  ): Promise<string | null>;
}

@Injectable()
export class MessengerAdapter implements IMessengerAdapter {
  private readonly logger = new Logger(MessengerAdapter.name);
  private readonly graphBaseUrl =
    "https://graph.facebook.com/v18.0/me/messages";
  private readonly pageAccessToken: string;
  private readonly pageId: string;
  private readonly appSecret: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {
    this.pageAccessToken =
      this.configService.get<string>("MESSENGER_PAGE_ACCESS_TOKEN") || "";
    this.pageId = this.configService.get<string>("MESSENGER_PAGE_ID") || "";
    this.appSecret =
      this.configService.get<string>("MESSENGER_APP_SECRET") || "";

    if (!this.pageAccessToken) {
      this.logger.warn(
        "MESSENGER_PAGE_ACCESS_TOKEN is missing. Messenger send operations are disabled.",
      );
    }
  }

  validateSignature(payload: Buffer, signature: string): boolean;
  validateSignature(signature: string, payload: Buffer): boolean;
  validateSignature(
    payloadOrSignature: Buffer | string,
    signatureOrPayload: Buffer | string,
  ): boolean {
    const payload = Buffer.isBuffer(payloadOrSignature)
      ? payloadOrSignature
      : Buffer.isBuffer(signatureOrPayload)
        ? signatureOrPayload
        : Buffer.from(String(signatureOrPayload || ""));

    const signature = Buffer.isBuffer(payloadOrSignature)
      ? String(signatureOrPayload || "")
      : String(payloadOrSignature || "");

    if (!this.appSecret || !signature) {
      return false;
    }

    const expectedSig =
      "sha256=" +
      crypto.createHmac("sha256", this.appSecret).update(payload).digest("hex");

    if (expectedSig.length !== signature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(signature),
    );
  }

  parseInboundMessage(webhookPayload: unknown): InboundMessage | null {
    const payload = webhookPayload as MessengerWebhookPayload;
    if (payload?.object !== "page") {
      return null;
    }

    const entry = payload.entry?.[0];
    const event = entry?.messaging?.find(
      (item) =>
        item?.message &&
        item.message.is_echo !== true &&
        !!item.sender?.id &&
        !!item.recipient?.id,
    );

    if (!entry || !event || !event.message) {
      return null;
    }

    const attachment = event.message.attachments?.[0];
    const attachmentType = String(attachment?.type || "").toLowerCase();

    let messageType = "text";
    let text = String(event.message.text || "").trim();

    if (attachmentType === "image") {
      messageType = "image";
      if (!text) text = "[صورة]";
    } else if (attachmentType === "audio") {
      messageType = "audio";
      if (!text) text = "[رسالة صوتية]";
    } else if (attachmentType.length > 0) {
      messageType = attachmentType;
      if (!text) text = `[${attachmentType}]`;
    }

    return {
      channel: "messenger",
      messageId:
        String(event.message.mid || "").trim() ||
        `messenger-${Date.now().toString(36)}`,
      senderId: String(event.sender?.id || "").trim(),
      recipientId: String(event.recipient?.id || entry.id || "").trim(),
      text,
      messageType,
      hasMedia: !!attachment,
      mediaUrl: attachment?.payload?.url,
      timestamp: event.timestamp ? String(event.timestamp) : undefined,
      rawPayload: payload,
    };
  }

  async sendMessage(recipientId: string, message: string): Promise<void> {
    await this.sendApiRequest({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text: message },
    });
  }

  async sendMedia(
    recipientId: string,
    message: OutboundMediaMessage,
  ): Promise<void> {
    if (message.text?.trim()) {
      await this.sendMessage(recipientId, message.text.trim());
    }

    for (const item of message.media || []) {
      try {
        await this.sendApiRequest({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: {
            attachment: {
              type: "image",
              payload: {
                url: item.url,
                is_reusable: true,
              },
            },
          },
        });
        if (item.caption?.trim()) {
          await this.sendMessage(recipientId, item.caption.trim());
        }
      } catch {
        const fallback = item.fallbackText || item.caption;
        if (fallback?.trim()) {
          await this.sendMessage(recipientId, fallback.trim());
        }
      }
    }
  }

  async sendTemplateMessage(
    recipientId: string,
    templatePayload: Record<string, unknown>,
  ): Promise<void> {
    await this.sendApiRequest({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: {
        attachment: {
          type: "template",
          payload: templatePayload,
        },
      },
    });
  }

  async sendReadReceipt(recipientId: string): Promise<void> {
    await this.sendApiRequest({
      recipient: { id: recipientId },
      sender_action: "mark_seen",
    });
  }

  async sendTypingIndicator(recipientId: string): Promise<void> {
    await this.sendApiRequest({
      recipient: { id: recipientId },
      sender_action: "typing_on",
    });
  }

  async resolveMerchantIdFromPayload(
    webhookPayload: unknown,
    recipientId?: string,
  ): Promise<string | null> {
    const payload = webhookPayload as MessengerWebhookPayload;
    const entryId = String(payload?.entry?.[0]?.id || "").trim();
    const resolvedRecipient = String(recipientId || "").trim() || entryId;
    if (!resolvedRecipient) {
      return null;
    }

    const providerCandidates = [
      "meta_messenger",
      "messenger",
      "facebook_messenger",
      "meta_facebook",
    ];

    const configKeys = [
      "pageid",
      "page_id",
      "messengerpageid",
      "messenger_page_id",
    ];

    const integrationMatch = await this.pool.query<{ merchant_id: string }>(
      `SELECT merchant_id
       FROM integration_endpoints
       WHERE status = 'ACTIVE'
         AND lower(provider) = ANY($1::text[])
         AND EXISTS (
           SELECT 1
           FROM jsonb_each_text(config) kv
           WHERE lower(kv.key) = ANY($2::text[])
             AND kv.value = $3
         )
       ORDER BY updated_at DESC
       LIMIT 1`,
      [providerCandidates, configKeys, resolvedRecipient],
    );

    if (integrationMatch.rows.length > 0) {
      return integrationMatch.rows[0].merchant_id;
    }

    const phoneMappingMatch = await this.pool.query<{ merchant_id: string }>(
      `SELECT merchant_id
       FROM merchant_phone_numbers
       WHERE is_active = true
         AND EXISTS (
           SELECT 1
           FROM jsonb_each_text(COALESCE(metadata, '{}'::jsonb)) kv
           WHERE lower(kv.key) = ANY($1::text[])
             AND kv.value = $2
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [configKeys, resolvedRecipient],
    );

    if (phoneMappingMatch.rows.length > 0) {
      return phoneMappingMatch.rows[0].merchant_id;
    }

    if (this.pageId && this.pageId === resolvedRecipient) {
      const fallback = await this.pool.query<{ merchant_id: string }>(
        `SELECT merchant_id
         FROM integration_endpoints
         WHERE status = 'ACTIVE'
           AND lower(provider) = ANY($1::text[])
         ORDER BY updated_at DESC
         LIMIT 1`,
        [providerCandidates],
      );

      if (fallback.rows.length > 0) {
        return fallback.rows[0].merchant_id;
      }
    }

    return null;
  }

  private async sendApiRequest(body: Record<string, unknown>): Promise<void> {
    if (!this.pageAccessToken) {
      throw new Error("MESSENGER_PAGE_ACCESS_TOKEN is not configured");
    }

    const response = await fetch(this.graphBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.pageAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const details =
        (result as any)?.error?.message ||
        (result as any)?.error?.error_user_msg ||
        `HTTP ${response.status}`;
      this.logger.error({ msg: "Messenger Send API error", details, result });
      throw new Error(details);
    }
  }
}
