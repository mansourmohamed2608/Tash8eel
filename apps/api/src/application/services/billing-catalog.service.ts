import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

type RegionCode = "EG" | "SA" | "AE" | "OM" | "KW";
type CycleMonths = 1 | 3 | 6 | 12;
type AddOnScope = "BYO" | "BUNDLE" | "BOTH";
type AddOnType = "CORE" | "FEATURE" | "CAPACITY";

interface ItemSelection {
  code: string;
  quantity?: number;
}

interface PriceByCycle {
  cycleMonths: number;
  basePriceCents: number;
  discountPercent: number;
  totalPriceCents: number;
  effectiveMonthlyCents: number;
  currency: string;
}

interface CatalogAddOn {
  code: string;
  name: string;
  category: string;
  description: string;
  scope: AddOnScope;
  addonType: AddOnType;
  isCore: boolean;
  isSubscription: boolean;
  featureEnables: string[];
  limitFloorUpdates: Record<string, number>;
  limitIncrements: Record<string, number>;
  prices: PriceByCycle[];
}

interface CatalogUsagePack {
  code: string;
  name: string;
  metricKey: string;
  tierCode: string;
  includedUnits: number | null;
  includedAiCallsPerDay: number | null;
  includedTokenBudgetDaily: number | null;
  limitDeltas: Record<string, number>;
  priceCents: number | null;
  currency: string;
}

export interface BillingCatalogResponse {
  regionCode: RegionCode;
  currency: string;
  byoMarkup: number;
  cycles: Array<{ cycleMonths: number; discountPercent: number }>;
  bundles: any[];
  bundleAddOns: {
    capacityAddOns: CatalogAddOn[];
    usagePacks: CatalogUsagePack[];
  };
  byo: {
    coreAddOn: CatalogAddOn | null;
    featureAddOns: CatalogAddOn[];
    usagePacks: CatalogUsagePack[];
  };
  // Legacy keys kept for compatibility with old clients.
  addOns: CatalogAddOn[];
  usagePacks: CatalogUsagePack[];
}

