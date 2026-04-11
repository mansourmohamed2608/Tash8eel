/**
 * Merchant Entitlements System
 *
 * Defines which agents and features a merchant can access.
 * Enforces dependencies between features.
 */

// ============= Agent Types =============
export type AgentType =
  | "OPS_AGENT" // Core operations agent (conversations, orders)
  | "INVENTORY_AGENT" // Inventory management
  | "FINANCE_AGENT" // Financial reports, profit tracking
  | "MARKETING_AGENT" // Promotions, customer engagement
  | "SUPPORT_AGENT" // Customer support escalation
  | "CONTENT_AGENT" // Content generation
  | "SALES_AGENT" // Sales pipeline and lead conversion
  | "CREATIVE_AGENT"; // Image/video generation and design

// ============= Feature Types =============
export type FeatureType =
  | "CONVERSATIONS" // Basic chat with customers
  | "ORDERS" // Order management
  | "CATALOG" // Product catalog
  | "CASHIER_POS" // Cashier / POS
  | "INVENTORY" // Stock tracking
  | "PAYMENTS" // Payment proof verification
  | "VISION_OCR" // Internal — payment proof scanning only; metered via paymentProofScansPerMonth limit
  | "VOICE_NOTES" // Voice transcription
  | "REPORTS" // Analytics and reports
  | "WEBHOOKS" // POS integrations (internal key kept)
  | "TEAM" // Multi-user access
  | "LOYALTY" // Loyalty program
  | "NOTIFICATIONS" // Push notifications
  | "AUDIT_LOGS" // Security audit trail
  | "KPI_DASHBOARD" // KPI metrics
  | "API_ACCESS" // Direct API access
  | "COPILOT_CHAT" // Copilot in portal
  | "CUSTOM_INTEGRATIONS" // Enterprise
  | "SLA" // Enterprise
  | "AUTOMATIONS" // Automation engine (Growth+)
  | "FORECASTING" // Predictive forecasting platform (Pro+)
  | "VOICE_CALLING"; // AI voice calling engine (Enterprise)

// ============= Dependency Rules =============
export const AGENT_DEPENDENCIES: Record<AgentType, AgentType[]> = {
  OPS_AGENT: [], // Core - no dependencies
  INVENTORY_AGENT: ["OPS_AGENT"], // Requires ops for catalog
  FINANCE_AGENT: ["OPS_AGENT"], // Requires ops for orders
  MARKETING_AGENT: ["OPS_AGENT"], // Requires ops for customers
  SUPPORT_AGENT: ["OPS_AGENT"], // Requires ops for conversations
  CONTENT_AGENT: [], // Standalone
  SALES_AGENT: ["OPS_AGENT"], // Requires ops for lead tracking
  CREATIVE_AGENT: ["CONTENT_AGENT"], // Requires content for templates
};

// Features that are enabled by each agent
export const AGENT_FEATURE_MAP: Record<AgentType, FeatureType[]> = {
  OPS_AGENT: ["CONVERSATIONS", "ORDERS", "CATALOG"],
  INVENTORY_AGENT: ["INVENTORY"],
  FINANCE_AGENT: ["REPORTS", "KPI_DASHBOARD"],
  MARKETING_AGENT: ["LOYALTY"],
  SUPPORT_AGENT: ["CONVERSATIONS"],
  CONTENT_AGENT: [],
  SALES_AGENT: [],
  CREATIVE_AGENT: [],
};

export const FEATURE_DEPENDENCIES: Record<FeatureType, FeatureType[]> = {
  CONVERSATIONS: [], // Core - no dependencies
  ORDERS: ["CONVERSATIONS"], // Requires conversations
  CATALOG: [], // Core - no dependencies
  CASHIER_POS: ["ORDERS"], // Requires orders flow
  INVENTORY: ["CATALOG"], // Requires catalog
  PAYMENTS: ["ORDERS"], // Requires orders
  VISION_OCR: [], // Standalone (storage handled separately)
  VOICE_NOTES: ["CONVERSATIONS"], // Requires conversations
  REPORTS: ["ORDERS"], // Requires orders data
  WEBHOOKS: [], // Standalone
  TEAM: [], // Standalone
  LOYALTY: ["ORDERS"], // Requires orders for points
  NOTIFICATIONS: [], // Standalone
  AUDIT_LOGS: [], // Standalone
  KPI_DASHBOARD: ["ORDERS"], // Requires orders data
  API_ACCESS: [], // Standalone
  COPILOT_CHAT: [], // Standalone
  CUSTOM_INTEGRATIONS: [], // Enterprise
  SLA: [], // Enterprise
  AUTOMATIONS: ["ORDERS"], // Requires orders data
  FORECASTING: ["INVENTORY", "ORDERS"], // Requires inventory + orders
  VOICE_CALLING: ["CONVERSATIONS"], // Requires conversations
};

// ============= Feature-to-Agent Mapping =============
// Which agent handles which feature
export const FEATURE_AGENT_MAP: Partial<Record<FeatureType, AgentType>> = {
  INVENTORY: "INVENTORY_AGENT",
  VISION_OCR: "OPS_AGENT",
  VOICE_NOTES: "OPS_AGENT",
  WEBHOOKS: "OPS_AGENT",
  TEAM: "OPS_AGENT",
  NOTIFICATIONS: "OPS_AGENT",
  AUDIT_LOGS: "OPS_AGENT",
  API_ACCESS: "OPS_AGENT",
  COPILOT_CHAT: "OPS_AGENT",
  LOYALTY: "OPS_AGENT", // Implemented standalone, no longer gated on MARKETING_AGENT
};

// ============= Entitlements Interface =============
export interface MerchantEntitlements {
  enabledAgents: AgentType[];
  enabledFeatures: FeatureType[];
}

// ============= Plan Type =============
export type PlanType =
  | "TRIAL"
  | "STARTER"
  | "BASIC"
  | "GROWTH"
  | "PRO"
  | "CHAT_ONLY"
  | "ENTERPRISE"
  | "CUSTOM";

// ============= Plan Limits =============
export interface PlanLimits {
  totalMessagesPerDay?: number;
  totalMessagesPerMonth?: number;
  aiRepliesPerDay?: number;
  aiRepliesPerMonth?: number;
  messagesPerMonth: number; // -1 = unlimited
  whatsappNumbers: number; // -1 = unlimited
  teamMembers: number; // -1 = unlimited
  tokenBudgetDaily: number; // -1 = unlimited (AI tokens)
  aiCallsPerDay: number; // -1 = unlimited (copilot + vision + voice calls)
  paidTemplatesPerMonth: number; // -1 = unlimited
  paymentProofScansPerMonth: number; // -1 = unlimited
  voiceMinutesPerMonth: number; // -1 = unlimited
  mapsLookupsPerMonth: number; // -1 = unlimited
  posConnections: number; // -1 = unlimited
  branches: number; // -1 = unlimited
  retentionDays?: number;
  alertRules?: number;
  automations?: number;
  autoRunsPerDay?: number;
}

