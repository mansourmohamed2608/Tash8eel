/**
 * Worker LLM Client Module
 *
 * Provides AI capabilities to worker agents by calling centralized API endpoints.
 * This ensures:
 * - Single source of truth for token budgets (in apps/api)
 * - Centralized logging and monitoring
 * - No direct OpenAI SDK usage in worker
 */
import { Module, Injectable } from "@nestjs/common";
import { ConfigService, ConfigModule } from "@nestjs/config";
import { HttpService, HttpModule } from "@nestjs/axios";
import { z } from "zod";
import { firstValueFrom } from "rxjs";
import { createLogger } from "@tash8eel/shared";

const logger = createLogger("WorkerLlmClient");

// ============================================================================
// Zod Schemas for AI Feature Outputs (must match API schemas)
// ============================================================================

export const SubstitutionRankingSchema = z.object({
  rankings: z.array(
    z.object({
      variantId: z.string(),
      rank: z.number().int().positive(),
      reasonAr: z.string(),
      reasonEn: z.string(),
    }),
  ),
  customerMessageAr: z.string(),
  merchantMessageAr: z.string(),
});
export type SubstitutionRanking = z.infer<typeof SubstitutionRankingSchema>;

export const RestockInsightSchema = z.object({
  explanationAr: z.string(),
  explanationEn: z.string(),
  suggestedActions: z.array(
    z.object({
      actionType: z.enum([
        "push_promotion",
        "bundle_product",
        "clearance",
        "reorder_urgent",
        "reorder_normal",
        "adjust_price",
      ]),
      descriptionAr: z.string(),
      descriptionEn: z.string(),
      priority: z.number().optional(),
    }),
  ),
  supplierMessageDraftAr: z.string().optional(),
});
export type RestockInsight = z.infer<typeof RestockInsightSchema>;

// ============================================================================
// LLM Client Interface
// ============================================================================

export interface ILlmClient {
  generateSubstitutionRanking(
    merchantId: string,
    originalItem: {
      name: string;
      category: string;
      price: number;
      sku?: string;
    },
    candidates: Array<{
      id: string;
      name: string;
      price: number;
      sku?: string;
      quantityAvailable?: number;
      attributes?: Record<string, unknown>;
    }>,
  ): Promise<SubstitutionRanking | null>;

  generateRestockInsight(
    merchantId: string,
    item: {
      name: string;
      sku: string;
      currentQty: number;
      recommendedQty?: number;
      dailySales: number;
      daysUntilStockout: number | null;
      urgency?: "critical" | "high" | "medium" | "low";
    },
  ): Promise<RestockInsight | null>;

  generateSupplierMessage(
    merchantId: string,
    items: Array<{
      name: string;
      sku: string;
      quantity: number;
      urgency?: string;
    }>,
    totalValue?: number,
  ): Promise<string | null>;

  agentReason(request: {
    merchantId: string;
    merchantName: string;
    agentType: string;
    checkType: string;
    contextData: Record<string, any>;
  }): Promise<AgentReasoningResult | null>;
}

export interface AgentReasoningResult {
  shouldAct: boolean;
  action: string;
  titleAr: string;
  descriptionAr: string;
  severity: "INFO" | "WARNING" | "ACTION" | "CRITICAL";
  personalizedMessage?: string;
  reasoning: string;
}

export const LLM_CLIENT = Symbol("LLM_CLIENT");

// ============================================================================
// API Client Implementation (calls apps/api internal endpoints)
// ============================================================================

