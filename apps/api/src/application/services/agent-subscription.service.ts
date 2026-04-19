import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import { AGENT_CATALOG, AgentType } from "../../shared/entitlements";

// Re-export for backward compatibility
export { AgentType };

export interface AgentSubscription {
  merchantId: string;
  agentType: AgentType;
  isEnabled: boolean;
  config: Record<string, unknown>;
  enabledAt?: Date;
  disabledAt?: Date;
}

export interface AgentConfig {
  OPS_AGENT: {
    enableNegotiation: boolean;
    enableFollowups: boolean;
    enableDeliveryTracking: boolean;
    enableReports: boolean;
  };
  INVENTORY_AGENT: {
    lowStockThreshold: number;
    autoReorderEnabled: boolean;
    alertPhoneNumber?: string;
  };
  FINANCE_AGENT: {
    dailyProfitReports: boolean;
    spendingAlerts: boolean;
    spendingAlertThreshold: number;
  };
  MARKETING_AGENT: {
    autoPromotions: boolean;
    customerSegmentation: boolean;
    abandonedCartFollowup: boolean;
  };
  SUPPORT_AGENT: {
    autoEscalation: boolean;
    faqEnabled: boolean;
  };
  CONTENT_AGENT: {
    autoTranslation: boolean;
    descriptionGeneration: boolean;
  };
  SALES_AGENT: {
    leadScoring: boolean;
    pipelineTracking: boolean;
  };
  CREATIVE_AGENT: {
    imageGeneration: boolean;
    templateDesign: boolean;
  };
}

const DEFAULT_AGENT_CONFIG: Record<AgentType, Record<string, unknown>> = {
  OPS_AGENT: {
    enableNegotiation: true,
    enableFollowups: true,
    enableDeliveryTracking: true,
    enableReports: true,
  },
  INVENTORY_AGENT: {
    lowStockThreshold: 10,
    autoReorderEnabled: false,
  },
  FINANCE_AGENT: {
    dailyProfitReports: true,
    spendingAlerts: true,
    spendingAlertThreshold: 80,
  },
  MARKETING_AGENT: {
    autoPromotions: false,
    customerSegmentation: false,
    abandonedCartFollowup: true,
  },
  SUPPORT_AGENT: {
    autoEscalation: true,
    faqEnabled: true,
  },
  CONTENT_AGENT: {
    autoTranslation: false,
    descriptionGeneration: true,
  },
  SALES_AGENT: {
    leadScoring: false,
    pipelineTracking: false,
  },
  CREATIVE_AGENT: {
    imageGeneration: false,
    templateDesign: false,
  },
};

@Injectable()
export class AgentSubscriptionService {
  private readonly logger = new Logger(AgentSubscriptionService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Get all agent subscriptions for a merchant
   */
  async getMerchantSubscriptions(
    merchantId: string,
  ): Promise<AgentSubscription[]> {
    const result = await this.pool.query<{
      merchant_id: string;
      agent_type: AgentType;
      is_enabled: boolean;
      config: Record<string, unknown>;
      enabled_at: Date | null;
      disabled_at: Date | null;
    }>(
      `SELECT merchant_id, agent_type, is_enabled, config, enabled_at, disabled_at
       FROM merchant_agent_subscriptions
       WHERE merchant_id = $1
       ORDER BY agent_type`,
      [merchantId],
    );

    // Return existing subscriptions merged with defaults for missing agents
    const existingMap = new Map(result.rows.map((r) => [r.agent_type, r]));
    const allAgentTypes = AGENT_CATALOG.map((agent) => agent.id);

    return allAgentTypes.map((agentType) => {
      const existing = existingMap.get(agentType);
      if (existing) {
        return {
          merchantId: existing.merchant_id,
          agentType: existing.agent_type,
          isEnabled: existing.is_enabled,
          config: existing.config,
          enabledAt: existing.enabled_at || undefined,
          disabledAt: existing.disabled_at || undefined,
        };
      }
      // Return default (not subscribed)
      return {
        merchantId,
        agentType,
        isEnabled: agentType === "OPS_AGENT", // OPS agent enabled by default
        config: DEFAULT_AGENT_CONFIG[agentType],
      };
    });
  }

  /**
   * Subscribe a merchant to an agent
   */
  async subscribeToAgent(
    merchantId: string,
    agentType: AgentType,
    config?: Record<string, unknown>,
  ): Promise<AgentSubscription> {
    const mergedConfig = {
      ...DEFAULT_AGENT_CONFIG[agentType],
      ...(config || {}),
    };

    const result = await this.pool.query<{
      merchant_id: string;
      agent_type: AgentType;
      is_enabled: boolean;
      config: Record<string, unknown>;
      enabled_at: Date;
    }>(
      `INSERT INTO merchant_agent_subscriptions (merchant_id, agent_type, is_enabled, config, enabled_at)
       VALUES ($1, $2, true, $3, NOW())
       ON CONFLICT (merchant_id, agent_type) 
       DO UPDATE SET 
         is_enabled = true, 
         config = COALESCE($3, merchant_agent_subscriptions.config),
         enabled_at = NOW(),
         disabled_at = NULL,
         updated_at = NOW()
       RETURNING merchant_id, agent_type, is_enabled, config, enabled_at`,
      [merchantId, agentType, JSON.stringify(mergedConfig)],
    );

    const subscription = result.rows[0];

    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.AGENT_SUBSCRIBED,
      aggregateType: "Merchant",
      aggregateId: merchantId,
      merchantId,
      payload: {
        merchantId,
        agentType,
        config: mergedConfig,
      },
    });