// ============= Per-Feature Pricing (EGP/month) =============
// Individual feature add-on prices for the pricing calculator.
// Merchants see exactly what each feature costs and can build their own plan.
//
// ── Cost Basis (2026, Meta Cloud API direct, USD/EGP ~50) ────────────
// • WhatsApp via Meta Cloud API (direct, no BSP middleman):
//   – Service conversations (customer-initiated): FREE (since Nov 2024)
//   – Utility templates in CSW (24h window):      FREE (since Jul 2025)
//   – Utility templates outside CSW:  $0.00414/msg = ~0.21 EGP/msg
//   – Marketing templates:            $0.07406/msg = ~3.70 EGP/msg (pass-through)
//   – Authentication templates:       $0.00414/msg = ~0.21 EGP/msg
//   – WA number hosting:              FREE (Meta Cloud API direct)
// • Media: voice notes, images, docs, video all supported natively
// • Templates: only needed for business-initiated msgs; customer replies = free-form
// • AI call (GPT-4o-mini, 85%):      0.018 EGP     ($0.15/1M in + $0.60/1M out)
// • AI call (GPT-4o, 15%):           0.375 EGP     ($2.50/1M in + $10/1M out)
// • AI call (blended):              ~0.05 EGP/call  (85% mini + 15% 4o, optimized)
// • Whisper voice note:             ~0.10 EGP/note  ($0.006/min, avg 20s note)
// • Vision/OCR (GPT-4o):           ~0.75 EGP/image ($0.01-0.02/analysis)
// • Infrastructure share:           ~70 EGP/merchant/mo (Neon+servers+Vercel+Redis @100 merchants)
// • Target gross margin:             50-80% on plans (msg costs ≈ 0, AI is main cost)
// ─────────────────────────────────────────────────────────────────────
export const FEATURE_PRICES_EGP: Record<FeatureType, number> = {
  CONVERSATIONS: 149,
  ORDERS: 99,
  CATALOG: 79,
  CASHIER_POS: 399,
  INVENTORY: 249,
  PAYMENTS: 199,
  VISION_OCR: 0, // Internal — included in PAYMENTS; metered by paymentProofScansPerMonth limit (not a standalone purchasable feature)
  VOICE_NOTES: 99,
  REPORTS: 149,
  WEBHOOKS: 99,
  TEAM: 149,
  LOYALTY: 249,
  NOTIFICATIONS: 79,
  AUDIT_LOGS: 99,
  KPI_DASHBOARD: 149,
  API_ACCESS: 199,
  COPILOT_CHAT: 0, // Included in all plans, metered by quota
  CUSTOM_INTEGRATIONS: 0, // Enterprise custom pricing
  SLA: 0, // Enterprise custom pricing
  AUTOMATIONS: 399,
  FORECASTING: 599,
  VOICE_CALLING: 0, // Enterprise — custom pricing via voice packs
};

// Agent add-on prices (EGP/month)
// Only IMPLEMENTED agents have prices. Stubs/coming_soon show 0 (not purchasable).
// Each agent = AI pipeline + system hosting + dashboard + DB.
// Cost = AI compute + infra share (~40 EGP) + platform fee.
export const AGENT_PRICES_EGP: Record<AgentType, number> = {
  OPS_AGENT: 349,
  INVENTORY_AGENT: 249,
  FINANCE_AGENT: 399,
  MARKETING_AGENT: 0, // STUB — coming_soon, not sellable yet
  SUPPORT_AGENT: 0, // STUB — coming_soon, not sellable yet
  CONTENT_AGENT: 0, // STUB — coming_soon, not sellable yet
  SALES_AGENT: 0, // NOT IMPLEMENTED — coming_soon Q3 2026
  CREATIVE_AGENT: 0, // NOT IMPLEMENTED — coming_soon Q4 2026
};

// AI usage tiers (EGP/month add-ons)
// ── What counts as an "AI call"? ────────────────────────────────────
// Each of these actions = 1 AI call:
//   • WhatsApp AI reply (classify + respond)       = 2-3 calls/conversation
//   • Copilot chat query (merchant dashboard)      = 1 call (~0.018 EGP mini, ~0.375 EGP 4o)
//   • Copilot voice (Whisper + AI response)        = 2 calls + ~0.10 EGP transcription
//   • AI action buttons (confirm order, etc.)      = 1 call
//   • Voice note transcription (Whisper)           = 1 call + ~0.10 EGP/note
//   • OCR/Vision (receipt, product image)          = 1 call (~0.75 EGP/image, uses GPT-4o)
//   • Map link processing                          = 1 call
//   • AI report summarization                      = 1-2 calls
// Cost per AI call (blended): ~0.05 EGP (85% GPT-4o-mini @ 0.018 + 15% GPT-4o @ 0.375)
// Vision/OCR uses GPT-4o exclusively: ~0.75 EGP/image
// Whisper voice transcription: ~0.10 EGP/note (20s avg)
// ─────────────────────────────────────────────────────────────────
// NOTE: Actual billing is DB-driven via usage_packs table (AI_CAPACITY_S/M/L/XL),
// not this constant. This constant describes named upgrade tiers for plan AI limits;
// usage_packs are one-time top-up add-ons. Values here are for reference / UI labelling only.
export const AI_USAGE_TIERS = {
  AI_PLUS_100_PER_DAY: {
    aiCallsPerDay: 100,
    tokenBudgetDaily: 0,
    price: 249,
    label: "+100 رد ذكاء اصطناعي / يوم",
  },
  AI_PLUS_250_PER_DAY: {
    aiCallsPerDay: 250,
    tokenBudgetDaily: 0,
    price: 549,
    label: "+250 رد ذكاء اصطناعي / يوم",
  },
  AI_PLUS_500_PER_DAY: {
    aiCallsPerDay: 500,
    tokenBudgetDaily: 0,
    price: 999,
    label: "+500 رد ذكاء اصطناعي / يوم",
  },
  AI_PLUS_1000_PER_DAY: {
    aiCallsPerDay: 1000,
    tokenBudgetDaily: 0,
    price: 1799,
    label: "+1000 رد ذكاء اصطناعي / يوم",
  },
} as const;

// Message volume tiers (EGP/month add-ons)
// ── IMPORTANT: These are REPLACEMENT tiers, not stackable additions ──
// If a merchant on GROWTH (30k msgs/mo included) buys STANDARD tier (50k/399 EGP),
// their limit becomes 50k — NOT 80k. The tier REPLACES the plan's included quota.
// Use case: merchant who needs more messages than their plan includes, without upgrading the whole plan.
// Via Meta Cloud API: service conversations FREE, utility in CSW FREE.
// Cost per msg ~0 for service. Only proactive marketing templates cost real money (~3.70 EGP/msg).
// ─────────────────────────────────────────────────────────────────
// NOTE: Actual billing is DB-driven via usage_packs table, not this constant.
// This constant is for reference / seeding only.
export const MESSAGE_TIERS = {
  MESSAGES_PLUS_25K_MONTH: {
    messagesPerMonth: 25_000,
    price: 149,
    label: "+25,000 رسالة / شهر",
  },
  MESSAGES_PLUS_50K_MONTH: {
    messagesPerMonth: 50_000,
    price: 299,
    label: "+50,000 رسالة / شهر",
  },
  MESSAGES_PLUS_100K_MONTH: {
    messagesPerMonth: 100_000,
    price: 549,
    label: "+100,000 رسالة / شهر",
  },
  MESSAGES_PLUS_250K_MONTH: {
    messagesPerMonth: 250_000,
    price: 1199,
    label: "+250,000 رسالة / شهر",
  },
} as const;

// ============= Default Plans =============
// ── Pricing built on real cost model (2026, Meta Cloud API direct) ────
// Service msgs: FREE | Utility in CSW: FREE | AI call (blended): ~0.05 EGP
// 1 conversation ≈ 10 msgs (FREE) + 4 AI calls × 0.05 = ~0.20 EGP/conversation
// Infra per merchant: ~70 EGP/mo | WA number: FREE (Meta Cloud API)
// Main cost driver: AI compute. Messaging is essentially zero-cost.
//
// STARTER    25 convos/day  | 5K msgs    | 100 AI calls/day  → 999 EGP/mo
// BASIC      37 convos/day  | 15K msgs   | 200 AI calls/day  → 2,200 EGP/mo
// GROWTH    125 convos/day  | 30K msgs   | 500 AI calls/day  → 4,800 EGP/mo
// PRO       625 convos/day  | 100K msgs  | 2,500 AI calls/day → 10,000 EGP/mo
// ENTERPRISE 1250 convos/day | 250K msgs | 5,000 AI calls/day → 21,500 EGP/mo
// ─────────────────────────────────────────────────────────────────

export const PLAN_ENTITLEMENTS: Record<
  PlanType,
  {
    enabledAgents: AgentType[];
    enabledFeatures: FeatureType[];
    limits: PlanLimits;
    price?: number;
    currency?: string;
    trialDays?: number;
  }
