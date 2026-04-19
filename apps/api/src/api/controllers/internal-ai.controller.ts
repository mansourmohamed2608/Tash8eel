import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  ForbiddenException,
  Headers,
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
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { IdempotencyService } from "../../shared/services/idempotency.service";

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
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly idempotencyService: IdempotencyService,
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
    await this.validateMerchantActive(request.merchantId); // BL-001

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
    await this.validateMerchantActive(request.merchantId); // BL-001

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
    await this.validateMerchantActive(request.merchantId); // BL-001

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
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ) {
    logger.info("AI objection response requested", {
      merchantId: body.merchantId,
      objectionType: body.objectionType,
    });
    await this.validateMerchantActive(body.merchantId); // BL-001

    return this.withIdempotency(idempotencyKey, body.merchantId, () =>
      this.opsAiService.generateObjectionResponse(
        body.merchantId,
        body.objectionType,
        body.context,
      ),
    );
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
  async generateAnomalyNarrative(
    @Body() request: AnomalyDetectionRequest,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ) {
    logger.info("Anomaly narrative requested", {
      merchantId: request.merchantId,
    });
    await this.validateMerchantActive(request.merchantId); // BL-001

    return this.withIdempotency(idempotencyKey, request.merchantId, () =>
      this.financeAiService.generateAnomalyNarrative(request),
    );
  }

  @Post("finance/cfo-brief")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Generate AI CFO brief (uses token budget)" })
  @ApiResponse({ status: 200, description: "CFO brief generated" })
  @ApiResponse({
    status: 400,
    description: "Budget exceeded or AI unavailable",
  })
  async generateCfoBrief(
    @Body() request: CfoBriefRequest,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ) {
    logger.info("CFO brief requested", { merchantId: request.merchantId });
    await this.validateMerchantActive(request.merchantId); // BL-001

    return this.withIdempotency(idempotencyKey, request.merchantId, () =>
      this.financeAiService.generateCfoBrief(request),
    );
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
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ) {
    logger.info("Agent reasoning requested", {
      merchantId: body.merchantId,
      agentType: body.agentType,
      checkType: body.checkType,
    });
    await this.validateMerchantActive(body.merchantId); // BL-001

    return this.withIdempotency(idempotencyKey, body.merchantId, async () => {
      const result = await this.llmService.agentReason(body);
      return {
        success: result.success,
        data: result.decision,
        tokensUsed: result.tokensUsed,
        error: result.error,
      };
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * BL-001: Verify the target merchant exists and is active before calling AI.
   * Internal routes receive merchantId from the request body (not a session key),
   * so this guard fills the entitlement gap left by InternalApiGuard alone.
   */
  private async validateMerchantActive(merchantId: string): Promise<void> {
    const result = await this.pool.query<{ is_active: boolean }>(
      `SELECT is_active FROM merchants WHERE id = $1`,
      [merchantId],
    );
    if (result.rows.length === 0) {
      throw new ForbiddenException(`Merchant ${merchantId} not found`);
    }
    if (!result.rows[0].is_active) {
      throw new ForbiddenException(
        `Merchant ${merchantId} is not active — AI call rejected`,
      );
    }
  }

  /**
   * BL-007: Wrap an AI mutation in idempotency semantics.
   * If idempotencyKey is provided and already stored, the cached response is
   * returned without re-executing the operation.
   */
  private async withIdempotency<T>(
    idempotencyKey: string | undefined,
    merchantId: string,
    fn: () => Promise<T>,
  ): Promise<T | Record<string, unknown>> {
    if (!idempotencyKey) return fn();
    const fullKey = `internal-ai:${merchantId}:${idempotencyKey}`;
    const cached = await this.idempotencyService.checkKey(fullKey);
    if (cached) return cached;
    const result = await fn();
    await this.idempotencyService.storeKey(
      fullKey,
      merchantId,
      result as unknown as Record<string, unknown>,
    );
    return result as T;
  }
}
