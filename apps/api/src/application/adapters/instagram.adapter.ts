import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import * as crypto from "crypto";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  ChannelAdapterInterface,
  InboundMessage,
} from "./channel.adapter.interface";

interface InstagramAttachment {
  type: string;
  payload?: {
    url?: string;
  };
}

interface InstagramWebhookPayload {
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
        attachments?: InstagramAttachment[];
      };
    }>;
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          to?: string;
          timestamp?: string;
          text?: { body?: string };
          image?: { id?: string; url?: string; mime_type?: string };
          audio?: { id?: string; url?: string; mime_type?: string };
        }>;
      };
    }>;
  }>;
}

export const META_INSTAGRAM_ADAPTER = Symbol("META_INSTAGRAM_ADAPTER");

export interface IInstagramAdapter extends ChannelAdapterInterface {
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
export class InstagramAdapter implements IInstagramAdapter {
  private readonly logger = new Logger(InstagramAdapter.name);
  private readonly graphBaseUrl =
    "https://graph.facebook.com/v18.0/me/messages";
  private readonly pageAccessToken: string;
  private readonly accountId: string;
  private readonly appSecret: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {
    this.pageAccessToken =
      this.configService.get<string>("INSTAGRAM_PAGE_ACCESS_TOKEN") || "";
    this.accountId =
      this.configService.get<string>("INSTAGRAM_ACCOUNT_ID") || "";
    this.appSecret =
      this.configService.get<string>("MESSENGER_APP_SECRET") ||
      this.configService.get<string>("META_APP_SECRET") ||
      "";

    if (!this.pageAccessToken) {
      this.logger.warn(
        "INSTAGRAM_PAGE_ACCESS_TOKEN is missing. Instagram send operations are disabled.",
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
    const payload = webhookPayload as InstagramWebhookPayload;
    if (payload?.object !== "instagram") {
      return null;
    }

    const entry = payload.entry?.[0];
    if (!entry) {
      return null;
    }

    // Flow A: messaging[] format (Messenger-like)
    const messagingEvent = entry.messaging?.find(
      (item) =>
        item?.message &&
        item.message.is_echo !== true &&
        !!item.sender?.id &&
        !!item.recipient?.id,
    );

    if (messagingEvent?.message) {
      const attachment = messagingEvent.message.attachments?.[0];
      const attachmentType = String(attachment?.type || "").toLowerCase();

      let messageType = "text";
      let text = String(messagingEvent.message.text || "").trim();

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
        channel: "instagram",
        messageId:
          String(messagingEvent.message.mid || "").trim() ||
          `instagram-${Date.now().toString(36)}`,
        senderId: String(messagingEvent.sender?.id || "").trim(),
        recipientId: String(
          messagingEvent.recipient?.id || entry.id || "",
        ).trim(),
        text,
        messageType,
        hasMedia: !!attachment,
        mediaUrl: attachment?.payload?.url,
        timestamp: messagingEvent.timestamp
          ? String(messagingEvent.timestamp)
          : undefined,
        rawPayload: payload,
      };
    }

    // Flow B: changes[].value.messages[] format
    const igMessage = entry.changes?.[0]?.value?.messages?.[0];
    if (!igMessage) {
      return null;
    }

    const hasImage = !!igMessage.image;
    const hasAudio = !!igMessage.audio;

    let messageType = "text";
    if (hasImage) messageType = "image";
    if (hasAudio) messageType = "audio";

    let text = String(igMessage.text?.body || "").trim();
    if (!text && hasImage) text = "[صورة]";
    if (!text && hasAudio) text = "[رسالة صوتية]";

    return {
      channel: "instagram",
      messageId:
        String(igMessage.id || "").trim() ||
        `instagram-${Date.now().toString(36)}`,
      senderId: String(igMessage.from || "").trim(),
      recipientId: String(igMessage.to || entry.id || "").trim(),
      text,
      messageType,
      hasMedia: hasImage || hasAudio,
      mediaId: igMessage.image?.id || igMessage.audio?.id,
      mediaUrl: igMessage.image?.url || igMessage.audio?.url,
      mediaMimeType: igMessage.image?.mime_type || igMessage.audio?.mime_type,
      timestamp: igMessage.timestamp,
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
    const payload = webhookPayload as InstagramWebhookPayload;
    const entryId = String(payload?.entry?.[0]?.id || "").trim();
    const resolvedRecipient = String(recipientId || "").trim() || entryId;
    if (!resolvedRecipient) {
      return null;
    }

    const providerCandidates = ["meta_instagram", "instagram"];
    const configKeys = [
      "instagramaccountid",
      "instagram_account_id",
      "accountid",
      "account_id",
      "pageid",
      "page_id",
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

    if (this.accountId && this.accountId === resolvedRecipient) {
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
      throw new Error("INSTAGRAM_PAGE_ACCESS_TOKEN is not configured");
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
      this.logger.error({ msg: "Instagram Send API error", details, result });
      throw new Error(details);
    }
  }
}