> = {
  // TRIAL: 14-day trial — one-time only, NO permanent free plan
  TRIAL: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "REPORTS",
      "NOTIFICATIONS",
      "VOICE_NOTES",
      "PAYMENTS",
      "COPILOT_CHAT",
    ],
    limits: {
      totalMessagesPerDay: 20,
      totalMessagesPerMonth: 50,
      aiRepliesPerDay: 10,
      aiRepliesPerMonth: 25,
      messagesPerMonth: 50,
      whatsappNumbers: 1,
      teamMembers: 1,
      tokenBudgetDaily: 5_000,
      aiCallsPerDay: 20,
      paidTemplatesPerMonth: 5,
      paymentProofScansPerMonth: 10,
      voiceMinutesPerMonth: 5,
      mapsLookupsPerMonth: 50,
      posConnections: 0,
      branches: 1,
    },
    price: 0,
    currency: "EGP",
    trialDays: 14,
  },
  // STARTER — entry-level tier (999 EGP/mo)
  // Basic AI WhatsApp + order taking only. No inventory agent.
  STARTER: {
    enabledAgents: ["OPS_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "INVENTORY",
      "PAYMENTS",
      "REPORTS",
      "NOTIFICATIONS",
      "WEBHOOKS",
      "VOICE_NOTES",
      "COPILOT_CHAT",
    ],
    limits: {
      totalMessagesPerDay: 480,
      totalMessagesPerMonth: 14_400,
      aiRepliesPerDay: 240,
      aiRepliesPerMonth: 7_200,
      messagesPerMonth: 14_400,
      whatsappNumbers: 1,
      teamMembers: 1,
      tokenBudgetDaily: 50_000,
      aiCallsPerDay: 240,
      paidTemplatesPerMonth: 5,
      paymentProofScansPerMonth: 25,
      voiceMinutesPerMonth: 20,
      mapsLookupsPerMonth: 100,
      posConnections: 0,
      branches: 1,
    },
    price: 999,
    currency: "EGP",
  },
  // BASIC — standard entry tier (2,200 EGP/mo)
  // All 3 agents + inventory + payment links + API access. No team, no automations.
  BASIC: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "REPORTS",
      "NOTIFICATIONS",
      "PAYMENTS",
      "WEBHOOKS",
      "API_ACCESS",
      "VOICE_NOTES",
      "COPILOT_CHAT",
    ],
    limits: {
      totalMessagesPerDay: 1_200,
      totalMessagesPerMonth: 36_000,
      aiRepliesPerDay: 600,
      aiRepliesPerMonth: 18_000,
      messagesPerMonth: 36_000,
      whatsappNumbers: 1,
      teamMembers: 1,
      tokenBudgetDaily: 200_000,
      aiCallsPerDay: 600,
      paidTemplatesPerMonth: 15,
      paymentProofScansPerMonth: 50,
      voiceMinutesPerMonth: 30,
      mapsLookupsPerMonth: 200,
      posConnections: 1,
      branches: 1,
    },
    price: 2_200,
    currency: "EGP",
  },
  // GROWTH — active business tier (4,800 EGP/mo)
  // Adds team + loyalty + automations + broadcasts.
  GROWTH: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "REPORTS",
      "NOTIFICATIONS",
      "PAYMENTS",
      "WEBHOOKS",
      "API_ACCESS",
      "COPILOT_CHAT",
      "TEAM",
      "LOYALTY",
      "AUTOMATIONS",
      "VOICE_NOTES",
    ],
    limits: {
      totalMessagesPerDay: 2_400,
      totalMessagesPerMonth: 72_000,
      aiRepliesPerDay: 1_200,
      aiRepliesPerMonth: 36_000,
      messagesPerMonth: 72_000,
      whatsappNumbers: 2,
      teamMembers: 5,
      tokenBudgetDaily: 400_000,
      aiCallsPerDay: 1_200,
      paidTemplatesPerMonth: 30,
      paymentProofScansPerMonth: 150,
      voiceMinutesPerMonth: 60,
      mapsLookupsPerMonth: 700,
      posConnections: 2,
      branches: 2,
      automations: 10,
      autoRunsPerDay: 5,
    },
    price: 4_800,
    currency: "EGP",
  },
  // PRO — professional tier (10,000 EGP/mo)
  // Adds voice notes, photo reading, KPI dashboard, audit logs, forecasting, multi-branch.
  PRO: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "REPORTS",
      "NOTIFICATIONS",
      "VOICE_NOTES",
      "PAYMENTS",
      "COPILOT_CHAT",
      "TEAM",
      "API_ACCESS",
      "WEBHOOKS",
      "KPI_DASHBOARD",
      "AUDIT_LOGS",
      "LOYALTY",
      "AUTOMATIONS",
      "FORECASTING",
    ],
    limits: {
      totalMessagesPerDay: 5_000,
      totalMessagesPerMonth: 150_000,
      aiRepliesPerDay: 2_500,
      aiRepliesPerMonth: 75_000,
      messagesPerMonth: 150_000,
      whatsappNumbers: 3,
      teamMembers: 5,
      tokenBudgetDaily: 1_000_000,
      aiCallsPerDay: 2_500,
      paidTemplatesPerMonth: 50,
      paymentProofScansPerMonth: 400,
      voiceMinutesPerMonth: 120,
      mapsLookupsPerMonth: 2000,
      posConnections: 5,
      branches: 5,
      retentionDays: 90,
      automations: 50,
      autoRunsPerDay: 20,
    },
    price: 10_000,
    currency: "EGP",
  },
  // ENTERPRISE — max scale (21,500 EGP/mo)
  // Everything in Pro + voice calling + custom integrations + SLA.
  CHAT_ONLY: {
    enabledAgents: [],
    enabledFeatures: ["CONVERSATIONS"],
    limits: {
      totalMessagesPerDay: 960,
      totalMessagesPerMonth: 28_800,
      aiRepliesPerDay: 480,
      aiRepliesPerMonth: 14_400,
      messagesPerMonth: 28_800,
      whatsappNumbers: 1,
      teamMembers: 1,
      tokenBudgetDaily: 100_000,
      aiCallsPerDay: 480,
      paidTemplatesPerMonth: 10,
      paymentProofScansPerMonth: 0,
      voiceMinutesPerMonth: 0,
      mapsLookupsPerMonth: 0,
      posConnections: 0,
      branches: 0,
    },
    price: 1_000,
    currency: "EGP",
  },
  ENTERPRISE: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "CASHIER_POS",
      "INVENTORY",
      "PAYMENTS",
      "VOICE_NOTES",
      "REPORTS",
      "WEBHOOKS",
      "TEAM",
      "NOTIFICATIONS",
      "AUDIT_LOGS",
      "KPI_DASHBOARD",
      "API_ACCESS",
      "COPILOT_CHAT",
      "CUSTOM_INTEGRATIONS",
      "SLA",
      "LOYALTY",
      "AUTOMATIONS",
      "FORECASTING",
      "VOICE_CALLING",
    ],
    limits: {
      totalMessagesPerDay: 10_000,
      totalMessagesPerMonth: 300_000,
      aiRepliesPerDay: 5_000,
      aiRepliesPerMonth: 150_000,
      messagesPerMonth: 300_000,
      whatsappNumbers: 5,
      teamMembers: 10,
      tokenBudgetDaily: 1_750_000,
      aiCallsPerDay: 5_000,
      paidTemplatesPerMonth: 100,
      paymentProofScansPerMonth: 1_200,
      voiceMinutesPerMonth: 240,
      mapsLookupsPerMonth: 6000,
      posConnections: 5,
      branches: 5,
      retentionDays: 90,
      alertRules: 30,
      automations: -1,
      autoRunsPerDay: -1,
    },
    price: 21_500,
    currency: "EGP",
  },
  // Custom: Fully configurable per merchant
  CUSTOM: {
    enabledAgents: ["OPS_AGENT"], // Base - customized per merchant
    enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
    limits: {
      totalMessagesPerDay: -1,
      totalMessagesPerMonth: -1,
      aiRepliesPerDay: -1,
      aiRepliesPerMonth: -1,
      messagesPerMonth: -1,
      whatsappNumbers: -1,
      teamMembers: -1,
      tokenBudgetDaily: -1,
      aiCallsPerDay: -1,
      paidTemplatesPerMonth: -1,
      paymentProofScansPerMonth: -1,
      voiceMinutesPerMonth: -1,
      mapsLookupsPerMonth: -1,
      posConnections: -1,
      branches: -1,
    },
    // Custom pricing negotiated per merchant
  },
};

