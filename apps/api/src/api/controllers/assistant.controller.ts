import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
  Req,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { MerchantAssistantService } from "../../application/llm/merchant-assistant.service";

@ApiTags("Merchant Assistant")
@Controller("v1/portal/assistant")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class MerchantAssistantController {
  constructor(private readonly assistantService: MerchantAssistantService) {}

  @Post("chat")
  @ApiOperation({ summary: "Chat with merchant assistant (KB-aware)" })
  async chat(
    @Body()
    body: {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    },
    @Req() req: any,
  ) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    if (!body?.message?.trim()) {
      throw new BadRequestException("Message is required");
    }

    const result = await this.assistantService.chat(
      merchantId,
      body.message.trim(),
      body.history || [],
    );
    return result;
  }
}
