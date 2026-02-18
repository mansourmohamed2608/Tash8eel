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
  | "INVENTORY" // Stock tracking
  | "PAYMENTS" // Payment links and proofs
  | "VISION_OCR" // Image processing (receipts, products)
  | "VOICE_NOTES" // Voice transcription
  | "REPORTS" // Analytics and reports
  | "WEBHOOKS" // Outbound webhooks
  | "TEAM" // Multi-user access
  | "LOYALTY" // Loyalty program
  | "NOTIFICATIONS" // Push notifications
  | "AUDIT_LOGS" // Security audit trail
  | "KPI_DASHBOARD" // KPI metrics
  | "API_ACCESS"; // Direct API access

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
};

// ============= Feature-to-Agent Mapping =============
// Which agent handles which feature
export const FEATURE_AGENT_MAP: Partial<Record<FeatureType, AgentType>> = {
  INVENTORY: "INVENTORY_AGENT",
  PAYMENTS: "FINANCE_AGENT",
  VISION_OCR: "OPS_AGENT",
  VOICE_NOTES: "OPS_AGENT",
  WEBHOOKS: "OPS_AGENT",
  TEAM: "OPS_AGENT",
  NOTIFICATIONS: "OPS_AGENT",
  AUDIT_LOGS: "OPS_AGENT",
  API_ACCESS: "OPS_AGENT",
  REPORTS: "FINANCE_AGENT",
  LOYALTY: "MARKETING_AGENT",
  KPI_DASHBOARD: "FINANCE_AGENT",
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
  | "GROWTH"
  | "PRO"
  | "ENTERPRISE"
  | "CUSTOM";

// ============= Plan Limits =============
export interface PlanLimits {
  messagesPerMonth: number; // -1 = unlimited
  whatsappNumbers: number; // -1 = unlimited
  teamMembers: number; // -1 = unlimited
  tokenBudgetDaily: number; // -1 = unlimited (AI tokens)
  aiCallsPerDay: number; // -1 = unlimited (copilot + vision + voice calls)
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
  CONVERSATIONS: 99, // IMPLEMENTED — Meta webhooks + session state + infra share
  ORDERS: 79, // IMPLEMENTED — DB + processing pipeline + infra
  CATALOG: 49, // IMPLEMENTED — image storage + search indexing
  INVENTORY: 149, // IMPLEMENTED — stock tracking + AI predictions + DB
  PAYMENTS: 129, // IMPLEMENTED — payment links + OCR verification + gateway
  VISION_OCR: 149, // IMPLEMENTED — GPT-4o image processing (~0.75 EGP/img)
  VOICE_NOTES: 69, // IMPLEMENTED — Whisper transcription + storage
  REPORTS: 99, // IMPLEMENTED — analytics + AI summarization
  WEBHOOKS: 49, // IMPLEMENTED — external integrations + rate limiting
  TEAM: 79, // IMPLEMENTED — multi-user + RBAC + session management
  LOYALTY: 0, // COMING_SOON — depends on stub Marketing agent
  NOTIFICATIONS: 39, // IMPLEMENTED — push + email + WhatsApp notifications
  AUDIT_LOGS: 49, // IMPLEMENTED — security audit trail + storage
  KPI_DASHBOARD: 79, // IMPLEMENTED — analytics compute + visualization
  API_ACCESS: 99, // IMPLEMENTED — API keys + rate limiting + docs
};

// Agent add-on prices (EGP/month)
// Only IMPLEMENTED agents have prices. Stubs/coming_soon show 0 (not purchasable).
// Each agent = AI pipeline + system hosting + dashboard + DB.
// Cost = AI compute + infra share (~40 EGP) + platform fee.
export const AGENT_PRICES_EGP: Record<AgentType, number> = {
  OPS_AGENT: 299, // IMPLEMENTED — WA routing + order AI + catalog. Cost: ~150 EGP
  INVENTORY_AGENT: 199, // IMPLEMENTED — stock AI + predictions + alerts. Cost: ~100 EGP
  FINANCE_AGENT: 349, // IMPLEMENTED — OCR + reports + payment automation. Cost: ~200 EGP
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
// 1 typical conversation ≈ 3-4 AI calls = ~0.15-0.20 EGP
// Copilot session: ~2-5 AI calls = ~0.10-0.25 EGP
// So 100 AI calls/day ≈ ~25-33 conversations/day
export const AI_USAGE_TIERS = {
  BASIC: {
    aiCallsPerDay: 300,
    tokenBudgetDaily: 150_000,
    price: 0,
    label: "أساسي — ~75 محادثة/يوم",
  },
  STANDARD: {
    aiCallsPerDay: 500,
    tokenBudgetDaily: 300_000,
    price: 129,
    label: "قياسي — ~125 محادثة/يوم",
  },
  PROFESSIONAL: {
    aiCallsPerDay: 1_500,
    tokenBudgetDaily: 800_000,
    price: 349,
    label: "احترافي — ~375 محادثة/يوم",
  },
  UNLIMITED: {
    aiCallsPerDay: -1,
    tokenBudgetDaily: -1,
    price: 699,
    label: "بلا حدود",
  },
} as const;

// Message volume tiers (EGP/month)
// Via Meta Cloud API: service conversations FREE, utility in CSW FREE.
// Cost per msg is ~0 for service. Only proactive marketing costs real money.
// Tiers are fair-use caps (platform capacity), not cost pass-through.
// Marketing templates: ~3.70 EGP/msg billed separately at cost (pass-through).
// Tiers REPLACE plan's included message quota.
export const MESSAGE_TIERS = {
  STARTER: {
    messagesPerMonth: 10_000,
    price: 0,
    label: "10,000 رسالة — ~33 محادثة/يوم",
  },
  BASIC: {
    messagesPerMonth: 15_000,
    price: 99,
    label: "15,000 رسالة — ~50 محادثة/يوم",
  },
  STANDARD: {
    messagesPerMonth: 50_000,
    price: 399,
    label: "50,000 رسالة — ~167 محادثة/يوم",
  },
  PROFESSIONAL: {
    messagesPerMonth: 150_000,
    price: 699,
    label: "150,000 رسالة — ~500 محادثة/يوم",
  },
  ENTERPRISE: { messagesPerMonth: -1, price: 1_299, label: "بلا حدود" },
} as const;

// ============= Default Plans =============
// ── Pricing built on real cost model (2026, Meta Cloud API direct) ────
// Service msgs: FREE | Utility in CSW: FREE | AI call (blended): ~0.05 EGP
// 1 conversation ≈ 10 msgs (FREE) + 4 AI calls × 0.05 = ~0.20 EGP/conversation
// Infra per merchant: ~70 EGP/mo | WA number: FREE (Meta Cloud API)
// Main cost driver: AI compute. Messaging is essentially zero-cost.
//
// STARTER  33 convos/day target | 10K msgs (~1,000 convos/mo)
//   cost @35%: 0 msgs + 100 AI/day×0.05×30 + 70 infra = ~220 EGP → 449 EGP → 104% margin
// GROWTH   50 convos/day target | 15K msgs (~1,500 convos/mo)
//   cost @35%: 0 msgs + 175 AI/day×0.05×30 + 70 infra = ~333 EGP → 799 EGP → 140% margin
// PRO     167 convos/day target | 50K msgs (~5,000 convos/mo)
//   cost @35%: 0 msgs + 525 AI/day×0.05×30 + 70 infra = ~858 EGP → 1,499 EGP → 75% margin
// ENTERPRISE 500+ convos/day | unlimited
//   cost: variable. 2,999 EGP covers avg usage with healthy margin.
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
    enabledAgents: ["OPS_AGENT"],
    enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
    limits: {
      messagesPerMonth: 50,
      whatsappNumbers: 1,
      teamMembers: 1,
      tokenBudgetDaily: 5_000,
      aiCallsPerDay: 20,
    },
    price: 0,
    currency: "EGP",
    trialDays: 14,
  },
  // Starter: Solo merchant, ~33 conversations/day
  // 10,000 msgs ≈ 1,000 conversations/month (msgs are FREE via Meta Cloud API)
  // Only OPS agent (implemented). Cost @35%: ~220 EGP → 449 EGP → 104% margin
  STARTER: {
    enabledAgents: ["OPS_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
    ],
    limits: {
      messagesPerMonth: 10_000,
      whatsappNumbers: 1,
      teamMembers: 1,
      tokenBudgetDaily: 150_000,
      aiCallsPerDay: 300,
    },
    price: 449,
    currency: "EGP",
  },
  // Growth: Growing business, ~50 conversations/day
  // 15,000 msgs ≈ 1,500 conversations/month (msgs FREE via Meta Cloud API)
  // OPS + INVENTORY (both implemented). Cost @35%: ~333 EGP → 799 EGP → 140% margin
  GROWTH: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
      "INVENTORY",
      "API_ACCESS",
    ],
    limits: {
      messagesPerMonth: 15_000,
      whatsappNumbers: 2,
      teamMembers: 2,
      tokenBudgetDaily: 300_000,
      aiCallsPerDay: 500,
    },
    price: 799,
    currency: "EGP",
  },
  // Pro: Established business, ~167 conversations/day (handles 100+ orders/day easily)
  // 50,000 msgs ≈ 5,000 conversations/month (msgs FREE via Meta Cloud API)
  // OPS + INVENTORY + FINANCE (all implemented). Cost @35%: ~858 EGP → 1,499 EGP → 75% margin
  PRO: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "VOICE_NOTES",
      "REPORTS",
      "NOTIFICATIONS",
      "INVENTORY",
      "API_ACCESS",
      "PAYMENTS",
      "VISION_OCR",
      "KPI_DASHBOARD",
      "WEBHOOKS",
      "TEAM",
      "AUDIT_LOGS",
    ],
    limits: {
      messagesPerMonth: 50_000,
      whatsappNumbers: 3,
      teamMembers: 3,
      tokenBudgetDaily: 800_000,
      aiCallsPerDay: 1_500,
    },
    price: 1_499,
    currency: "EGP",
  },
  // Enterprise: Large business, 500+ conversations/day, unlimited
  // All 3 implemented agents + everything. Variable cost, 2,999 covers average.
  ENTERPRISE: {
    enabledAgents: ["OPS_AGENT", "INVENTORY_AGENT", "FINANCE_AGENT"],
    enabledFeatures: [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
      "INVENTORY",
      "PAYMENTS",
      "VISION_OCR",
      "VOICE_NOTES",
      "REPORTS",
      "WEBHOOKS",
      "TEAM",
      "NOTIFICATIONS",
      "AUDIT_LOGS",
      "KPI_DASHBOARD",
      "API_ACCESS",
    ],
    limits: {
      messagesPerMonth: -1,
      whatsappNumbers: -1,
      teamMembers: 10,
      tokenBudgetDaily: -1,
      aiCallsPerDay: -1,
    },
    price: 2_999,
    currency: "EGP",
  },
  // Custom: Fully configurable per merchant
  CUSTOM: {
    enabledAgents: ["OPS_AGENT"], // Base - will be customized per merchant
    enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
    limits: {
      messagesPerMonth: -1,
      whatsappNumbers: -1,
      teamMembers: -1,
      tokenBudgetDaily: -1,
      aiCallsPerDay: -1,
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
    WEBHOOKS: "Webhooks",
    TEAM: "Team Management",
    LOYALTY: "Loyalty Program",
    NOTIFICATIONS: "Notifications",
    AUDIT_LOGS: "Audit Logs",
    KPI_DASHBOARD: "KPI Dashboard",
    API_ACCESS: "API Access",
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
    descriptionAr: "روابط الدفع وإثباتات الدفع",
    descriptionEn: "Payment links and proofs",
    status: "available",
    requiredAgent: "FINANCE_AGENT",
    dependencies: ["ORDERS"],
  },
  {
    id: "VISION_OCR",
    nameAr: "الرؤية البصرية",
    nameEn: "Vision/OCR",
    descriptionAr: "معالجة الصور والإيصالات",
    descriptionEn: "Image and receipt processing",
    status: "available",
    dependencies: [],
  },
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
    requiredAgent: "FINANCE_AGENT",
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
    status: "coming_soon",
    eta: "Q2 2026",
    requiredAgent: "MARKETING_AGENT",
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
    requiredAgent: "FINANCE_AGENT",
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
];

export const PLAN_CATALOG = Object.entries(PLAN_ENTITLEMENTS).map(
  ([key, plan]) => ({
    id: key as PlanType,
    ...plan,
  }),
);

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