/**
 * Get entitlements for a plan
 */
export function getPlanEntitlements(
  plan: PlanType,
): (typeof PLAN_ENTITLEMENTS)[PlanType] {
  return PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS.TRIAL;
}

// ============= Validation Helpers =============

/**
 * Validates that all dependencies are satisfied for a set of agents/features.
 * Returns missing dependencies or an empty array if valid.
 */
export function validateEntitlements(entitlements: MerchantEntitlements): {
  valid: boolean;
  missingAgents: AgentType[];
  missingFeatures: FeatureType[];
} {
  const missingAgents: AgentType[] = [];
  const missingFeatures: FeatureType[] = [];

  // Check agent dependencies
  for (const agent of entitlements.enabledAgents) {
    const deps = AGENT_DEPENDENCIES[agent] || [];
    for (const dep of deps) {
      if (!entitlements.enabledAgents.includes(dep)) {
        if (!missingAgents.includes(dep)) {
          missingAgents.push(dep);
        }
      }
    }

    // Ensure agent-required features are enabled
    const requiredFeatures = AGENT_FEATURE_MAP[agent] || [];
    for (const feature of requiredFeatures) {
      if (!entitlements.enabledFeatures.includes(feature)) {
        if (!missingFeatures.includes(feature)) {
          missingFeatures.push(feature);
        }
      }
    }
  }

  // Check feature dependencies
  for (const feature of entitlements.enabledFeatures) {
    const deps = FEATURE_DEPENDENCIES[feature] || [];
    for (const dep of deps) {
      if (!entitlements.enabledFeatures.includes(dep)) {
        if (!missingFeatures.includes(dep)) {
          missingFeatures.push(dep);
        }
      }
    }

    // Ensure feature requires its owning agent
    const requiredAgent = FEATURE_AGENT_MAP[feature];
    if (requiredAgent && !entitlements.enabledAgents.includes(requiredAgent)) {
      if (!missingAgents.includes(requiredAgent)) {
        missingAgents.push(requiredAgent);
      }
    }
  }

  return {
    valid: missingAgents.length === 0 && missingFeatures.length === 0,
    missingAgents,
    missingFeatures,
  };
}

/**
 * Auto-resolves dependencies by adding required agents/features.
 * Returns a new entitlements object with all dependencies satisfied.
 */
export function resolveEntitlementDependencies(
  entitlements: MerchantEntitlements,
): MerchantEntitlements {
  const resolvedAgents = new Set(entitlements.enabledAgents);
  const resolvedFeatures = new Set(entitlements.enabledFeatures);

  // Resolve agent dependencies (iterate until stable)
  let changed = true;
  while (changed) {
    changed = false;
    for (const agent of resolvedAgents) {
      const deps = AGENT_DEPENDENCIES[agent] || [];
      for (const dep of deps) {
        if (!resolvedAgents.has(dep)) {
          resolvedAgents.add(dep);
          changed = true;
        }
      }

      // Ensure agent-required features
      const features = AGENT_FEATURE_MAP[agent] || [];
      for (const feature of features) {
        if (!resolvedFeatures.has(feature)) {
          resolvedFeatures.add(feature);
          changed = true;
        }
      }
    }

    for (const feature of resolvedFeatures) {
      const requiredAgent = FEATURE_AGENT_MAP[feature];
      if (requiredAgent && !resolvedAgents.has(requiredAgent)) {
        resolvedAgents.add(requiredAgent);
        changed = true;
      }
    }
  }

  // Resolve feature dependencies (iterate until stable)
  changed = true;
  while (changed) {
    changed = false;
    for (const feature of resolvedFeatures) {
      const deps = FEATURE_DEPENDENCIES[feature] || [];
      for (const dep of deps) {
        if (!resolvedFeatures.has(dep)) {
          resolvedFeatures.add(dep);
          changed = true;
        }
      }

      const requiredAgent = FEATURE_AGENT_MAP[feature];
      if (requiredAgent && !resolvedAgents.has(requiredAgent)) {
        resolvedAgents.add(requiredAgent);
        changed = true;
      }
    }

    for (const agent of resolvedAgents) {
      const deps = AGENT_DEPENDENCIES[agent] || [];
      for (const dep of deps) {
        if (!resolvedAgents.has(dep)) {
          resolvedAgents.add(dep);
          changed = true;
        }
      }

      const features = AGENT_FEATURE_MAP[agent] || [];
      for (const feature of features) {
        if (!resolvedFeatures.has(feature)) {
          resolvedFeatures.add(feature);
          changed = true;
        }
      }
    }
  }

  return {
    enabledAgents: Array.from(resolvedAgents),
    enabledFeatures: Array.from(resolvedFeatures),
  };
}

/**
 * Check if a specific agent is enabled for a merchant
 */
export function hasAgent(
  entitlements: MerchantEntitlements,
  agent: AgentType,
): boolean {
  return entitlements.enabledAgents.includes(agent);
}

/**
 * Check if a specific feature is enabled for a merchant
 */
export function hasFeature(
  entitlements: MerchantEntitlements,
  feature: FeatureType,
): boolean {
  return entitlements.enabledFeatures.includes(feature);
}

/**
 * Get readable name for agent
 */
export function getAgentDisplayName(agent: AgentType): string {
  const names: Record<AgentType, string> = {
    OPS_AGENT: "Operations Agent",
    INVENTORY_AGENT: "Inventory Agent",
    FINANCE_AGENT: "Finance Agent",
    MARKETING_AGENT: "Marketing Agent",
    SUPPORT_AGENT: "Support Agent",
    CONTENT_AGENT: "Content Agent",
    SALES_AGENT: "Sales Agent",
    CREATIVE_AGENT: "Creative Agent",
  };
  return names[agent] || agent;
}

/**
 * Get readable name for feature
 */
export function getFeatureDisplayName(feature: FeatureType): string {
  const names: Record<FeatureType, string> = {
    CONVERSATIONS: "Conversations",
    ORDERS: "Orders",
    CATALOG: "Catalog",
    INVENTORY: "Inventory",
    PAYMENTS: "Payments",
    VISION_OCR: "Vision/OCR",
    VOICE_NOTES: "Voice Notes",
    REPORTS: "Reports",
    WEBHOOKS: "POS Integrations",
    TEAM: "Team Management",
    LOYALTY: "Loyalty Program",
    CASHIER_POS: "Cashier/POS",
    NOTIFICATIONS: "Notifications",
    AUDIT_LOGS: "Audit Logs",
    KPI_DASHBOARD: "KPI Dashboard",
    API_ACCESS: "API Access",
    COPILOT_CHAT: "Copilot Chat",
    CUSTOM_INTEGRATIONS: "Custom Integrations",
    SLA: "SLA",
    AUTOMATIONS: "Automations",
    FORECASTING: "Forecasting",
    VOICE_CALLING: "Voice Calling",
  };
  return names[feature] || feature;
}

// ============= Agent & Feature Catalog (for UI rendering) =============

export type AgentStatus = "available" | "beta" | "coming_soon";
export type FeatureStatus = "available" | "beta" | "coming_soon";

export interface AgentCatalogEntry {
  id: AgentType;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  status: AgentStatus;
  eta?: string;
  color: string;
  dependencies: AgentType[];
  features: FeatureType[];
  implemented: boolean;
  sellable: boolean;
  comingSoon: boolean;
  beta: boolean;
  subscriptionEnabled: boolean;
  routeVisibility: "visible" | "hidden" | "internal";
  requiredFeatures: FeatureType[];
  entrypoints: string[];
}

