import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Param,
  UseGuards,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  PLAN_ENTITLEMENTS,
  FEATURE_PRICES_EGP,
  AGENT_PRICES_EGP,
  AI_USAGE_TIERS,
  MESSAGE_TIERS,
  AGENT_CATALOG,
  FEATURE_CATALOG,
  PlanType,
  AgentType,
  FeatureType,
} from "../../shared/entitlements";

@ApiTags("Billing")
@Controller("v1/portal/billing")
@UseGuards(MerchantApiKeyGuard)
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
export class BillingController {
  private readonly logger = new Logger(BillingController.name);
  private readonly planOrder: Record<string, number> = {
    TRIAL: 0,
    STARTER: 1,
    GROWTH: 2,
    PRO: 3,
    ENTERPRISE: 4,
    CUSTOM: 5,
  };

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private normalizePlanCode(value: unknown): PlanType | null {
    const raw = String(value || "").toUpperCase();
    if (!raw) return null;
    if (raw === "PROFESSIONAL" || raw === "PRO_PLAN") return "PRO";
    if (raw === "ENTERPRISES") return "ENTERPRISE";
    if (raw === "BASIC") return "STARTER";
    if (raw === "GROW") return "GROWTH";
    if (raw in PLAN_ENTITLEMENTS) return raw as PlanType;
    return null;
  }

  private applyCanonicalPlanData<T extends Record<string, any>>(row: T): T {
    const normalizedCode = this.normalizePlanCode(row?.code || row?.plan_code);
    if (!normalizedCode) return row;

    const canonical = PLAN_ENTITLEMENTS[normalizedCode];
    if (!canonical) return row;

    const priceCents =
      canonical.price !== undefined
        ? Math.round(canonical.price * 100)
        : row.price_cents;
    return {
      ...row,
      code: row.code || normalizedCode,
      plan_code: row.plan_code || normalizedCode,
      price_cents: priceCents,
      currency: canonical.currency || row.currency || "EGP",
      features: canonical.enabledFeatures,
      agents: canonical.enabledAgents,
      limits: canonical.limits,
    };
  }