@Injectable()
export class BillingCatalogService {
  private readonly logger = new Logger(BillingCatalogService.name);
  private readonly BYO_MARKUP = 1.15;
  private readonly CYCLES: CycleMonths[] = [1, 3, 6, 12];
  private readonly CYCLE_DISCOUNTS: Record<number, number> = {
    1: 0,
    3: 5,
    6: 10,
    12: 15,
  };

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getCatalog(regionInput?: string): Promise<BillingCatalogResponse> {
    const regionCode = this.normalizeRegion(regionInput);

    try {
      const bundlesResult = await this.pool.query(
        `SELECT
         p.id,
         p.code,
         p.name,
         p.tier_rank,
         p.description,
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
         COALESCE(
           json_agg(
             json_build_object(
               'cycleMonths', pp.cycle_months,
               'basePriceCents', pp.base_price_cents,
               'discountPercent', pp.discount_percent,
               'totalPriceCents', pp.total_price_cents,
               'effectiveMonthlyCents', pp.effective_monthly_cents,
               'currency', pp.currency
             )
             ORDER BY pp.cycle_months
           ) FILTER (WHERE pp.id IS NOT NULL),
           '[]'::json
         ) as prices
       FROM plans p
       LEFT JOIN plan_limits pl ON pl.plan_id = p.id
       LEFT JOIN plan_prices pp
         ON pp.plan_id = p.id
        AND pp.region_code = $1
        AND pp.cycle_months IN (1,3,6,12)
       WHERE p.is_bundle = true
         AND p.is_active = true
       GROUP BY
         p.id, p.code, p.name, p.tier_rank, p.description,
         pl.messages_per_month, pl.whatsapp_numbers, pl.team_members,
         pl.ai_calls_per_day, pl.token_budget_daily,
         pl.paid_templates_per_month, pl.payment_proof_scans_per_month,
         pl.voice_minutes_per_month, pl.maps_lookups_per_month,
         pl.pos_connections, pl.branches
       ORDER BY p.tier_rank ASC`,
        [regionCode],
      );

      const bundleIds = bundlesResult.rows.map((row) => row.id);
      const entitlementsByPlan = new Map<string, any[]>();
      if (bundleIds.length > 0) {
        const entitlementsResult = await this.pool.query(
          `SELECT plan_id, feature_key, feature_label, feature_tier
         FROM plan_entitlements
         WHERE plan_id = ANY($1::uuid[])
         ORDER BY plan_id, feature_key`,
          [bundleIds],
        );
        for (const row of entitlementsResult.rows) {
          const current = entitlementsByPlan.get(row.plan_id) || [];
          current.push({
            key: row.feature_key,
            label: row.feature_label || row.feature_key,
            tier: row.feature_tier || "CORE",
          });
          entitlementsByPlan.set(row.plan_id, current);
        }
      }

      const addOnsResult = await this.pool.query(
        `SELECT
         a.id,
         a.code,
         a.name,
         a.category,
         a.description,
         a.is_subscription,
         a.scope,
         a.addon_type,
         a.feature_enables,
         a.limit_floor_updates,
         a.limit_increments,
         COALESCE(
           json_agg(
             json_build_object(
               'cycleMonths', ap.cycle_months,
               'basePriceCents', ap.base_price_cents,
               'discountPercent', ap.discount_percent,
               'totalPriceCents', ap.total_price_cents,
               'effectiveMonthlyCents', ap.effective_monthly_cents,
               'currency', ap.currency
             )
             ORDER BY ap.cycle_months
           ) FILTER (WHERE ap.id IS NOT NULL),
           '[]'::json
         ) as prices
       FROM add_ons a
       LEFT JOIN add_on_prices ap
         ON ap.addon_id = a.id
        AND ap.region_code = $1
        AND ap.cycle_months IN (1,3,6,12)
       WHERE a.is_active = true
         AND a.is_subscription = true
       GROUP BY
         a.id, a.code, a.name, a.category, a.description,
         a.is_subscription, a.scope, a.addon_type,
         a.feature_enables, a.limit_floor_updates, a.limit_increments
       ORDER BY
         CASE WHEN a.code = 'PLATFORM_CORE' THEN 0 ELSE 1 END,
         a.name ASC`,
        [regionCode],
      );

      const usagePacksResult = await this.pool.query(
        `SELECT
         up.id,
         up.code,
         up.name,
         up.metric_key,
         up.tier_code,
         up.included_units,
         up.included_ai_calls_per_day,
         up.included_token_budget_daily,
         up.limit_deltas,
         upp.price_cents,
         upp.currency
       FROM usage_packs up
       LEFT JOIN usage_pack_prices upp
         ON upp.usage_pack_id = up.id
        AND upp.region_code = $1
       WHERE up.is_active = true
       ORDER BY
         up.metric_key ASC,
         CASE up.tier_code
           WHEN 'S' THEN 1
           WHEN 'M' THEN 2
           WHEN 'L' THEN 3
           WHEN 'XL' THEN 4
           ELSE 99
         END`,
        [regionCode],
      );

      const currency =
        bundlesResult.rows[0]?.prices?.[0]?.currency ||
        addOnsResult.rows[0]?.prices?.[0]?.currency ||
        usagePacksResult.rows[0]?.currency ||
        this.defaultCurrency(regionCode);

      const addOns = addOnsResult.rows.map((row) => this.mapAddOnRow(row));
      const usagePacks = usagePacksResult.rows.map((row) =>
        this.mapUsagePackRow(row, currency),
      );

      const bundleCapacityAddOns = addOns.filter(
        (addOn) =>
          addOn.addonType === "CAPACITY" &&
          (addOn.scope === "BUNDLE" || addOn.scope === "BOTH"),
      );
      const byoCoreAddOn =
        addOns.find((addOn) => addOn.code === "PLATFORM_CORE") || null;
      const byoFeatureAddOns = addOns.filter(
        (addOn) =>
          addOn.code !== "PLATFORM_CORE" &&
          (addOn.scope === "BYO" || addOn.scope === "BOTH"),
      );

      return {
        regionCode,
        currency,
        byoMarkup: this.BYO_MARKUP,
        cycles: this.CYCLES.map((cycleMonths) => ({
          cycleMonths,
          discountPercent: this.CYCLE_DISCOUNTS[cycleMonths] || 0,
        })),
        bundles: bundlesResult.rows.map((row) => ({
          code: row.code,
          name: row.name,
          tierRank: Number(row.tier_rank || 0),
          description: row.description || "",
          features: entitlementsByPlan.get(row.id) || [],
          limits: {
            messagesPerMonth: Number(row.messages_per_month || 0),
            whatsappNumbers: Number(row.whatsapp_numbers || 0),
            teamMembers: Number(row.team_members || 0),
            aiCallsPerDay: Number(row.ai_calls_per_day || 0),
            tokenBudgetDaily: Number(row.token_budget_daily || 0),
            paidTemplatesPerMonth: Number(row.paid_templates_per_month || 0),
            paymentProofScansPerMonth: Number(
              row.payment_proof_scans_per_month || 0,
            ),
            voiceMinutesPerMonth: Number(row.voice_minutes_per_month || 0),
            mapsLookupsPerMonth: Number(row.maps_lookups_per_month || 0),
            posConnections: Number(row.pos_connections || 0),
            branches: Number(row.branches || 0),
          },
          prices: row.prices || [],
        })),
        bundleAddOns: {
          capacityAddOns: bundleCapacityAddOns,
          usagePacks,
        },
        byo: {
          coreAddOn: byoCoreAddOn,
          featureAddOns: byoFeatureAddOns,
          usagePacks,
        },
        // Legacy compatibility
        addOns,
        usagePacks,
      };
    } catch (error) {
      if (this.isMissingRelationError(error)) {
        this.logger.error(
          "Billing schema tables are missing. Run API SQL migrations before calling billing catalog endpoints.",
        );
        throw new ServiceUnavailableException(
          "Billing schema is not initialized. Run database migrations.",
        );
      }
      throw error;
    }
  }