export interface FeatureCatalogEntry {
  id: FeatureType;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  status: FeatureStatus;
  eta?: string;
  requiredAgent?: AgentType;
  dependencies: FeatureType[];
}

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    id: "OPS_AGENT",
    nameAr: "وكيل العمليات",
    nameEn: "Operations Agent",
    descriptionAr: "المحادثات والطلبات الأساسية",
    descriptionEn: "Core conversations and order management",
    status: "available",
    color: "from-blue-500 to-blue-600",
    dependencies: [],
    features: ["CONVERSATIONS", "ORDERS", "CATALOG"],
    implemented: true,
    sellable: true,
    comingSoon: false,
    beta: false,
    subscriptionEnabled: true,
    routeVisibility: "visible",
    requiredFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
    entrypoints: [
      "/merchant/conversations",
      "/merchant/orders",
      "/merchant/assistant",
    ],
  },
  {
    id: "INVENTORY_AGENT",
    nameAr: "وكيل المخزون",
    nameEn: "Inventory Agent",
    descriptionAr: "إدارة المخزون التلقائية",
    descriptionEn: "Automated inventory management",
    status: "available",
    color: "from-green-500 to-green-600",
    dependencies: ["OPS_AGENT"],
    features: ["INVENTORY"],
    implemented: true,
    sellable: true,
    comingSoon: false,
    beta: false,
    subscriptionEnabled: true,
    routeVisibility: "visible",
    requiredFeatures: ["INVENTORY"],
    entrypoints: [
      "/merchant/inventory",
      "/merchant/inventory-insights",
      "/merchant/forecast",
    ],
  },
  {
    id: "FINANCE_AGENT",
    nameAr: "وكيل المالية",
    nameEn: "Finance Agent",
    descriptionAr: "المدفوعات والتقارير المالية",
    descriptionEn: "Payments and financial reporting",
    status: "available",
    color: "from-purple-500 to-purple-600",
    dependencies: ["OPS_AGENT"],
    features: ["REPORTS", "KPI_DASHBOARD", "PAYMENTS"],
    implemented: true,
    sellable: true,
    comingSoon: false,
    beta: false,
    subscriptionEnabled: true,
    routeVisibility: "visible",
    requiredFeatures: ["REPORTS", "KPI_DASHBOARD", "PAYMENTS"],
    entrypoints: [
      "/merchant/reports/cfo",
      "/merchant/kpis",
      "/merchant/payments",
    ],
  },
  {
    id: "SUPPORT_AGENT",
    nameAr: "وكيل الدعم",
    nameEn: "Support Agent",
    descriptionAr: "دعم العملاء المتقدم",
    descriptionEn: "Advanced customer support",
    status: "coming_soon",
    eta: "Q2 2026",
    color: "from-cyan-500 to-cyan-600",
    dependencies: ["OPS_AGENT"],
    features: ["CONVERSATIONS"],
    implemented: false,
    sellable: false,
    comingSoon: true,
    beta: false,
    subscriptionEnabled: false,
    routeVisibility: "visible",
    requiredFeatures: ["CONVERSATIONS"],
    entrypoints: ["/merchant/conversations", "/merchant/agents"],
  },
  {
    id: "MARKETING_AGENT",
    nameAr: "وكيل التسويق",
    nameEn: "Marketing Agent",
    descriptionAr: "التسويق والحملات عبر السوشيال",
    descriptionEn: "Marketing campaigns across social channels",
    status: "coming_soon",
    eta: "Q2 2026",
    color: "from-pink-500 to-pink-600",
    dependencies: ["OPS_AGENT"],
    features: ["LOYALTY"],
    implemented: false,
    sellable: false,
    comingSoon: true,
    beta: false,
    subscriptionEnabled: false,
    routeVisibility: "visible",
    requiredFeatures: ["LOYALTY"],
    entrypoints: [
      "/merchant/campaigns",
      "/merchant/loyalty",
      "/merchant/agents",
    ],
  },
  {
    id: "CONTENT_AGENT",
    nameAr: "وكيل المحتوى",
    nameEn: "Content Agent",
    descriptionAr: "إنشاء محتوى للسوشيال والمتجر",
    descriptionEn: "Content creation for social and store",
    status: "coming_soon",
    eta: "Q3 2026",
    color: "from-orange-500 to-orange-600",
    dependencies: [],
    features: [],
    implemented: false,
    sellable: false,
    comingSoon: true,
    beta: false,
    subscriptionEnabled: false,
    routeVisibility: "visible",
    requiredFeatures: [],
    entrypoints: ["/merchant/agents"],
  },
  {
    id: "SALES_AGENT",
    nameAr: "وكيل المبيعات",
    nameEn: "Sales Agent",
    descriptionAr: "متابعة المبيعات وتحويل الفرص",
    descriptionEn: "Sales pipeline and lead conversion",
    status: "coming_soon",
    eta: "Q3 2026",
    color: "from-rose-500 to-rose-600",
    dependencies: ["OPS_AGENT"],
    features: [],
    implemented: false,
    sellable: false,
    comingSoon: true,
    beta: false,
    subscriptionEnabled: false,
    routeVisibility: "visible",
    requiredFeatures: ["CONVERSATIONS", "ORDERS"],
    entrypoints: ["/merchant/agents", "/merchant/customers"],
  },
  {
    id: "CREATIVE_AGENT",
    nameAr: "وكيل الإبداع",
    nameEn: "Creative Agent",
    descriptionAr: "توليد صور وفيديوهات وإعلانات",
    descriptionEn: "Image, video, and ad generation",
    status: "coming_soon",
    eta: "Q4 2026",
    color: "from-fuchsia-500 to-fuchsia-600",
    dependencies: ["CONTENT_AGENT"],
    features: [],
    implemented: false,
    sellable: false,
    comingSoon: true,
    beta: false,
    subscriptionEnabled: false,
    routeVisibility: "visible",
    requiredFeatures: [],
    entrypoints: ["/merchant/agents"],
  },
];

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  {
    id: "CONVERSATIONS",
    nameAr: "المحادثات",
    nameEn: "Conversations",
    descriptionAr: "الدردشة مع العملاء",
    descriptionEn: "Chat with customers",
    status: "available",
    dependencies: [],
  },
  {
    id: "ORDERS",
    nameAr: "الطلبات",
    nameEn: "Orders",
    descriptionAr: "إدارة الطلبات",
    descriptionEn: "Order management",
    status: "available",
    dependencies: ["CONVERSATIONS"],
  },
  {
    id: "CATALOG",
    nameAr: "الكتالوج",
    nameEn: "Catalog",
    descriptionAr: "قائمة المنتجات",
    descriptionEn: "Product catalog",
    status: "available",
    dependencies: [],
  },
  {
    id: "CASHIER_POS",
    nameAr: "الكاشير / POS",
    nameEn: "Cashier / POS",
    descriptionAr: "تشغيل الكاشير ونقاط البيع",
    descriptionEn: "Cashier and POS operations",
    status: "available",
    dependencies: ["ORDERS"],
  },
  {
    id: "INVENTORY",
    nameAr: "المخزون",
    nameEn: "Inventory",
    descriptionAr: "تتبع المخزون",
    descriptionEn: "Stock tracking",
    status: "available",
    requiredAgent: "INVENTORY_AGENT",
    dependencies: ["CATALOG"],
  },
  {
    id: "PAYMENTS",
    nameAr: "المدفوعات",
    nameEn: "Payments",
    descriptionAr: "التحقق من إثباتات الدفع",
    descriptionEn: "Payment proof verification",
    status: "available",
    dependencies: ["ORDERS"],
  },
  // VISION_OCR is internal — not shown in UI. Payment proof scanning is part of PAYMENTS feature.
  // Metered daily via paymentProofScansPerMonth plan limit.
  {
    id: "VOICE_NOTES",
    nameAr: "الرسائل الصوتية",
    nameEn: "Voice Notes",
    descriptionAr: "تحويل الصوت إلى نص",
    descriptionEn: "Voice transcription",
    status: "available",
    dependencies: ["CONVERSATIONS"],
  },
  {
    id: "REPORTS",
    nameAr: "التقارير",
    nameEn: "Reports",
    descriptionAr: "تقارير وتحليلات",
    descriptionEn: "Analytics and reports",
    status: "available",
    dependencies: ["ORDERS"],
  },
  {
    id: "WEBHOOKS",
    nameAr: "الويب هوكس",
    nameEn: "Webhooks",
    descriptionAr: "التكامل مع أنظمة خارجية",
    descriptionEn: "External system integrations",
    status: "available",
    dependencies: [],
  },
  {
    id: "TEAM",
    nameAr: "الفريق",
    nameEn: "Team",
    descriptionAr: "إدارة المستخدمين",
    descriptionEn: "Multi-user access",
    status: "available",
    dependencies: [],
  },
  {
    id: "LOYALTY",
    nameAr: "برنامج الولاء",
    nameEn: "Loyalty",
    descriptionAr: "نقاط ومكافآت العملاء",
    descriptionEn: "Customer points and rewards",
    status: "available",
    dependencies: ["ORDERS"],
  },
  {
    id: "NOTIFICATIONS",
    nameAr: "الإشعارات",
    nameEn: "Notifications",
    descriptionAr: "إشعارات فورية",
    descriptionEn: "Push notifications",
    status: "available",
    dependencies: [],
  },
  {
    id: "AUDIT_LOGS",
    nameAr: "سجل المراجعة",
    nameEn: "Audit Logs",
    descriptionAr: "تتبع أمني للعمليات",
    descriptionEn: "Security audit trail",
    status: "available",
    dependencies: [],
  },
  {
    id: "KPI_DASHBOARD",
    nameAr: "لوحة المؤشرات",
    nameEn: "KPI Dashboard",
    descriptionAr: "مؤشرات الأداء الرئيسية",
    descriptionEn: "Key performance indicators",
    status: "available",
    dependencies: ["ORDERS"],
  },
  {
    id: "API_ACCESS",
    nameAr: "وصول API",
    nameEn: "API Access",
    descriptionAr: "وصول مباشر للـ API",
    descriptionEn: "Direct API access",
    status: "available",
    dependencies: [],
  },
  {
    id: "AUTOMATIONS",
    nameAr: "الأتمتة",
    nameEn: "Automations",
    descriptionAr: "تنفيذ الأتمتة التجارية والتشغيلية",
    descriptionEn: "Operational and commerce automations",
    status: "available",
    dependencies: ["ORDERS"],
  },
  {
    id: "FORECASTING",
    nameAr: "التنبؤات",
    nameEn: "Forecasting",
    descriptionAr: "التنبؤات التشغيلية والمالية",
    descriptionEn: "Operational and finance forecasting",
    status: "available",
    dependencies: ["INVENTORY", "ORDERS"],
  },
  {
    id: "CUSTOM_INTEGRATIONS",
    nameAr: "تكاملات مخصصة",
    nameEn: "Custom Integrations",
    descriptionAr: "تكاملات خاصة لخطط المؤسسات",
    descriptionEn: "Custom enterprise integrations",
    status: "available",
    dependencies: [],
  },
  {
    id: "SLA",
    nameAr: "اتفاقية مستوى الخدمة",
    nameEn: "SLA",
    descriptionAr: "أولوية دعم للمؤسسات",
    descriptionEn: "Priority enterprise support",
    status: "available",
    dependencies: [],
  },
  {
    id: "VOICE_CALLING",
    nameAr: "تفعيل المكالمات الصوتية",
    nameEn: "Voice Calling",
    descriptionAr: "تفعيل المكالمات الذكية للمؤسسات",
    descriptionEn: "Enterprise voice calling enablement",
    status: "available",
    dependencies: ["CONVERSATIONS"],
  },
];

