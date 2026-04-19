import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Logger,
  UseGuards,
  Inject,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiBody,
  ApiQuery,
} from "@nestjs/swagger";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import { MerchantCategory } from "../../shared/constants/enums";
import { v4 as uuidv4 } from "uuid";
import { IsNumber, IsOptional, IsArray, IsString, Min } from "class-validator";
import {
  AGENT_CATALOG,
  FEATURE_CATALOG,
  AgentType,
  FeatureType,
  PlanType,
  PlanLimits,
  PLAN_ENTITLEMENTS,
  resolveEntitlementDependencies,
} from "../../shared/entitlements";
import {
  normalizePlanCode,
  resolveCashierProvisioning,
  toStringArray,
} from "./billing.helpers";

// ===== DTOs =====

class UpdateBudgetDto {
  @IsNumber()
  @Min(0)
  dailyTokenBudget!: number;
}

class UpdateEnabledAgentsDto {
  @IsArray()
  @IsString({ each: true })
  enabledAgents!: AgentType[];
}

class UpdateMerchantPlanDto {
  @IsString()
  plan!: PlanType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  enabledAgents?: AgentType[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  enabledFeatures?: FeatureType[];

  @IsOptional()
  limits?: Partial<PlanLimits>;

  @IsOptional()
  @IsNumber()
  customPrice?: number;
}

@ApiTags("Admin")
@Controller("v1/admin")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
export class AdminMerchantsController {
  private readonly logger = new Logger(AdminMerchantsController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
  ) {}

  // ===== PRIVATE HELPERS =====

  private getValidAgentTypes(): AgentType[] {
    return AGENT_CATALOG.map((agent) => agent.id);
  }

  private getValidFeatureTypes(): FeatureType[] {
    return FEATURE_CATALOG.map((feature) => feature.id);
  }

  private getFallbackEnabledAgents(plan?: string | null): AgentType[] {
    const normalizedPlan = String(plan || "").toUpperCase() as PlanType;
    return (
      PLAN_ENTITLEMENTS[normalizedPlan]?.enabledAgents ||
      PLAN_ENTITLEMENTS.STARTER.enabledAgents
    );
  }