    this.logger.log({
      msg: "Merchant subscribed to agent",
      merchantId,
      agentType,
    });

    return {
      merchantId: subscription.merchant_id,
      agentType: subscription.agent_type,
      isEnabled: subscription.is_enabled,
      config: subscription.config,
      enabledAt: subscription.enabled_at,
    };
  }

  /**
   * Unsubscribe a merchant from an agent
   */
  async unsubscribeFromAgent(
    merchantId: string,
    agentType: AgentType,
  ): Promise<AgentSubscription | null> {
    // Don't allow disabling OPS agent
    if (agentType === "OPS_AGENT") {
      throw new Error("Cannot unsubscribe from OPS agent - it is required");
    }

    const result = await this.pool.query<{
      merchant_id: string;
      agent_type: AgentType;
      is_enabled: boolean;
      config: Record<string, unknown>;
      disabled_at: Date;
    }>(
      `UPDATE merchant_agent_subscriptions 
       SET is_enabled = false, disabled_at = NOW(), updated_at = NOW()
       WHERE merchant_id = $1 AND agent_type = $2
       RETURNING merchant_id, agent_type, is_enabled, config, disabled_at`,
      [merchantId, agentType],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const subscription = result.rows[0];

    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.AGENT_UNSUBSCRIBED,
      aggregateType: "Merchant",
      aggregateId: merchantId,
      merchantId,
      payload: {
        merchantId,
        agentType,
      },
    });

    this.logger.log({
      msg: "Merchant unsubscribed from agent",
      merchantId,
      agentType,
    });

    return {
      merchantId: subscription.merchant_id,
      agentType: subscription.agent_type,
      isEnabled: subscription.is_enabled,
      config: subscription.config,
      disabledAt: subscription.disabled_at,
    };
  }

  /**
   * Update agent config for a merchant
   */
  async updateAgentConfig(
    merchantId: string,
    agentType: AgentType,
    config: Record<string, unknown>,
  ): Promise<AgentSubscription | null> {
    const result = await this.pool.query<{
      merchant_id: string;
      agent_type: AgentType;
      is_enabled: boolean;
      config: Record<string, unknown>;
      enabled_at: Date;
    }>(
      `UPDATE merchant_agent_subscriptions 
       SET config = config || $3::jsonb, updated_at = NOW()
       WHERE merchant_id = $1 AND agent_type = $2
       RETURNING merchant_id, agent_type, is_enabled, config, enabled_at`,
      [merchantId, agentType, JSON.stringify(config)],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const subscription = result.rows[0];

    this.logger.log({
      msg: "Agent config updated",
      merchantId,
      agentType,
      config,
    });

    return {
      merchantId: subscription.merchant_id,
      agentType: subscription.agent_type,
      isEnabled: subscription.is_enabled,
      config: subscription.config,
      enabledAt: subscription.enabled_at,
    };
  }

  /**
   * Check if a merchant has an agent enabled
   */
  async isAgentEnabled(
    merchantId: string,
    agentType: AgentType,
  ): Promise<boolean> {
    // OPS agent is always enabled
    if (agentType === "OPS_AGENT") {
      return true;
    }

    const result = await this.pool.query<{ is_enabled: boolean }>(
      `SELECT is_enabled FROM merchant_agent_subscriptions 
       WHERE merchant_id = $1 AND agent_type = $2`,
      [merchantId, agentType],
    );

    return result.rows.length > 0 && result.rows[0].is_enabled;
  }

  /**
   * Get all merchants with a specific agent enabled
   */
  async getMerchantsWithAgent(agentType: AgentType): Promise<string[]> {
    // OPS agent returns all active merchants
    if (agentType === "OPS_AGENT") {
      const result = await this.pool.query<{ id: string }>(
        `SELECT id FROM merchants WHERE is_active = true`,
      );
      return result.rows.map((r) => r.id);
    }

    const result = await this.pool.query<{ merchant_id: string }>(
      `SELECT mas.merchant_id 
       FROM merchant_agent_subscriptions mas
       JOIN merchants m ON m.id = mas.merchant_id
       WHERE mas.agent_type = $1 AND mas.is_enabled = true AND m.is_active = true`,
      [agentType],
    );

    return result.rows.map((r) => r.merchant_id);
  }

  /**
   * Initialize default subscriptions for a new merchant
   */
  async initializeMerchantSubscriptions(merchantId: string): Promise<void> {
    // Create OPS_AGENT subscription by default
    await this.subscribeToAgent(merchantId, "OPS_AGENT");

    this.logger.log({
      msg: "Initialized default agent subscriptions",
      merchantId,
    });
  }

  /**
   * Get agent stats across all merchants
   */
  async getAgentStats(): Promise<
    Record<AgentType, { enabled: number; disabled: number }>
  > {
    const result = await this.pool.query<{
      agent_type: AgentType;
      is_enabled: boolean;
      count: string;
    }>(
      `SELECT agent_type, is_enabled, COUNT(*) as count
       FROM merchant_agent_subscriptions
       GROUP BY agent_type, is_enabled`,
    );

    const stats = Object.fromEntries(
      AGENT_CATALOG.map((agent) => [agent.id, { enabled: 0, disabled: 0 }]),
    ) as Record<AgentType, { enabled: number; disabled: number }>;

    for (const row of result.rows) {
      if (row.is_enabled) {
        stats[row.agent_type].enabled = parseInt(row.count, 10);
      } else {
        stats[row.agent_type].disabled = parseInt(row.count, 10);
      }
    }

    return stats;
  }
}