export const PLAN_CATALOG = Object.entries(PLAN_ENTITLEMENTS).map(
  ([key, plan]) => ({
    id: key as PlanType,
    ...plan,
  }),
);

export interface PublicPricingPlan {
  id: PlanType;
  nameAr: string;
  nameEn: string;
  monthlyPriceEgp: number | null;
  isFullPlatformPlan: boolean;
  bestFor: string;
  mainValue: string;
  includedFeatures: string[];
  excludedFeatures: string[];
  includedAgents: AgentType[];
  totalMessagesPerDay: number;
  totalMessagesPerMonth: number;
  aiRepliesPerDay: number;
  aiRepliesPerMonth: number;
  includedBranches: number;
  includedPosConnections: number;
  cashierPromoEligible: boolean;
  upsellPriority: string[];
  notes: string[];
}

export interface PublicPricingCatalogItem {
  code: string;
  nameAr: string;
  descriptionAr: string;
  monthlyPriceEgp: number;
}

export interface EnterprisePricingFloor {
  code: string;
  nameAr: string;
  descriptionAr: string;
  priceEgp: number;
  billingType: "monthly" | "one_time";
}

export const LIVE_PURCHASABLE_AGENTS: AgentType[] = [
  "OPS_AGENT",
  "INVENTORY_AGENT",
  "FINANCE_AGENT",
];