  async calculateByo(input: {
    regionCode?: string;
    cycleMonths?: number;
    addOns?: ItemSelection[];
    usagePacks?: ItemSelection[];
  }): Promise<any> {
    const regionCode = this.normalizeRegion(input.regionCode);
    const cycleMonths = this.normalizeCycle(input.cycleMonths);

    const normalizedAddOns = this.normalizeSelections(input.addOns || []);
    const normalizedUsagePacks = this.normalizeSelections(input.usagePacks || []);

    if (!normalizedAddOns.find((item) => item.code === "PLATFORM_CORE")) {
      normalizedAddOns.unshift({ code: "PLATFORM_CORE", quantity: 1 });
    }

    const addOnCodes = normalizedAddOns.map((item) => item.code);
    const usagePackCodes = normalizedUsagePacks.map((item) => item.code);
    const addOnQtyByCode = new Map(
      normalizedAddOns.map((item) => [item.code, item.quantity]),
    );
    const usageQtyByCode = new Map(
      normalizedUsagePacks.map((item) => [item.code, item.quantity]),
    );

    try {
      const addOnPricesResult = await this.pool.query(
        `SELECT
         a.code,
         a.name,
         a.scope,
         a.addon_type,
         ap.currency,
         ap.cycle_months,
         ap.base_price_cents,
         ap.discount_percent,
         ap.total_price_cents,
         ap.effective_monthly_cents
       FROM add_ons a
       JOIN add_on_prices ap ON ap.addon_id = a.id
       WHERE a.code = ANY($1::text[])
         AND a.is_active = true
         AND a.is_subscription = true
         AND a.scope IN ('BYO', 'BOTH')
         AND ap.region_code = $2
         AND ap.cycle_months = $3`,
        [addOnCodes, regionCode, cycleMonths],
      );

      const usagePackPricesResult = usagePackCodes.length
        ? await this.pool.query(
            `SELECT
             up.code,
             up.name,
             up.metric_key,
             upp.currency,
             upp.price_cents
           FROM usage_packs up
           JOIN usage_pack_prices upp ON upp.usage_pack_id = up.id
           WHERE up.code = ANY($1::text[])
             AND up.is_active = true
             AND upp.region_code = $2`,
            [usagePackCodes, regionCode],
          )
        : { rows: [] as any[] };

      const fetchedAddOnCodes = new Set(
        addOnPricesResult.rows.map((row) => String(row.code)),
      );
      const missingAddOns = addOnCodes.filter((code) => !fetchedAddOnCodes.has(code));
      if (missingAddOns.length > 0) {
        throw new BadRequestException(
          `Unknown/unavailable BYO add-ons for ${regionCode}: ${missingAddOns.join(", ")}`,
        );
      }

      const fetchedUsageCodes = new Set(
        usagePackPricesResult.rows.map((row) => String(row.code)),
      );
      const missingUsagePacks = usagePackCodes.filter(
        (code) => !fetchedUsageCodes.has(code),
      );
      if (missingUsagePacks.length > 0) {
        throw new BadRequestException(
          `Unknown usage packs for ${regionCode}: ${missingUsagePacks.join(", ")}`,
        );
      }

      const addOnBreakdown = addOnPricesResult.rows.map((row) => {
        const quantity = Number(addOnQtyByCode.get(row.code) || 1);
        const baseCycle = Number(row.base_price_cents || 0) * cycleMonths * quantity;
        const discountedCycle = Number(row.total_price_cents || 0) * quantity;
        const effectiveMonthly = Number(row.effective_monthly_cents || 0) * quantity;
        return {
          code: row.code,
          name: row.name,
          scope: row.scope,
          addonType: row.addon_type,
          quantity,
          cycleMonths,
          baseCycleCents: baseCycle,
          cycleTotalCents: discountedCycle,
          effectiveMonthlyCents: effectiveMonthly,
          discountPercent: Number(row.discount_percent || 0),
          discountSavingsCents: Math.max(0, baseCycle - discountedCycle),
        };
      });

      const usagePackBreakdown = usagePackPricesResult.rows.map((row) => {
        const quantity = Number(usageQtyByCode.get(row.code) || 1);
        const monthly = Number(row.price_cents || 0) * quantity;
        return {
          code: row.code,
          name: row.name,
          metricKey: row.metric_key,
          quantity,
          monthlyPriceCents: monthly,
          cycleTotalCents: monthly * cycleMonths,
        };
      });

      const coreAndAddOnsEffectiveMonthlyCents = addOnBreakdown.reduce(
        (sum, row) => sum + row.effectiveMonthlyCents,
        0,
      );
      const coreAndAddOnsCycleTotalCents = addOnBreakdown.reduce(
        (sum, row) => sum + row.cycleTotalCents,
        0,
      );
      const usagePacksMonthlyCents = usagePackBreakdown.reduce(
        (sum, row) => sum + row.monthlyPriceCents,
        0,
      );
      const usagePacksCycleTotalCents = usagePackBreakdown.reduce(
        (sum, row) => sum + row.cycleTotalCents,
        0,
      );

      const preMarkupMonthlyCents =
        coreAndAddOnsEffectiveMonthlyCents + usagePacksMonthlyCents;
      const preMarkupCycleTotalCents =
        coreAndAddOnsCycleTotalCents + usagePacksCycleTotalCents;

      let byoEffectiveMonthlyCents = Math.round(
        preMarkupMonthlyCents * this.BYO_MARKUP,
      );
      let byoCycleTotalCents = Math.round(
        preMarkupCycleTotalCents * this.BYO_MARKUP,
      );

      const selectedAddOnSet = new Set(addOnCodes);
      const matchedBundleCode = this.resolveMatchedBundleCode(selectedAddOnSet);
      let floorApplied = false;
      let floorBundle: any = null;

      if (matchedBundleCode) {
        const bundlePriceResult = await this.pool.query(
          `SELECT
           p.code,
           p.name,
           pp.total_price_cents,
           pp.effective_monthly_cents,
           pp.currency
         FROM plans p
         JOIN plan_prices pp ON pp.plan_id = p.id
         WHERE p.code = $1
           AND pp.region_code = $2
           AND pp.cycle_months = $3
         LIMIT 1`,
          [matchedBundleCode, regionCode, cycleMonths],
        );
        if (bundlePriceResult.rows[0]) {
          const bundleRow = bundlePriceResult.rows[0];
          const floorMonthly = Math.round(
            Number(bundleRow.effective_monthly_cents || 0) * this.BYO_MARKUP,
          );
          const floorCycle = Math.round(
            Number(bundleRow.total_price_cents || 0) * this.BYO_MARKUP,
          );
          if (
            byoEffectiveMonthlyCents < floorMonthly ||
            byoCycleTotalCents < floorCycle
          ) {
            floorApplied = true;
            byoEffectiveMonthlyCents = Math.max(
              byoEffectiveMonthlyCents,
              floorMonthly,
            );
            byoCycleTotalCents = Math.max(byoCycleTotalCents, floorCycle);
          }
          floorBundle = {
            code: bundleRow.code,
            name: bundleRow.name,
            effectiveMonthlyCents: Number(bundleRow.effective_monthly_cents || 0),
            totalCycleCents: Number(bundleRow.total_price_cents || 0),
            floorEffectiveMonthlyCents: floorMonthly,
            floorCycleTotalCents: floorCycle,
          };
        }
      }

      const bundlesComparisonResult = await this.pool.query(
        `SELECT
         p.code,
         p.name,
         pp.effective_monthly_cents,
         pp.total_price_cents,
         pp.currency
       FROM plans p
       JOIN plan_prices pp ON pp.plan_id = p.id
       WHERE p.is_bundle = true
         AND p.is_active = true
         AND pp.region_code = $1
         AND pp.cycle_months = $2
       ORDER BY p.tier_rank ASC`,
        [regionCode, cycleMonths],
      );

      const bundleComparison = bundlesComparisonResult.rows.map((row) => {
        const bundleMonthly = Number(row.effective_monthly_cents || 0);
        const savesAmount = Math.max(0, byoEffectiveMonthlyCents - bundleMonthly);
        const savesPercent =
          byoEffectiveMonthlyCents > 0
            ? Math.max(0, (savesAmount / byoEffectiveMonthlyCents) * 100)
            : 0;
        return {
          code: row.code,
          name: row.name,
          effectiveMonthlyCents: bundleMonthly,
          totalCycleCents: Number(row.total_price_cents || 0),
          savesAmountCents: Math.round(savesAmount),
          savesPercent: Math.round(savesPercent * 10) / 10,
          currency: row.currency,
        };
      });

      const recommendedBundle = bundleComparison.reduce((best, current) => {
        if (!best) return current;
        return current.savesAmountCents > best.savesAmountCents ? current : best;
      }, null as any);

      return {
        regionCode,
        cycleMonths,
        byoMarkup: this.BYO_MARKUP,
        currency:
          addOnPricesResult.rows[0]?.currency ||
          usagePackPricesResult.rows[0]?.currency ||
          this.defaultCurrency(regionCode),
        breakdown: {
          coreAndAddOns: addOnBreakdown,
          usagePacks: usagePackBreakdown,
        },
        subtotals: {
          coreAndAddOnsEffectiveMonthlyCents,
          usagePacksMonthlyCents,
          preMarkupEffectiveMonthlyCents: preMarkupMonthlyCents,
          preMarkupCycleTotalCents,
        },
        totals: {
          effectiveMonthlyCents: byoEffectiveMonthlyCents,
          cycleTotalCents: byoCycleTotalCents,
        },
        floor: {
          applied: floorApplied,
          matchedBundleCode,
          bundle: floorBundle,
        },
        bundleComparison,
        recommendedBundle,
      };
    } catch (error) {
      if (this.isMissingRelationError(error)) {
        this.logger.error(
          "Billing schema tables are missing. Run API SQL migrations before BYO pricing calculation.",
        );
        throw new ServiceUnavailableException(
          "Billing schema is not initialized. Run database migrations.",
        );
      }
      throw error;
    }
  }

