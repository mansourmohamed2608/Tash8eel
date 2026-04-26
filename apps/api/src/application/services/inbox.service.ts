import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  LlmResult,
  LLMCallOptions,
  ConversationState as LlmConversationState,
  isObviouslyOffTopic,
} from "../llm/llm.service";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import { RedisService, Lock } from "../../infrastructure/redis/redis.service";
import {
  MerchantCategory,
  ConversationState,
  ActionType,
  OrderStatus,
  MessageDirection,
} from "../../shared/constants/enums";
import {
  IDeliveryAdapter,
  DELIVERY_ADAPTER,
} from "../adapters/delivery-adapter.interface";
import {
  TranscriptionAdapterFactory,
  TranscriptionResult,
} from "../adapters/transcription.adapter";
import { AddressDepthService } from "./address-depth.service";
import { PaymentService } from "./payment.service";
import { CustomerReorderService } from "./customer-reorder.service";
import { UsageGuardService } from "./usage-guard.service";
import { MessageRouterService } from "../llm/message-router.service";
import { OutboundMediaAttachment } from "../adapters/channel.adapter.interface";
import {
  DialogOrchestrator,
  DialogTurnResult,
} from "../dialog/dialog-orchestrator";
import { MerchantMemorySchemaService } from "../dialog/merchant-memory-schema.service";
import { BusinessContextClassifierService } from "../dialog/business-context-classifier.service";
import { SlotExtractorService } from "../dialog/slot-extractor.service";
import { MemoryCompressionService } from "./memory-compression.service";
import { AiV2Service } from "../ai-v2/ai-v2.service";
import { shouldUseAiReplyEngineV2 } from "../ai-v2/ai-reply-engine-flag";

// Repository imports
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import {
  IConversationRepository,
  CONVERSATION_REPOSITORY,
} from "../../domain/ports/conversation.repository";
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from "../../domain/ports/message.repository";
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from "../../domain/ports/order.repository";
import {
  IShipmentRepository,
  SHIPMENT_REPOSITORY,
} from "../../domain/ports/shipment.repository";
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from "../../domain/ports/customer.repository";
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from "../../domain/ports/catalog.repository";
import {
  IKnownAreaRepository,
  KNOWN_AREA_REPOSITORY,
} from "../../domain/ports/known-area.repository";

// Entity imports
import { Merchant } from "../../domain/entities/merchant.entity";
import {
  Conversation,
  ConversationContext,
} from "../../domain/entities/conversation.entity";
import { Customer } from "../../domain/entities/customer.entity";
import { Order } from "../../domain/entities/order.entity";
import { Address } from "../../shared/schemas";

export interface VoiceNoteParams {
  /** URL to the voice note audio file (e.g., from WhatsApp media URL) */
  mediaUrl?: string;
  /** Raw audio buffer if available */
  audioBuffer?: Buffer;
  /** MIME type of the audio (e.g., audio/ogg, audio/opus) */
  mimeType?: string;
  /** Duration in seconds (if known) */
  duration?: number;
}

export interface InboxMessageParams {
  merchantId: string;
  senderId: string;
  channel?: "whatsapp" | "messenger" | "instagram";
  text: string;
  messageType?: string;
  providerMessageId?: string;
  /** Voice note parameters - if provided, will be transcribed */
  voiceNote?: VoiceNoteParams;
  correlationId?: string;
  /**
   * The WhatsApp Business number that received this message.
   * Used to route the conversation to the correct branch when the merchant
   * operates multiple branches with distinct WA numbers.
   */
  destinationPhone?: string;
}

export interface InboxResponse {
  conversationId: string;
  replyText: string;
  mediaAttachments?: OutboundMediaAttachment[];
  action: ActionType;
  cart: any;
  markAsRead?: boolean;
  routingDecision?: string;
  modelUsed?: "gpt-4o" | "gpt-4o-mini";
  orderId?: string;
  orderNumber?: string;
  /** Transcription result if voice note was processed */
  transcription?: {
    text: string;
    confidence: number;
    duration: number;
    language: string;
  };
}

