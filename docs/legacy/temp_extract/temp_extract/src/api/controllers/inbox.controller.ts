import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  Logger,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from "@nestjs/swagger";
import { InboxMessageDto, InboxResponseDto } from "../dto/inbox.dto";
import { InboxService } from "../../application/services/inbox.service";
@ApiTags("Inbox")
@Controller("v1/inbox")
export class InboxController {
  private readonly logger = new Logger(InboxController.name);

  constructor(private readonly inboxService: InboxService) {}

  @Post("message")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Process incoming customer message",
    description:
      "Main endpoint for processing customer messages. Handles order extraction, negotiation, slot filling, and order confirmation.",
  })
  @ApiHeader({
    name: "x-correlation-id",
    required: false,
    description: "Correlation ID for request tracing",
  })
  @ApiResponse({
    status: 200,
    description: "Message processed successfully",
    type: InboxResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid request body" })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  @ApiResponse({ status: 429, description: "Token budget exceeded" })
  async processMessage(
    @Body() dto: InboxMessageDto,
    @Headers("x-correlation-id") correlationId?: string,
  ): Promise<InboxResponseDto> {
    this.logger.log({
      msg: "Incoming message",
      merchantId: dto.merchantId,
      senderId: dto.senderId,
      textLength: dto.text.length,
      correlationId,
    });

    const result = await this.inboxService.processMessage({
      merchantId: dto.merchantId,
      senderId: dto.senderId,
      text: dto.text,
      correlationId: correlationId || dto.correlationId,
    });

    return result;
  }
}