  private mapAddOnRow(row: any): CatalogAddOn {
    return {
      code: String(row.code),
      name: String(row.name || row.code),
      category: String(row.category || "FEATURE"),
      description: String(row.description || ""),
      scope: this.normalizeScope(row.scope),
      addonType: this.normalizeAddonType(row.addon_type),
      isCore: String(row.code).toUpperCase() === "PLATFORM_CORE",
      isSubscription: row.is_subscription !== false,
      featureEnables: this.toStringArray(row.feature_enables),
      limitFloorUpdates: this.toNumberRecord(row.limit_floor_updates),
      limitIncrements: this.toNumberRecord(row.limit_increments),
      prices: Array.isArray(row.prices) ? (row.prices as PriceByCycle[]) : [],
    };
  }

  private mapUsagePackRow(row: any, fallbackCurrency: string): CatalogUsagePack {
    return {
      code: String(row.code),
      name: String(row.name || row.code),
      metricKey: String(row.metric_key || "OTHER"),
      tierCode: String(row.tier_code || "S"),
      includedUnits:
        row.included_units === null ? null : Number(row.included_units || 0),
      includedAiCallsPerDay:
        row.included_ai_calls_per_day === null
          ? null
          : Number(row.included_ai_calls_per_day || 0),
      includedTokenBudgetDaily:
        row.included_token_budget_daily === null
          ? null
          : Number(row.included_token_budget_daily || 0),
      limitDeltas: this.toNumberRecord(row.limit_deltas),
      priceCents: row.price_cents === null ? null : Number(row.price_cents || 0),
      currency: row.currency || fallbackCurrency,
    };
  }