  private toPositiveInt(value: unknown, fallback: number, max = 500): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(max, Math.floor(numeric)));
  }

  private asObject(value: unknown): Record<string, any> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, any>;
  }

  private extractLimit(limits: Record<string, any>, keys: string[]): number {
    for (const key of keys) {
      const raw = limits?.[key];
      if (raw === undefined || raw === null || raw === "") continue;
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    return 0;
  }

  private calculateUsagePercent(used: number, limit: number): number | null {
    if (!Number.isFinite(limit) || limit <= 0) {
      return null;
    }
    if (!Number.isFinite(used) || used <= 0) {
      return 0;
    }
    return Math.round((used / limit) * 1000) / 10;
  }

  private classifyUsageBand(percent: number | null): string {
    if (percent == null) return "healthy";
    if (percent >= 100) return "exceeded";
    if (percent >= 95) return "critical";
    if (percent >= 85) return "warning";
    if (percent >= 70) return "attention";
    return "healthy";
  }

  private mapMerchantEntitlementsRow(row: Record<string, any>): any {
    const normalizedPlan = normalizePlanCode(row.plan) || "STARTER";
    const planDefaults =
      PLAN_ENTITLEMENTS[normalizedPlan] || PLAN_ENTITLEMENTS.STARTER;

    const requestedAgents = toStringArray(row.enabled_agents);
    const requestedFeatures = toStringArray(row.enabled_features);
    const baseLimits = {
      ...planDefaults.limits,
      ...this.asObject(row.limits),
      ...this.asObject(row.plan_limits),
    };

    const cashierProvisioning = resolveCashierProvisioning({
      planCode: normalizedPlan,
      enabledFeatures:
        requestedFeatures.length > 0
          ? requestedFeatures
          : planDefaults.enabledFeatures,
      limits: baseLimits,
      existingFeatures: requestedFeatures,
      existingLimits: baseLimits,
    });

    const effectiveLimits = {
      ...baseLimits,
      ...this.asObject(cashierProvisioning.limits),
    };

    let aiRepliesLimitMonth = this.extractLimit(effectiveLimits, [
      "aiRepliesPerMonth",
      "aiMessagesPerMonth",
      "aiRepliesMonthly",
    ]);
    if (aiRepliesLimitMonth === 0) {
      const aiCallsPerDay = this.extractLimit(effectiveLimits, [
        "aiCallsPerDay",
      ]);
      if (aiCallsPerDay > 0) {
        aiRepliesLimitMonth = aiCallsPerDay * 30;
      }
    }

    const messagesLimitMonth = this.extractLimit(effectiveLimits, [
      "messagesPerMonth",
      "totalMessagesPerMonth",
      "monthlyConversations",
      "monthly_conversations_egypt",
      "monthly_conversations_gulf",
      "monthlyConversationsEgypt",
      "monthlyConversationsGulf",
    ]);

    const messagesUsedMonth = Number(row.messages_used_month || 0);
    const aiRepliesUsedMonth = Number(row.ai_replies_used_month || 0);
    const messagesUsagePercent = this.calculateUsagePercent(
      messagesUsedMonth,
      messagesLimitMonth,
    );
    const aiRepliesUsagePercent = this.calculateUsagePercent(
      aiRepliesUsedMonth,
      aiRepliesLimitMonth,
    );

    return {
      id: row.id,
      name: row.name,
      tradeName: row.name,
      email: row.owner_email || "",
      whatsappNumber: row.whatsapp_number || null,
      category: row.category,
      isActive: Boolean(row.is_active),
      plan: normalizedPlan,
      enabledAgents:
        requestedAgents.length > 0
          ? requestedAgents
          : planDefaults.enabledAgents,
      enabledFeatures: cashierProvisioning.enabledFeatures,
      limits: effectiveLimits,
      dailyTokenBudget: Number(row.daily_token_budget || 0),
      tokensUsedToday: Number(row.tokens_used_today || 0),
      usage: {
        messagesUsedMonth,
        messagesLimitMonth,
        messagesUsagePercent,
        aiRepliesUsedMonth,
        aiRepliesLimitMonth,
        aiRepliesUsagePercent,
        thresholdBand: this.classifyUsageBand(messagesUsagePercent),
      },
      cashierPromoActive: cashierProvisioning.promo.active,
      cashierPromoEndsAt: cashierProvisioning.promo.endsAt,
      cashierEffective: cashierProvisioning.promo.effective,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async hasTable(tableName: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         ) AS exists`,
        [tableName],
      );
      return Boolean(result.rows[0]?.exists);
    } catch {
      return false;
    }
  }

  private async applyPlanEntitlements(
    merchantId: string,
    dto: UpdateMerchantPlanDto,
    changeReason: string,
  ) {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const planDefaults =
      PLAN_ENTITLEMENTS[dto.plan] || PLAN_ENTITLEMENTS.STARTER;

    let enabledAgents: AgentType[] =
      dto.enabledAgents || planDefaults.enabledAgents;
    let enabledFeatures: FeatureType[] =
      dto.enabledFeatures || planDefaults.enabledFeatures;

    const validAgentTypes = this.getValidAgentTypes();
    const validFeatureTypes = this.getValidFeatureTypes();
    const invalidAgents = enabledAgents.filter(
      (agent) => !validAgentTypes.includes(agent),
    );
    const invalidFeatures = enabledFeatures.filter(
      (feature) => !validFeatureTypes.includes(feature),
    );

    if (invalidAgents.length > 0 || invalidFeatures.length > 0) {
      return {
        success: false,
        error: "Invalid entitlements provided",
        invalidAgents,
        invalidFeatures,
        validAgentTypes,
        validFeatureTypes,
      };
    }

    if (dto.plan !== "CUSTOM") {
      enabledAgents = planDefaults.enabledAgents;
      enabledFeatures = planDefaults.enabledFeatures;
    }

    const resolved = resolveEntitlementDependencies({
      enabledAgents,
      enabledFeatures,
    });

    const limits: PlanLimits = {
      ...planDefaults.limits,
      ...dto.limits,
    };

    const prevResult = await this.pool.query(
      `SELECT plan, enabled_agents, enabled_features, plan_limits, custom_price 
       FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const previousState = prevResult.rows[0] || {};

    await this.pool.query(
      `UPDATE merchants 
       SET plan = $1, 
           enabled_agents = $2, 
           enabled_features = $3,
           plan_limits = $4,
           limits = $4,
           custom_price = $5,
           updated_at = NOW() 
       WHERE id = $6`,
      [
        dto.plan,
        resolved.enabledAgents,
        resolved.enabledFeatures,
        JSON.stringify(limits),
        dto.customPrice || planDefaults.price || null,
        merchantId,
      ],
    );

    try {
      await this.pool.query(
        `INSERT INTO entitlement_changes 
         (merchant_id, previous_agents, new_agents, previous_features, new_features, changed_by, change_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          merchantId,
          previousState.enabled_agents || [],
          resolved.enabledAgents,
          previousState.enabled_features || [],
          resolved.enabledFeatures,
          "admin",
          changeReason,
        ],
      );
    } catch (e) {
      this.logger.warn({
        msg: "Entitlement audit log failed",
        error: (e as Error).message,
      });
    }

    return {
      success: true,
      merchantId,
      plan: dto.plan,
      enabledAgents: resolved.enabledAgents,
      enabledFeatures: resolved.enabledFeatures,
      limits,
      customPrice: dto.customPrice || planDefaults.price,
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

  private async seedCatalogItems(merchantId: string): Promise<void> {
    const items = [
      {
        name_ar: "تيشيرت قطن أبيض",
        base_price: 150,
        category: "ملابس رجالي",
        sku: "tshirt-white",
        variants: [{ name: "size", values: ["S", "M", "L", "XL", "XXL"] }],
      },
      {
        name_ar: "تيشيرت قطن أسود",
        base_price: 150,
        category: "ملابس رجالي",
        sku: "tshirt-black",
        variants: [{ name: "size", values: ["S", "M", "L", "XL", "XXL"] }],
      },
      {
        name_ar: "بنطلون جينز",
        base_price: 350,
        category: "ملابس رجالي",
        sku: "jeans-blue",
        variants: [
          { name: "size", values: ["30", "32", "34", "36", "38"] },
          { name: "color", values: ["أزرق", "أسود", "رمادي"] },
        ],
      },
      {
        name_ar: "قميص كاجوال",
        base_price: 250,
        category: "ملابس رجالي",
        sku: "shirt-casual",
        variants: [
          { name: "size", values: ["S", "M", "L", "XL"] },
          { name: "color", values: ["أبيض", "أزرق فاتح", "بيج"] },
        ],
      },
      {
        name_ar: "شورت رياضي",
        base_price: 120,
        category: "ملابس رياضية",
        sku: "shorts-sport",
        variants: [
          { name: "size", values: ["S", "M", "L", "XL"] },
          { name: "color", values: ["أسود", "كحلي", "رمادي"] },
        ],
      },
      {
        name_ar: "فستان صيفي",
        base_price: 280,
        category: "ملابس حريمي",
        sku: "dress-summer",
        variants: [
          { name: "size", values: ["S", "M", "L"] },
          { name: "color", values: ["أحمر", "أزرق", "أخضر"] },
        ],
      },
      {
        name_ar: "بلوزة قطن",
        base_price: 180,
        category: "ملابس حريمي",
        sku: "blouse-cotton",
        variants: [
          { name: "size", values: ["S", "M", "L"] },
          { name: "color", values: ["أبيض", "وردي", "أسود"] },
        ],
      },
    ];

    for (const item of items) {
      await this.pool.query(
        `INSERT INTO catalog_items (id, merchant_id, name_ar, base_price, category, sku, variants, is_available, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
         ON CONFLICT (merchant_id, sku) DO UPDATE SET
           base_price = EXCLUDED.base_price,
           category = EXCLUDED.category,
           variants = EXCLUDED.variants,
           updated_at = NOW()`,
        [
          uuidv4(),
          merchantId,
          item.name_ar,
          item.base_price,
          item.category,
          item.sku,
          JSON.stringify(item.variants || []),
        ],
      );
    }
  }

  // ===== ENDPOINTS =====

  @Get("merchants")
  @ApiOperation({
    summary: "List all merchants with budget and agent info",
    description:
      "Returns all merchants with their token budgets, usage, and enabled agents",
  })
  @ApiResponse({
    status: 200,
    description: "Merchants list retrieved successfully",
  })
  async listMerchants(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        m.id,
        m.name,
        m.plan,
        m.category,
        m.is_active,
        m.daily_token_budget,
        m.enabled_agents,
        m.enabled_features,
        m.plan_limits,
        m.created_at,
        m.updated_at,
        COALESCE(u.today_tokens, 0) as tokens_used_today
      FROM merchants m
      LEFT JOIN (
        SELECT merchant_id, SUM(tokens_used) as today_tokens
        FROM token_usage
        WHERE created_at >= CURRENT_DATE
        GROUP BY merchant_id
      ) u ON u.merchant_id = m.id
      ORDER BY m.name
    `);

    return {
      merchants: result.rows.map((row) => ({
        ...(() => {
          const cashierProvisioning = resolveCashierProvisioning({
            planCode: row.plan,
            enabledFeatures: toStringArray(row.enabled_features),
            limits: row.plan_limits || {},
            existingFeatures: toStringArray(row.enabled_features),
            existingLimits: row.plan_limits || {},
          });
          return {
            cashierPromoActive: cashierProvisioning.promo.active,
            cashierPromoEndsAt: cashierProvisioning.promo.endsAt,
            cashierEffective: cashierProvisioning.promo.effective,
          };
        })(),
        id: row.id,
        name: row.name,
        plan: row.plan,
        category: row.category,
        isActive: row.is_active,
        dailyTokenBudget: row.daily_token_budget,
        tokensUsedToday: parseInt(row.tokens_used_today, 10),
        enabledAgents:
          row.enabled_agents || this.getFallbackEnabledAgents(row.plan),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      total: result.rows.length,
    };
  }

  @Get("entitlements")
  @ApiOperation({
    summary: "List merchants for entitlement management",
    description:
      "Returns merchants with plan, entitlements and usage status for admin entitlement screens",
  })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "plan", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  @ApiResponse({ status: 200, description: "Entitlements list retrieved" })
  async listMerchantEntitlements(
    @Query("search") search?: string,
    @Query("plan") plan?: string,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string,
  ): Promise<any> {
    const hasMerchantStaff = await this.hasTable("merchant_staff");
    const hasPhoneNumbers = await this.hasTable("merchant_phone_numbers");

    const whereClauses: string[] = ["1=1"];
    const filterParams: any[] = [];

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
      filterParams.push(`%${normalizedSearch}%`);
      const searchParamIndex = filterParams.length;
      const searchChecks = [
        `m.id ILIKE $${searchParamIndex}`,
        `m.name ILIKE $${searchParamIndex}`,
      ];

      if (hasMerchantStaff) {
        searchChecks.push(`EXISTS (
          SELECT 1
          FROM merchant_staff ms
          WHERE ms.merchant_id = m.id
            AND (ms.email ILIKE $${searchParamIndex} OR ms.name ILIKE $${searchParamIndex})
        )`);
      }

      if (hasPhoneNumbers) {
        searchChecks.push(`EXISTS (
          SELECT 1
          FROM merchant_phone_numbers mp
          WHERE mp.merchant_id = m.id
            AND (
              mp.whatsapp_number ILIKE $${searchParamIndex}
              OR mp.phone_number ILIKE $${searchParamIndex}
            )
        )`);
      }

      whereClauses.push(`(${searchChecks.join(" OR ")})`);
    }

    const normalizedPlan =
      plan && plan !== "all"
        ? normalizePlanCode(plan) ||
          String(plan || "")
            .trim()
            .toUpperCase()
        : null;
    if (normalizedPlan) {
      filterParams.push(normalizedPlan);
      whereClauses.push(
        `UPPER(COALESCE(m.plan, 'STARTER')) = $${filterParams.length}`,
      );
    }

    const limit = Math.max(1, this.toPositiveInt(limitRaw, 20, 100));
    const offset = this.toPositiveInt(offsetRaw, 0, 100000);
    const whereSql = whereClauses.join(" AND ");

    const ownerSelect = hasMerchantStaff
      ? "owner.email AS owner_email,"
      : "NULL::text AS owner_email,";
    const ownerJoin = hasMerchantStaff
      ? `LEFT JOIN LATERAL (
           SELECT ms.email
           FROM merchant_staff ms
           WHERE ms.merchant_id = filtered.id
           ORDER BY
             (ms.role = 'OWNER') DESC,
             (ms.status = 'ACTIVE') DESC,
             ms.created_at ASC
           LIMIT 1
         ) owner ON true`
      : "";

    const phoneSelect = hasPhoneNumbers
      ? "phone.whatsapp_number AS whatsapp_number,"
      : "NULL::text AS whatsapp_number,";
    const phoneJoin = hasPhoneNumbers
      ? `LEFT JOIN LATERAL (
           SELECT mp.whatsapp_number
           FROM merchant_phone_numbers mp
           WHERE mp.merchant_id = filtered.id
             AND COALESCE(mp.is_active, true) = true
           ORDER BY mp.updated_at DESC, mp.created_at DESC
           LIMIT 1
         ) phone ON true`
      : "";

    const limitIndex = filterParams.length + 1;
    const offsetIndex = filterParams.length + 2;
    const dataParams = [...filterParams, limit, offset];

    const dataResult = await this.pool.query(
      `WITH filtered AS (
         SELECT m.*
         FROM merchants m
         WHERE ${whereSql}
         ORDER BY m.created_at DESC
         LIMIT $${limitIndex}
         OFFSET $${offsetIndex}
       )
       SELECT
         filtered.id,
         filtered.name,
         filtered.plan,
         filtered.category,
         filtered.is_active,
         filtered.daily_token_budget,
         filtered.enabled_agents,
         filtered.enabled_features,
         filtered.plan_limits,
         filtered.limits,
         filtered.created_at,
         filtered.updated_at,
         ${ownerSelect}
         ${phoneSelect}
         COALESCE(tokens.today_tokens, 0) AS tokens_used_today,
         COALESCE(monthly_messages.messages_used_month, 0) AS messages_used_month,
         COALESCE(monthly_ai.ai_replies_used_month, 0) AS ai_replies_used_month
       FROM filtered
       ${ownerJoin}
       ${phoneJoin}
       LEFT JOIN LATERAL (
         SELECT SUM(tu.tokens_used)::bigint AS today_tokens
         FROM token_usage tu
         WHERE tu.merchant_id = filtered.id
           AND tu.created_at >= CURRENT_DATE
       ) tokens ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::bigint AS messages_used_month
         FROM messages msg
         WHERE msg.merchant_id = filtered.id
           AND msg.created_at >= date_trunc('month', NOW())
       ) monthly_messages ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::bigint AS ai_replies_used_month
         FROM messages msg
         WHERE msg.merchant_id = filtered.id
           AND msg.created_at >= date_trunc('month', NOW())
           AND msg.direction = 'outbound'
           AND COALESCE(msg.llm_used, false) = true
       ) monthly_ai ON true
       ORDER BY filtered.created_at DESC`,
      dataParams,
    );

    const totalResult = await this.pool.query(
      `SELECT COUNT(*)::bigint AS total
       FROM merchants m
       WHERE ${whereSql}`,
      filterParams,
    );

    return {
      merchants: dataResult.rows.map((row) =>
        this.mapMerchantEntitlementsRow(row),
      ),
      total: Number(totalResult.rows[0]?.total || 0),
      pagination: {
        limit,
        offset,
      },
    };
  }

  @Get("merchants/:merchantId/entitlements")
  @ApiOperation({
    summary: "Get merchant entitlements",
    description:
      "Returns a single merchant entitlement payload used by admin entitlement editor",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({ status: 200, description: "Merchant entitlements retrieved" })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async getMerchantEntitlements(
    @Param("merchantId") merchantId: string,
  ): Promise<any> {
    const hasMerchantStaff = await this.hasTable("merchant_staff");
    const hasPhoneNumbers = await this.hasTable("merchant_phone_numbers");

    const ownerSelect = hasMerchantStaff
      ? "owner.email AS owner_email,"
      : "NULL::text AS owner_email,";
    const ownerJoin = hasMerchantStaff
      ? `LEFT JOIN LATERAL (
           SELECT ms.email
           FROM merchant_staff ms
           WHERE ms.merchant_id = m.id
           ORDER BY
             (ms.role = 'OWNER') DESC,
             (ms.status = 'ACTIVE') DESC,
             ms.created_at ASC
           LIMIT 1
         ) owner ON true`
      : "";

    const phoneSelect = hasPhoneNumbers
      ? "phone.whatsapp_number AS whatsapp_number,"
      : "NULL::text AS whatsapp_number,";
    const phoneJoin = hasPhoneNumbers
      ? `LEFT JOIN LATERAL (
           SELECT mp.whatsapp_number
           FROM merchant_phone_numbers mp
           WHERE mp.merchant_id = m.id
             AND COALESCE(mp.is_active, true) = true
           ORDER BY mp.updated_at DESC, mp.created_at DESC
           LIMIT 1
         ) phone ON true`
      : "";

    const result = await this.pool.query(
      `SELECT
         m.id,
         m.name,
         m.plan,
         m.category,
         m.is_active,
         m.daily_token_budget,
         m.enabled_agents,
         m.enabled_features,
         m.plan_limits,
         m.limits,
         m.created_at,
         m.updated_at,
         ${ownerSelect}
         ${phoneSelect}
         COALESCE(tokens.today_tokens, 0) AS tokens_used_today,
         COALESCE(monthly_messages.messages_used_month, 0) AS messages_used_month,
         COALESCE(monthly_ai.ai_replies_used_month, 0) AS ai_replies_used_month
       FROM merchants m
       ${ownerJoin}
       ${phoneJoin}
       LEFT JOIN LATERAL (
         SELECT SUM(tu.tokens_used)::bigint AS today_tokens
         FROM token_usage tu
         WHERE tu.merchant_id = m.id
           AND tu.created_at >= CURRENT_DATE
       ) tokens ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::bigint AS messages_used_month
         FROM messages msg
         WHERE msg.merchant_id = m.id
           AND msg.created_at >= date_trunc('month', NOW())
       ) monthly_messages ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::bigint AS ai_replies_used_month
         FROM messages msg
         WHERE msg.merchant_id = m.id
           AND msg.created_at >= date_trunc('month', NOW())
           AND msg.direction = 'outbound'
           AND COALESCE(msg.llm_used, false) = true
       ) monthly_ai ON true
       WHERE m.id = $1
       LIMIT 1`,
      [merchantId],
    );

    if (!result.rows[0]) {
      return { success: false, error: "Merchant not found" };
    }

    return this.mapMerchantEntitlementsRow(result.rows[0]);
  }

  @Get("merchants/:merchantId")
  @ApiOperation({
    summary: "Get merchant details",
    description: "Get detailed information about a specific merchant",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({ status: 200, description: "Merchant details retrieved" })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async getMerchantDetails(
    @Param("merchantId") merchantId: string,
  ): Promise<any> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const usageResult = await this.pool.query(
      `
      SELECT 
        COALESCE(SUM(tokens_used) FILTER (WHERE created_at >= CURRENT_DATE), 0) as today,
        COALESCE(SUM(tokens_used) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) as week,
        COALESCE(SUM(tokens_used) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) as month
      FROM token_usage
      WHERE merchant_id = $1
    `,
      [merchantId],
    );

    const agentsResult = await this.pool.query(
      `SELECT plan, enabled_agents, enabled_features, plan_limits
       FROM merchants WHERE id = $1`,
      [merchantId],
    );

    const usage = usageResult.rows[0];
    const enabledAgents =
      agentsResult.rows[0]?.enabled_agents ||
      this.getFallbackEnabledAgents(agentsResult.rows[0]?.plan);
    const cashierProvisioning = resolveCashierProvisioning({
      planCode: agentsResult.rows[0]?.plan,
      enabledFeatures: toStringArray(agentsResult.rows[0]?.enabled_features),
      limits: agentsResult.rows[0]?.plan_limits || {},
      existingFeatures: toStringArray(agentsResult.rows[0]?.enabled_features),
      existingLimits: agentsResult.rows[0]?.plan_limits || {},
    });

    return {
      id: merchant.id,
      name: merchant.name,
      category: merchant.category,
      isActive: merchant.isActive,
      dailyTokenBudget: merchant.dailyTokenBudget,
      enabledAgents,
      cashierPromoActive: cashierProvisioning.promo.active,
      cashierPromoEndsAt: cashierProvisioning.promo.endsAt,
      cashierEffective: cashierProvisioning.promo.effective,
      config: merchant.config,
      tokenUsage: {
        today: parseInt(usage.today, 10),
        week: parseInt(usage.week, 10),
        month: parseInt(usage.month, 10),
        budgetRemaining: merchant.dailyTokenBudget - parseInt(usage.today, 10),
      },
      negotiationRules: merchant.negotiationRules,
      deliveryRules: merchant.deliveryRules,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }

  @Put("merchants/:merchantId/budget")
  @ApiOperation({
    summary: "Update merchant token budget",
    description: "Update the daily token budget limit for a merchant",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiBody({ type: UpdateBudgetDto })
  @ApiResponse({ status: 200, description: "Budget updated successfully" })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async updateMerchantBudget(
    @Param("merchantId") merchantId: string,
    @Body() dto: UpdateBudgetDto,
  ): Promise<any> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const oldBudget = merchant.dailyTokenBudget;

    await this.pool.query(
      `UPDATE merchants 
       SET daily_token_budget = $1, updated_at = NOW() 
       WHERE id = $2`,
      [dto.dailyTokenBudget, merchantId],
    );

    this.logger.log({
      msg: "Merchant budget updated",
      merchantId,
      oldBudget,
      newBudget: dto.dailyTokenBudget,
    });

    return {
      success: true,
      merchantId,
      previousBudget: oldBudget,
      newBudget: dto.dailyTokenBudget,
    };
  }

  @Put("merchants/:merchantId/agents")
  @ApiOperation({
    summary: "Update merchant enabled agents",
    description:
      "Configure which agents are enabled for a merchant subscription",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiBody({ type: UpdateEnabledAgentsDto })
  @ApiResponse({
    status: 200,
    description: "Enabled agents updated successfully",
  })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async updateMerchantAgents(
    @Param("merchantId") merchantId: string,
    @Body() dto: UpdateEnabledAgentsDto,
  ): Promise<any> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const validAgentTypes = this.getValidAgentTypes();
    const invalidAgents = dto.enabledAgents.filter(
      (a) => !validAgentTypes.includes(a),
    );
    if (invalidAgents.length > 0) {
      return {
        success: false,
        error: `Invalid agent types: ${invalidAgents.join(", ")}`,
        validTypes: validAgentTypes,
      };
    }

    const prevResult = await this.pool.query(
      `SELECT plan, enabled_agents
       FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const previousAgents =
      prevResult.rows[0]?.enabled_agents ||
      this.getFallbackEnabledAgents(prevResult.rows[0]?.plan);

    await this.pool.query(
      `UPDATE merchants 
       SET enabled_agents = $1, updated_at = NOW() 
       WHERE id = $2`,
      [dto.enabledAgents, merchantId],
    );

    try {
      await this.pool.query(
        `INSERT INTO agent_subscription_audit 
         (merchant_id, previous_agents, new_agents, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [merchantId, previousAgents, dto.enabledAgents, "admin"],
      );
    } catch (e) {
      // Audit table may not exist yet, ignore
    }

    this.logger.log({
      msg: "Merchant enabled agents updated",
      merchantId,
      previousAgents,
      newAgents: dto.enabledAgents,
    });

    return {
      success: true,
      merchantId,
      previousAgents,
      enabledAgents: dto.enabledAgents,
    };
  }

  @Put("merchants/:merchantId/plan")
  @ApiOperation({
    summary: "Update merchant plan and entitlements",
    description:
      "Set merchant plan (Starter/Growth/Pro/Enterprise/Custom) with entitlements and limits",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiBody({ type: UpdateMerchantPlanDto })
  @ApiResponse({ status: 200, description: "Plan updated successfully" })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async updateMerchantPlan(
    @Param("merchantId") merchantId: string,
    @Body() dto: UpdateMerchantPlanDto,
  ): Promise<any> {
    return this.applyPlanEntitlements(
      merchantId,
      dto,
      `Plan changed to ${dto.plan}`,
    );
  }

  @Put("merchants/:merchantId/entitlements")
  @ApiOperation({
    summary: "Update merchant entitlements (custom packages)",
    description:
      "Update agent + feature entitlements with dependency resolution",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiBody({ type: UpdateMerchantPlanDto })
  async updateMerchantEntitlements(
    @Param("merchantId") merchantId: string,
    @Body() dto: UpdateMerchantPlanDto,
  ): Promise<any> {
    const normalized = { ...dto, plan: dto.plan || "CUSTOM" };
    return this.applyPlanEntitlements(
      merchantId,
      normalized,
      "Entitlements updated (custom package)",
    );
  }

  @Get("plans")
  @ApiOperation({
    summary: "Get available plans",
    description:
      "Returns all available plans with their entitlements and pricing",
  })
  @ApiResponse({ status: 200, description: "Plans retrieved successfully" })
  async getAvailablePlans(): Promise<any> {
    return {
      plans: Object.entries(PLAN_ENTITLEMENTS).map(([key, value]) => ({
        id: key,
        name: key,
        enabledAgents: value.enabledAgents,
        enabledFeatures: value.enabledFeatures,
        limits: value.limits,
        price: value.price,
        currency: value.currency || "EGP",
      })),
    };
  }

  @Post("seed")
  @ApiOperation({
    summary: "Seed demo data",
    description: "Create demo merchant and catalog data for testing",
  })
  @ApiResponse({ status: 200, description: "Demo data seeded" })
  async seedDemoData(): Promise<any> {
    this.logger.log({ msg: "Seeding demo data" });

    const merchantId = "demo-merchant";
    const existingMerchant = await this.merchantRepo.findById(merchantId);

    if (!existingMerchant) {
      await this.merchantRepo.create({
        id: merchantId,
        name: "متجر تجريبي",
        category: MerchantCategory.CLOTHES,
        dailyTokenBudget: 100000,
        config: {
          brandName: "متجر تجريبي",
          tone: "friendly",
          currency: "EGP",
          language: "ar-EG",
          enableNegotiation: true,
          followupEnabled: true,
        },
        branding: {},
        negotiationRules: {
          maxDiscountPercent: 10,
          minMarginPercent: 20,
          allowNegotiation: true,
          freeDeliveryThreshold: 500,
          activePromotion: {
            enabled: true,
            discountPercent: 10,
            description: "خصم 10% على كل المنتجات - عرض الأسبوع",
          },
        },
        deliveryRules: {
          defaultFee: 30,
          freeDeliveryThreshold: 500,
        },
      });
    }

    await this.seedCatalogItems(merchantId);

    return {
      success: true,
      merchantId,
      message: "Demo data seeded successfully",
    };
  }

  @Post("promotion/:merchantId")
  @ApiOperation({
    summary: "Toggle active promotion for a merchant",
    description: "Enable or disable the active promotion for a merchant",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({ status: 200, description: "Promotion toggled successfully" })
  async togglePromotion(
    @Param("merchantId") merchantId: string,
    @Body()
    body: { enabled: boolean; discountPercent?: number; description?: string },
  ): Promise<any> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const updatedRules = {
      ...merchant.negotiationRules,
      activePromotion: {
        enabled: body.enabled,
        discountPercent:
          body.discountPercent ||
          merchant.negotiationRules.activePromotion?.discountPercent ||
          10,
        description:
          body.description ||
          merchant.negotiationRules.activePromotion?.description ||
          "عرض خاص",
      },
    };

    await this.pool.query(
      `UPDATE merchants SET negotiation_rules = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedRules), merchantId],
    );

    return {
      success: true,
      activePromotion: updatedRules.activePromotion,
      message: body.enabled ? "العرض مفعّل" : "العرض متوقف",
    };
  }
}