type OffTopicHandlingMode =
  | "normal"
  | "ai_redirect"
  | "deterministic_redirect"
  | "suppressed";

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly planCacheTtlSeconds: number;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: IOrderRepository,
    @Inject(SHIPMENT_REPOSITORY)
    private readonly shipmentRepo: IShipmentRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepo: ICatalogRepository,
    @Inject(KNOWN_AREA_REPOSITORY)
    private readonly knownAreaRepo: IKnownAreaRepository,
    @Inject(DELIVERY_ADAPTER)
    private readonly deliveryAdapter: IDeliveryAdapter,
    private readonly dialogOrchestrator: DialogOrchestrator,
    private readonly outboxService: OutboxService,
    private readonly redisService: RedisService,
    private readonly transcriptionFactory: TranscriptionAdapterFactory,
    private readonly addressDepthService: AddressDepthService,
    private readonly paymentService: PaymentService,
    private readonly customerReorderService: CustomerReorderService,
    private readonly usageGuard: UsageGuardService,
    private readonly messageRouter: MessageRouterService,
    private readonly merchantMemorySchema: MerchantMemorySchemaService,
    private readonly businessContextClassifier: BusinessContextClassifierService,
    private readonly slotExtractor: SlotExtractorService,
    private readonly memoryCompression: MemoryCompressionService,
    private readonly aiV2Service: AiV2Service,
  ) {
    this.planCacheTtlSeconds = Number(
      this.configService.get<string>("MERCHANT_PLAN_CACHE_TTL_SECONDS", "300"),
    );
  }

  private readonly LOCK_TTL_MS = 30000; // 30 seconds
  private readonly OFF_TOPIC_WINDOW_SECONDS = 10 * 60;
  private readonly OFF_TOPIC_REDIRECT_COOLDOWN_SECONDS = 90;
  private readonly OFF_TOPIC_AI_REPLY_MAX_TOKENS = 80;
  private readonly CONTINUITY_RESPONSE_AR =
    "لحظة واحدة من فضلك، بنعالج رسالتك السابقة...";
  private readonly VOICE_TRANSCRIPTION_ERROR_AR =
    "عذراً، مش قادرين نسمع الرسالة الصوتية. ممكن تكتب الطلب بدل منها؟";
  private readonly MESSAGE_LIMIT_EXCEEDED_AR =
    "عذراً، تم الوصول للحد الأقصى من الرسائل الشهرية لهذا التاجر. يرجى التواصل مع التاجر مباشرة أو المحاولة لاحقاً.";
  private readonly AI_REPLY_LIMIT_EXCEEDED_AR =
    "حالياً الرد التلقائي على الرسالة دي مش متاح. لو تقدر تبعتها كنص أو تحاول بعد شوية، هنكملك بأسرع شكل ممكن.";
  private readonly REORDER_CONFIRM_KEYWORDS = [
    "تمام",
    "أكد",
    "موافق",
    "اه",
    "ايوه",
    "نعم",
    "ok",
    "confirm",
    "اكد",
  ];

  private isBlockedForPlan(planName: string, messageType: string): boolean {
    if (String(planName || "").toLowerCase() !== "starter") {
      return false;
    }

    return [
      "audio",
      "voice",
      "image",
      "document",
      "sticker",
      "reaction",
    ].includes(String(messageType || "").toLowerCase());
  }

  async getMerchantPlanCached(
    merchantId: string,
  ): Promise<{ name: string; currency: string }> {
    const cacheKey = `merchant:plan:${merchantId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as {
          name?: string;
          currency?: string;
        };
        return {
          name: String(parsed.name || "starter").toLowerCase(),
          currency: String(parsed.currency || "EGP").toUpperCase(),
        };
      } catch {
        // Fall through to DB.
      }
    }

    const result = await this.pool.query<{
      plan_name: string;
      currency: string;
    }>(
      `SELECT
         LOWER(COALESCE(NULLIF(p.name, ''), NULLIF(p.code, ''), 'starter')) AS plan_name,
         UPPER(COALESCE(NULLIF(m.currency, ''), 'EGP')) AS currency
       FROM merchants m
       LEFT JOIN subscriptions s
         ON s.merchant_id = m.id
        AND s.status = 'ACTIVE'
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE m.id = $1
       ORDER BY s.created_at DESC NULLS LAST
       LIMIT 1`,
      [merchantId],
    );

    const snapshot = {
      name: String(result.rows[0]?.plan_name || "starter").toLowerCase(),
      currency: String(result.rows[0]?.currency || "EGP").toUpperCase(),
    };
    await this.redisService.set(
      cacheKey,
      JSON.stringify(snapshot),
      this.planCacheTtlSeconds,
    );
    return snapshot;
  }

  private normalizeAddress(raw?: Partial<Address>): Address | undefined {
    if (!raw) return undefined;

    return {
      city: raw.city,
      area: raw.area,
      street: raw.street,
      building: raw.building,
      floor: raw.floor,
      apartment: raw.apartment,
      landmark: raw.landmark,
      delivery_notes: raw.delivery_notes,
      raw_text: raw.raw_text,
      map_url: raw.map_url,
      coordinates: raw.coordinates,
      confidence: raw.confidence ?? 0,
      missing_fields: raw.missing_fields ?? [],
    };
  }

  /**
   * Check if merchant has exceeded their monthly message limit.
   * Uses UsageGuard canonical limits (plan + usage pack credits).
   */
  private async checkMonthlyMessageLimit(
    merchantId: string,
    consumeOneUnit = false,
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    try {
      const usage = consumeOneUnit
        ? await this.usageGuard.consume(merchantId, "MESSAGES", 1, {
            metadata: { source: "WHATSAPP_INBOUND" },
          })
        : await this.usageGuard.checkLimit(merchantId, "MESSAGES");
      return {
        allowed: usage.allowed,
        used: usage.used,
        limit: usage.limit,
      };
    } catch (error) {
      // Fail open — don't block messages on DB errors
      this.logger.error({
        message: "Error checking message limit",
        error: (error as Error).message,
      });
      return { allowed: true, used: 0, limit: -1 };
    }
  }

  private async checkAiReplyLimit(merchantId: string): Promise<{
    allowed: boolean;
    blockingMetric:
      | "total_messages_per_day"
      | "total_messages_per_month"
      | "ai_replies_per_day"
      | "ai_replies_per_month"
      | null;
  }> {
    try {
      return this.usageGuard.checkCustomerAiReplyQuota(merchantId);
    } catch (error) {
      this.logger.error({
        message: "Error checking AI reply limit",
        error: (error as Error).message,
      });
      return { allowed: true, blockingMetric: null };
    }
  }

  private shouldHardBlockAiReplyQuota(
    blockingMetric:
      | "total_messages_per_day"
      | "total_messages_per_month"
      | "ai_replies_per_day"
      | "ai_replies_per_month"
      | null,
  ): boolean {
    return (
      blockingMetric === "total_messages_per_day" ||
      blockingMetric === "total_messages_per_month"
    );
  }

  private buildQuotaAwareLlmOptions(
    baseOptions: LLMCallOptions,
    aiReplyQuota: {
      allowed: boolean;
      blockingMetric:
        | "total_messages_per_day"
        | "total_messages_per_month"
        | "ai_replies_per_day"
        | "ai_replies_per_month"
        | null;
    },
    messageType: string,
  ): { degraded: boolean; options: LLMCallOptions } {
    if (
      aiReplyQuota.allowed ||
      this.shouldHardBlockAiReplyQuota(aiReplyQuota.blockingMetric) ||
      String(messageType || "").toLowerCase() !== "text"
    ) {
      return { degraded: false, options: baseOptions };
    }

    return {
      degraded: true,
      options: {
        ...baseOptions,
        model: "gpt-4o-mini",
        maxTokens: Math.min(baseOptions.maxTokens ?? 180, 160),
        disableSimplifiedRetry: true,
      },
    };
  }

  private buildOffTopicCounterKey(
    merchantId: string,
    senderId: string,
  ): string {
    return `inbox:offtopic:${merchantId}:${senderId}`;
  }

  private buildOffTopicRedirectCooldownKey(
    merchantId: string,
    senderId: string,
  ): string {
    return `inbox:offtopic_redirected:${merchantId}:${senderId}`;
  }

  private buildDeterministicOffTopicRedirectReply(
    merchantName: string,
  ): string {
    return `ده خارج نطاق ${merchantName} عندي، بس لو محتاج أي حاجة تخص الطلب أو المنتجات أنا أكمل معاك.`;
  }

  private async classifyOffTopicHandling(
    merchantId: string,
    senderId: string,
    merchantName: string,
    messageText: string,
  ): Promise<{
    mode: OffTopicHandlingMode;
    count: number;
    replyText?: string;
  }> {
    if (!isObviouslyOffTopic(String(messageText || "").trim())) {
      return { mode: "normal", count: 0 };
    }

    const deterministicReply =
      this.buildDeterministicOffTopicRedirectReply(merchantName);

    if (!this.redisService.enabled) {
      return {
        mode: "ai_redirect",
        count: 1,
        replyText: deterministicReply,
      };
    }

    const counterKey = this.buildOffTopicCounterKey(merchantId, senderId);
    const cooldownKey = this.buildOffTopicRedirectCooldownKey(
      merchantId,
      senderId,
    );

    try {
      const count = await this.redisService.incr(counterKey);
      if (count === 1) {
        await this.redisService.expire(
          counterKey,
          this.OFF_TOPIC_WINDOW_SECONDS,
        );
      }

      if (count === 1) {
        return {
          mode: "ai_redirect",
          count,
          replyText: deterministicReply,
        };
      }

      if (count === 2 || count === 3) {
        await this.redisService.set(
          cooldownKey,
          "1",
          this.OFF_TOPIC_REDIRECT_COOLDOWN_SECONDS,
        );
        return {
          mode: "deterministic_redirect",
          count,
          replyText: deterministicReply,
        };
      }

      const recentRedirect = await this.redisService.get(cooldownKey);
      if (recentRedirect) {
        return { mode: "suppressed", count };
      }

      await this.redisService.set(
        cooldownKey,
        "1",
        this.OFF_TOPIC_REDIRECT_COOLDOWN_SECONDS,
      );
      return {
        mode: "deterministic_redirect",
        count,
        replyText: deterministicReply,
      };
    } catch (error) {
      this.logger.warn({
        message: "Off-topic throttling unavailable, failing open",
        merchantId,
        senderId,
        error: (error as Error).message,
      });
      return {
        mode: "ai_redirect",
        count: 1,
        replyText: deterministicReply,
      };
    }
  }

  /**
   * Process incoming message - main orchestration method
   */
  async processMessage(params: InboxMessageParams): Promise<InboxResponse> {
    const correlationId = params.correlationId || uuidv4();
    const startTime = Date.now();

    this.logger.log({
      message: "Processing incoming message",
      merchantId: params.merchantId,
      senderId: params.senderId,
      hasVoiceNote: !!params.voiceNote,
      correlationId,
    });

    // ── Monthly message limit check ──
    const messageLimit = await this.checkMonthlyMessageLimit(
      params.merchantId,
      true,
    );
    if (!messageLimit.allowed) {
      this.logger.warn({
        message: "Monthly message limit exceeded",
        merchantId: params.merchantId,
        used: messageLimit.used,
        limit: messageLimit.limit,
        correlationId,
      });
      return {
        conversationId: "",
        replyText: this.MESSAGE_LIMIT_EXCEEDED_AR,
        action: ActionType.ASK_CLARIFYING_QUESTION,
        cart: { items: [] },
      };
    }

    // Handle voice note transcription if provided
    let transcriptionResult: TranscriptionResult | undefined;
    let effectiveText = params.text;

    if (
      params.voiceNote &&
      (params.voiceNote.mediaUrl || params.voiceNote.audioBuffer)
    ) {
      try {
        transcriptionResult = await this.transcribeVoiceNote(
          params.voiceNote,
          correlationId,
        );
        // Use transcribed text if original text is empty or just contains media indicator
        if (
          !effectiveText ||
          effectiveText === "[voice note]" ||
          effectiveText === "[صوتية]"
        ) {
          effectiveText = transcriptionResult.text;
        } else {
          // Append transcription to existing text
          effectiveText = `${effectiveText}\n[صوتية: ${transcriptionResult.text}]`;
        }

        this.logger.log({
          message: "Voice note transcribed successfully",
          transcribedText: transcriptionResult.text.substring(0, 100),
          confidence: transcriptionResult.confidence,
          duration: transcriptionResult.duration,
          correlationId,
        });
      } catch (error) {
        this.logger.error({
          message: "Voice note transcription failed",
          error: (error as Error).message,
          correlationId,
        });

        // Return error message if no text fallback available
        if (
          !params.text ||
          params.text === "[voice note]" ||
          params.text === "[صوتية]"
        ) {
          return {
            conversationId: "",
            replyText: this.VOICE_TRANSCRIPTION_ERROR_AR,
            action: ActionType.ASK_CLARIFYING_QUESTION,
            cart: { items: [] },
          };
        }
        // Otherwise continue with the text that was provided
      }
    }

    // Acquire distributed lock to prevent race conditions
    const lockKey = `conversation:${params.merchantId}:${params.channel || "whatsapp"}:${params.senderId}`;
    const lock = await this.redisService.acquireLock(lockKey, this.LOCK_TTL_MS);

    if (!lock) {
      this.logger.warn({
        message:
          "Could not acquire conversation lock - returning continuity response",
        merchantId: params.merchantId,
        senderId: params.senderId,
        correlationId,
      });

      // Return continuity response instead of failing
      return {
        conversationId: "",
        replyText: this.CONTINUITY_RESPONSE_AR,
        action: ActionType.ASK_CLARIFYING_QUESTION,
        cart: { items: [] },
      };
    }

    try {
      // Use effective text (may be transcribed)
      const processParams = { ...params, text: effectiveText };
      const result = await this.processMessageWithLock(
        processParams,
        correlationId,
        startTime,
      );

      // Add transcription info to response if available
      if (transcriptionResult) {
        result.transcription = {
          text: transcriptionResult.text,
          confidence: transcriptionResult.confidence,
          duration: transcriptionResult.duration,
          language: transcriptionResult.language,
        };
      }

      return result;
    } finally {
      await lock.release();
      this.logger.debug({
        message: "Released conversation lock",
        lockKey,
        correlationId,
      });
    }
  }

  /**
   * Transcribe a voice note to text using the configured transcription adapter
   */
  private async transcribeVoiceNote(
    voiceNote: VoiceNoteParams,
    correlationId: string,
  ): Promise<TranscriptionResult> {
    const adapter = this.transcriptionFactory.getAdapter();

    // Validate MIME type if provided
    if (voiceNote.mimeType && !adapter.isSupported(voiceNote.mimeType)) {
      throw new BadRequestException(
        `Unsupported audio format: ${voiceNote.mimeType}`,
      );
    }

    const audioData = voiceNote.audioBuffer || voiceNote.mediaUrl;
    if (!audioData) {
      throw new BadRequestException("No audio data provided for voice note");
    }

    this.logger.debug({
      message: "Transcribing voice note",
      hasBuffer: !!voiceNote.audioBuffer,
      hasUrl: !!voiceNote.mediaUrl,
      mimeType: voiceNote.mimeType,
      duration: voiceNote.duration,
      correlationId,
    });

    return adapter.transcribe(audioData, {
      language: "ar", // Default to Arabic for Egyptian market
    });
  }

  /**
   * Process message after lock is acquired
   */
  private async processMessageWithLock(
    params: InboxMessageParams,
    correlationId: string,
    startTime: number,
  ): Promise<InboxResponse> {
    // 1. Load merchant
    const merchant = await this.merchantRepo.findById(params.merchantId);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${params.merchantId} not found`);
    }

    if (!merchant.isActive) {
      this.logger.warn({
        message:
          "Merchant is inactive (subscription expired) — suppressing reply",
        merchantId: params.merchantId,
        correlationId,
      });
      return {
        conversationId: "",
        replyText: "",
        action: ActionType.ASK_CLARIFYING_QUESTION,
        cart: { items: [] },
      };
    }

    // 2. Get or create conversation
    let conversation = await this.conversationRepo.findByMerchantAndSender(
      params.merchantId,
      params.senderId,
      params.channel,
    );

    if (!conversation || conversation.state === ConversationState.CLOSED) {
      conversation = await this.createNewConversation(
        params.merchantId,
        params.senderId,
        params.destinationPhone,
        params.channel,
      );
    }

    // 3. Get or create customer
    let customer = await this.customerRepo.findByMerchantAndSender(
      params.merchantId,
      params.senderId,
    );
    if (!customer) {
      customer = await this.createNewCustomer(
        params.merchantId,
        params.senderId,
      );
    }

    // Pre-fill collectedInfo from returning customer data so AI never re-asks
    if (customer.name || customer.phone || customer.address) {
      const existing = conversation.collectedInfo as any;
      const prefill: Record<string, any> = { ...existing };
      if (!existing?.customerName && customer.name)
        prefill.customerName = customer.name;
      if (!existing?.phone && customer.phone) prefill.phone = customer.phone;
      if (!existing?.address && customer.address)
        prefill.address = customer.address;
      const changed =
        prefill.customerName !== existing?.customerName ||
        prefill.phone !== existing?.phone ||
        prefill.address !== existing?.address;
      if (changed) {
        await this.conversationRepo.update(conversation.id, {
          collectedInfo: prefill,
        });
        conversation = { ...conversation, collectedInfo: prefill };
      }
    }

    // Provider-level idempotency guard (extra safety on top of webhook dedupe).
    if (params.providerMessageId) {
      const existingMessage = await this.messageRepo.findByProviderMessageId(
        params.merchantId,
        params.providerMessageId,
      );

      if (existingMessage?.direction === MessageDirection.INBOUND) {
        this.logger.warn({
          message: "Duplicate inbound message detected in inbox service",
          merchantId: params.merchantId,
          senderId: params.senderId,
          providerMessageId: params.providerMessageId,
          conversationId: existingMessage.conversationId,
          correlationId,
        });

        return {
          conversationId: existingMessage.conversationId,
          replyText: "",
          action: ActionType.ASK_CLARIFYING_QUESTION,
          cart: conversation.cart || { items: [] },
          markAsRead: true,
          routingDecision: "duplicate_inbound_ignored",
        };
      }
    }

    // 4. Store incoming message
    try {
      await this.messageRepo.create({
        conversationId: conversation.id,
        merchantId: params.merchantId,
        providerMessageId: params.providerMessageId,
        senderId: params.senderId,
        direction: MessageDirection.INBOUND,
        text: params.text,
      });
    } catch (error) {
      const pgError = error as { code?: string; constraint?: string };
      const isProviderMessageDuplicate =
        !!params.providerMessageId &&
        pgError?.code === "23505" &&
        String(pgError?.constraint || "").includes(
          "merchant_id_provider_message_id",
        );

      if (isProviderMessageDuplicate) {
        this.logger.warn({
          message: "Duplicate inbound message insert blocked",
          merchantId: params.merchantId,
          senderId: params.senderId,
          providerMessageId: params.providerMessageId,
          conversationId: conversation.id,
          correlationId,
        });

        return {
          conversationId: conversation.id,
          replyText: "",
          action: ActionType.ASK_CLARIFYING_QUESTION,
          cart: conversation.cart || { items: [] },
          markAsRead: true,
          routingDecision: "duplicate_inbound_ignored",
        };
      }

      throw error;
    }

    // 5. Publish MessageReceived event
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.MESSAGE_RECEIVED,
      aggregateType: "conversation",
      aggregateId: conversation.id,
      merchantId: params.merchantId,
      correlationId,
      payload: {
        conversationId: conversation.id,
        merchantId: params.merchantId,
        senderId: params.senderId,
        text: params.text,
      },
    });

    const merchantPlan = await this.getMerchantPlanCached(params.merchantId);
    const effectiveMessageType = String(
      params.messageType || (params.voiceNote ? "audio" : "text"),
    ).toLowerCase();

    if (this.isBlockedForPlan(merchantPlan.name, effectiveMessageType)) {
      const redirectReply =
        this.messageRouter.getMediaRedirectReply(effectiveMessageType);
      if (redirectReply === "") {
        await this.recordRoutingDecision({
          merchantId: params.merchantId,
          planName: merchantPlan.name,
          messageType: effectiveMessageType,
          routingDecision: "media_redirect",
        });
        return {
          conversationId: conversation.id,
          replyText: "",
          action: ActionType.ASK_CLARIFYING_QUESTION,
          cart: { items: [] },
          markAsRead: true,
          routingDecision: "media_redirect",
        };
      }

      await this.messageRepo.create({
        conversationId: conversation.id,
        merchantId: params.merchantId,
        senderId: "bot",
        direction: MessageDirection.OUTBOUND,
        text: redirectReply,
      });
      await this.bumpConversationWindow(
        params.merchantId,
        params.senderId,
        "instant",
      );
      await this.recordRoutingDecision({
        merchantId: params.merchantId,
        planName: merchantPlan.name,
        messageType: effectiveMessageType,
        routingDecision: "media_redirect",
      });
      return {
        conversationId: conversation.id,
        replyText: redirectReply,
        action: ActionType.ASK_CLARIFYING_QUESTION,
        cart: { items: [] },
        routingDecision: "media_redirect",
      };
    }

    // Force all text messages through LLM so even short inputs get AI-generated replies.

    const quotaResult = await this.usageGuard.checkAndTrackConversation(
      params.merchantId,
      params.senderId,
      params.providerMessageId || correlationId,
    );

    if (quotaResult.isNewConversation && quotaResult.quotaExceeded) {
      if (merchantPlan.currency === "EGP") {
        await this.usageGuard.notifyMerchantQuotaExceeded(params.merchantId);
        await this.recordRoutingDecision({
          merchantId: params.merchantId,
          planName: merchantPlan.name,
          messageType: effectiveMessageType,
          routingDecision: "quota_blocked",
        });
        const blockedReply =
          "نأسف، خدمة الرد التلقائي متوقفة مؤقتاً. سيتواصل معك أحد الزملاء قريباً 🙏";
        await this.messageRepo.create({
          conversationId: conversation.id,
          merchantId: params.merchantId,
          senderId: "bot",
          direction: MessageDirection.OUTBOUND,
          text: blockedReply,
        });
        return {
          conversationId: conversation.id,
          replyText: blockedReply,
          action: ActionType.ASK_CLARIFYING_QUESTION,
          cart: { items: [] },
          routingDecision: "quota_blocked",
        };
      }

      await this.usageGuard.trackOverage(params.merchantId, 1);
      await this.recordRoutingDecision({
        merchantId: params.merchantId,
        planName: merchantPlan.name,
        messageType: effectiveMessageType,
        routingDecision: "overage_allowed",
      });
    }

    // ======== REORDER FLOW DETECTION ========
    // Check if customer is requesting to reorder their last order
    if (this.customerReorderService.isReorderRequest(params.text)) {
      this.logger.log({
        msg: "Detected reorder request",
        merchantId: params.merchantId,
        senderId: params.senderId,
        correlationId,
      });

      const reorderResult =
        await this.customerReorderService.checkReorderAvailability(
          params.merchantId,
          params.senderId,
        );

      const replyText =
        this.customerReorderService.generateReorderConfirmationMessage(
          reorderResult,
        );

      // Update conversation state to CONFIRMING_ORDER for reorder
      if (reorderResult.success && reorderResult.hasLastOrder) {
        await this.conversationRepo.update(conversation.id, {
          state: ConversationState.CONFIRMING_ORDER,
          lastMessageAt: new Date(),
          collectedInfo: {
            ...conversation.collectedInfo,
            pendingReorder: true,
            reorderDetails: reorderResult as unknown as Record<string, unknown>,
          },
        });
      }

      // Store bot reply
      await this.messageRepo.create({
        conversationId: conversation.id,
        merchantId: params.merchantId,
        senderId: "bot",
        direction: MessageDirection.OUTBOUND,
        text: replyText,
      });

      return {
        conversationId: conversation.id,
        replyText,
        action: ActionType.REORDER_LAST,
        cart: {
          items: reorderResult.items || [],
          total: reorderResult.total || 0,
        },
      };
    }

    // Check if this is a reorder confirmation (after we showed the reorder summary)
    const pendingReorder = conversation.collectedInfo?.pendingReorder;
    if (pendingReorder && this.isReorderConfirmation(params.text)) {
      this.logger.log({
        msg: "Processing reorder confirmation",
        merchantId: params.merchantId,
        senderId: params.senderId,
        correlationId,
      });

      // Check for address update in message
      const reorderAddress =
        conversation.collectedInfo?.reorderDetails?.address;
      let address:
        | { city?: string; area?: string; street?: string; full?: string }
        | undefined =
        reorderAddress &&
        typeof reorderAddress === "object" &&
        !Array.isArray(reorderAddress)
          ? {
              city:
                "city" in reorderAddress &&
                typeof reorderAddress.city === "string"
                  ? reorderAddress.city
                  : undefined,
              area:
                "area" in reorderAddress &&
                typeof reorderAddress.area === "string"
                  ? reorderAddress.area
                  : undefined,
              street:
                "street" in reorderAddress &&
                typeof reorderAddress.street === "string"
                  ? reorderAddress.street
                  : undefined,
              full:
                "full" in reorderAddress &&
                typeof reorderAddress.full === "string"
                  ? reorderAddress.full
                  : undefined,
            }
          : undefined;
      if (this.looksLikeAddress(params.text)) {
        address = {
          full: params.text,
          city: "",
          area: "",
          street: "",
        };
      }

      const confirmResult = await this.customerReorderService.confirmReorder(
        params.merchantId,
        params.senderId,
        address,
      );

      let replyText: string;
      if (confirmResult.success) {
        replyText =
          `✅ تم تأكيد طلبك رقم ${confirmResult.orderNumber}\n` +
          `💰 الإجمالي: ${confirmResult.total} ج.م\n\n` +
          `هنتواصل معاك قريب لتأكيد موعد التوصيل. شكراً! 🙏`;

        // Update conversation state
        await this.conversationRepo.update(conversation.id, {
          state: ConversationState.ORDER_PLACED,
          lastMessageAt: new Date(),
          collectedInfo: {
            ...conversation.collectedInfo,
            pendingReorder: false,
          },
        });

        // Publish order created event
        await this.outboxService.publishEvent({
          eventType: EVENT_TYPES.ORDER_CREATED,
          aggregateType: "order",
          aggregateId: confirmResult.orderId!,
          merchantId: params.merchantId,
          correlationId,
          payload: {
            orderId: confirmResult.orderId,
            orderNumber: confirmResult.orderNumber,
            total: confirmResult.total,
            source: "whatsapp_reorder",
          },
        });
      } else {
        replyText =
          confirmResult.errorAr || "حصل مشكلة في تأكيد الطلب. ممكن تحاول تاني؟";
      }

      // Store bot reply
      await this.messageRepo.create({
        conversationId: conversation.id,
        merchantId: params.merchantId,
        senderId: "bot",
        direction: MessageDirection.OUTBOUND,
        text: replyText,
      });

      return {
        conversationId: conversation.id,
        replyText,
        action: ActionType.CONFIRM_REORDER,
        cart: { items: [], total: confirmResult.total || 0 },
        orderId: confirmResult.orderId,
        orderNumber: confirmResult.orderNumber,
      };
    }
    // ======== END REORDER FLOW ========

    // 6. Load the full active catalog and recent messages for the AI context.
    const [catalogItems, recentMessages] = await Promise.all([
      this.catalogRepo.findByMerchant(merchant.id),
      this.messageRepo.findByConversation(conversation.id),
    ]);
    const offTopicHandling = await this.classifyOffTopicHandling(
      params.merchantId,
      params.senderId,
      merchant.name,
      params.text ?? "",
    );

    if (offTopicHandling.mode === "suppressed") {
      await this.recordRoutingDecision({
        merchantId: params.merchantId,
        planName: merchantPlan.name,
        messageType: effectiveMessageType,
        routingDecision: "offtopic_suppressed",
        modelUsed: undefined,
        complexityScore: this.messageRouter.scoreComplexity(params.text ?? ""),
        estimatedCostUsd: 0,
      });

      return {
        conversationId: conversation.id,
        replyText: "",
        action: ActionType.ASK_CLARIFYING_QUESTION,
        cart: conversation.cart || {
          items: [],
          total: 0,
          subtotal: 0,
          discount: 0,
          deliveryFee: 0,
        },
        markAsRead: true,
        routingDecision: "offtopic_suppressed",
      };
    }

    if (offTopicHandling.mode === "deterministic_redirect") {
      const replyText =
        offTopicHandling.replyText ||
        this.buildDeterministicOffTopicRedirectReply(merchant.name);
      await this.recordRoutingDecision({
        merchantId: params.merchantId,
        planName: merchantPlan.name,
        messageType: effectiveMessageType,
        routingDecision: "offtopic_redirect",
        modelUsed: undefined,
        complexityScore: this.messageRouter.scoreComplexity(params.text ?? ""),
        estimatedCostUsd: 0,
      });
      await this.messageRepo.create({
        conversationId: conversation.id,
        merchantId: params.merchantId,
        senderId: "bot",
        direction: MessageDirection.OUTBOUND,
        text: replyText,
      });

      return {
        conversationId: conversation.id,
        replyText,
        action: ActionType.ASK_CLARIFYING_QUESTION,
        cart: conversation.cart || {
          items: [],
          total: 0,
          subtotal: 0,
          discount: 0,
          deliveryFee: 0,
        },
        routingDecision: "offtopic_redirect",
      };
    }

    // 6.5 Build SaaS conversation memory: schema → classify business_type → extract slots.
    // All steps fail-open: any failure returns priors so the reply path never breaks.
    const turnMemory = await this.buildTurnMemory({
      merchantId: params.merchantId,
      conversation,
      text: params.text ?? "",
    });

    // 7. Get LLM response
    const model = "gpt-4o-mini";
    const llmOptions: LLMCallOptions = {
      model,
      maxTokens:
        offTopicHandling.mode === "ai_redirect"
          ? this.OFF_TOPIC_AI_REPLY_MAX_TOKENS
          : merchantPlan.name === "starter"
            ? 300
            : 1000,
      offTopicRedirectMode: offTopicHandling.mode === "ai_redirect",
    };
    const aiReplyQuota = await this.checkAiReplyLimit(params.merchantId);
    const quotaAwareLlm = this.buildQuotaAwareLlmOptions(
      llmOptions,
      aiReplyQuota,
      effectiveMessageType,
    );
    if (!aiReplyQuota.allowed && !quotaAwareLlm.degraded) {
      await this.recordRoutingDecision({
        merchantId: params.merchantId,
        planName: merchantPlan.name,
        messageType: effectiveMessageType,
        routingDecision: "ai_reply_quota_blocked",
        modelUsed: undefined,
        complexityScore: this.messageRouter.scoreComplexity(params.text ?? ""),
        estimatedCostUsd: 0,
      });

      return {
        conversationId: conversation.id,
        replyText: this.shouldHardBlockAiReplyQuota(aiReplyQuota.blockingMetric)
          ? this.MESSAGE_LIMIT_EXCEEDED_AR
          : this.AI_REPLY_LIMIT_EXCEEDED_AR,
        action: ActionType.GREET,
        cart: conversation.cart || {
          items: [],
          total: 0,
          subtotal: 0,
          discount: 0,
          deliveryFee: 0,
        },
      };
    }
    if (quotaAwareLlm.degraded) {
      await this.recordRoutingDecision({
        merchantId: params.merchantId,
        planName: merchantPlan.name,
        messageType: effectiveMessageType,
        routingDecision: "ai_4o_mini_degraded",
        modelUsed: quotaAwareLlm.options.model,
        complexityScore: this.messageRouter.scoreComplexity(params.text ?? ""),
        estimatedCostUsd: 0,
      });
    }
    const enrichedConversation = this.applyTurnMemoryToConversation(
      conversation,
      turnMemory,
    );

    const useAiV2 = shouldUseAiReplyEngineV2(
      merchant,
      this.configService.get<string>("AI_REPLY_ENGINE"),
    );

    let dialogTurn: DialogTurnResult;
    if (useAiV2) {
      const v2 = await this.aiV2Service.run({
        merchant,
        conversation: enrichedConversation,
        catalogItems,
        recentMessages,
        customerMessage: params.text ?? "",
        channel: params.channel,
        llmOptions: {
          model: quotaAwareLlm.options.model,
          maxTokens: quotaAwareLlm.options.maxTokens,
        },
      });
      dialogTurn = {
        replyText: v2.replyText,
        llmResult: v2.llmResultAdapter,
        mediaAttachments: v2.mediaAttachments,
        contextPatch: v2.contextPatch as Partial<ConversationContext>,
        routingDecision: "ai_v2",
      };
    } else {
      dialogTurn = await this.dialogOrchestrator.processTurn(
        {
          merchant,
          conversation: enrichedConversation,
          catalogItems,
          recentMessages,
          customerMessage: params.text,
          turnMemory,
        },
        quotaAwareLlm.options,
        {
          channel: params.channel,
          degraded: quotaAwareLlm.degraded,
          offTopicRedirectMode: offTopicHandling.mode === "ai_redirect",
        },
      );
    }
    const llmResponse = dialogTurn.llmResult;
    await this.bumpConversationWindow(
      params.merchantId,
      params.senderId,
      "ai",
      llmOptions.model,
    );
    await this.recordRoutingDecision({
      merchantId: params.merchantId,
      planName: merchantPlan.name,
      messageType: effectiveMessageType,
      routingDecision:
        dialogTurn.routingDecision === "ai_v2"
          ? "ai_v2"
          : quotaAwareLlm.degraded
            ? "ai_4o_mini_degraded"
            : offTopicHandling.mode === "ai_redirect"
              ? "offtopic_ai_redirect"
              : "ai_4o_mini",
      modelUsed: model,
      complexityScore: this.messageRouter.scoreComplexity(params.text ?? ""),
      estimatedCostUsd: this.estimateInboxCostUsd(
        model,
        llmResponse.tokensUsed,
      ),
    });

    // 8. Process LLM action
    const result = await this.processLlmAction(
      llmResponse,
      merchant,
      conversation,
      customer,
      params.text,
      correlationId,
    );
    const replyText = dialogTurn.replyText || result.replyText;
    const mediaAttachments = dialogTurn.mediaAttachments;

    // 9. Store bot reply
    await this.messageRepo.create({
      conversationId: conversation.id,
      merchantId: params.merchantId,
      senderId: "bot",
      direction: MessageDirection.OUTBOUND,
      text: replyText,
      tokensUsed: llmResponse.tokensUsed,
    });

    // 10. Update conversation with collected info and missing slots
    const collectedInfo = { ...conversation.collectedInfo };
    if (llmResponse.customerName)
      collectedInfo.customerName = llmResponse.customerName;
    if (
      !collectedInfo.customerName &&
      llmResponse.conversationState?.customerName
    )
      collectedInfo.customerName = llmResponse.conversationState.customerName;
    if (llmResponse.phone) collectedInfo.phone = llmResponse.phone;
    if (llmResponse.address) {
      // Parse address and extract Google Maps coordinates if present
      const address = this.parseAddressWithMaps(
        llmResponse.address,
        params.text,
      );
      collectedInfo.address = this.normalizeAddress(address);
    } else if (
      !collectedInfo.address &&
      llmResponse.conversationState?.deliveryAddress
    ) {
      const address = this.parseAddressWithMaps(
        llmResponse.conversationState.deliveryAddress,
        params.text,
      );
      collectedInfo.address = this.normalizeAddress(address);
    }

    const mergedContextPatch = {
      ...(conversation.context || {}),
      ...dialogTurn.contextPatch,
      ...(turnMemory
        ? {
            businessType:
              turnMemory.businessType ??
              (conversation.context as any)?.businessType,
            businessTypeConfidence:
              turnMemory.businessTypeConfidence ??
              (conversation.context as any)?.businessTypeConfidence,
            customSlots: turnMemory.customSlots,
            slotConfidence: turnMemory.slotConfidence,
            stillMissingImportant: turnMemory.stillMissingImportant,
          }
        : {}),
    };

    await this.conversationRepo.update(conversation.id, {
      cart: result.cart,
      state: this.determineNewState(
        result.action,
        conversation.state,
        llmResponse.conversationState,
      ),
      context: mergedContextPatch,
      lastMessageAt: new Date(),
      collectedInfo,
      missingSlots: llmResponse.missingSlots || [],
    });

    // Fire-and-forget compression: never block customer reply on summary work.
    this.maybeTriggerCompression(conversation, recentMessages.length + 1);

    const processingTime = Date.now() - startTime;
    this.logger.log({
      message: "Message processed",
      conversationId: conversation.id,
      action: result.action,
      processingTimeMs: processingTime,
      tokensUsed: llmResponse.tokensUsed,
      correlationId,
    });

    return {
      conversationId: conversation.id,
      replyText,
      mediaAttachments,
      action: result.action,
      cart: result.cart,
      modelUsed: llmOptions.model,
      routingDecision:
        dialogTurn.routingDecision === "ai_v2"
          ? "ai_v2"
          : quotaAwareLlm.degraded
            ? "ai_4o_mini_degraded"
            : offTopicHandling.mode === "ai_redirect"
              ? "offtopic_ai_redirect"
              : "ai_4o_mini",
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    };
  }

  private async bumpConversationWindow(
    merchantId: string,
    customerPhone: string,
    mode: "instant" | "ai",
    model?: "gpt-4o" | "gpt-4o-mini",
  ): Promise<void> {
    const updates: string[] = [];
    if (mode === "instant") {
      updates.push("instant_reply_count = instant_reply_count + 1");
    } else {
      updates.push("ai_replies_count = ai_replies_count + 1");
      if (model === "gpt-4o") {
        updates.push("model_4o_count = model_4o_count + 1");
      } else {
        updates.push("model_mini_count = model_mini_count + 1");
      }
    }

    if (updates.length === 0) return;

    try {
      await this.pool.query(
        `WITH latest_window AS (
           SELECT id
           FROM whatsapp_conversation_windows
           WHERE merchant_id = $1
             AND customer_phone = $2
             AND expires_at > NOW()
           ORDER BY opened_at DESC
           LIMIT 1
         )
         UPDATE whatsapp_conversation_windows
         SET ${updates.join(", ")}
         WHERE id IN (SELECT id FROM latest_window)`,
        [merchantId, customerPhone],
      );
    } catch {
      // Window table may not exist until migration is applied.
    }
  }

  private async recordRoutingDecision(input: {
    merchantId: string;
    planName: string;
    messageType: string;
    routingDecision: string;
    modelUsed?: string;
    complexityScore?: number;
    estimatedCostUsd?: number;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO ai_routing_log (
           merchant_id,
           plan_name,
           message_type,
           complexity_score,
           routing_decision,
           model_used,
           estimated_cost_usd
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.merchantId,
          input.planName,
          input.messageType,
          input.complexityScore ?? null,
          input.routingDecision,
          input.modelUsed ?? null,
          input.estimatedCostUsd ?? 0,
        ],
      );
    } catch {
      // Analytics table may not exist until migration is applied.
    }
  }

  private estimateInboxCostUsd(
    model: "gpt-4o" | "gpt-4o-mini",
    tokensUsed: number,
  ): number {
    const costPerThousandTokens = model === "gpt-4o" ? 0.012 : 0.0012;
    return Number(
      ((Math.max(tokensUsed, 0) / 1000) * costPerThousandTokens).toFixed(6),
    );
  }

  /**
   * Process LLM action and update state
   */
  private async processLlmAction(
    llmResponse: LlmResult,
    merchant: Merchant,
    conversation: Conversation,
    customer: Customer,
    customerMessage: string,
    correlationId: string,
  ): Promise<{
    replyText: string;
    action: ActionType;
    cart: any;
    orderId?: string;
    orderNumber?: string;
  }> {
    const baseAction = llmResponse.action || ActionType.GREET;
    let action = baseAction;
    let cart = conversation.cart || {
      items: [],
      total: 0,
      subtotal: 0,
      discount: 0,
      deliveryFee: 0,
    };
    let orderId: string | undefined;
    let orderNumber: string | undefined;
    let replyText = llmResponse.reply || llmResponse.response.reply_ar;
    let cartChanged = false;

    if (!String(replyText || "").trim()) {
      replyText = "تمام 🙌 اكتب طلبك بشكل أوضح شوية وأنا أساعدك فورًا.";
    }

    const removalResult = this.extractCartRemovalRequest(
      customerMessage,
      cart.items || [],
    );
    if (removalResult) {
      action = ActionType.UPDATE_CART;
      cart = this.removeItemsFromCart(cart, removalResult.itemsToRemove);
      cartChanged = true;
      replyText =
        cart.items.length > 0
          ? `${removalResult.replyPrefix} اتشال من السلة. السلة حالياً فيها ${cart.items.map((item: any) => `${item.name} × ${item.quantity}`).join("، ")}.`
          : `${removalResult.replyPrefix} واتفضت السلة. لو تحب نبدأ من جديد قولي على المنتج اللي يناسبك.`;
    }

    // Update cart if items extracted
    if (
      !removalResult &&
      llmResponse.cartItems &&
      llmResponse.cartItems.length > 0
    ) {
      this.logger.debug({
        msg: "Applying strictly confirmed cart items from LLM state",
        conversationId: conversation.id,
        merchantId: merchant.id,
        stage: llmResponse.conversationState?.stage,
        items: llmResponse.cartItems,
      });
      cart = await this.updateCart(cart, llmResponse.cartItems, merchant.id);
      cartChanged = true;
    }

    // Apply discount if negotiated
    if (llmResponse.discountPercent && llmResponse.discountPercent > 0) {
      const subtotal = cart.items.reduce(
        (sum: number, item: any) => sum + item.total,
        0,
      );
      const discountAmount = Math.round(
        subtotal * (llmResponse.discountPercent / 100),
      );
      cart.subtotal = subtotal;
      cart.discount = discountAmount;
      cart.total = subtotal - discountAmount + (cart.deliveryFee || 0);
    }

    // Apply delivery fee if specified
    if (llmResponse.deliveryFee && llmResponse.deliveryFee > 0) {
      cart.deliveryFee = llmResponse.deliveryFee;
      const subtotal =
        cart.subtotal ||
        cart.items.reduce((sum: number, item: any) => sum + item.total, 0);
      const discount = cart.discount || 0;
      cart.total = subtotal - discount + llmResponse.deliveryFee;
    }

    // Publish CartUpdated event if cart changed
    if (cartChanged || llmResponse.discountPercent || llmResponse.deliveryFee) {
      await this.outboxService.publishEvent({
        eventType: EVENT_TYPES.CART_UPDATED,
        aggregateType: "conversation",
        aggregateId: conversation.id,
        merchantId: merchant.id,
        correlationId,
        payload: {
          conversationId: conversation.id,
          merchantId: merchant.id,
          items: cart.items,
          total: cart.total,
          subtotal: cart.subtotal,
          discount: cart.discount,
          deliveryFee: cart.deliveryFee,
        },
      });
    }

    // Process specific actions
    switch (action) {
      case ActionType.ORDER_CONFIRMED:
      case ActionType.CREATE_ORDER:
      case ActionType.CONFIRM_ORDER:
        const orderResult = await this.createOrder(
          merchant,
          conversation,
          customer,
          cart,
          llmResponse,
          correlationId,
        );
        orderId = orderResult.orderId;
        orderNumber = orderResult.orderNumber;
        if (orderResult.paymentLinkMessage) {
          replyText = [replyText, orderResult.paymentLinkMessage]
            .filter(Boolean)
            .join("\n\n");
        }
        break;

      case ActionType.ESCALATE:
      case ActionType.ESCALATE_TO_HUMAN:
        await this.handleEscalation(merchant, conversation, correlationId);
        break;
    }

    return {
      replyText,
      action,
      cart,
      orderId,
      orderNumber,
    };
  }

  /**
   * Update cart with new items
   */
  private async updateCart(
    currentCart: any,
    newItems: Array<{ name: string; quantity?: number }>,
    merchantId: string,
  ): Promise<{
    items: any[];
    total: number;
    subtotal: number;
    discount: number;
    deliveryFee: number;
  }> {
    const items = [...(currentCart.items || [])];

    for (const newItem of newItems) {
      if (!newItem.name) continue;

      // Try to match with catalog using fuzzy search
      const catalogItem = await this.findBestCatalogItemMatch(
        merchantId,
        newItem.name,
      );

      // Skip items that don't match catalog
      if (!catalogItem) {
        this.logger.warn({
          msg: "Product not found in catalog - skipping",
          searchTerm: newItem.name,
          merchantId,
        });
        continue;
      }

      const itemPrice = catalogItem.basePrice;
      if (!itemPrice || itemPrice <= 0) {
        this.logger.warn({
          msg: "Product has no price - skipping",
          productName: catalogItem.nameAr,
          merchantId,
        });
        continue;
      }

      const quantity = newItem.quantity || 1;
      const productName = catalogItem.nameAr; // Use catalog name, not LLM name

      // Check if item already in cart by productId
      const existingIndex = items.findIndex(
        (i: any) => i.productId === catalogItem.id,
      );

      if (existingIndex >= 0) {
        // Item already in cart - DON'T add quantity again (LLM might just be confirming)
        // Only update if the new quantity is different and explicitly set
        // Keep existing quantity unless LLM explicitly changes it
        this.logger.debug({
          msg: "Item already in cart - keeping existing quantity",
          productName,
          existingQuantity: items[existingIndex].quantity,
          llmQuantity: quantity,
        });
        // Just ensure price is correct
        items[existingIndex].unitPrice = itemPrice;
        items[existingIndex].total = items[existingIndex].quantity * itemPrice;
      } else {
        // Add new item
        items.push({
          productId: catalogItem.id,
          name: productName,
          quantity,
          unitPrice: itemPrice,
          total: quantity * itemPrice,
        });
      }
    }

    // Remove items with 0 quantity or 0 price
    const filteredItems = items.filter(
      (i: any) => i.quantity > 0 && i.unitPrice > 0,
    );

    // Calculate subtotal (sum of all items)
    const subtotal = filteredItems.reduce(
      (sum: number, item: any) => sum + item.total,
      0,
    );

    return {
      items: filteredItems,
      total: subtotal,
      subtotal,
      discount: currentCart.discount || 0,
      deliveryFee: currentCart.deliveryFee || 0,
    };
  }

  private extractCartRemovalRequest(
    customerMessage: string,
    cartItems: any[],
  ): {
    itemsToRemove: any[];
    replyPrefix: string;
  } | null {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return null;
    }

    const normalizedMessage = this.normalizeCatalogSearchText(customerMessage);
    const isRemovalIntent =
      /(^|\s)(شيل|احذف|امسح|الغي|الغي|remove|delete)(\s|$)/.test(
        normalizedMessage,
      ) ||
      /من السله|من السلة|من الكارت|من العربيه|من العربية/.test(
        normalizedMessage,
      );

    if (!isRemovalIntent) {
      return null;
    }

    if (/كل|السله|السلة|الكارت|العربيه|العربية/.test(normalizedMessage)) {
      return {
        itemsToRemove: [...cartItems],
        replyPrefix: "تمام، شيلت كل المنتجات",
      };
    }

    const scored = cartItems
      .map((item: any) => {
        const haystack = this.normalizeCatalogSearchText(
          [item.name, item.sku, item.productId].filter(Boolean).join(" "),
        );
        let score = 0;
        if (haystack && normalizedMessage.includes(haystack)) {
          score += 100;
        }

        for (const token of haystack.split(" ").filter(Boolean)) {
          if (token.length < 2) continue;
          if (normalizedMessage.includes(token)) {
            score += token.length >= 4 ? 12 : 4;
          }
        }

        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const matched = scored[0]?.item;
    if (!matched) {
      return null;
    }

    return {
      itemsToRemove: [matched],
      replyPrefix: `تمام، شيلت ${matched.name}`,
    };
  }

  private removeItemsFromCart(
    currentCart: any,
    itemsToRemove: any[],
  ): {
    items: any[];
    total: number;
    subtotal: number;
    discount: number;
    deliveryFee: number;
  } {
    const removeKeys = new Set(
      itemsToRemove.map((item) => String(item.productId || item.name || "")),
    );

    const filteredItems = (currentCart.items || []).filter((item: any) => {
      const key = String(item.productId || item.name || "");
      return !removeKeys.has(key);
    });

    const subtotal = filteredItems.reduce(
      (sum: number, item: any) => sum + item.total,
      0,
    );

    const discount = currentCart.discount || 0;
    const deliveryFee =
      filteredItems.length > 0 ? currentCart.deliveryFee || 0 : 0;

    return {
      items: filteredItems,
      subtotal,
      discount,
      deliveryFee,
      total: Math.max(0, subtotal - discount + deliveryFee),
    };
  }

  private async findBestCatalogItemMatch(
    merchantId: string,
    searchTerm: string,
  ): Promise<any | null> {
    const directMatches = await this.catalogRepo.searchByName(
      merchantId,
      searchTerm,
    );
    if (directMatches.length > 0) {
      return directMatches[0];
    }

    const catalogItems = await this.catalogRepo.findByMerchant(merchantId);
    if (catalogItems.length === 0) {
      return null;
    }

    const normalizedSearch = this.normalizeCatalogSearchText(searchTerm);
    const searchTokens = normalizedSearch.split(" ").filter(Boolean);

    const scored = catalogItems
      .map((item: any) => {
        const haystack = this.normalizeCatalogSearchText(
          [
            item.nameAr,
            item.nameEn,
            item.sku,
            item.descriptionAr,
            item.category,
            ...(Array.isArray(item.tags) ? item.tags : []),
          ]
            .filter(Boolean)
            .join(" "),
        );

        let score = 0;
        if (
          normalizedSearch.length > 0 &&
          haystack.includes(normalizedSearch)
        ) {
          score += 100;
        }

        for (const token of searchTokens) {
          if (token.length < 2) continue;
          if (haystack.includes(token)) {
            score += token.length >= 4 ? 20 : 8;
          }
        }

        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.item || null;
  }

  private normalizeCatalogSearchText(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/[ىي]/g, "ي")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Create order from confirmed cart
   */
  private async createOrder(
    merchant: Merchant,
    conversation: Conversation,
    customer: Customer,
    cart: any,
    llmResponse: LlmResult,
    correlationId: string,
  ): Promise<{
    orderId: string;
    orderNumber: string;
    paymentLinkMessage?: string;
  }> {
    const orderNumber = this.generateOrderNumber();

    // Update customer with extracted info
    if (llmResponse.customerName || llmResponse.address || llmResponse.phone) {
      const addressObj = llmResponse.address
        ? this.normalizeAddress({ raw_text: llmResponse.address })
        : undefined;
      await this.customerRepo.update(customer.id, {
        name: llmResponse.customerName || customer.name,
        phone: llmResponse.phone || customer.phone,
        address: addressObj,
      });
    }

    const deliveryFee = merchant.defaultDeliveryFee || 30;
    const deliveryAddr = llmResponse.address
      ? this.normalizeAddress({ raw_text: llmResponse.address })
      : this.normalizeAddress(customer.address);

    // Create order
    const createdOrder = await this.orderRepo.create({
      merchantId: merchant.id,
      conversationId: conversation.id,
      customerId: customer.id,
      orderNumber,
      items: cart.items,
      subtotal: cart.total,
      deliveryFee,
      discount: 0,
      total: cart.total + deliveryFee,
      customerName: llmResponse.customerName || customer.name || "Customer",
      customerPhone: llmResponse.phone || customer.phone || "",
      deliveryAddress: deliveryAddr,
    });

    // Mark order as confirmed since this is the confirmation action
    await this.orderRepo.update(createdOrder.id, {
      status: OrderStatus.CONFIRMED,
    });

    // Publish OrderCreated event
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.ORDER_CREATED,
      aggregateType: "order",
      aggregateId: createdOrder.id,
      merchantId: merchant.id,
      correlationId,
      payload: {
        orderId: createdOrder.id,
        orderNumber,
        merchantId: merchant.id,
        conversationId: conversation.id,
        customerId: customer.id,
        total: cart.total + deliveryFee,
      },
    });

    this.logger.log({
      message: "Order created",
      orderId: createdOrder.id,
      orderNumber,
      merchantId: merchant.id,
      total: cart.total + deliveryFee,
    });

    const paymentLinkMessage = await this.maybeCreatePaymentLink({
      merchant,
      conversation,
      customer,
      order: createdOrder,
      amount: cart.total + deliveryFee,
      orderNumber,
      customerName: llmResponse.customerName || customer.name || "Customer",
      customerPhone:
        llmResponse.phone || customer.phone || conversation.senderId || "",
    });

    return { orderId: createdOrder.id, orderNumber, paymentLinkMessage };
  }

  private async maybeCreatePaymentLink(params: {
    merchant: Merchant;
    conversation: Conversation;
    customer: Customer;
    order: Order;
    amount: number;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
  }): Promise<string | undefined> {
    const {
      merchant,
      conversation,
      customer,
      order,
      amount,
      orderNumber,
      customerName,
      customerPhone,
    } = params;

    if (!merchant.autoPaymentLinkOnConfirm) {
      return undefined;
    }

    // Product rule: payment links are removed.
    // Payment verification remains available through proof review workflow only.
    return undefined;
  }

  /**
   * Handle escalation to human
   */
  private async handleEscalation(
    merchant: Merchant,
    conversation: Conversation,
    correlationId: string,
  ): Promise<void> {
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.MERCHANT_ALERTED,
      aggregateType: "merchant",
      aggregateId: merchant.id,
      merchantId: merchant.id,
      correlationId,
      payload: {
        merchantId: merchant.id,
        alertType: "escalation_needed",
        message: "العميل يطلب التحدث مع شخص حقيقي",
        metadata: {
          conversationId: conversation.id,
        },
      },
    });

    this.logger.warn({
      message: "Conversation escalated to human",
      conversationId: conversation.id,
      merchantId: merchant.id,
    });
  }

  /**
   * Create new conversation
   */
  private async createNewConversation(
    merchantId: string,
    senderId: string,
    destinationPhone?: string,
    channel: "whatsapp" | "messenger" | "instagram" = "whatsapp",
  ): Promise<Conversation> {
    // ── Branch routing ──────────────────────────────────────────────────────
    // When a merchant has multiple branches with distinct WA numbers, route
    // the new conversation to the branch whose whatsapp_number matches the
    // destination number this message was sent to.
    let branchId: string | null = null;
    if (destinationPhone) {
      try {
        const branchRes = await this.pool.query<{ id: string }>(
          `SELECT id FROM merchant_branches
           WHERE merchant_id = $1 AND whatsapp_number = $2
           LIMIT 1`,
          [merchantId, destinationPhone],
        );
        if (branchRes.rows.length > 0) {
          branchId = branchRes.rows[0].id;
          this.logger.log({
            message: "Routing conversation to branch by WA number",
            merchantId,
            senderId,
            branchId,
            destinationPhone,
          });
        }
      } catch (err) {
        this.logger.warn({
          message: "Branch WA lookup failed — proceeding without branch",
          err,
        });
      }
    }

    const conversation = await this.conversationRepo.create({
      merchantId,
      senderId,
      channel,
    });

    // Assign branch if found
    if (branchId) {
      await this.pool.query(
        `UPDATE conversations SET branch_id = $1 WHERE id = $2`,
        [branchId, conversation.id],
      );
    }

    // Set phone from senderId (WhatsApp number) by default
    await this.conversationRepo.update(conversation.id, {
      collectedInfo: {
        phone: senderId,
      },
    });

    // Refetch to get updated collectedInfo
    const updatedConversation = await this.conversationRepo.findById(
      conversation.id,
    );

    this.logger.log({
      message: "New conversation created",
      conversationId: conversation.id,
      merchantId,
      senderId,
      branchId,
      phoneAutoSet: senderId,
    });

    return updatedConversation || conversation;
  }

  /**
   * Create new customer
   */
  private async createNewCustomer(
    merchantId: string,
    senderId: string,
  ): Promise<Customer> {
    const customer = await this.customerRepo.create({
      merchantId,
      senderId,
    });

    this.logger.log({
      message: "New customer created",
      customerId: customer.id,
      merchantId,
      senderId,
    });

    return customer;
  }

  /**
   * Determine new conversation state based on action
   */
  private determineNewState(
    action: ActionType,
    currentState: ConversationState,
    llmConversationState?: LlmConversationState,
  ): ConversationState {
    const stageBasedState = this.mapLlmStageToConversationState(
      llmConversationState?.stage,
      llmConversationState?.lastAskedFor,
      currentState,
    );
    if (stageBasedState) {
      return stageBasedState;
    }

    switch (action) {
      case ActionType.ORDER_CONFIRMED:
      case ActionType.CREATE_ORDER:
        return ConversationState.ORDER_PLACED;
      case ActionType.CONFIRM_ORDER:
        return ConversationState.CONFIRMING_ORDER;
      case ActionType.ESCALATE:
      case ActionType.ESCALATE_TO_HUMAN:
        return ConversationState.HUMAN_TAKEOVER;
      case ActionType.GREET:
        return ConversationState.GREETING;
      case ActionType.COLLECT_SLOTS:
      case ActionType.UPDATE_CART:
        return ConversationState.COLLECTING_ITEMS;
      case ActionType.TRACK_ORDER:
      case ActionType.SEND_TRACKING:
        return ConversationState.TRACKING;
      case ActionType.SCHEDULE_FOLLOWUP:
        return ConversationState.FOLLOWUP;
      case ActionType.COUNTER_OFFER:
      case ActionType.ACCEPT_NEGOTIATION:
      case ActionType.REJECT_NEGOTIATION:
      case ActionType.HANDLE_NEGOTIATION:
        return ConversationState.NEGOTIATING;
      default:
        return currentState;
    }
  }

  private mapLlmStageToConversationState(
    stage: LlmConversationState["stage"] | undefined,
    lastAskedFor: LlmConversationState["lastAskedFor"] | undefined,
    currentState: ConversationState,
  ): ConversationState | null {
    switch (stage) {
      case "discovery":
        return currentState === ConversationState.HUMAN_TAKEOVER
          ? currentState
          : ConversationState.GREETING;
      case "item_confirmation":
        return lastAskedFor === "size"
          ? ConversationState.COLLECTING_VARIANTS
          : ConversationState.COLLECTING_ITEMS;
      case "delivery":
        return ConversationState.COLLECTING_ADDRESS;
      case "payment":
        return ConversationState.COLLECTING_CUSTOMER_INFO;
      case "confirmed":
        return ConversationState.CONFIRMING_ORDER;
      default:
        return null;
    }
  }

  /**
   * Generate order number
   */
  private generateOrderNumber(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${dateStr}-${random}`;
  }

  /**
   * Parse address text and extract Google Maps URL/coordinates if present
   * Returns a structured address object with map_url and coordinates
   */
  private parseAddressWithMaps(
    addressText: string,
    messageText: string,
  ): {
    city?: string;
    area?: string;
    street?: string;
    building?: string;
    floor?: string;
    apartment?: string;
    landmark?: string;
    raw_text: string;
    map_url?: string;
    coordinates?: { lat: number; lng: number };
    confidence: number;
    missing_fields: string[];
  } {
    // Start with raw text
    const result: {
      city?: string;
      area?: string;
      street?: string;
      building?: string;
      floor?: string;
      apartment?: string;
      landmark?: string;
      raw_text: string;
      map_url?: string;
      coordinates?: { lat: number; lng: number };
      confidence: number;
      missing_fields: string[];
    } = {
      raw_text: addressText,
      confidence: 0,
      missing_fields: [],
    };

    // Extract Google Maps URL from both address text and original message
    const combinedText = `${addressText} ${messageText}`;
    const location =
      this.addressDepthService.extractLocationFromText(combinedText);

    if (location) {
      result.coordinates = { lat: location.lat, lng: location.lng };

      // Also try to find the original URL
      const urlPattern =
        /https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com|goo\.gl\/maps)[^\s]*/gi;
      const urls = combinedText.match(urlPattern);
      if (urls && urls.length > 0) {
        result.map_url = urls[0];
      }

      this.logger.log({
        msg: "Extracted Google Maps coordinates from message",
        lat: location.lat,
        lng: location.lng,
        hasUrl: !!result.map_url,
      });
    }

    return result;
  }

  /**
   * Check if message is a reorder confirmation
   */
  private isReorderConfirmation(text: string): boolean {
    const normalizedText = text.trim().toLowerCase();
    return this.REORDER_CONFIRM_KEYWORDS.some(
      (keyword) =>
        normalizedText === keyword ||
        normalizedText.startsWith(keyword + " ") ||
        normalizedText.endsWith(" " + keyword),
    );
  }

  /**
   * Check if message looks like an address (heuristic)
   */
  private looksLikeAddress(text: string): boolean {
    // Check for address patterns
    const addressPatterns = [
      /شارع/i,
      /شار[عا]/i,
      /منطقة/i,
      /مدينة/i,
      /حي/i,
      /عمارة/i,
      /عماره/i,
      /شقة/i,
      /شقه/i,
      /الدور/i,
      /برج/i,
      /فيلا/i,
      /كومباوند/i,
      /ش\./i,
      /\d+\s*ش/i,
      /بجوار/i,
      /أمام/i,
      /امام/i,
      /خلف/i,
      /قريب/i,
      /maps\.google/i,
      /goo\.gl/i,
      /\d{1,3}\.\d+,\s*\d{1,3}\.\d+/, // coordinates
    ];

    // Text is long enough to be an address and contains address indicators
    if (text.length > 10) {
      return addressPatterns.some((pattern) => pattern.test(text));
    }

    return false;
  }

  /**
   * Build per-turn structured memory: load merchant schema, classify business
   * context, and extract universal + custom slots. Fail-open at every stage —
   * any error returns priors and lets the reply proceed.
   */
  private async buildTurnMemory(input: {
    merchantId: string;
    conversation: Conversation;
    text: string;
  }) {
    const ctx = (input.conversation.context || {}) as Record<string, any>;
    const priorUniversal: Record<string, unknown> =
      (ctx?.dialog?.filledSlots as Record<string, unknown>) || {};
    const priorCustom: Record<string, unknown> =
      (ctx?.customSlots as Record<string, unknown>) || {};
    const priorBusinessType: string | undefined =
      typeof ctx?.businessType === "string" && ctx.businessType
        ? ctx.businessType
        : undefined;

    let schema;
    try {
      schema = await this.merchantMemorySchema.load(input.merchantId);
    } catch (err) {
      this.logger.warn({
        message: "MerchantMemorySchema load failed",
        err: (err as Error).message,
      });
      return {
        businessType: priorBusinessType,
        businessTypeConfidence: undefined,
        universalSlots: priorUniversal,
        customSlots: priorCustom,
        slotConfidence: (ctx?.slotConfidence as Record<string, number>) || {},
        stillMissingImportant: Array.isArray(ctx?.stillMissingImportant)
          ? (ctx.stillMissingImportant as string[])
          : [],
        newlyFilled: [],
      };
    }

    let classification;
    try {
      classification = await this.businessContextClassifier.classify({
        text: input.text,
        priorBusinessType,
        schema,
      });
    } catch (err) {
      this.logger.warn({
        message: "BusinessContextClassifier failed",
        err: (err as Error).message,
      });
      classification = {
        businessType: priorBusinessType,
        confidence: priorBusinessType ? 0.6 : 0,
        switched: false,
        reason: "no_signal" as const,
      };
    }

    let extraction;
    try {
      extraction = await this.slotExtractor.extract({
        merchantId: input.merchantId,
        text: input.text,
        businessType: classification.businessType,
        priorUniversalSlots: priorUniversal,
        priorCustomSlots: priorCustom,
        schema,
      });
    } catch (err) {
      this.logger.warn({
        message: "SlotExtractor failed",
        err: (err as Error).message,
      });
      extraction = {
        universalSlots: priorUniversal,
        customSlots: priorCustom,
        newlyFilled: [],
        confidence: (ctx?.slotConfidence as Record<string, number>) || {},
        stillMissingImportant: Array.isArray(ctx?.stillMissingImportant)
          ? (ctx.stillMissingImportant as string[])
          : [],
        tokensUsed: 0,
      };
    }

    return {
      businessType: classification.businessType,
      businessTypeConfidence: classification.confidence,
      universalSlots: extraction.universalSlots,
      customSlots: extraction.customSlots,
      slotConfidence: extraction.confidence,
      stillMissingImportant: extraction.stillMissingImportant,
      newlyFilled: extraction.newlyFilled,
    };
  }

  /**
   * Merge turn memory + schema into conversation.context so the downstream
   * MerchantContextService.buildCustomerReplyContext can read them off the
   * conversation record without separate plumbing.
   */
  private applyTurnMemoryToConversation(
    conversation: Conversation,
    turnMemory: Awaited<ReturnType<InboxService["buildTurnMemory"]>>,
  ): Conversation {
    const ctx = (conversation.context || {}) as Record<string, any>;
    const dialog = (ctx.dialog || {}) as Record<string, any>;
    return {
      ...conversation,
      context: {
        ...ctx,
        businessType: turnMemory.businessType ?? ctx.businessType,
        businessTypeConfidence:
          turnMemory.businessTypeConfidence ?? ctx.businessTypeConfidence,
        customSlots: turnMemory.customSlots,
        slotConfidence: turnMemory.slotConfidence,
        stillMissingImportant: turnMemory.stillMissingImportant,
        dialog: {
          ...dialog,
          filledSlots: {
            ...((dialog.filledSlots as Record<string, unknown>) || {}),
            ...turnMemory.universalSlots,
          },
        },
      },
    };
  }

  /**
   * Trigger MemoryCompressionService when the conversation has accumulated
   * enough messages since the last summary. Always fire-and-forget.
   */
  private maybeTriggerCompression(
    conversation: Conversation,
    msgCount: number,
  ): void {
    const compressed = (conversation.compressedHistory || {}) as {
      messageCountAtSummary?: number;
    };
    const lastCount = Number(compressed.messageCountAtSummary || 0);
    const sinceLast = msgCount - lastCount;
    if (msgCount <= 20) return;
    if (sinceLast < 5) {
      // Honour the service's own heuristic if available.
      void this.memoryCompression
        .needsCompression(conversation.id)
        .then((needs) => {
          if (!needs) return;
          return this.memoryCompression.compressConversation(conversation.id);
        })
        .catch((err) =>
          this.logger.warn({
            message: "background compression failed",
            err: (err as Error).message,
          }),
        );
      return;
    }
    void this.memoryCompression
      .compressConversation(conversation.id)
      .catch((err) =>
        this.logger.warn({
          message: "background compression failed",
          err: (err as Error).message,
        }),
      );
  }
}
