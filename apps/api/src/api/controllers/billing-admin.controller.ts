import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
  Inject,
  Logger,
  Get,
  Put,
  Delete,
  Param,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags, ApiParam } from "@nestjs/swagger";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";
import {
  AgentType,
  FeatureType,
  PlanLimits,
  PlanType,
  PLAN_ENTITLEMENTS,
  resolveEntitlementDependencies,
} from "../../shared/entitlements";

interface PurchaseEventPayload {
  merchantId: string;
  planCode: string;
  status?: string;
  source?: string;
  subscriptionId?: string;
  entitlements?: {
    enabledAgents?: AgentType[];
    enabledFeatures?: FeatureType[];
    limits?: Partial<PlanLimits>;
    customPrice?: number | null;
  };
}

interface OfferPayload {
  code?: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  discountType: "PERCENT" | "AMOUNT";
  discountValue: number;
  currency?: string;
  appliesToPlan?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

@ApiTags("Billing (Admin)")
@Controller("v1/admin/billing")
@UseGuards(AdminApiKeyGuard)
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
export class BillingAdminController {
  private readonly logger = new Logger(BillingAdminController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Post("purchase-events")
  @ApiOperation({
    summary: "Apply purchase event entitlements",
    description:
      "Used by billing providers/webhooks to activate plan entitlements once purchase is confirmed.",
  })
  async applyPurchaseEvent(@Body() body: PurchaseEventPayload) {
    if (!body?.merchantId || !body?.planCode) {
      throw new BadRequestException("merchantId and planCode are required");
    }

    const normalizedPlan = String(
      body.planCode || "",
    ).toUpperCase() as PlanType;
    const planDefaults = PLAN_ENTITLEMENTS[normalizedPlan];

    if (!planDefaults && normalizedPlan !== "CUSTOM") {
      throw new BadRequestException("Unknown planCode");
    }

    const basePlan = planDefaults || PLAN_ENTITLEMENTS.CUSTOM;

    let enabledAgents: AgentType[] = (body.entitlements?.enabledAgents ||
      basePlan.enabledAgents) as AgentType[];
    let enabledFeatures: FeatureType[] = (body.entitlements?.enabledFeatures ||
      basePlan.enabledFeatures) as FeatureType[];

    if (normalizedPlan !== "CUSTOM") {
      enabledAgents = basePlan.enabledAgents;
      enabledFeatures = basePlan.enabledFeatures;
    }

    const resolved = resolveEntitlementDependencies({
      enabledAgents,
      enabledFeatures,
    });

    const limits: PlanLimits = {
      ...basePlan.limits,
      ...(body.entitlements?.limits || {}),
    };

    const customPrice =
      body.entitlements?.customPrice ?? basePlan.price ?? null;

    const prevResult = await this.pool.query(
      `SELECT plan, enabled_agents, enabled_features FROM merchants WHERE id = $1`,
      [body.merchantId],
    );

    const updateResult = await this.pool.query(
      `UPDATE merchants 
       SET plan = $1,
           enabled_agents = $2,
           enabled_features = $3,
           plan_limits = $4,
           custom_price = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [
        normalizedPlan,
        resolved.enabledAgents,
        resolved.enabledFeatures,
        JSON.stringify(limits),
        customPrice,
        body.merchantId,
      ],
    );

    if (updateResult.rowCount === 0) {
      throw new BadRequestException("Merchant not found");
    }

    if (body.subscriptionId && body.status) {
      const allowedStatuses = new Set([
        "PENDING",
        "ACTIVE",
        "PAST_DUE",
        "CANCELED",
        "EXPIRED",
      ]);
      if (!allowedStatuses.has(body.status)) {
        throw new BadRequestException("Invalid subscription status");
      }
      await this.pool.query(
        `UPDATE merchant_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2`,
        [body.status, body.subscriptionId],
      );
    }

    try {
      const previousState = prevResult.rows[0] || {};
      await this.pool.query(
        `INSERT INTO entitlement_changes 
         (merchant_id, previous_agents, new_agents, previous_features, new_features, changed_by, change_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          body.merchantId,
          previousState.enabled_agents || [],
          resolved.enabledAgents,
          previousState.enabled_features || [],
          resolved.enabledFeatures,
          "billing",
          body.source ? `purchase_event:${body.source}` : "purchase_event",
        ],
      );
    } catch (error) {
      this.logger.warn({
        msg: "Failed to record entitlement change from purchase event",
        error: (error as Error).message,
      });
    }

    return {
      success: true,
      merchantId: body.merchantId,
      plan: normalizedPlan,
      enabledAgents: resolved.enabledAgents,
      enabledFeatures: resolved.enabledFeatures,
      limits,
      customPrice,
      dependenciesResolved: {
        agentsAdded: resolved.enabledAgents.filter(
          (a) => !enabledAgents.includes(a),
        ),
        featuresAdded: resolved.enabledFeatures.filter(
          (f) => !enabledFeatures.includes(f),
        ),
      },
    };
  }

