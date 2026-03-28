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
import { RagRetrievalService } from "../../application/services/rag-retrieval.service";

@ApiTags("Merchant Assistant")
@Controller("v1/portal/assistant")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class MerchantAssistantController {
  constructor(
    private readonly assistantService: MerchantAssistantService,
    private readonly ragRetrievalService: RagRetrievalService,
  ) {}

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

  @Post("rag-preview")
  @ApiOperation({
    summary:
      "Preview RAG retrieval for a query (helps verify catalog grounding)",
  })
  async ragPreview(
    @Body() body: { query: string; limit?: number },
    @Req() req: any,
  ) {
    const merchantId = req?.merchantId;
    if (!merchantId) {
      throw new BadRequestException("Merchant context missing");
    }

    const query = body?.query?.trim();
    if (!query) {
      throw new BadRequestException("Query is required");
    }

    const limit =
      typeof body?.limit === "number" && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(30, Math.trunc(body.limit)))
        : 10;

    const items = await this.ragRetrievalService.retrieveForQuery(
      merchantId,
      query,
      limit,
    );

    return {
      query,
      limit,
      total: items.length,
      items: items.map((item) => ({
        id: item.id,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        category: item.category,
        basePrice: item.basePrice,
        isAvailable: item.isAvailable,
        tags: item.tags || [],
      })),
    };
  }
}
