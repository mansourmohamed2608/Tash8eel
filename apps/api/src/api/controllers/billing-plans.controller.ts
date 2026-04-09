import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { BillingCatalogService } from "../../application/services/billing-catalog.service";
import {
  UsageGuardService,
  UsageMetricKey,
} from "../../application/services/usage-guard.service";
import {
  applyCanonicalPlanData,
  planOrder,
  resolveCashierProvisioning,
  toStringArray,
  isCashierPromoEligiblePlan,
  updateMerchantProvisioning,
} from "./billing.helpers";
import { PLAN_ENTITLEMENTS } from "../../shared/entitlements";

@ApiTags("Billing")
@Controller("v1/portal/billing")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class BillingPlansController {
  private readonly logger = new Logger(BillingPlansController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly billingCatalogService: BillingCatalogService,
    private readonly usageGuardService: UsageGuardService,
  ) {}

  @Get("add-ons")
  @ApiOperation({
    summary:
      "Get strict add-on catalog split (bundle capacity add-ons + BYO add-ons)",
  })
  async getAddOns(@Query("region") region?: string): Promise<any> {
    const catalog = await this.billingCatalogService.getCatalog(region);
    return {
      regionCode: catalog.regionCode,
      currency: catalog.currency,
      cycleDiscounts: catalog.cycles,
      bundleCapacityAddOns: catalog.bundleAddOns.capacityAddOns,
      byoCoreAddOn: catalog.byo.coreAddOn,
      byoFeatureAddOns: catalog.byo.featureAddOns,
    };
  }

  @Get("usage-packs")
  @ApiOperation({ summary: "Get usage packs (bundle top-ups + BYO packs)" })
  async getUsagePacks(@Query("region") region?: string): Promise<any> {
    const catalog = await this.billingCatalogService.getCatalog(region);
    return {
      regionCode: catalog.regionCode,
      currency: catalog.currency,
      usagePacks: catalog.usagePacks,
    };
  }

  @Get("usage-status")
  @ApiOperation({
    summary:
      "Current usage status against limits (usage guard enforcement view)",
  })
  async getUsageStatus(@Req() req: any) {
    const merchantId = req?.merchantId;
    if (!merchantId) throw new BadRequestException("merchantId is required");

    const metrics: UsageMetricKey[] = [
      "MESSAGES",
      "AI_CALLS",
      "TOKENS",
      "PAID_TEMPLATES",
      "PAYMENT_PROOF_SCANS",
      "VOICE_MINUTES",
      "MAP_LOOKUPS",
    ];

    const checks = await Promise.all(
      metrics.map((metric) =>
        this.usageGuardService.checkLimit(merchantId, metric),
      ),
    );
    const limits = await this.usageGuardService.getEffectiveLimits(merchantId);
    const messaging =
      await this.usageGuardService.getMessagingQuotaStatus(merchantId);

    return {
      merchantId,
      limits,
      messaging,
      metrics: checks.reduce<Record<string, any>>((acc, row) => {
        acc[row.metric] = row;
        return acc;
      }, {}),
      checkedAt: new Date().toISOString(),
    };
  }

  @Get("plans")
  @ApiOperation({ summary: "List available billing plans" })
  async listPlans() {
    const result = await this.pool.query(
      `SELECT * FROM billing_plans WHERE is_active = true ORDER BY price_cents NULLS LAST`,
    );
    const plans = result.rows
      .map((row) => applyCanonicalPlanData(row))
      .sort((a, b) => {
        const left = planOrder[String(a.code || "").toUpperCase()] ?? 999;
        const right = planOrder[String(b.code || "").toUpperCase()] ?? 999;
        return left - right;
      });
    return { plans };
  }

  @Get("catalog")
  @ApiOperation({
    summary: "Get bundles + add-ons + usage packs catalog (regional pricing)",
  })
  async getCatalog(@Query("region") region?: string) {
    return this.billingCatalogService.getCatalog(region);
  }

  @Get("summary")
  @ApiOperation({ summary: "Get merchant billing summary" })
  async getSummary(@Req() req: any) {
    const merchantId = req?.merchantId;
    const merchantStateResult = await this.pool.query(
      `SELECT plan, enabled_features, plan_limits, limits
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId],
    );
    const merchantState = merchantStateResult.rows[0] || {};
    const result = await this.pool.query(
      `SELECT ms.*, bp.code as plan_code, bp.name as plan_name, bp.price_cents, bp.currency, bp.billing_period, bp.features, bp.agents, bp.limits
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       WHERE ms.merchant_id = $1
       ORDER BY
         CASE ms.status
           WHEN 'ACTIVE' THEN 0
           WHEN 'PENDING' THEN 1
           ELSE 2
         END,
         ms.created_at DESC
       LIMIT 1`,
      [merchantId],
    );

    if (result.rows.length === 0) {
      return {
        status: "NOT_CONFIGURED",
        subscription: null,
      };
    }

    const decorateSubscription = (rawSubscription: Record<string, any>) => {
      const normalized = applyCanonicalPlanData(rawSubscription);
      const cashierProvisioning = resolveCashierProvisioning({
        planCode: normalized.plan_code || merchantState.plan,
        enabledFeatures: toStringArray(
          normalized.features || merchantState.enabled_features,
        ),
        limits:
          normalized.limits ||
          merchantState.plan_limits ||
          merchantState.limits ||
          {},
        existingFeatures: toStringArray(merchantState.enabled_features),
        existingLimits: merchantState.plan_limits || merchantState.limits || {},
      });

      return {
        // Preserve all subscription data from database
        id: rawSubscription.id,
        status: rawSubscription.status,
        provider: rawSubscription.provider,
        plan_code: normalized.plan_code,
        current_period_end: rawSubscription.current_period_end,
        ...normalized,
        features: cashierProvisioning.enabledFeatures,
        limits: cashierProvisioning.limits,
        cashierPromoEligible: cashierProvisioning.promo.eligible,
        cashierPromoActive: cashierProvisioning.promo.active,
        cashierPromoStartsAt: cashierProvisioning.promo.startsAt,
        cashierPromoEndsAt: cashierProvisioning.promo.endsAt,
        cashierIncludedByPlan: cashierProvisioning.promo.includedByPlan,
        cashierEnabledByPromo: cashierProvisioning.promo.enabledByPromo,
        cashierEffective: cashierProvisioning.promo.effective,
      };
    };

    const subscription = decorateSubscription(result.rows[0]);

    // Auto-activate PENDING subscriptions (manual payment provider)
    if (
      subscription.status === "PENDING" &&
      subscription.provider === "manual"
    ) {
      try {
        await this._activateSubscriptionById(merchantId, subscription.id);
        const refreshed = await this.pool.query(
          `SELECT ms.*, bp.code as plan_code, bp.name as plan_name, bp.price_cents, bp.currency, bp.billing_period
           FROM merchant_subscriptions ms
           JOIN billing_plans bp ON bp.id = ms.plan_id
           WHERE ms.id = $1`,
          [subscription.id],
        );
        const refreshedSub = refreshed.rows[0]
          ? decorateSubscription(refreshed.rows[0])
          : subscription;
        return { status: "OK", subscription: refreshedSub };
      } catch (err) {
        this.logger.warn({
          msg: "Auto-activate failed",
          error: (err as Error).message,
        });
      }
    }

    // Auto-expire trials that passed their period_end
    if (
      subscription.status === "ACTIVE" &&
      subscription.plan_code === "TRIAL"
    ) {
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end)
        : null;
      if (periodEnd && periodEnd < new Date()) {
        await this.pool.query(
          `UPDATE merchant_subscriptions SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
          [subscription.id],
        );
        await updateMerchantProvisioning(this.pool as any, {
          merchantId,
          planCode: "TRIAL",
          enabledAgents: PLAN_ENTITLEMENTS.TRIAL.enabledAgents,
          enabledFeatures: PLAN_ENTITLEMENTS.TRIAL.enabledFeatures,
          limits: PLAN_ENTITLEMENTS.TRIAL.limits,
          dailyTokenBudget: PLAN_ENTITLEMENTS.TRIAL.limits.tokenBudgetDaily,
          isActive: true,
        });
        return {
          status: "TRIAL_EXPIRED",
          message:
            "انتهت الفترة التجريبية. يرجى الاشتراك في خطة مدفوعة للاستمرار.",
          subscription: { ...subscription, status: "EXPIRED" },
        };
      }
    }

    return { status: "OK", subscription };
  }

  @Get("offers")
  @ApiOperation({ summary: "List active subscription offers for merchant" })
  async listOffers(@Req() req: any) {
    const merchantId = req?.merchantId;
    const planResult = await this.pool.query(
      `SELECT bp.code as plan_code
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       WHERE ms.merchant_id = $1
       ORDER BY
         CASE ms.status
           WHEN 'ACTIVE' THEN 0
           WHEN 'PENDING' THEN 1
           ELSE 2
         END,
         ms.created_at DESC
       LIMIT 1`,
      [merchantId],
    );
    const plan = planResult.rows[0]?.plan_code || null;

    const offersResult = await this.pool.query(
      `SELECT *
       FROM subscription_offers
       WHERE is_active = true
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
         AND (applies_to_plan IS NULL OR applies_to_plan = $1)
       ORDER BY created_at DESC`,
      [plan],
    );

    return { offers: offersResult.rows };
  }

  @Get("history")
  @ApiOperation({ summary: "Get billing history (invoices and plan changes)" })
  async getBillingHistory(@Req() req: any) {
    const merchantId = req?.merchantId;

    const subsResult = await this.pool.query(
      `SELECT ms.id, ms.status, ms.provider, ms.current_period_start, ms.current_period_end,
              ms.created_at, bp.code as plan_code, bp.name as plan_name, bp.price_cents, bp.currency
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       WHERE ms.merchant_id = $1
       ORDER BY ms.created_at DESC
       LIMIT 50`,
      [merchantId],
    );

    let invoices: any[] = [];
    try {
      const invoiceResult = await this.pool.query(
        `SELECT id, amount_cents, currency, status, due_date, paid_at, created_at, metadata
         FROM billing_invoices
         WHERE merchant_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [merchantId],
      );
      invoices = invoiceResult.rows;
    } catch {
      // Table may not exist
    }

    return {
      subscriptions: subsResult.rows,
      invoices,
    };
  }

  // Internal helper shared with BillingSubscriptionsController
  async _activateSubscriptionById(
    merchantId: string,
    subscriptionId: string,
  ): Promise<void> {
    const subResult = await this.pool.query(
      `SELECT ms.*, bp.code as plan_code, bp.features, bp.agents, bp.limits
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       WHERE ms.id = $1 AND ms.merchant_id = $2`,
      [subscriptionId, merchantId],
    );

    if (subResult.rows.length === 0) {
      throw new BadRequestException("Subscription not found");
    }

    const subscription = subResult.rows[0];
    if (subscription.status === "ACTIVE") return;

    const planCode = subscription.plan_code as keyof typeof PLAN_ENTITLEMENTS;
    const planEntitlements = PLAN_ENTITLEMENTS[planCode];
    if (!planEntitlements) return;

    const { enabledAgents, enabledFeatures, limits } = planEntitlements;
    const merchantStateResult = await this.pool.query(
      `SELECT plan, enabled_features, plan_limits, limits
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId],
    );
    const merchantState = merchantStateResult.rows[0] || {};
    const cashierProvisioning = resolveCashierProvisioning({
      planCode,
      enabledFeatures,
      limits: limits || {},
      existingFeatures: toStringArray(merchantState.enabled_features),
      existingLimits: merchantState.plan_limits || merchantState.limits || {},
      grantPromo:
        isCashierPromoEligiblePlan(planCode) &&
        !["STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"].includes(
          String(merchantState.plan || "").toUpperCase(),
        ),
      startsAt: subscription.current_period_start || new Date(),
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE merchant_subscriptions
         SET status = 'ACTIVE',
             current_period_start = COALESCE(current_period_start, NOW()),
             current_period_end = COALESCE(current_period_end, NOW() + INTERVAL '30 days'),
             updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId],
      );
      await client.query(
        `UPDATE merchant_subscriptions
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE merchant_id = $1 AND id != $2 AND status = 'ACTIVE'`,
        [merchantId, subscriptionId],
      );
      await updateMerchantProvisioning(client as any, {
        merchantId,
        planCode,
        enabledAgents,
        enabledFeatures: cashierProvisioning.enabledFeatures,
        limits: cashierProvisioning.limits,
        dailyTokenBudget: cashierProvisioning.limits.tokenBudgetDaily || 100000,
        isActive: true,
      });
      for (const agentType of enabledAgents) {
        await client.query(
          `INSERT INTO merchant_agent_subscriptions (merchant_id, agent_type, is_enabled, config, enabled_at)
           VALUES ($1, $2, true, '{}', NOW())
           ON CONFLICT (merchant_id, agent_type)
           DO UPDATE SET is_enabled = true, enabled_at = NOW(), disabled_at = NULL, updated_at = NOW()`,
          [merchantId, agentType],
        );
      }
      await client
        .query(
          `UPDATE billing_invoices
           SET status = 'PAID', paid_at = NOW(), updated_at = NOW()
           WHERE subscription_id = $1 AND status = 'OPEN'`,
          [subscriptionId],
        )
        .catch(() => {});
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