export const PUBLIC_PRICING_PLANS: PublicPricingPlan[] = [
  {
    id: "STARTER",
    nameAr: "الباقة المبتدئة",
    nameEn: "Starter",
    monthlyPriceEgp: 999,
    isFullPlatformPlan: true,
    bestFor: "للتجار في بداية التشغيل بمنصة كاملة خفيفة",
    mainValue: "تشغيل كامل أساسي: محادثات + طلبات + كتالوج + مدفوعات أساسية",
    includedFeatures: [
      "OMNICHANNEL_INBOX",
      "WHATSAPP_META",
      "MESSENGER_INSTAGRAM",
      "AI_CUSTOMER_REPLIES",
      "ORDERS",
      "QUOTES_FOLLOW_UP",
      "PUBLIC_TRACKING",
      "CATALOG",
      "PAYMENTS",
      "BASIC_COD",
      "REPORTS_BASIC",
      "NOTIFICATIONS",
      "WEBHOOKS",
      "VOICE_NOTES_TRANSCRIPTION",
      "INVENTORY_BASIC",
      "FINANCE_BASIC",
      "CRM_BASIC",
    ],
    excludedFeatures: [
      "CASHIER_POS_PERMANENT",
      "TEAM_RBAC",
      "LOYALTY",
      "AUTOMATIONS",
      "KPI_DASHBOARD",
      "AUDIT_LOGS",
      "FORECASTING",
      "API_ACCESS",
    ],
    includedAgents: ["OPS_AGENT"],
    totalMessagesPerDay: 480,
    totalMessagesPerMonth: 14_400,
    aiRepliesPerDay: 240,
    aiRepliesPerMonth: 7_200,
    includedBranches: 1,
    includedPosConnections: 0,
    cashierPromoEligible: true,
    upsellPriority: ["cashier_pos", "inventory", "api_access", "messages"],
    notes: ["الكاشير مجاني لأول 30 يوم فقط للاشتراكات المدفوعة الجديدة"],
  },
  {
    id: "BASIC",
    nameAr: "الباقة الأساسية",
    nameEn: "Basic",
    monthlyPriceEgp: 2200,
    isFullPlatformPlan: true,
    bestFor: "للتشغيل اليومي النشط مع أدوات عمليات فعلية",
    mainValue: "يشمل الكاشير الدائم + المخزون الكامل + API + الوكلاء الثلاثة",
    includedFeatures: [
      "EVERYTHING_IN_STARTER",
      "CASHIER_POS",
      "REGISTER_SESSIONS",
      "SUSPENDED_DRAFT_SALES",
      "INVENTORY_FULL",
      "SUPPLIERS",
      "FINANCE_BASIC_PLUS",
      "API_ACCESS",
      "CRM",
    ],
    excludedFeatures: [
      "TEAM_RBAC",
      "LOYALTY",
      "AUTOMATIONS",
      "KPI_DASHBOARD",
      "AUDIT_LOGS",
      "FORECASTING",
    ],
    includedAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    totalMessagesPerDay: 1_200,
    totalMessagesPerMonth: 36_000,
    aiRepliesPerDay: 600,
    aiRepliesPerMonth: 18_000,
    includedBranches: 1,
    includedPosConnections: 1,
    cashierPromoEligible: true,
    upsellPriority: ["team_rbac", "loyalty", "automations", "forecasting"],
    notes: ["الكاشير دائم ضمن الخطة بعد فترة العرض الترويجي"],
  },
  {
    id: "GROWTH",
    nameAr: "باقة النمو",
    nameEn: "Growth",
    monthlyPriceEgp: 4800,
    isFullPlatformPlan: true,
    bestFor: "للفرق النامية التي تحتاج فريقًا وأتمتة وولاء",
    mainValue: "يشمل RBAC + الولاء + الشرائح + الأتمتة عبر فروع متعددة",
    includedFeatures: [
      "EVERYTHING_IN_BASIC",
      "TEAM_RBAC",
      "LOYALTY",
      "CUSTOMER_SEGMENTS",
      "CAMPAIGN_SURFACES",
      "AUTOMATIONS",
    ],
    excludedFeatures: ["KPI_DASHBOARD", "AUDIT_LOGS", "FORECASTING"],
    includedAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    totalMessagesPerDay: 2_400,
    totalMessagesPerMonth: 72_000,
    aiRepliesPerDay: 1_200,
    aiRepliesPerMonth: 36_000,
    includedBranches: 2,
    includedPosConnections: 2,
    cashierPromoEligible: true,
    upsellPriority: ["kpi_dashboard", "audit_logs", "forecasting"],
    notes: ["الكاشير دائم ضمن الخطة"],
  },
  {
    id: "PRO",
    nameAr: "الباقة الاحترافية",
    nameEn: "Pro",
    monthlyPriceEgp: 10000,
    isFullPlatformPlan: true,
    bestFor: "للعمليات متعددة الفروع مع تحليلات وإدارة متقدمة",
    mainValue: "يشمل KPI + Audit Logs + Forecasting + تقارير CFO متقدمة",
    includedFeatures: [
      "EVERYTHING_IN_GROWTH",
      "KPI_DASHBOARD",
      "AUDIT_LOGS",
      "FORECASTING",
      "ADVANCED_REPORTS",
      "CFO_REPORTING",
      "CASH_FLOW_TAX_ACCOUNTANT_EXPORTS",
      "INVENTORY_INSIGHTS",
    ],
    excludedFeatures: [],
    includedAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    totalMessagesPerDay: 5_000,
    totalMessagesPerMonth: 150_000,
    aiRepliesPerDay: 2_500,
    aiRepliesPerMonth: 75_000,
    includedBranches: 5,
    includedPosConnections: 5,
    cashierPromoEligible: true,
    upsellPriority: [
      "custom_integrations",
      "sla_business_hours",
      "voice_calling_enablement",
    ],
    notes: ["الكاشير دائم ضمن الخطة"],
  },
  {
    id: "ENTERPRISE",
    nameAr: "الباقة المؤسسية",
    nameEn: "Enterprise",
    monthlyPriceEgp: 21500,
    isFullPlatformPlan: true,
    bestFor: "للشركات الكبيرة والعمليات المعقدة",
    mainValue: "تكاملات مخصصة + SLA + أهلية تفعيل المكالمات + هيكل مخصص",
    includedFeatures: [
      "EVERYTHING_IN_PRO",
      "CUSTOM_INTEGRATIONS",
      "SLA_ELIGIBLE",
      "VOICE_CALLING_ENABLEMENT_ELIGIBLE",
      "ENTERPRISE_LIMIT_OVERRIDES",
      "CUSTOM_BRANCH_POS_STRUCTURE",
    ],
    excludedFeatures: [],
    includedAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    totalMessagesPerDay: 10_000,
    totalMessagesPerMonth: 300_000,
    aiRepliesPerDay: 5_000,
    aiRepliesPerMonth: 150_000,
    includedBranches: -1,
    includedPosConnections: -1,
    cashierPromoEligible: true,
    upsellPriority: [
      "custom_bundle_minimum_with_integration_or_voice",
      "sla_priority",
    ],
    notes: [
      "الكاشير دائم ضمن الخطة",
      "الهيكل النهائي للفروع ونقاط البيع يتم حسب الاتفاق",
    ],
  },
  {
    id: "CHAT_ONLY",
    nameAr: "باقة الدردشة فقط",
    nameEn: "Chat Only",
    monthlyPriceEgp: 1000,
    isFullPlatformPlan: false,
    bestFor: "للتجار الذين يريدون قناة محادثات ذكية فقط",
    mainValue: "أضيق من Starter وظيفيًا، لكن بسعة رسائل أعلى للدردشة",
    includedFeatures: [
      "WHATSAPP_META",
      "MESSENGER_INSTAGRAM",
      "AI_CUSTOMER_REPLIES",
      "CHAT_HISTORY",
      "BASIC_ROUTING_TAGGING",
    ],
    excludedFeatures: [
      "INVENTORY",
      "FINANCE",
      "CASHIER_POS",
      "BRANCHES",
      "OPERATIONS_MODULES",
      "ADVANCED_REPORTS",
      "LOYALTY",
      "AUTOMATIONS",
    ],
    includedAgents: [],
    totalMessagesPerDay: 960,
    totalMessagesPerMonth: 28_800,
    aiRepliesPerDay: 480,
    aiRepliesPerMonth: 14_400,
    includedBranches: 0,
    includedPosConnections: 0,
    cashierPromoEligible: false,
    upsellPriority: ["starter", "messages", "ai_replies"],
    notes: ["هذه ليست خطة منصة كاملة"],
  },
];

export const FEATURE_ADDON_CATALOG: PublicPricingCatalogItem[] = [
  {
    code: "conversations",
    nameAr: "المحادثات",
    descriptionAr: "إضافة طبقة المحادثات",
    monthlyPriceEgp: 149,
  },
  {
    code: "orders",
    nameAr: "الطلبات",
    descriptionAr: "إضافة إدارة الطلبات",
    monthlyPriceEgp: 99,
  },
  {
    code: "catalog",
    nameAr: "الكتالوج",
    descriptionAr: "إضافة إدارة الكتالوج",
    monthlyPriceEgp: 79,
  },
  {
    code: "inventory",
    nameAr: "المخزون",
    descriptionAr: "إضافة المخزون الكامل",
    monthlyPriceEgp: 249,
  },
  {
    code: "payments",
    nameAr: "المدفوعات",
    descriptionAr: "إضافة المدفوعات وإثباتات الدفع",
    monthlyPriceEgp: 199,
  },
  {
    code: "voice_notes",
    nameAr: "الرسائل الصوتية",
    descriptionAr: "إضافة النسخ الصوتي",
    monthlyPriceEgp: 99,
  },
  {
    code: "reports",
    nameAr: "التقارير",
    descriptionAr: "إضافة التقارير",
    monthlyPriceEgp: 149,
  },
  {
    code: "webhooks",
    nameAr: "الويب هوكس",
    descriptionAr: "إضافة الويب هوكس",
    monthlyPriceEgp: 99,
  },
  {
    code: "team_rbac",
    nameAr: "الفريق والصلاحيات",
    descriptionAr: "إضافة الفريق وRBAC",
    monthlyPriceEgp: 149,
  },
  {
    code: "loyalty",
    nameAr: "الولاء",
    descriptionAr: "إضافة برنامج الولاء",
    monthlyPriceEgp: 249,
  },
  {
    code: "notifications",
    nameAr: "الإشعارات",
    descriptionAr: "إضافة الإشعارات",
    monthlyPriceEgp: 79,
  },
  {
    code: "audit_logs",
    nameAr: "سجل التدقيق",
    descriptionAr: "إضافة سجل التدقيق",
    monthlyPriceEgp: 99,
  },
  {
    code: "kpi_dashboard",
    nameAr: "لوحة KPI",
    descriptionAr: "إضافة لوحة المؤشرات",
    monthlyPriceEgp: 149,
  },
  {
    code: "api_access",
    nameAr: "وصول API",
    descriptionAr: "إضافة وصول API",
    monthlyPriceEgp: 199,
  },
  {
    code: "automations",
    nameAr: "الأتمتة",
    descriptionAr: "إضافة الأتمتة",
    monthlyPriceEgp: 399,
  },
  {
    code: "forecasting",
    nameAr: "التنبؤات",
    descriptionAr: "إضافة التنبؤات",
    monthlyPriceEgp: 599,
  },
  {
    code: "cashier_pos",
    nameAr: "الكاشير / POS",
    descriptionAr: "إضافة الكاشير الدائم",
    monthlyPriceEgp: 399,
  },
  {
    code: "branch_pack_plus_1",
    nameAr: "+1 فرع",
    descriptionAr: "حزمة فرع إضافي واحد",
    monthlyPriceEgp: 299,
  },
  {
    code: "pos_connection_plus_1",
    nameAr: "+1 نقطة بيع",
    descriptionAr: "حزمة نقطة بيع إضافية",
    monthlyPriceEgp: 299,
  },
];

