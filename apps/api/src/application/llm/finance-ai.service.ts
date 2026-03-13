import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from "zod";
import { createLogger } from "../../shared/logging/logger";
import { MERCHANT_REPOSITORY, IMerchantRepository } from "../../domain/ports";
import { AiMetricsService } from "../../shared/services/ai-metrics.service";
import { getTodayDate } from "../../shared/utils/helpers";

const logger = createLogger("FinanceAiService");

// ============= Zod Schemas for AI Responses =============

export const AnomalyNarrativeSchema = z.object({
  hasAnomaly: z.boolean(),
  severity: z.enum(["critical", "warning", "info"]),
  titleAr: z.string(),
  titleEn: z.string(),
  narrativeAr: z.string(),
  narrativeEn: z.string(),
  metrics: z.object({
    affectedArea: z.string(),
    deviation: z.number(),
    expectedValue: z.number(),
    actualValue: z.number(),
  }),
  recommendations: z.array(
    z.object({
      actionAr: z.string(),
      actionEn: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ),
});

export const CfoBriefSchema = z.object({
  period: z.string(),
  summaryAr: z.string(),
  summaryEn: z.string(),
  highlights: z.array(
    z.object({
      metricName: z.string(),
      value: z.number(),
      trend: z.enum(["up", "down", "stable"]),
      changePercent: z.number(),
      insight: z.string(),
    }),
  ),
  concerns: z.array(
    z.object({
      issueAr: z.string(),
      issueEn: z.string(),
      severity: z.enum(["critical", "warning", "info"]),
    }),
  ),
  recommendations: z.array(
    z.object({
      actionAr: z.string(),
      actionEn: z.string(),
    }),
  ),
});

export const MarginAlertSchema = z.object({
  alertType: z.enum([
    "low_margin",
    "negative_margin",
    "margin_drop",
    "cost_spike",
  ]),
  severity: z.enum(["critical", "warning", "info"]),
  titleAr: z.string(),
  titleEn: z.string(),
  messageAr: z.string(),
  messageEn: z.string(),
  affectedProducts: z.array(z.string()),
  suggestedAction: z.string(),
});

export type AnomalyNarrative = z.infer<typeof AnomalyNarrativeSchema>;
export type CfoBrief = z.infer<typeof CfoBriefSchema>;
export type MarginAlert = z.infer<typeof MarginAlertSchema>;

// ============= Request Types =============

export interface FinanceMetrics {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMargin: number;
  totalExpenses: number;
  netProfit: number;
  netMargin: number;
  codCollected: number;
  codPending: number;
  averageOrderValue: number;
  orderCount: number;
}

export interface HistoricalComparison {
  previousPeriod: FinanceMetrics;
  currentPeriod: FinanceMetrics;
  periodType: "daily" | "weekly" | "monthly";
}

export interface AnomalyDetectionRequest {
  merchantId: string;
  metrics: FinanceMetrics;
  historicalAvg: Partial<FinanceMetrics>;
  periodType: "daily" | "weekly" | "monthly";
}

export interface CfoBriefRequest {
  merchantId: string;
  comparison: HistoricalComparison;
  topProducts: Array<{ name: string; revenue: number; margin: number }>;
  topExpenses: Array<{ category: string; amount: number }>;
}

export interface ProfitCalculationRequest {
  revenue: number;
  cogs: number;
  expenses: number;
  deliveryFees: number;
  discounts: number;
}

// ============= Service =============

@Injectable()
export class FinanceAiService {
  private client: OpenAI;
  private model: string;

  constructor(
    private configService: ConfigService,
    @Inject(MERCHANT_REPOSITORY)
    private merchantRepository: IMerchantRepository,
    private readonly aiMetrics: AiMetricsService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
    this.model = this.configService.get<string>("OPENAI_MODEL", "gpt-4o-mini");
  }

  // ============= DETERMINISTIC CALCULATIONS =============

  /**
   * Calculate profit metrics (purely deterministic)
   */
  calculateProfitMetrics(request: ProfitCalculationRequest): {
    grossProfit: number;
    grossMargin: number;
    netProfit: number;
    netMargin: number;
  } {
    const { revenue, cogs, expenses, deliveryFees, discounts } = request;

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const totalCosts = cogs + expenses + discounts;
    const netRevenue = revenue + deliveryFees; // Delivery fees are typically passed to customer
    const netProfit = revenue - totalCosts;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      netMargin: Math.round(netMargin * 100) / 100,
    };
  }

  /**
   * Calculate COD reconciliation status (deterministic)
   */
  calculateCodReconciliation(
    collections: Array<{
      orderId: string;
      amount: number;
      collectedAt?: Date;
      status: string;
    }>,
  ): {
    totalExpected: number;
    totalCollected: number;
    totalPending: number;
    overdueCount: number;
    collectionRate: number;
  } {
    let totalExpected = 0;
    let totalCollected = 0;
    let overdueCount = 0;
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    for (const c of collections) {
      totalExpected += c.amount;
      if (c.status === "collected") {
        totalCollected += c.amount;
      } else if (c.status === "pending") {
        // Check if overdue (more than 2 days since expected)
        if (!c.collectedAt || new Date(c.collectedAt) < twoDaysAgo) {
          overdueCount++;
        }
      }
    }

    const totalPending = totalExpected - totalCollected;
    const collectionRate =
      totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 100;

    return {
      totalExpected: Math.round(totalExpected * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      overdueCount,
      collectionRate: Math.round(collectionRate * 100) / 100,
    };
  }

  /**
   * Detect margin alerts (deterministic rules)
   */
  detectMarginAlerts(
    products: Array<{
      id: string;
      name: string;
      price: number;
      cogs: number;
      salesCount: number;
    }>,
    thresholds: { lowMargin: number; criticalMargin: number } = {
      lowMargin: 15,
      criticalMargin: 5,
    },
  ): MarginAlert[] {
    const alerts: MarginAlert[] = [];

    for (const product of products) {
      const margin =
        product.price > 0
          ? ((product.price - product.cogs) / product.price) * 100
          : 0;

      if (margin < 0) {
        alerts.push({
          alertType: "negative_margin",
          severity: "critical",
          titleAr: "منتج بهامش سلبي!",
          titleEn: "Product with negative margin!",
          messageAr: `المنتج "${product.name}" يُباع بخسارة (الهامش: ${margin.toFixed(1)}%)`,
          messageEn: `Product "${product.name}" is being sold at a loss (margin: ${margin.toFixed(1)}%)`,
          affectedProducts: [product.name],
          suggestedAction: "Review pricing or supplier costs immediately",
        });
      } else if (margin < thresholds.criticalMargin) {
        alerts.push({
          alertType: "low_margin",
          severity: "critical",
          titleAr: "هامش ربح منخفض جداً",
          titleEn: "Very low profit margin",
          messageAr: `المنتج "${product.name}" هامش ربحه منخفض جداً (${margin.toFixed(1)}%)`,
          messageEn: `Product "${product.name}" has very low margin (${margin.toFixed(1)}%)`,
          affectedProducts: [product.name],
          suggestedAction: "Consider price increase or cost reduction",
        });
      } else if (margin < thresholds.lowMargin) {
        alerts.push({
          alertType: "low_margin",
          severity: "warning",
          titleAr: "هامش ربح منخفض",
          titleEn: "Low profit margin",
          messageAr: `المنتج "${product.name}" هامش ربحه منخفض (${margin.toFixed(1)}%)`,
          messageEn: `Product "${product.name}" has low margin (${margin.toFixed(1)}%)`,
          affectedProducts: [product.name],
          suggestedAction: "Monitor and consider optimization",
        });
      }
    }

    return alerts;
  }

  /**
   * Detect spending vs earning alert (deterministic)
   */
  detectSpendingAlert(metrics: FinanceMetrics): {
    hasAlert: boolean;
    alert?: MarginAlert;
  } {
    if (metrics.totalExpenses > metrics.totalRevenue) {
      return {
        hasAlert: true,
        alert: {
          alertType: "cost_spike",
          severity: "critical",
          titleAr: "⚠️ المصاريف تتجاوز الإيرادات!",
          titleEn: "⚠️ Expenses exceed revenue!",
          messageAr: `المصاريف (${metrics.totalExpenses} ج.م) أعلى من الإيرادات (${metrics.totalRevenue} ج.م) - صافي خسارة: ${(metrics.totalExpenses - metrics.totalRevenue).toFixed(0)} ج.م`,
          messageEn: `Expenses (${metrics.totalExpenses} EGP) exceed revenue (${metrics.totalRevenue} EGP) - Net loss: ${(metrics.totalExpenses - metrics.totalRevenue).toFixed(0)} EGP`,
          affectedProducts: [],
          suggestedAction: "Immediate expense review required",
        },
      };
    }

    // Warning if expenses are > 80% of revenue
    if (metrics.totalExpenses > metrics.totalRevenue * 0.8) {
      return {
        hasAlert: true,
        alert: {
          alertType: "cost_spike",
          severity: "warning",
          titleAr: "نسبة المصاريف مرتفعة",
          titleEn: "High expense ratio",
          messageAr: `المصاريف تمثل ${((metrics.totalExpenses / metrics.totalRevenue) * 100).toFixed(0)}% من الإيرادات`,
          messageEn: `Expenses are ${((metrics.totalExpenses / metrics.totalRevenue) * 100).toFixed(0)}% of revenue`,
          affectedProducts: [],
          suggestedAction: "Review major expense categories",
        },
      };
    }

    return { hasAlert: false };
  }

  // ============= AI-ENHANCED METHODS =============

  /**
   * Generate anomaly narrative using AI
   */
  async generateAnomalyNarrative(
    request: AnomalyDetectionRequest,
  ): Promise<
    | { success: true; data: AnomalyNarrative; tokensUsed: number }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: "AI client not configured" };
    }

    const budgetOk = await this.checkAndDeductBudget(request.merchantId, 800);
    if (!budgetOk) {
      return { success: false, error: "Token budget exceeded" };
    }

    try {
      const { metrics, historicalAvg, periodType } = request;

      // Calculate deviations
      const deviations: Record<string, number> = {};
      for (const [key, value] of Object.entries(metrics)) {
        const avg = (historicalAvg as any)[key];
        if (avg && typeof value === "number") {
          deviations[key] = ((value - avg) / avg) * 100;
        }
      }

      const prompt = `أنت محلل مالي مصري متخصص في التجارة الإلكترونية الصغيرة والمتوسطة. حلل هذه البيانات المالية وأعطني تقرير عن أي شذوذ أو أنماط مقلقة.

=== البيانات الحالية (${periodType}) ===
- الإيرادات: ${metrics.totalRevenue} ج.م
- التكلفة: ${metrics.totalCogs} ج.م
- هامش الربح الإجمالي: ${metrics.grossMargin}%
- المصاريف: ${metrics.totalExpenses} ج.م
- صافي الربح: ${metrics.netProfit} ج.م
- عدد الطلبات: ${metrics.orderCount}
- متوسط قيمة الطلب: ${metrics.averageOrderValue} ج.م
- تحصيل COD المعلق: ${metrics.codPending} ج.م

=== الانحرافات عن المتوسط ===
${JSON.stringify(deviations, null, 2)}

=== معايير السوق المصري (للمقارنة) ===
- هامش ربح إجمالي صحي: 30-50% (ملابس: 40-60%، إلكترونيات: 15-25%، مستحضرات تجميل: 50-70%، أطعمة: 20-35%)
- نسبة المصاريف للإيرادات: يجب أن تكون أقل من 30%
- نسبة COD المعلق: أكثر من 20% من الإيرادات = مشكلة تحصيل
- مواسم الذروة (رمضان/أعياد/نوفمبر): توقع زيادة 30-60% في الإيرادات
- أنماط شائعة: ارتفاع تكاليف الشحن بسبب المحافظات البعيدة، ارتفاع المرتجعات في الملابس (15-25%)
- الضريبة: ضريبة القيمة المضافة 14% (المنشآت المسجّلة)

أجب بصيغة JSON فقط:
{
  "hasAnomaly": boolean,
  "severity": "critical" | "warning" | "info",
  "titleAr": "عنوان التقرير بالعربي",
  "titleEn": "English title",
  "narrativeAr": "شرح مفصل بالعربي (2-3 جمل)",
  "narrativeEn": "Detailed explanation in English",
  "metrics": { "affectedArea": "اسم المجال", "deviation": number, "expectedValue": number, "actualValue": number },
  "recommendations": [{ "actionAr": "الإجراء", "actionEn": "action", "priority": "high|medium|low" }]
}`;

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const tokensUsed = completion.usage?.total_tokens || 0;

      await this.recordUsage(request.merchantId, tokensUsed);
      void this.aiMetrics.record({
        serviceName: "FinanceAiService",
        methodName: "generateAnomalyNarrative",
        merchantId: request.merchantId,
        outcome: "success",
        tokensUsed,
      });

      const parsed = JSON.parse(responseText);
      const validated = AnomalyNarrativeSchema.parse(parsed);

      return { success: true, data: validated, tokensUsed };
    } catch (err) {
      logger.error("Anomaly narrative generation failed", err as Error, {
        merchantId: request.merchantId,
      });
      void this.aiMetrics.record({
        serviceName: "FinanceAiService",
        methodName: "generateAnomalyNarrative",
        merchantId: request.merchantId,
        outcome: "error",
      });
      return { success: false, error: "AI generation failed" };
    }
  }

  /**
   * Generate CFO brief using AI
   */
  async generateCfoBrief(
    request: CfoBriefRequest,
  ): Promise<
    | { success: true; data: CfoBrief; tokensUsed: number }
    | { success: false; error: string }
  > {
    if (!this.client) {
      return { success: false, error: "AI client not configured" };
    }

    const budgetOk = await this.checkAndDeductBudget(request.merchantId, 1000);
    if (!budgetOk) {
      return { success: false, error: "Token budget exceeded" };
    }

    try {
      const { comparison, topProducts, topExpenses } = request;
      const { previousPeriod, currentPeriod, periodType } = comparison;

      const prompt = `أنت مدير مالي مصري متخصص في التجارة الإلكترونية. اكتب ملخص تنفيذي مفيد وعملي للتاجر بناءً على هذه البيانات.

=== مقارنة الفترات (${periodType}) ===
الفترة السابقة → الحالية:
- الإيرادات: ${previousPeriod.totalRevenue} → ${currentPeriod.totalRevenue} ج.م
- صافي الربح: ${previousPeriod.netProfit} → ${currentPeriod.netProfit} ج.م
- هامش الربح: ${previousPeriod.netMargin}% → ${currentPeriod.netMargin}%
- عدد الطلبات: ${previousPeriod.orderCount} → ${currentPeriod.orderCount}
- متوسط قيمة الطلب: ${previousPeriod.averageOrderValue} → ${currentPeriod.averageOrderValue} ج.م
- COD معلق: ${currentPeriod.codPending} ج.م

=== أفضل المنتجات ===
${topProducts.map((p) => `- ${p.name}: ${p.revenue} ج.م (هامش ${p.margin}%)`).join("\n")}

=== أكبر المصاريف ===
${topExpenses.map((e) => `- ${e.category}: ${e.amount} ج.م`).join("\n")}

=== سياق مهم للتحليل ===
- معايير الهوامش المصرية: ملابس 40-60%، إلكترونيات 15-25%، تجميل 50-70%، أطعمة 20-35%
- لو الفترة تشمل رمضان/عيد/جمعة بيضاء، التغييرات طبيعية وموسمية
- لو فيه COD معلق كبير، ده يأثر على السيولة النقدية
- المصاريف اللي تتجاوز 30% من الإيرادات تحتاج مراجعة
- ضريبة القيمة المضافة 14% - تأكد إن الهوامش تحسبها

=== أسلوب الكتابة ===
- الملخص العربي: واضح ومباشر بالفصحى البسيطة، 3-4 جمل تلخص الوضع
- ركز على الأرقام المهمة والتغييرات الجوهرية
- التوصيات: عملية وقابلة للتنفيذ (مثلاً: "زوّد سعر المنتج X بـ 15%" بدل "راجع الأسعار")
- اذكر أي مخاطر واضحة (هوامش منخفضة، مصاريف عالية، تحصيل متأخر)

أجب بصيغة JSON:
{
  "period": "الفترة",
  "summaryAr": "ملخص عام بالعربي (3-4 جمل)",
  "summaryEn": "English summary",
  "highlights": [{ "metricName": "اسم", "value": number, "trend": "up|down|stable", "changePercent": number, "insight": "ملاحظة" }],
  "concerns": [{ "issueAr": "المشكلة", "issueEn": "issue", "severity": "critical|warning|info" }],
  "recommendations": [{ "actionAr": "الإجراء", "actionEn": "action" }]
}`;

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const tokensUsed = completion.usage?.total_tokens || 0;

      await this.recordUsage(request.merchantId, tokensUsed);

      const parsed = JSON.parse(responseText);
      const validated = CfoBriefSchema.parse(parsed);

      return { success: true, data: validated, tokensUsed };
    } catch (err) {
      logger.error("CFO brief generation failed", err as Error, {
        merchantId: request.merchantId,
      });
      return { success: false, error: "AI generation failed" };
    }
  }

  // ============= PRIVATE METHODS =============

  private async checkAndDeductBudget(
    merchantId: string,
    estimatedTokens: number,
  ): Promise<boolean> {
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) return false;

    const usage = await this.merchantRepository.getTokenUsage(
      merchantId,
      getTodayDate(),
    );
    const used = usage?.tokensUsed || 0;
    const budget = merchant.dailyTokenBudget;
    const remaining = budget - used;

    return remaining >= estimatedTokens;
  }

  private async recordUsage(
    merchantId: string,
    tokensUsed: number,
  ): Promise<void> {
    await this.merchantRepository.incrementTokenUsage(
      merchantId,
      getTodayDate(),
      tokensUsed,
    );
  }
}
