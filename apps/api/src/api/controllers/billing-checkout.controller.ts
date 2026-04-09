import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { RequireRole, RolesGuard } from "../../shared/guards/roles.guard";
import { BillingCatalogService } from "../../application/services/billing-catalog.service";
import {
  PLAN_ENTITLEMENTS,
  FEATURE_PRICES_EGP,
  AGENT_PRICES_EGP,
  AI_USAGE_TIERS,
  MESSAGE_TIERS,
  AGENT_CATALOG,
  FEATURE_CATALOG,
  getPublicPricingCatalog,
} from "../../shared/entitlements";
import {
  applyCanonicalPlanData,
  CASHIER_PROMO_DAYS,
  isCashierPromoEligiblePlan,
} from "./billing.helpers";

@ApiTags("Billing")
@Controller("v1/portal/billing")
@UseGuards(MerchantApiKeyGuard, RolesGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class BillingCheckoutController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly billingCatalogService: BillingCatalogService,
  ) {}

  @Post("byo/quote")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "BYO quote endpoint (alias of /byo/calculate)" })
  async calculateByoQuote(
    @Body()
    body: {
      regionCode?: string;
      cycleMonths?: number;
      addOns?: Array<{ code: string; quantity?: number }>;
      usagePacks?: Array<{ code: string; quantity?: number }>;
    },
  ) {
    return this.billingCatalogService.calculateByo(body || {});
  }

  @Post("byo/calculate")
  @RequireRole("OWNER")
  @ApiOperation({
    summary:
      "Calculate Build-Your-Own pricing (core + add-ons + usage packs) with cycle discounts and bundle floor",
  })
  async calculateByo(
    @Body()
    body: {
      regionCode?: string;
      cycleMonths?: number;
      addOns?: Array<{ code: string; quantity?: number }>;
      usagePacks?: Array<{ code: string; quantity?: number }>;
    },
  ) {
    return this.billingCatalogService.calculateByo(body || {});
  }

  @Get("pricing")
  @ApiOperation({ summary: "Get full pricing data for the pricing calculator" })
  async getPricing() {
    const catalog = getPublicPricingCatalog();
    const plans = catalog.plans.map((plan) => ({
      id: plan.id,
      nameAr: plan.nameAr,
      nameEn: plan.nameEn,
      price: plan.monthlyPriceEgp,
      currency: catalog.currency,
      agents: plan.includedAgents,
      features: plan.includedFeatures,
      excludedFeatures: plan.excludedFeatures,
      limits: {
        totalMessagesPerDay: plan.totalMessagesPerDay,
        totalMessagesPerMonth: plan.totalMessagesPerMonth,
        aiRepliesPerDay: plan.aiRepliesPerDay,
        aiRepliesPerMonth: plan.aiRepliesPerMonth,
        branches: plan.includedBranches,
        posConnections: plan.includedPosConnections,
      },
      isFullPlatformPlan: plan.isFullPlatformPlan,
      bestFor: plan.bestFor,
      mainValue: plan.mainValue,
      cashierPromoEligible: plan.cashierPromoEligible,
      upsellPriority: plan.upsellPriority,
      notes: plan.notes,
    }));

    return {
      currency: catalog.currency,
      plans,
      catalog,
      featurePrices: FEATURE_PRICES_EGP,
      agentPrices: AGENT_PRICES_EGP,
      aiUsageTiers: AI_USAGE_TIERS,
      messageTiers: MESSAGE_TIERS,
      agents: AGENT_CATALOG.map((a) => ({
        id: a.id,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        descriptionAr: a.descriptionAr,
        status: a.status,
        price: AGENT_PRICES_EGP[a.id as keyof typeof AGENT_PRICES_EGP],
        dependencies: a.dependencies,
        features: a.features,
        implemented: a.implemented,
        sellable: a.sellable,
        comingSoon: a.comingSoon,
        beta: a.beta,
        subscriptionEnabled: a.subscriptionEnabled,
        routeVisibility: a.routeVisibility,
        requiredFeatures: a.requiredFeatures,
        entrypoints: a.entrypoints,
      })),
      features: FEATURE_CATALOG.map((f) => ({
        id: f.id,
        nameAr: f.nameAr,
        nameEn: f.nameEn,
        descriptionAr: f.descriptionAr,
        status: f.status,
        price: FEATURE_PRICES_EGP[f.id as keyof typeof FEATURE_PRICES_EGP],
        requiredAgent: (f as any).requiredAgent || null,
        dependencies: f.dependencies,
        sellable:
          f.status !== "coming_soon" &&
          (FEATURE_PRICES_EGP[f.id as keyof typeof FEATURE_PRICES_EGP] ?? 0) >
            0,
      })),
    };
  }

  @Post("calculate")
  @RequireRole("OWNER")
  @ApiOperation({
    summary: "Calculate custom plan price based on selected features/agents",
  })
  async calculatePrice(
    @Body()
    body: {
      agents: string[];
      features: string[];
      aiTier?: string;
      messageTier?: string;
    },
  ) {
    const { agents = [], features = [], aiTier, messageTier } = body;

    let totalMonthly = 0;
    const breakdown: Array<{ item: string; nameAr: string; price: number }> =
      [];

    for (const agentId of agents) {
      const catalog = AGENT_CATALOG.find((a) => a.id === agentId);
      if (!catalog?.sellable || !catalog.subscriptionEnabled) {
        continue;
      }
      const price = AGENT_PRICES_EGP[agentId as keyof typeof AGENT_PRICES_EGP];
      if (price !== undefined) {
        totalMonthly += price;
        breakdown.push({
          item: agentId,
          nameAr: catalog?.nameAr || agentId,
          price,
        });
      }
    }

    const agentIncludedFeatures = new Set<string>();
    for (const agentId of agents) {
      const agentEntry = AGENT_CATALOG.find((a) => a.id === agentId);
      if (agentEntry) {
        agentEntry.features.forEach((f) => agentIncludedFeatures.add(f));
      }
    }

    for (const featureId of features) {
      if (agentIncludedFeatures.has(featureId)) continue;
      const catalog = FEATURE_CATALOG.find((f) => f.id === featureId);
      const featurePrice =
        FEATURE_PRICES_EGP[featureId as keyof typeof FEATURE_PRICES_EGP];
      if (
        !catalog ||
        catalog.status === "coming_soon" ||
        (featurePrice ?? 0) <= 0
      ) {
        continue;
      }
      const price =
        FEATURE_PRICES_EGP[featureId as keyof typeof FEATURE_PRICES_EGP];
      if (price !== undefined) {
        totalMonthly += price;
        breakdown.push({
          item: featureId,
          nameAr: catalog?.nameAr || featureId,
          price,
        });
      }
    }

    const aiTierData = aiTier
      ? AI_USAGE_TIERS[aiTier as keyof typeof AI_USAGE_TIERS]
      : undefined;
    if (aiTierData && aiTierData.price > 0) {
      totalMonthly += aiTierData.price;
      breakdown.push({
        item: `AI_${aiTier}`,
        nameAr: `باقة الذكاء الاصطناعي - ${aiTierData.label}`,
        price: aiTierData.price,
      });
    }

    const msgTierData = messageTier
      ? MESSAGE_TIERS[messageTier as keyof typeof MESSAGE_TIERS]
      : undefined;
    if (msgTierData && msgTierData.price > 0) {
      totalMonthly += msgTierData.price;
      breakdown.push({
        item: `MSG_${messageTier}`,
        nameAr: `حجم الرسائل - ${msgTierData.label}`,
        price: msgTierData.price,
      });
    }

    let recommendedPlan: string | null = null;
    let recommendedPlanPrice: number | null = null;
    for (const [planKey, plan] of Object.entries(PLAN_ENTITLEMENTS)) {
      if (planKey === "TRIAL" || planKey === "CUSTOM") continue;
      const planPrice = plan.price || 0;
      const planAgents = new Set(plan.enabledAgents);
      const planFeatures = new Set(plan.enabledFeatures);
      const allAgentsCovered = agents.every((a) => planAgents.has(a as any));
      const allFeaturesCovered = features.every((f) =>
        planFeatures.has(f as any),
      );
      if (allAgentsCovered && allFeaturesCovered && planPrice <= totalMonthly) {
        if (
          !recommendedPlan ||
          planPrice < (recommendedPlanPrice || Infinity)
        ) {
          recommendedPlan = planKey;
          recommendedPlanPrice = planPrice;
        }
      }
    }

    return {
      totalMonthly,
      currency: "EGP",
      breakdown,
      aiTier: aiTierData ? { ...aiTierData, id: aiTier } : null,
      messageTier: msgTierData ? { ...msgTierData, id: messageTier } : null,
      recommendedPlan,
      recommendedPlanPrice,
      savingsVsCustom: recommendedPlanPrice
        ? totalMonthly - recommendedPlanPrice
        : 0,
    };
  }

  @Post("checkout")
  @RequireRole("OWNER")
  @ApiOperation({
    summary: "Create checkout / subscription intent (manual placeholder)",
  })
  async createCheckout(@Req() req: any, @Body() body: { planCode: string }) {
    const merchantId = req?.merchantId;
    if (!body?.planCode) {
      throw new BadRequestException("planCode is required");
    }

    if (body.planCode === "TRIAL") {
      const trialCheck = await this.pool.query(
        `SELECT 1 FROM merchant_subscriptions ms
         JOIN billing_plans bp ON bp.id = ms.plan_id
         WHERE ms.merchant_id = $1 AND bp.code = 'TRIAL'
         AND ms.status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')
         LIMIT 1`,
        [merchantId],
      );
      if (trialCheck.rows.length > 0) {
        throw new BadRequestException(
          "لقد استخدمت الفترة التجريبية من قبل. يرجى اختيار خطة مدفوعة.",
        );
      }
    }

    const planResult = await this.pool.query(
      `SELECT * FROM billing_plans WHERE code = $1 AND is_active = true`,
      [body.planCode],
    );
    if (planResult.rows.length === 0) {
      throw new BadRequestException("Plan not found");
    }

    const plan = applyCanonicalPlanData(planResult.rows[0]);
    const merchantStateResult = await this.pool.query(
      `SELECT plan FROM merchants WHERE id = $1 LIMIT 1`,
      [merchantId],
    );
    const currentPlan = String(
      merchantStateResult.rows[0]?.plan || "",
    ).toUpperCase();
    const cashierPromoPreview =
      isCashierPromoEligiblePlan(body.planCode) &&
      !["STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"].includes(currentPlan)
        ? {
            eligible: true,
            activeOnPurchase: true,
            durationDays: CASHIER_PROMO_DAYS,
            note: "الكاشير مجاني لأول 30 يوم على الاشتراك المدفوع الجديد.",
          }
        : {
            eligible: isCashierPromoEligiblePlan(body.planCode),
            activeOnPurchase: false,
            durationDays: CASHIER_PROMO_DAYS,
            note: null,
          };

    const existingSubResult = await this.pool.query(
      `SELECT id, status
       FROM merchant_subscriptions
       WHERE merchant_id = $1
         AND plan_id = $2
         AND UPPER(status) IN ('ACTIVE', 'PENDING')
       ORDER BY
         CASE UPPER(status)
           WHEN 'ACTIVE' THEN 0
           WHEN 'PENDING' THEN 1
           ELSE 2
         END,
         created_at DESC
       LIMIT 1`,
      [merchantId, plan.id],
    );

    const existingSub = existingSubResult.rows[0];
    if (existingSub) {
      const existingStatus = String(existingSub.status || "").toUpperCase();
      if (existingStatus === "ACTIVE") {
        return {
          status: "ACTIVE",
          message: "هذه الباقة مفعّلة بالفعل على حسابك.",
          subscriptionId: existingSub.id,
          cashierPromoPreview,
        };
      }
      return {
        status: "PENDING",
        message: "يوجد طلب اشتراك قيد المراجعة بالفعل لنفس الباقة.",
        subscriptionId: existingSub.id,
        cashierPromoPreview,
      };
    }

    const periodInterval = body.planCode === "TRIAL" ? "14 days" : "30 days";
    let subscription: any;
    try {
      const subscriptionResult = await this.pool.query(
        `INSERT INTO merchant_subscriptions (
          merchant_id, plan_id, status, provider, current_period_start, current_period_end
        ) VALUES ($1, $2, $3, 'manual', NOW(), NOW() + INTERVAL '${periodInterval}')
        RETURNING *`,
        [merchantId, plan.id, body.planCode === "TRIAL" ? "ACTIVE" : "PENDING"],
      );
      subscription = subscriptionResult.rows[0];
    } catch (error: any) {
      if (error?.code === "42703") {
        const fallback = await this.pool.query(
          `INSERT INTO merchant_subscriptions (merchant_id, plan_id, status)
           VALUES ($1, $2, 'PENDING')
           RETURNING *`,
          [merchantId, plan.id],
        );
        subscription = fallback.rows[0];
      } else {
        throw error;
      }
    }

    if (plan.price_cents !== null) {
      try {
        await this.pool.query(
          `INSERT INTO billing_invoices (
            merchant_id, subscription_id, amount_cents, currency, status, due_date, metadata
          ) VALUES ($1, $2, $3, $4, 'OPEN', NOW() + INTERVAL '7 days', $5)`,
          [
            merchantId,
            subscription.id,
            plan.price_cents,
            plan.currency || "EGP",
            JSON.stringify({ planCode: plan.code }),
          ],
        );
      } catch (error: any) {
        if (error?.code !== "42P01") {
          throw error;
        }
      }
    }

    return {
      status: "PENDING",
      message:
        "تم إنشاء طلب الاشتراك. سيقوم فريق المبيعات بالتواصل لإتمام التفعيل.",
      subscriptionId: subscription.id,
      cashierPromoPreview,
    };
  }
}
