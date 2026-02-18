import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import {
  InventoryAiService,
  SubstitutionRankingRequest,
  RestockInsightRequest,
  SupplierMessageRequest,
} from "../../application/llm/inventory-ai.service";
import {
  OpsAiService,
  LeadScoringRequest,
  ObjectionDetectionRequest,
  NbaRequest,
  OrderConfirmationRequest,
} from "../../application/llm/ops-ai.service";
import {
  FinanceAiService,
  AnomalyDetectionRequest,
  CfoBriefRequest,
  ProfitCalculationRequest,
  FinanceMetrics,
} from "../../application/llm/finance-ai.service";
import { LlmService } from "../../application/llm/llm.service";
import { InternalApiGuard } from "../../shared/guards/internal-api.guard";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("InternalAiController");

/**
 * Internal API for AI operations - called by worker service
 * Protected by internal API key (not merchant API key)
 */
@ApiTags("Internal - AI")
@Controller("internal/ai")
@UseGuards(InternalApiGuard)
@ApiBearerAuth("internal-api-key")
export class InternalAiController {
  constructor(
    private readonly inventoryAiService: InventoryAiService,
    private readonly opsAiService: OpsAiService,
    private readonly financeAiService: FinanceAiService,
    private readonly llmService: LlmService,
  ) {}