  private async getMerchantColumns(client: {
    query: Function;
  }): Promise<Set<string>> {
    const result = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'merchants'`,
    );
    return new Set(
      result.rows.map((row: { column_name: string }) => row.column_name),
    );
  }

  private async updateMerchantProvisioning(
    client: { query: Function },
    params: {
      merchantId: string;
      planCode: string;
      enabledAgents: string[];
      enabledFeatures: string[];
      limits: Record<string, any>;
      dailyTokenBudget?: number;
      isActive?: boolean;
    },
  ): Promise<void> {
    const columns = await this.getMerchantColumns(client);
    const updates: string[] = [];
    const values: any[] = [params.merchantId];
    let idx = 2;

    if (columns.has("enabled_agents")) {
      updates.push(`enabled_agents = $${idx++}`);
      values.push(params.enabledAgents);
    }
    if (columns.has("enabled_features")) {
      updates.push(`enabled_features = $${idx++}`);
      values.push(params.enabledFeatures);
    }
    if (columns.has("plan")) {
      updates.push(`plan = $${idx++}`);
      values.push(params.planCode);
    }
    if (columns.has("daily_token_budget")) {
      updates.push(`daily_token_budget = $${idx++}`);
      values.push(params.dailyTokenBudget ?? 100000);
    }
    if (columns.has("limits")) {
      updates.push(`limits = $${idx++}::jsonb`);
      values.push(JSON.stringify(params.limits || {}));
    }
    if (columns.has("plan_limits")) {
      updates.push(`plan_limits = $${idx++}::jsonb`);
      values.push(JSON.stringify(params.limits || {}));
    }
    if (columns.has("is_active") && params.isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(params.isActive);
    }
    if (columns.has("updated_at")) {
      updates.push(`updated_at = NOW()`);
    }

    if (updates.length === 0) return;

    await client.query(
      `UPDATE merchants
       SET ${updates.join(", ")}
       WHERE id = $1`,
      values,
    );
  }

  @Get("plans")
  @ApiOperation({ summary: "List available billing plans" })
  async listPlans() {
    const result = await this.pool.query(
      `SELECT * FROM billing_plans WHERE is_active = true ORDER BY price_cents NULLS LAST`,
    );
    const plans = result.rows
      .map((row) => this.applyCanonicalPlanData(row))
      .sort((a, b) => {
        const left = this.planOrder[String(a.code || "").toUpperCase()] ?? 999;
        const right = this.planOrder[String(b.code || "").toUpperCase()] ?? 999;
        return left - right;
      });
    return { plans };
  }

  @Get("summary")
  @ApiOperation({ summary: "Get merchant billing summary" })
  async getSummary(@Req() req: any) {
    const merchantId = req?.merchantId;
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

    const subscription = this.applyCanonicalPlanData(result.rows[0]);

    // Auto-activate PENDING subscriptions (manual payment provider — no gateway to wait for)
    if (
      subscription.status === "PENDING" &&
      subscription.provider === "manual"
    ) {
      try {
        await this.activateSubscription(req, subscription.id);
        const refreshed = await this.pool.query(
          `SELECT ms.*, bp.code as plan_code, bp.name as plan_name, bp.price_cents, bp.currency, bp.billing_period
           FROM merchant_subscriptions ms
           JOIN billing_plans bp ON bp.id = ms.plan_id
           WHERE ms.id = $1`,
          [subscription.id],
        );
        const refreshedSub = refreshed.rows[0]
          ? this.applyCanonicalPlanData(refreshed.rows[0])
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
        await this.updateMerchantProvisioning(this.pool as any, {
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

  @Post("checkout")
  @ApiOperation({
    summary: "Create checkout / subscription intent (manual placeholder)",
  })
  async createCheckout(@Req() req: any, @Body() body: { planCode: string }) {
    const merchantId = req?.merchantId;
    if (!body?.planCode) {
      throw new BadRequestException("planCode is required");
    }

    // ── One-time trial guard ──
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

    const plan = this.applyCanonicalPlanData(planResult.rows[0]);

    // Prevent duplicate pending subscriptions for the same plan.
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
        };
      }
      return {
        status: "PENDING",
        message: "يوجد طلب اشتراك قيد المراجعة بالفعل لنفس الباقة.",
        subscriptionId: existingSub.id,
      };
    }

    // Determine subscription period (14 days for trial, 30 days for paid plans)
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
    };
  }

  // ============== PRICING CALCULATOR ==============

  @Get("pricing")
  @ApiOperation({ summary: "Get full pricing data for the pricing calculator" })
  async getPricing() {
    // Build plan pricing summary
    const plans = Object.entries(PLAN_ENTITLEMENTS)
      .filter(([key]) => key !== "CUSTOM")
      .map(([key, plan]) => ({
        id: key,
        price: plan.price ?? null,
        currency: plan.currency || "EGP",
        trialDays: (plan as any).trialDays || null,
        agents: plan.enabledAgents,
        features: plan.enabledFeatures,
        limits: plan.limits,
      }));

    return {
      plans,
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
        price: AGENT_PRICES_EGP[a.id],
        dependencies: a.dependencies,
        features: a.features,
      })),
      features: FEATURE_CATALOG.map((f) => ({
        id: f.id,
        nameAr: f.nameAr,
        nameEn: f.nameEn,
        descriptionAr: f.descriptionAr,
        status: f.status,
        price: FEATURE_PRICES_EGP[f.id],
        requiredAgent: f.requiredAgent || null,
        dependencies: f.dependencies,
      })),
    };
  }

  @Post("calculate")
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
    const {
      agents = [],
      features = [],
      aiTier = "BASIC",
      messageTier = "STARTER",
    } = body;

    let totalMonthly = 0;
    const breakdown: Array<{ item: string; nameAr: string; price: number }> =
      [];

    // Agent costs
    for (const agentId of agents) {
      const price = AGENT_PRICES_EGP[agentId as keyof typeof AGENT_PRICES_EGP];
      if (price !== undefined) {
        totalMonthly += price;
        const catalog = AGENT_CATALOG.find((a) => a.id === agentId);
        breakdown.push({
          item: agentId,
          nameAr: catalog?.nameAr || agentId,
          price,
        });
      }
    }

    // Feature add-on costs (only features NOT already included by agents)
    const agentIncludedFeatures = new Set<string>();
    for (const agentId of agents) {
      const agentEntry = AGENT_CATALOG.find((a) => a.id === agentId);
      if (agentEntry) {
        agentEntry.features.forEach((f) => agentIncludedFeatures.add(f));
      }
    }

    for (const featureId of features) {
      if (agentIncludedFeatures.has(featureId)) continue; // Already included
      const price =
        FEATURE_PRICES_EGP[featureId as keyof typeof FEATURE_PRICES_EGP];
      if (price !== undefined) {
        totalMonthly += price;
        const catalog = FEATURE_CATALOG.find((f) => f.id === featureId);
        breakdown.push({
          item: featureId,
          nameAr: catalog?.nameAr || featureId,
          price,
        });
      }
    }

    // AI usage tier
    const aiTierData =
      AI_USAGE_TIERS[aiTier as keyof typeof AI_USAGE_TIERS] ||
      AI_USAGE_TIERS.BASIC;
    if (aiTierData.price > 0) {
      totalMonthly += aiTierData.price;
      breakdown.push({
        item: `AI_${aiTier}`,
        nameAr: `باقة الذكاء الاصطناعي - ${aiTierData.label}`,
        price: aiTierData.price,
      });
    }

    // Message volume tier
    const msgTierData =
      MESSAGE_TIERS[messageTier as keyof typeof MESSAGE_TIERS] ||
      MESSAGE_TIERS.STARTER;
    if (msgTierData.price > 0) {
      totalMonthly += msgTierData.price;
      breakdown.push({
        item: `MSG_${messageTier}`,
        nameAr: `حجم الرسائل - ${msgTierData.label}`,
        price: msgTierData.price,
      });
    }

    // Find closest pre-defined plan for comparison
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
      aiTier: { ...aiTierData, id: aiTier },
      messageTier: { ...msgTierData, id: messageTier },
      recommendedPlan,
      recommendedPlanPrice,
      savingsVsCustom: recommendedPlanPrice
        ? totalMonthly - recommendedPlanPrice
        : 0,
    };
  }

  // ============== PLAN ACTIVATION & PROVISIONING ==============

  @Post("activate/:subscriptionId")
  @ApiOperation({
    summary: "Activate a pending subscription and provision entitlements",
  })
  async activateSubscription(
    @Req() req: any,
    @Param("subscriptionId") subscriptionId: string,
  ) {
    const merchantId = req?.merchantId;

    // Get the pending subscription
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

    // Determine entitlements from the plan
    const planCode = subscription.plan_code as PlanType;
    const planEntitlements = PLAN_ENTITLEMENTS[planCode];

    if (!planEntitlements) {
      throw new BadRequestException(`Unknown plan: ${planCode}`);
    }

    const enabledAgents = planEntitlements.enabledAgents;
    const enabledFeatures = planEntitlements.enabledFeatures;
    const limits = planEntitlements.limits;

    // Transaction: activate subscription + provision entitlements on merchant
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Set subscription to ACTIVE
      await client.query(
        `UPDATE merchant_subscriptions 
         SET status = 'ACTIVE',
             current_period_start = COALESCE(current_period_start, NOW()),
             current_period_end = COALESCE(current_period_end, NOW() + INTERVAL '30 days'),
             updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId],
      );

      // 2. Deactivate any previous active subscriptions
      await client.query(
        `UPDATE merchant_subscriptions 
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE merchant_id = $1 AND id != $2 AND status = 'ACTIVE'`,
        [merchantId, subscriptionId],
      );

      // 3. Provision entitlements on the merchant record (including limits JSONB)
      await this.updateMerchantProvisioning(client as any, {
        merchantId,
        planCode,
        enabledAgents,
        enabledFeatures,
        limits: limits || {},
        dailyTokenBudget: limits?.tokenBudgetDaily || 100000,
        isActive: true,
      });

      // 4. Create agent subscriptions for all enabled agents
      for (const agentType of enabledAgents) {
        await client.query(
          `INSERT INTO merchant_agent_subscriptions (merchant_id, agent_type, is_enabled, config, enabled_at)
           VALUES ($1, $2, true, '{}', NOW())
           ON CONFLICT (merchant_id, agent_type) 
           DO UPDATE SET is_enabled = true, enabled_at = NOW(), disabled_at = NULL, updated_at = NOW()`,
          [merchantId, agentType],
        );
      }

      // 5. Mark invoice as PAID if exists
      await client
        .query(
          `UPDATE billing_invoices 
         SET status = 'PAID', paid_at = NOW(), updated_at = NOW()
         WHERE subscription_id = $1 AND status = 'OPEN'`,
          [subscriptionId],
        )
        .catch(() => {
          /* billing_invoices may not exist */
        });

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

    // Get current plan
    const currentResult = await this.pool.query(
      `SELECT plan FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const currentPlan = currentResult.rows[0]?.plan || "TRIAL";

    // Verify it's an upgrade (or allow any change for now)
    const planOrder: Record<string, number> = {
      TRIAL: 0,
      STARTER: 1,
      GROWTH: 2,
      PRO: 3,
      ENTERPRISE: 4,
    };
    const isUpgrade =
      (planOrder[targetPlan] || 0) > (planOrder[currentPlan] || 0);
    const isDowngrade =
      (planOrder[targetPlan] || 0) < (planOrder[currentPlan] || 0);

    // Create the subscription and checkout
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

    // For upgrades: create subscription + auto-activate
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Cancel current subscription
      await client.query(
        `UPDATE merchant_subscriptions 
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE merchant_id = $1 AND status = 'ACTIVE'`,
        [merchantId],
      );

      // Create new subscription
      const subResult = await client.query(
        `INSERT INTO merchant_subscriptions (
          merchant_id, plan_id, status, provider, current_period_start, current_period_end
        ) VALUES ($1, $2, 'ACTIVE', 'manual', NOW(), NOW() + INTERVAL '30 days')
        RETURNING id`,
        [merchantId, plan.id],
      );
      const subscriptionId = subResult.rows[0].id;

      // Provision entitlements
      const enabledAgents = planEntitlements.enabledAgents;
      const enabledFeatures = planEntitlements.enabledFeatures;

      await this.updateMerchantProvisioning(client as any, {
        merchantId,
        planCode: targetPlan,
        enabledAgents,
        enabledFeatures,
        limits: planEntitlements.limits || {},
        dailyTokenBudget: planEntitlements.limits?.tokenBudgetDaily || 100000,
        isActive: true,
      });

      // Create agent subscriptions
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
        enabledFeatures,
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

  // ============== PRORATION / PLAN CHANGE CALCULATION ==============

  @Post("prorate")
  @ApiOperation({
    summary: "Calculate proration for a mid-cycle plan change",
    description: `
      When a merchant changes plan mid-month:
      - **Upgrade**: Credit remaining days on old plan, charge full month of new plan.
        Merchant pays the difference immediately, new billing cycle starts now.
      - **Downgrade**: Credit remaining days on old plan, new plan starts at next billing cycle.
        Downgrade is deferred — current features remain until period end.
      - **Same plan**: No change.
    `,
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

    // Get current subscription
    const subResult = await this.pool.query(
      `SELECT ms.id, ms.status, ms.current_period_start, ms.current_period_end,
              bp.code as plan_code, bp.price_cents, bp.currency
       FROM merchant_subscriptions ms
       JOIN billing_plans bp ON bp.id = ms.plan_id
       WHERE ms.merchant_id = $1 AND ms.status = 'ACTIVE'
       ORDER BY ms.created_at DESC LIMIT 1`,
      [merchantId],
    );

    // No active subscription — just show new plan price
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

    // Calculate remaining days and credit
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

    const planOrder: Record<string, number> = {
      TRIAL: 0,
      STARTER: 1,
      GROWTH: 2,
      PRO: 3,
      ENTERPRISE: 4,
    };
    const isUpgrade =
      (planOrder[targetPlan] || 0) > (planOrder[currentPlanCode] || 0);

    if (isUpgrade) {
      // Upgrade: credit remaining, charge new plan full month, effective immediately
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
      // Downgrade: features remain until period end, new plan starts next cycle
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
  @ApiOperation({
    summary: "Execute a plan change (upgrade/downgrade) with proration",
    description:
      "Upgrades take effect immediately with prorated billing. Downgrades are scheduled for end of current period.",
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

    // Get current subscription
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
    const planOrder: Record<string, number> = {
      TRIAL: 0,
      STARTER: 1,
      GROWTH: 2,
      PRO: 3,
      ENTERPRISE: 4,
    };
    const isUpgrade =
      (planOrder[targetPlan] || 0) > (planOrder[currentPlanCode] || 0);
    const isDowngrade =
      (planOrder[targetPlan] || 0) < (planOrder[currentPlanCode] || 0);

    if (isUpgrade || !subResult.rows.length) {
      // Immediate activation via upgrade endpoint
      return this.upgradePlan(req, { planCode: targetPlan });
    }

    if (isDowngrade) {
      // Schedule downgrade for end of period
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
          JSON.stringify({ targetPlan, scheduledAt: new Date().toISOString() }),
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

  @Get("history")
  @ApiOperation({ summary: "Get billing history (invoices and plan changes)" })
  async getBillingHistory(@Req() req: any) {
    const merchantId = req?.merchantId;

    // Get subscription history
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

    // Get invoices if table exists
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
}
