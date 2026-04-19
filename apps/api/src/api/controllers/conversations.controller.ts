import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
} from "@nestjs/swagger";
import {
  IConversationRepository,
  CONVERSATION_REPOSITORY,
} from "../../domain/ports/conversation.repository";
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from "../../domain/ports/message.repository";
import { Conversation } from "../../domain/entities/conversation.entity";
import { Message } from "../../domain/entities/message.entity";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { MessageDirection } from "../../shared/constants/enums";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";

interface ConversationResponseDto {
  id: string;
  merchantId: string;
  customerId?: string;
  channel?: "whatsapp" | "messenger" | "instagram";
  senderId: string;
  state: string;
  cart: unknown;
  collectedInfo: unknown;
  missingSlots: string[];
  followupCount: number;
  isHumanTakeover: boolean;
  takenOverBy?: string;
  takenOverAt?: Date;
  conversationSummary?: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  messages?: MessageDto[];
}

interface MessageDto {
  id: string;
  direction: string;
  senderId: string;
  text?: string;
  tokensUsed: number;
  status?: string;
  createdAt: Date;
}

@ApiTags("Conversations")
@ApiSecurity("admin-api-key")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
@Controller("v1/conversations")
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);
  private readonly LOCK_TTL_MS = 30000; // 30 seconds

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
    private readonly redisService: RedisService,
  ) {}

  @Get(":id")
  @ApiOperation({
    summary: "Get conversation by ID",
    description: "Retrieve conversation details including message history",
  })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiQuery({
    name: "merchantId",
    description: "Merchant ID for tenant isolation",
  })
  @ApiQuery({
    name: "includeMessages",
    description: "Include message history",
    required: false,
  })
  @ApiResponse({ status: 200, description: "Conversation found" })
  @ApiResponse({ status: 404, description: "Conversation not found" })
  async getConversation(
    @Param("id") id: string,
    @Query("merchantId") merchantId: string,
    @Query("includeMessages") includeMessages?: string,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    // Verify merchant ownership
    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    let messages: Message[] = [];
    if (includeMessages === "true") {
      messages = await this.messageRepo.findByConversation(id);
    }

    return this.mapConversationToDto(conversation, messages);
  }

  @Get()
  @ApiOperation({ summary: "List conversations for merchant" })
  @ApiQuery({ name: "merchantId", description: "Merchant ID" })
  @ApiQuery({ name: "state", description: "Filter by state", required: false })
  @ApiQuery({ name: "limit", description: "Max results", required: false })
  @ApiQuery({
    name: "offset",
    description: "Pagination offset",
    required: false,
  })
  async listConversations(
    @Query("merchantId") merchantId: string,
    @Query("state") state?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<{ conversations: ConversationResponseDto[]; total: number }> {
    const conversations =
      await this.conversationRepo.findByMerchant(merchantId);

    // Filter by state if provided
    let filtered = conversations;
    if (state) {
      filtered = conversations.filter((c: Conversation) => c.state === state);
    }

    // Apply pagination
    const start = offset || 0;
    const end = start + (limit || 20);
    const paginated = filtered.slice(start, end);

    // Don't include messages in list view
    const result = paginated.map((conv: Conversation) =>
      this.mapConversationToDto(conv, []),
    );

    return {
      conversations: result,
      total: filtered.length,
    };
  }

  private mapConversationToDto(
    conversation: Conversation,
    messages: Message[],
  ): ConversationResponseDto {
    return {
      id: conversation.id,
      merchantId: conversation.merchantId,
      customerId: conversation.customerId,
      channel: (conversation as any).channel || "whatsapp",
      senderId: conversation.senderId,
      state: conversation.state,
      cart: conversation.cart,
      collectedInfo: conversation.collectedInfo,
      missingSlots: conversation.missingSlots,
      followupCount: conversation.followupCount,
      isHumanTakeover: conversation.isHumanTakeover || false,
      takenOverBy: conversation.takenOverBy || undefined,
      takenOverAt: conversation.takenOverAt || undefined,
      conversationSummary: (conversation as any).conversationSummary,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt,
      messages:
        messages.length > 0
          ? messages.map((msg) => ({
              id: msg.id,
              direction: msg.direction,
              senderId: msg.senderId,
              text: msg.text,
              tokensUsed: msg.tokensUsed,
              status: (msg as any).status,
              createdAt: msg.createdAt,
            }))
          : undefined,
    };
  }

  @Post(":id/takeover")
  @ApiOperation({
    summary: "Take over conversation from AI",
    description:
      "Human operator takes control of the conversation. AI will stop responding.",
  })
  @ApiParam({ name: "id", description: "Conversation ID" })
  async takeoverConversation(
    @Param("id") id: string,
    @Query("merchantId") merchantId: string,
    @Body() body: { operatorId: string },
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    await this.conversationRepo.update(id, {
      state: "HUMAN_TAKEOVER",
      isHumanTakeover: true,
      takenOverBy: body.operatorId,
      takenOverAt: new Date(),
    } as any);

    this.logger.log({
      msg: "Conversation taken over",
      conversationId: id,
      operatorId: body.operatorId,
    });

    const updated = await this.conversationRepo.findById(id);
    return this.mapConversationToDto(updated!, []);
  }

  @Post(":id/release")
  @ApiOperation({
    summary: "Release conversation back to AI",
    description:
      "Release human control and let AI resume handling the conversation.",
  })
  @ApiParam({ name: "id", description: "Conversation ID" })
  async releaseConversation(
    @Param("id") id: string,
    @Query("merchantId") merchantId: string,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    await this.conversationRepo.update(id, {
      state:
        conversation.cart && Object.keys(conversation.cart as any).length > 0
          ? "COLLECTING_ITEMS"
          : "GREETING",
      isHumanTakeover: false,
      takenOverBy: null,
      takenOverAt: null,
    } as any);

    this.logger.log({
      msg: "Conversation released to AI",
      conversationId: id,
    });

    const updated = await this.conversationRepo.findById(id);
    return this.mapConversationToDto(updated!, []);
  }

  @Post(":id/lock")
  @ApiOperation({
    summary: "Acquire distributed lock on conversation",
    description:
      "Try to acquire a Redis lock before processing. Returns lock status.",
  })
  async acquireLock(
    @Param("id") id: string,
    @Body() body: { lockOwner: string },
  ): Promise<{ acquired: boolean; lockOwner?: string; expiresAt?: Date }> {
    const lockKey = `conv:lock:${id}`;
    const lockOwner = body.lockOwner;

    // Check if lock already exists
    const existingOwner = await this.redisService.get(lockKey);
    if (existingOwner) {
      return {
        acquired: false,
        lockOwner: existingOwner,
      };
    }

    // Try to set lock with expiry
    const success = await this.redisService.set(
      lockKey,
      lockOwner,
      this.LOCK_TTL_MS / 1000,
    );

    if (success) {
      return {
        acquired: true,
        lockOwner,
        expiresAt: new Date(Date.now() + this.LOCK_TTL_MS),
      };
    }

    return {
      acquired: false,
    };
  }

  @Post(":id/unlock")
  @ApiOperation({ summary: "Release distributed lock on conversation" })
  async releaseLock(
    @Param("id") id: string,
    @Body() body: { lockOwner: string },
  ): Promise<{ released: boolean }> {
    const lockKey = `conv:lock:${id}`;

    // Only release if we own the lock
    const currentOwner = await this.redisService.get(lockKey);
    if (currentOwner === body.lockOwner) {
      await this.redisService.del(lockKey);
      return { released: true };
    }

    return { released: false };
  }

  @Post(":id/send-message")
  @ApiOperation({
    summary: "Send message in takeover mode",
    description: "Send a manual message when in human takeover mode.",
  })
  async sendManualMessage(
    @Param("id") id: string,
    @Query("merchantId") merchantId: string,
    @Body() body: { operatorId: string; text: string },
  ): Promise<{ messageId: string }> {
    const conversation = await this.conversationRepo.findById(id);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    if (conversation.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    if (!conversation.isHumanTakeover) {
      throw new ForbiddenException("Conversation is not in takeover mode");
    }

    const message = await this.messageRepo.create({
      conversationId: id,
      merchantId,
      senderId: body.operatorId,
      direction: MessageDirection.OUTBOUND,
      text: body.text,
      tokensUsed: 0,
    });

    await this.conversationRepo.update(id, {
      lastMessageAt: new Date(),
    });

    return { messageId: message.id };
  }
}