@Injectable()
export class ApiLlmClient implements ILlmClient {
  private apiBaseUrl: string;
  private internalApiKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.apiBaseUrl = this.configService.get<string>(
      "API_BASE_URL",
      "http://localhost:3000",
    );
    this.internalApiKey = this.configService.get<string>(
      "INTERNAL_API_KEY",
      "",
    );
  }

  private async callApi<T>(endpoint: string, body: unknown): Promise<T | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          success: boolean;
          data?: T;
          error?: string;
          tokensUsed?: number;
        }>(`${this.apiBaseUrl}/internal/ai/${endpoint}`, body, {
          headers: {
            "Content-Type": "application/json",
            "x-internal-api-key": this.internalApiKey,
          },
          timeout: 30000,
        }),
      );

      if (!response.data.success) {
        logger.warn("API call failed", {
          endpoint,
          error: response.data.error,
        });
        return null;
      }

      logger.info("AI API call succeeded", {
        endpoint,
        tokensUsed: response.data.tokensUsed,
      });
      return response.data.data as T;
    } catch (error) {
      const err = error as Error;
      logger.error("API call error", err, { endpoint });
      return null;
    }
  }

  async generateSubstitutionRanking(
    merchantId: string,
    originalItem: {
      name: string;
      category: string;
      price: number;
      sku?: string;
    },
    candidates: Array<{
      id: string;
      name: string;
      price: number;
      sku?: string;
      quantityAvailable?: number;
      attributes?: Record<string, unknown>;
    }>,
  ): Promise<SubstitutionRanking | null> {
    const result = await this.callApi<SubstitutionRanking>(
      "inventory/substitution-ranking",
      {
        merchantId,
        originalProduct: {
          sku: originalItem.sku || "unknown",
          name: originalItem.name,
          price: originalItem.price,
          category: originalItem.category,
        },
        alternatives: candidates.map((c) => ({
          variantId: c.id,
          sku: c.sku || c.id,
          name: c.name,
          price: c.price,
          quantityAvailable: c.quantityAvailable || 0,
        })),
      },
    );

    if (!result) return null;

    // Validate with Zod
    const validated = SubstitutionRankingSchema.safeParse(result);
    if (!validated.success) {
      logger.warn("Substitution ranking validation failed", {
        errors: validated.error.errors,
      });
      return null;
    }

    return validated.data;
  }

  async generateRestockInsight(
    merchantId: string,
    item: {
      name: string;
      sku: string;
      currentQty: number;
      recommendedQty?: number;
      dailySales: number;
      daysUntilStockout: number | null;
      urgency?: "critical" | "high" | "medium" | "low";
    },
  ): Promise<RestockInsight | null> {
    const result = await this.callApi<RestockInsight>(
      "inventory/restock-insight",
      {
        merchantId,
        product: {
          sku: item.sku,
          name: item.name,
          currentQuantity: item.currentQty,
          recommendedQuantity:
            item.recommendedQty || Math.ceil(item.currentQty * 2),
          avgDailySales: item.dailySales,
          daysUntilStockout: item.daysUntilStockout ?? 0,
          urgency: item.urgency || "medium",
        },
      },
    );

    if (!result) return null;

    // Validate with Zod
    const validated = RestockInsightSchema.safeParse(result);
    if (!validated.success) {
      logger.warn("Restock insight validation failed", {
        errors: validated.error.errors,
      });
      return null;
    }

    return validated.data;
  }

  async generateSupplierMessage(
    merchantId: string,
    items: Array<{
      name: string;
      sku: string;
      quantity: number;
      urgency?: string;
    }>,
    totalValue?: number,
  ): Promise<string | null> {
    const result = await this.callApi<{ messageAr: string }>(
      "inventory/supplier-message",
      {
        merchantId,
        merchantName: `Merchant ${merchantId}`, // Will be fetched server-side
        products: items,
      },
    );

    return result?.messageAr || null;
  }

  async agentReason(request: {
    merchantId: string;
    merchantName: string;
    agentType: string;
    checkType: string;
    contextData: Record<string, any>;
  }): Promise<AgentReasoningResult | null> {
    const result = await this.callApi<AgentReasoningResult>(
      "agent/reason",
      request,
    );
    return result || null;
  }
}

// ============================================================================
// Mock Implementation for Testing
// ============================================================================

@Injectable()
export class MockLlmClient implements ILlmClient {
  async generateSubstitutionRanking(
    merchantId: string,
    originalItem: {
      name: string;
      category: string;
      price: number;
      sku?: string;
    },
    candidates: Array<{
      id: string;
      name: string;
      price: number;
      sku?: string;
      quantityAvailable?: number;
      attributes?: Record<string, unknown>;
    }>,
  ): Promise<SubstitutionRanking | null> {
    logger.debug("Mock: generateSubstitutionRanking", {
      merchantId,
      originalItem: originalItem.name,
    });

    // Return deterministic mock based on candidates
    return {
      rankings: candidates.slice(0, 3).map((c, idx) => ({
        variantId: c.id,
        rank: idx + 1,
        reasonAr: `بديل مناسب - ${c.name}`,
        reasonEn: `Suitable alternative - ${c.name}`,
      })),
      customerMessageAr: `للأسف ${originalItem.name} مش متوفر دلوقتي. عندنا بدائل ممتازة زي ${candidates[0]?.name || "منتجات تانية"}.`,
      merchantMessageAr: `المنتج ${originalItem.name} غير متاح. تم اقتراح ${candidates.length} بدائل للعميل.`,
    };
  }