  @Post("inventory/substitution-ranking")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Generate AI substitution ranking for out-of-stock product",
  })
  @ApiResponse({ status: 200, description: "Ranking generated successfully" })
  @ApiResponse({
    status: 400,
    description: "Invalid request or budget exceeded",
  })
  async generateSubstitutionRanking(
    @Body() request: SubstitutionRankingRequest,
  ) {
    logger.info("Substitution ranking requested", {
      merchantId: request.merchantId,
    });

    const result =
      await this.inventoryAiService.generateSubstitutionRanking(request);

    if (!result.success) {
      return {
        success: false,
        error: (result as { success: false; error: string }).error,
      };
    }

    return {
      success: true,
      data: result.data,
      tokensUsed: result.tokensUsed,
    };
  }

  @Post("inventory/restock-insight")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Generate AI restock insight for low stock product",
  })
  @ApiResponse({ status: 200, description: "Insight generated successfully" })
  @ApiResponse({
    status: 400,
    description: "Invalid request or budget exceeded",
  })
  async generateRestockInsight(@Body() request: RestockInsightRequest) {
    logger.info("Restock insight requested", {
      merchantId: request.merchantId,
    });

    const result =
      await this.inventoryAiService.generateRestockInsight(request);

    if (!result.success) {
      return {
        success: false,
        error: (result as { success: false; error: string }).error,
      };
    }

    return {
      success: true,
      data: result.data,
      tokensUsed: result.tokensUsed,
    };
  }

  @Post("inventory/supplier-message")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Generate AI supplier order message" })
  @ApiResponse({ status: 200, description: "Message generated successfully" })
  @ApiResponse({
    status: 400,
    description: "Invalid request or budget exceeded",
  })
  async generateSupplierMessage(@Body() request: SupplierMessageRequest) {
    logger.info("Supplier message requested", {
      merchantId: request.merchantId,
    });

    const result =
      await this.inventoryAiService.generateSupplierMessage(request);

    if (!result.success) {
      return {
        success: false,
        error: (result as { success: false; error: string }).error,
      };
    }

    return {
      success: true,
      data: result.data,
      tokensUsed: result.tokensUsed,
    };
  }

  @Get("token-usage/:merchantId")
  @ApiOperation({ summary: "Get token usage for merchant" })
  @ApiResponse({ status: 200, description: "Token usage retrieved" })
  async getTokenUsage(@Param("merchantId") merchantId: string) {
    const usage = await this.inventoryAiService.getTokenUsage(merchantId);
    return usage;
  }

  // ============= OPS AGENT ENDPOINTS =============

  @Post("ops/lead-score")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Calculate lead score (deterministic + optional AI classification)",
  })
  @ApiResponse({ status: 200, description: "Lead score calculated" })
  async calculateLeadScore(@Body() request: LeadScoringRequest) {
    logger.info("Lead scoring requested", {
      merchantId: request.merchantId,
      conversationId: request.conversationId,
    });

    const result = this.opsAiService.calculateLeadScore(request);

    return {
      success: true,
      data: result,
    };
  }

  @Post("ops/detect-objection")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Detect objection type from customer message (deterministic)",
  })
  @ApiResponse({ status: 200, description: "Objection detected" })
  async detectObjection(@Body() request: ObjectionDetectionRequest) {
    logger.info("Objection detection requested", {
      merchantId: request.merchantId,
      conversationId: request.conversationId,
    });

    const result = this.opsAiService.detectObjection(request.messageText);

    return {
      success: true,
      data: result,
    };
  }

  @Post("ops/next-best-action")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Determine next best action for conversation (deterministic)",
  })
  @ApiResponse({ status: 200, description: "NBA calculated" })
  async determineNextBestAction(@Body() request: NbaRequest) {
    logger.info("NBA requested", {
      merchantId: request.merchantId,
      conversationId: request.conversationId,
    });

    const result = this.opsAiService.determineNextBestAction(request);

    return {
      success: true,
      data: result,
    };
  }

  @Post("ops/order-confirmation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Generate order confirmation summary for customer" })
  @ApiResponse({ status: 200, description: "Confirmation summary generated" })
  async generateOrderConfirmation(@Body() request: OrderConfirmationRequest) {
    logger.info("Order confirmation requested", {
      merchantId: request.merchantId,
    });

    const result = this.opsAiService.generateOrderConfirmationSummary(request);

    return {
      success: true,
      data: result,
    };
  }

  @Post("ops/objection-response")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Generate AI-powered objection response (optional, uses token budget)",
  })
  @ApiResponse({ status: 200, description: "Response generated" })
  @ApiResponse({
    status: 400,
    description: "Budget exceeded or AI unavailable",
  })
  async generateObjectionResponse(
    @Body()
    body: {
      merchantId: string;
      objectionType: string;
      context: {
        productName?: string;
        cartValue?: number;
        deliveryFee?: number;
      };
    },
  ) {
    logger.info("AI objection response requested", {
      merchantId: body.merchantId,
      objectionType: body.objectionType,
    });

    const result = await this.opsAiService.generateObjectionResponse(
      body.merchantId,
      body.objectionType,
      body.context,
    );

    return result;
  }

  // ============= FINANCE AGENT ENDPOINTS =============

  @Post("finance/calculate-profit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Calculate profit metrics (deterministic)" })
  @ApiResponse({ status: 200, description: "Profit calculated" })
  async calculateProfit(@Body() request: ProfitCalculationRequest) {
    logger.info("Profit calculation requested");

    const result = this.financeAiService.calculateProfitMetrics(request);

    return {
      success: true,
      data: result,
    };
  }

  @Post("finance/cod-reconciliation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Calculate COD reconciliation status (deterministic)",
  })
  @ApiResponse({ status: 200, description: "COD reconciliation calculated" })
  async calculateCodReconciliation(
    @Body()
    body: {
      collections: Array<{
        orderId: string;
        amount: number;
        collectedAt?: Date;
        status: string;
      }>;
    },
  ) {
    logger.info("COD reconciliation requested");

    const result = this.financeAiService.calculateCodReconciliation(
      body.collections,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Post("finance/margin-alerts")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Detect margin alerts (deterministic)" })
  @ApiResponse({ status: 200, description: "Margin alerts detected" })
  async detectMarginAlerts(
    @Body()
    body: {
      products: Array<{
        id: string;
        name: string;
        price: number;
        cogs: number;
        salesCount: number;
      }>;
      thresholds?: { lowMargin: number; criticalMargin: number };
    },
  ) {
    logger.info("Margin alerts detection requested");

    const result = this.financeAiService.detectMarginAlerts(
      body.products,
      body.thresholds,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Post("finance/spending-alert")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Detect spending vs earning alert (deterministic)" })
  @ApiResponse({ status: 200, description: "Spending alert checked" })
  async detectSpendingAlert(@Body() metrics: FinanceMetrics) {
    logger.info("Spending alert detection requested");

    const result = this.financeAiService.detectSpendingAlert(metrics);

    return {
      success: true,
      data: result,
    };
  }

  @Post("finance/anomaly-narrative")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Generate AI anomaly narrative (uses token budget)",
  })
  @ApiResponse({ status: 200, description: "Anomaly narrative generated" })
  @ApiResponse({
    status: 400,
    description: "Budget exceeded or AI unavailable",
  })
  async generateAnomalyNarrative(@Body() request: AnomalyDetectionRequest) {
    logger.info("Anomaly narrative requested", {
      merchantId: request.merchantId,
    });

    const result =
      await this.financeAiService.generateAnomalyNarrative(request);

    return result;
  }

  @Post("finance/cfo-brief")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Generate AI CFO brief (uses token budget)" })
  @ApiResponse({ status: 200, description: "CFO brief generated" })
  @ApiResponse({
    status: 400,
    description: "Budget exceeded or AI unavailable",
  })
  async generateCfoBrief(@Body() request: CfoBriefRequest) {
    logger.info("CFO brief requested", { merchantId: request.merchantId });

    const result = await this.financeAiService.generateCfoBrief(request);

    return result;
  }

  // ============= AUTONOMOUS AGENT REASONING =============

  @Post("agent/reason")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Autonomous agent reasoning — GPT decides what action to take",
  })
  @ApiResponse({ status: 200, description: "Agent decision returned" })
  async agentReason(
    @Body()
    body: {
      merchantId: string;
      merchantName: string;
      agentType: string;
      checkType: string;
      contextData: Record<string, any>;
    },
  ) {
    logger.info("Agent reasoning requested", {
      merchantId: body.merchantId,
      agentType: body.agentType,
      checkType: body.checkType,
    });

    const result = await this.llmService.agentReason(body);

    return {
      success: result.success,
      data: result.decision,
      tokensUsed: result.tokensUsed,
      error: result.error,
    };
  }
}