  private normalizeScope(raw: unknown): AddOnScope {
    const value = String(raw || "BYO").toUpperCase();
    if (value === "BUNDLE" || value === "BOTH") return value;
    return "BYO";
  }

  private normalizeAddonType(raw: unknown): AddOnType {
    const value = String(raw || "FEATURE").toUpperCase();
    if (value === "CORE" || value === "CAPACITY") return value;
    return "FEATURE";
  }

  private toNumberRecord(raw: unknown): Record<string, number> {
    if (!raw || typeof raw !== "object") return {};
    const input = raw as Record<string, unknown>;
    const output: Record<string, number> = {};
    for (const [key, value] of Object.entries(input)) {
      const n = Number(value);
      if (Number.isFinite(n)) {
        output[key] = n;
      }
    }
    return output;
  }

  private toStringArray(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item));
    }
    if (typeof raw === "string" && raw.trim()) {
      return [raw.trim()];
    }
    return [];
  }

  private normalizeRegion(input?: string): RegionCode {
    const region = String(input || "EG")
      .trim()
      .toUpperCase();
    if (
      region === "EG" ||
      region === "SA" ||
      region === "AE" ||
      region === "OM" ||
      region === "KW"
    ) {
      return region as RegionCode;
    }
    throw new BadRequestException(
      `Unsupported region "${input}". Allowed: EG, SA, AE, OM, KW.`,
    );
  }

  private normalizeCycle(input?: number): CycleMonths {
    const cycle = Number(input || 1);
    if (cycle === 1 || cycle === 3 || cycle === 6 || cycle === 12) {
      return cycle as CycleMonths;
    }
    throw new BadRequestException("cycleMonths must be one of: 1, 3, 6, 12");
  }

  private normalizeSelections(items: ItemSelection[]): Array<{
    code: string;
    quantity: number;
  }> {
    const merged = new Map<string, number>();
    for (const item of items || []) {
      const code = String(item?.code || "")
        .trim()
        .toUpperCase();
      if (!code) continue;
      const quantityRaw = Number(item?.quantity || 1);
      const quantity = Number.isFinite(quantityRaw)
        ? Math.max(1, Math.floor(quantityRaw))
        : 1;
      merged.set(code, (merged.get(code) || 0) + quantity);
    }
    return Array.from(merged.entries()).map(([code, quantity]) => ({
      code,
      quantity,
    }));
  }

  private resolveMatchedBundleCode(selectedAddOns: Set<string>): string | null {
    const has = (code: string) => selectedAddOns.has(code);
    const starterMatch = has("PLATFORM_CORE");
    const basicMatch =
      starterMatch &&
      (has("PAYMENT_LINKS") || has("PAYMENTS")) &&
      (has("DAILY_REPORTS") || has("FINANCE_BASIC")) &&
      (has("API_WEBHOOKS") || has("POS_BASIC") || has("POS_ADV"));
    const growthMatch =
      basicMatch &&
      (has("FOLLOWUP_AUTOMATIONS") || has("AUTOMATIONS")) &&
      (has("WHATSAPP_BROADCASTS") || has("PROACTIVE_ALERTS")) &&
      (has("TEAM_SEAT_EXPANSION") || has("TEAM_UP_TO_3"));
    const proMatch =
      growthMatch &&
      (has("INVENTORY_INSIGHTS") || has("INVENTORY_BASIC")) &&
      has("KPI_DASHBOARD") &&
      has("AUDIT_LOGS");
    const enterpriseMatch =
      proMatch &&
      has("AUTONOMOUS_AGENT") &&
      (has("MULTI_BRANCH") || has("MULTI_BRANCH_PER_1"));

    if (enterpriseMatch) return "ENTERPRISE";
    if (proMatch) return "PRO";
    if (growthMatch) return "GROWTH";
    if (basicMatch) return "BASIC";
    if (starterMatch) return "STARTER";
    return null;
  }

  private isMissingRelationError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const code = (error as { code?: unknown }).code;
    return code === "42P01";
  }

  private defaultCurrency(region: RegionCode): string {
    switch (region) {
      case "EG":
        return "EGP";
      case "SA":
        return "SAR";
      case "AE":
        return "AED";
      case "OM":
        return "OMR";
      case "KW":
        return "KWD";
      default:
        return "EGP";
    }
  }
}
