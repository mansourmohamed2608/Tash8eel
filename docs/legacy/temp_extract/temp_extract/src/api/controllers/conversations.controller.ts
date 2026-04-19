import {
  Controller,
  Get,
  Param,
  Query,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
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

interface ConversationResponseDto {
  id: string;
  merchantId: string;
  customerId?: string;
  senderId: string;
  state: string;
  cart: unknown;
  collectedInfo: unknown;
  missingSlots: string[];
  followupCount: number;
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
  createdAt: Date;
}

@ApiTags("Conversations")
@Controller("v1/conversations")
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepo: IConversationRepository,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
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
    // For now, we need to get pending followups and filter -
    // ideally add a findByMerchant method to the repository
    const pendingFollowups = await this.conversationRepo.findPendingFollowups(
      new Date(),
    );
    const conversations = pendingFollowups.filter(
      (c) => c.merchantId === merchantId,
    );

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
      senderId: conversation.senderId,
      state: conversation.state,
      cart: conversation.cart,
      collectedInfo: conversation.collectedInfo,
      missingSlots: conversation.missingSlots,
      followupCount: conversation.followupCount,
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
              createdAt: msg.createdAt,
            }))
          : undefined,
    };
  }
}
