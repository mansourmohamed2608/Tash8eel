import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  AgentType,
  FeatureType,
  AGENT_DEPENDENCIES,
  FEATURE_DEPENDENCIES,
  getAgentDisplayName,
  getFeatureDisplayName,
} from "../entitlements";

// ============= Metadata Keys =============
export const REQUIRES_AGENT_KEY = "requiresAgent";
export const REQUIRES_FEATURE_KEY = "requiresFeature";

// ============= Decorators =============

/**
 * Decorator to require a specific agent to be enabled for the merchant
 *
 * Usage:
 * @RequiresAgent('INVENTORY_AGENT')
 * @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
 * async myMethod(@MerchantId() merchantId: string) { ... }
 */
export const RequiresAgent = (agent: AgentType) =>
  SetMetadata(REQUIRES_AGENT_KEY, agent);

/**
 * Decorator to require a specific feature to be enabled for the merchant
 *
 * Usage:
 * @RequiresFeature('VISION_OCR')
 * @UseGuards(MerchantApiKeyGuard, EntitlementGuard)
 * async myMethod(@MerchantId() merchantId: string) { ... }
 */
export const RequiresFeature = (feature: FeatureType) =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);

// ============= Guard =============

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const merchantId = request.merchantId;

    if (!merchantId) {
      throw new ForbiddenException(
        "Merchant ID not found. Ensure MerchantApiKeyGuard runs first.",
      );
    }

    // Get required agent/feature from metadata
    const requiredAgent = this.reflector.getAllAndOverride<AgentType>(
      REQUIRES_AGENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredFeature = this.reflector.getAllAndOverride<FeatureType>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no requirements, allow access
    if (!requiredAgent && !requiredFeature) {
      return true;
    }

    // Fetch merchant entitlements from database
    const result = await this.pool.query<{
      enabled_agents: string[];
      enabled_features: string[];
    }>(
      `SELECT enabled_agents, enabled_features FROM merchants WHERE id = $1 AND is_active = true`,
      [merchantId],
    );

    if (result.rows.length === 0) {
      throw new ForbiddenException("Merchant not found or inactive.");
    }

    const { enabled_agents, enabled_features } = result.rows[0];

    // Default arrays if null, cast to proper types
    const agents = (enabled_agents || ["OPS_AGENT"]) as AgentType[];
    const features = (enabled_features || [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
    ]) as FeatureType[];

    // Check agent requirement
    if (requiredAgent && !agents.includes(requiredAgent)) {
      const deps = AGENT_DEPENDENCIES[requiredAgent] || [];
      throw new ForbiddenException({
        error: "AGENT_NOT_ENABLED",
        message: `Your subscription does not include the ${getAgentDisplayName(requiredAgent)}. Please upgrade to access this feature.`,
        requiredAgent,
        currentAgents: agents,
        dependencies: deps,
        upgradeUrl: "/merchant/settings#upgrade",
      });
    }

    // Check feature requirement
    if (requiredFeature && !features.includes(requiredFeature)) {
      const deps = FEATURE_DEPENDENCIES[requiredFeature] || [];
      throw new ForbiddenException({
        error: "FEATURE_NOT_ENABLED",
        message: `Your subscription does not include ${getFeatureDisplayName(requiredFeature)}. Please upgrade to access this feature.`,
        requiredFeature,
        currentFeatures: features,
        dependencies: deps,
        upgradeUrl: "/merchant/settings#upgrade",
      });
    }

    // Store entitlements on request for downstream use
    request.merchantEntitlements = {
      enabledAgents: agents,
      enabledFeatures: features,
    };

    return true;
  }
}
