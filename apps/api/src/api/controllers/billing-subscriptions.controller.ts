import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { RequireRole, RolesGuard } from "../../shared/guards/roles.guard";
import { UsageGuardService } from "../../application/services/usage-guard.service";
import { PLAN_ENTITLEMENTS, PlanType } from "../../shared/entitlements";
import {
  normalizeRegion,
  normalizeCycle,
  resolveCashierProvisioning,
  isCashierPromoEligiblePlan,
  toLimitsFromPlanRow,
  toNumberRecord,
  toStringArray,
  resolveUsagePackCredits,
  updateMerchantProvisioning,
  planOrder,
} from "./billing.helpers";

const SELLABLE_BUNDLE_CODES = new Set<PlanType>([
  "STARTER",
  "CHAT_ONLY",
  "BASIC",
  "GROWTH",
  "PRO",
  "ENTERPRISE",
]);

@ApiTags("Billing")
@Controller("v1/portal/billing")
@UseGuards(MerchantApiKeyGuard, RolesGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class BillingSubscriptionsController {
  private readonly logger = new Logger(BillingSubscriptionsController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly usageGuardService: UsageGuardService,
  ) {}

  @Post("subscribe")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Subscribe merchant to a fixed bundle plan" })
  async subscribeBundle(
    @Req() req: any,
    @Body()
    body: {
      planCode: string;
      regionCode?: "EG" | "SA" | "AE" | "OM" | "KW";
      cycleMonths?: 1 | 3 | 6 | 12;
    },
  ) {
    const merchantId = req?.merchantId;
    const planCode = String(body?.planCode || "").toUpperCase();
    if (!merchantId) throw new BadRequestException("merchantId is required");
    if (!planCode) throw new BadRequestException("planCode is required");
    if (!SELLABLE_BUNDLE_CODES.has(planCode as PlanType)) {
      throw new BadRequestException(
        `Plan ${planCode} cannot be subscribed from this endpoint`,
      );
    }

    const regionCode = normalizeRegion(body?.regionCode);
    const cycleMonths = normalizeCycle(body?.cycleMonths);
    const merchantStateResult = await this.pool.query(
      `SELECT plan, enabled_features, plan_limits, limits
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId],
    );
    const merchantState = merchantStateResult.rows[0] || {};
    const currentPlan = String(merchantState.plan || "").toUpperCase();
    const grantCashierPromo =
      isCashierPromoEligiblePlan(planCode) &&
      !["STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"].includes(
        currentPlan,
      );

    const planResult = await this.pool.query(
      `SELECT
         p.id,
         p.code,
         p.name,
         pl.messages_per_month,
         pl.whatsapp_numbers,
         pl.team_members,
         pl.ai_calls_per_day,
         pl.token_budget_daily,
         pl.paid_templates_per_month,
         pl.payment_proof_scans_per_month,
         pl.voice_minutes_per_month,
         pl.maps_lookups_per_month,
         pl.pos_connections,
         pl.branches,
         pl.retention_days,
         pl.alert_rules,
         pl.automations,
         pl.auto_runs_per_day
       FROM plans p
       JOIN plan_limits pl ON pl.plan_id = p.id
       WHERE UPPER(p.code) = $1
         AND p.is_bundle = true
         AND p.is_active = true
       LIMIT 1`,
      [planCode],
    );
    if (!planResult.rows[0]) {
      throw new BadRequestException(`Plan ${planCode} is not available`);
    }
    const planRow = planResult.rows[0];

    const entitlementsResult = await this.pool.query(
      `SELECT feature_key
       FROM plan_entitlements
       WHERE plan_id = $1
         AND is_included = true
       ORDER BY feature_key`,
      [planRow.id],
    );
    const enabledFeatures = entitlementsResult.rows.map((row) =>
      String(row.feature_key),
    );
    const enabledAgents =
      PLAN_ENTITLEMENTS[planCode as PlanType]?.enabledAgents ||
      PLAN_ENTITLEMENTS.STARTER.enabledAgents;

    const planPrice = await this.pool.query(
      `SELECT total_price_cents, effective_monthly_cents, currency
       FROM plan_prices
       WHERE plan_id = $1
         AND region_code = $2
         AND cycle_months = $3
       LIMIT 1`,
      [planRow.id, regionCode, cycleMonths],
    );
    if (!planPrice.rows[0]) {
      throw new BadRequestException(
        `Pricing is not configured for plan ${planCode} in region ${regionCode} (${cycleMonths} month cycle)`,
      );
    }
    const limits = toLimitsFromPlanRow(planRow);
    const cashierProvisioning = resolveCashierProvisioning({
      planCode,
      enabledFeatures,
      limits,
      existingFeatures: toStringArray(merchantState.enabled_features),
      existingLimits: merchantState.plan_limits || merchantState.limits || {},
      grantPromo: grantCashierPromo,
      startsAt: new Date(),
    });

    const billingPlanCompat = await this.pool.query(
      `SELECT id FROM billing_plans WHERE UPPER(code) = $1 LIMIT 1`,
      [planCode],
    );

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE subscriptions
         SET status = 'CANCELLED', ends_at = NOW(), updated_at = NOW()
         WHERE merchant_id = $1
           AND status = 'ACTIVE'`,
        [merchantId],
      );

      const insertedSubscription = await client.query(
        `INSERT INTO subscriptions (
           merchant_id, plan_id, region_code, cycle_months, status, provider, starts_at, ends_at, auto_renew, metadata
         ) VALUES (
           $1, $2, $3, $4, 'ACTIVE', 'manual', NOW(), NOW() + ($4::text || ' month')::interval, true, $5::jsonb
         )
         RETURNING id, status, starts_at, ends_at, plan_id, region_code, cycle_months, metadata`,
        [
          merchantId,
          planRow.id,
          regionCode,
          cycleMonths,
          JSON.stringify({ cashierPromo: cashierProvisioning.promo }),
        ],
      );

      await updateMerchantProvisioning(client as any, {
        merchantId,
        planCode,
        enabledAgents,
        enabledFeatures: cashierProvisioning.enabledFeatures,
        limits: cashierProvisioning.limits,
        dailyTokenBudget: cashierProvisioning.limits.tokenBudgetDaily,
        isActive: true,
      });

      if (billingPlanCompat.rows[0]?.id) {
        await client.query(
          `UPDATE merchant_subscriptions
           SET status = 'CANCELLED', updated_at = NOW()
           WHERE merchant_id = $1
             AND status = 'ACTIVE'`,
          [merchantId],
        );
        await client.query(
          `INSERT INTO merchant_subscriptions (
             merchant_id, plan_id, status, provider, current_period_start, current_period_end
           ) VALUES (
             $1, $2, 'ACTIVE', 'manual', NOW(), NOW() + ($3::text || ' month')::interval
           )`,
          [merchantId, billingPlanCompat.rows[0].id, cycleMonths],
        );
      }

      await client.query("COMMIT");

      return {
        status: "ACTIVE",
        subscription: insertedSubscription.rows[0],
        plan: {
          code: planRow.code,
          name: planRow.name,
          limits: cashierProvisioning.limits,
          enabledFeatures: cashierProvisioning.enabledFeatures,
          enabledAgents,
          cashierPromo: cashierProvisioning.promo,
        },
        pricing: planPrice.rows[0]
          ? {
              regionCode,
              cycleMonths,
              totalPriceCents: Number(planPrice.rows[0].total_price_cents || 0),
              effectiveMonthlyCents: Number(
                planPrice.rows[0].effective_monthly_cents || 0,
              ),
              currency: planPrice.rows[0].currency || "EGP",
            }
          : null,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Post("topups")
  @RequireRole("OWNER")
  @ApiOperation({
    summary:
      "Buy bundle top-ups (usage packs) or bundle capacity add-ons with strict entitlement/limit updates",
  })
  async buyTopUp(
    @Req() req: any,
    @Body()
    body: {
      type: "USAGE_PACK" | "CAPACITY_ADDON";
      code: string;
      quantity?: number;
    },
  ) {
    const merchantId = req?.merchantId;
    if (!merchantId) throw new BadRequestException("merchantId is required");

    const code = String(body?.code || "")
      .trim()
      .toUpperCase();
    const quantityRaw = Number(body?.quantity || 1);
    const quantity = Number.isFinite(quantityRaw)
      ? Math.max(1, Math.floor(quantityRaw))
      : 1;
    if (!code) throw new BadRequestException("code is required");

    const activeSubscription = await this.pool.query(
      `SELECT id, plan_id, region_code, cycle_months
       FROM subscriptions
       WHERE merchant_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at DESC
       LIMIT 1`,
      [merchantId],
    );
    if (!activeSubscription.rows[0]) {
      throw new BadRequestException(
        "No active bundle subscription found. Subscribe first.",
      );
    }
    const subscription = activeSubscription.rows[0];

    if (String(body?.type || "").toUpperCase() === "USAGE_PACK") {
      const usagePackRow = await this.pool.query(
        `SELECT
           up.id,
           up.code,
           up.name,
           up.metric_key,
           up.included_units,
           up.included_ai_calls_per_day,
           up.included_token_budget_daily,
           up.limit_deltas,
           upp.price_cents,
           upp.currency
         FROM usage_packs up
         LEFT JOIN usage_pack_prices upp
           ON upp.usage_pack_id = up.id
          AND upp.region_code = $2
         WHERE up.code = $1
           AND up.is_active = true
         LIMIT 1`,
        [code, subscription.region_code || "EG"],
      );
      if (!usagePackRow.rows[0]) {
        throw new BadRequestException(`Unknown usage pack: ${code}`);
      }
      const pack = usagePackRow.rows[0];
      const credits = resolveUsagePackCredits(pack, quantity);

      for (const credit of credits) {
        await this.usageGuardService.recordUsagePackCredit(
          merchantId,
          credit.metric,
          credit.quantity,
          {
            source: "BILLING_TOPUP",
            usagePackCode: code,
            usagePackName: pack.name,
            subscriptionId: subscription.id,
          },
        );
      }

      return {
        status: "SUCCESS",
        type: "USAGE_PACK",
        code,
        quantity,
        subscriptionId: subscription.id,
        appliedCredits: credits,
        price: {
          priceCents: Number(pack.price_cents || 0) * quantity,
          currency: pack.currency || "EGP",
        },
      };
    }

    if (String(body?.type || "").toUpperCase() !== "CAPACITY_ADDON") {
      throw new BadRequestException(
        "type must be USAGE_PACK or CAPACITY_ADDON",
      );
    }

    const addOnResult = await this.pool.query(
      `SELECT
         a.id,
         a.code,
         a.name,
         a.scope,
         a.addon_type,
         a.feature_enables,
         a.limit_floor_updates,
         a.limit_increments,
         ap.total_price_cents,
         ap.effective_monthly_cents,
         ap.currency
       FROM add_ons a
       LEFT JOIN add_on_prices ap
         ON ap.addon_id = a.id
        AND ap.region_code = $2
        AND ap.cycle_months = $3
       WHERE a.code = $1
         AND a.is_active = true
         AND a.is_subscription = true
       LIMIT 1`,
      [code, subscription.region_code || "EG", subscription.cycle_months || 1],
    );
    if (!addOnResult.rows[0]) {
      throw new BadRequestException(`Unknown add-on: ${code}`);
    }
    const addOn = addOnResult.rows[0];
    const scope = String(addOn.scope || "").toUpperCase();
    const addOnType = String(addOn.addon_type || "").toUpperCase();
    if (addOnType !== "CAPACITY" || (scope !== "BUNDLE" && scope !== "BOTH")) {
      throw new BadRequestException(
        `${code} is not available as a bundle capacity add-on`,
      );
    }

    const floorUpdates = toNumberRecord(addOn.limit_floor_updates);
    const increments = toNumberRecord(addOn.limit_increments);
    const featureEnables = toStringArray(addOn.feature_enables);

    const merchantResult = await this.pool.query(
      `SELECT plan_limits, limits, enabled_features
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId],
    );
    if (!merchantResult.rows[0]) {
      throw new BadRequestException("Merchant not found");
    }
    const merchantLimitsRaw =
      merchantResult.rows[0].plan_limits || merchantResult.rows[0].limits || {};
    const merchantLimits =
      merchantLimitsRaw && typeof merchantLimitsRaw === "object"
        ? { ...merchantLimitsRaw }
        : {};

    const alreadyIncluded = Object.entries(floorUpdates).every(
      ([key, minValue]) => {
        const current = Number(
          (merchantLimits as Record<string, unknown>)[key] || 0,
        );
        return current >= Number(minValue || 0);
      },
    );
    const hasIncrements = Object.keys(increments).length > 0;
    if (alreadyIncluded && !hasIncrements) {
      return { status: "ALREADY_INCLUDED", code, message: "Already included" };
    }

    for (const [key, floorValue] of Object.entries(floorUpdates)) {
      const current = Number(
        (merchantLimits as Record<string, unknown>)[key] || 0,
      );
      (merchantLimits as Record<string, number>)[key] = Math.max(
        current,
        Number(floorValue || 0),
      );
    }
    for (const [key, incrementValue] of Object.entries(increments)) {
      const current = Number(
        (merchantLimits as Record<string, unknown>)[key] || 0,
      );
      (merchantLimits as Record<string, number>)[key] =
        current + Number(incrementValue || 0) * quantity;
    }

    const currentFeatures = toStringArray(
      merchantResult.rows[0].enabled_features,
    );
    const nextFeatures = Array.from(
      new Set([...currentFeatures, ...featureEnables]),
    );

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO subscription_add_ons (
           subscription_id, addon_id, quantity, status, starts_at, metadata
         ) VALUES ($1, $2, $3, 'ACTIVE', NOW(), $4::jsonb)`,
        [
          subscription.id,
          addOn.id,
          quantity,
          JSON.stringify({
            source: "BILLING_TOPUP",
            code,
            name: addOn.name,
            floorUpdates,
            increments,
          }),
        ],
      );
      await client.query(
        `UPDATE merchants
         SET plan_limits = $2::jsonb,
             limits = $2::jsonb,
             enabled_features = $3::text[],
             updated_at = NOW()
         WHERE id = $1`,
        [merchantId, JSON.stringify(merchantLimits), nextFeatures],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return {
      status: "SUCCESS",
      type: "CAPACITY_ADDON",
      code,
      quantity,
      subscriptionId: subscription.id,
      updatedLimits: merchantLimits,
      enabledFeatures: nextFeatures,
      price: {
        cycleTotalCents: Number(addOn.total_price_cents || 0) * quantity,
        effectiveMonthlyCents:
          Number(addOn.effective_monthly_cents || 0) * quantity,
        currency: addOn.currency || "EGP",
      },
    };
  }

  @Post("activate/:subscriptionId")
  @RequireRole("OWNER")
  @ApiOperation({
    summary: "Activate a pending subscription and provision entitlements",
  })
  async activateSubscription(
    @Req() req: any,
    @Param("subscriptionId") subscriptionId: string,
  ) {
    const merchantId = req?.merchantId;

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
    if (subscription.status === "ACTIVE") {
      return { status: "ALREADY_ACTIVE", message: "الاشتراك مفعل بالفعل" };
    }

    const planCode = subscription.plan_code as PlanType;
    const planEntitlements = PLAN_ENTITLEMENTS[planCode];
    if (!planEntitlements) {
      throw new BadRequestException(`Unknown plan: ${planCode}`);
    }

    const { enabledAgents, enabledFeatures, limits } = planEntitlements;

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
        enabledFeatures,
        limits: limits || {},
        dailyTokenBudget: (limits as any)?.tokenBudgetDaily || 100000,
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
      this.logger.error({
        msg: "Failed to activate subscription",
        error: (error as Error).message,
      });
      throw new BadRequestException("فشل في تفعيل الاشتراك");
    } finally {
      client.release();
    }

    this.logger.log({
      msg: "Subscription activated and entitlements provisioned",
      merchantId,
      subscriptionId,
      planCode,
      enabledAgents,
      enabledFeatures,
    });

    return {
      status: "ACTIVE",
      message: "✅ تم تفعيل الاشتراك وتم تمهيد جميع الصلاحيات",
      plan: planCode,
      enabledAgents,
      enabledFeatures,
      limits,
    };
  }

  @Post("upgrade")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Upgrade merchant plan" })
  async upgradePlan(@Req() req: any, @Body() body: { planCode: string }) {
    const merchantId = req?.merchantId;
    if (!body?.planCode) {
      throw new BadRequestException("planCode is required");
    }

    const targetPlan = body.planCode as PlanType;
    const planEntitlements = PLAN_ENTITLEMENTS[targetPlan];
    if (!planEntitlements) {
      throw new BadRequestException(`Unknown plan: ${targetPlan}`);
    }

    const currentResult = await this.pool.query(
      `SELECT plan, enabled_features, plan_limits, limits FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const currentPlan = currentResult.rows[0]?.plan || "TRIAL";
    const currentEnabledFeatures = toStringArray(
      currentResult.rows[0]?.enabled_features,
    );
    const currentLimits =
      currentResult.rows[0]?.plan_limits || currentResult.rows[0]?.limits || {};

    const isUpgrade =
      (planOrder[targetPlan] || 0) > (planOrder[currentPlan] || 0);
    const isDowngrade =
      (planOrder[targetPlan] || 0) < (planOrder[currentPlan] || 0);

    const planResult = await this.pool.query(
      `SELECT * FROM billing_plans WHERE code = $1 AND is_active = true`,
      [targetPlan],
    );
    if (planResult.rows.length === 0) {
      throw new BadRequestException(
        `Plan ${targetPlan} not found in billing_plans table`,
      );
    }
    const plan = planResult.rows[0];

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE merchant_subscriptions
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE merchant_id = $1 AND status = 'ACTIVE'`,
        [merchantId],
      );

      const subResult = await client.query(
        `INSERT INTO merchant_subscriptions (
          merchant_id, plan_id, status, provider, current_period_start, current_period_end
        ) VALUES ($1, $2, 'ACTIVE', 'manual', NOW(), NOW() + INTERVAL '30 days')
        RETURNING id`,
        [merchantId, plan.id],
      );
      const subscriptionId = subResult.rows[0].id;

      const { enabledAgents, enabledFeatures } = planEntitlements;
      const cashierProvisioning = resolveCashierProvisioning({
        planCode: targetPlan,
        enabledFeatures,
        limits: planEntitlements.limits || {},
        existingFeatures: currentEnabledFeatures,
        existingLimits: currentLimits,
        grantPromo:
          isCashierPromoEligiblePlan(targetPlan) &&
          !["STARTER", "BASIC", "GROWTH", "PRO", "ENTERPRISE"].includes(
            String(currentPlan || "").toUpperCase(),
          ),
        startsAt: new Date(),
      });

      await updateMerchantProvisioning(client as any, {
        merchantId,
        planCode: targetPlan,
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

      await client.query("COMMIT");

      this.logger.log({
        msg: isUpgrade ? "Plan upgraded" : "Plan changed",
        merchantId,
        from: currentPlan,
        to: targetPlan,
        subscriptionId,
      });

      return {
        status: "ACTIVE",
        message: isUpgrade
          ? `⬆️ تم ترقية الخطة من ${currentPlan} إلى ${targetPlan}`
          : isDowngrade
            ? `⬇️ تم تخفيض الخطة من ${currentPlan} إلى ${targetPlan}`
            : `تم تغيير الخطة إلى ${targetPlan}`,
        previousPlan: currentPlan,
        newPlan: targetPlan,
        enabledAgents,
        enabledFeatures: cashierProvisioning.enabledFeatures,
        cashierPromo: cashierProvisioning.promo,
        subscriptionId,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      this.logger.error({
        msg: "Failed to upgrade plan",
        error: (error as Error).message,
      });
      throw new BadRequestException("فشل في ترقية الخطة");
    } finally {
      client.release();
    }
  }

  @Post("prorate")
  @RequireRole("OWNER")
  @ApiOperation({
    summary: "Calculate proration for a mid-cycle plan change",
  })
  async calculateProration(
    @Req() req: any,
    @Body() body: { targetPlanCode: string },
  ) {
    const merchantId = req?.merchantId;
    if (!body?.targetPlanCode) {
      throw new BadRequestException("targetPlanCode is required");
    }

    const targetPlan = body.targetPlanCode as PlanType;
    const targetEntitlements = PLAN_ENTITLEMENTS[targetPlan];
    if (!targetEntitlements) {
      throw new BadRequestException(`Unknown plan: ${targetPlan}`);
    }

    const subResult = await this.pool.query(
      `SELECT ms.id, ms.status, ms.current_period_start, ms.current_period_end,
              bp.code as plan_code, bp.price_cents, bp.currency
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       WHERE ms.merchant_id = $1 AND ms.status = 'ACTIVE'
       ORDER BY ms.created_at DESC LIMIT 1`,
      [merchantId],
    );

    if (subResult.rows.length === 0) {
      return {
        type: "new",
        currentPlan: null,
        targetPlan,
        amountDue: (targetEntitlements.price || 0) * 100,
        credit: 0,
        currency: targetEntitlements.currency || "EGP",
        message: `اشتراك جديد في ${targetPlan} بسعر ${targetEntitlements.price} جنيه/شهر`,
        effectiveImmediately: true,
      };
    }

    const sub = subResult.rows[0];
    const currentPlanCode = sub.plan_code;
    const currentPriceCents = sub.price_cents || 0;
    const targetPriceCents = (targetEntitlements.price || 0) * 100;

    if (currentPlanCode === targetPlan) {
      return { type: "same", message: "أنت على نفس الخطة بالفعل" };
    }

    const now = new Date();
    const periodStart = new Date(sub.current_period_start);
    const periodEnd = new Date(sub.current_period_end);
    const totalDays = Math.max(
      1,
      Math.ceil(
        (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const usedDays = Math.max(
      0,
      Math.ceil(
        (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const remainingDays = Math.max(0, totalDays - usedDays);
    const dailyRate = currentPriceCents / totalDays;
    const creditCents = Math.round(dailyRate * remainingDays);

    const isUpgrade =
      (planOrder[targetPlan] || 0) > (planOrder[currentPlanCode] || 0);

    if (isUpgrade) {
      const amountDue = Math.max(0, targetPriceCents - creditCents);
      return {
        type: "upgrade",
        currentPlan: currentPlanCode,
        targetPlan,
        currentPriceCents,
        targetPriceCents,
        usedDays,
        remainingDays,
        totalDays,
        creditCents,
        amountDueCents: amountDue,
        amountDue: amountDue / 100,
        credit: creditCents / 100,
        currency: sub.currency || "EGP",
        effectiveImmediately: true,
        message: `ترقية من ${currentPlanCode} إلى ${targetPlan}. رصيد ${(creditCents / 100).toFixed(0)} جنيه من أيامك المتبقية (${remainingDays} يوم). المطلوب دفعه: ${(amountDue / 100).toFixed(0)} جنيه`,
        newPeriodEnd: new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    } else {
      return {
        type: "downgrade",
        currentPlan: currentPlanCode,
        targetPlan,
        currentPriceCents,
        targetPriceCents,
        remainingDays,
        effectiveImmediately: false,
        effectiveDate: periodEnd.toISOString(),
        amountDueCents: 0,
        amountDue: 0,
        currency: sub.currency || "EGP",
        message: `تخفيض من ${currentPlanCode} إلى ${targetPlan}. ستبقى ميزاتك الحالية حتى ${periodEnd.toLocaleDateString("ar-EG")} ثم يتم التبديل تلقائياً.`,
        nextCyclePrice: targetPriceCents / 100,
      };
    }
  }

  @Post("change-plan")
  @RequireRole("OWNER")
  @ApiOperation({
    summary: "Execute a plan change (upgrade/downgrade) with proration",
  })
  async changePlan(
    @Req() req: any,
    @Body() body: { targetPlanCode: string; confirmed: boolean },
  ) {
    const merchantId = req?.merchantId;
    if (!body?.targetPlanCode || !body?.confirmed) {
      throw new BadRequestException(
        "targetPlanCode and confirmed=true are required",
      );
    }

    const targetPlan = body.targetPlanCode as PlanType;
    const targetEntitlements = PLAN_ENTITLEMENTS[targetPlan];
    if (!targetEntitlements) {
      throw new BadRequestException(`Unknown plan: ${targetPlan}`);
    }

    const subResult = await this.pool.query(
      `SELECT ms.id, ms.current_period_start, ms.current_period_end,
              bp.code as plan_code, bp.price_cents
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       WHERE ms.merchant_id = $1 AND ms.status = 'ACTIVE'
       ORDER BY ms.created_at DESC LIMIT 1`,
      [merchantId],
    );

    const currentPlanCode = subResult.rows[0]?.plan_code || "TRIAL";
    const isUpgrade =
      (planOrder[targetPlan] || 0) > (planOrder[currentPlanCode] || 0);
    const isDowngrade =
      (planOrder[targetPlan] || 0) < (planOrder[currentPlanCode] || 0);

    if (isUpgrade || !subResult.rows.length) {
      return this.upgradePlan(req, { planCode: targetPlan });
    }

    if (isDowngrade) {
      const periodEnd = subResult.rows[0]?.current_period_end;

      await this.pool.query(
        `UPDATE merchant_subscriptions
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}')::jsonb,
           '{scheduledDowngrade}',
           $2::jsonb
         ), updated_at = NOW()
         WHERE id = $1`,
        [
          subResult.rows[0].id,
          JSON.stringify({
            targetPlan,
            scheduledAt: new Date().toISOString(),
          }),
        ],
      );

      return {
        status: "SCHEDULED",
        message: `⏱️ تم جدولة تخفيض الخطة إلى ${targetPlan}. ستبقى ميزاتك الحالية حتى نهاية الفترة.`,
        currentPlan: currentPlanCode,
        targetPlan,
        effectiveDate: periodEnd,
      };
    }

    return { status: "NO_CHANGE", message: "أنت على نفس الخطة" };
  }
}