  @Get("offers")
  @ApiOperation({ summary: "List subscription offers" })
  async listOffers() {
    const result = await this.pool.query(
      `SELECT * FROM subscription_offers ORDER BY created_at DESC`,
    );
    return { offers: result.rows };
  }

  @Post("offers")
  @ApiOperation({ summary: "Create subscription offer" })
  async createOffer(@Body() body: OfferPayload) {
    if (!body?.name || body.discountValue === undefined || !body.discountType) {
      throw new BadRequestException(
        "name, discountType, discountValue are required",
      );
    }
    if (
      body.discountType === "PERCENT" &&
      (body.discountValue < 0 || body.discountValue > 100)
    ) {
      throw new BadRequestException(
        "Percent discount must be between 0 and 100",
      );
    }

    const code = body.code || `OFFER-${Date.now()}`;
    const result = await this.pool.query(
      `INSERT INTO subscription_offers
        (code, name, name_ar, description, description_ar, discount_type, discount_value, currency, applies_to_plan, starts_at, ends_at, is_active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()), $11, COALESCE($12, true), $13)
       RETURNING *`,
      [
        code,
        body.name,
        body.nameAr || null,
        body.description || null,
        body.descriptionAr || null,
        body.discountType,
        body.discountValue,
        body.currency || "EGP",
        body.appliesToPlan || null,
        body.startsAt || null,
        body.endsAt || null,
        body.isActive ?? true,
        JSON.stringify(body.metadata || {}),
      ],
    );
    return { offer: result.rows[0] };
  }

  @Put("offers/:id")
  @ApiOperation({ summary: "Update subscription offer" })
  @ApiParam({ name: "id", description: "Offer ID" })
  async updateOffer(
    @Param("id") id: string,
    @Body() body: Partial<OfferPayload>,
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const apply = (field: string, value: any) => {
      updates.push(`${field} = $${paramIndex++}`);
      values.push(value);
    };

    if (body.code !== undefined) apply("code", body.code);
    if (body.name !== undefined) apply("name", body.name);
    if (body.nameAr !== undefined) apply("name_ar", body.nameAr);
    if (body.description !== undefined) apply("description", body.description);
    if (body.descriptionAr !== undefined)
      apply("description_ar", body.descriptionAr);
    if (body.discountType !== undefined)
      apply("discount_type", body.discountType);
    if (body.discountValue !== undefined)
      apply("discount_value", body.discountValue);
    if (body.currency !== undefined) apply("currency", body.currency);
    if (body.appliesToPlan !== undefined)
      apply("applies_to_plan", body.appliesToPlan);
    if (body.startsAt !== undefined) apply("starts_at", body.startsAt);
    if (body.endsAt !== undefined) apply("ends_at", body.endsAt);
    if (body.isActive !== undefined) apply("is_active", body.isActive);
    if (body.metadata !== undefined)
      apply("metadata", JSON.stringify(body.metadata || {}));

    if (updates.length === 0) {
      throw new BadRequestException("No updates provided");
    }

    values.push(id);
    const result = await this.pool.query(
      `UPDATE subscription_offers SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    if (result.rows.length === 0) {
      throw new BadRequestException("Offer not found");
    }
    return { offer: result.rows[0] };
  }

  @Delete("offers/:id")
  @ApiOperation({ summary: "Disable subscription offer" })
  @ApiParam({ name: "id", description: "Offer ID" })
  async disableOffer(@Param("id") id: string) {
    const result = await this.pool.query(
      `UPDATE subscription_offers SET is_active = false WHERE id = $1 RETURNING *`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new BadRequestException("Offer not found");
    }
    return { success: true };
  }
}