  async generateRestockInsight(
    merchantId: string,
    item: {
      name: string;
      sku: string;
      currentQty: number;
      recommendedQty?: number;
      dailySales: number;
      daysUntilStockout: number | null;
      urgency?: "critical" | "high" | "medium" | "low";
    },
  ): Promise<RestockInsight | null> {
    logger.debug("Mock: generateRestockInsight", { merchantId, sku: item.sku });

    const urgency = item.urgency || "medium";
    const recommendedQty =
      item.recommendedQty || Math.ceil(item.currentQty * 2);

    const actions =
      urgency === "critical" || urgency === "high"
        ? [
            {
              actionType: "reorder_urgent" as const,
              descriptionAr: "اطلب من المورد فوراً",
              descriptionEn: "Order immediately",
              priority: 1,
            },
          ]
        : [
            {
              actionType: "reorder_normal" as const,
              descriptionAr: "اطلب في الجدول العادي",
              descriptionEn: "Order in regular schedule",
              priority: 2,
            },
          ];

    return {
      explanationAr: `المنتج ${item.name} عنده ${item.currentQty} قطع بس. محتاج ${recommendedQty} قطعة.`,
      explanationEn: `Product ${item.name} has only ${item.currentQty} units. Needs ${recommendedQty} units.`,
      suggestedActions: actions,
      supplierMessageDraftAr:
        urgency === "critical"
          ? `السلام عليكم، محتاجين ${item.name} عاجل - ${recommendedQty} قطعة.`
          : undefined,
    };
  }

  async generateSupplierMessage(
    merchantId: string,
    items: Array<{
      name: string;
      sku: string;
      quantity: number;
      urgency?: string;
    }>,
    totalValue?: number,
  ): Promise<string | null> {
    logger.debug("Mock: generateSupplierMessage", {
      merchantId,
      itemCount: items.length,
    });

    const itemsList = items
      .map((i) => `- ${i.name}: ${i.quantity} قطعة`)
      .join("\n");
    return `السلام عليكم،
محتاجين نطلب المنتجات التالية:
${itemsList}

ياريت تفيدونا بموعد التسليم.
شكراً`;
  }

  async agentReason(request: {
    merchantId: string;
    merchantName: string;
    agentType: string;
    checkType: string;
    contextData: Record<string, any>;
  }): Promise<AgentReasoningResult | null> {
    logger.debug("Mock: agentReason", {
      merchantId: request.merchantId,
      checkType: request.checkType,
    });
    return {
      shouldAct: true,
      action: request.checkType,
      titleAr: `[تجريبي] ${request.checkType}`,
      descriptionAr: `قرار تجريبي لاختبار ${request.checkType}`,
      severity: "INFO",
      reasoning: `Mock reasoning for ${request.checkType}`,
    };
  }
}

// ============================================================================
// Module
// ============================================================================

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
  ],
  providers: [
    {
      provide: LLM_CLIENT,
      useFactory: (configService: ConfigService, httpService: HttpService) => {
        const apiUrl = configService.get<string>("API_BASE_URL");
        const strictAiMode =
          (
            configService.get<string>("AI_STRICT_MODE", "false") || "false"
          ).toLowerCase() === "true";

        // Use API client if API URL is configured, otherwise use mock (unless strict AI mode).
        if (apiUrl) {
          logger.info("Worker LLM client connecting to API", { apiUrl });
          return new ApiLlmClient(configService, httpService);
        }

        if (strictAiMode) {
          logger.warn(
            "⚠️ AI_STRICT_MODE is enabled and API_BASE_URL is missing — LLM client disabled (no mock responses).",
          );
          return null;
        }

        logger.warn(
          "⚠️ No API_BASE_URL configured — worker using MOCK LLM client. AI agent responses will be simulated. Set API_BASE_URL for real AI.",
        );
        return new MockLlmClient();
      },
      inject: [ConfigService, HttpService],
    },
  ],
  exports: [LLM_CLIENT],
})
export class LlmClientModule {}