export const LIVE_AGENT_ADDON_CATALOG: PublicPricingCatalogItem[] =
  LIVE_PURCHASABLE_AGENTS.map((agentId) => ({
    code: agentId.toLowerCase(),
    nameAr:
      getAgentCatalogEntry(agentId)?.nameAr || getAgentDisplayName(agentId),
    descriptionAr: getAgentCatalogEntry(agentId)?.descriptionAr || agentId,
    monthlyPriceEgp: AGENT_PRICES_EGP[agentId],
  }));

export const USAGE_PACK_CATALOG: PublicPricingCatalogItem[] = [
  {
    code: "ai_plus_100_per_day",
    nameAr: "+100 رد ذكاء اصطناعي / يوم",
    descriptionAr: "رفع سعة الردود الذكية اليومية",
    monthlyPriceEgp: 249,
  },
  {
    code: "ai_plus_250_per_day",
    nameAr: "+250 رد ذكاء اصطناعي / يوم",
    descriptionAr: "رفع سعة الردود الذكية اليومية",
    monthlyPriceEgp: 549,
  },
  {
    code: "ai_plus_500_per_day",
    nameAr: "+500 رد ذكاء اصطناعي / يوم",
    descriptionAr: "رفع سعة الردود الذكية اليومية",
    monthlyPriceEgp: 999,
  },
  {
    code: "ai_plus_1000_per_day",
    nameAr: "+1000 رد ذكاء اصطناعي / يوم",
    descriptionAr: "رفع سعة الردود الذكية اليومية",
    monthlyPriceEgp: 1799,
  },
  {
    code: "messages_plus_25k_month",
    nameAr: "+25,000 رسالة / شهر",
    descriptionAr: "زيادة سعة الرسائل الشهرية",
    monthlyPriceEgp: 149,
  },
  {
    code: "messages_plus_50k_month",
    nameAr: "+50,000 رسالة / شهر",
    descriptionAr: "زيادة سعة الرسائل الشهرية",
    monthlyPriceEgp: 299,
  },
  {
    code: "messages_plus_100k_month",
    nameAr: "+100,000 رسالة / شهر",
    descriptionAr: "زيادة سعة الرسائل الشهرية",
    monthlyPriceEgp: 549,
  },
  {
    code: "messages_plus_250k_month",
    nameAr: "+250,000 رسالة / شهر",
    descriptionAr: "زيادة سعة الرسائل الشهرية",
    monthlyPriceEgp: 1199,
  },
  {
    code: "proof_scans_plus_50",
    nameAr: "+50 فحص إثبات دفع",
    descriptionAr: "زيادة فحوصات إثباتات الدفع",
    monthlyPriceEgp: 149,
  },
  {
    code: "proof_scans_plus_100",
    nameAr: "+100 فحص إثبات دفع",
    descriptionAr: "زيادة فحوصات إثباتات الدفع",
    monthlyPriceEgp: 249,
  },
  {
    code: "proof_scans_plus_250",
    nameAr: "+250 فحص إثبات دفع",
    descriptionAr: "زيادة فحوصات إثباتات الدفع",
    monthlyPriceEgp: 549,
  },
  {
    code: "transcription_minutes_plus_100",
    nameAr: "+100 دقيقة تفريغ",
    descriptionAr: "زيادة دقائق التفريغ الصوتي",
    monthlyPriceEgp: 149,
  },
  {
    code: "transcription_minutes_plus_250",
    nameAr: "+250 دقيقة تفريغ",
    descriptionAr: "زيادة دقائق التفريغ الصوتي",
    monthlyPriceEgp: 349,
  },
  {
    code: "transcription_minutes_plus_500",
    nameAr: "+500 دقيقة تفريغ",
    descriptionAr: "زيادة دقائق التفريغ الصوتي",
    monthlyPriceEgp: 699,
  },
];

export const ENTERPRISE_PRICING_FLOORS: EnterprisePricingFloor[] = [
  {
    code: "custom_integration_setup_from",
    nameAr: "إعداد تكامل مخصص",
    descriptionAr: "يبدأ من",
    priceEgp: 15000,
    billingType: "one_time",
  },
  {
    code: "custom_integration_maintenance_from",
    nameAr: "صيانة تكامل مخصص",
    descriptionAr: "يبدأ من",
    priceEgp: 3000,
    billingType: "monthly",
  },
  {
    code: "sla_business_hours",
    nameAr: "SLA ساعات العمل",
    descriptionAr: "دعم أعمال",
    priceEgp: 1500,
    billingType: "monthly",
  },
  {
    code: "sla_priority",
    nameAr: "SLA أولوية",
    descriptionAr: "أولوية دعم",
    priceEgp: 4000,
    billingType: "monthly",
  },
  {
    code: "sla_24_7_enterprise",
    nameAr: "SLA مؤسسي 24/7",
    descriptionAr: "دعم 24/7",
    priceEgp: 8500,
    billingType: "monthly",
  },
  {
    code: "voice_calling_enablement",
    nameAr: "تفعيل المكالمات الصوتية",
    descriptionAr: "يبدأ من",
    priceEgp: 4000,
    billingType: "monthly",
  },
  {
    code: "custom_bundle_minimum_no_bespoke_dev",
    nameAr: "حد أدنى لباندل مخصص",
    descriptionAr: "بدون تطوير خاص",
    priceEgp: 12000,
    billingType: "monthly",
  },
  {
    code: "custom_bundle_minimum_with_integration_or_voice",
    nameAr: "حد أدنى لباندل مخصص مع تكامل/صوت",
    descriptionAr: "مع تكامل أو صوت",
    priceEgp: 18000,
    billingType: "monthly",
  },
];

export const PUBLIC_PRICING_NOTES = [
  "الرسائل = إجمالي الرسائل المُدارة داخل المنصة.",
  "تشمل رسائل العملاء + ردود الذكاء الاصطناعي.",
  "رسوم قوالب واتساب المدفوعة تُحاسب بشكل منفصل (Usage / Wallet-Based).",
  "دقائق المكالمات لا تشملها الباقات القياسية.",
  "الكاشير مجاني لأول 30 يومًا في الاشتراكات الجديدة المؤهلة.",
];

export function getPublicPricingCatalog() {
  return {
    currency: "EGP" as const,
    plans: PUBLIC_PRICING_PLANS,
    featureAddOns: FEATURE_ADDON_CATALOG,
    liveAgentAddOns: LIVE_AGENT_ADDON_CATALOG,
    usagePacks: USAGE_PACK_CATALOG,
    enterprise: ENTERPRISE_PRICING_FLOORS,
    notes: PUBLIC_PRICING_NOTES,
  };
}

/**
 * Get the full catalog for UI rendering
 */
export function getCatalog() {
  return {
    agents: AGENT_CATALOG,
    features: FEATURE_CATALOG,
    plans: PLAN_CATALOG,
    agentDependencies: AGENT_DEPENDENCIES,
    featureDependencies: FEATURE_DEPENDENCIES,
    featureAgentMap: FEATURE_AGENT_MAP,
  };
}

export function getAgentCatalogEntry(
  agentType: AgentType,
): AgentCatalogEntry | undefined {
  return AGENT_CATALOG.find((agent) => agent.id === agentType);
}

export function isAgentSubscribable(agentType: AgentType): boolean {
  return getAgentCatalogEntry(agentType)?.subscriptionEnabled ?? false;
}
